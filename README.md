# Psychiatry AI Workbench

A clinical AI workbench for psychiatric practice — built with React + Express, powered by Claude.

## Features

- **Policy Generator** — Create legally defensible clinical policies and procedures with DEA/PDMP regulatory citations
- **Supervision Tools** — Generate NP/PA supervision checklists, competency assessments, and feedback frameworks
- **Lecture Builder** — Build CME-accredited educational content with learning objectives, case vignettes, and clinical pearls
- **Clinical Consult** — Expert consultation for telepsychiatry, controlled substance prescribing, and practice management
- **Template Library** — 8 pre-built templates for common clinical workflows
- **Save & Export** — Save responses locally, export to PDF, copy to clipboard
- **Persistent Storage** — Saved responses survive page refreshes (localStorage)

## Setup

### Prerequisites

- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
npm install
```

### Configuration

```bash
cp .env.example .env
```

Add your Anthropic API key to `.env`:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | **(Required)** Your Anthropic API key |
| `PORT` | Server port (default: 3001) |
| `ALLOWED_ORIGIN` | CORS origin (default: http://localhost:5173) |

### Running

```bash
npm run dev
```

This starts both the Vite frontend (port 5173) and Express API server (port 3001).

### GitHub Codespaces

This project includes a dev container configuration. Open it in GitHub Codespaces and both servers start automatically.

## Architecture

```
├── server.js              # Express API proxy (keeps API key server-side)
├── src/
│   ├── App.jsx            # Main workbench UI
│   ├── api.js             # Client-side API calls to /api/claude
│   ├── constants.js       # Tools, prompts, templates
│   ├── hooks/
│   │   └── useSavedResponses.js  # localStorage persistence
│   └── components/
│       ├── MessageBubble.jsx
│       └── Spinner.jsx
├── vite.config.js         # Vite + API proxy config
└── index.html
```

**Security**: The Anthropic API key never leaves the server. The Express proxy validates tool names, sanitizes messages, and enforces rate limits (20 req/min).

## Legacy App

The original Streamlit medication sync calculator is still available:

```bash
pip install -r requirements.txt
streamlit run med_sync_app_with_stripe.py
```

---

*Nuestra Esperanza Health · AI-assisted drafts require clinical review before use.*
