export type RegistryNode = {
  id: string;
  fingerprint: string;
  publicKey: string;
  url: string;
  railwayAccount?: string;
  roleHint?: string;
};

export type CircuitRegistry = {
  version: number;
  claim?: string;
  rpcTargetUrl: string;
  rpcTargetNote?: string;
  fixedCircuit: string[];
  spareNodes?: string[];
  nodes: RegistryNode[];
  notes?: string;
};

export type RpcMethod = "eth_blockNumber" | "eth_chainId" | "eth_getBalance";

export type RpcPayload = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown[];
};

export type DemoObservation = {
  role: string;
  observedPeerIp: string;
  bytesIn: number;
  payloadSha256Prefix: string;
  layerType: "forward" | "exit";
  sawPlaintextQuery: boolean;
  ms?: number;
};

export type HopHealthStatus = {
  id: string;
  role: string;
  fingerprint: string;
  url: string;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

export type CaptureResult = {
  clientIp: string;
  rpcPayload: RpcPayload;
  hopIds: [string, string, string];
  entryCipherPreview: string;
  entryCipherBytes: number;
  meshResult: unknown;
  meshMs: number;
  directResult: unknown;
  directMs: number;
  mode: "fixed" | "random";
  observations: DemoObservation[];
  /** True when hops returned pre-hardening plaintext (need redeploy). */
  legacyHops?: boolean;
};
