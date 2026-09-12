import React, { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  CropIcon,
  Rotate01Icon,
  RefreshIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  Image01Icon,
} from "hugeicons-react";

interface AvatarCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
}

const VIEWPORT_SIZE = 300; // Display size of cropping canvas in px
const CROP_RADIUS = 120; // 240px diameter crop circle

export function AvatarCropDialog({
  open,
  imageSrc,
  onClose,
  onCropComplete,
}: AvatarCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Touch pinch zoom tracking
  const touchDistanceRef = useRef<number | null>(null);

  // Load image when imageSrc changes
  useEffect(() => {
    if (!imageSrc || !open) {
      setImageLoaded(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
    };
    img.onerror = () => {
      console.error("Failed to load image for avatar cropping");
      setImageLoaded(false);
    };
    img.src = imageSrc;
  }, [imageSrc, open]);

  // Render preview canvas
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = VIEWPORT_SIZE * dpr;
    canvas.height = VIEWPORT_SIZE * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

    // Calculate base scale to fit/cover crop circle
    const isRotated = rotation === 90 || rotation === 270;
    const imgWidth = isRotated ? img.naturalHeight : img.naturalWidth;
    const imgHeight = isRotated ? img.naturalWidth : img.naturalHeight;

    const baseScale = Math.max((CROP_RADIUS * 2) / imgWidth, (CROP_RADIUS * 2) / imgHeight);
    const currentScale = baseScale * zoom;

    ctx.save();
    // Center of viewport
    ctx.translate(VIEWPORT_SIZE / 2 + pan.x, VIEWPORT_SIZE / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);

    const drawW = img.naturalWidth * currentScale;
    const drawH = img.naturalHeight * currentScale;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Dark overlay with circular cutout
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.beginPath();
    ctx.rect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
    // Cutout circle (counter-clockwise)
    ctx.arc(VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2, true);
    ctx.fill();

    // Circular crop border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2, CROP_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Grid lines inside crop circle for alignment
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(VIEWPORT_SIZE / 2 - CROP_RADIUS, VIEWPORT_SIZE / 2);
    ctx.lineTo(VIEWPORT_SIZE / 2 + CROP_RADIUS, VIEWPORT_SIZE / 2);
    ctx.moveTo(VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2 - CROP_RADIUS);
    ctx.lineTo(VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2 + CROP_RADIUS);
    ctx.stroke();
    ctx.restore();
  }, [imageLoaded, zoom, rotation, pan]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  // Pointer drag event handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setZoom((prev) => Math.min(Math.max(prev + delta, 1), 3.5));
  };

  // Touch pinch handlers for mobile
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      if (!touch1 || !touch2) return;
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      if (touchDistanceRef.current !== null) {
        const delta = (dist - touchDistanceRef.current) * 0.008;
        setZoom((prev) => Math.min(Math.max(prev + delta, 1), 3.5));
      }
      touchDistanceRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    touchDistanceRef.current = null;
  };

  // Generate cropped output image
  const handleApplyCrop = () => {
    const img = imageRef.current;
    if (!img) return;

    const exportSize = 256; // 256x256 crisp avatar output, fast saving
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportSize;
    exportCanvas.height = exportSize;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;

    const isRotated = rotation === 90 || rotation === 270;
    const imgWidth = isRotated ? img.naturalHeight : img.naturalWidth;
    const imgHeight = isRotated ? img.naturalWidth : img.naturalHeight;

    const baseScale = Math.max((CROP_RADIUS * 2) / imgWidth, (CROP_RADIUS * 2) / imgHeight);
    const currentScale = baseScale * zoom;

    // Scale factors from viewport to export size
    const exportScale = exportSize / (CROP_RADIUS * 2);

    exportCtx.save();
    // Move to center of export canvas
    exportCtx.translate(exportSize / 2, exportSize / 2);
    // Apply pan relative to export scale
    exportCtx.translate(pan.x * exportScale, pan.y * exportScale);
    exportCtx.rotate((rotation * Math.PI) / 180);

    const drawW = img.naturalWidth * currentScale * exportScale;
    const drawH = img.naturalHeight * currentScale * exportScale;
    exportCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    exportCtx.restore();

    // Export as optimized JPEG/WebP data URL
    try {
      const dataUrl = exportCanvas.toDataURL("image/jpeg", 0.85);
      onCropComplete(dataUrl);
      onClose();
    } catch {
      const fallbackUrl = exportCanvas.toDataURL("image/png");
      onCropComplete(fallbackUrl);
      onClose();
    }
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px] overflow-hidden rounded-3xl border border-border bg-card/95 p-0 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="p-5 pb-2">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/10 text-amber-500 shadow-sm">
              <CropIcon size={20} />
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Adjust Profile Photo
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Drag to reposition, and use the slider or scroll to zoom.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 py-2 flex flex-col items-center">
          {/* Interactive Viewport Canvas */}
          <div
            className="relative w-[300px] h-[300px] rounded-2xl overflow-hidden bg-black/90 shadow-inner border border-border/80 cursor-grab active:cursor-grabbing touch-none select-none flex items-center justify-center"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <canvas
              ref={canvasRef}
              style={{ width: `${VIEWPORT_SIZE}px`, height: `${VIEWPORT_SIZE}px` }}
              className="block pointer-events-none"
            />

            {!imageLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Image01Icon size={32} className="animate-pulse" />
                <span className="text-xs">Loading image...</span>
              </div>
            )}
          </div>

          {/* Zoom and Transform Controls */}
          <div className="w-full max-w-[320px] mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.2, 1))}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-secondary/50 text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer shrink-0"
                title="Zoom out"
              >
                <ZoomOutAreaIcon size={16} />
              </button>

              <Slider
                value={[zoom]}
                min={1}
                max={3.5}
                step={0.05}
                onValueChange={(val) => {
                  const first = val[0];
                  if (typeof first === "number") setZoom(first);
                }}
                className="flex-1 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.2, 3.5))}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-secondary/50 text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer shrink-0"
                title="Zoom in"
              >
                <ZoomInAreaIcon size={16} />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span className="font-semibold text-foreground/80">Zoom: {Math.round(zoom * 100)}%</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRotate}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer"
                  title="Rotate 90 degrees"
                >
                  <Rotate01Icon size={13} />
                  <span>Rotate</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer"
                  title="Reset position and zoom"
                >
                  <RefreshIcon size={13} />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Dialog Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border/80 bg-background/50 p-4 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer"
          >
            <Cancel01Icon size={14} />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            onClick={handleApplyCrop}
            disabled={!imageLoaded}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-xs font-bold text-amber-950 shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <CheckmarkCircle02Icon size={16} />
            <span>Apply Photo</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
