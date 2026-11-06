# `@relay-mesh/anon-rpc-worker`

Anon-rpc conforming worker (SPEC §3.2) that routes JSON-RPC `fetch` calls through the Relay Mesh 3-hop onion network.

Live pin (Sepolia): see [`SPECIFIER.json`](./SPECIFIER.json) and the root README **On-chain** section.

## Config schema (`WorkerInit.config`)

Optional plain JSON:

```json
{
  "hops": [{ "id": "hop1", "url": "https://…", "publicKey": "…" }, …],
  "pool": [{ "id": "hop4", "url": "https://…", "publicKey": "…" }, …],
  "honorIsolationKey": true
}
```

Defaults bake in the live hop1→hop2→hop3 Railway circuit. When `anonOptions.isolationKey` is set, the worker deterministically picks 3 hops from `pool` (default includes hop4).

## Build

```bash
pnpm --filter @relay-mesh/crypto build
pnpm --filter @relay-mesh/anon-rpc-worker build
# prints keccak256 → dist/worker-meta.json
```

## Publish bytes + pin on-chain

```bash
GITHUB_TOKEN=… pnpm --filter @relay-mesh/anon-rpc-worker publish:bundle
PRIVATE_KEY=0x… pnpm --filter @relay-mesh/anon-rpc-worker deploy:specifier
```

See `SPECIFIER.json` after deploy for the address to paste into a harness / the [anon-rpc demo](https://ethereum.github.io/anon-rpc/demo/).
