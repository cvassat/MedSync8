# AGENTS.md — MedSync8 Repository Agent Guide

Applies to any coding agent operating in this repository (GitHub Copilot coding agent, Claude Code, Codex, or equivalent). `.github/copilot-instructions.md` is the governance baseline; this file adds operational specifics. Path-scoped `.github/instructions/*.instructions.md` files win for their paths. `CLAUDE.md` carries the detailed architecture notes.

## Setup and validation

- Node 20+: `npm install`. Build check: `npm run build`. Dev servers: `npm run dev` (Vite 5173 + Express 3001; requires `ANTHROPIC_API_KEY` in `.env`).
- Python 3.11+: `pip install -r backend/requirements-test.txt` (fast, no torch). Full deps only when RAG work requires them: `pip install -r backend/requirements.txt`.
- Tests: `python -m pytest backend/tests -q` and `python -m pytest tests -q`. Backend tests use `StubEmbedder` and `StubAnthropic` from `conftest.py` — no network calls; keep it that way.
- If a command cannot run in your environment, state that explicitly in the PR description. Never claim validation that did not occur.

## Task execution

1. Read the issue or task acceptance criteria in full before editing.
2. Locate the smallest set of files that satisfies the task. Do not refactor beyond scope.
3. Preserve public APIs, schemas, CLI flags, filenames, and workflow names unless the task requires the change.
4. Adding a tool ID requires updating **all four places**: `src/constants.js`, `server.js`, `backend/prompts.py`, and the `Literal` in `backend/server.py`.
5. Changes to billing logic in `scripts/cocm_time_tracker.py` must preserve CMS thresholds (99492 ≥36, 99493 ≥31, 99494 at target+16, G2214 ≥30, 99484 ≥20), disclaimers, and rate-confidence labels; boundary-test the edges after any change (the `billing-auditor` agent in `.claude/agents/` does this).
6. Write or update tests alongside the change. Run lint and tests; record results.
7. Update README, `docs/USER_GUIDE.md`, or `CLAUDE.md` when user-facing or operational behavior changes.
8. Open a PR that passes the quality gate in `.github/copilot-instructions.md`.

## Hard boundaries

- No PHI, patient identifiers, dates of service, 42 CFR Part 2 records, payer/member identifiers, privileged legal strategy, secrets, or real production data — anywhere, including tests, fixtures, `corpus/`, comments, and commit messages.
- The audit log is hash-only by design — never log raw query text, and never weaken `hash_query` salting in `backend/audit.py`.
- No new unpinned GitHub Actions. Pin to full-length commit SHAs.
- No `pull_request_target` without explicit human approval in the task.
- No force pushes to protected branches. No history rewrites.
- Never remove decision-support disclaimers or source-confidence labels from clinical or billing scripts.
- Do not modify `.github/copilot-instructions.md`, this file, or any `.instructions.md` file unless the task is specifically an instructions update.

## When blocked

Stop and report — with the exact blocker — rather than guessing, when: sources conflict per the precedence ladder; a required credential or service is unavailable; acceptance criteria are ambiguous on a clinical, legal, billing, or compliance point; a billing threshold or payer rate cannot be verified against a primary source; or a change would touch PHI-adjacent code paths (`corpus/`, `backend/audit.py`, `backend/retriever.py`) without a stated test strategy.
