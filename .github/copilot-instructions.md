# NEH GitHub Enterprise Copilot Instructions — MedSync8

Version 1.1.1 — 2026-07-23. Supersedes v1.1.0 (2026-07-03). NEH governance lineage.

This repository uses enterprise AI governance. Follow these instructions for Copilot Chat, Copilot coding agent, code review, and repository-scoped AI assistance.

## Repository mission

MedSync8 is the Psychiatry AI Workbench — a clinical AI toolset for psychiatric practice (policy generation, supervision tools, CME content, clinical consultation, documentation) plus billing and credentialing decision-support scripts. Preserve clinical, legal, regulatory, payer, billing, operational, financial, and technical meaning exactly.

## Repository context

- Frontend: React 18 + Vite (`src/`), Node 20. Express proxy (`server.js`, port 3001) with rate limiting and SSE streaming.
- Backend: Python 3.11+ FastAPI (`backend/`, port 8080) with RAG retrieval over `corpus/`, Cloudflare Access JWT auth, and hash-only audit logging.
- Clinical scripts: `scripts/` (CoCM/BHI billing tracker, credentialing Teams alert). Decision-support only — never remove their disclaimers or source-confidence labels.
- Build: `npm install` then `npm run build`. Dev: `npm run dev` (Vite 5173 + Express 3001).
- Tests: `python -m pytest backend/tests -q` (uses `backend/requirements-test.txt` — no torch) and `python -m pytest tests -q`. CI (`.github/workflows/ci.yml`) runs pytest (Python 3.11) and `npm run build` (Node 20) on every PR.
- Tool IDs (`policy`, `supervision`, `lecture`, `chat`, `documentation`) are the central organizing concept, defined in **four places** that must stay in sync: `src/constants.js`, `server.js` SYSTEM_PROMPTS, `backend/prompts.py`, and the Pydantic `Literal` in `backend/server.py`.
- Frontend conventions: use `TOOL_MAP` for lookups (not `TOOLS.find()`); `ERROR_PREFIX` (⚠️) is the shared error sentinel; streaming callbacks use `setConversations` functional updaters — never capture `conversations` in dependency arrays.
- Python imports inside `backend/` use relative form (`from .audit import ...`).
- File naming for user-facing artifacts: hyphens, never underscores, per NEH file governance.

## Working rules

- Read this file, the matching `.github/instructions/*.instructions.md` file, `AGENTS.md`, `CLAUDE.md`, task acceptance criteria, and nearby code before making changes.
- Make the smallest correct change. Avoid unrelated refactors.
- Prefer explicit, typed, tested, maintainable code.
- Preserve public APIs, schemas, filenames, workflow names, and deployment behavior unless the task explicitly requires a change.
- Add or update tests for behavior changes.
- Update README/docs/changelog when user-facing or operational behavior changes.
- Do not fabricate files, commands, test results, credentials, policy claims, citations, billing rates, or implementation status. Billing thresholds and payer rates carry confidence labels — never upgrade a label without a verifying source.
- State validation performed. If tests cannot be run, explain exactly why.

## Source precedence

Use the highest-authority available source:

1. Current user request and acceptance criteria
2. Repository files and current code
3. Matching `.github/instructions/*.instructions.md` (path-scoped rules win for their paths)
4. `.github/copilot-instructions.md` (this file — repository-wide baseline)
5. `AGENTS.md` / root `CLAUDE.md`
6. Current issue, PR, or release plan
7. Historical docs or comments

If sources conflict, stop and call out the conflict before making a risky change.

## Security and privacy

Never commit or expose:

- PHI, patient identifiers, raw clinical excerpts, dates of service
- 42 CFR Part 2 substance use disorder records or references to them
- payer/member identifiers
- privileged legal strategy
- secrets, tokens, private keys, credentials (`ANTHROPIC_API_KEY`, `AUDIT_SALT`, GHCR tokens, Azure credentials, Teams webhook URLs)
- sensitive source paths or private infrastructure details
- real production data in tests or fixtures

Use synthetic examples only. Keep logs and errors free of secrets and sensitive data. The audit log is hash-only by design (`backend/audit.py`) — never add raw query text to it. `corpus/` holds non-PHI reference documents only.

## GitHub Actions

For workflows (`ci.yml`, `deploy-azure.yml`, `deploy-pages.yml`, `python-publish.yml`):

- Set explicit least-privilege `permissions` at workflow or job level.
- Avoid `pull_request_target` unless explicitly required and reviewed.
- Never check out or execute untrusted PR code in a privileged context.
- Do not introduce unpinned actions in production workflows; pin to full-length commit SHAs.
- Use environment protection and required reviewers for deployment secrets (the `production` environment gates `deploy-azure.yml`).
- Prefer OIDC over long-lived cloud credentials.

## Commits, branches, and PRs

- Branch names: `feat/`, `fix/`, `docs/`, `ci/`, `chore/` prefix plus a short kebab-case slug.
- Commit messages: imperative mood, subject 72 characters or fewer, body explains why.
- One logical change per PR. Link the issue. Label breaking or risky changes.

## Copilot code review priorities

Review in this order: (1) security and privacy violations per this file, (2) correctness and missing tests — especially billing-threshold logic in `scripts/`, (3) API/schema/workflow stability including the four-place tool-ID sync, (4) maintainability and typing, (5) style.

## Pull request quality gate

Before proposing or finalizing a PR:

- Build passes or limitation stated
- Tests pass or limitation stated
- Lint/type checks pass or limitation stated
- Security/privacy review completed
- Docs updated when needed
- Risky or breaking changes clearly labeled
- Rollback or mitigation noted for operational changes

## Changelog

- 1.1.1 (2026-07-23): Adapted for MedSync8 — repo context (React/Express/FastAPI stack, tool-ID four-place sync, hash-only audit), billing-script anti-fabrication rules, repo-specific secrets list, workflow inventory. Skills rules omitted (no `.skill` packages in this repository).
- 1.1.0 (2026-07-03): Added Repository context, commit/branch/PR conventions, code review priorities, Part 2 records to exclusions, in-file versioning. Corrected source precedence so path-scoped instructions win for their paths.
- 1.0.0 (2026-06-28): Initial release.
