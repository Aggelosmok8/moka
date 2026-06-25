"""Pure math helpers for the value engine. No dependencies."""
from __future__ import annotations


def implied_probability(odds: float) -> float:
    """Convert decimal odds to implied probability (1 / odds)."""
    return 1.0 / odds if odds and odds > 0 else 0.0


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def normalize(values):
    """Scale a list of non-negative weights so they sum to 1."""
    total = sum(values) or 1.0
    return [v / total for v in values]


def pct(x: float) -> int:
    return round(x * 100)
