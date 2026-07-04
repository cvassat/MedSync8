# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Frontend (React + Vite + Express proxy)
```bash
npm install              # install dependencies
npm run dev              # start both Vite (5173) and Express (3001) concurrently
npm run dev:client       # Vite dev server only
npm run dev:server       # Express proxy only
npm run build            # production build to dist/
```

### Python Backend (FastAPI + RAG)
```bash
pip install -r backend/requirements-test.txt   # test deps (no torch, fast install)
pip install -r backend/requirements.txt         # full deps (includes sentence-transformers)
python -m pytest backend/tests -q              # run all backend tests
python -m pytest backend/tests/test_server.py -v  # run a single test file
python -m pytest backend/tests/test_audit.py::test_hash_query_deterministic_and_salted  # single test
uvicorn backend.server:app --port 8000         # run FastAPI locally
```

### CI
CI runs on every PR and push to main: `pytest backend/tests -q` (Python 3.11) and `npm run build` (Node 20) in parallel.

## Architecture

Two server options exist, sharing the same React frontend and the same five tool system prompts:

**Express proxy (`server.js`, port 3001)** — lightweight dev/simple deployment path. Proxies requests to Anthropic API with rate limiting (20 req/min), message sanitization (50KB cap), and server-side API key. Vite proxies `/api` to this during development.

**FastAPI backend (`backend/server.py`, port 8080)** — production path deployed via Azure Container Apps or Fly.io. Adds RAG retrieval over `corpus/` documents, Cloudflare Access JWT auth, and hash-only HIPAA-ready audit logging. The Dockerfile prefetches the bge-small-en-v1.5 embedding model (~130MB) at build time.

Both expose: `POST /api/claude` (or `/api/chat`), `POST /api/claude/stream`, `GET /api/health`.

### Frontend → Backend data flow
1. `src/api.js` calls `/api/claude/stream` via SSE
2. `server.js` validates the tool ID against `SYSTEM_PROMPTS`, sanitizes messages, streams via `anthropic.messages.stream()`
3. `src/App.jsx` appends chunks to the conversation via `setConversations` functional updaters (avoids stale closures during streaming)

### RAG pipeline (Python backend only)
`backend/retriever.py` indexes `corpus/` files → chunks with overlap → embeddings (local sentence-transformers or OpenAI) → cosine similarity search. Index cached to `corpus/index.json` keyed by embedder name. `backend/embedders.py` provides pluggable `Embedder` protocol (set `EMBED_BACKEND=local|openai`).

### Auth & Audit (Python backend only)
`backend/auth.py`: Optional Cloudflare Access JWT verification (enabled when `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` are set). `backend/audit.py`: Append-only JSONL log recording hashed queries (never raw text), user identity, tool, latency, and citation count.

## Key Conventions

- **Tool IDs** (`policy`, `supervision`, `lecture`, `chat`, `documentation`) are the central organizing concept. They're defined once in `src/constants.js` (TOOLS array, TOOL_COLORS, QUICK_PROMPTS, TEMPLATE_LIBRARY) and mirrored in `server.js` SYSTEM_PROMPTS and `backend/prompts.py` SYSTEM_PROMPTS. Also update the Pydantic `Literal` in `backend/server.py` ChatRequest. Add new tools in **all four places**.
- **TOOL_MAP** in `constants.js` provides O(1) lookups; use it instead of `TOOLS.find()`.
- **ERROR_PREFIX** (`⚠️`) in `constants.js` is the shared sentinel for error messages — used in `App.jsx` and `MessageBubble.jsx` to detect error state.
- **Streaming callbacks** (`sendMessage`) use `setConversations` functional updaters to avoid capturing stale `conversations` in the dependency array — this prevents callback recreation on every streaming chunk.
- Backend tests use `StubEmbedder` and `StubAnthropic` from `conftest.py` — no network calls needed.
- Python imports use relative form within the backend package (e.g., `from .audit import ChatAuditContext`).

## Security Notes

- **Express proxy**: Set `ALLOWED_ORIGIN` in production (defaults to localhost). `trust proxy 1` is set — verify your proxy hop count matches your infra.
- **FastAPI auth**: Set `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` for Cloudflare Access JWT validation. Without these, all endpoints are publicly accessible (dev only).
- **Audit salt**: Set `AUDIT_SALT` env var in production to a random secret. Without it, audit hashes are unsalted (warning is logged).
- **ANTHROPIC_API_KEY**: Express server will exit at startup if missing. FastAPI logs a warning.

## Environment Variables

Required: `ANTHROPIC_API_KEY`. See `.env.example` for all options. Copy to `.env` for local development. The Express server reads it via `dotenv/config`; the FastAPI backend reads it directly from `os.environ`.

## Azure Deployment (Container Apps)

Infrastructure lives in `azure/main.bicep`. The GitHub Actions workflow `.github/workflows/deploy-azure.yml` builds the image, pushes to GHCR, and deploys via Bicep on every push to `main`.

### One-time setup

```bash
# 1. Create a resource group
az group create -n medsync8-rg -l eastus

# 2. Create a service principal scoped to that group
az ad sp create-for-rbac \
  --name medsync8-deploy \
  --role Contributor \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/medsync8-rg \
  --sdk-auth
# Paste the JSON output as the AZURE_CREDENTIALS GitHub secret.

# 3. Create a GitHub PAT with read:packages scope for GHCR pull at runtime.
#    Store it as the GHCR_PULL_TOKEN GitHub secret.
```

### GitHub Actions secrets & variables

| Name | Kind | Value |
|---|---|---|
| `AZURE_CREDENTIALS` | Secret | Service principal JSON from step 2 |
| `ANTHROPIC_API_KEY` | Secret | `sk-ant-...` |
| `AUDIT_SALT` | Secret | Random 64-char hex |
| `GHCR_PULL_TOKEN` | Secret | GitHub PAT with `read:packages` |
| `AZURE_RESOURCE_GROUP` | Variable | `medsync8-rg` |
| `ALLOWED_ORIGINS` | Variable | `https://your-frontend.azurestaticapps.net` |
| `CF_ACCESS_TEAM_DOMAIN` | Variable | optional — Cloudflare Access domain |
| `CF_ACCESS_AUD` | Variable | optional — Cloudflare Access AUD tag |

### Manual deploy (without GitHub Actions)

```bash
cp azure/parameters.example.json azure/parameters.json
# Edit azure/parameters.json — fill in all placeholder values.
az deployment group create \
  -g medsync8-rg \
  --template-file azure/main.bicep \
  --parameters azure/parameters.json
```

### What gets deployed
- **Log Analytics workspace** — Container Apps log sink (90-day retention)
- **Storage account + Azure Files share** — persistent `/data` volume for corpus and audit log
- **Container Apps environment** — shared compute plane
- **Container App** — FastAPI backend, 1 vCPU / 2 GiB, scales 0→3 replicas on HTTP traffic

HIPAA note: Azure offers BAA agreements (see Microsoft HIPAA documentation). Enable at the subscription level before storing any PHI.
