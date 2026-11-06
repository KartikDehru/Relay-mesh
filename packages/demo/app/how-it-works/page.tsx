import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "How it works — Relay Mesh",
  description:
    "How Relay Mesh's 3-hop onion path separates client identity from plaintext JSON-RPC content.",
};

export default function HowItWorksPage() {
  return (
    <div style={styles.page}>
      <SiteNav />
      <article style={styles.article} className="anim-rise">
        <p style={styles.eyebrow}>Architecture</p>
        <h1 style={styles.h1}>How it works</h1>
        <p style={styles.lede}>
          Relay Mesh is a request-scoped onion path for JSON-RPC. Each hop peels
          only its own sealed layer. No single hop sees both your network
          identity and the plaintext query.
        </p>

        <section style={styles.section}>
          <h2 style={styles.h2}>Packet flow</h2>
          <pre style={styles.code}>{`Client ──onion──► Hop1 (entry)
                 ──blob──► Hop2 (middle)
                 ──blob──► Hop3 (exit)
                 ──JSON-RPC──► Target RPC
Response bubbles back up the same chain unchanged.`}</pre>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>Onion layering</h2>
          <ol style={styles.list}>
            <li>
              <strong>Innermost (exit):</strong> encrypt{" "}
              <code style={styles.mono}>{"{ rpcTargetUrl, rpcPayload }"}</code>{" "}
              with Hop3&apos;s public key.
            </li>
            <li>
              <strong>Middle:</strong> encrypt{" "}
              <code style={styles.mono}>
                {"{ nextHopUrl: Hop3, innerBlob }"}
              </code>{" "}
              with Hop2&apos;s public key.
            </li>
            <li>
              <strong>Outer (entry):</strong> encrypt{" "}
              <code style={styles.mono}>
                {"{ nextHopUrl: Hop2, innerBlob }"}
              </code>{" "}
              with Hop1&apos;s public key.
            </li>
          </ol>
          <p style={styles.body}>
            Built client-side with <code style={styles.mono}>@noble/curves</code>{" "}
            (x25519) and <code style={styles.mono}>@noble/ciphers</code>{" "}
            (XChaCha20-Poly1305). The demo never proxies relay traffic through
            Vercel.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>What each hop knows</h2>
          <ul style={styles.list}>
            <li>
              <strong>Entry</strong> — your IP + ciphertext. Cannot read the
              method or params.
            </li>
            <li>
              <strong>Middle</strong> — previous hop IP + next hop URL +
              ciphertext.
            </li>
            <li>
              <strong>Exit</strong> — plaintext RPC + upstream hop IP. Never your
              original client IP.
            </li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>Anon-RPC</h2>
          <p style={styles.body}>
            Anon-RPC leaves the anonymizing network&apos;s topology unspecified.
            Relay Mesh is built to be that network: a concrete multi-hop path
            that plugs into Anon-RPC&apos;s worker interface. Live pin details
            and Claims &amp; Sources are in the project{" "}
            <a
              href="https://github.com/KartikDehru/Relay-mesh#why-this-network"
              style={styles.a}
            >
              README
            </a>
            ; try the{" "}
            <a
              href="https://ethereum.github.io/anon-rpc/demo/"
              style={styles.a}
            >
              anon-rpc live demo
            </a>{" "}
            with the published worker hash.
          </p>
        </section>

        <p style={styles.back}>
          <Link href="/" style={styles.a}>
            ← Back to demo
          </Link>
        </p>
      </article>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: "relative",
    zIndex: 1,
    maxWidth: 820,
    margin: "0 auto",
    padding: "40px 24px 88px",
  },
  article: {},
  eyebrow: {
    margin: 0,
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--muted)",
    fontFamily: "var(--font-mono)",
  },
  h1: {
    margin: "8px 0 14px",
    fontFamily: "var(--font-display)",
    fontSize: "clamp(2.2rem, 5vw, 3.2rem)",
    letterSpacing: "-0.04em",
    color: "var(--ink)",
  },
  lede: {
    margin: "0 0 32px",
    fontSize: 17,
    lineHeight: 1.6,
    color: "var(--muted)",
  },
  section: {
    marginBottom: 28,
    padding: 22,
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 18,
    boxShadow: "var(--shadow-sm)",
  },
  h2: {
    margin: "0 0 12px",
    fontFamily: "var(--font-display)",
    fontSize: 22,
    letterSpacing: "-0.03em",
  },
  body: {
    margin: "12px 0 0",
    color: "var(--muted)",
    lineHeight: 1.6,
  },
  list: {
    margin: 0,
    paddingLeft: 20,
    color: "var(--ink-soft)",
    lineHeight: 1.65,
  },
  code: {
    margin: 0,
    padding: 14,
    borderRadius: 12,
    background: "rgba(243, 246, 251, 0.95)",
    border: "1px solid var(--line)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    overflowX: "auto",
  },
  mono: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.92em",
  },
  a: {
    color: "var(--blue)",
    fontWeight: 500,
  },
  back: {
    marginTop: 28,
  },
};
