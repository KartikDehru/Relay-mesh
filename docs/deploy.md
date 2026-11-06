# Deploy hops (Railway)

**Claim:** each relay node is deployed and billed under an **independent Railway account** (not five services under one project).

Fixed MVP circuit: **hop1 (entry) → hop2 (middle) → hop3 (exit)**. hop4 is a live spare; hop5 is reserved for later random 3-of-N selection.

## Prerequisites

- One Railway account per hop
- Railway CLI: `npm i -g @railway/cli`
- This repo
- Generated secrets in `.keys/hop-secrets.env` (gitignored) — produce with `pnpm generate-keys`

## Per-hop deploy

From the repo root, logged into that hop's Railway account:

```bash
railway login

./scripts/deploy-hop.sh hop1 entry   # account 1
./scripts/deploy-hop.sh hop2 middle  # account 2
./scripts/deploy-hop.sh hop3 exit    # account 3
./scripts/deploy-hop.sh hop4 any     # account 4
./scripts/deploy-hop.sh hop5 any     # account 5
```

Or in the Railway dashboard for each account:

1. **New Project** → deploy from GitHub (or empty + `railway up`) pointing at this repo.
2. Builder: **Dockerfile** at repo root (`railway.toml` already sets this).
3. Set variables:

| Variable | Value |
|----------|--------|
| `ROLE` | `entry` / `middle` / `exit` / `any` (informational; routing is content-addressed) |
| `RELAY_PRIVATE_KEY` | from `.keys/hop-secrets.env` for that hop |
| `RELAY_PUBLIC_KEY` | matching public key |
| `ALLOWED_HOP_URLS` | comma-separated hop base URLs this node may forward to |
| `EXIT_RPC_ALLOWLIST` | JSON map of chainId → https RPC URL; exit only calls exact matches |
| `CIRCUIT_REGISTRY_URL` | optional alternate source for hop allowlist at boot |
| `DEMO_LOGGING` | `false` (set `true` when capturing sealed demo observations) |
| `MIX_DELAY_MS_MIN` / `MIX_DELAY_MS_MAX` | optional timing blur (e.g. `40` / `180`) |
| `UPSTREAM_TIMEOUT_MS` | default `10000` |
| `RATE_LIMIT_PER_MINUTE` | default `60` on `/relay` |
| `PORT` | injected by Railway — do not hardcode |

4. Generate a public domain (`Settings → Networking → Generate Domain`).
5. Record the URL in the registry:

```bash
node scripts/set-registry-url.mjs hop1 https://YOUR-HOP1.up.railway.app
```

## Wire the fixed circuit

After hop1–hop3 have URLs in `circuit-registry.json`:

```bash
node scripts/check-hops.mjs
pnpm test:live
```

`NEXT_HOP_URL` is **optional** — the onion payload carries `nextHopUrl`.

## Secrets

Private keys never go in git. Public keys + URLs live in [`circuit-registry.json`](../circuit-registry.json).

## Verify

Open each hop's `/health` — should return `role`, `fingerprint`, and `publicKey`. Fingerprints must match the registry.
