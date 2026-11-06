import { describe, it, expect } from "vitest";
import {
  loadCircuitRegistry,
  buildFixedCircuit,
  buildRandomCircuit,
} from "../src/registry.js";

const sample = {
  version: 1,
  rpcTargetUrl: "https://example.rpc",
  fixedCircuit: ["hop1", "hop2", "hop3"],
  nodes: [
    {
      id: "hop1",
      fingerprint: "a",
      publicKey: "pk1",
      url: "https://h1.example",
    },
    {
      id: "hop2",
      fingerprint: "b",
      publicKey: "pk2",
      url: "https://h2.example",
    },
    {
      id: "hop3",
      fingerprint: "c",
      publicKey: "pk3",
      url: "https://h3.example",
    },
    {
      id: "hop4",
      fingerprint: "d",
      publicKey: "pk4",
      url: "https://h4.example",
    },
    {
      id: "hop5",
      fingerprint: "e",
      publicKey: "pk5",
      url: "https://h5.example",
    },
  ],
};

describe("circuit registry", () => {
  it("builds the fixed hop1→hop2→hop3 circuit", () => {
    const reg = loadCircuitRegistry(sample);
    const { circuit, hopIds } = buildFixedCircuit(reg);
    expect(hopIds).toEqual(["hop1", "hop2", "hop3"]);
    expect(circuit[0].url).toBe("https://h1.example");
    expect(circuit[2].publicKey).toBe("pk3");
  });

  it("randomly picks 3 of 5", () => {
    const reg = loadCircuitRegistry(sample);
    let calls = 0;
    const rng = () => {
      // Deterministic shuffle entropy
      const seq = [0.9, 0.1, 0.5, 0.2, 0.8];
      return seq[calls++ % seq.length]!;
    };
    const { hopIds } = buildRandomCircuit(reg, rng);
    expect(new Set(hopIds).size).toBe(3);
    for (const id of hopIds) {
      expect(sample.nodes.map((n) => n.id)).toContain(id);
    }
  });

  it("rejects undeployed fixed hops", () => {
    const reg = loadCircuitRegistry({
      ...sample,
      nodes: sample.nodes.map((n, i) =>
        i === 0 ? { ...n, url: "" } : n,
      ),
    });
    expect(() => buildFixedCircuit(reg)).toThrow(/missing public URLs/);
  });
});
