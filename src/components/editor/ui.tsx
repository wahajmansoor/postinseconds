import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Add01Icon, ArrowDown01Icon, MinusSignIcon, MultiplicationSignIcon, PinIcon, Upload01Icon } from "hugeicons-react";
import { cn } from "@/lib/utils";
import { AppTooltip, InfoTooltip } from "@/components/ui/tooltip";
import { loadGoogleFont } from "@/lib/fontLoader";
import { ColorPicker, ColorPickerContent, ColorArea, ColorSlider, ColorSwatch, ColorSwatchPicker } from "@/components/ui/color-picker";

export { AppTooltip, InfoTooltip, ColorPicker, ColorPickerContent, ColorArea, ColorSlider, ColorSwatch, ColorSwatchPicker };

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
export function useDraggableOffset() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(
    null,
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    setOffset({ x: d.startOffsetX + (e.clientX - d.startX), y: d.startOffsetY + (e.clientY - d.startY) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = null;
  };

  return {
    offset,
    reset: () => setOffset({ x: 0, y: 0 }),
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
        <span className="relative truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      ) : (
        <span />
      )}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border" />
      <div className="relative flex shrink-0 items-center gap-0.5">
        {onTogglePin ? (
          <button
            type="button"
            data-nopan=""
            title={pinned ? "Unpin (will auto-hide when you click elsewhere)" : "Pin (keep open until closed)"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onTogglePin}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
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

  useEffect(() => {
    if (!anchor || pinned || !onRequestClose) return;
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
  }, [anchor, pinned, onRequestClose, triggerRef]);
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
  }, [anchor]);

  if (!anchor || typeof document === "undefined") return null;
  const flip = correction?.flip ?? false;
  const nudgeX = correction?.nudgeX ?? 0;
  const nudgeY = correction?.nudgeY ?? 0;
  const top = (flip ? anchor.top - gap : anchor.top + anchor.height + gap) + offset.y + nudgeY;
  const left = (align === "center" ? anchor.left + anchor.width / 2 : anchor.left) + offset.x + nudgeX;
  return createPortal(
    <div
      ref={panelRef}
      // Lets mobile's auto-pan-into-view (index.tsx) find every currently-open
      // popover's real on-screen position via a plain DOM query, the same way
      // it already locates the selected layer itself — see the comment on its
      // "Trigger 3" effect for why a live measurement beats a guessed height.
      data-floating-dropdown=""
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
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3"
    >
      {label ? <span className="text-xs font-medium text-foreground">{label}</span> : null}
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

export function ColorInput({
  value,
  onChange,
  showHex = true,
  showAlpha = false,
  className,
  swatchClassName,
  align = "start",
}: {
  value: string;
  onChange: (v: string) => void;
  showHex?: boolean | undefined;
  showAlpha?: boolean | undefined;
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
      className={className}
      swatchClassName={swatchClassName}
      align={align}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-full border border-border bg-input px-4 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
        props.className,
      )}
    />
  );
}

export const AreaInput = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  (props, ref) => {
    return (
      <textarea
        ref={ref}
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

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="range"
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
            onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
            disabled={value <= min}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
            title="Decrease"
          >
            <MinusSignIcon size={12} />
          </button>
          <input
            type="number"
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
            onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
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

  const processFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const readAsDataUrl = (file: File) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
    if (multiple && onFiles) {
      Promise.all(files.map(readAsDataUrl)).then(onFiles);
    } else if (onFile && files[0]) {
      readAsDataUrl(files[0]).then(onFile);
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
