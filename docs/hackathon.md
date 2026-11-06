# Hackathon submission

## Track / freshness

Classic-style build: Relay Mesh application code and assets were created for this event. Allowed public dependencies are listed in [`AI_USAGE.md`](./AI_USAGE.md).

## Version control

History is incremental (crypto → relay → client → Railway → demo → anon-rpc worker → docs), not a single dump commit. First commit: [`40347e7`](https://github.com/KartikDehru/Relay-mesh/commit/40347e7).

## Required reading

| Doc | Why |
|-----|-----|
| [`README.md`](../README.md) | Guarantee, live hops, on-chain pin, Claims & Sources |
| [`docs/AI_USAGE.md`](./AI_USAGE.md) | ETHGlobal AI disclosure |
| [`docs/deploy.md`](./deploy.md) | Independent Railway account deploy steps |
| [`circuit-registry.json`](../circuit-registry.json) | Public keys + live URLs (no private keys) |
| [`packages/anon-rpc-worker/SPECIFIER.json`](../packages/anon-rpc-worker/SPECIFIER.json) | Worker hash + Sepolia specifier |

## Demo

- Local dashboard: `pnpm dev:demo`
- Live mesh: hop1 → hop2 → hop3 (see README Live table)
- Anon-RPC reference UI: https://ethereum.github.io/anon-rpc/demo/
- Pin Relay Mesh worker by hash / specifier from README **On-chain**

## Secrets policy

Private keys and Railway/GitHub tokens live only in local `.keys/` (gitignored) or platform secret stores. [`.env.example`](../.env.example) documents variables without values.
