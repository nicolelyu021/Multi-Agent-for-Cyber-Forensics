# Run `E4-pseudo-2026-04-22T16-24-16Z` — E4-pseudo

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `pseudonym`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 2000 paired (of 2000 requested)  
**Cost:** $8.64  
**Wall clock:** 1217s  
**Git SHA:** `3ceaf70e5e` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 39.06% (95% CI 27.59–49.23%)
- **Precision:** 40.98% (95% CI 28.21–53.85%)
- **Recall:** 37.31% (95% CI 26.03–48.65%)
- **Accuracy:** 96.10%
- **Cohen's κ:** 0.371

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=25 | FN=42 |
| **True: Clean** | FP=36 | TN=1897 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 2/2 = 100.0%
- **Financial Fraud:** 23/61 = 37.7%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E4-pseudo
notes: 'Pseudonym-preserving de-identification (VP_Finance_1 style) with

  LLM classifier and generic policy. Paired with E1-LLMcls (full scrub)

  and E3-raw-llm (no redaction), this isolates the effect of preserving

  role information even while removing identity. Per H3, expected to

  be significantly better than full scrub.

  '
classifier_variant: llm_json
deid_variant: pseudonym
taxonomy_variant: generic
student_model: claude-sonnet-4-5
n_emails: 2000
max_spend_usd: 150.0
concurrency: 8
escalation_threshold: 0.7
dataset_path: data/evaluation_dataset.json
ground_truth_path: data/claude_opus_ground_truth_2000.json
seed_sampling: 42
```
