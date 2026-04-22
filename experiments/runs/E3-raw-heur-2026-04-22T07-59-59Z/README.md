# Run `E3-raw-heur-2026-04-22T07-59-59Z` — E3-raw-heur

**Status:** completed  
**Classifier:** `heuristic`  
**De-ID:** `none`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 2000 paired (of 2000 requested)  
**Cost:** $0.00  
**Wall clock:** 5s  
**Git SHA:** `f7718c0622` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 2.94% (95% CI 0.00–7.50%)
- **Precision:** 2.90% (95% CI 0.00–7.58%)
- **Recall:** 2.99% (95% CI 0.00–7.94%)
- **Accuracy:** 93.40%
- **Cohen's κ:** -0.005

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=2 | FN=65 |
| **True: Clean** | FP=67 | TN=1866 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 0/2 = 0.0%
- **Financial Fraud:** 2/61 = 3.3%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E3-raw-heur
notes: "Control: apply the existing heuristic classifier to RAW text (no PII\nredaction).\
  \ Paired with E0-repro, this isolates the pure effect of\nde-identification under\
  \ the current classifier. If \u0394F1 is small,\nthe privacy narrative in the final\
  \ presentation is weaker than the\nclassifier-architecture narrative.\n"
classifier_variant: heuristic
deid_variant: none
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
