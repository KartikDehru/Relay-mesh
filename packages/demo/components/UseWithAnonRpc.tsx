"use client";

import { useState } from "react";

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SPECIFIER = "0x005d62b2fB2BbfB05d268990DA6c328F80de28D1";
const ANON_DEMO = "https://ethereum.github.io/anon-rpc/demo/";
const GUIDE =
  "https://github.com/KartikDehru/Relay-mesh#use-it-with-anon-rpc";

const INTEGRATE_SNIPPET = `import { AnonRpcWorker } from "@anon-rpc/browser-harness";

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const RELAY_MESH_SPECIFIER = "0x005d62b2fB2BbfB05d268990DA6c328F80de28D1";

/** Minimal EIP-1193 wrapper over fetch for the one-time specifier bootstrap read. */
const sepoliaBootstrap = {
  request: async ({ method, params }: { method: string; params?: unknown }) => {
    const res = await fetch(SEPOLIA_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? "RPC error");
    return body.result;
  },
};

const worker = new AnonRpcWorker({
  // Specifier contract on Sepolia (reference adopters use mainnet).
  address: RELAY_MESH_SPECIFIER,
  // Optional — see Worker config. Leave undefined for hop1 → hop2 → hop3.
  config: undefined,
  preExisting: {
    rpcProvider: sepoliaBootstrap,
  },
});

const res = await worker.fetch(SEPOLIA_RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "latest"],
  }),
  // Optional: our worker picks a stable 3-hop circuit per key from the hop pool.
  anonOptions: { isolationKey: "account-1" },
});
const { result } = await res.json();

// worker.fetch can be passed to anything that accepts a custom fetch.
worker.close();`;

const FIT_CARDS = [
  {
    title: "Wallets",
    body: "Balance and token lookups without the RPC provider linking your IP to your addresses.",
  },
  {
    title: "dApps",
    body: "Read calls (eth_call, eth_getBalance, logs) from the browser.",
  },
  {
    title: "Bots and AI agents",
    body: "Queries that would otherwise reveal a strategy.",
  },
  {
    title: "Any Anon-RPC harness",
    body: "Including the official demo page (steps below).",
  },
] as const;

