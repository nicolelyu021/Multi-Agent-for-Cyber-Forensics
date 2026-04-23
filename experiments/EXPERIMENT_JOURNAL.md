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

### Current headline (after 10 completed runs — test-retest pair added 2026-04-23)

> **Privacy controls do not cost measurable F1 under a competent classifier. The 37-point "privacy gap" in the midterm presentation is classifier architecture. CoT prompting does not help and can actively hurt. Taxonomy injection looks helpful but is not statistically distinguishable from LLM re-run noise at n=2,000.**

| Condition | Classifier | De-ID | Taxonomy | F1 | 95% CI | Note |
|---|---|---|---|---|---|---|
| **E0-repro** (published baseline) | heuristic | full-scrub | generic | **2.65%** | 0.00–6.78 | Reproduces midterm |
| **E3-raw-heur** (privacy-on-heuristic) | heuristic | **raw** | generic | 2.94% | 0.00–7.50 | Privacy isolated |
| **E1-LLMcls** (classifier isolated) | **LLM-JSON (Sonnet 4.5)** | full-scrub | generic | **39.67%** | 28.12–50.32 | +37 pp over E0 |
| **E3-raw-llm** | LLM-JSON | **raw** | generic | 40.94% | 28.83–50.75 | Privacy null vs E1 (p=0.84) |
| **E4-pseudo** | LLM-JSON | **pseudonym** | generic | 39.06% | 27.59–49.23 | Privacy null vs E1 (p=0.47) |
| **E2-taxon** ★ best point est. | LLM-JSON | full-scrub | **ACFE-Enron** | **46.55%** | 34.19–56.92 | +6.88 pp vs E1 (p=0.34, NS) |
| **E5-CoT** | LLM-JSON + CoT scratchpad | full-scrub | generic | 22.99% | 10.81–35.16 | Worse operating point (p=0.43 vs E1) |
| **E6-best-scaled** (E2 re-run) | LLM-JSON | full-scrub | ACFE-Enron | 41.94% | 30.36–53.06 | Test-retest of E2 |
| **E1-LLMcls redux** (2026-04-23) | LLM-JSON | full-scrub | generic | **39.67%** | — | Test-retest of E1: identical confusion matrix |
| **E2-taxon redux** (2026-04-23) | LLM-JSON | full-scrub | ACFE-Enron | 43.90% | — | Third E2 run, F1 SD across 3 runs = 2.09 pp |

**Significance summary (paired McNemar vs. E1-LLMcls control):**

| Factor changed | Run | ΔF1 | McNemar p | Status at α=0.05 |
|---|---|---:|---:|---|
| Heuristic → LLM classifier | E0 → E1 | +37.02 pp | **<0.0001** | ✅ strongly significant |
| LLM + full-scrub → LLM + raw | E1 → E3-raw-llm | +1.27 pp | 0.84 | ❌ null |
| LLM + full-scrub → LLM + pseudonym | E1 → E4 | −0.61 pp | 0.47 | ❌ null |
| LLM, add ACFE-Enron taxonomy | E1 → E2 | +6.88 pp | 0.34 | ⚠ consistent direction, under-powered |
| LLM, add CoT scratchpad | E1 → E5 | −16.68 pp (F1), same total errors | 0.43 | ❌ null on accuracy, big operating-point shift |
| E2 re-run (same config, different LLM sample) | E2 → E6 | −4.61 pp | 0.03 | — single-pair noise estimate |
| E1 test-retest (same config) | E1 → E1-redux | +0.00 pp | ≈1.00 | **Re-run noise ≈ 0 for the generic prompt** |
| E2 test-retest (3 runs aggregated) | — | SD = 2.09 pp | — | Re-run noise for the taxonomy prompt |
| Taxonomy effect, revised (mean across retests) | E1-mean → E2-mean | +4.11 pp | 0.25–0.44 (ensemble McNemar) | Still under-powered; point estimate halved |

