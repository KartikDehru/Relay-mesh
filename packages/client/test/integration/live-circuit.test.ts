import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCircuitRegistry,
  buildFixedCircuit,
  sendViaRelayMesh,
} from "../../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.resolve(__dirname, "../../../../circuit-registry.json");

const runLive = process.env.LIVE_CIRCUIT === "1" || process.env.LIVE_CIRCUIT === "true";

describe.runIf(runLive)("live fixed 3-hop circuit (Railway)", () => {
  it("eth_blockNumber via fixedCircuit hop1→hop2→hop3", async () => {
    const registry = loadCircuitRegistry(
      JSON.parse(readFileSync(registryPath, "utf8")),
    );
    const { circuit, rpcTargetUrl, hopIds } = buildFixedCircuit(registry);

    // Sanity: all three health endpoints
    for (const hop of circuit) {
      const health = await fetch(`${hop.url}/health`);
      expect(health.ok).toBe(true);
      const body = (await health.json()) as { ok: boolean; fingerprint: string };
      expect(body.ok).toBe(true);
      expect(body.fingerprint).toBeTruthy();
    }

    const result = (await sendViaRelayMesh(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
      circuit,
      rpcTargetUrl,
      { timeoutMs: 45_000 },
    )) as { result?: string; error?: unknown };

    expect(result.error).toBeUndefined();
    expect(result.result).toMatch(/^0x[0-9a-fA-F]+$/);
    console.log(
      `LIVE circuit [${hopIds.join(" → ")}] eth_blockNumber => ${result.result}`,
    );
  });
});
