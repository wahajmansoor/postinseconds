import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  LayerBringForwardIcon,
  LayerBringToFrontIcon,
  LayerSendBackwardIcon,
  LayerSendToBackIcon,
  Search01Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  Upload01Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import { useCustomFonts } from "@/hooks/useCustomFonts";
import { CustomFontsDialog } from "./CustomFontsDialog";
import {
  findFontOption,
  fontFamilyToLabel,
  getFontPool,
  loadGoogleFontsCatalog,
  normalizeColorToHex,
  searchAllFonts,
  type FontOption,
  type ShapeAlignEdge,
  type SpaceEvenlyDirection,
  type TextLayer,
} from "./types";
import type { ShapeArrangeDirection } from "./MultiShapeSelectionToolbar";
import {
  ColorPickerContent,
  DragHandle,
  FloatingDropdown,
  FloatingToolbarPortal,
  fontDividerLabelAt,
  FontListDivider,
  FontRow,
  Range,
  MinimizedToolbarButton,
  MinimizeToolbarButton,
  ToolbarDragGrip,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { cn } from "@/lib/utils";

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
  /** Spaces selected layers evenly (vertically, horizontally, or tidy up). */
  onSpaceEvenly?: (direction: SpaceEvenlyDirection) => void;
  /** Rotates all selected layers by degree delta */
  onRotate?: (degDelta: number) => void;
  /** Arrange all selected layers in the z-order */
  onArrange: (direction: ShapeArrangeDirection) => void;
  canArrange?: { canForward: boolean; canBackward: boolean; canFront: boolean; canBack: boolean } | undefined;
  /** Apply a patch to every selected text layer (only fired when allText=true) */
  onUpdateAllTexts?: ((patch: Partial<Omit<TextLayer, "id">>) => void) | undefined;
  onDuplicateAll?: (() => void) | undefined;
  onDeleteAll?: (() => void) | undefined;
  onToggleLockAll?: (() => void) | undefined;
  allLocked?: boolean | undefined;
  detached?: boolean | undefined;
  onAnyPopoverOpenChange?: ((open: boolean) => void) | undefined;
  // Same reasoning as onOpenCrop/onOpenErase on ImageSelectionToolbar: when
  // provided, index.tsx renders CustomFontsDialog itself, driven by its own
  // top-level state, instead of this toolbar owning that state locally —
  // this toolbar can unmount/remount as canvas selection changes while the
  // dialog is open, which would reset local state and close the dialog out
  // from under the user (confirmed as the real cause of exactly that bug
  // report). Falls back to a local instance if not provided.
  onOpenCustomFonts?: (() => void) | undefined;
  // Fonts already used elsewhere in the current canvas (see
  // getCanvasFontsInUse in types.ts) — computed once in index.tsx (which
  // has the full EditorState) and passed down, same reasoning as
  // customFonts above but for canvas rather than uploaded fonts.
  canvasFonts?: FontOption[] | null;
}

