"""Anthropic API cost tracking with hard kill switch.

Prices below are Claude 2026 published list prices (USD per million tokens).
Update if Anthropic changes them. The tracker is conservative: it uses list
prices, not any private/volume-discount rate the caller may have.

Design notes:
- A single process-wide tracker is safer than per-call bookkeeping because
  the LangGraph pipeline runs multiple agents per email; we want cumulative
  spend across the whole run, not per-agent.
- `estimate_and_kill_if_over` is called BEFORE each LLM call so we do not
  spend another penny if we have already blown the budget.
- We rely on the Anthropic API returning `usage.input_tokens` and
  `usage.output_tokens` on the response; if those fields are absent we
  record a conservative upper-bound estimate based on character counts.
"""
from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path


# Approx Claude 2026 list prices, USD per million tokens.
# Not authoritative — update before any production use.
PRICES_USD_PER_MTOK = {
    "claude-opus-4-7":        {"in": 15.00, "out": 75.00},
    "claude-opus-4":          {"in": 15.00, "out": 75.00},
    "claude-sonnet-4-5":      {"in":  3.00, "out": 15.00},
    "claude-sonnet-4":        {"in":  3.00, "out": 15.00},
    "claude-haiku-4-5":       {"in":  0.80, "out":  4.00},
    "claude-haiku-4":         {"in":  0.80, "out":  4.00},
    "claude-3-5-sonnet-latest": {"in": 3.00, "out": 15.00},
    "claude-3-5-haiku-latest":  {"in": 0.80, "out":  4.00},
}


class BudgetExceededError(RuntimeError):
    """Raised when the hard spend cap is hit. Callers should abort the run."""


@dataclass
class CostEntry:
    """One logged LLM call for audit/provenance purposes."""
    model: str
    tokens_in: int
    tokens_out: int
    cost_usd: float
    timestamp_epoch: float
    purpose: str = ""   # e.g. "sentiment_llm", "deliberation_llm"


@dataclass
class CostTracker:
    """Process-global tracker with a hard kill switch.

    Usage:
        tracker = CostTracker.get_or_create(max_spend_usd=2000.0, log_path=...)
        tracker.guard_or_raise()        # before an LLM call
        response = await llm.ainvoke(...)
        tracker.record(model, tokens_in, tokens_out, purpose="sentiment_llm")
    """
    max_spend_usd: float
    log_path: Path | None = None
    entries: list[CostEntry] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    _singleton: "CostTracker | None" = None

    @classmethod
    def get_or_create(cls, max_spend_usd: float, log_path: Path | None = None) -> "CostTracker":
        if cls._singleton is None:
            cls._singleton = cls(max_spend_usd=max_spend_usd, log_path=log_path)
        return cls._singleton

    @classmethod
    def reset_singleton(cls) -> None:
        cls._singleton = None

    def price(self, model: str) -> dict[str, float]:
        if model not in PRICES_USD_PER_MTOK:
            raise ValueError(
                f"Unknown model {model!r}. Add it to PRICES_USD_PER_MTOK "
                f"with documented source before running."
            )
        return PRICES_USD_PER_MTOK[model]

    def cost_for(self, model: str, tokens_in: int, tokens_out: int) -> float:
        p = self.price(model)
        return (tokens_in / 1e6) * p["in"] + (tokens_out / 1e6) * p["out"]

    @property
    def cumulative_usd(self) -> float:
        return sum(e.cost_usd for e in self.entries)

    @property
    def cumulative_tokens_in(self) -> int:
        return sum(e.tokens_in for e in self.entries)

    @property
    def cumulative_tokens_out(self) -> int:
        return sum(e.tokens_out for e in self.entries)

    def guard_or_raise(self, headroom_usd: float = 0.0) -> None:
        """Raise BudgetExceededError if the budget has been exceeded."""
        with self._lock:
            if self.cumulative_usd + headroom_usd > self.max_spend_usd:
                raise BudgetExceededError(
                    f"Spend cap hit: cumulative=${self.cumulative_usd:.2f} "
                    f"(+ headroom ${headroom_usd:.2f}) "
                    f"exceeds cap ${self.max_spend_usd:.2f}"
                )

    def record(
        self,
        model: str,
        tokens_in: int,
        tokens_out: int,
        purpose: str = "",
    ) -> float:
        with self._lock:
            usd = self.cost_for(model, tokens_in, tokens_out)
            entry = CostEntry(
                model=model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cost_usd=usd,
                timestamp_epoch=time.time(),
                purpose=purpose,
            )
            self.entries.append(entry)
            if self.log_path is not None:
                try:
                    self.log_path.parent.mkdir(parents=True, exist_ok=True)
                    with self.log_path.open("a") as f:
                        f.write(json.dumps(asdict(entry)) + "\n")
                except Exception:
                    pass
            return usd

    def summary(self) -> dict:
        by_model: dict[str, dict] = {}
        for e in self.entries:
            agg = by_model.setdefault(
                e.model,
                {"calls": 0, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0},
            )
            agg["calls"] += 1
            agg["tokens_in"] += e.tokens_in
            agg["tokens_out"] += e.tokens_out
            agg["cost_usd"] += e.cost_usd
        return {
            "cumulative_usd": self.cumulative_usd,
            "cumulative_tokens_in": self.cumulative_tokens_in,
            "cumulative_tokens_out": self.cumulative_tokens_out,
            "by_model": by_model,
            "cap_usd": self.max_spend_usd,
        }


def extract_usage_from_langchain_response(resp) -> tuple[int, int]:
    """Best-effort extraction of (tokens_in, tokens_out) from a LangChain
    ChatAnthropic response. Returns (0, 0) if unavailable so callers can
    fall back to a char-count estimate.
    """
    try:
        meta = getattr(resp, "response_metadata", {}) or {}
        usage = meta.get("usage", {}) or {}
        tin = int(usage.get("input_tokens") or 0)
        tout = int(usage.get("output_tokens") or 0)
        if tin or tout:
            return tin, tout
    except Exception:
        pass
    try:
        usage = getattr(resp, "usage_metadata", {}) or {}
        tin = int(usage.get("input_tokens") or 0)
        tout = int(usage.get("output_tokens") or 0)
        if tin or tout:
            return tin, tout
    except Exception:
        pass
    return 0, 0


def char_count_fallback_estimate(prompt_chars: int, output_chars: int) -> tuple[int, int]:
    """Very conservative fallback when the API doesn't return usage.
    4 characters ~ 1 token for English; use 3.5 to err high on cost."""
    return int(prompt_chars / 3.5), int(output_chars / 3.5)
