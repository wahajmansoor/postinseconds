import type React from "react";

/**
 * Global SVG Definitions for organic and curved Canva-style Photo Frames.
 * Uses `clipPathUnits="objectBoundingBox"` so paths are 100% resolution-independent,
 * scaling smoothly to any layer dimensions with zero pixelation or jagged edges.
 */
export function FrameDefs() {
  return (
    <svg
      id="postinseconds-frame-svg-defs"
      className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        {/* 1. Cloud Frame - fluffy cumulus cloud built as a union of overlapping
             circles/ellipse (the standard technique for this shape) rather than
             a single hand-drawn Bezier path. The previous single-path version
             had a real bug: two of its curve segments met with mismatched
             tangents at the bottom-left "foot" lobe, producing a sharp inward
             cusp/spike instead of a smooth rounded valley there. A clipPath's
             children clip as their union, so this stays a single clip-path
             reference (`url(#clip-frame-cloud)`) everywhere it's used. */}
        <clipPath id="clip-frame-cloud" clipPathUnits="objectBoundingBox">
          <ellipse cx="0.50" cy="0.50" rx="0.36" ry="0.32" />
          <circle cx="0.20" cy="0.54" r="0.20" />
          <circle cx="0.34" cy="0.26" r="0.19" />
          <circle cx="0.54" cy="0.20" r="0.20" />
          <circle cx="0.76" cy="0.26" r="0.19" />
          <circle cx="0.83" cy="0.48" r="0.17" />
          <circle cx="0.78" cy="0.72" r="0.19" />
          <circle cx="0.54" cy="0.80" r="0.19" />
          <circle cx="0.32" cy="0.74" r="0.19" />
          <circle cx="0.14" cy="0.85" r="0.10" />
        </clipPath>

        {/* 2. Heart Frame - Perfectly curved romantic heart */}
        <clipPath id="clip-frame-heart" clipPathUnits="objectBoundingBox">
          <path d="M 0.50 0.96 C 0.20 0.70 0.00 0.50 0.00 0.30 C 0.00 0.13 0.13 0.00 0.30 0.00 C 0.40 0.00 0.48 0.05 0.50 0.13 C 0.52 0.05 0.60 0.00 0.70 0.00 C 0.87 0.00 1.00 0.13 1.00 0.30 C 1.00 0.50 0.80 0.70 0.50 0.96 Z" />
        </clipPath>

        {/* 3. Speech Bubble Round */}
        <clipPath id="clip-frame-speech-bubble-round" clipPathUnits="objectBoundingBox">
          <path d="M 0.50 0.00 C 0.78 0.00 1.00 0.19 1.00 0.42 C 1.00 0.65 0.78 0.84 0.50 0.84 C 0.42 0.84 0.35 0.82 0.28 0.79 L 0.08 1.00 L 0.15 0.73 C 0.06 0.65 0.00 0.54 0.00 0.42 C 0.00 0.19 0.22 0.00 0.50 0.00 Z" />
        </clipPath>

        {/* 4. Speech Bubble Square / Rect */}
        <clipPath id="clip-frame-speech-bubble-square" clipPathUnits="objectBoundingBox">
          <path d="M 0.08 0.00 L 0.92 0.00 C 0.96 0.00 1.00 0.04 1.00 0.10 L 1.00 0.72 C 1.00 0.78 0.96 0.82 0.92 0.82 L 0.30 0.82 L 0.08 1.00 L 0.14 0.82 L 0.08 0.82 C 0.04 0.82 0.00 0.78 0.00 0.72 L 0.00 0.10 C 0.00 0.04 0.04 0.00 0.08 0.00 Z" />
        </clipPath>

        {/* 5. Scalloped Corners / Notched 4-Corner Square */}
        <clipPath id="clip-frame-scalloped-corners" clipPathUnits="objectBoundingBox">
          <path d="M 0.15 0.00 C 0.15 0.08 0.08 0.15 0.00 0.15 L 0.00 0.85 C 0.08 0.85 0.15 0.92 0.15 1.00 L 0.85 1.00 C 0.85 0.92 0.92 0.85 1.00 0.85 L 1.00 0.15 C 0.92 0.15 0.85 0.08 0.85 0.00 Z" />
        </clipPath>

        {/* 6, 7, 8. Scalloped Octagon / Scalloped Badge / Rosette Stamp — all
             three used to be a single hand-drawn 12-anchor Bezier path whose
             anchor points all sat at nearly the *same* radius from center
             (~0.483–0.50, no alternation), so instead of N distinct rounded
             scallops they rendered as a barely-wobbly near-circle — the
             "petal" geometry was never actually there. Rebuilt each as a
             union of one central circle + N evenly-spaced petal circles
             (same technique as the cloud frame above): petal circles bulge
             out to the outer radius and overlap the central circle enough
             to merge smoothly, so the valleys between petals stay rounded
             with no cusps, and N is now really N (8, 12, 20). */}
        <clipPath id="clip-frame-scallop-8" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.30" />
          <circle cx="0.5000" cy="0.2200" r="0.24" />
          <circle cx="0.6980" cy="0.3020" r="0.24" />
          <circle cx="0.7800" cy="0.5000" r="0.24" />
          <circle cx="0.6980" cy="0.6980" r="0.24" />
          <circle cx="0.5000" cy="0.7800" r="0.24" />
          <circle cx="0.3020" cy="0.6980" r="0.24" />
          <circle cx="0.2200" cy="0.5000" r="0.24" />
          <circle cx="0.3020" cy="0.3020" r="0.24" />
        </clipPath>

        <clipPath id="clip-frame-scallop-12" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.34" />
          <circle cx="0.5000" cy="0.1600" r="0.18" />
          <circle cx="0.6700" cy="0.2056" r="0.18" />
          <circle cx="0.7944" cy="0.3300" r="0.18" />
          <circle cx="0.8400" cy="0.5000" r="0.18" />
          <circle cx="0.7944" cy="0.6700" r="0.18" />
          <circle cx="0.6700" cy="0.7944" r="0.18" />
          <circle cx="0.5000" cy="0.8400" r="0.18" />
          <circle cx="0.3300" cy="0.7944" r="0.18" />
          <circle cx="0.2056" cy="0.6700" r="0.18" />
          <circle cx="0.1600" cy="0.5000" r="0.18" />
          <circle cx="0.2056" cy="0.3300" r="0.18" />
          <circle cx="0.3300" cy="0.2056" r="0.18" />
        </clipPath>

        <clipPath id="clip-frame-rosette-20" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.38" />
          <circle cx="0.5000" cy="0.1200" r="0.13" />
          <circle cx="0.6174" cy="0.1386" r="0.13" />
          <circle cx="0.7234" cy="0.1926" r="0.13" />
          <circle cx="0.8074" cy="0.2766" r="0.13" />
          <circle cx="0.8614" cy="0.3826" r="0.13" />
          <circle cx="0.8800" cy="0.5000" r="0.13" />
          <circle cx="0.8614" cy="0.6174" r="0.13" />
          <circle cx="0.8074" cy="0.7234" r="0.13" />
          <circle cx="0.7234" cy="0.8074" r="0.13" />
          <circle cx="0.6174" cy="0.8614" r="0.13" />
          <circle cx="0.5000" cy="0.8800" r="0.13" />
          <circle cx="0.3826" cy="0.8614" r="0.13" />
          <circle cx="0.2766" cy="0.8074" r="0.13" />
          <circle cx="0.1926" cy="0.7234" r="0.13" />
          <circle cx="0.1386" cy="0.6174" r="0.13" />
          <circle cx="0.1200" cy="0.5000" r="0.13" />
          <circle cx="0.1386" cy="0.3826" r="0.13" />
          <circle cx="0.1926" cy="0.2766" r="0.13" />
          <circle cx="0.2766" cy="0.1926" r="0.13" />
          <circle cx="0.3826" cy="0.1386" r="0.13" />
        </clipPath>

        {/* 9. Shield Frame - Curved Heraldic Shield */}
        <clipPath id="clip-frame-shield" clipPathUnits="objectBoundingBox">
          <path d="M 0.00 0.00 L 1.00 0.00 L 1.00 0.50 C 1.00 0.75 0.70 0.92 0.50 1.00 C 0.30 0.92 0.00 0.75 0.00 0.50 Z" />
        </clipPath>

        {/* 10. Arch Portal Frame */}
        <clipPath id="clip-frame-arch" clipPathUnits="objectBoundingBox">
          <path d="M 0.00 1.00 L 0.00 0.50 C 0.00 0.22 0.22 0.00 0.50 0.00 C 0.78 0.00 1.00 0.22 1.00 0.50 L 1.00 1.00 Z" />
        </clipPath>

        {/* 11. U-Shape Frame */}
        <clipPath id="clip-frame-u-shape" clipPathUnits="objectBoundingBox">
          <path d="M 0.00 0.00 L 1.00 0.00 L 1.00 0.50 C 1.00 0.78 0.78 1.00 0.50 1.00 C 0.22 1.00 0.00 0.78 0.00 0.50 Z" />
        </clipPath>

        {/* 12. Convex Barrel / Curved-Top-Square Frame */}
        <clipPath id="clip-frame-curved-top-square" clipPathUnits="objectBoundingBox">
          <path d="M 0.00 0.12 C 0.30 0.00 0.70 0.00 1.00 0.12 L 1.00 0.88 C 0.70 1.00 0.30 1.00 0.00 0.88 Z" />
        </clipPath>
      </defs>
    </svg>
  );
}
