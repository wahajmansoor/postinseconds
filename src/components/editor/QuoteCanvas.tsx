import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Copy01Icon,
  CursorCircleSelection02Icon,
  Delete02Icon,
  MoveIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
} from "hugeicons-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { loadGoogleFont } from "@/lib/fontLoader";
import { triggerAlignmentHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  getImageLayers,
  getShapeLayers,
  getTextLayers,
  getUnifiedLayers,
  hexToRgba,
  normalizeColorToHex,
  sanitizeTextHtml,
  shapeCss,
  shapeFillStyle,
  isLineShape,
  withImageDuplicated,
  withImageRemoved,
  withImageUpdated,
  withMultipleLayersDuplicated,
  withMultipleLayersRemoved,
  withMultipleLayersRotated,
  withMultipleLayersScaled,
  withMixedLayersSpacedEvenly,
  withShapeDuplicated,
  withShapeRemoved,
  withShapeUpdated,
  withTextDuplicated,
  withTextRemoved,
  withTextUpdated,
} from "./types";
import { getTextEffectStyle } from "./textEffects";
import { LineShapeSvg } from "./LineShapeSvg";
import { RotateRefreshIcon } from "./RotateRefreshIcon";
import type { EditorState, ImageLayer, ShapeLayer, TextLayer } from "./types";

// How far the Canva-style margin guide is inset from each canvas edge, as a
// percent of canvas width/height. Shared between the overlay's own inline
// position (right below) and calculateAlignmentSnap's margin-boundary snap
// further down, so the line you actually see and the line elements snap to
// can never drift apart.
const MARGIN_INSET_PCT = 8;

export type RichFormatCmd = "bold" | "italic" | "underline" | "strike" | "uppercase" | "bulletList" | "numberedList";

export type LiveTextFormat = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  uppercase: boolean;
  fontFamily?: string | "multiple" | undefined;
  color?: string | "multiple" | undefined;
  colors?: string[] | undefined;
  bulletList: boolean;
  numberedList: boolean;
};

export type TextLayerHandle = {
  applyFormat: (cmd: RichFormatCmd) => void;
  setFontFamily: (v: string) => void;
  setWeight: (w: number) => void;
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
  startEditing?: () => void;
};

