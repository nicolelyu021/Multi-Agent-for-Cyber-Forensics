# Run `E6-best-scaled-2026-04-22T20-44-07Z` — E6-best-scaled

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `full_scrub`  
**Taxonomy:** `acfe_enron`  
**Model:** `claude-sonnet-4-5`  
**N:** 2000 paired (of 2000 requested)  
**Cost:** $11.00  
**Wall clock:** 1708s  
**Git SHA:** `d56818f489` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 41.94% (95% CI 30.36–53.06%)
- **Precision:** 45.61% (95% CI 32.20–59.42%)
- **Recall:** 38.81% (95% CI 27.45–50.72%)
- **Accuracy:** 96.40%
- **Cohen's κ:** 0.401

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=26 | FN=41 |
| **True: Clean** | FP=31 | TN=1902 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 2/2 = 100.0%
- **Financial Fraud:** 24/61 = 39.3%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E6-best-scaled
notes: 'Confirmatory scaled run at n=10000. Based on ablation chain winner (best F1
  CI lower bound): E2-taxon-2026-04-22T16-48-53Z. Config mirrors winner except for
  n_emails and budget.'
classifier_variant: llm_json
deid_variant: full_scrub
taxonomy_variant: acfe_enron
student_model: claude-sonnet-4-5
n_emails: 2000
max_spend_usd: 200.0
concurrency: 8
escalation_threshold: 0.7
dataset_path: data/evaluation_dataset.json
ground_truth_path: data/claude_opus_ground_truth_2000.json
seed_sampling: 42
```
