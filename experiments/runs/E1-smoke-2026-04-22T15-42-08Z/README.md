# Run `E1-smoke-2026-04-22T15-42-08Z` — E1-smoke

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `full_scrub`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 5 paired (of 5 requested)  
**Cost:** $0.02  
**Wall clock:** 11s  
**Git SHA:** `36512d034e` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 0.00% (95% CI 0.00–0.00%)
- **Precision:** 0.00% (95% CI 0.00–0.00%)
- **Recall:** 0.00% (95% CI 0.00–0.00%)
- **Accuracy:** 100.00%
- **Cohen's κ:** 0.000

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=0 | FN=0 |
| **True: Clean** | FP=0 | TN=5 |

## Per-category recall (ground truth)


## Config

```yaml
condition_id: E1-smoke
notes: 5-email smoke test of the LLM classifier pipeline. Verifies API, schema parsing,
  and cost tracking.
classifier_variant: llm_json
deid_variant: full_scrub
taxonomy_variant: generic
student_model: claude-sonnet-4-5
n_emails: 5
max_spend_usd: 1.0
concurrency: 3
escalation_threshold: 0.7
dataset_path: data/evaluation_dataset.json
ground_truth_path: data/claude_opus_ground_truth_2000.json
seed_sampling: 42
```
