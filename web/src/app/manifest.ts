import type { MetadataRoute } from "next";

// Mirrors the metadata in layout.tsx — same name, same mark. theme_color and
// background_color match the mark's own ground, so the splash screen is one
// flat field with the icon on it rather than a black tile on white.
// Icons come from scripts/generate-brand-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas",
    short_name: "Atlas",
    description:
      "Describe an onchain app. Get an agent with a UI, a wallet, and a name.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The disc is half the tile wide and centred, so it survives every
      // platform's maskable crop without a separate padded render.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
