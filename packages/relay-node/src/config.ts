export type RelayRole = "entry" | "middle" | "exit" | "any";

export type RelayConfig = {
  role: RelayRole;
  privateKey: string;
  publicKey: string | undefined;
  port: number;
  nextHopUrl: string | undefined;
  demoLogging: boolean;
  mixDelayMsMin: number;
  mixDelayMsMax: number;
  /** Normalized hop base URLs (no trailing slash) this node may forward to. */
  allowedHopUrls: Set<string>;
  /** Exact HTTPS RPC URLs the exit may call (values from EXIT_RPC_ALLOWLIST). */
  exitRpcAllowlist: Set<string>;
  /** Upstream fetch timeout (ms). Default 10_000. */
  upstreamTimeoutMs: number;
  /** Per-IP /relay rate limit window. */
  rateLimitPerMinute: number;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

/** Strip trailing slash for stable allowlist compares. */
export function normalizeHopUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function parseAllowedHopUrlsFromEnv(): Set<string> | null {
  const raw = process.env.ALLOWED_HOP_URLS?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => normalizeHopUrl(s))
      .filter(Boolean),
  );
}

function parseExitRpcAllowlistFromEnv(): Set<string> {
  const raw = process.env.EXIT_RPC_ALLOWLIST?.trim();
  if (!raw) {
    // Safe default for local/dev: public Sepolia only. Production should set explicitly.
    return new Set(["https://ethereum-sepolia-rpc.publicnode.com"]);
  }
  const parsed = JSON.parse(raw) as Record<string, string>;
  const urls = new Set<string>();
  for (const value of Object.values(parsed)) {
    if (typeof value !== "string" || !value.startsWith("https://")) {
      throw new Error(
        `EXIT_RPC_ALLOWLIST values must be https URLs; got ${String(value)}`,
      );
    }
    urls.add(normalizeHopUrl(value));
  }
  return urls;
}

type RegistryFile = {
  nodes?: Array<{ url?: string }>;
};

async function loadHopUrlsFromRegistry(): Promise<Set<string>> {
  const registryUrl = process.env.CIRCUIT_REGISTRY_URL?.trim();
  if (registryUrl) {
    const res = await fetch(registryUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch CIRCUIT_REGISTRY_URL: HTTP ${res.status}`);
    }
    const reg = (await res.json()) as RegistryFile;
    return new Set(
      (reg.nodes ?? [])
        .map((n) => (n.url ? normalizeHopUrl(n.url) : ""))
        .filter(Boolean),
    );
  }

  const pathEnv = process.env.CIRCUIT_REGISTRY_PATH?.trim();
  if (pathEnv) {
    const { readFileSync } = await import("node:fs");
    const reg = JSON.parse(readFileSync(pathEnv, "utf8")) as RegistryFile;
    return new Set(
      (reg.nodes ?? [])
        .map((n) => (n.url ? normalizeHopUrl(n.url) : ""))
        .filter(Boolean),
    );
  }

  return new Set();
}

export async function loadConfig(): Promise<RelayConfig> {
  const roleRaw = process.env.ROLE ?? "any";
  const role = roleRaw as RelayRole;
  if (!["entry", "middle", "exit", "any"].includes(role)) {
    throw new Error(`Invalid ROLE="${role}"; expected entry|middle|exit|any`);
  }

  const privateKey = requireEnv("RELAY_PRIVATE_KEY");
  const port = Number(process.env.PORT ?? "4000");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  if (process.env.EXIT_RPC_URL) {
    console.warn(
      "[config] EXIT_RPC_URL is ignored; exits only call EXIT_RPC_ALLOWLIST URLs matching the onion rpcTargetUrl exactly",
    );
  }

  const fromEnv = parseAllowedHopUrlsFromEnv();
  const allowedHopUrls = fromEnv ?? (await loadHopUrlsFromRegistry());
  if (allowedHopUrls.size === 0) {
    console.warn(
      "[config] No ALLOWED_HOP_URLS / circuit registry hops loaded; forward layers will be rejected",
    );
  }

  const exitRpcAllowlist = parseExitRpcAllowlistFromEnv();
  const upstreamTimeoutMs =
    Number(process.env.UPSTREAM_TIMEOUT_MS ?? "10000") || 10_000;
  const rateLimitPerMinute =
    Number(process.env.RATE_LIMIT_PER_MINUTE ?? "60") || 60;

  return {
    role,
    privateKey,
    publicKey: process.env.RELAY_PUBLIC_KEY,
    port,
    nextHopUrl: process.env.NEXT_HOP_URL
      ? normalizeHopUrl(process.env.NEXT_HOP_URL)
      : undefined,
    demoLogging: process.env.DEMO_LOGGING === "true",
    mixDelayMsMin: Number(process.env.MIX_DELAY_MS_MIN ?? "0") || 0,
    mixDelayMsMax: Number(process.env.MIX_DELAY_MS_MAX ?? "0") || 0,
    allowedHopUrls,
    exitRpcAllowlist,
    upstreamTimeoutMs,
    rateLimitPerMinute,
  };
}
