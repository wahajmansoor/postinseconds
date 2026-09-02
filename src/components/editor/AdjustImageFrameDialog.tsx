import type React from "react";
import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Range, Chip } from "./ui";
import { cn } from "@/lib/utils";
import type { ImageLayer } from "./types";
import { frameShapeCss, CANVA_FRAME_PLACEHOLDER_SRC } from "./types";
import { Settings02Icon, CheckmarkCircle02Icon } from "hugeicons-react";

interface AdjustImageFrameDialogProps {
  open: boolean;
  onClose: () => void;
  layer: ImageLayer;
  onUpdate: (patch: Partial<Omit<ImageLayer, "id">>) => void;
}

export function AdjustImageFrameDialog({
  open,
  onClose,
  layer,
  onUpdate,
}: AdjustImageFrameDialogProps) {
  const [zoom, setZoom] = useState(layer.frameZoom ?? 100);
  const [offsetX, setOffsetX] = useState(layer.frameOffsetX ?? 50);
  const [offsetY, setOffsetY] = useState(layer.frameOffsetY ?? 50);
  const [objectFit, setObjectFit] = useState<"cover" | "contain" | "fill">(
    layer.objectFit ?? "cover",
  );

  // Sync state with incoming layer prop when dialog opens
  useEffect(() => {
    if (open) {
      setZoom(layer.frameZoom ?? 100);
      setOffsetX(layer.frameOffsetX ?? 50);
      setOffsetY(layer.frameOffsetY ?? 50);
      setObjectFit(layer.objectFit ?? "cover");
    }
  }, [open, layer.frameZoom, layer.frameOffsetX, layer.frameOffsetY, layer.objectFit]);

  // Live direct pan inside preview canvas
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: offsetX,
      startY: offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning || !panStartRef.current || !previewBoxRef.current) return;
    const rect = previewBoxRef.current.getBoundingClientRect();
    const dx = ((panStartRef.current.clientX - e.clientX) / rect.width) * 100;
    const dy = ((panStartRef.current.clientY - e.clientY) / rect.height) * 100;

    const nextX = Math.round(Math.min(100, Math.max(0, panStartRef.current.startX + dx)));
    const nextY = Math.round(Math.min(100, Math.max(0, panStartRef.current.startY + dy)));

    setOffsetX(nextX);
    setOffsetY(nextY);
    onUpdate({ frameOffsetX: nextX, frameOffsetY: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsPanning(false);
    panStartRef.current = null;
  };

  const frameStyle = frameShapeCss(layer.frameShape, layer.radius);
  const zoomScale = zoom > 100 ? zoom / 100 : 1;

  const handleApply = () => {
    onUpdate({
      frameZoom: zoom,
      frameOffsetX: offsetX,
      frameOffsetY: offsetY,
      objectFit,
    });
    onClose();
  };

  const handleReset = () => {
    setZoom(100);
    setOffsetX(50);
    setOffsetY(50);
    setObjectFit("cover");
    onUpdate({
      frameZoom: 100,
      frameOffsetX: 50,
      frameOffsetY: 50,
      objectFit: "cover",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl overflow-hidden rounded-3xl border border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="border-b border-border/60 p-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Settings02Icon size={18} />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-foreground">
                Adjust Image in Frame
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Drag on the preview to pan or use the sliders to crop and zoom inside the frame.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
          {/* Left: Interactive Live Preview with Direct Click-and-Drag Pan */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-secondary/30 p-4">
            <div
              ref={previewBoxRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -5 : 5;
                const nextZoom = Math.min(300, Math.max(100, zoom + delta));
                setZoom(nextZoom);
                onUpdate({ frameZoom: nextZoom });
              }}
              style={{
                width: "220px",
                height: "220px",
                cursor: isPanning ? "grabbing" : "grab",
                ...frameStyle,
              }}
              className="relative select-none overflow-hidden shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              <img
                src={layer.src || CANVA_FRAME_PLACEHOLDER_SRC}
                alt="Framed preview"
                draggable={false}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit,
                  objectPosition: `${offsetX}% ${offsetY}%`,
                  transform: [
                    layer.flipH ? "scaleX(-1)" : "",
                    layer.flipV ? "scaleY(-1)" : "",
                    zoomScale !== 1 ? `scale(${zoomScale})` : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined,
                }}
                className="pointer-events-none h-full w-full select-none"
              />

              {/* Helpful overlay hint */}
              <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-md">
                  Drag to pan · Scroll to zoom
                </span>
              </div>
            </div>
          </div>

          {/* Right: Fine-tuning sliders and quick chips */}
          <div className="flex flex-col justify-between space-y-3">
            <div className="space-y-3">
              {/* 1. Zoom Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Zoom Level</span>
                  <span className="text-[11px] font-medium text-muted-foreground">{zoom}%</span>
                </div>
                <Range
                  min={100}
                  max={300}
                  value={zoom}
                  onChange={(v) => {
                    setZoom(v);
                    onUpdate({ frameZoom: v });
                  }}
                />
                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  {[
                    { label: "1x", val: 100 },
                    { label: "1.5x", val: 150 },
                    { label: "2x", val: 200 },
                    { label: "3x", val: 300 },
                  ].map((item) => (
                    <Chip
                      key={item.label}
                      active={zoom === item.val}
                      onClick={() => {
                        setZoom(item.val);
                        onUpdate({ frameZoom: item.val });
                      }}
                      className="justify-center py-0.5 text-[10px]"
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* 2. Horizontal Pan */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Horizontal (X)</span>
                  <span className="text-[11px] font-medium text-muted-foreground">{offsetX}%</span>
                </div>
                <Range
                  min={0}
                  max={100}
                  value={offsetX}
                  onChange={(v) => {
                    setOffsetX(v);
                    onUpdate({ frameOffsetX: v });
                  }}
                />
                <div className="grid grid-cols-3 gap-1 pt-0.5">
                  {[
                    { label: "Left", val: 0 },
                    { label: "Center", val: 50 },
                    { label: "Right", val: 100 },
                  ].map((item) => (
                    <Chip
                      key={item.label}
                      active={offsetX === item.val}
                      onClick={() => {
                        setOffsetX(item.val);
                        onUpdate({ frameOffsetX: item.val });
                      }}
                      className="justify-center py-0.5 text-[10px]"
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* 3. Vertical Pan */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Vertical (Y)</span>
                  <span className="text-[11px] font-medium text-muted-foreground">{offsetY}%</span>
                </div>
                <Range
                  min={0}
                  max={100}
                  value={offsetY}
                  onChange={(v) => {
                    setOffsetY(v);
                    onUpdate({ frameOffsetY: v });
                  }}
                />
                <div className="grid grid-cols-3 gap-1 pt-0.5">
                  {[
                    { label: "Top", val: 0 },
                    { label: "Center", val: 50 },
                    { label: "Bottom", val: 100 },
                  ].map((item) => (
                    <Chip
                      key={item.label}
                      active={offsetY === item.val}
                      onClick={() => {
                        setOffsetY(item.val);
                        onUpdate({ frameOffsetY: item.val });
                      }}
                      className="justify-center py-0.5 text-[10px]"
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* 4. Fit Mode */}
              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <span className="text-xs font-semibold text-foreground">Fit</span>
                <div className="flex items-center gap-1">
                  {(["cover", "contain", "fill"] as const).map((mode) => (
                    <Chip
                      key={mode}
                      active={objectFit === mode}
                      onClick={() => {
                        setObjectFit(mode);
                        onUpdate({ objectFit: mode });
                      }}
                      className="capitalize py-0.5 px-2 text-[10px]"
                    >
                      {mode}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 rounded-xl border border-border/80 bg-secondary/50 py-2 text-xs font-semibold text-foreground transition-all hover:bg-secondary active:scale-95"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-[2] flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground shadow-md transition-all hover:opacity-90 active:scale-95"
              >
                <CheckmarkCircle02Icon size={14} />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
