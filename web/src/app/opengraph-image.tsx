import { ImageResponse } from "next/og";

/**
 * The share card. Generated rather than shipped as a flat PNG so the wordmark
 * and the strapline stay typeset — a bare mark on black tells a reader nothing
 * about what they are about to open.
 *
 * Mark geometry matches src/components/brand/brand-mark.tsx; satori has no
 * mask support, so the asterisk is painted in the ground colour instead of
 * knocked out. The result is identical over a flat background like this one.
 */
export const alt = "Graph Mini Apps — describe an onchain app, get an agent with a UI, a wallet, and a name.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GROUND = "#0A0A0A";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: GROUND,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          color: "#fff",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="25.31" fill="#fff" />
          <g fill={GROUND}>
            <rect x="47.9375" y="34.875" width="4.125" height="30.25" />
            <rect x="47.9375" y="34.875" width="4.125" height="30.25" transform="rotate(45 50 50)" />
            <rect x="47.9375" y="34.875" width="4.125" height="30.25" transform="rotate(-45 50 50)" />
            <rect x="34.875" y="47.9375" width="40.435" height="4.125" />
          </g>
        </svg>

        <div style={{ fontSize: 76, letterSpacing: "-0.02em", marginTop: 44 }}>Graph Mini Apps</div>
        {/* Capped so the strapline breaks into two balanced lines instead of
            running to the edge and orphaning its last two words. */}
        <div style={{ fontSize: 34, color: "#8A857C", marginTop: 18, maxWidth: 720 }}>
          Describe an onchain app. Get an agent with a UI, a wallet, and a name.
        </div>
      </div>
    ),
    size,
  );
}
