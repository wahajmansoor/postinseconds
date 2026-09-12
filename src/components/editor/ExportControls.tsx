import { Download01Icon, Crown03Icon } from "hugeicons-react";
import { isLinkedInCoverPhotoSize, isLinkedInFeedSize, type EditorState } from "./types";
import { Chip, Field } from "./ui";
import { LinkedInGroupIcon } from "./SocialPlatformIcons";
import { useAuth } from "@/lib/auth";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

type Props = {
  s: EditorState;
  set: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
  onDownload: () => void;
  onPreview?: () => void;
  onProfilePreview?: () => void;
  busy: boolean;
  // false when this is already embedded inside one of those very preview
  // dialogs (PostPreviewDialog/LinkedInProfilePreviewDialog's own Export
  // popover) — offering "preview this as a LinkedIn post" from inside the
  // LinkedIn post preview itself would be circular. Defaults to true for
  // the main header/mobile drawer's own usage, where it's the whole point.
  showLinkedInPreview?: boolean;
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
export function ExportControls({
  s,
  set,
  onDownload,
  onPreview,
  onProfilePreview,
  busy,
  showLinkedInPreview = true,
}: Props) {
  const { isPro, openUpgradeModal } = useAuth();
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
          {[0.5, 1, 1.5, 2, 3].map((x) => {
            const isRestricted = !isPro && x > 1;
            return (
              <Chip
                key={x}
                active={s.exportScale === x}
                onClick={() => {
                  if (isRestricted) {
                    openUpgradeModal();
                    toast.info("High-Res Export is a PRO Feature", {
                      description: "Upgrade to PRO to unlock 1.5x, 2x, and 3x (4K) high-resolution exports.",
                    });
                    return;
                  }
                  set("exportScale", x);
                }}
                className={cn(
                  "text-[11px] flex items-center justify-center gap-0.5",
                  isRestricted && "opacity-80 hover:opacity-100 hover:border-amber-500/50"
                )}
              >
                <span>{x}x</span>
                {isRestricted && (
                  <Crown03Icon size={10} className="text-amber-500 shrink-0" />
                )}
              </Chip>
            );
          })}
        </div>
      </div>
      {/* A cover photo (Personal/Business) is framed on your profile page,
          completely differently from a feed post, and each mockup is a
          real-pixel replica built for that one exact size — so either
          preview button only makes sense when the canvas is actually that
          LinkedIn preset, not "whichever one isn't the other" (which used
          to also offer a feed-post preview for e.g. an Instagram square or
          custom size the mockup was never designed to represent). Neither
          shows at all for any other size. */}
      {showLinkedInPreview && isLinkedInCoverPhotoSize(s.width, s.height) ? (
        <button
          type="button"
          onClick={onProfilePreview}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-slate-200 hover:text-black disabled:opacity-60"
        >
          <LinkedInGroupIcon size={26} />
          LinkedIn Profile Preview
        </button>
      ) : null}
      {showLinkedInPreview && isLinkedInFeedSize(s.width, s.height) ? (
        <button
          type="button"
          onClick={onPreview}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-5 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-slate-200 hover:text-black disabled:opacity-60"
        >
          <LinkedInGroupIcon size={26} />
          LinkedIn Post Preview
        </button>
      ) : null}
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