type Props = {
  s: EditorState;
  /** enables in-canvas dragging and inline text editing */
  interactive?: boolean;
  scale?: number;
  set?: <K extends keyof EditorState>(
    k: K,
    v: EditorState[K] | ((prev: EditorState[K], prevState: EditorState) => EditorState[K]),
    opts?: { replace?: boolean | undefined; continuousKey?: string | undefined },
  ) => void;
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
  /** Fires when background is tapped to deselect active layers on mobile */
  onDeselectAll?: () => void;
  /** Force mobile mode behavior (falls back to useIsMobile hook) */
  isMobile?: boolean;
  /** Show Canva-style dashed margins guide inside the canvas */
  showMargins?: boolean;
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

// The 8 handle positions around a selection box — 4 round corners plus 4
// pill-shaped edge midpoints (wide/short on top+bottom, narrow/tall on
// left+right — matches Canva's look). Images, Shapes, and Multi-Selections
// stretch width/height independently per handle; Text uses font scaling.
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

// Text layers only use the 4 corner resize handles (for font scaling) plus left/right
// pill handles (for adjusting text wrapping width). Top and bottom pill handles are excluded.
const TEXT_HANDLE_POSITIONS = HANDLE_POSITIONS.filter((h) => h.id !== "n" && h.id !== "s");

type HandleId = (typeof HANDLE_POSITIONS)[number]["id"];

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

function zoomed(dims: { width: number; height: number }, scale: number): { width: number; height: number } {
  if (!scale || scale <= 0) return dims;
  return { width: dims.width / scale, height: dims.height / scale };
}

function getHandleStyle(h: (typeof HANDLE_POSITIONS)[number], scale: number): React.CSSProperties {
  const dims = zoomed(handleHitDims(h.kind), scale);
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
    onDeselectAll,
    isMobile,
    showMargins = false,
  },
  ref,
) {
  const isMobileHook = useIsMobile();
  const effectiveIsMobile = isMobile !== undefined ? isMobile : isMobileHook;
  const lastBgTapTimeRef = useRef<number>(0);
  const lastBgTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastBgPointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [multiRotateAngle, setMultiRotateAngle] = useState<number | null>(null);
  // Set true the instant a multi-selection drag begins so all floating
  // controls (info bar, resize handles, rotate button) vanish for the
  // duration, matching the single-layer isMoving/isRotating hide logic.
  const [isGroupDragging, setIsGroupDragging] = useState(false);
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
  // Same reasoning as sRef above, for `showMargins` — read from a ref so
  // updateGroupDrag/the keyboard-nudge handler below don't need it in their
  // own dependency arrays just to decide whether margin-boundary snapping
  // is live.
  const showMarginsRef = useRef(showMargins);
  showMarginsRef.current = showMargins;
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
    // Spacing-measurement lines (distancePx set) don't represent an actual
    // snap — they show up just from having a nearby neighbor, regardless of
    // whether anything actually aligned — so they're excluded here; only a
    // genuine alignment line/edge/center should trigger the snap haptic.
    const isSnapped = !!(
      g.vCenter ||
      g.hCenter ||
      g.edgeLeft ||
      g.edgeRight ||
      g.edgeTop ||
      g.edgeBottom ||
      g.marginLeft ||
      g.marginRight ||
      g.marginTop ||
      g.marginBottom ||
      g.lines?.some((line) => line.distancePx === undefined)
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
  const multiResizeRef = useRef<{
    handle: string;
    startMouseX: number;
    startMouseY: number;
    startBounds: { left: number; top: number; width: number; height: number };
    initialItems: {
      kind: "text" | "image" | "shape";
      id: string;
      x: number;
      y: number;
      size: number;
      width?: number | undefined;
      height?: number | undefined;
      strokeWidth?: number | undefined;
    }[];
  } | null>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useCallback (same stability reasoning as `selectLayer` above — these
  // three are also threaded down into DraggableTextLayer's editableNode
  // memo as onGroupDragStart/onGroupDragMove/onGroupDragEnd).
  const beginGroupDrag = useCallback(
    // `duplicate` powers Alt+drag on a multi-selection (mirrors what
    // single-item Alt+drag already did per-layer via withTextDuplicated/
    // withImageDuplicated/withShapeDuplicated) — duplicates every selected
    // layer in one batch (withMultipleLayersDuplicated), points the
    // selection at the new copies, and seeds groupDragRef directly from
    // that helper's own newSelection (which already carries each copy's
    // startX/startY) instead of re-reading `selected`/sRef.current — those
    // still reflect the PRE-duplication ids/state at this point, since
    // `set`/selection updates are async React state, not visible yet within
    // this same synchronous call.
    (clientX: number, clientY: number, duplicate?: boolean) => {
      const s = sRef.current;
      if (duplicate && set) {
        const result = withMultipleLayersDuplicated(s, selected);
        if (result.newSelection.length === 0) return;
        set("texts", result.texts);
        set("images", result.images);
        set("shapes", result.shapes);
        set("layerOrder", result.layerOrder);
        if (onSelectionChange) {
          onSelectionChange(result.newSelection);
        } else {
          setInternalSelected(result.newSelection);
        }
        groupDragRef.current = {
          startMouseX: clientX,
          startMouseY: clientY,
          items: result.newSelection.map(({ kind, id, startX, startY }) => ({ kind, id, startX, startY })),
        };
        return;
      }
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
      setIsGroupDragging(true);
    },
    [selected, set, onSelectionChange],
  );

  const unifiedLayers = useMemo(
    () => getUnifiedLayers(s),
    [s.layerOrder, s.texts, s.images, s.shapes],
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

      // Alignment snapping & guide calculation for ALL drag sizes (single or multi).
      // Previously this block was gated behind g.items.length > 1, which meant
      // single-layer drags never showed any guides at all. Now we always compute
      // the group's combined bounding box and run calculateAlignmentSnap against
      // every non-selected element so guides appear on every drag.
      {
        const selectedIds = new Set(g.items.map((it) => it.id));
        const otherElements = getAllCanvasElements(s).filter((el) => !selectedIds.has(el.id));

        let groupWidth: number;
        let groupHeight: number;
        let rawGroupCenterX: number;
        let rawGroupCenterY: number;

        if (g.items.length === 1) {
          // Single-layer drag: use the element's actual on-screen dimensions so
          // guides snap precisely to the layer's own edges/center.
          const solo = g.items[0]!; // length===1 guarantees this exists
          const el = document.querySelector(`[data-layer-id="${solo.id}"]`) as HTMLElement | null;
          groupWidth = el ? el.offsetWidth : 40;
          groupHeight = el ? el.offsetHeight : 40;
          rawGroupCenterX = solo.startX + dxPct;
          rawGroupCenterY = solo.startY + dyPct;
        } else {
          // Multi-layer drag: treat the whole selection bounding box as one unit.
          const minStartX = Math.min(...g.items.map((it) => it.startX));
          const maxStartX = Math.max(...g.items.map((it) => it.startX));
          const minStartY = Math.min(...g.items.map((it) => it.startY));
          const maxStartY = Math.max(...g.items.map((it) => it.startY));
          groupWidth = selectedBounds?.width ?? Math.max(20, ((maxStartX - minStartX) / 100) * s.width);
          groupHeight = selectedBounds?.height ?? Math.max(20, ((maxStartY - minStartY) / 100) * s.height);
          rawGroupCenterX = (minStartX + maxStartX) / 2 + dxPct;
          rawGroupCenterY = (minStartY + maxStartY) / 2 + dyPct;
        }

        const soloItem = g.items.length === 1 ? g.items[0]! : null;

        const { nextX: snappedCX, nextY: snappedCY, guides: snapGuides } =
          calculateAlignmentSnap({
            currentId: soloItem ? soloItem.id : "__multi_group__",
            rawX: rawGroupCenterX,
            rawY: rawGroupCenterY,
            width: groupWidth,
            height: groupHeight,
            s,
            otherElements,
            showMargins: showMarginsRef.current,
          });

        // Back out the snap offset from the raw displacement so all items move
        // by exactly the same snapped delta.
        if (soloItem) {
          dxPct = snappedCX - soloItem.startX;
          dyPct = snappedCY - soloItem.startY;
        } else {
          const minStartX = Math.min(...g.items.map((it) => it.startX));
          const maxStartX = Math.max(...g.items.map((it) => it.startX));
          const minStartY = Math.min(...g.items.map((it) => it.startY));
          const maxStartY = Math.max(...g.items.map((it) => it.startY));
          dxPct = snappedCX - (minStartX + maxStartX) / 2;
          dyPct = snappedCY - (minStartY + maxStartY) / 2;
        }

        // Use the ref (not the closure) so we always call the latest
        // handleGuidesChange even though updateGroupDrag is memoized with
        // [set] alone — the ref is updated every render.
        handleGuidesChangeRef.current(snapGuides);
      }

      const imageItems = g.items.filter((it) => it.kind === "image");
      if (imageItems.length) {
        set(
          "images",
          (_, prevState) => {
            let next = getImageLayers(prevState);
            for (const it of imageItems) {
              next = next.map((img) =>
                img.id === it.id ? { ...img, x: it.startX + dxPct, y: it.startY + dyPct } : img,
              );
            }
            return next;
          },
          { continuousKey: "group-drag" },
        );
      }
      const textItems = g.items.filter((it) => it.kind === "text");
      if (textItems.length) {
        set(
          "texts",
          (_, prevState) => {
            let next = getTextLayers(prevState);
            for (const it of textItems) {
              next = next.map((t) => (t.id === it.id ? { ...t, x: it.startX + dxPct, y: it.startY + dyPct } : t));
            }
            return next;
          },
          { continuousKey: "group-drag" },
        );
      }
      const shapeItems = g.items.filter((it) => it.kind === "shape");
      if (shapeItems.length) {
        set(
          "shapes",
          (_, prevState) => {
            let next = getShapeLayers(prevState);
            for (const it of shapeItems) {
              next = next.map((sh) =>
                sh.id === it.id ? { ...sh, x: it.startX + dxPct, y: it.startY + dyPct } : sh,
              );
            }
            return next;
          },
          { continuousKey: "group-drag" },
        );
      }
    },
    [set],
  );

  const endGroupDrag = useCallback(() => {
    groupDragRef.current = null;
    setIsGroupDragging(false);
    handleGuidesChangeRef.current({ vCenter: false, hCenter: false });
  }, []);

  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const handleGuidesChangeRef = useRef(handleGuidesChange);
  handleGuidesChangeRef.current = handleGuidesChange;

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
      const currentSelected = selectedRef.current;
      if (currentSelected.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.isContentEditable || active?.tagName === "INPUT" || active?.tagName === "TEXTAREA") {
        return;
      }

      // Delete or Backspace key to delete selected layers
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const currentS = sRef.current;
        const selImages = currentSelected.filter((sel) => sel.kind === "image").map((sel) => sel.id);
        const selTexts = currentSelected.filter((sel) => sel.kind === "text").map((sel) => sel.id);
        const selShapes = currentSelected.filter((sel) => sel.kind === "shape").map((sel) => sel.id);

        if (selImages.length) {
          set("images", (_, prevS) =>
            getImageLayers(prevS).filter((img) => !selImages.includes(img.id) || img.locked),
          );
        }
        if (selTexts.length) {
          set("texts", (_, prevS) =>
            getTextLayers(prevS).filter((t) => !selTexts.includes(t.id) || t.locked),
          );
        }
        if (selShapes.length) {
          set("shapes", (_, prevS) =>
            getShapeLayers(prevS).filter((sh) => !selShapes.includes(sh.id) || sh.locked),
          );
        }

        onSelectionChangeRef.current?.([]);
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

      const selImages = currentSelected.filter((sel) => sel.kind === "image").map((sel) => sel.id);
      if (selImages.length) {
        set("images", (_, prevS) => {
          let next = getImageLayers(prevS);
          for (const id of selImages) {
            next = next.map((img) => (img.id === id && !img.locked ? { ...img, x: img.x + dx, y: img.y + dy } : img));
          }
          return next;
        });
      }
      const selTexts = currentSelected.filter((sel) => sel.kind === "text").map((sel) => sel.id);
      if (selTexts.length) {
        set("texts", (_, prevS) => {
          let next = getTextLayers(prevS);
          for (const id of selTexts) {
            next = next.map((t) => (t.id === id && !t.locked ? { ...t, x: t.x + dx, y: t.y + dy } : t));
          }
          return next;
        });
      }
      const selShapes = currentSelected.filter((sel) => sel.kind === "shape").map((sel) => sel.id);
      if (selShapes.length) {
        set("shapes", (_, prevS) => {
          let next = getShapeLayers(prevS);
          for (const id of selShapes) {
            next = next.map((sh) => (sh.id === id && !sh.locked ? { ...sh, x: sh.x + dx, y: sh.y + dy } : sh));
          }
          return next;
        });
      }

      // Show live distance gap / snap guides during keyboard nudge
      if (currentSelected.length === 1) {
        const only = currentSelected[0];
        if (only) {
          const allElements = getAllCanvasElements(currentS);
          const targetEl = allElements.find((el) => el.id === only.id);
          if (targetEl) {
            const nextRawX = targetEl.x + dx;
            const nextRawY = targetEl.y + dy;
            const otherElements = allElements.filter((el) => el.id !== only.id);
            const { guides: snapGuides } = calculateAlignmentSnap({
              currentId: only.id,
              rawX: nextRawX,
              rawY: nextRawY,
              width: targetEl.width,
              height: targetEl.height,
              s: currentS,
              otherElements,
              showMargins: showMarginsRef.current,
            });
            handleGuidesChangeRef.current(snapGuides);
          }
        }
      }

      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = setTimeout(() => {
        handleGuidesChangeRef.current({ vCenter: false, hCenter: false });
      }, 700);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = setTimeout(() => {
          handleGuidesChangeRef.current({ vCenter: false, hCenter: false });
        }, 500);
      }
    };

    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", handleKeyUp);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    };
  }, [interactive, set]);

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
        onPointerDown={(e) => {
          lastBgPointerDownPosRef.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          if (suppressDragRef?.current) return;
          if (!interactive || e.target !== e.currentTarget) return;

          // If the pointer was dragged (e.g. marquee selection or canvas pan), do NOT select background
          const dragDist = Math.hypot(
            e.clientX - lastBgPointerDownPosRef.current.x,
            e.clientY - lastBgPointerDownPosRef.current.y,
          );
          if (dragDist > 5) return;

          if (effectiveIsMobile) {
            const now = Date.now();
            const timeSinceLast = now - lastBgTapTimeRef.current;
            const dx = Math.abs(e.clientX - lastBgTapPosRef.current.x);
            const dy = Math.abs(e.clientY - lastBgTapPosRef.current.y);

            // Double click / double tap on mobile triggers background selection
            if (timeSinceLast < 400 && dx < 30 && dy < 30) {
              lastBgTapTimeRef.current = 0;
              onSelectBackground?.();
            } else {
              // Single tap on mobile deselects active layers without selecting background
              lastBgTapTimeRef.current = now;
              lastBgTapPosRef.current = { x: e.clientX, y: e.clientY };
              if (onDeselectAll) {
                onDeselectAll();
              } else if (onSelectionChange) {
                onSelectionChange([]);
              }
            }
          } else {
            // Desktop: single click on background selects background as normal
            onSelectBackground?.();
          }
        }}
        onDoubleClick={(e) => {
          if (suppressDragRef?.current) return;
          if (interactive && e.target === e.currentTarget) {
            onSelectBackground?.();
          }
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
        {unifiedLayers.map((layerRef, i) => {
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
                showMargins={showMargins}
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
                showMargins={showMargins}
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
                showMargins={showMargins}
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
        <div className="pointer-events-none absolute inset-0 z-[100]">
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
              {/* Floats outside the canvas's own left edge (right: calc
                  (100% + 8px) — 100% of this parent strip's own 3px width,
                  plus an 8px gap — so it hugs the edge regardless of the
                  pill's own rendered width) instead of overlapping canvas
                  content, and no longer collides with the Top/Bottom Edge
                  labels the way it used to when both landed inside the
                  same corner at once. */}
              <span
                style={{
                  position: "absolute",
                  top: 24,
                  right: "calc(100% + 8px)",
                  transform: `scale(${multiSelectInvScale})`,
                  transformOrigin: "right center",
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
              {/* See Left Edge's own comment above — same "float outside via
                  calc(100% + 8px)" trick, mirrored. */}
              <span
                style={{
                  position: "absolute",
                  top: 24,
                  left: "calc(100% + 8px)",
                  transform: `scale(${multiSelectInvScale})`,
                  transformOrigin: "left center",
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
              {/* See Left Edge's own comment above — same "float outside via
                  calc(100% + 8px)" trick, on the vertical axis (this
                  strip's own height is 3px, so bottom: calc(100% + 8px)
                  puts the label 8px above the canvas). */}
              <span
                style={{
                  position: "absolute",
                  left: 24,
                  bottom: "calc(100% + 8px)",
                  transform: `scale(${multiSelectInvScale})`,
                  transformOrigin: "left bottom",
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
              {/* See Left Edge's own comment above — same "float outside via
                  calc(100% + 8px)" trick, mirrored on the vertical axis. */}
              <span
                style={{
                  position: "absolute",
                  left: 24,
                  top: "calc(100% + 8px)",
                  transform: `scale(${multiSelectInvScale})`,
                  transformOrigin: "left top",
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
                  transform: `translateX(-50%) scale(${multiSelectInvScale})`,
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
              {/* transformOrigin "left center" (not the scale() default of
                  the element's own center) — at low zoom, multiSelectInvScale
                  grows past 1, and scaling from the default center origin
                  expanded this pill symmetrically outward, pushing its left
                  half past the canvas's own left edge (x=14 minus half the
                  scaled-up width could go negative) and getting visually
                  cut off. Anchoring the origin to the pill's own left edge
                  instead makes it grow rightward, into the canvas, so it
                  never crosses back out past x=0. */}
              <span
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: `translateY(-50%) scale(${multiSelectInvScale})`,
                  transformOrigin: "left center",
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

          {/* Element-to-Element Dotted Alignment Lines, plus the solid
              "distance to nearest neighbor" spacing lines (distancePx set —
              see calculateAlignmentSnap's own comment on where these come
              from), each with a pill badge showing the gap in px centered
              on the line. */}
          {guides.lines?.map((line, idx) => {
            const isSpacing = line.distancePx !== undefined;
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
                    borderLeft: isSpacing ? "1.5px solid #ec4899" : "2px dotted #ec4899",
                    filter: "drop-shadow(0 0 3px rgba(236,72,153,0.9))",
                  }}
                >
                  {isSpacing ? (
                    <>
                      {/* Top & Bottom T-bar caps */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: "-3px",
                          width: "7px",
                          height: "1.5px",
                          background: "#ec4899",
                          transform: "translateY(-50%)",
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: "-3px",
                          width: "7px",
                          height: "1.5px",
                          background: "#ec4899",
                          transform: "translateY(50%)",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: `translate(-50%, -50%) scale(${multiSelectInvScale})`,
                          background: "#ec4899",
                          color: "#ffffff",
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {line.distancePx}
                      </span>
                    </>
                  ) : null}
                </div>
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
                  borderTop: isSpacing ? "1.5px solid #ec4899" : "2px dotted #ec4899",
                  filter: "drop-shadow(0 0 3px rgba(236,72,153,0.9))",
                }}
              >
                {isSpacing ? (
                  <>
                    {/* Left & Right T-bar caps */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "-3px",
                        height: "7px",
                        width: "1.5px",
                        background: "#ec4899",
                        transform: "translateX(-50%)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "-3px",
                        height: "7px",
                        width: "1.5px",
                        background: "#ec4899",
                        transform: "translateX(50%)",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: `translate(-50%, -50%) scale(${multiSelectInvScale})`,
                        background: "#ec4899",
                        color: "#ffffff",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {line.distancePx}
                    </span>
                  </>
                ) : null}
              </div>
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
            // Hide entire bounding box + all children (handles, info bar,
            // rotate button) the instant a group drag starts — reappears
            // cleanly when the drag ends without any visual pop-in flicker.
            visibility: isGroupDragging ? "hidden" : "visible",
          }}
        >
          {/* 8 Transform Handles: 4 round corner circles + 4 edge pills — perfectly aligned with single item handles */}
          {HANDLE_POSITIONS.map((h) => (
            <div
              key={h.id}
              data-nopan=""
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const items: {
                  kind: "text" | "image" | "shape";
                  id: string;
                  x: number;
                  y: number;
                  size: number;
                  width?: number | undefined;
                  height?: number | undefined;
                  strokeWidth?: number | undefined;
                }[] = [];
                selected.forEach((sel) => {
                  if (sel.kind === "text") {
                    const t = getTextLayers(sRef.current).find((item) => item.id === sel.id);
                    if (t) items.push({ kind: "text", id: t.id, x: t.x, y: t.y, size: t.size, width: t.width, height: t.minHeight });
                  } else if (sel.kind === "image") {
                    const img = getImageLayers(sRef.current).find((item) => item.id === sel.id);
                    if (img) items.push({ kind: "image", id: img.id, x: img.x, y: img.y, size: img.size, width: img.size, height: img.height });
                  } else if (sel.kind === "shape") {
                    const sh = getShapeLayers(sRef.current).find((item) => item.id === sel.id);
                    if (sh) items.push({ kind: "shape", id: sh.id, x: sh.x, y: sh.y, size: sh.size, width: sh.size, height: sh.height, strokeWidth: sh.strokeWidth });
                  }
                });
                multiResizeRef.current = {
                  handle: h.id,
                  startMouseX: e.clientX,
                  startMouseY: e.clientY,
                  startBounds: { ...selectedBounds },
                  initialItems: items,
                };
              }}
              onPointerMove={(e) => {
                const r = multiResizeRef.current;
                if (!r || r.handle !== h.id) return;
                e.stopPropagation();
                const rawDx = (e.clientX - r.startMouseX) / scale;
                const rawDy = (e.clientY - r.startMouseY) / scale;

                let newLeft = r.startBounds.left;
                let newTop = r.startBounds.top;
                let newWidth = r.startBounds.width;
                let newHeight = r.startBounds.height;

                if (h.kind === "corner") {
                  let scaleFactor = 1;
                  if (h.id === "se") {
                    scaleFactor = 1 + (rawDx / r.startBounds.width + rawDy / r.startBounds.height) / 2;
                    newWidth = Math.max(20, r.startBounds.width * scaleFactor);
                    newHeight = Math.max(20, r.startBounds.height * scaleFactor);
                    newLeft = r.startBounds.left;
                    newTop = r.startBounds.top;
                  } else if (h.id === "nw") {
                    scaleFactor = 1 + (-rawDx / r.startBounds.width - rawDy / r.startBounds.height) / 2;
                    newWidth = Math.max(20, r.startBounds.width * scaleFactor);
                    newHeight = Math.max(20, r.startBounds.height * scaleFactor);
                    newLeft = r.startBounds.left + (r.startBounds.width - newWidth);
                    newTop = r.startBounds.top + (r.startBounds.height - newHeight);
                  } else if (h.id === "ne") {
                    scaleFactor = 1 + (rawDx / r.startBounds.width - rawDy / r.startBounds.height) / 2;
                    newWidth = Math.max(20, r.startBounds.width * scaleFactor);
                    newHeight = Math.max(20, r.startBounds.height * scaleFactor);
                    newLeft = r.startBounds.left;
                    newTop = r.startBounds.top + (r.startBounds.height - newHeight);
                  } else if (h.id === "sw") {
                    scaleFactor = 1 + (-rawDx / r.startBounds.width + rawDy / r.startBounds.height) / 2;
                    newWidth = Math.max(20, r.startBounds.width * scaleFactor);
                    newHeight = Math.max(20, r.startBounds.height * scaleFactor);
                    newLeft = r.startBounds.left + (r.startBounds.width - newWidth);
                    newTop = r.startBounds.top;
                  }
                } else {
                  if (h.id === "e") {
                    newWidth = Math.max(20, r.startBounds.width + rawDx);
                  } else if (h.id === "w") {
                    newWidth = Math.max(20, r.startBounds.width - rawDx);
                    newLeft = r.startBounds.left + (r.startBounds.width - newWidth);
                  } else if (h.id === "s") {
                    newHeight = Math.max(20, r.startBounds.height + rawDy);
                  } else if (h.id === "n") {
                    newHeight = Math.max(20, r.startBounds.height - rawDy);
                    newTop = r.startBounds.top + (r.startBounds.height - newHeight);
                  }
                }

                if (!set) return;
                const nextBounds = { left: newLeft, top: newTop, width: newWidth, height: newHeight };
                const res = withMultipleLayersScaled(sRef.current, selected, r.initialItems, r.startBounds, nextBounds);
                set("texts", res.texts, { continuousKey: "multi-resize" });
                set("images", res.images, { continuousKey: "multi-resize" });
                set("shapes", res.shapes, { continuousKey: "multi-resize" });
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                try {
                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                } catch { }
                multiResizeRef.current = null;
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                multiResizeRef.current = null;
              }}
              style={{ ...getHandleStyle(h, scale), pointerEvents: "auto" }}
              title="Drag to resize multi-selection"
              className="group"
            >
              <div
                className="pointer-events-none rounded-full bg-white transition-all duration-150 group-hover:scale-125 group-hover:bg-[#0021FF] group-active:scale-135 group-active:bg-[#0021FF] group-active:ring-4 group-active:ring-[#0021FF]/40"
                style={getHandleVisualStyle(h, scale)}
              />
            </div>
          ))}

          {/* Full-area transparent drag overlay — lets the user start a group
              move from anywhere inside the selection bounding box, not just
              from individual layer elements. Sits below (z-index wise) the 8
              resize handles so it doesn't steal their pointer events, but
              above the canvas layers so it catches any pointer-down that
              isn't on a handle. Hidden with the rest of the box during drag. */}
          <div
            data-nopan=""
            style={{
              position: "absolute",
              inset: 0,
              cursor: "move",
              pointerEvents: "auto",
              zIndex: 0,
            }}
            onPointerDown={(e) => {
              // Only respond to primary pointer (left mouse / first touch).
              if (e.button !== 0 && e.pointerType === "mouse") return;
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              beginGroupDrag(e.clientX, e.clientY, e.altKey);
            }}
            onPointerMove={(e) => {
              if (!groupDragRef.current) return;
              e.stopPropagation();
              updateGroupDrag(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              } catch {}
              endGroupDrag();
            }}
            onPointerCancel={(e) => {
              e.stopPropagation();
              endGroupDrag();
            }}
          />

          {/* Group Info Badge & Interactive Multi-Delete Toolbar — hidden during rotation or drag */}
          {multiRotateAngle === null && !isGroupDragging ? (
            <div
              data-nopan=""
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: "50%",
                top: -18 * multiSelectInvScale,
                transformOrigin: "bottom center",
                transform: `translateX(-50%) translateY(-100%) scale(${multiSelectInvScale})`,
                zIndex: 80,
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
                  const result = withMixedLayersSpacedEvenly(s, selected, "tidy");
                  set("texts", result.texts);
                  set("images", result.images);
                  set("shapes", result.shapes);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: "#a78bfa",
                  background: "rgba(167, 139, 250, 0.15)",
                  border: "none",
                  borderRadius: 12,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  transition: "all 0.15s ease",
                }}
                title="Tidy up & space all selected layers evenly"
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="5" x2="6" y2="19" />
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="18" y1="5" x2="18" y2="19" />
                </svg>
                Space evenly
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!set) return;
                  const result = withMultipleLayersRotated(s, selected, 90, "group");
                  set("texts", result.texts);
                  set("images", result.images);
                  set("shapes", result.shapes);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: "#34d399",
                  background: "rgba(52, 211, 153, 0.15)",
                  border: "none",
                  borderRadius: 12,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  transition: "all 0.15s ease",
                }}
                title="Rotate selected layers 90°"
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
                </svg>
                Rotate 90°
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!set) return;
                  const result = withMultipleLayersDuplicated(s, selected, { x: 3, y: 3 });
                  set("texts", result.texts);
                  set("images", result.images);
                  set("shapes", result.shapes);
                  set("layerOrder", result.layerOrder);
                  onSelectionChange?.(result.newSelection.map((item) => ({ kind: item.kind, id: item.id })));
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: "#38bdf8",
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "none",
                  borderRadius: 12,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 12,
                  transition: "all 0.15s ease",
                }}
                title="Duplicate all selected layers"
              >
                <Copy01Icon size={14} />
                Duplicate
              </button>
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
                  transition: "all 0.15s ease",
                }}
                title="Delete all selected layers"
              >
                <Delete02Icon size={14} />
                Delete All
              </button>
            </div>
          ) : null}

          {/* Group Rotate Handle docked below multi-selection bounding box — hidden while actively rotating or dragging */}
          <div
            data-nopan=""
            style={{
              position: "absolute",
              left: "50%",
              top: "calc(100% + 22px)",
              transformOrigin: "center top",
              transform: `translateX(-50%) scale(${multiSelectInvScale})`,
              visibility: (multiRotateAngle !== null || isGroupDragging) ? "hidden" : "visible",
              pointerEvents: (multiRotateAngle !== null || isGroupDragging) ? "none" : "auto",
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const startClientX = e.clientX;
                const startClientY = e.clientY;
                const rect = (e.currentTarget.parentElement?.parentElement as HTMLElement)?.getBoundingClientRect();
                if (!rect) return;
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const startPointerAngle = Math.atan2(startClientY - centerY, startClientX - centerX) * (180 / Math.PI);
                const initialEditorState = { ...sRef.current };

                const handlePointerMove = (ev: PointerEvent) => {
                  ev.stopPropagation();
                  const currentAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * (180 / Math.PI);
                  let totalDelta = currentAngle - startPointerAngle;
                  while (totalDelta > 180) totalDelta -= 360;
                  while (totalDelta < -180) totalDelta += 360;

                  const SNAP_TARGETS = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
                  let displayAngle = Math.round(totalDelta);
                  for (const target of SNAP_TARGETS) {
                    if (Math.abs(displayAngle - target) < 4) {
                      displayAngle = target;
                      totalDelta = target;
                      break;
                    }
                  }

                  setMultiRotateAngle(displayAngle);
                  if (!set) return;
                  const res = withMultipleLayersRotated(initialEditorState, selected, Math.round(totalDelta), "group");
                  set("texts", res.texts);
                  set("images", res.images);
                  set("shapes", res.shapes);
                };

                const handlePointerUp = (ev: PointerEvent) => {
                  ev.stopPropagation();
                  try {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch { }
                  setMultiRotateAngle(null);
                  window.removeEventListener("pointermove", handlePointerMove);
                  window.removeEventListener("pointerup", handlePointerUp);
                  window.removeEventListener("pointercancel", handlePointerUp);
                };

                window.addEventListener("pointermove", handlePointerMove);
                window.addEventListener("pointerup", handlePointerUp);
                window.addEventListener("pointercancel", handlePointerUp);
              }}
              className="grid h-7 w-7 place-items-center rounded-full bg-white text-black shadow-[0_0_4px_1px_#39466024,0_0_0_1px_#2b354a4d] transition-colors hover:bg-[#15161c] hover:text-white active:scale-95"
              style={{ cursor: "grab" }}
              title="Drag to rotate entire selection"
            >
              <CursorCircleSelection02Icon size={16} />
            </button>
          </div>

          {/* Live Angle Badge shown while rotating entire multi-selection */}
          {multiRotateAngle !== null ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "100%",
                transform: "translateX(-50%)",
                marginTop: 100 * multiSelectInvScale,
                zIndex: 110,
                pointerEvents: "none",
              }}
            >
              <div
                style={{ transform: `scale(${multiSelectInvScale})` }}
                className="rounded-full bg-[#15161c]/95 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md whitespace-nowrap"
              >
                {multiRotateAngle}°
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Canva-Style Margin Guide Overlay — dashed and muted by default;
          the moment any edge of the dragged/nudged item touches the margin
          boundary (guides.marginLeft/Right/Top/Bottom, set by
          calculateAlignmentSnap's margin-boundary check), the whole box
          switches to one solid highlighted rectangle instead of just the
          touched side lighting up, matching how a Canva-style margin guide
          reads as a single unit rather than 4 independent lines. */}
      {showMargins && interactive
        ? (() => {
            const marginTouched = !!(
              guides.marginLeft ||
              guides.marginRight ||
              guides.marginTop ||
              guides.marginBottom
            );
            return (
              <div
                data-margin-guide="true"
                className="pointer-events-none absolute z-[50]"
                style={{
                  position: "absolute",
                  left: `${MARGIN_INSET_PCT}%`,
                  top: `${MARGIN_INSET_PCT}%`,
                  right: `${MARGIN_INSET_PCT}%`,
                  bottom: `${MARGIN_INSET_PCT}%`,
                  border: marginTouched
                    ? "2px solid #ec4899"
                    : "1px dashed rgba(120, 130, 150, 0.75)",
                  boxSizing: "border-box",
                  borderRadius: Math.max(0, (s.canvasRadius ?? 0) * 0.8),
                  transition: "border-color 120ms ease",
                }}
              />
            );
          })()
        : null}
    </div>
  );
});

