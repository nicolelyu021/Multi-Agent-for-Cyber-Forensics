"""Classifier variants used by the Sentiment Agent under evaluation.

We factor out the Sentiment Agent's binary-classification logic into three
pluggable variants so the ablation can vary the classifier while holding
every other part of the pipeline fixed:

- ``heuristic``: the existing `keyword_signal*0.6 + vader_negative*0.4`
  computation. Reproduces the published F1=2.65% baseline.
- ``llm_json``: single-email structured JSON classification by the LLM,
  with an enforced schema. No chain-of-thought — the LLM is asked for a
  verdict, a confidence, and a short evidence quote.
- ``llm_json_cot``: same as `llm_json` but the LLM first produces a
  private <reasoning> block, then the JSON verdict. Implements Prof.
  Sadeh's post-presentation feedback #1 (structured CoT).

All three classifiers take the same inputs (email text + taxonomy
context) and return the same outputs (`is_anomalous: bool`,
`confidence: float in [0,1]`, `category: str`, `reasoning: str`,
`tokens_in: int`, `tokens_out: int`).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Optional

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Re-use existing keyword list so "heuristic" variant exactly mirrors the
# published classifier in backend/agents/tools/vader_analysis.py.
_FINANCIAL_FRAUD = [
    "ljm", "raptor", "off-balance-sheet", "special purpose entity", "spe",
    "mark-to-market", "hide", "conceal", "manipulate", "inflate",
    "partnership", "chewco", "condor", "whitewing",
]
_DATA_DESTRUCTION = [
    "shred", "destroy", "delete", "clean up", "retention policy",
    "get rid of", "remove files", "wipe", "purge", "shred room",
]
_INAPPROPRIATE = [
    "inappropriate", "harassment", "complaint", "hostile",
    "uncomfortable", "threatening", "retaliation",
]
_KW_BY_CATEGORY = {
    "financial_fraud": _FINANCIAL_FRAUD,
    "data_destruction": _DATA_DESTRUCTION,
    "inappropriate_relations": _INAPPROPRIATE,
}
_ALL_KEYWORDS = [k for v in _KW_BY_CATEGORY.values() for k in v]

_vader = SentimentIntensityAnalyzer()


@dataclass
class Verdict:
    is_anomalous: bool
    confidence: float
    category: str
    reasoning: str
    tokens_in: int = 0
    tokens_out: int = 0
    raw_response: str = ""


# ----------------------------- heuristic ---------------------------------- #

def heuristic_classify(
    text: str,
    escalation_threshold: float = 0.7,
    investigator_confidence: float = 0.5,
) -> Verdict:
    """Bit-for-bit reproduction of the current Sentiment Agent logic for the
    single-email evaluation path.

    The current pipeline, under ``evaluation_mode`` with one email, computes:

        flagged = (any keyword match) OR (VADER compound < -0.5)
        keyword_signal = 1 if flagged else 0          # see vader_analysis.batch_analyze_emails
        sentiment_signal = 1 if VADER compound < -0.5 else 0
        sentiment_confidence = 0.6 * keyword_signal + 0.4 * sentiment_signal

    (Note: this is a quirk of the published implementation — the
    `keyword_signal` is actually derived from the `flagged` boolean,
    which itself is `kw_hit OR vader_neg`. So vader-negative-only emails
    push `keyword_signal` to 1.0 even with no keyword. We reproduce this
    behavior faithfully to match the published F1=2.65% baseline.)

    If no deliberation is triggered (because Investigator is hardcoded to
    0.5 and divergence is |0.5 - sentiment_conf|), the final Escalation
    score is ``0.5 * 0.5 + 0.5 * sentiment_confidence``. This function
    replicates that final score and thresholds at ``escalation_threshold``.

    Divergence > 0.3 triggers deliberation. The deliberation node computes
    a weighted average biased toward the stronger side.
    """
    txt = text or ""
    low = txt.lower()
    kw_hit = any(kw in low for kw in _ALL_KEYWORDS)
    vader = _vader.polarity_scores(txt).get("compound", 0.0)
    vader_neg = vader < -0.5
    flagged = kw_hit or vader_neg
    kw_signal = 1.0 if flagged else 0.0
    sent_signal = 1.0 if vader_neg else 0.0
    sent_conf = 0.6 * kw_signal + 0.4 * sent_signal

    divergence = abs(investigator_confidence - sent_conf)
    if divergence > 0.3:
        # Deliberation branch (weighted toward stronger side)
        if investigator_confidence > sent_conf:
            agreed = investigator_confidence * 0.6 + sent_conf * 0.4
        elif sent_conf > investigator_confidence:
            agreed = sent_conf * 0.6 + investigator_confidence * 0.4
        else:
            agreed = (investigator_confidence + sent_conf) / 2
        final = agreed
    else:
        final = investigator_confidence * 0.5 + sent_conf * 0.5

    # Determine category from keyword hits
    category = "normal"
    best_hits = 0
    for cat, kws in _KW_BY_CATEGORY.items():
        hits = sum(1 for k in kws if k in low)
        if hits > best_hits:
            best_hits = hits
            category = cat
    if best_hits == 0 and final >= escalation_threshold:
        category = "financial_fraud"  # matches current default in escalation.py

    return Verdict(
        is_anomalous=(final >= escalation_threshold),
        confidence=round(final, 4),
        category=category,
        reasoning=(
            f"heuristic: kw_hit={kw_hit} (signal={kw_signal}), "
            f"vader_compound={vader:.3f} (signal={sent_signal}), "
            f"sent_conf={sent_conf:.3f}, final={final:.3f}"
        ),
    )


# ----------------------------- LLM prompts --------------------------------- #

_GENERIC_CORPORATE_POLICY = (
    "You are a compliance analyst reviewing a single email for signs of "
    "corporate misconduct. Consider these broad policy categories: "
    "(A) financial fraud (misrepresenting financial state, off-book arrangements, "
    "bribery, improper revenue recognition); (B) data destruction or concealment "
    "(instructions to destroy, shred, delete, wipe, or conceal records); "
    "(C) inappropriate relations (harassment, coercion, favoritism, "
    "unprofessional conduct); (D) policy violation (misuse of confidential "
    "information or communication systems)."
)

_ACFE_ENRON_TAXONOMY_EXCERPT = (
    "You are a Senior Forensic Auditor following the ACFE Occupational Fraud "
    "Classification System (Fraud Tree). Consider these specific fraud "
    "mechanisms associated with the Enron scandal:\n"
    "- FINANCIAL STATEMENT FRAUD: fictitious revenue; mark-to-market abuse; "
    "concealed liabilities via Special Purpose Entities such as LJM, Raptor, "
    "Chewco, Whitewing; improper asset valuations.\n"
    "- CORRUPTION: conflicts of interest (related-party transactions); "
    "bribery and kickbacks; economic extortion; illegal gratuities.\n"
    "- DATA SPOLIATION: directives to shred or destroy documents; instructions "
    "to wipe drives, delete email threads, or alter backup cycles, "
    "especially during investigation periods.\n"
    "- ASSET MISAPPROPRIATION: billing schemes, ghost employees, expense "
    "reimbursement fraud.\n"
    "Linguistic red flags: phrases of concealment ('cover up', 'off the books', "
    "'do not leave a trail', 'discuss offline'), rationalization ('gray area', "
    "'creative accounting'), and alternative-channel requests ('call my mobile')."
)


_TAXONOMY_VARIANTS = {
    "generic": _GENERIC_CORPORATE_POLICY,
    "acfe_enron": _ACFE_ENRON_TAXONOMY_EXCERPT,
}


_LLM_SYSTEM_JSON = """{taxonomy}

