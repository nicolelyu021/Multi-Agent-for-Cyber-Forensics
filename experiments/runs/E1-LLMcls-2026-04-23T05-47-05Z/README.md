# Run `E1-LLMcls-2026-04-23T05-47-05Z` — E1-LLMcls

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `full_scrub`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 2000 paired (of 2000 requested)  
**Cost:** $8.68  
**Wall clock:** 1264s  
**Git SHA:** `713fd45fe3` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 39.67% (95% CI 28.04–50.00%)
- **Precision:** 44.44% (95% CI 30.43–57.41%)
- **Recall:** 35.82% (95% CI 24.56–47.14%)
- **Accuracy:** 96.35%
- **Cohen's κ:** 0.378

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=24 | FN=43 |
| **True: Clean** | FP=30 | TN=1903 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 2/2 = 100.0%
- **Financial Fraud:** 22/61 = 36.1%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E1-LLMcls
notes: "Swap the heuristic Sentiment classifier for an LLM-structured JSON\nclassifier.\
  \ All other factors held fixed at the published baseline:\nfull-scrub de-identification\
  \ and generic corporate policy. Per pre-\nregistered H1, we expect a large positive\
  \ \u0394F1 relative to E0-repro.\n"
classifier_variant: llm_json
deid_variant: full_scrub
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
