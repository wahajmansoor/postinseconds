import React, { useId } from "react";
import type { LineEndCapKind, LineStrokeStyle, ShapeKind } from "./types";

interface LineShapeSvgProps {
  kind: ShapeKind | string;
  color?: string | undefined;
  gradient?: string | undefined;
  strokeWidth?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  preserveAspect?: boolean | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  // End-cap style for the plain stroke (line-solid/dashed/dotted and every
  // arrow variant's tail) — see ShapeLayer.lineCap's own comment. Doesn't
  // affect decorative end markers (circle/square/diamond/arrowhead/t-bar),
  // which draw their own explicit shape regardless of this.
  lineCap?: "round" | "butt" | undefined;
  // Independent line model — see ShapeLayer's own comment. lineStyle's
  // presence (not undefined) is what switches this component from the
  // legacy `kind`-driven renderer over to the generic one that honors
  // lineStartCap/lineEndCap independently.
  lineStyle?: LineStrokeStyle | undefined;
  lineStartCap?: LineEndCapKind | undefined;
  lineEndCap?: LineEndCapKind | undefined;
}

interface GradientStop {
  offset: string;
  color: string;
}

interface ParsedGradient {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  stops: GradientStop[];
}

function parseCssGradient(css: string): ParsedGradient | null {
  if (!css || typeof css !== "string") return null;
  const match = css.match(/linear-gradient\s*\(([\s\S]+)\)/i);
  if (!match || !match[1]) return null;

  const content = match[1].trim();

  // Split content by top-level commas (not inside parentheses like rgba/hsl)
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    else if (char === "," && parenDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }

  if (parts.length < 2 || !parts[0]) return null;

  let angleDeg = 180; // default top to bottom
  let firstPartIsAngle = false;

  const first = (parts[0] ?? "").toLowerCase();
  if (first.includes("deg")) {
    const num = parseFloat(first);
    if (!isNaN(num)) {
      angleDeg = num;
      firstPartIsAngle = true;
    }
  } else if (first.startsWith("to ")) {
    firstPartIsAngle = true;
    if (first.includes("right") && first.includes("top")) angleDeg = 45;
    else if (first.includes("right") && first.includes("bottom")) angleDeg = 135;
    else if (first.includes("left") && first.includes("bottom")) angleDeg = 225;
    else if (first.includes("left") && first.includes("top")) angleDeg = 315;
    else if (first.includes("right")) angleDeg = 90;
    else if (first.includes("left")) angleDeg = 270;
    else if (first.includes("top")) angleDeg = 0;
    else if (first.includes("bottom")) angleDeg = 180;
  }

  const rawStops = firstPartIsAngle ? parts.slice(1) : parts;
  if (rawStops.length === 0) return null;

  // Convert CSS angle (0deg = bottom to top, 90deg = left to right, 180deg = top to bottom)
  // to SVG vector (x1, y1) -> (x2, y2)
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x1 = `${Math.round(50 - 50 * cos)}%`;
  const y1 = `${Math.round(50 - 50 * sin)}%`;
  const x2 = `${Math.round(50 + 50 * cos)}%`;
  const y2 = `${Math.round(50 + 50 * sin)}%`;

  const stops: GradientStop[] = rawStops.map((stopStr, index) => {
    const trimmed = stopStr.trim();
    const lastSpaceIdx = trimmed.lastIndexOf(" ");
    let stopColor = trimmed;
    let offset = "";

    if (lastSpaceIdx > 0) {
      const possibleOffset = trimmed.substring(lastSpaceIdx + 1).trim();
      if (possibleOffset.endsWith("%") || !isNaN(parseFloat(possibleOffset))) {
        offset = possibleOffset.endsWith("%") ? possibleOffset : `${parseFloat(possibleOffset) * 100}%`;
        stopColor = trimmed.substring(0, lastSpaceIdx).trim();
      }
    }

    if (!offset) {
      const pct = rawStops.length > 1 ? (index / (rawStops.length - 1)) * 100 : index * 100;
      offset = `${Math.round(pct)}%`;
    }

    return {
      offset,
      color: stopColor,
    };
  });

  return { x1, y1, x2, y2, stops };
}

