import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ExpandParagraphIcon,
  LayerBringForwardIcon,
  LayerBringToFrontIcon,
  LayerSendBackwardIcon,
  LayerSendToBackIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  MinusSignIcon,
  Search01Icon,
  TextAlignCenterIcon,
  TextAlignJustifyCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  Tick02Icon,
} from "hugeicons-react";
import { CaseUpper } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { loadGoogleFont } from "@/lib/fontLoader";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppTooltip } from "@/components/ui/tooltip";
import type { LiveTextFormat, TextLayerHandle } from "./QuoteCanvas";
import { TextEffectsPopover } from "./TextEffectsPopover";
import { FONTS, normalizeColorToHex, type TextLayer } from "./types";
import { Chip, ColorPickerContent, DragHandle, FloatingDropdown, useDraggableOffset, useHoldRepeat, useStableAnchor } from "./ui";

// Canva-style top-docked toolbar: appears the instant a single free-floating
// text layer is selected (a plain click — well before, or entirely without,
// the user ever entering edit mode). Drives the selected layer purely
// through its imperative TextLayerHandle (see QuoteCanvas.tsx), so it never
// needs to know about the canvas's internal DOM refs or live Selection
// state — `handle.applyFormat`/`handle.setXxx` already know how to fall
// back to toggling the whole layer's fields when there's no highlighted
// range to act on (same fallback the sidebar's own per-layer controls
// use), so every control here behaves sensibly whether or not there's an
// active text selection underneath it. This is the only text-formatting UI
// in the canvas now — there used to also be a floating popover that
// appeared above a highlighted word/phrase for the same commands, removed
// once this toolbar covered the same ground, to avoid two overlapping
// formatting UIs.
const TOP_COLORS = [
  "#000000",
  "#ffffff",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
  "#94a3b8",
  "#78350f",
];

