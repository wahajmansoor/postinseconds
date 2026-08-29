import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  Download01Icon,
  MinusSignIcon,
  Moon02Icon,
  Notification02Icon,
  ReloadIcon,
  SecurityCheckIcon,
  SentIcon,
  Sun03Icon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExportControls } from "./ExportControls";
import type { EditorState } from "./types";
import { LinkedInGroupIcon } from "./SocialPlatformIcons";
import { LinkedInBugIcon, LinkedInOverflowIcon } from "./LinkedInReactionIcons";

type Props = {
  open: boolean;
  onClose: () => void;
  // A rendered 1x PNG data URL of the current canvas — null while it's
  // still being generated (same renderExport(1) call the plain Export
  // Preview dialog uses).
  imageUrl: string | null;
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

// The mockup below is a real-pixel replica of LinkedIn's own on-screen
// profile-page width, not a scaled-down abstraction — see CARD_WIDTH's use
// in the zoom-fit effect for why that matters on mobile.
const CARD_WIDTH = 792;

// A skeleton placeholder bar — stands in for the real headline/bio/mutual-
// connections text a real profile would show, which this dialog has no
// data for (and shouldn't invent). Keeps the focus on what this preview is
// actually for: the cover photo itself, not fabricated profile copy.
function SkeletonBar({ widthClass, dark }: { widthClass: string; dark: boolean }) {
  return <div className={cn("h-3 rounded-full", widthClass, dark ? "bg-white/15" : "bg-black/10")} />;
}

// "Preview as a LinkedIn cover photo" — separate from PostPreviewDialog
// (which mocks a feed post): a cover/banner photo is framed completely
// differently on LinkedIn (a wide banner behind a circular profile photo,
// on your actual profile page), so it needed its own layout rather than
// being shoehorned into the post-card mockup. Shares that dialog's same
// header/stage/zoom shell for consistency.
export function LinkedInProfilePreviewDialog({
  open,
  onClose,
  imageUrl,
  userName,
  userAvatar,
  s,
  set,
  onDownload,
  isDownloading,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const [mockDark, setMockDark] = useState(true);
  // zoom is the live scale the mockup renders at; minZoom is wherever
  // "fitted to the stage" currently sits — see the effect below for why
  // both need to move together instead of zoom just starting at a fixed 1.
  const [{ zoom, minZoom }, setZoomState] = useState({ zoom: 1, minZoom: 1 });
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // Auto-fit the mockup to whatever width the stage actually has. It's a
  // fixed 792px-wide real-pixel replica (see CARD_WIDTH), and the old zoom
  // floor of 100% meant on any phone narrower than that — i.e. nearly all
  // of them — the dialog forced horizontal scrolling/pinching just to see
  // the whole cover photo instead of showing it fitted like every other
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

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-background">
      {/* Header — same layout as PostPreviewDialog: outer columns equal
          (1fr) so the center toggle stays genuinely centered regardless of
          how the platform picker and close button compare in width, and
          everything shrinks below sm so the row still fits a narrow phone
          — see that dialog's own header comment for the full rationale. */}
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
              LinkedIn cover from inside the LinkedIn cover preview itself
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
          complete mockup with this padding intact as real margin above and
          below it, not just when it happens to already fit. */}
      <div
        ref={stageRef}
        className="relative flex flex-1 [align-items:safe_center] [justify-content:safe_center] overflow-auto bg-secondary/30 p-4 sm:p-10"
      >
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
          {/* The profile-page mockup itself. No overflow-hidden — the
              avatar deliberately overlaps both the banner AND the white
              card below it, which an ancestor clip would cut off. 792px
              wide specifically so the cover photo below (full card width,
              pinned to the 1584:396 ratio) renders at exactly 792×198 —
              LinkedIn's own actual on-screen banner size, not just the
              right ratio at some arbitrary size. */}
          <div
            className={cn(
              "w-[792px] rounded-lg shadow-2xl",
              mockDark ? "bg-[#1b1f23] text-white" : "bg-white text-black",
            )}
          >
            {/* Cover photo — real LinkedIn always displays a profile cover
                in a fixed 1584×396 frame on desktop (cropping via
                object-cover, same as here) regardless of what size you
                actually uploaded, so this stays pinned to that ratio too
                rather than the current canvas's own — a Business-size
                cover (2256×382, a different ratio) would otherwise show
                stretched/letterboxed instead of cropped like the real
                thing. */}
            <div className="overflow-hidden rounded-t-lg">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Your cover photo"
                  style={{ aspectRatio: "1584 / 396" }}
                  className="block w-full object-cover"
                />
              ) : (
                <div
                  style={{ aspectRatio: "1584 / 396" }}
                  className="flex items-center justify-center bg-muted"
                >
                  <ReloadIcon size={20} className="animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Content area — the avatar sits half on the banner above,
                half here, via a negative margin pulling it up. */}
            <div className="relative px-6 pb-6 pt-0">
              <div className="flex items-start justify-between">
                <div
                  className={cn(
                    "-mt-[76px] w-[152px] h-[152px] shrink-0 overflow-hidden rounded-full border-4",
                    mockDark ? "border-[#1b1f23]" : "border-white",
                  )}
                >
                  <img src={userAvatar} alt={userName} className="h-full w-full object-cover" />
                </div>
                {/* Small nav glyphs peeking in at the top-right, like the`
                    real profile page's own header does. */}
                <div className={cn("flex items-center gap-3 pt-2", mockDark ? "text-white/60" : "text-black/50")}>
                  <LinkedInBugIcon size={20} className="text-[#e9a53f]" />
                  <Notification02Icon size={20} />
                </div>
              </div>

              {/* Two placeholder "current position / education"-style rows
                  (icon + bar), floated on the right beside the headline
                  skeleton bars — same idea as SkeletonBar: real LinkedIn
                  shows these once its data loads, but this dialog has none
                  to show so it stays a placeholder rather than inventing
                  fake company/school names. */}
              <div className="absolute right-14 top-30 flex flex-col gap-3.5">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={cn("h-5 w-5 shrink-0 rounded-[3px]", mockDark ? "bg-white/15" : "bg-black/10")} />
                    <SkeletonBar widthClass="w-28" dark={mockDark} />
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center gap-1.5 text-xl font-bold leading-tight">
                {userName}
                <SecurityCheckIcon size={16} className={mockDark ? "text-white/50" : "text-black/40"} />
                <span className={cn("text-sm font-normal", mockDark ? "text-white/50" : "text-black/50")}>
                  · 1st
                </span>
              </div>

              <div className="mt-2 space-y-1.5">
                <SkeletonBar widthClass="w-[20%]" dark={mockDark} />
                <SkeletonBar widthClass="w-[50%]" dark={mockDark} />
                <SkeletonBar widthClass="w-[30%]" dark={mockDark} />
              </div>

              <div className="mt-5 flex items-center gap-2">
                <SkeletonBar widthClass="w-[10%]" dark={mockDark} />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full bg-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#000000e6] transition-opacity hover:opacity-90"
                >
                  Open to
                </button>
                <button
                  type="button"
                  className="rounded-full border-[1.5px] border-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-[#0a66c2] transition-colors hover:bg-[#0a66c2]/10"
                >
                  Add Section
                </button>
                <button
                  type="button"
                  aria-label="More"
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
                    mockDark
                      ? "border-white/30 text-white hover:bg-white/10"
                      : "border-black/30 text-black hover:bg-black/5",
                  )}
                >
                  <LinkedInOverflowIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
