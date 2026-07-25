import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { DEFAULT_SKIN, SKIN_BOOT_SCRIPT } from "@/components/board/skin-toggle";

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

export const metadata: Metadata = {
  title: "Graph Mini Apps",
  description:
    "Describe an onchain app. Get an agent with a UI, a wallet, and a name.",
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
      // preference, before the body paints.
      data-skin={DEFAULT_SKIN}
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the stored skin before first paint. Without it the page
            always flashes the default skin first, which on camera reads as a
            bug in the product rather than a feature of it. */}
        <script dangerouslySetInnerHTML={{ __html: SKIN_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
