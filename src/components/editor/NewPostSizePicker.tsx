import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CANVAS_PRESET_GROUPS, type CanvasPreset, type CanvasPresetGroup } from "./types";
import { CANVAS_PRESET_GROUP_ICONS } from "./SocialPlatformIcons";

type CanvasSize = { width: number; height: number };

// Several presets across different platforms share the exact same pixel
// size (Instagram Stories/Reels, LinkedIn/Facebook Stories are all
// 1080×1920) — so selection can't just compare width/height, or picking
// one would light up every other preset with that same size too. This key
// identifies one specific preset regardless of what size it happens to
// share with others.
function presetKey(groupKey: string, preset: CanvasPreset): string {
  return `${groupKey}:${preset.label}`;
}

function findMatchingPresetKey(value: CanvasSize): string | null {
  for (const group of CANVAS_PRESET_GROUPS) {
    const match = group.presets.find((p) => p.w === value.width && p.h === value.height);
    if (match) return presetKey(group.key, match);
  }
  return null;
}

// Tiny square/rectangle glyph standing in for the preset's own aspect
// ratio — a square preset shows a square, a tall preset a tall rectangle,
// a wide one a wide rectangle — in place of a plain checkbox, so the shape
// itself already hints at "Square"/"Portrait"/"Landscape" before you even
// read the numbers. Longest side pinned to 20px, shortest scaled down
// proportionally but never below 10px, so very extreme ratios (a 2256×382
// cover photo) still read as a visible box rather than a sliver.
function RatioGlyph({ w, h, selected }: { w: number; h: number; selected: boolean }) {
  const MAX = 20;
  const MIN = 10;
  const ratio = w / h;
  const boxW = ratio >= 1 ? MAX : Math.max(MIN, Math.round(MAX * ratio));
  const boxH = ratio >= 1 ? Math.max(MIN, Math.round(MAX / ratio)) : MAX;
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center">
      <span
        style={{ width: boxW, height: boxH }}
        className={cn(
          "rounded-[3px] border transition-colors",
          selected ? "border-primary-foreground bg-primary-foreground/25" : "border-muted-foreground/60",
        )}
      />
    </span>
  );
}

// One row inside a platform group, styled as a plain selectable button
// (solid fill when active) rather than a checkbox list item — this whole
// picker is single-select: choosing a size just swaps which one button is
// active, it never adds to a set.
function PresetRow({
  label,
  w,
  h,
  selected,
  onSelect,
}: {
  label: string;
  w: number;
  h: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all cursor-pointer",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border/70 bg-card text-foreground hover:border-primary/50 hover:bg-secondary/60",
      )}
    >
      <RatioGlyph w={w} h={h} selected={selected} />
      <span className="flex min-w-0 flex-col">
        <span className="text-[12.5px] font-semibold leading-tight">{label}</span>
        <span
          className={cn(
            "font-mono text-[13px] font-medium leading-tight",
            selected ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {w}×{h}
        </span>
      </span>
    </button>
  );
}

// Each platform is its own column (see the grid-cols-5 wrapper below) —
// matching the reference layout — so presets inside a group stack
// vertically instead of wrapping into their own mini-grid.
function PresetGroupBlock({
  group,
  selectedKey,
  onSelect,
}: {
  group: CanvasPresetGroup;
  selectedKey: string | null;
  onSelect: (groupKey: string, preset: CanvasPreset) => void;
}) {
  const Icon = CANVAS_PRESET_GROUP_ICONS[group.key];
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        {Icon ? <Icon size={22} /> : null}
        <span className="truncate text-[13px] font-bold text-foreground">{group.label}</span>
      </div>
      {group.presets.map((p) => (
        <PresetRow
          key={p.label}
          label={p.label}
          w={p.w}
          h={p.h}
          selected={selectedKey === presetKey(group.key, p)}
          onSelect={() => onSelect(group.key, p)}
        />
      ))}
    </div>
  );
}

