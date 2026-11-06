import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { generateKeypair } from "@relay-mesh/crypto";
import { createApp } from "../../../relay-node/src/server.js";
import type { RelayConfig } from "../../../relay-node/src/config.js";
import { sendViaRelayMesh } from "../../src/send.js";

type Listening = { server: Server; port: number; base: string };

function listenApp(app: ReturnType<typeof createApp>): Promise<Listening> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no port");
      resolve({
        server,
        port: addr.port,
        base: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

/** Offline mock JSON-RPC — returns a fixed eth_blockNumber-shaped result. */
function startMockRpc(): Promise<Listening> {
  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let id: unknown = 1;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          id?: unknown;
        };
        if (body.id !== undefined) id = body.id;
      } catch {
        /* keep default */
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: "0x1234" }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no port");
      resolve({
        server,
        port: addr.port,
        base: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

async function closeServers(servers: Server[]): Promise<void> {
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        }),
    ),
  );
}

function makeCfg(
  role: RelayConfig["role"],
  keypair: ReturnType<typeof generateKeypair>,
  allowedHopUrls: Set<string>,
  mockRpcUrl: string,
): RelayConfig {
  return {
    role,
    privateKey: keypair.privateKey,
    publicKey: keypair.publicKey,
    port: 0,
    nextHopUrl: undefined,
    demoLogging: false,
    mixDelayMsMin: 0,
    mixDelayMsMax: 0,
    allowedHopUrls,
    exitRpcAllowlist: new Set([mockRpcUrl]),
    upstreamTimeoutMs: 10_000,
    rateLimitPerMinute: 1000,
    // Test-only — never wired through loadConfig / env.
    allowInsecureTargetsForTests: true,
  };
}

type MeshFixture = {
  servers: Server[];
  mockRpcUrl: string;
  circuit: Array<{ url: string; publicKey: string }>;
};

/**
 * Start N in-process hops + a local mock RPC.
 * Shared allowlist Set is mutated after each listen so every hop accepts peers.
 */
async function startMesh(hopCount: 3 | 4): Promise<MeshFixture> {
  const servers: Server[] = [];
  const mock = await startMockRpc();
  servers.push(mock.server);
  const mockRpcUrl = mock.base;

  const roles: RelayConfig["role"][] =
    hopCount === 3
      ? ["entry", "middle", "exit"]
      : ["entry", "middle", "middle", "exit"];
  const keypairs = roles.map(() => generateKeypair());
  const sharedAllow = new Set<string>();
  const circuit: Array<{ url: string; publicKey: string }> = [];

  for (let i = 0; i < hopCount; i++) {
    const app = createApp(
      makeCfg(roles[i]!, keypairs[i]!, sharedAllow, mockRpcUrl),
    );
    const listening = await listenApp(app);
    servers.push(listening.server);
    sharedAllow.add(listening.base);
    circuit.push({
      url: listening.base,
      publicKey: keypairs[i]!.publicKey,
    });
  }

  return { servers, mockRpcUrl, circuit };
}

describe("local 3-hop chain", () => {
  let fixture: MeshFixture;

  beforeAll(async () => {
    fixture = await startMesh(3);
  }, 30_000);

  afterAll(async () => {
    await closeServers(fixture.servers);
  });

  it("returns a valid eth_blockNumber through the onion chain", async () => {
    const result = (await sendViaRelayMesh(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
      fixture.circuit,
      fixture.mockRpcUrl,
      { timeoutMs: 15_000 },
    )) as { jsonrpc?: string; id?: number; result?: string; error?: unknown };

    expect(result.error).toBeUndefined();
    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(1);
    expect(result.result).toBe("0x1234");
  });

  it("entry/middle wire body is sealed ciphertext, not JSON-RPC plaintext", async () => {
    const { buildOnion } = await import("@relay-mesh/crypto");
    const { onion } = buildOnion(
      { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
      fixture.circuit,
      fixture.mockRpcUrl,
    );

    const res = await fetch(`${fixture.circuit[0]!.url}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: onion }),
    });
    expect(res.status).toBe(200);
    const wire = (await res.json()) as {
      payload?: string;
      jsonrpc?: string;
      result?: string;
    };
    expect(wire.jsonrpc).toBeUndefined();
    expect(wire.result).toBeUndefined();
    expect(typeof wire.payload).toBe("string");
    expect(wire.payload!.length).toBeGreaterThan(32);
  });
});

describe("local 4-hop chain", () => {
  let fixture: MeshFixture;

  beforeAll(async () => {
    fixture = await startMesh(4);
  }, 30_000);

  afterAll(async () => {
    await closeServers(fixture.servers);
  });

  it("returns eth_blockNumber through 4 hops", async () => {
    const result = (await sendViaRelayMesh(
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      fixture.circuit,
      fixture.mockRpcUrl,
      { timeoutMs: 15_000 },
    )) as { result?: string; error?: unknown };

    expect(result.error).toBeUndefined();
    expect(result.result).toBe("0x1234");
  });
});
