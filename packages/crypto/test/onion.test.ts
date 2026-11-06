import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  sealLayer,
  openLayer,
  buildOnion,
  sealReply,
  openReply,
  generateReplyKey,
  PAD_BUCKETS,
  padBinaryToBucket,
  stripBinaryPadding,
  padJsonObject,
  stripJsonPadding,
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

describe("sealReply / openReply", () => {
  it("round-trips a reply envelope", () => {
    const replyKey = generateReplyKey();
    const envelope = {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: "0xabc",
      }),
    };
    const payload = sealReply(replyKey, envelope);
    const opened = openReply(replyKey, payload);
    expect(opened).toEqual(envelope);
  });

  it("fails with the wrong reply key", () => {
    const a = generateReplyKey();
    const b = generateReplyKey();
    const payload = sealReply(a, {
      status: 200,
      body: '{"jsonrpc":"2.0"}',
    });
    expect(() => openReply(b, payload)).toThrow();
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

    const { onion: outer, replyKey } = buildOnion(
      rpcPayload,
      [
        { url: "http://127.0.0.1:4001", publicKey: hop1.publicKey },
        { url: "http://127.0.0.1:4002", publicKey: hop2.publicKey },
        { url: "http://127.0.0.1:4003", publicKey: hop3.publicKey },
      ],
      rpcTargetUrl,
    );

    expect(typeof replyKey).toBe("string");
    expect(replyKey.length).toBeGreaterThan(20);

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

    // Hop3 (exit) peels innermost — plaintext RPC + replyKey (+ optional _pad)
    const layer3raw = openLayer<{
      rpcTargetUrl: string;
      rpcPayload: unknown;
      replyKey: string;
      _pad?: string;
    }>(hop3.privateKey, layer2.innerBlob);
    expect(typeof layer3raw._pad).toBe("string");
    const layer3 = stripJsonPadding(layer3raw);
    expect(layer3.rpcTargetUrl).toBe(rpcTargetUrl);
    expect(layer3.rpcPayload).toEqual(rpcPayload);
    expect(layer3.replyKey).toBe(replyKey);

    // Middle cannot see plaintext
    expect(() => openLayer(hop2.privateKey, layer2.innerBlob)).toThrow();
  });

  it("builds N>=3 hop onions (4-hop peel)", () => {
    const keys = [0, 1, 2, 3].map(() => generateKeypair());
    const hops = keys.map((k, i) => ({
      url: `http://127.0.0.1:500${i}`,
      publicKey: k.publicKey,
    }));
    const rpcPayload = { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] };
    const { onion, replyKey } = buildOnion(rpcPayload, hops, "https://example.rpc");

    let blob = onion;
    for (let i = 0; i < hops.length - 1; i++) {
      const layer = openLayer<{ nextHopUrl: string; innerBlob: string }>(
        keys[i]!.privateKey,
        blob,
      );
      expect(layer.nextHopUrl).toBe(hops[i + 1]!.url);
      blob = layer.innerBlob;
    }
    const exit = stripJsonPadding(
      openLayer<{
        rpcTargetUrl: string;
        rpcPayload: unknown;
        replyKey: string;
        _pad?: string;
      }>(keys[3]!.privateKey, blob),
    );
    expect(exit.rpcPayload).toEqual(rpcPayload);
    expect(exit.replyKey).toBe(replyKey);
  });

  it("pads exit plaintext and replies to fixed buckets only", () => {
    const padded = padJsonObject({ a: 1, b: "x" });
    const len = new TextEncoder().encode(JSON.stringify(padded)).length;
    expect(PAD_BUCKETS).toContain(len);
    expect(stripJsonPadding(padded)).toEqual({ a: 1, b: "x" });

    const replyKey = generateReplyKey();
    const sealed = sealReply(replyKey, {
      status: 200,
      body: '{"jsonrpc":"2.0","id":1,"result":"0x1"}',
    });
    const sealedBytes = Buffer.from(sealed, "base64");
    expect(PAD_BUCKETS).toContain(sealedBytes.length);

    const small = padBinaryToBucket(new Uint8Array([1, 2, 3]));
    expect(PAD_BUCKETS).toContain(small.length);
    expect(Array.from(stripBinaryPadding(small))).toEqual([1, 2, 3]);
  });

  it("encrypted reply is not valid JSON-RPC plaintext", () => {
    const replyKey = generateReplyKey();
    const rpcBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: "0x1234",
    });
    const payload = sealReply(replyKey, {
      status: 200,
      contentType: "application/json",
      body: rpcBody,
    });

    // What entry/middle observe on the wire: { payload: "<ciphertext>" }
    const wire = JSON.stringify({ payload });
    const observed = JSON.parse(wire) as { payload?: string; jsonrpc?: string; result?: string };
    expect(observed.jsonrpc).toBeUndefined();
    expect(observed.result).toBeUndefined();
    expect(typeof observed.payload).toBe("string");

    // Ciphertext itself is not JSON-RPC
    expect(() => {
      const maybe = JSON.parse(
        Buffer.from(observed.payload!, "base64").toString("utf8"),
      );
      if (maybe && typeof maybe === "object" && "jsonrpc" in maybe) {
        throw new Error("leaked jsonrpc");
      }
    }).toThrow();

    // Client with replyKey recovers plaintext
    const opened = openReply(replyKey, payload);
    expect(JSON.parse(opened.body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: "0x1234",
    });
  });
});