export function TextSelectionToolbar({
  layer,
  handle,
  onArrange,
  canArrange,
  onOpenEffectsTab,
  detached = false,
  onAnyPopoverOpenChange,
}: {
  layer: TextLayer;
  handle: TextLayerHandle;
  onArrange?: (direction: "forward" | "backward" | "front" | "back") => void;
  canArrange?: { canForward: boolean; canBackward: boolean; canFront: boolean; canBack: boolean };
  onOpenEffectsTab?: () => void;
  // True once this layer is no longer the live canvas selection (e.g. the
  // user clicked the canvas background, or selected something else) but one
  // of this toolbar's own popovers was still open at that moment — see the
  // long comment on the row wrapper's ref below for how that popover
  // survives the swap instead of closing with it.
  detached?: boolean;
  // Fires whenever ANY popover in this toolbar opens/closes (aggregated,
  // not per-popover) — index.tsx uses this to know which single layer to
  // keep "pinned" (and thus keep this whole component mounted, `detached`
  // or not) for as long as at least one of its popovers is still open.
  onAnyPopoverOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [spacingOpen, setSpacingOpen] = useState(false);
  const [spacingPinned, setSpacingPinned] = useState(false);
  const spacingDrag = useDraggableOffset();
  const spacingTriggerRef = useRef<HTMLButtonElement>(null);
  const spacingAnchor = useStableAnchor(spacingOpen, spacingTriggerRef);

  // Text Color — a hand-rolled popover (rather than the packaged
  // ColorPicker export, which owns its own un-draggable Popover internally)
  // so it can share the same moveable/X-to-close treatment as every other
  // popover in this toolbar. Uses ColorPickerContent directly, same as the
  // Background toolbar's own Solid swatch.
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [textColorPinned, setTextColorPinned] = useState(false);
  const textColorDrag = useDraggableOffset();
  const textColorTriggerRef = useRef<HTMLButtonElement>(null);
  const textColorAnchor = useStableAnchor(textColorOpen, textColorTriggerRef);

  // Text Font — a searchable, moveable popover replacing the old plain
  // <select>. Every font's actual glyphs render in the list (not just its
  // name) the instant the popover opens, not lazily on hover — a search
  // list is only useful if every visible row already looks like its own
  // font. loadGoogleFont dedupes internally (module-level Set), so
  // reopening / re-filtering costs nothing once loaded.
  const [fontOpen, setFontOpen] = useState(false);
  const [fontPinned, setFontPinned] = useState(false);
  const [fontSearch, setFontSearch] = useState("");
  const fontDrag = useDraggableOffset();
  const fontTriggerRef = useRef<HTMLButtonElement>(null);
  const fontAnchor = useStableAnchor(fontOpen, fontTriggerRef);

  // Mirrors handle.getActiveFormat() live so Bold/Italic/Underline/
  // Strikethrough/list here light up for whatever's actually under the
  // caret or highlighted right now (a highlighted bold word shows Bold as
  // active even if the rest of the box isn't bold), not just the whole
  // layer's own fields — see LiveTextFormat/subscribeActiveFormat in
  // QuoteCanvas.tsx. Re-subscribes whenever `handle` itself changes (i.e.
  // the selected layer changed), which also pushes that new layer's
  // current format immediately.
  const [activeFormat, setActiveFormat] = useState<LiveTextFormat>(() => handle.getActiveFormat());
  useEffect(() => handle.subscribeActiveFormat(setActiveFormat), [handle]);

  const currentFontLabel = useMemo(() => {
    if (activeFormat.fontFamily === "multiple") {
      return "Multiple fonts";
    }
    if (activeFormat.fontFamily) {
      const cleanActive = activeFormat.fontFamily.split(",")[0]?.replace(/['"]/g, "").trim().toLowerCase() || "";
      const match = FONTS.find((f) => f.value.toLowerCase().includes(cleanActive) || f.label.toLowerCase() === cleanActive);
      if (match) return match.label;
    }

    if (layer.html) {
      const fontsInHtml = new Set<string>();
      const basePrimary = (layer.fontFamily || "").split(",")[0]?.replace(/['"]/g, "").trim().toLowerCase() || "";

      const matches = layer.html.matchAll(/font-family:\s*([^;"]+)/gi);
      for (const match of matches) {
        const rawFont = match?.[1]?.trim().replace(/^['"]|['"]$/g, "");
        if (rawFont) {
          const primary = rawFont.split(",")[0]?.replace(/['"]/g, "").trim().toLowerCase();
          if (primary) fontsInHtml.add(primary);
        }
      }

      if (fontsInHtml.size > 0) {
        if (typeof document !== "undefined") {
          try {
            const tmp = document.createElement("div");
            tmp.innerHTML = layer.html;
            const fontSpans = tmp.querySelectorAll<HTMLElement>("[style*='font-family']");
            let totalSpanTextLen = 0;
            fontSpans.forEach((s) => (totalSpanTextLen += s.textContent?.length || 0));
            const totalTextLen = tmp.textContent?.length || 0;
            if (totalTextLen > totalSpanTextLen) {
              fontsInHtml.add(basePrimary);
            }
          } catch { }
        }
      }

      if (fontsInHtml.size > 1) {
        return "Multiple fonts";
      }
      if (fontsInHtml.size === 1) {
        const singleFont = Array.from(fontsInHtml)[0];
        if (singleFont) {
          const match = FONTS.find((f) => f.value.toLowerCase().includes(singleFont) || f.label.toLowerCase() === singleFont);
          if (match) return match.label;
        }
      }
    }

    return FONTS.find((f) => f.value === layer.fontFamily)?.label ?? "Text Font";
  }, [activeFormat.fontFamily, layer.fontFamily, layer.html]);

  const currentColors = useMemo((): string[] => {
    if (activeFormat.colors && activeFormat.colors.length > 1) {
      const norm = Array.from(new Set(activeFormat.colors.map((c) => normalizeColorToHex(c))));
      if (norm.length > 1) {
        return norm.slice(0, 2);
      }
      if (norm.length === 1 && norm[0]) {
        return [norm[0]];
      }
    }
    if (activeFormat.color && activeFormat.color !== "multiple") {
      return [normalizeColorToHex(activeFormat.color)];
    }

    const baseColor = normalizeColorToHex(layer.color || "#ffffff");
    if (!layer.html) {
      return [baseColor];
    }

    try {
      if (typeof document !== "undefined") {
        const tmp = document.createElement("div");
        tmp.innerHTML = layer.html;

        const colorSpans = tmp.querySelectorAll<HTMLElement>("[style*='color']");
        const foundColors: string[] = [];
        let totalStyledTextLen = 0;

        colorSpans.forEach((el) => {
          const rawC = el.style.color?.trim();
          if (rawC) {
            const hex = normalizeColorToHex(rawC);
            if (!foundColors.includes(hex)) {
              foundColors.push(hex);
            }
          }
          totalStyledTextLen += el.textContent?.length || 0;
        });

        const totalTextLen = tmp.textContent?.length || 0;
        if (totalTextLen > totalStyledTextLen) {
          if (!foundColors.includes(baseColor)) {
            foundColors.unshift(baseColor);
          }
        }

        if (foundColors.length > 1) {
          return foundColors.slice(0, 2);
        }
        if (foundColors.length === 1 && foundColors[0]) {
          return [foundColors[0]];
        }
      }
    } catch {
    }

    return [baseColor];
  }, [activeFormat.colors, activeFormat.color, layer.color, layer.html]);
  const filteredFonts = useMemo(() => {
    const q = fontSearch.trim().toLowerCase();
    return q ? FONTS.filter((f) => f.label.toLowerCase().includes(q)) : FONTS;
  }, [fontSearch]);
  // Mobile-only: tapping Font swaps the whole toolbar row for a horizontal
  // scrollable strip of font-name chips (each rendered in its own font,
  // same as the full list below) instead of opening `fontOpen`'s popover
  // directly — a Canva-style quick-switch that keeps the canvas fully
  // visible while flicking through options, rather than a sheet covering
  // part of it. The strip's own "expand" button still opens the existing
  // `fontOpen` search+full-list sheet for anything not in quick reach.
  // Desktop is completely unaffected — its Font button still opens
  // `fontOpen` directly, same as before this existed.
  const FONT_WEIGHT_OPTIONS = [
    { label: "Thin (100)", value: 100 },
    { label: "Extra Light (200)", value: 200 },
    { label: "Light (300)", value: 300 },
    { label: "Regular (400)", value: 400 },
    { label: "Medium (500)", value: 500 },
    { label: "SemiBold (600)", value: 600 },
    { label: "Bold (700)", value: 700 },
    { label: "Extra Bold (800)", value: 800 },
    { label: "Black (900)", value: 900 },
  ];

  const [weightOpen, setWeightOpen] = useState(false);
  const [weightPinned, setWeightPinned] = useState(false);
  const weightDrag = useDraggableOffset();
  const weightTriggerRef = useRef<HTMLButtonElement>(null);
  const weightAnchor = useStableAnchor(weightOpen, weightTriggerRef);

  const currentWeightLabel = useMemo(() => {
    const currentWeight = layer.weight || 400;
    const match = FONT_WEIGHT_OPTIONS.find((w) => w.value === currentWeight);
    return match ? match.label.replace(/\s*\(\d+\)/, "") : `${currentWeight}`;
  }, [layer.weight]);

  const [fontStripOpen, setFontStripOpen] = useState(false);
  const [colorStripOpen, setColorStripOpen] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [arrangePinned, setArrangePinned] = useState(false);
  const arrangeDrag = useDraggableOffset();
  const arrangeTriggerRef = useRef<HTMLButtonElement>(null);
  const arrangeAnchor = useStableAnchor(arrangeOpen, arrangeTriggerRef);

  useEffect(() => {
    if (!fontOpen && !fontStripOpen) return;
    FONTS.forEach((f) => loadGoogleFont(f.value));
  }, [fontOpen, fontStripOpen]);

  // Reports "is any popover in this toolbar open" up to index.tsx (see the
  // `detached`/`onAnyPopoverOpenChange` comments above) so it knows whether
  // to keep this whole component mounted — and thus keep every popover's
  // own state (search text, drag position, which one is open) intact —
  // even after `layer` stops being the live canvas selection.
  const anyPopoverOpen = spacingOpen || textColorOpen || fontOpen || fontStripOpen || colorStripOpen || arrangeOpen || weightOpen;
  useEffect(() => {
    onAnyPopoverOpenChange?.(anyPopoverOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPopoverOpen]);

  // While detached, this row itself renders invisible and inert (nothing in
  // it is clickable — there's nothing sensible left to click since it isn't
  // the live selection anymore) at a FIXED position pinned to wherever it
  // last was on screen while still live, taken clean out of the toolbar
  // slot's normal flex flow so it can't shove the newly-live toolbar
  // (e.g. Background's) off-center. Any popover that was open keeps
  // rendering — Radix portals popover content straight to document.body,
  // so it's a separate DOM subtree unaffected by the trigger row's own
  // visibility/position — anchored correctly to that now-invisible trigger,
  // fully interactive, until its own X is clicked.
  const rowRef = useRef<HTMLDivElement>(null);
  const lastLiveRectRef = useRef<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!detached && rowRef.current) {
      const r = rowRef.current.getBoundingClientRect();
      lastLiveRectRef.current = { top: r.top, left: r.left };
    }
  });

  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl p-0 text-xs";
  // Every plain button here needs to NOT steal focus from the text layer's
  // contentEditable when clicked — otherwise, if the user has a word/phrase
  // highlighted, clicking e.g. Bold would blur the editable first (default
  // button behavior), collapsing that selection before applyFormat ever
  // gets to see it, so it'd always fall back to "toggle the whole layer"
  // instead of formatting just the highlighted range. (Same class of bug,
  // same fix, as the highlight-to-style popover earlier in this file's
  // history — see the comment on TextLayerHandle above.) The color
  // <input type=color> below can't get this same treatment — preventDefault
  // on its mousedown would stop it from opening at all — so it uses
  // handle.snapshotSelection() instead (see selectionSnapshotRef in
  // QuoteCanvas.tsx). Font family itself always applies to the whole layer
  // now regardless of any highlighted range (see setFontFamily's own
  // comment in QuoteCanvas.tsx), so its trigger button needs no such
  // special-casing.
  const preserveSelection = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Press-and-hold repeat for the Decrease/Increase size buttons below —
  // see useHoldRepeat's own comment in ui.tsx. Composed with
  // preserveSelection (not replacing it) on pointerdown: that call still
  // has to run first so the highlighted text selection survives the
  // button press, same as every other control in this toolbar.
  const sizeDecHold = useHoldRepeat(() => handle.setSize(Math.max(8, layer.size - 1)));
  const sizeIncHold = useHoldRepeat(() => handle.setSize(layer.size + 1));

  const [sizeInput, setSizeInput] = useState<string>(() => String(layer.size));
  useEffect(() => {
    setSizeInput(String(layer.size));
  }, [layer.size]);

  const commitSizeInput = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 8 && parsed <= 400) {
      handle.setSize(parsed);
      setSizeInput(String(parsed));
    } else {
      setSizeInput(String(layer.size));
    }
  };



  // Hoisted out of the main return below so it can also be reached from the
  // mobile font-strip's own "expand" button (see fontStripOpen above) — both
  // that branch and the normal toolbar row need the exact same search+full-
  // list sheet, just triggered from a different button depending on mode.
  const fontFloatingDropdown = (
    <FloatingDropdown
      anchor={fontAnchor}
      offset={fontDrag.offset}
      align="start"
      pinned={fontPinned}
      onRequestClose={() => setFontOpen(false)}
      triggerRef={fontTriggerRef}
    >
      <div className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl max-md:border-none max-md:shadow-none max-md:bg-transparent max-md:rounded-none">
        <DragHandle
          label="Text Font"
          {...fontDrag.dragHandleProps}
          pinned={fontPinned}
          onTogglePin={() => setFontPinned((p) => !p)}
          onClose={() => setFontOpen(false)}
        />
        <div className="space-y-2 p-2.5">
          <div className="relative">
            <Search01Icon
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              autoFocus
              value={fontSearch}
              onChange={(e) => setFontSearch(e.target.value)}
              placeholder="Search fonts…"
              className="w-full rounded-xl border border-border bg-input py-1.5 pl-8 pr-2.5 text-xs text-foreground outline-none transition-colors focus:border-primary"
            />
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto pr-0.5">
            {filteredFonts.length ? (
              filteredFonts.map((f) => {
                const active = f.value === layer.fontFamily;
                return (
                  <button
                    key={f.value}
                    type="button"
                    // Deliberately does NOT close the popover — picking
                    // a font is something people want to do several
                    // times in a row while comparing options live on
                    // the canvas, not a one-shot action. It only closes
                    // via the X button or re-clicking the trigger.
                    onClick={() => handle.setFontFamily(f.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                      active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary",
                    )}
                    style={{ fontFamily: f.value }}
                  >
                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                    {active ? <Tick02Icon size={13} className="shrink-0 text-primary" /> : null}
                  </button>
                );
              })
            ) : (
              <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                No fonts match "{fontSearch}"
              </p>
            )}
          </div>
        </div>
      </div>
    </FloatingDropdown>
  );

  const weightFloatingDropdown = (
    <FloatingDropdown
      anchor={weightAnchor}
      offset={weightDrag.offset}
      align="center"
      pinned={weightPinned}
      onRequestClose={() => setWeightOpen(false)}
      triggerRef={weightTriggerRef}
    >
      <div className="overflow-hidden rounded-3xl border border-border bg-background shadow-2xl backdrop-blur-xl max-md:border-none max-md:shadow-none max-md:bg-transparent max-md:rounded-none">
        <DragHandle
          label="Font Weight"
          {...weightDrag.dragHandleProps}
          pinned={weightPinned}
          onTogglePin={() => setWeightPinned((p) => !p)}
          onClose={() => setWeightOpen(false)}
        />
        <div className="w-56 p-2">
          <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto pr-1">
            {FONT_WEIGHT_OPTIONS.map((w) => {
              const active = (layer.weight || 400) === w.value;
              return (
                <button
                  key={w.value}
                  type="button"
                  onPointerDown={preserveSelection}
                  onMouseDown={preserveSelection}
                  onClick={() => {
                    handle.setWeight(w.value);
                    setWeightOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                    active ? "bg-primary/15 font-bold text-primary" : "text-foreground hover:bg-secondary",
                  )}
                  style={{ fontFamily: layer.fontFamily, fontWeight: w.value }}
                >
                  <span className="min-w-0 flex-1 truncate">{w.label}</span>
                  {active ? <Tick02Icon size={14} className="shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </FloatingDropdown>
  );

  const textColorFloatingDropdown = (
    <FloatingDropdown
      anchor={textColorAnchor}
      offset={textColorDrag.offset}
      align="center"
      pinned={textColorPinned}
      onRequestClose={() => setTextColorOpen(false)}
      triggerRef={textColorTriggerRef}
    >
      <div className="overflow-hidden rounded-3xl border border-border bg-background shadow-2xl backdrop-blur-xl max-md:border-none max-md:shadow-none max-md:bg-transparent max-md:rounded-none">
        <DragHandle
          label="Text Color"
          {...textColorDrag.dragHandleProps}
          pinned={textColorPinned}
          onTogglePin={() => setTextColorPinned((p) => !p)}
          onClose={() => setTextColorOpen(false)}
        />
        <ColorPickerContent value={layer.color} onChange={handle.setColor} />
      </div>
    </FloatingDropdown>
  );

  // Mobile: font mode swaps the entire row for a back button + a horizontal
  // scrollable strip of font-name chips (each previewed in its own font),
  // matching a Canva-style quick font switcher — the canvas stays fully
  // visible the whole time instead of being covered by a sheet. The
  // trailing button opens the full search+list sheet (fontFloatingDropdown
  // above) for anything not close enough to scroll to quickly; note its
  // trigger ref is the SAME fontTriggerRef the normal toolbar's Font button
  // uses below — only one of the two is ever mounted at a time, so whichever
  // is currently on screen is what `fontAnchor` measures from.
  if (isMobile && fontStripOpen) {
    return (
      <div
        ref={rowRef}
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
        className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap"
      >
        <AppTooltip content="Back">
          <button
            type="button"
            onPointerDown={preserveSelection}
            onMouseDown={preserveSelection}
            onClick={() => setFontStripOpen(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft01Icon size={16} />
          </button>
        </AppTooltip>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
          {FONTS.map((f) => {
            const active = f.value === layer.fontFamily;
            return (
              <button
                key={f.value}
                type="button"
                onPointerDown={preserveSelection}
                onMouseDown={preserveSelection}
                onClick={() => handle.setFontFamily(f.value)}
                className={cn(
                  "flex h-8 shrink-0 items-center whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 bg-secondary/40 text-foreground hover:bg-secondary",
                )}
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <AppTooltip content="Browse all fonts">
          <button
            ref={fontTriggerRef}
            type="button"
            onPointerDown={(e) => {
              handle.snapshotSelection();
              preserveSelection(e);
            }}
            onMouseDown={(e) => {
              handle.snapshotSelection();
              preserveSelection(e);
            }}
            onClick={() => {
              handle.snapshotSelection();
              fontDrag.reset();
              setFontSearch("");
              setFontPinned(false);
              setFontOpen(true);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowDown01Icon size={16} className="rotate-180" />
          </button>
        </AppTooltip>
        {fontFloatingDropdown}
      </div>
    );
  }

  // Mobile: color mode swaps the row for a back button + horizontal quick-color strip + expand down arrow
  if (isMobile && colorStripOpen) {
    return (
      <div
        ref={rowRef}
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
        className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap"
      >
        <AppTooltip content="Back">
          <button
            type="button"
            onPointerDown={preserveSelection}
            onMouseDown={preserveSelection}
            onClick={() => setColorStripOpen(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft01Icon size={16} />
          </button>
        </AppTooltip>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth px-2 py-2">
          {TOP_COLORS.map((c) => {
            const active = (currentColors.length === 1 && currentColors[0]?.toLowerCase() === c.toLowerCase()) || (layer.color?.toLowerCase() === c.toLowerCase());
            return (
              <button
                key={c}
                type="button"
                onPointerDown={preserveSelection}
                onMouseDown={preserveSelection}
                onClick={() => handle.setColor(c)}
                className={cn(
                  "h-7 w-7 shrink-0 rounded-full border shadow-sm transition-transform hover:scale-110 active:scale-95",
                  active
                    ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background scale-105"
                    : "border-border/80 hover:border-foreground/40",
                )}
                style={{ backgroundColor: c }}
                title={c}
              />
            );
          })}
        </div>
        <AppTooltip content="All colors & custom picker">
          <button
            ref={textColorTriggerRef}
            type="button"
            onPointerDown={(e) => {
              handle.snapshotSelection();
              preserveSelection(e);
            }}
            onMouseDown={(e) => {
              handle.snapshotSelection();
              preserveSelection(e);
            }}
            onClick={() => {
              handle.snapshotSelection();
              textColorDrag.reset();
              setTextColorPinned(false);
              setTextColorOpen(true);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-foreground transition-colors hover:bg-secondary"
          >
            <ArrowDown01Icon size={16} className="rotate-180" />
          </button>
        </AppTooltip>
        {textColorFloatingDropdown}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
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
      <AppTooltip content="Text font">
        <button
          ref={fontTriggerRef}
          type="button"
          onPointerDown={(e) => {
            handle.snapshotSelection();
            preserveSelection(e);
          }}
          onMouseDown={(e) => {
            handle.snapshotSelection();
            preserveSelection(e);
          }}
          onClick={() => {
            if (isMobile) {
              setFontStripOpen(true);
              return;
            }
            setFontOpen((wasOpen) => {
              // Reset lives on the OPEN edge, not the close edge: resetting
              // on close would snap the panel back to its anchor position
              // right as the close happens, making it visibly jump instead
              // of just disappearing from wherever the user left it.
              if (!wasOpen) {
                fontDrag.reset();
                setFontSearch("");
                setFontPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            "flex h-8 w-28 sm:w-32 shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary",
            fontOpen && "border-primary text-primary",
          )}
        >
          <span
            className="min-w-0 flex-1 truncate text-left"
            style={{ fontFamily: currentFontLabel === "Multiple fonts" ? undefined : layer.fontFamily }}
          >
            {currentFontLabel}
          </span>
          <ArrowDown01Icon size={12} className="shrink-0 text-muted-foreground" />
        </button>
      </AppTooltip>
      {fontFloatingDropdown}

      <AppTooltip content="Font Weight">
        <button
          ref={weightTriggerRef}
          type="button"
          onPointerDown={(e) => {
            handle.snapshotSelection();
            preserveSelection(e);
          }}
          onMouseDown={(e) => {
            handle.snapshotSelection();
            preserveSelection(e);
          }}
          onClick={() => {
            setWeightOpen((wasOpen) => {
              if (!wasOpen) {
                weightDrag.reset();
                setWeightPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={cn(
            "flex h-8 w-20 sm:w-24 shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-secondary/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary",
            weightOpen && "border-primary text-primary",
          )}
          style={{ fontFamily: layer.fontFamily, fontWeight: layer.weight || 400 }}
        >
          <span className="min-w-0 flex-1 truncate text-left">{currentWeightLabel}</span>
          <ArrowDown01Icon size={11} className="shrink-0 text-muted-foreground" />
        </button>
      </AppTooltip>
      {weightFloatingDropdown}

      <div className="flex h-8 items-center gap-0.5 rounded-xl bg-secondary/50 p-0.5">
        <AppTooltip content="Decrease size">
          <Chip
            title="Decrease size"
            onPointerDown={(e) => {
              preserveSelection(e);
              sizeDecHold.onPointerDown(e);
            }}
            onPointerUp={sizeDecHold.onPointerUp}
            onPointerLeave={sizeDecHold.onPointerLeave}
            onPointerCancel={sizeDecHold.onPointerCancel}
            onMouseDown={preserveSelection}
            className="flex h-7 w-7 items-center justify-center rounded-lg p-0"
          >
            <MinusSignIcon size={14} />
          </Chip>
        </AppTooltip>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={sizeInput}
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
            setSizeInput(val);
            const num = parseInt(val, 10);
            if (!isNaN(num) && num >= 8 && num <= 400) {
              handle.setSize(num);
            }
          }}
          onFocus={(e) => e.target.select()}
          onBlur={() => commitSizeInput(sizeInput)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitSizeInput(sizeInput);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              handle.setSize(Math.min(400, layer.size + 1));
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              handle.setSize(Math.max(8, layer.size - 1));
            }
          }}
          className="h-7 w-9 rounded-md bg-transparent text-center font-mono text-xs font-semibold text-foreground outline-none transition-colors hover:bg-secondary/80 focus:bg-background focus:ring-1 focus:ring-primary/50"
          title="Font size (type to change)"
        />
        <AppTooltip content="Increase size">
          <Chip
            title="Increase size"
            onPointerDown={(e) => {
              preserveSelection(e);
              sizeIncHold.onPointerDown(e);
            }}
            onPointerUp={sizeIncHold.onPointerUp}
            onPointerLeave={sizeIncHold.onPointerLeave}
            onPointerCancel={sizeIncHold.onPointerCancel}
            onMouseDown={preserveSelection}
            className="flex h-7 w-7 items-center justify-center rounded-lg p-0"
          >
            <Add01Icon size={14} />
          </Chip>
        </AppTooltip>
      </div>

      <button
        ref={textColorTriggerRef}
        type="button"
        onPointerDown={(e) => {
          handle.snapshotSelection();
          preserveSelection(e);
        }}
        onMouseDown={(e) => {
          handle.snapshotSelection();
          preserveSelection(e);
        }}
        onClick={() => {
          if (isMobile) {
            setColorStripOpen(true);
            return;
          }
          setTextColorOpen((wasOpen) => {
            if (!wasOpen) {
              textColorDrag.reset();
              setTextColorPinned(false);
            }
            return !wasOpen;
          });
        }}
        title={currentColors.length > 1 ? `Text colors (${currentColors.join(" / ")})` : "Text color"}
        className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border/80 shadow-sm transition-transform hover:scale-110 active:scale-95"
        style={
          currentColors.length > 1
            ? { background: `linear-gradient(135deg, ${currentColors[0]} 50%, ${currentColors[1]} 50%)` }
            : { backgroundColor: currentColors[0] || normalizeColorToHex(layer.color) || "#ffffff" }
        }
      />
      {textColorFloatingDropdown}

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      <AppTooltip content="Bold">
        <Chip
          title="Bold"
          active={activeFormat.bold}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => handle.applyFormat("bold")}
          className={btn}
        >
          <TextBoldIcon size={15} />
        </Chip>
      </AppTooltip>
      <AppTooltip content="Italic">
        <Chip
          title="Italic"
          active={activeFormat.italic}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => handle.applyFormat("italic")}
          className={btn}
        >
          <TextItalicIcon size={15} />
        </Chip>
      </AppTooltip>
      <AppTooltip content="Underline">
        <Chip
          title="Underline"
          active={activeFormat.underline}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => handle.applyFormat("underline")}
          className={btn}
        >
          <TextUnderlineIcon size={15} />
        </Chip>
      </AppTooltip>
      <AppTooltip content="Strikethrough">
        <Chip
          title="Strikethrough"
          active={activeFormat.strike}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => handle.applyFormat("strike")}
          className={btn}
        >
          <TextStrikethroughIcon size={15} />
        </Chip>
      </AppTooltip>
      <AppTooltip content="Uppercase">
        <Chip
          title="Uppercase"
          active={activeFormat.uppercase || !!layer.uppercase}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => handle.applyFormat("uppercase")}
          className={btn}
        >
          <CaseUpper size={15} />
        </Chip>
      </AppTooltip>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {(["left", "center", "right", "justify"] as const).map((pos) => (
        <AppTooltip key={pos} content={`Align ${pos === "justify" ? "Justify" : pos}`}>
          <Chip
            title={`Align ${pos === "justify" ? "Justify" : pos}`}
            active={layer.align === pos}
            onPointerDown={preserveSelection}
            onMouseDown={preserveSelection}
            onClick={() => handle.setAlign(pos)}
            className={btn}
          >
            {pos === "left" ? (
              <TextAlignLeftIcon size={15} />
            ) : pos === "center" ? (
              <TextAlignCenterIcon size={15} />
            ) : pos === "right" ? (
              <TextAlignRightIcon size={15} />
            ) : (
              <TextAlignJustifyCenterIcon size={15} />
            )}
          </Chip>
        </AppTooltip>
      ))}

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      <AppTooltip content="Bullet list">
        <Chip
          title="Bullet list"
          active={activeFormat.bulletList}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => handle.applyFormat("bulletList")}
          className={btn}
        >
          <LeftToRightListBulletIcon size={15} />
        </Chip>
      </AppTooltip>
      <AppTooltip content="Numbered list">
        <Chip
          title="Numbered list"
          active={activeFormat.numberedList}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => handle.applyFormat("numberedList")}
          className={btn}
        >
          <LeftToRightListNumberIcon size={15} />
        </Chip>
      </AppTooltip>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* Spacing Popover Button & Dropdown — on mobile this toolbar lives
          inside a 60px-tall `overflow-x-auto` bar pinned to the bottom of
          the screen, so a plain `position: absolute` popover either got
          clipped by that ancestor's overflow or, positioned `top-full`
          below an already-bottom-pinned button, rendered off the bottom of
          the viewport entirely — it "opened" (state and all) but was never
          visible. FloatingDropdown portals the content straight to
          document.body (escaping the clipping) and flips above the button
          when there isn't room below (so it renders above the button
          here) — see its own collision-check comment in ui.tsx. */}
      <AppTooltip content="Spacing">
        <Chip
          ref={spacingTriggerRef}
          title="Spacing"
          active={spacingOpen}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => {
            setSpacingOpen((wasOpen) => {
              // Reset on the OPEN edge, not the close edge — see the
              // matching comment on the font popover above.
              if (!wasOpen) {
                spacingDrag.reset();
                setSpacingPinned(false);
              }
              return !wasOpen;
            });
          }}
          className={btn}
        >
          <ExpandParagraphIcon size={16} />
        </Chip>
      </AppTooltip>

      <FloatingDropdown
        anchor={spacingAnchor}
        offset={spacingDrag.offset}
        align="start"
        pinned={spacingPinned}
        onRequestClose={() => setSpacingOpen(false)}
        triggerRef={spacingTriggerRef}
      >
        <div className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl backdrop-blur-xl max-md:border-none max-md:shadow-none max-md:bg-transparent max-md:rounded-none">
          <DragHandle
            label="Spacing"
            {...spacingDrag.dragHandleProps}
            pinned={spacingPinned}
            onTogglePin={() => setSpacingPinned((p) => !p)}
            onClose={() => setSpacingOpen(false)}
          />
          <div className="space-y-4 p-4">
            {/* Letter spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Letter spacing</span>
                <span className="flex h-6 min-w-[36px] items-center justify-center rounded-lg border border-border bg-secondary/70 px-2 font-mono text-xs font-medium text-foreground">
                  {layer.letterSpacing ?? 0}
                </span>
              </div>
              <input
                type="range"
                min={-50}
                max={300}
                step={5}
                value={layer.letterSpacing ?? 0}
                onChange={(e) => handle.setLetterSpacing(Number(e.target.value))}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>

            {/* Line spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Line spacing</span>
                <span className="flex h-6 min-w-[36px] items-center justify-center rounded-lg border border-border bg-secondary/70 px-2 font-mono text-xs font-medium text-foreground">
                  {Number(layer.lineHeight ?? 1.4).toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={2.5}
                step={0.05}
                value={layer.lineHeight ?? 1.4}
                onChange={(e) => handle.setLineHeight(Number(e.target.value))}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>

            <div className="h-px w-full bg-border" />

            {/* Anchor text box */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Anchor text box</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Anchor Top"
                  onClick={() => handle.setVerticalAlign("top")}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${(layer.verticalAlign ?? "top") === "top"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4h16M12 8v12M8 16l4 4 4-4" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Anchor Middle"
                  onClick={() => handle.setVerticalAlign("middle")}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${layer.verticalAlign === "middle"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Anchor Bottom"
                  onClick={() => handle.setVerticalAlign("bottom")}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${layer.verticalAlign === "bottom"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 20h16M12 4v12M8 8l4-4 4 4" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* Effects Button (opens LeftPanel Effects tab) */}
      <AppTooltip content="Effects">
        <Chip
          title="Effects"
          active={(!!layer.effectType && layer.effectType !== "none") || (!!layer.shapeType && layer.shapeType !== "none")}
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
          onClick={() => onOpenEffectsTab?.()}
          className="flex h-8 items-center px-2.5 text-xs font-semibold"
        >
          <span>Effects</span>
        </Chip>
      </AppTooltip>

      {/* Arrange Button & Dropdown */}
      {onArrange ? (
        <>
          <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />
          <AppTooltip content="Arrange layer order">
            <Chip
              title="Arrange"
              active={arrangeOpen}
              ref={arrangeTriggerRef}
              onPointerDown={preserveSelection}
              onMouseDown={preserveSelection}
              onClick={() => {
                setArrangeOpen((wasOpen) => {
                  if (!wasOpen) {
                    arrangeDrag.reset();
                    setArrangePinned(false);
                  }
                  return !wasOpen;
                });
              }}
              className="flex h-8 items-center gap-1.5 px-2.5 text-xs font-semibold"
            >
              <LayerBringToFrontIcon size={15} />
              <span>Arrange</span>
            </Chip>
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
    </div>
  );
}
