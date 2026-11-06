# Relay Mesh — Phase 2 Railway Deployment

**Claim:** each relay node is deployed and billed under an **independent Railway account** (not five services under one project).

Fixed MVP circuit: **hop1 (entry) → hop2 (middle) → hop3 (exit)**. hop4 and hop5 are live spares for later random 3-of-5 selection.

## Prerequisites

- 5 Railway accounts (email / GitHub identities)
- Railway CLI: `npm i -g @railway/cli`
- This repo + generated secrets in `.keys/hop-secrets.env` (gitignored)

## Per-hop deploy (repeat × 5)

On each account, from the repo root:

```bash
# Login as that hop's independent account
railway login

# Deploy
./scripts/deploy-hop.sh hop1 entry   # account 1
./scripts/deploy-hop.sh hop2 middle  # account 2
./scripts/deploy-hop.sh hop3 exit    # account 3
./scripts/deploy-hop.sh hop4 any     # account 4
./scripts/deploy-hop.sh hop5 any     # account 5
```

Or manually in the Railway dashboard for each account:

1. **New Project** → **Deploy from GitHub** (or empty + `railway up`) pointing at this repo.
2. Builder: **Dockerfile** at repo root (`railway.toml` already sets this).
3. Set variables:

| Variable | Value |
|----------|--------|
| `ROLE` | `entry` / `middle` / `exit` / `any` (informational; routing is content-addressed) |
| `RELAY_PRIVATE_KEY` | from `.keys/hop-secrets.env` for that hop |
| `RELAY_PUBLIC_KEY` | matching public key |
| `EXIT_RPC_URL` | `https://ethereum-sepolia-rpc.publicnode.com` (all hops) |
| `DEMO_LOGGING` | `false` (set `true` only on exit for Phase 3 capture) |
| `PORT` | injected by Railway — do not hardcode |

4. Generate a public domain (`Settings → Networking → Generate Domain`).
5. Record the URL:

```bash
node scripts/set-registry-url.mjs hop1 https://YOUR-HOP1.up.railway.app
```

## Wire the fixed circuit

After hop1–hop3 have URLs in `circuit-registry.json`:

```bash
node scripts/check-hops.mjs
LIVE_CIRCUIT=1 pnpm test:integration
```

`NEXT_HOP_URL` is **optional** — the onion payload carries `nextHopUrl`. Setting it as a fallback is fine but not required for the MVP.

## Env cheat-sheet (from `.keys/hop-secrets.env`)

Private keys never go in git. Public keys + URLs live in `circuit-registry.json`.

## Verify in a browser

Open each hop's `/health` — should return `role`, `fingerprint`, and `publicKey`. Fingerprints must match the registry.
