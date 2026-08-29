import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  EarthIcon,
  MinusSignIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  ReloadIcon,
  Sun03Icon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";
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
};

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
}: Props) {
  const [mockDark, setMockDark] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [caption, setCaption] = useState("");
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  // Which reaction is currently "picked" on the Like button, and whether
  // the hover picker (Like/Celebrate/Support/Love/Insightful/Funny) is
  // showing above it — null selectedReaction means the button is in its
  // plain, un-reacted state.
  const [selectedReaction, setSelectedReaction] = useState<ReactionKey | null>(null);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

  if (!open || typeof document === "undefined") return null;

  const activeReaction = REACTIONS.find((r) => r.key === selectedReaction) ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-background">
      {/* Header — 3 columns so the mockup's light/dark toggle can sit
          genuinely centered between the platform picker and the close
          button, freeing up the stage below for the card itself. */}
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

        {/* Mockup's own light/dark toggle — independent of the app's theme */}
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
        {/* Zoom controls */}
        <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(1))))}
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
                        "absolute bottom-full left-1/2 mb-1.5 flex -translate-x-1/2 items-center gap-1 rounded-full border p-1.5 shadow-xl",
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
