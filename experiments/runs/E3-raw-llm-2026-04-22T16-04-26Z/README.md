# Run `E3-raw-llm-2026-04-22T16-04-26Z` — E3-raw-llm

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `none`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 2000 paired (of 2000 requested)  
**Cost:** $8.53  
**Wall clock:** 1165s  
**Git SHA:** `772f4962fa` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 40.94% (95% CI 28.83–50.75%)
- **Precision:** 43.33% (95% CI 30.30–56.14%)
- **Recall:** 38.81% (95% CI 27.27–50.00%)
- **Accuracy:** 96.25%
- **Cohen's κ:** 0.390

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=26 | FN=41 |
| **True: Clean** | FP=34 | TN=1899 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 2/2 = 100.0%
- **Financial Fraud:** 24/61 = 39.3%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E3-raw-llm
notes: 'Upper bound: LLM-structured JSON classifier on raw, un-redacted text.

  Paired with E1-LLMcls, this isolates the pure privacy cost under a

  modern classifier. Per pre-registered H2, privacy cost is non-zero

  but modest (< 10 F1 points).

  '
classifier_variant: llm_json
deid_variant: none
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
