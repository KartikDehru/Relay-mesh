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

export const metadata: Metadata = {
  title: "Relay Mesh — private JSON-RPC",
  description:
    "3-hop onion-routed relay mesh. No single hop sees both your IP and your query.",
  icons: { icon: "/favicon.svg" },
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