export function LineShapeSvg({
  kind,
  color = "currentColor",
  gradient,
  strokeWidth = 4,
  width,
  height,
  preserveAspect = false,
  className = "",
  style = {},
  lineCap = "round",
  lineStyle,
  lineStartCap = "none",
  lineEndCap = "none",
}: LineShapeSvgProps) {
  const reactId = useId();
  const gradientId = `line-grad-${reactId.replace(/[^a-zA-Z0-9-_]/g, "")}`;
  const w = preserveAspect ? 100 : (typeof width === "number" && width > 0 ? width : 100);
  const h = typeof height === "number" && height > 0 ? height : 24;
  const sw = typeof strokeWidth === "number" && strokeWidth > 0 ? strokeWidth : (preserveAspect ? 2.5 : 4);

  const rawGradient = gradient || (color && color.includes("gradient(") ? color : undefined);
  const parsedGradient = rawGradient ? parseCssGradient(rawGradient) : null;
  const effectiveColor = parsedGradient ? `url(#${gradientId})` : color;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={preserveAspect ? "xMidYMid meet" : "none"}
      className={className}
      style={{ width: "100%", height: "100%", overflow: "visible", display: "block", ...style }}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {parsedGradient && (
        <defs>
          <linearGradient
            id={gradientId}
            x1={parsedGradient.x1}
            y1={parsedGradient.y1}
            x2={parsedGradient.x2}
            y2={parsedGradient.y2}
            gradientUnits="userSpaceOnUse"
          >
            {parsedGradient.stops.map((s, idx) => (
              <stop key={idx} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
      )}
      {lineStyle
        ? renderGenericLineContent(lineStyle, effectiveColor, sw, w, h, preserveAspect, lineCap, lineStartCap, lineEndCap)
        : renderLineContent(kind, effectiveColor, sw, w, h, preserveAspect, lineCap)}
    </svg>
  );
}

function renderLineContent(
  kind: string,
  color: string,
  sw: number,
  w: number,
  h: number,
  isPreview = false,
  lineCap: "round" | "butt" = "round",
) {
  const cap = lineCap;
  const centerY = h / 2;
  const markerScale = isPreview ? 1 : Math.max(0.9, Math.min(2.5, sw / 3.2));
  const headSize = Math.max(10, Math.min(28, sw * 3.5 * (isPreview ? 0.7 : 1)));

  switch (kind) {
    case "line-solid":
      return (
        <line x1={0} y1={centerY} x2={w} y2={centerY} stroke={color} strokeWidth={sw} strokeLinecap={cap} />
      );

    case "line-dashed":
      return (
        <line
          x1={0}
          y1={centerY}
          x2={w}
          y2={centerY}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`${Math.max(8, sw * 3)} ${Math.max(6, sw * 2)}`}
          strokeLinecap={cap}
        />
      );

    case "line-dash-short":
      return (
        <line
          x1={0}
          y1={centerY}
          x2={w}
          y2={centerY}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`${Math.max(4, sw * 1.4)} ${Math.max(4, sw * 1.4)}`}
          strokeLinecap={cap}
        />
      );

    case "line-dotted":
      return (
        <line
          x1={0}
          y1={centerY}
          x2={w}
          y2={centerY}
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`0.1 ${Math.max(6, sw * 2.2)}`}
          strokeLinecap={cap}
        />
      );

    case "line-arrow-right":
      return (
        <>
          <line x1={0} y1={centerY} x2={Math.max(0, w - headSize + 2)} y2={centerY} stroke={color} strokeWidth={sw} strokeLinecap={cap} />
          <polygon
            points={`${w - headSize},${centerY - headSize * 0.5} ${w},${centerY} ${w - headSize},${centerY + headSize * 0.5}`}
            fill={color}
          />
        </>
      );

    case "line-arrow-open-right":
      return (
        <>
          <line x1={0} y1={centerY} x2={Math.max(0, w - 4)} y2={centerY} stroke={color} strokeWidth={sw} strokeLinecap={cap} />
          <polyline
            points={`${w - headSize},${centerY - headSize * 0.5} ${w},${centerY} ${w - headSize},${centerY + headSize * 0.5}`}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );

    case "line-arrow-dotted-right":
      return (
        <>
          <line
            x1={0}
            y1={centerY}
            x2={Math.max(0, w - headSize + 2)}
            y2={centerY}
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={`0.1 ${Math.max(6, sw * 2.2)}`}
            strokeLinecap={cap}
          />
          <polygon
            points={`${w - headSize},${centerY - headSize * 0.5} ${w},${centerY} ${w - headSize},${centerY + headSize * 0.5}`}
            fill={color}
          />
        </>
      );

    case "line-tbar":
      const barH = Math.max(12, Math.min(h - 2, sw * 4));
      return (
        <>
          <line x1={0} y1={centerY} x2={w} y2={centerY} stroke={color} strokeWidth={sw} />
          <line x1={0} y1={centerY - barH / 2} x2={0} y2={centerY + barH / 2} stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <line x1={w} y1={centerY - barH / 2} x2={w} y2={centerY + barH / 2} stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </>
      );

    case "line-double-arrow":
      return (
        <>
          <polygon
            points={`${headSize},${centerY - headSize * 0.5} 0,${centerY} ${headSize},${centerY + headSize * 0.5}`}
            fill={color}
          />
          <line x1={headSize - 2} y1={centerY} x2={Math.max(headSize, w - headSize + 2)} y2={centerY} stroke={color} strokeWidth={sw} strokeLinecap={cap} />
          <polygon
            points={`${w - headSize},${centerY - headSize * 0.5} ${w},${centerY} ${w - headSize},${centerY + headSize * 0.5}`}
            fill={color}
          />
        </>
      );

    case "line-double-arrow-dotted":
      return (
        <>
          <polygon
            points={`${headSize},${centerY - headSize * 0.5} 0,${centerY} ${headSize},${centerY + headSize * 0.5}`}
            fill={color}
          />
          <line
            x1={headSize - 2}
            y1={centerY}
            x2={Math.max(headSize, w - headSize + 2)}
            y2={centerY}
            stroke={color}
            strokeWidth={sw}
            strokeDasharray={`0.1 ${Math.max(6, sw * 2.2)}`}
            strokeLinecap={cap}
          />
          <polygon
            points={`${w - headSize},${centerY - headSize * 0.5} ${w},${centerY} ${w - headSize},${centerY + headSize * 0.5}`}
            fill={color}
          />
        </>
      );

    case "line-square-ends":
      const sq = Math.max(6, Math.min(18, sw * 2.2));
      return (
        <>
          <line x1={sq / 2} y1={centerY} x2={Math.max(sq / 2, w - sq / 2)} y2={centerY} stroke={color} strokeWidth={sw} />
          <rect x={0} y={centerY - sq / 2} width={sq} height={sq} rx={Math.min(2, sq * 0.2)} fill={color} />
          <rect x={Math.max(0, w - sq)} y={centerY - sq / 2} width={sq} height={sq} rx={Math.min(2, sq * 0.2)} fill={color} />
        </>
      );

    case "line-circle-ends":
      const cr = Math.max(3.5, Math.min(10, sw * 1.3));
      return (
        <>
          <line x1={cr} y1={centerY} x2={Math.max(cr, w - cr)} y2={centerY} stroke={color} strokeWidth={sw} />
          <circle cx={cr} cy={centerY} r={cr} fill={color} />
          <circle cx={Math.max(cr, w - cr)} cy={centerY} r={cr} fill={color} />
        </>
      );

    case "line-diamond-ends":
      const dia = Math.max(6, Math.min(18, sw * 2.2));
      return (
        <>
          <line x1={dia / 2} y1={centerY} x2={Math.max(dia / 2, w - dia / 2)} y2={centerY} stroke={color} strokeWidth={sw} />
          <polygon
            points={`${dia / 2},${centerY - dia / 2} ${dia},${centerY} ${dia / 2},${centerY + dia / 2} 0,${centerY}`}
            fill={color}
          />
          <polygon
            points={`${w - dia / 2},${centerY - dia / 2} ${w},${centerY} ${w - dia / 2},${centerY + dia / 2} ${Math.max(0, w - dia)},${centerY}`}
            fill={color}
          />
        </>
      );

    case "line-square-hollow-ends":
      const hsq = Math.max(6, Math.min(18, sw * 2.2));
      return (
        <>
          <line x1={hsq / 2} y1={centerY} x2={Math.max(hsq / 2, w - hsq / 2)} y2={centerY} stroke={color} strokeWidth={sw} />
          <rect x={0} y={centerY - hsq / 2} width={hsq} height={hsq} rx={Math.min(2, hsq * 0.2)} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
          <rect x={Math.max(0, w - hsq)} y={centerY - hsq / 2} width={hsq} height={hsq} rx={Math.min(2, hsq * 0.2)} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
        </>
      );

    case "line-circle-hollow-ends":
      const hcr = Math.max(3.5, Math.min(10, sw * 1.3));
      return (
        <>
          <line x1={hcr} y1={centerY} x2={Math.max(hcr, w - hcr)} y2={centerY} stroke={color} strokeWidth={sw} />
          <circle cx={hcr} cy={centerY} r={hcr} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
          <circle cx={Math.max(hcr, w - hcr)} cy={centerY} r={hcr} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
        </>
      );

    case "line-diamond-hollow-ends":
      const hdia = Math.max(6, Math.min(18, sw * 2.2));
      return (
        <>
          <line x1={hdia / 2} y1={centerY} x2={Math.max(hdia / 2, w - hdia / 2)} y2={centerY} stroke={color} strokeWidth={sw} />
          <polygon
            points={`${hdia / 2},${centerY - hdia / 2} ${hdia},${centerY} ${hdia / 2},${centerY + hdia / 2} 0,${centerY}`}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(1.5, sw * 0.8)}
          />
          <polygon
            points={`${w - hdia / 2},${centerY - hdia / 2} ${w},${centerY} ${w - hdia / 2},${centerY + hdia / 2} ${Math.max(0, w - hdia)},${centerY}`}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(1.5, sw * 0.8)}
          />
        </>
      );

    default:
      return (
        <line x1={0} y1={centerY} x2={w} y2={centerY} stroke={color} strokeWidth={sw} strokeLinecap={cap} />
      );
  }
}

