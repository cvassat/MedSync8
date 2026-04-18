# MedSync8 Telepsychiatry Assistant — Runbook

Operational manual for the RAG-backed telepsychiatry workbench
(`frontend/src/App.jsx` + `backend/server.py`).

> **⚠️ HIPAA / PHI boundary.** This runbook covers the **non-PHI internal demo**
> deployment on Fly.io. Do not enter patient identifiers, diagnoses, or any
> PHI into the chat until all of these are true:
>
> 1. Anthropic BAA in place (enterprise / ZDR tier).
> 2. OpenAI BAA in place, **or** embeddings swapped to a local model (see
>    "HIPAA hardening" below).
> 3. Hosting BAA in place (AWS + BAA, Azure + BAA, or Fly.io Enterprise w/ BAA).
> 4. Access controls + audit logging enabled.
>
> Until then, this tool is for **general regulatory drafting with public regs
> in the corpus** — not patient-level clinical work.

---

## Architecture in one picture

```
Browser (App.jsx)
  │  POST /api/chat {tool, messages}
  ▼
FastAPI backend (backend/server.py)
  │
  ├──► Retriever (backend/retriever.py)
  │     ├─ reads corpus/ (MD/TXT/PDF)
  │     ├─ OpenAI text-embedding-3-small
  │     └─ cosine top-k, cached in corpus/index.json
  │
  └──► Anthropic Messages API (claude-opus-4-6)
           using role-specific system prompt + retrieved context
```

---

## Deploy to Fly.io (first time)

```bash
# one-time
brew install flyctl        # or: curl -L https://fly.io/install.sh | sh
fly auth login

# from repo root
fly launch --copy-config --no-deploy --name medsync8-telepsych
fly volumes create corpus_data --region ord --size 1

fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  OPENAI_API_KEY=sk-... \
  ALLOWED_ORIGINS=https://your-frontend.example.com

fly deploy
fly open      # opens the /api/health page
```

Expected health response after first boot (corpus will be empty until you sync
files to the volume — see next section):

```json
{"ok":true,"model":"claude-opus-4-6","rag_enabled":false,"corpus_chunks":0}
```

## Deploy updates

```bash
git push           # triggers CI
fly deploy         # rebuilds the image and rolls the machine
```

---

## Corpus management

### Local development

Drop `.md`, `.txt`, or `.pdf` files into `corpus/`. Restart the backend — it
will embed new/changed chunks and write `corpus/index.json`.

### Production (Fly volume)

The container mounts `corpus/` from a persistent volume at `/data/corpus`.
To add documents:

```bash
# List what's on the volume
fly ssh console -C "ls -la /data/corpus"

# Upload a single file
fly ssh sftp shell
> cd /data/corpus/federal
> put local_policy.pdf
> quit

# Or rsync a whole folder
fly ssh console -C "mkdir -p /data/corpus/state/tx"
rsync -av ./state_regs/tx/ root@medsync8-telepsych.fly.dev:/data/corpus/state/tx/ \
  -e "ssh -o ProxyCommand='fly ssh console --stdio'"
```

Then restart so the retriever re-indexes:

```bash
fly apps restart medsync8-telepsych
```

Embedding cost is ~$0.02 per 1M tokens with `text-embedding-3-small`; a fresh
re-index of a typical 200-doc corpus costs well under a dollar.

### Nuking the cache

If embeddings look stale (e.g. you changed the chunker):

```bash
fly ssh console -C "rm /data/corpus/index.json && kill 1"
```

---

## Secrets rotation

All secrets live in Fly. To rotate:

```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-NEW
fly secrets set OPENAI_API_KEY=sk-NEW
# Fly rolls the machine automatically after `secrets set`.
```

**Never** commit `.env` files or paste keys into chat messages. `.env`,
`frontend/.env`, and `corpus/index.json` are gitignored.

---

## Common failures and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/health` returns `rag_enabled: false` | Corpus empty or `OPENAI_API_KEY` missing | Add files to the volume; verify secret set |
| Frontend shows "Backend request failed (0)" | CORS or wrong `VITE_API_BASE` | Set `ALLOWED_ORIGINS` to include the frontend URL; rebuild frontend |
| 429 / rate limit from Anthropic | Traffic spike | `fly scale count 2` or add retry-with-backoff |
| Retriever returns nothing useful | Query wording mismatch | Check chunk content: `fly ssh console -C "cat /data/corpus/index.json \| jq '.chunks[0]'"` |
| `pypdf` extracts empty text from a PDF | Scanned / image-only PDF | OCR locally (e.g. `ocrmypdf`) before uploading |
| High memory use | Many large PDFs indexed at once | Upgrade VM: `fly scale memory 1024` |

## Monitoring

Fly built-ins:

```bash
fly logs                   # live logs
fly status                 # machine health
fly dashboard              # metrics in browser
```

Add application-level metrics (optional next step): wrap `/api/chat` with a
latency histogram + error counter and push to a Prometheus-compatible
endpoint, or use Fly's built-in metrics.

---

## HIPAA hardening checklist (before PHI traffic)

- [ ] Anthropic enterprise BAA signed, Zero Data Retention enabled.
- [ ] OpenAI BAA signed **OR** swap `backend/retriever.py._embed_batch` to a
      local model (`sentence-transformers/all-MiniLM-L6-v2` or `bge-small`) —
      about 10 lines of code and no external call for embeddings.
- [ ] Hosting migrated to BAA-covered tier (AWS + BAA, Azure, Fly Enterprise).
- [ ] SSO / identity provider gating `/api/chat` (Auth0, Clerk, or Cloudflare
      Access).
- [ ] Request/response audit log with user identity, timestamp, tool, and
      hash of query (not content) persisted 6+ years.
- [ ] Breach-notification plan documented.
- [ ] Minimum-necessary: strip session history older than N days.
- [ ] Corpus volume encrypted at rest (Fly volumes are encrypted by default;
      verify for other hosts).
- [ ] Annual risk assessment on file.

---

## On-call pager notes

Primary owner: @cvassat
Backup: _TBD_

P0 (app down): check `fly status`, then `fly logs`. Most common cause is an
expired API key — `fly secrets list` to check recency, rotate if unsure.

P1 (wrong answers / no citations): verify `corpus_chunks > 0` at `/api/health`.
If zero, the volume is empty or `OPENAI_API_KEY` is missing.

P2 (slow responses): check Anthropic status page; `fly scale count 2` to
parallelize if traffic is up.
