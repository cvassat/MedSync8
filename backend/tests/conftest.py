"""Shared test fixtures. No network calls, no real API keys required."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import numpy as np
import pytest


class _Embedding:
    def __init__(self, vector: list[float]) -> None:
        self.embedding = vector


class _EmbeddingsResponse:
    def __init__(self, data: list[_Embedding]) -> None:
        self.data = data


class StubOpenAI:
    """Deterministic, hash-seeded embeddings so identical text -> identical vector."""

    class _Embeddings:
        def create(self, model: str, input: list[str]) -> _EmbeddingsResponse:
            out: list[_Embedding] = []
            for text in input:
                seed = int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)
                rng = np.random.default_rng(seed)
                out.append(_Embedding(rng.standard_normal(16).tolist()))
            return _EmbeddingsResponse(out)

    def __init__(self) -> None:
        self.embeddings = self._Embeddings()


class _AnthropicContentBlock:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class _AnthropicMessage:
    def __init__(self, text: str) -> None:
        self.content = [_AnthropicContentBlock(text)]


class StubAnthropic:
    """Echoes the user's last message back with a marker so tests can assert."""

    class _Messages:
        def __init__(self, parent: "StubAnthropic") -> None:
            self._parent = parent

        def create(self, *, model: str, max_tokens: int, system: str,
                   messages: list[dict[str, Any]]) -> _AnthropicMessage:
            self._parent.last_call = {"model": model, "system": system, "messages": messages}
            last_user = next(
                (m["content"] for m in reversed(messages) if m["role"] == "user"),
                "",
            )
            return _AnthropicMessage(f"[stub-reply to: {last_user}]")

    def __init__(self) -> None:
        self.last_call: dict[str, Any] = {}
        self.messages = self._Messages(self)


@pytest.fixture
def stub_openai() -> StubOpenAI:
    return StubOpenAI()


@pytest.fixture
def stub_anthropic() -> StubAnthropic:
    return StubAnthropic()


@pytest.fixture
def tiny_corpus(tmp_path: Path) -> Path:
    (tmp_path / "dea_ryan_haight.md").write_text(
        "DEA Ryan Haight Act requires an in-person medical evaluation "
        "before prescribing controlled substances via telemedicine. "
        "Exceptions apply under the practice of telemedicine definitions. " * 20
    )
    (tmp_path / "tx_pdmp.md").write_text(
        "Texas Prescription Monitoring Program requires prescribers to "
        "check the PDMP before prescribing opioids, benzodiazepines, "
        "barbiturates, or carisoprodol. " * 20
    )
    return tmp_path
