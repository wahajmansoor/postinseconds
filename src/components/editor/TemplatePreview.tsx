import { useState } from "react";
import { QuoteCanvas } from "./QuoteCanvas";
import { INITIAL_STATE, migrateLegacyContentToLayers } from "./types";
import type { EditorState, Template } from "./types";
import { Crown03Icon } from "hugeicons-react";

type Props = {
  template: Template;
  width: number;
  onClick?: () => void;
  showLabel?: boolean;
};

/**
 * Template thumbnail — cover+center-crop or custom preview image.
 * Uses explicit `width` for both the clip container AND the centering math
 * so the canvas content is always perfectly centred regardless of context
 * (left-panel grid or quick-strip at the bottom).
 */
export function TemplatePreview({ template, width, onClick, showLabel = true }: Props) {
  const [imgError, setImgError] = useState(false);

  // A template preview should render its own design state independently
  // without leaking or mirroring live canvas modifications
  const baseState: EditorState = {
    ...INITIAL_STATE,
    ...(template.state || {}),
  };

  const canvasWidth =
    typeof baseState.width === "number" && Number.isFinite(baseState.width) && baseState.width > 0
      ? baseState.width
      : 1200;
  const canvasHeight =
    typeof baseState.height === "number" &&
    Number.isFinite(baseState.height) &&
    baseState.height > 0
      ? baseState.height
      : 1500;

  const state: EditorState = migrateLegacyContentToLayers({
    ...baseState,
    width: canvasWidth,
    height: canvasHeight,
  });

  // Match the canvas aspect ratio so the entire quote card is visible without top/bottom cropping
  const validWidth = typeof width === "number" && Number.isFinite(width) && width > 0 ? width : 150;
  const thumbH =
    Math.round(validWidth * (state.height / state.width)) || Math.round(validWidth * (1500 / 1200));
  const scale = validWidth / state.width || 0.125;
  const left = 0;
  const top = 0;

  const hasCustomThumbnail = !!template.thumbnailUrl && !imgError;
  const isPremium =
    template.is_premium === true ||
    (template as any).category === "premium" ||
    template.id.includes("founder") ||
    template.id.includes("hormozi") ||
    template.id.includes("jasmin") ||
    template.id.includes("viral") ||
    template.id.includes("cyber") ||
    template.id.includes("creator") ||
    template.id.includes("luxury");

  return (
    <button
      type="button"
      onClick={onClick}
      title={template.description}
      // shrink-0 keeps the card from collapsing in a flex row (quick strip)
      className="group shrink-0 overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:border-primary hover:shadow-[var(--shadow-glow)] text-left relative"
      style={{ width: validWidth }}
    >
      {/* Premium Badge */}
      {isPremium && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[9px] font-black uppercase text-amber-950 shadow-md">
          <Crown03Icon size={10} />
          <span>PRO</span>
        </div>
      )}

      {/* Clip viewport — exact pixel size so centering math is always correct */}
      <div
        className="relative overflow-hidden bg-secondary/30"
        style={{ width: validWidth, height: thumbH }}
      >
        {hasCustomThumbnail ? (
          <img
            src={template.thumbnailUrl}
            alt={template.label}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* Full-res canvas, scaled + centered */
          <div
            className="pointer-events-none absolute"
            style={{
              width: state.width,
              height: state.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              top,
              left,
            }}
          >
            <QuoteCanvas s={state} />
          </div>
        )}
      </div>

      {/* Label — always readable; sits on bg-card below the thumbnail */}
      {showLabel && (
        <div className="px-2.5 py-2">
          <p className="truncate text-[11px] font-semibold text-foreground group-hover:text-primary">
            {template.label}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{template.description}</p>
        </div>
      )}
    </button>
  );
}
