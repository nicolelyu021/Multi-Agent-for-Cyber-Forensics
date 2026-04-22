#!/bin/bash
# Sequential runner for tonight's ablation chain.
#
# Runs each config in order, stopping if any single run fails. Prints a
# timeline summary at the end and updates `experiments/analysis/latest_chain.log`.
#
# Usage:
#   bash experiments/run_chain.sh
#
# Designed to be nohup-able:
#   nohup bash experiments/run_chain.sh > experiments/runs/chain.log 2>&1 &
set -u
cd "$(dirname "$0")/.."
PY=backend/.venv/bin/python
LOG=experiments/runs/chain.log
mkdir -p experiments/runs
echo "=== Chain started at $(date -u +%FT%TZ) ===" >> "$LOG"

# Priority chain: runs that answer our hypotheses best per dollar.
# Already run before launch: E0-repro, E3-raw-heur.
CHAIN=(
  E3-raw-llm   # pairs with E1-LLMcls to isolate pure privacy cost under LLM classifier
  E4-pseudo    # pseudonym-preserving de-ID
  E2-taxon     # ACFE-Enron taxonomy in Student
  E5-CoT       # chain-of-thought ablation (Sadeh #1)
)

for cond in "${CHAIN[@]}"; do
  CFG="experiments/configs/${cond}.yaml"
  if [[ ! -f "$CFG" ]]; then
    echo "$(date -u +%FT%TZ) SKIP: $cond (no config)" | tee -a "$LOG"
    continue
  fi
  echo "$(date -u +%FT%TZ) START: $cond" | tee -a "$LOG"
  if ! "$PY" -u experiments/run_condition.py "$CFG" >> "$LOG" 2>&1; then
    echo "$(date -u +%FT%TZ) FAIL: $cond -- see $LOG" | tee -a "$LOG"
    exit 2
  fi
  echo "$(date -u +%FT%TZ) DONE:  $cond" | tee -a "$LOG"
done

echo "$(date -u +%FT%TZ) Chain complete" | tee -a "$LOG"

# ---------- auto-scale the winner ----------
echo "$(date -u +%FT%TZ) Running decide_scale.py" | tee -a "$LOG"
"$PY" -u experiments/decide_scale.py >> "$LOG" 2>&1 || true

SCALED_CFG=experiments/configs/E6-best-scaled.yaml
if [[ -f "$SCALED_CFG" ]] && grep -q condition_id "$SCALED_CFG"; then
  echo "$(date -u +%FT%TZ) START: E6-best-scaled (10K confirmatory)" | tee -a "$LOG"
  if ! "$PY" -u experiments/run_condition.py "$SCALED_CFG" >> "$LOG" 2>&1; then
    echo "$(date -u +%FT%TZ) FAIL: E6-best-scaled -- see $LOG" | tee -a "$LOG"
    exit 3
  fi
  echo "$(date -u +%FT%TZ) DONE:  E6-best-scaled" | tee -a "$LOG"
else
  echo "$(date -u +%FT%TZ) SKIP: E6 (no winner config emitted)" | tee -a "$LOG"
fi

echo "$(date -u +%FT%TZ) All done" | tee -a "$LOG"
