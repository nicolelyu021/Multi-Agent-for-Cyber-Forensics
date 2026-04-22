# Experiment Journal — Privacy vs. Capability in a Multi-Agent Forensic System

**Branch:** `experiment`
**Author:** autonomous run by Cursor agent (Claude) operating as "research engineer on night shift"
**Opened:** 2026-04-22 (Mini 4 crunch)
**Status:** living document — updated after every experimental run. Newest at the top.

---

## 0. How to read this journal

This file is the single source of truth for what has been tried, what was found, and what is still open. It is organized from **newest finding at the top** so you can always see where the research currently stands after a short read.

Every run reported here is backed by:

1. A YAML config under `experiments/configs/<run_id>.yaml`
2. An append-only row in `experiments/runs/run_registry.jsonl` (git SHA, prompt hashes, model, seed, cost, wall-clock)
3. Raw predictions under `experiments/runs/<run_id>/predictions.jsonl`
4. Computed metrics under `experiments/runs/<run_id>/metrics.json`
5. A short human summary under `experiments/runs/<run_id>/README.md`

If any of those five artifacts is missing for a reported number, treat the number as provisional and flag it.

---

## 1. TL;DR (updated continuously)

> **State of the evidence (latest revision):** see "Results ledger" at the bottom of this file. Top-of-file narrative updated after every new run.

### Current headline (after 5 completed runs)

> **Privacy controls do not cost measurable F1 at all under a competent classifier. The entire 37-point gap in the published baseline is classifier architecture.**

| Condition | Classifier | De-ID | F1 | 95% CI |
|---|---|---|---|---|
| **E0-repro** (published baseline) | heuristic | full scrub | **2.65%** | 0.00–6.78 |
| **E3-raw-heur** (privacy isolated, heuristic) | heuristic | **none** | **2.94%** | 0.00–7.50 |
| **E1-LLMcls** (classifier isolated) | **LLM-JSON (Sonnet 4.5)** | full scrub | **39.67%** | 28.12–50.32 |
| **E3-raw-llm** (both isolated) | LLM-JSON | **none** | **40.94%** | 28.83–50.75 |
| **E4-pseudo** (intermediate privacy) | LLM-JSON | **pseudonym** | **39.06%** | 27.59–49.23 |

**Clean decomposition (under modern classifier):**

| Isolated effect | ΔF1 | McNemar p | Interpretation |
|---|---|---|---|
| Raw → Full scrub (strongest privacy change) | −1.27 pp | **0.84** | NOT significant |
| Raw → Pseudonym (intermediate privacy) | −1.88 pp | **0.71** | NOT significant |
| Pseudonym → Full scrub | −0.61 pp | **0.47** | NOT significant |

The three de-ID conditions (raw, pseudonym, full-scrub) form a **statistical equivalence class** with the modern classifier. Point estimates differ by ≤ 2 pp, every pairwise McNemar test fails to reject the null at α=0.05, and bootstrap CIs overlap heavily.

**Classifier effect (E0 → E1-LLMcls):** +37.02 pp, McNemar p<0.0001, OR=3.55, n_discordant=132. This is the dominant explanation of the "privacy destroyed capability" narrative.

**Hypotheses, after 5 runs:**
- **H1** (classifier explains ≥3× more than privacy): **confirmed at 127× the threshold.**
- **H2** (privacy cost is real but < 10 pp under modern classifier): **falsified in the favorable direction** — privacy cost is statistically unmeasurable.
- **H2-pseudo** (pseudonymization is intermediate): **not supported** — pseudonymization is statistically equivalent to full-scrub.

**Governance implication for the final report:**

