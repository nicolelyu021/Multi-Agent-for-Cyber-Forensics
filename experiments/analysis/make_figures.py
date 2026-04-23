"""
Generates the four figures used in the final report.

Audience: AI-governance readers (policy, compliance, risk) who are technically
literate but are not ML researchers. Each figure is designed to stand on its
own with a plain-English title, axis labels, a short interpretive subtitle,
and annotations pointing at the key number.

Output: experiments/figures/{png,svg} — both formats for Overleaf/Word.

The palette is taken from the 2024 "Attention Bias" NeurIPS figure (user's
reference image): muted navy, sage green, ochre/tan, terracotta, warm cream.
The palette is semantic and reused across all four figures so the reader can
follow a visual grammar:

    NAVY       — the winning / modern classifier (LLM condition)
    SAGE       — the taxonomy-augmented variant
    TERRACOTTA — the broken / heuristic baseline, or a warning
    OCHRE      — a secondary annotation / statistical reference line
    CREAM      — figure background
    INK        — axis and text

------------------------------------------------------------------------------
FIGURES
------------------------------------------------------------------------------
Figure 1 — "Which design choices actually moved the F1 score?"
    Horizontal bar chart of all ten runs with 95% bootstrap confidence
    intervals. Bars are coloured by condition family (heuristic vs. LLM vs.
    LLM+taxonomy vs. LLM+CoT). The midterm-presentation baseline (F1=2.65%)
    is drawn as a vertical dashed line so the reader can see at a glance
    that the modern classifier is ~15x above it while privacy controls are
    statistically indistinguishable from each other.

    How to read it: look at the *position* of each bar relative to the 2.65%
    baseline (the "privacy destroyed capability" claim). Then look at the
    *overlap* of the confidence intervals across the privacy variants — this
    is the visual version of the McNemar null result.

Figure 2 — "Which pairs of runs are statistically different?"
    Triangular heatmap of pairwise McNemar exact-test p-values across the
    seven modern-classifier runs. Green cells (p < 0.05) = statistically
    different. Ochre/red cells (p >= 0.05) = not distinguishable from noise.

    How to read it: the green column on the left shows every modern run is
    statistically different from the heuristic baseline. The absence of
    green anywhere else shows that *none* of the privacy/taxonomy
    manipulations, on their own, move the needle enough to clear statistical
    significance at n=1,887.

Figure 3 — "Is the LLM's probability calibrated?"
    Two-panel figure.
    Left  : reliability diagram for E1-LLMcls. x-axis is the LLM's self-
            reported P(threat); y-axis is the empirical fraction of true
            positives in that bin. The diagonal is perfect calibration.
            The numeric ECE (0.043) is annotated.
    Right : precision-recall curve over the same probability scores, with
            the default threshold (0.7) and the ensemble triage threshold
            (0.2) marked as dots. Shows the operating-point trade-off.

    How to read it: the left panel tells you the model's confidence numbers
    can be trusted — when it says "70% likely a threat", ~70% of those
    emails really are. The right panel tells you that for a triage workflow
    (human-in-the-loop review) you should lower the threshold, accepting
    more false positives in exchange for catching 60%+ of real threats.

Figure 4 — "How much does the same LLM disagree with itself between runs?"
    Dot plot of F1 across the two E1 replicates and three E2 replicates.
    Horizontal lines at each condition's mean. Annotations call out the
    zero-pp spread for E1 (perfectly reproducible) and the 2.1-pp SD for E2
    (real run-to-run variance).

    How to read it: the generic prompt (E1) is deterministic at this sample
    size — any difference from E1 is a real effect, not sampling noise.
    The taxonomy prompt (E2) introduces ~2 pp of sampling noise per run,
    which is comparable to the taxonomy effect itself and is why H3 is
    "consistent-but-under-powered" rather than "confirmed".

------------------------------------------------------------------------------
Reproducibility
------------------------------------------------------------------------------
Re-run from repo root:

    backend/.venv/bin/python experiments/analysis/make_figures.py

Dependencies (both in backend/.venv): matplotlib>=3.8, numpy>=1.26, and the
project-local module `experiments.lib.stats`.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "experiments" / "lib"))
from stats import confusion, mcnemar_exact  # noqa: E402


def fast_bootstrap_ci_f1(y_true: np.ndarray, y_pred: np.ndarray,
                         n_resamples: int = 1000, seed: int = 42) -> Tuple[float, float]:
    """Vectorised bootstrap of F1. Returns (ci_low, ci_high) at 95%."""
    rng = np.random.default_rng(seed)
    n = len(y_true)
    idx = rng.integers(0, n, size=(n_resamples, n))
    yt = y_true[idx]
    yp = y_pred[idx]
    tp = ((yt == 1) & (yp == 1)).sum(axis=1)
    fp = ((yt == 0) & (yp == 1)).sum(axis=1)
    fn = ((yt == 1) & (yp == 0)).sum(axis=1)
    with np.errstate(divide="ignore", invalid="ignore"):
        prec = np.where(tp + fp > 0, tp / (tp + fp), 0.0)
        rec = np.where(tp + fn > 0, tp / (tp + fn), 0.0)
        f1 = np.where(prec + rec > 0, 2 * prec * rec / (prec + rec), 0.0)
    f1.sort()
    lo = float(f1[int(0.025 * n_resamples)])
    hi = float(f1[int(0.975 * n_resamples) - 1])
    return lo, hi

# --- palette extracted from the reference figure ---------------------------
NAVY = "#3B5C7E"
NAVY_LIGHT = "#7A96B3"
SAGE = "#6B8E7F"
SAGE_LIGHT = "#A9BFB4"
TERRA = "#B8694A"
TERRA_LIGHT = "#D9A48F"
OCHRE = "#C9A876"
CREAM = "#F5EFE6"
INK = "#2E2E2E"
GREY = "#8A8A8A"

mpl.rcParams.update({
    "figure.facecolor": CREAM,
    "axes.facecolor": CREAM,
    "savefig.facecolor": CREAM,
    "axes.edgecolor": INK,
    "axes.labelcolor": INK,
    "xtick.color": INK,
    "ytick.color": INK,
    "text.color": INK,
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.titleweight": "bold",
    "axes.spines.top": False,
    "axes.spines.right": False,
})

FIG_DIR = REPO / "experiments" / "figures"
FIG_DIR.mkdir(exist_ok=True)
RUNS = REPO / "experiments" / "runs"


# --- data loading ----------------------------------------------------------
def load_gt() -> Dict[str, bool]:
    p = REPO / "data" / "claude_opus_ground_truth_2000.json"
    return {x["message_id"]: bool(x["is_anomalous"]) for x in json.loads(p.read_text())}


def load_preds(run_dir: str) -> Dict[str, Tuple[bool, float]]:
    path = RUNS / run_dir / "predictions.jsonl"
    m: Dict[str, Tuple[bool, float]] = {}
    for line in path.open():
        r = json.loads(line)
        prob = float(r.get("probability_anomalous") or r.get("confidence") or 0.0)
        m[r["message_id"]] = (bool(r.get("is_anomalous_pred")), prob)
    return m


# canonical run table (label, run-dir, condition-family)
RUN_TABLE: List[Tuple[str, str, str]] = [
    ("E0-repro (heuristic, full-scrub)",    "E0-repro-2026-04-22T07-59-36Z",       "heuristic"),
    ("E3-raw-heur (heuristic, raw)",        "E3-raw-heur-2026-04-22T07-59-59Z",    "heuristic"),
    ("E1-LLMcls (LLM, full-scrub)",         "E1-LLMcls-2026-04-22T15-43-51Z",      "llm"),
    ("E1-LLMcls redux",                      "E1-LLMcls-2026-04-23T05-47-05Z",      "llm"),
    ("E3-raw-llm (LLM, raw)",               "E3-raw-llm-2026-04-22T16-04-26Z",     "llm"),
    ("E4-pseudo (LLM, pseudonym)",           "E4-pseudo-2026-04-22T16-24-16Z",      "llm"),
    ("E2-taxon (LLM + ACFE taxonomy)",       "E2-taxon-2026-04-22T16-48-53Z",       "llm_tax"),
    ("E6-best-scaled (E2 re-run)",           "E6-best-scaled-2026-04-22T20-44-07Z", "llm_tax"),
    ("E2-taxon redux",                        "E2-taxon-2026-04-23T05-47-05Z",       "llm_tax"),
    ("E5-CoT (LLM + chain-of-thought)",      "E5-CoT-2026-04-22T17-33-48Z",         "llm_cot"),
]

FAMILY_COLOR = {
    "heuristic": TERRA,
    "llm": NAVY,
    "llm_tax": SAGE,
    "llm_cot": OCHRE,
}
FAMILY_LABEL = {
    "heuristic": "Heuristic (29-word regex)",
    "llm": "LLM classifier",
    "llm_tax": "LLM + ACFE taxonomy",
    "llm_cot": "LLM + chain-of-thought",
}


def common_ids(gt: Dict[str, bool], preds: Dict[str, Dict]) -> List[str]:
    ids = set(gt)
    for d in preds.values():
        ids &= set(d)
    return sorted(ids)


# ===========================================================================
# FIGURE 1 — F1 with 95% CIs
# ===========================================================================
def figure_1_f1_bars(gt, all_preds):
    """Horizontal bar chart. One bar per run, coloured by condition family,
    with a 95% bootstrap CI whisker and the midterm baseline drawn as a
    vertical dashed line."""
    ids = common_ids(gt, all_preds)
    y_true = np.array([gt[i] for i in ids])

    rows = []
    for label, run_dir, fam in RUN_TABLE:
        preds = all_preds[run_dir]
        y_pred = np.array([preds[i][0] for i in ids])
        cm = confusion(y_true.tolist(), y_pred.tolist())
        lo, hi = fast_bootstrap_ci_f1(y_true.astype(int), y_pred.astype(int),
                                      n_resamples=1000, seed=42)
        rows.append((label, fam, cm.f1, lo, hi))

    rows = list(reversed(rows))
    fig, ax = plt.subplots(figsize=(10, 6.5))

    ys = np.arange(len(rows))
    for i, (label, fam, f1, lo, hi) in enumerate(rows):
        ax.barh(i, f1 * 100, color=FAMILY_COLOR[fam], alpha=0.88,
                edgecolor=INK, linewidth=0.6, height=0.65)
        ax.errorbar(f1 * 100, i, xerr=[[(f1 - lo) * 100], [(hi - f1) * 100]],
                    fmt="none", ecolor=INK, capsize=4, elinewidth=1.2)
        ax.text(f1 * 100 + 1.0, i, f"{f1*100:.1f}%", va="center", fontsize=9,
                color=INK)

    ax.axvline(2.65, color=TERRA, linestyle="--", linewidth=1.2, alpha=0.7, zorder=0)
    ax.text(2.65, len(rows) - 0.4, "midterm-\npresentation\nbaseline (2.65%)",
            color=TERRA, fontsize=8, ha="left", va="top")

    ax.set_yticks(ys)
    ax.set_yticklabels([r[0] for r in rows], fontsize=9)
    ax.set_xlabel("F1 score on the 1,887 paired emails (higher is better)")
    ax.set_xlim(0, 65)
    fig.text(0.02, 0.97, "Which design choices actually moved the F1 score?",
             fontsize=13, fontweight="bold", va="top", ha="left")
    fig.text(0.02, 0.93,
             "Swapping the 29-word regex for a modern LLM adds ~37 points of F1 (p<0.0001). "
             "Turning privacy controls on or off changes F1 by less\nthan 2 points, and none of those changes clear statistical "
             "significance. Whiskers are 95% bootstrap confidence intervals.",
             fontsize=9, color=GREY, va="top", ha="left")

    handles = [mpl.patches.Patch(color=c, label=FAMILY_LABEL[k]) for k, c in FAMILY_COLOR.items()]
    ax.legend(handles=handles, loc="lower right", frameon=False, fontsize=9)

    fig.tight_layout(rect=[0, 0, 1, 0.86])
    fig.savefig(FIG_DIR / "fig1_f1_with_ci.png", dpi=200, bbox_inches="tight")
    fig.savefig(FIG_DIR / "fig1_f1_with_ci.svg", bbox_inches="tight")
    plt.close(fig)
    print("Wrote", FIG_DIR / "fig1_f1_with_ci.png")


# ===========================================================================
# FIGURE 2 — McNemar p-value heatmap
# ===========================================================================
def figure_2_mcnemar_heatmap(gt, all_preds):
    """Triangular p-value heatmap. Rows/cols are the 10 runs in the same
    order as Figure 1. Cells below 0.05 are green (real difference); cells
    at or above 0.05 are ochre/terracotta (not distinguishable from noise)."""
    ids = common_ids(gt, all_preds)
    y_true = np.array([gt[i] for i in ids])

    labels_short = {
        "E0-repro-2026-04-22T07-59-36Z": "E0\nheuristic\nfull-scrub",
        "E3-raw-heur-2026-04-22T07-59-59Z": "E3-heur\nheuristic\nraw",
        "E1-LLMcls-2026-04-22T15-43-51Z": "E1\nLLM\nfull-scrub",
        "E1-LLMcls-2026-04-23T05-47-05Z": "E1-redux\nLLM\nfull-scrub",
        "E3-raw-llm-2026-04-22T16-04-26Z": "E3\nLLM\nraw",
        "E4-pseudo-2026-04-22T16-24-16Z": "E4\nLLM\npseudonym",
        "E2-taxon-2026-04-22T16-48-53Z": "E2\nLLM+tax\nfull-scrub",
        "E6-best-scaled-2026-04-22T20-44-07Z": "E6\nLLM+tax\nfull-scrub",
        "E2-taxon-2026-04-23T05-47-05Z": "E2-redux\nLLM+tax\nfull-scrub",
        "E5-CoT-2026-04-22T17-33-48Z": "E5\nLLM+CoT\nfull-scrub",
    }
    order = [rd for _, rd, _ in RUN_TABLE]
    n = len(order)

    P = np.full((n, n), np.nan)
    for i in range(n):
        for j in range(i + 1, n):
            ya = [all_preds[order[i]][k][0] for k in ids]
            yb = [all_preds[order[j]][k][0] for k in ids]
            r = mcnemar_exact(y_true.tolist(), ya, yb)
            P[i, j] = r["p_value"]
            P[j, i] = r["p_value"]

    fig, ax = plt.subplots(figsize=(10, 8.5))
    # Custom colormap: green below 0.05, ochre->terra above.
    from matplotlib.colors import LinearSegmentedColormap
    cmap = LinearSegmentedColormap.from_list(
        "mcn",
        [(0.0, SAGE), (0.049, SAGE_LIGHT), (0.05, OCHRE), (0.5, TERRA_LIGHT), (1.0, TERRA)],
    )

    masked = np.where(np.isnan(P), 0, P)
    im = ax.imshow(masked, cmap=cmap, vmin=0, vmax=1)

    for i in range(n):
        for j in range(n):
            if i == j:
                ax.text(j, i, "—", ha="center", va="center", color=GREY, fontsize=9)
                continue
            p = P[i, j]
            label = "<0.0001" if p < 1e-4 else f"{p:.2f}"
            color = "white" if (p < 0.05 or p > 0.6) else INK
            ax.text(j, i, label, ha="center", va="center", fontsize=8, color=color)

    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels([labels_short[o] for o in order], fontsize=8)
    ax.set_yticklabels([labels_short[o] for o in order], fontsize=8)
    fig.text(0.02, 0.98, "Which pairs of runs are statistically different? (McNemar exact test)",
             fontsize=13, fontweight="bold", va="top", ha="left")
    fig.text(0.02, 0.94,
             "Green cells mean the two runs disagree about enough emails that the difference is unlikely to be chance (p<0.05).\n"
             "Ochre/brown cells mean the two runs are statistically indistinguishable at this sample size. Only heuristic-vs-LLM\n"
             "comparisons reach significance; every privacy and prompt variant above the heuristic is null.",
             fontsize=9, color=GREY, va="top", ha="left")

    cbar = fig.colorbar(im, ax=ax, shrink=0.65, pad=0.02)
    cbar.set_label("McNemar p-value", fontsize=9)
    cbar.ax.axhline(0.05, color=INK, linewidth=1.2)
    cbar.ax.text(1.05, 0.05, " α=0.05", transform=cbar.ax.get_yaxis_transform(),
                 fontsize=8, va="center")

    fig.tight_layout(rect=[0, 0, 1, 0.87])
    fig.savefig(FIG_DIR / "fig2_mcnemar_heatmap.png", dpi=200, bbox_inches="tight")
    fig.savefig(FIG_DIR / "fig2_mcnemar_heatmap.svg", bbox_inches="tight")
    plt.close(fig)
    print("Wrote", FIG_DIR / "fig2_mcnemar_heatmap.png")


# ===========================================================================
# FIGURE 3 — Calibration + PR operating point
# ===========================================================================
def figure_3_calibration_and_operating(gt, all_preds):
    """Left: reliability diagram for E1-LLMcls. Right: precision-recall
    curve with the default (0.7) and ensemble-triage (0.2) thresholds."""
    ids = common_ids(gt, all_preds)
    y_true = np.array([gt[i] for i in ids], dtype=int)

    preds_e1 = all_preds["E1-LLMcls-2026-04-22T15-43-51Z"]
    probs = np.array([preds_e1[i][1] for i in ids])

    # reliability diagram
    bins = np.linspace(0, 1, 11)
    bin_ids = np.digitize(probs, bins) - 1
    bin_ids = np.clip(bin_ids, 0, 9)

    mean_pred, frac_pos, counts = [], [], []
    for b in range(10):
        mask = bin_ids == b
        if mask.sum() == 0:
            mean_pred.append((bins[b] + bins[b+1]) / 2)
            frac_pos.append(np.nan)
            counts.append(0)
            continue
        mean_pred.append(probs[mask].mean())
        frac_pos.append(y_true[mask].mean())
        counts.append(int(mask.sum()))

    mean_pred = np.array(mean_pred)
    frac_pos = np.array(frac_pos)
    counts = np.array(counts)

    # Expected Calibration Error
    valid = ~np.isnan(frac_pos)
    ece = float(np.sum(counts[valid] / counts[valid].sum() * np.abs(mean_pred[valid] - frac_pos[valid])))

    fig, axes = plt.subplots(1, 2, figsize=(12, 5.2))

    ax = axes[0]
    ax.plot([0, 1], [0, 1], linestyle="--", color=GREY, linewidth=1,
            label="Perfect calibration")
    size = np.clip(counts / counts.max() * 400, 20, 400)
    ax.scatter(mean_pred[valid], frac_pos[valid], s=size[valid], color=NAVY,
               edgecolor=INK, linewidth=0.6, alpha=0.85, zorder=3,
               label="E1-LLMcls, size ∝ # emails")
    ax.set_xlabel("LLM's self-reported P(threat)")
    ax.set_ylabel("Actual fraction of threats in that bin")
    ax.set_xlim(-0.02, 1.02)
    ax.set_ylim(-0.02, 1.02)
    ax.set_title("Is the LLM's confidence trustworthy?", loc="left")
    ax.text(0.65, 0.22, f"ECE = {ece:.3f}\n(0 = perfect;\n 0.1 = weak)",
            fontsize=10, color=NAVY, transform=ax.transAxes,
            bbox=dict(boxstyle="round,pad=0.4", facecolor="white", edgecolor=NAVY))
    ax.legend(loc="lower right", frameon=False, fontsize=9)
    ax.set_aspect("equal")

    # precision-recall
    ax2 = axes[1]
    order = np.argsort(-probs)
    p_sorted = probs[order]
    y_sorted = y_true[order]
    total_pos = int(y_true.sum())
    tp = np.cumsum(y_sorted)
    fp = np.cumsum(1 - y_sorted)
    rec = tp / total_pos
    prec = tp / (tp + fp)

    ax2.plot(rec, prec, color=NAVY, linewidth=1.5, alpha=0.85, label="E1-LLMcls PR curve")

    def mark_at_threshold(th, color, label):
        flagged = probs >= th
        tp_ = int(((flagged) & (y_true == 1)).sum())
        fp_ = int(((flagged) & (y_true == 0)).sum())
        if tp_ + fp_ == 0:
            return
        p_ = tp_ / (tp_ + fp_)
        r_ = tp_ / total_pos
        ax2.scatter([r_], [p_], s=120, color=color, edgecolor=INK, linewidth=0.8,
                    zorder=5, label=f"{label}: P={p_*100:.0f}%, R={r_*100:.0f}%")

    mark_at_threshold(0.7, OCHRE, "Default threshold 0.7")
    mark_at_threshold(0.2, SAGE, "Triage threshold 0.2 (ensemble)")

    ax2.set_xlabel("Recall (fraction of true threats caught)")
    ax2.set_ylabel("Precision (fraction of flags that are real)")
    ax2.set_xlim(-0.02, 1.02)
    ax2.set_ylim(-0.02, 1.02)
    ax2.set_title("Operating-point choice: precision vs. recall", loc="left")
    ax2.legend(loc="upper right", frameon=False, fontsize=8)

    fig.tight_layout(rect=[0, 0.12, 1, 1])
    fig.text(0.02, 0.02,
             "LEFT: When the LLM says 'I'm 70% sure', about 70% of those emails really are threats — a well-calibrated classifier, which is what\n"
             "auditors need to trust the probability numbers.  RIGHT: Lowering the threshold from 0.7 to 0.2 catches more true threats (recall up) at\n"
             "the cost of more false alarms (precision down). For a human-in-the-loop triage system, the 0.2 operating point is better.",
             fontsize=9, color=GREY)
    fig.savefig(FIG_DIR / "fig3_calibration_and_pr.png", dpi=200, bbox_inches="tight")
    fig.savefig(FIG_DIR / "fig3_calibration_and_pr.svg", bbox_inches="tight")
    plt.close(fig)
    print("Wrote", FIG_DIR / "fig3_calibration_and_pr.png")
    return ece


# ===========================================================================
# FIGURE 4 — Test-retest dot plot
# ===========================================================================
def figure_4_test_retest(gt, all_preds):
    """Dot plot. Two dots for E1 (should overlap perfectly), three dots for
    E2 (spread ~4 points). Horizontal line at each group's mean."""
    ids = common_ids(gt, all_preds)
    y_true = [gt[i] for i in ids]

    def f1_of(run_dir):
        yp = [all_preds[run_dir][i][0] for i in ids]
        return confusion(y_true, yp).f1 * 100

    e1 = [("E1-LLMcls original", f1_of("E1-LLMcls-2026-04-22T15-43-51Z")),
          ("E1-LLMcls redux",    f1_of("E1-LLMcls-2026-04-23T05-47-05Z"))]
    e2 = [("E2-taxon original",   f1_of("E2-taxon-2026-04-22T16-48-53Z")),
          ("E6-best-scaled",      f1_of("E6-best-scaled-2026-04-22T20-44-07Z")),
          ("E2-taxon redux",      f1_of("E2-taxon-2026-04-23T05-47-05Z"))]

    e1_vals = np.array([v for _, v in e1])
    e2_vals = np.array([v for _, v in e2])
    e1_mean, e1_sd = e1_vals.mean(), e1_vals.std(ddof=1) if len(e1_vals) > 1 else 0.0
    e2_mean, e2_sd = e2_vals.mean(), e2_vals.std(ddof=1)

    fig, ax = plt.subplots(figsize=(10, 6))

    rng = np.random.default_rng(0)
    x_e1 = 1 + (rng.random(len(e1_vals)) - 0.5) * 0.08
    x_e2 = 2 + (rng.random(len(e2_vals)) - 0.5) * 0.12

    ax.scatter(x_e1, e1_vals, s=140, color=NAVY, edgecolor=INK, linewidth=0.8, zorder=3)
    ax.scatter(x_e2, e2_vals, s=140, color=SAGE, edgecolor=INK, linewidth=0.8, zorder=3)

    ax.hlines(e1_mean, 0.75, 1.25, color=NAVY, linewidth=2, linestyle="-")
    ax.hlines(e2_mean, 1.70, 2.30, color=SAGE, linewidth=2, linestyle="-")

    # E1 labels offset vertically so the two overlapping dots stay readable
    for i, (x, (label, v)) in enumerate(zip(x_e1, e1)):
        dy = 12 if i == 0 else -14
        ax.annotate(label, (x, v), xytext=(10, dy), textcoords="offset points",
                    fontsize=8, color=INK)
    for x, (label, v) in zip(x_e2, e2):
        ax.annotate(label, (x, v), xytext=(10, 4), textcoords="offset points",
                    fontsize=8, color=INK)

    ax.annotate(f"mean = {e1_mean:.2f}%\nSD = {e1_sd:.2f} pp\n(effectively deterministic)",
                xy=(1.25, e1_mean), xytext=(1.32, e1_mean - 2.5),
                fontsize=9, color=NAVY,
                arrowprops=dict(arrowstyle="->", color=NAVY, lw=1),
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor=NAVY))
    ax.annotate(f"mean = {e2_mean:.2f}%\nSD = {e2_sd:.2f} pp\n(real run-to-run noise)",
                xy=(2.30, e2_mean), xytext=(2.40, e2_mean + 1.5),
                fontsize=9, color=SAGE,
                arrowprops=dict(arrowstyle="->", color=SAGE, lw=1),
                bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor=SAGE))

    delta = e2_mean - e1_mean
    ax.annotate(
        f"Taxonomy effect\n  Δ = +{delta:.2f} pp\n  (McNemar p≈0.44, under-powered)",
        xy=(1.5, (e1_mean + e2_mean) / 2),
        xytext=(0.35, (e1_mean + e2_mean) / 2),
        fontsize=9, color=INK,
        arrowprops=dict(arrowstyle="-[, widthB=3.0", color=INK, lw=1),
    )

    ax.set_xticks([1, 2])
    ax.set_xticklabels(["E1-LLMcls\n(generic prompt)", "E2-taxon\n(ACFE taxonomy prompt)"],
                       fontsize=10)
    ax.set_xlim(0.2, 3.1)
    ax.set_ylim(min(e1_vals.min(), e2_vals.min()) - 3,
                max(e1_vals.max(), e2_vals.max()) + 4)
    ax.set_ylabel("F1 score on the same 1,887 paired emails")
    fig.text(0.02, 0.97, "How much does the same LLM disagree with itself between runs?",
             fontsize=13, fontweight="bold", va="top", ha="left")
    fig.text(0.02, 0.93,
             "Same dataset, same model, same prompt — only the API random sampling differs. The generic prompt (E1)\n"
             "produces identical results twice; the taxonomy prompt (E2) has ~2 pp of run-to-run noise, comparable to the\n"
             "taxonomy effect itself. This is why H3 is reported as 'consistent but under-powered'.",
             fontsize=9, color=GREY, va="top", ha="left")

    fig.tight_layout(rect=[0, 0, 1, 0.83])
    fig.savefig(FIG_DIR / "fig4_test_retest.png", dpi=200, bbox_inches="tight")
    fig.savefig(FIG_DIR / "fig4_test_retest.svg", bbox_inches="tight")
    plt.close(fig)
    print("Wrote", FIG_DIR / "fig4_test_retest.png")


# ===========================================================================
def main():
    gt = load_gt()
    all_preds = {rd: load_preds(rd) for _, rd, _ in RUN_TABLE}
    figure_1_f1_bars(gt, all_preds)
    figure_2_mcnemar_heatmap(gt, all_preds)
    figure_3_calibration_and_operating(gt, all_preds)
    figure_4_test_retest(gt, all_preds)
    print(f"\nAll four figures written to {FIG_DIR}")


if __name__ == "__main__":
    main()
