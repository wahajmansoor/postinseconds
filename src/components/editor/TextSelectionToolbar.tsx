import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ExpandParagraphIcon,
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
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { loadGoogleFont } from "@/lib/fontLoader";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppTooltip } from "@/components/ui/tooltip";
import type { LiveTextFormat, TextLayerHandle } from "./QuoteCanvas";
import { TextEffectsPopover } from "./TextEffectsPopover";
import { FONTS, type TextLayer } from "./types";
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
export function TextSelectionToolbar({
  layer,
  handle,
  onOpenEffectsTab,
  detached = false,
  onAnyPopoverOpenChange,
}: {
  layer: TextLayer;
  handle: TextLayerHandle;
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
  const currentFontLabel = FONTS.find((f) => f.value === layer.fontFamily)?.label ?? "Text Font";
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
  const [fontStripOpen, setFontStripOpen] = useState(false);
  useEffect(() => {
    if (!fontOpen && !fontStripOpen) return;
    FONTS.forEach((f) => loadGoogleFont(f.value));
  }, [fontOpen, fontStripOpen]);

  // Reports "is any popover in this toolbar open" up to index.tsx (see the
  // `detached`/`onAnyPopoverOpenChange` comments above) so it knows whether
  // to keep this whole component mounted — and thus keep every popover's
  // own state (search text, drag position, which one is open) intact —
  // even after `layer` stops being the live canvas selection.
  const anyPopoverOpen = spacingOpen || textColorOpen || fontOpen || fontStripOpen;
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
            onPointerDown={preserveSelection}
            onMouseDown={preserveSelection}
            onClick={() => {
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
          onPointerDown={preserveSelection}
          onMouseDown={preserveSelection}
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
            "flex h-8 w-32 shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-secondary/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary",
            fontOpen && "border-primary text-primary",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left" style={{ fontFamily: layer.fontFamily }}>
            {currentFontLabel}
          </span>
          <ArrowDown01Icon size={12} className="shrink-0 text-muted-foreground" />
        </button>
      </AppTooltip>
      {fontFloatingDropdown}

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
        <span className="w-7 text-center text-xs font-semibold text-foreground">{layer.size}</span>
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
          setTextColorOpen((wasOpen) => {
            if (!wasOpen) {
              textColorDrag.reset();
              setTextColorPinned(false);
            }
            return !wasOpen;
          });
        }}
        title="Text color"
        className="h-7 w-7 shrink-0 overflow-hidden rounded-xl border border-border/80 shadow-sm transition-transform hover:scale-105"
        style={{ backgroundColor: layer.color || "#000000" }}
      />
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
    </div>
  );
}
