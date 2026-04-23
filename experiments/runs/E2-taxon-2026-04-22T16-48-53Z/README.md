# Run `E2-taxon-2026-04-22T16-48-53Z` — E2-taxon

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `full_scrub`  
**Taxonomy:** `acfe_enron`  
**Model:** `claude-sonnet-4-5`  
**N:** 1887 paired (of 2000 requested)  
**Cost:** $10.38  
**Wall clock:** 2694s  
**Git SHA:** `41fb13f3b7` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 46.55% (95% CI 34.19–56.92%)
- **Precision:** 50.00% (95% CI 35.85–63.33%)
- **Recall:** 43.55% (95% CI 30.95–54.69%)
- **Accuracy:** 96.71%
- **Cohen's κ:** 0.449

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=27 | FN=35 |
| **True: Clean** | FP=27 | TN=1798 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 1/1 = 100.0%
- **Financial Fraud:** 26/57 = 45.6%
- **Inappropriate Relations:** 0/2 = 0.0%

## Config

```yaml
condition_id: E2-taxon
notes: 'Taxonomy asymmetry correction: give the Student the ACFE-Enron

  taxonomy that the Grader used. Full-scrub de-ID, LLM classifier.

  Paired with E1-LLMcls, this isolates the prompt-asymmetry effect.

  '
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
