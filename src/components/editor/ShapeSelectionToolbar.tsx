import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Copy01Icon,
  Delete02Icon,
  EyeIcon,
  LayerBringForwardIcon,
  LayerBringToFrontIcon,
  Layers01Icon,
  LayerSendBackwardIcon,
  LayerSendToBackIcon,
  SparklesIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import {
  GRADIENTS,
  SHAPE_PRESETS,
  getMatchingShapePresetId,
  getShapeLabel,
  shapeCss,
  shapeSupportsRadius,
  type BoxStyle,
  type ShapeLayer,
} from "./types";
import {
  Chip,
  ColorPickerContent,
  DragHandle,
  Field,
  FloatingDropdown,
  Range,
  Toggle,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";

interface ShapeSelectionToolbarProps {
  layer: ShapeLayer;
  onUpdate: (patch: Partial<Omit<ShapeLayer, "id">>) => void;
  onArrange?: (direction: "forward" | "backward" | "front" | "back") => void;
  canArrange?: { canForward: boolean; canBackward: boolean; canFront: boolean; canBack: boolean };
  onDuplicate?: () => void;
  onDelete?: () => void;
  onToggleLock?: () => void;
  // See the matching props' comments in TextSelectionToolbar.tsx.
  detached?: boolean;
  onAnyPopoverOpenChange?: (open: boolean) => void;
}

export function ShapeSelectionToolbar({
  layer,
  onUpdate,
  onArrange,
  canArrange,
  onDuplicate,
  onDelete,
  onToggleLock,
  detached = false,
  onAnyPopoverOpenChange,
}: ShapeSelectionToolbarProps) {
  const [shapePickerOpen, setShapePickerOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);

  // Each dropdown opens unpinned by default — see DragHandle's own comment
  // on `onTogglePin` for what that means.
  const [shapePickerPinned, setShapePickerPinned] = useState(false);
  const [stylePinned, setStylePinned] = useState(false);
  const [radiusPinned, setRadiusPinned] = useState(false);
  const [opacityPinned, setOpacityPinned] = useState(false);
  const [shadowPinned, setShadowPinned] = useState(false);
  const [arrangePinned, setArrangePinned] = useState(false);

  // Every popover below can be dragged to wherever the user wants — see
  // useDraggableOffset's own comment in ui.tsx for why the offset applies
  // to an inner wrapper rather than PopoverContent itself.
  const shapeDrag = useDraggableOffset();
  const styleDrag = useDraggableOffset();
  const radiusDrag = useDraggableOffset();
  const opacityDrag = useDraggableOffset();
  const shadowDrag = useDraggableOffset();
  const arrangeDrag = useDraggableOffset();

  const shapeTriggerRef = useRef<HTMLButtonElement>(null);
  const styleTriggerRef = useRef<HTMLButtonElement>(null);
  const radiusTriggerRef = useRef<HTMLButtonElement>(null);
  const opacityTriggerRef = useRef<HTMLButtonElement>(null);
  const shadowTriggerRef = useRef<HTMLButtonElement>(null);
  const arrangeTriggerRef = useRef<HTMLButtonElement>(null);
  const shapeAnchor = useStableAnchor(shapePickerOpen, shapeTriggerRef);
  const styleAnchor = useStableAnchor(styleOpen, styleTriggerRef);
  const radiusAnchor = useStableAnchor(radiusOpen, radiusTriggerRef);
  const opacityAnchor = useStableAnchor(opacityOpen, opacityTriggerRef);
  const shadowAnchor = useStableAnchor(shadowOpen, shadowTriggerRef);
  const arrangeAnchor = useStableAnchor(arrangeOpen, arrangeTriggerRef);

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
  const anyPopoverOpen =
    shapePickerOpen || styleOpen || radiusOpen || opacityOpen || shadowOpen || arrangeOpen;
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

  const btnClass =
    "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors hover:bg-secondary";

  const currentLabel = getShapeLabel(layer);
  const currentPresetId = getMatchingShapePresetId(layer);
  const supportsRadius = shapeSupportsRadius(layer.kind);
  const currentStyle: BoxStyle = layer.style ?? "solid";

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
      {/* 1. Shape Morphing / Picker Popover */}
      <AppTooltip content="Change shape geometry">
        <button
          ref={shapeTriggerRef}
          type="button"
          onClick={() => {
            setShapePickerOpen((wasOpen) => {
              if (!wasOpen) {
                shapeDrag.reset();
                setShapePickerPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            btnClass,
            "border border-border/60 bg-secondary/40 text-foreground",
            shapePickerOpen && "border-primary text-primary",
          )}
        >
          <span
            className="h-4 w-4 shrink-0 bg-primary"
            style={shapeCss(layer.kind, layer.radius >= 80 ? 999 : Math.min(layer.radius, 6))}
          />
          <span className="font-semibold text-xs">{currentLabel}</span>
          <span className="text-[10px] text-muted-foreground">▾</span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={shapeAnchor}
        offset={shapeDrag.offset}
        align="start"
        pinned={shapePickerPinned}
        onRequestClose={() => setShapePickerOpen(false)}
        triggerRef={shapeTriggerRef}
      >
        <div
          data-nopan=""
          data-keep-text-editing=""
          className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        >
          <DragHandle
            label="Shape"
            {...shapeDrag.dragHandleProps}
            pinned={shapePickerPinned}
            onTogglePin={() => setShapePickerPinned((p) => !p)}
            onClose={() => setShapePickerOpen(false)}
          />
          <div className="space-y-2 p-3">
            <span className="text-xs font-semibold text-foreground">Select Shape</span>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {SHAPE_PRESETS.map((preset) => {
                const isActive = currentPresetId === preset.id;
                const previewRadius = preset.id === "rounded" ? 6 : preset.radius;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onUpdate({ kind: preset.kind, radius: preset.radius });
                      setShapePickerOpen(false);
                    }}
                    title={preset.label}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border p-2 transition-all",
                      isActive
                        ? "border-primary bg-primary/20 text-primary ring-2 ring-primary/60 shadow-sm"
                        : "border-border bg-secondary/50 text-muted-foreground hover:border-primary hover:text-foreground",
                    )}
                  >
                    <span
                      className="block h-full w-full"
                      style={{ background: "currentColor", ...shapeCss(preset.kind, previewRadius) }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 2. Color & Style Popover (Solid / Gradient / Glass / Outline) */}
      <AppTooltip content="Fill color, gradient, glass, or outline style">
        <button
          ref={styleTriggerRef}
          type="button"
          onClick={() => {
            setStyleOpen((wasOpen) => {
              if (!wasOpen) {
                styleDrag.reset();
                setStylePinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            btnClass,
            styleOpen && "bg-secondary text-primary",
          )}
        >
          <div
            className="h-4.5 w-4.5 shrink-0 rounded-full border border-border shadow-xs"
            style={{
              background:
                currentStyle === "gradient"
                  ? layer.gradient ?? "linear-gradient(135deg, #6366f1, #ec4899)"
                  : currentStyle === "outline"
                    ? "transparent"
                    : layer.color,
              borderColor: currentStyle === "outline" ? layer.color : undefined,
              borderWidth: currentStyle === "outline" ? "2px" : "1px",
            }}
          />
          <span className="capitalize text-xs">{currentStyle}</span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={styleAnchor}
        offset={styleDrag.offset}
        align="center"
        pinned={stylePinned}
        onRequestClose={() => setStyleOpen(false)}
        triggerRef={styleTriggerRef}
      >
        <div
          data-nopan=""
          data-keep-text-editing=""
          className="w-72 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        >
          <DragHandle
            label="Fill & Style"
            {...styleDrag.dragHandleProps}
            pinned={stylePinned}
            onTogglePin={() => setStylePinned((p) => !p)}
            onClose={() => setStyleOpen(false)}
          />
          <div className="space-y-3 p-3">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Style Mode</span>
              <div className="grid grid-cols-4 gap-1">
                {(["solid", "gradient", "glass", "outline"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onUpdate({ style: mode })}
                    className={cn(
                      "rounded-md py-1 text-[11px] font-medium capitalize transition-colors",
                      currentStyle === mode
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Picker for Solid, Glass, Outline — ColorPickerContent
                directly, NOT the packaged ColorInput/ColorPicker export.
                That export owns its own separate Radix Popover, which
                portals its hue/saturation area straight to <body> as a
                sibling of this whole Fill & Style panel, not a DOM
                descendant of it. FloatingDropdown's own outside-click
                dismissal (see its handlePointerDown) closes on anything
                that isn't inside its panelRef — a real `Node.contains()`
                check, blind to React's component tree, so it can't tell
                that click "belongs" to this panel despite portaling
                elsewhere in the DOM. Net effect: clicking the color swatch,
                or anything inside the resulting picker, read as an outside
                click and instantly collapsed the whole panel — this is why
                changing a shape's fill/outline color did nothing visible.
                Embedding the picker's content directly here (already inside
                this dropdown, no second nested popover needed) avoids the
                extra portal entirely — same fix already applied to Text
                Color and the Background toolbar's Solid swatch (see their
                own matching comments) and to MultiShapeSelectionToolbar's
                batch color control just below in this same file's sibling. */}
            {currentStyle !== "gradient" ? (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground">
                  {currentStyle === "outline" ? "Outline Color" : "Fill Color"}
                </span>
                <ColorPickerContent
                  value={layer.color ?? "#0021ff"}
                  onChange={(c) => onUpdate({ color: c })}
                />
              </div>
            ) : null}

            {/* Gradient Presets when Gradient Mode */}
            {currentStyle === "gradient" ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-foreground">Gradient Presets</span>
                <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {GRADIENTS.map((g, idx) => (
                    <button
                      key={g.label || idx}
                      type="button"
                      onClick={() => onUpdate({ gradient: g.value })}
                      title={g.label}
                      className={cn(
                        "h-8 rounded-lg border border-border/80 transition-transform hover:scale-105",
                        layer.gradient === g.value && "ring-2 ring-primary",
                      )}
                      style={{ background: g.value }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Stroke Width for Outline */}
            {currentStyle === "outline" ? (
              <Field label={`Stroke Width — ${layer.strokeWidth ?? 3}px`}>
                <Range
                  value={layer.strokeWidth ?? 3}
                  min={1}
                  max={24}
                  onChange={(v) => onUpdate({ strokeWidth: v })}
                />
                <div className="flex gap-1 pt-1">
                  {[1, 2, 3, 4, 6, 8].map((px) => (
                    <Chip
                      key={px}
                      onClick={() => onUpdate({ strokeWidth: px })}
                      active={(layer.strokeWidth ?? 3) === px}
                      className="flex-1 justify-center px-1 text-[10px]"
                    >
                      {px}px
                    </Chip>
                  ))}
                </div>
              </Field>
            ) : null}
          </div>
        </div>
      </FloatingDropdown>

      {/* 3. Corner Radius (if supported) */}
      {supportsRadius ? (
        <>
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
                Radius: {layer.radius >= 80 ? "Circle" : `${layer.radius}px`}
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
                  <span className="text-xs text-muted-foreground">
                    {layer.radius >= 80 ? "Circle" : `${layer.radius}px`}
                  </span>
                </div>
                <Range
                  value={Math.min(layer.radius, 120)}
                  min={0}
                  max={120}
                  onChange={(v) => onUpdate({ radius: v })}
                />
                <div className="flex flex-wrap gap-1">
                  {[0, 8, 16, 28, 999].map((r) => (
                    <Chip
                      key={r}
                      onClick={() => onUpdate({ radius: r })}
                      active={layer.radius === r}
                      className="flex-1 justify-center px-1 text-[10px]"
                    >
                      {r === 0 ? "0px" : r === 999 ? "Circle" : `${r}px`}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </FloatingDropdown>
        </>
      ) : null}

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 4. Opacity Popover */}
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
            layer.opacity < 100 && "text-primary",
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
              <span className="text-xs font-semibold text-foreground">Opacity</span>
              <span className="text-xs text-muted-foreground">{layer.opacity ?? 100}%</span>
            </div>
            <Range
              value={layer.opacity ?? 100}
              min={0}
              max={100}
              onChange={(v) => onUpdate({ opacity: v })}
            />
            <div className="flex gap-1">
              {[100, 75, 50, 25].map((pct) => (
                <Chip
                  key={pct}
                  onClick={() => onUpdate({ opacity: pct })}
                  active={(layer.opacity ?? 100) === pct}
                  className="flex-1 justify-center px-1 text-[10px]"
                >
                  {pct}%
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </FloatingDropdown>

      {/* 5. Drop Shadow Popover */}
      <AppTooltip content="Customize drop shadow">
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
            layer.shadow && "text-primary font-semibold",
          )}
        >
          <SparklesIcon size={15} />
          <span className="text-xs">Shadow</span>
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
                <Field label={`Blur — ${layer.shadowBlur ?? 24}px`}>
                  <Range
                    value={layer.shadowBlur ?? 24}
                    min={0}
                    max={80}
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
                    min={-40}
                    max={40}
                    onChange={(v) => onUpdate({ shadowX: v })}
                    showInput={true}
                  />
                </Field>

                <Field label={`Offset Y — ${layer.shadowY ?? 12}px`}>
                  <Range
                    value={layer.shadowY ?? 12}
                    min={-40}
                    max={40}
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

                {/* ColorPickerContent directly, not ColorInput — same
                    nested-popover-escapes-FloatingDropdown's outside-click
                    check bug as the Fill Color picker above (see its own
                    comment for the full mechanism). */}
                <div className="space-y-1.5 border-t border-border/40 pt-2.5">
                  <span className="text-xs font-semibold text-muted-foreground">Shadow Color</span>
                  <ColorPickerContent
                    value={layer.shadowColor ?? "#000000"}
                    onChange={(c) => onUpdate({ shadowColor: c })}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 6. Flip Horizontal / Vertical */}
      <AppTooltip content="Flip horizontal">
        <button
          type="button"
          onClick={() => onUpdate({ flipH: !layer.flipH })}
          className={cn(btnClass, "px-2", layer.flipH && "bg-secondary text-primary font-bold")}
          title="Flip Horizontal"
        >
          <span className="text-sm font-bold">⇄</span>
        </button>
      </AppTooltip>

      <AppTooltip content="Flip vertical">
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

      {/* 7. Arrange Layer Stacking Order */}
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

      {/* 8. Lock Toggle */}
      {onToggleLock ? (
        <AppTooltip content={layer.locked ? "Unlock element" : "Lock element"}>
          <button
            type="button"
            onClick={onToggleLock}
            className={cn(btnClass, "px-2 text-muted-foreground hover:text-foreground")}
          >
            {layer.locked ? <SquareLock02Icon size={15} /> : <SquareUnlock02Icon size={15} />}
          </button>
        </AppTooltip>
      ) : null}

      {/* 9. Duplicate Button */}
      {onDuplicate ? (
        <AppTooltip content="Duplicate element">
          <button
            type="button"
            onClick={onDuplicate}
            className={cn(btnClass, "px-2 text-muted-foreground hover:text-foreground")}
          >
            <Copy01Icon size={15} />
          </button>
        </AppTooltip>
      ) : null}

      {/* 10. Delete Button */}
      {onDelete ? (
        <AppTooltip content="Delete element">
          <button
            type="button"
            onClick={onDelete}
            className={cn(btnClass, "px-2 text-destructive hover:bg-destructive/10 hover:text-destructive")}
          >
            <Delete02Icon size={15} />
          </button>
        </AppTooltip>
      ) : null}
    </div>
  );
}