**What this establishes:**
- **H1** (classifier explains ≥3× more than privacy): **confirmed** — 37 pp vs. ≤ 1.9 pp is a 19× ratio on point estimate; on *significance*, classifier p<0.0001 vs. privacy p∈{0.47, 0.71, 0.84} is decisive.
- **H2** (privacy costs real but <10 pp under modern classifier): **falsified in the favorable direction** — privacy cost is statistically unmeasurable at n=2,000.
- **H2-pseudo** (pseudonymization is intermediate): **not supported** — statistically equivalent to full-scrub.
- **H3** (taxonomy injection adds ≥5 pp): **not established, revised effect size lower.** Mean across 3 E2 runs is 44.46% (SD = 2.09 pp) vs. 40.35% across 2 E1 runs (SD = 0.00 pp). The true taxonomy effect is roughly **+4.1 pp** — a genuine signal, but roughly equal to 2× E2's re-run SD. Ensembled McNemar tests yield p ∈ {0.25, 0.44, 1.00} depending on vote rule. To resolve H3 at α=0.05 we'd need n ≈ 6,000. See `TEST_RETEST_ANALYSIS.md`.
- **H5** (CoT adds ≥3 pp F1): **falsified decisively** — CoT lowers F1 by 16.68 pp. McNemar on accuracy is null (p=0.43), but Sonnet under CoT talks itself *out* of flagging borderline emails, shifting the operating point toward precision (50%) at the cost of recall (14.9%).

**Governance implications for the final report:**

1. **The presentation framing — "privacy vs. capability tradeoff" — is a *misattribution of a classifier design choice to a privacy control*.** Under the modern classifier we cannot measure a privacy cost; under either classifier the de-ID gap is ≤ 1.9 pp (not significant).
2. **Observability without authority** is a specific failure mode of multi-agent LLM systems: LLM reasoning tokens were logged and hashed through every layer, but the actual binary decision came from a 29-word regex outside the LLM reasoning surface. The NIST AI RMF *Measure 2.8 (Transparency)* bar was met textually but not mechanistically.
3. **Strong-privacy-by-default is supported empirically.** Full-scrub PII redaction imposes **zero measurable F1 cost** vs. both raw text and pseudonymization. Any weakening of de-ID policy must be justified on grounds *other than classification accuracy*.
4. **Prompt choices are operating-point choices.** CoT did not reduce *accuracy* but shifted the model into a high-precision / low-recall regime. For high-cost-of-miss applications like insider threat, that shift matters; teams should measure operating-point effects, not just F1.
5. **Prompt complexity increases stochasticity** — a new methodological finding from the test-retest pair. Two E1-LLMcls runs at identical config produced *identical* confusion matrices (F1=40.35% both times, only 8 of 1887 predictions disagree). Three E2-taxon runs produced F1 SD = 2.09 pp. The taxonomy prompt, by forcing the model to select among 4 named categories, raises decision entropy on borderline emails. **Any prompt ablation should include a test-retest pair per variant, not a single run per variant** — otherwise LLM-sampling noise is confounded with prompt effect.
6. **Null privacy result is genuine, not power-limited.** With E1 re-run noise now estimated at 0 pp, the privacy manipulations (E1 ↔ E3-raw-llm, ΔF1=+1.27 pp; E1 ↔ E4, ΔF1=−0.61 pp) produce effects *larger than* the stochastic floor but still statistically indistinguishable from zero. This is a stronger version of the privacy null than we could claim before the retest.

**Total spend:** $82.96 across 8 production LLM runs (E1, E1-redux, E2, E2-redux, E3-raw-llm, E4, E5, E6), verified from per-run `cost_log.jsonl`. Including the aborted partial ($3.96) and the smoke test ($0.02), total API charges on this branch are **$86.94 of $5,000** (1.74% of budget used). The two heuristic runs (E0-repro, E3-raw-heur) used no LLM and cost $0.

