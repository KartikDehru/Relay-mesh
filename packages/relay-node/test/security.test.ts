import { describe, it, expect, afterEach } from "vitest";
import type { Server } from "node:http";
import { createServer } from "node:http";
import {
  generateKeypair,
  generateReplyKey,
  generateDemoKey,
  openObservation,
  openReply,
  sealLayer,
} from "@relay-mesh/crypto";
import { createApp } from "../src/server.js";
import type { RelayConfig } from "../src/config.js";

type Listening = { server: Server; port: number; base: string };

function listen(app: ReturnType<typeof createApp>): Promise<Listening> {
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

/** Local mock JSON-RPC — no network. Echoes id and a fixed result. */
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
        /* keep default id */
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id, result: "0x1234" }),
      );
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

function baseCfg(
  privateKey: string,
  publicKey: string,
  overrides: Partial<RelayConfig> = {},
): RelayConfig {
  return {
    role: "any",
    privateKey,
    publicKey,
    port: 0,
    nextHopUrl: undefined,
    demoLogging: false,
    mixDelayMsMin: 0,
    mixDelayMsMax: 0,
    allowedHopUrls: new Set(),
    exitRpcAllowlist: new Set(["https://ethereum-sepolia-rpc.publicnode.com"]),
    upstreamTimeoutMs: 10_000,
    rateLimitPerMinute: 1000,
    ...overrides,
  };
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        }),
    ),
  );
});

describe("SSRF / allowlist guards", () => {
  it("rejects forward to a non-allowlisted URL with 400", async () => {
    const kp = generateKeypair();
    const app = createApp(
      baseCfg(kp.privateKey, kp.publicKey, {
        allowedHopUrls: new Set(["http://127.0.0.1:3999"]),
      }),
    );
    const { server, base } = await listen(app);
    servers.push(server);

    const payload = sealLayer(kp.publicKey, {
      nextHopUrl: "http://evil.example/steal",
      innerBlob: "deadbeef",
    });
    const res = await fetch(`${base}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; detail?: string };
    expect(body.error).toBe("Relay hop failed");
    expect(body.detail).toBeUndefined();
  });

  it("rejects exit to a non-allowlisted target with 400", async () => {
    const kp = generateKeypair();
    const app = createApp(baseCfg(kp.privateKey, kp.publicKey));
    const { server, base } = await listen(app);
    servers.push(server);

    const payload = sealLayer(kp.publicKey, {
      rpcTargetUrl: "https://evil.example/rpc",
      rpcPayload: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      replyKey: generateReplyKey(),
    });
    const res = await fetch(`${base}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; detail?: string };
    expect(body.error).toBe("Relay hop failed");
    expect(body.detail).toBeUndefined();
  });

  it("rejects http exit targets unless allowInsecureTargetsForTests is set", async () => {
    const mock = await startMockRpc();
    servers.push(mock.server);
    const kp = generateKeypair();
    const app = createApp(
      baseCfg(kp.privateKey, kp.publicKey, {
        exitRpcAllowlist: new Set([mock.base]),
        // flag intentionally omitted
      }),
    );
    const { server, base } = await listen(app);
    servers.push(server);

    const payload = sealLayer(kp.publicKey, {
      rpcTargetUrl: mock.base,
      rpcPayload: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      replyKey: generateReplyKey(),
    });
    const res = await fetch(`${base}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 504 on upstream timeout", async () => {
    const hang = createServer((_req, _res) => {
      /* never responds */
    });
    await new Promise<void>((resolve) => {
      hang.listen(0, "127.0.0.1", () => resolve());
    });
    servers.push(hang);
    const hangAddr = hang.address();
    if (!hangAddr || typeof hangAddr === "string") throw new Error("no hang port");

    const kp = generateKeypair();
    const hangHttp = `http://127.0.0.1:${hangAddr.port}`;
    const app = createApp(
      baseCfg(kp.privateKey, kp.publicKey, {
        allowedHopUrls: new Set([hangHttp]),
        upstreamTimeoutMs: 80,
      }),
    );
    const { server, base } = await listen(app);
    servers.push(server);

    const payload = sealLayer(kp.publicKey, {
      nextHopUrl: hangHttp,
      innerBlob: "ignored",
    });
    const res = await fetch(`${base}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    expect(res.status).toBe(504);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Relay hop failed");
  });
});

describe("health provenance", () => {
  it("GET /health includes version and commit", async () => {
    const kp = generateKeypair();
    const prev = process.env.RAILWAY_GIT_COMMIT_SHA;
    process.env.RAILWAY_GIT_COMMIT_SHA = "abcdef0123456789deadbeef";
    try {
      const app = createApp(baseCfg(kp.privateKey, kp.publicKey));
      const { server, base } = await listen(app);
      servers.push(server);
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        version?: string;
        commit?: string;
        ok?: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(body.commit).toBe("abcdef0123456789deadbeef");
    } finally {
      if (prev === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
      else process.env.RAILWAY_GIT_COMMIT_SHA = prev;
    }
  });
});

describe("demo mode", () => {
  it("GET /whoami only when DEMO_LOGGING=true", async () => {
    const kp = generateKeypair();
    const off = createApp(baseCfg(kp.privateKey, kp.publicKey));
    const a = await listen(off);
    servers.push(a.server);
    expect((await fetch(`${a.base}/whoami`)).status).toBe(404);

    const on = createApp(
      baseCfg(kp.privateKey, kp.publicKey, { demoLogging: true }),
    );
    const b = await listen(on);
    servers.push(b.server);
    const res = await fetch(`${b.base}/whoami`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { observedIp?: string };
    expect(typeof body.observedIp).toBe("string");
  });

  it("exit seals an observation when x-relay-demo: 1", async () => {
    const mock = await startMockRpc();
    servers.push(mock.server);

    const kp = generateKeypair();
    const demoKey = generateDemoKey();
    const replyKey = generateReplyKey();
    const app = createApp(
      baseCfg(kp.privateKey, kp.publicKey, {
        demoLogging: true,
        exitRpcAllowlist: new Set([mock.base]),
        allowInsecureTargetsForTests: true,
      }),
    );
    const { server, base } = await listen(app);
    servers.push(server);

    const payload = sealLayer(kp.publicKey, {
      rpcTargetUrl: mock.base,
      rpcPayload: {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      },
      replyKey,
      demoKey,
    });
    const res = await fetch(`${base}/relay`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-demo": "1",
      },
      body: JSON.stringify({ payload }),
    });
    expect(res.status).toBe(200);
    const wire = (await res.json()) as {
      payload?: string;
      observations?: string[];
    };
    expect(typeof wire.payload).toBe("string");
    expect(Array.isArray(wire.observations)).toBe(true);
    expect(wire.observations!.length).toBe(1);
    const obs = openObservation(demoKey, wire.observations![0]!);
    expect(obs.layerType).toBe("exit");
    expect(obs.sawPlaintextQuery).toBe(true);

    const opened = openReply(replyKey, wire.payload!);
    expect(opened.status).toBe(200);
    const rpc = JSON.parse(opened.body) as { result?: string; id?: number };
    expect(rpc.result).toBe("0x1234");
    expect(rpc.id).toBe(1);
  });
});
