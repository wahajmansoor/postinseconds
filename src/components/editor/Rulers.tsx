import { useEffect, useRef, useState } from "react";

export const RULER_SIZE = 24;
const GUIDE_HIT_SIZE = 4;

function calculateSteps(scale: number) {
  // Candidate major intervals in canvas pixels
  const candidateMajors = [10, 20, 50, 100, 200, 500, 1000, 2000];
  let major = 100;
  for (const c of candidateMajors) {
    if (c * scale >= 28) {
      major = c;
      break;
    }
  }
  const medium = major / 2;
  const minor = major >= 50 ? major / 10 : major / 5;
  return { major, medium, minor };
}

interface RulersProps {
  stageWidth: number;
  stageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  pan: { x: number; y: number };
  guidesH: number[];
  guidesV: number[];
  onGuidesHChange: (next: number[]) => void;
  onGuidesVChange: (next: number[]) => void;
  dark?: boolean;
}

export function Rulers({
  stageWidth,
  stageHeight,
  canvasWidth,
  canvasHeight,
  scale,
  pan,
  guidesH,
  guidesV,
  onGuidesHChange,
  onGuidesVChange,
  dark = true,
}: RulersProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hCanvasRef = useRef<HTMLCanvasElement>(null);
  const vCanvasRef = useRef<HTMLCanvasElement>(null);

  const dragRef = useRef<{
    axis: "h" | "v";
    index: number;
    isNew: boolean;
    stageLeft: number;
    stageTop: number;
  } | null>(null);

  const [dragLabel, setDragLabel] = useState<{ axis: "h" | "v"; value: number } | null>(null);

  const originX = stageWidth / 2 + pan.x - (canvasWidth * scale) / 2;
  const originY = stageHeight / 2 + pan.y - (canvasHeight * scale) / 2;

  const toCanvasX = (screenX: number) => (screenX - originX) / scale;
  const toCanvasY = (screenY: number) => (screenY - originY) / scale;

  // Render Horizontal Ruler via Canvas for high-DPI crisp graphics
  useEffect(() => {
    const canvas = hCanvasRef.current;
    if (!canvas || stageWidth <= 0 || scale <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = stageWidth * dpr;
    canvas.height = RULER_SIZE * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const baseBg = dark ? "#111215" : "#f4f4f6";
    const activeBg = dark ? "#18191d" : "#ffffff";
    const borderColor = dark ? "#27272a" : "#e4e4e7";
    const majorTickColor = dark ? "#71717a" : "#71717a";
    const mediumTickColor = dark ? "#52525b" : "#a1a1aa";
    const minorTickColor = dark ? "#3f3f46" : "#d4d4d8";
    const textColor = dark ? "#9ca3af" : "#52525b";
    const highlightColor = dark ? "#38bdf8" : "#0284c7";

    // 1. Base Background
    ctx.fillStyle = baseBg;
    ctx.fillRect(0, 0, stageWidth, RULER_SIZE);

    // 2. Active Canvas Span Background
    const canvasStartScreenX = Math.max(0, originX);
    const canvasEndScreenX = Math.min(stageWidth, originX + canvasWidth * scale);
    if (canvasEndScreenX > canvasStartScreenX) {
      ctx.fillStyle = activeBg;
      ctx.fillRect(canvasStartScreenX, 0, canvasEndScreenX - canvasStartScreenX, RULER_SIZE);
    }

    // 3. Bottom Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_SIZE - 0.5);
    ctx.lineTo(stageWidth, RULER_SIZE - 0.5);
    ctx.stroke();

    const { major, medium, minor } = calculateSteps(scale);

    ctx.font = '600 8.5px "Outfit", "Segoe UI", Roboto, monospace';
    ctx.textBaseline = "top";

    // Draw all ticks across the canvas width
    for (let v = 0; v <= canvasWidth; v += minor) {
      const roundedV = Math.round(v);
      const screenX = Math.round(originX + roundedV * scale) + 0.5;
      if (screenX < 0 || screenX > stageWidth) continue;

      const isMajor = roundedV % major === 0;
      const isMedium = roundedV % medium === 0;
      const isZero = roundedV === 0;

      ctx.beginPath();
      if (isMajor) {
        // Major tick
        ctx.strokeStyle = isZero ? highlightColor : majorTickColor;
        ctx.moveTo(screenX, RULER_SIZE - 7);
        ctx.lineTo(screenX, RULER_SIZE - 1);
        ctx.stroke();

        // Label
        ctx.fillStyle = isZero ? highlightColor : textColor;
        ctx.fillText(String(roundedV), screenX + 2.5, 3);
      } else if (isMedium) {
        // Medium tick
        ctx.strokeStyle = mediumTickColor;
        ctx.moveTo(screenX, RULER_SIZE - 5);
        ctx.lineTo(screenX, RULER_SIZE - 1);
        ctx.stroke();
      } else {
        // Minor tick
        ctx.strokeStyle = minorTickColor;
        ctx.moveTo(screenX, RULER_SIZE - 3);
        ctx.lineTo(screenX, RULER_SIZE - 1);
        ctx.stroke();
      }
    }

    // Canvas end border marker
    const endScreenX = Math.round(originX + canvasWidth * scale) + 0.5;
    if (endScreenX >= 0 && endScreenX <= stageWidth) {
      ctx.beginPath();
      ctx.strokeStyle = highlightColor;
      ctx.moveTo(endScreenX, 0);
      ctx.lineTo(endScreenX, RULER_SIZE - 1);
      ctx.stroke();
    }
  }, [stageWidth, canvasWidth, scale, originX, pan.x, dark]);

  // Render Vertical Ruler via Canvas for high-DPI crisp graphics
  useEffect(() => {
    const canvas = vCanvasRef.current;
    if (!canvas || stageHeight <= 0 || scale <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = RULER_SIZE * dpr;
    canvas.height = stageHeight * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const baseBg = dark ? "#111215" : "#f4f4f6";
    const activeBg = dark ? "#18191d" : "#ffffff";
    const borderColor = dark ? "#27272a" : "#e4e4e7";
    const majorTickColor = dark ? "#71717a" : "#71717a";
    const mediumTickColor = dark ? "#52525b" : "#a1a1aa";
    const minorTickColor = dark ? "#3f3f46" : "#d4d4d8";
    const textColor = dark ? "#9ca3af" : "#52525b";
    const highlightColor = dark ? "#38bdf8" : "#0284c7";

    // 1. Base Background
    ctx.fillStyle = baseBg;
    ctx.fillRect(0, 0, RULER_SIZE, stageHeight);

    // 2. Active Canvas Span Background
    const canvasStartScreenY = Math.max(0, originY);
    const canvasEndScreenY = Math.min(stageHeight, originY + canvasHeight * scale);
    if (canvasEndScreenY > canvasStartScreenY) {
      ctx.fillStyle = activeBg;
      ctx.fillRect(0, canvasStartScreenY, RULER_SIZE, canvasEndScreenY - canvasStartScreenY);
    }

    // 3. Right Border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(RULER_SIZE - 0.5, 0);
    ctx.lineTo(RULER_SIZE - 0.5, stageHeight);
    ctx.stroke();

    // 4. Tick marks and labels
    const { major, medium, minor } = calculateSteps(scale);

    ctx.font = '600 8.5px "Outfit", "Segoe UI", Roboto, monospace';
    ctx.textBaseline = "top";

    // Draw all ticks across the canvas height
    for (let v = 0; v <= canvasHeight; v += minor) {
      const roundedV = Math.round(v);
      const screenY = Math.round(originY + roundedV * scale) + 0.5;
      if (screenY < 0 || screenY > stageHeight) continue;

      const isMajor = roundedV % major === 0;
      const isMedium = roundedV % medium === 0;
      const isZero = roundedV === 0;

      ctx.beginPath();
      if (isMajor) {
        // Major tick
        ctx.strokeStyle = isZero ? highlightColor : majorTickColor;
        ctx.moveTo(RULER_SIZE - 7, screenY);
        ctx.lineTo(RULER_SIZE - 1, screenY);
        ctx.stroke();

        // Label rotated -90 degrees
        ctx.save();
        ctx.translate(13, screenY - 2.5);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = isZero ? highlightColor : textColor;
        ctx.fillText(String(roundedV), 0, 0);
        ctx.restore();
      } else if (isMedium) {
        // Medium tick
        ctx.strokeStyle = mediumTickColor;
        ctx.moveTo(RULER_SIZE - 5, screenY);
        ctx.lineTo(RULER_SIZE - 1, screenY);
        ctx.stroke();
      } else {
        // Minor tick
        ctx.strokeStyle = minorTickColor;
        ctx.moveTo(RULER_SIZE - 3, screenY);
        ctx.lineTo(RULER_SIZE - 1, screenY);
        ctx.stroke();
      }
    }

    // Canvas end border marker
    const endScreenY = Math.round(originY + canvasHeight * scale) + 0.5;
    if (endScreenY >= 0 && endScreenY <= stageHeight) {
      ctx.beginPath();
      ctx.strokeStyle = highlightColor;
      ctx.moveTo(0, endScreenY);
      ctx.lineTo(RULER_SIZE - 1, endScreenY);
      ctx.stroke();
    }
  }, [stageHeight, canvasHeight, scale, originY, pan.y, dark]);

  const beginDrag = (axis: "h" | "v", index: number, isNew: boolean) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { axis, index, isNew, stageLeft: rect.left, stageTop: rect.top };
    const value =
      axis === "h" ? toCanvasY(e.clientY - rect.top) : toCanvasX(e.clientX - rect.left);
    setDragLabel({ axis, value: Math.round(value) });
  };

  const startNewGuide = (axis: "h" | "v") => (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const value =
      axis === "h" ? toCanvasY(e.clientY - rect.top) : toCanvasX(e.clientX - rect.left);
    const nextArr = axis === "h" ? [...guidesH, value] : [...guidesV, value];
    if (axis === "h") onGuidesHChange(nextArr);
    else onGuidesVChange(nextArr);
    beginDrag(axis, nextArr.length - 1, true)(e);
  };

  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const value =
      d.axis === "h" ? toCanvasY(e.clientY - d.stageTop) : toCanvasX(e.clientX - d.stageLeft);
    setDragLabel({ axis: d.axis, value: Math.round(value) });
    if (d.axis === "h") {
      const next = [...guidesH];
      next[d.index] = value;
      onGuidesHChange(next);
    } else {
      const next = [...guidesV];
      next[d.index] = value;
      onGuidesVChange(next);
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const screenPos = d.axis === "h" ? e.clientY - d.stageTop : e.clientX - d.stageLeft;
    if (screenPos < RULER_SIZE) {
      removeGuide(d.axis, d.index);
    }
    dragRef.current = null;
    setDragLabel(null);
  };

  const removeGuide = (axis: "h" | "v", index: number) => {
    if (axis === "h") onGuidesHChange(guidesH.filter((_, i) => i !== index));
    else onGuidesVChange(guidesV.filter((_, i) => i !== index));
  };

  if (stageWidth <= 0 || stageHeight <= 0 || scale <= 0) return null;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* Top Horizontal Ruler */}
      <div
        onPointerDown={startNewGuide("h")}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="pointer-events-auto absolute left-0 top-0 overflow-hidden"
        style={{ width: stageWidth, height: RULER_SIZE, cursor: "ns-resize" }}
        title="Click and drag to add horizontal guide"
      >
        <canvas
          ref={hCanvasRef}
          style={{ width: stageWidth, height: RULER_SIZE, display: "block" }}
        />
      </div>

      {/* Left Vertical Ruler */}
      <div
        onPointerDown={startNewGuide("v")}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="pointer-events-auto absolute left-0 top-0 overflow-hidden"
        style={{ width: RULER_SIZE, height: stageHeight, cursor: "ew-resize" }}
        title="Click and drag to add vertical guide"
      >
        <canvas
          ref={vCanvasRef}
          style={{ width: RULER_SIZE, height: stageHeight, display: "block" }}
        />
      </div>

      {/* Corner Intersection Box */}
      <div
        className={`pointer-events-none absolute left-0 top-0 flex items-center justify-center border-b border-r ${
          dark ? "border-zinc-800 bg-[#111215]" : "border-zinc-200 bg-[#f4f4f6]"
        }`}
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      >
        <span className={`text-[7.5px] font-bold tracking-tighter ${dark ? "text-zinc-500" : "text-zinc-500"}`}>px</span>
      </div>

      {/* Guide lines — click-drag to reposition, double-click or drag back to remove */}
      {guidesH.map((v, i) => (
        <div
          key={`h-${i}`}
          onPointerDown={beginDrag("h", i, false)}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => removeGuide("h", i)}
          className="group pointer-events-auto absolute left-0"
          style={{
            top: originY + v * scale - GUIDE_HIT_SIZE / 2,
            width: stageWidth,
            height: GUIDE_HIT_SIZE,
            cursor: "ns-resize",
            zIndex: 5,
          }}
          title="Drag to move, double-click to remove"
        >
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-[#ec4899] group-hover:h-[2px] group-hover:shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
        </div>
      ))}
      {guidesV.map((v, i) => (
        <div
          key={`v-${i}`}
          onPointerDown={beginDrag("v", i, false)}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => removeGuide("v", i)}
          className="group pointer-events-auto absolute top-0"
          style={{
            left: originX + v * scale - GUIDE_HIT_SIZE / 2,
            height: stageHeight,
            width: GUIDE_HIT_SIZE,
            cursor: "ew-resize",
            zIndex: 5,
          }}
          title="Drag to move, double-click to remove"
        >
          <div className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-[#ec4899] group-hover:w-[2px] group-hover:shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
        </div>
      ))}

      {dragLabel ? (
        <div
          className="pointer-events-none absolute rounded-md bg-[#ec4899] px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-lg"
          style={
            dragLabel.axis === "h"
              ? {
                  left: RULER_SIZE + 8,
                  top: originY + dragLabel.value * scale + 6,
                }
              : {
                  left: originX + dragLabel.value * scale + 8,
                  top: RULER_SIZE + 6,
                }
          }
        >
          {dragLabel.axis === "h" ? "Y" : "X"}: {dragLabel.value}px
        </div>
      ) : null}
    </div>
  );
}
