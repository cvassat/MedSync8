"""API contract tests. Spins up the FastAPI app with stubbed OpenAI/Anthropic."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import server as server_module
from backend.retriever import Retriever


@pytest.fixture
def client(monkeypatch, tiny_corpus: Path, stub_embedder, stub_anthropic):
    # Build a retriever against the tiny corpus and inject it, skipping lifespan.
    retriever = Retriever(str(tiny_corpus), stub_embedder)
    retriever.load_or_build()

    # Skip the real lifespan (which needs ANTHROPIC_API_KEY env vars).
    monkeypatch.setattr(server_module.app.router, "lifespan_context", None)
    server_module.app.state.retriever = retriever
    server_module.app.state.anthropic = stub_anthropic

    return TestClient(server_module.app)


def test_health_reports_rag_enabled(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["rag_enabled"] is True
    assert body["corpus_chunks"] > 0


def test_chat_returns_reply_and_citations(client, stub_anthropic):
    r = client.post("/api/chat", json={
        "tool": "policy",
        "messages": [{"role": "user", "content": "Draft a PDMP policy for Texas"}],
        "use_rag": True,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert "stub-reply" in body["reply"]
    assert len(body["citations"]) >= 1
    c = body["citations"][0]
    assert {"index", "doc_id", "chunk_id", "score"} <= set(c.keys())
    # The stub anthropic recorded the augmented system prompt with citations.
    assert "RETRIEVED CONTEXT" in stub_anthropic.last_call["system"]


def test_chat_without_rag_skips_retrieval(client, stub_anthropic):
    r = client.post("/api/chat", json={
        "tool": "chat",
        "messages": [{"role": "user", "content": "Quick DEA question"}],
        "use_rag": False,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["citations"] == []
    assert "RETRIEVED CONTEXT" not in stub_anthropic.last_call["system"]


def test_chat_rejects_unknown_tool(client):
    r = client.post("/api/chat", json={
        "tool": "cafeteria_menu",
        "messages": [{"role": "user", "content": "hi"}],
    })
    # Pydantic literal validation -> 422
    assert r.status_code == 422


def test_chat_requires_at_least_one_message(client):
    r = client.post("/api/chat", json={"tool": "chat", "messages": []})
    assert r.status_code == 422
