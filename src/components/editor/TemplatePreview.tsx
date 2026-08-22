import { QuoteCanvas } from "./QuoteCanvas";
import { INITIAL_STATE, migrateLegacyContentToLayers } from "./types";
import type { EditorState, Template } from "./types";

type Props = {
  template: Template;
  width: number;
  onClick?: () => void;
  showLabel?: boolean;
};

/**
 * Template thumbnail — cover+center-crop.
 * Uses explicit `width` for both the clip container AND the centering math
 * so the canvas content is always perfectly centred regardless of context
 * (left-panel grid or quick-strip at the bottom).
 */
export function TemplatePreview({ template, width, onClick, showLabel = true }: Props) {
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
    typeof baseState.height === "number" && Number.isFinite(baseState.height) && baseState.height > 0
      ? baseState.height
      : 1500;

  const state: EditorState = migrateLegacyContentToLayers({
    ...baseState,
    width: canvasWidth,
    height: canvasHeight,
  });

  // Match the canvas aspect ratio so the entire quote card is visible without top/bottom cropping
  const validWidth = typeof width === "number" && Number.isFinite(width) && width > 0 ? width : 150;
  const thumbH = Math.round(validWidth * (state.height / state.width)) || Math.round(validWidth * (1500 / 1200));
  const scale = validWidth / state.width || 0.125;
  const left = 0;
  const top = 0;

  return (
    <button
      type="button"
      onClick={onClick}
      title={template.description}
      // shrink-0 keeps the card from collapsing in a flex row (quick strip)
      className="group shrink-0 overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:border-primary hover:shadow-[var(--shadow-glow)]"
      style={{ width: validWidth }}
    >
      {/* Clip viewport — exact pixel size so centering math is always correct */}
      <div className="relative overflow-hidden" style={{ width: validWidth, height: thumbH }}>
        {/* Full-res canvas, scaled + centered */}
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

        {/* Subtle inner ring — looks clean on both dark and light templates */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]" />
      </div>

      {/* Label — always readable; sits on bg-card below the thumbnail */}
      {showLabel && (
        <div className="px-2.5 py-2">
          <p className="truncate text-[11px] font-semibold text-foreground group-hover:text-primary">
            {template.label}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
            {template.description}
          </p>
        </div>
      )}
    </button>
  );
}
