---
applyTo: "**/*.py"
---

# Python Rules

- Target Python 3.11+. Full type hints on public functions, methods, and module-level constants. `from __future__ import annotations` where the codebase already uses it (it does — `backend/`, `scripts/`).
- FastAPI services (`backend/server.py`): Pydantic models for all request/response bodies; explicit status codes; no bare `except`; structured logging with no PHI, secrets, or member identifiers in log lines.
- Audit logging follows the hash-only pattern (`backend/audit.py`) — log salted content hashes and metadata, never payloads that could contain PHI. Do not change the salting scheme without an instructions-level task.
- Imports inside the `backend/` package use relative form (`from .audit import ChatAuditContext`).
- Billing scripts (`scripts/cocm_time_tracker.py`): CMS thresholds, disclaimers, and rate-confidence labels are load-bearing — never alter a threshold without citing the governing CMS source in the PR, and never present an estimated rate as verified. Boundary-test edges (35/36, 30/31, target+15/+16, 19/20) after any eligibility change.
- Alert scripts (`scripts/credentialing_alert.py`): outbound HTTP always carries a timeout; delivery failure must surface in the exit code; no PHI in card payloads — aggregate risk metadata only.
- Tests: `pytest`, synthetic fixtures only, no network calls (use `StubEmbedder`/`StubAnthropic` from `backend/tests/conftest.py`), deterministic seeds for anything random.
- Dependency changes require a one-line justification in the PR and an updated requirements entry — never a loose unpinned addition to production requirements. `backend/requirements-test.txt` stays torch-free.
- Docstrings on public modules and functions: one-line summary, then args/returns when non-obvious. No docstring theater on trivial private helpers.
