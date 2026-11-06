# Relay Mesh

Relay Mesh is a **3-hop onion-routed relay network** for private JSON-RPC calls. No single relay ever sees both the client's network identity **and** the plaintext query.

- **Clients** build the onion in-browser or in Node (`x25519` + `XChaCha20-Poly1305`) and talk only to the entry hop.
- **Relays** peel one layer and forward content-addressed ciphertext; the exit sees the RPC but not the original client IP.
- **Operators** run hops under **independent Railway accounts** so billing and control are not a single project login.
- **Anon-RPC hosts** can pin the published worker by hash via an on-chain specifier.

## Live

| | |
|---|---|
| Hop 1 (entry) | https://hop1-production-70b7.up.railway.app |
| Hop 2 (middle) | https://hop2-production.up.railway.app |
| Hop 3 (exit) | https://hop3-production.up.railway.app |
| Hop 4 (spare) | https://hop4-production.up.railway.app |
| Circuit registry | [`circuit-registry.json`](./circuit-registry.json) |
| Demo dashboard | `pnpm dev:demo` → http://localhost:3000 |
| Anon-RPC reference demo | https://ethereum.github.io/anon-rpc/demo/ |
| Worker resolver (raw bytes) | [keccak path](https://raw.githubusercontent.com/KartikDehru/Relay-mesh/keccak/f9/85be89550e8fea776ff7a88a470b114a0420bdc3a204c1a21239dc117a2154) |

Health check any hop: `GET /health` → `{ role, fingerprint, publicKey }`.

Fixed MVP circuit: **hop1 → hop2 → hop3**. Hop 4 is a live spare; hop 5 is reserved. The demo can optionally pick a random 3-of-N circuit.

## On-chain (Sepolia)

| | |
|---|---|
| Worker keccak256 | `0xf985be89550e8fea776ff7a88a470b114a0420bdc3a204c1a21239dc117a2154` |
| Specifier | [`0x005d62b2fB2BbfB05d268990DA6c328F80de28D1`](https://sepolia.etherscan.io/address/0x005d62b2fB2BbfB05d268990DA6c328F80de28D1) |
| Deploy tx | [`0x356ed8d5…e7a6ed`](https://sepolia.etherscan.io/tx/0x356ed8d5e2a202533d43d1bc808c66cb9b90d4a63b826afb37ce74a286e7a6ed) |
| Worker update tx | [`0x91a92c4e…2088e0`](https://sepolia.etherscan.io/tx/0x91a92c4e43eb4f057a2be85a34440529e1f12ccd4cd09e42fc0a9a35a12088e0) |
| Metadata | [`packages/anon-rpc-worker/SPECIFIER.json`](./packages/anon-rpc-worker/SPECIFIER.json) |

Harnesses MUST reject any bytes whose `keccak256` does not equal `workerHash()`. Resolver URLs are advisory only.

Relay Mesh is published as a worker bundle at
`0xf985be89550e8fea776ff7a88a470b114a0420bdc3a204c1a21239dc117a2154`,
resolvable via specifier contract
[`0x005d62b2fB2BbfB05d268990DA6c328F80de28D1`](https://sepolia.etherscan.io/address/0x005d62b2fB2BbfB05d268990DA6c328F80de28D1)
(Sepolia).

## Why this network

Anon-RPC leaves the anonymizing network's topology unspecified and does not rule out a single operator seeing both identity and content. Relay Mesh is a concrete multi-hop network for that slot: nested sealed boxes, independent hop operators, and a hash-pinned worker that plugs into Anon-RPC's own interface.

### Claims & Sources

Cited directly from the standard:

- anon-rpc Specification, §1 (Overview) and §10 (KPS transport): the spec says a
  client "routes requests through an anonymity network" but never defines that
  network's structure. §10 states KPS "provides secure, multiplexed byte streams
  to a peer identified by a certificate hash," and that `remoteAddress` is
  informational and "MUST NOT be treated as authentication" — i.e., KPS secures
  one hop's transport, it is not itself an anonymity mechanism.
  https://ethereum.github.io/anon-rpc/spec/

- anon-rpc Specification, §14 (Security considerations): "Harness authors MUST
  treat worker code as untrusted." The spec names a compromised worker bundle and
  an untrusted distribution source as its only explicit adversaries — it does not
  name a network observer, colluding relays, or a logging RPC endpoint as
  adversaries it defends against.
  https://ethereum.github.io/anon-rpc/spec/

- anon-rpc Integration Guide: Anonymizing Networks: lists "a mixnet, onion
  router, RPC privacy relay" as examples of what can be plugged in, and states
  the hop structure "is up to the network," not the standard. It does not require
  independent operators or multiple hops for a plugged-in network to be accepted.
  https://ethereum.github.io/anon-rpc/networks/

- anon-rpc homepage / architecture overview: describes the worker receiving each
  request's URL and fetch init directly (i.e., the plaintext query), and states
  that `isolationKey` (an option expressing that calls should not be linkable)
  is honored "up to the worker" — the standard gives no guarantee here.
  https://ethereum.github.io/anon-rpc/

- anon-rpc live demo (reference implementation):
  https://ethereum.github.io/anon-rpc/demo/

In short: nothing in the standard requires that no single party sees both the
client's identity and the query content — that property depends entirely on
which network is plugged in. Relay Mesh is built to be that network.

## How it works

```
Browser / Node client
   │  builds onion locally (@noble x25519 + XChaCha20-Poly1305)
   ▼
Hop1 entry ──encrypted blob──► Hop2 middle ──encrypted blob──► Hop3 exit ──JSON-RPC──► Target RPC
   ▲                                                                                      │
   └──────────────────────── response returns up the same chain ──────────────────────────┘
```

1. The client seals the RPC body for exit, wraps that for middle, wraps again for entry.
2. Entry sees client IP + ciphertext only; middle sees hop-to-hop ciphertext only.
3. Exit opens the innermost box, forwards to the target RPC, and returns the response up the chain.
4. Optional mix delay (`MIX_DELAY_MS_MIN` / `MIX_DELAY_MS_MAX`) blurs timing correlation.
5. The Next.js demo encrypts in-browser and POSTs to entry — it never proxies relay traffic.

## Repo

| Path | What |
|---|---|
| [`packages/crypto`](./packages/crypto) | Onion seal/open (`@noble/curves` + `@noble/ciphers`) for Node and browser |
| [`packages/relay-node`](./packages/relay-node) | HTTP hop (`POST /relay`, `GET /health`) |
| [`packages/client`](./packages/client) | Node client + registry helpers + integration tests |
| [`packages/demo`](./packages/demo) | Next.js before/after dashboard |
| [`packages/anon-rpc-worker`](./packages/anon-rpc-worker) | Hash-pinned anon-rpc worker + `WorkerSpecifier` |
| [`circuit-registry.json`](./circuit-registry.json) | Public keys + live hop URLs (no private keys) |
| [`docs/`](./docs) | Deploy guide, hackathon notes, AI disclosure |
| [`scripts/`](./scripts) | Hop deploy, registry, and health helpers |

## Run it

Needs Node ≥ 20 and [pnpm](https://pnpm.io) (via Corepack).

```bash
git clone https://github.com/KartikDehru/Relay-mesh.git
cd Relay-mesh
pnpm install
pnpm test:crypto
pnpm test:integration          # local 3-hop
pnpm test:live                 # live Railway hop1→hop2→hop3
pnpm check-hops
pnpm dev:demo                  # http://localhost:3000
```

Build the anon-rpc worker bundle (prints keccak256):

```bash
pnpm --filter @relay-mesh/crypto build
pnpm --filter @relay-mesh/anon-rpc-worker build
```

## Deploy

- **Hops** — independent Railway accounts, Dockerfile at repo root. Step-by-step: [`docs/deploy.md`](./docs/deploy.md).
- **Demo** — deploy `packages/demo` to Vercel (root directory `packages/demo`, or monorepo build via `packages/demo/vercel.json`).
- **Worker bytes** — orphan `keccak` branch at content-addressed path; pin with `WorkerSpecifier` on Sepolia (see [`packages/anon-rpc-worker`](./packages/anon-rpc-worker)).

Env templates: [`.env.example`](./.env.example). Secrets stay in platform stores or local `.keys/` (gitignored).

## Current limitations

1. **Operator set** — hops use independent Railway *accounts*, but operators can still be affiliated. Stronger decentralization needs unaffiliated operators.
2. **Adversary model** — protects against a party who sees a *subset* of hops. A global passive adversary watching every hop can still attempt traffic correlation.
3. **Exit upstream** — exits forward to a public Ethereum RPC (e.g. `ethereum-sepolia-rpc.publicnode.com`). Anon-RPC is the worker/harness interface; the exit RPC is separate.
4. **Browser CORS** — some public RPCs block browser `fetch`; the mesh entry hop allows CORS so the private path works from the demo.
5. **Hop 5** — reserved slot; not deployed yet.

## Hackathon

Built for ETHGlobal. First commit: [`40347e7`](https://github.com/KartikDehru/Relay-mesh/commit/40347e7). Submission checklist and links: [`docs/hackathon.md`](./docs/hackathon.md). AI assistance disclosure: [`docs/AI_USAGE.md`](./docs/AI_USAGE.md).

## License

MIT — see [`LICENSE`](./LICENSE).
