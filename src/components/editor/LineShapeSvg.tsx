import React, { useId } from "react";
import type { LineEndCapKind, LineStrokeStyle, LineType, ShapeKind } from "./types";

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
  lineCap?: "round" | "butt" | undefined;
  lineStyle?: LineStrokeStyle | undefined;
  lineStartCap?: LineEndCapKind | undefined;
  lineEndCap?: LineEndCapKind | undefined;
  lineType?: LineType | undefined;
  lineCurvature?: number | undefined;
  lineWaypoints?: { x: number; y: number }[] | undefined;
  lineCornerRadius?: number | undefined;
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
  lineType = "straight",
  lineCurvature,
  lineWaypoints,
  lineCornerRadius,
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
      {lineStyle || (lineType && lineType !== "straight")
        ? renderGenericLineContent(
            lineStyle ?? "solid",
            effectiveColor,
            sw,
            w,
            h,
            false,
            lineCap,
            lineStartCap,
            lineEndCap,
            lineType,
            lineCurvature,
            lineWaypoints,
            lineCornerRadius,
          )
        : renderLineContent(kind, effectiveColor, sw, w, h, false, lineCap)}
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
          <line x1={sq} y1={centerY} x2={Math.max(sq, w - sq)} y2={centerY} stroke={color} strokeWidth={sw} />
          <rect x={0} y={centerY - sq / 2} width={sq} height={sq} rx={Math.min(2, sq * 0.2)} fill={color} />
          <rect x={w - sq} y={centerY - sq / 2} width={sq} height={sq} rx={Math.min(2, sq * 0.2)} fill={color} />
        </>
      );

    case "line-circle-ends":
      const cr = Math.max(3.5, Math.min(10, sw * 1.3));
      return (
        <>
          <line x1={cr} y1={centerY} x2={Math.max(cr, w - cr)} y2={centerY} stroke={color} strokeWidth={sw} />
          <circle cx={cr} cy={centerY} r={cr} fill={color} />
          <circle cx={w - cr} cy={centerY} r={cr} fill={color} />
        </>
      );

    case "line-diamond-ends":
      const dia = Math.max(6, Math.min(18, sw * 2.2));
      return (
        <>
          <line x1={dia} y1={centerY} x2={Math.max(dia, w - dia)} y2={centerY} stroke={color} strokeWidth={sw} />
          <polygon points={`0,${centerY} ${dia / 2},${centerY - dia / 2} ${dia},${centerY} ${dia / 2},${centerY + dia / 2}`} fill={color} />
          <polygon points={`${w - dia},${centerY} ${w - dia / 2},${centerY - dia / 2} ${w},${centerY} ${w - dia / 2},${centerY + dia / 2}`} fill={color} />
        </>
      );

    case "line-square-hollow-ends":
      const hsq = Math.max(6, Math.min(18, sw * 2.2));
      return (
        <>
          <line x1={hsq} y1={centerY} x2={Math.max(hsq, w - hsq)} y2={centerY} stroke={color} strokeWidth={sw} />
          <rect x={0} y={centerY - hsq / 2} width={hsq} height={hsq} rx={Math.min(2, hsq * 0.2)} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
          <rect x={w - hsq} y={centerY - hsq / 2} width={hsq} height={hsq} rx={Math.min(2, hsq * 0.2)} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
        </>
      );

    case "line-circle-hollow-ends":
      const hcr = Math.max(3.5, Math.min(10, sw * 1.3));
      return (
        <>
          <line x1={hcr} y1={centerY} x2={Math.max(hcr, w - hcr)} y2={centerY} stroke={color} strokeWidth={sw} />
          <circle cx={hcr} cy={centerY} r={hcr} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
          <circle cx={w - hcr} cy={centerY} r={hcr} fill="none" stroke={color} strokeWidth={Math.max(1.5, sw * 0.8)} />
        </>
      );

    case "line-diamond-hollow-ends":
      const hdia = Math.max(6, Math.min(18, sw * 2.2));
      return (
        <>
          <line x1={hdia} y1={centerY} x2={Math.max(hdia, w - hdia)} y2={centerY} stroke={color} strokeWidth={sw} />
          <polygon
            points={`0,${centerY} ${hdia / 2},${centerY - hdia / 2} ${hdia},${centerY} ${hdia / 2},${centerY + hdia / 2}`}
            fill="none"
            stroke={color}
            strokeWidth={Math.max(1.5, sw * 0.8)}
          />
          <polygon
            points={`${w - hdia},${centerY} ${w - hdia / 2},${centerY - hdia / 2} ${w},${centerY} ${w - hdia / 2},${centerY + hdia / 2}`}
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

function renderEndCap(
  capKind: LineEndCapKind,
  side: "start" | "end",
  color: string,
  sw: number,
  tipX: number,
  tipY: number,
  angleDeg: number,
  headSize: number,
): { marker: React.ReactNode; inset: number } {
  const atStart = side === "start";
  const dir = atStart ? 1 : -1; // points from the tip back toward the line's own center

  if (capKind === "none") {
    return { marker: null, inset: 0 };
  }

  let rawMarker: React.ReactNode = null;
  let inset = 0;

  switch (capKind) {
    case "arrow": {
      const baseX = dir * headSize;
      rawMarker = (
        <polygon
          points={`${baseX},${-headSize * 0.5} 0,0 ${baseX},${headSize * 0.5}`}
          fill={color}
        />
      );
      inset = headSize - 2;
      break;
    }
    case "arrow-open": {
      const baseX = dir * headSize;
      rawMarker = (
        <polyline
          points={`${baseX},${-headSize * 0.5} 0,0 ${baseX},${headSize * 0.5}`}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
      inset = 0;
      break;
    }
    case "circle":
    case "circle-hollow": {
      const cr = Math.max(3.5, Math.min(10, sw * 1.3));
      const hollow = capKind === "circle-hollow";
      rawMarker = (
        <circle
          cx={dir * cr}
          cy={0}
          r={cr}
          fill={hollow ? "none" : color}
          stroke={hollow ? color : undefined}
          strokeWidth={hollow ? Math.max(1.5, sw * 0.8) : undefined}
        />
      );
      inset = cr;
      break;
    }
    case "square":
    case "square-hollow": {
      const sq = Math.max(6, Math.min(18, sw * 2.2));
      const hollow = capKind === "square-hollow";
      rawMarker = (
        <rect
          x={atStart ? 0 : -sq}
          y={-sq / 2}
          width={sq}
          height={sq}
          rx={Math.min(2, sq * 0.2)}
          fill={hollow ? "none" : color}
          stroke={hollow ? color : undefined}
          strokeWidth={hollow ? Math.max(1.5, sw * 0.8) : undefined}
        />
      );
      inset = sq;
      break;
    }
    case "diamond":
    case "diamond-hollow": {
      const dia = Math.max(6, Math.min(18, sw * 2.2));
      const hollow = capKind === "diamond-hollow";
      const points = atStart
        ? `0,0 ${dia / 2},${-dia / 2} ${dia},0 ${dia / 2},${dia / 2}`
        : `0,0 ${-dia / 2},${-dia / 2} ${-dia},0 ${-dia / 2},${dia / 2}`;
      rawMarker = (
        <polygon
          points={points}
          fill={hollow ? "none" : color}
          stroke={hollow ? color : undefined}
          strokeWidth={hollow ? Math.max(1.5, sw * 0.8) : undefined}
        />
      );
      inset = dia;
      break;
    }
    case "tbar": {
      const barH = Math.max(12, sw * 4);
      rawMarker = (
        <line
          x1={0}
          y1={-barH / 2}
          x2={0}
          y2={barH / 2}
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      );
      inset = 0;
      break;
    }
  }

  const marker = (
    <g transform={`translate(${tipX}, ${tipY}) rotate(${angleDeg})`}>
      {rawMarker}
    </g>
  );

  return { marker, inset };
}

export function buildFilletedOrthogonalPath(points: { x: number; y: number }[], radius = 12): string {
  if (points.length < 2 || !points[0] || !points[1]) return "";
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const first = points[0];
  const last = points[points.length - 1] ?? points[points.length - 1]!;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!prev || !curr || !next) continue;

    const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const len1 = Math.hypot(v1.x, v1.y);
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len2 = Math.hypot(v2.x, v2.y);

    const r = Math.min(radius, Math.min(len1 / 2, len2 / 2));
    if (r <= 1 || len1 === 0 || len2 === 0) {
      d += ` L ${curr.x} ${curr.y}`;
    } else {
      const pBefore = {
        x: curr.x - (v1.x / len1) * r,
        y: curr.y - (v1.y / len1) * r,
      };
      const pAfter = {
        x: curr.x + (v2.x / len2) * r,
        y: curr.y + (v2.y / len2) * r,
      };
      d += ` L ${pBefore.x} ${pBefore.y} Q ${curr.x} ${curr.y} ${pAfter.x} ${pAfter.y}`;
    }
  }
  if (last) {
    d += ` L ${last.x} ${last.y}`;
  }
  return d;
}

