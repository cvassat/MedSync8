from pathlib import Path

from backend.retriever import Retriever, _chunk, _sha, format_context


def test_chunk_splits_and_overlaps():
    text = "abcdefghij" * 200  # 2000 chars
    chunks = _chunk(text, chars=500, overlap=100)
    assert len(chunks) >= 4
    # overlap: end of chunk N should appear at start of chunk N+1
    assert chunks[0][-100:] == chunks[1][:100]


def test_chunk_empty_text_returns_empty():
    assert _chunk("") == []
    assert _chunk("   \n\n") == []


def test_sha_stable_and_distinct():
    assert _sha("hello") == _sha("hello")
    assert _sha("hello") != _sha("world")


def test_retriever_builds_index_and_caches(tiny_corpus: Path, stub_openai):
    r = Retriever(str(tiny_corpus), stub_openai)
    r.load_or_build()
    assert r.ready()
    assert len(r.chunks) >= 2
    assert (tiny_corpus / "index.json").exists()

    # Second load should reuse the cache — no embedding calls needed.
    r2 = Retriever(str(tiny_corpus), stub_openai)
    r2.load_or_build()
    assert r2.ready()
    assert len(r2.chunks) == len(r.chunks)


def test_retriever_handles_missing_corpus_dir(tmp_path, stub_openai):
    r = Retriever(str(tmp_path / "does-not-exist"), stub_openai)
    r.load_or_build()
    assert not r.ready()
    assert r.search("anything") == []


def test_search_returns_topk_hits(tiny_corpus: Path, stub_openai):
    r = Retriever(str(tiny_corpus), stub_openai)
    r.load_or_build()
    hits = r.search("controlled substances", k=3)
    assert 1 <= len(hits) <= 3
    for h in hits:
        assert h.doc_id
        assert 0 <= h.score <= 1.001  # cosine similarity bound


def test_format_context_uses_indexed_citations(tiny_corpus: Path, stub_openai):
    r = Retriever(str(tiny_corpus), stub_openai)
    r.load_or_build()
    hits = r.search("Texas PDMP", k=2)
    ctx = format_context(hits)
    assert ctx.startswith("[1]")
    if len(hits) >= 2:
        assert "\n\n[2]" in ctx


def test_chunker_strips_redundant_whitespace():
    chunks = _chunk("a\n\n\nb\t\tc")
    assert chunks == ["a b c"]
