import { describe, it, expect, afterEach } from "vitest";
import type { Server } from "node:http";
import { createServer } from "node:http";
import {
  generateKeypair,
  generateReplyKey,
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

    // Forward hop times out against a hanging next hop (exit path also uses
    // the same AbortController helper).
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
