# Relay Mesh

**3-hop onion-routed relay network for private JSON-RPC calls.**

No single relay node ever sees both the original client's network identity **and** the plaintext RPC query. Request-scoped onion encryption (x25519 + XChaCha20-Poly1305) sits in front of an RPC endpoint.

**Decentralization claim:** each relay node is deployed and billed under an **independent Railway account**.

## Guarantee (one paragraph)

Relay Mesh wraps each JSON-RPC request in a nested sealed box so the entry hop sees only your IP and ciphertext, middle hops see only hop-to-hop ciphertext, and the exit hop sees the plaintext query without your original IP — then the response bubbles back unchanged. Encryption and the call to the entry hop happen in the browser; the Vercel demo never proxies relay traffic.

## Architecture

```
Browser client
   │  builds onion locally (@noble x25519 + XChaCha20-Poly1305)
   ▼
Hop1 entry ──encrypted blob──► Hop2 middle ──encrypted blob──► Hop3 exit ──JSON-RPC──► Target RPC
   ▲                                                                                      │
   └──────────────────────── response returns up the same chain ──────────────────────────┘
```

Fixed MVP circuit: **hop1 → hop2 → hop3**. hop4 is a live spare (hop5 pending). Optional random 3-of-N selection is in the demo dashboard.

## Live hops (independent Railway accounts)

| Hop | Role | URL |
|-----|------|-----|
| hop1 | entry | https://hop1-production-70b7.up.railway.app |
| hop2 | middle | https://hop2-production.up.railway.app |
| hop3 | exit | https://hop3-production.up.railway.app |
| hop4 | spare | https://hop4-production.up.railway.app |
| hop5 | spare | _pending_ |

Health: `GET /health` on each URL → `{ role, fingerprint, publicKey }`.

Public keys + URLs: [`circuit-registry.json`](./circuit-registry.json) (no private keys).

## Packages

| Package | Role |
|---------|------|
| `@relay-mesh/crypto` | Onion seal/open (`@noble/curves` + `@noble/ciphers`) — Node **and** browser |
| `@relay-mesh/relay-node` | HTTP hop (`POST /relay`, `GET /health`) |
| `@relay-mesh/client` | Node client + registry helpers |
| `@relay-mesh/demo` | Next.js before/after dashboard → **Vercel** |

## Quick start

```bash
pnpm install
pnpm test:crypto
pnpm test:integration          # local 3-hop
pnpm test:live                 # Railway hop1→hop2→hop3
pnpm --filter @relay-mesh/demo dev   # demo at http://localhost:3000
```

## Demo dashboard (Phase 3)

```bash
pnpm --filter @relay-mesh/demo dev
```

Deploy `packages/demo` to Vercel (Root Directory = `packages/demo`, or monorepo install via `vercel.json`). The UI:

1. Encrypts in-browser and POSTs to the entry hop (no Vercel API/Edge proxy).
2. Shows **Direct call**: IP + plaintext query linked.
3. Shows **Through Relay Mesh**: hop1 ciphertext vs hop3 plaintext without client IP.
4. Optional stretch: random 3-of-N circuit picker.

Mixing delay: set `MIX_DELAY_MS_MIN` / `MIX_DELAY_MS_MAX` on each Railway hop to blur timing correlation.

Railway deploy details: [`DEPLOY.md`](./DEPLOY.md).

## Claims & Sources

Relay Mesh's core claim is: Anon-RPC's own specification leaves the anonymizing
network's topology unspecified, and does not rule out a single operator seeing
both the client's identity and the request content. Relay Mesh is a concrete
multi-hop network built to provide that guarantee where the standard leaves it
optional, implemented as a worker that plugs into Anon-RPC's own interface.

This claim is based on the following, cited directly:

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

- anon-rpc live demo (reference implementation referred to above):
  https://ethereum.github.io/anon-rpc/demo/

In short: nothing in the standard requires that no single party sees both the
client's identity and the query content — that property depends entirely on
which network is plugged in. Relay Mesh is built to be that network.

## Limitations

1. **Operator set** — hops run on independent Railway *accounts*, but still the same hackathon team. Real decentralization needs unaffiliated operators.
2. **Adversary model** — protects against a party who sees a *subset* of hops. A global passive adversary watching every hop at once can still correlate traffic.
3. **Exit upstream** — exit hops currently forward to a public Ethereum RPC (`ethereum-sepolia-rpc.publicnode.com` / configurable). Anon-RPC itself is the worker/harness interface Relay Mesh plugs into — not a single RPC URL. Publishing a hash-pinned anon-rpc worker bundle + specifier contract is the next integration step.
4. **Browser→raw RPC CORS** — some public RPCs block browser `fetch`; the mesh entry hop allows CORS so the private path still works from the demo.

## AI disclosure

AI-assisted development is documented in [`AI_USAGE.md`](./AI_USAGE.md) (ETHGlobal transparency requirement). Hackathon submission notes: [`docs/HACKATHON.md`](./docs/HACKATHON.md).

## License

MIT — see [`LICENSE`](./LICENSE).
