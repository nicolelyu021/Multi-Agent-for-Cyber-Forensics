# Run `E0-repro-2026-04-22T07-59-36Z` — E0-repro

**Status:** completed  
**Classifier:** `heuristic`  
**De-ID:** `full_scrub`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 2000 paired (of 2000 requested)  
**Cost:** $0.00  
**Wall clock:** 4s  
**Git SHA:** `f7718c0622` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 2.65% (95% CI 0.00–6.78%)
- **Precision:** 2.38% (95% CI 0.00–6.25%)
- **Recall:** 2.99% (95% CI 0.00–7.94%)
- **Accuracy:** 92.65%
- **Cohen's κ:** -0.011

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=2 | FN=65 |
| **True: Clean** | FP=82 | TN=1851 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 0/2 = 0.0%
- **Financial Fraud:** 2/61 = 3.3%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E0-repro
notes: 'Reproduce the published baseline F1=2.65%. Heuristic classifier on

  full-scrub de-identified text with generic corporate policy. Under

  this condition there are no LLM calls (heuristic is deterministic),

  so cost is effectively $0 and results should match the published

  number within bootstrap CI.

  '
classifier_variant: heuristic
deid_variant: full_scrub
taxonomy_variant: generic
student_model: claude-sonnet-4-5
n_emails: 2000
max_spend_usd: 1.0
concurrency: 16
escalation_threshold: 0.7
dataset_path: data/evaluation_dataset.json
ground_truth_path: data/claude_opus_ground_truth_2000.json
seed_sampling: 42
```
