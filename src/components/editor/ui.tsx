import { forwardRef, memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Add01Icon, ArrowDown01Icon, MinusSignIcon, MultiplicationSignIcon, PinIcon, Search01Icon, Tick02Icon, Upload01Icon } from "hugeicons-react";
import { GripHorizontal, Minimize2, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppTooltip, InfoTooltip } from "@/components/ui/tooltip";
import { loadGoogleFont } from "@/lib/fontLoader";
import { compressImageFile } from "@/lib/imageCompression";
import { ColorPicker, ColorPickerContent, ColorArea, ColorSlider, ColorSwatch, ColorSwatchPicker } from "@/components/ui/color-picker";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { findFontOption, fontFamilyToLabel, getFontPool, GRADIENTS, isSameFontFamily, searchAllFonts, type FontOption, type GradientCategory } from "./types";

export { AppTooltip, InfoTooltip, ColorPicker, ColorPickerContent, ColorArea, ColorSlider, ColorSwatch, ColorSwatchPicker };

// Max height for every mobile bottom sheet in the app EXCEPT the main tool
// drawer (see MOBILE_TOOL_DRAWER_SNAP_POINTS below) — every property
// popover routed through FloatingDropdown shares this, so none of them
// ever eats more than a modest slice of the screen. Deliberately a single
// fixed cap, no snap points/drag-to-resize for THESE — at 45vh there's no
// real "peek vs full" to speak of for a single property's controls, and
// the canvas never needs special accommodation for a sheet this short in
// the first place. Kept as a plain fraction for the JS-side safe-area math
// in index.tsx's auto-pan triggers; the matching Tailwind class
// (`max-h-[45vh]`) is a separate literal in each DrawerContent below since
// arbitrary values have to be literal source text for Tailwind's scanner —
// keep both in sync if this ever changes.
export const MOBILE_SHEET_MAX_HEIGHT_FRACTION = 0.45;

// The main tool drawer (index.tsx) — unlike the property-popover sheets
// above, this hosts the entire LeftPanel, so it follows Canva's own mobile
// pattern instead: opens tall (near full screen, room to actually browse/
// type) rather than a cramped peek, and dragging it DOWN locks it to this
// same short MOBILE_SHEET_MAX_HEIGHT_FRACTION height instead of closing
// immediately — only dragging down again from THAT closes it. Order
// matters to vaul: the FIRST snap point is what it opens at by default, so
// tall has to come first here for "opens tall, drag down to shrink" rather
// than the reverse. 0.92, not a full 1 (100vh): at a genuine 100vh the
// sheet's top edge sits flush with the very top of the viewport, and on
// mobile that broke the swipe-down-to-peek/dismiss gesture — confirmed by
// the user, most likely `100vh` on a mobile browser measuring against the
// full layout viewport (including the area the address bar can cover/
// uncover) rather than the actually-visible one, throwing off where the
// drag's start/end coordinates land relative to the sheet. Leaving a small
// sliver of margin at 0.92 keeps the sheet reading as "full screen" while
// staying clear of that edge — anything much lower starts squeezing the
// canvas into a visible, scaled-down sliver above the sheet, which reads as
// broken/cramped rather than intentional (why a bare 45vh was rejected).
export const MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION = 0.92;
export const MOBILE_TOOL_DRAWER_SNAP_POINTS: (number | string)[] = [
  MOBILE_SHEET_MAX_HEIGHT_FRACTION,
  MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION,
];

