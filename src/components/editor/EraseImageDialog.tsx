import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ColorPickerContent } from "@/components/ui/color-picker";
import {
  Eraser01Icon,
  PaintBrush01Icon,
  PaintBoardIcon,
  CheckmarkCircle02Icon,
  ReloadIcon,
  ArrowTurnBackwardIcon,
  Add01Icon,
  MinusSignIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";
// HandGrabIcon (the "Drag to move" icon used elsewhere in the editor, e.g.
// QuoteCanvas.tsx) only exists in this newer icon package, not the
// hugeicons-react one everything else on this page comes from.
import { HugeiconsIcon } from "@hugeicons/react";
import { HandGrabIcon } from "@hugeicons/core-free-icons";
import { Chip, ColorInput, Range, useHoldRepeat } from "./ui";

interface EraseImageDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  onErased: (dataUrl: string) => void;
}

type Point = { x: number; y: number };

const BRUSH_PRESET_COLORS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

function strokeErase(ctx: CanvasRenderingContext2D, from: Point, to: Point, radius: number) {
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = radius * 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function strokePaint(ctx: CanvasRenderingContext2D, from: Point, to: Point, radius: number, color: string) {
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = radius * 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function dabPaint(ctx: CanvasRenderingContext2D, point: Point, radius: number, color: string) {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function DraggableColorPanel({
  open,
  onClose,
  brushColor,
  setBrushColor,
}: {
  open: boolean;
  onClose: () => void;
  brushColor: string;
  setBrushColor: (c: string) => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({
    x: typeof window !== "undefined" ? Math.max(16, Math.round(window.innerWidth / 2 - 140)) : 40,
    y: typeof window !== "undefined" ? Math.max(60, Math.round(window.innerHeight * 0.15)) : 100,
  }));
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });

  const handleDragPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: pos.x,
      initY: pos.y,
    };
  };

  const handleDragPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const maxX = Math.max(0, (typeof window !== "undefined" ? window.innerWidth : 400) - 290);
    const maxY = Math.max(0, (typeof window !== "undefined" ? window.innerHeight : 600) - 350);
    setPos({
      x: Math.max(8, Math.min(maxX, dragStartRef.current.initX + dx)),
      y: Math.max(8, Math.min(maxY, dragStartRef.current.initY + dy)),
    });
  };

  const handleDragPointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      onPointerDown={(e) => e.stopPropagation()}
      data-nopan=""
      data-keep-text-editing=""
      style={{
        position: "fixed",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: 99999,
      }}
      className="w-[280px] max-w-[calc(100vw-24px)] rounded-3xl border border-border/90 bg-popover/98 shadow-2xl backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden ring-1 ring-white/15"
    >
      {/* Draggable Header Handle */}
      <div
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
        style={{ touchAction: "none" }}
        className="flex cursor-grab active:cursor-grabbing items-center justify-between border-b border-border/60 px-3.5 py-2.5 bg-secondary/60 select-none"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-foreground pointer-events-none">
          <PaintBoardIcon size={15} className="text-primary shrink-0" />
          <span>Custom Color</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline pointer-events-none">Drag to move</span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-1">
        <ColorPickerContent
          value={brushColor}
          onChange={setBrushColor}
          showAlpha={false}
        />
      </div>
    </div>,
    document.body,
  );
}

/**
 * Manual eraser & painter for an image layer — brush away parts of the picture to
 * transparency, restore original details, or draw with a color brush & color picker.
 */
