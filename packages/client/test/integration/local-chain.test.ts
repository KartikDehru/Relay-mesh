import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeypair } from "@relay-mesh/crypto";
import { sendViaRelayMesh } from "../../src/send.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const relayEntry = path.resolve(
  repoRoot,
  "packages/relay-node/src/index.ts",
);

const EXIT_RPC_URL =
  process.env.EXIT_RPC_URL ??
  process.env.SEPOLIA_RPC_URL ??
  "https://ethereum-sepolia-rpc.publicnode.com";

type Hop = {
  port: number;
  role: "entry" | "middle" | "exit";
  keypair: ReturnType<typeof generateKeypair>;
  proc?: ChildProcess;
};

async function waitForHealth(port: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
      lastErr = `status ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Hop on :${port} never became healthy (${lastErr})`);
}

function startHop(hop: Hop, envExtra: Record<string, string>): ChildProcess {
  const proc = spawn(
    "pnpm",
    ["exec", "tsx", relayEntry],
    {
      cwd: path.resolve(repoRoot, "packages/relay-node"),
      env: {
        ...process.env,
        ROLE: hop.role,
        PORT: String(hop.port),
        RELAY_PRIVATE_KEY: hop.keypair.privateKey,
        RELAY_PUBLIC_KEY: hop.keypair.publicKey,
        ...envExtra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  proc.stdout?.on("data", (buf: Buffer) => {
    process.stdout.write(`[hop${hop.port}] ${buf.toString()}`);
  });
  proc.stderr?.on("data", (buf: Buffer) => {
    process.stderr.write(`[hop${hop.port}:err] ${buf.toString()}`);
  });

  return proc;
}

describe("local 3-hop chain", () => {
  const hops: Hop[] = [
    { port: 4001, role: "entry", keypair: generateKeypair() },
    { port: 4002, role: "middle", keypair: generateKeypair() },
    { port: 4003, role: "exit", keypair: generateKeypair() },
  ];

  beforeAll(async () => {
    hops[0]!.proc = startHop(hops[0]!, {
      NEXT_HOP_URL: `http://127.0.0.1:${hops[1]!.port}`,
    });
    hops[1]!.proc = startHop(hops[1]!, {
      NEXT_HOP_URL: `http://127.0.0.1:${hops[2]!.port}`,
    });
    hops[2]!.proc = startHop(hops[2]!, {
      EXIT_RPC_URL,
    });

    await Promise.all(hops.map((h) => waitForHealth(h.port)));
  }, 45_000);

  afterAll(async () => {
    for (const h of hops) {
      if (!h.proc || h.proc.killed) continue;
      h.proc.kill("SIGTERM");
    }
    // Give processes a moment to exit
    await new Promise((r) => setTimeout(r, 300));
  });

  it("returns a valid eth_blockNumber through the onion chain", async () => {
    const circuit = [
      {
        url: `http://127.0.0.1:${hops[0]!.port}`,
        publicKey: hops[0]!.keypair.publicKey,
      },
      {
        url: `http://127.0.0.1:${hops[1]!.port}`,
        publicKey: hops[1]!.keypair.publicKey,
      },
      {
        url: `http://127.0.0.1:${hops[2]!.port}`,
        publicKey: hops[2]!.keypair.publicKey,
      },
    ] as const;

    const rpcPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    };

    const result = (await sendViaRelayMesh(
      rpcPayload,
      [...circuit],
      EXIT_RPC_URL,
      { timeoutMs: 30_000 },
    )) as { jsonrpc?: string; id?: number; result?: string; error?: unknown };

    expect(result.error).toBeUndefined();
    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(1);
    expect(typeof result.result).toBe("string");
    expect(result.result).toMatch(/^0x[0-9a-fA-F]+$/);

    const blockNum = parseInt(result.result!, 16);
    expect(blockNum).toBeGreaterThan(0);
    console.log(`eth_blockNumber via mesh => ${result.result} (${blockNum})`);
  });
});
