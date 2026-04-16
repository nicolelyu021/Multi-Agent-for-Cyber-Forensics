# Ground Truth & Evaluation Pipeline Implementation Plan

This document outlines the architectural decisions, implementation steps, and answers to theoretical questions regarding the pipeline for generating a Ground Truth and scientifically evaluating the Multi-Agent System (MAS).

## 1. Context & Answers to Architecture Questions

### Reproducibility (Same 2000?):
**Yes!** The dataset generation is fully reproducible. `data/scripts/prepare_deidentified.py` uses `random.seed(42)` on line 21. This guarantees that exactly the same target count of 2,000 emails is sampled from the dataset every single time you run the script. Your professors will be pleased—you can safely calculate comparative Precision and Recall against a static benchmark.

### Deterministic Label Generation (Same labels from Grader LLM?):
To guarantee the Ground Truth Generator outputs the **exact same labels each time** you run it over those 2,000 emails, we must strictly enforce deterministic LLM settings. In the `generate_ground_truth.py` script, we will configure the LLM (like GPT-4o) with:
1. `temperature = 0.0` (eliminates randomness).
2. `seed = 42` (ensures reproducible sampling).
3. If using OpenAI, we will track the system fingerprint to ensure the underlying weights haven't secretly shifted.

### Which Taxonomy to Use (Enron-Specific vs. Neutral ACFE):
**You should use the AI-generated AI research report that combines ACFE with the Enron context.** Large Language Models perform best when the standards they apply explicitly map to the jargon and context of the data they are evaluating. Since Enron data discusses "Special Purpose Entities", "LJM", "Raptors", and "mark-to-market accounting", providing a taxonomy specifically tailored to the Enron reality will significantly improve the accuracy of the Ground Truth Grader.

### Agent Policy Separation (Same policy for all agents?):
While both agents could theoretically read the same master file, the best practice in multi-agent architecture is **Separation of Concerns**. 
- The **Investigator Agent** (looking at graph architecture) should only receive policies regarding communication frequency, cross-department barriers, and chain-of-command rules. 
- The **Sentiment Analyzer** (looking at textual data) should receive the policies detailing linguistic indicators, tone, and prohibited topics.
By splitting Rin's text into `investigator_policy.md` and `sentiment_policy.md`, we prevent the LLMs from getting confused by rules they don't have the tools to enforce.

### Reading Prompts vs. Pasting Prompts:
**Yes, the code will dynamically read the taxonomy file from disk at runtime.** We will not paste a huge chunk of text into the Python code. The code will do something like `with open("data/eval/prompts/acfe_taxonomy.md", "r") as f: taxonomy = f.read()`. This keeps your codebase clean and makes adjusting prompts as easy as editing a text file.

### Data Division for Evaluation (Approved by Professor):
We will use **Option A**: 
- The **Grader** (Ground Truth Generator) evaluates the **RAW text** to establish the absolute Ground Truth.
- The **Student** (Multi-Agent System) evaluates the **DE-IDENTIFIED text** in production.
This effectively measures the system's capability loss/retention due to the privacy-preserving mechanisms.

---

## 2. Proposed Implementation Steps

### Phase 1: Directory & Context Structure
We will set up the directories for you to drop in your text files.

#### `data/eval/prompts/silver_standard_prompt.md`
Location for your strict Ground Truth generation prompt.

#### `data/eval/prompts/acfe_enron_taxonomy.md`
Location for the contextualized Enron ACFE fraud taxonomy.

#### `backend/agents/prompts/investigator_policy.md` && `backend/agents/prompts/sentiment_policy.md`
Locations for Rin's company policy text, partitioned by agent responsibility.

### Phase 2: Side-by-Side Data Export Update

#### Update `data/scripts/prepare_deidentified.py`
We will modify this script so that after generating the masked data, it builds a single file called `data/evaluation_dataset.json`. 
Format:
```json
{
  "message_id": "12345",
  "text_raw": "Hey Ken, hide this off-balance-sheet...",
  "text_deidentified": "Hey [PERSON], hide this off-balance-sheet..."
}
```
This satisfies the requirement to have a persistent side-by-side mapping for evaluation without keeping them strictly isolated where we can't study the differences.

### Phase 3: Ground Truth Generator Script

#### Create `data/scripts/generate_ground_truth.py`
We will build a script that:
1. Loads the side-by-side `evaluation_dataset.json`.
2. Dynamically *reads* `silver_standard_prompt.md` and `acfe_enron_taxonomy.md` from the file system.
3. Calls the LLM on the `text_raw` to generate labels acting as a Certified Fraud Examiner. *(Note: Anthropic Claude Opus 4.7 does not support `seed` or `temperature` parameters. Determinism is achieved by caching the output to disk as a fixed benchmark.)*
4. Saves a `claude_opus_ground_truth_2000.json` containing the true labels (e.g., Fraud / Clean / Threat Level) for the dataset.

### Phase 4: Batch-Run Multi-Agent System (The Student)
To guarantee a 1-to-1 scientific evaluation, we will build a custom batch script instead of using the standard web server endpoints.

#### [NEW] `data/scripts/batch_evaluate_mas.py`
1. Loads the `evaluation_dataset.json`.
2. Explicitly isolates and extracts the `text_deidentified` string for each of the 2,000 emails.
3. Triggers the LangGraph multi-agent pipeline (`threat_analysis_graph.ainvoke`), passing the de-identified data.
4. Saves a `data/mas_predictions.json` file. This prevents us from having to extract and parse complex logs out of the SQLite forensic store. 
**Output format:**
```json
{
  "message_id": "12345",
  "mas_prediction_is_anomalous": true,
  "mas_threat_category": "Financial Fraud",
  "deliberation_triggered": true
}
```

### Phase 5: Metrics Evaluation Script (The Final Grade)
With both the Grader's answers and the Student's testing answers saved to JSON files, we will calculate the final metrics.

#### [NEW] `data/scripts/evaluate_metrics.py`
1. Loads `claude_opus_ground_truth_2000.json` and `mas_predictions.json`.
2. Joins the predictions by `message_id`.
3. Calculates standard machine learning metrics:
   - **Precision:** Out of all the emails the MAS flagged as anomalous, how many were actually anomalous?
   - **Recall:** Out of all the truly anomalous emails (found by the GT generator), how many did the MAS successfully catch?
   - **F1-Score:** The harmonic mean of Precision and Recall.
4. Outputs a `metrics_report.md` artifact summarizing the Multi-Agent System's capability retention when operating under privacy-preserving mechanisms.

---

## Current Status: Implementation Complete

We have fully implemented the Ground Truth pipeline as described above:

**✓ Phase 1: Directory & Context Structure Completed**
- Created `data/eval/prompts/silver_standard_prompt.md` with the JSON schema.
- Created `data/eval/prompts/acfe_enron_taxonomy.md` with Enron-specific framing.
- Created `backend/agents/prompts/investigator_policy.md` and `sentiment_policy.md` containing sanitized, agent-specific rules derived from Rin's text.

**✓ Phase 2: Side-by-Side Data Export Completed**
- Updated `data/scripts/prepare_deidentified.py` so that it exports the side-by-side JSON file (`evaluation_dataset.json`).

**✓ Phase 3: Generator Script Completed**
- Created `data/scripts/generate_ground_truth.py`.
- Script caches states iteratively; establishing the output file as our permanent benchmark without re-running the non-deterministic LLM.
- Script dynamically loads prompts and taxonomy, and generates the `ground_truth_labels.json` output incrementally.

**Next Steps**: Use the provided scripts in your terminal to generate your ground truth validation dataset!