export function MultiMixedSelectionToolbar({
  selectedIds,
  textLayers,
  allText,
  canvasWidth,
  canvasHeight,
  onAlign,
  onSpaceEvenly,
  onRotate,
  onArrange,
  canArrange,
  onUpdateAllTexts,
  onDuplicateAll,
  onDeleteAll,
  onToggleLockAll,
  allLocked = false,
  detached = false,
  onAnyPopoverOpenChange,
  onOpenCustomFonts,
  canvasFonts,
}: MultiMixedSelectionToolbarProps) {
  const isMobile = useIsMobile();
  // ---- popover open / pin / drag states ----
  const [alignOpen, setAlignOpen]         = useState(false);
  const [alignPinned, setAlignPinned]     = useState(false);
  // The toolbar row's own drag offset — see ToolbarDragGrip's own comment
  // in ui.tsx.
  const toolbarDrag = useDraggableOffset("multi-mixed-toolbar");
  const [minimized, setMinimized] = useState(false);
  // See minimizeBaseRef's own comment in ShapeSelectionToolbar.tsx.
  const minimizeBaseRef = useRef({ top: 0, left: 0 });
  const alignDrag = useDraggableOffset();
  const alignTriggerRef = useRef<HTMLButtonElement>(null);
  const alignAnchor = useStableAnchor(alignOpen, alignTriggerRef);

  // Space Evenly
  const [spaceEvenlyOpen, setSpaceEvenlyOpen] = useState(false);
  const [spaceEvenlyPinned, setSpaceEvenlyPinned] = useState(false);
  const spaceEvenlyDrag = useDraggableOffset();
  const spaceEvenlyTriggerRef = useRef<HTMLButtonElement>(null);
  const spaceEvenlyAnchor = useStableAnchor(spaceEvenlyOpen, spaceEvenlyTriggerRef);

  // Rotate
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotatePinned, setRotatePinned] = useState(false);
  const [rotateAngle, setRotateAngle] = useState(0);
  const rotateDrag = useDraggableOffset();
  const rotateTriggerRef = useRef<HTMLButtonElement>(null);
  const rotateAnchor = useStableAnchor(rotateOpen, rotateTriggerRef);

  // Arrange
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
  // Full Google Fonts catalog (~1,900 families beyond the curated FONTS
  // list) — loaded lazily once this popover actually opens. See
  // loadGoogleFontsCatalog/searchAllFonts in types.ts.
  const [fontCatalog, setFontCatalog] = useState<FontOption[] | null>(null);
  const { options: customFontOptions } = useCustomFonts();
  const [customFontsDialogOpen, setCustomFontsDialogOpen] = useState(false);
  useEffect(() => {
    if (!fontOpen) return;
    if (fontCatalog) return;
    let cancelled = false;
    loadGoogleFontsCatalog().then((list) => {
      if (!cancelled) setFontCatalog(list);
    });
    return () => {
      cancelled = true;
    };
  }, [fontOpen, fontCatalog]);

  const anyPopoverOpen = alignOpen || spaceEvenlyOpen || rotateOpen || arrangeOpen || colorOpen || fontOpen;
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
    const found = findFontOption(getFontPool(fontCatalog, customFontOptions, canvasFonts), uniformFont);
    return found?.label ?? fontFamilyToLabel(uniformFont);
  })();

  // Alphabetical, full-catalog-aware font list (see searchAllFonts in
  // types.ts) — browsable in full once fontCatalog has loaded, not just
  // searchable. No bulk preload effect for it: with ~1,900 possible rows,
  // eagerly fetching a stylesheet for every one on open would be a real
  // network/jank hit. Each row (FontRow, in ui.tsx) instead loads its own
  // font lazily via IntersectionObserver as it scrolls into view.
  const filteredFonts = useMemo(
    () => searchAllFonts(fontSearch, fontCatalog, customFontOptions, canvasFonts),
    [fontSearch, fontCatalog, customFontOptions, canvasFonts],
  );
  const fontListScrollRef = useRef<HTMLDivElement>(null);

  // Button class helpers (matching MultiShapeSelectionToolbar conventions)
  const btnClass =
    "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors hover:bg-secondary";
  const arrangeBtnClass =
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-border/60 bg-secondary/40 px-2 py-2.5 text-[10px] font-medium text-foreground transition-colors hover:border-primary hover:text-primary";
  const alignBtnClass =
    "flex h-9 flex-1 items-center justify-center rounded-xl border border-border/60 bg-secondary/40 text-foreground transition-colors hover:border-primary hover:text-primary";

  const selectionLabel = `${selectedIds.length} Layers Selected`;

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
    "flex flex-nowrap items-center gap-1.5 whitespace-nowrap md:rounded-full md:border md:border-border/70 md:bg-background/95 md:p-1.5 md:shadow-[0_12px_32px_-4px_rgba(0,0,0,0.12),0_4px_12px_-2px_rgba(0,0,0,0.08)] md:dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)] md:backdrop-blur-2xl";

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
              {/* Color swatch — splits if mixed. Square + light inset
                  border, matching every other toolbar's main color-picker
                  trigger (was the odd circular, regular-shadow one out). */}
              <div className="relative h-4.5 w-4.5 shrink-0 overflow-hidden rounded-[5px] border-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.125)]">
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
                      "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-black/10 dark:border-white/15 shadow-sm transition-all hover:scale-105 active:scale-95",
                      displayColor?.toLowerCase() === c.toLowerCase() ? "ring-2 ring-primary ring-offset-1 scale-105" : "hover:scale-105",
                    )}
                    style={{ backgroundColor: c }}
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
              <button
                type="button"
                onClick={() => {
                  if (onOpenCustomFonts) {
                    onOpenCustomFonts();
                  } else {
                    setCustomFontsDialogOpen(true);
                  }
                }}
                className="mx-2 my-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/50 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Upload01Icon size={12} />
                Upload / manage your fonts
              </button>
              {/* Font list */}
              <div ref={fontListScrollRef} className="flex max-h-64 flex-col overflow-y-auto">
                {filteredFonts.map((f, idx, slice) => (
                  <div key={f.value}>
                    {(() => {
                      const label = fontDividerLabelAt(slice, idx);
                      return label ? <FontListDivider label={label} /> : null;
                    })()}
                    <FontRow
                      font={f}
                      active={uniformFont === f.value}
                      onSelect={(v) => onUpdateAllTexts({ fontFamily: v })}
                      scrollRef={fontListScrollRef}
                      className="flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                      activeClassName="bg-primary/10 text-primary"
                    />
                  </div>
                ))}
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

      {/* ──── Dedicated Space Evenly ──── */}
      {onSpaceEvenly && (
        <>
          <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
          <AppTooltip content="Space selected elements evenly">
            <button
              ref={spaceEvenlyTriggerRef}
              type="button"
              onClick={() => {
                setSpaceEvenlyOpen((was) => {
                  if (!was) { spaceEvenlyDrag.reset(); setSpaceEvenlyPinned(false); }
                  return !was;
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

      {/* ──── Dedicated Rotate ──── */}
      {onRotate && (
        <>
          <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
          <AppTooltip content="Rotate selected elements">
            <button
              ref={rotateTriggerRef}
              type="button"
              onClick={() => {
                setRotateOpen((was) => {
                  if (!was) { rotateDrag.reset(); setRotatePinned(false); }
                  return !was;
                });
              }}
              className={cn(btnClass, rotateOpen && "bg-secondary text-primary")}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
              </svg>
              <span className="text-xs">Rotate</span>
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
                  <span className="text-xs font-semibold text-foreground">Rotate Group</span>
                  <span className="text-xs font-mono text-muted-foreground">{rotateAngle}°</span>
                </div>
                <Range
                  value={rotateAngle}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(deg) => {
                    const delta = deg - rotateAngle;
                    setRotateAngle(deg);
                    onRotate(delta);
                  }}
                />
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onRotate(90);
                      setRotateAngle((a) => (a + 90) % 360);
                    }}
                    className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                  >
                    +90°
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRotate(-90);
                      setRotateAngle((a) => (a - 90) % 360);
                    }}
                    className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                  >
                    -90°
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRotate(180);
                      setRotateAngle((a) => (a + 180) % 360);
                    }}
                    className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                  >
                    +180°
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRotate(45);
                      setRotateAngle((a) => (a + 45) % 360);
                    }}
                    className="rounded-lg border border-border/70 bg-secondary/50 py-1 text-center font-mono text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                  >
                    +45°
                  </button>
                </div>
              </div>
            </div>
          </FloatingDropdown>
        </>
      )}

      {/* Lock All/Duplicate All/Delete All dropped from this row for more
          space — Delete still works via the Delete/Backspace keyboard
          shortcut (QuoteCanvas's own selection handler, respects locked
          layers already); bulk Lock/Duplicate have no equivalent path left
          once removed here. */}
    </>
  );

  const customFontsDialog = !onOpenCustomFonts ? (
    <CustomFontsDialog open={customFontsDialogOpen} onClose={() => setCustomFontsDialogOpen(false)} />
  ) : null;

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
        {customFontsDialog}
      </div>
    );
  }

  return (
    <>
      <div ref={rowRef} style={{ width: 1, height: 1 }} />
      <FloatingToolbarPortal anchorRef={rowRef} offset={toolbarDrag.offset} className={TOOLBAR_CLASS}>
        {rowContent}
      </FloatingToolbarPortal>
      {customFontsDialog}
    </>
  );
}