export type AlignmentGuideLine = {
  orientation: "vertical" | "horizontal";
  posPct: number;
  startPct: number;
  endPct: number;
  style?: "dotted" | "solid";
  // Set only for a "distance to nearest neighbor" spacing measurement
  // (Figma-style pill badge showing the gap in px) — plain alignment lines
  // above leave this unset. When set, the renderer draws a solid line
  // (instead of dotted) with a pill badge at its midpoint instead of
  // rendering it bare.
  distancePx?: number;
};

export type GuidesState = {
  vCenter?: boolean;
  hCenter?: boolean;
  edgeLeft?: boolean;
  edgeRight?: boolean;
  edgeTop?: boolean;
  edgeBottom?: boolean;
  // Set when a layer's edge snaps flush with the margin guide (the dashed
  // safe-area box, MARGIN_INSET_PCT in from each canvas edge) rather than
  // the canvas's own outer edge — same idea as edgeLeft/etc. above, one
  // guide line inward.
  marginLeft?: boolean;
  marginRight?: boolean;
  marginTop?: boolean;
  marginBottom?: boolean;
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
  getTextLayers(s)
    .filter((t) => !t.hidden && t.text && t.text.trim().length > 0)
    .forEach((t) => {
      let rawW = t.width ?? 400;
      let rawH = t.minHeight ?? t.size * 1.3;
      const el = document.querySelector(`[data-layer-id="${t.id}"]`) as HTMLElement | null;
      if (el) {
        rawW = el.offsetWidth || rawW;
        rawH = el.offsetHeight || rawH;
      }
      const rot = t.rotation ?? 0;
      const rad = (rot * Math.PI) / 180;
      const w = rot === 0 ? rawW : rawW * Math.abs(Math.cos(rad)) + rawH * Math.abs(Math.sin(rad));
      const h = rot === 0 ? rawH : rawW * Math.abs(Math.sin(rad)) + rawH * Math.abs(Math.cos(rad));
      elements.push({
        id: t.id,
        x: t.x,
        y: t.y,
        width: w,
        height: h,
      });
    });
  getShapeLayers(s)
    .filter((sh) => !sh.hidden && (sh.size > 0 || (sh.height ?? 0) > 0))
    .forEach((sh) => {
      const isLn = isLineShape(sh.kind);
      const rot = sh.rotation ?? 0;
      const rad = (rot * Math.PI) / 180;
      const effH = typeof sh.height === "number" ? sh.height : (isLn ? 24 : sh.size);
      let rawW = sh.size;
      let rawH = effH;
      const el = document.querySelector(`[data-layer-id="${sh.id}"]`) as HTMLElement | null;
      if (el && !isLn) {
        rawW = el.offsetWidth || rawW;
        rawH = el.offsetHeight || rawH;
      }
      const w = rot === 0 ? rawW : rawW * Math.abs(Math.cos(rad)) + rawH * Math.abs(Math.sin(rad));
      const h = rot === 0 ? rawH : rawW * Math.abs(Math.sin(rad)) + rawH * Math.abs(Math.cos(rad));
      elements.push({
        id: sh.id,
        x: sh.x,
        y: sh.y,
        width: w,
        height: h,
      });
    });
  getImageLayers(s)
    .filter((img) => !img.hidden && (img.size > 0 || (img.height ?? 0) > 0))
    .forEach((img) => {
      let rawW = img.size;
      let rawH = img.height ?? img.size;
      const el = document.querySelector(`[data-layer-id="${img.id}"]`) as HTMLElement | null;
      if (el) {
        rawW = el.offsetWidth || rawW;
        rawH = el.offsetHeight || rawH;
      }
      const rot = img.rotation ?? 0;
      const rad = (rot * Math.PI) / 180;
      const w = rot === 0 ? rawW : rawW * Math.abs(Math.cos(rad)) + rawH * Math.abs(Math.sin(rad));
      const h = rot === 0 ? rawH : rawW * Math.abs(Math.sin(rad)) + rawH * Math.abs(Math.cos(rad));
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
  showMargins,
}: {
  currentId: string;
  rawX: number;
  rawY: number;
  width: number;
  height: number;
  s: EditorState;
  otherElements?: ElementBounds[];
  // Whether the margin guide overlay is currently visible — margin-boundary
  // snapping (below) only participates when it is, since snapping to a
  // line the user can't see would just be confusing.
  showMargins?: boolean;
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
  let showMarginLeft = false;
  let showMarginRight = false;
  let showMarginTop = false;
  let showMarginBottom = false;
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

  // 2b. Margin Guide Boundary Snapping — same idea as the outer-edge snap
  // just above, but at the inset boundary the margin overlay actually
  // draws (MARGIN_INSET_PCT in from each side) rather than the canvas's
  // own edge, so an element's edge can snap flush with that guide too.
  if (showMargins) {
    const marginInsetX = (MARGIN_INSET_PCT / 100) * canvasW;
    const marginInsetY = (MARGIN_INSET_PCT / 100) * canvasH;

    if (Math.abs(currCenterX - halfW - marginInsetX) <= snapPx) {
      currCenterX = marginInsetX + halfW;
      showMarginLeft = true;
    }
    if (Math.abs(currCenterX + halfW - (canvasW - marginInsetX)) <= snapPx) {
      currCenterX = canvasW - marginInsetX - halfW;
      showMarginRight = true;
    }
    if (Math.abs(currCenterY - halfH - marginInsetY) <= snapPx) {
      currCenterY = marginInsetY + halfH;
      showMarginTop = true;
    }
    if (Math.abs(currCenterY + halfH - (canvasH - marginInsetY)) <= snapPx) {
      currCenterY = canvasH - marginInsetY - halfH;
      showMarginBottom = true;
    }
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

  // 4. Chained spacing measurement — Figma/Canva-style "distance to nearest
  // object" badges, independent of whether anything snapped above. For
  // each of the 4 directions, walks the whole chain of other elements out
  // from the dragged element's edge: dragged→1st neighbor, then 1st→2nd
  // neighbor, then 2nd→3rd, and so on — each consecutive LINK gets its own
  // independent badge (not a single badge spanning past the near ones to
  // the far one). So dragging the left box of three in a row shows both
  // left→middle AND middle→right, even though that second gap never
  // touches the dragged box at all. Only elements that overlap the dragged
  // element along the PERPENDICULAR axis qualify (so the gap is spatially
  // meaningful — two elements diagonally apart with no shared row/column
  // wouldn't read as "spaced" from each other), and positions are the
  // FINAL settled ones (after all snapping above) so the measurement always
  // reflects where the element actually ends up. Pushed into the same
  // `lines` array the plain alignment lines use — distancePx is what tells
  // the renderer to draw one of these as a solid measurement line with a
  // pill badge instead.
  if (otherElements && otherElements.length > 0) {
    const finalLeft = currCenterX - halfW;
    const finalRight = currCenterX + halfW;
    const finalTop = currCenterY - halfH;
    const finalBottom = currCenterY + halfH;

    type Rect = { left: number; right: number; top: number; bottom: number };
    const otherRects: Rect[] = otherElements
      .filter((other) => other.id !== currentId)
      .map((other) => {
        const cx = (other.x / 100) * canvasW;
        const cy = (other.y / 100) * canvasH;
        const hw = other.width / 2;
        const hh = other.height / 2;
        return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
      });

    const makeHorizontalDistanceLine = (edgeA: number, edgeB: number, dist: number, perpStart: number, perpEnd: number): AlignmentGuideLine => ({
      orientation: "horizontal",
      posPct: (((perpStart + perpEnd) / 2) / canvasH) * 100,
      startPct: (edgeA / canvasW) * 100,
      endPct: (edgeB / canvasW) * 100,
      distancePx: Math.round(dist),
    });
    const makeVerticalDistanceLine = (edgeA: number, edgeB: number, dist: number, perpStart: number, perpEnd: number): AlignmentGuideLine => ({
      orientation: "vertical",
      posPct: (((perpStart + perpEnd) / 2) / canvasW) * 100,
      startPct: (edgeA / canvasH) * 100,
      endPct: (edgeB / canvasH) * 100,
      distancePx: Math.round(dist),
    });

    // 1. Nearest Right neighbor
    const nearestRight = otherRects
      .filter((r) => r.left >= finalRight && r.top < finalBottom && r.bottom > finalTop)
      .sort((a, b) => a.left - b.left)[0];
    if (nearestRight) {
      const dist = nearestRight.left - finalRight;
      if (dist >= 1) {
        const perpStart = Math.max(finalTop, nearestRight.top);
        const perpEnd = Math.min(finalBottom, nearestRight.bottom);
        lines.push(makeHorizontalDistanceLine(finalRight, nearestRight.left, dist, perpStart, perpEnd));
      }
    }

    // 2. Nearest Left neighbor
    const nearestLeft = otherRects
      .filter((r) => r.right <= finalLeft && r.top < finalBottom && r.bottom > finalTop)
      .sort((a, b) => b.right - a.right)[0];
    if (nearestLeft) {
      const dist = finalLeft - nearestLeft.right;
      if (dist >= 1) {
        const perpStart = Math.max(finalTop, nearestLeft.top);
        const perpEnd = Math.min(finalBottom, nearestLeft.bottom);
        lines.push(makeHorizontalDistanceLine(nearestLeft.right, finalLeft, dist, perpStart, perpEnd));
      }
    }

    // 3. Nearest Bottom neighbor (below)
    const nearestBottom = otherRects
      .filter((r) => r.top >= finalBottom && r.left < finalRight && r.right > finalLeft)
      .sort((a, b) => a.top - b.top)[0];
    if (nearestBottom) {
      const dist = nearestBottom.top - finalBottom;
      if (dist >= 1) {
        const perpStart = Math.max(finalLeft, nearestBottom.left);
        const perpEnd = Math.min(finalRight, nearestBottom.right);
        lines.push(makeVerticalDistanceLine(finalBottom, nearestBottom.top, dist, perpStart, perpEnd));
      }
    }

    // 4. Nearest Top neighbor (above)
    const nearestTop = otherRects
      .filter((r) => r.bottom <= finalTop && r.left < finalRight && r.right > finalLeft)
      .sort((a, b) => b.bottom - a.bottom)[0];
    if (nearestTop) {
      const dist = finalTop - nearestTop.bottom;
      if (dist >= 1) {
        const perpStart = Math.max(finalLeft, nearestTop.left);
        const perpEnd = Math.min(finalRight, nearestTop.right);
        lines.push(makeVerticalDistanceLine(nearestTop.bottom, finalTop, dist, perpStart, perpEnd));
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
      marginLeft: showMarginLeft,
      marginRight: showMarginRight,
      marginTop: showMarginTop,
      marginBottom: showMarginBottom,
      xPct: 50,
      yPct: 50,
      lines,
    },
  };
}

function calculateLineSnapGuides({
  xPct,
  yPct,
  length,
  angleDeg,
  strokeHeight,
  canvasW,
  canvasH,
}: {
  xPct: number;
  yPct: number;
  length: number;
  angleDeg: number;
  strokeHeight: number;
  canvasW: number;
  canvasH: number;
}): GuidesState {
  const rad = (angleDeg * Math.PI) / 180;
  const halfLen = length / 2;
  const cX = (xPct / 100) * canvasW;
  const cY = (yPct / 100) * canvasH;

  const halfW = halfLen * Math.abs(Math.cos(rad)) + (strokeHeight / 2) * Math.abs(Math.sin(rad));
  const halfH = halfLen * Math.abs(Math.sin(rad)) + (strokeHeight / 2) * Math.abs(Math.cos(rad));
  const snapPx = 8;

  let edgeLeft = false;
  let edgeRight = false;
  let edgeTop = false;
  let edgeBottom = false;
  let vCenter = false;
  let hCenter = false;
  const lines: AlignmentGuideLine[] = [];

  // Canvas Outer Edges:
  if (Math.abs(cX - halfW) <= snapPx || Math.abs(cX - halfLen * Math.abs(Math.cos(rad))) <= snapPx) {
    edgeLeft = true;
  }
  if (Math.abs(cX + halfW - canvasW) <= snapPx || Math.abs(cX + halfLen * Math.abs(Math.cos(rad)) - canvasW) <= snapPx) {
    edgeRight = true;
  }
  if (Math.abs(cY - halfH) <= snapPx || Math.abs(cY - halfLen * Math.abs(Math.sin(rad))) <= snapPx) {
    edgeTop = true;
  }
  if (Math.abs(cY + halfH - canvasH) <= snapPx || Math.abs(cY + halfLen * Math.abs(Math.sin(rad)) - canvasH) <= snapPx) {
    edgeBottom = true;
  }

  // Canvas Center Guides:
  if (Math.abs(cX - canvasW / 2) <= snapPx || Math.abs(xPct - 50) < 1.2) {
    vCenter = true;
    lines.push({ orientation: "vertical", posPct: 50, startPct: 0, endPct: 100, style: "dotted" });
  }
  if (Math.abs(cY - canvasH / 2) <= snapPx || Math.abs(yPct - 50) < 1.2) {
    hCenter = true;
    lines.push({ orientation: "horizontal", posPct: 50, startPct: 0, endPct: 100, style: "dotted" });
  }

  // Horizontal / Vertical angle alignment lines:
  const normAngle = ((Math.round(angleDeg) % 360) + 360) % 360;
  if (normAngle === 0 || normAngle === 180) {
    hCenter = true;
    lines.push({ orientation: "horizontal", posPct: yPct, startPct: 0, endPct: 100, style: "dotted" });
  } else if (normAngle === 90 || normAngle === 270) {
    vCenter = true;
    lines.push({ orientation: "vertical", posPct: xPct, startPct: 0, endPct: 100, style: "dotted" });
  }

  return {
    vCenter,
    hCenter,
    edgeLeft,
    edgeRight,
    edgeTop,
    edgeBottom,
    lines,
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
  extraOffset = 0,
  inline = false,
}: {
  locked: boolean;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  scale?: number | undefined;
  placement?: "top" | "bottom" | undefined;
  extraOffset?: number | undefined;
  inline?: boolean | undefined;
}) {
  const invScale = scale > 0 ? 1 / scale : 1;
  const btn =
    "flex h-6 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white active:scale-95";
  return (
    <div
      data-nopan=""
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={
        inline
          ? {
              transform: `scale(${invScale})`,
              zIndex: 80,
              touchAction: "manipulation",
            }
          : {
              position: "absolute",
              top: placement === "top" ? -(16 + extraOffset) * invScale : undefined,
              bottom: placement === "bottom" ? -(16 + extraOffset) * invScale : undefined,
              left: "50%",
              transformOrigin: placement === "top" ? "bottom center" : "top center",
              transform: `translateX(-50%) translateY(${placement === "top" ? "-100%" : "100%"}) scale(${invScale})`,
              zIndex: 80,
              touchAction: "manipulation",
            }
      }
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
            className="flex h-6 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-red-500/20 hover:text-red-400 active:scale-95"
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
  onGuides,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  scale = 1,
  orientation = "horizontal",
  docked = true,
  isMoving = false,
  onRotatingChange,
  elementRotation = 0,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRotate: (deg: number) => void;
  onGuides?: (g: GuidesState) => void;
  onMovePointerDown: ((e: React.PointerEvent) => void) | undefined;
  onMovePointerMove: ((e: React.PointerEvent) => void) | undefined;
  onMovePointerUp: ((e: React.PointerEvent) => void) | undefined;
  scale?: number | undefined;
  orientation?: "horizontal" | "vertical" | undefined;
  docked?: boolean;
  isMoving?: boolean;
  onRotatingChange?: (isRotating: boolean) => void;
  /** The element's own rotation in degrees — used when docked=true to push
   *  the handle row below the full axis-aligned bounding box bottom instead
   *  of just the raw (unrotated) CSS height, so it never overlaps a
   *  vertically-rotated element whose visual extent exceeds its DOM height. */
  elementRotation?: number;
}) {
  const rotatingRef = useRef(false);
  const invScale = scale > 0 ? 1 / scale : 1;

  // When docked, compute how much extra vertical offset is needed so the row
  // clears the element's full axis-aligned bounding box rather than its raw
  // CSS height. For a rotation of R degrees with unrotated W×H:
  //   axisAlignedH = W|sin R| + H|cos R|
  // The container's CSS height is H (the unrotated height). The difference
  // (axisAlignedH − H)/2 is the extra half-span that sticks out beyond each
  // edge after rotating, so we add that as a marginTop offset.
  const rotationExtraOffset = (() => {
    if (!docked || elementRotation === 0) return 0;
    const el = containerRef.current;
    if (!el) return 0;
    const rawW = el.offsetWidth;
    const rawH = el.offsetHeight;
    const rad = (elementRotation * Math.PI) / 180;
    const axisAlignedH = rawW * Math.abs(Math.sin(rad)) + rawH * Math.abs(Math.cos(rad));
    return Math.max(0, (axisAlignedH - rawH) / 2);
  })();
  const [liveAngle, setLiveAngle] = useState<number | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  const handleRotatePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rotatingRef.current = true;
    setIsRotating(true);
    onRotatingChange?.(true);
  };

  const handleRotatePointerMove = (e: React.PointerEvent) => {
    if (!rotatingRef.current || !containerRef.current) return;
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - 90;
    angle = ((angle + 180) % 360 + 360) % 360 - 180;
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

    if (rounded === 0 || rounded === 180 || rounded === -180) {
      onGuides?.({ hCenter: true, lines: [{ orientation: "horizontal", posPct: 50, startPct: 0, endPct: 100, style: "dotted" }] });
    } else if (rounded === 90 || rounded === -90) {
      onGuides?.({ vCenter: true, lines: [{ orientation: "vertical", posPct: 50, startPct: 0, endPct: 100, style: "dotted" }] });
    } else {
      onGuides?.({ vCenter: false, hCenter: false, lines: [] });
    }
  };

  const handleRotatePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
    rotatingRef.current = false;
    setLiveAngle(null);
    setIsRotating(false);
    onRotatingChange?.(false);
    onGuides?.({ vCenter: false, hCenter: false, lines: [] });
  };

  const btn =
    "grid h-7 w-7 place-items-center rounded-full bg-white text-black shadow-[0_0_4px_1px_#39466024,0_0_0_1px_#2b354a4d] transition-colors hover:bg-[#15161c] hover:text-white active:scale-95";

  return (
    <>
      <div
        data-nopan=""
        style={
          docked
            ? {
                position: "absolute",
                left: "50%",
                top: "calc(100% + 22px)",
                marginTop: rotationExtraOffset,
                transform: `translateX(-50%) scale(${invScale})`,
                transformOrigin: "center top",
                zIndex: 80,
                display: "flex",
                flexDirection: orientation === "vertical" ? "column" : "row",
                alignItems: "center",
                gap: 8,
                touchAction: "none",
                visibility: isMoving || isRotating ? "hidden" : "visible",
                pointerEvents: "auto",
              }
            : {
                transform: `scale(${invScale})`,
                transformOrigin: "center center",
                zIndex: 80,
                display: "flex",
                flexDirection: orientation === "vertical" ? "column" : "row",
                alignItems: "center",
                gap: 8,
                touchAction: "none",
                visibility: isMoving || isRotating ? "hidden" : "visible",
                pointerEvents: "auto",
              }
        }
      >
        {orientation === "vertical" ? (
          <>
            {/* Move Button on Top */}
            <button
              type="button"
              title="Drag to move"
              onPointerDown={onMovePointerDown}
              onPointerMove={onMovePointerMove}
              onPointerUp={onMovePointerUp}
              onPointerCancel={onMovePointerUp}
              className={btn}
              style={{ cursor: "move" }}
            >
              <MoveIcon size={18} className="text-[#454545]" />
            </button>
            {/* Rotate Button on Bottom */}
            <button
              type="button"
              title="Drag to rotate"
              onPointerDown={handleRotatePointerDown}
              onPointerMove={handleRotatePointerMove}
              onPointerUp={handleRotatePointerUp}
              onPointerCancel={handleRotatePointerUp}
              className={btn}
              style={{ cursor: "default" }}
            >
              <RotateRefreshIcon size={18} className="text-[#454545]" />
            </button>
          </>
        ) : (
          <>
            {/* Rotate Button on Left */}
            <button
              type="button"
              title="Drag to rotate"
              onPointerDown={handleRotatePointerDown}
              onPointerMove={handleRotatePointerMove}
              onPointerUp={handleRotatePointerUp}
              onPointerCancel={handleRotatePointerUp}
              className={btn}
              style={{ cursor: "default" }}
            >
              <RotateRefreshIcon size={18} className="text-[#454545]" />
            </button>
            {/* Move Button on Right */}
            <button
              type="button"
              title="Drag to move"
              onPointerDown={onMovePointerDown}
              onPointerMove={onMovePointerMove}
              onPointerUp={onMovePointerUp}
              onPointerCancel={onMovePointerUp}
              className={btn}
              style={{ cursor: "move" }}
            >
              <MoveIcon size={18} className="text-[#454545]" />
            </button>
          </>
        )}
      </div>

      {liveAngle !== null ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "100%",
            transform: "translateX(-50%)",
            // Push the badge below: the standard 100px gap (invScale-adjusted)
            // PLUS the extra half-span that a rotated element sticks out beyond
            // its CSS box bottom, so it always clears the full visual extent of
            // the text/image/shape regardless of how much it has been rotated.
            marginTop: 100 * invScale + rotationExtraOffset,
            zIndex: 90,
            pointerEvents: "none",
          }}
        >
          <div
            style={{ transform: `scale(${invScale})` }}
            className="rounded-full bg-[#15161c]/95 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md whitespace-nowrap"
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


// A layer's own rendered output only depends on `scale` when it's actually
// SELECTED — that's the only time it draws resize handles, the rotate/move
// row, and the toolbar, all of which size themselves from `scale` (see
// getHandleStyle/invScale above). A non-selected layer's content is
// positioned purely in canvas-space (percentages/pixels of the unscaled
// design), untouched by the canvas's own outer `transform: scale(zoom)` —
// so it has nothing to redraw when only `scale` changes. Without this, a


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

// Resolves a viewport point to a (node, offset) position inside container,
// for the cases the browser can't place a caret/selection there natively
// itself: this div isn't contentEditable/selectable yet at the moment a
// click or double-click physically lands (see the isEditing effect in
// DraggableTextLayer for why), so nothing places a caret or word-selection
// on its own once it does become editable a moment later — both
// caretRangeFromPointInContainer and wordRangeFromPoint below reconstruct
// it manually from this. Returns null on a non-text node, a point outside
// container, or a browser supporting neither caretRangeFromPoint nor
// caretPositionFromPoint.
function resolveCaretPosition(
  x: number,
  y: number,
  container: HTMLElement,
): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretRangeFromPoint === "function") {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  } else if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      offset = pos.offset;
    }
  }
  if (!node || !container.contains(node)) {
    // If exact point lookup lands slightly outside bounds due to scaling/padding,
    // fallback to the closest text node inside container
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const lastNode = walker.lastChild();
    if (lastNode) {
      return { node: lastNode, offset: lastNode.textContent?.length ?? 0 };
    }
    return null;
  }
  // If the returned node is an element node (such as container div itself or child block),
  // map it to the actual text node inside it at that offset
  if (node.nodeType !== Node.TEXT_NODE) {
    if (node.childNodes.length > 0) {
      const childIndex = Math.min(Math.max(0, offset), node.childNodes.length - 1);
      const child = node.childNodes[childIndex];
      if (child) {
        if (child.nodeType === Node.TEXT_NODE) {
          return { node: child, offset: Math.min(offset, child.textContent?.length ?? 0) };
        }
        const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null);
        const textChild = walker.lastChild() || walker.firstChild();
        if (textChild) {
          return { node: textChild, offset: textChild.textContent?.length ?? 0 };
        }
      }
    } else {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      const textNode = walker.lastChild() || walker.firstChild();
      if (textNode) {
        return { node: textNode, offset: textNode.textContent?.length ?? 0 };
      }
    }
  }
  return { node, offset };
}

