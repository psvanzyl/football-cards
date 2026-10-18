import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/Ball";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://football.laserraptorai.duckdns.org"),
  title: {
    default: "Footballdex — every footballer in the world, searchable",
    template: "%s · Footballdex",
  },
  description:
    "A searchable, filterable and sortable card catalogue of association football players worldwide: clubs, national teams, positions, birth years, heights and career records, built from Wikidata.",
  keywords: ["football", "soccer", "players", "catalogue", "database", "search", "Wikidata"],
  openGraph: {
    title: "Footballdex — every footballer in the world",
    description:
      "Search hundreds of thousands of footballers by name, country, position, club and era. Free, no account, no tracking.",
    type: "website",
    url: "/",
  },
  robots: { index: true, follow: true },
};

const NAV = [
  { href: "/", label: "Players" },
  { href: "/teams", label: "Teams" },
  { href: "/countries", label: "Countries" },
  { href: "/about", label: "About" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bebas.variable}`}>
      <body className="min-h-screen bg-pitch-950">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-pitch-950/85 backdrop-blur">
          {/* The nav is wider than a 390 px phone, so the row is allowed to wrap: the logo
              keeps the first line and the links drop onto a second one. */}
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <Logo />
            <nav className="ml-auto flex items-center gap-0.5 text-[12px] sm:gap-1 sm:text-[13px]">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-full px-2 py-1.5 text-muted transition hover:bg-pitch-850 hover:text-fg sm:px-3"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>

        <footer className="mt-12 border-t border-line/70 bg-pitch-900/40">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              Data from{" "}
              <a
                className="text-turf hover:underline"
                href="https://www.wikidata.org"
                rel="noreferrer noopener"
                target="_blank"
              >
                Wikidata
              </a>{" "}
              (CC0) via the QLever SPARQL endpoint. Rebuilt from source on demand.
            </p>
            <p className="flex items-center gap-3">
              <Link href="/about" className="hover:text-fg">
                Method &amp; limits
              </Link>
              <span className="text-muted/40">|</span>
              <span>Footballdex</span>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
