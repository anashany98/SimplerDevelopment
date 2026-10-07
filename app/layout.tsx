import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { defaultSEO } from "@/config/seo";
import { StructuredData } from "@/components/seo/StructuredData";
import { generateOrganizationSchema } from "@/lib/utils/structured-data";
import { headers } from "next/headers";
import dynamic from "next/dynamic";

// Code-split the app chrome (NextAuth SessionProvider + LayoutContent, which
// pull in next-auth/react and a pile of icons). Statically importing them
// bundled all of that into the client chunk loaded on EVERY page — including
// public client sites that never render them. Dynamic (ssr: true) keeps them
// server-rendered where used but keeps their chunk off pages (client sites)
// that don't render them.
const SessionProvider = dynamic(() => import("@/components/SessionProvider"));
const LayoutContent = dynamic(() =>
  import("@/components/LayoutContent").then((m) => m.LayoutContent),
);

// A Cloudflare Quick Tunnel has a generated hostname. Reuse the explicitly
// configured development origins so the same tunnel receives the app chrome
// (including SessionProvider) instead of being mistaken for a tenant site.
// Unknown hosts remain tenant sites and keep their isolated public layout.
const DEV_TUNNEL_APP_HOSTS = new Set(
  (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

// Hostnames derived from the configured app URL (NEXT_PUBLIC_APP_URL /
// NEXT_PUBLIC_SITE_URL). Mirrors middleware.ts isAppHostname: a custom
// deployment domain (e.g. anaxia.tech) must be treated as an app host, or the
// root layout classifies it as a client site, skips the SessionProvider, and
// every useSession() caller in the portal/admin chrome throws at render time.
const CONFIGURED_APP_HOSTS = new Set(
  [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL]
    .map((url) => {
      if (!url) return null;
      try {
        return new URL(url).hostname.toLowerCase();
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value)),
);

// preload: false — these app/portal fonts were being <link rel=preload>ed on
// EVERY route (~180KB of woff2), including public client sites that use their
// own brand fonts (Raleway/Open Sans) and never reference these. With preload
// off they still load on-demand where actually used (var(--font-*)), but no
// longer sit on the critical path of pages that don't use them.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  preload: false,
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
});

// ─── Retro-future marketing type ────────────────────────────────────────────
// Orbitron/Raleway (the retro-future marketing pair) lived in the deleted
// app/(pages) route group; nothing in the app uses them anymore.

export const metadata: Metadata = defaultSEO;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  // Detect client site requests — those supply their own nav/footer and skip
  // the app chrome. On a dedicated client host (e.g. a client's own domain)
  // the hostname check is enough. But `staging.simplerdevelopment.com` is an app
  // host that multiplexes BOTH the app (/) and client sites
  // (/sites/<domain>) on one host, so hostname alone can't tell them apart —
  // the middleware forwards `x-site-pathname` on /sites/* routes to mark them.
  const APP_HOSTS = ["localhost", "127.0.0.1", "simplerdevelopment.com", "www.simplerdevelopment.com", "staging.simplerdevelopment.com", "anaxia.tech", "www.anaxia.tech"];
  const hostname = host.split(":")[0].toLowerCase();
  const isSitesRoute = headersList.get("x-site-pathname") !== null;
  const isAppHost =
    APP_HOSTS.includes(hostname) ||
    CONFIGURED_APP_HOSTS.has(hostname) ||
    hostname.endsWith(".railway.app") ||
    // Temporary Cloudflare Quick Tunnels are app surfaces too (portal, auth).
    // Mirrors the `.trycloudflare.com` allowance in middleware.ts isAppHostname
    // — without it the root layout classifies the tunnel host as a client
    // site, skips the SessionProvider, and every useSession() caller in the
    // portal chrome (PortalSidebar, NotificationBell) throws at render time.
    hostname.endsWith(".trycloudflare.com") ||
    DEV_TUNNEL_APP_HOSTS.has(hostname);
  const isClientSite = isSitesRoute || !isAppHost;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  // Fonts declared with next/font in THIS file are attributed to the root
  // layout, which is in every route's graph — so Next emitted their
  // <link rel=preload> on public client sites too, which use their own brand
  // fonts and resolve none of these (verified live: a getComputedStyle sweep
  // over every element plus ::before/::after on two production client-site
  // pages matched none of these faces, and --font-sans computed to an empty
  // string on a client-site <body>).
  //
  // Gating the className alone does NOT fix that, and we shipped that mistake
  // once: next/font emits the preload from the font manifest keyed by the
  // declaring module, not from whether the class is applied. Measured after
  // deploy — still 2 preloaded woff2 (53KB) on every client-site page.
  //
  // The fix is where a font is DECLARED. The marketing pair shipped in the
  // deleted app/(pages) route group, which client sites never enter. Everything
  // left here is preload:false, so it costs a client site nothing: no preload
  // link, and no fetch, because nothing on the page matches the face.
  //
  // The className gate below is still worth keeping — it stops client sites
  // inheriting unused custom properties — but it is a tidiness measure, not
  // the thing that saves the bytes.
  // (geistMono is deliberately NOT gated — app/sites/**/checkout uses the
  // `font-mono` utility, which resolves through --font-mono to
  // var(--font-geist-mono), so client sites still need it.)
  const appShellFontVariables = isClientSite
    ? ""
    : `${geistSans.variable} ${dmSans.variable} ${inter.variable} ${playfairDisplay.variable}`;
  return (
    // Client sites are pinned light at the ROOT: the class both keeps the
    // token media block (`:root:not(.light)`) from firing and, with the
    // class-driven `dark:` variant (globals.css), keeps every dark: utility
    // inert on tenant pages. The theme script below is portal-only — a
    // visitor's OS preference must never restyle a tenant's brand.
    <html lang="en" className={isClientSite ? 'light' : undefined} suppressHydrationWarning>
      <head>
        <StructuredData data={generateOrganizationSchema()} />
        {/* Material Icons only for the app/portal. Public client sites load it
            (non-blocking) from their own site layout if their content needs it,
            so we don't put a 126KB render-blocking font stylesheet on every
            public page's critical path. */}
        {!isClientSite && (
          <>
            {/* Material Icons is self-hosted (see app/globals.css @font-face).
             *  Preload the woff2 so icon glyphs paint immediately. */}
            <link
              rel="preload"
              href="/fonts/material-icons-subset.woff2"
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
            {/* Google tag (gtag.js) — SD marketing/app only; tenant client
                sites manage their own analytics via site custom code. Only
                rendered when NEXT_PUBLIC_GA_ID is set, so dev/preview
                environments without the var don't fire GA. */}
            {gaId && (
              <>
                <script
                  async
                  src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
                />
                <script
                  dangerouslySetInnerHTML={{
                    __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`,
                  }}
                />
              </>
            )}
          </>
        )}
        {!isClientSite && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'system';
                  const root = document.documentElement;

                  if (theme === 'system') {
                    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                    root.classList.add(systemTheme);
                  } else {
                    root.classList.add(theme);
                  }
                } catch (e) {}
              })();
            `,
            }}
          />
        )}
      </head>
      <body
        className={`${geistMono.variable} ${appShellFontVariables} antialiased min-h-screen flex flex-col`}
      >
        {isClientSite ? (
          // Public client sites supply their own nav/footer (app/sites/[domain]
          // layout) and have no authenticated UI, so they need neither the app
          // chrome (LayoutContent) nor the NextAuth SessionProvider. Skipping
          // both keeps a large amount of unused client JS off every public
          // page. (Verified: no public-site component calls useSession.)
          children
        ) : (
          <SessionProvider>
            <LayoutContent isClientSite={isClientSite}>{children}</LayoutContent>
          </SessionProvider>
        )}
      </body>
    </html>
  );
}
