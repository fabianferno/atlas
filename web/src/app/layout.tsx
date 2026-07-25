import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { DEFAULT_SKIN, SKIN_BOOT_SCRIPT } from "@/components/board/skin-toggle";
import { LedgerDock } from "@/components/board/ledger-dock";
import { AgencyPrivyProvider } from "@/components/providers/privy";

// Rule 4 (prd.md §6): Archivo carries a width axis, so display and UI are one
// family. IBM Plex Mono is half the interface, not an accent.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// The Graph's own type. Euclid Circular A is paid; Poppins is the brand's
// sanctioned free stand-in, so it is loaded only to dress the `graph` skin.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const APP_NAME = "Atlas";
const APP_DESCRIPTION =
  "Describe an onchain app. Get an agent with a UI, a wallet, and a name.";

// No `icons` or `*.images` key here on purpose. app/favicon.ico,
// app/apple-icon.png and app/opengraph-image.tsx are picked up by Next's file
// conventions and emit their own tags; declaring them again here would ship
// every icon twice and give us two places to forget to update.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://atlas.xyz"),
  title: APP_NAME,
  description: APP_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Rendered with the default so the server and the first client paint
      // agree; the boot script below immediately corrects it to the stored
      // preference, before the body paints. That deliberate correction changes
      // `data-skin` between the server HTML and the hydrated DOM, so we suppress
      // the hydration warning on THIS element only — it is the intended
      // behaviour of the boot script, not a bug.
      suppressHydrationWarning
      data-skin={DEFAULT_SKIN}
      className={`${archivo.variable} ${plexMono.variable} ${poppins.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the stored skin before first paint. Without it the page
            always flashes the default skin first, which on camera reads as a
            bug in the product rather than a feature of it. */}
        <script dangerouslySetInnerHTML={{ __html: SKIN_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Wraps the whole app, not just the top bar: the wallet button, the
            ledger and anything that funds a mini app all read the same Privy
            session, and a provider mounted deeper would unmount on navigation
            and drop it. Passes children straight through when Privy is
            unconfigured, so the board still runs with no keys set. */}
        <AgencyPrivyProvider>
          {children}
          {/* Mounted here rather than per page so it survives navigation with its
              open state and unseen count intact — see ledger-dock.tsx. */}
          <LedgerDock />
        </AgencyPrivyProvider>
      </body>
    </html>
  );
}