const GOOD_TO_KNOW = [
  "The specifier is on Sepolia; the bootstrap provider must be able to read Sepolia (Anon-RPC's reference examples use mainnet).",
  "The live exits only call allowlisted targets — currently https://ethereum-sepolia-rpc.publicnode.com. Requests to any other RPC URL are rejected. Mainnet support means adding a mainnet target to EXIT_RPC_ALLOWLIST.",
  "Per the Anon-RPC wallet guide, the one-time bootstrap read of the specifier is not anonymized, and the worker sees every request routed through it, including signed transactions.",
  "Our worker reaches the entry hop over HTTPS (ambient fetch), not Anon-RPC's KPS transport; moving to KPS is future work.",
] as const;

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be denied */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      style={styles.copyBtn}
      aria-label={label ?? "Copy"}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function UseWithAnonRpc() {
  const [openIntegrate, setOpenIntegrate] = useState(false);

  return (
    <section
      id="use-with-anon-rpc"
      style={styles.section}
      className="anim-rise use-anon-rpc"
    >
      <h2 style={styles.h2}>Use it with Anon-RPC</h2>
      <p style={styles.lede}>
        Relay Mesh is published as an Anon-RPC worker. Any wallet or app that
        supports Anon-RPC can route its JSON-RPC reads through the 3-hop mesh by
        pointing at our specifier — no Relay Mesh-specific code.
      </p>

      <div style={styles.cardGrid} className="use-anon-cards">
        {FIT_CARDS.map((c) => (
          <div key={c.title} style={styles.card}>
            <div style={styles.cardTitle}>{c.title}</div>
            <p style={styles.cardBody}>{c.body}</p>
          </div>
        ))}
      </div>

      <div style={styles.block}>
        <h3 style={styles.h3}>Try it in the official Anon-RPC demo</h3>
        <ol style={styles.steps}>
          <li>
            <strong>Worker</strong> →{" "}
            <code style={styles.mono}>Custom — paste a specifier</code>
          </li>
          <li>
            <strong>Bootstrap RPC URL</strong> →{" "}
            <span style={styles.inlineCopy}>
              <code style={styles.mono}>{SEPOLIA_RPC}</code>
              <CopyButton text={SEPOLIA_RPC} label="Copy Bootstrap RPC URL" />
            </span>
          </li>
          <li>
            <strong>Worker RPC URL</strong> → click <strong>use same</strong>
          </li>
          <li>
            <strong>Specifier contract</strong> →{" "}
            <span style={styles.inlineCopy}>
              <code style={styles.mono}>{SPECIFIER}</code>
              <CopyButton text={SPECIFIER} label="Copy specifier address" />
            </span>
          </li>
          <li>
            <strong>Worker config</strong> → leave blank (defaults to hop1 →
            hop2 → hop3)
          </li>
          <li>
            <strong>Address</strong> → any Sepolia address (e.g.{" "}
            <code style={styles.mono}>
              0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
            </code>
            )
          </li>
          <li>
            Click <strong>Start watching</strong>
          </li>
        </ol>
        <a
          href={ANON_DEMO}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.primaryCta}
        >
          Open the Anon-RPC demo
        </a>
      </div>

      <div style={styles.block}>
        <button
          type="button"
          style={styles.collapseBtn}
          aria-expanded={openIntegrate}
          onClick={() => setOpenIntegrate((v) => !v)}
        >
          <span>{openIntegrate ? "▾" : "▸"}</span> Integrate in a wallet
        </button>
        {openIntegrate && (
          <div style={styles.codeWrap}>
            <div style={styles.codeHead}>
              <span style={styles.codeLabel}>TypeScript</span>
              <CopyButton text={INTEGRATE_SNIPPET} label="Copy integrate snippet" />
            </div>
            <pre style={styles.code}>{INTEGRATE_SNIPPET}</pre>
          </div>
        )}
      </div>

      <div style={styles.block}>
        <h3 style={styles.h3}>Good to know</h3>
        <ul style={styles.caveats}>
          {GOOD_TO_KNOW.map((line) => (
            <li key={line.slice(0, 40)}>{line}</li>
          ))}
        </ul>
      </div>

      <p style={styles.guideLink}>
        <a href={GUIDE} target="_blank" rel="noopener noreferrer" style={styles.link}>
          Full guide on GitHub
        </a>
      </p>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginTop: 48,
    padding: 22,
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 22,
    boxShadow: "var(--shadow-sm)",
    maxWidth: "100%",
    minWidth: 0,
  },
  h2: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 28,
    letterSpacing: "-0.035em",
    color: "var(--ink)",
  },
  lede: {
    margin: "10px 0 0",
    color: "var(--muted)",
    fontSize: 15,
    lineHeight: 1.55,
    maxWidth: 640,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
    gap: 12,
    marginTop: 20,
  },
  card: {
    padding: "14px 14px 12px",
    background: "var(--surface-solid)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 15,
    letterSpacing: "-0.02em",
    color: "var(--ink)",
    marginBottom: 6,
  },
  cardBody: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.45,
    color: "var(--muted)",
  },
  block: {
    marginTop: 22,
  },
  h3: {
    margin: "0 0 10px",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    letterSpacing: "-0.02em",
    color: "var(--ink)",
  },
  steps: {
    margin: "0 0 16px",
    paddingLeft: 20,
    color: "var(--ink-soft)",
    fontSize: 14,
    lineHeight: 1.7,
    overflowWrap: "anywhere",
  },
  inlineCopy: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    maxWidth: "100%",
  },
  mono: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.88em",
    wordBreak: "break-all",
  },
  copyBtn: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "4px 8px",
    borderRadius: 8,
    border: "1px solid var(--line-strong)",
    background: "var(--surface-solid)",
    color: "var(--ink-soft)",
    cursor: "pointer",
    flexShrink: 0,
  },
  primaryCta: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 18px",
    borderRadius: 12,
    background: "linear-gradient(120deg, var(--violet), var(--blue))",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
    boxShadow: "var(--shadow-sm)",
  },
  collapseBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "var(--ink)",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    letterSpacing: "-0.02em",
    cursor: "pointer",
  },
  codeWrap: {
    marginTop: 12,
    border: "1px solid var(--line)",
    borderRadius: 14,
    background: "rgba(243, 246, 251, 0.95)",
    overflow: "hidden",
    maxWidth: "100%",
  },
  codeHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--line)",
  },
  codeLabel: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  code: {
    margin: 0,
    padding: "12px 14px",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    lineHeight: 1.55,
    color: "var(--ink-soft)",
    overflowX: "auto",
    whiteSpace: "pre",
    maxWidth: "100%",
  },
  caveats: {
    margin: 0,
    paddingLeft: 18,
    color: "var(--muted)",
    fontSize: 12,
    lineHeight: 1.55,
  },
  guideLink: {
    margin: "18px 0 0",
  },
  link: {
    color: "var(--blue)",
    fontWeight: 500,
    fontSize: 14,
  },
};
