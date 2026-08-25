import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Copy01Icon,
  Delete02Icon,
  MoveIcon,
  RotateClockwiseIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  ReloadIcon
} from "hugeicons-react";
import { loadGoogleFont } from "@/lib/fontLoader";
import { triggerAlignmentHaptic } from "@/lib/haptics";
import {
  getImageLayers,
  getShapeLayers,
  getTextLayers,
  getUnifiedLayers,
  hexToRgba,
  sanitizeTextHtml,
  shapeCss,
  shapeFillStyle,
  withImageDuplicated,
  withImageRemoved,
  withImageUpdated,
  withMultipleLayersRemoved,
  withShapeDuplicated,
  withShapeRemoved,
  withShapeUpdated,
  withTextDuplicated,
  withTextRemoved,
  withTextUpdated,
} from "./types";
import { getTextEffectStyle } from "./textEffects";
import type { EditorState, ImageLayer, ShapeLayer, TextLayer } from "./types";

export type RichFormatCmd = "bold" | "italic" | "underline" | "strike" | "bulletList" | "numberedList";

export type LiveTextFormat = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bulletList: boolean;
  numberedList: boolean;
};

export type TextLayerHandle = {
  applyFormat: (cmd: RichFormatCmd) => void;
  setFontFamily: (v: string) => void;
  setSize: (v: number) => void;
  setColor: (v: string) => void;
  setAlign: (v: "left" | "center" | "right" | "justify") => void;
  setLetterSpacing: (v: number) => void;
  setLineHeight: (v: number) => void;
  setVerticalAlign: (v: "top" | "middle" | "bottom") => void;
  updateLayer: (patch: Partial<Omit<TextLayer, "id">>) => void;
  snapshotSelection: () => void;
  getActiveFormat: () => LiveTextFormat;
  subscribeActiveFormat: (cb: (format: LiveTextFormat) => void) => () => void;
};

type Props = {
  s: EditorState;
  /** enables in-canvas dragging and inline text editing */
  interactive?: boolean;
  scale?: number;
  set?: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
  selection?: { kind: "image" | "text" | "shape"; id: string }[];
  /** Fires whenever the canvas's own selection changes — lets a consumer
   * outside the canvas (index.tsx's top-docked text-selection toolbar)
   * know when to show itself, without lifting the whole selection state up
   * into the parent (selection stays owned by QuoteCanvas either way). */
  onSelectionChange?: (sel: { kind: "image" | "text" | "shape"; id: string }[]) => void;
  /** Registers/unregisters a text layer's imperative formatting handle
   * under its id as it mounts/unmounts — see TextLayerHandle. */
  registerTextLayerHandle?: (id: string, handle: TextLayerHandle | null) => void;
  /** Fires when the canvas's own background (empty space, not any layer) is
   * clicked directly — lets index.tsx show a background-properties toolbar
   * the same way selecting a layer shows one. Only fires for a genuine
   * click landing directly on the background div itself (checked via
   * e.target === e.currentTarget below) — a click that bubbled up through
   * a layer doesn't count, and a marquee-select drag never fires a click
   * at all (browsers suppress the click when the pointerdown→up sequence
   * involved real movement), so this can't misfire during either. */
  onSelectBackground?: () => void;
  /** True for as long as a second touch is also down (a pinch gesture in
   * progress) — every layer's own drag-to-move checks this and bails out
   * immediately rather than starting/continuing a drag. Without this, one
   * finger of a two-finger pinch landing on a layer fired that layer's own
   * pointerdown/pointermove (pointer events are independent of, and fire
   * alongside, the touch events the pinch/pan handler in index.tsx reads),
   * dragging the layer out from under the pinch at the same time the
   * canvas itself was zooming/panning underneath it. A ref, not state —
   * this flips mid-gesture and must never trigger a re-render. */
  suppressDragRef?: React.RefObject<boolean> | undefined;
};

