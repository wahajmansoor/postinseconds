import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  Download01Icon,
  EarthIcon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  ReloadIcon,
  Sun03Icon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExportControls } from "./ExportControls";
import type { EditorState } from "./types";
import { LinkedInGroupIcon } from "./SocialPlatformIcons";
import {
  LinkedInBugIcon,
  LinkedInCelebrateIcon,
  LinkedInCommentOutlineIcon,
  LinkedInFunnyIcon,
  LinkedInInsightfulIcon,
  LinkedInLikeIcon,
  LinkedInLikeOutlineIcon,
  LinkedInLoveIcon,
  LinkedInRepostOutlineIcon,
  LinkedInSendOutlineIcon,
  LinkedInSupportIcon,
} from "./LinkedInReactionIcons";

type ReactionKey = "like" | "celebrate" | "support" | "love" | "insightful" | "funny";

// LinkedIn's actual 6 reactions, in the same order the real hover picker
// shows them. `textColor` matches what the Like button's label turns once
// that reaction is picked (see the reference screenshot).
const REACTIONS: { key: ReactionKey; label: string; Icon: typeof LinkedInLikeIcon; textColor: string }[] = [
  { key: "like", label: "Like", Icon: LinkedInLikeIcon, textColor: "text-[#378fe9]" },
  { key: "celebrate", label: "Celebrate", Icon: LinkedInCelebrateIcon, textColor: "text-[#6dae4f]" },
  { key: "support", label: "Support", Icon: LinkedInSupportIcon, textColor: "text-[#bba9d1]" },
  { key: "love", label: "Love", Icon: LinkedInLoveIcon, textColor: "text-[#df704d]" },
  { key: "insightful", label: "Insightful", Icon: LinkedInInsightfulIcon, textColor: "text-[#f5bb5c]" },
  { key: "funny", label: "Funny", Icon: LinkedInFunnyIcon, textColor: "text-[#44bfd3]" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  // A rendered 1x PNG data URL of the current canvas — null while it's
  // still being generated (same renderExport(1) call the plain Export
  // Preview dialog uses).
  imageUrl: string | null;
  canvasWidth: number;
  canvasHeight: number;
  userName: string;
  userAvatar: string;
  // Full EditorState/set so the Export button here can open the exact same
  // ExportControls (format + scale) the main header's Export button does,
  // not just fire off a download at whatever format/scale was already set.
  s: EditorState;
  set: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
  // Reuses index.tsx's own confirmDownload save flow (format/scale/native-
  // vs-browser path/filename/toasts) against this dialog's already-
  // rendered imageUrl, so liking what you see here can go straight to a
  // download without closing this preview to find the separate Export
  // button first.
  onDownload: () => void;
  isDownloading: boolean;
};

// The card mockup below is a real-pixel replica of LinkedIn's own on-screen
// post width, not a scaled-down abstraction — see CARD_WIDTH's use in the
// zoom-fit effect for why that matters on mobile.
const CARD_WIDTH = 524;

// A full-screen "what will this actually look like as a post" preview —
// separate from the plain Export Preview dialog (which just shows the
// rendered image before download). This wraps that same rendered image in
// an interactive, platform-styled post-card mockup instead: pick a
// platform (LinkedIn only for now — the header dropdown already has room
// to grow), toggle the mockup's own light/dark look, zoom, and type a
// caption to see how the whole post would actually read, not just the
// image on its own.
export function PostPreviewDialog({
  open,
  onClose,
  imageUrl,
  canvasWidth,
  canvasHeight,
  userName,
  userAvatar,
  s,
  set,
  onDownload,
  isDownloading,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const [mockDark, setMockDark] = useState(true);
  // zoom is the live scale the card renders at; minZoom is wherever
  // "fitted to the stage" currently sits — see the effect below for why
  // both need to move together instead of zoom just starting at a fixed 1.
  const [{ zoom, minZoom }, setZoomState] = useState({ zoom: 1, minZoom: 1 });
  const [caption, setCaption] = useState("");
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  // Which reaction is currently "picked" on the Like button, and whether
  // the hover picker (Like/Celebrate/Support/Love/Insightful/Funny) is
  // showing above it — null selectedReaction means the button is in its
  // plain, un-reacted state.
  const [selectedReaction, setSelectedReaction] = useState<ReactionKey | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // Auto-fit the card to whatever width the stage actually has. The card is
  // a fixed 524px-wide real-pixel replica (see CARD_WIDTH), and the old
  // zoom floor of 100% meant on any phone narrower than that — i.e. nearly
  // all of them — the dialog forced horizontal scrolling/pinching just to
  // see the whole mockup instead of showing it fitted like every other
  // preview in the app. Resets to fit every time the dialog opens, then
  // keeps tracking the fit on resize/orientation change for as long as the
  // user hasn't manually zoomed in past it.
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;

    let firstRun = true;
    const applyFit = (width: number) => {
      const fit = Math.max(0.15, Math.min(1, width / CARD_WIDTH));
      setZoomState((prev) => ({
        minZoom: fit,
        zoom: firstRun || prev.zoom <= prev.minZoom + 0.001 ? fit : Math.max(fit, prev.zoom),
      }));
      firstRun = false;
    };

    applyFit(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) applyFit(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const activeReaction = REACTIONS.find((r) => r.key === selectedReaction) ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-background">
      {/* Header — outer columns are equal (1fr) so the center toggle stays
          genuinely centered on the row regardless of how the platform
          picker and close button compare in width; the center column is
          auto-sized to just what the toggle needs, and everything shrinks
          (smaller gaps/padding, "Preview on" hidden) below sm so the whole
          row still fits a narrow phone without the columns colliding. */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border px-3 py-2.5 sm:px-5 sm:py-3.5">
        <div className="flex items-center gap-1.5 justify-self-start sm:gap-3">
          <span className="hidden text-sm font-bold text-foreground sm:inline">Preview on</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlatformMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 sm:gap-2 sm:px-2.5 sm:py-1.5"
            >
              <LinkedInGroupIcon size={20} />
              LinkedIn
              <ArrowDown01Icon
                size={12}
                className={cn("text-muted-foreground transition-transform", platformMenuOpen && "rotate-180")}
              />
            </button>
            {platformMenuOpen ? (
              <div className="absolute left-0 top-full z-10 mt-1.5 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => setPlatformMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg bg-secondary px-2.5 py-2 text-sm font-semibold text-foreground"
                >
                  <LinkedInGroupIcon size={18} />
                  LinkedIn
                </button>
                <div className="px-2.5 pb-1 pt-2 text-[10px] text-muted-foreground">
                  More platforms coming soon
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Mockup's own light/dark toggle — independent of the app's theme.
            Two filled circular buttons rather than an iOS-style sliding
            switch: the active side is a solid brand-blue circle with a
            white icon, the inactive side a muted gray circle — reads as a
            clear either/or choice at a glance instead of a thin track+thumb. */}
        <div className="flex items-center gap-1 justify-self-center rounded-full border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMockDark(false)}
            aria-label="Preview mockup in light mode"
            aria-pressed={!mockDark}
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors sm:h-7 sm:w-7",
              !mockDark
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            <Sun03Icon size={14} />
          </button>
          <button
            type="button"
            onClick={() => setMockDark(true)}
            aria-label="Preview mockup in dark mode"
            aria-pressed={mockDark}
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors sm:h-7 sm:w-7",
              mockDark
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            <Moon02Icon size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 justify-self-end sm:gap-2">
          {/* Same gradient/glow treatment, and the exact same format/scale
              options, as the main header's own Export button (index.tsx) —
              opens a popover instead of downloading immediately at
              whatever format/scale was already set, so "yes, this looks
              right" can still choose PNG/JPG/WEBP/GIF and resolution right
              from the preview instead of needing to close it first.
              showLinkedInPreview=false: offering to preview this AS a
              LinkedIn post from inside the LinkedIn post preview itself
              would be circular. */}
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={isDownloading || !imageUrl}
                className="flex items-center gap-1.5 rounded-full bg-[image:var(--gradient-brand)] px-2.5 py-1.5 text-xs font-bold text-primary-foreground shadow-[var(--shadow-glow)] transition-opacity hover:opacity-90 disabled:opacity-60 sm:px-3.5"
                title="Export"
              >
                {isDownloading ? (
                  <ReloadIcon size={14} className="animate-spin" />
                ) : (
                  <Download01Icon size={14} />
                )}
                <span className="hidden sm:inline">{isDownloading ? "Exporting…" : "Export"}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              // z-[110]: PopoverContent's own base class is z-50, which
              // rendered it BEHIND this dialog's opaque z-[90] full-screen
              // overlay — the popover was technically opening on click, just
              // invisible underneath, reading as "nothing happened".
              className="z-[110] w-80 rounded-2xl border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-xl"
            >
              <ExportControls
                s={s}
                set={set}
                busy={isDownloading}
                showLinkedInPreview={false}
                onDownload={() => {
                  setExportOpen(false);
                  onDownload();
                }}
              />
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Cancel01Icon size={16} />
          </button>
        </div>
      </div>

      {/* Stage — "safe center" instead of plain center on both axes: a
          plain flex `center` on a scrollable container has a well-known gap
          where content taller/wider than the viewport can't actually be
          scrolled to its full extent (the browser only scrolls far enough
          to keep it centered, clipping the far edge with no room for this
          padding at all) — "safe" falls back to start-alignment once
          content overflows, so zooming in still lets you scroll to see the
          complete card with this padding intact as real margin above and
          below it, not just when it happens to already fit. */}
      <div
        ref={stageRef}
        className="relative flex flex-1 [align-items:safe_center] [justify-content:safe_center] overflow-auto bg-secondary/30 p-4 sm:p-10"
      >
        {/* Zoom controls */}
        <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            disabled={zoom <= minZoom}
            onClick={() => setZoomState((z) => ({ ...z, zoom: Math.max(z.minZoom, Number((z.zoom - 0.1).toFixed(1))) }))}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <MinusSignIcon size={13} />
          </button>
          <button
            type="button"
            disabled={zoom >= 2}
            onClick={() => setZoomState((z) => ({ ...z, zoom: Math.min(2, Number((z.zoom + 0.1).toFixed(1))) }))}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <Add01Icon size={13} />
          </button>
        </div>

        <div style={{ transform: `scale(${zoom})` }} className="transition-transform">
          {/* The LinkedIn post-card mockup itself. No overflow-hidden here
              (even though it's rounded) — the reaction picker needs to
              float above the Like button without getting clipped, and
              nothing else in the card touches the rounded corners anyway
              (the image now has its own left/right margin, see below). */}
          <div
            className={cn(
              "w-[524px] rounded-lg shadow-2xl",
              mockDark ? "bg-[#1b1f23] text-white" : "bg-white text-black",
            )}
          >
            <div className="flex items-start gap-2.5 px-4 pb-2 pt-3.5">
              <img
                src={userAvatar}
                alt={userName}
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[14px] font-semibold leading-tight">
                  {userName}
                  <LinkedInBugIcon size={13} className="shrink-0 text-[#c27d16]" />
                  <span className="font-normal opacity-60">· 1st</span>
                </div>
                <div className={cn("truncate text-[12px] leading-tight", mockDark ? "text-white/60" : "text-black/60")}>
                  Making posts in seconds with Post In Seconds
                </div>
                <div className={cn("flex items-center gap-1 text-[12px]", mockDark ? "text-white/50" : "text-black/50")}>
                  3d · <EarthIcon size={12} />
                </div>
              </div>
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded-full p-1.5 transition-colors",
                  mockDark ? "hover:bg-white/10" : "hover:bg-black/5",
                )}
              >
                <MoreHorizontalIcon size={16} />
              </button>
            </div>

            <div className="px-4 pb-2.5">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write a caption for your post…"
                rows={2}
                className={cn(
                  "w-full resize-none bg-transparent text-[13px] leading-snug outline-none",
                  mockDark ? "placeholder:text-white/40" : "placeholder:text-black/40",
                )}
              />
            </div>

            <div className="relative px-3">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Your design"
                  style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
                  className="block w-full object-cover rounded-sm"
                />
              ) : (
                <div
                  style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
                  className="flex items-center justify-center bg-muted"
                >
                  <ReloadIcon size={20} className="animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 pt-2 text-[12px] opacity-70">
              <div className="flex items-center gap-1.5">
                <span className="flex items-center -space-x-1">
                  <span className={cn("rounded-full ring-2", mockDark ? "ring-[#1b1f23]" : "ring-white")}>
                    <LinkedInLikeIcon size={16} />
                  </span>
                  <span className={cn("rounded-full ring-2", mockDark ? "ring-[#1b1f23]" : "ring-white")}>
                    <LinkedInCelebrateIcon size={16} />
                  </span>
                  <span className={cn("rounded-full ring-2", mockDark ? "ring-[#1b1f23]" : "ring-white")}>
                    <LinkedInInsightfulIcon size={16} />
                  </span>
                </span>
                <span>Wahaj Mansoor and 28 others</span>
              </div>
              <span className="shrink-0">7 comments · 2 reposts</span>
            </div>

            <div className={cn("mx-4 mt-2 border-t", mockDark ? "border-white/10" : "border-black/10")} />

            <div className="flex items-center gap-1 px-2 py-1">
              {/* "Commenting as" identity picker — cosmetic here, but real
                  LinkedIn always shows this to the left of the action row. */}
              <button
                type="button"
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded-md p-1.5 transition-colors",
                  mockDark ? "hover:bg-white/10" : "hover:bg-black/5",
                )}
              >
                <img src={userAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                <ArrowDown01Icon size={10} className="opacity-60" />
              </button>

              <div className="grid flex-1 grid-cols-4 gap-1">
                {/* Like — the only reactive button; hover reveals the full
                    reaction picker just like real LinkedIn, and picking one
                    recolors both the icon and the label. */}
                <div
                  className="relative"
                  onMouseEnter={() => setReactionPickerOpen(true)}
                  onMouseLeave={() => setReactionPickerOpen(false)}
                >
                  {reactionPickerOpen ? (
                    <div
                      className={cn(
                        "absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 items-center gap-0 rounded-full border p-1.5 shadow-xl",
                        mockDark ? "border-white/10 bg-[#2a2f34]" : "border-black/10 bg-white",
                      )}
                    >
                      {REACTIONS.map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          type="button"
                          title={label}
                          onClick={() => {
                            setSelectedReaction(key);
                            setReactionPickerOpen(false);
                          }}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform hover:scale-125"
                        >
                          <Icon size={26} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSelectedReaction((r) => (r ? null : "like"))}
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-0.5 rounded-md py-2 text-[12px] font-semibold transition-colors",
                      activeReaction
                        ? activeReaction.textColor
                        : mockDark
                          ? "text-white/70 hover:bg-white/10"
                          : "text-black/70 hover:bg-black/5",
                    )}
                  >
                    {activeReaction ? (
                      <activeReaction.Icon size={16} />
                    ) : (
                      <LinkedInLikeOutlineIcon size={16} />
                    )}
                    {activeReaction ? activeReaction.label : "Like"}
                  </button>
                </div>

                {[
                  { Icon: LinkedInCommentOutlineIcon, label: "Comment" },
                  { Icon: LinkedInRepostOutlineIcon, label: "Repost" },
                  { Icon: LinkedInSendOutlineIcon, label: "Send" },
                ].map(({ Icon, label }) => (
                  <button
                    key={label}
                    type="button"
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 rounded-md py-2 text-[12px] font-semibold transition-colors",
                      mockDark ? "text-white/70 hover:bg-white/10" : "text-black/70 hover:bg-black/5",
                    )}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
