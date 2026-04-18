#!/usr/bin/env bash
# Operator setup: provision Fly app + secrets for medsync8-telepsych.
#
# What this does:
#   1. Validates required env vars are set (fails fast, no partial setup).
#   2. Creates the Fly app + 1GB volume in region `ord` if missing.
#   3. Sets all secrets (Anthropic, Cloudflare Access, audit salt, origins).
#   4. Deploys.
#   5. Tails /api/health to confirm.
#
# What this does NOT do:
#   - Create the Cloudflare Access application (do that in the dashboard).
#   - Create the Cloudflare Pages project (do that in the dashboard).
#   - Set GitHub repo secrets for the Pages deploy workflow.
#   - Sign any BAAs.
#
# Usage:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   export CF_ACCESS_TEAM_DOMAIN=nehpsychiatry.cloudflareaccess.com
#   export CF_ACCESS_AUD=<aud-tag-from-cf-dashboard>
#   export ALLOWED_ORIGINS=https://medsync8-telepsych.pages.dev
#   export AUDIT_SALT="$(openssl rand -hex 32)"      # rotate by redeploying with a new one
#   bash scripts/setup_prod.sh
#
# Safe to re-run: it only creates resources that don't exist.

set -euo pipefail

APP="${FLY_APP:-medsync8-telepsych}"
REGION="${FLY_REGION:-ord}"
VOLUME="${FLY_VOLUME:-corpus_data}"
VOLUME_SIZE_GB="${FLY_VOLUME_SIZE_GB:-1}"

red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

require_env() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    red "Missing required env var: $var"
    exit 1
  fi
}

blue "==> Validating environment"
require_env ANTHROPIC_API_KEY
require_env CF_ACCESS_TEAM_DOMAIN
require_env CF_ACCESS_AUD
require_env ALLOWED_ORIGINS
require_env AUDIT_SALT

if ! command -v fly >/dev/null 2>&1; then
  red "fly CLI not found. Install: curl -L https://fly.io/install.sh | sh"
  exit 1
fi

blue "==> Checking Fly auth"
if ! fly auth whoami >/dev/null 2>&1; then
  red "Not logged in to Fly. Run: fly auth login"
  exit 1
fi

blue "==> Ensuring app '$APP' exists"
if ! fly apps list --json 2>/dev/null | grep -q "\"Name\":\"$APP\""; then
  fly apps create "$APP" --org personal
  green "   created app $APP"
else
  green "   app $APP already exists"
fi

blue "==> Ensuring volume '$VOLUME' exists in $REGION"
if ! fly volumes list -a "$APP" --json 2>/dev/null | grep -q "\"name\":\"$VOLUME\""; then
  fly volumes create "$VOLUME" --region "$REGION" --size "$VOLUME_SIZE_GB" -a "$APP" --yes
  green "   created volume $VOLUME (${VOLUME_SIZE_GB}GB)"
else
  green "   volume $VOLUME already exists"
fi

blue "==> Setting secrets"
# --stage so we can deploy once at the end instead of rolling per-secret.
fly secrets set \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  CF_ACCESS_TEAM_DOMAIN="$CF_ACCESS_TEAM_DOMAIN" \
  CF_ACCESS_AUD="$CF_ACCESS_AUD" \
  ALLOWED_ORIGINS="$ALLOWED_ORIGINS" \
  AUDIT_SALT="$AUDIT_SALT" \
  -a "$APP" \
  --stage

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  blue "==> OPENAI_API_KEY set; keeping OpenAI embedder available as fallback"
  fly secrets set OPENAI_API_KEY="$OPENAI_API_KEY" -a "$APP" --stage
fi

blue "==> Deploying"
fly deploy -a "$APP"

blue "==> Verifying /api/health"
HOST="$(fly status -a "$APP" --json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)["Hostname"])' 2>/dev/null || echo "$APP.fly.dev")"
for i in 1 2 3 4 5 6; do
  if out=$(curl -fsS "https://$HOST/api/health" 2>/dev/null); then
    echo "$out" | python3 -m json.tool
    green "==> Done. Access enforcement:"
    echo "$out" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("   access_enforced =", d.get("access_enforced"))'
    echo "$out" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("   embedder        =", d.get("embedder"))'
    exit 0
  fi
  echo "   health not ready yet (attempt $i)..."
  sleep 10
done

red "Health check never succeeded. Run: fly logs -a $APP"
exit 1
