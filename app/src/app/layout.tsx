import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/Ball";
import { ThemeToggle } from "@/components/ThemeToggle";
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

/**
 * Runs before the rest of the body is parsed, so the theme class is on <html> before first
 * paint. Light is the default even when the OS prefers dark; "system" is only honoured once
 * the reader has chosen it.
 */
const THEME_INIT = `(function(){try{var m=localStorage.getItem("footballdex-theme");if(m!=="light"&&m!=="dark"&&m!=="system")m="light";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bebas.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-pitch-950">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <header className="sticky top-0 z-30 border-b border-line/70 bg-pitch-950/85 backdrop-blur">
          {/* The nav is wider than a 390 px phone, so the row is allowed to wrap: the logo
              keeps the first line and the links drop onto a second one. */}
          <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5">
            <Logo />
            <nav className="ml-auto hidden min-w-0 items-center gap-0.5 text-[12px] sm:flex sm:gap-1 sm:text-[13px]">
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
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-5">{children}</main>

        <footer className="mt-12 border-t border-line/70 bg-pitch-900/40">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-3 py-8 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
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
            <p className="flex flex-wrap items-center gap-3">
              {/* The header nav is hidden on a phone, so the routes live here. */}
              <Link href="/" className="hover:text-fg">
                Players
              </Link>
              <Link href="/teams" className="hover:text-fg">
                Teams
              </Link>
              <Link href="/countries" className="hover:text-fg">
                Countries
              </Link>
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