You will receive the text of a single corporate email. The email may be
fully de-identified (names replaced by generic tokens) or partially
pseudonymized. Do not refuse to analyze it; the de-identification is
intentional.

Output strict JSON with these keys and nothing else:
{{
  "is_anomalous": true or false,
  "confidence": a number in [0.0, 1.0],
  "category": one of ["financial_fraud", "data_destruction",
                     "inappropriate_relations", "policy_violation", "normal"],
  "evidence_quote": "a short direct quote from the email that best supports the
    decision, or '' if is_anomalous is false"
}}

Be calibrated. A normal business email is the overwhelming majority; label
anomalous only when textual evidence is plausible to a human compliance
reviewer."""


_LLM_SYSTEM_JSON_COT = """{taxonomy}

You will receive the text of a single corporate email. The email may be
de-identified. Analyze it in two phases.

Phase 1 (private reasoning). Think through:
- Which sentences, if any, carry compliance-relevant signal?
- Which of the taxonomy categories, if any, fits best?
- What is the base rate? Most emails are normal; resist the urge to
  over-flag on weak signals.
- What calibrated confidence would a cautious human reviewer assign?

Phase 2 (structured verdict). Output strict JSON with these keys:
{{
  "reasoning_summary": "2-3 sentence summary of your Phase-1 reasoning",
  "is_anomalous": true or false,
  "confidence": a number in [0.0, 1.0],
  "category": one of ["financial_fraud", "data_destruction",
                     "inappropriate_relations", "policy_violation", "normal"],
  "evidence_quote": "a short direct quote from the email or '' if clean"
}}

