#!/usr/bin/env python3
"""Run one experimental condition from a YAML config.

Example:
    python experiments/run_condition.py experiments/configs/E1-LLMcls.yaml

The runner:
1. Validates the config and environment.
2. Writes an initial "started" row to the run registry.
3. Iterates over the dataset (resumable), invoking the configured classifier
   on each email's de-identified/raw text.
4. Streams predictions to `runs/<run_id>/predictions.jsonl`.
5. Enforces the hard cost cap after every call.
6. On completion, computes metrics with bootstrap CI, writes `metrics.json`
   and a human-readable `README.md`, and updates the registry row to
   "completed".

If interrupted, rerunning with the same config resumes from the last
checkpointed email. The registry row is rewritten with the final state.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import signal
import sys
import time
import traceback
from pathlib import Path

# Add repo + backend to path so `from config import settings` etc. still work.
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
for p in (REPO_ROOT, BACKEND):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

import yaml  # type: ignore

from experiments.lib import registry, classifiers, deid
from experiments.lib.cost_tracker import (
    CostTracker, BudgetExceededError,
)
from experiments.lib.stats import (
    confusion, bootstrap_ci, mcnemar_exact, cohen_kappa,
    per_category_recall,
)


# ---------------------------- config loading ---------------------------- #

REQUIRED_KEYS = {
    "condition_id",
    "classifier_variant",
    "deid_variant",
    "taxonomy_variant",
    "student_model",
    "n_emails",
    "max_spend_usd",
}
OPTIONAL_KEYS = {
    "dataset_path",
    "ground_truth_path",
    "seed_sampling",
    "notes",
    "escalation_threshold",
    "concurrency",
}


def load_config(path: Path) -> dict:
    with path.open("r") as f:
        cfg = yaml.safe_load(f)
    missing = REQUIRED_KEYS - set(cfg)
    if missing:
        raise ValueError(f"config {path} missing required keys: {missing}")
    cfg.setdefault("dataset_path", "data/evaluation_dataset.json")
    cfg.setdefault("ground_truth_path", "data/claude_opus_ground_truth_2000.json")
    cfg.setdefault("seed_sampling", 42)
    cfg.setdefault("escalation_threshold", 0.7)
    cfg.setdefault("concurrency", 8)
    cfg.setdefault("notes", "")
    unknown = set(cfg) - REQUIRED_KEYS - OPTIONAL_KEYS
    if unknown:
        raise ValueError(f"unknown keys in config: {unknown}")
    if cfg["classifier_variant"] not in classifiers.list_classifier_variants():
        raise ValueError(f"bad classifier_variant: {cfg['classifier_variant']}")
    if cfg["deid_variant"] not in deid.list_deid_variants():
        raise ValueError(f"bad deid_variant: {cfg['deid_variant']}")
    if cfg["taxonomy_variant"] not in classifiers.list_taxonomy_variants():
        raise ValueError(f"bad taxonomy_variant: {cfg['taxonomy_variant']}")
    return cfg


# ---------------------------- main orchestration --------------------------- #

async def _classify_one(
    record: dict,
    cfg: dict,
    llm_client,
    cost_tracker: CostTracker | None,
    name_map: dict,
):
    message_id = record["message_id"]
    text = deid.get_text(record, cfg["deid_variant"], name_map=name_map)
    variant = cfg["classifier_variant"]

    if variant == "heuristic":
        verdict = classifiers.heuristic_classify(
            text, escalation_threshold=cfg["escalation_threshold"],
        )
    elif variant in ("llm_json", "llm_json_cot"):
        verdict = await classifiers.llm_json_classify(
            text,
            llm_client=llm_client,
            use_cot=(variant == "llm_json_cot"),
            taxonomy=cfg["taxonomy_variant"],
            cost_tracker=cost_tracker,
            escalation_threshold=cfg["escalation_threshold"],
        )
    else:
        raise ValueError(f"unknown classifier_variant {variant!r}")

    return {
        "message_id": message_id,
        "is_anomalous_pred": verdict.is_anomalous,
        "confidence": verdict.confidence,
        "category_pred": verdict.category,
        "reasoning": verdict.reasoning,
        "tokens_in": verdict.tokens_in,
        "tokens_out": verdict.tokens_out,
    }


async def _run_all(cfg: dict, cfg_path: Path, predictions_path: Path,
                   manifest: registry.RunManifest, registry_path: Path,
                   cost_tracker: CostTracker) -> dict:
    # Load dataset
    with Path(cfg["dataset_path"]).open("r") as f:
        dataset = json.load(f)
    if cfg["n_emails"] < len(dataset):
        dataset = dataset[: cfg["n_emails"]]
    else:
        cfg["n_emails"] = len(dataset)

    # Load ground truth
    with Path(cfg["ground_truth_path"]).open("r") as f:
        gt = json.load(f)
    gt_map = {x["message_id"]: x for x in gt}

    # Resume if checkpoint exists
    done_ids: set[str] = set()
    if predictions_path.exists():
        with predictions_path.open("r") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    done_ids.add(rec["message_id"])
                except Exception:
                    pass
    remaining = [r for r in dataset if r["message_id"] not in done_ids]
    print(f"[{manifest.run_id}] loaded {len(dataset)} records, "
          f"{len(done_ids)} already done, {len(remaining)} remaining")

    # Prepare LLM if needed
    llm_client = None
    if cfg["classifier_variant"] in ("llm_json", "llm_json_cot"):
        from langchain_anthropic import ChatAnthropic
        from config import settings
        api_key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not configured. Set it in backend/.env or env var."
            )
        llm_client = ChatAnthropic(
            model=cfg["student_model"],
            api_key=api_key,
            timeout=60,
            max_retries=2,
        )

    # Load pseudonym map if needed
    name_map = deid.load_default_name_map(REPO_ROOT) if cfg["deid_variant"] == "pseudonym" else {}

    sem = asyncio.Semaphore(cfg["concurrency"])

    async def _bounded(record):
        async with sem:
            return await _classify_one(record, cfg, llm_client, cost_tracker, name_map)

    t0 = time.time()
    batch_size = 25
    for i in range(0, len(remaining), batch_size):
        batch = remaining[i : i + batch_size]
        try:
            cost_tracker.guard_or_raise()
        except BudgetExceededError as e:
            print(f"BUDGET KILL SWITCH: {e}")
            manifest.status = "interrupted"
            manifest.notes = (manifest.notes + f" | budget kill: {e}").strip()
            break

        results = await asyncio.gather(
            *(_bounded(r) for r in batch),
            return_exceptions=True,
        )
        with predictions_path.open("a") as f:
            for res in results:
                if isinstance(res, Exception):
                    print(f"  per-email error: {res!r}")
                    continue
                f.write(json.dumps(res) + "\n")

        spent = cost_tracker.cumulative_usd
        elapsed = time.time() - t0
        print(
            f"[{manifest.run_id}] {i + len(batch)}/{len(remaining)} "
            f"elapsed={elapsed:.0f}s spent=${spent:.2f}"
        )

    # Final metrics
    metrics = _compute_metrics(cfg, predictions_path, gt_map)
    manifest.cost_usd = cost_tracker.cumulative_usd
    manifest.tokens_in = cost_tracker.cumulative_tokens_in
    manifest.tokens_out = cost_tracker.cumulative_tokens_out
    manifest.wall_clock_seconds = time.time() - t0
    manifest.status = "completed" if manifest.status == "started" else manifest.status
    registry.append_registry_row(registry_path, manifest)
    return metrics


def _compute_metrics(cfg: dict, predictions_path: Path, gt_map: dict) -> dict:
    preds = []
    with predictions_path.open("r") as f:
        for line in f:
            try:
                preds.append(json.loads(line))
            except Exception:
                pass
    pred_map = {p["message_id"]: p for p in preds}

    common_ids = [m for m in gt_map if m in pred_map]
    y_true = [bool(gt_map[m].get("is_anomalous", False)) for m in common_ids]
    y_pred = [bool(pred_map[m].get("is_anomalous_pred", False)) for m in common_ids]
    y_cat = [str(gt_map[m].get("primary_category", "")) for m in common_ids]

    cm = confusion(y_true, y_pred)
    boot_f1 = bootstrap_ci(y_true, y_pred, "f1", n_resamples=1000)
    boot_p = bootstrap_ci(y_true, y_pred, "precision", n_resamples=1000)
    boot_r = bootstrap_ci(y_true, y_pred, "recall", n_resamples=1000)
    boot_a = bootstrap_ci(y_true, y_pred, "accuracy", n_resamples=1000)
    kappa = cohen_kappa(y_true, y_pred)
    per_cat = per_category_recall(y_cat, y_pred)

    return {
        "n_paired": len(common_ids),
        "n_positives_true": sum(y_true),
        "n_positives_pred": sum(y_pred),
        "confusion_matrix": cm.as_dict(),
        "bootstrap": {
            "f1": boot_f1, "precision": boot_p,
            "recall": boot_r, "accuracy": boot_a,
        },
        "cohen_kappa": kappa,
        "per_category_recall": per_cat,
    }


def _write_human_summary(run_dir: Path, cfg: dict, metrics: dict,
                          manifest: registry.RunManifest) -> None:
    cm = metrics["confusion_matrix"]
    f1 = metrics["bootstrap"]["f1"]
    p = metrics["bootstrap"]["precision"]
    r = metrics["bootstrap"]["recall"]
    acc = metrics["bootstrap"]["accuracy"]

    lines = [
        f"# Run `{manifest.run_id}` — {cfg['condition_id']}",
        "",
        f"**Status:** {manifest.status}  ",
        f"**Classifier:** `{cfg['classifier_variant']}`  ",
        f"**De-ID:** `{cfg['deid_variant']}`  ",
        f"**Taxonomy:** `{cfg['taxonomy_variant']}`  ",
        f"**Model:** `{cfg['student_model']}`  ",
        f"**N:** {metrics['n_paired']} paired (of {cfg['n_emails']} requested)  ",
        f"**Cost:** ${manifest.cost_usd:.2f}  ",
        f"**Wall clock:** {manifest.wall_clock_seconds:.0f}s  ",
        f"**Git SHA:** `{manifest.git_sha[:10]}` on `{manifest.git_branch}`  ",
        "",
        "## Metrics (with 95% bootstrap CI)",
        "",
        f"- **F1:** {f1['point']*100:.2f}% (95% CI {f1['ci_low']*100:.2f}–{f1['ci_high']*100:.2f}%)",
        f"- **Precision:** {p['point']*100:.2f}% (95% CI {p['ci_low']*100:.2f}–{p['ci_high']*100:.2f}%)",
        f"- **Recall:** {r['point']*100:.2f}% (95% CI {r['ci_low']*100:.2f}–{r['ci_high']*100:.2f}%)",
        f"- **Accuracy:** {acc['point']*100:.2f}%",
        f"- **Cohen's κ:** {metrics['cohen_kappa']:.3f}",
        "",
        "## Confusion matrix",
        "",
        "| | Pred: Threat | Pred: Clean |",
        "|---|---|---|",
        f"| **True: Threat** | TP={cm['tp']} | FN={cm['fn']} |",
        f"| **True: Clean** | FP={cm['fp']} | TN={cm['tn']} |",
        "",
        "## Per-category recall (ground truth)",
        "",
    ]
    for cat, d in sorted(metrics["per_category_recall"].items()):
        lines.append(
            f"- **{cat}:** {d['tp']}/{d['n_positives']} "
            f"= {d['recall']*100:.1f}%"
        )
    lines += [
        "",
        "## Config",
        "",
        "```yaml",
        yaml.safe_dump(cfg, sort_keys=False).rstrip(),
        "```",
    ]
    (run_dir / "README.md").write_text("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    args = ap.parse_args()

    cfg_path = Path(args.config)
    cfg = load_config(cfg_path)

    run_id = registry.build_run_id(cfg["condition_id"])
    run_dir = REPO_ROOT / "experiments" / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    predictions_path = run_dir / "predictions.jsonl"
    registry_path = REPO_ROOT / "experiments" / "runs" / "run_registry.jsonl"
    cost_log_path = run_dir / "cost_log.jsonl"

    # Hash prompts from the classifier module (so any prompt edit is traced)
    from experiments.lib import classifiers as _cl
    prompt_hashes = {
        "llm_system_json": registry.sha256_of_text(_cl._LLM_SYSTEM_JSON),
        "llm_system_json_cot": registry.sha256_of_text(_cl._LLM_SYSTEM_JSON_COT),
        "generic_taxonomy": registry.sha256_of_text(_cl._GENERIC_CORPORATE_POLICY),
        "acfe_enron_taxonomy": registry.sha256_of_text(_cl._ACFE_ENRON_TAXONOMY_EXCERPT),
    }

    manifest = registry.RunManifest(
        run_id=run_id,
        timestamp_utc=registry.now_utc_iso(),
        git_sha=registry.git_sha(REPO_ROOT),
        git_branch=registry.git_branch(REPO_ROOT),
        git_dirty=registry.git_dirty(REPO_ROOT),
        config_path=str(cfg_path),
        config_sha256=registry.sha256_of(cfg_path),
        model_student=cfg["student_model"],
        dataset_path=cfg["dataset_path"],
        dataset_sha256=registry.sha256_of(REPO_ROOT / cfg["dataset_path"]),
        ground_truth_path=cfg["ground_truth_path"],
        ground_truth_sha256=registry.sha256_of(REPO_ROOT / cfg["ground_truth_path"]),
        prompt_hashes=prompt_hashes,
        classifier_variant=cfg["classifier_variant"],
        deid_variant=cfg["deid_variant"],
        taxonomy_variant=cfg["taxonomy_variant"],
        n_emails=cfg["n_emails"],
        seed_sampling=cfg["seed_sampling"],
        notes=cfg["notes"],
        status="started",
    )

    # Reset singleton so multiple invocations start fresh
    CostTracker.reset_singleton()
    cost_tracker = CostTracker.get_or_create(
        max_spend_usd=cfg["max_spend_usd"],
        log_path=cost_log_path,
    )

    # Signal handling: Ctrl-C → mark interrupted cleanly
    stop_flag = {"stop": False}

    def _on_sigint(signum, frame):
        stop_flag["stop"] = True
        print("\nReceived SIGINT — finishing current batch and exiting...")
    signal.signal(signal.SIGINT, _on_sigint)

    try:
        metrics = asyncio.run(_run_all(
            cfg, cfg_path, predictions_path, manifest, registry_path, cost_tracker,
        ))
    except Exception as e:
        manifest.status = "failed"
        manifest.notes = (manifest.notes + f" | exception: {e}").strip()
        registry.append_registry_row(registry_path, manifest)
        failure_path = run_dir / "FAILURE.md"
        failure_path.write_text(
            f"# Failure\n\nRun `{run_id}` failed.\n\n"
            f"```\n{traceback.format_exc()}\n```\n"
        )
        print(f"RUN FAILED: see {failure_path}")
        raise

    # Write metrics + human summary
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    _write_human_summary(run_dir, cfg, metrics, manifest)

    print("\n" + "=" * 60)
    print(f"Run complete: {run_id}")
    print(f"  F1: {metrics['bootstrap']['f1']['point']*100:.2f}%")
    print(f"  Precision: {metrics['bootstrap']['precision']['point']*100:.2f}%")
    print(f"  Recall: {metrics['bootstrap']['recall']['point']*100:.2f}%")
    print(f"  Cost: ${manifest.cost_usd:.2f}")
    print(f"  Artifacts: {run_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()
