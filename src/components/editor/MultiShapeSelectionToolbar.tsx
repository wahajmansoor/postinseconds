import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlignBottomIcon,
  AlignHorizontalCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  AlignVerticalCenterIcon,
  Delete02Icon,
  LayerBringForwardIcon,
  LayerBringToFrontIcon,
  LayerSendBackwardIcon,
  LayerSendToBackIcon,
  Link03Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import type { ShapeAlignEdge, ShapeLayer } from "./types";
import {
  ColorPickerContent,
  DragHandle,
  Field,
  FloatingDropdown,
  Range,
  TextInput,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";

export type ShapeArrangeDirection = "forward" | "backward" | "front" | "back";

interface MultiShapeSelectionToolbarProps {
  layers: ShapeLayer[];
  canvasWidth: number;
  canvasHeight: number;
  /** Applies one patch to every selected shape at once (e.g. fill color,
   * width/height, or rotation) — see withShapesUpdated in types.ts. */
  onUpdateAll: (patch: Partial<Omit<ShapeLayer, "id">>) => void;
  /** Moves the whole selection's own layer-stack block — see
   * withUnifiedLayersReordered in types.ts. */
  onArrange: (direction: ShapeArrangeDirection) => void;
  /** Lines each selected shape up against a canvas edge/center,
   * independently — see withShapesAligned in types.ts. */
  onAlign: (edge: ShapeAlignEdge) => void;
  /** Shifts every selected shape by the same canvas-% delta, used by the
   * Advanced panel's X/Y fields to move the whole group together — see
   * withShapesShifted in types.ts. */
  onShiftGroup: (dxPercent: number, dyPercent: number) => void;
  onDeleteAll?: () => void;
  onToggleLockAll?: () => void;
  // See the matching props' comments in ShapeSelectionToolbar.tsx.
  detached?: boolean;
  onAnyPopoverOpenChange?: (open: boolean) => void;
}

// Returns the shared value across every layer, or undefined when they
// differ — used to show "Mixed" instead of one layer's value winning
// silently, and to know when a slider should start from an average instead
// of a real current value.
function uniformValue<T>(values: T[]): T | undefined {
  return values.every((v) => v === values[0]) ? values[0] : undefined;
}

export function MultiShapeSelectionToolbar({
  layers,
  canvasWidth,
  canvasHeight,
  onUpdateAll,
  onArrange,
  onAlign,
  onShiftGroup,
  onDeleteAll,
  onToggleLockAll,
  detached = false,
  onAnyPopoverOpenChange,
}: MultiShapeSelectionToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [colorPinned, setColorPinned] = useState(false);
  const [arrangePinned, setArrangePinned] = useState(false);
  const [alignPinned, setAlignPinned] = useState(false);
  const [advancedPinned, setAdvancedPinned] = useState(false);
  // Aspect-ratio lock for the Advanced panel's Width/Height fields — local
  // UI-only state (not persisted per-layer), matching the screenshot's
  // Advanced panel: while on, editing Width recomputes Height (and vice
  // versa) from whatever ratio was showing the instant it was toggled on,
  // then applies both to every selected shape via the same onUpdateAll.
  const [ratioLocked, setRatioLocked] = useState(false);

  const colorDrag = useDraggableOffset();
  const arrangeDrag = useDraggableOffset();
  const alignDrag = useDraggableOffset();
  const advancedDrag = useDraggableOffset();

  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const arrangeTriggerRef = useRef<HTMLButtonElement>(null);
  const alignTriggerRef = useRef<HTMLButtonElement>(null);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);
  const colorAnchor = useStableAnchor(colorOpen, colorTriggerRef);
  const arrangeAnchor = useStableAnchor(arrangeOpen, arrangeTriggerRef);
  const alignAnchor = useStableAnchor(alignOpen, alignTriggerRef);
  const advancedAnchor = useStableAnchor(advancedOpen, advancedTriggerRef);

  // See the matching block's comment in ShapeSelectionToolbar.tsx.
  const anyPopoverOpen = colorOpen || arrangeOpen || alignOpen || advancedOpen;
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

  const widths = layers.map((l) => l.size);
  const heights = layers.map((l) => l.height ?? l.size);
  const colors = layers.map((l) => l.color);
  const rotations = layers.map((l) => l.rotation ?? 0);
  const uniformWidth = uniformValue(widths);
  const uniformHeight = uniformValue(heights);
  const uniformColor = uniformValue(colors);
  const uniformRotation = uniformValue(rotations);
  // When sizes/colors/rotation already differ across the selection, each
  // control still needs *some* starting value to render — average width/
  // height/rotation, and the first layer's color — moving it then snaps
  // every selected shape to that one shared value, same as any other
  // "apply to all" control.
  const displayWidth = uniformWidth ?? Math.round(widths.reduce((a, b) => a + b, 0) / widths.length);
  const displayHeight = uniformHeight ?? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
  const displayColor = uniformColor ?? colors[0] ?? "#0021ff";
  const displayRotation = uniformRotation ?? Math.round(rotations.reduce((a, b) => a + b, 0) / rotations.length);
  const allLocked = layers.every((l) => l.locked);

  // Group bounding box, in px, relative to the canvas — same left/top edge
  // math QuoteCanvas's own selectedBounds uses for the "N Layers Selected"
  // pill, scoped to just the shapes this toolbar already knows about (it
  // only ever renders for an all-shapes multi-selection).
  const groupLeftPx = Math.round(
    Math.min(...layers.map((l) => (l.x / 100) * canvasWidth - l.size / 2)),
  );
  const groupTopPx = Math.round(
    Math.min(...layers.map((l) => (l.y / 100) * canvasHeight - (l.height ?? l.size) / 2)),
  );

  const setWidth = (v: number) => {
    if (ratioLocked && displayWidth > 0) {
      const nextHeight = Math.round(v * (displayHeight / displayWidth));
      onUpdateAll({ size: v, height: nextHeight });
    } else {
      onUpdateAll({ size: v });
    }
  };
  const setHeight = (v: number) => {
    if (ratioLocked && displayHeight > 0) {
      const nextWidth = Math.round(v * (displayWidth / displayHeight));
      onUpdateAll({ size: nextWidth, height: v });
    } else {
      onUpdateAll({ height: v });
    }
  };

  const arrangeBtnClass =
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-border/60 bg-secondary/40 px-2 py-2.5 text-[10px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary";
  const alignBtnClass =
    "flex h-9 flex-1 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-foreground transition-colors hover:border-primary hover:text-primary";

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
      <span className="shrink-0 px-1.5 text-xs font-semibold text-muted-foreground">
        {layers.length} Shapes Selected
      </span>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* Fill Color — applies to every selected shape at once */}
      <AppTooltip content="Fill color for all selected shapes">
        <button
          ref={colorTriggerRef}
          type="button"
          onClick={() => {
            setColorOpen((wasOpen) => {
              if (!wasOpen) {
                colorDrag.reset();
                setColorPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            btnClass,
            "border border-border/60 bg-secondary/40 text-foreground",
            colorOpen && "border-primary text-primary",
          )}
        >
          <div
            className="h-4.5 w-4.5 shrink-0 rounded-full border border-border shadow-xs"
            style={{ background: displayColor }}
          />
          <span className="text-xs">{uniformColor ? "Color" : "Mixed Color"}</span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={colorAnchor}
        offset={colorDrag.offset}
        align="start"
        pinned={colorPinned}
        onRequestClose={() => setColorOpen(false)}
        triggerRef={colorTriggerRef}
      >
        {/* Uses ColorPickerContent directly rather than the packaged
            ColorInput/ColorPicker export — see TextSelectionToolbar's Text
            Color popover for the same pattern and why: ColorPicker owns its
            own separate Radix Popover, portaled straight to <body> as a
            SIBLING of this FloatingDropdown's own portal, not a DOM
            descendant of it. This dropdown's outside-click handler closes
            itself on any pointerdown it can't find inside its own panel —
            so every click on that nested popover's actual controls (the
            color area, hue slider, hex field) read as "outside" and closed
            this whole panel before the click could register, making the
            color picker unusable. ColorPickerContent is just the inert
            content with no popover/portal of its own, so it stays a real
            descendant of this panel and the bug doesn't apply. */}
        <div className="w-auto max-md:w-full overflow-hidden rounded-3xl border border-border bg-background shadow-2xl backdrop-blur-xl">
          <DragHandle
            label={uniformColor ? "Fill Color — All Selected" : "Fill Color — Mixed"}
            {...colorDrag.dragHandleProps}
            pinned={colorPinned}
            onTogglePin={() => setColorPinned((p) => !p)}
            onClose={() => setColorOpen(false)}
          />
          <ColorPickerContent value={displayColor} onChange={(c) => onUpdateAll({ color: c })} />
        </div>
      </FloatingDropdown>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* Arrange — Forward / Backward / To Front / To Back, moves the whole
          selection's block in the layer stack at once */}
      <AppTooltip content="Arrange: layer order for all selected shapes">
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
            label="Arrange — All Selected"
            {...arrangeDrag.dragHandleProps}
            pinned={arrangePinned}
            onTogglePin={() => setArrangePinned((p) => !p)}
            onClose={() => setArrangeOpen(false)}
          />
          <div className="grid grid-cols-2 gap-2 p-3">
            <button type="button" onClick={() => onArrange("forward")} className={arrangeBtnClass}>
              <LayerBringForwardIcon size={16} />
              Forward
            </button>
            <button type="button" onClick={() => onArrange("backward")} className={arrangeBtnClass}>
              <LayerSendBackwardIcon size={16} />
              Backward
            </button>
            <button type="button" onClick={() => onArrange("front")} className={arrangeBtnClass}>
              <LayerBringToFrontIcon size={16} />
              To front
            </button>
            <button type="button" onClick={() => onArrange("back")} className={arrangeBtnClass}>
              <LayerSendToBackIcon size={16} />
              To back
            </button>
          </div>
        </div>
      </FloatingDropdown>

      {/* Align — each selected shape lines up independently against a
          canvas edge/center (Canva's own multi-select align convention) */}
      <AppTooltip content="Align every selected shape to the canvas">
        <button
          ref={alignTriggerRef}
          type="button"
          onClick={() => {
            setAlignOpen((wasOpen) => {
              if (!wasOpen) {
                alignDrag.reset();
                setAlignPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(btnClass, alignOpen && "bg-secondary text-primary")}
        >
          <AlignHorizontalCenterIcon size={15} />
          <span className="text-xs">Align</span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={alignAnchor}
        offset={alignDrag.offset}
        align="center"
        pinned={alignPinned}
        onRequestClose={() => setAlignOpen(false)}
        triggerRef={alignTriggerRef}
      >
        <div className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
          <DragHandle
            label="Align to Canvas — All Selected"
            {...alignDrag.dragHandleProps}
            pinned={alignPinned}
            onTogglePin={() => setAlignPinned((p) => !p)}
            onClose={() => setAlignOpen(false)}
          />
          <div className="space-y-2.5 p-3">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Horizontal
              </span>
              <div className="flex gap-1.5">
                <AppTooltip content="Align left">
                  <button type="button" onClick={() => onAlign("left")} className={alignBtnClass}>
                    <AlignLeftIcon size={16} />
                  </button>
                </AppTooltip>
                <AppTooltip content="Align center">
                  <button type="button" onClick={() => onAlign("center-h")} className={alignBtnClass}>
                    <AlignHorizontalCenterIcon size={16} />
                  </button>
                </AppTooltip>
                <AppTooltip content="Align right">
                  <button type="button" onClick={() => onAlign("right")} className={alignBtnClass}>
                    <AlignRightIcon size={16} />
                  </button>
                </AppTooltip>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vertical
              </span>
              <div className="flex gap-1.5">
                <AppTooltip content="Align top">
                  <button type="button" onClick={() => onAlign("top")} className={alignBtnClass}>
                    <AlignTopIcon size={16} />
                  </button>
                </AppTooltip>
                <AppTooltip content="Align middle">
                  <button type="button" onClick={() => onAlign("middle-v")} className={alignBtnClass}>
                    <AlignVerticalCenterIcon size={16} />
                  </button>
                </AppTooltip>
                <AppTooltip content="Align bottom">
                  <button type="button" onClick={() => onAlign("bottom")} className={alignBtnClass}>
                    <AlignBottomIcon size={16} />
                  </button>
                </AppTooltip>
              </div>
            </div>
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* Advanced — Width/Height (with an aspect-ratio lock), Rotate, and
          the whole group's X/Y position */}
      <AppTooltip content="Width, height, rotation, and position for all selected shapes">
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
          <span className="text-[11px] font-semibold">
            {uniformWidth !== undefined && uniformHeight !== undefined
              ? `${uniformWidth}×${uniformHeight}px`
              : "Mixed Size"}
          </span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={advancedAnchor}
        offset={advancedDrag.offset}
        align="center"
        pinned={advancedPinned}
        onRequestClose={() => setAdvancedOpen(false)}
        triggerRef={advancedTriggerRef}
      >
        <div className="w-72 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
          <DragHandle
            label="Advanced — All Selected"
            {...advancedDrag.dragHandleProps}
            pinned={advancedPinned}
            onTogglePin={() => setAdvancedPinned((p) => !p)}
            onClose={() => setAdvancedOpen(false)}
          />
          <div className="space-y-3 p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Width${uniformWidth === undefined ? " (mixed)" : ""}`}>
                  <TextInput
                    type="number"
                    value={displayWidth}
                    onChange={(e) => setWidth(Number(e.target.value) || 1)}
                  />
                </Field>
              </div>
              <AppTooltip content={ratioLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}>
                <button
                  type="button"
                  onClick={() => setRatioLocked((v) => !v)}
                  className={cn(
                    "mb-2.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-colors",
                    ratioLocked
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Link03Icon size={15} />
                </button>
              </AppTooltip>
              <div className="flex-1">
                <Field label={`Height${uniformHeight === undefined ? " (mixed)" : ""}`}>
                  <TextInput
                    type="number"
                    value={displayHeight}
                    onChange={(e) => setHeight(Number(e.target.value) || 1)}
                  />
                </Field>
              </div>
            </div>

            <Field label={`Rotate — ${displayRotation}°${uniformRotation === undefined ? " (mixed)" : ""}`}>
              <Range
                value={displayRotation}
                min={-180}
                max={180}
                onChange={(v) => onUpdateAll({ rotation: v })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="X">
                <TextInput
                  type="number"
                  value={groupLeftPx}
                  onChange={(e) => {
                    const nextLeft = Number(e.target.value);
                    if (!Number.isFinite(nextLeft)) return;
                    onShiftGroup(((nextLeft - groupLeftPx) / canvasWidth) * 100, 0);
                  }}
                />
              </Field>
              <Field label="Y">
                <TextInput
                  type="number"
                  value={groupTopPx}
                  onChange={(e) => {
                    const nextTop = Number(e.target.value);
                    if (!Number.isFinite(nextTop)) return;
                    onShiftGroup(0, ((nextTop - groupTopPx) / canvasHeight) * 100);
                  }}
                />
              </Field>
            </div>
          </div>
        </div>
      </FloatingDropdown>

      {/* Lock / Delete — mirrors the single-shape toolbar's own pair, just
          applied to the whole selection at once. */}
      {onToggleLockAll ? (
        <>
          <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
          <AppTooltip content={allLocked ? "Unlock all selected" : "Lock all selected"}>
            <button
              type="button"
              onClick={onToggleLockAll}
              className={cn(btnClass, "px-2 text-muted-foreground hover:text-foreground")}
            >
              {allLocked ? <SquareLock02Icon size={15} /> : <SquareUnlock02Icon size={15} />}
            </button>
          </AppTooltip>
        </>
      ) : null}

      {onDeleteAll ? (
        <AppTooltip content="Delete all selected shapes">
          <button
            type="button"
            onClick={onDeleteAll}
            className={cn(btnClass, "px-2 text-destructive hover:bg-destructive/10 hover:text-destructive")}
          >
            <Delete02Icon size={15} />
          </button>
        </AppTooltip>
      ) : null}
    </div>
  );
}
