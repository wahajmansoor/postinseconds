import { Download01Icon } from "hugeicons-react";
import { isLinkedInCoverPhotoSize, type EditorState } from "./types";
import { Chip, Field } from "./ui";
import { LinkedInGroupIcon } from "./SocialPlatformIcons";

type Props = {
  s: EditorState;
  set: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
  onDownload: () => void;
  onPreview: () => void;
  onProfilePreview: () => void;
  busy: boolean;
};

// Export format/resolution + download — the whole reason RightPanel used
// to exist, back when it also held canvas size and quote-box styling
// (both moved elsewhere since). With just this left, a permanently-visible
// 400px sidebar for it stopped earning its keep, so it's now this compact,
// wrapper-agnostic block of controls instead: rendered inside a Popover on
// desktop (anchored to the Export button, see index.tsx) and inside the
// existing bottom Drawer on mobile. No outer card/section chrome here —
// each caller supplies its own (PopoverContent's card, or the Drawer's
// sheet), since a nested "collapsible section" header would be redundant
// once the surrounding UI is already itself only shown on demand.
export function ExportControls({ s, set, onDownload, onPreview, onProfilePreview, busy }: Props) {
  return (
    <div className="space-y-4">
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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Scale
          </span>
          <span className="font-mono text-sm font-bold text-foreground">
            {s.width * s.exportScale} × {s.height * s.exportScale} px
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {[0.5, 1, 1.5, 2, 3].map((x) => (
            <Chip
              key={x}
              active={s.exportScale === x}
              onClick={() => set("exportScale", x)}
              className="text-[11px]"
            >
              {x}x
            </Chip>
          ))}
        </div>
      </div>
      {/* A cover photo (Personal/Business) is framed on your profile page,
          completely differently from a feed post — so only whichever
          preview mockup actually matches the CURRENT canvas size is worth
          offering, not both at once. */}
      {isLinkedInCoverPhotoSize(s.width, s.height) ? (
        <button
          type="button"
          onClick={onProfilePreview}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-slate-200 hover:text-black disabled:opacity-60"
        >
          <LinkedInGroupIcon size={26} />
          LinkedIn Profile Preview
        </button>
      ) : (
        <button
          type="button"
          onClick={onPreview}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-slate-200 hover:text-black disabled:opacity-60"
        >
          <LinkedInGroupIcon size={26} />
          LinkedIn Post Preview
        </button>
      )}
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[image:var(--gradient-brand)] px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Download01Icon size={16} />
        {busy ? "Rendering…" : `Download ${s.exportFormat.toUpperCase()}`}
      </button>
    </div>
  );
}
