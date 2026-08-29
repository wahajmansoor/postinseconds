import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  MinusSignIcon,
  Moon02Icon,
  Notification02Icon,
  ReloadIcon,
  SecurityCheckIcon,
  SentIcon,
  Sun03Icon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";
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
};

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
}: Props) {
  const [mockDark, setMockDark] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-background">
      {/* Header — same 3-column layout as PostPreviewDialog: platform
          picker, centered mockup light/dark toggle, close. */}
      <div className="grid shrink-0 grid-cols-3 items-center border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-3 justify-self-start">
          <span className="text-sm font-bold text-foreground">Preview on</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlatformMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
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

        <div className="flex items-center gap-2 justify-self-center rounded-full border border-border bg-card px-3 py-1.5 shadow-sm">
          <Sun03Icon size={14} className={mockDark ? "text-muted-foreground" : "text-amber-500"} />
          <button
            type="button"
            onClick={() => setMockDark((v) => !v)}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              mockDark ? "bg-primary" : "bg-secondary",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                mockDark ? "left-[1.15rem]" : "left-0.5",
              )}
            />
          </button>
          <Moon02Icon size={14} className={mockDark ? "text-primary" : "text-muted-foreground"} />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center justify-self-end rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Cancel01Icon size={16} />
        </button>
      </div>

      {/* Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-secondary/30 p-10">
        <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.1).toFixed(1))))}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <MinusSignIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(1))))}
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
