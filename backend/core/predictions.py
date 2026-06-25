"""Predictions placeholder service (PRO-tier feature).

`PredictionsService` is the interface; `PlaceholderPredictionsService` returns
deterministic probabilities with NO external model. Wire a real ML/stats model
later behind the same interface (swap `get_predictions_service`).
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod


def _seed(*parts) -> int:
    return int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)


class PredictionsService(ABC):
    name: str = "abstract"
    provider_ready: bool = False

    @abstractmethod
    def predict_match(self, match: dict) -> dict: ...


class PlaceholderPredictionsService(PredictionsService):
    name = "placeholder"
    provider_ready = False

    def predict_match(self, match):
        s = _seed(match.get("id", "x"))
        home = 30 + s % 40
        draw = 15 + (s >> 3) % 20
        away = max(5, 100 - home - draw)
        return {
            "win_probability": {"home": home, "draw": draw, "away": away},
            "expected_goals": {
                "home": round(1.0 + (s % 15) / 10, 2),
                "away": round(0.8 + ((s >> 4) % 14) / 10, 2),
            },
            "confidence": 50 + s % 40,
            "provider": self.name,
            "is_placeholder": True,
        }


_default_predictions = PlaceholderPredictionsService()


def get_predictions_service() -> PredictionsService:
    """Return the active predictions service (single swap point)."""
    return _default_predictions