// One end marker for the generic (lineStartCap/lineEndCap) renderer below —
// `side` picks which edge (x=0 for start, x=w for end) and which direction
// the marker's own shape points/backs off toward. Returns both the marker
// itself and how far the base line should be inset from that edge, so a
// circle/square/diamond/arrow marker never gets drawn on top of (or leaves
// a gap before) the line feeding into it — same relationship every
// hardcoded kind in renderLineContent above already keeps between its own
// line segment and end decoration, just generalized to work at either end.
function renderEndCap(
  capKind: LineEndCapKind,
  side: "start" | "end",
  color: string,
  sw: number,
  w: number,
  centerY: number,
  headSize: number,
): { marker: React.ReactNode; inset: number } {
  const atStart = side === "start";
  const tipX = atStart ? 0 : w;
  const dir = atStart ? 1 : -1; // points from the tip back toward the line's own center

  switch (capKind) {
    case "none":
      return { marker: null, inset: 0 };

    case "arrow": {
      const baseX = tipX + dir * headSize;
      return {
        marker: (
          <polygon
            points={`${baseX},${centerY - headSize * 0.5} ${tipX},${centerY} ${baseX},${centerY + headSize * 0.5}`}
            fill={color}
          />
        ),
        inset: headSize - 2,
      };
    }

    case "arrow-open": {
      const baseX = tipX + dir * headSize;
      return {
        marker: (
          <polyline
            points={`${baseX},${centerY - headSize * 0.5} ${tipX},${centerY} ${baseX},${centerY + headSize * 0.5}`}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
        inset: 0,
      };
    }

    case "circle":
    case "circle-hollow": {
      const cr = Math.max(3.5, Math.min(10, sw * 1.3));
      const hollow = capKind === "circle-hollow";
      return {
        marker: (
          <circle
            cx={tipX + dir * cr}
            cy={centerY}
            r={cr}
            fill={hollow ? "none" : color}
            stroke={hollow ? color : undefined}
            strokeWidth={hollow ? Math.max(1.5, sw * 0.8) : undefined}
          />
        ),
        inset: cr,
      };
    }

    case "square":
    case "square-hollow": {
      const sq = Math.max(6, Math.min(18, sw * 2.2));
      const hollow = capKind === "square-hollow";
      return {
        marker: (
          <rect
            x={atStart ? 0 : w - sq}
            y={centerY - sq / 2}
            width={sq}
            height={sq}
            rx={Math.min(2, sq * 0.2)}
            fill={hollow ? "none" : color}
            stroke={hollow ? color : undefined}
            strokeWidth={hollow ? Math.max(1.5, sw * 0.8) : undefined}
          />
        ),
        inset: sq,
      };
    }

    case "diamond":
    case "diamond-hollow": {
      const dia = Math.max(6, Math.min(18, sw * 2.2));
      const hollow = capKind === "diamond-hollow";
      const points = atStart
        ? `${dia / 2},${centerY - dia / 2} ${dia},${centerY} ${dia / 2},${centerY + dia / 2} 0,${centerY}`
        : `${w - dia / 2},${centerY - dia / 2} ${w},${centerY} ${w - dia / 2},${centerY + dia / 2} ${w - dia},${centerY}`;
      return {
        marker: (
          <polygon
            points={points}
            fill={hollow ? "none" : color}
            stroke={hollow ? color : undefined}
            strokeWidth={hollow ? Math.max(1.5, sw * 0.8) : undefined}
          />
        ),
        inset: dia,
      };
    }

    case "tbar": {
      const barH = Math.max(12, sw * 4);
      return {
        marker: (
          <line
            x1={tipX}
            y1={centerY - barH / 2}
            x2={tipX}
            y2={centerY + barH / 2}
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        ),
        // The line runs the full width behind a t-bar (matches
        // renderLineContent's own line-tbar case above) — the bar sits ON
        // the line's own edge, not past it.
        inset: 0,
      };
    }
  }
}

function renderGenericLineContent(
  lineStyle: LineStrokeStyle,
  color: string,
  sw: number,
  w: number,
  h: number,
  isPreview: boolean,
  lineCap: "round" | "butt",
  startCap: LineEndCapKind,
  endCap: LineEndCapKind,
) {
  const centerY = h / 2;
  const headSize = Math.max(10, Math.min(28, sw * 3.5 * (isPreview ? 0.7 : 1)));
  const strokeDasharray =
    lineStyle === "dotted"
      ? `0.1 ${Math.max(6, sw * 2.2)}`
      : lineStyle === "dash-long"
        ? `${Math.max(8, sw * 3)} ${Math.max(6, sw * 2)}`
        : lineStyle === "dash-short"
          ? `${Math.max(4, sw * 1.4)} ${Math.max(4, sw * 1.4)}`
          : undefined;

  const start = renderEndCap(startCap, "start", color, sw, w, centerY, headSize);
  const end = renderEndCap(endCap, "end", color, sw, w, centerY, headSize);
  const x1 = start.inset;
  const x2 = Math.max(x1, w - end.inset);

  return (
    <>
      <line
        x1={x1}
        y1={centerY}
        x2={x2}
        y2={centerY}
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={strokeDasharray}
        strokeLinecap={lineCap}
      />
      {start.marker}
      {end.marker}
    </>
  );
}
