# Run `E5-CoT-2026-04-22T17-33-48Z` — E5-CoT

**Status:** completed  
**Classifier:** `llm_json_cot`  
**De-ID:** `full_scrub`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 1991 paired (of 2000 requested)  
**Cost:** $16.04  
**Wall clock:** 11417s  
**Git SHA:** `d56818f489` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 22.99% (95% CI 10.81–35.16%)
- **Precision:** 50.00% (95% CI 27.27–72.22%)
- **Recall:** 14.93% (95% CI 6.76–24.05%)
- **Accuracy:** 96.63%
- **Cohen's κ:** 0.218

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=10 | FN=57 |
| **True: Clean** | FP=10 | TN=1914 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 0/2 = 0.0%
- **Financial Fraud:** 10/61 = 16.4%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E5-CoT
notes: 'Chain-of-thought ablation (Prof. Sadeh feedback #1). Full scrub +

  generic policy + LLM classifier with a two-phase CoT prompt.

  Paired with E1-LLMcls to isolate the CoT contribution.

  '
classifier_variant: llm_json_cot
deid_variant: full_scrub
taxonomy_variant: generic
student_model: claude-sonnet-4-5
n_emails: 2000
max_spend_usd: 250.0
concurrency: 6
escalation_threshold: 0.7
dataset_path: data/evaluation_dataset.json
ground_truth_path: data/claude_opus_ground_truth_2000.json
seed_sampling: 42
```
