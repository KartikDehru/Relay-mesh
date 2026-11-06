#!/usr/bin/env bash
# Deploy one Relay Mesh hop to the *currently logged-in* Railway account.
# Repeat under 5 different Railway accounts (or with 5 different RAILWAY_TOKENs).
#
# Usage:
#   export RAILWAY_TOKEN=...          # token for THIS hop's independent account
#   ./scripts/deploy-hop.sh hop1 entry
#   ./scripts/deploy-hop.sh hop2 middle
#   ./scripts/deploy-hop.sh hop3 exit
#   ./scripts/deploy-hop.sh hop4 any
#   ./scripts/deploy-hop.sh hop5 any
#
# After deploy, copy the public URL into circuit-registry.json for that hop.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOP_ID="${1:-}"
ROLE="${2:-any}"
SECRETS="$ROOT/.keys/hop-secrets.env"
EXIT_RPC_URL_DEFAULT="https://ethereum-sepolia-rpc.publicnode.com"

if [[ -z "$HOP_ID" ]]; then
  echo "Usage: $0 <hop1|hop2|hop3|hop4|hop5> [role]"
  exit 1
fi

if [[ ! -f "$SECRETS" ]]; then
  echo "Missing $SECRETS — run: pnpm generate-keys 5 and save privates there"
  exit 1
fi

# shellcheck disable=SC1090
source "$SECRETS"

PRIV_VAR="${HOP_ID}_RELAY_PRIVATE_KEY"
PUB_VAR="${HOP_ID}_RELAY_PUBLIC_KEY"
PRIV="${!PRIV_VAR:-}"
PUB="${!PUB_VAR:-}"
EXIT_RPC_URL="${EXIT_RPC_URL:-$EXIT_RPC_URL_DEFAULT}"

if [[ -z "$PRIV" || -z "$PUB" ]]; then
  echo "Missing keys for $HOP_ID in $SECRETS"
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: npm i -g @railway/cli"
  exit 1
fi

cd "$ROOT"

PROJECT_NAME="relay-mesh-${HOP_ID}"
echo "==> Deploying $PROJECT_NAME (ROLE=$ROLE) under current Railway account"

# Create / link project (idempotent-ish)
if ! railway status >/dev/null 2>&1; then
  railway init --name "$PROJECT_NAME" || railway link
fi

railway variables set \
  "ROLE=$ROLE" \
  "RELAY_PRIVATE_KEY=$PRIV" \
  "RELAY_PUBLIC_KEY=$PUB" \
  "EXIT_RPC_URL=$EXIT_RPC_URL" \
  "DEMO_LOGGING=false" \
  "MIX_DELAY_MS_MIN=0" \
  "MIX_DELAY_MS_MAX=0"

echo "==> Uploading..."
railway up --detach

echo "==> Ensuring public domain..."
railway domain || true

echo ""
echo "Done. Fetch URL with: railway domain"
echo "Then set nodes[].url for $HOP_ID in circuit-registry.json"
echo "Health check: curl https://<url>/health"
