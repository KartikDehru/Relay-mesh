# `@relay-mesh/anon-rpc-worker`

Anon-rpc conforming worker (SPEC §3.2) that routes JSON-RPC `fetch` calls through the Relay Mesh 3-hop onion network.

Live pin (Sepolia): see [`SPECIFIER.json`](./SPECIFIER.json) and the root README **[Use it with Anon-RPC](../../README.md#use-it-with-anon-rpc)** / **On-chain** sections.

## Try it in the official Anon-RPC demo

Open [https://ethereum.github.io/anon-rpc/demo/](https://ethereum.github.io/anon-rpc/demo/):

1. **Worker** → `Custom — paste a specifier`.
2. **Bootstrap RPC URL** → `https://ethereum-sepolia-rpc.publicnode.com`.
3. **Worker RPC URL** → click **use same**.
4. **Specifier contract** → `0x005d62b2fB2BbfB05d268990DA6c328F80de28D1`.
5. **Worker config** → leave blank (defaults to hop1 → hop2 → hop3).
6. **Address** → any Sepolia address (e.g. `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`).
7. Click **Start watching**.

Confirmed: balance loads through the sandboxed worker. Full wallet/dApp integration notes are in the root [Use it with Anon-RPC](../../README.md#use-it-with-anon-rpc) section.

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
