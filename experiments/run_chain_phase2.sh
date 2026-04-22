#!/bin/bash
# Phase-2 chain: run remaining ablations after E0/E1/E3-raw-heur/E3-raw-llm/E4-pseudo are done.
# Then run decide_scale + E6 confirmatory scaled run.
set -u
cd "$(dirname "$0")/.."
PY=backend/.venv/bin/python
LOG=experiments/runs/chain.log
mkdir -p experiments/runs
echo "=== Phase-2 chain started at $(date -u +%FT%TZ) ===" >> "$LOG"

CHAIN=(
  E2-taxon   # ACFE-Enron taxonomy in Student
  E5-CoT     # chain-of-thought ablation (Sadeh #1)
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

echo "$(date -u +%FT%TZ) Ablation chain complete. Running decide_scale." | tee -a "$LOG"
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