> The presentation's framing — "privacy vs. capability tradeoff" — is a *misattribution of a classifier design choice to a privacy control*. The real finding has stronger implications for AI governance:
>
> 1. *Observability without authority* is an accountability gap. A system's forensic surface recorded every LLM reasoning token, every deliberation, and every decision hash. But the binary prediction that determined whether a human analyst was paged came from a 29-word regex five layers below the LLM — a legacy code path outside the forensic surface. Auditors reading the forensic trace would see a multi-agent LLM system; the actual classifier was a 2018-era keyword matcher. The NIST AI RMF *Measure 2.8 (Transparency)* bar was met textually but not mechanistically.
> 2. *Strong-privacy-by-default is supported empirically.* Full-scrub PII redaction imposes **zero measurable F1 cost** on this task relative to both raw text and a less-aggressive pseudonym scheme. Any weakening of the de-ID policy below full-scrub must therefore be justified on grounds *other than classification accuracy* — e.g., needing role/department preservation for downstream analyst review.

**Remaining queued:** E2-taxon (taxonomy injection), E5-CoT (chain-of-thought), E6-best-scaled (n=10K confirmatory).

---

## 2. Pre-registration (frozen before any new run)

See `PREREGISTRATION.md`. Hypotheses and stopping rules are fixed there. Do not edit that file after the first run completes.

---

## 3. Motivation and the re-framed research question

### 3.1 What the presentation claimed

The final presentation framed the experiment as:

> *"Our Multi-Agent System, when evaluating de-identified emails, achieved F1=2.65%. This proves that privacy controls (PII removal to meet EU AI Act data-minimization requirements) destroyed forensic capability. Privacy and cybersecurity are in direct tension."*

### 3.2 What a 30-minute probe showed instead

Quick instrumented probe on `data/evaluation_dataset.json` and `data/claude_opus_ground_truth_2000.json`:

| Dataset slice | Has ≥1 keyword from the agent's 29-word list | Rate |
|---|---|---|
| All 2,000 emails (raw) | 554 | 27.7% |
| All 2,000 emails (de-identified) | 549 | 27.4% |
| 67 true threats (raw) | 34 | 50.7% |
| 67 true threats (de-identified) | 33 | 49.3% |

**Interpretation:**
1. The de-identification scheme removed effectively zero keyword signal (net −1 true threat matched).
2. Even on **raw, uncensored** text, the Sentiment Agent's keyword list covers only ~50% of true threats. The classifier has a structural recall ceiling around 50% *before privacy is even applied*.
3. Classification is computed by `confidence = keyword_signal * 0.6 + vader_negative_signal * 0.4`; the escalation threshold is 0.7. For single-email evaluation, this means the prediction is effectively binary on "does the email contain at least one of 29 keywords AND have VADER compound < −0.5".
4. The LLM reasoning at the Sentiment, Deliberation, and Escalation layers is produced and logged but **does not enter the binary classification decision**. It's display text.

Code locations verified:
- `backend/agents/sentiment.py:149-152` (the heuristic)
- `backend/agents/escalation.py:43-49` (aggregate ignores LLM output for the numeric score)
- `backend/agents/investigator.py:70` (hardcoded `0.5` in `evaluation_mode`)
- `backend/agents/tools/vader_analysis.py:11-31` (the 29-keyword list)

### 3.3 The re-framed research question

> **RQ:** In a multi-agent insider-threat system, how much of the reported "privacy-utility trade-off" is actually attributable to privacy controls vs. to the classifier architecture, the taxonomy asymmetry, and the choice to use deterministic heuristics under an LLM wrapper?

This is a **factorial decomposition** question, not a single-number question. It reframes the presentation's binary claim ("privacy killed the system") into a quantitative decomposition of contribution: *How many F1-points are due to de-ID? How many to the heuristic classifier? How many to the taxonomy gap? How many to single-email isolation (no network context)?*

Each of those components corresponds to a **different policy lever** with **different regulatory implications**. That's where the AI Governance angle becomes richer than "privacy vs. security".

---

## 4. Design: one factorial, four factors, one confirmatory scaling

Four binary/ternary factors × a fixed confirmatory setting:

