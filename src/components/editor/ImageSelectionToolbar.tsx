import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CropIcon,
  Eraser01Icon,
  EyeIcon,
  LayerBringForwardIcon,
  LayerBringToFrontIcon,
  Layers01Icon,
  LayerSendBackwardIcon,
  LayerSendToBackIcon,
  Link03Icon,
  Upload01Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import { compressImageFile } from "@/lib/imageCompression";
import type { ImageLayer } from "./types";
import {
  Chip,
  ColorPickerContent,
  DragHandle,
  Field,
  FloatingDropdown,
  FloatingToolbarPortal,
  Range,
  Toggle,
  MinimizedToolbarButton,
  MinimizeToolbarButton,
  ToolbarDragGrip,
  UnitInput,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";
import { ImageCropDialog } from "./ImageCropDialog";
import { EraseImageDialog } from "./EraseImageDialog";

interface ImageSelectionToolbarProps {
  layer: ImageLayer;
  onUpdate: (patch: Partial<Omit<ImageLayer, "id">>) => void;
  onArrange?: (direction: "forward" | "backward" | "front" | "back") => void;
  canArrange?: { canForward: boolean; canBackward: boolean; canFront: boolean; canBack: boolean };
  onOpenCrop?: () => void;
  // Same reasoning as onOpenCrop above: when provided, index.tsx renders
  // EraseImageDialog itself, driven by its own top-level state, instead of
  // this toolbar's local eraseOpen. That's not optional in practice — this
  // toolbar (and the layer selection driving it) can unmount/remount as
  // the user interacts with the canvas while an editing dialog is open,
  // which would reset local state and slam the dialog shut moments after
  // opening it. Lifting it to a parent that outlives that churn is what
  // ImageCropDialog already does via onOpenCrop; onOpenErase mirrors it.
  onOpenErase?: () => void;
  // See the matching props' comments in TextSelectionToolbar.tsx.
  detached?: boolean;
  onAnyPopoverOpenChange?: (open: boolean) => void;
  // See the matching props' comment in ShapeSelectionToolbar.tsx.
  canvasWidth?: number | undefined;
  canvasHeight?: number | undefined;
}

export function ImageSelectionToolbar({
  layer,
  onUpdate,
  onArrange,
  canArrange,
  onOpenCrop,
  onOpenErase,
  detached = false,
  onAnyPopoverOpenChange,
  canvasWidth = 1080,
  canvasHeight = 1350,
}: ImageSelectionToolbarProps) {
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Ephemeral, not persisted — see the matching state's comment in
  // ShapeSelectionToolbar.tsx.
  const [ratioLocked, setRatioLocked] = useState(false);

  // Each dropdown opens unpinned by default — see DragHandle's own comment
  // on `onTogglePin` for what that means.
  const [radiusPinned, setRadiusPinned] = useState(false);
  const [opacityPinned, setOpacityPinned] = useState(false);
  const [shadowPinned, setShadowPinned] = useState(false);
  const [arrangePinned, setArrangePinned] = useState(false);
  const [advancedPinned, setAdvancedPinned] = useState(false);

  // Every popover below can be dragged to wherever the user wants — see
  // useDraggableOffset's own comment in ui.tsx for why the offset applies
  // to an inner wrapper rather than PopoverContent itself.
  // The toolbar row's own drag offset — see ToolbarDragGrip's own comment
  // in ui.tsx.
  const toolbarDrag = useDraggableOffset("image-toolbar");
  const [minimized, setMinimized] = useState(false);
  // See minimizeBaseRef's own comment in ShapeSelectionToolbar.tsx.
  const minimizeBaseRef = useRef({ top: 0, left: 0 });
  const radiusDrag = useDraggableOffset();
  const opacityDrag = useDraggableOffset();
  const shadowDrag = useDraggableOffset();
  const arrangeDrag = useDraggableOffset();
  const advancedDrag = useDraggableOffset();

  const radiusTriggerRef = useRef<HTMLButtonElement>(null);
  const opacityTriggerRef = useRef<HTMLButtonElement>(null);
  const shadowTriggerRef = useRef<HTMLButtonElement>(null);
  const arrangeTriggerRef = useRef<HTMLButtonElement>(null);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);
  const radiusAnchor = useStableAnchor(radiusOpen, radiusTriggerRef);
  const opacityAnchor = useStableAnchor(opacityOpen, opacityTriggerRef);
  const shadowAnchor = useStableAnchor(shadowOpen, shadowTriggerRef);
  const arrangeAnchor = useStableAnchor(arrangeOpen, arrangeTriggerRef);
  const advancedAnchor = useStableAnchor(advancedOpen, advancedTriggerRef);

  // Each popover blocks Radix's own click/focus-outside auto-dismiss (see
  // onPointerDownOutside/onInteractOutside below) — a fast drag was tripping
  // it mid-move — so the only paths that close one now are the trigger's
  // own toggle and the drag handle's X button (both just flip the local
  // open state directly). The drag offset resets on the OPEN edge, not the
  // close edge — resetting on close would snap the panel back to its
  // anchor position in the same instant the close animation starts, making
  // it visibly jump before it fades out instead of disappearing from
  // wherever the user actually left it.

  // See the matching block's comment in TextSelectionToolbar.tsx.
  const anyPopoverOpen = radiusOpen || opacityOpen || shadowOpen || arrangeOpen || advancedOpen;
  useEffect(() => {
    onAnyPopoverOpenChange?.(anyPopoverOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPopoverOpen]);

  const rowRef = useRef<HTMLDivElement>(null);
  const lastLiveRectRef = useRef<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!detached && rowRef.current) {
      const r = rowRef.current.getBoundingClientRect();
      lastLiveRectRef.current = { top: r.top, left: r.left };
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Downscaled + re-encoded before ever becoming a data URL — see
    // imageCompression.ts's own comment for why this matters (every image
    // in this app is embedded as base64, not uploaded to object storage).
    compressImageFile(file).then((dataUrl) => {
      if (dataUrl) onUpdate({ src: dataUrl });
    });
    e.target.value = "";
  };

  const btnClass =
    "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors hover:bg-secondary";

  // Advanced panel — see the matching block's comment in
  // ShapeSelectionToolbar.tsx for the X/Y <-> canvas-% conversion.
  const advWidth = layer.size;
  const advHeight = layer.height ?? layer.size;
  const advX = (layer.x / 100) * canvasWidth - advWidth / 2;
  const advY = (layer.y / 100) * canvasHeight - advHeight / 2;
  const advRotation = layer.rotation ?? 0;
  const setAdvWidth = (v: number) => {
    const nextWidth = Math.max(1, v);
    if (ratioLocked && advWidth > 0) {
      onUpdate({ size: nextWidth, height: Math.max(1, Math.round((nextWidth * (advHeight / advWidth)) * 10) / 10) });
    } else {
      onUpdate({ size: nextWidth });
    }
  };
  const setAdvHeight = (v: number) => {
    const nextHeight = Math.max(1, v);
    if (ratioLocked && advHeight > 0) {
      onUpdate({ size: Math.max(1, Math.round((nextHeight * (advWidth / advHeight)) * 10) / 10), height: nextHeight });
    } else {
      onUpdate({ height: nextHeight });
    }
  };
  const setAdvX = (v: number) => {
    if (canvasWidth <= 0) return;
    onUpdate({ x: ((v + advWidth / 2) / canvasWidth) * 100 });
  };
  const setAdvY = (v: number) => {
    if (canvasHeight <= 0) return;
    onUpdate({ y: ((v + advHeight / 2) / canvasHeight) * 100 });
  };

  // Collapsed form — see MinimizedToolbarButton's own comment in ui.tsx.
  if (minimized && !detached) {
    return (
      <MinimizedToolbarButton
        baseTop={minimizeBaseRef.current.top}
        baseLeft={minimizeBaseRef.current.left}
        offset={toolbarDrag.offset}
        dragHandleProps={toolbarDrag.dragHandleProps}
        onClick={() => {
          // A real drag ending here should NOT also re-expand — see
          // hasMoved()'s own comment in useDraggableOffset.
          if (toolbarDrag.hasMoved()) return;
          toolbarDrag.reset();
          setMinimized(false);
        }}
      />
    );
  }

  const TOOLBAR_CLASS =
    "flex flex-nowrap items-center gap-1.5 whitespace-nowrap md:rounded-full md:border md:border-border/80 md:bg-background/95 md:p-1.5 md:shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)] md:dark:shadow-[inset_0_1.5px_0_0_rgba(255,255,255,0.15),inset_0_-2.5px_0_0_rgba(0,0,0,0.6),0_12px_40px_rgba(0,0,0,0.45),0_2px_4px_rgba(0,0,0,0.25)] md:backdrop-blur-xl";

  const rowContent = (
    <>
      {/* Drag grip + minimize both hidden on mobile — see the matching
          comment in ShapeSelectionToolbar.tsx. */}
      {!isMobile ? (
        <>
          <ToolbarDragGrip dragHandleProps={toolbarDrag.dragHandleProps} />
          <MinimizeToolbarButton
            onClick={() => {
              if (rowRef.current) {
                const r = rowRef.current.getBoundingClientRect();
                minimizeBaseRef.current = { top: r.top, left: r.left };
              }
              toolbarDrag.reset();
              setMinimized(true);
            }}
          />
        </>
      ) : null}

      {/* Hidden file input for Replace Image */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 1. Replace Image Button */}
      <AppTooltip content="Replace this image with a new photo">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(btnClass, "border border-border/60 bg-secondary/40 text-foreground")}
        >
          <Upload01Icon size={15} className="text-primary" />
          <span>Replace</span>
        </button>
      </AppTooltip>

      {/* 2. Crop Image Button */}
      <AppTooltip content="Crop, frame, and adjust this image">
        <button
          type="button"
          onClick={() => {
            if (onOpenCrop) {
              onOpenCrop();
            } else {
              setCropOpen(true);
            }
          }}
          className={cn(btnClass, "border border-border/60 bg-secondary/40 text-foreground")}
        >
          <CropIcon size={15} className="text-primary" />
          <span>Crop</span>
        </button>
      </AppTooltip>

      {!onOpenCrop ? (
        <ImageCropDialog
          open={cropOpen}
          onClose={() => setCropOpen(false)}
          imageSrc={layer.src}
          onCropComplete={(croppedDataUrl) => onUpdate({ src: croppedDataUrl })}
        />
      ) : null}

      {/* 2b. Erase Image Button */}
      <AppTooltip content="Brush away part of this image">
        <button
          type="button"
          onClick={() => {
            if (onOpenErase) {
              onOpenErase();
            } else {
              setEraseOpen(true);
            }
          }}
          className={cn(btnClass, "border border-border/60 bg-secondary/40 text-foreground")}
        >
          <Eraser01Icon size={15} className="text-primary" />
          <span>Erase</span>
        </button>
      </AppTooltip>

      {!onOpenErase ? (
        <EraseImageDialog
          open={eraseOpen}
          onClose={() => setEraseOpen(false)}
          imageSrc={layer.src}
          onErased={(erasedDataUrl) => onUpdate({ src: erasedDataUrl })}
        />
      ) : null}

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 2. Corner Radius Popover */}
      <AppTooltip content="Adjust corner radius">
        <button
          ref={radiusTriggerRef}
          type="button"
          onClick={() => {
            setRadiusOpen((wasOpen) => {
              if (!wasOpen) {
                radiusDrag.reset();
                setRadiusPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            btnClass,
            radiusOpen && "bg-secondary text-primary",
            layer.radius > 0 ? "text-primary" : "text-muted-foreground",
          )}
        >
          <span className="text-[11px] font-semibold">
            Radius: {layer.radius === 999 ? "Circle" : `${layer.radius}px`}
          </span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={radiusAnchor}
        offset={radiusDrag.offset}
        align="center"
        pinned={radiusPinned}
        onRequestClose={() => setRadiusOpen(false)}
        triggerRef={radiusTriggerRef}
      >
        <div
          data-nopan=""
          data-keep-text-editing=""
          className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        >
          <DragHandle
            label="Corner Radius"
            {...radiusDrag.dragHandleProps}
            pinned={radiusPinned}
            onTogglePin={() => setRadiusPinned((p) => !p)}
            onClose={() => setRadiusOpen(false)}
          />
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Corner Radius</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {layer.radius === 999 ? "Pill / Circle" : `${layer.radius}px`}
              </span>
            </div>

            <Range
              value={layer.radius}
              min={0}
              max={200}
              onChange={(v) => onUpdate({ radius: v })}
            />

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "0px", val: 0 },
                { label: "8px", val: 8 },
                { label: "16px", val: 16 },
                { label: "24px", val: 24 },
                { label: "40px", val: 40 },
                { label: "Circle", val: 999 },
              ].map((p) => (
                <Chip
                  key={p.label}
                  active={layer.radius === p.val}
                  onClick={() => onUpdate({ radius: p.val })}
                  className="justify-center py-1 text-[11px]"
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 3. Opacity Popover */}
      <AppTooltip content="Adjust layer opacity">
        <button
          ref={opacityTriggerRef}
          type="button"
          onClick={() => {
            setOpacityOpen((wasOpen) => {
              if (!wasOpen) {
                opacityDrag.reset();
                setOpacityPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            btnClass,
            opacityOpen && "bg-secondary text-primary",
            (layer.opacity ?? 100) < 100 && "text-primary",
          )}
        >
          <EyeIcon size={15} />
          <span className="text-xs font-semibold">{layer.opacity ?? 100}%</span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={opacityAnchor}
        offset={opacityDrag.offset}
        align="center"
        pinned={opacityPinned}
        onRequestClose={() => setOpacityOpen(false)}
        triggerRef={opacityTriggerRef}
      >
        <div
          data-nopan=""
          data-keep-text-editing=""
          className="w-56 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        >
          <DragHandle
            label="Opacity"
            {...opacityDrag.dragHandleProps}
            pinned={opacityPinned}
            onTogglePin={() => setOpacityPinned((p) => !p)}
            onClose={() => setOpacityOpen(false)}
          />
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Layer Opacity</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {layer.opacity ?? 100}%
              </span>
            </div>

            <Range
              value={layer.opacity ?? 100}
              min={5}
              max={100}
              onChange={(v) => onUpdate({ opacity: v })}
            />

            <div className="grid grid-cols-4 gap-1">
              {[100, 75, 50, 25].map((op) => (
                <Chip
                  key={op}
                  active={(layer.opacity ?? 100) === op}
                  onClick={() => onUpdate({ opacity: op })}
                  className="justify-center py-1 text-[10px]"
                >
                  {op}%
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </FloatingDropdown>

      {/* 4. Drop Shadow Popover */}
      <AppTooltip content="Drop shadow & depth">
        <button
          ref={shadowTriggerRef}
          type="button"
          onClick={() => {
            setShadowOpen((wasOpen) => {
              if (!wasOpen) {
                shadowDrag.reset();
                setShadowPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            btnClass,
            shadowOpen && "bg-secondary text-primary",
            layer.shadow ? "text-primary font-semibold" : "text-muted-foreground",
          )}
        >
          <Layers01Icon size={14} />
          <span className="text-[11px]">Shadow</span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={shadowAnchor}
        offset={shadowDrag.offset}
        align="center"
        pinned={shadowPinned}
        onRequestClose={() => setShadowOpen(false)}
        triggerRef={shadowTriggerRef}
      >
        <div
          data-nopan=""
          data-keep-text-editing=""
          className="w-[350px] max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl backdrop-blur-md"
        >
          <DragHandle
            label="Drop Shadow"
            {...shadowDrag.dragHandleProps}
            pinned={shadowPinned}
            onTogglePin={() => setShadowPinned((p) => !p)}
            onClose={() => setShadowOpen(false)}
          />
          <div className="space-y-3.5 p-4">
            <Toggle
              checked={layer.shadow}
              onChange={(v) => onUpdate({ shadow: v })}
              label="Drop Shadow"
            />

            {layer.shadow ? (
              <div className="space-y-3 border-t border-border/50 pt-3">
                {/* All Range Sliders on Top with full width */}
                <Field label={`Blur — ${layer.shadowBlur}px`}>
                  <Range
                    value={layer.shadowBlur}
                    min={0}
                    max={100}
                    onChange={(v) => onUpdate({ shadowBlur: v })}
                    showInput={true}
                  />
                </Field>

                <Field label={`Spread — ${layer.shadowSpread ?? 0}px`}>
                  <Range
                    value={layer.shadowSpread ?? 0}
                    min={-20}
                    max={40}
                    onChange={(v) => onUpdate({ shadowSpread: v })}
                    showInput={true}
                  />
                </Field>

                <Field label={`Offset X — ${layer.shadowX ?? 0}px`}>
                  <Range
                    value={layer.shadowX ?? 0}
                    min={-50}
                    max={50}
                    onChange={(v) => onUpdate({ shadowX: v })}
                    showInput={true}
                  />
                </Field>

                <Field label={`Offset Y — ${layer.shadowY ?? 12}px`}>
                  <Range
                    value={layer.shadowY ?? 12}
                    min={-50}
                    max={50}
                    onChange={(v) => onUpdate({ shadowY: v })}
                    showInput={true}
                  />
                </Field>

                <Field label={`Opacity — ${layer.shadowOpacity ?? 35}%`}>
                  <Range
                    value={layer.shadowOpacity ?? 35}
                    min={0}
                    max={100}
                    onChange={(v) => onUpdate({ shadowOpacity: v })}
                    showInput={true}
                  />
                </Field>

                {/* ColorPickerContent directly, not ColorInput/ColorPicker
                    — that export owns a separate Radix Popover that portals
                    its hue/saturation area to <body> as a DOM sibling of
                    this whole dropdown, not a descendant of it.
                    FloatingDropdown's outside-click dismissal is a real
                    Node.contains() check against its own panel, blind to
                    React's component tree, so any click inside that nested
                    portal reads as "outside" and instantly collapses this
                    entire panel — see ShapeSelectionToolbar's matching
                    Shadow Color comment for the full mechanism (same bug,
                    same fix, found and fixed there first). */}
                <div className="space-y-1.5 border-t border-border/40 pt-2.5">
                  <span className="text-xs font-semibold text-muted-foreground">Shadow Color</span>
                  <ColorPickerContent
                    value={layer.shadowColor ?? "#000000"}
                    onChange={(v) => onUpdate({ shadowColor: v })}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 5. Flip Controls */}
      <AppTooltip content="Flip horizontally">
        <button
          type="button"
          onClick={() => onUpdate({ flipH: !layer.flipH })}
          className={cn(btnClass, "px-2", layer.flipH && "bg-secondary text-primary font-bold")}
          title="Flip Horizontal"
        >
          <span className="text-sm font-bold">⇄</span>
        </button>
      </AppTooltip>

      <AppTooltip content="Flip vertically">
        <button
          type="button"
          onClick={() => onUpdate({ flipV: !layer.flipV })}
          className={cn(btnClass, "px-2", layer.flipV && "bg-secondary text-primary font-bold")}
          title="Flip Vertical"
        >
          <span className="text-sm font-bold">⇅</span>
        </button>
      </AppTooltip>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 6. Arrange Layer Stacking Order */}
      {onArrange ? (
        <>
          <AppTooltip content="Arrange layer order">
            <button
              ref={arrangeTriggerRef}
              type="button"
              onClick={() => {
                setArrangeOpen((wasOpen) => {
                  if (!wasOpen) {
                    arrangeDrag.reset();
                    setArrangePinned(false);
                  }
                  return !wasOpen;
                });
              }}
              className={cn(btnClass, arrangeOpen && "bg-secondary text-primary")}
            >
              <LayerBringToFrontIcon size={15} />
              <span className="text-xs">Arrange</span>
            </button>
          </AppTooltip>
          <FloatingDropdown
            anchor={arrangeAnchor}
            offset={arrangeDrag.offset}
            align="center"
            pinned={arrangePinned}
            onRequestClose={() => setArrangeOpen(false)}
            triggerRef={arrangeTriggerRef}
          >
            <div className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
              <DragHandle
                label="Arrange Layer"
                {...arrangeDrag.dragHandleProps}
                pinned={arrangePinned}
                onTogglePin={() => setArrangePinned((p) => !p)}
                onClose={() => setArrangeOpen(false)}
              />
              <div className="grid grid-cols-2 gap-2 p-3">
                <button
                  type="button"
                  disabled={canArrange && !canArrange.canForward}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onArrange("forward")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-secondary active:scale-95",
                    canArrange && !canArrange.canForward && "opacity-40 cursor-not-allowed pointer-events-none",
                  )}
                >
                  <LayerBringForwardIcon size={16} />
                  Forward
                </button>
                <button
                  type="button"
                  disabled={canArrange && !canArrange.canBackward}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onArrange("backward")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-secondary active:scale-95",
                    canArrange && !canArrange.canBackward && "opacity-40 cursor-not-allowed pointer-events-none",
                  )}
                >
                  <LayerSendBackwardIcon size={16} />
                  Backward
                </button>
                <button
                  type="button"
                  disabled={canArrange && !canArrange.canFront}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onArrange("front")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-secondary active:scale-95",
                    canArrange && !canArrange.canFront && "opacity-40 cursor-not-allowed pointer-events-none",
                  )}
                >
                  <LayerBringToFrontIcon size={16} />
                  To front
                </button>
                <button
                  type="button"
                  disabled={canArrange && !canArrange.canBack}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onArrange("back")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-secondary active:scale-95",
                    canArrange && !canArrange.canBack && "opacity-40 cursor-not-allowed pointer-events-none",
                  )}
                >
                  <LayerSendToBackIcon size={16} />
                  To back
                </button>
              </div>
            </div>
          </FloatingDropdown>
        </>
      ) : null}

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* Advanced — Width/Height (with an aspect-ratio lock), X/Y, and
          Rotate as exact, directly-typeable values. See the matching block
          in ShapeSelectionToolbar.tsx. */}
      <AppTooltip content="Width, height, position, and rotation">
        <button
          ref={advancedTriggerRef}
          type="button"
          onClick={() => {
            setAdvancedOpen((wasOpen) => {
              if (!wasOpen) {
                advancedDrag.reset();
                setAdvancedPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(btnClass, advancedOpen && "bg-secondary text-primary")}
        >
          <span className="text-xs font-semibold">Advanced</span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={advancedAnchor}
        offset={advancedDrag.offset}
        align="start"
        pinned={advancedPinned}
        onRequestClose={() => setAdvancedOpen(false)}
        triggerRef={advancedTriggerRef}
      >
        <div
          data-nopan=""
          data-keep-text-editing=""
          className="w-72 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        >
          <DragHandle
            label="Advanced"
            {...advancedDrag.dragHandleProps}
            pinned={advancedPinned}
            onTogglePin={() => setAdvancedPinned((p) => !p)}
            onClose={() => setAdvancedOpen(false)}
          />
          <div className="space-y-3 p-3">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Width">
                <UnitInput value={advWidth} unit="px" min={1} onChange={setAdvWidth} />
              </Field>
              <Field label="Height">
                <UnitInput value={advHeight} unit="px" min={1} onChange={setAdvHeight} />
              </Field>
              <Field label="Ratio">
                <AppTooltip content={ratioLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}>
                  <button
                    type="button"
                    onClick={() => setRatioLocked((v) => !v)}
                    className={cn(
                      "grid h-[38px] w-full place-items-center rounded-xl border transition-colors",
                      ratioLocked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/80 bg-secondary/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Link03Icon size={15} />
                  </button>
                </AppTooltip>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="X">
                <UnitInput value={advX} unit="px" onChange={setAdvX} />
              </Field>
              <Field label="Y">
                <UnitInput value={advY} unit="px" onChange={setAdvY} />
              </Field>
              <Field label="Rotate">
                <UnitInput
                  value={advRotation}
                  unit="°"
                  onChange={(v) => onUpdate({ rotation: ((v % 360) + 360) % 360 })}
                />
              </Field>
            </div>
          </div>
        </div>
      </FloatingDropdown>
    </>
  );

  if (detached) {
    return (
      <div
        ref={rowRef}
        data-nopan=""
        data-keep-text-editing=""
        style={{
          position: "fixed",
          top: lastLiveRectRef.current?.top ?? 0,
          left: lastLiveRectRef.current?.left ?? 0,
          visibility: "hidden",
          pointerEvents: "none",
        }}
        className={TOOLBAR_CLASS}
      >
        {rowContent}
      </div>
    );
  }

  return (
    <>
      <div ref={rowRef} style={{ width: 1, height: 1 }} />
      <FloatingToolbarPortal anchorRef={rowRef} offset={toolbarDrag.offset} className={TOOLBAR_CLASS}>
        {rowContent}
      </FloatingToolbarPortal>
    </>
  );
}
