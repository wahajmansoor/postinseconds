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
import { cn } from "@/lib/utils";

interface ImageCropDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
}

type AspectRatioPreset = "free" | "1:1" | "4:5" | "9:16" | "16:9" | "circle";

// Base (unscaled) size + corner rounding per aspect-ratio preset. These are
// only the STARTING point for the crop box now — computeDefaultCropBox
// below scales them to fit whatever the stage actually measures, and the
// user can then drag the box's own handles to resize it freely from there
// (see cropBox state / handleResizePointerMove).
const PRESET_DIMENSIONS: Record<AspectRatioPreset, { width: number; height: number; borderRadius: number }> = {
  "1:1": { width: 250, height: 250, borderRadius: 12 },
  circle: { width: 250, height: 250, borderRadius: 999 },
  "4:5": { width: 220, height: 275, borderRadius: 12 },
  "9:16": { width: 170, height: 302, borderRadius: 12 },
  "16:9": { width: 320, height: 180, borderRadius: 12 },
  free: { width: 300, height: 240, borderRadius: 12 },
};

// Corner/edge drag handles for resizing the crop box, matching a "normal"
// crop tool: drag a corner, the opposite corner stays anchored in place.
// Edge (n/s/e/w) handles only make sense when the box's aspect ratio isn't
// locked to a preset, so they're only rendered for "free" — with a locked
// ratio, only the 4 corners are offered and they scale both dimensions
// together to preserve the ratio.
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const CORNER_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];
const EDGE_HANDLES: ResizeHandle[] = ["n", "s", "e", "w"];
const MIN_CROP_BOX = 60;
const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  n: "cursor-ns-resize",
  s: "cursor-ns-resize",
  e: "cursor-ew-resize",
  w: "cursor-ew-resize",
  ne: "cursor-nesw-resize",
  sw: "cursor-nesw-resize",
  nw: "cursor-nwse-resize",
  se: "cursor-nwse-resize",
};

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
}

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
  // The crop viewport itself — now a real, draggable-handle-resizable box
  // (x/y/width/height in px, relative to the stage's own top-left) instead
  // of a fixed size purely dictated by the aspect-ratio preset.
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, width: 300, height: 240, borderRadius: 12 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  // Active corner/edge resize drag, if any — captured at pointerdown on a
  // handle and read by the shared pointermove/up handlers below.
  const resizeStateRef = useRef<{ handle: ResizeHandle; startX: number; startY: number; box: CropBox } | null>(null);

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

  // Builds a fresh default crop box that wraps the ACTUAL rendered image —
  // not just centered somewhere in the (usually much bigger) stage. For
  // "Free" that means the box starts flush with the image's own edges; for
  // a locked ratio it fits the largest box of that ratio that stays inside
  // the image, centered on it. Reads imgRef/containerRef directly rather
  // than taking a size argument, since it needs the image's own rect (in
  // the stage's local coordinate space), not just the stage's.
  const computeDefaultCropBox = useCallback((preset: AspectRatioPreset): CropBox => {
    const base = PRESET_DIMENSIONS[preset];
    const stageRect = containerRef.current?.getBoundingClientRect();
    const imgRect = imgRef.current?.getBoundingClientRect();

    if (stageRect && imgRect && imgRect.width > 0 && imgRect.height > 0) {
      const img = {
        x: imgRect.left - stageRect.left,
        y: imgRect.top - stageRect.top,
        width: imgRect.width,
        height: imgRect.height,
      };
      if (preset === "free") {
        return { x: img.x, y: img.y, width: img.width, height: img.height, borderRadius: base.borderRadius };
      }
      const ratio = base.width / base.height;
      let width = img.width;
      let height = width / ratio;
      if (height > img.height) {
        height = img.height;
        width = height * ratio;
      }
      return {
        x: img.x + (img.width - width) / 2,
        y: img.y + (img.height - height) / 2,
        width,
        height,
        borderRadius: base.borderRadius,
      };
    }

    // Fallback for the rare case this runs before the image has laid out
    // (e.g. an aspect-ratio chip clicked at an unlucky instant) — center a
    // scaled-to-fit box in the stage instead of wrapping nothing.
    const stageW = stageRect?.width ?? 320;
    const stageH = stageRect?.height ?? 336;
    const maxW = Math.max(MIN_CROP_BOX, stageW - 16);
    const maxH = Math.max(MIN_CROP_BOX, stageH - 16);
    const scale = Math.min(1, maxW / base.width, maxH / base.height);
    const width = Math.round(base.width * scale);
    const height = Math.round(base.height * scale);
    return {
      x: Math.round((stageW - width) / 2),
      y: Math.round((stageH - height) / 2),
      width,
      height,
      borderRadius: base.borderRadius,
    };
  }, []);

  // Fits a fresh default crop box the instant the image finishes loading —
  // NOT on a stage ResizeObserver like before, since the stage div itself
  // lays out well before the <img> inside it has decoded and settled into
  // its own natural-aspect-ratio size; measuring too early wrapped nothing
  // meaningful (or the stale placeholder size), which is what put the box
  // noticeably off from the actual photo.
  //
  // That fixed the "stage isn't laid out yet" race, but left a second one:
  // this Dialog opens with a `zoom-in-95`/`duration-200` CSS animation (see
  // dialog.tsx) that SCALES the whole panel in via `transform` for ~200ms.
  // A transform doesn't touch layout, but it does change what
  // getBoundingClientRect() reports for every descendant while it's
  // running — and for an already-decoded image (a data URL, or anything
  // cached), onLoad can fire well inside that 200ms window. computeDefault-
  // CropBox's rect-based math then measures a mid-animation (smaller) size,
  // so the box comes out undersized/offset from the image's real, settled
  // position — which is exactly what made the crop then come out more
  // "zoomed in" than the selection visually showed, since the actual crop
  // is computed relative to that same (wrong) box. Re-measuring again once
  // the animation has had time to finish fixes it up; skipped if the user
  // has already started actively resizing the box or dragging the image in
  // the meantime.
  const openRef = useRef(open);
  openRef.current = open;
  const pendingRefitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleImageLoaded = useCallback(() => {
    setCropBox(computeDefaultCropBox(aspectRatio));
    if (pendingRefitRef.current) clearTimeout(pendingRefitRef.current);
    pendingRefitRef.current = setTimeout(() => {
      pendingRefitRef.current = null;
      if (!openRef.current || resizeStateRef.current || isDraggingRef.current) return;
      setCropBox(computeDefaultCropBox(aspectRatio));
    }, 260);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeDefaultCropBox]);

  // Don't let a stale re-fit from a previous open land after the dialog has
  // since closed (e.g. a very quick open/close/reopen with a new image).
  useEffect(() => {
    if (open) return;
    if (pendingRefitRef.current) {
      clearTimeout(pendingRefitRef.current);
      pendingRefitRef.current = null;
    }
  }, [open]);

  // Re-fits the box whenever the user picks a different aspect-ratio preset
  // — by then the image has necessarily already loaded (they're looking at
  // it), so this can read its rect directly instead of waiting on onLoad.
  // Skipped on the very first render (aspectRatio's initial "free") so it
  // doesn't race handleImageLoaded for the very same job on open.
  const isFirstAspectRender = useRef(true);
  useEffect(() => {
    if (isFirstAspectRender.current) {
      isFirstAspectRender.current = false;
      return;
    }
    if (!open) return;
    setCropBox(computeDefaultCropBox(aspectRatio));
  }, [aspectRatio, open, computeDefaultCropBox]);

  const handleResizePointerDown = useCallback(
    (handle: ResizeHandle) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      resizeStateRef.current = { handle, startX: e.clientX, startY: e.clientY, box: cropBox };
    },
    [cropBox],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rs = resizeStateRef.current;
      if (!rs) return;
      e.stopPropagation();
      const dx = e.clientX - rs.startX;
      const dy = e.clientY - rs.startY;
      const { x: x0, y: y0, width: w0, height: h0 } = rs.box;
      const locked = aspectRatio !== "free";
      const ratio = w0 / h0;

      let x = x0;
      let y = y0;
      let width = w0;
      let height = h0;

      if (rs.handle.length === 2) {
        // Corner handle — the OPPOSITE corner stays anchored in place,
        // matching a normal crop tool rather than resizing around center.
        const growX = rs.handle.includes("e") ? 1 : -1;
        const growY = rs.handle.includes("s") ? 1 : -1;
        let newWidth = w0 + growX * dx;
        let newHeight = h0 + growY * dy;
        if (locked) {
          // Whichever axis the pointer moved more decisively drives the
          // resize; the other dimension is derived to keep the ratio.
          if (Math.abs(dx) >= Math.abs(dy)) {
            newHeight = newWidth / ratio;
          } else {
            newWidth = newHeight * ratio;
          }
        }
        newWidth = Math.max(MIN_CROP_BOX, newWidth);
        newHeight = Math.max(MIN_CROP_BOX, newHeight);
        const anchorX = growX > 0 ? x0 : x0 + w0;
        const anchorY = growY > 0 ? y0 : y0 + h0;
        x = growX > 0 ? anchorX : anchorX - newWidth;
        y = growY > 0 ? anchorY : anchorY - newHeight;
        width = newWidth;
        height = newHeight;
      } else {
        // Edge handle — only reachable when aspectRatio is "free" (see the
        // render below), so no ratio-lock branch needed here.
        switch (rs.handle) {
          case "e":
            width = Math.max(MIN_CROP_BOX, w0 + dx);
            break;
          case "w": {
            const nw = Math.max(MIN_CROP_BOX, w0 - dx);
            x = x0 + (w0 - nw);
            width = nw;
            break;
          }
          case "s":
            height = Math.max(MIN_CROP_BOX, h0 + dy);
            break;
          case "n": {
            const nh = Math.max(MIN_CROP_BOX, h0 - dy);
            y = y0 + (h0 - nh);
            height = nh;
            break;
          }
        }
      }

      // Clamp to the stage's own bounds so a handle can't be dragged into
      // dead space outside the visible crop stage.
      const stage = containerRef.current?.getBoundingClientRect();
      if (stage) {
        width = Math.min(width, stage.width);
        height = Math.min(height, stage.height);
        x = Math.max(0, Math.min(x, stage.width - width));
        y = Math.max(0, Math.min(y, stage.height - height));
      }

      setCropBox({ x, y, width, height, borderRadius: rs.box.borderRadius });
    },
    [aspectRatio],
  );

  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    resizeStateRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

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
    const container = containerRef.current;
    if (!img || !container) return;

    setIsProcessing(true);

    try {
      const naturalImg = new Image();
      naturalImg.crossOrigin = "anonymous";
      naturalImg.src = normalizedSrc;
      await new Promise<void>((resolve, reject) => {
        if (naturalImg.complete && naturalImg.naturalWidth > 0) {
          resolve();
        } else {
          naturalImg.onload = () => resolve();
          naturalImg.onerror = (err) => reject(err);
        }
      });

      // The old version measured getBoundingClientRect() of both the crop
      // box and the <img> and treated their on-screen size/position as the
      // whole story. Two things made that wrong:
      //  1. getBoundingClientRect() on a ROTATED element returns the
      //     rotated axis-aligned bounding box (bigger, and a different shape,
      //     than the image itself for any non-0/180° rotation) — then the
      //     code rotated it AGAIN in canvas, a double rotation that produced
      //     a wrong crop the moment Rotate was used.
      //  2. The export size was capped at 2x whatever the on-screen preview
      //     happened to render at (often only a few hundred px), throwing
      //     away most of a real photo's actual resolution regardless of
      //     rotation — the visible "low quality" result even with no
      //     rotation at all.
      // Fix: rebuild the exact same translate→rotate→scale pipeline the CSS
      // preview uses (see the transform on the wrapping div below), but at
      // full native-image resolution and re-centered so the crop box lands
      // at canvas (0,0) — i.e. render into a canvas sized to the crop box,
      // not the whole stage, so no separate "crop" step is even needed.

      // offsetWidth/Height read the <img>'s own LAYOUT box, which CSS
      // transforms on it (or its ancestors) never affect — unlike
      // getBoundingClientRect, this stays the untransformed "zoom 100%,
      // rotation 0" size no matter what rotation/zoom is currently applied.
      const baseW = img.offsetWidth;
      const baseH = img.offsetHeight;
      if (!baseW || !baseH || !naturalImg.naturalWidth || !naturalImg.naturalHeight) return;

      // Natural pixels per on-screen (unzoomed) CSS pixel — rendering at
      // this density means the export uses the source image's real
      // resolution instead of whatever small size the preview happened to
      // be drawn at. Floored at 2x so a source smaller than its display box
      // (rare, but possible for tiny uploads) still gets an oversampled,
      // crisp result rather than a native-but-tiny one.
      let density = Math.max(naturalImg.naturalWidth / baseW, 2);

      // Cap the final crop's longest edge so an extreme zoom-in on a very
      // high-res source can't blow up into an unreasonably large canvas.
      const MAX_OUTPUT_EDGE = 2400;
      const rawEdge = Math.max(cropBox.width, cropBox.height) * density;
      if (rawEdge > MAX_OUTPUT_EDGE) density *= MAX_OUTPUT_EDGE / rawEdge;

      const targetW = Math.max(1, Math.round(cropBox.width * density));
      const targetH = Math.max(1, Math.round(cropBox.height * density));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Circle mask if circle preset
      if (aspectRatio === "circle") {
        ctx.beginPath();
        ctx.arc(targetW / 2, targetH / 2, Math.min(targetW, targetH) / 2, 0, Math.PI * 2);
        ctx.clip();
      }

      // The stage centers the image via flex + transform-origin center, so
      // the image's own (pre-rotation) center is the container's center
      // shifted by `pan`. The crop box's coordinates are already relative to
      // the same container (see computeDefaultCropBox), so subtracting its
      // origin re-centers everything onto this canvas instead of the whole
      // stage.
      const containerRect = container.getBoundingClientRect();
      const centerX = (containerRect.width / 2 + pan.x) * density - cropBox.x * density;
      const centerY = (containerRect.height / 2 + pan.y) * density - cropBox.y * density;
      const drawnWidth = naturalImg.naturalWidth * (zoom / 100);
      const drawnHeight = naturalImg.naturalHeight * (zoom / 100);

      ctx.save();
      ctx.translate(centerX, centerY);
      if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(naturalImg, -drawnWidth / 2, -drawnHeight / 2, drawnWidth, drawnHeight);
      ctx.restore();

      const croppedUrl = canvas.toDataURL("image/png", 0.95);
      onCropComplete(croppedUrl);
      onClose();
    } catch (err) {
      console.error("Failed to crop image:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isDraggingRef.current) {
          onClose();
        }
      }}
    >
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-[580px] rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl"
      >
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary shadow-md">
              <CropIcon size={18} />
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Crop & Adjust Image</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Drag image to position, drag the crop box to resize it, scroll mouse wheel to zoom, or select an aspect ratio.
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
                onLoad={handleImageLoaded}
                style={{
                  minWidth: 100,
                  minHeight: 100,
                }}
                className="max-h-72 max-w-full object-contain select-none shadow-2xl ring-1 ring-white/20 rounded-sm"
              />
            </div>

            {/* Target Crop Box (Clear Aperture with Outer Dimmer & Grid) —
                position/size now come from cropBox state, live-driven by the
                corner/edge handles below, rather than a fixed size purely
                dictated by the aspect-ratio preset. handleApply reads this
                element's own getBoundingClientRect() at export time, so it
                needs no changes to pick up a resized box. */}
            <div
              id="crop-viewport-box"
              style={{
                left: `${cropBox.x}px`,
                top: `${cropBox.y}px`,
                width: `${cropBox.width}px`,
                height: `${cropBox.height}px`,
                borderRadius: `${cropBox.borderRadius}px`,
              }}
              className="pointer-events-none absolute border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.68)]"
            >
              {/* Rule of Thirds Grid Lines */}
              {aspectRatio !== "circle" && (
                <>
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/40 shadow-sm" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/40 shadow-sm" />
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/40 shadow-sm" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/40 shadow-sm" />
                </>
              )}

              {/* Corner resize handles — drag a corner and the opposite one
                  stays anchored, like a normal crop tool. Each has a bigger
                  invisible hit area than its visible glyph so it's easy to
                  grab on touch. Locked-ratio presets (anything but "free")
                  scale both dimensions together from any corner. */}
              {CORNER_HANDLES.map((h) => (
                <div
                  key={h}
                  onPointerDown={handleResizePointerDown(h)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                  onPointerCancel={handleResizePointerUp}
                  style={{ touchAction: "none" }}
                  className={cn(
                    "pointer-events-auto absolute z-10 h-6 w-6",
                    HANDLE_CURSOR[h],
                    h === "nw" && "-left-3 -top-3",
                    h === "ne" && "-right-3 -top-3",
                    h === "sw" && "-left-3 -bottom-3",
                    h === "se" && "-right-3 -bottom-3",
                  )}
                >
                  <div
                    className={cn(
                      "absolute h-3 w-3 border-white",
                      h === "nw" && "left-1.5 top-1.5 border-l-2 border-t-2",
                      h === "ne" && "right-1.5 top-1.5 border-r-2 border-t-2",
                      h === "sw" && "left-1.5 bottom-1.5 border-l-2 border-b-2",
                      h === "se" && "right-1.5 bottom-1.5 border-r-2 border-b-2",
                    )}
                  />
                </div>
              ))}

              {/* Edge resize handles — only meaningful once the box isn't
                  locked to a fixed ratio, otherwise a single-axis drag would
                  have to fight the ratio lock. */}
              {aspectRatio === "free" &&
                EDGE_HANDLES.map((h) => {
                  const horizontal = h === "n" || h === "s";
                  return (
                    <div
                      key={h}
                      onPointerDown={handleResizePointerDown(h)}
                      onPointerMove={handleResizePointerMove}
                      onPointerUp={handleResizePointerUp}
                      onPointerCancel={handleResizePointerUp}
                      style={{ touchAction: "none" }}
                      className={cn(
                        "pointer-events-auto absolute z-10 flex items-center justify-center",
                        HANDLE_CURSOR[h],
                        horizontal ? "left-1/2 h-4 w-10 -translate-x-1/2" : "top-1/2 h-10 w-4 -translate-y-1/2",
                        h === "n" && "-top-2",
                        h === "s" && "-bottom-2",
                        h === "e" && "-right-2",
                        h === "w" && "-left-2",
                      )}
                    >
                      <div className={cn("rounded-full bg-white/90 shadow-sm", horizontal ? "h-1.5 w-6" : "h-6 w-1.5")} />
                    </div>
                  );
                })}
            </div>

            {/* Hint Chip */}
            <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-black/85 px-3.5 py-1 text-[10px] font-semibold text-white/90 shadow-lg backdrop-blur-md">
              Drag image or resize crop box · Scroll to zoom
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
