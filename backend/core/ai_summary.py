"""AI summary placeholder service (FREE-tier feature).

`AISummaryService` is the interface; `PlaceholderAISummaryService` returns a
deterministic templated summary with NO external API. Wire OpenAI/Claude later
behind the same interface (swap `get_ai_summary_service`).
"""
from __future__ import annotations

from abc import ABC, abstractmethod


class AISummaryService(ABC):
    name: str = "abstract"
    provider_ready: bool = False

    @abstractmethod
    def summarize_match(self, match: dict) -> dict: ...


class PlaceholderAISummaryService(AISummaryService):
    name = "placeholder"
    provider_ready = False  # flips True once a real LLM is connected

    def summarize_match(self, match):
        home = (match.get("home") or {}).get("name", "Home")
        away = (match.get("away") or {}).get("name", "Away")
        league = match.get("leagueName", "")
        return {
            "summary": (
                f"[Placeholder] {home} vs {away}"
                + (f" in {league}" if league else "")
                + ". A balanced fixture on current form. "
                "Connect an AI provider to generate live tactical insight."
            ),
            "bullets": [
                f"{home} and {away} are evenly matched on recent form.",
                "Goals expected around the market average.",
            ],
            "provider": self.name,
            "is_placeholder": True,
        }


_default_ai = PlaceholderAISummaryService()


def get_ai_summary_service() -> AISummaryService:
    """Return the active AI summary service (single swap point)."""
    return _default_ai
