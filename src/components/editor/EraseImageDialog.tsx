import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Eraser01Icon,
  PaintBrush01Icon,
  CheckmarkCircle02Icon,
  ReloadIcon,
  ArrowTurnBackwardIcon,
} from "hugeicons-react";
import { Chip, Range } from "./ui";

interface EraseImageDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  onErased: (dataUrl: string) => void;
}

type Point = { x: number; y: number };

// Both modes below share the exact same first step — punch a transparent
// stroke into the working canvas — which is what makes Restore able to
// reuse Erase's own drawing code instead of needing a separate masking/clip
// implementation: a stroke clipped to just the brushed area is genuinely
// awkward to build directly (canvas has no "clip to a stroke outline"
// primitive, only fillable paths), but "clear a stroke-shaped hole, then
// paint the pristine original in behind only where the destination is now
// transparent" produces the identical visual result with none of that
// complexity.
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

/**
 * Manual eraser for an image layer — brush away parts of the picture to
 * transparency (e.g. pulling a subject off a busy background by hand), with
 * a Restore brush to paint any of that back in, brush size, one-level
 * undo per stroke, and a full Reset back to the untouched original.
 * Outputs PNG (never JPEG — the whole point is the transparency this
 * produces) via onErased, same shape as ImageCropDialog's onCropComplete.
 */
export function EraseImageDialog({ open, onClose, imageSrc, onErased }: EraseImageDialogProps) {
  const [mode, setMode] = useState<"erase" | "restore">("erase");
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      originalImgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
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
    const canvas = canvasRef.current;
    const point = getCanvasPoint(e);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);

    isDrawingRef.current = true;
    lastPointRef.current = point;
    const radius = getRadiusInCanvasPx();
    // A dab at the down point too — otherwise a plain tap/click with no
    // drag afterward erases nothing at all.
    strokeErase(ctx, point, point, radius);
    if (mode === "restore") applyRestoreBackfill(ctx, canvas);
    setHasEdits(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (canvas && rect) {
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
    }
    if (!isDrawingRef.current) return;
    const point = getCanvasPoint(e);
    const last = lastPointRef.current;
    if (!canvas || !point || !last) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const radius = getRadiusInCanvasPx();
    strokeErase(ctx, last, point, radius);
    if (mode === "restore") applyRestoreBackfill(ctx, canvas);
    lastPointRef.current = point;
  };

  const endStroke = (e: React.PointerEvent) => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
  };

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
      onOpenChange={() => {
        // No-op, deliberately — same hardening as ImageCropDialog. The
        // canvas's own pointer-capture-driven drawing gesture (see
        // handlePointerDown) was tripping Radix's dismiss-on-outside-
        // interaction logic even with the guards below in place, closing
        // the dialog mid-stroke. Only the explicit Cancel/Apply buttons
        // below are allowed to actually close this.
      }}
    >
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-[580px] rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary shadow-md">
              <Eraser01Icon size={18} />
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Erase Image</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Brush to erase part of the image to transparency, or switch to Restore to paint it back in.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Erase / Restore mode toggle */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border/80 bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => setMode("erase")}
              className={
                "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all " +
                (mode === "erase"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Eraser01Icon size={14} />
              <span>Erase</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("restore")}
              className={
                "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all " +
                (mode === "restore"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <PaintBrush01Icon size={14} />
              <span>Restore</span>
            </button>
          </div>

          {/* Canvas stage — checkerboard shows through wherever erased */}
          <div
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
            className="relative flex h-84 w-full items-center justify-center overflow-hidden rounded-2xl border border-border"
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onPointerLeave={() => setCursorPos((p) => ({ ...p, visible: false }))}
              onPointerEnter={() => setCursorPos((p) => ({ ...p, visible: true }))}
              style={{ touchAction: "none", cursor: "none" }}
              className="max-h-84 max-w-full select-none rounded-sm object-contain shadow-2xl ring-1 ring-white/20"
            />
            {/* Brush cursor — a live-sized ring following the pointer so
                the actual erase area is obvious before you commit a stroke. */}
            {cursorPos.visible ? (
              <div
                className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                style={{
                  width: brushSize,
                  height: brushSize,
                  left: cursorPos.x - brushSize / 2,
                  top: cursorPos.y - brushSize / 2,
                  backgroundColor: mode === "erase" ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                }}
              />
            ) : null}
          </div>

          {/* Brush size + Undo/Reset */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-3">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">Brush Size</span>
                <span className="font-mono text-muted-foreground">{brushSize}px</span>
              </div>
              <Range value={brushSize} min={5} max={150} showInput={false} onChange={setBrushSize} />
            </div>

            <div className="flex items-center gap-1.5 border-l border-border pl-3">
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
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
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