// The canvas-size picker shown inside the "Create a New Post" dialog
// (index.tsx) — presets grouped by platform, plus freeform width/height
// inputs for anything that doesn't fit a preset at all.
export function NewPostSizePicker({
  value,
  onChange,
}: {
  value: CanvasSize;
  // Second arg is which platform group the chosen size came from (null for
  // a manually typed Custom Dimensions value) — index.tsx uses it to show
  // the RIGHT platform's icon in the header even when the size you picked
  // happens to be shared by other platforms' presets too (see
  // groupHasExactPreset's own comment in types.ts).
  onChange: (size: CanvasSize, groupKey: string | null) => void;
}) {
  // Which SPECIFIC preset is selected, independent of its pixel size (see
  // findMatchingPresetKey's own comment) — initialized once from whatever
  // size the dialog opened with; the Dialog wrapper in index.tsx doesn't
  // keep this component mounted while closed, so this correctly starts
  // fresh every time the dialog reopens rather than needing to watch
  // `value` for external changes.
  const [selectedPresetKey, setSelectedPresetKey] = useState<string | null>(() =>
    findMatchingPresetKey(value),
  );

  const selectPreset = (groupKey: string, preset: CanvasPreset) => {
    setSelectedPresetKey(presetKey(groupKey, preset));
    onChange({ width: preset.w, height: preset.h }, groupKey);
  };

  // Kept as separate local text state (same pattern as Range in ui.tsx) so
  // the Custom Dimensions fields can be plain text inputs — no native
  // number-input spinner arrows — while still only accepting digits and
  // only clamping/committing on blur or Enter, not mid-keystroke.
  const [widthInput, setWidthInput] = useState(String(value.width || ""));
  const [heightInput, setHeightInput] = useState(String(value.height || ""));

  useEffect(() => setWidthInput(String(value.width || "")), [value.width]);
  useEffect(() => setHeightInput(String(value.height || "")), [value.height]);

  const commitWidth = () => {
    const n = Number(widthInput);
    if (Number.isFinite(n) && n > 0) {
      // A manually typed size deselects any preset — even one that happens
      // to share this exact size — so at most one thing ever reads as
      // selected at a time.
      setSelectedPresetKey(null);
      onChange({ ...value, width: Math.max(200, Math.min(6000, n)) }, null);
    } else {
      setWidthInput(String(value.width || ""));
    }
  };
  const commitHeight = () => {
    const n = Number(heightInput);
    if (Number.isFinite(n) && n > 0) {
      setSelectedPresetKey(null);
      onChange({ ...value, height: Math.max(200, Math.min(6000, n)) }, null);
    } else {
      setHeightInput(String(value.height || ""));
    }
  };

  return (
    <div className="mt-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Choose Canvas Size
        </span>
        <span className="font-mono text-sm font-bold text-primary">
          {value.width} × {value.height}px
        </span>
      </div>

      <div
        data-scrollbar="hover"
        className="max-h-[340px] space-y-4 overflow-y-auto rounded-xl border border-border/80 bg-secondary/30 p-3.5"
      >
        {/* One column per platform — same layout as the reference: icon +
            name heading the column, that platform's sizes stacked below. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-5">
          {CANVAS_PRESET_GROUPS.map((group) => (
            <PresetGroupBlock
              key={group.key}
              group={group}
              selectedKey={selectedPresetKey}
              onSelect={selectPreset}
            />
          ))}
        </div>
      </div>

      {/* Custom Dimensions Input Box — deliberately not full width (a pair
          of number fields stretched across an ~900px dialog just leaves a
          lot of empty input to click into), but the fields themselves stay
          comfortably sized rather than cramped. */}
      <div className="w-fit rounded-lg border border-border/80 bg-secondary/30 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-4">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Custom Dimensions
          </span>
          <span className="text-[10px] text-muted-foreground">Min 200 • Max 6000</span>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground">Width</span>
            <div className="relative flex items-center">
              <input
                type="text"
                inputMode="numeric"
                value={widthInput}
                onChange={(e) => setWidthInput(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={commitWidth}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitWidth();
                    e.currentTarget.blur();
                  }
                }}
                className="h-9 w-[104px] rounded-lg border border-border/80 bg-background pl-3 pr-7 text-sm font-mono font-semibold text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                placeholder="1200"
              />
              <span className="pointer-events-none absolute right-2.5 text-[10px] text-muted-foreground">
                px
              </span>
            </div>
          </div>
          <span className="pb-2.5 text-xs font-semibold text-muted-foreground/70">×</span>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground">Height</span>
            <div className="relative flex items-center">
              <input
                type="text"
                inputMode="numeric"
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={commitHeight}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitHeight();
                    e.currentTarget.blur();
                  }
                }}
                className="h-9 w-[104px] rounded-lg border border-border/80 bg-background pl-3 pr-7 text-sm font-mono font-semibold text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                placeholder="1500"
              />
              <span className="pointer-events-none absolute right-2.5 text-[10px] text-muted-foreground">
                px
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
