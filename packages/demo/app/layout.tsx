import type { Metadata } from "next";
import { Syne, Sora, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

const siteUrl = "https://relay-mesh-zeta.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Relay Mesh — private JSON-RPC",
  description:
    "3-hop onion-routed relay for private JSON-RPC. No single hop sees both your IP and your query. Built for ETHGlobal Mumbai — Anon-RPC track.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Relay Mesh — private JSON-RPC",
    description:
      "3-hop onion-routed relay for private JSON-RPC. Verify hops, sealed observations, and the Sepolia worker pin.",
    url: siteUrl,
    siteName: "Relay Mesh",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Relay Mesh" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay Mesh — private JSON-RPC",
    description:
      "3-hop onion-routed relay for private JSON-RPC. No single hop sees both your IP and your query.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${syne.variable} ${sora.variable} ${plex.variable}`}>
      <body
        style={
          {
            ["--font-display" as string]: "var(--font-syne), sans-serif",
            ["--font-body" as string]: "var(--font-sora), sans-serif",
            ["--font-mono" as string]: "var(--font-plex), monospace",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
