# Experiments — Ablation study of the Multi-Agent Forensic System

This directory contains the scientific experiment scaffolding for the Mini 4
final-report analysis. If you're new to the project, read these three files
in order:

1. `PREREGISTRATION.md` — hypotheses, metrics, and stopping rules. Frozen
   before any run.
2. `EXPERIMENT_JOURNAL.md` — the living document, updated after every run.
   Newest-first narrative.
3. `configs/*.yaml` — one file per experimental condition.

## Quick start

```bash
# Activate the project virtualenv (has langchain-anthropic etc.)
source backend/venv/bin/activate

# Sanity check: heuristic pilot on 50 emails (no LLM spend)
python experiments/run_condition.py experiments/configs/E0-pilot.yaml

# Full reproduction of published baseline (also no LLM spend)
python experiments/run_condition.py experiments/configs/E0-repro.yaml

# The real ablation: swap heuristic for LLM classifier (Sonnet)
python experiments/run_condition.py experiments/configs/E1-LLMcls.yaml

# Compare runs pairwise
python experiments/analysis/compare_runs.py E0-repro-<timestamp> E1-LLMcls-<timestamp>
```

## Layout

```
experiments/
├── EXPERIMENT_JOURNAL.md   # living doc (newest first)
├── PREREGISTRATION.md      # frozen hypotheses
├── README.md               # this file
├── configs/                # one yaml per condition
├── lib/                    # pluggable components
│   ├── classifiers.py      # heuristic / llm_json / llm_json_cot variants
│   ├── deid.py             # none / pseudonym / full_scrub variants
│   ├── cost_tracker.py     # hard kill switch for LLM spend
│   ├── registry.py         # provenance & run manifests
│   └── stats.py            # bootstrap CI, McNemar, Cohen's kappa
├── runs/                   # one directory per completed run
│   ├── run_registry.jsonl  # append-only provenance log
│   └── <run_id>/
│       ├── predictions.jsonl
│       ├── metrics.json
│       ├── cost_log.jsonl
│       ├── README.md
│       └── FAILURE.md      # only on failure
├── analysis/
│   ├── compare_runs.py
│   └── latest_comparison.md
└── run_condition.py        # main entry point

```

## Design invariants

- **One knob per config.** Each YAML differs from its sibling by exactly
  one factor so that pairwise comparisons decompose cleanly.
- **Provenance is non-optional.** Runs refuse to start if git SHA, config
  hash, or dataset hash cannot be computed.
- **Cost cap is hard.** Every LLM call runs `tracker.guard_or_raise()`
  first; exceeding the cap aborts the run and writes an `interrupted`
  status to the registry.
- **Resumable.** Restarting the runner with the same config skips emails
  already in `predictions.jsonl`. Safe after any crash.
- **Append-only registry.** `run_registry.jsonl` is never rewritten —
  a completed run appends a second row with `status=completed`. The
  latest row per `run_id` wins.
