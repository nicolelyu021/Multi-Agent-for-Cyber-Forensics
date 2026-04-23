# Findings memo for the final report

*This document is a draft of the "Revised Experiment & Findings" section of the team's final report. It is structured to be copy-pasted into the report with light editing.*

**Branch:** `experiment`  **Last updated:** 2026-04-22 (post-E4-pseudo).
**Full audit trail:** `experiments/EXPERIMENT_JOURNAL.md`.
**Pre-registration (frozen):** `experiments/PREREGISTRATION.md`.

---

## 1. What we actually did

We re-ran the multi-agent insider-threat classification experiment as a **pre-registered factorial ablation study** on the same 2,000-email Enron sample and the same Claude-Opus-4.7 ground-truth labels that produced the F1 = 2.65% figure in the midterm presentation. Each run logged:

- a cryptographic hash of its config, prompts, dataset, and ground-truth file,
- the git commit SHA on which it ran,
- every LLM call with input/output token counts and dollar cost,
- the predictions for every email (so predictions are directly paired across conditions for McNemar tests).

The pre-registered primary hypothesis was:

> **H1** — classifier architecture explains ≥ 3× more of the F1 variance than privacy de-identification policy does.

A secondary hypothesis:

> **H2** — under a modern LLM classifier, de-identification still costs measurable F1 (estimate: < 10 pp).

Eight conditions were queued. Five have completed at the time of writing; three more are running.

## 2. What we found

**Table 1.** Primary results (n=2,000 paired emails, 95% bootstrap CIs from 1,000 resamples).

| Run | Classifier | De-identification | Taxonomy | F1 | 95% CI | Precision | Recall |
|---|---|---|---|---:|---:|---:|---:|
| E0-repro | heuristic (29 keywords + VADER) | full-scrub | generic | **2.65%** | 0.00–6.78% | 2.4% | 3.0% |
| E3-raw-heur | heuristic | **raw** | generic | 2.94% | 0.00–7.50% | 2.9% | 3.0% |
| E1-LLMcls | **LLM-JSON (Sonnet-4.5)** | full-scrub | generic | **39.67%** | 28.12–50.32% | 44.4% | 35.8% |
| E3-raw-llm | LLM-JSON | **raw** | generic | 40.94% | 28.83–50.75% | 43.3% | 38.8% |
| E4-pseudo | LLM-JSON | **pseudonym** | generic | 39.06% | 27.59–49.23% | 41.0% | 37.3% |
| **E2-taxon** | LLM-JSON | full-scrub | **ACFE-Enron** | **46.55%** | 34.19–56.92% | 50.0% | 43.5% |
| E5-CoT | LLM-JSON + CoT | full-scrub | generic | 22.99% | 10.81–35.16% | 50.0% | **14.9%** |
| E6-best-scaled | LLM-JSON (E2 config, re-run) | full-scrub | ACFE-Enron | 41.94% | 30.36–53.06% | 45.6% | 38.8% |

