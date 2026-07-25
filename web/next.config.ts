import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    // Next parks its dev indicator bottom-left by default, which is exactly
    // where the ledger dock lives — in dev it covers the pill and swallows the
    // click. Production never renders the indicator, so this is a dev-only
    // collision, but it makes the dock untestable until it moves.
    position: "bottom-right",
  },
};

export default nextConfig;
