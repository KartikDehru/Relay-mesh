"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CaptureResult,
  CircuitRegistry,
  DemoObservation,
  HopHealthStatus,
  RpcMethod,
} from "@/lib/types";
import {
  SAMPLE_BALANCE_ADDRESS,
  buildRpcPayload,
  cipherPreview,
  fetchClientIp,
  loadRegistry,
  pickFixedCircuit,
  pickRandomCircuit,
  probeHopHealth,
  sendDirect,
  sendViaMeshBrowser,
  deployedNodes,
  shortUrl,
} from "@/lib/mesh";
import { SiteNav } from "@/components/SiteNav";

type Mode = "fixed" | "random";

const WORKER_HASH =
  "0xf985be89550e8fea776ff7a88a470b114a0420bdc3a204c1a21239dc117a2154";
const SPECIFIER =
  "0x005d62b2fB2BbfB05d268990DA6c328F80de28D1";
const REPO = "https://github.com/KartikDehru/Relay-mesh";

export function DemoApp() {
  const [registry, setRegistry] = useState<CircuitRegistry | null>(null);
  const [health, setHealth] = useState<HopHealthStatus[] | null>(null);
  const [registryReady, setRegistryReady] = useState(false);
  const [mode, setMode] = useState<Mode>("fixed");
  const [method, setMethod] = useState<RpcMethod>("eth_blockNumber");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [activeHop, setActiveHop] = useState<number>(-1);
  const [directNote, setDirectNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reg = await loadRegistry();
        if (cancelled) return;
        setRegistry(reg);
        setRegistryReady(true);
        const statuses = await probeHopHealth(reg);
        if (!cancelled) setHealth(statuses);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setRegistryReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const liveCount = useMemo(
    () => (registry ? deployedNodes(registry).length : 0),
    [registry],
  );

  const loading = !registryReady;

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
      const rpcPayload = buildRpcPayload(method);
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
        legacyHops: mesh.legacyHops,
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

        {loading ? (
          <div style={styles.skeletonShell} aria-busy="true" aria-label="Loading circuit">
            <div style={styles.skeletonBlock} />
            <div style={{ ...styles.skeletonBlock, width: 140 }} />
          </div>
        ) : (
          <div style={styles.controlShell} className="anim-rise-delay-2">
            <label style={styles.modeLabel}>
              <span style={styles.labelText}>Circuit</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                style={styles.select}
                disabled={busy}
              >
                <option value="fixed">
                  Fixed circuit: hop1 → hop2 → hop3
                </option>
                <option value="random" disabled={liveCount < 3}>
                  Random 3 of {liveCount} live hops
                </option>
              </select>
            </label>
            <label style={styles.modeLabel}>
              <span style={styles.labelText}>Method</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as RpcMethod)}
                style={styles.select}
                disabled={busy}
              >
                <option value="eth_blockNumber">eth_blockNumber</option>
                <option value="eth_chainId">eth_chainId</option>
                <option value="eth_getBalance">eth_getBalance</option>
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
        )}

        {method === "eth_getBalance" && (
          <p style={styles.methodNote}>
            eth_getBalance matters because both the query (which address) and the
            response (the balance) reveal what you care about — sample address{" "}
            <code style={styles.mono}>{SAMPLE_BALANCE_ADDRESS}</code>.
          </p>
        )}

        {registry && (
          <p style={styles.meta} className="anim-rise-delay-3">
            <span style={styles.liveDot} />
            {liveCount} independent Railway hops configured · target{" "}
            <span style={styles.mono}>{shortUrl(registry.rpcTargetUrl)}</span>
          </p>
        )}
      </header>

      <HealthStrip health={health} loading={loading} />

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

      {capture?.legacyHops && (
        <div style={styles.warn} role="status">
          Live hops returned an unsealed response (pre-hardening build). Redeploy
          hop1–hop4 with the latest image and allowlists to enable encrypted
          replies and sealed observations.
        </div>
      )}

      {capture && (
        <BeforeAfter
          capture={capture}
          registry={registry}
          directNote={directNote}
        />
      )}

      {registry && <VerifySection registry={registry} />}

      <footer style={styles.footer}>
        <p style={styles.footerBrand}>Relay Mesh</p>
        <p style={styles.claim}>
          Built for ETHGlobal Mumbai 2026 — Ethereum Foundation Anon-RPC track
        </p>
        <p style={styles.claimsNote}>
          <a href={REPO} style={styles.footerLink} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          {" · "}
          <a
            href={`${REPO}/blob/main/LICENSE`}
            style={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT license
          </a>
          {" · "}
          <a
            href={`${REPO}#claims--sources`}
            style={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Claims &amp; Sources
          </a>
        </p>
      </footer>
    </div>
  );
}

