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

### Current headline (as of init)

The published F1 score of **2.65%** (presentation deck, slide 13) is **not primarily caused by PII de-identification**. A direct keyword-overlap probe shows that the current de-identification scheme removes only **~1% of keyword signal**, and affects only **1 of 67 true threats**. The dominant cause of the observed collapse is a **classifier-design artifact**: the Sentiment Agent's binary prediction is computed by a hand-rolled 29-keyword regex + VADER heuristic, and the LLM's reasoning text is discarded for the purpose of classification. The privacy narrative in the final presentation therefore overstates what the data shows; the real finding is about **classifier architecture**, not about privacy controls.

This is a **more interesting governance finding** than the presentation version because it shows how a system that *appears* LLM-powered can have its critical decisions driven by deterministic, legacy code — an accountability gap that no amount of forensic logging reveals.

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
| E1-LLMcls-2026-04-22T15-43-51Z | running | running | running | in progress |

**Cumulative spend:** $0.02 of $2,000 cap (as of last update before E1-LLMcls).

---

## 8. Results ledger (updated after every run)

Metrics below are filled in as runs complete. **All F1/P/R are reported with 95% bootstrap CIs.**

| Run ID | Condition | n | F1 (95% CI) | Precision | Recall | TP | FP | FN | Notes |
|---|---|---|---|---|---|---|---|---|---|
| E0-repro | heuristic / full_scrub / generic | 2000 | **2.65%** (0.00–6.78) | 2.38% | 2.99% | 2 | 82 | 65 | **Bit-exact reproduction of published F1=2.65%** |
| E3-raw-heur | heuristic / **raw** / generic | 2000 | **2.94%** (0.00–6.90) | 2.90% | 2.99% | 2 | 67 | 65 | Removing de-ID changes F1 by only **+0.29 pp** under the heuristic classifier. |
| E1-LLMcls | **llm_json** / full_scrub / generic | 2000 | *pending* | | | | | | Running. Sonnet 4.5. |

**Headline ΔF1 decomposition (so far):**

- Privacy-only effect under heuristic: **+0.29 pp** (2.65 → 2.94)
- Classifier-only effect under full-scrub de-ID: *pending E1 completion*

---

## 9. Run-by-run narrative (newest first)

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

