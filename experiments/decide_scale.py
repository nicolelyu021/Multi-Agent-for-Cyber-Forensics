#!/usr/bin/env python3
"""After the ablation chain finishes, pick the best condition and emit a scaled
config for a large-N confirmatory run.

Selection rule (explicit, not learned):
  1. Consider only conditions that used the *modern* classifier (llm_json or
     llm_json_cot). The heuristic baselines already showed F1 < 5% and we are
     not scaling those.
  2. Among those, pick the one whose F1 bootstrap lower-bound is highest. We
     prefer a floor, not a point estimate, because the confidence intervals
     overlap.
  3. Refuse to scale if the best condition has F1 lower bound < 20%. At that
     point, scaling is a waste of money and we emit a skip.

Output: writes `experiments/configs/E6-scaled.yaml` mirroring the winning
condition's config, but with n_emails=10000 and max_spend_usd=200, and prints
the reasoning to stdout.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

RUNS_DIR = Path(__file__).parent / "runs"
CONFIGS_DIR = Path(__file__).parent / "configs"
OUT = CONFIGS_DIR / "E6-best-scaled.yaml"

MODERN_CLASSIFIERS = {"llm_json", "llm_json_cot"}
MIN_N_FOR_CANDIDACY = 1500


def _parse_config_from_readme(readme_path: Path) -> dict:
    """README.md contains a ```yaml ... ``` block with the resolved config."""
    if not readme_path.exists():
        return {}
    text = readme_path.read_text()
    m = re.search(r"```yaml\n(.*?)```", text, flags=re.DOTALL)
    if not m:
        return {}
    try:
        return yaml.safe_load(m.group(1)) or {}
    except Exception:
        return {}


def load_runs() -> list[dict]:
    runs = []
    for p in RUNS_DIR.glob("*/metrics.json"):
        try:
            m = json.loads(p.read_text())
        except Exception:
            continue
        cfg = _parse_config_from_readme(p.parent / "README.md")
        # normalize metric shape: top-level f1, f1_ci_lower, f1_ci_upper
        cm = m.get("confusion_matrix", {})
        boot = m.get("bootstrap", {}).get("f1", {})
        flat = {
            "f1": cm.get("f1"),
            "f1_ci_lower": boot.get("ci_low"),
            "f1_ci_upper": boot.get("ci_high"),
            "precision": cm.get("precision"),
            "recall": cm.get("recall"),
            "accuracy": cm.get("accuracy"),
            "n_paired": m.get("n_paired", 0),
        }
        if flat["f1"] is None or flat["f1_ci_lower"] is None:
            continue
        if flat["n_paired"] < MIN_N_FOR_CANDIDACY:
            continue  # ignore partial runs and smoke tests
        runs.append({"run_dir": p.parent.name, "metrics": flat, "config": cfg})
    return runs


def pick_winner(runs: list[dict]) -> dict | None:
    candidates = []
    for r in runs:
        c = r["config"]
        cls = c.get("classifier_variant")
        if cls not in MODERN_CLASSIFIERS:
            continue
        m = r["metrics"]
        # require CI info
        if "f1_ci_lower" not in m:
            continue
        candidates.append(r)
    if not candidates:
        return None
    candidates.sort(key=lambda r: r["metrics"]["f1_ci_lower"], reverse=True)
    return candidates[0]


def main() -> int:
    runs = load_runs()
    if not runs:
        print("decide_scale: no runs found", file=sys.stderr)
        return 1

    # Print leaderboard
    print("\n=== Leaderboard (modern-classifier conditions) ===")
    mod = [r for r in runs if r["config"].get("classifier_variant") in MODERN_CLASSIFIERS]
    mod.sort(key=lambda r: r["metrics"].get("f1_ci_lower", 0), reverse=True)
    print(f"{'condition':<30} {'N':>5} {'F1':>7} {'CI_lo':>7} {'CI_hi':>7}  {'classifier':<16} {'deid':<14} {'taxonomy':<12}")
    for r in mod:
        m = r["metrics"]
        c = r["config"]
        print(
            f"{r['run_dir'][:30]:<30} "
            f"{m.get('n_paired',0):>5d} "
            f"{m['f1']*100:>6.2f}% "
            f"{m.get('f1_ci_lower',0)*100:>6.2f}% "
            f"{m.get('f1_ci_upper',0)*100:>6.2f}%  "
            f"{c.get('classifier_variant',''):<16} "
            f"{c.get('deid_variant',''):<14} "
            f"{c.get('taxonomy_variant',''):<12}"
        )

    winner = pick_winner(runs)
    if winner is None:
        print("decide_scale: no modern-classifier runs with CI info; nothing to scale", file=sys.stderr)
        return 2

    wc = winner["config"]
    wm = winner["metrics"]
    lo = wm.get("f1_ci_lower", 0)
    if lo < 0.20:
        print(f"decide_scale: winner {winner['run_dir']} has F1 CI lower={lo*100:.2f}% < 20%. Skipping scale-up.", file=sys.stderr)
        OUT.write_text("# decide_scale: no scale-up emitted (best F1 CI lower < 20%).\n")
        return 3

    # Build scaled config
    scaled = {
        "condition_id": "E6-best-scaled",
        "notes": (
            f"Confirmatory scaled run at n=10000. Based on ablation chain winner "
            f"(best F1 CI lower bound): {winner['run_dir']}. "
            f"Config mirrors winner except for n_emails and budget."
        ),
        "classifier_variant": wc.get("classifier_variant"),
        "deid_variant": wc.get("deid_variant"),
        "taxonomy_variant": wc.get("taxonomy_variant"),
        "student_model": wc.get("student_model"),
        "n_emails": 10000,
        "max_spend_usd": 200.00,
        "concurrency": wc.get("concurrency", 6),
        "escalation_threshold": wc.get("escalation_threshold", 0.7),
    }
    with OUT.open("w") as f:
        yaml.safe_dump(scaled, f, sort_keys=False)
    print(f"decide_scale: wrote {OUT} (winner = {winner['run_dir']}, F1={wm['f1']*100:.2f}%, CI_lo={lo*100:.2f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
