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
  Tick02Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import {
  SHAPE_PRESETS,
  LINE_PRESETS,
  isLineShape,
  inferLineStyleFromKind,
  effectiveLineTriple,
  getMatchingShapePresetId,
  getShapeLabel,
  shapeCss,
  shapeSupportsRadius,
  type BoxStyle,
  type LineEndCapKind,
  type LineKind,
  type LineStrokeStyle,
  type LineType,
  type ShapeLayer,
} from "./types";
import { LineShapeSvg } from "./LineShapeSvg";
import {
  Chip,
  ColorPickerContent,
  DragHandle,
  Field,
  FloatingDropdown,
  FloatingToolbarPortal,
  GradientSwatchGrid,
  Range,
  Toggle,
  MinimizedToolbarButton,
  MinimizeToolbarButton,
  ToolbarDragGrip,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";

// The 10 Line Start / Line End options, in the same 5-per-row order as the
// reference picker: no marker, then arrow/circle/square/diamond each as an
// outline first and filled second, with t-bar tucked in front of the
// filled row. Shared by both the Start and End grids below.
const CAP_OPTIONS: LineEndCapKind[] = [
  "none",
  "arrow-open",
  "circle-hollow",
  "square-hollow",
  "diamond-hollow",
  "tbar",
  "arrow",
  "circle",
  "square",
  "diamond",
];

// One option's preview icon. Renders through LineShapeSvg itself (same
// renderer real shapes use) rather than a hand-drawn icon, so a picked
// option is guaranteed to look exactly like what lands on the canvas.
// "none" gets its own literal "no marker" glyph instead, since a plain
// line preview wouldn't read as distinct from every other option at a
// glance the way it needs to here.
function EndCapIcon({ capKind, side }: { capKind: LineEndCapKind; side: "start" | "end" }) {
  if (capKind === "none") {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" fill="none" className="text-muted-foreground">
        <circle cx={10} cy={10} r={7.5} stroke="currentColor" strokeWidth={1.75} />
        <line x1={5} y1={15} x2={15} y2={5} stroke="currentColor" strokeWidth={1.75} />
      </svg>
    );
  }
  // NOT preserveAspect here — that mode gives LineShapeSvg a fixed 100-wide
  // viewBox (sized for an actual canvas-length line) and lets it scale the
  // whole thing down to fit whatever box it's in. At a ~20px icon box that
  // scale-down crushed every marker — drawn at real pixel sizes like
  // radius≈4.5, headSize≈12 — down to a barely-there sliver, exactly the
  // "can't tell arrow from circle" problem. Passing an explicit small
  // width/height instead makes the viewBox match the icon box 1:1, so
  // markers render at their real intended size rather than getting
  // shrunk an extra ~80%.
  return (
    <div className="h-5 w-8">
      <LineShapeSvg
        kind="line-solid"
        color="currentColor"
        strokeWidth={4}
        width={32}
        height={20}
        lineStyle="solid"
        lineStartCap={side === "start" ? capKind : "none"}
        lineEndCap={side === "end" ? capKind : "none"}
      />
    </div>
  );
}