export function simplifyPath(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 2 || !points[0]) return points;
  const result: { x: number; y: number }[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    if (Math.abs(prev.x - curr.x) < 2 && Math.abs(prev.y - curr.y) < 2) {
      continue;
    }
    const isCollinearX = Math.abs(prev.x - curr.x) < 3 && Math.abs(curr.x - next.x) < 3;
    const isCollinearY = Math.abs(prev.y - curr.y) < 3 && Math.abs(curr.y - next.y) < 3;
    if (!isCollinearX && !isCollinearY) {
      result.push(curr);
    }
  }
  const last = points[points.length - 1]!;
  if (result.length > 0) {
    const lastInResult = result[result.length - 1]!;
    if (Math.abs(lastInResult.x - last.x) >= 2 || Math.abs(lastInResult.y - last.y) >= 2) {
      result.push(last);
    } else if (result.length === 1) {
      result.push(last);
    }
  }
  return result.length >= 2 ? result : points;
}

export function computeElbowConnectorPoints(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  elbowOffset = 0.5,
): { x: number; y: number }[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDy < 2) {
    return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p1.y }];
  }
  if (absDx < 2) {
    return [{ x: p1.x, y: p1.y }, { x: p1.x, y: p2.y }];
  }

  const clampedOffset = Math.max(0.05, Math.min(0.95, elbowOffset));
  if (absDx >= absDy) {
    const midX = p1.x + dx * clampedOffset;
    return [
      { x: p1.x, y: p1.y },
      { x: midX, y: p1.y },
      { x: midX, y: p2.y },
      { x: p2.x, y: p2.y },
    ];
  } else {
    const midY = p1.y + dy * clampedOffset;
    return [
      { x: p1.x, y: p1.y },
      { x: p1.x, y: midY },
      { x: p2.x, y: midY },
      { x: p2.x, y: p2.y },
    ];
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
  lineType: LineType = "straight",
  lineCurvature?: number,
  lineWaypoints?: { x: number; y: number }[],
  lineCornerRadius?: number,
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

  if (lineType === "curved") {
    const margin = Math.max(4, sw);
    // Three independent points once the user has dragged any handle at all
    // — [start, arch, end] — exactly like elbowed lines already store an
    // arbitrary-length point list in lineWaypoints. The middle one is a
    // real, freely-draggable 2D point instead of a scalar bow amount
    // constrained to the chord's own perpendicular — matches Canva's own
    // curved-line handle, which can be dragged anywhere.
    //
    // That middle point is the curve's own ON-CURVE peak, NOT the `Q`
    // command's control point — those two differ: a quadratic Bézier only
    // gets pulled HALFWAY toward its control point (the curve's midpoint at
    // t=0.5 is exactly `0.5*control + 0.5*chordMidpoint`), so drawing/
    // dragging the handle at the raw control point makes it float well
    // clear of the curve it's meant to be editing, worse the more it's
    // bowed. `bezierCpX/Y` below is the reflection of the stored on-curve
    // point back through the chord's midpoint (`2*onCurve - chordMid`,
    // inverting that same halfway relationship) — the actual point the `Q`
    // command and the tangent-angle math (for end caps) need.
    // `lineCurvature` only still matters for the untouched-default case
    // below (no lineWaypoints yet), to seed that first point the same way
    // it always has.
    let p0: { x: number; y: number };
    let p1: { x: number; y: number };
    let bezierCpX: number;
    let bezierCpY: number;
    if (lineWaypoints && lineWaypoints.length >= 3) {
      p0 = lineWaypoints[0]!;
      const onCurve = lineWaypoints[1]!;
      p1 = lineWaypoints[lineWaypoints.length - 1]!;
      const chordMidX = (p0.x + p1.x) / 2;
      const chordMidY = (p0.y + p1.y) / 2;
      bezierCpX = 2 * onCurve.x - chordMidX;
      bezierCpY = 2 * onCurve.y - chordMidY;
    } else {
      const curvature = lineCurvature !== undefined ? lineCurvature : 1;
      p0 = lineWaypoints && lineWaypoints.length >= 2 ? lineWaypoints[0]! : { x: margin, y: h - margin };
      p1 = lineWaypoints && lineWaypoints.length >= 2 ? lineWaypoints[lineWaypoints.length - 1]! : { x: w - margin, y: h - margin };
      const chordDx = p1.x - p0.x;
      const chordDy = p1.y - p0.y;
      const chordLen = Math.max(1, Math.hypot(chordDx, chordDy));
      const perpX = chordDy / chordLen;
      const perpY = -chordDx / chordLen;
      const archAmount = Math.max(10, h - margin * 2);
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      bezierCpX = midX + perpX * archAmount * curvature;
      bezierCpY = midY + perpY * archAmount * curvature;
    }
    const cpX = bezierCpX;
    const cpY = bezierCpY;

    const startAngle = Math.atan2(cpY - p0.y, cpX - p0.x) * (180 / Math.PI);
    const endAngle = Math.atan2(p1.y - cpY, p1.x - cpX) * (180 / Math.PI);

    const start = renderEndCap(startCap, "start", color, sw, p0.x, p0.y, startAngle, headSize);
    const end = renderEndCap(endCap, "end", color, sw, p1.x, p1.y, endAngle, headSize);

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = p0.x + start.inset * Math.cos(startRad);
    const y1 = p0.y + start.inset * Math.sin(startRad);
    const x2 = p1.x - end.inset * Math.cos(endRad);
    const y2 = p1.y - end.inset * Math.sin(endRad);
    const pathD = `M ${x1} ${y1} Q ${cpX} ${cpY} ${x2} ${y2}`;

    return (
      <>
        {/* Transparent hit area for easy click & drag */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(28, sw * 3)}
          strokeLinecap="round"
        />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={strokeDasharray}
          strokeLinecap={lineCap}
          strokeLinejoin="round"
        />
        {start.marker}
        {end.marker}
      </>
    );
  }

  if (lineType === "elbowed") {
    const margin = Math.max(6, sw * 1.5);
    // Canva's own "corner rounding" control (ShapeSelectionToolbar's Line
    // Type popover) sets this explicitly, in real pixels, once the user
    // touches the slider — buildFilletedOrthogonalPath itself already
    // clamps a too-large radius down to half of whichever adjoining
    // segment is shorter, so an oversized value here just fillets as far
    // as each corner's own bend allows rather than distorting the path.
    // Undefined (every elbow line drawn before this slider existed, plus
    // this component's own small toolbar-icon preview call sites) keeps
    // the original auto-computed radius so nothing changes look with no
    // migration needed.
    const cornerR = lineCornerRadius !== undefined
      ? Math.max(0, lineCornerRadius)
      : Math.min(16, Math.max(4, Math.min((w - margin * 2) * 0.25, (h - margin * 2) * 0.25)));

    const rawPts = lineWaypoints && lineWaypoints.length >= 2
      ? lineWaypoints
      : [
          { x: margin, y: h / 2 },
          { x: w - margin, y: h / 2 },
        ];
    const pts = simplifyPath(rawPts);

    const p0 = pts[0] ?? { x: margin, y: margin };
    const p1 = pts[1] ?? p0;
    const pLast = pts[pts.length - 1] ?? { x: w - margin, y: h - margin };
    const pPrev = pts[pts.length - 2] ?? pLast;

    const startAngle = Math.atan2(p0.y - p1.y, p0.x - p1.x) * (180 / Math.PI);
    const endAngle = Math.atan2(pLast.y - pPrev.y, pLast.x - pPrev.x) * (180 / Math.PI);

    const start = renderEndCap(startCap, "start", color, sw, p0.x, p0.y, startAngle, headSize);
    const end = renderEndCap(endCap, "end", color, sw, pLast.x, pLast.y, endAngle, headSize);
    const pathD = buildFilletedOrthogonalPath(pts, cornerR);

    return (
      <>
        {/* Transparent hit area for easy click & drag */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(28, sw * 3)}
          strokeLinecap="round"
        />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={strokeDasharray}
          strokeLinecap={lineCap}
          strokeLinejoin="round"
        />
        {start.marker}
        {end.marker}
      </>
    );
  }

  // straight (default)
  const start = renderEndCap(startCap, "start", color, sw, 0, centerY, 0, headSize);
  const end = renderEndCap(endCap, "end", color, sw, w, centerY, 0, headSize);
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
