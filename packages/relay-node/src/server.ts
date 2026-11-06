import { createHash } from "node:crypto";
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
  sealObservation,
  stripJsonPadding,
  type HopObservation,
} from "@relay-mesh/crypto";
import { normalizeHopUrl, type RelayConfig } from "./config.js";

type ForwardLayer = {
  nextHopUrl: string;
  innerBlob: string;
  demoKey?: string;
};

type ExitLayer = {
  rpcTargetUrl: string;
  rpcPayload: unknown;
  replyKey: string;
  demoKey?: string;
  _pad?: string;
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

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isDemoRequest(cfg: RelayConfig, req: Request): boolean {
  return cfg.demoLogging && req.headers["x-relay-demo"] === "1";
}

function payloadSha256Prefix(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

function maybeSealObservation(
  demoKey: string | undefined,
  observation: HopObservation,
): string | null {
  if (!demoKey) return null;
  try {
    return sealObservation(demoKey, observation);
  } catch (err) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        error: "demo_observation_seal_failed",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin ?? "*";
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    "content-type, x-relay-demo",
  );
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function createRateLimiter(limitPerMinute: number) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = clientIp(req);
    const now = Date.now();
    let slot = windows.get(ip);
    if (!slot || now >= slot.resetAt) {
      slot = { count: 0, resetAt: now + 60_000 };
      windows.set(ip, slot);
    }
    slot.count += 1;
    if (slot.count > limitPerMinute) {
      res.status(429).json({ error: "Relay hop failed" });
      return;
    }
    next();
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string };
  return e.name === "AbortError" || e.code === "ABORT_ERR";
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

  // Demo-only: IP this hop observed for the caller (Railway x-forwarded-for / socket).
  app.get("/whoami", (req: Request, res: Response) => {
    if (!cfg.demoLogging) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      observedIp: clientIp(req),
      role: cfg.role,
      fingerprint,
    });
  });

  const rateLimit = createRateLimiter(cfg.rateLimitPerMinute);

  app.post("/relay", rateLimit, async (req: Request, res: Response) => {
    const started = Date.now();
    const payload = req.body?.payload;
    if (typeof payload !== "string" || payload.length === 0) {
      res.status(400).json({ error: "Expected JSON body { payload: base64 }" });
      return;
    }

    const bytesIn = byteLength(payload);
    const demo = isDemoRequest(cfg, req);

    try {
      await maybeMixDelay(cfg);

      const layer = openLayer<unknown>(cfg.privateKey, payload);

      if (isExitLayer(layer)) {
        const exitLayer = stripJsonPadding(
          layer as ExitLayer & { _pad?: string },
        ) as ExitLayer;
        await handleExit(cfg, req, res, exitLayer, bytesIn, started, demo, payload);
        return;
      }

      if (isForwardLayer(layer)) {
        await handleForward(cfg, req, res, layer, bytesIn, started, demo, payload);
        return;
      }

      res.status(400).json({ error: "Unrecognized onion layer shape" });
    } catch (err) {
      if (isAbortError(err)) {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            role: cfg.role,
            error: "upstream_timeout",
          }),
        );
        res.status(504).json({ error: "Relay hop failed" });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          role: cfg.role,
          error: message,
        }),
      );
      res.status(502).json({ error: "Relay hop failed" });
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
  demo: boolean,
  rawPayload: string,
): Promise<void> {
  const targetUrl = normalizeHopUrl(layer.rpcTargetUrl ?? "");
  const httpsOk = targetUrl.startsWith("https://");
  const httpOkForTests =
    Boolean(cfg.allowInsecureTargetsForTests) &&
    targetUrl.startsWith("http://");
  if (!httpsOk && !httpOkForTests) {
    res.status(400).json({ error: "Relay hop failed" });
    return;
  }
  if (!cfg.exitRpcAllowlist.has(targetUrl)) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        role: cfg.role,
        error: "exit_target_not_allowlisted",
        targetUrl,
      }),
    );
    res.status(400).json({ error: "Relay hop failed" });
    return;
  }

  if (typeof layer.replyKey !== "string" || layer.replyKey.length === 0) {
    res.status(400).json({ error: "Relay hop failed" });
    return;
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetchWithTimeout(
      targetUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(layer.rpcPayload),
      },
      cfg.upstreamTimeoutMs,
    );
  } catch (err) {
    if (isAbortError(err)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          role: cfg.role,
          error: "exit_upstream_timeout",
        }),
      );
      res.status(504).json({ error: "Relay hop failed" });
      return;
    }
    throw err;
  }

  const text = await upstream.text();
  const ct = upstream.headers.get("content-type") ?? undefined;

  const sealed = sealReply(layer.replyKey, {
    status: upstream.status,
    contentType: ct,
    body: text,
  });

  const wire: { payload: string; observations?: string[] } = { payload: sealed };
  if (demo) {
    const sealedObs = maybeSealObservation(layer.demoKey, {
      role: cfg.role,
      observedPeerIp: clientIp(req),
      bytesIn,
      payloadSha256Prefix: payloadSha256Prefix(rawPayload),
      layerType: "exit",
      sawPlaintextQuery: true,
      ms: Date.now() - started,
    });
    if (sealedObs) wire.observations = [sealedObs];
  }

  const body = JSON.stringify(wire);
  const bytesOut = byteLength(body);

  logRequest(cfg.role, bytesIn, bytesOut, started, 200);
  res.status(200).type("json").send(body);
}

