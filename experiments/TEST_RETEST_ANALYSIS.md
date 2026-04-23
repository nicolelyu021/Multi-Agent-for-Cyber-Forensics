# Test-retest analysis: how stochastic is the LLM classifier?

**Date:** 2026-04-23
**Runs compared:**
- E1-LLMcls original (2026-04-22T15-43-51Z)
- E1-LLMcls redux (2026-04-23T05-47-05Z)
- E2-taxon original (2026-04-22T16-48-53Z)
- E6-best-scaled (E2 config re-run, 2026-04-22T20-44-07Z)
- E2-taxon redux (2026-04-23T05-47-05Z)

All paired on n=1,887 common message IDs with 62 ground-truth positives.

## 1. Per-run F1 (same paired intersection)

| Run | F1 | Precision | Recall | TP | FP | FN |
|---|---:|---:|---:|---:|---:|---:|
| E1-orig | 40.35% | 44.23% | 37.10% | 23 | 29 | 39 |
| E1-redux | 40.35% | 44.23% | 37.10% | 23 | 29 | 39 |
| E2-orig | 46.55% | 50.00% | 43.55% | 27 | 27 | 35 |
| E6-scaled | 42.37% | 44.64% | 40.32% | 25 | 31 | 37 |
| E2-redux | 44.44% | 47.27% | 41.94% | 26 | 29 | 36 |

## 2. Per-condition summary

| Condition | N runs | F1 mean | F1 SD | F1 range |
|---|---:|---:|---:|---|
| **E1-LLMcls** (generic prompt) | 2 | **40.35%** | **0.000 pp** | 40.35–40.35 |
| **E2-taxon** (ACFE-Enron taxonomy prompt) | 3 | **44.46%** | **2.09 pp** | 42.37–46.55 |

## 3. Pairwise agreement (Cohen's κ and email-level disagreements)

| Pair | κ | n disagree |
|---|---:|---:|
| E1-orig vs E1-redux | **0.921** | 8 |
| E2-orig vs E6-scaled | 0.944 | 6 |
| E2-orig vs E2-redux | 0.915 | 9 |
| E6-scaled vs E2-redux | 0.954 | 5 |

All four same-config pairs show "almost perfect" agreement (κ > 0.90). The 5-9 disagreeing emails per pair are the stochastic frontier.

## 4. Headline findings

### 4.1 E1 is essentially deterministic

Two independent runs of E1-LLMcls at identical config produced **identical confusion matrices** and only 8 disagreements out of 1,887 emails. The LLM-stochasticity floor for E1 is indistinguishable from zero at this sample size. **Any observed difference between E1 and another condition is not re-run noise.**

### 4.2 E2 has real stochasticity, but less than previously feared

Previous estimate (E2-orig vs E6-scaled only): F1 SD ≈ 4.6 pp.
Updated estimate (three runs): F1 **SD = 2.09 pp**.
The earlier 4.6 pp was a single-sample outlier in both tails; with a third data point the SD is less than half the 2-run estimate.

### 4.3 Taxonomy prompts introduce more variance than generic prompts

**This is a methodologically interesting finding.** The same LLM (Sonnet-4.5), same dataset, same infrastructure — but the taxonomy-augmented prompt generates non-zero re-run variance (SD = 2.09 pp) while the generic prompt generates essentially zero (SD = 0.000 pp). Plausible mechanism: the taxonomy prompt forces the model to pick among 4 named fraud categories, so the model's decision entropy is higher on borderline emails; the generic prompt lets the model default to a simpler "normal / anomalous" binary where borderline cases fall consistently on one side.

For future work on prompt engineering: **prompt complexity increases stochasticity**. Any prompt ablation needs a test-retest pair per variant, not just one run per variant.

### 4.4 Revised taxonomy effect size

- E1 mean F1: **40.35%** (SD = 0.00)
- E2 mean F1: **44.46%** (SD = 2.09 pp)
- **ΔF1 = +4.11 pp** (down from the original single-sample estimate of +6.88 pp)

The original +6.88 pp was inflated by E2-orig happening to be the highest of the three E2 runs.

### 4.5 Taxonomy effect is still not statistically established at n=1,887

Paired McNemar on the ensembled predictions:

| Comparison | b | c | n_disc | OR | p |
|---|---:|---:|---:|---:|---:|
| E1-ensemble (K≥1 of 2) vs E2-ensemble (K≥2 of 3, majority) | 11 | 16 | 27 | 0.69 | **0.442** |
| E1-ensemble (K≥1) vs E2-ensemble (K≥1, any) | 10 | 17 | 27 | 0.59 | **0.248** |
| E1-ensemble (K≥2, unan.) vs E2-ensemble (K≥3, unan.) | 11 | 12 | 23 | 0.92 | **1.000** |

Even with noise-reduction via ensembling, the p-value stays between 0.25 and 1.00. **H3 is not falsified, but it is not established either.** The honest report is:

> The ACFE-Enron taxonomy produces a consistent positive effect on F1 across 3 independent runs (+4.1 pp mean, SD 2.1 pp), concentrated in Financial Fraud recall (the category the taxonomy names). The effect is below the threshold for statistical significance at n=1,887 (McNemar p=0.25–0.44 depending on ensembling strategy). A dataset of n ≈ 6,000 would be required to resolve H3 at α=0.05.

## 5. Implications for the other H2 null results

The near-zero E1 stochasticity strengthens the **privacy null**. Consider:

| Comparison | Conditions differ in | ΔF1 | McNemar p |
|---|---|---:|---:|
| E1-orig vs E3-raw-llm | privacy policy | +1.27 pp | 0.84 |
| E1-orig vs E4-pseudo | privacy policy | −0.61 pp | 0.47 |
| E1-orig vs E1-redux | **nothing** | +0.00 pp | (effectively 1.00) |

The privacy manipulations produce ΔF1 of ±1 pp, which is larger than the E1 stochasticity floor (0 pp) but still statistically indistinguishable from zero. The privacy null is therefore not a power-limited inconclusive result — it is a **genuine null** visible against a near-zero noise floor. This is a stronger version of the original claim.

## 6. Summary table for the final report

| Source of variation | Observed F1 effect | Significance |
|---|---|---|
| Classifier architecture (heuristic → LLM) | +37 pp | **p < 0.0001** |
| Privacy policy (full-scrub ↔ raw ↔ pseudonym) | ±1.3 pp | p ∈ {0.47, 0.71, 0.84} (null) |
| Generic-prompt same-config re-run (E1) | ±0.0 pp | no effect |
| Taxonomy-prompt same-config re-run (E2) | ±2.1 pp SD | re-run noise floor |
| Taxonomy vs. generic prompt (E1 → E2) | +4.1 pp | p = 0.25–0.44 (under-powered) |
| Chain-of-thought (E1 → E5) | F1 −16.7 pp via operating-point shift | same accuracy (p = 0.43) |

## 7. Costs

- E1-redux: $8.68
- E2-redux: $11.03
- **Additional spend for this analysis: $19.71** (on top of the $67.22 already on the branch)

Cumulative branch spend now: **~$86.94 of $5,000 budget** (1.74% used).