// A plain collapsed caret at a viewport point — what a single click on an
// already-selected text layer should place (Canva-style "click again to
// start typing right here"), as opposed to wordRangeFromPoint's word
// selection below (real double-click behavior).
function caretRangeFromPointInContainer(x: number, y: number, container: HTMLElement): Range | null {
  const pos = resolveCaretPosition(x, y, container);
  if (!pos) return null;
  const range = document.createRange();
  range.setStart(pos.node, pos.offset);
  range.collapse(true);
  return range;
}

// Reconstructs "double-click selects the word under the cursor" from a
// viewport point. Falls back to a collapsed caret at the point (still far
// better than always jumping to the very start of the text) when the point
// lands on whitespace/punctuation or a non-text node.
function wordRangeFromPoint(x: number, y: number, container: HTMLElement): Range | null {
  const pos = resolveCaretPosition(x, y, container);
  if (!pos) return null;
  const { node, offset } = pos;

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

function getSelectionCharacterOffsets(container: HTMLElement, range: Range): { start: number; end: number } | null {
  try {
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    const end = start + range.toString().length;

    if (start < end) {
      return { start, end };
    }
  } catch {
  }

  try {
    const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let charCount = 0;
    let start = -1;
    let end = -1;

    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;
      const nodeLen = node.textContent?.length || 0;

      if (start === -1 && (node === range.startContainer || range.startContainer.contains(node))) {
        start = charCount + (node === range.startContainer ? range.startOffset : 0);
      }
      if (end === -1 && (node === range.endContainer || range.endContainer.contains(node))) {
        end = charCount + (node === range.endContainer ? range.endOffset : nodeLen);
      }
      charCount += nodeLen;
    }

    if (start !== -1 && end !== -1 && start < end) {
      return { start, end };
    }
  } catch {
    return null;
  }
  return null;
}

