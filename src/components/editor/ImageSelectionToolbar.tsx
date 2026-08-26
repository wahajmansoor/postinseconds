import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CropIcon,
  Eraser01Icon,
  EyeIcon,
  Layers01Icon,
  Upload01Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import { compressImageFile } from "@/lib/imageCompression";
import type { ImageLayer } from "./types";
import {
  Chip,
  ColorInput,
  DragHandle,
  Field,
  FloatingDropdown,
  Range,
  Toggle,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";
import { ImageCropDialog } from "./ImageCropDialog";
import { EraseImageDialog } from "./EraseImageDialog";

interface ImageSelectionToolbarProps {
  layer: ImageLayer;
  onUpdate: (patch: Partial<Omit<ImageLayer, "id">>) => void;
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
}

export function ImageSelectionToolbar({
  layer,
  onUpdate,
  onOpenCrop,
  onOpenErase,
  detached = false,
  onAnyPopoverOpenChange,
}: ImageSelectionToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);

  // Each dropdown opens unpinned by default — see DragHandle's own comment
  // on `onTogglePin` for what that means.
  const [radiusPinned, setRadiusPinned] = useState(false);
  const [opacityPinned, setOpacityPinned] = useState(false);
  const [shadowPinned, setShadowPinned] = useState(false);

  // Every popover below can be dragged to wherever the user wants — see
  // useDraggableOffset's own comment in ui.tsx for why the offset applies
  // to an inner wrapper rather than PopoverContent itself.
  const radiusDrag = useDraggableOffset();
  const opacityDrag = useDraggableOffset();
  const shadowDrag = useDraggableOffset();

  const radiusTriggerRef = useRef<HTMLButtonElement>(null);
  const opacityTriggerRef = useRef<HTMLButtonElement>(null);
  const shadowTriggerRef = useRef<HTMLButtonElement>(null);
  const radiusAnchor = useStableAnchor(radiusOpen, radiusTriggerRef);
  const opacityAnchor = useStableAnchor(opacityOpen, opacityTriggerRef);
  const shadowAnchor = useStableAnchor(shadowOpen, shadowTriggerRef);

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
  const anyPopoverOpen = radiusOpen || opacityOpen || shadowOpen;
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

  return (
    <div
      ref={rowRef}
      data-nopan=""
      data-keep-text-editing=""
      style={
        detached
          ? {
            position: "fixed",
            top: lastLiveRectRef.current?.top ?? 0,
            left: lastLiveRectRef.current?.left ?? 0,
            visibility: "hidden",
            pointerEvents: "none",
          }
          : undefined
      }
      className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap md:rounded-2xl md:border md:border-border/80 md:bg-background/95 md:p-1.5 md:shadow-2xl md:backdrop-blur-md"
    >
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
              label="Drop shadow"
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

                {/* Color Picker at Bottom */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                  <span className="text-xs font-semibold text-muted-foreground">Shadow Color</span>
                  <ColorInput
                    value={layer.shadowColor ?? "#000000"}
                    onChange={(v) => onUpdate({ shadowColor: v })}
                    showHex={true}
                    swatchClassName="h-7 w-7 rounded-lg border-border"
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

      {/* 6. Layer Stacking Order */}
      <AppTooltip
        content={
          layer.layer === "behind"
            ? "Currently behind text (click to bring to front)"
            : "Currently in front of text (click to send behind)"
        }
      >
        <button
          type="button"
          onClick={() => onUpdate({ layer: layer.layer === "behind" ? "front" : "behind" })}
          className={cn(btnClass, "gap-1.5 text-xs text-muted-foreground hover:text-foreground")}
        >
          <Layers01Icon size={15} />
          <span>{layer.layer === "behind" ? "Behind Text" : "In Front"}</span>
        </button>
      </AppTooltip>
    </div>
  );
}