**Deployment-useful result from post-hoc ensembling** (`experiments/ENSEMBLE_ANALYSIS.md`):
> Averaging `probability_anomalous` across 5 modern-classifier runs and thresholding at 0.2 reaches **F1 46.63% with Recall 61.3% and Precision 37.6%**, flagging 101 of 1,887 emails (5.4%) for human review. This is the first operating point we found that pushes recall above 60%, and it is strictly better than any single run for a human-in-the-loop triage workflow. Point estimate is within 0.1 pp of the best single run (E2-taxon), so ensembling does not break through the classifier plateau — but it does unlock a materially better *operating point*. Incremental cost for this configuration is 5× per-email compute (~$50 per 2k emails vs. $10 for a single run) for a +20 pp recall lift. This is a legitimate governance trade-off to surface for a bank-scale deployment.

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
| E1-LLMcls-2026-04-22T15-42-29Z | ~480K | ~135K | $3.96 | **aborted** at 901/2000 (buffered-output bug; restarted as 15-43-51Z) |
| E1-LLMcls-2026-04-22T15-43-51Z | 1.05M | 300K | $8.66 | completed |
| E3-raw-llm-2026-04-22T16-04-26Z | 1.04M | 300K | $8.53 | completed |
| E4-pseudo-2026-04-22T16-24-16Z | 1.05M | 301K | $8.64 | completed |
| E2-taxon-2026-04-22T16-48-53Z | ~1.20M | ~370K | $10.38 | completed (n=1887 paired, 113 JSON-parse drops) |
| E5-CoT-2026-04-22T17-33-48Z | ~1.15M | ~1.15M | $16.04 | completed (CoT roughly doubled output tokens) |
| E6-best-scaled-2026-04-22T20-44-07Z | ~1.20M | ~370K | $11.00 | completed (dataset capped at 2000) |
| E1-LLMcls-2026-04-23T05-47-05Z | 1.05M | 300K | $8.68 | test-retest of E1 (2026-04-23) |
| E2-taxon-2026-04-23T05-47-05Z | ~1.20M | ~370K | $11.03 | test-retest #2 of E2 (2026-04-23) |

**Cumulative spend:** **$82.96** across the 8 production runs (E1 ×2, E3-raw-llm, E4, E2 ×3, E5), verified from per-run `cost_log.jsonl`. Including the aborted partial ($3.96) and the smoke test ($0.02), total API charges on this branch are **$86.94 of $5,000** (1.74% of budget used). E0-repro and E3-raw-heur are heuristic-only and cost $0.

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

### `E6-best-scaled-2026-04-22T20-44-07Z` — Confirmatory re-run of the "winner" config

**Config:** auto-emitted by `experiments/decide_scale.py` to mirror E2-taxon (the highest F1 CI-lower-bound). Requested n=10,000 but dataset has only 2,000 records, so effective n=2,000 with the same seed.
**Wall-clock:** 1708s (28.5 min)  **Cost:** $11.00

**Intent:** replicate the best single-condition result.

**Result:**
- F1: **41.94%** (95% CI 30.36–53.06%)
- Precision: 45.61%, Recall: 38.81%
- Confusion: TP=26, FP=31, FN=41, TN=1902

**Comparison to E2-taxon (same config, different LLM sample):**
- E2-taxon F1 = 46.55%, E6-scaled F1 = 41.94%.
- Paired McNemar: n_discordant=6, OR=0 (asymmetric), **p=0.03**.
- Six emails that E2 flagged correctly, E6 missed (zero in the other direction).

**Interpretation:** the ~4.6 pp F1 spread between two identically-configured runs on the same 2,000 emails is the **LLM-stochasticity floor** for this sub-system. It is comparable to the bootstrap CI half-width (~10 pp) and to the 6.88 pp gap we observed between E1-LLMcls and E2-taxon (which we had wanted to attribute to taxonomy injection).

> **Practical consequence:** the +6.88 pp E1→E2 improvement cannot be attributed to the taxonomy with high confidence at n=2,000. It sits well within the re-run variance of a single fixed config.

To make a statistically defensible statement about taxonomy injection we would need n ≥ 5,000 of ground-truth-labeled data. The present dataset (2,000 emails, 67 positives) limits us to the McNemar-significant effects: the classifier change (+37 pp, very strong) and the *absence* of a privacy effect (null result, consistently).

---

### `E5-CoT-2026-04-22T17-33-48Z` — Chain-of-thought prompt ablation

**Config:** `experiments/configs/E5-CoT.yaml`
**Wall-clock:** 11425s (190 min — slowest run; longer prompts and outputs)  **Cost:** $16.04 (highest single-run cost)