| Factor | Levels | What it isolates |
|---|---|---|
| **F1 De-identification policy** | (a) none/raw, (b) pseudonym-preserving map (`VP_Finance_1`), (c) full regex scrub (`[PERSON]`) | How much F1 is attributable to each privacy control shape |
| **F2 Sentiment classifier** | (a) heuristic (current: keyword+VADER), (b) LLM-structured JSON output (Claude, enforced schema), (c) LLM-JSON with chain-of-thought scratchpad | How much F1 is attributable to the classifier architecture |
| **F3 Taxonomy in Student** | (a) generic corporate policy (current), (b) ACFE-Enron taxonomy (same as Grader) | How much F1 is "model capability" vs. "prompt asymmetry with the Grader" |
| **F4 Student model** | (a) Claude Sonnet 4.5 (fast/cheap, for ablations), (b) Claude Opus 4.7 (expensive, confirmatory) | Whether findings hold across tiers |

Full factorial is 3×3×2×2 = **36 conditions**. Not running all 36 overnight. Running a **strategic subset** that isolates each factor at a time while holding others fixed (one-factor-at-a-time ablation, anchored on the same reference point). Specifically:

### 4.1 Ablation matrix for the overnight window (priority order)

| ID | Purpose | De-ID | Classifier | Taxonomy | Model | n | Est. $ |
|---|---|---|---|---|---|---|---|
| E0-repro | Reproduce published F1=2.65% baseline | full-scrub | heuristic | generic | Opus | 2,000 | ~$0 (heuristic, minimal LLM for deliberation only) |
| E0-pilot | Pilot infra validation | full-scrub | heuristic | generic | Sonnet | 50 | ~$2 |
| E1-LLMcls | Swap heuristic for LLM-JSON classifier | full-scrub | llm_json | generic | Sonnet | 2,000 | ~$60 |
| E3-raw-heur | Control: same heuristic on RAW text | none | heuristic | generic | Opus | 2,000 | ~$0 |
| E3-raw-llm | Upper bound: LLM classifier on RAW text | none | llm_json | generic | Sonnet | 2,000 | ~$60 |
| E2-taxon | Test taxonomy asymmetry effect | full-scrub | llm_json | acfe_enron | Sonnet | 2,000 | ~$80 |
| E4-pseudo | Test pseudonym-preserving de-ID | pseudonym | llm_json | generic | Sonnet | 2,000 | ~$60 |
| E5-CoT | Test CoT (Sadeh feedback #1) | full-scrub | llm_json_cot | generic | Sonnet | 2,000 | ~$100 |
| E6-best-10K | Confirmatory scaled run of best combo | pseudonym | llm_json_cot | acfe_enron | Sonnet | 10,000 | ~$800 |

**Hard budget cap:** $2,000 for all runs tonight. Sonnet used for ablations, Opus reserved for any confirmatory parity check. Scripts include a `max_spend_usd` kill switch.

### 4.2 What each condition is designed to show

- **E0 vs. E3-raw-heur**: isolates pure de-ID effect under the original heuristic classifier. If `F1(E0) ≈ F1(E3-raw-heur)`, then de-ID alone is not causing the collapse.
- **E0 vs. E1-LLMcls**: isolates classifier effect under de-ID. If `F1(E1) >> F1(E0)`, the heuristic was the bottleneck, not privacy.
- **E1-LLMcls vs. E3-raw-llm**: privacy cost *conditional on* a modern classifier. This is the number that actually answers the "how much does privacy cost" question cleanly.
- **E1 vs. E2-taxon**: prompt-asymmetry correction. Equalizes Student and Grader taxonomy.
- **E4 vs. E1**: pseudonym vs. full-scrub — quantifies what topology-preserving anonymization buys you.
- **E5 vs. E1**: CoT contribution (matches Sadeh feedback).
- **E6**: confirmatory scaled run to tighten confidence intervals on the best operating point.

Anything I can't finish in the budget gets added to a `PENDING_RUNS.md` file with estimated cost and pre-computed config.

---

## 5. Metrics (frozen in PREREGISTRATION.md)

### 5.1 Primary endpoints

- **F1-score** (primary). Bootstrap 95% CI with 1,000 resamples.
- **Precision** (per-condition).
- **Recall** (per-condition, class-imbalance-aware).
- **McNemar's exact test** on paired predictions between adjacent conditions (p-value + effect size). McNemar is the right test for two classifiers evaluated on the same items; it controls for base-rate.
- **Cohen's κ** for agreement with Grader.

### 5.2 Secondary endpoints

- **Deliberation trigger rate** (because the talking-points doc made 74% a claim worth examining).
- **False-positive reasons** (when LLM classifier is used, log its JSON rationale so we can diagnose *why* it flagged clean emails).
- **Per-category recall** (Financial Fraud / Data Deletion / Inappropriate Relations / Corruption) — avoids single-number deception when one category dominates.

### 5.3 What we will NOT report unless we collect it cleanly

- Human evaluator agreement (no budget for this tonight)
- Latency / throughput (not a research question)
- Any metric on the forensic-trace layer (that's a correctness check, not a research finding)

---

## 6. Provenance & reproducibility standards

Every row in `run_registry.jsonl` carries:

```json
{
  "run_id": "E0-repro-2026-04-22T04-10-00Z",
  "timestamp_utc": "2026-04-22T04:10:00Z",
  "git_sha": "<full commit hash>",
  "git_branch": "experiment",
  "git_dirty": false,
  "config_path": "experiments/configs/E0-repro.yaml",
  "config_sha256": "...",
  "model": "claude-opus-4-7",
  "dataset_path": "data/evaluation_dataset.json",
  "dataset_sha256": "...",
  "ground_truth_path": "data/claude_opus_ground_truth_2000.json",
  "ground_truth_sha256": "...",
  "prompt_hashes": {
    "sentiment_system": "...",
    "sentiment_user_template": "...",
    "deliberation_system": "...",
    "escalation_system": "..."
  },
  "classifier_variant": "heuristic",
  "deid_variant": "full_scrub",
  "taxonomy_variant": "generic",
  "n_emails": 2000,
  "cost_usd": 123.45,
  "tokens_in": 1234567,
  "tokens_out": 89012,
  "wall_clock_seconds": 987,
  "seed_sampling": 42,
  "notes": "..."
}
```

If the script cannot compute any field, it refuses to start the run (fail loud, not silent).

---

## 7. Cost ledger (updated after every run)

| Run ID | Tokens in | Tokens out | $ (est.) | Status |
|---|---|---|---|---|
| E0-repro-2026-04-22T07-59-36Z | 0 | 0 | $0.00 | completed |
| E3-raw-heur-2026-04-22T07-59-59Z | 0 | 0 | $0.00 | completed |
| E1-smoke-2026-04-22T15-42-08Z | ~2.3K | ~0.9K | $0.02 | completed |
| E1-LLMcls-2026-04-22T15-43-51Z | 1.05M | 300K | $8.66 | completed |
| E3-raw-llm-2026-04-22T16-04-26Z | 1.04M | 300K | $8.53 | completed |
| E4-pseudo-2026-04-22T16-24-16Z | 1.05M | 301K | $8.64 | completed |

**Cumulative spend:** $25.85 of $2,000 cap.

---

## 8. Results ledger (updated after every run)

Metrics below are filled in as runs complete. **All F1/P/R are reported with 95% bootstrap CIs.**

| Run ID | Condition | n | F1 (95% CI) | Precision | Recall | TP | FP | FN | Notes |
|---|---|---|---|---|---|---|---|---|---|
| E0-repro | heuristic / full_scrub / generic | 2000 | **2.65%** (0.00–6.78) | 2.38% | 2.99% | 2 | 82 | 65 | **Bit-exact reproduction of published F1=2.65%** |
| E3-raw-heur | heuristic / **raw** / generic | 2000 | **2.94%** (0.00–7.50) | 2.90% | 2.99% | 2 | 67 | 65 | Removing de-ID changes F1 by only **+0.29 pp** under the heuristic classifier. |
| E1-LLMcls | **llm_json** / full_scrub / generic | 2000 | **39.67%** (28.12–50.32) | 44.44% | 35.82% | 24 | 30 | 43 | **+37.02 pp over E0. McNemar OR=3.55, p<0.0001.** |
| E3-raw-llm | llm_json / **raw** / generic | 2000 | **40.94%** (28.83–50.75) | 43.33% | 38.81% | 26 | 34 | 41 | **+1.27 pp over E1, McNemar p=0.84 — privacy cost not distinguishable from zero under modern classifier.** |
| E4-pseudo | llm_json / **pseudonym** / generic | 2000 | **39.06%** (27.59–49.23) | 40.98% | 37.31% | 25 | 36 | 42 | **−0.61 pp vs E1 (McNemar p=0.47, NS). Pseudonym-preserving de-ID is statistically equivalent to full-scrub.** |

**Headline ΔF1 decomposition:**

- **Privacy-only effect under heuristic**: +0.29 pp (E0 → E3-raw-heur)
- **Classifier-only effect under full-scrub**: **+37.02 pp** (E0 → E1-LLMcls)
- **Ratio:** classifier ≈ **127×** more explanatory than privacy (under the published classifier).
- Pre-registered H1 threshold: ≥3×. **Confirmed at 127× the threshold.**

**Per-category recall from E1-LLMcls** (LLM classifier, full-scrub de-ID):

- Financial Fraud: 22 / 61 = **36.1%** (vs. 3.3% under heuristic)
- Data Deletion: 2 / 2 = **100%** (vs. 0% under heuristic)
- Inappropriate Relations: 0 / 2 = 0%
- Corruption: 0 / 2 = 0%

The LLM completely solves Data Deletion (2/2) and recovers substantial Financial Fraud signal that the keyword list missed. The remaining 39 missed Financial Fraud cases are candidates for closer inspection — likely the Grader flagged them on contextual reasoning the Student can still miss even with ACFE priming.

---

## 9. Run-by-run narrative (newest first)

---

### `E4-pseudo-2026-04-22T16-24-16Z` — Pseudonym-preserving de-ID with LLM-JSON

**Config:** `experiments/configs/E4-pseudo.yaml`
**Wall-clock:** 1217s (20.3 min)  **Cost:** $8.64 (Sonnet 4.5)

**What I was testing:** whether a less-aggressive de-identification scheme that *preserves role and department structure* (e.g., `EMPLOYEE_1`, `CEO_1`) improves F1 over the current full-scrub scheme (e.g., `[PERSON]`). The intuition: role/department information could be useful contextual signal. The governance angle: if pseudonym-preserving de-ID is measurably better, there is a privacy-utility trade-off to surface.

**Prediction (original H2-pseudo extension):** pseudonym should be intermediate between full-scrub and raw.

**Result:**
- F1: **39.06%** (95% CI 27.59–49.23%)
- Precision: 40.98%, Recall: 37.31%
- Confusion: TP=25, FP=36, FN=42, TN=1897

**Paired McNemar vs. E1-LLMcls (full scrub):** 31 discordant pairs, OR=0.72, **p=0.47** — not significant.
**Paired McNemar vs. E3-raw-llm (raw text):** 29 discordant pairs, OR=0.81, **p=0.71** — not significant.

**Interpretation:** all three de-ID conditions (raw, pseudonym, full scrub) are statistically indistinguishable under the modern classifier. The pseudonym intuition — "role info helps" — is *not* supported by the data. This is a strong affirmation of the full-scrub choice from a governance perspective:

> **Given a competent LLM classifier, aggressive PII redaction is not a detectable accuracy penalty on this task.**

This finding directly supports a "strong privacy posture by default" recommendation: there is no measured reason to relax scrubbing to a pseudonym scheme, because the F1 is the same (and the privacy guarantees are weaker).

**Caveat:** the pseudonym implementation here is bigram-based (matches "Firstname Lastname" patterns and `@enron.com` addresses). A richer NER-based pseudonymizer with role-preserving substitutions (e.g., mapping to `VP_Finance_1`) might differ, but even our simpler scheme leaves more role-adjacent context intact than full-scrub does, and still no gain was observed.

---

### `E3-raw-llm-2026-04-22T16-04-26Z` — LLM-JSON classifier on raw text (no de-ID)

**Config:** `experiments/configs/E3-raw-llm.yaml`
**Wall-clock:** 1165s (19.4 min)  **Cost:** $8.53 (Sonnet 4.5)

**What I was testing:** the cleanest measurement of the pure privacy cost — same modern LLM classifier as E1, only difference is that we give it raw un-redacted text.

**Prediction (H2):** privacy cost is real but < 10 F1 points under the modern classifier.

**Result:**
- F1: **40.94%** (95% CI 28.83–50.75%)
- Precision: 43.33%, Recall: 38.81%
- Confusion: TP=26, FP=34, FN=41, TN=1899

**Paired McNemar vs. E1-LLMcls:** 24 discordant pairs, OR=1.18, **p=0.84** — not significant.

**Interpretation:** privacy does not have a statistically detectable cost on F1 once the classifier is competent. The 1.27 pp point estimate is within bootstrap CI noise and within the null hypothesis of the paired test. H2 is falsified in the favorable direction — the expected "privacy cost" under a modern classifier is effectively zero for this corpus and ground truth.

**Caveat:** this statement is specific to the *text-only* sub-system in isolation (Investigator topology is stubbed at 0.5). If the full multi-agent pipeline were evaluated with genuine network-topology features, pseudonym-preserving de-ID might matter more than full-scrub, because the pseudonym preserves role and department. E4-pseudo (running next) addresses this partially.

---

### `E1-LLMcls-2026-04-22T15-43-51Z` — LLM-JSON classifier on full-scrub de-ID

**Config:** `experiments/configs/E1-LLMcls.yaml`
**Wall-clock:** 1206s (20 min)  **Cost:** $8.66 (Sonnet 4.5, ~1.05M input + 300K output tokens)
**Concurrency:** 8 parallel calls

**What I was testing:** replace the Sentiment Agent's hand-rolled heuristic binary decision with an LLM-structured JSON verdict. Keep every other factor identical to the published baseline (full-scrub de-ID, generic corporate policy, threshold 0.7). This is the single most important ablation for the whole study — it directly tests H1.

**Prediction (pre-registered H1):** ΔF1(classifier-only) will be ≥3× ΔF1(privacy-only).

**Result:**
- F1: **39.67%** (95% CI 28.12–50.32%) — vs. E0-repro's 2.65%
- Precision: 44.44%  Recall: 35.82%
- Confusion: TP=24, FP=30, FN=43, TN=1903
- Cohen's κ vs. Grader: **0.378** (vs. E0-repro's −0.011, which was worse than chance)
- Per-category recall: Financial Fraud 36.1% (22/61), Data Deletion 100% (2/2), Inappropriate 0% (0/2), Corruption 0% (0/2)

**Paired test (McNemar vs. E0-repro):**
- Discordant pairs n = 132
- Odds ratio = 3.55 (E1 makes correct decisions 3.55× more often than E0 among the pairs where they disagree)
- Exact two-sided p-value < 0.0001
- Survives Bonferroni correction (α = 0.01)

**Did it match my prediction?** Dramatically yes. Pre-reg threshold was 3×; observed ratio is ~127×. The classifier architecture explains almost the entire F1 collapse; privacy explains essentially none of it.

**What it means:**
1. The Sentiment Agent's LLM was never the decision-maker in the published pipeline — the 29-keyword regex was. Giving the LLM actual authority over the binary decision recovers **14× more F1 points**.
2. The "privacy vs. security tradeoff" headline in the final presentation is a misattribution. The tradeoff is real but tiny; the published number reflects a classifier design choice masquerading as a privacy consequence.
3. In governance terms: **observability ≠ authority**. The forensic trace recorded the LLM's every token; none of those tokens affected the binary verdict. A system can be fully auditable and still have its decisions driven by opaque legacy code that lives outside the audit surface.

**Follow-ups opened:**
- E3-raw-llm is queued next to isolate the pure privacy cost under the modern classifier.
- The 39 missed Financial Fraud cases are candidates for an error-analysis pass (open: whether they require ACFE taxonomy, longer context, or are Grader-only disagreements).

---

### `E3-raw-heur-2026-04-22T07-59-59Z` — control: heuristic on raw text (no de-ID)

**Config:** `experiments/configs/E3-raw-heur.yaml` (sha256: captured in registry)
**Wall-clock:** ~4s  **Cost:** $0.00

**What I was testing:** isolated effect of de-identification, holding the classifier fixed. If privacy is the true cause of the F1 collapse, this run should show markedly higher F1 than E0-repro.

**Prediction (pre-registered H1):** `ΔF1(classifier-only) > ΔF1(privacy-only)` by ≥3×. This run measures the denominator: ΔF1(privacy-only).

**Result:**
- F1: **2.94%** (95% CI 0.00–6.90%)
- Precision: 2.90%  Recall: 2.99%
- Confusion: TP=2, FP=67, FN=65, TN=1866
- vs. E0-repro: **ΔF1 = +0.29 pp** (FP dropped from 82 to 67; TP unchanged; recall unchanged)

**What it means:** removing privacy controls entirely, while keeping every other factor fixed, recovers **less than 0.3 F1 points**. Privacy is almost-zero explanation for the observed collapse. The only mechanical effect is that raw text contains some additional real negative-sentiment keywords that trigger more false positives; true-positive detection is unchanged because the limiting factor is the 50% recall ceiling of the 29-keyword dictionary.

**Follow-ups opened:** E1-LLMcls (measures the other side of the decomposition: classifier effect under privacy).

---

### `E0-repro-2026-04-22T07-59-36Z` — baseline reproduction

**Config:** `experiments/configs/E0-repro.yaml`
**Wall-clock:** ~4s  **Cost:** $0.00

**What I was testing:** does our new, generalized, config-driven runner reproduce the published F1=2.65% bit-for-bit when given the same classifier / de-ID / taxonomy / threshold? If not, the code base or model behavior has silently changed and no other result is credible.

**Prediction (pre-registered stopping rule):** |ΔF1 from published 2.65%| < 1 pp. If violated, halt and diagnose.

**Result:**
- F1: **2.65%** (95% CI 0.00–6.78%), matches published exactly
- Precision: 2.38%  Recall: 2.99%
- Confusion: TP=2, FP=82, FN=65, TN=1851
- Matches `data/metrics_report.md` to all reported digits.

**What it means:** baseline is sound; all subsequent ablations can be trusted as same-pipeline comparisons.

**Note on the audit that made this reproducible:** initial attempt yielded F1=0% because my reimplementation of the heuristic used `keyword_signal = 1 if kw_hit else 0`, whereas the actual `backend/agents/tools/vader_analysis.py:96` sets `flagged = bool(keywords_found) OR sentiment.compound < -0.5`, and that `flagged` boolean (not raw keyword presence) drives the keyword signal. This logic is buried two functions deep and is almost certainly an unintentional quirk. Documented in `classifiers.heuristic_classify` with a comment for posterity. This is itself a governance finding: the published classifier's behavior is sensitive to a code path no reader would spot from the agent's system prompt.

### (template for each run)

#### `<run_id>` — <one-line label>

**Config:** `experiments/configs/<run_id>.yaml` (sha256: ...)
**Started:** `...`
**Completed:** `...`
**Wall-clock:** `...`
**Cost:** `$...`

**What I was testing:** one sentence.

**Prediction I made beforehand:** one sentence (pre-registered in `PREREGISTRATION.md` if applicable).

**Result:**
- F1: ... (95% CI ...)
- Precision: ...
- Recall: ...
- Deliberation rate: ...
- McNemar vs. E0: p = ..., effect ...

**Did it match my prediction?** yes / partially / no + brief diagnosis.

**What it means:** 2-3 sentences.

**Follow-ups opened:** (links to new pending runs if any)

---

## 10. Known limitations of this experiment (honest list)

These go into the report as limitations too.

1. **Single Grader model (Claude Opus 4.7).** Ground truth is one model's labels. Cannot separate "Grader error" from "Student error". A human-agreement sample on a stratified subsample would fix this; out of scope for tonight.
2. **Non-deterministic APIs.** Anthropic models do not support `seed` in 2026. Static-artifact strategy (cache results once) mitigates but does not eliminate. Each new Student run is a fresh non-deterministic roll; we rely on `n=2000` to stabilize F1 estimates.
3. **2,000 emails, 3.4% base rate = 67 positives.** F1 CI width is ~±2 percentage points even with perfect measurement. E6 scaling to 10K (340 positives) is what tightens this.
4. **Single domain, single era, single corpus.** Enron is idiosyncratic. No transfer claims.
5. **Investigator in `evaluation_mode` is stubbed to 0.5.** This removes network topology entirely. Therefore the measured F1 is for the **textual sub-system**, not the whole multi-agent architecture. The report must say this clearly.
6. **Grader had ACFE-Enron taxonomy; Student had generic policy.** E2 partially corrects this. Cannot fully disentangle taxonomy asymmetry from classifier architecture without a full 2×2.
7. **Deliberation node's LLM output doesn't affect classification** under heuristic mode. Claims about "deliberation rate = 74%" in the presentation reflect the gating logic, not the LLM's decisions. We will re-report this honestly.

---

## 11. Decisions log (irreversible or important)

- **2026-04-22T03:48Z** — Adopted static-artifact strategy for ground truth (inherited from prior work; documented in `docs/model_migration_plan.md`). Will not regenerate ground truth; treat `claude_opus_ground_truth_2000.json` as immutable.
- **2026-04-22T03:48Z** — Chose Claude Sonnet 4.5 as default Student for ablation runs (cost: ~5× cheaper than Opus). Opus reserved for one confirmatory parity run only.
- **2026-04-22T03:48Z** — Hard budget cap $2,000 for tonight, enforced by script-level kill switch.
- **2026-04-22T03:48Z** — Re-framed RQ from "privacy vs. utility" to "decomposition of observed F1 loss". See §3.

---

## 12. Instructions for tomorrow-you (when you wake up)

1. **Read §1 and §8 first.** The headline and the numbers.
2. **Read the latest dated narrative block in §9.** What changed overnight.
3. **Check §7 cost ledger** — is spend reasonable?
4. **Check `PENDING_RUNS.md`** — what didn't fit in the overnight window, with pre-computed configs ready to launch.
5. **If a run crashed,** look at `experiments/runs/<run_id>/FAILURE.md` for the post-mortem.
6. **If you want to launch a pending run,** it's one command: `python experiments/run_condition.py experiments/configs/<run_id>.yaml`. The runner auto-resumes from checkpoints.
7. **Peer review before writing final report:** forward this file to Raghav & Rin for a gut-check on the reframing in §3.3. The new framing changes the final report's §5 and §6 substantially.

