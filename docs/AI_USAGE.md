# AI assistance disclosure

ETHGlobal transparency: AI tools assisted development of Relay Mesh. Architecture, product decisions, deployment, and verification were directed and reviewed by humans.

## Tools used

- **Cursor** (Composer / agent) — scaffolding, implementation, tests, deploy scripts, and UI iteration.
- **Claude** — early UI/design exploration for the demo; the shipped UI follows the project logo and product requirements.
- **Public docs via tooling** — Railway CLI, `@noble` crypto, Next.js, and the anon-rpc specification pages.

AI was not used for demo video voiceover. Claims & Sources citations are taken from published anon-rpc docs (not AI-invented).

## What AI assisted

| Area | Paths (representative) | Nature of assistance |
|------|------------------------|----------------------|
| Monorepo scaffold | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | Boilerplate under human direction |
| Onion crypto | `packages/crypto/**` | Sealed-box layering from the architecture spec |
| Relay server | `packages/relay-node/**` | Express hop, CORS, content-addressed peel/forward |
| Client + tests | `packages/client/**` | `sendViaRelayMesh`, local + live integration tests |
| Deploy tooling | `Dockerfile`, `railway.toml`, `scripts/**`, `docs/deploy.md` | Multi-account Railway deploy scripts |
| Circuit registry | `circuit-registry.json` | Public key/URL registry (no private keys) |
| Demo dashboard | `packages/demo/**` | Next.js before/after UI, light theme, how-it-works |
| Anon-RPC worker | `packages/anon-rpc-worker/**` | Worker bundle, publish script, specifier deploy |
| Docs | `README.md`, `docs/**` | Drafting and structuring; claims text human-approved |

## Human direction

- Product thesis: request-scoped 3-hop onion mesh in front of JSON-RPC / Anon-RPC’s network slot.
- Threat model and honesty constraints (limitations, independent Railway accounts, hash-pinned worker).
- Crypto choice: pure-JS `@noble/curves` + `@noble/ciphers` for Railway-friendly deploys.
- Ops: keypairs, independent Railway accounts, live hop verification.
- Design: logo/favicon, light theme, docs/nav targets.
- Verification: unit tests, local 3-hop, live Railway `eth_blockNumber`, manual demo checks.
- Citation policy: Claims & Sources kept aligned with published anon-rpc docs.

## Verification

```bash
pnpm test:crypto
pnpm test:integration
pnpm test:live
pnpm check-hops
pnpm --filter @relay-mesh/demo build
pnpm --filter @relay-mesh/anon-rpc-worker build
```

Live hops were health-checked and exercised end-to-end on hop1 → hop2 → hop3. On-chain `workerHash()` matches the published bundle keccak256.

## Reused (not invented for this build)

- Open-source libraries: `@noble/*`, Express, Next.js, React, Vitest, pnpm, TypeScript, Foundry.
- Public Ethereum RPC endpoints (e.g. publicnode) as exit upstreams.
- Public anon-rpc specification / demo documentation:
  - https://ethereum.github.io/anon-rpc/
  - https://ethereum.github.io/anon-rpc/spec/
  - https://ethereum.github.io/anon-rpc/networks/
  - https://ethereum.github.io/anon-rpc/demo/

No pre-existing private Relay Mesh codebase was imported. Application code and design assets in this repo were produced for this project.
