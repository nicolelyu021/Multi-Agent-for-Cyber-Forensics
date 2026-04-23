#!/usr/bin/env python3
"""Offline ensemble analysis across modern-classifier runs.

Rationale:
  Our same-config re-run test (E2 -> E6) shows ~5 pp F1 swing due to LLM
  sampling noise. An ensemble across multiple modern-classifier runs
  should reduce that noise and give a cleaner estimate of "what the
  classifier can do" at this dataset size.

Aggregation rules tried:
  - majority_vote: email is a threat if >= K of N runs flag it.
  - mean_prob: email is a threat if mean confidence >= threshold.

We also compute pairwise agreement (Cohen's kappa) across runs to
document how much independent information each run adds.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "lib"))

from stats import bootstrap_ci, cohen_kappa, confusion  # noqa: E402

# The modern-classifier runs under full-scrub-or-equivalent de-ID.
# We deliberately include conditions with different de-ID policies --
# the privacy null result established that full-scrub / raw / pseudonym
# are statistically equivalent, so they can be treated as re-runs for
# ensembling purposes.
RUNS = [
    ("E1-LLMcls",        "E1-LLMcls-2026-04-22T15-43-51Z"),
    ("E3-raw-llm",       "E3-raw-llm-2026-04-22T16-04-26Z"),
    ("E4-pseudo",        "E4-pseudo-2026-04-22T16-24-16Z"),
    ("E2-taxon",         "E2-taxon-2026-04-22T16-48-53Z"),
    ("E6-best-scaled",   "E6-best-scaled-2026-04-22T20-44-07Z"),
]
# Intentionally excluded: E5-CoT (different operating point), E0/E3-raw-heur (heuristic).

GT_PATH = ROOT.parent / "data/claude_opus_ground_truth_2000.json"


def load_gt() -> dict:
    return {x["message_id"]: bool(x["is_anomalous"]) for x in json.loads(GT_PATH.read_text())}


def load_preds(run_dir: str) -> dict:
    p = ROOT / "runs" / run_dir / "predictions.jsonl"
    out = {}
    for line in p.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        out[r["message_id"]] = {
            "pred": bool(r.get("is_anomalous_pred")),
            "prob": float(r.get("confidence") or 0.0),
        }
    return out


def evaluate(y_true: list[bool], y_pred: list[bool]):
    return confusion(y_true, y_pred)


def main() -> None:
    gt = load_gt()
    runs = {name: load_preds(rd) for name, rd in RUNS}

    # intersection of message_ids where every run has a prediction
    common = set(gt.keys())
    for name, preds in runs.items():
        common &= set(preds.keys())
    ids = sorted(common)
    print(f"ensemble: {len(ids)} paired message_ids across {len(runs)} runs")
    print(f"ground-truth positives in intersection: {sum(gt[m] for m in ids)}")

    # Individual F1s, restricted to the intersection set
    print("\n## Individual run F1 (on intersection set)\n")
    print(f"{'Run':<18} {'F1':>7} {'Precision':>9} {'Recall':>8} {'TP':>4} {'FP':>4} {'FN':>4}")
    for name, preds in runs.items():
        yt = [gt[m] for m in ids]
        yp = [preds[m]["pred"] for m in ids]
        cm = evaluate(yt, yp)
        print(f"{name:<18} {cm.f1*100:>6.2f}% {cm.precision*100:>8.2f}% {cm.recall*100:>7.2f}% {cm.tp:>4d} {cm.fp:>4d} {cm.fn:>4d}")

    # Pairwise Cohen kappa across runs
    names = list(runs.keys())
    print("\n## Pairwise Cohen kappa (on predictions, not against GT)\n")
    print(f"{'':<18} " + " ".join(f"{n:<14}" for n in names))
    for a in names:
        row = [f"{a:<18}"]
        for b in names:
            if a == b:
                row.append(f"{'--':<14}")
            else:
                ya = [runs[a][m]["pred"] for m in ids]
                yb = [runs[b][m]["pred"] for m in ids]
                k = cohen_kappa(ya, yb)
                row.append(f"{k:<14.3f}")
        print(" ".join(row))

    # Majority vote ensembles
    print("\n## Ensemble: majority vote (K of 5)\n")
    print(f"{'K-threshold':<14} {'F1':>7} {'CI_lo':>7} {'CI_hi':>7} {'Precision':>9} {'Recall':>8} {'TP':>4} {'FP':>4} {'FN':>4}")
    for K in range(1, 6):
        yt = [gt[m] for m in ids]
        yp = [sum(runs[n][m]["pred"] for n in names) >= K for m in ids]
        cm = evaluate(yt, yp)
        ci = bootstrap_ci(yt, yp, metric="f1", n_resamples=500, alpha=0.05, seed=42)
        print(f"K>={K:<12d} {cm.f1*100:>6.2f}% {ci['ci_low']*100:>6.2f}% {ci['ci_high']*100:>6.2f}% {cm.precision*100:>8.2f}% {cm.recall*100:>7.2f}% {cm.tp:>4d} {cm.fp:>4d} {cm.fn:>4d}")

    # Mean-probability ensemble
    print("\n## Ensemble: mean probability across 5 runs (threshold sweep)\n")
    print(f"{'threshold':<12} {'F1':>7} {'CI_lo':>7} {'CI_hi':>7} {'Precision':>9} {'Recall':>8} {'TP':>4} {'FP':>4} {'FN':>4}")
    for thr in [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]:
        yt = [gt[m] for m in ids]
        yp = [mean(runs[n][m]["prob"] for n in names) >= thr for m in ids]
        cm = evaluate(yt, yp)
        ci = bootstrap_ci(yt, yp, metric="f1", n_resamples=500, alpha=0.05, seed=42)
        print(f"{thr:<12.2f} {cm.f1*100:>6.2f}% {ci['ci_low']*100:>6.2f}% {ci['ci_high']*100:>6.2f}% {cm.precision*100:>8.2f}% {cm.recall*100:>7.2f}% {cm.tp:>4d} {cm.fp:>4d} {cm.fn:>4d}")


if __name__ == "__main__":
    main()
