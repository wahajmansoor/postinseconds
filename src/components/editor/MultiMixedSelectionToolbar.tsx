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
  Search01Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  Tick02Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import { FONTS, normalizeColorToHex, type ShapeAlignEdge, type TextLayer } from "./types";
import type { ShapeArrangeDirection } from "./MultiShapeSelectionToolbar";
import {
  ColorPickerContent,
  DragHandle,
  FloatingDropdown,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";
import { loadGoogleFont } from "@/lib/fontLoader";

// Returns the shared value across every item, or undefined when they differ.
function uniformValue<T>(values: T[]): T | undefined {
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : undefined;
}

// ----- Quick top-3 swatches (same palette as TextSelectionToolbar) ------
const TOP_COLORS = [
  "#000000", "#ffffff", "#f43f5e", "#f97316", "#f59e0b", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b",
];

interface MultiMixedSelectionToolbarProps {
  /** ALL selected layers, across all kinds */
  selectedIds: { kind: "text" | "image" | "shape"; id: string }[];
  /** Text layers that are part of the selection (may be empty if none selected) */
  textLayers: TextLayer[];
  /** Whether ALL selected layers are text layers */
  allText: boolean;
  canvasWidth: number;
  canvasHeight: number;
  /** Align all selected layers against the canvas */
  onAlign: (edge: ShapeAlignEdge) => void;
  /** Arrange all selected layers in the z-order */
  onArrange: (direction: ShapeArrangeDirection) => void;
  canArrange?: { canForward: boolean; canBackward: boolean; canFront: boolean; canBack: boolean } | undefined;
  /** Apply a patch to every selected text layer (only fired when allText=true) */
  onUpdateAllTexts?: ((patch: Partial<Omit<TextLayer, "id">>) => void) | undefined;
  onDeleteAll?: (() => void) | undefined;
  onToggleLockAll?: (() => void) | undefined;
  allLocked?: boolean | undefined;
  detached?: boolean | undefined;
  onAnyPopoverOpenChange?: ((open: boolean) => void) | undefined;
}

export function MultiMixedSelectionToolbar({
  selectedIds,
  textLayers,
  allText,
  canvasWidth,
  canvasHeight,
  onAlign,
  onArrange,
  canArrange,
  onUpdateAllTexts,
  onDeleteAll,
  onToggleLockAll,
  allLocked = false,
  detached = false,
  onAnyPopoverOpenChange,
}: MultiMixedSelectionToolbarProps) {
  // ---- popover open / pin / drag states ----
  const [alignOpen, setAlignOpen]     = useState(false);
  const [alignPinned, setAlignPinned] = useState(false);
  const alignDrag = useDraggableOffset();
  const alignTriggerRef = useRef<HTMLButtonElement>(null);
  const alignAnchor = useStableAnchor(alignOpen, alignTriggerRef);

  const [arrangeOpen, setArrangeOpen]     = useState(false);
  const [arrangePinned, setArrangePinned] = useState(false);
  const arrangeDrag = useDraggableOffset();
  const arrangeTriggerRef = useRef<HTMLButtonElement>(null);
  const arrangeAnchor = useStableAnchor(arrangeOpen, arrangeTriggerRef);

  // Text-only: Color
  const [colorOpen, setColorOpen]     = useState(false);
  const [colorPinned, setColorPinned] = useState(false);
  const colorDrag = useDraggableOffset();
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const colorAnchor = useStableAnchor(colorOpen, colorTriggerRef);

  // Text-only: Font
  const [fontOpen, setFontOpen]       = useState(false);
  const [fontPinned, setFontPinned]   = useState(false);
  const [fontSearch, setFontSearch]   = useState("");
  const fontDrag = useDraggableOffset();
  const fontTriggerRef = useRef<HTMLButtonElement>(null);
  const fontAnchor = useStableAnchor(fontOpen, fontTriggerRef);

  const anyPopoverOpen = alignOpen || arrangeOpen || colorOpen || fontOpen;
  useEffect(() => {
    onAnyPopoverOpenChange?.(anyPopoverOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPopoverOpen]);

  // Persist last rendered position while detached so the ghost stays put
  const rowRef = useRef<HTMLDivElement>(null);
  const lastLiveRectRef = useRef<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!detached && rowRef.current) {
      const r = rowRef.current.getBoundingClientRect();
      lastLiveRectRef.current = { top: r.top, left: r.left };
    }
  });

  // ---- Derived text values ----
  const textColors    = textLayers.map((t) => normalizeColorToHex(t.color ?? "#ffffff"));
  const textFamilies  = textLayers.map((t) => t.fontFamily ?? "");
  const uniformColor  = uniformValue(textColors);
  const uniformFont   = uniformValue(textFamilies);
  const displayColor  = uniformColor ?? textColors[0] ?? "#ffffff";

  const fontLabel = (() => {
    if (!allText || textLayers.length === 0) return null;
    if (!uniformFont) return "Mixed Fonts";
    const found = FONTS.find((f) => f.value === uniformFont);
    return found?.label ?? uniformFont.split(",")[0]?.replace(/['"]/g, "").trim() ?? "Text Font";
  })();

  // Pre-load every font in the filtered list when the font popover opens
  useEffect(() => {
    if (!fontOpen || !allText) return;
    const visible = FONTS.filter((f) =>
      !fontSearch || f.label.toLowerCase().includes(fontSearch.toLowerCase()),
    );
    visible.forEach((f) => loadGoogleFont(f.value));
  }, [fontOpen, fontSearch, allText]);

  // Button class helpers (matching MultiShapeSelectionToolbar conventions)
  const btnClass =
    "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors hover:bg-secondary";
  const arrangeBtnClass =
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-border/60 bg-secondary/40 px-2 py-2.5 text-[10px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary";
  const alignBtnClass =
    "flex h-9 flex-1 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-foreground transition-colors hover:border-primary hover:text-primary";

  const selectionLabel = `${selectedIds.length} Layers Selected`;

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
      {/* Selection count label */}
      <span className="shrink-0 px-1.5 text-xs font-semibold text-muted-foreground">
        {selectionLabel}
      </span>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* ──── Text-only: Color ──── */}
      {allText && onUpdateAllTexts && (
        <>
          <AppTooltip content="Text color for all selected layers">
            <button
              ref={colorTriggerRef}
              type="button"
              onClick={() => {
                setColorOpen((was) => {
                  if (!was) { colorDrag.reset(); setColorPinned(false); }
                  return !was;
                });
              }}
              className={cn(
                btnClass,
                "border border-border/60 bg-secondary/40 text-foreground",
                colorOpen && "border-primary text-primary",
              )}
            >
              {/* Color swatch — splits if mixed */}
              <div className="relative h-4.5 w-4.5 shrink-0 overflow-hidden rounded-full border border-border shadow-xs">
                {uniformColor ? (
                  <div className="absolute inset-0" style={{ background: displayColor }} />
                ) : (
                  <>
                    <div className="absolute inset-0 left-0 w-1/2" style={{ background: textColors[0] ?? "#fff" }} />
                    <div className="absolute inset-0 left-1/2 w-1/2" style={{ background: textColors[1] ?? "#000" }} />
                  </>
                )}
              </div>
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
            <div className="w-auto max-md:w-full overflow-hidden rounded-3xl border border-border bg-background shadow-2xl backdrop-blur-xl">
              <DragHandle
                label={uniformColor ? "Text Color — All Selected" : "Text Color — Mixed"}
                {...colorDrag.dragHandleProps}
                pinned={colorPinned}
                onTogglePin={() => setColorPinned((p) => !p)}
                onClose={() => setColorOpen(false)}
              />
              {/* Quick swatches */}
              <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
                {TOP_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => onUpdateAllTexts({ color: c })}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                      displayColor === c ? "border-primary" : "border-transparent",
                    )}
                    style={{ background: c, boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}
                  />
                ))}
              </div>
              <ColorPickerContent
                value={displayColor}
                onChange={(c) => onUpdateAllTexts({ color: c })}
              />
            </div>
          </FloatingDropdown>
        </>
      )}

      {/* ──── Text-only: Font Family ──── */}
      {allText && onUpdateAllTexts && fontLabel !== null && (
        <>
          <AppTooltip content="Font for all selected text layers">
            <button
              ref={fontTriggerRef}
              type="button"
              onClick={() => {
                setFontOpen((was) => {
                  if (!was) { fontDrag.reset(); setFontPinned(false); setFontSearch(""); }
                  return !was;
                });
              }}
              className={cn(
                btnClass,
                "max-w-[130px] border border-border/60 bg-secondary/40 text-foreground",
                fontOpen && "border-primary text-primary",
              )}
            >
              <span className="truncate text-xs">{fontLabel}</span>
            </button>
          </AppTooltip>
          <FloatingDropdown
            anchor={fontAnchor}
            offset={fontDrag.offset}
            align="center"
            pinned={fontPinned}
            onRequestClose={() => setFontOpen(false)}
            triggerRef={fontTriggerRef}
          >
            <div className="flex w-64 max-md:w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
              <DragHandle
                label="Font — All Selected Text"
                {...fontDrag.dragHandleProps}
                pinned={fontPinned}
                onTogglePin={() => setFontPinned((p) => !p)}
                onClose={() => setFontOpen(false)}
              />
              {/* Search */}
              <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                <Search01Icon size={14} className="shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={fontSearch}
                  onChange={(e) => setFontSearch(e.target.value)}
                  placeholder="Search fonts…"
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
              {/* Font list */}
              <div className="flex max-h-64 flex-col overflow-y-auto">
                {FONTS.filter((f) =>
                  !fontSearch || f.label.toLowerCase().includes(fontSearch.toLowerCase()),
                ).map((f) => {
                  const isActive = uniformFont === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => {
                        onUpdateAllTexts({ fontFamily: f.value });
                        loadGoogleFont(f.value);
                      }}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-secondary",
                        isActive && "bg-primary/10 text-primary",
                      )}
                    >
                      <span style={{ fontFamily: f.value }}>{f.label}</span>
                      {isActive && <Tick02Icon size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </FloatingDropdown>
        </>
      )}

      {allText && onUpdateAllTexts && (
        <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
      )}

      {/* ──── Arrange (z-order) ──── */}
      <AppTooltip content="Arrange: layer order for all selected layers">
        <button
          ref={arrangeTriggerRef}
          type="button"
          onClick={() => {
            setArrangeOpen((was) => {
              if (!was) { arrangeDrag.reset(); setArrangePinned(false); }
              return !was;
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

      {/* ──── Align ──── */}
      <AppTooltip content="Align every selected layer to the canvas">
        <button
          ref={alignTriggerRef}
          type="button"
          onClick={() => {
            setAlignOpen((was) => {
              if (!was) { alignDrag.reset(); setAlignPinned(false); }
              return !was;
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

      {/* ──── Lock / Delete ──── */}
      {onToggleLockAll && (
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
      )}

      {onDeleteAll && (
        <AppTooltip content="Delete all selected layers">
          <button
            type="button"
            onClick={onDeleteAll}
            className={cn(btnClass, "px-2 text-destructive hover:bg-destructive/10 hover:text-destructive")}
          >
            <Delete02Icon size={15} />
          </button>
        </AppTooltip>
      )}
    </div>
  );
}