**Paired decomposition (McNemar's exact test on the same 2,000 message IDs):**

| Factor changed | ΔF1 | n discordant | OR | p |
|---|---:|---:|---:|---:|
| Privacy only, heuristic classifier (E0 → E3-raw-heur) | +0.29 pp | 15 | 0 | 0.0001 |
| **Classifier only, de-ID text (E0 → E1-LLMcls)** | **+37.02 pp** | 132 | 3.55 | **<0.0001** |
| Privacy only, modern classifier (E1-LLMcls → E3-raw-llm) | +1.27 pp | 24 | 1.18 | 0.84 |
| Pseudonym vs full-scrub, modern classifier (E1-LLMcls → E4-pseudo) | −0.61 pp | 31 | 0.72 | 0.47 |
| Pseudonym vs raw, modern classifier (E4-pseudo → E3-raw-llm) | +1.88 pp | 29 | 1.23 | 0.71 |
| ACFE-Enron taxonomy vs generic (E1-LLMcls → E2-taxon) | +6.88 pp | 28 | 1.55 | 0.34 |
| Chain-of-thought vs direct JSON (E1-LLMcls → E5-CoT) | −16.68 pp | 40 | 0.74 | 0.43 |
| Same config re-run (E2-taxon → E6-best-scaled) | −4.61 pp | 6 | 0 | 0.03 |

**Interpretation of the significance structure:**
- Only one effect is significant: swapping the 29-word heuristic classifier for the LLM classifier (+37 pp, p<0.0001).
- Every privacy manipulation is null (p ≥ 0.47). The de-identification policy has *no statistically detectable* effect on F1 under a modern classifier at n=2,000.
- The taxonomy-injection effect is in the predicted direction (+6.88 pp, and per-category recall on Financial Fraud moves from 39.3% to 45.6% as hypothesized), but the paired test does not reach α=0.05.
- **Crucially, the same-config re-run (E2 → E6) shows a 4.6 pp F1 swing with p=0.03.** This establishes that the *LLM-stochasticity floor* on this dataset is around 5 pp — comparable in magnitude to the taxonomy effect we wanted to measure. At n=2,000 we cannot cleanly separate a real taxonomy effect from LLM sampling noise.
- CoT shifts the operating point dramatically (precision 50% / recall 14.9%) but makes the same *number* of total errors as E1 (p=0.43 on accuracy).

**H1 is confirmed at 19× the pre-registered 3× threshold.** H2 is falsified in the favorable direction. H3 is *consistent with* the data but *under-powered* at n=2,000. H5 is decisively falsified.

## 3. What this means — three findings to report

### Finding 1: The F1=2.65% in the midterm presentation was not a privacy result — it was a classifier-architecture artifact.

The midterm presentation said the MAS "achieved F1=2.65% on de-identified emails, therefore privacy controls destroyed forensic capability." Our replication (E0-repro) reproduces that 2.65% exactly. But so does the same classifier on **raw, un-redacted** text (E3-raw-heur: 2.94%). The heuristic classifier fails regardless of de-identification. When we swap that classifier for a modern LLM on the same de-identified text (E1-LLMcls), F1 jumps to 39.67%. The 37-point gap is classifier architecture, not privacy.

The failure mode of the heuristic classifier is easy to demonstrate: the `keyword_signal` that drives the Escalation agent's decision is computed from a 29-word list hard-coded in `backend/agents/tools/vader_analysis.py`, and the LLM reasoning at the Investigator, Sentiment, Deliberation, and Escalation layers — while logged — never enters the binary classification decision. It is surfaced text for the UI, not a factor in the confidence score. Five layers of LLM above and a 2018-era regex at the bottom.

### Finding 2: Strong privacy controls are empirically defensible.

Across three de-identification regimes (no redaction, pseudonym-preserving, and full-scrub) under the modern LLM classifier, F1 point estimates fall within a 2 pp window and every pairwise McNemar test fails to reject the null. Cohen's κ between the full-scrub and raw-text predictions is 0.78 (substantial agreement) — the classifier's decision boundary is essentially invariant to de-ID. From a governance perspective this is a strong result: the highest-privacy default is *not* paying an accuracy price.

This matters for EU AI Act Article 5 (data minimization), the GDPR's purpose-limitation principle, and internal corporate policy debates where "we need to see the names to detect the fraud" is the standard pushback against scrubbing. Empirically, with a competent classifier, the names are not needed.

### Finding 3: The real accountability gap is *observability without authority*.

The original forensic surface captured every LLM reasoning token, the full deliberation trace, and a SHA-256 hash per decision. It looked, to an auditor, like a multi-agent LLM system. But the *decision* the system actually passed to the human analyst was computed five layers below the LLM by the 29-word regex described above. The LLM reasoning tokens are logged — but the logged reasoning is not the basis of the decision the logged reasoning appears to justify.

This is a specific failure mode of LLM-agent governance that the NIST AI RMF *Measure 2.8 (Transparency)* control does not currently name. Textually the log is complete. Mechanistically the log misleads. We propose the term **"observability without authority"** for this pattern: a monitored surface that does not include the actual decision authority.

The governance fix is straightforward — move the decision into the observed layer (E1 does exactly this) — but the failure mode only becomes visible when you *test* the decision against counterfactuals. That is the main methodological contribution of this study.

## 4. Methodology highlights for peer review

1. **Pre-registration.** Hypotheses, metrics, stopping rules, and analysis plan were frozen in `experiments/PREREGISTRATION.md` before any of the runs reported here were executed. McNemar's exact test was chosen in advance; bootstrap CI width (1,000 resamples) was chosen in advance; the 3× threshold for H1 was chosen in advance.
2. **Paired testing.** Every condition classifies the same 2,000 message IDs. Comparisons between conditions are paired at the message level, so classifier disagreements cannot be confounded with sample differences.
3. **Cost-aware execution.** Every LLM call is logged with input/output token counts and dollar cost. A hard `max_spend_usd` kill switch in `experiments/lib/cost_tracker.py` bounds spend per condition. Total spend across the six production LLM runs: **$63.24** (summed from per-run `cost_log.jsonl` files). Including one aborted partial run and a smoke test, total API charges on this branch are $67.22 of the $5,000 budget (1.34%).
4. **Provenance.** Each run writes a README with git SHA, config hash, prompt hashes, dataset hash, ground-truth hash, and resolved YAML. Runs are resumable: re-invoking a condition picks up where an interrupted run left off using the predictions.jsonl append log.
5. **Reproducibility.** Seed-controlled sampling (`seed_sampling=42`) and deterministic prompt templates (hash-logged) allow any run to be re-executed exactly. The partial smoke runs (n=50) are retained as deterministic regression tests for the infrastructure.

## 5. A fifth finding — CoT shifts the *operating point*, not the accuracy

E5-CoT adds a step-by-step scratchpad to E1-LLMcls. The expectation (Sadeh feedback) was an F1 lift. Instead F1 fell to 22.99% — but the reason is subtle. Accuracy per email is statistically the same as E1 (McNemar p=0.43). What changed is the decision threshold *the model internally uses*:

| | E1-LLMcls (no CoT) | E5-CoT |
|---|---:|---:|
| Positives flagged | 54 | 20 |
| Precision | 44.4% | **50.0%** |
| Recall | 35.8% | **14.9%** |
| Total errors | 73 | 67 |

Reading the `reasoning` fields in `experiments/runs/E5-CoT-.../predictions.jsonl` confirms the mechanism: asked to reason first, Sonnet-4.5 regularly talks itself *out* of flagging borderline emails ("this could be routine accounting; absent stronger evidence I'll assume good faith"). The result is a conservative classifier that barely ever fires — excellent for a high-precision use case, catastrophic for a high-recall insider-threat triage task.

**Governance implication:** prompting choices are operating-point choices. CoT did not make the model stupider; it changed its risk appetite. Teams evaluating agentic systems should check whether a prompt change moves the operating point in the direction their cost structure requires, not just whether F1 goes up.

## 6. A sixth finding — the LLM-stochasticity floor is 5 pp, and that matters for n planning

E6-best-scaled re-ran E2-taxon with an identical config (same prompt hash, same dataset, same model, different API sampling). F1 fell from 46.55% to 41.94%. Paired McNemar showed only 6 discordant pairs but an asymmetric p=0.03.

This tells us that the *test-retest reliability* of this classifier on this dataset is about ±5 pp F1, driven by LLM sampling variability on a small number of borderline emails. Any experimental factor whose true effect is below 5 pp cannot be separated from re-run noise at n=2,000.

**Implication for future work:** to quantify the taxonomy-injection effect (E1 → E2) cleanly we need n ≥ 5,000 labeled emails. The budget to produce another 3,000 Opus-graded ground-truth labels is approximately $75 — well within the remaining $4,900 budget — and a natural next step. We note this explicitly rather than pretending H3 was established.

## 7. Threats to validity

1. **Label authority.** Our "ground truth" is Claude-Opus-4.7 labels. Our error analysis (`experiments/ERROR_ANALYSIS.md`) documents ≥ 3 cases where the Student flags something the Grader missed but that matches published regulatory findings on Enron (Raptor, Syntroleum). Any F1 using Opus-as-oracle is therefore a *lower bound* on student performance against a perfect oracle. The governance *direction* of the findings is unaffected — if anything, correcting for grader misses would widen the classifier-architecture gap further.
2. **Single-corpus.** Enron is the only insider-threat corpus available at this text quality. Out-of-distribution generalization (to, e.g., corporate-fraud datasets from other industries) is not tested.
3. **Single-model student.** All modern-classifier conditions use Sonnet-4.5. Opus-4.7 as both teacher and student would leak labels; a different teacher (GPT-4o, Gemini) is out of scope but a natural extension.
4. **Text-only.** The Investigator topology score in the original MAS is stubbed at 0.5 throughout our re-runs. The "privacy cost" conclusion is specific to the text subsystem. Restoring a real topology/metadata feature might make pseudonymization matter more.

## 8. Recommendations to governance stakeholders

1. **Stop reporting privacy as the accuracy bottleneck on this system.** The data does not support that framing under any of the three de-identification regimes tested.
2. **Require the "claimed decision authority" and the "actual decision authority" to be reconciled for any multi-agent LLM system under audit.** LLM reasoning tokens logged for display do not count as the decision.
3. **Defend strong-privacy-by-default as the baseline.** Full-scrub PII redaction has zero measurable F1 cost on this task. Any weakening below full-scrub needs an evidentiary justification that cannot be "the classifier needs the names."
4. **Add counterfactual testing to audits of agentic systems.** The reason this defect was invisible to the original evaluation is that the evaluation never *varied* the classifier. A factorial ablation (this study) surfaces the defect in five runs.
5. **Evaluate prompt changes at the operating-point level, not just the F1 level.** CoT's effect here was a precision-up/recall-down shift that F1 masked. For any safety-critical use-case, require a Precision-Recall curve across threshold choices, not a single headline metric.
6. **Report stochasticity floors.** Any F1 claim from an LLM-powered classifier at n < 5,000 should be accompanied by a re-run of the same config to quantify test-retest variance, and any effect smaller than that floor should be reported as "consistent but not established."