function HealthStrip({
  health,
  loading,
}: {
  health: HopHealthStatus[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div style={styles.healthStrip} aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={styles.healthCardSkeleton} />
        ))}
      </div>
    );
  }
  if (!health || health.length === 0) return null;

  return (
    <section style={styles.healthStrip} aria-label="Live hop health">
      {health.map((h) => (
        <a
          key={h.id}
          href={`${h.url}/health`}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.healthCard}
        >
          <div style={styles.healthTop}>
            <span
              style={{
                ...styles.statusDot,
                background: h.ok ? "var(--ok)" : "var(--danger)",
                boxShadow: h.ok
                  ? "0 0 0 4px rgba(31, 169, 113, 0.15)"
                  : "0 0 0 4px rgba(226, 61, 79, 0.15)",
              }}
            />
            <strong style={styles.healthId}>{h.id}</strong>
            <span style={styles.healthRole}>{h.role}</span>
          </div>
          <div style={styles.healthFp}>{h.fingerprint}</div>
          <div style={styles.healthMeta}>
            {h.latencyMs != null ? `${h.latencyMs} ms` : "—"}
            {h.error ? ` · ${h.error}` : " · /health"}
          </div>
        </a>
      ))}
    </section>
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

  return (
    <div style={styles.circuit} className="circuit-strip">
      {hopIds.map((id, i) => {
        const node = map.get(id);
        const active = busy && activeHop === i;
        return (
          <div key={id} style={styles.hopWrap} className="circuit-hop">
            {i > 0 && (
              <div
                className="circuit-connector"
                style={{
                  ...styles.connector,
                  opacity: busy && activeHop >= i ? 1 : 0.45,
                }}
              />
            )}
            <div
              style={{
                ...styles.hop,
                borderColor: active ? "var(--violet)" : "var(--line-strong)",
                boxShadow: active
                  ? "0 0 0 3px rgba(107, 92, 255, 0.2)"
                  : "var(--shadow-sm)",
              }}
            >
              <span style={{ ...styles.hopRole, color: "var(--violet)" }}>
                {roles[i]}
              </span>
              <span style={styles.hopId}>{id}</span>
              <span style={styles.hopFp}>
                {node?.fingerprint?.slice(0, 8) ?? "—"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
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
  const labels = [
    `Observed by ${capture.hopIds[0]} (entry)`,
    `Observed by ${capture.hopIds[1]} (middle)`,
    `Observed by ${capture.hopIds[2]} (exit)`,
  ];
  const obs = capture.observations;

  return (
    <section style={styles.compare} className="anim-rise">
      <div style={styles.compareHead}>
        <h2 style={styles.h2}>Before / after</h2>
        <p style={styles.compareSub}>
          Same <code style={styles.mono}>{capture.rpcPayload.method}</code> call
          — who saw what.
        </p>
        <p style={styles.timingRow}>
          Direct:{" "}
          <strong>{capture.directMs ? `${capture.directMs} ms` : "n/a"}</strong>
          {" · "}
          Mesh: <strong>{capture.meshMs} ms</strong>
          {obs.some((o) => o.ms != null) && (
            <>
              {" · "}
              Per-hop:{" "}
              {obs
                .map((o, i) => `${capture.hopIds[i] ?? o.role} ${o.ms ?? "—"}ms`)
                .join(", ")}
            </>
          )}
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

          {obs.length >= 3 ? (
            obs.slice(0, 3).map((o, i) => (
              <ObservationCard
                key={i}
                title={labels[i]!}
                observation={o}
                hopId={capture.hopIds[i]!}
                entryCipherPreview={
                  i === 0 ? capture.entryCipherPreview : undefined
                }
                entryCipherBytes={
                  i === 0 ? capture.entryCipherBytes : undefined
                }
                clientIp={i === 0 ? capture.clientIp : undefined}
                rpcPayload={
                  o.sawPlaintextQuery ? capture.rpcPayload : undefined
                }
                registry={registry}
                midHopId={capture.hopIds[1]}
              />
            ))
          ) : (
            <>
              <div style={styles.hopSight}>
                <h4 style={styles.h4}>{labels[0]}</h4>
                <Field label="Client IP" value={capture.clientIp} />
                <Field
                  label={`Encrypted blob (~${capture.entryCipherBytes} bytes)`}
                  value={capture.entryCipherPreview}
                  mono
                />
                <p style={styles.note}>
                  Sees your IP and ciphertext only — not the RPC method or params.
                </p>
              </div>
              <div style={styles.hopSight}>
                <h4 style={styles.h4}>{labels[1]}</h4>
                <Field
                  label="Peer"
                  value={`${capture.hopIds[0]} → ${capture.hopIds[2]} (ciphertext only)`}
                />
                <p style={styles.note}>
                  Sees neither your IP nor the plaintext query.
                </p>
              </div>
              <div style={styles.hopSight}>
                <h4 style={styles.h4}>{labels[2]}</h4>
                <Field
                  label="Plaintext query"
                  value={JSON.stringify(capture.rpcPayload, null, 2)}
                  mono
                />
                <p style={styles.note}>
                  Sees the query, never your original client IP. Sealed
                  per-hop records appear here after hops redeploy with
                  DEMO_LOGGING=true.
                </p>
              </div>
            </>
          )}

          <div style={styles.hopSight}>
            <h4 style={styles.h4}>Encrypted reply path</h4>
            <Field
              label="Reply at hop1 & hop2"
              value={
                capture.legacyHops
                  ? "Not encrypted (legacy hop build)"
                  : "Ciphertext only — sealed reply envelope; hop1/hop2 cannot read status or body"
              }
            />
          </div>

          <p style={styles.note}>
            Recorded by the relay itself and sealed to your browser; no hop can
            read another hop&apos;s record.
          </p>

          <Field
            label={`Mesh response (${capture.meshMs} ms)`}
            value={JSON.stringify(capture.meshResult, null, 2)}
            mono
          />
        </article>
      </div>
    </section>
  );
}

function ObservationCard({
  title,
  observation,
  hopId,
  entryCipherPreview,
  entryCipherBytes,
  clientIp,
  rpcPayload,
  registry,
  midHopId,
}: {
  title: string;
  observation: DemoObservation;
  hopId: string;
  entryCipherPreview?: string;
  entryCipherBytes?: number;
  clientIp?: string;
  rpcPayload?: CaptureResult["rpcPayload"];
  registry: CircuitRegistry | null;
  midHopId?: string;
}) {
  const mid = registry?.nodes.find((n) => n.id === midHopId);
  return (
    <div style={styles.hopSight}>
      <h4 style={styles.h4}>{title}</h4>
      <Field label="Observed peer IP" value={observation.observedPeerIp} />
      <Field label="Bytes in" value={String(observation.bytesIn)} />
      <Field
        label="Payload sha256 prefix"
        value={observation.payloadSha256Prefix}
        mono
      />
      <Field
        label="Layer"
        value={`${observation.layerType}${observation.ms != null ? ` · ${observation.ms} ms` : ""}`}
      />
      {clientIp && <Field label="Client IP (entry)" value={clientIp} />}
      {entryCipherPreview && entryCipherBytes != null && (
        <Field
          label={`Encrypted blob (~${entryCipherBytes} bytes)`}
          value={entryCipherPreview}
          mono
        />
      )}
      {rpcPayload && (
        <>
          <Field
            label="Upstream (not your IP)"
            value={
              mid
                ? `${midHopId} · ${shortUrl(mid.url)}`
                : (midHopId ?? "previous hop")
            }
          />
          <Field
            label="Plaintext query"
            value={JSON.stringify(rpcPayload, null, 2)}
            mono
          />
        </>
      )}
      {!observation.sawPlaintextQuery && (
        <p style={styles.note}>
          Cannot read the RPC method or params · hop {hopId}.
        </p>
      )}
      {observation.sawPlaintextQuery && (
        <p style={styles.note}>
          Sees the query, never your original client IP · hop {hopId}.
        </p>
      )}
    </div>
  );
}

function VerifySection({ registry }: { registry: CircuitRegistry }) {
  const nodes = deployedNodes(registry);
  return (
    <section style={styles.verify} className="anim-rise">
      <h2 style={styles.h2}>Verify it yourself</h2>
      <p style={styles.compareSub}>
        Independent checks a judge can open without trusting this page.
      </p>
      <ul style={styles.verifyList}>
        {nodes.map((n) => (
          <li key={n.id}>
            <a
              href={`${n.url.replace(/\/$/, "")}/health`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.footerLink}
            >
              {n.id} /health
            </a>
          </li>
        ))}
        <li>
          <a
            href={`https://sepolia.etherscan.io/address/${SPECIFIER}`}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.footerLink}
          >
            Sepolia specifier on Etherscan
          </a>
        </li>
        <li>
          Worker keccak256{" "}
          <code style={styles.mono}>{WORKER_HASH}</code>
          <div style={styles.verifyCmd}>
            pnpm --filter @relay-mesh/anon-rpc-worker build && cat
            packages/anon-rpc-worker/dist/worker-meta.json
          </div>
        </li>
        <li>
          <a href={REPO} target="_blank" rel="noopener noreferrer" style={styles.footerLink}>
            GitHub repository
          </a>
        </li>
        <li>
          <a
            href={`${REPO}#claims--sources`}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.footerLink}
          >
            Claims &amp; Sources
          </a>
        </li>
      </ul>
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1080,
    margin: "0 auto",
    padding: "56px 20px 88px",
    width: "100%",
    overflowX: "hidden",
  },
  header: { marginBottom: 28 },
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
    fontSize: "clamp(2.4rem, 6vw, 4.2rem)",
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
  skeletonShell: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    padding: 16,
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 20,
    width: "100%",
    maxWidth: 560,
  },
  skeletonBlock: {
    height: 44,
    width: 220,
    maxWidth: "100%",
    borderRadius: 12,
    background:
      "linear-gradient(90deg, rgba(18,20,26,0.06), rgba(18,20,26,0.12), rgba(18,20,26,0.06))",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.2s ease-in-out infinite",
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
    width: "100%",
    maxWidth: 720,
  },
  modeLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    flex: "1 1 200px",
    minWidth: 0,
  },
  labelText: {
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
    width: "100%",
    minWidth: 0,
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
    flex: "0 0 auto",
  },
  methodNote: {
    margin: "12px 0 0",
    fontSize: 13,
    color: "var(--muted)",
    lineHeight: 1.5,
    maxWidth: 640,
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    fontSize: 13,
    color: "var(--muted)",
    flexWrap: "wrap",
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
  healthStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
    gap: 12,
    marginBottom: 28,
  },
  healthCard: {
    display: "block",
    textDecoration: "none",
    color: "inherit",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: "14px 14px 12px",
    boxShadow: "var(--shadow-sm)",
  },
  healthCardSkeleton: {
    height: 88,
    borderRadius: 16,
    background:
      "linear-gradient(90deg, rgba(18,20,26,0.05), rgba(18,20,26,0.1), rgba(18,20,26,0.05))",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.2s ease-in-out infinite",
  },
  healthTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
  },
  healthId: {
    fontFamily: "var(--font-display)",
    fontSize: 16,
    letterSpacing: "-0.02em",
  },
  healthRole: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted)",
    fontFamily: "var(--font-mono)",
  },
  healthFp: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--ink-soft)",
    wordBreak: "break-all",
  },
  healthMeta: {
    marginTop: 6,
    fontSize: 12,
    color: "var(--muted)",
  },
  circuit: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 0,
    marginBottom: 28,
    padding: "18px 16px",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 22,
    boxShadow: "var(--shadow-sm)",
  },
  hopWrap: { display: "flex", alignItems: "center" },
  connector: {
    width: 28,
    height: 3,
    borderRadius: 99,
    background:
      "linear-gradient(90deg, rgba(107,92,255,0.2), var(--violet), var(--blue), rgba(31,125,255,0.2))",
    margin: "0 4px",
  },
  hop: {
    background: "var(--surface-solid)",
    border: "1px solid var(--line-strong)",
    borderRadius: 16,
    padding: "12px 14px",
    minWidth: 100,
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
    fontSize: 18,
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
  warn: {
    background: "rgba(239, 159, 46, 0.12)",
    border: "1px solid rgba(239, 159, 46, 0.35)",
    borderRadius: 14,
    padding: "12px 16px",
    marginBottom: 24,
    color: "#8a5a12",
    fontSize: 13,
    lineHeight: 1.5,
  },
  compare: { marginTop: 8 },
  compareHead: { marginBottom: 18 },
  h2: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 28,
    letterSpacing: "-0.035em",
    color: "var(--ink)",
  },
  compareSub: {
    margin: "8px 0 0",
    color: "var(--muted)",
    fontSize: 15,
  },
  timingRow: {
    margin: "10px 0 0",
    fontSize: 13,
    color: "var(--ink-soft)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
    gap: 18,
  },
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--line-strong)",
    borderRadius: 22,
    padding: 22,
    boxShadow: "var(--shadow)",
    minWidth: 0,
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
    fontSize: 22,
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
  field: { marginBottom: 12 },
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
    wordBreak: "break-word",
    overflowWrap: "anywhere",
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
  verify: {
    marginTop: 48,
    padding: 22,
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 22,
  },
  verifyList: {
    margin: "16px 0 0",
    paddingLeft: 18,
    color: "var(--ink-soft)",
    lineHeight: 1.7,
    fontSize: 14,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    maxWidth: "100%",
  },
  verifyCmd: {
    marginTop: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    background: "rgba(243, 246, 251, 0.95)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "8px 10px",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    whiteSpace: "pre-wrap",
    maxWidth: "100%",
  },
  footer: {
    marginTop: 56,
    paddingTop: 24,
    borderTop: "1px solid var(--line-strong)",
    color: "var(--muted)",
    fontSize: 13,
    lineHeight: 1.6,
  },
  footerBrand: {
    margin: "0 0 6px",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    color: "var(--ink)",
    letterSpacing: "-0.02em",
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
