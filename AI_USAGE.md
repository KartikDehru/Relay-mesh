# AI Assistance Disclosure

This document satisfies ETHGlobal’s AI transparency rules: AI tools assisted development, but architecture, product decisions, deployment, and verification were directed and reviewed by the team.

## Tools used

- **Cursor** (Composer / agent) — primary coding assistant for scaffolding, implementation, tests, deploy scripts, and UI iteration.
- **Claude** (claude.ai artifact) — early UI/design exploration referenced for the demo; the shipped UI was rebuilt from the project logo and product requirements.
- **Public docs / models via tooling** — Railway CLI docs, `@noble` crypto docs, Next.js docs, anon-rpc public specification pages.

AI was **not** used for demo video voiceover (none yet). No AI-generated fake citations: Claims & Sources quotes are taken from published anon-rpc docs.

## What AI assisted

| Area | Paths (representative) | Nature of assistance |
|------|------------------------|----------------------|
| Monorepo scaffold | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | Boilerplate generation under team direction |
| Onion crypto | `packages/crypto/**` | Implementation of sealed-box layering from the team’s architecture spec |
| Relay server | `packages/relay-node/**` | Express hop server, CORS, content-addressed peel/forward |
| Client + tests | `packages/client/**` | `sendViaRelayMesh`, local + live integration tests |
| Deploy tooling | `Dockerfile`, `railway.toml`, `scripts/**`, `DEPLOY.md` | Multi-account Railway deploy scripts and configs |
| Circuit registry | `circuit-registry.json` | Public key/URL registry structure (no private keys) |
| Demo dashboard | `packages/demo/**` | Next.js before/after UI, light theme, nav, how-it-works page |
| Docs | `README.md`, `AI_USAGE.md`, Claims & Sources section | Drafting and structuring; claims text supplied/approved by the team |

## Human direction (team)

- Product thesis: request-scoped 3-hop onion mesh in front of JSON-RPC / Anon-RPC’s plug-in network slot.
- Threat model and honesty constraints (limitations section, independent Railway accounts claim, no overclaiming a published worker hash yet).
- Crypto choice: pure-JS `@noble/curves` + `@noble/ciphers` for Railway-friendly deploys.
- Ops: generating keypairs, creating four independent Railway accounts, providing tokens, verifying live hops.
- Design direction: logo/favicon assets, light-theme preference, remove event eyebrow, docs/nav targets.
- Verification: ran unit tests, local 3-hop integration, live Railway `eth_blockNumber`, manual demo UI checks.
- Citation policy: Claims & Sources wording kept verbatim as specified by the team against anon-rpc docs.

## Verification performed by humans / CI-local runs

```bash
pnpm test:crypto
pnpm test:integration
pnpm test:live
pnpm check-hops
pnpm --filter @relay-mesh/demo build
```

Live hops were health-checked and exercised end-to-end against the fixed circuit hop1 → hop2 → hop3.

## What was reused (not invented for this hackathon)

- Open-source libraries: `@noble/*`, Express, Next.js, React, Vitest, pnpm, TypeScript.
- Public Ethereum RPC endpoints (e.g. publicnode) as temporary exit upstreams.
- Public anon-rpc specification / demo documentation for Claims & Sources citations:
  - https://ethereum.github.io/anon-rpc/
  - https://ethereum.github.io/anon-rpc/spec/
  - https://ethereum.github.io/anon-rpc/networks/
  - https://ethereum.github.io/anon-rpc/demo/

No pre-existing private Relay Mesh codebase was imported. Project-specific application code and design assets for this repo were produced for this hackathon build.
