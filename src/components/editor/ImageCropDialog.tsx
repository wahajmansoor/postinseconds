import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  CropIcon,
  RotateRight01Icon as RotateIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  CheckmarkCircle02Icon,
  ReloadIcon,
  CenterFocusIcon,
  Add01Icon,
  MinusSignIcon,
} from "hugeicons-react";
import { Chip, Range, useHoldRepeat } from "./ui";

interface ImageCropDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
}

type AspectRatioPreset = "free" | "1:1" | "4:5" | "9:16" | "16:9" | "circle";

export function ImageCropDialog({
  open,
  onClose,
  imageSrc,
  onCropComplete,
}: ImageCropDialogProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>("free");
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Press-and-hold repeat for the Zoom -/+ buttons — see useHoldRepeat's
  // own comment in ui.tsx.
  const zoomDecHold = useHoldRepeat(() => setZoom((z) => Math.max(30, z - 10)));
  const zoomIncHold = useHoldRepeat(() => setZoom((z) => Math.min(400, z + 10)));

  // Reset controls when opened with a new image
  useEffect(() => {
    if (open) {
      setZoom(100);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setPan({ x: 0, y: 0 });
      setAspectRatio("free");
      setIsProcessing(false);
    }
  }, [open, imageSrc]);

  // Compute crop box dimensions based on aspect ratio
  const getCropBoxDimensions = useCallback(() => {
    switch (aspectRatio) {
      case "1:1":
        return { width: 250, height: 250, borderRadius: 12 };
      case "circle":
        return { width: 250, height: 250, borderRadius: 999 };
      case "4:5":
        return { width: 220, height: 275, borderRadius: 12 };
      case "9:16":
        return { width: 170, height: 302, borderRadius: 12 };
      case "16:9":
        return { width: 320, height: 180, borderRadius: 12 };
      case "free":
      default:
        return { width: 300, height: 240, borderRadius: 12 };
    }
  }, [aspectRatio]);

  const cropDims = getCropBoxDimensions();

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: Math.round(dragStartRef.current.panX + dx),
      y: Math.round(dragStartRef.current.panY + dy),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Mouse wheel zoom support
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 8 : -8;
    setZoom((z) => Math.min(400, Math.max(30, z + delta)));
  };

  const normalizedSrc = useMemo(() => {
    if (!imageSrc) return "";
    const trimmed = imageSrc.trim();
    if (trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"))) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
    }
    return imageSrc;
  }, [imageSrc]);

  // Center image inside the crop window
  const centerImage = () => {
    setPan({ x: 0, y: 0 });
  };

  const handleApply = async () => {
    const img = imgRef.current;
    if (!img) return;

    setIsProcessing(true);

    try {
      const naturalImg = new Image();
      naturalImg.crossOrigin = "anonymous";
      naturalImg.src = normalizedSrc;
      await new Promise<void>((resolve, reject) => {
        if (naturalImg.complete) {
          resolve();
        } else {
          naturalImg.onload = () => resolve();
          naturalImg.onerror = (err) => reject(err);
        }
      });

      const cropBox = document.getElementById("crop-viewport-box");
      if (!cropBox) return;

      const cropRect = cropBox.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();

      // Output high-resolution crisp result (2x target)
      const exportScale = 2;
      const targetW = Math.max(1, Math.round(cropRect.width * exportScale));
      const targetH = Math.max(1, Math.round(cropRect.height * exportScale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Circle mask if circle preset
        if (aspectRatio === "circle") {
          ctx.beginPath();
          ctx.arc(targetW / 2, targetH / 2, Math.min(targetW, targetH) / 2, 0, Math.PI * 2);
          ctx.clip();
        }

        // Exact screen-to-canvas ratio
        const scaleFactor = exportScale;
        const cropCenterX = cropRect.left + cropRect.width / 2;
        const cropCenterY = cropRect.top + cropRect.height / 2;
        const imgCenterX = imgRect.left + imgRect.width / 2;
        const imgCenterY = imgRect.top + imgRect.height / 2;

        const offsetX = (imgCenterX - cropCenterX) * scaleFactor;
        const offsetY = (imgCenterY - cropCenterY) * scaleFactor;
        const drawnWidth = imgRect.width * scaleFactor;
        const drawnHeight = imgRect.height * scaleFactor;

        ctx.save();
        ctx.translate(targetW / 2 + offsetX, targetH / 2 + offsetY);
        if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(
          naturalImg,
          -drawnWidth / 2,
          -drawnHeight / 2,
          drawnWidth,
          drawnHeight
        );
        ctx.restore();

        const croppedUrl = canvas.toDataURL("image/png", 0.95);
        onCropComplete(croppedUrl);
        onClose();
      }
    } catch (err) {
      console.error("Failed to crop image:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      // Prevent outside clicks from closing the modal
      if (!v && !isDraggingRef.current) {
        // Only allow close from explicit cancel or close button
      }
    }}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-[580px] rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary shadow-md">
              <CropIcon size={18} />
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Crop & Adjust Image</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Drag image to position, scroll mouse wheel to zoom, or select an aspect ratio.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Aspect Ratio Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-foreground">Aspect Ratio</span>
              <button
                type="button"
                onClick={centerImage}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <CenterFocusIcon size={12} />
                <span>Center Image</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "free", label: "Free" },
                { id: "1:1", label: "1:1 Square" },
                { id: "circle", label: "Circle" },
                { id: "4:5", label: "4:5 Portrait" },
                { id: "9:16", label: "9:16 Story" },
                { id: "16:9", label: "16:9 Wide" },
              ].map((p) => (
                <Chip
                  key={p.id}
                  active={aspectRatio === p.id}
                  onClick={() => setAspectRatio(p.id as AspectRatioPreset)}
                  className="text-xs"
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Interactive Crop Stage with Checkerboard */}
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
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
              touchAction: "none",
            }}
            className="relative flex h-84 w-full cursor-grab items-center justify-center overflow-hidden rounded-2xl border border-border active:cursor-grabbing select-none"
          >
            {/* Displayed Image with Zoom and Pan */}
            <div
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom / 100}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
              className="pointer-events-none flex items-center justify-center"
            >
              <img
                ref={imgRef}
                src={normalizedSrc}
                alt="To crop"
                draggable={false}
                style={{
                  minWidth: 100,
                  minHeight: 100,
                }}
                className="max-h-72 max-w-full object-contain select-none shadow-2xl ring-1 ring-white/20 rounded-sm"
              />
            </div>

            {/* Target Crop Box (Clear Aperture with Outer Dimmer & Grid) */}
            <div
              id="crop-viewport-box"
              style={{
                width: `${cropDims.width}px`,
                height: `${cropDims.height}px`,
                borderRadius: `${cropDims.borderRadius}px`,
              }}
              className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.68)]"
            >
              {/* Corner Indicators */}
              <div className="absolute -left-1 -top-1 h-3 w-3 border-l-2 border-t-2 border-white" />
              <div className="absolute -right-1 -top-1 h-3 w-3 border-r-2 border-t-2 border-white" />
              <div className="absolute -left-1 -bottom-1 h-3 w-3 border-l-2 border-b-2 border-white" />
              <div className="absolute -right-1 -bottom-1 h-3 w-3 border-r-2 border-b-2 border-white" />

              {/* Rule of Thirds Grid Lines */}
              {aspectRatio !== "circle" && (
                <>
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/40 shadow-sm" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/40 shadow-sm" />
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/40 shadow-sm" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/40 shadow-sm" />
                </>
              )}
            </div>

            {/* Hint Chip */}
            <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/85 px-3.5 py-1 text-[10px] font-semibold text-white/90 shadow-lg backdrop-blur-md">
              Drag image · Scroll to zoom
            </div>
          </div>

          {/* Zoom Slider & Adjustments */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-3">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-foreground">Zoom</span>
                <span className="font-mono text-muted-foreground">{zoom}%</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  {...zoomDecHold}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MinusSignIcon size={14} />
                </button>
                <div className="flex-1">
                  <Range
                    value={zoom}
                    min={30}
                    max={400}
                    showInput={false}
                    onChange={setZoom}
                  />
                </div>
                <button
                  type="button"
                  {...zoomIncHold}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Add01Icon size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <Chip
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="h-8 w-8 p-0 flex items-center justify-center"
                title="Rotate 90°"
              >
                <RotateIcon size={14} />
              </Chip>
              <Chip
                onClick={() => setFlipH((f) => !f)}
                active={flipH}
                className="h-8 w-8 p-0 flex items-center justify-center"
                title="Flip Horizontal"
              >
                <FlipHorizontalIcon size={14} />
              </Chip>
              <Chip
                onClick={() => setFlipV((f) => !f)}
                active={flipV}
                className="h-8 w-8 p-0 flex items-center justify-center"
                title="Flip Vertical"
              >
                <FlipVerticalIcon size={14} />
              </Chip>
              <Chip
                onClick={() => {
                  setZoom(100);
                  setPan({ x: 0, y: 0 });
                  setRotation(0);
                  setFlipH(false);
                  setFlipV(false);
                }}
                className="h-8 w-8 p-0 flex items-center justify-center text-muted-foreground"
                title="Reset adjustments"
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
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <CheckmarkCircle02Icon size={14} />
            <span>{isProcessing ? "Cropping..." : "Apply Crop"}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
