# Run `E1-LLMcls-2026-04-22T15-42-29Z` — E1-LLMcls

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `full_scrub`  
**Taxonomy:** `generic`  
**Model:** `claude-sonnet-4-5`  
**N:** 925 paired (of 2000 requested)  
**Cost:** $8.67  
**Wall clock:** 1225s  
**Git SHA:** `36512d034e` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 48.42% (95% CI 34.88–59.46%)
- **Precision:** 79.31% (95% CI 64.00–93.55%)
- **Recall:** 34.85% (95% CI 23.29–46.03%)
- **Accuracy:** 94.70%
- **Cohen's κ:** 0.461

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=23 | FN=43 |
| **True: Clean** | FP=6 | TN=853 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 2/2 = 100.0%
- **Financial Fraud:** 21/61 = 34.4%
- **Inappropriate Relations:** 0/1 = 0.0%

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