// Shared by every floating toolbar's Popover dropdowns (Text/Shape/Image/
// Background selection toolbars) so all of them can be dragged to wherever
// the user wants — handy once a popover holds real controls (sliders, a
// live preview, a search box) worth seeing alongside the canvas instead of
// stuck wherever Radix's own anchor-relative positioning first placed it.
// Apply the returned `offset` as a `transform` on an INNER wrapper inside
// PopoverContent, never on PopoverContent itself: Radix's Popper
// positioning imperatively writes its own `transform` directly onto that
// exact element outside React's normal render cycle, so a transform passed
// as a style prop there would just get overwritten on the next reposition.
// Resets to {0,0} whenever the popover closes (call `reset()` from
// `onOpenChange`), so reopening it starts back at the normal anchored
// position rather than wherever it was last dragged to.
//
// `persistKey`, when passed, remembers the offset in module-level memory
// (outside React state entirely) keyed by that string, and seeds a future
// mount's initial offset from it. Needed for ToolbarDragGrip specifically:
// a selection toolbar (Shape/Text/Image/...) is a whole separate component
// instance per selection, so clicking the canvas background to deselect
// unmounts it — reselecting even the SAME layer moments later mounts a
// brand new instance with fresh useState, silently discarding wherever the
// toolbar had been dragged to (reported directly: drag the toolbar, click
// the background, and it "reopens from top" instead of staying where it
// was left). Keying by a fixed per-TOOLBAR-TYPE string (not a per-layer
// id) means the remembered position is shared across every shape/text/
// image toolbar of that type, which is the more useful behavior anyway —
// "I dragged the toolbar out of the way" is a preference about screen
// layout, not about that one specific layer. Every OTHER caller (every
// popover opened from inside a toolbar) omits this and stays exactly as
// ephemeral as before.
const draggableOffsetMemory: Record<string, { x: number; y: number }> = {};
export function useDraggableOffset(persistKey?: string) {
  // On mobile, FloatingDropdown renders these popovers as a draggable
  // bottom sheet instead of a freely-repositionable floating card (see its
  // own comment) — vaul owns the drag gesture there via listeners on the
  // sheet itself, so this hook's own handlers must become no-ops rather
  // than stopPropagation/capture the pointer, which would otherwise steal
  // the same touch sequence vaul needs to recognize a peek/full/dismiss
  // swipe starting from this same DragHandle.
  const isMobile = useIsMobile();
  const [offset, setOffsetState] = useState(() =>
    persistKey && draggableOffsetMemory[persistKey] ? draggableOffsetMemory[persistKey] : { x: 0, y: 0 },
  );
  // Writes through to module-level memory (when persistKey is set) on
  // every update, not just at drag-end — so even a mid-drag unmount (the
  // toolbar can unmount for reasons other than the user releasing the
  // pointer, e.g. undo/redo or a keyboard-driven deselect while dragging)
  // still remembers wherever the toolbar had gotten to.
  const setOffset = (next: { x: number; y: number }) => {
    setOffsetState(next);
    if (persistKey) draggableOffsetMemory[persistKey] = next;
  };
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(
    null,
  );
  // Tracks whether the CURRENT/most recently finished gesture moved far
  // enough to count as a real drag rather than a tap — needed for callers
  // that put a real `onClick` on the same element this hook's own
  // `dragHandleProps` are spread onto (MinimizedToolbarButton, notably).
  // Native click-firing doesn't care how far the pointer traveled between
  // down and up, only whether both landed on the same effective target —
  // and `setPointerCapture` below keeps that target the SAME element
  // throughout the whole gesture regardless of how far the pointer
  // actually moved. So a genuine drag (confirmed directly: dragging the
  // minimized toolbar icon a real distance) still fires a `click` right
  // after, same as a stationary tap would — without this, that click
  // immediately re-expanded the toolbar the instant every single drag
  // ended. `hasMoved()` lets such a caller check this and skip acting on
  // that spurious click.
  const movedRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isMobile) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    movedRef.current = false;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (isMobile) return;
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // A few px of tolerance so a hand that isn't perfectly still during an
    // intended tap doesn't get misread as a drag.
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    setOffset({ x: d.startOffsetX + dx, y: d.startOffsetY + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (isMobile) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  return {
    offset,
    reset: () => setOffset({ x: 0, y: 0 }),
    hasMoved: () => movedRef.current,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}

// `label`, when passed, names the popover right in its own drag bar ("Text
// Font", "Corner Radius", ...) so with several of these things floating
// around the canvas at once, each one is identifiable at a glance instead
// of just being an anonymous grip. The grip line itself always renders too
// (absolutely centered, independent of the other controls' widths on
// either side) — it's the visual cue that this whole bar is draggable, not
// just a plain title bar, so it stays even once a label is doing most of
// that identifying work.
//
// `onTogglePin`, when passed, renders a pin toggle: unpinned (the default
// each time a dropdown opens) means clicking anywhere outside it — another
// control, a different layer, the canvas background — closes it
// automatically, same as a normal dropdown; pinning it suspends that so it
// stays open through all of that instead, until explicitly closed. See
// FloatingDropdown's own `pinned`/`onRequestClose` for where this is
// enforced.
//
// `onClose`, when passed, renders a small X button at the right end of the
// bar — an explicit, unmissable way to dismiss it regardless of pin state.
export function DragHandle({
  label,
  pinned,
  onTogglePin,
  onClose,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  label?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      {...props}
      data-nopan=""
      title="Drag to move"
      className={cn(
        "relative flex cursor-grab items-center justify-between gap-2 rounded-t-2xl py-2 pl-3 pr-1.5 active:cursor-grabbing",
        className,
      )}
      style={{ touchAction: "none" }}
    >
      {label ? (
        label.includes(" — ") ? (
          <div className="relative flex flex-col leading-tight">
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              {label.split(" — ")[0]}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {label.split(" — ")[1]}
            </span>
          </div>
        ) : (
          <span className="relative truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        )
      ) : (
        <span />
      )}
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden md:block h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border" />
      <div className="relative flex shrink-0 items-center gap-0.5">
        {onTogglePin ? (
          <button
            type="button"
            data-nopan=""
            title={pinned ? "Unpin (will auto-hide when you click elsewhere)" : "Pin (keep open until closed)"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onTogglePin}
            className={cn(
              "hidden md:flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
              pinned
                ? "bg-destructive/15 text-destructive"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <PinIcon size={14} />
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            data-nopan=""
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <MultiplicationSignIcon size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Small vertical grip at the very start of a floating SELECTION toolbar's
// own row (Shape/Text/Image/Background, plus the three multi-selection
// variants) — lets the whole toolbar itself be dragged out of the way when
// it's sitting over something the user needs to see. Distinct from
// DragHandle just above (which drags a POPOVER opened from one of the
// toolbar's own buttons) and from each individual popover's own drag
// offset — this is the toolbar row's own offset. Pass it the SAME
// `dragHandleProps` useDraggableOffset() already returns; the caller
// applies the matching `offset` as a `transform: translate(...)` on the
// row itself. Offset naturally resets to {0,0} without any extra code
// whenever the toolbar remounts (e.g. selecting a different layer swaps
// in a fresh toolbar instance) — same "starts back at the normal position"
// behavior useDraggableOffset's own popover usage already relies on.
export function ToolbarDragGrip({
  dragHandleProps,
}: {
  dragHandleProps: ReturnType<typeof useDraggableOffset>["dragHandleProps"];
}) {
  return (
    <AppTooltip content="Drag to move toolbar">
      <div
        {...dragHandleProps}
        data-nopan=""
        className="group flex h-8 w-6 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>
    </AppTooltip>
  );
}

// Portals a floating selection toolbar's EXPANDED row to <body>, drawn
// with `position: fixed` — same reasoning as MinimizedToolbarButton's own
// portal (see its comment): the row's old in-flow `transform:
// translate(...)` approach stays confined to whatever clips its ancestors
// (the canvas viewport has several `overflow-hidden` layers for its own
// clean edges, confirmed directly), so dragging it far enough toward the
// left sidebar just clipped it at the canvas's own boundary before it
// ever reached there — asked for directly ("I need this toolbar on top
// of sidebar panel as well"). Also clamps the final position to stay
// fully inside the viewport ("user can not drag it out of screen its
// stop there") — an errant drag can't lose the toolbar off-screen where
// there'd be no way to get it back.
//
// `anchorRef` is a tiny (1x1px), invisible placeholder the caller renders
// in the row's OLD tree position — still inside the parent's own sticky/
// centering wrapper, so that layout still resolves a sensible horizontal
// center from it. Since a flex `justify-content: center` container always
// centers a child at the same point regardless of that child's own size,
// the anchor's own center lands exactly where the full-width row's own
// center used to — this component then re-derives the row's natural
// top-left from the anchor's center combined with the row's own (now
// portaled) measured width, instead of needing the anchor to somehow be
// full-sized itself. Desktop-only — `useIsMobile()` bails out to a plain
// non-portaled render, since mobile's own bottom-dock layout (a
// horizontally-scrollable bar, no floating positioning at all) has no use
// for any of this.
export function FloatingToolbarPortal({
  anchorRef,
  offset,
  className,
  style,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  offset: { x: number; y: number };
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const contentRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (isMobile) return;
    const anchor = anchorRef.current;
    const content = contentRef.current;
    if (!anchor || !content) return;
    const anchorBox = anchor.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const centerX = anchorBox.left + anchorBox.width / 2;
    const naturalLeft = centerX - contentBox.width / 2;
    const naturalTop = anchorBox.top;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - contentBox.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - contentBox.height - margin);
    const clampedLeft = Math.min(Math.max(naturalLeft + offset.x, margin), maxLeft);
    const clampedTop = Math.min(Math.max(naturalTop + offset.y, margin), maxTop);
    // No dependency array on purpose — the anchor's natural position can
    // shift for reasons with no finite dependency list (canvas pan/zoom,
    // sidebar toggling, window resize), so this re-measures every render.
    // But that means it MUST bail out once the computed value stops
    // changing, or committing a new `rect` object every render triggers
    // another render forever — exactly the infinite
    // `setState`-in-`useLayoutEffect` loop this caused before the guard.
    setRect((prev) => (prev && prev.top === clampedTop && prev.left === clampedLeft ? prev : { top: clampedTop, left: clampedLeft }));
  });

  if (isMobile) {
    return (
      <div data-nopan="" data-keep-text-editing="" style={style} className={className}>
        {children}
      </div>
    );
  }

  return createPortal(
    <div
      ref={contentRef}
      data-nopan=""
      data-keep-text-editing=""
      style={{
        ...style,
        position: "fixed",
        top: rect?.top ?? -9999,
        left: rect?.left ?? -9999,
        zIndex: 200,
        visibility: rect ? "visible" : "hidden",
      }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  );
}

// Collapses a floating selection toolbar's full row down to just
// MinimizedToolbarButton below — for when the row of controls is covering
// something on the canvas the user needs to see but they're not done
// editing yet (so don't want to fully deselect, which would lose the
// selection and every popover's own state along with it). Rendered inline
// in the toolbar's own row (next to ToolbarDragGrip); the caller owns the
// actual `minimized` boolean and swaps its whole row for
// MinimizedToolbarButton once this fires — any of the row's own popovers
// left open closes as a natural side effect of that swap unmounting them,
// which reads as expected ("minimizing closes any open panel") rather
// than needing special handling to force them shut first.
export function MinimizeToolbarButton({ onClick }: { onClick: () => void }) {
  return (
    <AppTooltip content="Minimize toolbar">
      <button
        type="button"
        data-nopan=""
        onClick={onClick}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Minimize2 className="h-3.5 w-3.5" />
      </button>
    </AppTooltip>
  );
}

// The collapsed form a floating selection toolbar takes once
// MinimizeToolbarButton above has been clicked — a single small round
// button (a settings-gear glyph, the usual "more controls live here"
// affordance) with a pulsing blue dot so it still visibly reads as "this
// needs attention / something is selected" even collapsed down to nearly
// nothing.
//
// Portaled straight to <body> and drawn with `position: fixed` — the
// expanded toolbar's own in-flow `transform: translate(...)` approach
// (ToolbarDragGrip) stays confined to whatever clips ITS ancestors
// (several up the tree have `overflow-hidden` for the canvas viewport's
// own clean edges — confirmed directly), which is fine for the expanded
// row since it's only ever dragged short distances near the selection,
// but the whole point of minimizing is to tuck this out of the way
// ANYWHERE on screen (asked for directly: "always on top and move in
// whole screen anywhere") — a portal is what actually escapes that
// clipping and any ancestor stacking context, the same technique
// FloatingDropdown already uses for popovers.
//
// `baseTop`/`baseLeft` are the toolbar's own screen position at the
// instant it was minimized (the caller captures this via the same rowRef/
// getBoundingClientRect() pattern the "detached" ghost-clone case already
// relies on) — `offset` (this toolbar's OWN useDraggableOffset(), reset to
// {0,0} right when minimizing happens) is purely the drag SINCE then, so
// dragging this icon moves it from wherever it appeared, not from some
// unrelated origin. A plain tap (no real movement) expands back to the
// full row via `onClick` — same "a click still fires normally after a
// drag gesture with no movement" behavior every other draggable control
// in this file already relies on. Expanding resets the offset back to
// {0,0} too (see the caller), so the full toolbar reappears docked at its
// normal position above the selection rather than trying to track this
// icon's last dragged spot — the wide row wouldn't necessarily fit
// wherever the small icon was left, so re-docking is the more useful
// default (the same choice restoring a minimized OS window makes, rather
// than trying to preserve the taskbar icon's own position).
export function MinimizedToolbarButton({
  baseTop,
  baseLeft,
  offset,
  dragHandleProps,
  onClick,
}: {
  baseTop: number;
  baseLeft: number;
  offset: { x: number; y: number };
  dragHandleProps: ReturnType<typeof useDraggableOffset>["dragHandleProps"];
  onClick: () => void;
}) {
  return createPortal(
    <AppTooltip content="Maximize toolbar">
      <button
        type="button"
        {...dragHandleProps}
        data-nopan=""
        onClick={onClick}
        style={{
          position: "fixed",
          top: baseTop + offset.y,
          left: baseLeft + offset.x,
          touchAction: "none",
          zIndex: 200,
        }}
        className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-[0_12px_32px_-4px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl transition-transform active:scale-95 active:cursor-grabbing"
      >
        <Settings2 className="h-4 w-4" />
        <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
        </span>
      </button>
    </AppTooltip>,
    document.body,
  );
}

// Captures a dropdown's trigger's on-screen position ONCE, the instant it
// opens — and never updates it again for as long as it stays open, no
// matter what else changes elsewhere on the page. This is what makes a
// dropdown hold completely still once open: something as small as another
// control's own label changing width (e.g. a "Radius: 0px" trigger
// becoming "Radius: Circle") reflows its toolbar row and would otherwise
// nudge Radix's own live anchor-tracking Popover by a few px even though
// the user never touched the dropdown — this sidesteps that class of bug
// entirely by never re-measuring after the initial open. Combined with the
// user's own drag offset (see useDraggableOffset), the anchor captured
// here is the ONLY thing that determines where a dropdown renders — reopen
// it and it recomputes fresh, anchored to wherever its trigger is then.
export function useStableAnchor(open: boolean, triggerRef: React.RefObject<HTMLElement | null>) {
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else if (!open) {
      setAnchor(null);
    }
    // Deliberately only re-runs when `open` itself flips — see the comment
    // above for why re-measuring on any other change would defeat the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return anchor;
}

// Portals a dropdown's content straight to <body>, positioned via
// `position: fixed` purely from the frozen `anchor` (see useStableAnchor)
// plus the caller's own drag `offset` — never from a live-tracked trigger
// ref the way Radix's own Popper positioning works, which is the point:
// nothing else on the page can nudge it once it's open. Replaces Radix's
// Popover/PopoverContent for these dropdowns entirely (not just its
// positioning), including its outside-click dismissal — reimplemented
// below, gated on `pinned`, instead of Radix's own all-or-nothing version
// (which these used to have to block outright with onPointerDownOutside/
// onInteractOutside, since it was firing mid-drag).
export function FloatingDropdown({
  anchor,
  offset,
  align = "start",
  gap = 10,
  className,
  children,
  pinned = false,
  onRequestClose,
  triggerRef,
}: {
  anchor: { top: number; left: number; width: number; height: number } | null;
  offset: { x: number; y: number };
  align?: "start" | "center";
  gap?: number;
  className?: string;
  children: ReactNode;
  // Unpinned (the default each time a dropdown opens — see DragHandle's pin
  // button) means any pointerdown outside this panel and its own trigger
  // closes it automatically, same as a normal dropdown. Pinning suspends
  // that so it stays open through anything else the user does — selecting
  // a different layer, clicking another control, clicking the canvas
  // background — until explicitly closed instead.
  pinned?: boolean;
  onRequestClose?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    // On mobile this renders as a Drawer (see the mobile branch below),
    // which already owns its own overlay-tap/swipe-to-dismiss — this
    // desktop-only "click anywhere else closes it" listener would just be
    // redundant, and would fire before the Drawer's own dismissible check.
    if (isMobile || !anchor || pinned || !onRequestClose) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onRequestClose();
    };
    // Capture phase: catches the interaction before anything it's aimed at
    // (a different trigger, the canvas) gets to act on it, so this dropdown
    // is already closing by the time that other click's own effect (e.g.
    // opening a different dropdown, or deselecting this one's layer) lands.
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isMobile, anchor, pinned, onRequestClose, triggerRef]);
  // One-time collision check, the instant a fresh anchor shows up (i.e.
  // every time this opens) — Radix used to give this for free (flipping
  // above the trigger, or nudging sideways, whenever there wasn't room),
  // and some of these dropdowns genuinely depend on it: the mobile bottom
  // toolbar sits right at the bottom edge of the screen, so a dropdown that
  // always opened downward from it would render mostly or entirely
  // off-screen. Measures the panel's natural (undragged) size at its
  // default position and picks whichever of above/below actually has more
  // room, THEN clamps the result to the viewport regardless — flipping
  // above isn't automatically better if there isn't much room up there
  // either (a viewport short enough that neither side fully fits), so the
  // clamp is what guarantees it never renders mostly off-screen either way,
  // the same safety net Radix's own "shift" behavior gave for free.
  // Deliberately only reacts to `anchor` changing (a fresh open) — once the
  // user has dragged it, this never runs again and never fights them.
  const [correction, setCorrection] = useState<{ flip: boolean; nudgeX: number; nudgeY: number } | null>(null);
  useLayoutEffect(() => {
    // Meaningless on mobile — the mobile branch below doesn't use anchor-
    // relative fixed positioning at all, it's a bottom sheet.
    if (isMobile) return;
    setCorrection(null);
    if (!anchor || !panelRef.current) return;
    const r = panelRef.current.getBoundingClientRect();
    const margin = 8;
    const panelHeight = r.height;
    const spaceBelow = window.innerHeight - (anchor.top + anchor.height + gap);
    const spaceAbove = anchor.top - gap;
    const flip = panelHeight > spaceBelow - margin && spaceAbove > spaceBelow;

    let nudgeX = 0;
    if (r.right > window.innerWidth - margin) nudgeX -= r.right - (window.innerWidth - margin);
    if (r.left + nudgeX < margin) nudgeX = margin - r.left;

    const naturalTop = flip ? anchor.top - gap - panelHeight : anchor.top + anchor.height + gap;
    const clampedTop = Math.max(margin, Math.min(naturalTop, window.innerHeight - panelHeight - margin));
    const nudgeY = clampedTop - naturalTop;

    if (flip || nudgeX !== 0 || nudgeY !== 0) setCorrection({ flip, nudgeX, nudgeY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, anchor]);

  // Mobile: a short bottom sheet (fixed max-h-[45vh] — see
  // MOBILE_SHEET_MAX_HEIGHT_FRACTION above) instead of a fixed-position card
  // anchored to the trigger. A card wide/tall enough to hold real controls
  // (a font search list, several sliders) used to end up covering most of a
  // phone screen wherever it was anchored — no amount of flip/clamp
  // repositioning fixed that, since the problem was the card's own size
  // relative to the viewport, not its position. Capping it to a modest
  // height instead (rather than a tall drag-to-peek sheet) sidesteps that
  // directly — plain vaul drawer behavior, no snapPoints: content up to
  // max-h-[45vh], scrolls internally past that, swipe-down dismisses like
  // any normal sheet. `children` is left exactly as every caller already
  // builds it (their own DragHandle + content) — only that outer wrapper's
  // fixed desktop width is overridden per call site (`max-md:w-full`, see
  // TextSelectionToolbar.tsx etc.) so it stretches to the sheet's full
  // width instead of floating narrow inside it.
  if (isMobile) {
    return (
      <Drawer
        open={!!anchor}
        onOpenChange={(open) => {
          if (!open) onRequestClose?.();
        }}
        dismissible={!pinned}
        shouldScaleBackground={false}
        modal={false}
      >
        {/* pointer-events-none on top of the transparent background — a
            regular `fixed inset-0` overlay would still swallow every touch
            even fully invisible, blocking exactly the canvas
            drag/pan-to-see-behind-the-sheet interaction this is here for.
            Tapping the canvas no longer closes this sheet via the overlay
            because of that; the trigger button, an explicit close, and
            swipe-down on the sheet itself still do. */}
        <DrawerContent
          data-floating-dropdown=""
          data-keep-text-editing=""
          overlayClassName="bg-transparent pointer-events-none"
          className="mt-0 flex max-h-[45vh] flex-col rounded-t-2xl border bg-background shadow-2xl"
        >
          <div
            data-keep-text-editing=""
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-3 py-2 scroll-smooth"
            style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom) + 16px)" }}
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!anchor || typeof document === "undefined") return null;
  const flip = correction?.flip ?? false;
  const nudgeX = correction?.nudgeX ?? 0;
  const nudgeY = correction?.nudgeY ?? 0;
  const top = (flip ? anchor.top - gap : anchor.top + anchor.height + gap) + offset.y + nudgeY;
  const left = (align === "center" ? anchor.left + anchor.width / 2 : anchor.left) + offset.x + nudgeX;
  return createPortal(
    <div
      ref={panelRef}
      // Marks every floating-dropdown DOM node so other code can generically
      // recognize one — kept with data-keep-text-editing so interacting with
      // popovers does not blur active contentEditable text layers.
      data-floating-dropdown=""
      data-keep-text-editing=""
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top,
        left,
        transform:
          [align === "center" ? "translateX(-50%)" : "", flip ? "translateY(-100%)" : ""]
            .filter(Boolean)
            .join(" ") || undefined,
        zIndex: 50,
      }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  );
}

export function Panel({
  title,
  defaultOpen = true,
  collapsible = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section className="rounded-2xl border border-border bg-card/70 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
        <div className="space-y-4">{children}</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card/70 shadow-[var(--shadow-panel)] backdrop-blur transition-all">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </span>
        <ArrowDown01Icon
          size={16}
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            open ? "rotate-180 text-foreground" : "text-muted-foreground",
          )}
        />
      </button>
      {open ? <div className="space-y-4 px-4 pb-4 pt-1">{children}</div> : null}
    </section>
  );
}

export function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card/70 shadow-[var(--shadow-panel)] backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-full px-4 py-3"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </span>
        <ArrowDown01Icon
          size={15}
          className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="space-y-4 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {hint ? <InfoTooltip text={hint} /> : null}
      </div>
      {children}
    </div>
  );
}

export const Chip = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(({ active, className, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/60 hover:text-foreground",
        active && "border-primary bg-primary text-primary-foreground hover:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
});
Chip.displayName = "Chip";

export function Toggle({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn("flex w-full items-center justify-between gap-3 text-left", className)}
    >
      {label ? <span className="text-xs font-semibold text-foreground whitespace-nowrap">{label}</span> : null}
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-primary-foreground transition-all",
            checked ? "left-[1.15rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

// A minimal two-piece color field — a native <input type="color"> swatch
// plus a plain hex text field — instead of the full inline ColorPickerContent
// (color area + hue slider + presets). Built for spots like the Custom
// Gradient stop fields, which are too narrow for that full picker's own
// fixed layout, AND where ColorInput's own popover-based picker isn't safe
// either (its Radix Popover portals to <body> as a DOM sibling of whatever
// FloatingDropdown panel it's nested in, not a descendant — that panel's
// own outside-click dismissal can't tell the popover apart from a genuine
// outside click, and closes the whole thing out from under it; see the
// matching comment on Custom Gradient's own color fields). A native color
// input's own picker is a real OS-level UI, entirely outside the DOM, so it
// can never trigger that same false-positive.
export function CompactColorField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [hexInput, setHexInput] = useState(value);
  useEffect(() => {
    setHexInput(value);
  }, [value]);

  // Tolerant of exactly what a pasted hex code actually looks like coming
  // from somewhere else — a leading '#' or not, any case, stray
  // whitespace, and the 3-digit shorthand (e.g. "f00") — instead of the
  // old strict `/^#[0-9a-fA-F]{6}$/` which silently reverted the field for
  // anything but a lowercase-or-mixed 6-digit value with a '#' and nothing
  // else, shorthand codes included.
  const commitHex = (raw: string = hexInput) => {
    const cleaned = raw.trim().replace(/^#/, "").replace(/[^0-9A-Fa-f]/g, "");
    if (cleaned.length === 3 || cleaned.length === 6) {
      const expanded = cleaned.length === 3 ? cleaned.split("").map((c) => c + c).join("") : cleaned;
      const hex = `#${expanded.toLowerCase()}`;
      setHexInput(hex);
      onChange(hex);
    } else {
      setHexInput(value);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[5px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.125)]">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full cursor-pointer border-none bg-transparent p-0"
          title="Pick a color"
        />
      </div>
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        value={hexInput}
        onChange={(e) => setHexInput(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!pasted.trim()) return;
          e.preventDefault();
          // Paste delivers the whole code at once (no "still typing more"
          // ambiguity the way a bare 3-character prefix while typing would
          // have), so it commits immediately instead of waiting for blur.
          commitHex(pasted);
        }}
        onBlur={() => commitHex()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitHex();
          }
        }}
        spellCheck={false}
        className="h-8 flex-1 min-w-0 rounded-lg border border-border/70 bg-secondary/40 px-2.5 font-mono text-xs uppercase text-foreground outline-none transition-colors focus:border-primary"
      />
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: { label: string; value: string | number; category?: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const val = e.target.value;
        if (typeof val === "string") loadGoogleFont(val);
        onChange(val);
      }}
      className={cn(
        "w-full rounded-xl border border-border bg-input px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary",
        className,
      )}
    >
      {options.map((o) => (
        <option
          key={String(o.value)}
          value={o.value}
          style={{ fontFamily: typeof o.value === "string" ? o.value : undefined }}
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}

// One row in a font search/browse list — shared by every font picker in
// the app (see FontPickerField below, plus TextSelectionToolbar and
// MultiMixedSelectionToolbar's own font popovers). Browsing the full
// Google Fonts catalog can mean well over a thousand rows in the list at
// once, and every earlier version of these pickers eagerly fetched a
// stylesheet — and thus, the instant anything renders text in it, the
// actual font FILE — for every row the moment the list appeared, which was
// fine for the ~50 curated fonts but would mean hundreds+ of concurrent
// font downloads once "all fonts" is on the table. Each row instead only
// calls loadGoogleFont (and only then adopts the real font-family, versus
// just showing its plain-text label in the UI font) once it's actually
// scrolled near the visible area, via IntersectionObserver — so scrolling
// through the full list loads previews progressively instead of all at
// once, and a name never dispatched into view never costs a request at all.
export const FontRow = memo(function FontRow({
  font,
  active,
  isFocused,
  onSelect,
  scrollRef,
  className,
  activeClassName,
  idleClassName,
}: {
  font: FontOption;
  active: boolean;
  isFocused?: boolean;
  onSelect: (value: string) => void;
  scrollRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  activeClassName?: string;
  idleClassName?: string;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isFocused && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isFocused]);

  useEffect(() => {
    if (ready) return;
    // Custom fonts' @font-face rules are already registered in bulk by
    // useCustomFonts as soon as they load (see registerCustomFontFaces) —
    // no per-row fetch needed, and definitely not loadGoogleFont, which
    // would just request a same-named (and almost certainly nonexistent)
    // Google Fonts family for no reason.
    if (font.isCustom) {
      setReady(true);
      return;
    }
    const el = rowRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setReady(true);
      loadGoogleFont(font.value);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          loadGoogleFont(font.value);
          obs.disconnect();
        }
      },
      { root: scrollRef?.current ?? null, rootMargin: "300px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [font.value, font.isCustom, ready, scrollRef]);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={() => onSelect(font.value)}
      style={ready ? { fontFamily: font.value } : undefined}
      className={cn(
        className,
        active ? activeClassName : isFocused ? "bg-secondary text-foreground ring-1 ring-primary/40" : idleClassName,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{font.label}</span>
      {font.isCustom ? (
        <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
          Yours
        </span>
      ) : null}
      {active ? <Tick02Icon size={13} className="shrink-0 text-primary" /> : null}
    </button>
  );
});

// Searchable Font Family field for static sidebar panels (LeftPanel) —
// same search-then-browse-the-full-catalog behavior as the floating
// toolbars' own font popovers (searchAllFonts/FontRow), just packaged as a
// self-contained trigger + portal panel instead of needing those toolbars'
// drag/pin machinery, which a sidebar field has no use for. `catalog` is
// the caller's already-loaded (or still-null, i.e. curated-only-so-far)
// Google Fonts catalog — see loadGoogleFontsCatalog in types.ts; this
// component doesn't fetch it itself so several fields on the same page
// share one fetch instead of each re-requesting the chunk.
export function FontPickerField({
  value,
  onChange,
  catalog,
  customFonts,
  onOpenCustomFonts,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  catalog?: FontOption[] | null;
  /** The user's own uploaded fonts (see useCustomFonts) — merged into the
   * search/browse pool ahead of the Google Fonts catalog. */
  customFonts?: FontOption[] | null;
  /** Renders an "Upload / manage your fonts" row above the list when
   * provided — fired on click, the caller owns the actual dialog. */
  onOpenCustomFonts?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [renderLimit, setRenderLimit] = useState<number>(80);
  const [optimisticVal, setOptimisticVal] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; bottom: number; width: number } | null>(null);

  useEffect(() => {
    setOptimisticVal(null);
  }, [value]);

  const activeValue = optimisticVal ?? value;

  const results = useMemo(() => searchAllFonts(search, catalog, customFonts), [search, catalog, customFonts]);
  const currentLabel = useMemo(() => {
    const found = findFontOption(getFontPool(catalog, customFonts), activeValue);
    return found?.label ?? fontFamilyToLabel(activeValue);
  }, [catalog, customFonts, activeValue]);

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, bottom: r.bottom, width: r.width });
      const idx = results.findIndex((f) => isSameFontFamily(f.value, activeValue));
      setFocusedIndex(idx >= 0 ? idx : 0);
      setRenderLimit(Math.max(80, idx + 30));
    } else if (!open) {
      setRect(null);
      setSearch("");
    }
  }, [open, results, activeValue]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-input px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left" style={{ fontFamily: activeValue }}>
          {currentLabel}
        </span>
        <ArrowDown01Icon
          size={14}
          className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              data-keep-text-editing=""
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: Math.min(rect.bottom + 6, window.innerHeight - 340),
                left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 240) - 8),
                width: Math.max(rect.width, 240),
                zIndex: 50,
              }}
              className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl space-y-2 p-2"
            >
              {/* Currently Selected Font Card on top */}
              <div className="flex items-center justify-between gap-2 rounded-xl bg-secondary/80 border border-border/80 px-2.5 py-1.5 shadow-sm">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block leading-tight">
                    Selected Font
                  </span>
                  <span className="truncate text-xs font-semibold text-foreground block mt-0.5" style={{ fontFamily: activeValue }}>
                    {currentLabel}
                  </span>
                </div>
                <span className="shrink-0 flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  <Tick02Icon size={11} />
                  Active
                </span>
              </div>

              <div className="relative">
                <Search01Icon
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setFocusedIndex(0);
                    setRenderLimit(80);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setFocusedIndex((i) => {
                        const next = results.length > 0 ? (i < results.length - 1 ? i + 1 : 0) : 0;
                        if (next >= renderLimit - 5) setRenderLimit((lim) => lim + 60);
                        return next;
                      });
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setFocusedIndex((i) => (results.length > 0 ? (i > 0 ? i - 1 : results.length - 1) : 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (results[focusedIndex]) {
                        setOptimisticVal(results[focusedIndex].value);
                        onChange(results[focusedIndex].value);
                        setOpen(false);
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setOpen(false);
                    }
                  }}
                  placeholder="Search fonts…"
                  className="w-full rounded-lg border border-border bg-input py-1.5 pl-8 pr-2.5 text-xs text-foreground outline-none transition-colors focus:border-primary"
                />
              </div>
              {onOpenCustomFonts ? (
                <button
                  type="button"
                  onClick={onOpenCustomFonts}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/50 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <Upload01Icon size={12} />
                  Upload / manage your fonts
                </button>
              ) : null}
              <div
                ref={scrollRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollHeight - el.scrollTop - el.clientHeight < 250) {
                    setRenderLimit((lim) => (lim < results.length ? lim + 60 : lim));
                  }
                }}
                className="max-h-60 space-y-0.5 overflow-y-auto pr-0.5"
              >
                {results.length ? (
                  results.slice(0, renderLimit).map((f, idx) => (
                    <FontRow
                      key={f.value}
                      font={f}
                      active={isSameFontFamily(f.value, activeValue)}
                      isFocused={idx === focusedIndex}
                      onSelect={(v) => {
                        setOptimisticVal(v);
                        onChange(v);
                        setOpen(false);
                      }}
                      scrollRef={scrollRef}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors"
                      activeClassName="bg-primary/15 text-primary font-semibold"
                      idleClassName="text-foreground hover:bg-secondary"
                    />
                  ))
                ) : (
                  <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                    No fonts match "{search}"
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function ColorInput({
  value,
  onChange,
  showHex = true,
  showAlpha = false,
  showIcon = false,
  className,
  swatchClassName,
  align = "start",
}: {
  value: string;
  onChange: (v: string) => void;
  showHex?: boolean | undefined;
  showAlpha?: boolean | undefined;
  showIcon?: boolean | undefined;
  className?: string | undefined;
  swatchClassName?: string | undefined;
  align?: "start" | "center" | "end" | undefined;
}) {
  return (
    <ColorPicker
      value={value}
      onChange={onChange}
      showHex={showHex}
      showAlpha={showAlpha}
      showIcon={showIcon}
      className={className}
      swatchClassName={swatchClassName}
      align={align}
    />
  );
}

export function TextInput({ id, name, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const effectiveId = id ?? autoId;
  const effectiveName = name ?? (typeof effectiveId === "string" ? effectiveId : undefined);

  return (
    <input
      id={effectiveId}
      name={effectiveName}
      {...props}
      className={cn(
        "w-full rounded-full border border-border bg-input px-4 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
        props.className,
      )}
    />
  );
}

// A number input with a static unit label (px, °, ...) pinned inside its
// own right edge — Advanced panel's Width/Height/X/Y/Rotate fields (Shape
// and Image toolbars), where the value needs to read as "795.4 px" in one
// box, not a separate label off to the side. Free typing in between commits
// only on blur/Enter, same reasoning as Range's own numeric field: clamping
// mid-keystroke (e.g. while the field is briefly empty, or the user is
// typing "-" before a negative number) would fight the user's own typing.
export function UnitInput({
  value,
  onChange,
  unit,
  step = 1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  unit?: string | undefined;
  step?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
}) {
  const display = (n: number) => String(Math.round(n * 10) / 10);
  const [inputValue, setInputValue] = useState(display(value));

  useEffect(() => {
    setInputValue(display(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    const n = Number(inputValue);
    if (Number.isFinite(n)) {
      let clamped = n;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      onChange(clamped);
    } else {
      setInputValue(display(value));
    }
  };

  const autoId = useId();

  return (
    <div className="relative">
      <input
        type="number"
        id={autoId}
        name={autoId}
        value={inputValue}
        step={step}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-xl border border-border/80 bg-secondary/40 py-2 pl-3 pr-7 text-sm font-medium text-foreground outline-none transition-colors focus:border-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit ? (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

export const AreaInput = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ id, name, ...props }, ref) => {
    const autoId = useId();
    const effectiveId = id ?? autoId;
    const effectiveName = name ?? (typeof effectiveId === "string" ? effectiveId : undefined);

    return (
      <textarea
        ref={ref}
        id={effectiveId}
        name={effectiveName}
        {...props}
        className={cn(
          "w-full resize-y rounded-2xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
          props.className,
        )}
      />
    );
  }
);
AreaInput.displayName = "AreaInput";

// Press-and-hold repeat for every +/- stepper button in the app (Range's
// own below, plus the standalone font-size/zoom steppers elsewhere) — a
// quick tap still fires `onStep` exactly once, immediately on press, same
// as a plain onClick would; holding it down keeps firing at a steady pace
// afterward, like a native OS spin-button, so covering a wide range doesn't
// take twenty separate taps — especially awkward on a touchscreen. Wired
// through pointer events (not a click/touchstart pair) so mouse, touch, and
// pen all get the same behavior for free, and the caller's button should
// drop its own onClick when using this (double-firing otherwise: one shot
// from this hook's pointerdown, one from the browser's own synthesized
// click right after).
export function useHoldRepeat(onStep: () => void) {
  // Ref, not a plain closure var — the repeat interval below is set up
  // once per press and lives across renders, so without this it would
  // keep calling whatever `onStep` closure existed at the moment the press
  // started, ignoring any prop/state changes (e.g. the value it should be
  // stepping from) that land mid-hold.
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const timersRef = useRef<{
    delay: ReturnType<typeof setTimeout> | null;
    interval: ReturnType<typeof setInterval> | null;
  }>({ delay: null, interval: null });

  const stop = () => {
    if (timersRef.current.delay) {
      clearTimeout(timersRef.current.delay);
      timersRef.current.delay = null;
    }
    if (timersRef.current.interval) {
      clearInterval(timersRef.current.interval);
      timersRef.current.interval = null;
    }
  };

  const start = (e: React.PointerEvent) => {
    // Ignore a non-primary mouse button (e.g. right-click); touch/pen
    // presses report button === -1/0 depending on browser, so only gate
    // this for mouse specifically.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stop();
    onStepRef.current();
    // A short pause before the repeat kicks in — mirrors OS spin-button
    // feel and stops a normal, slightly-too-long tap from double-stepping.
    timersRef.current.delay = setTimeout(() => {
      timersRef.current.interval = setInterval(() => onStepRef.current(), 60);
    }, 400);
  };

  // Stop on unmount — e.g. the popover this button lives in closes mid-hold.
  useEffect(() => stop, []);

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  };
}

export function Range({
  value,
  min = 0,
  max = 100,
  step = 1,
  showInput = true,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  showInput?: boolean;
  onChange: (v: number) => void;
}) {
  // Kept as separate local string state — mirrors the same pattern used for
  // the zoom-percent field in index.tsx — so the user can freely type/clear
  // digits without every keystroke being clamped and re-rendered mid-edit.
  // Only commits (parses + clamps) on blur or Enter, and re-syncs whenever
  // `value` changes some other way (dragging the slider itself, or the
  // underlying state changing externally).
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const commit = () => {
    const n = Number(inputValue);
    if (Number.isFinite(n)) {
      onChange(Math.min(max, Math.max(min, n)));
    } else {
      setInputValue(String(value));
    }
  };

  const decHold = useHoldRepeat(() => onChange(Math.max(min, Number((value - step).toFixed(2)))));
  const incHold = useHoldRepeat(() => onChange(Math.min(max, Number((value + step).toFixed(2)))));
  const rangeId = useId();
  const numberId = useId();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="range"
        id={rangeId}
        name={rangeId}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="editor-range min-w-0 flex-1"
      />
      {showInput ? (
        <div className="flex shrink-0 items-center rounded-xl border border-border/80 bg-secondary/40 p-0.5 shadow-sm">
          <button
            type="button"
            {...decHold}
            disabled={value <= min}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
            title="Decrease"
          >
            <MinusSignIcon size={12} />
          </button>
          <input
            type="number"
            id={numberId}
            name={numberId}
            value={inputValue}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                e.currentTarget.blur();
              }
            }}
            className="w-10 shrink-0 bg-transparent text-center font-mono text-xs font-semibold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            {...incHold}
            disabled={value >= max}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
            title="Increase"
          >
            <Add01Icon size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function UploadButton({
  label,
  onFile,
  onFiles,
  multiple = false,
  description = "or drag and drop images here",
}: {
  label: string;
  /** Fires once per selected file. Used in single-select mode. */
  onFile?: (dataUrl: string) => void;
  /** Fires once with every selected file (in order). Used when `multiple`
   * is set — batching avoids each file's async FileReader callback
   * clobbering the others by writing from the same stale state snapshot. */
  onFiles?: (dataUrls: string[]) => void;
  multiple?: boolean;
  description?: string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCountRef = useRef(0);
  const fileInputId = useId();

  const processFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    // Downscaled + re-encoded before ever becoming a data URL — see
    // imageCompression.ts's own comment for why this matters (every image
    // in this app is embedded as base64, not uploaded to object storage).
    if (multiple && onFiles) {
      Promise.all(files.map((f) => compressImageFile(f))).then(onFiles);
    } else if (onFile && files[0]) {
      compressImageFile(files[0]).then(onFile);
    }
  };

  return (
    <label
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCountRef.current += 1;
        if (e.dataTransfer.types.includes("Files")) {
          setIsDragOver(true);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCountRef.current -= 1;
        if (dragCountRef.current <= 0) {
          setIsDragOver(false);
          dragCountRef.current = 0;
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        dragCountRef.current = 0;
        processFiles(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-all",
        isDragOver
          ? "border-primary bg-primary/15 shadow-[var(--shadow-glow)] scale-[1.02]"
          : "border-border/80 bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60",
      )}
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary shadow-sm">
        <Upload01Icon size={20} />
      </span>
      <div>
        <span className="block text-xs font-bold text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      </div>
      <input
        type="file"
        id={fileInputId}
        name={fileInputId}
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files) processFiles(files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

const GRADIENT_GROUPS: { category: GradientCategory; label: string }[] = [
  { category: "monochromatic", label: "Monochromatic" },
  { category: "cool", label: "Cool tones" },
  { category: "warm", label: "Warm tones" },
];

// Grouped gradient-picker layout: rows for Cool tones / Warm tones /
// Monochromatic (each auto-classified in types.ts — see classifyGradient's
// own comment) followed by one "All gradients" grid with everything, using
// the app's usual rounded-square swatches (see swatchClass's own comment
// on why not circular). Shared by every gradient picker in the app (each
// backed by the same GRADIENTS array) so all of them look and behave the
// same rather than four separately-maintained grids drifting apart.
export function GradientSwatchGrid({
  value,
  onChange,
  columns = "grid-cols-6",
}: {
  value?: string | undefined;
  onChange: (v: string) => void;
  /** Tailwind grid-cols-N for every row. */
  columns?: string;
}) {
  // Rounded-square, not circular — deliberately not matching Canva's own
  // circular swatches (or the reference screenshots this whole picker's
  // grouping/color-quality work was modeled on) pixel-for-pixel, to keep
  // this looking like our own UI rather than a lookalike of theirs.
  // No border — a subtle 1px inset white ring (via box-shadow, not an
  // actual border) traces each swatch's own edge instead, softer and less
  // "boxed-in" than a real border against a packed grid. Selected state
  // layers its own ring on top the same way as before; Tailwind's ring-*
  // utilities and this arbitrary inset shadow both compose into the same
  // box-shadow property, so they stack rather than one overriding the other.
  // aspect-square + w-full — NOT a fixed h-*/w-* pixel size — so each
  // swatch always exactly fills its own grid track. A fixed pixel size
  // that happened to add up wider than the popover (7 columns × a fixed
  // 36px each easily exceeds a 256px-wide popover once padding/gaps are
  // subtracted) forced swatches to overflow their tracks and crowd out the
  // `gap` between them entirely — this is what "no gap" looked like.
  const swatchClass = (active: boolean) =>
    cn(
      "aspect-square w-full rounded-[5px] border-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.125)] transition-transform hover:scale-110 active:scale-95",
      active && "ring-2 ring-primary ring-offset-1 ring-offset-background",
    );
  const row = (label: string, items: typeof GRADIENTS) => (
    <div key={label} className="space-y-1.5">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className={cn("grid gap-2", columns)}>
        {items.map((g) => (
          <button
            key={g.label}
            type="button"
            title={g.label}
            onClick={() => onChange(g.value)}
            style={{ background: g.value }}
            className={swatchClass(value === g.value)}
          />
        ))}
      </div>
    </div>
  );
  return (
    <div className="max-h-72 space-y-3 overflow-y-auto pr-0.5">
      {GRADIENT_GROUPS.map(({ category, label }) =>
        row(label, GRADIENTS.filter((g) => g.category === category)),
      )}
      {row("All gradients", GRADIENTS)}
    </div>
  );
}
