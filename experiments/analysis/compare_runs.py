#!/usr/bin/env python3
"""Compare two or more experimental runs, producing paired McNemar tests
and per-run metric tables.

Usage:
    python experiments/analysis/compare_runs.py RUN_A RUN_B [RUN_C ...]

Where each RUN_X is a directory under experiments/runs/ containing
predictions.jsonl and metrics.json.

Prints a markdown table of metrics and a pairwise McNemar matrix, and
writes the same content to experiments/analysis/latest_comparison.md.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from experiments.lib.stats import mcnemar_exact, bootstrap_ci


def load_run(run_dir: Path) -> dict:
    preds_path = run_dir / "predictions.jsonl"
    preds = []
    with preds_path.open("r") as f:
        for line in f:
            try:
                preds.append(json.loads(line))
            except Exception:
                pass
    metrics = json.loads((run_dir / "metrics.json").read_text()) if (run_dir / "metrics.json").exists() else {}
    readme = (run_dir / "README.md").read_text() if (run_dir / "README.md").exists() else ""
    return {
        "run_id": run_dir.name,
        "predictions": preds,
        "metrics": metrics,
        "readme": readme,
    }


def align(run_a: dict, run_b: dict, gt_map: dict) -> tuple[list, list, list]:
    ids_a = {p["message_id"] for p in run_a["predictions"]}
    ids_b = {p["message_id"] for p in run_b["predictions"]}
    common = sorted(ids_a & ids_b & set(gt_map))
    a_map = {p["message_id"]: p for p in run_a["predictions"]}
    b_map = {p["message_id"]: p for p in run_b["predictions"]}
    y_true = [bool(gt_map[m].get("is_anomalous", False)) for m in common]
    y_a = [bool(a_map[m].get("is_anomalous_pred", False)) for m in common]
    y_b = [bool(b_map[m].get("is_anomalous_pred", False)) for m in common]
    return y_true, y_a, y_b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("runs", nargs="+",
                    help="directories under experiments/runs/, "
                         "or run_ids relative to that directory")
    ap.add_argument("--ground-truth",
                    default="data/claude_opus_ground_truth_2000.json")
    ap.add_argument("--out",
                    default="experiments/analysis/latest_comparison.md")
    args = ap.parse_args()

    gt = json.loads(Path(args.ground_truth).read_text())
    gt_map = {x["message_id"]: x for x in gt}

    runs = []
    for r in args.runs:
        p = Path(r)
        if not p.exists():
            p = REPO_ROOT / "experiments" / "runs" / r
        if not p.exists():
            print(f"run directory not found: {r}")
            sys.exit(1)
        runs.append(load_run(p))

    lines: list[str] = []
    lines.append(f"# Comparison across {len(runs)} runs\n")
    lines.append("## Per-run summary\n")
    lines.append("| Run | F1 | CI (95%) | Precision | Recall | TP | FP | FN | TN |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for r in runs:
        m = r["metrics"]
        if not m:
            lines.append(f"| `{r['run_id']}` | — | — | — | — | — | — | — | — |")
            continue
        b = m.get("bootstrap", {})
        f1 = b.get("f1", {})
        p = b.get("precision", {})
        rcl = b.get("recall", {})
        cm = m.get("confusion_matrix", {})
        lines.append(
            f"| `{r['run_id']}` | "
            f"{f1.get('point', 0)*100:.2f}% | "
            f"{f1.get('ci_low', 0)*100:.2f}–{f1.get('ci_high', 0)*100:.2f}% | "
            f"{p.get('point', 0)*100:.2f}% | "
            f"{rcl.get('point', 0)*100:.2f}% | "
            f"{cm.get('tp', '-')} | {cm.get('fp', '-')} | "
            f"{cm.get('fn', '-')} | {cm.get('tn', '-')} |"
        )
    lines.append("")

    if len(runs) >= 2:
        lines.append("## Pairwise McNemar (two-sided exact)\n")
        lines.append("Cell shows `odds_ratio (p-value, n_discordant)`. "
                     "Null = two classifiers misclassify at equal rates.\n")
        header = "| base \\ comparison | " + " | ".join(
            f"`{r['run_id']}`" for r in runs
        ) + " |"
        lines.append(header)
        lines.append("|" + "|".join(["---"] * (len(runs) + 1)) + "|")
        for a in runs:
            row = [f"`{a['run_id']}`"]
            for b in runs:
                if a["run_id"] == b["run_id"]:
                    row.append("—")
                    continue
                try:
                    y_true, y_a, y_b = align(a, b, gt_map)
                    mn = mcnemar_exact(y_true, y_a, y_b)
                    cell = (
                        f"OR={mn['odds_ratio']:.2f} "
                        f"(p={mn['p_value']:.4f}, n_disc={mn['n_discordant']})"
                    )
                except Exception as e:
                    cell = f"err: {e}"
                row.append(cell)
            lines.append("| " + " | ".join(row) + " |")
        lines.append("")

    out_text = "\n".join(lines) + "\n"
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(out_text)
    print(out_text)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
