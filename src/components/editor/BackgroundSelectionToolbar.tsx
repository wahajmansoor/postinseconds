import { ArrowDown01Icon, ArrowLeft01Icon, Image01Icon, ReloadIcon } from "hugeicons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppTooltip } from "@/components/ui/tooltip";
import { ColorPickerContent } from "@/components/ui/color-picker";
import {
  Chip,
  CompactColorField,
  DragHandle,
  Field,
  FloatingDropdown,
  FloatingToolbarPortal,
  GradientSwatchGrid,
  Range,
  Toggle,
  UploadButton,
  MinimizedToolbarButton,
  MinimizeToolbarButton,
  ToolbarDragGrip,
  useDraggableOffset,
  useStableAnchor,
} from "./ui";
import { GRADIENTS, parseGradientCss, reduceGradientStops, type EditorState } from "./types";

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
  const isMobile = useIsMobile();
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

  // The toolbar row's own drag offset — see ToolbarDragGrip's own comment
  // in ui.tsx.
  const toolbarDrag = useDraggableOffset("background-toolbar");
  const [minimized, setMinimized] = useState(false);
  // See minimizeBaseRef's own comment in ShapeSelectionToolbar.tsx.
  const minimizeBaseRef = useRef({ top: 0, left: 0 });
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
  // 4th stop — only reachable once the 3rd (gradMid) is already on, since a
  // 4-stop gradient is really "the 3-stop one, plus one more" rather than
  // its own independent thing. Re-spaces to even quartiles (0/33/66/100)
  // instead of keeping gradMid pinned at 50% — an even spread reads more
  // intentional than one stop sitting off-center once there are 4 of them.
  const [gradAccent2, setGradAccent2] = useState("#f59e0b");
  const [useAccent2, setUseAccent2] = useState(false);
  const [gradEnd, setGradEnd] = useState("#ec4899");
  const [useMid, setUseMid] = useState(false);
  const [gradType, setGradType] = useState<"linear" | "radial">("linear");
  const [gradAngle, setGradAngle] = useState(135);
  const use4Stops = useMid && useAccent2;
  const customGradValue = useMemo(() => {
    const stops = use4Stops
      ? `${gradStart} 0%, ${gradMid} 33%, ${gradAccent2} 66%, ${gradEnd} 100%`
      : useMid
        ? `${gradStart} 0%, ${gradMid} 50%, ${gradEnd} 100%`
        : `${gradStart} 0%, ${gradEnd} 100%`;
    return gradType === "radial" ? `radial-gradient(circle at center, ${stops})` : `linear-gradient(${gradAngle}deg, ${stops})`;
  }, [gradType, gradAngle, gradStart, gradMid, gradAccent2, gradEnd, useMid, use4Stops]);

  // See the matching block's comment in TextSelectionToolbar.tsx.
  const anyPopoverOpen = solidOpen || gradientOpen || imagePopoverOpen;
  useEffect(() => {
    onAnyPopoverOpenChange?.(anyPopoverOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyPopoverOpen]);

  useEffect(() => {
    const handleReset = () => {
      setGradStart("#6366f1");
      setGradMid("#8b5cf6");
      setGradEnd("#ec4899");
      setUseMid(false);
      setGradType("linear");
      setGradAngle(135);
      setShowCustomGradient(false);
    };
    window.addEventListener("postinseconds:reset-canvas", handleReset);
    return () => window.removeEventListener("postinseconds:reset-canvas", handleReset);
  }, []);

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

  // Collapsed form — see MinimizedToolbarButton's own comment in ui.tsx.
  if (minimized && !detached) {
    return (
      <MinimizedToolbarButton
        baseTop={minimizeBaseRef.current.top}
        baseLeft={minimizeBaseRef.current.left}
        offset={toolbarDrag.offset}
        dragHandleProps={toolbarDrag.dragHandleProps}
        onClick={() => {
          // A real drag ending here should NOT also re-expand — see
          // hasMoved()'s own comment in useDraggableOffset.
          if (toolbarDrag.hasMoved()) return;
          toolbarDrag.reset();
          setMinimized(false);
        }}
      />
    );
  }

  // md:-only card look, matching TextSelectionToolbar/ImageSelectionToolbar/
  // ShapeSelectionToolbar exactly: on mobile this sits bare inside the
  // shared fixed bottom dock (index.tsx), which already supplies its
  // own bg-card/95 backdrop-blur-xl — carrying this same look
  // unconditionally doubled it up as a card-inside-a-card. Desktop
  // still needs it since there it floats free, docked to the selection
  // instead of living inside that shared bottom bar.
  const TOOLBAR_CLASS =
    "flex flex-nowrap items-center gap-1 whitespace-nowrap md:rounded-full md:border md:border-border/80 md:bg-background/95 md:p-1.5 md:shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.06)] md:dark:shadow-[inset_0_1.5px_0_0_rgba(255,255,255,0.15),inset_0_-2.5px_0_0_rgba(0,0,0,0.6),0_12px_40px_rgba(0,0,0,0.45),0_2px_4px_rgba(0,0,0,0.25)] md:backdrop-blur-xl";

  const rowContent = (
    <>
      {/* Drag grip + minimize both hidden on mobile — see the matching
          comment in ShapeSelectionToolbar.tsx. */}
      {!isMobile ? (
        <>
          <ToolbarDragGrip dragHandleProps={toolbarDrag.dragHandleProps} />
          <MinimizeToolbarButton
            onClick={() => {
              if (rowRef.current) {
                const r = rowRef.current.getBoundingClientRect();
                minimizeBaseRef.current = { top: r.top, left: r.left };
              }
              toolbarDrag.reset();
              setMinimized(true);
            }}
          />
        </>
      ) : null}

      <span className="px-1.5 text-[11px] font-bold text-muted-foreground">Background</span>

      {/* Solid — the app's real color picker (color area, hue slider,
          hex/rgb/hsb/hsl, eyedropper, presets), not a stripped-down grid. */}
      <AppTooltip content="Solid color">
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
        >
          <span
            className="h-4 w-4 shrink-0 rounded-[5px] border-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.125)]"
            style={{ background: isSolidActive ? currentSwatch : "#ffffff" }}
          />
          Solid
          <ArrowDown01Icon size={12} className="text-muted-foreground" />
        </button>
      </AppTooltip>
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
      <AppTooltip content="Gradient fill">
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
        >
          <span
            className="h-4 w-4 shrink-0 rounded-[5px] border-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.125)]"
            style={{ background: isGradientActive ? currentSwatch : GRADIENTS[0]?.value }}
          />
          Gradient
          <ArrowDown01Icon size={12} className="text-muted-foreground" />
        </button>
      </AppTooltip>
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
                <GradientSwatchGrid
                  value={isGradientActive ? s.background : undefined}
                  onChange={applyColor}
                />

                <button
                  type="button"
                  onClick={() => {
                    // Seed the editor from whatever gradient is actually
                    // applied right now, instead of leaving it showing
                    // Custom's own unrelated leftover state (this is the
                    // "gradient doesn't show in Custom" bug — see
                    // parseGradientCss's own comment).
                    if (isGradientActive) {
                      const parsed = parseGradientCss(s.background);
                      if (parsed) {
                        const { start, mid, accent2, end } = reduceGradientStops(parsed.stops);
                        setGradStart(start);
                        setGradEnd(end);
                        setUseMid(mid !== undefined);
                        setGradMid(mid ?? "#8b5cf6");
                        setUseAccent2(accent2 !== undefined);
                        setGradAccent2(accent2 ?? "#f59e0b");
                        setGradType(parsed.type);
                        if (parsed.type === "linear") setGradAngle(parsed.angle);
                      }
                    }
                    setShowCustomGradient(true);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  Custom
                  <ArrowDown01Icon size={13} className="-rotate-90 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowCustomGradient(false)}
                    className="flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft01Icon size={14} />
                    Custom Gradient
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGradStart("#6366f1");
                      setGradMid("#8b5cf6");
                      setGradAccent2("#f59e0b");
                      setGradEnd("#ec4899");
                      setUseMid(false);
                      setUseAccent2(false);
                      setGradType("linear");
                      setGradAngle(135);
                    }}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    title="Reset custom gradient"
                  >
                    <ReloadIcon size={11} />
                    Reset
                  </button>
                </div>

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

                {/* CompactColorField (swatch + hex text field only) instead
                    of the full ColorPickerContent — that one's own fixed
                    w-68 layout doesn't fit this dropdown's narrower width
                    (see its own comment), and ColorInput's popover-based
                    picker isn't safe to nest here either: its Radix Popover
                    portals to <body> as a DOM sibling of this whole
                    Gradient dropdown, not a descendant, so FloatingDropdown's
                    outside-click dismissal (a plain Node.contains() check,
                    blind to React's component tree) reads any click inside
                    that nested portal as "outside" and instantly collapses
                    this entire panel — same bug ShapeSelectionToolbar/
                    ImageSelectionToolbar's Shadow Color hit before. A native
                    color input's own picker is a real OS-level UI outside
                    the DOM entirely, so it can't trigger that false
                    positive either. */}
                <Field label="Start color">
                  <CompactColorField value={gradStart} onChange={setGradStart} />
                </Field>
                <Field label="End color">
                  <CompactColorField value={gradEnd} onChange={setGradEnd} />
                </Field>

                <Toggle
                  checked={useMid}
                  onChange={(v) => {
                    setUseMid(v);
                    // Turning the 3rd stop off with the 4th still on would
                    // leave use4Stops's own "useMid && useAccent2" check
                    // stranded — collapse the 4th along with it.
                    if (!v) setUseAccent2(false);
                  }}
                  label="Add 3rd accent color stop"
                />
                {useMid ? (
                  <>
                    <Field label="Middle color stop">
                      <CompactColorField value={gradMid} onChange={setGradMid} />
                    </Field>
                    <Toggle checked={useAccent2} onChange={setUseAccent2} label="Add 4th accent color stop" />
                    {useAccent2 ? (
                      <Field label="4th color stop">
                        <CompactColorField value={gradAccent2} onChange={setGradAccent2} />
                      </Field>
                    ) : null}
                  </>
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
      <AppTooltip content="Set a background image">
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
        >
          <Image01Icon size={15} />
          Image
        </button>
      </AppTooltip>
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
          <div className="max-h-80 max-md:max-h-none space-y-3 overflow-y-auto p-3">
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
      <AppTooltip content="More background options">
        <button type="button" onClick={onOpenBackgroundTab} className={btnBase}>
          More
        </button>
      </AppTooltip>
    </>
  );

  if (detached) {
    return (
      <div
        ref={rowRef}
        style={{
          position: "fixed",
          top: lastLiveRectRef.current?.top ?? 0,
          left: lastLiveRectRef.current?.left ?? 0,
          visibility: "hidden",
          pointerEvents: "none",
        }}
        className={TOOLBAR_CLASS}
      >
        {rowContent}
      </div>
    );
  }

  return (
    <>
      <div ref={rowRef} style={{ width: 1, height: 1 }} />
      <FloatingToolbarPortal anchorRef={rowRef} offset={toolbarDrag.offset} className={TOOLBAR_CLASS}>
        {rowContent}
      </FloatingToolbarPortal>
    </>
  );
}
