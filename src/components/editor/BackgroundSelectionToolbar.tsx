import { ArrowDown01Icon, ArrowLeft01Icon, Image01Icon } from "hugeicons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ColorPickerContent } from "@/components/ui/color-picker";
import {
  Chip,
  ColorInput,
  DragHandle,
  Field,
  FloatingDropdown,
  Range,
  Toggle,
  UploadButton,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { GRADIENTS, type EditorState } from "./types";

// Canva-style top-docked toolbar — same slot and look as TextSelectionToolbar/
// ImageSelectionToolbar/ShapeSelectionToolbar, shown instead of those when the
// canvas's own background is what's selected (a plain click directly on empty
// canvas space — see onSelectBackground in QuoteCanvas.tsx).
//
// Solid, Gradient, and Image each get their own popover rather than being
// crammed into one row — Solid opens the app's actual full color picker
// (ColorPickerContent, the same one used elsewhere, not a stripped-down
// swatch strip), Gradient shows curated presets plus an expandable Custom
// section for building one from scratch, and Image is a real drop
// zone/click-to-upload area (UploadButton), not a bare hidden input. The
// full set of background properties (blur, dim, image position/zoom, extra
// gradient stop, saving a custom gradient) still lives in the sidebar's
// Background tab, one click away via More.
export function BackgroundSelectionToolbar({
  s,
  set,
  onOpenBackgroundTab,
  detached = false,
  onAnyPopoverOpenChange,
}: {
  s: EditorState;
  set: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
  onOpenBackgroundTab?: () => void;
  // See the matching props' comments in TextSelectionToolbar.tsx.
  detached?: boolean;
  onAnyPopoverOpenChange?: (open: boolean) => void;
}) {
  const applyColor = (v: string) => {
    set("background", v);
    set("bgImage", null);
  };

  const isSolidActive = !s.bgImage && s.background.startsWith("#");
  const isGradientActive = !s.bgImage && s.background.includes("gradient");
  const currentSwatch = s.bgImage ? undefined : s.background;

  const [solidOpen, setSolidOpen] = useState(false);
  const [gradientOpen, setGradientOpen] = useState(false);
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);

  // Each dropdown opens unpinned by default — see DragHandle's own comment
  // on `onTogglePin` for what that means.
  const [solidPinned, setSolidPinned] = useState(false);
  const [gradientPinned, setGradientPinned] = useState(false);
  const [imagePinned, setImagePinned] = useState(false);

  const solidDrag = useDraggableOffset();
  const gradientDrag = useDraggableOffset();
  const imageDrag = useDraggableOffset();

  const solidTriggerRef = useRef<HTMLButtonElement>(null);
  const gradientTriggerRef = useRef<HTMLButtonElement>(null);
  const imageTriggerRef = useRef<HTMLButtonElement>(null);
  const solidAnchor = useStableAnchor(solidOpen, solidTriggerRef);
  const gradientAnchor = useStableAnchor(gradientOpen, gradientTriggerRef);
  const imageAnchor = useStableAnchor(imagePopoverOpen, imageTriggerRef);

  // Each popover blocks Radix's own click/focus-outside auto-dismiss (see
  // onPointerDownOutside/onInteractOutside below) — a fast drag was tripping
  // it mid-move — so the only paths that close one now are the trigger's
  // own toggle and the drag handle's X button (both just flip the local
  // open state directly). Everything that should look "fresh" next time —
  // the drag offset, and for Gradient, whether Custom or the preset grid
  // was showing — resets on the OPEN edge, not the close edge: resetting on
  // close would snap the panel back to its anchor position in the same
  // instant the close animation starts, making it visibly jump before it
  // fades out instead of disappearing from wherever the user left it.

  // Custom gradient mini-builder — same fields, same formula, same
  // component (ColorInput) as the sidebar's own "Create Custom Gradient"
  // panel in LeftPanel.tsx. Saving the result to "My Saved Gradients" stays
  // Background-tab-only (via More) rather than also duplicated here.
  const [showCustomGradient, setShowCustomGradient] = useState(false);
  const [gradStart, setGradStart] = useState("#6366f1");
  const [gradMid, setGradMid] = useState("#8b5cf6");
  const [gradEnd, setGradEnd] = useState("#ec4899");
  const [useMid, setUseMid] = useState(false);
  const [gradType, setGradType] = useState<"linear" | "radial">("linear");
  const [gradAngle, setGradAngle] = useState(135);
  const customGradValue = useMemo(() => {
    if (gradType === "radial") {
      return useMid
        ? `radial-gradient(circle at center, ${gradStart} 0%, ${gradMid} 50%, ${gradEnd} 100%)`
        : `radial-gradient(circle at center, ${gradStart} 0%, ${gradEnd} 100%)`;
    }
    return useMid
      ? `linear-gradient(${gradAngle}deg, ${gradStart} 0%, ${gradMid} 50%, ${gradEnd} 100%)`
      : `linear-gradient(${gradAngle}deg, ${gradStart} 0%, ${gradEnd} 100%)`;
  }, [gradType, gradAngle, gradStart, gradMid, gradEnd, useMid]);

  // See the matching block's comment in TextSelectionToolbar.tsx.
  const anyPopoverOpen = solidOpen || gradientOpen || imagePopoverOpen;
  useEffect(() => {
    onAnyPopoverOpenChange?.(anyPopoverOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPopoverOpen]);

  const rowRef = useRef<HTMLDivElement>(null);
  const lastLiveRectRef = useRef<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!detached && rowRef.current) {
      const r = rowRef.current.getBoundingClientRect();
      lastLiveRectRef.current = { top: r.top, left: r.left };
    }
  });

  const btnBase =
    "flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary";

  return (
    <div
      ref={rowRef}
      style={
        detached
          ? {
              position: "fixed",
              top: lastLiveRectRef.current?.top ?? 0,
              left: lastLiveRectRef.current?.left ?? 0,
              visibility: "hidden",
              pointerEvents: "none",
            }
          : undefined
      }
      className="flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-2xl backdrop-blur-md"
    >
      <span className="px-1.5 text-[11px] font-bold text-muted-foreground">Background</span>

      {/* Solid — the app's real color picker (color area, hue slider,
          hex/rgb/hsb/hsl, eyedropper, presets), not a stripped-down grid. */}
      <button
        ref={solidTriggerRef}
        type="button"
        onClick={() => {
          setSolidOpen((wasOpen) => {
            if (!wasOpen) {
              solidDrag.reset();
              setSolidPinned(false);
            }
            return !wasOpen;
          });
        }}
        className={cn(btnBase, isSolidActive && "bg-secondary")}
        title="Solid color"
      >
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-border/60"
          style={{ background: isSolidActive ? currentSwatch : "#ffffff" }}
        />
        Solid
        <ArrowDown01Icon size={12} className="text-muted-foreground" />
      </button>
      <FloatingDropdown
        anchor={solidAnchor}
        offset={solidDrag.offset}
        align="start"
        pinned={solidPinned}
        onRequestClose={() => setSolidOpen(false)}
        triggerRef={solidTriggerRef}
      >
        <div className="overflow-hidden rounded-3xl border border-border bg-background shadow-2xl backdrop-blur-xl">
          <DragHandle
            label="Solid Color"
            {...solidDrag.dragHandleProps}
            pinned={solidPinned}
            onTogglePin={() => setSolidPinned((p) => !p)}
            onClose={() => setSolidOpen(false)}
          />
          <ColorPickerContent value={isSolidActive ? s.background : "#ffffff"} onChange={applyColor} />
        </div>
      </FloatingDropdown>

      {/* Gradient */}
      <button
        ref={gradientTriggerRef}
        type="button"
        onClick={() => {
          setGradientOpen((wasOpen) => {
            if (!wasOpen) {
              // Reopening always starts back at the preset grid, not
              // wherever Custom was left last time.
              setShowCustomGradient(false);
              gradientDrag.reset();
              setGradientPinned(false);
            }
            return !wasOpen;
          });
        }}
        className={cn(btnBase, isGradientActive && "bg-secondary")}
        title="Gradient"
      >
        <span
          className="h-4 w-4 shrink-0 rounded-full border border-border/60"
          style={{ background: isGradientActive ? currentSwatch : GRADIENTS[0]?.value }}
        />
        Gradient
        <ArrowDown01Icon size={12} className="text-muted-foreground" />
      </button>
      <FloatingDropdown
        anchor={gradientAnchor}
        offset={gradientDrag.offset}
        align="start"
        pinned={gradientPinned}
        onRequestClose={() => setGradientOpen(false)}
        triggerRef={gradientTriggerRef}
      >
        <div className="w-64 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <DragHandle
            label="Gradient"
            {...gradientDrag.dragHandleProps}
            pinned={gradientPinned}
            onTogglePin={() => setGradientPinned((p) => !p)}
            onClose={() => setGradientOpen(false)}
          />
          <div className="space-y-3 p-3">
          {!showCustomGradient ? (
            // Preset view — swapped out entirely for the Custom editor below
            // rather than the editor just appending underneath it, so
            // building a gradient from scratch gets the popover's full
            // width/attention instead of competing with a still-visible
            // preset grid above it.
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                {GRADIENTS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => applyColor(g.value)}
                    title={g.label}
                    style={{ background: g.value }}
                    className={cn(
                      "h-10 w-full rounded-xl border transition-transform hover:scale-105 active:scale-95",
                      isGradientActive && s.background === g.value
                        ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                        : "border-border/60",
                    )}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowCustomGradient(true)}
                className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                Custom
                <ArrowDown01Icon size={13} className="-rotate-90 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowCustomGradient(false)}
                className="flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft01Icon size={14} />
                Custom Gradient
              </button>

              <div
                className="relative flex h-20 w-full items-end justify-between rounded-2xl border border-border p-2.5 shadow-inner"
                style={{ background: customGradValue }}
              >
                <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
                  {gradType === "radial" ? "Radial" : `${gradAngle}° Linear`}
                </span>
                <button
                  type="button"
                  onClick={() => applyColor(customGradValue)}
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-950 shadow-md transition-transform hover:scale-105 active:scale-95"
                >
                  Apply
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Start color">
                  <ColorInput value={gradStart} onChange={setGradStart} />
                </Field>
                <Field label="End color">
                  <ColorInput value={gradEnd} onChange={setGradEnd} />
                </Field>
              </div>

              <Toggle checked={useMid} onChange={setUseMid} label="Add 3rd accent color stop" />
              {useMid ? (
                <Field label="Middle color stop">
                  <ColorInput value={gradMid} onChange={setGradMid} />
                </Field>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Chip active={gradType === "linear"} onClick={() => setGradType("linear")}>
                  Linear
                </Chip>
                <Chip active={gradType === "radial"} onClick={() => setGradType("radial")}>
                  Radial
                </Chip>
              </div>
              {gradType === "linear" ? (
                <Field label={`Angle — ${gradAngle}°`}>
                  <Range value={gradAngle} min={0} max={360} onChange={setGradAngle} />
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => setGradAngle(deg)}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                          gradAngle === deg
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary text-muted-foreground hover:border-primary hover:text-foreground",
                        )}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </Field>
              ) : null}
            </div>
          )}
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-0.5 h-5 w-px bg-border/60" />

      {/* Image — a real drop zone/click-to-upload area, not a bare hidden input. */}
      <button
        ref={imageTriggerRef}
        type="button"
        onClick={() => {
          setImagePopoverOpen((wasOpen) => {
            if (!wasOpen) {
              imageDrag.reset();
              setImagePinned(false);
            }
            return !wasOpen;
          });
        }}
        className={cn(btnBase, s.bgImage && "bg-secondary")}
        title="Set a background image"
      >
        <Image01Icon size={15} />
        Image
      </button>
      <FloatingDropdown
        anchor={imageAnchor}
        offset={imageDrag.offset}
        align="start"
        pinned={imagePinned}
        onRequestClose={() => setImagePopoverOpen(false)}
        triggerRef={imageTriggerRef}
      >
        <div className="w-80 max-md:w-full overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <DragHandle
            label="Background Image"
            {...imageDrag.dragHandleProps}
            pinned={imagePinned}
            onTogglePin={() => setImagePinned((p) => !p)}
            onClose={() => setImagePopoverOpen(false)}
          />
          <div className="max-h-[75vh] space-y-3 overflow-y-auto p-3">
          <UploadButton
            label={s.bgImage ? "Change background image" : "Upload background image"}
            onFile={(dataUrl) => set("bgImage", dataUrl)}
          />

          {s.bgImage ? (
            <>
              {/* Same preview card + Position & Zoom + Blur/Darkness
                  controls as the sidebar's own "Background image" panel —
                  100% the same fields, not a trimmed-down subset. */}
              <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-2.5">
                <img
                  src={s.bgImage}
                  alt="Background preview"
                  className="h-14 w-20 shrink-0 rounded-xl border border-border object-cover"
                />
                <div className="flex flex-1 items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Custom Image</span>
                    <span className="text-[10px] text-muted-foreground">Active background</span>
                  </div>
                  <Chip
                    onClick={() => set("bgImage", null)}
                    className="px-2.5 py-1 text-[11px] text-destructive hover:border-destructive hover:text-destructive"
                  >
                    Remove
                  </Chip>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-card/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Position &amp; Zoom</span>
                  {(s.bgImageZoom ?? 100) !== 100 ||
                  (s.bgImagePosX ?? 50) !== 50 ||
                  (s.bgImagePosY ?? 50) !== 50 ? (
                    <button
                      type="button"
                      onClick={() => {
                        set("bgImageZoom", 100);
                        set("bgImagePosX", 50);
                        set("bgImagePosY", 50);
                      }}
                      className="text-[10px] font-medium text-primary hover:underline"
                    >
                      Reset adjustments
                    </button>
                  ) : null}
                </div>

                <Field label={`Zoom — ${s.bgImageZoom ?? 100}%`}>
                  {/* min is 100, not 50 — anything lower shrinks the image
                      below its own "fills the canvas" size, exposing the
                      background behind it instead of zooming out. */}
                  <Range value={s.bgImageZoom ?? 100} min={100} max={300} onChange={(v) => set("bgImageZoom", v)} />
                </Field>

                <Field label={`Left ↔ Right position — ${s.bgImagePosX ?? 50}%`}>
                  <Range value={s.bgImagePosX ?? 50} min={0} max={100} onChange={(v) => set("bgImagePosX", v)} />
                </Field>

                <Field label={`Top ↕ Bottom position — ${s.bgImagePosY ?? 50}%`}>
                  <Range value={s.bgImagePosY ?? 50} min={0} max={100} onChange={(v) => set("bgImagePosY", v)} />
                </Field>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-medium text-muted-foreground">Quick align:</span>
                  <Chip
                    onClick={() => {
                      set("bgImagePosX", 50);
                      set("bgImagePosY", 50);
                    }}
                    active={(s.bgImagePosX ?? 50) === 50 && (s.bgImagePosY ?? 50) === 50}
                    className="px-2 py-0.5 text-[10px]"
                  >
                    Center
                  </Chip>
                  <Chip
                    onClick={() => set("bgImagePosY", 0)}
                    active={(s.bgImagePosY ?? 50) === 0}
                    className="px-2 py-0.5 text-[10px]"
                  >
                    Top
                  </Chip>
                  <Chip
                    onClick={() => set("bgImagePosY", 100)}
                    active={(s.bgImagePosY ?? 50) === 100}
                    className="px-2 py-0.5 text-[10px]"
                  >
                    Bottom
                  </Chip>
                  <Chip
                    onClick={() => set("bgImagePosX", 0)}
                    active={(s.bgImagePosX ?? 50) === 0}
                    className="px-2 py-0.5 text-[10px]"
                  >
                    Left
                  </Chip>
                  <Chip
                    onClick={() => set("bgImagePosX", 100)}
                    active={(s.bgImagePosX ?? 50) === 100}
                    className="px-2 py-0.5 text-[10px]"
                  >
                    Right
                  </Chip>
                </div>
              </div>

              <Field label={`Blur — ${s.bgBlur}px`}>
                <Range value={s.bgBlur} min={0} max={40} onChange={(v) => set("bgBlur", v)} />
              </Field>
              <Field label={`Darkness overlay — ${s.bgDim}%`}>
                <Range value={s.bgDim} min={0} max={90} onChange={(v) => set("bgDim", v)} />
              </Field>
            </>
          ) : null}
          </div>
        </div>
      </FloatingDropdown>

      <div className="mx-0.5 h-5 w-px bg-border/60" />

      {/* More — jumps to the full Background tab for blur/dim/position/zoom */}
      <button type="button" onClick={onOpenBackgroundTab} className={btnBase}>
        More
      </button>
    </div>
  );
}