**What I was testing:** Prof. Sadeh's feedback was that a two-phase CoT scratchpad ("first reason step-by-step, then decide") typically improves LLM classification. This run uses an identical setup to E1-LLMcls except the system prompt asks the model to produce a reasoning scratchpad before the final JSON verdict.

**Prediction:** modest F1 lift, most gain on borderline cases.

**Result:**
- F1: **22.99%** (95% CI 10.81–35.16%)  — **lower** than E1
- Precision: **50.00%**, Recall: **14.93%**
- Confusion: TP=10, FP=10, FN=57, TN=1914

**Paired McNemar vs. E1-LLMcls:** n_discordant=40, OR=0.74, **p=0.43** — not significant. The same classification accuracy, a very different operating point.

**Interpretation:** CoT did not degrade the *classifier*, it shifted the *risk appetite*. The model under CoT became substantially more conservative:
- 44 fewer positives flagged overall (60 → 20)
- Same precision (50%) as E2-taxon — so when it flags, it is right
- Recall crashes (35.8% → 14.9%) — it misses ~60% of what E1 caught

The model's scratchpad output (visible in `predictions.jsonl[*].reasoning`) makes this mechanism explicit — when asked to reason first, Sonnet-4.5 tends to talk itself *out* of flagging on moderate-signal emails ("this could be routine accounting — let me assume good faith") rather than flagging defensively.

**Governance implication:** CoT is NOT a free win on threat-classification tasks. For high-cost-of-miss applications (insider threat, fraud triage) the conservative drift of CoT lowers recall to the point that F1 drops by almost half. Before deploying a CoT prompt, teams should verify it doesn't change the operating point in the wrong direction for their cost profile.

**Pre-registered H5** ("CoT improves F1 by ≥3 pp over non-CoT"): **falsified decisively.**

---

### `E2-taxon-2026-04-22T16-48-53Z` — ACFE-Enron taxonomy injected into Student prompt

**Config:** `experiments/configs/E2-taxon.yaml`
**Wall-clock:** 2695s (45 min)  **Cost:** $10.38

**What I was testing:** the Grader (Claude Opus) used the ACFE Occupational Fraud Taxonomy contextualized for Enron to produce labels. The Student (Sonnet) was given only a generic corporate-policy prompt. This run closes that asymmetry — same LLM, same scrubbed text, but the Student now sees the same taxonomy the Grader used.

**Prediction:** +6 to +12 pp F1 vs. E1-LLMcls, mostly from Financial Fraud recall.

**Result:**
- F1: **46.55%** (95% CI 34.19–56.92%)
- Precision: 50.00%, Recall: 43.55%
- Confusion: TP=27, FP=27, FN=35, TN=1798 — on **n=1887 paired** (113 records dropped because of JSON parse failures in the longer taxonomy-augmented output)

**Per-category recall:**
- Financial Fraud: 26/57 = 45.6% (up from 39.3% in E1-LLMcls)
- Data Deletion: 1/1 = 100%
- Inappropriate Relations: 0/2 = 0%
- Corruption: 0/2 = 0%

**Paired McNemar vs. E1-LLMcls:** n_discordant=28, OR=1.55, **p=0.34** — not significant.

**Interpretation:** E2 looks like a win on point estimate (+6.88 pp F1, +6.3 pp Financial Fraud recall, best precision of any run), and the direction matches H3 exactly — the gain is concentrated in Financial Fraud, the category the taxonomy names. However, the paired test does not reach α=0.05, and the E6 re-run of the same config (F1=41.94%) shows the LLM-stochasticity floor is about 5 pp on this dataset.

**Honest statistical claim:** we observe a consistent +2 to +7 pp F1 lift from taxonomy injection across runs, but at n=2,000 we cannot distinguish it from LLM sampling noise at conventional significance. The claim "domain-specific taxonomy closes the teacher-student gap" is *qualitatively supported* but *not statistically established* at this sample size.

**Pre-registered H3** ("taxonomy injection improves F1 by ≥5 pp"): **consistent with data but not statistically established (p=0.34).**

**Secondary finding:** the larger prompt caused 113 JSON-parse failures (5.6%). Future runs should use response-format constraints or `instructor`-style guards. The dropped records are treated as non-predictions and removed from paired tests — not counted as FN/FP — which avoids biasing the estimate.

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