function createRangeFromCharacterOffsets(container: HTMLElement, start: number, end: number): Range | null {
  if (start >= end) return null;
  try {
    const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let charCount = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;

    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;
      const nodeLen = node.textContent?.length || 0;

      if (!startNode && charCount + nodeLen >= start) {
        startNode = node;
        startOffset = Math.max(0, start - charCount);
      }
      if (!endNode && charCount + nodeLen >= end) {
        endNode = node;
        endOffset = Math.max(0, end - charCount);
        break;
      }
      charCount += nodeLen;
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    }
  } catch {
    return null;
  }
  return null;
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
  showMargins = false,
}: {
  t: TextLayer;
  index: number;
  s: EditorState;
  scale: number;
  interactive: boolean;
  set:
    | (<K extends keyof EditorState>(
        k: K,
        v: EditorState[K] | ((prev: EditorState[K], prevState: EditorState) => EditorState[K]),
        opts?: { replace?: boolean | undefined; continuousKey?: string | undefined },
      ) => void)
    | undefined;
  selected: boolean;
  selectedCount: number;
  onSelect: (id: string, opts?: { toggle?: boolean }) => void;
  onGroupDragStart: (clientX: number, clientY: number, duplicate?: boolean) => void;
  onGroupDragMove: (clientX: number, clientY: number) => void;
  onGroupDragEnd: () => void;
  onGuides: (g: GuidesState) => void;
  registerHandle?: ((id: string, handle: TextLayerHandle | null) => void) | undefined;
  controlsOverlayEl?: HTMLDivElement | null;
  suppressDragRef?: React.RefObject<boolean> | undefined;
  showMargins?: boolean;
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
  // See the matching state's own comment in DraggableShapeLayer.
  const [isMoving, setIsMoving] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Where to place the caret the moment isEditing flips true — set by
  // either entry path (a plain click on an already-selected layer, or a
  // real double-click) just before calling setIsEditing(true); consumed by
  // the isEditing effect below. `selectWord` distinguishes the two: a
  // double-click selects the whole word under the point (native browser
  // dblclick behavior, reconstructed manually — see wordRangeFromPoint's
  // own comment for why), a plain click-to-edit just drops a collapsed
  const pendingCaretPointRef = useRef<{ x: number; y: number; selectWord: boolean } | null>(null);
  const pendingListCommandRef = useRef<RichFormatCmd | null>(null);
  type SelectionSnapshot = {
    range: Range | null;
    charOffsets: { start: number; end: number } | null;
  };
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);
  const activeStyledSpanRef = useRef<HTMLElement | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  // The controls-portal outline/handles below read this instead of
  // reaching into containerRef.current directly during render — a plain
  // render-time read reflects the DOM as of the LAST commit, not the one
  // currently being computed, and on a layer's very first-ever render
  // containerRef.current is still null outright (refs attach during
  // commit, after render functions have already run). Either way the
  // outline would size itself off a generic fallback for at least one
  // frame — visibly too small/wrong, then snapping to the real size
  // whenever some unrelated state change happened to trigger the next
  // render. This measures the real box synchronously right after each
  // commit, before the browser paints, so the outline is correctly sized
  // from the very first frame it's visible instead of visibly correcting
  // itself after the fact. The prev-value guard keeps this from causing
  // extra renders once the size stops actually changing (this effect has
  // no dependency array, so it reruns after every commit — cheap, but
  // only worth turning into a state update when something moved).
  const [measuredBox, setMeasuredBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setMeasuredBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  });

  // The dangerouslySetInnerHTML source for the contentEditable div below,
  // frozen for the duration of an edit session — see editableNode's useMemo
  // further down, which deliberately does NOT list `content` as a
  // dependency, precisely so typing (which updates this ref every keystroke
  // via syncFromLiveDom, to stay ready for the mid-edit-style-change case)
  // doesn't itself force a recompute: re-applying dangerouslySetInnerHTML
  // tears down and rebuilds the DOM regardless of whether the string
  // actually changed, which resets the caret to the start every time.
  const editSnapshotRef = useRef<string>(sanitizeTextHtml(t.html || t.text));
  const lastEmittedHtmlRef = useRef<string | null>(null);

  if (!isEditing) {
    editSnapshotRef.current = sanitizeTextHtml(t.html || t.text);
  }
  const content = editSnapshotRef.current;

  // Synchronize DOM content with external state changes (such as Undo, Redo, template resets)
  // even when isEditing is active, without disrupting keystroke carets:
  useEffect(() => {
    const currentHtml = sanitizeTextHtml(t.html || t.text);
    if (currentHtml !== lastEmittedHtmlRef.current) {
      editSnapshotRef.current = currentHtml;
      const el = editableRef.current;
      if (el && el.innerHTML !== currentHtml) {
        el.innerHTML = currentHtml;
      }
    }
  }, [t.html, t.text]);

  useEffect(() => {
    if (t.fontFamily) loadGoogleFont(t.fontFamily);
    if (t.html) {
      const cleanHtml = t.html.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const matchFonts = cleanHtml.match(/font-family:\s*([^;"]+)/gi);
      if (matchFonts) {
        matchFonts.forEach((mf) => {
          const font = mf.replace(/font-family:\s*/i, "").trim().replace(/['"]/g, "");
          if (font) loadGoogleFont(font);
        });
      }
    }
  }, [t.fontFamily, t.html]);

  useEffect(() => {
    if (!isEditing) return;
    const el = editableRef.current;
    if (!el) return;
    el.focus();
    if (pendingCaretPointRef.current) {
      const { x, y, selectWord } = pendingCaretPointRef.current;
      pendingCaretPointRef.current = null;
      const range = selectWord ? wordRangeFromPoint(x, y, el) : caretRangeFromPointInContainer(x, y, el);
      if (range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } else {
        const rangeEnd = document.createRange();
        rangeEnd.selectNodeContents(el);
        rangeEnd.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(rangeEnd);
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
      const sel = window.getSelection();
      // If a valid selection inside this element already exists (e.g. user tapped into it), preserve it!
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const rangeEnd = document.createRange();
        rangeEnd.selectNodeContents(el);
        rangeEnd.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(rangeEnd);
      }
    }
  }, [isEditing]);

  const canInteract = interactive && !!set;
  const locked = t.locked ?? false;
  const rotation = t.rotation ?? 0;
  const sRef = useRef(s);
  sRef.current = s;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const tRef = useRef(t);
  tRef.current = t;
  const update = useCallback(
    (
      patch: Partial<Omit<TextLayer, "id">>,
      opts?: { replace?: boolean | undefined; continuousKey?: string | undefined },
    ) =>
      set?.("texts", (_, prevState) => withTextUpdated(prevState, t.id, patch), opts),
    [set, t.id],
  );
  const remove = () => set?.("texts", (_, prevState) => withTextRemoved(prevState, t.id));

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
  const syncTimeoutRef = useRef<any>(null);

  const syncFromLiveDom = useCallback(
    (el: HTMLElement, immediate: boolean = false) => {
      const text = el.textContent ?? "";
      const html = sanitizeTextHtml(el.innerHTML);

      // Skip redundant update if text and html haven't changed
      if (
        text === (t.text ?? "") &&
        (html === (t.html ?? t.text ?? "") || (!t.html && html === text))
      ) {
        return;
      }

      lastEmittedHtmlRef.current = html;
      editSnapshotRef.current = html;

      if (immediate) {
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;
        }
        update({ text, html, minHeight: undefined });
        return;
      }

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        syncTimeoutRef.current = null;
        update(
          { text, html, minHeight: undefined },
          { continuousKey: `typing-${t.id}` },
        );
      }, 200);
    },
    [update, t.id, t.text, t.html],
  );

  // Dedicated drag state/handlers for the overlay's Move handle — kept
  // separate from editableNode's memoized handlePointerDown above (which
  // doubles as the click-to-select/shift-toggle/alt-duplicate handler for
  // the text body itself, and is disabled entirely while isEditing) since
  // the Move handle only ever needs the plain "drag repositions the
  // already-selected layer" behavior, unconditionally.
  const moveDragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const handleMovePointerDown = (e: React.PointerEvent) => {
    if (suppressDragRef?.current) return;
    e.stopPropagation();
    // Same reasoning as the unconditional capture at the top of
    // editableNode's own handlePointerDown above — without it, a fast drag
    // that outruns the browser viewport stops receiving the window-level
    // pointermove/pointerup below, stranding this handle's drag mid-gesture.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moveDragRef.current = { px: tRef.current.x, py: tRef.current.y, x: e.clientX, y: e.clientY };
    setIsMoving(true);

    const onMove = (moveEv: PointerEvent) => {
      if (suppressDragRef?.current) {
        onUp();
        return;
      }
      const d = moveDragRef.current;
      if (!d) return;
      const dx = ((moveEv.clientX - d.x) / scale / sRef.current.width) * 100;
      const dy = ((moveEv.clientY - d.y) / scale / sRef.current.height) * 100;
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
        showMargins,
      });
      onGuides(snapGuides);
      set?.(
        "texts",
        (_, prevState) => withTextUpdated(prevState, t.id, { x: nextX, y: nextY }),
        { continuousKey: `text-drag-${t.id}` },
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      moveDragRef.current = null;
      setIsMoving(false);
      onGuides({ vCenter: false, hCenter: false });
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const handleMovePointerMove = undefined;
  const handleMovePointerUp = undefined;

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
      const commandMap: Partial<Record<RichFormatCmd, string>> = {
        bold: "bold",
        italic: "italic",
        underline: "underline",
        strike: "strikeThrough",
        bulletList: "insertUnorderedList",
        numberedList: "insertOrderedList",
      };
      const mapped = commandMap[cmd];
      if (mapped) {
        executed = document.execCommand(mapped, false);
      }
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
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
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
        let isUpper = false;
        let selectedFont: string | undefined = undefined;
        let isMultipleFonts = false;
        const selRange = sel.getRangeAt(0);
        const fragment = selRange.cloneContents();
        if (fragment && fragment.querySelectorAll) {
          const fontElements = fragment.querySelectorAll<HTMLElement>("[style*='font-family']");
          const foundFonts = new Set<string>();
          fontElements.forEach((el) => {
            const ff = el.style.fontFamily;
            if (ff) {
              const cleanF = ff.split(",")[0]?.replace(/['"]/g, "").trim().toLowerCase();
              if (cleanF) foundFonts.add(cleanF);
            }
          });
          if (foundFonts.size > 1) {
            isMultipleFonts = true;
          } else if (foundFonts.size === 1) {
            selectedFont = Array.from(foundFonts)[0];
          }
        }

        let foundColors = new Set<string>();
        if (fragment && fragment.querySelectorAll) {
          const colorElements = fragment.querySelectorAll<HTMLElement>("[style*='color']");
          colorElements.forEach((el) => {
            const col = el.style.color;
            if (col) foundColors.add(normalizeColorToHex(col));
          });
        }

        const node = selRange.commonAncestorContainer;
        const elContainer = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
        let selectedColor: string | undefined = foundColors.size === 1 ? Array.from(foundColors)[0] : undefined;
        if (elContainer) {
          const comp = window.getComputedStyle(elContainer);
          isUpper = comp.textTransform === "uppercase";
          if (!selectedFont && !isMultipleFonts) {
            selectedFont = comp.fontFamily;
          }
          if (!selectedColor && foundColors.size === 0) {
            selectedColor = normalizeColorToHex(comp.color);
          }
        }
        return {
          bold: document.queryCommandState("bold"),
          italic: document.queryCommandState("italic"),
          underline: document.queryCommandState("underline"),
          strike: document.queryCommandState("strikeThrough"),
          uppercase: isUpper || !!t.uppercase,
          fontFamily: isMultipleFonts ? "multiple" : selectedFont,
          color: foundColors.size > 1 ? "multiple" : selectedColor,
          colors: foundColors.size > 1 ? Array.from(foundColors) : selectedColor ? [selectedColor] : undefined,
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
      uppercase: !!t.uppercase,
      fontFamily: t.fontFamily,
      color: t.color,
      bulletList: false,
      numberedList: false,
    };
  }, [isEditing, t.weight, t.italic, t.underline, t.strike, t.uppercase, t.fontFamily, t.color, t.html, t.size, t.align]);

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
    if (cmd === "uppercase") {
      if (hasLiveSelection()) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const r = sel.getRangeAt(0);
          const node = r.commonAncestorContainer;
          const elContainer = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
          const currentTrans = elContainer ? window.getComputedStyle(elContainer).textTransform : "none";
          const nextTrans = currentTrans === "uppercase" ? "none" : "uppercase";
          applyStyleSmart({ textTransform: nextTrans }, { uppercase: !t.uppercase });
          return;
        }
      }
      update({ uppercase: !t.uppercase });
      return;
    }

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
    activeStyledSpanRef.current = null;
    const el = editableRef.current;
    if (el && hasLiveSelection()) {
      const sel = window.getSelection();
      const r = sel?.getRangeAt(0) ?? null;
      if (r && !r.collapsed) {
        const offsets = getSelectionCharacterOffsets(el, r);
        selectionSnapshotRef.current = { range: r.cloneRange(), charOffsets: offsets };
        return;
      }
    }
  };

  // Keeps selectionSnapshotRef continuously fresh with the latest
  // non-collapsed selection while editing, instead of relying solely on
  // snapshotSelection() above being called at exactly the right instant —
  // that's only invoked from each toolbar control's own pointerdown, a
  // single narrow window that a "highlight text, then click a formatting
  // control" gesture has to land in precisely; any selectionchange in
  // between (a stray pointerdown elsewhere, focus settling, etc.) that
  // this doesn't otherwise catch would leave the snapshot stale or empty
  // by the time it's actually needed. Mirrors notifyActiveFormat's own
  // selectionchange subscription just above. Deliberately only updates on
  // a genuine non-collapsed selection — a collapsed one (focus moved away,
  // selection cleared) leaves the last known good range in place instead
  // of clobbering it with null, since surviving exactly that moment is the
  // whole point of this snapshot.
  useEffect(() => {
    if (!isEditing) return;
    const handler = () => {
      const el = editableRef.current;
      if (el && hasLiveSelection()) {
        const sel = window.getSelection();
        const r = sel?.getRangeAt(0) ?? null;
        if (r && !r.collapsed) {
          const offsets = getSelectionCharacterOffsets(el, r);
          selectionSnapshotRef.current = { range: r.cloneRange(), charOffsets: offsets };
          // User highlighted a new/different range, reset the previously styled span
          activeStyledSpanRef.current = null;
        }
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [isEditing]);

  const applyStyleSmart = (cssProps: Partial<CSSStyleDeclaration>, wholeLayerPatch: Partial<Omit<TextLayer, "id">>) => {
    const el = editableRef.current;
    if (!el) {
      update(wholeLayerPatch);
      return;
    }

    // If an active span was already styled during this color picker session,
    // update it directly so dragging sliders or picking multiple colors doesn't nest spans.
    if (activeStyledSpanRef.current && el.contains(activeStyledSpanRef.current)) {
      Object.assign(activeStyledSpanRef.current.style, cssProps);
      syncFromLiveDom(el);
      return;
    }

    let range: Range | null = null;
    const isLive = hasLiveSelection();
    if (isLive) {
      range = window.getSelection()!.getRangeAt(0);
    } else if (selectionSnapshotRef.current?.charOffsets) {
      const { start, end } = selectionSnapshotRef.current.charOffsets;
      range = createRangeFromCharacterOffsets(el, start, end);
    } else if (selectionSnapshotRef.current?.range) {
      const r = selectionSnapshotRef.current.range;
      if (el === r.commonAncestorContainer || el.contains(r.commonAncestorContainer)) {
        range = r;
      }
    }

    if (!range || range.collapsed) {
      if (el && cssProps.color) {
        el.querySelectorAll<HTMLElement>("[style]").forEach((child) => {
          child.style.removeProperty("color");
          if (!child.getAttribute("style")?.trim()) child.removeAttribute("style");
        });
      }
      if (el && cssProps.fontFamily) {
        el.querySelectorAll<HTMLElement>("[style]").forEach((child) => {
          child.style.removeProperty("font-family");
          if (!child.getAttribute("style")?.trim()) child.removeAttribute("style");
        });
      }
      const cleanHtml = t.html && cssProps.color ? stripInlineStyleProps(t.html, ["color"])
        : t.html && cssProps.fontFamily ? stripInlineStyleProps(t.html, ["font-family"])
        : undefined;

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      if (cleanHtml !== undefined) {
        lastEmittedHtmlRef.current = cleanHtml;
        editSnapshotRef.current = cleanHtml;
      }
      update({ ...wholeLayerPatch, ...(cleanHtml !== undefined ? { html: cleanHtml } : {}) });
      return;
    }

    try {
      const cloned = range.cloneContents();
      if (!cloned.textContent || cloned.textContent.length === 0) {
        update(wholeLayerPatch);
        return;
      }

      const wrapper = document.createElement("span");
      wrapper.style.display = "inline";
      const cleanCssProps: Partial<CSSStyleDeclaration> = { ...cssProps };
      if (typeof cleanCssProps.fontFamily === "string") {
        cleanCssProps.fontFamily = cleanCssProps.fontFamily.replace(/"/g, "'");
      }
      Object.assign(wrapper.style, cleanCssProps);
      const contents = range.extractContents();
      if (!contents.textContent || contents.textContent.length === 0) {
        update(wholeLayerPatch);
        return;
      }

      // Remove conflicting styles from any child elements inside the selection so the new style takes full effect
      const keys = Object.keys(cssProps);
      if (contents.querySelectorAll) {
        contents.querySelectorAll<HTMLElement>("*").forEach((child) => {
          keys.forEach((k) => {
            const cssPropName = k.replace(/([A-Z])/g, "-$1").toLowerCase();
            child.style.removeProperty(cssPropName);
          });
          if (!child.getAttribute("style")?.trim()) {
            child.removeAttribute("style");
          }
          if (child.tagName.toLowerCase() === "span" && (!child.getAttribute("style") || child.getAttribute("style")?.trim() === "")) {
            const parent = child.parentNode;
            if (parent) {
              while (child.firstChild) {
                parent.insertBefore(child.firstChild, child);
              }
              parent.removeChild(child);
            }
          }
        });
      }

      wrapper.appendChild(contents);
      range.insertNode(wrapper);
      activeStyledSpanRef.current = wrapper;

      if (isLive) {
        const sel = window.getSelection();
        const newRange = document.createRange();
        newRange.selectNodeContents(wrapper);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
      } else {
        const offsets = getSelectionCharacterOffsets(el, range);
        if (offsets) {
          selectionSnapshotRef.current = { range: range.cloneRange(), charOffsets: offsets };
        }
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
    if (v === t.fontFamily) return;
    loadGoogleFont(v);
    applyStyleSmart({ fontFamily: v }, { fontFamily: v });
  };

  const setSize = (v: number) => {
    const currentSize = t.size || 32;
    const ratio = v / currentSize;
    const nextWidth = typeof t.width === "number" && t.width > 0 ? Math.round(Math.max(40, t.width * ratio)) : undefined;
    const cleanHtml = t.html ? stripInlineStyleProps(t.html, ["font-size"]) : undefined;
    update({
      size: v,
      ...(nextWidth !== undefined ? { width: nextWidth } : {}),
      minHeight: undefined,
      ...(cleanHtml !== undefined ? { html: cleanHtml } : {})
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
  const startEditing = useCallback(() => {
    setIsEditing(true);
    const selectAllAndFocus = () => {
      const el = editableRef.current;
      if (el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        snapshotSelection();
      }
    };
    requestAnimationFrame(selectAllAndFocus);
    setTimeout(selectAllAndFocus, 50);
  }, []);

  const setWeight = useCallback(
    (weight: number) => {
      if (hasLiveSelection()) {
        applyStyleSmart({ fontWeight: String(weight) }, { weight });
      } else {
        update({ weight });
      }
    },
    [hasLiveSelection, applyStyleSmart, update],
  );

  const handleRef = useRef<TextLayerHandle>({
    applyFormat: applyFormatSmart,
    setFontFamily,
    setWeight,
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
    startEditing,
  });
  handleRef.current.applyFormat = applyFormatSmart;
  handleRef.current.setFontFamily = setFontFamily;
  handleRef.current.setWeight = setWeight;
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
  handleRef.current.startEditing = startEditing;

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
            // Capture unconditionally, before the shiftKey/locked checks —
            // see the matching comment in DraggableShapeLayer's
            // handlePointerDown for why every drag-starting branch below
            // needs this (a fast drag can outrun the layer's own bounds,
            // or the browser viewport entirely; without capture the
            // window-level pointermove/pointerup listeners added below
            // simply stop firing once that happens, stranding the drag
            // mid-gesture — which is what "losing" a dragged item looks
            // like). Harmless on the shiftKey/locked paths that don't
            // start a drag at all; pointerup releases it automatically.
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            if (e.shiftKey) {
              onSelect(t.id, { toggle: true });
              return;
            }
            if (locked) {
              onSelect(t.id);
              return;
            }
            // See the matching setIsMoving comment in DraggableShapeLayer.
            // Safe to call inside this memoized handler without adding it
            // as a dependency — it's a stable state setter, only reading
            // isMoving's value (which this block never does) would need
            // that.
            setIsMoving(true);

            // Alt+drag on an existing multi-selection duplicates the whole
            // group at once — see the matching block's comment in
            // DraggableShapeLayer's handlePointerDown.
            if (e.altKey && selected && selectedCount > 1) {
              groupDraggingRef.current = true;
              onGroupDragStart(e.clientX, e.clientY, true);
              return;
            }

            if (e.altKey && set) {
              const dup = withTextDuplicated(sRef.current, t.id);
              set("texts", dup.list);
              onSelect(dup.newId);
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

            // Captured before onSelect below — Canva-style "click again to
            // start typing" (see onUp further down) only fires for a click
            // that lands on a layer that was ALREADY the sole selection
            // before this click, never for the click that first selects it
            // (that click should only select, same as before) and never
            // for a multi-selected layer (that's a group-drag click, left
            // untouched here).
            const wasAlreadySelected = selected && selectedCount === 1;
            if (!selected) {
              onSelect(t.id);
            }
            if (selected && selectedCount > 1) {
              groupDraggingRef.current = true;
              onGroupDragStart(e.clientX, e.clientY);
            } else {
              dragRef.current = {
                px: tRef.current.x,
                py: tRef.current.y,
                x: e.clientX,
                y: e.clientY,
                activeId: t.id,
                hasDuplicated: false,
              };
            }

            // Whether the pointer has moved past a real "this is a drag,
            // not a click" threshold since pointerdown — same 4px-ish
            // threshold used elsewhere in this file for the same
            // click-vs-drag distinction (e.g. the marquee-select gesture in
            // index.tsx). Only meaningful for the single-item path above;
            // group drags never consult it.
            let hasMoved = false;

            const onMove = (moveEv: PointerEvent) => {
              if (suppressDragRef?.current) {
                onUp();
                return;
              }
              if (groupDraggingRef.current) {
                onGroupDragMove(moveEv.clientX, moveEv.clientY);
                return;
              }
              const d = dragRef.current;
              if (!d) return;
              if (!hasMoved && Math.hypot(moveEv.clientX - e.clientX, moveEv.clientY - e.clientY) > 4) {
                hasMoved = true;
              }

              const currentScale = scaleRef.current || 1;
              const currentCanvasWidth = sRef.current.width || 1200;
              const currentCanvasHeight = sRef.current.height || 1200;
              const dx = ((moveEv.clientX - d.x) / currentScale / currentCanvasWidth) * 100;
              const dy = ((moveEv.clientY - d.y) / currentScale / currentCanvasHeight) * 100;
              const width = containerRef.current?.offsetWidth ?? (t.width ?? 480);
              const height = containerRef.current?.offsetHeight ?? (t.minHeight ?? t.size * 1.3);
              const otherElements = getAllCanvasElements(sRef.current);
              const targetId = d.activeId || t.id;
              const { nextX, nextY, guides: snapGuides } = calculateAlignmentSnap({
                currentId: targetId,
                rawX: d.px + dx,
                rawY: d.py + dy,
                width,
                height,
                s: sRef.current,
                otherElements,
                showMargins,
              });
              onGuides(snapGuides);
              set?.(
                "texts",
                (_, prevState) => withTextUpdated(prevState, targetId, { x: nextX, y: nextY }),
                { continuousKey: `text-drag-${targetId}` },
              );
            };

            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              window.removeEventListener("pointercancel", onUp);
              dragRef.current = null;
              if (groupDraggingRef.current) {
                groupDraggingRef.current = false;
                onGroupDragEnd();
              } else if (wasAlreadySelected && !hasMoved) {
                // Canva-style: a plain click (no real drag) on a layer that
                // was already selected enters edit mode, caret placed
                // exactly where the click landed — "click to select, click
                // again to type," no double-click required. A genuine
                // double-click still also works (handleDoubleClick above,
                // selects the whole word instead of just placing a caret).
                pendingCaretPointRef.current = { x: e.clientX, y: e.clientY, selectWord: false };
                setIsEditing(true);
              }
              setIsMoving(false);
              onGuides({ vCenter: false, hCenter: false });
            };

            window.addEventListener("pointermove", onMove, { passive: false });
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onUp);
          };

      const handlePointerMove = undefined;
      const handlePointerUp = undefined;

      const handleDoubleClick = (e: React.MouseEvent) => {
        if (!canInteract || locked) return;
        e.stopPropagation();
        // Already editing — most commonly because this same gesture's
        // first click already entered edit mode via the plain
        // click-on-an-already-selected-layer path below (a genuine
        // double-click on a layer that was already selected flips
        // isEditing true on click 1's pointerup, before this dblclick
        // event even fires). The isEditing effect that normally places the
        // caret only reruns on isEditing's false->true transition, which
        // already happened, so it won't fire again for this — apply the
        // word-selection directly instead of routing through it.
        if (isEditing) {
          const el = editableRef.current;
          if (el) {
            const wordRange = wordRangeFromPoint(e.clientX, e.clientY, el);
            if (wordRange) {
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(wordRange);
            }
          }
          return;
        }
        pendingCaretPointRef.current = { x: e.clientX, y: e.clientY, selectWord: true };
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
          onClick={(e) => {
            if (isEditing) {
              e.stopPropagation();
            }
          }}
          onInput={(e) => {
            syncFromLiveDom(e.currentTarget, false);
            notifyActiveFormat();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData?.getData("text/plain") ?? "";
            if (!text) return;
            // Insert plain text cleanly so it inherits the layer's current font, size, weight, and color
            const inserted = document.execCommand("insertText", false, text);
            if (!inserted) {
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                const node = document.createTextNode(text);
                range.insertNode(node);
                range.setStartAfter(node);
                range.setEndAfter(node);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
            const el = editableRef.current;
            if (el) syncFromLiveDom(el, true);
            notifyActiveFormat();
          }}
          onKeyUp={() => {
            if (isEditing) {
              const el = editableRef.current;
              if (el) syncFromLiveDom(el, false);
              notifyActiveFormat();
            }
          }}
          onBlur={(e) => {
            snapshotSelection();
            syncFromLiveDom(e.currentTarget, true);
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
            textTransform: t.uppercase ? "uppercase" : "none",
            color: t.color,
            textAlign: t.align,
            textAlignLast: t.align === "justify" ? "justify" : undefined,
            textJustify: t.align === "justify" ? "inter-word" : undefined,
            letterSpacing: t.letterSpacing !== undefined ? `${(t.letterSpacing / 1000) * t.size}px` : undefined,
            lineHeight: t.lineHeight ?? 1.3,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "break-word",
            minHeight: t.minHeight,
            outline: "none",
            touchAction: isEditing ? "auto" : "none",
            userSelect: isEditing ? "text" : "none",
            cursor: !canInteract ? "default" : locked ? "pointer" : isEditing ? "text" : "grab",
            caretColor: t.color || "currentColor",
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
      t.id,
      t.x,
      t.y,
      t.fontFamily,
      t.size,
      t.weight,
      t.italic,
      t.underline,
      t.strike,
      t.uppercase,
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

  const distToRight = Math.max(0, s.width - (t.x / 100) * s.width - 24);
  const distToLeft = Math.max(0, (t.x / 100) * s.width - 24);
  const autoMaxWidth = Math.max(120, Math.min(s.width - 48, Math.min(distToRight, distToLeft) * 2));

  if (t.hidden) return null;

  return (
    <>
      <div
        ref={containerRef}
        data-layer-id={t.id}
        data-nopan=""
        style={{
          position: "absolute",
          left: `${t.x}%`,
          top: `${t.y}%`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          width: validTextWidth ?? "max-content",
          maxWidth: validTextWidth ? undefined : autoMaxWidth,
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
          // zIndex directly reflects the unified layerOrder index (10 + index)
          // so layer arrangement changes take effect immediately in real time,
          // while the selection handles & outline portal (controlsOverlayEl)
          // renders on top at zIndex 80+ regardless.
          zIndex: 10 + index,
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
              width: measuredBox?.w ?? containerRef.current?.offsetWidth ?? (validTextWidth ?? 200),
              height: measuredBox?.h ?? containerRef.current?.offsetHeight ?? (t.minHeight ?? 40),
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
            {/* See the matching block's comment in DraggableShapeLayer for
                why this hides (not just visually deprioritizes) for the
                duration of a move/rotate drag. */}
            {!(isMoving || isRotating) ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  // Counter-rotates this wrapper by the layer's own rotation
                  // so LayerToolbar always docks at the box's true
                  // screen-space top and reads upright, no matter how far
                  // the layer itself is turned. This div exactly overlaps
                  // its rotated parent (inset: 0, same transform-origin —
                  // the box's center), so its own rotate(-rotation) cancels
                  // the parent's rotate(rotation) exactly, leaving nothing
                  // inside it rotated at all. See the matching wrapper in
                  // DraggableImageLayer/DraggableShapeLayer.
                  transform: `rotate(${-rotation}deg)`,
                  pointerEvents: "none",
                }}
              >
                <div style={{ pointerEvents: "auto" }}>
                  <LayerToolbar
                    locked={locked}
                    onToggleLock={() => update({ locked: !locked })}
                    onDuplicate={duplicate}
                    onDelete={remove}
                    scale={scale}
                    placement="top"
                  />
                </div>
              </div>
            ) : null}

            {!locked ? (
              <>
                {!(isMoving || isRotating)
                  ? TEXT_HANDLE_POSITIONS.filter((h) => activeHandle === null || activeHandle === h.id).map((h) => (
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
                          update(
                            {
                              size: nextSize,
                              ...(nextWidth !== undefined ? { width: nextWidth } : {}),
                              minHeight: undefined,
                              ...(cleanHtml !== undefined ? { html: cleanHtml } : {}),
                            },
                            { continuousKey: `text-resize-${t.id}` },
                          );
                          onGuides(
                            calculateAlignmentSnap({
                              currentId: t.id,
                              rawX: t.x,
                              rawY: t.y,
                              width: nextWidth ?? (containerRef.current?.offsetWidth ?? 520),
                              height: containerRef.current?.offsetHeight ?? t.size * 1.3,
                              s: sRef.current,
                              otherElements: getAllCanvasElements(sRef.current),
                              showMargins,
                            }).guides,
                          );
                        } else {
                          const dw = widthDeltaFor(h.id, dx);
                          const nextWidth = Math.round(Math.max(40, r.startWidth + dw));
                          const appliedDw = nextWidth - r.startWidth;
                          const shift = rotateVector(centerShiftX(h.id, appliedDw), 0, rotation);
                          const nextX = r.startPosX + (shift.dx / s.width) * 100;
                          const nextY = r.startPosY + (shift.dy / s.height) * 100;
                          update(
                            {
                              width: nextWidth,
                              minHeight: undefined,
                              x: nextX,
                              y: nextY,
                            },
                            { continuousKey: `text-resize-${t.id}` },
                          );
                          onGuides(
                            calculateAlignmentSnap({
                              currentId: t.id,
                              rawX: nextX,
                              rawY: nextY,
                              width: nextWidth,
                              height: containerRef.current?.offsetHeight ?? t.size * 1.3,
                              s: sRef.current,
                              otherElements: getAllCanvasElements(sRef.current),
                              showMargins,
                            }).guides,
                          );
                        }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        resizeRef.current = null;
                        setActiveHandle(null);
                        onGuides({ vCenter: false, hCenter: false });
                      }}
                      onPointerCancel={(e) => {
                        e.stopPropagation();
                        resizeRef.current = null;
                        setActiveHandle(null);
                        onGuides({ vCenter: false, hCenter: false });
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
                  ))
                  : null}
                {/* Counter-rotated for the same reason as LayerToolbar's
                    own wrapper above — keeps this row docked at the box's
                    true screen-space bottom (opposite LayerToolbar's fixed
                    top) instead of swinging around with the layer's own
                    rotation and potentially landing on top of it. Purely
                    cosmetic: the rotate handle computes the drag angle from
                    the pointer's real screen position against the box's
                    actual center (see handleRotatePointerMove above), not
                    from wherever this button visually sits, so this doesn't
                    affect the rotate gesture's math at all. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: `rotate(${-rotation}deg)`,
                    pointerEvents: "none",
                  }}
                >
                  <RotateMoveHandleRow
                    containerRef={containerRef}
                    scale={scale}
                    onRotate={(deg) => update({ rotation: deg })}
                    onMovePointerDown={handleMovePointerDown}
                    onMovePointerMove={handleMovePointerMove}
                    onMovePointerUp={handleMovePointerUp}
                    isMoving={isMoving}
                    onRotatingChange={setIsRotating}
                    elementRotation={rotation}
                  />
                </div>
              </>
            ) : null}
          </div>,
          controlsOverlayEl,
        )
        : null}

      {/* Multi-Selection Item Outline (shows individual layer selection bounds during marquee or multi-select) */}
      {canInteract && selected && selectedCount > 1 && controlsOverlayEl
        ? createPortal(
          <div
            style={{
              position: "absolute",
              left: `${t.x}%`,
              top: `${t.y}%`,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              width: measuredBox?.w ?? containerRef.current?.offsetWidth ?? (validTextWidth ?? 200),
              height: measuredBox?.h ?? containerRef.current?.offsetHeight ?? (t.minHeight ?? 40),
              zIndex: 80 + index,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -3,
                border: "1.5px solid var(--color-primary, #6366f1)",
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
          </div>,
          controlsOverlayEl,
        )
        : null}
    </>
  );
});

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
  showMargins = false,
}: {
  img: ImageLayer;
  index: number;
  s: EditorState;
  scale: number;
  interactive: boolean;
  set:
    | (<K extends keyof EditorState>(
        k: K,
        v: EditorState[K] | ((prev: EditorState[K], prevState: EditorState) => EditorState[K]),
        opts?: { replace?: boolean | undefined; continuousKey?: string | undefined },
      ) => void)
    | undefined;
  selected: boolean;
  selectedCount: number;
  onSelect: (id: string, opts?: { toggle?: boolean }) => void;
  onGroupDragStart: (clientX: number, clientY: number, duplicate?: boolean) => void;
  onGroupDragMove: (clientX: number, clientY: number) => void;
  onGroupDragEnd: () => void;
  onGuides: (g: GuidesState) => void;
  controlsOverlayEl?: HTMLDivElement | null;
  suppressDragRef?: React.RefObject<boolean> | undefined;
  showMargins?: boolean;
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
  // See the matching state's own comment in DraggableShapeLayer.
  const [isMoving, setIsMoving] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Captured from the actual <img> the instant it decodes (see its onLoad
  // below) — used to compute this layer's "auto height" (height/width *
  // naturalAspect) everywhere that's needed (the selection outline box,
  // the resize-start height) instead of reading containerRef's own
  // offsetHeight. offsetHeight reflects the DOM's current layout at
  // whatever moment it happens to be read, which right after a fresh
  // upload can be a render or two behind the image actually finishing its
  // decode — the outline/handles would size themselves off that stale (or
  // still-zero) number and visibly sit off the actual picture until
  // something else happened to force a re-render. This is set directly
  // from the browser's own decoded dimensions instead, so it's correct as
  // of the very first render after the image is ready, and re-computes
  // itself whenever the src changes (a different image swapped in).
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  useEffect(() => {
    setNaturalAspect(null);
  }, [img.src]);
  // Same idea as DraggableTextLayer's own measuredBox (see its comment) —
  // the outline/handles box below prefers this actual post-commit
  // measurement over a computed guess wherever it's available, since it
  // reflects the container's real rendered size directly rather than
  // trusting an aspect ratio computed from a separate onLoad event. Needs
  // naturalAspect's onLoad to still trigger the re-render that lets this
  // effect see the image's now-correct layout in the first place — decode
  // finishing doesn't, by itself, cause this component to re-render.
  const [measuredBox, setMeasuredBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setMeasuredBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  });

  const canInteract = interactive && !!set && !s.locked;
  const locked = img.locked ?? false;
  const hasExplicitHeight = img.height !== undefined;
  const rotation = img.rotation ?? 0;
  const imgRef = useRef(img);
  imgRef.current = img;
  const update = (
    patch: Partial<Omit<ImageLayer, "id">>,
    opts?: { replace?: boolean | undefined; continuousKey?: string | undefined },
  ) =>
    set?.("images", (_, prevState) => withImageUpdated(prevState, img.id, patch), opts);
  const remove = () => set?.("images", (_, prevState) => withImageRemoved(prevState, img.id));
  const duplicate = () => {
    if (!set) return;
    const dup = withImageDuplicated(sRef.current, img.id);
    set("images", dup.list);
    onSelect(dup.newId);
  };

  const handlePointerDown = canInteract
    ? (e: React.PointerEvent) => {
      // A second touch is also down — this is a pinch, not a drag (see
      // suppressDragRef's own comment on QuoteCanvas's Props).
      if (suppressDragRef?.current) return;
      e.stopPropagation();
      // Capture unconditionally, before the shiftKey/locked checks — see
      // the matching comment in DraggableTextLayer/DraggableShapeLayer's
      // handlePointerDown for why every drag-starting branch below needs
      // this (a fast drag can outrun the layer's own bounds, or the
      // browser viewport entirely; without capture the window-level
      // pointermove/pointerup listeners added below simply stop firing
      // once that happens, stranding the drag mid-gesture — which is what
      // "losing" a dragged item looks like).
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (e.shiftKey) {
        onSelect(img.id, { toggle: true });
        return;
      }
      if (locked) {
        onSelect(img.id);
        return;
      }
      // See the matching setIsMoving comment in DraggableShapeLayer.
      setIsMoving(true);

      // Alt+drag on an existing multi-selection duplicates the whole group
      // at once — see the matching block's comment in DraggableShapeLayer's
      // handlePointerDown.
      if (e.altKey && selected && selectedCount > 1) {
        groupDraggingRef.current = true;
        onGroupDragStart(e.clientX, e.clientY, true);
        return;
      }

      if (e.altKey && set) {
        const dup = withImageDuplicated(sRef.current, img.id);
        set("images", dup.list);
        onSelect(dup.newId);
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
      if (selected && selectedCount > 1) {
        groupDraggingRef.current = true;
        onGroupDragStart(e.clientX, e.clientY);
      } else {
        dragRef.current = {
          px: imgRef.current.x,
          py: imgRef.current.y,
          x: e.clientX,
          y: e.clientY,
          activeId: img.id,
          hasDuplicated: false,
        };
      }

      const onMove = (moveEv: PointerEvent) => {
        if (suppressDragRef?.current) {
          onUp();
          return;
        }
        if (groupDraggingRef.current) {
          onGroupDragMove(moveEv.clientX, moveEv.clientY);
          return;
        }
        const d = dragRef.current;
        if (!d) return;

        const dx = ((moveEv.clientX - d.x) / scale / sRef.current.width) * 100;
        const dy = ((moveEv.clientY - d.y) / scale / sRef.current.height) * 100;
        const width = img.size;
        const height = img.height ?? (naturalAspect !== null ? img.size * naturalAspect : img.size);
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
          showMargins,
        });
        onGuides(snapGuides);
        set?.(
          "images",
          (_, prevState) => withImageUpdated(prevState, targetId, { x: nextX, y: nextY }),
          { continuousKey: `image-drag-${targetId}` },
        );
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        dragRef.current = null;
        if (groupDraggingRef.current) {
          groupDraggingRef.current = false;
          onGroupDragEnd();
        }
        setIsMoving(false);
        onGuides({ vCenter: false, hCenter: false });
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
    : undefined;

  const handlePointerMove = undefined;
  const handlePointerUp = undefined;

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
          zIndex: 10 + index,
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
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0) setNaturalAspect(el.naturalHeight / el.naturalWidth);
          }}
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
                  // Prefers the real post-commit measurement (measuredBox)
                  // over a computed guess, and the decoded aspect ratio
                  // (naturalAspect) over a raw live offsetHeight read —
                  // right after a fresh upload, a raw read here can still
                  // reflect the DOM from before the image finished
                  // decoding, which is what made the outline and resize
                  // handles land far from the image instead of hugging it.
                  // measuredBox is only trusted once it's actually
                  // non-zero — before the image decodes, the container
                  // itself has no intrinsic height yet, so an early
                  // measurement of exactly 0 means "not measured
                  // meaningfully yet", not "the image is 0px tall".
                  : `${(measuredBox && measuredBox.h > 0 ? measuredBox.h : null) ??
                    (naturalAspect !== null ? img.size * naturalAspect : (containerRef.current?.offsetHeight ?? img.size))
                  }px`,
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
            {/* See the matching block's comment in DraggableShapeLayer for
                why this hides (not just visually deprioritizes) for the
                duration of a move/rotate drag. */}
            {!(isMoving || isRotating) ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  // See the matching wrapper's comment in DraggableTextLayer
                  // for why this counter-rotation keeps LayerToolbar docked
                  // at the box's true screen-space top and upright.
                  transform: `rotate(${-rotation}deg)`,
                  pointerEvents: "none",
                }}
              >
                <div style={{ pointerEvents: "auto" }}>
                  <LayerToolbar
                    locked={locked}
                    onToggleLock={() => update({ locked: !locked })}
                    onDuplicate={duplicate}
                    onDelete={remove}
                    scale={scale}
                    placement="top"
                  />
                </div>
              </div>
            ) : null}

            {!locked ? (
              <>
                {!(isMoving || isRotating)
                  ? HANDLE_POSITIONS.filter((h) => activeHandle === null || activeHandle === h.id).map((h) => (
                    <div
                      key={h.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setActiveHandle(h.id);
                        const startHeight =
                          img.height ??
                          (naturalAspect !== null ? img.size * naturalAspect : containerRef.current?.offsetHeight) ??
                          img.size;
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
                        // Guide-only check (via calculateAlignmentSnap) against
                        // the resized box's own resulting position/size — its
                        // returned nextX/nextY are intentionally discarded,
                        // since the resize math above already computed the
                        // correct position; only `.guides` (what to draw) is
                        // used. Same treatment for both branches below, right
                        // after each one's own update() call.
                        const showResizeGuides = (nextX: number, nextY: number, w: number, h2: number) => {
                          onGuides(
                            calculateAlignmentSnap({
                              currentId: img.id,
                              rawX: nextX,
                              rawY: nextY,
                              width: w,
                              height: h2,
                              s: sRef.current,
                              otherElements: getAllCanvasElements(sRef.current),
                              showMargins,
                            }).guides,
                          );
                        };
                        if (h.kind === "corner") {
                          const delta = resizeDelta(h.id, dx, dy);
                          const nextWidth = Math.round(Math.max(20, r.startWidth + delta));
                          const ratio = r.startHeight > 0 ? r.startHeight / r.startWidth : 1;
                          const nextHeight = Math.round(Math.max(20, nextWidth * ratio));
                          const appliedDw = nextWidth - r.startWidth;
                          const appliedDh = nextHeight - r.startHeight;
                          const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                          const nextX = r.startPosX + (shift.dx / s.width) * 100;
                          const nextY = r.startPosY + (shift.dy / s.height) * 100;
                          update(
                            { size: nextWidth, height: nextHeight, x: nextX, y: nextY },
                            { continuousKey: `image-resize-${img.id}` },
                          );
                          showResizeGuides(nextX, nextY, nextWidth, nextHeight);
                        } else {
                          const dw = widthDeltaFor(h.id, dx);
                          const dh = heightDeltaFor(h.id, dy);
                          const nextWidth = Math.round(Math.max(20, r.startWidth + dw));
                          const nextHeight = Math.round(Math.max(20, r.startHeight + dh));
                          const appliedDw = nextWidth - r.startWidth;
                          const appliedDh = nextHeight - r.startHeight;
                          const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                          const nextX = r.startPosX + (shift.dx / s.width) * 100;
                          const nextY = r.startPosY + (shift.dy / s.height) * 100;
                          update(
                            { size: nextWidth, height: nextHeight, x: nextX, y: nextY },
                            { continuousKey: `image-resize-${img.id}` },
                          );
                          showResizeGuides(nextX, nextY, nextWidth, nextHeight);
                        }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        resizeRef.current = null;
                        setActiveHandle(null);
                        onGuides({ vCenter: false, hCenter: false });
                      }}
                      onPointerCancel={(e) => {
                        e.stopPropagation();
                        resizeRef.current = null;
                        setActiveHandle(null);
                        onGuides({ vCenter: false, hCenter: false });
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
                  ))
                  : null}
                {/* See the matching wrapper's comment in DraggableTextLayer
                    for why this counter-rotation keeps the row docked at
                    the box's true screen-space bottom. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: `rotate(${-rotation}deg)`,
                    pointerEvents: "none",
                  }}
                >
                  <RotateMoveHandleRow
                    containerRef={containerRef}
                    scale={scale}
                    onRotate={(deg) => update({ rotation: deg })}
                    onMovePointerDown={handlePointerDown}
                    onMovePointerMove={handlePointerMove}
                    onMovePointerUp={handlePointerUp}
                    isMoving={isMoving}
                    onRotatingChange={setIsRotating}
                    elementRotation={rotation}
                  />
                </div>
              </>
            ) : null}
          </div>,
          controlsOverlayEl,
        )
        : null}

      {/* Multi-Selection Item Outline (shows individual layer selection bounds during marquee or multi-select) */}
      {canInteract && selected && selectedCount > 1 && controlsOverlayEl
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
                  : `${(measuredBox && measuredBox.h > 0 ? measuredBox.h : null) ??
                    (naturalAspect !== null ? img.size * naturalAspect : (containerRef.current?.offsetHeight ?? img.size))
                  }px`,
              zIndex: 80 + index,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -3,
                border: "1.5px solid var(--color-primary, #6366f1)",
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
          </div>,
          controlsOverlayEl,
        )
        : null}
    </>
  );
});

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
  showMargins = false,
}: {
  shape: ShapeLayer;
  index: number;
  s: EditorState;
  scale: number;
  interactive: boolean;
  set:
    | (<K extends keyof EditorState>(
        k: K,
        v: EditorState[K] | ((prev: EditorState[K], prevState: EditorState) => EditorState[K]),
        opts?: { replace?: boolean | undefined; continuousKey?: string | undefined },
      ) => void)
    | undefined;
  selected: boolean;
  selectedCount: number;
  onSelect: (id: string, opts?: { toggle?: boolean }) => void;
  onGroupDragStart: (clientX: number, clientY: number, duplicate?: boolean) => void;
  onGroupDragMove: (clientX: number, clientY: number) => void;
  onGroupDragEnd: () => void;
  onGuides: (g: GuidesState) => void;
  controlsOverlayEl?: HTMLDivElement | null;
  suppressDragRef?: React.RefObject<boolean> | undefined;
  showMargins?: boolean;
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
  const [activeHandle, setActiveHandle] = useState<HandleId | "line-start" | "line-end" | null>(null);
  // True for the duration of an active move drag (single-item, group, or an
  // Alt+drag duplicate — every branch in handlePointerDown that actually
  // starts dragging) — used to hide LayerToolbar, the resize handles, and
  // (via RotateMoveHandleRow's own isMoving prop) its rotate button while
  // the shape is being moved, same UI-declutter idea handleRotatePointerDown
  // below applies in the other direction for isRotating.
  const [isMoving, setIsMoving] = useState(false);
  // Mirrors RotateMoveHandleRow's own rotate-drag state (reported via its
  // onRotatingChange prop) purely so LayerToolbar/the resize handles can
  // hide for that gesture too — RotateMoveHandleRow already hides its own
  // move button internally without needing this passed back in.
  const [isRotating, setIsRotating] = useState(false);
  const lineEndpointDragRef = useRef<{
    isEnd: boolean;
    startLen: number;
    startRot: number;
    startCenterX: number;
    startCenterY: number;
    startMouseX: number;
    startMouseY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const canInteract = interactive && !!set && !s.locked;
  const locked = shape.locked ?? false;
  const isLine = isLineShape(shape.kind);
  const effectiveHeight = typeof shape.height === "number" ? shape.height : (isLine ? 24 : shape.size);
  const rotation = shape.rotation ?? 0;
  const invScale = scale > 0 ? 1 / scale : 1;
  // Line shapes render a thin visual stroke (effectiveHeight defaults to
  // just 24 canvas-space px) but that same number is also this layer's
  // pointer-hit target height below — fine on desktop, but once the whole
  // canvas is scaled down to fit a small mobile screen that strip shrinks
  // to only a few real screen px, making the line itself very hard to
  // tap/drag (as opposed to its two endpoint handles, which are a
  // separate, already invScale-compensated hit area). This only widens the
  // invisible pointer target — effectiveHeight itself still drives the
  // actual rendered stroke and all alignment/snap math below, so the line
  // never looks thicker and its bounding box for other layers stays exact.
  const lineHitBoxHeight = isLine ? Math.max(effectiveHeight, 36 * invScale) : effectiveHeight;
  const lineRad = (rotation * Math.PI) / 180;
  const lineLen = typeof shape.size === "number" && shape.size > 0 ? shape.size : 200;
  const p1 = { x: (-lineLen / 2) * Math.cos(lineRad), y: (-lineLen / 2) * Math.sin(lineRad) };
  const p2 = { x: (lineLen / 2) * Math.cos(lineRad), y: (lineLen / 2) * Math.sin(lineRad) };
  const topEndpoint = p1.y < p2.y ? p1 : p2;
  const isNearlyHorizontal = Math.abs(Math.sin(lineRad)) < 0.35;

  const toolbarPos = isNearlyHorizontal
    ? { x: 0, y: -26 * invScale }
    : { x: topEndpoint.x, y: topEndpoint.y - 28 * invScale };

  const handlesPos = isNearlyHorizontal
    ? { x: 0, y: 26 * invScale, orientation: "horizontal" as const }
    : { x: 34 * invScale, y: 0, orientation: "vertical" as const };
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const update = (
    patch: Partial<Omit<ShapeLayer, "id" | "kind">>,
    opts?: { replace?: boolean | undefined; continuousKey?: string | undefined },
  ) =>
    set?.("shapes", (_, prevState) => withShapeUpdated(prevState, shape.id, patch), opts);
  const remove = () => set?.("shapes", (_, prevState) => withShapeRemoved(prevState, shape.id));
  const duplicate = () => {
    if (!set) return;
    const dup = withShapeDuplicated(sRef.current, shape.id);
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
      // From here down every remaining branch actually starts a drag (Alt
      // group-duplicate, Alt single-duplicate, group, or single) — none of
      // them return before this point without dragging, so setting it once
      // here covers all four instead of repeating it in each branch.
      setIsMoving(true);

      // Alt+drag on an existing multi-selection duplicates the whole group
      // at once — see the matching block in TextLayer / ImageLayer.
      if (e.altKey && selected && selectedCount > 1) {
        groupDraggingRef.current = true;
        onGroupDragStart(e.clientX, e.clientY, true);
        return;
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

      if (!selected) {
        onSelect(shape.id);
      }
      if (selected && selectedCount > 1) {
        groupDraggingRef.current = true;
        onGroupDragStart(e.clientX, e.clientY);
      } else {
        dragRef.current = {
          px: shapeRef.current.x,
          py: shapeRef.current.y,
          x: e.clientX,
          y: e.clientY,
          activeId: shape.id,
          hasDuplicated: false,
        };
      }

      const onMove = (moveEv: PointerEvent) => {
        if (suppressDragRef?.current) {
          onUp();
          return;
        }
        if (groupDraggingRef.current) {
          onGroupDragMove(moveEv.clientX, moveEv.clientY);
          return;
        }
        const d = dragRef.current;
        if (!d) return;

        const dx = ((moveEv.clientX - d.x) / scale / sRef.current.width) * 100;
        const dy = ((moveEv.clientY - d.y) / scale / sRef.current.height) * 100;
        const isLn = isLineShape(shape.kind);
        const rotRad = ((shape.rotation ?? 0) * Math.PI) / 180;
        const lineLen = shape.size;
        const halfW = isLn
          ? (lineLen / 2) * Math.abs(Math.cos(rotRad)) + (effectiveHeight / 2) * Math.abs(Math.sin(rotRad))
          : shape.size / 2;
        const halfH = isLn
          ? (lineLen / 2) * Math.abs(Math.sin(rotRad)) + (effectiveHeight / 2) * Math.abs(Math.cos(rotRad))
          : effectiveHeight / 2;
        const width = halfW * 2;
        const height = halfH * 2;
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
          showMargins,
        });
        onGuides(snapGuides);
        set?.(
          "shapes",
          (_, prevState) => withShapeUpdated(prevState, targetId, { x: nextX, y: nextY }),
          { continuousKey: `shape-drag-${targetId}` },
        );
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        dragRef.current = null;
        if (groupDraggingRef.current) {
          groupDraggingRef.current = false;
          onGroupDragEnd();
        }
        setIsMoving(false);
        onGuides({ vCenter: false, hCenter: false });
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
    : undefined;

  const handlePointerMove = undefined;
  const handlePointerUp = undefined;

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
          height: isLine
            ? lineHitBoxHeight
            : (typeof effectiveHeight === "number" && Number.isFinite(effectiveHeight) && effectiveHeight > 0
              ? effectiveHeight
              : 200),
          // Only for lines: the hit box above is padded taller than the
          // visual stroke for touch, so center that (fixed-height) visual
          // wrapper inside it rather than letting it stretch to fill.
          ...(isLine ? { display: "flex" as const, alignItems: "center" as const, justifyContent: "center" as const } : null),
          cursor: canInteract ? (locked ? "pointer" : "grab") : undefined,
          zIndex: 10 + index,
          touchAction: "none",
          userSelect: "none",
          outline: "none",
        }}
        className="group"
      >
        {isLineShape(shape.kind) ? (
          <div
            style={{
              width: "100%",
              height: effectiveHeight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              transform: [
                shape.flipH ? "scaleX(-1)" : "",
                shape.flipV ? "scaleY(-1)" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined,
              opacity: (shape.opacity ?? 100) / 100,
              filter: shape.shadow
                ? `drop-shadow(${shape.shadowX ?? 0}px ${shape.shadowY ?? 8}px ${shape.shadowBlur ?? 20}px ${hexToRgba(
                    shape.shadowColor ?? "#000000",
                    (shape.shadowOpacity ?? 35) / 100,
                  )})`
                : undefined,
            }}
          >
            <LineShapeSvg
              kind={shape.kind}
              color={shape.color || "#ffffff"}
              gradient={shape.style === "gradient" ? (shape.gradient ?? "linear-gradient(135deg, #6366f1, #ec4899)") : undefined}
              strokeWidth={shape.strokeWidth ?? 4}
              width={typeof shape.size === "number" && shape.size > 0 ? shape.size : 500}
              height={typeof effectiveHeight === "number" && effectiveHeight > 0 ? effectiveHeight : 24}
            />
          </div>
        ) : (
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
        )}
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
              height: isLine
                ? Math.max(30, (shape.strokeWidth ?? 4) * 3, typeof shape.height === "number" ? shape.height : 30)
                : (typeof effectiveHeight === "number" && Number.isFinite(effectiveHeight) && effectiveHeight > 0
                  ? effectiveHeight
                  : 200),
              zIndex: 80 + index,
              pointerEvents: "none",
            }}
          >
            {/* Outline: only show rectangular border for non-line shapes or when locked */}
            <div
              style={{
                position: "absolute",
                inset: -4,
                border: locked ? "2px dashed #f59e0b" : (isLine ? "none" : "2px solid #0021ff"),
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
            {!(isMoving || isRotating || activeHandle !== null) ? (
              isLine ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: `rotate(${-rotation}deg)`,
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: `calc(50% + ${toolbarPos.x}px)`,
                      top: `calc(50% + ${toolbarPos.y}px)`,
                      transform: "translate(-50%, -100%)",
                      pointerEvents: "auto",
                      zIndex: 90,
                    }}
                  >
                    <LayerToolbar
                      locked={locked}
                      onToggleLock={() => update({ locked: !locked })}
                      onDuplicate={duplicate}
                      onDelete={remove}
                      scale={scale}
                      inline={true}
                    />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    transform: `rotate(${-rotation}deg)`,
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ pointerEvents: "auto" }}>
                    <LayerToolbar
                      locked={locked}
                      onToggleLock={() => update({ locked: !locked })}
                      onDuplicate={duplicate}
                      onDelete={remove}
                      scale={scale}
                      placement="top"
                    />
                  </div>
                </div>
              )
            ) : null}

            {!locked ? (
              <>
                {/* 1. Canva-style Line Endpoint Handles (Two round circles at start and end) */}
                {isLine ? (
                  !(isMoving || isRotating) ? (
                    <>
                      {/* Left (Start) Endpoint Handle — Always visible */}
                      <div
                        data-nopan=""
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setActiveHandle("line-start");
                          lineEndpointDragRef.current = {
                            isEnd: false,
                            startLen: shape.size,
                            startRot: rotation,
                            startCenterX: (shape.x * s.width) / 100,
                            startCenterY: (shape.y * s.height) / 100,
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                          };
                        }}
                        onPointerMove={(e) => {
                          const drag = lineEndpointDragRef.current;
                          if (!drag || drag.isEnd) return;
                          e.stopPropagation();
                          const rad = (drag.startRot * Math.PI) / 180;
                          const halfLen = drag.startLen / 2;
                          const fixedEndPt = {
                            x: drag.startCenterX + halfLen * Math.cos(rad),
                            y: drag.startCenterY + halfLen * Math.sin(rad),
                          };
                          const movingStartPt = {
                            x: drag.startCenterX - halfLen * Math.cos(rad) + (e.clientX - drag.startMouseX) / scale,
                            y: drag.startCenterY - halfLen * Math.sin(rad) + (e.clientY - drag.startMouseY) / scale,
                          };
                          const vx = fixedEndPt.x - movingStartPt.x;
                          const vy = fixedEndPt.y - movingStartPt.y;
                          const newLen = Math.max(20, Math.round(Math.hypot(vx, vy)));
                          let newAngleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
                          const snapAngles = [0, 45, 90, 135, 180, -45, -90, -135, -180, 360];
                          for (const sa of snapAngles) {
                            if (Math.abs(newAngleDeg - sa) <= 3) {
                              newAngleDeg = sa;
                              break;
                            }
                          }
                          const finalRad = (newAngleDeg * Math.PI) / 180;
                          const newCenterX = fixedEndPt.x - (newLen / 2) * Math.cos(finalRad);
                          const newCenterY = fixedEndPt.y - (newLen / 2) * Math.sin(finalRad);
                          const nextX = (newCenterX / s.width) * 100;
                          const nextY = (newCenterY / s.height) * 100;

                          const snapGuides = calculateLineSnapGuides({
                            xPct: nextX,
                            yPct: nextY,
                            length: newLen,
                            angleDeg: newAngleDeg,
                            strokeHeight: effectiveHeight,
                            canvasW: s.width,
                            canvasH: s.height,
                          });
                          onGuides(snapGuides);

                          update(
                            { size: newLen, rotation: Math.round(newAngleDeg * 10) / 10, x: nextX, y: nextY },
                            { continuousKey: `line-endpoint-${shape.id}` },
                          );
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          lineEndpointDragRef.current = null;
                          setActiveHandle(null);
                          onGuides({ vCenter: false, hCenter: false, lines: [] });
                        }}
                        onPointerCancel={(e) => {
                          e.stopPropagation();
                          lineEndpointDragRef.current = null;
                          setActiveHandle(null);
                          onGuides({ vCenter: false, hCenter: false, lines: [] });
                        }}
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          // Hit box scaled by invScale (same zoomed()
                          // compensation the 8 corner/edge resize handles
                          // already use, see getHandleStyle) — without it,
                          // this stayed a fixed 28 canvas-space px, which
                          // shrinks along with everything else once the
                          // whole canvas is scaled down to fit a small
                          // mobile screen, leaving too small a target to tap
                          // reliably. The visible dot below is capped at
                          // 20px real screen size instead of scaling
                          // unbounded with it — same split the corner
                          // handles use (big invisible hit target, small
                          // visible dot), so a zoomed-out canvas gets an
                          // easier-to-tap handle without the circle itself
                          // ballooning.
                          width: 28 * invScale,
                          height: 28 * invScale,
                          pointerEvents: "auto",
                          cursor: "crosshair",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: activeHandle === "line-start" ? 120 : 100,
                        }}
                        className="group"
                        title="Drag endpoint to resize length or angle"
                      >
                        <div
                          className={cn(
                            "rounded-full border-[2.5px] border-[#0021ff] bg-white shadow-md transition-all group-hover:scale-125 group-hover:bg-[#0021ff] group-active:scale-135 group-active:bg-[#0021ff] group-active:ring-4 group-active:ring-[#0021ff]/40",
                            activeHandle === "line-start" && "scale-125 bg-[#0021ff] ring-4 ring-[#0021ff]/40",
                          )}
                          style={{ width: Math.min(20, 20 * invScale), height: Math.min(20, 20 * invScale) }}
                        />
                        {/* Live Measurement Badge anchored outward past start tip */}
                        {activeHandle === "line-start" && (
                          <div
                            style={{
                              position: "absolute",
                              left: Math.abs(rotation % 180) === 90 ? "50%" : `calc(-100% - ${16 * invScale}px)`,
                              top: Math.abs(rotation % 180) === 90 ? `calc(-100% - ${16 * invScale}px)` : "50%",
                              transform: `translate(${Math.abs(rotation % 180) === 90 ? '-50%' : '-100%'}, -50%) rotate(${-rotation}deg) scale(${invScale})`,
                              pointerEvents: "none",
                              zIndex: 250,
                            }}
                            className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#18181b]/95 px-3 py-1 text-xs font-mono font-medium tracking-tight text-white shadow-xl backdrop-blur-md ring-1 ring-white/20 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <span className="text-zinc-400 font-normal">L:</span>
                            <span className="text-white font-semibold">{Math.round(shape.size)}px</span>
                            <span className="text-zinc-600 font-light">•</span>
                            <span className="text-zinc-400 font-normal">∠</span>
                            <span className="text-white font-semibold">{Math.round(rotation)}°</span>
                          </div>
                        )}
                      </div>

                      {/* Right (End) Endpoint Handle — Always visible */}
                      <div
                        data-nopan=""
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          setActiveHandle("line-end");
                          lineEndpointDragRef.current = {
                            isEnd: true,
                            startLen: shape.size,
                            startRot: rotation,
                            startCenterX: (shape.x * s.width) / 100,
                            startCenterY: (shape.y * s.height) / 100,
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                          };
                        }}
                        onPointerMove={(e) => {
                          const drag = lineEndpointDragRef.current;
                          if (!drag || !drag.isEnd) return;
                          e.stopPropagation();
                          const rad = (drag.startRot * Math.PI) / 180;
                          const halfLen = drag.startLen / 2;
                          const fixedStartPt = {
                            x: drag.startCenterX - halfLen * Math.cos(rad),
                            y: drag.startCenterY - halfLen * Math.sin(rad),
                          };
                          const movingEndPt = {
                            x: drag.startCenterX + halfLen * Math.cos(rad) + (e.clientX - drag.startMouseX) / scale,
                            y: drag.startCenterY + halfLen * Math.sin(rad) + (e.clientY - drag.startMouseY) / scale,
                          };
                          const vx = movingEndPt.x - fixedStartPt.x;
                          const vy = movingEndPt.y - fixedStartPt.y;
                          const newLen = Math.max(20, Math.round(Math.hypot(vx, vy)));
                          let newAngleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
                          const snapAngles = [0, 45, 90, 135, 180, -45, -90, -135, -180, 360];
                          for (const sa of snapAngles) {
                            if (Math.abs(newAngleDeg - sa) <= 3) {
                              newAngleDeg = sa;
                              break;
                            }
                          }
                          const finalRad = (newAngleDeg * Math.PI) / 180;
                          const newCenterX = fixedStartPt.x + (newLen / 2) * Math.cos(finalRad);
                          const newCenterY = fixedStartPt.y + (newLen / 2) * Math.sin(finalRad);
                          const nextX = (newCenterX / s.width) * 100;
                          const nextY = (newCenterY / s.height) * 100;

                          const snapGuides = calculateLineSnapGuides({
                            xPct: nextX,
                            yPct: nextY,
                            length: newLen,
                            angleDeg: newAngleDeg,
                            strokeHeight: effectiveHeight,
                            canvasW: s.width,
                            canvasH: s.height,
                          });
                          onGuides(snapGuides);

                          update(
                            { size: newLen, rotation: Math.round(newAngleDeg * 10) / 10, x: nextX, y: nextY },
                            { continuousKey: `line-endpoint-${shape.id}` },
                          );
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          lineEndpointDragRef.current = null;
                          setActiveHandle(null);
                          onGuides({ vCenter: false, hCenter: false, lines: [] });
                        }}
                        onPointerCancel={(e) => {
                          e.stopPropagation();
                          lineEndpointDragRef.current = null;
                          setActiveHandle(null);
                          onGuides({ vCenter: false, hCenter: false, lines: [] });
                        }}
                        style={{
                          position: "absolute",
                          left: "100%",
                          top: "50%",
                          transform: "translate(-50%, -50%)",
                          // See the start handle's own comment above — same
                          // invScale compensation so this stays a real ~28px
                          // tap target on screen at any canvas zoom level.
                          width: 28 * invScale,
                          height: 28 * invScale,
                          pointerEvents: "auto",
                          cursor: "crosshair",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: activeHandle === "line-end" ? 120 : 100,
                        }}
                        className="group"
                        title="Drag endpoint to resize length or angle"
                      >
                        <div
                          className={cn(
                            "rounded-full border-[2.5px] border-[#0021ff] bg-white shadow-md transition-all group-hover:scale-125 group-hover:bg-[#0021ff] group-active:scale-135 group-active:bg-[#0021ff] group-active:ring-4 group-active:ring-[#0021ff]/40",
                            activeHandle === "line-end" && "scale-125 bg-[#0021ff] ring-4 ring-[#0021ff]/40",
                          )}
                          style={{ width: Math.min(20, 20 * invScale), height: Math.min(20, 20 * invScale) }}
                        />
                        {/* Live Measurement Badge anchored outward past end tip */}
                        {activeHandle === "line-end" && (
                          <div
                            style={{
                              position: "absolute",
                              left: `calc(100% + ${16 * invScale}px)`,
                              top: "50%",
                              transform: `translate(0%, -50%) rotate(${-rotation}deg) scale(${invScale})`,
                              pointerEvents: "none",
                              zIndex: 250,
                            }}
                            className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#18181b]/95 px-3 py-1 text-xs font-mono font-medium tracking-tight text-white shadow-xl backdrop-blur-md ring-1 ring-white/20 animate-in fade-in zoom-in-95 duration-100"
                          >
                            <span className="text-zinc-400 font-normal">L:</span>
                            <span className="text-white font-semibold">{Math.round(shape.size)}px</span>
                            <span className="text-zinc-600 font-light">•</span>
                            <span className="text-zinc-400 font-normal">∠</span>
                            <span className="text-white font-semibold">{Math.round(rotation)}°</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : null
                ) : (
                  /* 2. Standard 8 handles for geometric shapes */
                  !(isMoving || isRotating)
                    ? HANDLE_POSITIONS.filter((h) => activeHandle === null || activeHandle === h.id).map((h) => (
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

                          const showResizeGuides = (nextX: number, nextY: number, w: number, h2: number) => {
                            onGuides(
                              calculateAlignmentSnap({
                                currentId: shape.id,
                                rawX: nextX,
                                rawY: nextY,
                                width: w,
                                height: h2,
                                s: sRef.current,
                                otherElements: getAllCanvasElements(sRef.current),
                                showMargins,
                              }).guides,
                            );
                          };
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
                            const nextX = r.startPosX + (shift.dx / s.width) * 100;
                            const nextY = r.startPosY + (shift.dy / s.height) * 100;
                            update(
                              { size: nextWidth, height: nextHeight, x: nextX, y: nextY },
                              { continuousKey: `shape-resize-${shape.id}` },
                            );
                            showResizeGuides(nextX, nextY, nextWidth, nextHeight);
                          } else {
                            const dw = widthDeltaFor(h.id, dx);
                            const dh = heightDeltaFor(h.id, dy);
                            const nextWidth = Math.round(Math.max(10, Math.min(maxBound, r.startWidth + dw)));
                            const nextHeight = Math.round(Math.max(10, Math.min(maxBound, r.startHeight + dh)));
                            const appliedDw = nextWidth - r.startWidth;
                            const appliedDh = nextHeight - r.startHeight;
                            const shift = rotateVector(centerShiftX(h.id, appliedDw), centerShiftY(h.id, appliedDh), rotation);
                            const nextX = r.startPosX + (shift.dx / s.width) * 100;
                            const nextY = r.startPosY + (shift.dy / s.height) * 100;
                            update(
                              { size: nextWidth, height: nextHeight, x: nextX, y: nextY },
                              { continuousKey: `shape-resize-${shape.id}` },
                            );
                            showResizeGuides(nextX, nextY, nextWidth, nextHeight);
                          }
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          resizeRef.current = null;
                          setActiveHandle(null);
                          onGuides({ vCenter: false, hCenter: false });
                        }}
                        onPointerCancel={(e) => {
                          e.stopPropagation();
                          resizeRef.current = null;
                          setActiveHandle(null);
                          onGuides({ vCenter: false, hCenter: false });
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
                    ))
                    : null
                )}

                {/* Rotate & Move Handle Row */}
                {activeHandle === null ? (
                  isLine ? (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        transform: `rotate(${-rotation}deg)`,
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: `calc(50% + ${handlesPos.x}px)`,
                          top: `calc(50% + ${handlesPos.y}px)`,
                          transform: "translate(-50%, -50%)",
                          pointerEvents: "auto",
                          zIndex: 90,
                        }}
                      >
                        <RotateMoveHandleRow
                          containerRef={containerRef}
                          scale={scale}
                          orientation={handlesPos.orientation}
                          docked={false}
                          onRotate={(deg) => update({ rotation: deg })}
                          onGuides={onGuides}
                          onMovePointerDown={handlePointerDown}
                          onMovePointerMove={handlePointerMove}
                          onMovePointerUp={handlePointerUp}
                          isMoving={isMoving}
                          onRotatingChange={setIsRotating}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        transform: `rotate(${-rotation}deg)`,
                        pointerEvents: "none",
                      }}
                    >
                      <RotateMoveHandleRow
                        containerRef={containerRef}
                        scale={scale}
                        onRotate={(deg) => update({ rotation: deg })}
                        onMovePointerDown={handlePointerDown}
                        onMovePointerMove={handlePointerMove}
                        onMovePointerUp={handlePointerUp}
                        isMoving={isMoving}
                        onRotatingChange={setIsRotating}
                        elementRotation={rotation}
                      />
                    </div>
                  )
                ) : null}
              </>
            ) : null}
          </div>,
          controlsOverlayEl,
        )
        : null}

      {/* Multi-Selection Item Outline (shows individual layer selection bounds during marquee or multi-select) */}
      {canInteract && selected && selectedCount > 1 && controlsOverlayEl
        ? createPortal(
          <div
            style={{
              position: "absolute",
              left: `${shape.x}%`,
              top: `${shape.y}%`,
              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              width: typeof shape.size === "number" && Number.isFinite(shape.size) && shape.size > 0 ? shape.size : 200,
              height: isLine
                ? Math.max(16, typeof shape.height === "number" ? shape.height : 24)
                : (typeof effectiveHeight === "number" && Number.isFinite(effectiveHeight) && effectiveHeight > 0
                  ? effectiveHeight
                  : 200),
              zIndex: 80 + index,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -3,
                border: "1.5px solid var(--color-primary, #6366f1)",
                borderRadius: 4,
                pointerEvents: "none",
              }}
            />
          </div>,
          controlsOverlayEl,
        )
        : null}
    </>
  );
});
