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
};