async function handleForward(
  cfg: RelayConfig,
  req: Request,
  res: Response,
  layer: ForwardLayer,
  bytesIn: number,
  started: number,
  demo: boolean,
  rawPayload: string,
): Promise<void> {
  const nextUrl = normalizeHopUrl(layer.nextHopUrl || cfg.nextHopUrl || "");
  if (!nextUrl) {
    res.status(400).json({ error: "Relay hop failed" });
    return;
  }
  if (!cfg.allowedHopUrls.has(nextUrl)) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        role: cfg.role,
        error: "forward_url_not_allowlisted",
        nextUrl,
      }),
    );
    res.status(400).json({ error: "Relay hop failed" });
    return;
  }

  const relayUrl = nextUrl + "/relay";
  const forwardHeaders: Record<string, string> = {
    "content-type": "application/json",
  };
  if (demo) forwardHeaders["x-relay-demo"] = "1";

  let upstream: globalThis.Response;
  try {
    upstream = await fetchWithTimeout(
      relayUrl,
      {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify({ payload: layer.innerBlob }),
      },
      cfg.upstreamTimeoutMs,
    );
  } catch (err) {
    if (isAbortError(err)) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          role: cfg.role,
          error: "forward_upstream_timeout",
        }),
      );
      res.status(504).json({ error: "Relay hop failed" });
      return;
    }
    throw err;
  }

  const text = await upstream.text();
  let outBody = text;

  if (demo && upstream.ok) {
    try {
      const wire = JSON.parse(text) as {
        payload?: string;
        observations?: string[];
      };
      const sealedObs = maybeSealObservation(layer.demoKey, {
        role: cfg.role,
        observedPeerIp: clientIp(req),
        bytesIn,
        payloadSha256Prefix: payloadSha256Prefix(rawPayload),
        layerType: "forward",
        sawPlaintextQuery: false,
        ms: Date.now() - started,
      });
      if (sealedObs && typeof wire.payload === "string") {
        const observations = [...(wire.observations ?? []), sealedObs];
        outBody = JSON.stringify({ payload: wire.payload, observations });
      }
    } catch {
      /* pass through unchanged */
    }
  }

  const bytesOut = byteLength(outBody);

  logRequest(cfg.role, bytesIn, bytesOut, started, upstream.status);

  res.status(upstream.status);
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("content-type", ct);
  res.send(outBody);
}
