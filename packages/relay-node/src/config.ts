export type RelayRole = "entry" | "middle" | "exit" | "any";

export type RelayConfig = {
  role: RelayRole;
  privateKey: string;
  publicKey: string | undefined;
  port: number;
  nextHopUrl: string | undefined;
  exitRpcUrl: string | undefined;
  demoLogging: boolean;
  mixDelayMsMin: number;
  mixDelayMsMax: number;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function loadConfig(): RelayConfig {
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

  // All 5 nodes should set EXIT_RPC_URL so any can serve as exit in a circuit.
  if (!process.env.EXIT_RPC_URL) {
    console.warn(
      `[config] EXIT_RPC_URL unset; exit layers will use rpcTargetUrl from onion`,
    );
  }

  return {
    role,
    privateKey,
    publicKey: process.env.RELAY_PUBLIC_KEY,
    port,
    nextHopUrl: process.env.NEXT_HOP_URL,
    exitRpcUrl: process.env.EXIT_RPC_URL,
    demoLogging: process.env.DEMO_LOGGING === "true",
    mixDelayMsMin: Number(process.env.MIX_DELAY_MS_MIN ?? "0") || 0,
    mixDelayMsMax: Number(process.env.MIX_DELAY_MS_MAX ?? "0") || 0,
  };
}
