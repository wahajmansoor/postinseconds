import {
  Add01Icon,
  ExpandParagraphIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  MinusSignIcon,
  TextAlignCenterIcon,
  TextAlignJustifyCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "hugeicons-react";
import type React from "react";
import { useEffect, useState } from "react";
import { AppTooltip } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LiveTextFormat, TextLayerHandle } from "./QuoteCanvas";
import { TextEffectsPopover } from "./TextEffectsPopover";
import { FONTS, type TextLayer } from "./types";
import { Chip, ColorInput, Select } from "./ui";

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
}: {
  layer: TextLayer;
  handle: TextLayerHandle;
  onOpenEffectsTab?: () => void;
}) {
  const [spacingOpen, setSpacingOpen] = useState(false);

  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl p-0 text-xs";
  // Every plain button here needs to NOT steal focus from the text layer's
  // contentEditable when clicked — otherwise, if the user has a word/phrase
  // highlighted, clicking e.g. Bold would blur the editable first (default
  // button behavior), collapsing that selection before applyFormat ever
  // gets to see it, so it'd always fall back to "toggle the whole layer"
  // instead of formatting just the highlighted range. (Same class of bug,
  // same fix, as the highlight-to-style popover earlier in this file's
  // history — see the comment on TextLayerHandle above.) The font-family
  // <select> and color <input type=color> below can't get this same
  // treatment — preventDefault on their mousedown would stop them from
  // opening at all — so those use handle.snapshotSelection() instead (see
  // selectionSnapshotRef in QuoteCanvas.tsx).
  const preserveSelection = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

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

  return (
    <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap md:rounded-2xl md:border md:border-border/80 md:bg-background/95 md:p-1.5 md:shadow-2xl md:backdrop-blur-md">
      <div className="w-32 shrink-0">
        <Select
          value={layer.fontFamily}
          onChange={handle.setFontFamily}
          options={FONTS.map((f) => ({ label: f.label, value: f.value }))}
          className="h-8 rounded-xl px-2.5 py-0 text-xs font-medium"
        />
      </div>

      <div className="flex h-8 items-center gap-0.5 rounded-xl bg-secondary/50 p-0.5">
        <AppTooltip content="Decrease size">
          <Chip
            title="Decrease size"
            onPointerDown={preserveSelection}
            onMouseDown={preserveSelection}
            onClick={() => handle.setSize(Math.max(8, layer.size - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg p-0"
          >
            <MinusSignIcon size={14} />
          </Chip>
        </AppTooltip>
        <span className="w-7 text-center text-xs font-semibold text-foreground">{layer.size}</span>
        <AppTooltip content="Increase size">
          <Chip
            title="Increase size"
            onPointerDown={preserveSelection}
            onMouseDown={preserveSelection}
            onClick={() => handle.setSize(layer.size + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg p-0"
          >
            <Add01Icon size={14} />
          </Chip>
        </AppTooltip>
      </div>

      <div onPointerDown={() => handle.snapshotSelection()} className="flex shrink-0 items-center">
        <ColorInput
          value={layer.color}
          onChange={handle.setColor}
          showHex={false}
          swatchClassName="h-7 w-7 rounded-xl border-border/80"
          align="center"
        />
      </div>

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
          visible. Radix's Popover portals the content straight to
          document.body (escaping the clipping) and auto-flips to whichever
          side actually has room (so it renders above the button here),
          which a manual position never accounted for. */}
      <Popover open={spacingOpen} onOpenChange={setSpacingOpen}>
        <AppTooltip content="Spacing">
          <PopoverTrigger asChild>
            <Chip
              title="Spacing"
              active={spacingOpen}
              onPointerDown={preserveSelection}
              onMouseDown={preserveSelection}
              className={btn}
            >
              <ExpandParagraphIcon size={16} />
            </Chip>
          </PopoverTrigger>
        </AppTooltip>

        <PopoverContent
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          sideOffset={10}
          collisionPadding={12}
          className="z-50 w-64 space-y-4 rounded-2xl border border-border bg-[#18191d] p-4 text-white shadow-2xl backdrop-blur-xl"
        >
            {/* Letter spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Letter spacing</span>
                <span className="flex h-6 min-w-[36px] items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 px-2 font-mono text-xs font-medium text-zinc-200">
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
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-zinc-700 accent-primary"
              />
            </div>

            {/* Line spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Line spacing</span>
                <span className="flex h-6 min-w-[36px] items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/80 px-2 font-mono text-xs font-medium text-zinc-200">
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
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-zinc-700 accent-primary"
              />
            </div>

            <div className="h-px w-full bg-zinc-800" />

            {/* Anchor text box */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">Anchor text box</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Anchor Top"
                  onClick={() => handle.setVerticalAlign("top")}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    (layer.verticalAlign ?? "top") === "top"
                      ? "bg-primary text-primary-foreground"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    layer.verticalAlign === "middle"
                      ? "bg-primary text-primary-foreground"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    layer.verticalAlign === "bottom"
                      ? "bg-primary text-primary-foreground"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
        </PopoverContent>
      </Popover>

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
