"""Statistical analysis helpers for classifier ablation comparisons.

All functions operate on per-email paired observations:
- ground truth `y_true: list[bool]`
- predictions `y_pred: list[bool]`

Pairs between conditions are aligned by identical `message_id` order. Callers
are responsible for ensuring that alignment.

No scipy dependency: McNemar's exact test is computed from the binomial
distribution, and Cohen's kappa is a closed-form calculation. Bootstrap is a
numpy-only routine. This keeps the runtime dependencies light.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Sequence


@dataclass
class ConfusionMatrix:
    tp: int
    fp: int
    tn: int
    fn: int

    @property
    def total(self) -> int:
        return self.tp + self.fp + self.tn + self.fn

    @property
    def precision(self) -> float:
        d = self.tp + self.fp
        return self.tp / d if d else 0.0

    @property
    def recall(self) -> float:
        d = self.tp + self.fn
        return self.tp / d if d else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0

    @property
    def accuracy(self) -> float:
        return (self.tp + self.tn) / self.total if self.total else 0.0

    def as_dict(self) -> dict:
        return {
            "tp": self.tp, "fp": self.fp, "tn": self.tn, "fn": self.fn,
            "precision": self.precision,
            "recall": self.recall,
            "f1": self.f1,
            "accuracy": self.accuracy,
        }


def confusion(y_true: Sequence[bool], y_pred: Sequence[bool]) -> ConfusionMatrix:
    assert len(y_true) == len(y_pred), "unequal lengths"
    tp = fp = tn = fn = 0
    for t, p in zip(y_true, y_pred):
        if t and p: tp += 1
        elif not t and p: fp += 1
        elif not t and not p: tn += 1
        else: fn += 1
    return ConfusionMatrix(tp=tp, fp=fp, tn=tn, fn=fn)


def bootstrap_ci(
    y_true: Sequence[bool],
    y_pred: Sequence[bool],
    metric: str = "f1",
    n_resamples: int = 1000,
    alpha: float = 0.05,
    seed: int = 42,
) -> dict:
    """Paired bootstrap: resample email indices with replacement, recompute metric."""
    rng = random.Random(seed)
    n = len(y_true)
    assert n == len(y_pred)
    samples: list[float] = []
    for _ in range(n_resamples):
        idx = [rng.randrange(n) for _ in range(n)]
        t = [y_true[i] for i in idx]
        p = [y_pred[i] for i in idx]
        cm = confusion(t, p)
        if metric == "f1":
            samples.append(cm.f1)
        elif metric == "precision":
            samples.append(cm.precision)
        elif metric == "recall":
            samples.append(cm.recall)
        elif metric == "accuracy":
            samples.append(cm.accuracy)
        else:
            raise ValueError(f"unknown metric {metric}")
    samples.sort()
    lo = samples[int((alpha / 2) * n_resamples)]
    hi = samples[int((1 - alpha / 2) * n_resamples) - 1]
    pt = {
        "f1": confusion(y_true, y_pred).f1,
        "precision": confusion(y_true, y_pred).precision,
        "recall": confusion(y_true, y_pred).recall,
        "accuracy": confusion(y_true, y_pred).accuracy,
    }[metric]
    return {
        "point": pt,
        "ci_low": lo,
        "ci_high": hi,
        "alpha": alpha,
        "n_resamples": n_resamples,
    }


def mcnemar_exact(
    y_true: Sequence[bool],
    y_pred_a: Sequence[bool],
    y_pred_b: Sequence[bool],
) -> dict:
    """McNemar's exact test on paired classifier predictions.

    The test considers only discordant pairs:
      b = #(A correct, B wrong)
      c = #(A wrong,   B correct)

    Under H0: marginal homogeneity (A and B misclassify at the same rate),
    the minimum of b,c follows Binomial(b+c, 0.5).
    Two-sided p = 2 * P(X <= min(b,c) | Binomial(b+c, 0.5)).
    """
    assert len(y_true) == len(y_pred_a) == len(y_pred_b), "unequal lengths"
    b = 0  # A correct, B wrong
    c = 0  # A wrong, B correct
    for t, a, bb in zip(y_true, y_pred_a, y_pred_b):
        a_correct = (a == t)
        b_correct = (bb == t)
        if a_correct and not b_correct:
            b += 1
        elif not a_correct and b_correct:
            c += 1
    n = b + c
    if n == 0:
        return {"b": 0, "c": 0, "n_discordant": 0, "p_value": 1.0, "odds_ratio": float("nan")}
    k = min(b, c)
    # P(X <= k) for Binomial(n, 0.5)
    p_one = sum(math.comb(n, i) for i in range(0, k + 1)) / (2 ** n)
    p_two = min(1.0, 2 * p_one)
    odds = (b / c) if c else float("inf")
    return {
        "b": b,
        "c": c,
        "n_discordant": n,
        "p_value": p_two,
        "odds_ratio": odds,
    }


def cohen_kappa(y_true: Sequence[bool], y_pred: Sequence[bool]) -> float:
    cm = confusion(y_true, y_pred)
    n = cm.total
    if n == 0:
        return 0.0
    p_obs = (cm.tp + cm.tn) / n
    p_yes = ((cm.tp + cm.fn) / n) * ((cm.tp + cm.fp) / n)
    p_no = ((cm.tn + cm.fp) / n) * ((cm.tn + cm.fn) / n)
    p_exp = p_yes + p_no
    if p_exp == 1.0:
        return 0.0
    return (p_obs - p_exp) / (1 - p_exp)


def per_category_recall(
    y_true_categories: Sequence[str],
    y_pred: Sequence[bool],
) -> dict[str, dict]:
    """Recall broken down by ground-truth primary_category.
    Only threat rows (category != 'Normal' and category != '') are counted.
    """
    buckets: dict[str, list[bool]] = {}
    for cat, p in zip(y_true_categories, y_pred):
        if not cat or cat.lower() == "normal":
            continue
        buckets.setdefault(cat, []).append(p)
    out = {}
    for cat, preds in buckets.items():
        n = len(preds)
        tp = sum(preds)
        out[cat] = {"n_positives": n, "tp": tp, "recall": tp / n if n else 0.0}
    return out
