"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DOCS_URL = "https://github.com/KartikDehru/Relay-mesh";

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav style={styles.nav} aria-label="Primary">
      <Link href="/" style={styles.brandLink}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/relay-mesh-logo.svg"
          alt=""
          width={28}
          height={28}
          style={styles.mark}
        />
        <span style={styles.brandText}>Relay Mesh</span>
      </Link>
      <div style={styles.links}>
        <Link
          href="/how-it-works"
          style={{
            ...styles.link,
            ...(pathname === "/how-it-works" ? styles.linkActive : null),
          }}
        >
          How it works
        </Link>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.link}
        >
          Docs
        </a>
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 36,
    padding: "12px 14px",
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 16,
    boxShadow: "var(--shadow-sm)",
    backdropFilter: "blur(12px)",
  },
  brandLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "var(--ink)",
  },
  mark: {
    display: "block",
  },
  brandText: {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    fontSize: 16,
  },
  links: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  link: {
    textDecoration: "none",
    color: "var(--muted)",
    fontSize: 14,
    fontWeight: 500,
    padding: "8px 12px",
    borderRadius: 999,
  },
  linkActive: {
    color: "var(--ink)",
    background: "rgba(107, 92, 255, 0.1)",
  },
};
