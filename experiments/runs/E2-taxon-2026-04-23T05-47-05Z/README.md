# Run `E2-taxon-2026-04-23T05-47-05Z` — E2-taxon

**Status:** completed  
**Classifier:** `llm_json`  
**De-ID:** `full_scrub`  
**Taxonomy:** `acfe_enron`  
**Model:** `claude-sonnet-4-5`  
**N:** 2000 paired (of 2000 requested)  
**Cost:** $11.03  
**Wall clock:** 1904s  
**Git SHA:** `713fd45fe3` on `experiment`  

## Metrics (with 95% bootstrap CI)

- **F1:** 43.90% (95% CI 32.32–54.55%)
- **Precision:** 48.21% (95% CI 34.04–61.40%)
- **Recall:** 40.30% (95% CI 28.79–51.79%)
- **Accuracy:** 96.55%
- **Cohen's κ:** 0.421

## Confusion matrix

| | Pred: Threat | Pred: Clean |
|---|---|---|
| **True: Threat** | TP=27 | FN=40 |
| **True: Clean** | FP=29 | TN=1904 |

## Per-category recall (ground truth)

- **Corruption:** 0/2 = 0.0%
- **Data Deletion:** 2/2 = 100.0%
- **Financial Fraud:** 25/61 = 41.0%
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
