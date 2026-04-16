# LLM Migration: Switching to Claude Opus 4.7

## Objective
Migrate the entire Multi-Agent System (MAS) and the Ground Truth Generator from OpenAI's GPT-4o to Anthropic's new **Claude Opus 4.7** model. This structural change guarantees both the Student (the MAS) and the Grader (the GT Generator) evaluate the Enron corpus using the exact same reasoning engine. This eliminates grading bias that could artificially deflate your F1-Score metrics.

## User Action Required
For this migration to work, your system must authenticate directly with Anthropic:
1. Locate your project's `.env` file at the root directory.
2. Add your direct Anthropic API Key (`sk-ant-...`) as a new variable:
   `ANTHROPIC_API_KEY=sk-ant-api03...`

## Proposed Changes

### 1. Dependency Layer
We must update the environment to support native Anthropic libraries.
**Target File**: `backend/pyproject.toml`
- Add `langchain-anthropic>=0.1.0`
- Add `anthropic>=0.21.0`

### 2. Configuration Layer
**Target File**: `backend/config.py`
- Surface `anthropic_api_key` in the `Settings` class so the application can dynamically load it.
- Change the target model name to `claude-opus-4-7`.

### 3. MAS Agents (The Student)
We will swap out `ChatOpenAI` for `ChatAnthropic` across the entire LangGraph architecture so the agents natively utilize Claude:
- `backend/agents/investigator.py`
- `backend/agents/sentiment.py`
- `backend/agents/deliberation.py`
- `backend/agents/escalation.py`

### 4. The Grader 
**Target File**: `data/scripts/generate_ground_truth.py`
- Swap the `AsyncOpenAI` client for `anthropic.AsyncAnthropic()`.
- Refactor the `grade_email()` function to properly inject the system prompts and enforce JSON-mode outputs following Claude's API specifications.
- Set the target model to `claude-opus-4-7`.

## Verification Plan
1. Automatically run the pip installation for the new Anthropic packages.
2. Run a test execution of `python3 data/scripts/generate_ground_truth.py` to confirm the Claude Opus 4.7 API successfully connects, classifies emails, and formats its output as parsable JSON without hitting limits.
3. Once the test succeeds, execute the entire 2,000 email dataset.

## Architectural Limitations & Design Choices (Learning Document)
During the implementation of this migration, we encountered a critical design decision regarding **Scientific Reproducibility vs. Model Parity**.

**The Problem:**
Initially, the Ground Truth (Grader) was designed to use OpenAI's GPT-4o with strict deterministic parameters (`temperature=0.0` and `seed=42`). However, when migrating the Grader to Anthropic's Claude Opus 4.7 to achieve *Model Parity* (having the Grader and the Student use the exact same reasoning architecture to avoid bias), we discovered that Anthropic's API fundamentally does not support the `seed` parameter, and explicitly deprecates the `temperature` parameter for newer reasoning models.

**The Solution (Option B Over Option A):**
We chose to proceed with Claude Opus 4.7 and accept the API limitation rather than reverting the Grader to GPT-4o. 
1. **Bias Mitigation:** Eliminating cross-model grading bias (GPT down-grading Claude for stylistic differences) is theoretically more important than achieving identical bit-for-bit generation.
2. **Fixed Benchmark Strategy:** To solve the reproducibility limitation, the system is designed to generate the Ground Truth labels exactly once. The generated `ground_truth_labels.json` file serves as the permanent, static benchmark for the project. By caching the generator's state during generation (saving chunks incrementally), we guarantee the dataset remains stable for all future F1-Score calculations without ever needing to invoke the non-deterministic LLM again.
