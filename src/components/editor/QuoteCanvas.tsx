import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy01Icon,
  Delete02Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "hugeicons-react";
import { loadGoogleFont } from "@/lib/fontLoader";
import {
  getImageLayers,
  getShapeLayers,
  getTextLayers,
  hexToRgba,
  sanitizeTextHtml,
  shapeCss,
  shapeFillStyle,
  withImageDuplicated,
  withImageRemoved,
  withImageUpdated,
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
};

export const QuoteCanvas = forwardRef<HTMLDivElement, Props>(function QuoteCanvas(
  { s, interactive = false, scale = 1, set, selection, onSelectionChange, registerTextLayerHandle },
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

  const [guides, setGuides] = useState<GuidesState>({ vCenter: false, hCenter: false });

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
      let dxPct = ((clientX - g.startMouseX) / scale / s.width) * 100;
      let dyPct = ((clientY - g.startMouseY) / scale / s.height) * 100;

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

        setGuides(snapGuides);
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
    [set, scale],
  );

  const endGroupDrag = useCallback(() => {
    groupDragRef.current = null;
    setGuides({ vCenter: false, hCenter: false });
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
      {/* Background layer clipped to canvas boundary */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          background: s.background,
          zIndex: 0,
          pointerEvents: "none",
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
              transform: `scale(${((s.bgImageZoom ?? 100) / 100) * (s.bgBlur > 0 ? 1.06 : 1)})`,
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
      </div>

      {/* Free-floating Shapes gallery — decorative silhouettes, each drags/
          resizes/removes independently on the canvas. Replaces the old
          single decorative-shape control. */}
      {getShapeLayers(s).map((shape, i) => (
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
          onGuides={setGuides}
        />
      ))}


      {/* Free-floating Images gallery — each entry drags/resizes/removes
          independently on the canvas. */}
      {getImageLayers(s).map((img, i) => (
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
          onGuides={setGuides}
        />
      ))}

      {/* Free-floating Text gallery — extra editable text blocks beyond the
          fixed quote/name/tagline, each drags/resizes/removes/edits
          independently on the canvas. */}
      {getTextLayers(s).map((t, i) => (
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
          onGuides={setGuides}
          registerHandle={registerTextLayerHandle}
        />
      ))}



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

          {/* Group Info Badge */}
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: -24,
              transform: "translateX(-50%)",
              background: "#8b5cf6",
              color: "#ffffff",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.03em",
              padding: "2px 8px",
              borderRadius: 4,
              boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
              whiteSpace: "nowrap",
            }}
          >
            {selected.length} Layers Selected · {Math.round(selectedBounds.width)} × {Math.round(selectedBounds.height)}px
          </span>
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
    "flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white";
  return (
    <div
      data-nopan=""
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: placement === "top" ? -12 * invScale : undefined,
        bottom: placement === "bottom" ? -12 * invScale : undefined,
        left: "50%",
        transformOrigin: placement === "top" ? "bottom center" : "top center",
        transform: `translateX(-50%) translateY(${placement === "top" ? "-100%" : "100%"}) scale(${invScale})`,
        zIndex: 80,
        touchAction: "none",
      }}
      className="flex items-center gap-0.5 whitespace-nowrap rounded-full border border-white/15 bg-[#15161c]/95 px-1.5 py-1 shadow-2xl backdrop-blur-md"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock();
        }}
        title={locked ? "Unlock layer" : "Lock layer"}
        className={btn}
      >
        {locked ? <SquareLock02Icon size={14} /> : <SquareUnlock02Icon size={14} />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDuplicate();
        }}
        title="Duplicate"
        className={btn}
      >
        <Copy01Icon size={14} />
      </button>
      <div className="mx-0.5 h-3.5 w-px bg-white/15" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-red-500/20 hover:text-red-400"
      >
        <Delete02Icon size={14} />
      </button>
    </div>
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
// no separate border-radius logic needed).
function handleDims(_kind: "corner" | "edge-h" | "edge-v"): { width: number; height: number } {
  switch (_kind) {
    case "corner":
      return { width: 16, height: 16 };
    case "edge-h":
      return { width: 18, height: 6 };
    case "edge-v":
      return { width: 6, height: 18 };
  }
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
function DraggableTextLayer({
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
  // Registers/unregisters this layer's imperative formatting handle (see
  // TextLayerHandle) under its id — lets a toolbar living outside the
  // canvas entirely (index.tsx's new top-docked selection toolbar) drive
  // this exact layer's formatting without the canvas needing to expose its
  // whole internal DOM/selection machinery.
  registerHandle?: ((id: string, handle: TextLayerHandle | null) => void) | undefined;
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
  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Captured from the double-click that enters edit mode (see
  // onDoubleClick below) and consumed once by the isEditing effect right
  // after — lets the caret land at the word actually clicked instead of
  // always jumping to the very start of the text. See that effect for why
  // this is needed at all: the browser's own native "double-click selects
  // the word" behavior can't run at click time (this div isn't editable/
  // selectable yet at that instant), so nothing places a caret on its own.
  const dblClickPointRef = useRef<{ x: number; y: number } | null>(null);
  // Set by applyFormatSmart (the imperative handle's version of
  // applyFormat, driven by the top-docked selection toolbar in index.tsx)
  // when a list command is requested but the layer isn't being edited yet
  // and has no highlighted range to act on — consumed once by the same
  // isEditing effect below, which selects the whole layer's text once it
  // actually becomes editable and then runs the command against that
  // selection, same as clicking "bullet list" with nothing highlighted
  // does in most rich text editors (turns the whole text into one list
  // item rather than silently doing nothing).
  const pendingListCommandRef = useRef<RichFormatCmd | null>(null);

  // Captured just before a native control that must steal focus to work at
  // all (the toolbar's font-family <select>, its color <input type=color>)
  // opens — unlike the plain format buttons, preventDefault on those would
  // just break them outright, so their own mousedown blurs this element
  // first. By the time their onChange actually fires (after the dropdown/
  // picker closes), window.getSelection() no longer shows the highlighted
  // range at all — it was real a moment ago, but focus moving away from a
  // contentEditable collapses whatever Selection was inside it. Cloning
  // the Range here, one tick earlier while it's still live, is what lets
  // applyStyleSmart still act on "the highlighted range" instead of always
  // falling back to the whole layer once focus has already moved on.
  const selectionSnapshotRef = useRef<Range | null>(null);

  const [isEditing, setIsEditing] = useState(false);

  // Frozen snapshot of the rendered content while actively editing — the
  // fix for a real, separate bug: onKeyUp below calls `update()` on every
  // keystroke to keep `t.text`/`t.html` live (so the sidebar and anything
  // else reading this layer stays in sync while typing), but `t` used to
  // be a dependency of editableNode's dangerouslySetInnerHTML too. That
  // meant every single keystroke forced editableNode to recompute and reset
  // this div's DOM — which, like the selection-collapsing bug above, wipes
  // out the live caret position, so every typed character landed at
  // position 0 instead of where the caret actually was (confirmed directly:
  // typing "XYZ" mid-string produced "ZYX<rest of text>", each character
  // prepended to the front). Mutating a ref during render like this is a
  // deliberate, narrow exception — safe here specifically because it's a
  // pure function of `t.html`/`t.text`/`isEditing` (same inputs always
  // produce the same assignment, so it's fine under double-invocation) and
  // is exactly the "derive a value without an effect" pattern React's own
  // docs describe: an effect would only run after the commit where
  // `isEditing` first flips true, one render too late for `content` below
  // to already be right on that render.
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
      // A real double-click's native "select the word" behavior can't run
      // at the moment the click actually lands — this div is still
      // `userSelect: none` and not yet contentEditable at that instant
      // (isEditing only flips true, and this effect only runs, afterward,
      // once React commits it). Nothing browser-native ever placed a
      // caret, so plain el.focus() alone falls back to position 0 — hence
      // reconstructing the click point's word here instead.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const canInteract = interactive && !!set;
  const locked = t.locked ?? false;
  // `update` needs the CURRENT `s` to correctly splice just this layer's
  // patch into the full document (withTextUpdated(s, t.id, patch)) without
  // clobbering unrelated concurrent edits elsewhere — but `s` necessarily
  // gets a new reference on every single keystroke typed into *this same*
  // layer (that's what typing does: onKeyUp below calls update(), which
  // changes `s.texts`, which is `s` itself). If `update` closed over `s`
  // directly (as a useCallback dependency) it would get a new identity on
  // every keystroke too, which — since `update` is one of editableNode's
  // memo dependencies — would still force that DOM to reset every
  // keystroke despite the `content` freeze above, reintroducing the exact
  // same caret-reset bug through a different path. Reading `s` from a ref
  // instead (kept fresh on every render, not as a captured value) makes
  // `update` itself genuinely stable (only depends on `set`, which is
  // already useCallback-stable up in index.tsx) while still always acting
  // on the latest state when actually called.
  const sRef = useRef(s);
  sRef.current = s;
  const update = useCallback(
    (patch: Partial<Omit<TextLayer, "id">>) => set?.("texts", withTextUpdated(sRef.current, t.id, patch)),
    [set, t.id],
  );
  const remove = () => set?.("texts", withTextRemoved(s, t.id));

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
      // No manual fallback for the two list commands — building a `<ul>/
      // <li>` structure by hand (splitting the current line, wrapping it,
      // merging with an adjacent list if one already sits next to it) is a
      // lot of edge-case-prone DOM surgery for a command that's supported
      // essentially everywhere already; unlike bold/italic/underline/
      // strike, there's no simple single-tag-wrap equivalent.
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
      // Tailwind's Preflight resets `ul, ol { list-style: none; margin: 0;
      // padding: 0 }` globally (src/index.css imports the full
      // "tailwindcss" package, base layer included), so a freshly-inserted
      // list would otherwise render with no visible bullets/numbers and no
      // indent. Setting it inline here (rather than only in a stylesheet)
      // is what lets it survive: this runs once, right before el.innerHTML
      // is captured into `t.html` below, and DOMPurify's allowlist (see
      // RICH_TEXT_ALLOWED_STYLE_PROPS in types.ts) keeps exactly these
      // three properties on every future re-sanitize too.
      el.querySelectorAll("ul, ol").forEach((listEl) => {
        const style = (listEl as HTMLElement).style;
        style.listStyleType = listEl.tagName === "OL" ? "decimal" : "disc";
        style.paddingLeft = "1.5em";
        style.margin = "0";
      });
    }

    const newText = el.textContent ?? "";
    const newHtml = sanitizeTextHtml(el.innerHTML);
    update({ text: newText, html: newHtml });
    notifyActiveFormat();
  };

  // Shared by applyFormatSmart and applyStyleSmart below: is there a real,
  // non-collapsed browser Selection currently inside this exact element?
  // That's the signal both use to decide "format just the highlighted
  // range" vs. "nothing highlighted, fall back to the whole layer".
  const hasLiveSelection = () => {
    const el = editableRef.current;
    const sel = window.getSelection();
    if (!isEditing || !el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    return el === r.commonAncestorContainer || el.contains(r.commonAncestorContainer);
  };

  // Backs getActiveFormat/subscribeActiveFormat below: while editing, a
  // collapsed caret still has a meaningful bold/italic/underline/strike
  // state (queryCommandState reports what typing right now would produce,
  // same as every rich text editor's toolbar), and a highlighted range
  // reports whatever formatting actually covers it — either way this is a
  // live query against the browser's own Selection, not something read off
  // `t`. Falls back to the whole layer's fields the moment there's no live
  // selection inside this element at all (not editing yet, or editing but
  // focus/selection genuinely isn't here), same fallback applyFormatSmart
  // itself uses for actually applying a command with nothing highlighted.
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
        // Fall through to the whole-layer fields below — some environments
        // don't support queryCommandState for one of these commands.
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

  // Re-broadcasts whenever anything getActiveFormat depends on changes:
  // entering/leaving edit mode, or the whole layer's own fields (e.g. the
  // sidebar toggling Bold while this toolbar happens to be mounted too).
  useEffect(() => {
    notifyActiveFormat();
  }, [notifyActiveFormat]);

  // Selection can also change without any of the above changing at all —
  // moving the caret with arrow keys, clicking to a new spot, or dragging
  // out a new highlight — so it needs its own live signal while editing.
  useEffect(() => {
    if (!isEditing) return;
    document.addEventListener("selectionchange", notifyActiveFormat);
    return () => document.removeEventListener("selectionchange", notifyActiveFormat);
  }, [isEditing, notifyActiveFormat]);

  // The version of applyFormat exposed through the imperative handle (see
  // TextLayerHandle) — used by index.tsx's top-docked selection toolbar,
  // which can be clicked the moment a layer is merely *selected*, well
  // before (or entirely without) the user ever entering edit mode or
  // highlighting a range. applyFormat itself requires a live, non-collapsed
  // selection inside this exact element (that's what the highlight-to-style
  // popover always had, before it was removed in favor of this toolbar) —
  // this wrapper adds the fallback for when there isn't one: bold/italic/
  // underline/strike toggle the whole layer's boolean field (same
  // fallback the sidebar's own handleFormat in LeftPanel.tsx already uses
  // for its "nothing highlighted" case), and the two list commands select
  // the entire layer's text first (via pendingListCommandRef + the
  // isEditing effect above) so there's something for execCommand to act on.
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

  // Called on mousedown by the toolbar's font-family <select> and color
  // <input type=color> — see selectionSnapshotRef above for why.
  const snapshotSelection = () => {
    selectionSnapshotRef.current = hasLiveSelection() ? window.getSelection()!.getRangeAt(0).cloneRange() : null;
  };

  // Same "highlighted range vs. whole layer" fallback as applyFormatSmart,
  // for the toolbar's font/size/color controls: with a live highlighted
  // range (or a snapshot of one taken just before a native control stole
  // focus — see snapshotSelection/selectionSnapshotRef above), wrap just
  // that range in a <span style="..."> (same DOM-surgery technique
  // applyFormat's own manual fallback uses for bold/italic/underline/
  // strike); with neither, patch the whole layer. Deliberately NOT used
  // for alignment — text-align is a block-level CSS property that has no
  // effect on an inline <span>, so "align just this highlighted word"
  // isn't a meaningful operation; setAlign below always patches the whole
  // layer.
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
        // Only re-select when the range came from the *live* selection —
        // if it came from the snapshot, focus has already moved to the
        // native control that's mid-interaction (the dropdown/picker), and
        // forcing selection back into this element would just fight it.
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
    const newText = el.textContent ?? "";
    const newHtml = sanitizeTextHtml(el.innerHTML);
    update({ text: newText, html: newHtml });
  };

  const setFontFamily = (v: string) => applyStyleSmart({ fontFamily: v }, { fontFamily: v });

  // Strip inline font-size styles from HTML spans when we're changing the
  // whole-layer font size, so t.size (applied as CSS fontSize on the
  // container) is the single source of truth and inline spans don't
  // silently override it after a corner resize or toolbar increment.
  const stripInlineFontSize = (html: string): string => {
    if (!html || typeof window === "undefined") return html;
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      tmp.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
        el.style.removeProperty("font-size");
        if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
      });
      return sanitizeTextHtml(tmp.innerHTML);
    } catch {
      return html;
    }
  };

  const setSize = (v: number) => {
    const currentSize = t.size || 32;
    const ratio = v / currentSize;
    const nextWidth = typeof t.width === "number" && t.width > 0 ? Math.round(Math.max(40, t.width * ratio)) : undefined;
    const nextMinHeight = typeof t.minHeight === "number" && t.minHeight > 0 ? Math.round(t.minHeight * ratio) : undefined;

    const liveRange = hasLiveSelection() ? window.getSelection()?.getRangeAt(0) : null;
    const range = liveRange ?? selectionSnapshotRef.current;

    if (range) {
      // Range selected — apply to just the highlighted span
      applyStyleSmart(
        { fontSize: `${v}px` },
        {
          size: v,
          ...(nextWidth !== undefined ? { width: nextWidth } : {}),
          ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
        },
      );
    } else {
      // No selection — change the whole layer and strip all inline font-size
      // overrides from existing HTML so the layer-level size is respected.
      const cleanHtml = t.html ? stripInlineFontSize(t.html) : undefined;
      update({
        size: v,
        ...(nextWidth !== undefined ? { width: nextWidth } : {}),
        ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
        ...(cleanHtml !== undefined ? { html: cleanHtml } : {}),
      });
    }
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

  // Kept as a stable object reference (registered once) whose properties
  // are refreshed every render, rather than a new object each time — see
  // the comment on `registerHandle` above for why an index.tsx-level Map
  // needs this to survive across renders without re-registering constantly.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerHandle, t.id]);

  const duplicate = () => {
    if (!set) return;
    const dup = withTextDuplicated(s, t.id);
    set("texts", dup.list);
    onSelect(dup.newId);
  };

  const hasExplicitWidth = t.width !== undefined;

  // Memoized deliberately: this is the actual contentEditable node
  // (dangerouslySetInnerHTML-driven), and re-rendering it in response to
  // unrelated state (even to an *unchanged* `dangerouslySetInnerHTML`
  // value) makes React touch its DOM, which silently collapses whatever
  // native browser selection the user is mid-drag on. Confirmed directly
  // (headless Chromium + a MutationObserver): every such re-render
  // coincided with a DOM mutation and an immediately collapsed selection,
  // and isolating this node with useMemo/deps that exclude anything not
  // genuinely relevant to it was independently confirmed to fix it.
  // `update` in the dependency list below is made stable via useCallback
  // specifically so it doesn't defeat this by changing identity every
  // render (see the comment on it above).
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
              e.stopPropagation();
              if (e.shiftKey) {
                onSelect(t.id, { toggle: true });
                return;
              }
              if (locked) return;

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
            if (el) {
              update({
                text: el.textContent ?? "",
                html: sanitizeTextHtml(el.innerHTML),
              });
            }
            notifyActiveFormat();
          }
        }}
        onBlur={(e) => {
          update({
            text: e.currentTarget.textContent ?? "",
            html: sanitizeTextHtml(e.currentTarget.innerHTML),
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // depends on individual t.* fields plus `content` rather than `t`
    // itself, excluding `t.text`/`t.html` specifically — see the comment
    // above `editSnapshotRef` for why.
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
      content,
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

  if (t.hidden) return null;

  return (
    <div
      ref={containerRef}
      data-layer-id={t.id}
      data-nopan=""
      style={{
        position: "absolute",
        left: `${t.x}%`,
        top: `${t.y}%`,
        transform: "translate(-50%, -50%)",
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
        zIndex: 50 + (getTextLayers(s).length - index),
        touchAction: "none",
        outline: canInteract && selected ? "2px solid var(--color-primary)" : "none",
        outlineOffset: 4,
      }}
      className="group"
    >
      {editableNode}

      {canInteract && selected && selectedCount === 1 ? (
        <>
          <LayerToolbar
            locked={locked}
            onToggleLock={() => update({ locked: !locked })}
            onDuplicate={duplicate}
            onDelete={remove}
            scale={scale}
          />

          {!locked ? (
            <>
              {/* 8 Stretch / Resize Handles — the 4 round corners scale
                  font size & box proportionally; the 4 pill-shaped edge handles
                  resize the box itself (width for left/right, reserved
                  vertical room for top/bottom) and leave font size alone. */}
              {HANDLE_POSITIONS.map((h) => (
                <div
                  key={h.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
                    const dx = (e.clientX - r.startMouseX) / scale;
                    const dy = (e.clientY - r.startMouseY) / scale;
                    if (h.kind === "corner") {
                      const delta = resizeDelta(h.id, dx, dy);
                      const nextSize = Math.round(Math.max(10, Math.min(300, r.startSize + delta / 2)));
                      const scaleRatio = nextSize / r.startSize;
                      const nextWidth = r.startWidth ? Math.round(Math.max(40, r.startWidth * scaleRatio)) : undefined;
                      const nextMinHeight = r.startMinHeight ? Math.round(r.startMinHeight * scaleRatio) : undefined;
                      // Also strip any inline font-size spans so the layer-level
                      // size is always the single source of truth after a resize.
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
                      return;
                    }
                    const dw = widthDeltaFor(h.id, dx);
                    const dh = heightDeltaFor(h.id, dy);
                    const nextWidth = Math.round(Math.max(80, Math.min(1600, r.startWidth + dw)));
                    const nextMinHeight = Math.round(Math.max(0, Math.min(2000, r.startMinHeight + dh)));
                    const appliedDw = nextWidth - r.startWidth;
                    const appliedDh = nextMinHeight - r.startMinHeight;
                    update({
                      width: nextWidth,
                      minHeight: nextMinHeight,
                      x: r.startPosX + (centerShiftX(h.id, appliedDw) / s.width) * 100,
                      y: r.startPosY + (centerShiftY(h.id, appliedDh) / s.height) * 100,
                    });
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    resizeRef.current = null;
                  }}
                  onPointerCancel={(e) => {
                    e.stopPropagation();
                    resizeRef.current = null;
                  }}
                  data-nopan=""
                  className="rounded-full bg-white transition-all hover:scale-125 hover:bg-[#0021FF]"
                  style={{
                    position: "absolute",
                    ...h.style,
                    ...handleDims(h.kind),
                    boxShadow: "0 2px 8px 0 rgba(0,33,255,0.45), 0 1px 3px 0 rgba(0,0,0,0.25)",
                    cursor: h.cursor,
                    zIndex: 60,
                    touchAction: "none",
                  }}
                  title="Drag to resize text"
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}
      </div>
    );
  }

// One entry in the free-floating Images gallery. Split out as its own
// component (rather than inlined + looped like the single legacy top image
// was) because each one needs its own drag/resize refs — hooks can't live
// inside a .map() callback in the parent.
function DraggableImageLayer({
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
  const containerRef = useRef<HTMLDivElement>(null);

  const canInteract = interactive && !!set && !s.locked;
  const locked = img.locked ?? false;
  const hasExplicitHeight = img.height !== undefined;
  const update = (patch: Partial<Omit<ImageLayer, "id">>) => set?.("images", withImageUpdated(s, img.id, patch));
  const remove = () => set?.("images", withImageRemoved(s, img.id));
  const duplicate = () => {
    if (!set) return;
    const dup = withImageDuplicated(s, img.id);
    set("images", dup.list);
    onSelect(dup.newId);
  };

  if (img.hidden) return null;

  return (
    <div
      ref={containerRef}
      data-layer-id={img.id}
      onPointerDown={
        canInteract
          ? (e) => {
              e.stopPropagation();
              if (e.shiftKey) {
                onSelect(img.id, { toggle: true });
                return;
              }
              if (locked) return;

              // Alt + Drag to Duplicate Image Layer
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
          : undefined
      }
      onPointerMove={
        canInteract && !locked
          ? (e) => {
              if (groupDraggingRef.current) {
                e.stopPropagation();
                onGroupDragMove(e.clientX, e.clientY);
                return;
              }
              const d = dragRef.current;
              if (!d) return;
              e.stopPropagation();

              // If user presses Alt mid-drag: clone and drag new clone
              if (e.altKey && !d.hasDuplicated && set) {
                const dup = withImageDuplicated(sRef.current, img.id);
                set("images", dup.list);
                onSelect(dup.newId);
                d.activeId = dup.newId;
                d.hasDuplicated = true;
              }

              const dx = ((e.clientX - d.x) / scale / s.width) * 100;
              const dy = ((e.clientY - d.y) / scale / s.height) * 100;
              const width = img.size;
              const height = img.height ?? img.size;
              const otherElements = getAllCanvasElements(s);
              const targetId = d.activeId || img.id;
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
              set?.("images", withImageUpdated(sRef.current, targetId, { x: nextX, y: nextY }));
            }
          : undefined
      }
      data-nopan=""
      onPointerUp={() => {
        dragRef.current = null;
        if (groupDraggingRef.current) {
          groupDraggingRef.current = false;
          onGroupDragEnd();
        }
        onGuides({ vCenter: false, hCenter: false });
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        if (groupDraggingRef.current) {
          groupDraggingRef.current = false;
          onGroupDragEnd();
        }
        onGuides({ vCenter: false, hCenter: false });
      }}
      style={{
        position: "absolute",
        left: `${img.x}%`,
        top: `${img.y}%`,
        transform: "translate(-50%, -50%)",
        width: `${typeof img.size === "number" && Number.isFinite(img.size) && img.size > 0 ? img.size : 120}px`,
        height:
          hasExplicitHeight && typeof img.height === "number" && Number.isFinite(img.height) && img.height > 0
            ? `${img.height}px`
            : undefined,
        cursor: canInteract ? (locked ? "pointer" : "grab") : undefined,
        zIndex: (img.layer === "behind" ? 2 : 40) + (getImageLayers(s).length - index),
        touchAction: "none",
        userSelect: "none",
        outline: canInteract && selected ? "2px solid var(--color-primary)" : "none",
        outlineOffset: 4,
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

      {canInteract && selected && selectedCount === 1 ? (
        <>
          <LayerToolbar
            locked={locked}
            onToggleLock={() => update({ locked: !locked })}
            onDuplicate={duplicate}
            onDelete={remove}
            scale={scale}
          />

          {!locked ? (
            <>
              {/* 8 Stretch / Resize Handles */}
              {HANDLE_POSITIONS.map((h) => (
                <div
                  key={h.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    // Height may never have been set explicitly (natural
                    // aspect ratio) — measure the live rendered height as
                    // the resize's starting point so a first-ever N/S drag
                    // doesn't jump.
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
                    const dx = (e.clientX - r.startMouseX) / scale;
                    const dy = (e.clientY - r.startMouseY) / scale;
                    // Corner handles scale width+height together at the
                    // image's original aspect ratio (Uniform Scaling); the
                    // 4 edge handles still stretch just their own axis, same
                    // as before — see proportionalCornerSize above.
                    const { width: nextWidth, height: nextHeight } =
                      h.kind === "corner"
                        ? proportionalCornerSize(h.id, dx, dy, r.startWidth, r.startHeight, 40, 1600)
                        : {
                            width: Math.round(Math.max(40, Math.min(1600, r.startWidth + widthDeltaFor(h.id, dx)))),
                            height: Math.round(Math.max(40, Math.min(1600, r.startHeight + heightDeltaFor(h.id, dy)))),
                          };
                    // The element is positioned by its center, so growing
                    // width/height alone would expand it symmetrically —
                    // shift the center by half of what actually changed
                    // (post-clamp) toward the dragged side, so the
                    // opposite edge/corner stays put instead of the whole
                    // thing appearing to resize from the middle.
                    const appliedDw = nextWidth - r.startWidth;
                    const appliedDh = nextHeight - r.startHeight;
                    // Both size AND height are always written (not just
                    // the axis this handle is dragging) — height defaults
                    // to the image's natural aspect ratio whenever it's
                    // never been set explicitly, so leaving it untouched
                    // during a width-only drag would make it silently
                    // keep tracking the new width every render, looking
                    // like a fixed-ratio resize instead of a one-axis one.
                    update({
                      size: nextWidth,
                      height: nextHeight,
                      x: r.startPosX + (centerShiftX(h.id, appliedDw) / s.width) * 100,
                      y: r.startPosY + (centerShiftY(h.id, appliedDh) / s.height) * 100,
                    });
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    resizeRef.current = null;
                  }}
                  onPointerCancel={(e) => {
                    e.stopPropagation();
                    resizeRef.current = null;
                  }}
                  data-nopan=""
                  className="rounded-full bg-white transition-all hover:scale-125 hover:bg-[#0021FF]"
                  style={{
                    position: "absolute",
                    ...h.style,
                    ...handleDims(h.kind),
                    boxShadow: "0 2px 8px 0 rgba(0,33,255,0.45), 0 1px 3px 0 rgba(0,0,0,0.25)",
                    cursor: h.cursor,
                    zIndex: 60,
                    touchAction: "none",
                  }}
                  title="Drag to resize image"
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}
      </div>
    );
  }

// One entry in the free-floating Shapes gallery — same drag/resize/remove
// interaction model as DraggableImageLayer, but a plain colored div shaped
// via shapeCss() (clip-path or border-radius) instead of an <img>.
function DraggableShapeLayer({
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

  const canInteract = interactive && !!set && !s.locked;
  const locked = shape.locked ?? false;
  const effectiveHeight = shape.height ?? shape.size;
  const update = (patch: Partial<Omit<ShapeLayer, "id" | "kind">>) =>
    set?.("shapes", withShapeUpdated(s, shape.id, patch));
  const remove = () => set?.("shapes", withShapeRemoved(s, shape.id));
  const duplicate = () => {
    if (!set) return;
    const dup = withShapeDuplicated(s, shape.id);
    set("shapes", dup.list);
    onSelect(dup.newId);
  };

  if (shape.hidden) return null;

  return (
    <div
      data-layer-id={shape.id}
      onPointerDown={
        canInteract
          ? (e) => {
              e.stopPropagation();
              if (e.shiftKey) {
                onSelect(shape.id, { toggle: true });
                return;
              }
              if (locked) return;

              // Alt + Drag to Duplicate Shape Layer
              if (e.altKey && set) {
                const dup = withShapeDuplicated(sRef.current, shape.id);
                set("shapes", dup.list);
                onSelect(dup.newId);
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

              if (!selected) onSelect(shape.id);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
          : undefined
      }
      onPointerMove={
        canInteract && !locked
          ? (e) => {
              if (groupDraggingRef.current) {
                e.stopPropagation();
                onGroupDragMove(e.clientX, e.clientY);
                return;
              }
              const d = dragRef.current;
              if (!d) return;
              e.stopPropagation();

              // If user presses Alt mid-drag: clone and drag new clone
              if (e.altKey && !d.hasDuplicated && set) {
                const dup = withShapeDuplicated(sRef.current, shape.id);
                set("shapes", dup.list);
                onSelect(dup.newId);
                d.activeId = dup.newId;
                d.hasDuplicated = true;
              }

              const dx = ((e.clientX - d.x) / scale / s.width) * 100;
              const dy = ((e.clientY - d.y) / scale / s.height) * 100;
              const width = shape.size;
              const height = effectiveHeight;
              const otherElements = getAllCanvasElements(s);
              const targetId = d.activeId || shape.id;
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
              set?.("shapes", withShapeUpdated(sRef.current, targetId, { x: nextX, y: nextY }));
            }
          : undefined
      }
      data-nopan=""
      onPointerUp={() => {
        dragRef.current = null;
        if (groupDraggingRef.current) {
          groupDraggingRef.current = false;
          onGroupDragEnd();
        }
        onGuides({ vCenter: false, hCenter: false });
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        if (groupDraggingRef.current) {
          groupDraggingRef.current = false;
          onGroupDragEnd();
        }
        onGuides({ vCenter: false, hCenter: false });
      }}
      style={{
        position: "absolute",
        left: `${shape.x}%`,
        top: `${shape.y}%`,
        transform: "translate(-50%, -50%)",
        width: typeof shape.size === "number" && Number.isFinite(shape.size) && shape.size > 0 ? shape.size : 200,
        height:
          typeof effectiveHeight === "number" && Number.isFinite(effectiveHeight) && effectiveHeight > 0
            ? effectiveHeight
            : 200,
        cursor: canInteract ? (locked ? "pointer" : "grab") : undefined,
        zIndex: (shape.layer === "behind" ? 2 : 40) + (getShapeLayers(s).length - index),
        touchAction: "none",
        userSelect: "none",
        outline: canInteract && selected ? "2px solid var(--color-primary)" : "none",
        outlineOffset: 4,
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

      {canInteract && selected && selectedCount === 1 ? (
        <>
          {(() => {
            const isNearTop = (shape.y / 100) * s.height - effectiveHeight / 2 < 45;
            return (
              <LayerToolbar
                locked={locked}
                onToggleLock={() => update({ locked: !locked })}
                onDuplicate={duplicate}
                onDelete={remove}
                scale={scale}
                placement={isNearTop ? "bottom" : "top"}
              />
            );
          })()}

          {!locked ? (
            <>
              {/* 8 Stretch / Resize Handles — supports free unconstrained aspect ratio (unscaling ratio) */}
              {HANDLE_POSITIONS.map((h) => (
                <div
                  key={h.id}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
                    const dx = (e.clientX - r.startMouseX) / scale;
                    const dy = (e.clientY - r.startMouseY) / scale;
                    const maxBound = Math.max(s.width, s.height, 4000);

                    if (h.kind === "corner") {
                      // Corner handles: lock aspect ratio so width === height
                      // (uniform/proportional scaling — equal sides).
                      const { width: nextWidth, height: nextHeight } = proportionalCornerSize(
                        h.id, dx, dy,
                        r.startWidth, r.startHeight,
                        10, maxBound,
                      );
                      const appliedDw = nextWidth - r.startWidth;
                      const appliedDh = nextHeight - r.startHeight;
                      update({
                        size: nextWidth,
                        height: nextHeight,
                        x: r.startPosX + (centerShiftX(h.id, appliedDw) / s.width) * 100,
                        y: r.startPosY + (centerShiftY(h.id, appliedDh) / s.height) * 100,
                      });
                    } else {
                      // Edge handles: free resize on the single axis they control.
                      const dw = widthDeltaFor(h.id, dx);
                      const dh = heightDeltaFor(h.id, dy);
                      const nextWidth = Math.round(Math.max(10, Math.min(maxBound, r.startWidth + dw)));
                      const nextHeight = Math.round(Math.max(10, Math.min(maxBound, r.startHeight + dh)));
                      const appliedDw = nextWidth - r.startWidth;
                      const appliedDh = nextHeight - r.startHeight;
                      update({
                        size: nextWidth,
                        height: nextHeight,
                        x: r.startPosX + (centerShiftX(h.id, appliedDw) / s.width) * 100,
                        y: r.startPosY + (centerShiftY(h.id, appliedDh) / s.height) * 100,
                      });
                    }
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    resizeRef.current = null;
                  }}
                  onPointerCancel={(e) => {
                    e.stopPropagation();
                    resizeRef.current = null;
                  }}
                  data-nopan=""
                  className="rounded-full bg-white transition-all hover:scale-125 hover:bg-[#0021FF]"
                  style={{
                    position: "absolute",
                    ...h.style,
                    ...handleDims(h.kind),
                    boxShadow: "0 2px 8px 0 rgba(0,33,255,0.45), 0 1px 3px 0 rgba(0,0,0,0.25)",
                    cursor: h.cursor,
                    zIndex: 60,
                    touchAction: "none",
                  }}
                  title="Drag to resize shape"
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}
      </div>
    );
  }