export const QuoteCanvas = forwardRef<HTMLDivElement, Props>(function QuoteCanvas(
  {
    s,
    interactive = false,
    scale = 1,
    set,
    selection,
    onSelectionChange,
    registerTextLayerHandle,
    suppressDragRef,
    onSelectBackground,
  },
  ref,
) {
  // Always-current `s` without being a captured closure value — `s`
  // necessarily gets a new reference on every keystroke typed into any text
  // layer (that's what typing does), and beginGroupDrag/updateGroupDrag
  // below get threaded all the way down into DraggableTextLayer's memoized
  // editableNode as onGroupDragStart/onGroupDragMove. If those callbacks
  // depended on `s` directly, they'd get a new identity every keystroke
  // too, which would still force that div's DOM (and the live caret in it)
  // to reset despite the dedicated fixes there — same root cause, just one
  // level up the prop chain. Reading `s` from a ref instead keeps them
  // genuinely stable while still always acting on the latest state.
  const sRef = useRef(s);
  sRef.current = s;
  // Same reasoning as sRef above, for `scale`: updateGroupDrag closed over
  // it directly and listed it as a dependency, so it got a new identity on
  // every single zoom-gesture frame — which, threaded down as every layer's
  // onGroupDragMove prop, defeated DraggableTextLayer/DraggableImageLayer/
  // DraggableShapeLayer's scale-aware React.memo (see scaleAwarePropsEqual)
  // by looking like a changed prop on every one of them, every frame, zoom
  // gesture or not.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  // Counter-scale for the multi-selection "N Layers Selected / Delete All"
  // pill below — same technique as LayerToolbar's own `invScale`, since
  // that pill renders inside the canvas's `scale(${scale})` transform too
  // and would otherwise shrink to the point of being unreadable at low zoom.
  const multiSelectInvScale = scale > 0 ? 1 / scale : 1;

  const [guides, setGuides] = useState<GuidesState>({ vCenter: false, hCenter: false });
  // Tracks whether the *previous* guides update was "snapped" (any guide
  // line/edge/center active), so the haptic below only fires once on the
  // false->true transition — not on every pointermove while a drag stays
  // snapped, and not when a drag ends and guides clear back to false.
  const wasSnappedRef = useRef(false);
  const handleGuidesChange = useCallback((g: GuidesState) => {
    const isSnapped = !!(
      g.vCenter ||
      g.hCenter ||
      g.edgeLeft ||
      g.edgeRight ||
      g.edgeTop ||
      g.edgeBottom ||
      (g.lines && g.lines.length > 0)
    );
    if (isSnapped && !wasSnappedRef.current) {
      triggerAlignmentHaptic();
    }
    wasSnappedRef.current = isSnapped;
    setGuides(g);
  }, []);
  const [controlsOverlayEl, setControlsOverlayEl] = useState<HTMLDivElement | null>(null);

  type LayerRef = { kind: "image" | "text" | "shape"; id: string };
  const [internalSelected, setInternalSelected] = useState<LayerRef[]>([]);
  const selected = selection !== undefined ? selection : internalSelected;

  const selectLayer = useCallback(
    (kind: LayerRef["kind"], id: string, opts?: { toggle?: boolean }) => {
      const current = selection !== undefined ? selection : internalSelected;
      let next: LayerRef[];
      if (opts?.toggle) {
        const exists = current.some((p) => p.kind === kind && p.id === id);
        next = exists ? current.filter((p) => !(p.kind === kind && p.id === id)) : [...current, { kind, id }];
      } else {
        const [only] = current;
        if (current.length === 1 && only && only.kind === kind && only.id === id) return;
        next = [{ kind, id }];
      }
      if (onSelectionChange) {
        onSelectionChange(next);
      } else {
        setInternalSelected(next);
      }
    },
    [selection, internalSelected, onSelectionChange],
  );

  // Stable per-kind wrappers around `selectLayer` (the `onSelect` prop each
  // gallery layer gets needs a fixed `kind` baked in) — same stability
  // reasoning as `selectLayer` itself above.
  const onSelectText = useCallback(
    (id: string, opts?: { toggle?: boolean }) => selectLayer("text", id, opts),
    [selectLayer],
  );
  const onSelectImage = useCallback(
    (id: string, opts?: { toggle?: boolean }) => selectLayer("image", id, opts),
    [selectLayer],
  );
  const onSelectShape = useCallback(
    (id: string, opts?: { toggle?: boolean }) => selectLayer("shape", id, opts),
    [selectLayer],
  );

  // Dragging any one of several selected items moves the whole group —
  // captured once at drag-start (each item's own starting x/y, keyed by
  // kind+id since ids aren't unique across the three arrays) and re-applied
  // from that fixed baseline on every move, same as a single-item drag,
  // just fanned out across however many (and whichever) arrays are involved.
  const groupDragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    items: (LayerRef & { startX: number; startY: number })[];
  } | null>(null);

  // useCallback (same stability reasoning as `selectLayer` above — these
  // three are also threaded down into DraggableTextLayer's editableNode
  // memo as onGroupDragStart/onGroupDragMove/onGroupDragEnd).
  const beginGroupDrag = useCallback(
    (clientX: number, clientY: number) => {
      const s = sRef.current;
      const items: (LayerRef & { startX: number; startY: number })[] = [];
      for (const sel of selected) {
        if (sel.kind === "image") {
          const img = getImageLayers(s).find((i) => i.id === sel.id);
          if (img && !img.locked) items.push({ ...sel, startX: img.x, startY: img.y });
        } else if (sel.kind === "text") {
          const t = getTextLayers(s).find((t) => t.id === sel.id);
          if (t && !t.locked) items.push({ ...sel, startX: t.x, startY: t.y });
        } else {
          const shape = getShapeLayers(s).find((sh) => sh.id === sel.id);
          if (shape && !shape.locked) items.push({ ...sel, startX: shape.x, startY: shape.y });
        }
      }
      groupDragRef.current = { startMouseX: clientX, startMouseY: clientY, items };
    },
    [selected],
  );

  // Computes aggregate bounding box of all currently selected layers
  const selectedBounds = useMemo(() => {
    if (selected.length <= 1) return null;
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = Infinity;
    let maxBottom = -Infinity;

    const allElements = getAllCanvasElements(s);
    for (const sel of selected) {
      const el = allElements.find((e) => e.id === sel.id);
      if (el) {
        const left = (el.x / 100) * s.width - el.width / 2;
        const right = (el.x / 100) * s.width + el.width / 2;
        const top = (el.y / 100) * s.height - el.height / 2;
        const bottom = (el.y / 100) * s.height + el.height / 2;
        minLeft = Math.min(minLeft, left);
        maxRight = Math.max(maxRight, right);
        minTop = Math.min(minTop, top);
        maxBottom = Math.max(maxBottom, bottom);
      }
    }

    if (!Number.isFinite(minLeft) || minLeft >= maxRight || minTop >= maxBottom) return null;

    const width = maxRight - minLeft;
    const height = maxBottom - minTop;
    const centerX = ((minLeft + width / 2) / s.width) * 100;
    const centerY = ((minTop + height / 2) / s.height) * 100;

    return {
      left: minLeft,
      top: minTop,
      width,
      height,
      centerX,
      centerY,
      isNearCenterX: Math.abs(centerX - 50) < 0.6,
      isNearCenterY: Math.abs(centerY - 50) < 0.6,
      isNearEdgeLeft: minLeft <= 8,
      isNearEdgeRight: maxRight >= s.width - 8,
      isNearEdgeTop: minTop <= 8,
      isNearEdgeBottom: maxBottom >= s.height - 8,
    };
  }, [selected, s]);

  const updateGroupDrag = useCallback(
    (clientX: number, clientY: number) => {
      const s = sRef.current;
      const g = groupDragRef.current;
      if (!g || !set) return;
      let dxPct = ((clientX - g.startMouseX) / scaleRef.current / s.width) * 100;
      let dyPct = ((clientY - g.startMouseY) / scaleRef.current / s.height) * 100;

      // Group alignment snapping calculation
      let showVCenter = false;
      let showHCenter = false;
      let showEdgeLeft = false;
      let showEdgeRight = false;
      let showEdgeTop = false;
      let showEdgeBottom = false;

      if (g.items.length > 1) {
        const minStartX = Math.min(...g.items.map((it) => it.startX));
        const maxStartX = Math.max(...g.items.map((it) => it.startX));
        const minStartY = Math.min(...g.items.map((it) => it.startY));
        const maxStartY = Math.max(...g.items.map((it) => it.startY));

        const selectedIds = new Set(g.items.map((it) => it.id));
        const otherElements = getAllCanvasElements(s).filter((el) => !selectedIds.has(el.id));

        const groupWidth = selectedBounds?.width ?? Math.max(20, ((maxStartX - minStartX) / 100) * s.width);
        const groupHeight = selectedBounds?.height ?? Math.max(20, ((maxStartY - minStartY) / 100) * s.height);
        const rawGroupCenterX = (minStartX + maxStartX) / 2 + dxPct;
        const rawGroupCenterY = (minStartY + maxStartY) / 2 + dyPct;

        const { nextX: snappedGroupCenterX, nextY: snappedGroupCenterY, guides: snapGuides } =
          calculateAlignmentSnap({
            currentId: "__multi_group__",
            rawX: rawGroupCenterX,
            rawY: rawGroupCenterY,
            width: groupWidth,
            height: groupHeight,
            s,
            otherElements,
          });

        dxPct = snappedGroupCenterX - (minStartX + maxStartX) / 2;
        dyPct = snappedGroupCenterY - (minStartY + maxStartY) / 2;

        handleGuidesChange(snapGuides);
      }

      const imageItems = g.items.filter((it) => it.kind === "image");
      if (imageItems.length) {
        let next = getImageLayers(s);
        for (const it of imageItems) {
          next = next.map((img) =>
            img.id === it.id ? { ...img, x: it.startX + dxPct, y: it.startY + dyPct } : img,
          );
        }
        set("images", next);
      }
      const textItems = g.items.filter((it) => it.kind === "text");
      if (textItems.length) {
        let next = getTextLayers(s);
        for (const it of textItems) {
          next = next.map((t) => (t.id === it.id ? { ...t, x: it.startX + dxPct, y: it.startY + dyPct } : t));
        }
        set("texts", next);
      }
      const shapeItems = g.items.filter((it) => it.kind === "shape");
      if (shapeItems.length) {
        let next = getShapeLayers(s);
        for (const it of shapeItems) {
          next = next.map((sh) =>
            sh.id === it.id ? { ...sh, x: it.startX + dxPct, y: it.startY + dyPct } : sh,
          );
        }
        set("shapes", next);
      }
    },
    [set],
  );

  const endGroupDrag = useCallback(() => {
    groupDragRef.current = null;
    handleGuidesChange({ vCenter: false, hCenter: false });
  }, []);

  // Arrow keys nudge every currently-selected layer together — 0.1% of the
  // canvas per press, 1% with Shift held (roughly a "fine" vs "coarse"
  // step, matching the usual design-tool convention). Skipped entirely
  // while focus is on an actual input/textarea or a contentEditable text
  // layer being typed into, so arrow keys still work normally there
  // (moving a text caret, adjusting a number field) instead of also
  // nudging the canvas underneath.
  useEffect(() => {
    if (!interactive || !set) return;
    const handler = (e: KeyboardEvent) => {
      if (selected.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.isContentEditable || active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
        return;
      }

      // Delete or Backspace key to delete selected layers
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const currentS = sRef.current;
        const selImages = selected.filter((sel) => sel.kind === "image").map((sel) => sel.id);
        const selTexts = selected.filter((sel) => sel.kind === "text").map((sel) => sel.id);
        const selShapes = selected.filter((sel) => sel.kind === "shape").map((sel) => sel.id);

        if (selImages.length) {
          const next = getImageLayers(currentS).filter((img) => !selImages.includes(img.id) || img.locked);
          set("images", next);
        }
        if (selTexts.length) {
          const next = getTextLayers(currentS).filter((t) => !selTexts.includes(t.id) || t.locked);
          set("texts", next);
        }
        if (selShapes.length) {
          const next = getShapeLayers(currentS).filter((sh) => !selShapes.includes(sh.id) || sh.locked);
          set("shapes", next);
        }

        onSelectionChange?.([]);
        return;
      }

      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
        return;
      }

      e.preventDefault();
      const currentS = sRef.current;
      const step = e.shiftKey ? 1 : 0.1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      const selImages = selected.filter((sel) => sel.kind === "image").map((sel) => sel.id);
      if (selImages.length) {
        let next = getImageLayers(currentS);
        for (const id of selImages) {
          next = next.map((img) => (img.id === id && !img.locked ? { ...img, x: img.x + dx, y: img.y + dy } : img));
        }
        set("images", next);
      }
      const selTexts = selected.filter((sel) => sel.kind === "text").map((sel) => sel.id);
      if (selTexts.length) {
        let next = getTextLayers(currentS);
        for (const id of selTexts) {
          next = next.map((t) => (t.id === id && !t.locked ? { ...t, x: t.x + dx, y: t.y + dy } : t));
        }
        set("texts", next);
      }
      const selShapes = selected.filter((sel) => sel.kind === "shape").map((sel) => sel.id);
      if (selShapes.length) {
        let next = getShapeLayers(currentS);
        for (const id of selShapes) {
          next = next.map((sh) => (sh.id === id && !sh.locked ? { ...sh, x: sh.x + dx, y: sh.y + dy } : sh));
        }
        set("shapes", next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [interactive, set, selected, onSelectionChange]);

  useEffect(() => {
    loadGoogleFont(s.quoteFont);
    loadGoogleFont(s.authorFont);
    loadGoogleFont(s.taglineFont);
    if (s.topButtonFont) loadGoogleFont(s.topButtonFont);
  }, [s.quoteFont, s.authorFont, s.taglineFont, s.topButtonFont]);

  return (
    <div
      ref={ref}
      style={{
        width: s.width,
        height: s.height,
        position: "relative",
        overflow: interactive ? "visible" : "hidden",
        fontFamily: '"Outfit", sans-serif',
      }}
    >
      {/* 1. CLIPPED CANVAS VISUAL CONTENT VIEWPORT (overflow: hidden) */}
      {/* Clips images, shapes, text, and shadows strictly at the canvas border like Canva */}
      <div
        onClick={(e) => {
          if (interactive && e.target === e.currentTarget) onSelectBackground?.();
        }}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          background: s.background,
          borderRadius: s.canvasRadius ?? 0,
          pointerEvents: "auto",
        }}
      >
        {s.bgImage ? (
          <img
            src={s.bgImage}
            alt="Canvas Background"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: `${s.bgImagePosX ?? 50}% ${s.bgImagePosY ?? 50}%`,
              // Clamped to never go below 1 (100%) — object-fit: cover
              // already sizes the image to exactly fill the canvas at
              // zoom=100%; scaling it any smaller than that shrinks it
              // BELOW that fill size, exposing the canvas's own background
              // color/gradient around it instead of "zooming out" the
              // photo the way the slider implies. A stored value below
              // 100% (from before this fix, or the Range's own min) is
              // clamped visually here regardless of what's saved, so it
              // self-heals without needing the slider touched again.
              transform: `scale(${Math.max(1, (s.bgImageZoom ?? 100) / 100) * (s.bgBlur > 0 ? 1.06 : 1)})`,
              transformOrigin: `${s.bgImagePosX ?? 50}% ${s.bgImagePosY ?? 50}%`,
              filter: s.bgBlur > 0 ? `blur(${s.bgBlur}px)` : "none",
              zIndex: 1,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        ) : null}
        {s.bgDim > 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `rgba(0,0,0,${s.bgDim / 100})`,
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
        ) : null}

        {/* Unified Layer Visual Content (Images, Shapes, Text graphics) */}
        {getUnifiedLayers(s).map((layerRef, i) => {
          if (layerRef.kind === "shape") {
            const shape = getShapeLayers(s).find((sh) => sh.id === layerRef.id);
            if (!shape) return null;
            return (
              <DraggableShapeLayer
                key={shape.id}
                shape={shape}
                index={i}
                s={s}
                scale={scale}
                interactive={interactive}
                set={set}
                selected={selected.some((sel) => sel.kind === "shape" && sel.id === shape.id)}
                selectedCount={selected.length}
                onSelect={onSelectShape}
                onGroupDragStart={beginGroupDrag}
                onGroupDragMove={updateGroupDrag}
                onGroupDragEnd={endGroupDrag}
                onGuides={handleGuidesChange}
                controlsOverlayEl={controlsOverlayEl}
                suppressDragRef={suppressDragRef}
              />
            );
          }

          if (layerRef.kind === "image") {
            const img = getImageLayers(s).find((item) => item.id === layerRef.id);
            if (!img) return null;
            return (
              <DraggableImageLayer
                key={img.id}
                img={img}
                index={i}
                s={s}
                scale={scale}
                interactive={interactive}
                set={set}
                selected={selected.some((sel) => sel.kind === "image" && sel.id === img.id)}
                selectedCount={selected.length}
                onSelect={onSelectImage}
                onGroupDragStart={beginGroupDrag}
                onGroupDragMove={updateGroupDrag}
                onGroupDragEnd={endGroupDrag}
                onGuides={handleGuidesChange}
                controlsOverlayEl={controlsOverlayEl}
                suppressDragRef={suppressDragRef}
              />
            );
          }

          if (layerRef.kind === "text") {
            const t = getTextLayers(s).find((item) => item.id === layerRef.id);
            if (!t) return null;
            return (
              <DraggableTextLayer
                key={t.id}
                t={t}
                index={i}
                s={s}
                scale={scale}
                interactive={interactive}
                set={set}
                selected={selected.some((sel) => sel.kind === "text" && sel.id === t.id)}
                selectedCount={selected.length}
                onSelect={onSelectText}
                onGroupDragStart={beginGroupDrag}
                onGroupDragMove={updateGroupDrag}
                onGroupDragEnd={endGroupDrag}
                onGuides={handleGuidesChange}
                registerHandle={registerTextLayerHandle}
                controlsOverlayEl={controlsOverlayEl}
                suppressDragRef={suppressDragRef}
              />
            );
          }

          return null;
        })}
      </div>

      {/* 2. UNCLIPPED CONTROLS & SELECTION HANDLES OVERLAY (overflow: visible) */}
      {/* Selection outline, corner handle circles, edge pills, and toolbars render here via Portal */}
      <div
        ref={setControlsOverlayEl}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
        }}
      />



      {/* Smart Alignment & Canvas Edge Indication Guides Overlay */}
      {interactive &&
        (guides.vCenter ||
          guides.hCenter ||
          guides.edgeLeft ||
          guides.edgeRight ||
          guides.edgeTop ||
          guides.edgeBottom ||
          (guides.lines && guides.lines.length > 0)) ? (
        <div className="pointer-events-none absolute inset-0 z-[100] overflow-hidden">
          {/* Canvas Left Edge Indicator */}
          {guides.edgeLeft ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: "#ec4899",
                boxShadow: "0 0 14px rgba(236,72,153,1)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 24,
                  left: 6,
                  background: "#ec4899",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 7px",
                  borderRadius: 4,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                Left Edge
              </span>
            </div>
          ) : null}

          {/* Canvas Right Edge Indicator */}
          {guides.edgeRight ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: "#ec4899",
                boxShadow: "0 0 14px rgba(236,72,153,1)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 24,
                  right: 6,
                  background: "#ec4899",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 7px",
                  borderRadius: 4,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                Right Edge
              </span>
            </div>
          ) : null}

          {/* Canvas Top Edge Indicator */}
          {guides.edgeTop ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: "#ec4899",
                boxShadow: "0 0 14px rgba(236,72,153,1)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 24,
                  top: 6,
                  background: "#ec4899",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 7px",
                  borderRadius: 4,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                Top Edge
              </span>
            </div>
          ) : null}

          {/* Canvas Bottom Edge Indicator */}
          {guides.edgeBottom ? (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 3,
                background: "#ec4899",
                boxShadow: "0 0 14px rgba(236,72,153,1)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 24,
                  bottom: 6,
                  background: "#ec4899",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 7px",
                  borderRadius: 4,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                Bottom Edge
              </span>
            </div>
          ) : null}

          {/* Canvas Vertical Center Line */}
          {guides.vCenter ? (
            <div
              style={{
                position: "absolute",
                left: `${guides.xPct ?? 50}%`,
                top: 0,
                bottom: 0,
                width: 2,
                transform: "translateX(-50%)",
                background: "#ec4899",
                boxShadow: "0 0 10px rgba(236,72,153,0.9)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 14,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#ec4899",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 7px",
                  borderRadius: 4,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                  whiteSpace: "nowrap",
                }}
              >
                Center X
              </span>
            </div>
          ) : null}

          {/* Canvas Horizontal Center Line */}
          {guides.hCenter ? (
            <div
              style={{
                position: "absolute",
                top: `${guides.yPct ?? 50}%`,
                left: 0,
                right: 0,
                height: 2,
                transform: "translateY(-50%)",
                background: "#ec4899",
                boxShadow: "0 0 10px rgba(236,72,153,0.9)",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "#ec4899",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 7px",
                  borderRadius: 4,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                  whiteSpace: "nowrap",
                }}
              >
                Center Y
              </span>
            </div>
          ) : null}

          {/* Element-to-Element Dotted Alignment Lines */}
          {guides.lines?.map((line, idx) => {
            if (line.orientation === "vertical") {
              const top = Math.min(line.startPct, line.endPct);
              const height = Math.max(2, Math.abs(line.endPct - line.startPct));
              return (
                <div
                  key={idx}
                  style={{
                    position: "absolute",
                    left: `${line.posPct}%`,
                    top: `${top}%`,
                    height: `${height}%`,
                    width: 0,
                    transform: "translateX(-50%)",
                    borderLeft: "2px dotted #ec4899",
                    filter: "drop-shadow(0 0 3px rgba(236,72,153,0.9))",
                  }}
                />
              );
            }
            const left = Math.min(line.startPct, line.endPct);
            const width = Math.max(2, Math.abs(line.endPct - line.startPct));
            return (
              <div
                key={idx}
                style={{
                  position: "absolute",
                  top: `${line.posPct}%`,
                  left: `${left}%`,
                  width: `${width}%`,
                  height: 0,
                  transform: "translateY(-50%)",
                  borderTop: "2px dotted #ec4899",
                  filter: "drop-shadow(0 0 3px rgba(236,72,153,0.9))",
                }}
              />
            );
          })}
        </div>
      ) : null}

      {/* Multi-Selection Composite Bounding Box & Group Badge */}
      {selectedBounds && interactive && selected.length > 1 ? (
        <div
          className="pointer-events-none absolute z-[95]"
          style={{
            left: selectedBounds.left,
            top: selectedBounds.top,
            width: selectedBounds.width,
            height: selectedBounds.height,
            border: "1.5px dashed #8b5cf6",
            boxShadow: "0 0 12px rgba(139,92,246,0.35)",
          }}
        >
          {/* Corner Pin Anchors */}
          <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-violet-600 shadow" />
          <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-violet-600 shadow" />
          <div className="absolute -left-1.5 -bottom-1.5 h-3 w-3 rounded-full border-2 border-white bg-violet-600 shadow" />
          <div className="absolute -right-1.5 -bottom-1.5 h-3 w-3 rounded-full border-2 border-white bg-violet-600 shadow" />

          {/* Group Info Badge & Interactive Multi-Delete Toolbar — this
              whole subtree lives inside the canvas's own `scale(${scale})`
              transform, so without a counter-scale here this pill (and its
              text/icons) would shrink right along with it at low zoom,
              becoming unreadably tiny — same fix as LayerToolbar's own
              invScale above. */}
          <div
            data-nopan=""
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: "50%",
              top: -34 * multiSelectInvScale,
              transformOrigin: "top center",
              transform: `translateX(-50%) scale(${multiSelectInvScale})`,
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 14px",
              borderRadius: 20,
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 10,
              pointerEvents: "auto",
            }}
          >
            <span>{selected.length} Layers Selected</span>
            <span style={{ opacity: 0.3 }}>|</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!set) return;
                const result = withMultipleLayersRemoved(s, selected);
                set("texts", result.texts);
                set("images", result.images);
                set("shapes", result.shapes);
                set("layerOrder", result.layerOrder);
                onSelectionChange?.([]);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                color: "#ef4444",
                background: "rgba(239, 68, 68, 0.15)",
                border: "none",
                borderRadius: 12,
                padding: "4px 10px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 12,
              }}
              title="Delete all selected layers"
            >
              <Delete02Icon size={14} />
              Delete All
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export type AlignmentGuideLine = {
  orientation: "vertical" | "horizontal";
  posPct: number;
  startPct: number;
  endPct: number;
  style?: "dotted" | "solid";
};

export type GuidesState = {
  vCenter?: boolean;
  hCenter?: boolean;
  edgeLeft?: boolean;
  edgeRight?: boolean;
  edgeTop?: boolean;
  edgeBottom?: boolean;
  xPct?: number;
  yPct?: number;
  lines?: AlignmentGuideLine[];
};

