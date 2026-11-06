import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  sealLayer,
  openLayer,
  buildOnion,
} from "../src/index.js";

describe("sealLayer / openLayer", () => {
  it("round-trips an object", () => {
    const kp = generateKeypair();
    const plaintext = { hello: "world", n: 42 };
    const sealed = sealLayer(kp.publicKey, plaintext);
    expect(typeof sealed).toBe("string");
    expect(sealed.length).toBeGreaterThan(40);
    const opened = openLayer<typeof plaintext>(kp.privateKey, sealed);
    expect(opened).toEqual(plaintext);
  });

  it("fails to open with the wrong private key", () => {
    const a = generateKeypair();
    const b = generateKeypair();
    const sealed = sealLayer(a.publicKey, { secret: true });
    expect(() => openLayer(b.privateKey, sealed)).toThrow();
  });
});

describe("3-layer nested onion", () => {
  it("peels correctly hop-by-hop with only the right keys", () => {
    const hop1 = generateKeypair();
    const hop2 = generateKeypair();
    const hop3 = generateKeypair();

    const rpcPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    };
    const rpcTargetUrl = "https://example.rpc/sepolia";

    const outer = buildOnion(
      rpcPayload,
      [
        { url: "http://127.0.0.1:4001", publicKey: hop1.publicKey },
        { url: "http://127.0.0.1:4002", publicKey: hop2.publicKey },
        { url: "http://127.0.0.1:4003", publicKey: hop3.publicKey },
      ],
      rpcTargetUrl,
    );

    // Hop1 (entry) peels outer layer
    const layer1 = openLayer<{ nextHopUrl: string; innerBlob: string }>(
      hop1.privateKey,
      outer,
    );
    expect(layer1.nextHopUrl).toBe("http://127.0.0.1:4002");
    expect(typeof layer1.innerBlob).toBe("string");

    // Wrong key cannot peel hop1
    expect(() => openLayer(hop2.privateKey, outer)).toThrow();
    expect(() => openLayer(hop3.privateKey, outer)).toThrow();

    // Hop2 (middle) peels middle layer
    const layer2 = openLayer<{ nextHopUrl: string; innerBlob: string }>(
      hop2.privateKey,
      layer1.innerBlob,
    );
    expect(layer2.nextHopUrl).toBe("http://127.0.0.1:4003");

    // Hop1 cannot peel hop2's layer
    expect(() => openLayer(hop1.privateKey, layer1.innerBlob)).toThrow();

    // Hop3 (exit) peels innermost — plaintext RPC
    const layer3 = openLayer<{ rpcTargetUrl: string; rpcPayload: unknown }>(
      hop3.privateKey,
      layer2.innerBlob,
    );
    expect(layer3.rpcTargetUrl).toBe(rpcTargetUrl);
    expect(layer3.rpcPayload).toEqual(rpcPayload);

    // Middle cannot see plaintext
    expect(() => openLayer(hop2.privateKey, layer2.innerBlob)).toThrow();
  });
});