export function EraseImageDialog({ open, onClose, imageSrc, onErased }: EraseImageDialogProps) {
  const [mode, setMode] = useState<"erase" | "restore" | "brush">("erase");
  const [brushColor, setBrushColor] = useState<string>("#000000");
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [brushSize, setBrushSize] = useState(40); // CSS px, at the on-screen display size — see getRadiusInCanvasPx
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  // Mirrors undoStackRef.current.length > 0 as actual state — the ref
  // alone changing doesn't re-render the Undo button's disabled state.
  const [canUndo, setCanUndo] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  // The canvas's CSS box has to end up at exactly this aspect ratio (see
  // where it's applied below) — otherwise a mismatched box lets object-fit
  // letterbox the actual image inside it, and every erase coordinate
  // computed from the box's own bounding rect would be off by however big
  // that letterbox gap is. Defaults to 1 before the image has loaded.
  const [aspectRatio, setAspectRatio] = useState(1);
  // Zoom/pan are pure VIEW state — magnifying the canvas via a CSS
  // transform, not touching the image data at all, so they're untouched by
  // Undo/Reset and don't need their own undo history. getCanvasPoint/
  // getRadiusInCanvasPx below need no extra math for this: getBoundingClientRect
  // already reflects the CSS transform applied to the canvas itself, so a
  // bigger on-screen box at higher zoom naturally yields a smaller
  // canvas-pixels-per-screen-pixel ratio — exactly the finer precision
  // zooming in is supposed to buy.
  const [zoom, setZoom] = useState(100); // 100-400, matching ImageCropDialog's own range convention
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Erase/Restore both drag to draw, so panning needs an explicit mode
  // rather than competing for the same drag gesture — flip this on to
  // reposition a zoomed-in view, then back off to keep brushing. (Multi-
  // touch pinch/two-finger-pan was deliberately left out: real, but a much
  // bigger surface to get right than a toggle, for a first pass.)
  const [panMode, setPanMode] = useState(false);
  const panDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The checkerboard stage wrapping the canvas — needed because the cursor
  // ring below is positioned (absolute) relative to THIS element, not the
  // canvas itself, so its own coordinate math has to be computed against
  // the same rect it's rendered against. See handlePointerMove's comment.
  const stageRef = useRef<HTMLDivElement>(null);
  const originalImgRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  // One snapshot per in-progress stroke, pushed right before that stroke
  // starts — Undo pops the most recent one back in. Capped so an unlucky
  // very-high-resolution image (this snapshot is the full canvas's raw
  // pixel buffer) can't quietly balloon memory over a long editing session.
  const undoStackRef = useRef<ImageData[]>([]);
  const MAX_UNDO = 12;

  const normalizedSrc = (() => {
    if (!imageSrc) return "";
    const trimmed = imageSrc.trim();
    if (trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"))) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
    }
    return imageSrc;
  })();

  // (Re)loads the source image onto the working canvas at its own native
  // resolution — erasing happens at full quality regardless of how small
  // the dialog displays it on screen (see getRadiusInCanvasPx's own
  // comment for the screen-to-canvas brush size conversion this implies).
  useEffect(() => {
    if (!open || !normalizedSrc) return;
    setHasEdits(false);
    setCanUndo(false);
    undoStackRef.current = [];
    setMode("erase");
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setPanMode(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      originalImgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      setAspectRatio((img.naturalWidth || 1) / (img.naturalHeight || 1));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = normalizedSrc;
  }, [open, normalizedSrc]);

  // Maps a pointer event's screen position to the canvas's OWN pixel space
  // — canvas.width/height (native image resolution) is almost always
  // larger than its on-screen rendered size (capped by CSS below), so this
  // scale factor is what keeps erasing precise regardless of zoom/display
  // size instead of drawing in the wrong spot entirely.
  const getCanvasPoint = (e: React.PointerEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  // brushSize is chosen/shown in on-screen CSS px so it FEELS the same size
  // regardless of the underlying image's resolution (a 6000px photo and a
  // 600px one both get e.g. a "40px-look" brush) — converted to the
  // canvas's own (usually much larger) pixel space at the moment of
  // drawing, same scale factor as getCanvasPoint above.
  const getRadiusInCanvasPx = (): number => {
    const canvas = canvasRef.current;
    if (!canvas) return brushSize / 2;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return (brushSize / 2) * scale;
  };

  const applyRestoreBackfill = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const original = originalImgRef.current;
    if (!original) return;
    // Only paints into what the destination-out stroke just made
    // transparent — everywhere else on the canvas already has pixels, so
    // "draw behind" is a no-op there.
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (panMode) {
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
      return;
    }
    const canvas = canvasRef.current;
    const point = getCanvasPoint(e);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);

    isDrawingRef.current = true;
    lastPointRef.current = point;
    const radius = getRadiusInCanvasPx();
    // A dab at the down point too — otherwise a plain tap/click with no
    // drag afterward paints/erases nothing at all.
    if (mode === "brush") {
      dabPaint(ctx, point, radius, brushColor);
    } else {
      strokeErase(ctx, point, point, radius);
      if (mode === "restore") applyRestoreBackfill(ctx, canvas);
    }
    setHasEdits(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (panMode) {
      const drag = panDragRef.current;
      if (!drag) return;
      setPan({ x: drag.startPanX + (e.clientX - drag.startX), y: drag.startPanY + (e.clientY - drag.startY) });
      return;
    }
    const canvas = canvasRef.current;
    // Deliberately the STAGE's rect, not the canvas's own — the ring below
    // is an absolutely-positioned sibling of the canvas inside the stage,
    // centered by the stage's flex layout, so it needs coordinates in the
    // stage's frame to land in the same place on screen as the pointer
    // actually is. getCanvasPoint (the real erase math) is unaffected —
    // it deliberately keeps using the canvas's own rect, since a scale
    // factor into buffer-pixel space is a different calculation entirely.
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (stageRect) {
      setCursorPos({ x: e.clientX - stageRect.left, y: e.clientY - stageRect.top, visible: true });
    }
    if (!isDrawingRef.current) return;
    const point = getCanvasPoint(e);
    const last = lastPointRef.current;
    if (!canvas || !point || !last) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const radius = getRadiusInCanvasPx();
    if (mode === "brush") {
      strokePaint(ctx, last, point, radius, brushColor);
    } else {
      strokeErase(ctx, last, point, radius);
      if (mode === "restore") applyRestoreBackfill(ctx, canvas);
    }
    lastPointRef.current = point;
  };

  const endStroke = (e: React.PointerEvent) => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
    panDragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
  };

  // Desktop convenience — matches ImageCropDialog's own wheel-to-zoom.
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 10 : -10;
    setZoom((z) => Math.min(400, Math.max(100, z + delta)));
  };

  // Press-and-hold repeat for the Zoom -/+ buttons — see useHoldRepeat's
  // own comment in ui.tsx.
  const zoomDecHold = useHoldRepeat(() => setZoom((z) => Math.max(100, z - 10)));
  const zoomIncHold = useHoldRepeat(() => setZoom((z) => Math.min(400, z + 10)));

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = undoStackRef.current.pop();
    if (!canvas || !ctx || !last) return;
    ctx.putImageData(last, 0, 0);
    setHasEdits(undoStackRef.current.length > 0);
    setCanUndo(undoStackRef.current.length > 0);
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const original = originalImgRef.current;
    if (!canvas || !ctx || !original) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(original, 0, 0, canvas.width, canvas.height);
    undoStackRef.current = [];
    setHasEdits(false);
    setCanUndo(false);
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsProcessing(true);
    try {
      // PNG, never JPEG — JPEG has no alpha channel and would flatten
      // every erased area back to a solid color, undoing the entire point
      // of this tool.
      onErased(canvas.toDataURL("image/png"));
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isDrawingRef.current) {
          onClose();
        }
      }}
    >
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[95vw] sm:max-w-[580px] max-h-[92vh] flex flex-col overflow-y-auto rounded-2xl border border-border bg-background p-4 sm:p-6 shadow-2xl backdrop-blur-xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-md">
              <Eraser01Icon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm sm:text-base font-bold text-foreground">Erase & Paint Image</DialogTitle>
              <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1">
                Erase to transparency, restore pixels, or draw with color brush.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-3 sm:mt-4 space-y-2.5 sm:space-y-3.5">
          {/* Erase / Restore / Color Brush mode toggle */}
          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/80 bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => setMode("erase")}
              className={cn(
                "flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-1.5 sm:py-2 px-1 text-[11px] sm:text-xs font-semibold transition-all truncate",
                mode === "erase"
                  ? "bg-background text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eraser01Icon size={14} className="shrink-0" />
              <span className="truncate">Erase</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("restore")}
              className={cn(
                "flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-1.5 sm:py-2 px-1 text-[11px] sm:text-xs font-semibold transition-all truncate",
                mode === "restore"
                  ? "bg-background text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ReloadIcon size={14} className="shrink-0" />
              <span className="truncate">Restore</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("brush")}
              className={cn(
                "flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl py-1.5 sm:py-2 px-1 text-[11px] sm:text-xs font-semibold transition-all truncate",
                mode === "brush"
                  ? "bg-background text-foreground shadow-sm font-bold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <PaintBrush01Icon size={14} className="shrink-0" />
              <span className="truncate">Color Brush</span>
            </button>
          </div>

          {/* Brush Color Picker Bar (when Color Brush mode is active) */}
          {mode === "brush" ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-3 py-2">
              <span className="shrink-0 text-xs font-semibold text-foreground">Color</span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar px-2 py-2">
                {BRUSH_PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrushColor(c)}
                    style={{ backgroundColor: c }}
                    className={cn(
                      "h-5 w-5 shrink-0 rounded-full border border-black/20 transition-transform hover:scale-110 active:scale-95",
                      brushColor.toLowerCase() === c.toLowerCase() &&
                        "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110",
                    )}
                    title={c}
                  />
                ))}
              </div>
              <div className="h-4 w-px shrink-0 bg-border mx-0.5" />
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomColorOpen((o) => !o)}
                  className={cn(
                    "group flex h-8 items-center gap-2 rounded-full border border-border/80 bg-secondary/60 pl-2.5 pr-1.5 py-1 text-xs font-semibold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground hover:scale-105 active:scale-95 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary",
                    customColorOpen && "ring-2 ring-primary ring-offset-2 ring-offset-background bg-secondary text-foreground",
                  )}
                  title="Custom color picker / eyedropper"
                >
                  <PaintBoardIcon size={16} className="text-foreground shrink-0 transition-transform group-hover:scale-110" />
                  <span
                    className="h-5 w-5 shrink-0 rounded-full border border-black/20 dark:border-white/20 shadow-sm ring-1 ring-black/10 dark:ring-white/10"
                    style={{ backgroundColor: brushColor }}
                  />
                </button>

                <DraggableColorPanel
                  open={customColorOpen}
                  onClose={() => setCustomColorOpen(false)}
                  brushColor={brushColor}
                  setBrushColor={setBrushColor}
                />
              </div>
            </div>
          ) : null}

          {/* Canvas stage — checkerboard shows through wherever erased */}
          <div
            ref={stageRef}
            onWheel={handleWheel}
            style={{
              backgroundImage: `
                linear-gradient(45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
                linear-gradient(-45deg, rgba(255, 255, 255, 0.08) 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%),
                linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.08) 75%)
              `,
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
              backgroundColor: "#18181b",
            }}
            className="relative flex h-56 sm:h-76 w-full items-center justify-center overflow-hidden rounded-2xl border border-border touch-none"
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onPointerLeave={() => setCursorPos((p) => ({ ...p, visible: false }))}
              onPointerEnter={() => setCursorPos((p) => ({ ...p, visible: true }))}
              style={{
                touchAction: "none",
                cursor: panMode ? "grab" : "none",
                aspectRatio: String(aspectRatio),
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
              }}
              className="max-h-56 sm:max-h-76 max-w-full select-none rounded-sm shadow-2xl ring-1 ring-white/20"
            />
            {/* Brush cursor ring */}
            {cursorPos.visible && !panMode ? (
              <div
                className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                style={{
                  width: brushSize,
                  height: brushSize,
                  left: cursorPos.x - brushSize / 2,
                  top: cursorPos.y - brushSize / 2,
                  backgroundColor:
                    mode === "erase"
                      ? "rgba(239,68,68,0.25)"
                      : mode === "restore"
                        ? "rgba(34,197,94,0.25)"
                        : brushColor,
                  opacity: mode === "brush" ? 0.65 : 1,
                }}
              />
            ) : null}
          </div>

          {/* Zoom + Pan */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-2.5 sm:p-3">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">Zoom</span>
                <span className="font-mono text-muted-foreground">{zoom}%</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" {...zoomDecHold} className="text-muted-foreground hover:text-foreground">
                  <MinusSignIcon size={14} />
                </button>
                <div className="flex-1">
                  <Range value={zoom} min={100} max={400} showInput={false} onChange={setZoom} />
                </div>
                <button type="button" {...zoomIncHold} className="text-muted-foreground hover:text-foreground">
                  <Add01Icon size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center border-l border-border pl-2.5 sm:pl-3">
              <Chip
                onClick={() => setPanMode((p) => !p)}
                active={panMode}
                className="h-8 w-8 p-0 flex items-center justify-center"
                title={panMode ? "Exit pan mode" : "Pan the zoomed view"}
              >
                <HugeiconsIcon icon={HandGrabIcon} size={14} />
              </Chip>
            </div>
          </div>

          {/* Brush size + Undo/Reset */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-2.5 sm:p-3">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">Brush Size</span>
                <span className="font-mono text-muted-foreground">{brushSize}px</span>
              </div>
              <Range value={brushSize} min={5} max={150} showInput={false} onChange={setBrushSize} />
            </div>

            <div className="flex items-center gap-1.5 border-l border-border pl-2.5 sm:pl-3">
              <Chip
                onClick={handleUndo}
                disabled={!canUndo}
                className="h-8 w-8 p-0 flex items-center justify-center text-muted-foreground disabled:opacity-30"
                title="Undo last stroke"
              >
                <ArrowTurnBackwardIcon size={14} />
              </Chip>
              <Chip
                onClick={handleReset}
                className="h-8 w-8 p-0 flex items-center justify-center text-muted-foreground"
                title="Reset to original"
              >
                <ReloadIcon size={13} />
              </Chip>
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="mt-4 sm:mt-5 flex items-center justify-end gap-2 border-t border-border pt-3 sm:pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isProcessing || !hasEdits}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <CheckmarkCircle02Icon size={14} />
            <span>{isProcessing ? "Saving..." : "Apply"}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
