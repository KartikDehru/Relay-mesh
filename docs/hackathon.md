# Hackathon submission notes

## Track / freshness

Classic-style build: project-specific Relay Mesh code and assets were created for this hackathon. Allowed public dependencies (Noble, Express, Next.js, etc.) are listed in `AI_USAGE.md`.

## Version control

History is intentional and incremental (crypto → relay → client tests → Railway → demo → docs), not a single dump commit.

## Required reading for judges

| Doc | Why |
|-----|-----|
| [`README.md`](../README.md) | Guarantee, architecture, live hop URLs, Claims & Sources |
| [`AI_USAGE.md`](../AI_USAGE.md) | ETHGlobal AI disclosure |
| [`DEPLOY.md`](../DEPLOY.md) | Independent Railway account deploy steps |
| [`circuit-registry.json`](../circuit-registry.json) | Public keys + live URLs (no private keys) |

## Demo

- Local dashboard: `pnpm dev:demo`
- Live mesh: hop1 → hop2 → hop3 (see README table)
- anon-rpc reference demo (standard, not our worker yet): https://ethereum.github.io/anon-rpc/demo/

## Secrets policy

Private keys and Railway/GitHub tokens live only in local `.keys/` (gitignored) or platform secret stores. `.env.example` documents variables without values.
