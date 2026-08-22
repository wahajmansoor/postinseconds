import { Download01Icon } from "hugeicons-react";
import { CANVAS_PRESETS, type EditorState } from "./types";
import { AppTooltip, Chip, Field, Section, TextInput } from "./ui";

type Props = {
  s: EditorState;
  set: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
  onDownload: () => void;
  busy: boolean;
};

// The quote box's own style controls (solid/gradient/glass/outline, shadow,
// padding, ...) moved out of here — the box is just a Shape layer now, so
// it's styled from its own card in the Elements tab, same as any other
// shape. This panel is left with what's genuinely global to the whole
// canvas: export settings and canvas size.
export function RightPanel({ s, set, onDownload, busy }: Props) {
  return (
    <>
      <Section title="Export settings" defaultOpen={true}>
        <Field label="Format">
          <div className="grid grid-cols-4 gap-1.5">
            {(["png", "jpg", "webp", "gif"] as const).map((f) => (
              <Chip
                key={f}
                active={s.exportFormat === f}
                onClick={() => set("exportFormat", f)}
                className="uppercase text-[11px]"
              >
                {f}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Resolution">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((x) => (
              <Chip key={x} active={s.exportScale === x} onClick={() => set("exportScale", x)}>
                {x}x
              </Chip>
            ))}
          </div>
        </Field>
        <p className="text-[11px] text-muted-foreground">
          Output: {s.width * s.exportScale} × {s.height * s.exportScale}px
        </p>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[image:var(--gradient-brand)] px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Download01Icon size={16} />
          {busy ? "Rendering…" : `Download ${s.exportFormat.toUpperCase()}`}
        </button>
      </Section>

      <Section title="Canvas size">
        <div className="flex flex-wrap gap-2">
          {CANVAS_PRESETS.map((p) => (
            <AppTooltip key={p.label} content={`${p.w} × ${p.h}px`}>
              <Chip
                active={s.width === p.w && s.height === p.h}
                onClick={() => {
                  set("width", p.w);
                  set("height", p.h);
                }}
              >
                {p.label}
              </Chip>
            </AppTooltip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width (px)">
            <TextInput
              type="number"
              value={s.width}
              onChange={(e) => set("width", Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Height (px)">
            <TextInput
              type="number"
              value={s.height}
              onChange={(e) => set("height", Number(e.target.value) || 1)}
            />
          </Field>
        </div>
      </Section>

    </>
  );
}