export type ElementBounds = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function getAllCanvasElements(s: EditorState): ElementBounds[] {
  const elements: ElementBounds[] = [];
  getTextLayers(s).forEach((t) => {
    let w = t.width ?? 400;
    let h = t.minHeight ?? t.size * 1.3;
    const el = document.querySelector(`[data-layer-id="${t.id}"]`) as HTMLElement | null;
    if (el) {
      w = el.offsetWidth || w;
      h = el.offsetHeight || h;
    }
    elements.push({
      id: t.id,
      x: t.x,
      y: t.y,
      width: w,
      height: h,
    });
  });
  getShapeLayers(s).forEach((sh) => {
    let w = sh.size;
    let h = sh.height ?? sh.size;
    const el = document.querySelector(`[data-layer-id="${sh.id}"]`) as HTMLElement | null;
    if (el) {
      w = el.offsetWidth || w;
      h = el.offsetHeight || h;
    }
    elements.push({
      id: sh.id,
      x: sh.x,
      y: sh.y,
      width: w,
      height: h,
    });
  });
  getImageLayers(s).forEach((img) => {
    let w = img.size;
    let h = img.height ?? img.size;
    const el = document.querySelector(`[data-layer-id="${img.id}"]`) as HTMLElement | null;
    if (el) {
      w = el.offsetWidth || w;
      h = el.offsetHeight || h;
    }
    elements.push({
      id: img.id,
      x: img.x,
      y: img.y,
      width: w,
      height: h,
    });
  });
  return elements;
}

function calculateAlignmentSnap({
  currentId,
  rawX,
  rawY,
  width,
  height,
  s,
  otherElements,
}: {
  currentId: string;
  rawX: number;
  rawY: number;
  width: number;
  height: number;
  s: EditorState;
  otherElements?: ElementBounds[];
}): { nextX: number; nextY: number; guides: GuidesState } {
  const canvasW = s.width;
  const canvasH = s.height;
  const snapPx = 8;

  let currCenterX = (rawX / 100) * canvasW;
  let currCenterY = (rawY / 100) * canvasH;
  const halfW = width / 2;
  const halfH = height / 2;

  let showVCenter = false;
  let showHCenter = false;
  let showEdgeLeft = false;
  let showEdgeRight = false;
  let showEdgeTop = false;
  let showEdgeBottom = false;
  const lines: AlignmentGuideLine[] = [];

  // 1. Canvas Center X & Y
  if (Math.abs(currCenterX - canvasW / 2) <= snapPx) {
    currCenterX = canvasW / 2;
    showVCenter = true;
  }
  if (Math.abs(currCenterY - canvasH / 2) <= snapPx) {
    currCenterY = canvasH / 2;
    showHCenter = true;
  }

  // 2. Canvas Outer Edges Snapping & Indication (Left, Right, Top, Bottom)
  // Left Edge (object left edge meets canvas left edge)
  if (Math.abs(currCenterX - halfW) <= snapPx) {
    currCenterX = halfW;
    showEdgeLeft = true;
  }
  // Right Edge (object right edge meets canvas right edge)
  if (Math.abs(currCenterX + halfW - canvasW) <= snapPx) {
    currCenterX = canvasW - halfW;
    showEdgeRight = true;
  }
  // Top Edge (object top edge meets canvas top edge)
  if (Math.abs(currCenterY - halfH) <= snapPx) {
    currCenterY = halfH;
    showEdgeTop = true;
  }
  // Bottom Edge (object bottom edge meets canvas bottom edge)
  if (Math.abs(currCenterY + halfH - canvasH) <= snapPx) {
    currCenterY = canvasH - halfH;
    showEdgeBottom = true;
  }

  // 3. Element-to-Element Snapping
  if (otherElements && otherElements.length > 0) {
    const currLeft = currCenterX - halfW;
    const currRight = currCenterX + halfW;
    const currTop = currCenterY - halfH;
    const currBottom = currCenterY + halfH;

    for (const other of otherElements) {
      if (other.id === currentId) continue;
      const otherCenterX = (other.x / 100) * canvasW;
      const otherCenterY = (other.y / 100) * canvasH;
      const otherHalfW = other.width / 2;
      const otherHalfH = other.height / 2;
      const otherLeft = otherCenterX - otherHalfW;
      const otherRight = otherCenterX + otherHalfW;
      const otherTop = otherCenterY - otherHalfH;
      const otherBottom = otherCenterY + otherHalfH;

      // Vertical alignment lines (X axis):
      // A. Right edge aligns with other Right edge
      if (Math.abs(currRight - otherRight) <= snapPx) {
        currCenterX = otherRight - halfW;
        lines.push({
          orientation: "vertical",
          posPct: (otherRight / canvasW) * 100,
          startPct: (Math.min(currTop, otherTop) / canvasH) * 100,
          endPct: (Math.max(currBottom, otherBottom) / canvasH) * 100,
          style: "dotted",
        });
      }
      // B. Left edge aligns with other Left edge
      else if (Math.abs(currLeft - otherLeft) <= snapPx) {
        currCenterX = otherLeft + halfW;
        lines.push({
          orientation: "vertical",
          posPct: (otherLeft / canvasW) * 100,
          startPct: (Math.min(currTop, otherTop) / canvasH) * 100,
          endPct: (Math.max(currBottom, otherBottom) / canvasH) * 100,
          style: "dotted",
        });
      }
      // C. Center X aligns with other Center X
      else if (Math.abs(currCenterX - otherCenterX) <= snapPx && !showVCenter) {
        currCenterX = otherCenterX;
        lines.push({
          orientation: "vertical",
          posPct: (otherCenterX / canvasW) * 100,
          startPct: (Math.min(currTop, otherTop) / canvasH) * 100,
          endPct: (Math.max(currBottom, otherBottom) / canvasH) * 100,
          style: "dotted",
        });
      }
      // D. Left edge aligns with other Right edge
      else if (Math.abs(currLeft - otherRight) <= snapPx) {
        currCenterX = otherRight + halfW;
        lines.push({
          orientation: "vertical",
          posPct: (otherRight / canvasW) * 100,
          startPct: (Math.min(currTop, otherTop) / canvasH) * 100,
          endPct: (Math.max(currBottom, otherBottom) / canvasH) * 100,
          style: "dotted",
        });
      }
      // E. Right edge aligns with other Left edge
      else if (Math.abs(currRight - otherLeft) <= snapPx) {
        currCenterX = otherLeft - halfW;
        lines.push({
          orientation: "vertical",
          posPct: (otherLeft / canvasW) * 100,
          startPct: (Math.min(currTop, otherTop) / canvasH) * 100,
          endPct: (Math.max(currBottom, otherBottom) / canvasH) * 100,
          style: "dotted",
        });
      }

      // Horizontal alignment lines (Y axis):
      // F. Top edge aligns with other Top edge
      if (Math.abs(currTop - otherTop) <= snapPx) {
        currCenterY = otherTop + halfH;
        lines.push({
          orientation: "horizontal",
          posPct: (otherTop / canvasH) * 100,
          startPct: (Math.min(currLeft, otherLeft) / canvasW) * 100,
          endPct: (Math.max(currRight, otherRight) / canvasW) * 100,
          style: "dotted",
        });
      }
      // G. Bottom edge aligns with other Bottom edge
      else if (Math.abs(currBottom - otherBottom) <= snapPx) {
        currCenterY = otherBottom - halfH;
        lines.push({
          orientation: "horizontal",
          posPct: (otherBottom / canvasH) * 100,
          startPct: (Math.min(currLeft, otherLeft) / canvasW) * 100,
          endPct: (Math.max(currRight, otherRight) / canvasW) * 100,
          style: "dotted",
        });
      }
      // H. Center Y aligns with other Center Y
      else if (Math.abs(currCenterY - otherCenterY) <= snapPx && !showHCenter) {
        currCenterY = otherCenterY;
        lines.push({
          orientation: "horizontal",
          posPct: (otherCenterY / canvasH) * 100,
          startPct: (Math.min(currLeft, otherLeft) / canvasW) * 100,
          endPct: (Math.max(currRight, otherRight) / canvasW) * 100,
          style: "dotted",
        });
      }
      // I. Top edge aligns with other Bottom edge
      else if (Math.abs(currTop - otherBottom) <= snapPx) {
        currCenterY = otherBottom + halfH;
        lines.push({
          orientation: "horizontal",
          posPct: (otherBottom / canvasH) * 100,
          startPct: (Math.min(currLeft, otherLeft) / canvasW) * 100,
          endPct: (Math.max(currRight, otherRight) / canvasW) * 100,
          style: "dotted",
        });
      }
      // J. Bottom edge aligns with other Top edge
      else if (Math.abs(currBottom - otherTop) <= snapPx) {
        currCenterY = otherTop - halfH;
        lines.push({
          orientation: "horizontal",
          posPct: (otherTop / canvasH) * 100,
          startPct: (Math.min(currLeft, otherLeft) / canvasW) * 100,
          endPct: (Math.max(currRight, otherRight) / canvasW) * 100,
          style: "dotted",
        });
      }
    }
  }

  const nextX = Number(((currCenterX / canvasW) * 100).toFixed(3));
  const nextY = Number(((currCenterY / canvasH) * 100).toFixed(3));

  return {
    nextX: Math.min(250, Math.max(-150, nextX)),
    nextY: Math.min(250, Math.max(-150, nextY)),
    guides: {
      vCenter: showVCenter,
      hCenter: showHCenter,
      edgeLeft: showEdgeLeft,
      edgeRight: showEdgeRight,
      edgeTop: showEdgeTop,
      edgeBottom: showEdgeBottom,
      xPct: 50,
      yPct: 50,
      lines,
    },
  };
}

// Canva-style floating action bar shown above a selected gallery layer
// (image/text/shape) — Lock/Unlock, Duplicate, Delete. Shared by all three
// so the look and the stopPropagation plumbing (clicking a button must
// never also start a drag on the element underneath it) live in one place.
function LayerToolbar({
  locked,
  onToggleLock,
  onDuplicate,
  onDelete,
  scale = 1,
  placement = "top",
}: {
  locked: boolean;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  scale?: number | undefined;
  placement?: "top" | "bottom" | undefined;
}) {
  const invScale = scale > 0 ? 1 / scale : 1;
  const btn =
    "flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white active:scale-95";
  return (
    <div
      data-nopan=""
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: placement === "top" ? -16 * invScale : undefined,
        bottom: placement === "bottom" ? -16 * invScale : undefined,
        left: "50%",
        transformOrigin: placement === "top" ? "bottom center" : "top center",
        transform: `translateX(-50%) translateY(${placement === "top" ? "-100%" : "100%"}) scale(${invScale})`,
        zIndex: 80,
        touchAction: "manipulation",
      }}
      className="flex items-center gap-1 whitespace-nowrap rounded-full border border-white/15 bg-[#15161c]/95 px-2 py-1.5 shadow-2xl backdrop-blur-md"
    >
      {locked ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          title="Unlock layer"
          className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-amber-400 transition-colors hover:bg-amber-400/20 hover:text-amber-300 active:scale-95"
        >
          <SquareLock02Icon size={16} />
          <span>Unlock</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock();
            }}
            title="Lock layer"
            className={btn}
          >
            <SquareUnlock02Icon size={18} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicate"
            className={btn}
          >
            <Copy01Icon size={18} />
          </button>
          <div className="mx-0.5 h-5 w-px bg-white/15" />
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-red-500/20 hover:text-red-400 active:scale-95"
          >
            <Delete02Icon size={18} />
          </button>
        </>
      )}
    </div>
  );
}

// The two circular handles docked below (or above, to dodge LayerToolbar
// when it's flipped down near the top of the canvas) a selected layer's
// bounding box — rotate on the left, move on the right, matching Canva's
// mobile gizmo. Move just re-wires the exact same pointer handlers already
// driving drag-from-the-layer-body (passed in from the caller) onto a
// dedicated, easier-to-grab target; rotate is new — it recomputes the
// layer's absolute rotation on every pointermove directly from the angle
// between the box's own screen-space center and the current pointer
// position (not a relative delta from the drag's start), which stays
// correct with no extra bookkeeping regardless of where exactly the user
// grabbed the handle or how the box has already rotated. Lives inside the
// same rotated overlay div as the selection outline/resize handles in each
// layer component below, so it naturally swings around with the box.
function RotateMoveHandleRow({
  containerRef,
  onRotate,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  scale = 1,
  placement = "bottom",
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRotate: (deg: number) => void;
  onMovePointerDown: ((e: React.PointerEvent) => void) | undefined;
  onMovePointerMove: ((e: React.PointerEvent) => void) | undefined;
  onMovePointerUp: ((e: React.PointerEvent) => void) | undefined;
  scale?: number | undefined;
  placement?: "top" | "bottom" | undefined;
}) {
  const rotatingRef = useRef(false);
  const invScale = scale > 0 ? 1 / scale : 1;
  // Only populated while actively dragging the rotate handle — drives the
  // little "-17°"-style badge below. Kept local (not read from the layer's
  // own rotation prop) since it needs to update live on every pointermove,
  // one render ahead of the parent's own state actually committing.
  const [liveAngle, setLiveAngle] = useState<number | null>(null);

  const handleRotatePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rotatingRef.current = true;
  };

  const handleRotatePointerMove = (e: React.PointerEvent) => {
    if (!rotatingRef.current || !containerRef.current) return;
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // atan2 with a pointer straight below center (this handle's resting
    // spot at rotation 0) reads 90° — subtracting that lines up "handle
    // hasn't moved" with "rotation hasn't changed".
    let angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - 90;
    angle = ((angle + 180) % 360 + 360) % 360 - 180; // normalize to (-180, 180]
    const SNAP_TARGETS = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
    for (const target of SNAP_TARGETS) {
      if (Math.abs(angle - target) < 4) {
        angle = target;
        break;
      }
    }
    const rounded = Math.round(angle);
    setLiveAngle(rounded);
    onRotate(rounded);
  };

  const handleRotatePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
    rotatingRef.current = false;
    setLiveAngle(null);
  };

  const btn =
    "grid h-7 w-7 place-items-center rounded-full bg-white text-[#394660] shadow-[0_0_4px_1px_#39466024,0_0_0_1px_#2b354a4d] transition-colors hover:bg-background hover:text-white active:scale-95";

  return (
    <>
      <div
        data-nopan=""
        style={{
          position: "absolute",
          left: "50%",
          top: placement === "bottom" ? "100%" : undefined,
          bottom: placement === "top" ? "100%" : undefined,
          transform: `translateX(-50%) scale(${invScale})`,
          transformOrigin: placement === "bottom" ? "top center" : "bottom center",
          marginTop: placement === "bottom" ? 14 * invScale : undefined,
          marginBottom: placement === "top" ? 14 * invScale : undefined,
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          gap: 8,
          touchAction: "none",
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          title="Drag to rotate"
          onPointerDown={handleRotatePointerDown}
          onPointerMove={handleRotatePointerMove}
          onPointerUp={handleRotatePointerUp}
          onPointerCancel={handleRotatePointerUp}
          className={btn}
          style={{ cursor: "grab" }}
        >
          <ReloadIcon size={14} />
        </button>
        <button
          type="button"
          title="Drag to move"
          onPointerDown={onMovePointerDown}
          onPointerMove={onMovePointerMove}
          onPointerUp={onMovePointerUp}
          onPointerCancel={onMovePointerUp}
          className={btn}
          style={{ cursor: "grab" }}
        >
          <MoveIcon size={14} />
        </button>
      </div>

      {/* Live angle readout, shown only while actively dragging the rotate
          handle. Lives inside the same rotated overlay as everything else
          here, so it needs its own counter-rotation (by the in-progress
          angle) to stay upright and readable no matter how far the layer
          has been turned — a tilted number is much harder to read at a
          glance than the tilt itself. */}
      {liveAngle !== null ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: placement === "bottom" ? "100%" : undefined,
            bottom: placement === "top" ? "100%" : undefined,
            transform: `translateX(-50%) rotate(${-liveAngle}deg)`,
            marginTop: placement === "bottom" ? (44 + 14) * invScale : undefined,
            marginBottom: placement === "top" ? (44 + 14) * invScale : undefined,
            zIndex: 90,
            pointerEvents: "none",
          }}
        >
          <div
            style={{ transform: `scale(${invScale})` }}
            className="rounded-full bg-[#15161c]/95 px-2.5 py-1 text-xs font-semibold text-white shadow-2xl backdrop-blur-md whitespace-nowrap"
          >
            {liveAngle}°
          </div>
        </div>
      ) : null}
    </>
  );
}