function StraightLineTypeIcon({ className }: { className?: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" className={className}>
      <line x1={4} y1={16} x2={16} y2={4} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx={4} cy={16} r={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <circle cx={16} cy={4} r={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function ElbowedLineTypeIcon({ className }: { className?: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M 5 11 L 5 16 Q 5 17 6 17 L 10 17 Q 11 17 11 16 L 11 4 Q 11 3 12 3 L 16 3 Q 17 3 17 4 L 17 6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx={5} cy={11} r={1.5} fill="none" stroke="currentColor" strokeWidth={1.25} />
      <circle cx={17} cy={6} r={1.5} fill="none" stroke="currentColor" strokeWidth={1.25} />
      <rect x={4.25} y={13} width={1.5} height={2.5} rx={0.5} fill="currentColor" />
      <rect x={7.5} y={16.25} width={2.5} height={1.5} rx={0.5} fill="currentColor" />
      <rect x={10.25} y={9} width={1.5} height={2.5} rx={0.5} fill="currentColor" />
      <rect x={13.5} y={2.25} width={2.5} height={1.5} rx={0.5} fill="currentColor" />
      <rect x={16.25} y={4.5} width={1.5} height={1.5} rx={0.5} fill="currentColor" />
    </svg>
  );
}

function CurvedLineTypeIcon({ className }: { className?: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M 4 15 Q 10 4 16 15"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx={4} cy={15} r={1.75} fill="none" stroke="currentColor" strokeWidth={1.25} />
      <circle cx={10} cy={4} r={1.75} fill="none" stroke="currentColor" strokeWidth={1.25} />
      <circle cx={16} cy={15} r={1.75} fill="none" stroke="currentColor" strokeWidth={1.25} />
    </svg>
  );
}

const LINE_TYPE_OPTIONS: { value: LineType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "straight", label: "Straight", icon: StraightLineTypeIcon },
  { value: "elbowed", label: "Elbowed", icon: ElbowedLineTypeIcon },
  { value: "curved", label: "Curved", icon: CurvedLineTypeIcon },
];

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
  const [lineTypeOpen, setLineTypeOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [strokeWidthOpen, setStrokeWidthOpen] = useState(false);
  const [endsOpen, setEndsOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);

  const [shapePickerPinned, setShapePickerPinned] = useState(false);
  const [lineTypePinned, setLineTypePinned] = useState(false);
  const [stylePinned, setStylePinned] = useState(false);
  const [radiusPinned, setRadiusPinned] = useState(false);
  const [strokeWidthPinned, setStrokeWidthPinned] = useState(false);
  const [endsPinned, setEndsPinned] = useState(false);
  const [opacityPinned, setOpacityPinned] = useState(false);
  const [shadowPinned, setShadowPinned] = useState(false);
  const [arrangePinned, setArrangePinned] = useState(false);

  // The toolbar row's own drag offset — distinct from every popover's own
  // (shapeDrag, styleDrag, etc. below, each dragging a different opened
  // dropdown) — see ToolbarDragGrip's own comment in ui.tsx. Reset to
  // {0,0} on every minimize/expand transition (see the handlers below) —
  // it represents "drag since entering the CURRENT state" for whichever
  // of the two very different coordinate systems (expanded: relative
  // transform off the docked position; minimized: fixed screen position
  // off minimizeBaseRef) is currently active, not one continuous value
  // across both.
  const toolbarDrag = useDraggableOffset("shape-toolbar");
  const [minimized, setMinimized] = useState(false);
  // The toolbar's own on-screen position at the instant it was minimized
  // — see MinimizedToolbarButton's own comment in ui.tsx for why this
  // (not the expanded row's transform-relative offset) is what the
  // portaled, position:fixed minimized icon is drawn from.
  const minimizeBaseRef = useRef({ top: 0, left: 0 });
  const shapeDrag = useDraggableOffset();
  const lineTypeDrag = useDraggableOffset();
  const styleDrag = useDraggableOffset();
  const radiusDrag = useDraggableOffset();
  const strokeWidthDrag = useDraggableOffset();
  const endsDrag = useDraggableOffset();
  const opacityDrag = useDraggableOffset();
  const shadowDrag = useDraggableOffset();
  const arrangeDrag = useDraggableOffset();

  const shapeTriggerRef = useRef<HTMLButtonElement>(null);
  const lineTypeTriggerRef = useRef<HTMLButtonElement>(null);
  const styleTriggerRef = useRef<HTMLButtonElement>(null);
  const radiusTriggerRef = useRef<HTMLButtonElement>(null);
  const strokeWidthTriggerRef = useRef<HTMLButtonElement>(null);
  const endsTriggerRef = useRef<HTMLButtonElement>(null);
  const opacityTriggerRef = useRef<HTMLButtonElement>(null);
  const shadowTriggerRef = useRef<HTMLButtonElement>(null);
  const arrangeTriggerRef = useRef<HTMLButtonElement>(null);
  const shapeAnchor = useStableAnchor(shapePickerOpen, shapeTriggerRef);
  const lineTypeAnchor = useStableAnchor(lineTypeOpen, lineTypeTriggerRef);
  const styleAnchor = useStableAnchor(styleOpen, styleTriggerRef);
  const radiusAnchor = useStableAnchor(radiusOpen, radiusTriggerRef);
  const strokeWidthAnchor = useStableAnchor(strokeWidthOpen, strokeWidthTriggerRef);
  const endsAnchor = useStableAnchor(endsOpen, endsTriggerRef);
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
    shapePickerOpen ||
    lineTypeOpen ||
    styleOpen ||
    radiusOpen ||
    strokeWidthOpen ||
    endsOpen ||
    opacityOpen ||
    shadowOpen ||
    arrangeOpen;
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

  // Collapsed form — see MinimizedToolbarButton's own comment in ui.tsx.
  // Not for the `detached` (hidden, kept-mounted-for-its-popovers) case:
  // that one still needs its normal invisible render below regardless of
  // `minimized`, same reasoning as every other early branch here.
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

      {/* 1. Shape / Line Morphing Picker Popover */}
      <AppTooltip content="Change element geometry or line style">
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
          {isLineShape(layer.kind) ? (
            <div className="h-4 w-6 shrink-0 flex items-center text-primary">
              <LineShapeSvg
                kind={layer.kind}
                color={layer.color}
                gradient={layer.style === "gradient" ? (layer.gradient ?? "linear-gradient(135deg, #6366f1, #ec4899)") : undefined}
                strokeWidth={2.5}
                preserveAspect={true}
                lineCap={layer.lineCap ?? "round"}
                lineStyle={layer.lineStyle}
                lineStartCap={layer.lineStartCap}
                lineEndCap={layer.lineEndCap}
                lineType={layer.lineType}
              />
            </div>
          ) : (
            <span
              className="h-4 w-4 shrink-0 bg-primary"
              style={shapeCss(layer.kind, layer.radius >= 80 ? 999 : Math.min(layer.radius, 6))}
            />
          )}
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
          className="w-72 max-md:w-full max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl"
        >
          <DragHandle
            label={isLineShape(layer.kind) ? "Lines" : "Shapes"}
            {...shapeDrag.dragHandleProps}
            pinned={shapePickerPinned}
            onTogglePin={() => setShapePickerPinned((p) => !p)}
            onClose={() => setShapePickerOpen(false)}
          />
          <div className="space-y-4 p-3">
            {/* Only one of these two sections ever shows, scoped to what's
                currently selected — a line only offers other line styles,
                a shape only offers other shapes. Switching category
                (shape <-> line) isn't offered here at all; add a fresh
                element from the Elements panel instead. */}
            {isLineShape(layer.kind) ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-foreground">Lines</span>
                  <span className="text-[10px] text-muted-foreground">{LINE_PRESETS.length} styles</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {LINE_PRESETS.map((preset) => {
                    // Compares the SAME (style, start, end) triple the Line
                    // Style panel and Start/End pickers read/write (see
                    // effectiveLineTriple's own comment) rather than raw
                    // `kind` — so picking a preset here and picking one
                    // from those other controls stay in sync with each
                    // other regardless of which one a shape's own
                    // lineStyle/kind fields actually carry.
                    const presetTriple = inferLineStyleFromKind(preset.kind);
                    const currentTriple = effectiveLineTriple(layer);
                    const isActive =
                      currentTriple.style === presetTriple.style &&
                      currentTriple.start === presetTriple.start &&
                      currentTriple.end === presetTriple.end;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          onUpdate({
                            lineStyle: presetTriple.style,
                            lineStartCap: presetTriple.start,
                            lineEndCap: presetTriple.end,
                            height: typeof layer.height === "number" ? layer.height : 30,
                            strokeWidth: layer.strokeWidth ?? 4,
                          });
                          setShapePickerOpen(false);
                        }}
                        title={preset.label}
                        className={cn(
                          "flex h-10 items-center justify-center rounded-lg border p-1.5 transition-all",
                          isActive
                            ? "border-primary bg-primary/20 text-primary ring-2 ring-primary/60 shadow-sm"
                            : "border-border bg-secondary/50 text-foreground hover:border-primary hover:text-primary",
                        )}
                      >
                        <LineShapeSvg kind={preset.kind} strokeWidth={2.5} preserveAspect={true} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-foreground">Shapes</span>
                  <span className="text-[10px] text-muted-foreground">{SHAPE_PRESETS.length} shapes</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
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
            )}
          </div>
        </div>
      </FloatingDropdown>

      {/* 1b. Line Type Popover (Straight / Elbowed / Curved) — lines only.
          Used to live buried inside the Stroke Styles popover below; pulled
          out to its own top-level toolbar button since which of the three
          fundamentally different path shapes a line uses is at least as
          important a property as its dash pattern or end caps. */}
      {isLineShape(layer.kind) ? (
        <>
          <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
          <AppTooltip content="Straight, elbowed, or curved line">
            <button
              ref={lineTypeTriggerRef}
              type="button"
              onClick={() => {
                setLineTypeOpen((wasOpen) => {
                  if (!wasOpen) {
                    lineTypeDrag.reset();
                    setLineTypePinned(false);
                  }
                  return !wasOpen;
                });
              }}
              className={cn(btnClass, lineTypeOpen && "bg-secondary text-primary")}
            >
              {(() => {
                const current = LINE_TYPE_OPTIONS.find((lt) => lt.value === (layer.lineType ?? "straight")) ?? LINE_TYPE_OPTIONS[0]!;
                const Icon = current.icon;
                return <Icon className="text-foreground" />;
              })()}
              <span className="text-xs font-semibold">
                {(LINE_TYPE_OPTIONS.find((lt) => lt.value === (layer.lineType ?? "straight")) ?? LINE_TYPE_OPTIONS[0]!).label}
              </span>
              <span className="text-[10px] text-muted-foreground">▾</span>
            </button>
          </AppTooltip>
          <FloatingDropdown
            anchor={lineTypeAnchor}
            offset={lineTypeDrag.offset}
            align="start"
            pinned={lineTypePinned}
            onRequestClose={() => setLineTypeOpen(false)}
            triggerRef={lineTypeTriggerRef}
          >
            <div
              data-nopan=""
              data-keep-text-editing=""
              className="w-56 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
            >
              <DragHandle
                label="Line Type"
                {...lineTypeDrag.dragHandleProps}
                pinned={lineTypePinned}
                onTogglePin={() => setLineTypePinned((p) => !p)}
                onClose={() => setLineTypeOpen(false)}
              />
              <div className="space-y-1 p-3">
                {LINE_TYPE_OPTIONS.map((lt) => {
                  const active = (layer.lineType ?? "straight") === lt.value;
                  const Icon = lt.icon;
                  return (
                    <button
                      key={lt.value}
                      type="button"
                      onClick={() => {
                        if (layer.lineStyle === undefined) {
                          const inferred = inferLineStyleFromKind(layer.kind as LineKind);
                          onUpdate({
                            lineType: lt.value,
                            lineStyle: inferred.style,
                            lineStartCap: inferred.start,
                            lineEndCap: inferred.end,
                            lineWaypoints: undefined,
                            ...(lt.value !== "straight" && (!layer.height || layer.height < 40) ? { height: 60 } : null),
                          });
                        } else {
                          onUpdate({
                            lineType: lt.value,
                            lineWaypoints: undefined,
                            ...(lt.value !== "straight" && (!layer.height || layer.height < 40) ? { height: 60 } : null),
                          });
                        }
                        setLineTypeOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium transition-colors",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={active ? "text-foreground" : "text-muted-foreground"} />
                        <span className={active ? "text-foreground font-semibold" : "text-foreground/90"}>
                          {lt.label}
                        </span>
                      </div>
                      {active && <Tick02Icon size={16} className="text-foreground" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </FloatingDropdown>
        </>
      ) : null}

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
            className={cn(
              "h-4.5 w-4.5 shrink-0 rounded-full",
              // Outline fill needs a REAL visible border to preview as
              // "outline" (a ring around empty space) — the borderless
              // inset-shadow treatment every other swatch/preview uses now
              // wouldn't read as an outline at all with nothing behind it.
              currentStyle === "outline" ? "border-2" : "border-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.125)]",
            )}
            style={{
              background:
                currentStyle === "gradient"
                  ? layer.gradient ?? "linear-gradient(135deg, #6366f1, #ec4899)"
                  : currentStyle === "outline"
                    ? "transparent"
                    : layer.color,
              borderColor: currentStyle === "outline" ? layer.color : undefined,
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
                <GradientSwatchGrid
                  value={layer.gradient}
                  onChange={(v) => onUpdate({ gradient: v })}
                />
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

      {/* 3. Corner Radius (if supported) OR Line Thickness (if line) */}
      {isLineShape(layer.kind) ? (
        <>
          <AppTooltip content="Line pattern, ends, and thickness">
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
              <span className="text-[11px] font-semibold">Stroke Styles</span>
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
                label="Stroke Styles"
                {...strokeWidthDrag.dragHandleProps}
                pinned={strokeWidthPinned}
                onTogglePin={() => setStrokeWidthPinned((p) => !p)}
                onClose={() => setStrokeWidthOpen(false)}
              />
              <div className="space-y-4 p-3">
                {/* Stroke pattern — picking one seeds lineStartCap/lineEndCap
                    from the shape's current legacy `kind` the first time
                    (see inferLineStyleFromKind's own comment), so switching
                    onto the new independent model doesn't change how the
                    shape looks until Start/End is actually touched. */}
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { value: "solid" as const, dash: undefined },
                      { value: "dash-long" as const, dash: "6 4" },
                      { value: "dash-short" as const, dash: "2.5 2.5" },
                      { value: "dotted" as const, dash: "0.1 3.5" },
                    ]
                  ).map(({ value, dash }) => {
                    const active = effectiveLineTriple(layer).style === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          if (layer.lineStyle === undefined) {
                            const inferred = inferLineStyleFromKind(layer.kind as LineKind);
                            onUpdate({ lineStyle: value, lineStartCap: inferred.start, lineEndCap: inferred.end });
                          } else {
                            onUpdate({ lineStyle: value });
                          }
                        }}
                        className={cn(
                          "flex h-9 items-center justify-center rounded-xl border transition-colors",
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border/70 bg-secondary/40 hover:border-primary/50",
                        )}
                        title={value.replace("-", " ")}
                      >
                        <svg width={28} height={2} className="overflow-visible">
                          <line
                            x1={0}
                            y1={1}
                            x2={28}
                            y2={1}
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeDasharray={dash}
                            strokeLinecap={dash ? "round" : undefined}
                            className={active ? "text-primary" : "text-foreground"}
                          />
                        </svg>
                      </button>
                    );
                  })}
                </div>

                <Toggle
                  label="Rounded end points"
                  checked={(layer.lineCap ?? "round") === "round"}
                  onChange={(v) => onUpdate({ lineCap: v ? "round" : "butt" })}
                />

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-foreground">Stroke weight</span>
                  <Range
                    value={layer.strokeWidth ?? 4}
                    min={1}
                    max={24}
                    step={1}
                    onChange={(v) => onUpdate({ strokeWidth: v })}
                  />
                </div>
              </div>
            </div>
          </FloatingDropdown>

          <AppTooltip content="Arrowheads and end markers">
            <button
              ref={endsTriggerRef}
              type="button"
              onClick={() => {
                setEndsOpen((wasOpen) => {
                  if (!wasOpen) {
                    endsDrag.reset();
                    setEndsPinned(false);
                  }
                  return !wasOpen;
                });
              }}
              className={cn(btnClass, endsOpen && "bg-secondary text-primary")}
            >
              <span className="text-[11px] font-semibold">Line Ends</span>
            </button>
          </AppTooltip>
          <FloatingDropdown
            anchor={endsAnchor}
            offset={endsDrag.offset}
            align="center"
            pinned={endsPinned}
            onRequestClose={() => setEndsOpen(false)}
            triggerRef={endsTriggerRef}
          >
            <div
              data-nopan=""
              data-keep-text-editing=""
              className="w-80 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
            >
              <DragHandle
                label="Line Ends"
                {...endsDrag.dragHandleProps}
                pinned={endsPinned}
                onTogglePin={() => setEndsPinned((p) => !p)}
                onClose={() => setEndsOpen(false)}
              />
              <div className="space-y-4 p-3">
                {(["start", "end"] as const).map((side) => {
                  const triple = effectiveLineTriple(layer);
                  const current = side === "start" ? triple.start : triple.end;
                  return (
                    <div key={side}>
                      <span className="mb-1.5 block text-xs font-semibold text-foreground">
                        {side === "start" ? "Line Start" : "Line End"}
                      </span>
                      <div className="grid grid-cols-5 gap-2">
                        {CAP_OPTIONS.map((capKind) => {
                          const active = current === capKind;
                          return (
                            <button
                              key={capKind}
                              type="button"
                              onClick={() => {
                                // First touch of Start/End on a shape still
                                // on the legacy `kind` model seeds lineStyle
                                // + the OTHER end's cap from that kind first
                                // (same pattern the Line Style pattern row
                                // uses) — so setting just one end doesn't
                                // silently reset the other end's existing
                                // decoration back to "none".
                                if (layer.lineStyle === undefined) {
                                  const inferred = inferLineStyleFromKind(layer.kind as LineKind);
                                  onUpdate({
                                    lineStyle: inferred.style,
                                    lineStartCap: side === "start" ? capKind : inferred.start,
                                    lineEndCap: side === "end" ? capKind : inferred.end,
                                  });
                                } else if (side === "start") {
                                  onUpdate({ lineStartCap: capKind });
                                } else {
                                  onUpdate({ lineEndCap: capKind });
                                }
                              }}
                              title={capKind.replace("-", " ")}
                              className={cn(
                                "flex h-12 items-center justify-center rounded-xl border-2 transition-colors",
                                active
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border/70 bg-secondary/40 text-foreground hover:border-primary/50",
                              )}
                            >
                              <EndCapIcon capKind={capKind} side={side} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </FloatingDropdown>
        </>
      ) : supportsRadius ? (
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
