import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  openLayer,
  publicKeyFingerprint,
  publicKeyFromPrivate,
  sealReply,
} from "@relay-mesh/crypto";
import type { RelayConfig } from "./config.js";

type ForwardLayer = {
  nextHopUrl: string;
  innerBlob: string;
};

type ExitLayer = {
  rpcTargetUrl: string;
  rpcPayload: unknown;
  replyKey: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeMixDelay(cfg: RelayConfig): Promise<void> {
  const { mixDelayMsMin: min, mixDelayMsMax: max } = cfg;
  if (max <= 0 || max < min) return;
  const delay = min + Math.floor(Math.random() * (max - min + 1));
  if (delay > 0) await sleep(delay);
}

function byteLength(data: unknown): number {
  if (typeof data === "string") return Buffer.byteLength(data, "utf8");
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

function logRequest(
  role: string,
  bytesIn: number,
  bytesOut: number,
  started: number,
  status: number,
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      role,
      bytesIn,
      bytesOut,
      status,
      ms: Date.now() - started,
    }),
  );
}

function isExitLayer(layer: unknown): layer is ExitLayer {
  if (!layer || typeof layer !== "object") return false;
  const o = layer as Record<string, unknown>;
  return (
    "rpcPayload" in o &&
    typeof o.replyKey === "string" &&
    !("innerBlob" in o)
  );
}

function isForwardLayer(layer: unknown): layer is ForwardLayer {
  if (!layer || typeof layer !== "object") return false;
  const o = layer as Record<string, unknown>;
  return typeof o.innerBlob === "string" && typeof o.nextHopUrl === "string";
}

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Browser clients (Vercel demo) call entry hop directly — no Vercel proxy.
  const origin = req.headers.origin ?? "*";
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "content-type, x-relay-demo, x-forwarded-for",
  );
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

export function createApp(cfg: RelayConfig): Application {
  const app: Application = express();
  app.use(corsMiddleware);
  app.use(express.json({ limit: "2mb" }));

  let fingerprint = "unavailable";
  let publicKey: string | undefined = cfg.publicKey;
  try {
    publicKey = cfg.publicKey ?? publicKeyFromPrivate(cfg.privateKey);
    fingerprint = publicKeyFingerprint(publicKey);
  } catch {
    fingerprint = "unavailable";
  }

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      role: cfg.role,
      fingerprint,
      publicKey,
      service: "relay-mesh",
      independentAccount: true,
    });
  });

  app.post("/relay", async (req: Request, res: Response) => {
    const started = Date.now();
    const payload = req.body?.payload;
    if (typeof payload !== "string" || payload.length === 0) {
      res.status(400).json({ error: "Expected JSON body { payload: base64 }" });
      return;
    }

    const bytesIn = byteLength(payload);

    try {
      await maybeMixDelay(cfg);

      // Content-addressed behavior: any of the 5 nodes can sit in any circuit
      // position. ROLE is informational (health / logs) only.
      const layer = openLayer<unknown>(cfg.privateKey, payload);

      if (isExitLayer(layer)) {
        await handleExit(cfg, req, res, layer, bytesIn, started);
        return;
      }

      if (isForwardLayer(layer)) {
        await handleForward(cfg, res, layer, bytesIn, started);
        return;
      }

      res.status(400).json({ error: "Unrecognized onion layer shape" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          role: cfg.role,
          error: message,
        }),
      );
      res.status(502).json({ error: "Relay hop failed", detail: message });
    }
  });

  return app;
}

async function handleExit(
  cfg: RelayConfig,
  req: Request,
  res: Response,
  layer: ExitLayer,
  bytesIn: number,
  started: number,
): Promise<void> {
  const targetUrl = cfg.exitRpcUrl ?? layer.rpcTargetUrl;
  if (!targetUrl) {
    res.status(500).json({ error: "No rpcTargetUrl available" });
    return;
  }

  if (cfg.demoLogging) {
    const clientIp =
      (req.headers["x-forwarded-for"] as string | undefined)
        ?.split(",")[0]
        ?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        role: cfg.role,
        event: "demo_plaintext",
        upstreamIp: clientIp,
        rpcTargetUrl: targetUrl,
        rpcPayload: layer.rpcPayload,
      }),
    );
  }

  if (typeof layer.replyKey !== "string" || layer.replyKey.length === 0) {
    res.status(400).json({ error: "Exit layer missing replyKey" });
    return;
  }

  const upstream = await fetch(targetUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(layer.rpcPayload),
  });
  const text = await upstream.text();
  const ct = upstream.headers.get("content-type") ?? undefined;

  // Always HTTP 200 to clients; status/content-type live inside the sealed reply
  // so entry/middle only observe ciphertext.
  const sealed = sealReply(layer.replyKey, {
    status: upstream.status,
    contentType: ct,
    body: text,
  });
  const body = JSON.stringify({ payload: sealed });
  const bytesOut = byteLength(body);

  logRequest(cfg.role, bytesIn, bytesOut, started, 200);
  res.status(200).type("json").send(body);
}

async function handleForward(
  cfg: RelayConfig,
  res: Response,
  layer: ForwardLayer,
  bytesIn: number,
  started: number,
): Promise<void> {
  // Never log decrypted content for forward hops
  const nextUrl = layer.nextHopUrl || cfg.nextHopUrl;
  if (!nextUrl) {
    res.status(500).json({ error: "No nextHopUrl available" });
    return;
  }

  const relayUrl = nextUrl.replace(/\/$/, "") + "/relay";
  const upstream = await fetch(relayUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: layer.innerBlob }),
  });
  // Pass the sealed reply envelope through unchanged (ciphertext only).
  const text = await upstream.text();
  const bytesOut = byteLength(text);

  logRequest(cfg.role, bytesIn, bytesOut, started, upstream.status);

  res.status(upstream.status);
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("content-type", ct);
  res.send(text);
}