Output the JSON on a single line. No prose outside the JSON object.
If you must include your Phase-1 thinking, wrap it in <scratch></scratch> tags
BEFORE the JSON; do not embed it inside the JSON."""


def _strip_scratch(text: str) -> str:
    return re.sub(r"<scratch>.*?</scratch>", "", text, flags=re.DOTALL).strip()


def _extract_json(text: str) -> Optional[dict]:
    # Remove <scratch> if present, then find the first {...} block.
    cleaned = _strip_scratch(text)
    # Try strict first
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not m:
        return None
    candidate = m.group(0)
    try:
        return json.loads(candidate)
    except Exception:
        # Last-ditch: sanitize trailing commas
        candidate2 = re.sub(r",\s*([}\]])", r"\1", candidate)
        try:
            return json.loads(candidate2)
        except Exception:
            return None


async def llm_json_classify(
    text: str,
    llm_client,
    use_cot: bool,
    taxonomy: str,
    cost_tracker=None,
    escalation_threshold: float = 0.7,
    purpose: str = "sentiment_llm",
) -> Verdict:
    """Run the LLM-structured classifier against one email.

    ``llm_client`` must be a ``langchain_anthropic.ChatAnthropic`` instance
    (or duck-compatible) exposing ``.ainvoke(messages)``. The caller is
    responsible for initializing it with the correct model name.
    """
    from langchain_core.messages import SystemMessage, HumanMessage

    if taxonomy not in _TAXONOMY_VARIANTS:
        raise ValueError(
            f"Unknown taxonomy variant {taxonomy!r}; "
            f"valid options are {list(_TAXONOMY_VARIANTS)}"
        )
    tax_text = _TAXONOMY_VARIANTS[taxonomy]
    system_tmpl = _LLM_SYSTEM_JSON_COT if use_cot else _LLM_SYSTEM_JSON
    system = system_tmpl.format(taxonomy=tax_text)

    user = f"Email text to analyze:\n\n---\n{text}\n---\n\nReturn your JSON verdict now."

    if cost_tracker is not None:
        cost_tracker.guard_or_raise()

    resp = await llm_client.ainvoke([
        SystemMessage(content=system),
        HumanMessage(content=user),
    ])
    raw = resp.content if hasattr(resp, "content") else str(resp)

    # Token accounting
    from experiments.lib.cost_tracker import (
        extract_usage_from_langchain_response, char_count_fallback_estimate,
    )
    tin, tout = extract_usage_from_langchain_response(resp)
    if tin == 0 and tout == 0:
        tin, tout = char_count_fallback_estimate(
            len(system) + len(user), len(raw)
        )
    if cost_tracker is not None:
        cost_tracker.record(
            getattr(llm_client, "model", "unknown"),
            tin, tout, purpose=purpose,
        )

    parsed = _extract_json(raw)
    if parsed is None:
        # Unparseable -> conservative "clean" fallback but record reasoning.
        return Verdict(
            is_anomalous=False,
            confidence=0.0,
            category="normal",
            reasoning=f"LLM returned unparseable output: {raw[:200]}",
            tokens_in=tin,
            tokens_out=tout,
            raw_response=raw,
        )

    is_anom = bool(parsed.get("is_anomalous", False))
    try:
        conf = float(parsed.get("confidence", 0.0))
    except Exception:
        conf = 1.0 if is_anom else 0.0
    conf = max(0.0, min(1.0, conf))
    category = str(parsed.get("category", "normal")).lower().strip() or "normal"
    evidence = parsed.get("evidence_quote", "")
    reasoning_summary = parsed.get("reasoning_summary", "")

    # Classification decision is taken from the LLM's is_anomalous field,
    # NOT by re-thresholding its confidence. This is intentional and
    # documented: the LLM is treated as a first-class classifier.
    return Verdict(
        is_anomalous=is_anom,
        confidence=round(conf, 4),
        category=category,
        reasoning=(
            f"{reasoning_summary} | evidence: {evidence!r}"
            if reasoning_summary else f"evidence: {evidence!r}"
        ),
        tokens_in=tin,
        tokens_out=tout,
        raw_response=raw,
    )


def list_classifier_variants() -> list[str]:
    return ["heuristic", "llm_json", "llm_json_cot"]


def list_taxonomy_variants() -> list[str]:
    return list(_TAXONOMY_VARIANTS)
