"use client";

import { useEffect, useMemo, useState } from "react";
import type { CaptureResult, CircuitRegistry } from "@/lib/types";
import {
  cipherPreview,
  defaultRpcPayload,
  fetchClientIp,
  loadRegistry,
  pickFixedCircuit,
  pickRandomCircuit,
  sendDirect,
  sendViaMeshBrowser,
  deployedNodes,
} from "@/lib/mesh";
import { SiteNav } from "@/components/SiteNav";

type Mode = "fixed" | "random";

export function DemoApp() {
  const [registry, setRegistry] = useState<CircuitRegistry | null>(null);
  const [mode, setMode] = useState<Mode>("fixed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [activeHop, setActiveHop] = useState<number>(-1);
  const [directNote, setDirectNote] = useState<string | null>(null);

  useEffect(() => {
    loadRegistry()
      .then(setRegistry)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const liveCount = useMemo(
    () => (registry ? deployedNodes(registry).length : 0),
    [registry],
  );

  async function run() {
    if (!registry || busy) return;
    setError(null);
    setDirectNote(null);
    setBusy(true);
    try {
      setActiveHop(0);
      const picked =
        mode === "fixed"
          ? pickFixedCircuit(registry)
          : pickRandomCircuit(registry);
      const rpcPayload = defaultRpcPayload();
      const clientIp = await fetchClientIp(picked.hops[0].url);

      setActiveHop(1);
      const meshPromise = sendViaMeshBrowser(
        rpcPayload,
        picked.hops,
        registry.rpcTargetUrl,
      ).then((r) => {
        setActiveHop(3);
        return r;
      });

      const directPromise = sendDirect(registry.rpcTargetUrl, rpcPayload).catch(
        (e) => {
          const msg = e instanceof Error ? e.message : String(e);
          setDirectNote(
            `Browser→RPC blocked (${msg}). Native clients still link IP + query at the endpoint.`,
          );
          return {
            result: {
              note: "CORS/network blocked from browser",
              wouldHaveSent: rpcPayload,
            },
            ms: 0,
          };
        },
      );

      const [mesh, direct] = await Promise.all([meshPromise, directPromise]);

      setCapture({
        clientIp,
        rpcPayload,
        hopIds: picked.hopIds,
        entryCipherPreview: cipherPreview(mesh.onion),
        entryCipherBytes: Math.ceil((mesh.onion.length * 3) / 4),
        meshResult: mesh.result,
        meshMs: mesh.ms,
        directResult: direct.result,
        directMs: direct.ms,
        mode,
        observations: mesh.observations,
      });
      setActiveHop(-1);
    } catch (e) {
      setActiveHop(-1);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <SiteNav />
      <header style={styles.header} className="anim-rise">
        <div style={styles.brandRow}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/relay-mesh-logo.svg"
            alt="Relay Mesh"
            width={64}
            height={64}
            style={styles.logo}
          />
          <h1 style={styles.brand}>Relay Mesh</h1>
        </div>
        <p style={styles.lede} className="anim-rise-delay-1">
          A request-scoped onion path for JSON-RPC. No single hop ever sees both
          your network identity and your plaintext query.
        </p>

        <div style={styles.controlShell} className="anim-rise-delay-2">
          <label style={styles.modeLabel}>
            Circuit
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              style={styles.select}
              disabled={busy}
            >
              <option value="fixed">Fixed: hop1 → hop2 → hop3</option>
              <option value="random" disabled={liveCount < 3}>
                Random 3 of {liveCount} (stretch)
              </option>
            </select>
          </label>
          <button
            type="button"
            onClick={run}
            disabled={busy || !registry}
            style={{
              ...styles.cta,
              opacity: busy || !registry ? 0.65 : 1,
              cursor: busy || !registry ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Routing…" : "Run before / after"}
          </button>
        </div>

        {registry && (
          <p style={styles.meta} className="anim-rise-delay-3">
            <span style={styles.liveDot} />
            {liveCount} independent Railway hops live · target{" "}
            <span style={styles.mono}>{shortUrl(registry.rpcTargetUrl)}</span>
          </p>
        )}
      </header>

      <CircuitStrip
        registry={registry}
        hopIds={capture?.hopIds ?? registry?.fixedCircuit.slice(0, 3)}
        activeHop={activeHop}
        busy={busy}
      />

      {error && (
        <div style={styles.error} role="alert">
          {error}
        </div>
      )}

      {capture && (
        <BeforeAfter
          capture={capture}
          registry={registry}
          directNote={directNote}
        />
      )}

      <footer style={styles.footer}>
        <p style={{ margin: "0 0 8px" }}>
          Onion encryption + the call to the entry hop run entirely in your
          browser. Nothing is proxied through Vercel.
        </p>
        <p style={styles.claim}>
          Each relay node is deployed and billed under an independent Railway
          account.
        </p>
        <p style={styles.claimsNote}>
          Anon-RPC leaves anonymizing-network topology unspecified — so a single
          operator can still see both identity and content. Relay Mesh is the
          multi-hop network that plugs that gap.{" "}
          <a
            href="https://github.com/KartikDehru/Relay-mesh#why-this-network"
            style={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Claims &amp; Sources
          </a>
          {" · "}
          <a
            href="https://ethereum.github.io/anon-rpc/demo/"
            style={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            anon-rpc demo
          </a>
        </p>
      </footer>
    </div>
  );
}

function CircuitStrip({
  registry,
  hopIds,
  activeHop,
  busy,
}: {
  registry: CircuitRegistry | null;
  hopIds?: string[];
  activeHop: number;
  busy: boolean;
}) {
  if (!registry || !hopIds || hopIds.length < 3) return null;
  const map = new Map(registry.nodes.map((n) => [n.id, n]));
  const roles = ["entry", "middle", "exit"];
  const accents = ["var(--violet)", "var(--blue)", "var(--green)"];

  return (
    <section
      style={styles.circuit}
      className="anim-rise-delay-2"
      aria-label="Circuit"
    >
      {hopIds.map((id, i) => {
        const node = map.get(id);
        const on = busy && activeHop >= i;
        return (
          <div key={`${id}-${i}`} style={styles.hopWrap}>
            {i > 0 && (
              <div
                style={{
                  ...styles.connector,
                  animation: busy ? "pulse-line 1s ease infinite" : undefined,
                }}
              />
            )}
            <div
              style={{
                ...styles.hop,
                borderColor: on ? accents[i] : "var(--line-strong)",
                animation: on ? "hop-glow 1.4s ease infinite" : undefined,
              }}
            >
              <span style={{ ...styles.hopRole, color: accents[i] }}>
                {roles[i]}
              </span>
              <strong style={styles.hopId}>{id}</strong>
              <span style={styles.hopFp}>
                {node?.fingerprint?.slice(0, 8) ?? "—"}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BeforeAfter({
  capture,
  registry,
  directNote,
}: {
  capture: CaptureResult;
  registry: CircuitRegistry | null;
  directNote: string | null;
}) {
  const exitNode = registry?.nodes.find((n) => n.id === capture.hopIds[2]);
  const middleNode = registry?.nodes.find((n) => n.id === capture.hopIds[1]);

  return (
    <section style={styles.compare} className="anim-rise">
      <div style={styles.compareHead}>
        <h2 style={styles.h2}>Before / after</h2>
        <p style={styles.compareSub}>
          Same <code style={styles.mono}>eth_blockNumber</code> call — who saw
          what.
        </p>
      </div>

      <div style={styles.grid}>
        <article style={{ ...styles.panel, ...styles.panelBad }}>
          <div style={styles.panelTagBad}>Direct call</div>
          <h3 style={styles.panelTitle}>One party saw both</h3>
          <p style={styles.panelBody}>
            Your IP and plaintext query arrived together at the RPC endpoint.
          </p>
          <Field label="Client IP" value={capture.clientIp} danger />
          <Field
            label="Plaintext query"
            value={JSON.stringify(capture.rpcPayload, null, 2)}
            mono
            danger
          />
          {directNote && <p style={styles.note}>{directNote}</p>}
          <Field
            label={
              capture.directMs
                ? `Response (${capture.directMs} ms)`
                : "What the endpoint binds together"
            }
            value={JSON.stringify(capture.directResult, null, 2)}
            mono
          />
        </article>

        <article style={{ ...styles.panel, ...styles.panelOk }}>
          <div style={styles.panelTagOk}>Through Relay Mesh</div>
          <h3 style={styles.panelTitle}>No single hop saw both</h3>
          <p style={styles.panelBody}>
            Circuit{" "}
            <span style={styles.mono}>{capture.hopIds.join(" → ")}</span>
            {capture.mode === "random" ? " (random)" : " (fixed)"}.
          </p>

          <div style={styles.hopSight}>
            <h4 style={styles.h4}>Hop1 / entry saw</h4>
            <Field label="Client IP" value={capture.clientIp} />
            <Field
              label={`Encrypted blob (~${capture.entryCipherBytes} bytes)`}
              value={capture.entryCipherPreview}
              mono
            />
            <p style={styles.note}>Cannot read the RPC method or params.</p>
          </div>

          <div style={styles.hopSight}>
            <h4 style={styles.h4}>Hop3 / exit saw</h4>
            <Field
              label="Upstream (not your IP)"
              value={
                middleNode
                  ? `${capture.hopIds[1]} · ${shortUrl(middleNode.url)}`
                  : capture.hopIds[1]
              }
            />
            <Field
              label="Plaintext query"
              value={JSON.stringify(capture.rpcPayload, null, 2)}
              mono
            />
            <p style={styles.note}>
              Sees the query, never your original client IP
              {exitNode ? ` · exit ${exitNode.id}` : ""}.
            </p>
          </div>

          <Field
            label={`Mesh response (${capture.meshMs} ms)`}
            value={JSON.stringify(capture.meshResult, null, 2)}
            mono
          />

          {capture.observations.length > 0 && (
            <div style={styles.hopSight}>
              <h4 style={styles.h4}>Sealed hop observations</h4>
              <p style={styles.note}>
                Each hop sealed what it actually saw to a client-only demoKey
                (requires DEMO_LOGGING=true on the hop).
              </p>
              <Field
                label="Opened records"
                value={JSON.stringify(capture.observations, null, 2)}
                mono
              />
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  danger,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div style={styles.field}>
      <div
        style={{
          ...styles.fieldLabel,
          color: danger ? "var(--danger)" : "var(--muted)",
        }}
      >
        {label}
      </div>
      <pre
        style={{
          ...styles.fieldValue,
          fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
          ...(danger ? styles.fieldValueDanger : null),
        }}
      >
        {value}
      </pre>
    </div>
  );
}

function shortUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1080,
    margin: "0 auto",
    padding: "56px 24px 88px",
  },
  header: {
    marginBottom: 36,
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    marginBottom: 22,
  },
  logo: {
    display: "block",
    animation: "floaty 5s ease-in-out infinite",
    filter: "drop-shadow(0 12px 28px rgba(107, 92, 255, 0.28))",
  },
  brand: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: "clamp(2.6rem, 6vw, 4.2rem)",
    fontWeight: 750,
    letterSpacing: "-0.045em",
    lineHeight: 0.92,
    color: "var(--ink)",
    background: "linear-gradient(115deg, #12141a 18%, #6b5cff 58%, #1f7dff 92%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  lede: {
    maxWidth: 540,
    margin: "0 0 26px",
    fontSize: 17,
    lineHeight: 1.6,
    color: "var(--muted)",
  },
  controlShell: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    alignItems: "end",
    padding: 16,
    background: "var(--surface)",
    border: "1px solid var(--line-strong)",
    borderRadius: 20,
    boxShadow: "var(--shadow-sm)",
    backdropFilter: "blur(14px)",
    width: "fit-content",
    maxWidth: "100%",
  },
  modeLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    fontSize: 11,
    color: "var(--muted)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
  },
  select: {
    background: "var(--surface-solid)",
    color: "var(--ink)",
    border: "1px solid var(--line-strong)",
    borderRadius: 12,
    padding: "12px 14px",
    minWidth: 260,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  cta: {
    background: "linear-gradient(120deg, var(--violet), var(--blue))",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: "14px 24px",
    fontWeight: 650,
    letterSpacing: "-0.01em",
    boxShadow: "0 10px 28px rgba(31, 125, 255, 0.28)",
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    fontSize: 13,
    color: "var(--muted)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--ok)",
    boxShadow: "0 0 0 4px rgba(31, 169, 113, 0.15)",
    display: "inline-block",
  },
  mono: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.92em",
  },
  circuit: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 0,
    marginBottom: 40,
    padding: "18px 20px",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 22,
    boxShadow: "var(--shadow-sm)",
    backdropFilter: "blur(12px)",
  },
  hopWrap: {
    display: "flex",
    alignItems: "center",
  },
  connector: {
    width: 40,
    height: 3,
    borderRadius: 99,
    background:
      "linear-gradient(90deg, rgba(107,92,255,0.2), var(--violet), var(--blue), rgba(31,125,255,0.2))",
    margin: "0 6px",
    transformOrigin: "center",
  },
  hop: {
    background: "var(--surface-solid)",
    border: "1px solid var(--line-strong)",
    borderRadius: 16,
    padding: "14px 16px",
    minWidth: 118,
    boxShadow: "var(--shadow-sm)",
  },
  hopRole: {
    display: "block",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
  },
  hopId: {
    display: "block",
    marginTop: 6,
    fontFamily: "var(--font-display)",
    fontSize: 19,
    letterSpacing: "-0.03em",
    color: "var(--ink)",
  },
  hopFp: {
    display: "block",
    marginTop: 3,
    fontSize: 11,
    color: "var(--muted)",
    fontFamily: "var(--font-mono)",
  },
  error: {
    background: "rgba(226, 61, 79, 0.08)",
    border: "1px solid rgba(226, 61, 79, 0.28)",
    borderRadius: 14,
    padding: "12px 16px",
    marginBottom: 24,
    color: "#a31d2e",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
  },
  compare: {
    marginTop: 8,
  },
  compareHead: {
    marginBottom: 18,
  },
  h2: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 30,
    letterSpacing: "-0.035em",
    color: "var(--ink)",
  },
  compareSub: {
    margin: "8px 0 0",
    color: "var(--muted)",
    fontSize: 15,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 18,
  },
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--line-strong)",
    borderRadius: 22,
    padding: 24,
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(14px)",
  },
  panelBad: {
    background:
      "linear-gradient(180deg, rgba(226,61,79,0.06), rgba(255,255,255,0.9))",
    borderColor: "rgba(226, 61, 79, 0.22)",
  },
  panelOk: {
    background:
      "linear-gradient(180deg, rgba(31,169,113,0.07), rgba(255,255,255,0.92))",
    borderColor: "rgba(31, 169, 113, 0.24)",
  },
  panelTagBad: {
    display: "inline-block",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--danger)",
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
    marginBottom: 10,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(226, 61, 79, 0.1)",
  },
  panelTagOk: {
    display: "inline-block",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ok)",
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
    marginBottom: 10,
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(31, 169, 113, 0.12)",
  },
  panelTitle: {
    margin: "0 0 8px",
    fontFamily: "var(--font-display)",
    fontSize: 23,
    letterSpacing: "-0.03em",
    color: "var(--ink)",
  },
  panelBody: {
    margin: "0 0 18px",
    color: "var(--muted)",
    lineHeight: 1.55,
  },
  hopSight: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid var(--line)",
  },
  h4: {
    margin: "0 0 10px",
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--blue)",
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
  },
  fieldValue: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--ink-soft)",
    background: "rgba(243, 246, 251, 0.95)",
    borderRadius: 12,
    padding: "11px 12px",
    border: "1px solid var(--line)",
  },
  fieldValueDanger: {
    color: "#8f1e2c",
    background: "rgba(226, 61, 79, 0.08)",
    border: "1px solid rgba(226, 61, 79, 0.18)",
  },
  note: {
    margin: "6px 0 0",
    fontSize: 12,
    color: "var(--muted)",
    lineHeight: 1.45,
  },
  footer: {
    marginTop: 56,
    paddingTop: 24,
    borderTop: "1px solid var(--line-strong)",
    color: "var(--muted)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  claim: {
    margin: "0 0 14px",
    color: "var(--ink-soft)",
    fontWeight: 550,
  },
  claimsNote: {
    margin: 0,
    maxWidth: 640,
    fontSize: 12,
    lineHeight: 1.55,
    color: "var(--muted)",
  },
  footerLink: {
    color: "var(--blue)",
    fontWeight: 500,
  },
};
