import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlignBottomIcon,
  AlignHorizontalCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  AlignVerticalCenterIcon,
  Copy01Icon,
  Delete02Icon,
  EyeIcon,
  LayerBringForwardIcon,
  LayerBringToFrontIcon,
  LayerSendBackwardIcon,
  LayerSendToBackIcon,
  Link03Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import { isLineShape, type ShapeAlignEdge, type ShapeLayer, type SpaceEvenlyDirection } from "./types";
import {
  Chip,
  ColorPickerContent,
  DragHandle,
  Field,
  FloatingDropdown,
  FloatingToolbarPortal,
  Range,
  TextInput,
  MinimizedToolbarButton,
  MinimizeToolbarButton,
  ToolbarDragGrip,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";

export type ShapeArrangeDirection = "forward" | "backward" | "front" | "back";

interface MultiShapeSelectionToolbarProps {
  layers: ShapeLayer[];
  canvasWidth: number;
  canvasHeight: number;
  /** Applies a partial update to every selected shape (e.g. fill color,
   * width/height, or rotation) — see withShapesUpdated in types.ts. */
  onUpdateAll: (patch: Partial<Omit<ShapeLayer, "id">>) => void;
  /** Moves the whole selection's own layer-stack block — see
   * withUnifiedLayersReordered in types.ts. */
  onArrange: (direction: ShapeArrangeDirection) => void;
  canArrange?: { canForward: boolean; canBackward: boolean; canFront: boolean; canBack: boolean };
  /** Lines each selected shape up against a canvas edge/center,
   * independently — see withShapesAligned in types.ts. */
  onAlign: (edge: ShapeAlignEdge) => void;
  /** Spaces selected shapes evenly (vertically, horizontally, or tidy up). */
  onSpaceEvenly?: (direction: SpaceEvenlyDirection) => void;
  /** Shifts every selected shape by the same canvas-% delta, used by the
   * Advanced panel's X/Y fields to move the whole group together — see
   * withShapesShifted in types.ts. */
  onShiftGroup: (dxPercent: number, dyPercent: number) => void;
  onDuplicateAll?: () => void;
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
  canArrange,
  onAlign,
  onSpaceEvenly,
  onShiftGroup,
  onDuplicateAll,
  onDeleteAll,
  onToggleLockAll,
  detached = false,
  onAnyPopoverOpenChange,
}: MultiShapeSelectionToolbarProps) {
  const isMobile = useIsMobile();
  const [colorOpen, setColorOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [strokeWidthOpen, setStrokeWidthOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [spaceEvenlyOpen, setSpaceEvenlyOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [colorPinned, setColorPinned] = useState(false);
  const [opacityPinned, setOpacityPinned] = useState(false);
  const [strokeWidthPinned, setStrokeWidthPinned] = useState(false);
  const [arrangePinned, setArrangePinned] = useState(false);
  const [alignPinned, setAlignPinned] = useState(false);
  const [spaceEvenlyPinned, setSpaceEvenlyPinned] = useState(false);
  const [rotatePinned, setRotatePinned] = useState(false);
  const [advancedPinned, setAdvancedPinned] = useState(false);
  // Aspect-ratio lock for the Advanced panel's Width/Height fields — local
  // UI-only state (not persisted per-layer), matching the screenshot's
  // Advanced panel: while on, editing Width recomputes Height (and vice
  // versa) from whatever ratio was showing the instant it was toggled on,
  // then applies both to every selected shape via the same onUpdateAll.
  const [ratioLocked, setRatioLocked] = useState(false);

  // The toolbar row's own drag offset — see ToolbarDragGrip's own comment
  // in ui.tsx.
  const toolbarDrag = useDraggableOffset("multi-shape-toolbar");
  const [minimized, setMinimized] = useState(false);
  // See minimizeBaseRef's own comment in ShapeSelectionToolbar.tsx.
  const minimizeBaseRef = useRef({ top: 0, left: 0 });
  const colorDrag = useDraggableOffset();
  const opacityDrag = useDraggableOffset();
  const strokeWidthDrag = useDraggableOffset();
  const arrangeDrag = useDraggableOffset();
  const alignDrag = useDraggableOffset();
  const spaceEvenlyDrag = useDraggableOffset();
  const rotateDrag = useDraggableOffset();
  const advancedDrag = useDraggableOffset();

  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const opacityTriggerRef = useRef<HTMLButtonElement>(null);
  const strokeWidthTriggerRef = useRef<HTMLButtonElement>(null);
  const arrangeTriggerRef = useRef<HTMLButtonElement>(null);
  const alignTriggerRef = useRef<HTMLButtonElement>(null);
  const spaceEvenlyTriggerRef = useRef<HTMLButtonElement>(null);
  const rotateTriggerRef = useRef<HTMLButtonElement>(null);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);
  const colorAnchor = useStableAnchor(colorOpen, colorTriggerRef);
  const opacityAnchor = useStableAnchor(opacityOpen, opacityTriggerRef);
  const strokeWidthAnchor = useStableAnchor(strokeWidthOpen, strokeWidthTriggerRef);
  const arrangeAnchor = useStableAnchor(arrangeOpen, arrangeTriggerRef);
  const alignAnchor = useStableAnchor(alignOpen, alignTriggerRef);
  const spaceEvenlyAnchor = useStableAnchor(spaceEvenlyOpen, spaceEvenlyTriggerRef);
  const rotateAnchor = useStableAnchor(rotateOpen, rotateTriggerRef);
  const advancedAnchor = useStableAnchor(advancedOpen, advancedTriggerRef);

  // See the matching block's comment in ShapeSelectionToolbar.tsx.
  const anyPopoverOpen = colorOpen || opacityOpen || strokeWidthOpen || arrangeOpen || alignOpen || spaceEvenlyOpen || rotateOpen || advancedOpen;
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
  const opacities = layers.map((l) => l.opacity ?? 100);
  const lineLayers = layers.filter((l) => isLineShape(l.kind));
  const hasLineShapes = lineLayers.length > 0;
  const strokeWidths = lineLayers.map((l) => l.strokeWidth ?? 4);
  const lineCaps = lineLayers.map((l) => l.lineCap ?? "round");
  const uniformWidth = uniformValue(widths);
  const uniformHeight = uniformValue(heights);
  const uniformColor = uniformValue(colors);
  const uniformRotation = uniformValue(rotations);
  const uniformOpacity = uniformValue(opacities);
  const uniformStrokeWidth = uniformValue(strokeWidths);
  const uniformLineCap = uniformValue(lineCaps);
  // When sizes/colors/rotation already differ across the selection, each
  // control still needs *some* starting value to render — average width/
  // height/rotation/opacity, and the first layer's color — moving it then
  // snaps every selected shape to that one shared value, same as any other
  // "apply to all" control.
  const displayWidth = uniformWidth ?? Math.round(widths.reduce((a, b) => a + b, 0) / widths.length);
  const displayHeight = uniformHeight ?? Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
  const displayColor = uniformColor ?? colors[0] ?? "#0021ff";
  const displayRotation = uniformRotation ?? Math.round(rotations.reduce((a, b) => a + b, 0) / rotations.length);
  const displayOpacity = uniformOpacity ?? Math.round(opacities.reduce((a, b) => a + b, 0) / opacities.length);
  const displayStrokeWidth = uniformStrokeWidth ?? (strokeWidths[0] ?? 4);
  const displayLineCap = uniformLineCap ?? (lineCaps[0] ?? "round");
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
            className="h-4.5 w-4.5 shrink-0 rounded-[5px] border-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.125)]"
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

      {/* Opacity — applies to every selected shape at once, same control as
          ShapeSelectionToolbar's single-layer Opacity popover. */}
      <AppTooltip content="Adjust opacity for all selected shapes">
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
            displayOpacity < 100 && "text-primary",
          )}
        >
          <EyeIcon size={15} />
          <span className="text-xs font-semibold">{displayOpacity}%</span>
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
            label={uniformOpacity !== undefined ? "Opacity — All Selected" : "Opacity — Mixed"}
            {...opacityDrag.dragHandleProps}
            pinned={opacityPinned}
            onTogglePin={() => setOpacityPinned((p) => !p)}
            onClose={() => setOpacityOpen(false)}
          />
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Opacity</span>
              <span className="text-xs text-muted-foreground">{displayOpacity}%</span>
            </div>
            <Range
              value={displayOpacity}
              min={0}
              max={100}
              onChange={(v) => onUpdateAll({ opacity: v })}
            />
            <div className="flex gap-1">
              {[100, 75, 50, 25].map((pct) => (
                <Chip
                  key={pct}
                  onClick={() => onUpdateAll({ opacity: pct })}
                  active={displayOpacity === pct}
                  className="flex-1 justify-center px-1 text-[10px]"
                >
                  {pct}%
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </FloatingDropdown>

      {/* Line Weight — if any selected shape is a line shape */}
      {hasLineShapes && (
        <>
          <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
          <AppTooltip content="Adjust line thickness for all selected line shapes">
            <button
              ref={strokeWidthTriggerRef}
              type="button"
              onClick={() => {
                setStrokeWidthOpen((wasOpen) => {
                  if (!wasOpen) {
                    strokeWidthDrag.reset();
                    setStrokeWidthPinned(false);
                  }
                  return !wasOpen;
                });
              }}
              className={cn(
                btnClass,
                strokeWidthOpen && "bg-secondary text-primary",
              )}
            >
              <span className="text-[11px] font-semibold">
                Weight: {uniformStrokeWidth !== undefined ? `${uniformStrokeWidth}px` : "Mixed"}
              </span>
            </button>
          </AppTooltip>
          <FloatingDropdown
            anchor={strokeWidthAnchor}
            offset={strokeWidthDrag.offset}
            align="center"
            pinned={strokeWidthPinned}
            onRequestClose={() => setStrokeWidthOpen(false)}
            triggerRef={strokeWidthTriggerRef}
          >
            <div
              data-nopan=""
              data-keep-text-editing=""
              className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
            >
              <DragHandle
                label="Line Thickness — All Selected"
                {...strokeWidthDrag.dragHandleProps}
                pinned={strokeWidthPinned}
                onTogglePin={() => setStrokeWidthPinned((p) => !p)}
                onClose={() => setStrokeWidthOpen(false)}
              />
              <div className="space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Line Weight</span>
                  <span className="text-xs font-mono text-muted-foreground">
                    {displayStrokeWidth}px
                  </span>
                </div>
                <Range
                  value={displayStrokeWidth}
                  min={1}
                  max={24}
                  step={1}
                  onChange={(v) => onUpdateAll({ strokeWidth: v })}
                />
                <div className="grid grid-cols-6 gap-1 pt-1">
                  {[1, 2, 4, 6, 8, 12].map((px) => (
                    <button
                      key={px}
                      type="button"
                      onClick={() => onUpdateAll({ strokeWidth: px })}
                      className={cn(
                        "rounded-md py-1 text-center font-mono text-[10px] font-semibold transition-colors border",
                        displayStrokeWidth === px
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 bg-secondary/50 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {px}px
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <span className="text-xs font-semibold text-foreground">End Style</span>
                  <div className="flex rounded-lg border border-border/70 bg-secondary/30 p-0.5">
                    {(
                      [
                        { value: "round" as const, label: "Round" },
                        { value: "butt" as const, label: "Square" },
                      ]
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onUpdateAll({ lineCap: value })}
                        className={cn(
                          "flex-1 rounded-md py-1.5 text-center text-xs font-medium transition-colors",
                          displayLineCap === value
                            ? "bg-background font-bold text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </FloatingDropdown>
        </>
      )}

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
            <button
              type="button"
              disabled={canArrange && !canArrange.canForward}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onArrange("forward")}
              className={cn(
                arrangeBtnClass,
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
                arrangeBtnClass,
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
                arrangeBtnClass,
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
                arrangeBtnClass,
                canArrange && !canArrange.canBack && "opacity-40 cursor-not-allowed pointer-events-none",
              )}
            >
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

            {/* Space evenly */}
            {onSpaceEvenly && (
              <div className="space-y-1.5 border-t border-border/60 pt-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Space evenly
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  <AppTooltip content="Space vertically">
                    <button
                      type="button"
                      onClick={() => onSpaceEvenly("vertical")}
                      className="flex h-8 items-center justify-start gap-2 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary active:scale-95"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <line x1="4" y1="4" x2="20" y2="4" />
                        <rect x="7" y="9" width="10" height="6" rx="1" />
                        <line x1="4" y1="20" x2="20" y2="20" />
                      </svg>
                      <span>Vertically</span>
                    </button>
                  </AppTooltip>
                  <AppTooltip content="Space horizontally">
                    <button
                      type="button"
                      onClick={() => onSpaceEvenly("horizontal")}
                      className="flex h-8 items-center justify-start gap-2 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary active:scale-95"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <line x1="4" y1="4" x2="4" y2="20" />
                        <rect x="9" y="7" width="6" height="10" rx="1" />
                        <line x1="20" y1="4" x2="20" y2="20" />
                      </svg>
                      <span>Horizontally</span>
                    </button>
                  </AppTooltip>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <AppTooltip content="Tidy up & distribute evenly in a grid">
                    <button
                      type="button"
                      onClick={() => onSpaceEvenly("tidy")}
                      className="flex h-8 items-center justify-start gap-2 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary active:scale-95"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <line x1="6" y1="5" x2="6" y2="19" />
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="18" y1="5" x2="18" y2="19" />
                      </svg>
                      <span>Tidy up</span>
                    </button>
                  </AppTooltip>
                </div>
              </div>
            )}
          </div>
        </div>
      </FloatingDropdown>

      {/* Dedicated Space Evenly Button */}
      {onSpaceEvenly && (
        <>
          <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
          <AppTooltip content="Space selected shapes/lines evenly">
            <button
              ref={spaceEvenlyTriggerRef}
              type="button"
              onClick={() => {
                setSpaceEvenlyOpen((wasOpen) => {
                  if (!wasOpen) {
                    spaceEvenlyDrag.reset();
                    setSpaceEvenlyPinned(false);
                  }
                  return !wasOpen;
                });
              }}
              className={cn(btnClass, spaceEvenlyOpen && "bg-secondary text-primary")}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="5" x2="6" y2="19" />
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="18" y1="5" x2="18" y2="19" />
              </svg>
              <span className="text-xs">Space evenly</span>
            </button>
          </AppTooltip>
          <FloatingDropdown
            anchor={spaceEvenlyAnchor}
            offset={spaceEvenlyDrag.offset}
            align="center"
            pinned={spaceEvenlyPinned}
            onRequestClose={() => setSpaceEvenlyOpen(false)}
            triggerRef={spaceEvenlyTriggerRef}
          >
            <div className="w-56 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
              <DragHandle
                label="Space Evenly"
                {...spaceEvenlyDrag.dragHandleProps}
                pinned={spaceEvenlyPinned}
                onTogglePin={() => setSpaceEvenlyPinned((p) => !p)}
                onClose={() => setSpaceEvenlyOpen(false)}
              />
              <div className="space-y-2 p-3">
                <div className="grid grid-cols-2 gap-1.5">
                  <AppTooltip content="Space vertically with equal gaps">
                    <button
                      type="button"
                      onClick={() => {
                        onSpaceEvenly("vertical");
                        setSpaceEvenlyOpen(false);
                      }}
                      className="flex h-9 items-center justify-start gap-2 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary active:scale-95"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <line x1="4" y1="4" x2="20" y2="4" />
                        <rect x="7" y="9" width="10" height="6" rx="1" />
                        <line x1="4" y1="20" x2="20" y2="20" />
                      </svg>
                      <span>Vertically</span>
                    </button>
                  </AppTooltip>
                  <AppTooltip content="Space horizontally with equal gaps">
                    <button
                      type="button"
                      onClick={() => {
                        onSpaceEvenly("horizontal");
                        setSpaceEvenlyOpen(false);
                      }}
                      className="flex h-9 items-center justify-start gap-2 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary active:scale-95"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <line x1="4" y1="4" x2="4" y2="20" />
                        <rect x="9" y="7" width="6" height="10" rx="1" />
                        <line x1="20" y1="4" x2="20" y2="20" />
                      </svg>
                      <span>Horizontally</span>
                    </button>
                  </AppTooltip>
                </div>
                <AppTooltip content="Tidy up & distribute evenly in a clean grid">
                  <button
                    type="button"
                    onClick={() => {
                      onSpaceEvenly("tidy");
                      setSpaceEvenlyOpen(false);
                    }}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary active:scale-95"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <line x1="6" y1="5" x2="6" y2="19" />
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="18" y1="5" x2="18" y2="19" />
                    </svg>
                    <span>Tidy up</span>
                  </button>
                </AppTooltip>
              </div>
            </div>
          </FloatingDropdown>
        </>
      )}

      {/* Dedicated Rotate Button */}
      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
      <AppTooltip content="Rotate selected shapes/lines">
        <button
          ref={rotateTriggerRef}
          type="button"
          onClick={() => {
            setRotateOpen((wasOpen) => {
              if (!wasOpen) {
                rotateDrag.reset();
                setRotatePinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(btnClass, rotateOpen && "bg-secondary text-primary")}
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
          </svg>
          <span className="text-xs">
            {uniformRotation !== undefined ? `${uniformRotation}°` : "Rotate"}
          </span>
        </button>
      </AppTooltip>
      <FloatingDropdown
        anchor={rotateAnchor}
        offset={rotateDrag.offset}
        align="center"
        pinned={rotatePinned}
        onRequestClose={() => setRotateOpen(false)}
        triggerRef={rotateTriggerRef}
      >
        <div className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
          <DragHandle
            label="Rotate — All Selected"
            {...rotateDrag.dragHandleProps}
            pinned={rotatePinned}
            onTogglePin={() => setRotatePinned((p) => !p)}
            onClose={() => setRotateOpen(false)}
          />
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Rotation</span>
              <span className="text-xs font-mono text-muted-foreground">{displayRotation}°</span>
            </div>
            <Range
              value={displayRotation}
              min={-180}
              max={180}
              step={1}
              onChange={(deg) => onUpdateAll({ rotation: deg })}
            />
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onUpdateAll({ rotation: 0 })}
                className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                0°
              </button>
              <button
                type="button"
                onClick={() => onUpdateAll({ rotation: 90 })}
                className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                90°
              </button>
              <button
                type="button"
                onClick={() => onUpdateAll({ rotation: 180 })}
                className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                180°
              </button>
              <button
                type="button"
                onClick={() => onUpdateAll({ rotation: 270 })}
                className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
              >
                270°
              </button>
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

      {/* Lock All/Duplicate All/Delete All dropped from this row for more
          space — Delete still works via the Delete/Backspace keyboard
          shortcut (QuoteCanvas's own selection handler, respects locked
          layers already); bulk Lock/Duplicate have no equivalent path left
          once removed here. */}
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