// The 8 handle positions around a selection box — 4 round corners plus 4
// pill-shaped edge midpoints (wide/short on top+bottom, narrow/tall on
// left+right — matches Canva's look). Images and Shapes stretch width/
// height independently per handle (see widthDeltaFor/heightDeltaFor);
// Text has no separate width/height of its own (it's sized purely by font
// size), so all 8 of its handles fall back to resizeDelta's uniform
// diagonal scale instead.
//
// Every layer's selection outline is drawn via `outline: 2px solid` at
// `outlineOffset: 4`, which puts its visual centerline 5px out from the
// box's actual edge (offset 4 + half the 2px stroke). Each handle's own
// offset is picked so ITS center — not just its near edge — lands on that
// same 5px line: corner = -(5 + 14/2) = -12, edge perpendicular axis =
// -(5 + 10/2) = -10. (The old flat -8/-5 offsets predate the outline ring
// being added and only centered the handles on the box's raw edge instead.)
const HANDLE_POSITIONS = [
  { id: "nw", kind: "corner", style: { left: -12, top: -12 }, cursor: "nwse-resize" },
  { id: "n", kind: "edge-h", style: { left: "50%", top: -8, transform: "translateX(-50%)" }, cursor: "ns-resize" },
  { id: "ne", kind: "corner", style: { right: -12, top: -12 }, cursor: "nesw-resize" },
  { id: "e", kind: "edge-v", style: { right: -8, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
  { id: "se", kind: "corner", style: { right: -12, bottom: -12 }, cursor: "nwse-resize" },
  { id: "s", kind: "edge-h", style: { left: "50%", bottom: -8, transform: "translateX(-50%)" }, cursor: "ns-resize" },
  { id: "sw", kind: "corner", style: { left: -12, bottom: -12 }, cursor: "nesw-resize" },
  { id: "w", kind: "edge-v", style: { left: -8, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
] as const;

type HandleId = (typeof HANDLE_POSITIONS)[number]["id"];

// Corners render as small circles; edge handles as pill/bar shapes (a
// stadium shape falls straight out of `rounded-full` once width != height,
// no separate border-radius logic needed). These are the DESIGN-time sizes,
// i.e. what renders at canvas zoom = 100% — see `zoomed` below for how they
// actually get rendered at other zoom levels.
//
// This is the small VISIBLE dot/pill only — see handleHitDims right below
// for the (larger) actual pointer/touch hit target. Splitting the two
// apart is what let this shrink from the old single-size 14 / 20×10: on a
// small mobile canvas the previous size regularly sat close enough to a
// layer's own text to cover it, and shrinking it outright (tried earlier)
// just made it hard to grab. A small visible mark + a generous invisible
// hit area (the Figma/Canva pattern) fixes both at once.
function handleDims(kind: "corner" | "edge-h" | "edge-v"): { width: number; height: number } {
  switch (kind) {
    case "corner":
      return { width: 10, height: 10 };
    case "edge-h":
      return { width: 16, height: 8 };
    case "edge-v":
      return { width: 8, height: 16 };
  }
}

// The actual pointer/touch hit target for each resize handle — deliberately
// bigger than the visible dot/pill above so handles stay easy to grab
// (especially on mobile touch) without the VISIBLE shape itself being large
// enough to sit on top of, and hide, nearby text. This box is fully
// transparent; see each render site below for how the small dot gets
// centered inside it.
function handleHitDims(kind: "corner" | "edge-h" | "edge-v"): { width: number; height: number } {
  switch (kind) {
    case "corner":
      return { width: 28, height: 28 };
    case "edge-h":
      return { width: 32, height: 22 };
    case "edge-v":
      return { width: 22, height: 32 };
  }
}

// Handles live inside the canvas stage's own `transform: scale(zoom)`
// wrapper (see index.tsx), same as every layer — so left alone they'd
// shrink/grow proportionally with every zoom change, same as the content
// they're attached to. That's not what's wanted here: dims are kept a
// fixed, constant ON-SCREEN size regardless of zoom (same pattern as
// LayerToolbar's invScale) — a canvas that's zoomed out to fit a big
// design on screen shouldn't make the handles themselves harder to grab.
function zoomed(dims: { width: number; height: number }, scale: number): { width: number; height: number } {
  if (!scale || scale <= 0) return dims;
  return { width: dims.width / scale, height: dims.height / scale };
}

// Positions + sizes the (invisible) HIT box — see handleHitDims. Each
// layer's render site nests the small visible dot (getHandleVisualStyle)
// centered inside this, so the two always share the same on-screen center
// point without any separate offset math for the inner element.
function getHandleStyle(h: (typeof HANDLE_POSITIONS)[number], scale: number): React.CSSProperties {
  const dims = zoomed(handleHitDims(h.kind), scale);
  // Deliberately NOT counter-scaled like `dims` above — this is the gap
  // between the selection outline and the handle, and keeping it flat (its
  // on-screen size shrinking a bit at low mobile zoom, same as before) is
  // what keeps the dot feeling anchored to the outline instead of floating
  // away from it. A counter-scaled version was tried and made the gap
  // balloon up at mobile's low default canvas zoom (~0.3–0.5), visibly
  // detaching the handles from the selection outline — worse than the
  // small-zoom shrink it was meant to fix.
  const outlineOffset = 5; // 4px outlineOffset + 1px stroke offset to center on outline line

  const offsetX = outlineOffset + dims.width / 2;
  const offsetY = outlineOffset + dims.height / 2;

  let posStyle: React.CSSProperties = {};
  switch (h.id) {
    case "nw":
      posStyle = { left: -offsetX, top: -offsetY };
      break;
    case "n":
      posStyle = { left: "50%", top: -offsetY, transform: "translateX(-50%)" };
      break;
    case "ne":
      posStyle = { right: -offsetX, top: -offsetY };
      break;
    case "e":
      posStyle = { right: -offsetX, top: "50%", transform: "translateY(-50%)" };
      break;
    case "se":
      posStyle = { right: -offsetX, bottom: -offsetY };
      break;
    case "s":
      posStyle = { left: "50%", bottom: -offsetY, transform: "translateX(-50%)" };
      break;
    case "sw":
      posStyle = { left: -offsetX, bottom: -offsetY };
      break;
    case "w":
      posStyle = { left: -offsetX, top: "50%", transform: "translateY(-50%)" };
      break;
  }

  return {
    position: "absolute",
    ...posStyle,
    ...dims,
    cursor: h.cursor,
    zIndex: 60,
    touchAction: "none",
  };
}

// The small visible dot/pill, centered inside its parent hit box (see
// getHandleStyle) via plain 50%/50% + translate — no offset math needed
// here since the hit box is already centered on the right on-screen point.
function getHandleVisualStyle(h: (typeof HANDLE_POSITIONS)[number], scale: number): React.CSSProperties {
  const dims = zoomed(handleDims(h.kind), scale);
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    ...dims,
    boxShadow: "0 2px 10px 0 rgba(0,33,255,0.5), 0 0 0 2px rgba(255,255,255,0.9)",
  };
}

// A layer's own rendered output only depends on `scale` when it's actually
// SELECTED — that's the only time it draws resize handles, the rotate/move
// row, and the toolbar, all of which size themselves from `scale` (see
// getHandleStyle/invScale above). A non-selected layer's content is
// positioned purely in canvas-space (percentages/pixels of the unscaled
// design), untouched by the canvas's own outer `transform: scale(zoom)` —
// so it has nothing to redraw when only `scale` changes. Without this, a
// live pinch/wheel zoom re-rendered and reconciled every single layer on
// canvas on every animation frame regardless of selection, which was the
// biggest remaining contributor to zoom feeling laggy with more than a
// couple of layers on the canvas. Wrapped around DraggableTextLayer/
// DraggableImageLayer/DraggableShapeLayer below via React.memo.
function scaleAwarePropsEqual<P extends { scale: number; selected: boolean }>(
  prev: Readonly<P>,
  next: Readonly<P>,
): boolean {
  for (const key in next) {
    if (key === "scale") continue;
    if (!Object.is((prev as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])) {
      return false;
    }
  }
  if (prev.scale === next.scale) return true;
  // scale itself changed — only a selected layer needs to re-render for it.
  return !next.selected;
}

// The lowest unified-stack position occupied by any text layer. Shapes/
// images explicitly pinned "Behind Text" (see the toggle in
// ShapeSelectionToolbar/ImageSelectionToolbar, and the shadow presets added
// via withShadowAdded, which always set this) need to render below every
// text layer no matter when they were added — but should still follow
// normal add-order sequencing against every OTHER, non-text layer (e.g. an
// image added, then a shadow added after it, should still stack the shadow
// above that image). See the zIndex math in DraggableImageLayer/
// DraggableShapeLayer below, which clamps a "behind"-tagged layer's index
// to just under this floor instead of using a flat always-lowest tier.
// Infinity when there's no text at all, so "Behind Text" items just fall
// back to plain sequence order in that case.
function textFloorIndex(s: EditorState): number {
  const unified = getUnifiedLayers(s);
  let min = Infinity;
  for (let i = 0; i < unified.length; i++) {
    if (unified[i]!.kind === "text") min = Math.min(min, i);
  }
  return min;
}

// Rotates a screen-space (dx, dy) vector by `degrees` clockwise — used both
// to map a resize-drag's raw pointer delta into a rotated layer's own local
// (unrotated) axes before feeding it to the resize math below, and to map
// that math's resulting center-shift back out into screen space afterward.
// Without this, dragging a corner/edge handle on a rotated layer would
// resize along screen axes instead of the layer's own rotated edges.
function rotateVector(dx: number, dy: number, degrees: number): { dx: number; dy: number } {
  if (!degrees) return { dx, dy };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

function resizeDelta(handleId: HandleId, dx: number, dy: number): number {
  switch (handleId) {
    case "nw":
      return (-dx - dy) / 2;
    case "n":
      return -dy;
    case "ne":
      return (dx - dy) / 2;
    case "e":
      return dx;
    case "se":
      return (dx + dy) / 2;
    case "s":
      return dy;
    case "sw":
      return (-dx + dy) / 2;
    case "w":
      return -dx;
  }
}

// Independent-axis resize: west-side handles grow the box as the pointer
// moves left (negative dx), east-side as it moves right; "n"/"s" don't
// touch width at all.
function widthDeltaFor(handleId: HandleId, dx: number): number {
  if (handleId === "n" || handleId === "s") return 0;
  return handleId === "w" || handleId === "nw" || handleId === "sw" ? -dx : dx;
}

// Same idea on the vertical axis — "e"/"w" don't touch height.
function heightDeltaFor(handleId: HandleId, dy: number): number {
  if (handleId === "e" || handleId === "w") return 0;
  return handleId === "n" || handleId === "nw" || handleId === "ne" ? -dy : dy;
}

// Corner-drag resize for layers with an independent width AND height (only
// Images for now — see the comment where this is used): unlike
// widthDeltaFor/heightDeltaFor's independent axes (still used for the 4
// edge handles, so a single side can still be stretched on its own), a
// CORNER scales width and height together at the box's original aspect
// ratio — "Uniform Scaling" in most design tools — so dragging diagonally
// keeps the image's proportions instead of distorting them. Height is
// derived purely from the clamped width via that original ratio (rather
// than scaling dw/dh independently), so it can never drift off-ratio.
// Both of `min`/`max`'s height-side equivalents are converted to width
// values up front and intersected with width's own [min, max] before
// clamping the raw width just once — clamping each axis separately and
// re-deriving the other (as a first pass at this did) can still overshoot
// the far bound for an extreme aspect ratio; converting to one axis first
// and clamping to the intersected interval can't.
function proportionalCornerSize(
  handleId: HandleId,
  dx: number,
  dy: number,
  startWidth: number,
  startHeight: number,
  min: number,
  max: number,
): { width: number; height: number } {
  const ratio = startHeight / startWidth;
  const delta = resizeDelta(handleId, dx, dy);
  const rawWidth = startWidth + delta;

  const widthAtMinHeight = min / ratio;
  const widthAtMaxHeight = max / ratio;
  const lo = Math.max(min, Math.min(widthAtMinHeight, widthAtMaxHeight));
  const hi = Math.min(max, Math.max(widthAtMinHeight, widthAtMaxHeight));

  const width = Math.min(hi, Math.max(lo, rawWidth));
  const height = width * ratio;
  return { width: Math.round(width), height: Math.round(height) };
}

// These elements are positioned by their CENTER (left/top % + a
// translate(-50%,-50%)), so just growing width/height alone would expand
// them symmetrically outward from that center — visually "resizing from
// the middle" no matter which handle is dragged. Real resize keeps the
// edge/corner *opposite* the one you're dragging fixed in place: e.g.
// dragging the right edge should hold the left edge still and only move
// the right one. That means the center has to shift by half of whatever
// the box actually grew by, toward the side being dragged.
function centerShiftX(handleId: HandleId, appliedDw: number): number {
  if (handleId === "n" || handleId === "s") return 0;
  return handleId === "w" || handleId === "nw" || handleId === "sw" ? -appliedDw / 2 : appliedDw / 2;
}

function centerShiftY(handleId: HandleId, appliedDh: number): number {
  if (handleId === "e" || handleId === "w") return 0;
  return handleId === "n" || handleId === "nw" || handleId === "ne" ? -appliedDh / 2 : appliedDh / 2;
}

// Floating "highlight to style" toolbar — appears above whatever text
// range is currently highlighted inside a text layer being edited, letting
// Bold/Italic/Underline/Strikethrough apply to just that selection instead

// Reconstructs "double-click selects the word under the cursor" from a
// viewport point, for the one case the browser can't do it natively: this
// div isn't contentEditable/selectable yet at the moment the double-click
// physically lands (see the isEditing effect in DraggableTextLayer for
// why), so nothing places a caret or word-selection on its own once it
// does become editable a moment later. Falls back to a collapsed caret at
// the point (still far better than the previous behavior of always
// jumping to the very start of the text) when the point lands on
// whitespace/punctuation, on a non-text node, or on a browser that
// supports neither caretRangeFromPoint nor caretPositionFromPoint.
function wordRangeFromPoint(x: number, y: number, container: HTMLElement): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretRangeFromPoint === "function") {
    const r = doc.caretRangeFromPoint(x, y);
    if (!r) return null;
    node = r.startContainer;
    offset = r.startOffset;
  } else if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    return null;
  }
  if (!node || !container.contains(node)) return null;

  const range = document.createRange();
  if (node.nodeType !== Node.TEXT_NODE) {
    range.setStart(node, offset);
    range.collapse(true);
    return range;
  }
  const text = node.textContent ?? "";
  const isWordChar = (ch: string | undefined) => !!ch && /[^\s.,!?;:"'()[\]{}]/.test(ch);
  let start = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && isWordChar(text[end])) end++;
  if (start === end) {
    range.setStart(node, offset);
    range.collapse(true);
    return range;
  }
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

function CurvedTextSvg({
  t,
  content,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onDoubleClick,
  canInteract,
  locked,
}: {
  t: TextLayer;
  content: string;
  onPointerDown?: ((e: React.PointerEvent) => void) | undefined;
  onPointerMove?: ((e: React.PointerEvent) => void) | undefined;
  onPointerUp?: ((e: React.PointerEvent) => void) | undefined;
  onPointerCancel?: ((e: React.PointerEvent) => void) | undefined;
  onDoubleClick?: ((e: React.MouseEvent) => void) | undefined;
  canInteract: boolean;
  locked?: boolean | undefined;
}) {
  const plainText = useMemo(() => {
    if (typeof document === "undefined") return content.replace(/<[^>]*>/g, "");
    const tmp = document.createElement("div");
    tmp.innerHTML = content;
    return tmp.textContent || tmp.innerText || "";
  }, [content]);

  // Curve amount ranges 1 - 100 (where 100 = full 360° circle)
  const curveVal = Math.max(1, Math.min(100, t.curveAmount ?? 50));
  const fontPx = t.size ?? 32;

  // Estimate text width in pixels to guarantee text is never cut off/truncated
  const estTextLen = Math.max(40, plainText.length * fontPx * 0.55);

  // Sweep angle theta from 3.6 deg (at curve=1) to 359.9 deg (at curve=100)
  const theta = (curveVal / 100) * 359.9;
  const thetaRad = (theta * Math.PI) / 180;

  // Radius is scaled so arc length (radius * thetaRad) always equals or exceeds estTextLen
  const minRadiusForText = estTextLen / Math.max(0.05, thetaRad);
  const radius = Math.max(60, Math.round(minRadiusForText));

  // Outer bounds
  const size = (radius + fontPx + 25) * 2;
  const cx = size / 2;
  const cy = size / 2;

  const rad1 = ((-90 - theta / 2) * Math.PI) / 180;
  const rad2 = ((-90 + theta / 2) * Math.PI) / 180;

  const x1 = Math.round((cx + radius * Math.cos(rad1)) * 100) / 100;
  const y1 = Math.round((cy + radius * Math.sin(rad1)) * 100) / 100;
  const x2 = Math.round((cx + radius * Math.cos(rad2)) * 100) / 100;
  const y2 = Math.round((cy + radius * Math.sin(rad2)) * 100) / 100;

  const largeArc = theta > 180 ? 1 : 0;
  const pathD = `M ${x1},${y1} A ${radius},${radius} 0 ${largeArc},1 ${x2},${y2}`;
  const pathId = `curve-path-${t.id}`;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      className="relative flex items-center justify-center overflow-visible"
      style={{
        width: size,
        height: size,
        cursor: !canInteract ? "default" : locked ? "pointer" : "grab",
        touchAction: "none",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible select-none pointer-events-auto cursor-grab"
        style={{ display: "block" }}
      >
        <path id={pathId} d={pathD} fill="none" stroke="none" />
        <text
          fill={t.color}
          fontFamily={t.fontFamily}
          fontSize={t.size}
          fontWeight={t.weight}
          fontStyle={t.italic ? "italic" : "normal"}
          textAnchor="middle"
          style={{ ...getTextEffectStyle(t) }}
        >
          <textPath href={`#${pathId}`} startOffset="50%">
            {plainText}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

// One entry in the free-floating Text gallery. The box itself is directly
// contentEditable (click straight into it to type; double-click while
// selected enters edit mode) — dragging hangs off the same element but
// only while NOT editing, so it can't fight with the browser's native
// focus/selection/caret-placement behavior.
const DraggableTextLayer = memo(function DraggableTextLayer({
  t,
  index,
  s,
  scale,
  interactive,
  set,
  selected,
  selectedCount,
  onSelect,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
  onGuides,
  registerHandle,
  controlsOverlayEl,
  suppressDragRef,
}: {
  t: TextLayer;
  index: number;
  s: EditorState;
  scale: number;
  interactive: boolean;
  set: (<K extends keyof EditorState>(k: K, v: EditorState[K]) => void) | undefined;
  selected: boolean;
  selectedCount: number;
  onSelect: (id: string, opts?: { toggle?: boolean }) => void;
  onGroupDragStart: (clientX: number, clientY: number) => void;
  onGroupDragMove: (clientX: number, clientY: number) => void;
  onGroupDragEnd: () => void;
  onGuides: (g: GuidesState) => void;
  registerHandle?: ((id: string, handle: TextLayerHandle | null) => void) | undefined;
  controlsOverlayEl?: HTMLDivElement | null;
  suppressDragRef?: React.RefObject<boolean> | undefined;
}) {
  const dragRef = useRef<{
    px: number;
    py: number;
    x: number;
    y: number;
    activeId?: string;
    hasDuplicated?: boolean;
  } | null>(null);
  const groupDraggingRef = useRef(false);
  const resizeRef = useRef<{
    startSize: number;
    startWidth: number;
    startMinHeight: number;
    startPosX: number;
    startPosY: number;
    startMouseX: number;
    startMouseY: number;
    handle: HandleId;
  } | null>(null);
  // Which single resize handle (a round corner or a pill-shaped edge — see
  // HANDLE_POSITIONS' own comment) is currently being dragged, if any — the
  // other 7 hide for the duration so the one in use isn't competing for
  // attention with a ring of handles the user isn't touching.
  const [activeHandle, setActiveHandle] = useState<HandleId | null>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dblClickPointRef = useRef<{ x: number; y: number } | null>(null);
  const pendingListCommandRef = useRef<RichFormatCmd | null>(null);
  const selectionSnapshotRef = useRef<Range | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  // The dangerouslySetInnerHTML source for the contentEditable div below,
  // frozen for the duration of an edit session — see editableNode's useMemo
  // further down, which deliberately does NOT list `content` as a
  // dependency, precisely so typing (which updates this ref every keystroke
  // via syncFromLiveDom, to stay ready for the mid-edit-style-change case)
  // doesn't itself force a recompute: re-applying dangerouslySetInnerHTML
  // tears down and rebuilds the DOM regardless of whether the string
  // actually changed, which resets the caret to the start every time.
  const editSnapshotRef = useRef<string>(sanitizeTextHtml(t.html || t.text));
  if (!isEditing) {
    editSnapshotRef.current = sanitizeTextHtml(t.html || t.text);
  }
  const content = editSnapshotRef.current;

  useEffect(() => {
    loadGoogleFont(t.fontFamily);
  }, [t.fontFamily]);

  useEffect(() => {
    if (!isEditing) return;
    const el = editableRef.current;
    if (!el) return;
    el.focus();
    if (dblClickPointRef.current) {
      const { x, y } = dblClickPointRef.current;
      dblClickPointRef.current = null;
      const wordRange = wordRangeFromPoint(x, y, el);
      if (wordRange) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(wordRange);
      }
    } else if (pendingListCommandRef.current) {
      const cmd = pendingListCommandRef.current;
      pendingListCommandRef.current = null;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      applyFormat(cmd);
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  const canInteract = interactive && !!set;
  const locked = t.locked ?? false;
  const rotation = t.rotation ?? 0;
  const sRef = useRef(s);
  sRef.current = s;
  const update = useCallback(
    (patch: Partial<Omit<TextLayer, "id">>) => set?.("texts", withTextUpdated(sRef.current, t.id, patch)),
    [set, t.id],
  );
  const remove = () => set?.("texts", withTextRemoved(s, t.id));

  // Every place that reads the live contentEditable DOM (typing, execCommand
  // formatting, a highlighted-range color/style change) and pushes it into
  // document state via update({text, html}) must ALSO refresh
  // editSnapshotRef in the same breath, not just call update() — otherwise,
  // if some unrelated re-render forces the memoized editableNode below to
  // recompute while isEditing is still true (classically: changing font
  // size from the toolbar mid-edit, since t.size is one of its deps), it
  // re-applies dangerouslySetInnerHTML from whatever editSnapshotRef was
  // last frozen at, silently discarding everything typed/formatted since —
  // update() alone isn't enough because editSnapshotRef only otherwise
  // resyncs from t.html once isEditing goes false (see the render-phase
  // check right below), which is one render too late for a memo recompute
  // that happens WHILE still editing. Same "recreating the element resets
  // the DOM" bug class documented on editSnapshotRef's own declaration,
  // just reached through a mid-edit state update instead of a fresh mount.
  const syncFromLiveDom = (el: HTMLElement) => {
    const text = el.textContent ?? "";
    const html = sanitizeTextHtml(el.innerHTML);
    editSnapshotRef.current = html;
    update({ text, html });
  };

  // Dedicated drag state/handlers for the overlay's Move handle — kept
  // separate from editableNode's memoized handlePointerDown above (which
  // doubles as the click-to-select/shift-toggle/alt-duplicate handler for
  // the text body itself, and is disabled entirely while isEditing) since
  // the Move handle only ever needs the plain "drag repositions the
  // already-selected layer" behavior, unconditionally.
  const moveDragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const handleMovePointerDown = (e: React.PointerEvent) => {
    // A second touch is also down — this is a pinch, not a drag (see
    // suppressDragRef's own comment on QuoteCanvas's Props).
    if (suppressDragRef?.current) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moveDragRef.current = { px: t.x, py: t.y, x: e.clientX, y: e.clientY };
  };
  const handleMovePointerMove = (e: React.PointerEvent) => {
    if (suppressDragRef?.current) {
      moveDragRef.current = null;
      return;
    }
    const d = moveDragRef.current;
    if (!d) return;
    e.stopPropagation();
    const dx = ((e.clientX - d.x) / scale / s.width) * 100;
    const dy = ((e.clientY - d.y) / scale / s.height) * 100;
    const width = containerRef.current?.offsetWidth ?? (t.width ?? 480);
    const height = containerRef.current?.offsetHeight ?? (t.minHeight ?? t.size * 1.3);
    const otherElements = getAllCanvasElements(sRef.current);
    const { nextX, nextY, guides: snapGuides } = calculateAlignmentSnap({
      currentId: t.id,
      rawX: d.px + dx,
      rawY: d.py + dy,
      width,
      height,
      s: sRef.current,
      otherElements,
    });
    onGuides(snapGuides);
    set?.("texts", withTextUpdated(sRef.current, t.id, { x: nextX, y: nextY }));
  };
  const handleMovePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
    moveDragRef.current = null;
    onGuides({ vCenter: false, hCenter: false });
  };

  const applyFormat = (cmd: RichFormatCmd) => {
    const el = editableRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const commonNode = range.commonAncestorContainer;
    if (el !== commonNode && !el.contains(commonNode)) return;

    el.focus();

    const isListCmd = cmd === "bulletList" || cmd === "numberedList";

    let executed = false;
    try {
      const commandMap: Record<RichFormatCmd, string> = {
        bold: "bold",
        italic: "italic",
        underline: "underline",
        strike: "strikeThrough",
        bulletList: "insertUnorderedList",
        numberedList: "insertOrderedList",
      };
      executed = document.execCommand(commandMap[cmd], false);
    } catch {
      executed = false;
    }

    if (!executed && !isListCmd) {
      const tag = cmd === "bold" ? "b" : cmd === "italic" ? "i" : cmd === "underline" ? "u" : "s";
      const wrapper = document.createElement(tag);
      if (cmd === "bold") wrapper.style.fontWeight = "900";
      if (cmd === "italic") wrapper.style.fontStyle = "italic";
      if (cmd === "underline") wrapper.style.textDecoration = "underline";
      if (cmd === "strike") wrapper.style.textDecoration = "line-through";

      try {
        const contents = range.extractContents();
        wrapper.appendChild(contents);
        range.insertNode(wrapper);

        const newRange = document.createRange();
        newRange.selectNodeContents(wrapper);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } catch (err) {
        console.error("Format fallback error:", err);
      }
    }

    if (isListCmd && executed) {
      el.querySelectorAll("ul, ol").forEach((listEl) => {
        const style = (listEl as HTMLElement).style;
        style.listStyleType = listEl.tagName === "OL" ? "decimal" : "disc";
        style.paddingLeft = "1.5em";
        style.margin = "0";
      });
    }

    syncFromLiveDom(el);
    notifyActiveFormat();
  };

  const hasLiveSelection = () => {
    const el = editableRef.current;
    const sel = window.getSelection();
    if (!isEditing || !el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    return el === r.commonAncestorContainer || el.contains(r.commonAncestorContainer);
  };

  const getActiveFormat = useCallback((): LiveTextFormat => {
    const el = editableRef.current;
    const sel = window.getSelection();
    const liveSelectionInside =
      isEditing &&
      !!el &&
      !!sel &&
      sel.rangeCount > 0 &&
      (el === sel.getRangeAt(0).commonAncestorContainer || el.contains(sel.getRangeAt(0).commonAncestorContainer));

    if (liveSelectionInside) {
      try {
        return {
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          underline: document.queryCommandState("underline"),
          strike: document.queryCommandState("strikeThrough"),
          bulletList: document.queryCommandState("insertUnorderedList"),
          numberedList: document.queryCommandState("insertOrderedList"),
        };
      } catch {
      }
    }
    return {
      bold: t.weight >= 700,
      italic: !!t.italic,
      underline: !!t.underline,
      strike: !!t.strike,
      bulletList: false,
      numberedList: false,
    };
  }, [isEditing, t.weight, t.italic, t.underline, t.strike]);

  const activeFormatListenersRef = useRef<Set<(format: LiveTextFormat) => void>>(new Set());

  const notifyActiveFormat = useCallback(() => {
    const format = getActiveFormat();
    activeFormatListenersRef.current.forEach((cb) => cb(format));
  }, [getActiveFormat]);

  const subscribeActiveFormat = useCallback(
    (cb: (format: LiveTextFormat) => void) => {
      activeFormatListenersRef.current.add(cb);
      cb(getActiveFormat());
      return () => {
        activeFormatListenersRef.current.delete(cb);
      };
    },
    [getActiveFormat],
  );

  useEffect(() => {
    notifyActiveFormat();
  }, [notifyActiveFormat]);

  useEffect(() => {
    if (!isEditing) return;
    document.addEventListener("selectionchange", notifyActiveFormat);
    return () => document.removeEventListener("selectionchange", notifyActiveFormat);
  }, [isEditing, notifyActiveFormat]);

  const applyFormatSmart = (cmd: RichFormatCmd) => {
    if (hasLiveSelection()) {
      applyFormat(cmd);
      return;
    }

    if (cmd === "bulletList" || cmd === "numberedList") {
      pendingListCommandRef.current = cmd;
      setIsEditing(true);
      return;
    }

    if (cmd === "bold") update({ weight: t.weight >= 700 ? 400 : 700 });
    else if (cmd === "italic") update({ italic: !t.italic });
    else if (cmd === "underline") update({ underline: !t.underline });
    else if (cmd === "strike") update({ strike: !t.strike });
  };

  const snapshotSelection = () => {
    selectionSnapshotRef.current = hasLiveSelection() ? window.getSelection()!.getRangeAt(0).cloneRange() : null;
  };

  const applyStyleSmart = (cssProps: Partial<CSSStyleDeclaration>, wholeLayerPatch: Partial<Omit<TextLayer, "id">>) => {
    const liveRange = hasLiveSelection() ? window.getSelection()!.getRangeAt(0) : null;
    const range = liveRange ?? selectionSnapshotRef.current;
    selectionSnapshotRef.current = null;

    const el = editableRef.current;
    if (!range || !el) {
      update(wholeLayerPatch);
      return;
    }
    try {
      const wrapper = document.createElement("span");
      wrapper.style.display = "inline";
      Object.assign(wrapper.style, cssProps);
      const contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
      if (liveRange) {
        const sel = window.getSelection();
        const newRange = document.createRange();
        newRange.selectNodeContents(wrapper);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      }
    } catch (err) {
      console.error("Style apply error:", err);
      update(wholeLayerPatch);
      return;
    }
    syncFromLiveDom(el);
  };

  // Font size and font family deliberately always apply to the WHOLE layer
  // now, ignoring any highlighted range — they used to try to apply just to
  // a highlighted sub-range via applyStyleSmart (DOM Range surgery), but a
  // real device's native text-selection (long-press handles, OS-level
  // selection UI) doesn't reliably survive long enough to reach the click
  // handler no matter how early it's snapshotted, so that path frequently
  // resulted in nothing visibly changing at all. A plain whole-layer
  // `update()` is simple, synchronous, and always visibly does something —
  // color still gets the highlighted-range treatment via applyStyleSmart
  // below since partial-color-on-a-miss is far less confusing than
  // partial-size/font on a miss.
  const stripInlineStyleProps = (html: string, props: string[]): string => {
    if (!html || typeof window === "undefined") return html;
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
        props.forEach((p) => el.style.removeProperty(p));
        if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
      });
      return sanitizeTextHtml(tmp.innerHTML);
    } catch {
      return html;
    }
  };

  const setFontFamily = (v: string) => {
    // Clear out any font-family left over on individual spans from before
    // this change, so the whole layer visibly and uniformly reflects v —
    // otherwise a more-specific inline span from an earlier edit would keep
    // overriding the new layer-level font on just that stretch of text.
    const cleanHtml = t.html ? stripInlineStyleProps(t.html, ["font-family"]) : undefined;
    update({ fontFamily: v, ...(cleanHtml !== undefined ? { html: cleanHtml } : {}) });
  };

  const setSize = (v: number) => {
    const currentSize = t.size || 32;
    const ratio = v / currentSize;
    const nextWidth = typeof t.width === "number" && t.width > 0 ? Math.round(Math.max(40, t.width * ratio)) : undefined;
    const nextMinHeight = typeof t.minHeight === "number" && t.minHeight > 0 ? Math.round(t.minHeight * ratio) : undefined;
    const cleanHtml = t.html ? stripInlineStyleProps(t.html, ["font-size"]) : undefined;
    update({
      size: v,
      ...(nextWidth !== undefined ? { width: nextWidth } : {}),
      ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
      ...(cleanHtml !== undefined ? { html: cleanHtml } : {}),
    });
  };
  const setColor = (v: string) => applyStyleSmart({ color: v }, { color: v });
  const setAlign = (v: "left" | "center" | "right" | "justify") => {
    if (v === "justify" && (!t.width || t.width <= 0)) {
      const currentWidth = containerRef.current?.offsetWidth || 480;
      update({ align: v, width: currentWidth });
    } else {
      update({ align: v });
    }
  };
  const setLetterSpacing = (v: number) => update({ letterSpacing: v });
  const setLineHeight = (v: number) => update({ lineHeight: v });
  const setVerticalAlign = (v: "top" | "middle" | "bottom") => update({ verticalAlign: v });

  const handleRef = useRef<TextLayerHandle>({
    applyFormat: applyFormatSmart,
    setFontFamily,
    setSize,
    setColor,
    setAlign,
    setLetterSpacing,
    setLineHeight,
    setVerticalAlign,
    updateLayer: update,
    snapshotSelection,
    getActiveFormat,
    subscribeActiveFormat,
  });
  handleRef.current.applyFormat = applyFormatSmart;
  handleRef.current.setFontFamily = setFontFamily;
  handleRef.current.setSize = setSize;
  handleRef.current.setColor = setColor;
  handleRef.current.setAlign = setAlign;
  handleRef.current.setLetterSpacing = setLetterSpacing;
  handleRef.current.setLineHeight = setLineHeight;
  handleRef.current.setVerticalAlign = setVerticalAlign;
  handleRef.current.updateLayer = update;
  handleRef.current.snapshotSelection = snapshotSelection;
  handleRef.current.getActiveFormat = getActiveFormat;
  handleRef.current.subscribeActiveFormat = subscribeActiveFormat;

  useEffect(() => {
    registerHandle?.(t.id, handleRef.current);
    return () => registerHandle?.(t.id, null);
  }, [registerHandle, t.id]);

  const duplicate = () => {
    if (!set) return;
    const dup = withTextDuplicated(s, t.id);
    set("texts", dup.list);
    onSelect(dup.newId);
  };

  const hasExplicitWidth = t.width !== undefined;

  const isCurved = t.shapeType === "curve" && t.curveAmount !== undefined && t.curveAmount !== 0;

  const editableNode = useMemo(
    () => {
      const handlePointerDown = !canInteract
        ? undefined
        : isEditing
          ? (e: React.PointerEvent) => {
            e.stopPropagation();
          }
          : (e: React.PointerEvent) => {
            // A second touch is also down — this is a pinch, not a drag
            // (see suppressDragRef's own comment on QuoteCanvas's Props).
            if (suppressDragRef?.current) return;
            e.stopPropagation();
            if (e.shiftKey) {
              onSelect(t.id, { toggle: true });
              return;
            }
            if (locked) {
              onSelect(t.id);
              return;
            }

            if (e.altKey && set) {
              const dup = withTextDuplicated(sRef.current, t.id);
              set("texts", dup.list);
              onSelect(dup.newId);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              dragRef.current = {
                px: t.x,
                py: t.y,
                x: e.clientX,
                y: e.clientY,
                activeId: dup.newId,
                hasDuplicated: true,
              };
              return;
            }

            if (!selected) {
              onSelect(t.id);
            }
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            if (selected && selectedCount > 1) {
              groupDraggingRef.current = true;
              onGroupDragStart(e.clientX, e.clientY);
            } else {
              dragRef.current = {
                px: t.x,
                py: t.y,
                x: e.clientX,
                y: e.clientY,
                activeId: t.id,
                hasDuplicated: false,
              };
            }
          };

      const handlePointerMove =
        canInteract && !locked && !isEditing
          ? (e: React.PointerEvent) => {
            // A second finger joined mid-drag — cancel cleanly (see
            // handlePointerDown's own check above).
            if (suppressDragRef?.current) {
              dragRef.current = null;
              groupDraggingRef.current = false;
              return;
            }
            if (groupDraggingRef.current) {
              e.stopPropagation();
              onGroupDragMove(e.clientX, e.clientY);
              return;
            }
            const d = dragRef.current;
            if (!d) return;
            e.stopPropagation();

            if (e.altKey && !d.hasDuplicated && set) {
              const dup = withTextDuplicated(sRef.current, t.id);
              set("texts", dup.list);
              onSelect(dup.newId);
              d.activeId = dup.newId;
              d.hasDuplicated = true;
            }

            const dx = ((e.clientX - d.x) / scale / s.width) * 100;
            const dy = ((e.clientY - d.y) / scale / s.height) * 100;
            const width = containerRef.current?.offsetWidth ?? (t.width ?? 480);
            const height = containerRef.current?.offsetHeight ?? (t.minHeight ?? t.size * 1.3);
            const otherElements = getAllCanvasElements(s);
            const targetId = d.activeId || t.id;
            const { nextX, nextY, guides: snapGuides } = calculateAlignmentSnap({
              currentId: targetId,
              rawX: d.px + dx,
              rawY: d.py + dy,
              width,
              height,
              s,
              otherElements,
            });
            onGuides(snapGuides);
            set?.("texts", withTextUpdated(sRef.current, targetId, { x: nextX, y: nextY }));
          }
          : undefined;

      const handlePointerUp = () => {
        dragRef.current = null;
        if (groupDraggingRef.current) {
          groupDraggingRef.current = false;
          onGroupDragEnd();
        }
        onGuides({ vCenter: false, hCenter: false });
      };

      const handleDoubleClick = (e: React.MouseEvent) => {
        if (!canInteract || locked) return;
        e.stopPropagation();
        dblClickPointRef.current = { x: e.clientX, y: e.clientY };
        setIsEditing(true);
      };

      if (isCurved && (!canInteract || locked || !isEditing)) {
        return (
          <CurvedTextSvg
            t={t}
            content={content}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            canInteract={canInteract}
            locked={locked}
          />
        );
      }
      return (
        <div
          ref={editableRef}
          contentEditable={canInteract && !locked && isEditing}
          suppressContentEditableWarning
          spellCheck={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onKeyUp={() => {
            if (isEditing) {
              const el = editableRef.current;
              if (el) syncFromLiveDom(el);
              notifyActiveFormat();
            }
          }}
          onBlur={(e) => {
            syncFromLiveDom(e.currentTarget);
            setIsEditing(false);
          }}
          style={{
            fontFamily: t.fontFamily,
            fontSize: t.size,
            fontWeight: t.weight,
            fontStyle: t.italic ? "italic" : "normal",
            textDecoration: [t.underline ? "underline" : "", t.strike ? "line-through" : ""]
              .filter(Boolean)
              .join(" "),
            color: t.color,
            textAlign: t.align,
            textAlignLast: t.align === "justify" ? "justify" : undefined,
            textJustify: t.align === "justify" ? "inter-word" : undefined,
            letterSpacing: t.letterSpacing !== undefined ? `${(t.letterSpacing / 1000) * t.size}px` : undefined,
            lineHeight: t.lineHeight ?? 1.3,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            minHeight: t.minHeight,
            outline: "none",
            touchAction: isEditing ? "auto" : "none",
            userSelect: isEditing ? "text" : "none",
            cursor: !canInteract ? "default" : locked ? "pointer" : isEditing ? "text" : "grab",
            display: "block",
            width: "100%",
            ...getTextEffectStyle(t),
          }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    },
    [
      canInteract,
      locked,
      isEditing,
      selected,
      selectedCount,
      scale,
      s.width,
      s.height,
      t.id,
      t.x,
      t.y,
      t.fontFamily,
      t.size,
      t.weight,
      t.italic,
      t.underline,
      t.strike,
      t.color,
      t.align,
      t.minHeight,
      t.letterSpacing,
      t.lineHeight,
      t.verticalAlign,
      t.effectType,
      t.effectColor,
      t.effectThickness,
      t.effectOffset,
      t.effectDirection,
      t.effectBlur,
      t.effectOpacity,
      t.effectRoundness,
      t.effectSpread,
      t.shapeType,
      t.curveAmount,
      // content (editSnapshotRef.current) is deliberately NOT a dependency
      // here, even though the memo body reads it for dangerouslySetInnerHTML
      // — it's a ref, read via closure each time this callback actually
      // runs, same as any other ref. Listing it WOULD recompute this memo
      // (and thus re-apply dangerouslySetInnerHTML, which always tears down
      // and rebuilds the DOM regardless of whether the string actually
      // changed) on every single keystroke, since syncFromLiveDom now keeps
      // it in sync while typing — resetting the caret to the start on every
      // character typed. Omitting it relies on isEditing/the style fields
      // above to trigger recomputation at the right moments (entering/
      // leaving edit mode, a style change mid-edit) instead, at which point
      // whatever editSnapshotRef currently holds (kept fresh by
      // syncFromLiveDom regardless) is what gets read.
      onSelect,
      onGroupDragStart,
      onGroupDragMove,
      onGroupDragEnd,
      onGuides,
      update,
    ],
  );

  const validTextWidth =
    typeof t.width === "number" && Number.isFinite(t.width) && t.width > 0 ? t.width : undefined;
  const isNearTop = t.y < 18;

  if (t.hidden) return null;

  return (
    <>
      <div
        ref={containerRef}
        data-layer-id={t.id}
        data-nopan=""
        onPointerDown={handlePointerDown}
        style={{
          position: "absolute",
          left: `${t.x}%`,
          top: `${t.y}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          width: validTextWidth ?? "fit-content",
          maxWidth: validTextWidth ? undefined : Math.min(s.width * 0.92, 900),
          minWidth: 40,
          minHeight: t.minHeight,
          display: t.minHeight ? "flex" : "block",
          flexDirection: "column",
          justifyContent:
            t.verticalAlign === "middle"
              ? "center"
              : t.verticalAlign === "bottom"
                ? "flex-end"
                : "flex-start",
          zIndex: (selected ? 80 : 10) + index,
          touchAction: "none",
          outline: "none",
        }}
        className="group"
      >
        {editableNode}
      </div>

      {canInteract && selected && selectedCount === 1 && controlsOverlayEl
        ? createPortal(
          <div
            style={{
              position: "absolute",
              left: `${t.x}%`,
              top: `${t.y}%`,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              width: containerRef.current?.offsetWidth ?? (validTextWidth ?? 200),
              height: containerRef.current?.offsetHeight ?? (t.minHeight ?? 40),
              zIndex: 80 + index,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -4,
                border: locked ? "2px dashed #f59e0b" : "2px solid #0021ff",
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
            <div style={{ pointerEvents: "auto" }}>
              <LayerToolbar
                locked={locked}
                onToggleLock={() => update({ locked: !locked })}
                onDuplicate={duplicate}
                onDelete={remove}
                scale={scale}
                placement={isNearTop ? "bottom" : "top"}
              />
            </div>

            {!locked ? (
              <>
                {HANDLE_POSITIONS.filter((h) => activeHandle === null || activeHandle === h.id).map((h) => (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      setActiveHandle(h.id);
                      resizeRef.current = {
                        startSize: t.size,
                        startWidth: t.width ?? containerRef.current?.offsetWidth ?? 520,
                        startMinHeight: t.minHeight ?? containerRef.current?.offsetHeight ?? 0,
                        startPosX: t.x,
                        startPosY: t.y,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        handle: h.id,
                      };
                    }}
                    onPointerMove={(e) => {
                      const r = resizeRef.current;
                      if (!r || r.handle !== h.id) return;
                      e.stopPropagation();
                      const rawDx = (e.clientX - r.startMouseX) / scale;
                      const rawDy = (e.clientY - r.startMouseY) / scale;
                      const { dx, dy } = rotateVector(rawDx, rawDy, -rotation);
                      if (h.kind === "corner") {
                        const delta = resizeDelta(h.id, dx, dy);
                        const nextSize = Math.round(Math.max(10, Math.min(300, r.startSize + delta / 2)));
                        const scaleRatio = nextSize / r.startSize;
                        const nextWidth = r.startWidth ? Math.round(Math.max(40, r.startWidth * scaleRatio)) : undefined;
                        const nextMinHeight = r.startMinHeight ? Math.round(r.startMinHeight * scaleRatio) : undefined;
                        const cleanHtml = t.html ? (() => {
                          try {
                            const tmp = document.createElement("div");
                            tmp.innerHTML = t.html;
                            tmp.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
                              el.style.removeProperty("font-size");
                              if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
                            });
                            return sanitizeTextHtml(tmp.innerHTML);
                          } catch { return t.html; }
                        })() : undefined;
                        update({
                          size: nextSize,
                          ...(nextWidth !== undefined ? { width: nextWidth } : {}),
                          ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
                          ...(cleanHtml !== undefined ? { html: cleanHtml } : {}),
                        });
                      } else {
                        const dw = widthDeltaFor(h.id, dx);
                        const dh = heightDeltaFor(h.id, dy);
                        const nextWidth = Math.round(Math.max(40, r.startWidth + dw));
                        const nextMinHeight = Math.round(Math.max(0, r.startMinHeight + dh));
                        const appliedDw = nextWidth - r.startWidth;
                        const appliedDh = nextMinHeight - r.startMinHeight;
                        const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                        update({
                          width: nextWidth,
                          minHeight: nextMinHeight,
                          x: r.startPosX + (shift.dx / s.width) * 100,
                          y: r.startPosY + (shift.dy / s.height) * 100,
                        });
                      }
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      resizeRef.current = null;
                      setActiveHandle(null);
                    }}
                    onPointerCancel={(e) => {
                      e.stopPropagation();
                      resizeRef.current = null;
                      setActiveHandle(null);
                    }}
                    data-nopan=""
                    className="group"
                    style={{ ...getHandleStyle(h, scale), pointerEvents: "auto" }}
                    title="Drag to resize text"
                  >
                    <div
                      className="pointer-events-none rounded-full bg-white transition-all duration-150 group-hover:scale-125 group-hover:bg-[#0021FF] group-active:scale-135 group-active:bg-[#0021FF] group-active:ring-4 group-active:ring-[#0021FF]/40"
                      style={getHandleVisualStyle(h, scale)}
                    />
                  </div>
                ))}
                <RotateMoveHandleRow
                  containerRef={containerRef}
                  scale={scale}
                  onRotate={(deg) => update({ rotation: deg })}
                  onMovePointerDown={handleMovePointerDown}
                  onMovePointerMove={handleMovePointerMove}
                  onMovePointerUp={handleMovePointerUp}
                />
              </>
            ) : null}
          </div>,
          controlsOverlayEl,
        )
        : null}
    </>
  );
}, scaleAwarePropsEqual);

const DraggableImageLayer = memo(function DraggableImageLayer({
  img,
  index,
  s,
  scale,
  interactive,
  set,
  selected,
  selectedCount,
  onSelect,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
  onGuides,
  controlsOverlayEl,
  suppressDragRef,
}: {
  img: ImageLayer;
  index: number;
  s: EditorState;
  scale: number;
  interactive: boolean;
  set: (<K extends keyof EditorState>(k: K, v: EditorState[K]) => void) | undefined;
  selected: boolean;
  selectedCount: number;
  onSelect: (id: string, opts?: { toggle?: boolean }) => void;
  onGroupDragStart: (clientX: number, clientY: number) => void;
  onGroupDragMove: (clientX: number, clientY: number) => void;
  onGroupDragEnd: () => void;
  onGuides: (g: GuidesState) => void;
  controlsOverlayEl?: HTMLDivElement | null;
  suppressDragRef?: React.RefObject<boolean> | undefined;
}) {
  const sRef = useRef(s);
  sRef.current = s;
  const dragRef = useRef<{
    px: number;
    py: number;
    x: number;
    y: number;
    activeId?: string;
    hasDuplicated?: boolean;
  } | null>(null);
  const groupDraggingRef = useRef(false);
  const resizeRef = useRef<{
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
    startMouseX: number;
    startMouseY: number;
    handle: HandleId;
  } | null>(null);
  // Which single resize handle (a round corner or a pill-shaped edge — see
  // HANDLE_POSITIONS' own comment) is currently being dragged, if any — the
  // other 7 hide for the duration so the one in use isn't competing for
  // attention with a ring of handles the user isn't touching.
  const [activeHandle, setActiveHandle] = useState<HandleId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const canInteract = interactive && !!set && !s.locked;
  const locked = img.locked ?? false;
  const hasExplicitHeight = img.height !== undefined;
  const isNearTop = img.y < 18;
  const rotation = img.rotation ?? 0;
  const update = (patch: Partial<Omit<ImageLayer, "id">>) => set?.("images", withImageUpdated(s, img.id, patch));
  const remove = () => set?.("images", withImageRemoved(s, img.id));
  const duplicate = () => {
    if (!set) return;
    const dup = withImageDuplicated(s, img.id);
    set("images", dup.list);
    onSelect(dup.newId);
  };

  const handlePointerDown = canInteract
    ? (e: React.PointerEvent) => {
      // A second touch is also down — this is a pinch, not a drag (see
      // suppressDragRef's own comment on QuoteCanvas's Props).
      if (suppressDragRef?.current) return;
      e.stopPropagation();
      if (e.shiftKey) {
        onSelect(img.id, { toggle: true });
        return;
      }
      if (locked) {
        onSelect(img.id);
        return;
      }

      if (e.altKey && set) {
        const dup = withImageDuplicated(sRef.current, img.id);
        set("images", dup.list);
        onSelect(dup.newId);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = {
          px: img.x,
          py: img.y,
          x: e.clientX,
          y: e.clientY,
          activeId: dup.newId,
          hasDuplicated: true,
        };
        return;
      }

      if (!selected) onSelect(img.id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (selected && selectedCount > 1) {
        groupDraggingRef.current = true;
        onGroupDragStart(e.clientX, e.clientY);
      } else {
        dragRef.current = {
          px: img.x,
          py: img.y,
          x: e.clientX,
          y: e.clientY,
          activeId: img.id,
          hasDuplicated: false,
        };
      }
    }
    : undefined;

  const handlePointerMove = canInteract && !locked
    ? (e: React.PointerEvent) => {
      // A second finger joined mid-drag — cancel cleanly (see
      // handlePointerDown's own check above).
      if (suppressDragRef?.current) {
        dragRef.current = null;
        groupDraggingRef.current = false;
        return;
      }
      if (groupDraggingRef.current) {
        e.stopPropagation();
        onGroupDragMove(e.clientX, e.clientY);
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      e.stopPropagation();

      if (e.altKey && !d.hasDuplicated && set) {
        const dup = withImageDuplicated(sRef.current, img.id);
        set("images", dup.list);
        onSelect(dup.newId);
        d.activeId = dup.newId;
        d.hasDuplicated = true;
      }

      const dx = ((e.clientX - d.x) / scale / sRef.current.width) * 100;
      const dy = ((e.clientY - d.y) / scale / sRef.current.height) * 100;
      const width = img.size;
      const height = img.height ?? img.size;
      const otherElements = getAllCanvasElements(sRef.current);
      const targetId = d.activeId || img.id;
      const { nextX, nextY, guides: snapGuides } = calculateAlignmentSnap({
        currentId: targetId,
        rawX: d.px + dx,
        rawY: d.py + dy,
        width,
        height,
        s: sRef.current,
        otherElements,
      });
      onGuides(snapGuides);
      set?.("images", withImageUpdated(sRef.current, targetId, { x: nextX, y: nextY }));
    }
    : undefined;

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
    dragRef.current = null;
    if (groupDraggingRef.current) {
      groupDraggingRef.current = false;
      onGroupDragEnd();
    }
    onGuides({ vCenter: false, hCenter: false });
  };

  if (img.hidden) return null;

  return (
    <>
      <div
        ref={containerRef}
        data-layer-id={img.id}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: "absolute",
          left: `${img.x}%`,
          top: `${img.y}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          width: `${typeof img.size === "number" && Number.isFinite(img.size) && img.size > 0 ? img.size : 120}px`,
          height:
            hasExplicitHeight && typeof img.height === "number" && Number.isFinite(img.height) && img.height > 0
              ? `${img.height}px`
              : undefined,
          cursor: canInteract ? (locked ? "pointer" : "grab") : undefined,
          zIndex: selected
            ? 80 + index
            : img.layer === "behind"
              ? 10 + Math.min(index, textFloorIndex(s) - 1)
              : 10 + index,
          touchAction: "none",
          userSelect: "none",
          outline: "none",
        }}
        className="group"
      >
        <img
          src={img.src}
          alt=""
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: hasExplicitHeight ? "100%" : "auto",
            borderRadius: img.radius,
            objectFit: img.objectFit ?? "cover",
            opacity: (img.opacity ?? 100) / 100,
            transform: `${img.flipH ? "scaleX(-1)" : ""} ${img.flipV ? "scaleY(-1)" : ""}`.trim() || undefined,
            boxShadow: img.shadow
              ? `${img.shadowX ?? 0}px ${img.shadowY ?? 12}px ${img.shadowBlur}px ${img.shadowSpread ?? 0}px ${hexToRgba(
                img.shadowColor ?? "#000000",
                (img.shadowOpacity ?? 35) / 100,
              )}`
              : "none",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      </div>

      {canInteract && selected && selectedCount === 1 && controlsOverlayEl
        ? createPortal(
          <div
            style={{
              position: "absolute",
              left: `${img.x}%`,
              top: `${img.y}%`,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              width: `${typeof img.size === "number" && Number.isFinite(img.size) && img.size > 0 ? img.size : 120}px`,
              height:
                hasExplicitHeight && typeof img.height === "number" && Number.isFinite(img.height) && img.height > 0
                  ? `${img.height}px`
                  : `${containerRef.current?.offsetHeight ?? img.size}px`,
              zIndex: 80 + index,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -4,
                border: locked ? "2px dashed #f59e0b" : "2px solid #0021ff",
                // Fixed, not tied to img.radius — a circularly-cropped
                // image should still get the same plain rectangular
                // selection outline every other layer type gets (see the
                // matching Text/Shape outlines below), not one that
                // curves around to hug the crop shape.
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
            <div style={{ pointerEvents: "auto" }}>
              <LayerToolbar
                locked={locked}
                onToggleLock={() => update({ locked: !locked })}
                onDuplicate={duplicate}
                onDelete={remove}
                scale={scale}
                placement={isNearTop ? "bottom" : "top"}
              />
            </div>

            {!locked ? (
              <>
                {HANDLE_POSITIONS.filter((h) => activeHandle === null || activeHandle === h.id).map((h) => (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      setActiveHandle(h.id);
                      const startHeight = img.height ?? containerRef.current?.offsetHeight ?? img.size;
                      resizeRef.current = {
                        startWidth: img.size,
                        startHeight,
                        startPosX: img.x,
                        startPosY: img.y,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        handle: h.id,
                      };
                    }}
                    onPointerMove={(e) => {
                      const r = resizeRef.current;
                      if (!r || r.handle !== h.id) return;
                      e.stopPropagation();
                      const rawDx = (e.clientX - r.startMouseX) / scale;
                      const rawDy = (e.clientY - r.startMouseY) / scale;
                      // Map the screen-space drag into the box's own
                      // (unrotated) local axes so a corner/edge still
                      // resizes along the box's actual rotated edges
                      // instead of the screen's — see rotateVector.
                      const { dx, dy } = rotateVector(rawDx, rawDy, -rotation);
                      if (h.kind === "corner") {
                        const delta = resizeDelta(h.id, dx, dy);
                        const nextWidth = Math.round(Math.max(20, r.startWidth + delta));
                        const ratio = r.startHeight > 0 ? r.startHeight / r.startWidth : 1;
                        const nextHeight = Math.round(Math.max(20, nextWidth * ratio));
                        const appliedDw = nextWidth - r.startWidth;
                        const appliedDh = nextHeight - r.startHeight;
                        const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                        update({
                          size: nextWidth,
                          height: nextHeight,
                          x: r.startPosX + (shift.dx / s.width) * 100,
                          y: r.startPosY + (shift.dy / s.height) * 100,
                        });
                      } else {
                        const dw = widthDeltaFor(h.id, dx);
                        const dh = heightDeltaFor(h.id, dy);
                        const nextWidth = Math.round(Math.max(20, r.startWidth + dw));
                        const nextHeight = Math.round(Math.max(20, r.startHeight + dh));
                        const appliedDw = nextWidth - r.startWidth;
                        const appliedDh = nextHeight - r.startHeight;
                        const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                        update({
                          size: nextWidth,
                          height: nextHeight,
                          x: r.startPosX + (shift.dx / s.width) * 100,
                          y: r.startPosY + (shift.dy / s.height) * 100,
                        });
                      }
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      resizeRef.current = null;
                      setActiveHandle(null);
                    }}
                    onPointerCancel={(e) => {
                      e.stopPropagation();
                      resizeRef.current = null;
                      setActiveHandle(null);
                    }}
                    data-nopan=""
                    className="group"
                    style={{ ...getHandleStyle(h, scale), pointerEvents: "auto" }}
                    title="Drag to resize image"
                  >
                    <div
                      className="pointer-events-none rounded-full bg-white transition-all duration-150 group-hover:scale-125 group-hover:bg-[#0021FF] group-active:scale-135 group-active:bg-[#0021FF] group-active:ring-4 group-active:ring-[#0021FF]/40"
                      style={getHandleVisualStyle(h, scale)}
                    />
                  </div>
                ))}
                <RotateMoveHandleRow
                  containerRef={containerRef}
                  scale={scale}
                  onRotate={(deg) => update({ rotation: deg })}
                  onMovePointerDown={handlePointerDown}
                  onMovePointerMove={handlePointerMove}
                  onMovePointerUp={handlePointerUp}
                />
              </>
            ) : null}
          </div>,
          controlsOverlayEl,
        )
        : null}
    </>
  );
}, scaleAwarePropsEqual);

const DraggableShapeLayer = memo(function DraggableShapeLayer({
  shape,
  index,
  s,
  scale,
  interactive,
  set,
  selected,
  selectedCount,
  onSelect,
  onGroupDragStart,
  onGroupDragMove,
  onGroupDragEnd,
  onGuides,
  controlsOverlayEl,
  suppressDragRef,
}: {
  shape: ShapeLayer;
  index: number;
  s: EditorState;
  scale: number;
  interactive: boolean;
  set: (<K extends keyof EditorState>(k: K, v: EditorState[K]) => void) | undefined;
  selected: boolean;
  selectedCount: number;
  onSelect: (id: string, opts?: { toggle?: boolean }) => void;
  onGroupDragStart: (clientX: number, clientY: number) => void;
  onGroupDragMove: (clientX: number, clientY: number) => void;
  onGroupDragEnd: () => void;
  onGuides: (g: GuidesState) => void;
  controlsOverlayEl?: HTMLDivElement | null;
  suppressDragRef?: React.RefObject<boolean> | undefined;
}) {
  const sRef = useRef(s);
  sRef.current = s;
  const dragRef = useRef<{
    px: number;
    py: number;
    x: number;
    y: number;
    activeId?: string;
    hasDuplicated?: boolean;
  } | null>(null);
  const groupDraggingRef = useRef(false);
  const resizeRef = useRef<{
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
    startMouseX: number;
    startMouseY: number;
    handle: HandleId;
  } | null>(null);
  // Which single resize handle (a round corner or a pill-shaped edge — see
  // HANDLE_POSITIONS' own comment) is currently being dragged, if any — the
  // other 7 hide for the duration so the one in use isn't competing for
  // attention with a ring of handles the user isn't touching.
  const [activeHandle, setActiveHandle] = useState<HandleId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const canInteract = interactive && !!set && !s.locked;
  const locked = shape.locked ?? false;
  const effectiveHeight = shape.height ?? shape.size;
  const rotation = shape.rotation ?? 0;
  // LayerToolbar normally docks above the box; flipped below when the box
  // sits too close to the canvas's top edge for that to fit on-screen. The
  // rotate/move handle row mirrors this flip in reverse (see its usage
  // below) so the two never land on top of each other.
  const isNearTop = (shape.y / 100) * s.height - effectiveHeight / 2 < 45;
  const update = (patch: Partial<Omit<ShapeLayer, "id" | "kind">>) =>
    set?.("shapes", withShapeUpdated(s, shape.id, patch));
  const remove = () => set?.("shapes", withShapeRemoved(s, shape.id));
  const duplicate = () => {
    if (!set) return;
    const dup = withShapeDuplicated(s, shape.id);
    set("shapes", dup.list);
    onSelect(dup.newId);
  };

  const handlePointerDown = canInteract
    ? (e: React.PointerEvent) => {
      // A second touch is also down — this is a pinch, not a drag (see
      // suppressDragRef's own comment on QuoteCanvas's Props). Bail before
      // even selecting, so a pinch starting with one finger over a
      // different layer doesn't change the selection either.
      if (suppressDragRef?.current) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (e.shiftKey) {
        onSelect(shape.id, { toggle: true });
        return;
      }
      if (locked) {
        onSelect(shape.id);
        return;
      }
      if (!selected) {
        onSelect(shape.id);
      }
      if (e.altKey && set) {
        const dup = withShapeDuplicated(sRef.current, shape.id);
        set("shapes", dup.list);
        onSelect(dup.newId);
        dragRef.current = {
          px: shape.x,
          py: shape.y,
          x: e.clientX,
          y: e.clientY,
          activeId: dup.newId,
          hasDuplicated: true,
        };
        return;
      }
      if (selected && selectedCount > 1) {
        groupDraggingRef.current = true;
        onGroupDragStart(e.clientX, e.clientY);
      } else {
        dragRef.current = {
          px: shape.x,
          py: shape.y,
          x: e.clientX,
          y: e.clientY,
          activeId: shape.id,
          hasDuplicated: false,
        };
      }
    }
    : undefined;

  const handlePointerMove = canInteract && !locked
    ? (e: React.PointerEvent) => {
      // A second finger joined mid-drag (drag started before the pinch was
      // detected) — cancel cleanly rather than let the layer keep
      // reacting to this finger while the canvas is also being pinched.
      if (suppressDragRef?.current) {
        dragRef.current = null;
        groupDraggingRef.current = false;
        return;
      }
      if (groupDraggingRef.current) {
        e.stopPropagation();
        onGroupDragMove(e.clientX, e.clientY);
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      e.stopPropagation();
      if (e.altKey && !d.hasDuplicated && set) {
        const dup = withShapeDuplicated(sRef.current, shape.id);
        set("shapes", dup.list);
        onSelect(dup.newId);
        d.activeId = dup.newId;
        d.hasDuplicated = true;
      }
      const dx = ((e.clientX - d.x) / scale / sRef.current.width) * 100;
      const dy = ((e.clientY - d.y) / scale / sRef.current.height) * 100;
      const width = shape.size;
      const height = effectiveHeight;
      const otherElements = getAllCanvasElements(sRef.current);
      const targetId = d.activeId || shape.id;
      const { nextX, nextY, guides: snapGuides } = calculateAlignmentSnap({
        currentId: targetId,
        rawX: d.px + dx,
        rawY: d.py + dy,
        width,
        height,
        s: sRef.current,
        otherElements,
      });
      onGuides(snapGuides);
      set?.("shapes", withShapeUpdated(sRef.current, targetId, { x: nextX, y: nextY }));
    }
    : undefined;

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
    dragRef.current = null;
    if (groupDraggingRef.current) {
      groupDraggingRef.current = false;
      onGroupDragEnd();
    }
    onGuides({ vCenter: false, hCenter: false });
  };

  if (shape.hidden) return null;

  return (
    <>
      <div
        ref={containerRef}
        data-layer-id={shape.id}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        data-nopan=""
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: "absolute",
          left: `${shape.x}%`,
          top: `${shape.y}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          width: typeof shape.size === "number" && Number.isFinite(shape.size) && shape.size > 0 ? shape.size : 200,
          height:
            typeof effectiveHeight === "number" && Number.isFinite(effectiveHeight) && effectiveHeight > 0
              ? effectiveHeight
              : 200,
          cursor: canInteract ? (locked ? "pointer" : "grab") : undefined,
          zIndex: selected
            ? 80 + index
            : shape.layer === "behind"
              ? 10 + Math.min(index, textFloorIndex(s) - 1)
              : 10 + index,
          touchAction: "none",
          userSelect: "none",
          outline: "none",
        }}
        className="group"
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            transform: [
              shape.flipH ? "scaleX(-1)" : "",
              shape.flipV ? "scaleY(-1)" : "",
            ]
              .filter(Boolean)
              .join(" ") || undefined,
            ...shapeFillStyle(shape),
            ...shapeCss(shape.kind, shape.radius),
          }}
        />
      </div>

      {canInteract && selected && selectedCount === 1 && controlsOverlayEl
        ? createPortal(
          <div
            style={{
              position: "absolute",
              left: `${shape.x}%`,
              top: `${shape.y}%`,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              width: typeof shape.size === "number" && Number.isFinite(shape.size) && shape.size > 0 ? shape.size : 200,
              height:
                typeof effectiveHeight === "number" && Number.isFinite(effectiveHeight) && effectiveHeight > 0
                  ? effectiveHeight
                  : 200,
              zIndex: 80 + index,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -4,
                border: locked ? "2px dashed #f59e0b" : "2px solid #0021ff",
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
            <div style={{ pointerEvents: "auto" }}>
              <LayerToolbar
                locked={locked}
                onToggleLock={() => update({ locked: !locked })}
                onDuplicate={duplicate}
                onDelete={remove}
                scale={scale}
                placement={isNearTop ? "bottom" : "top"}
              />
            </div>

            {!locked ? (
              <>
                {HANDLE_POSITIONS.filter((h) => activeHandle === null || activeHandle === h.id).map((h) => (
                  <div
                    key={h.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      setActiveHandle(h.id);
                      resizeRef.current = {
                        startWidth: shape.size,
                        startHeight: effectiveHeight,
                        startPosX: shape.x,
                        startPosY: shape.y,
                        startMouseX: e.clientX,
                        startMouseY: e.clientY,
                        handle: h.id,
                      };
                    }}
                    onPointerMove={(e) => {
                      const r = resizeRef.current;
                      if (!r || r.handle !== h.id) return;
                      e.stopPropagation();
                      const rawDx = (e.clientX - r.startMouseX) / scale;
                      const rawDy = (e.clientY - r.startMouseY) / scale;
                      const { dx, dy } = rotateVector(rawDx, rawDy, -rotation);
                      const maxBound = Math.max(s.width, s.height, 4000);

                      if (h.kind === "corner") {
                        const { width: nextWidth, height: nextHeight } = proportionalCornerSize(
                          h.id,
                          dx,
                          dy,
                          r.startWidth,
                          r.startHeight,
                          10,
                          maxBound,
                        );
                        const appliedDw = nextWidth - r.startWidth;
                        const appliedDh = nextHeight - r.startHeight;
                        const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                        update({
                          size: nextWidth,
                          height: nextHeight,
                          x: r.startPosX + (shift.dx / s.width) * 100,
                          y: r.startPosY + (shift.dy / s.height) * 100,
                        });
                      } else {
                        const dw = widthDeltaFor(h.id, dx);
                        const dh = heightDeltaFor(h.id, dy);
                        const nextWidth = Math.round(Math.max(10, Math.min(maxBound, r.startWidth + dw)));
                        const nextHeight = Math.round(Math.max(10, Math.min(maxBound, r.startHeight + dh)));
                        const appliedDw = nextWidth - r.startWidth;
                        const appliedDh = nextHeight - r.startHeight;
                        const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                        update({
                          size: nextWidth,
                          height: nextHeight,
                          x: r.startPosX + (shift.dx / s.width) * 100,
                          y: r.startPosY + (shift.dy / s.height) * 100,
                        });
                      }
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      resizeRef.current = null;
                      setActiveHandle(null);
                    }}
                    onPointerCancel={(e) => {
                      e.stopPropagation();
                      resizeRef.current = null;
                      setActiveHandle(null);
                    }}
                    data-nopan=""
                    className="group"
                    style={{ ...getHandleStyle(h, scale), pointerEvents: "auto" }}
                    title="Drag to resize shape"
                  >
                    <div
                      className="pointer-events-none rounded-full bg-white transition-all duration-150 group-hover:scale-125 group-hover:bg-[#0021FF] group-active:scale-135 group-active:bg-[#0021FF] group-active:ring-4 group-active:ring-[#0021FF]/40"
                      style={getHandleVisualStyle(h, scale)}
                    />
                  </div>
                ))}
                <RotateMoveHandleRow
                  containerRef={containerRef}
                  scale={scale}
                  placement={isNearTop ? "top" : "bottom"}
                  onRotate={(deg) => update({ rotation: deg })}
                  onMovePointerDown={handlePointerDown}
                  onMovePointerMove={handlePointerMove}
                  onMovePointerUp={handlePointerUp}
                />
              </>
            ) : null}
          </div>,
          controlsOverlayEl,
        )
        : null}
    </>
  );
}, scaleAwarePropsEqual);
