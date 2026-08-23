import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllTemplates, upsertTemplate, updateSavedQuoteDesign, fetchSavedQuotes, getSavedDraft, saveActiveDraft, clearActiveDraft } from "@/lib/supabase";
import {
  Add01Icon,
  Bookmark01Icon,
  CenterFocusIcon,
  CheckmarkCircle02Icon,
  CloudIcon,
  Delete02Icon,
  Download01Icon,
  ImageUploadIcon,
  MinusSignIcon,
  Moon02Icon,
  Redo02Icon,
  ReloadIcon,
  RulerIcon,
  SparklesIcon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  AllBookmarkIcon,
  Crown03Icon,
  StarCircleIcon,
  Sun03Icon,
  Tick02Icon,
  Undo02Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
  Layers01Icon as Motion01Icon,
} from "hugeicons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { QuoteCanvas, type TextLayerHandle } from "@/components/editor/QuoteCanvas";
import { LeftPanel } from "@/components/editor/LeftPanel";
import { RightPanel } from "@/components/editor/RightPanel";
import { TextSelectionToolbar } from "@/components/editor/TextSelectionToolbar";
import { ImageSelectionToolbar } from "@/components/editor/ImageSelectionToolbar";
import { ImageCropDialog } from "@/components/editor/ImageCropDialog";
import { ShapeSelectionToolbar } from "@/components/editor/ShapeSelectionToolbar";
import {
  INITIAL_STATE,
  PREMIUM_TEMPLATES,
  STARTER_TEMPLATES,
  TEMPLATES,
  getImageLayers,
  getShapeLayers,
  getTextLayers,
  migrateLegacyContentToLayers,
  withImageDuplicated,
  withImageRemoved,
  withImageUpdated,
  withImagesAdded,
  withShapeDuplicated,
  withShapeRemoved,
  withShapeUpdated,
  withTextDuplicated,
  withTextRemoved,
  withTextUpdated,
  type EditorState,
  type ImageLayer,
  type Template,
} from "@/components/editor/types";
import { AppTooltip, Chip, Panel, Range } from "@/components/editor/ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ExportPreviewDialog } from "@/components/editor/ExportPreviewDialog";
import { TemplatePreview } from "@/components/editor/TemplatePreview";
import { Rulers, RULER_SIZE } from "@/components/editor/Rulers";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UserMenu } from "@/components/auth/UserMenu";
import { GoogleLoginDialog } from "@/components/auth/GoogleLoginDialog";
import { SaveTemplateDialog } from "@/components/editor/SaveTemplateDialog";
import { SignupPage } from "@/components/auth/SignupPage";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomTabBar } from "@/components/editor/MobileBottomTabBar";
import { RAIL, type Tab } from "@/components/editor/rail";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quote Canvas Studio — Design Shareable Quote Images" },
      {
        name: "description",
        content:
          "A modern canvas editor for turning quotes into polished social images: gradients, typography, layout controls and one-click PNG export.",
      },
      { property: "og:title", content: "Quote Canvas Studio — Design Shareable Quote Images" },
      {
        property: "og:description",
        content:
          "Craft quote graphics with live canvas controls, gradient backgrounds and instant PNG download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioRoot,
});

function StudioRoot() {
  return (
    <AuthProvider>
      <StudioGate />
    </AuthProvider>
  );
}

function StudioGate() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="Post In Seconds" className="h-14 w-auto animate-pulse" />
          <p className="text-xs font-semibold text-muted-foreground animate-pulse">
            Connecting to Studio Editor...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <SignupPage />;
  }

  return <Index />;
}

function ZoomInput({
  scale,
  onChange,
}: {
  scale: number;
  onChange: (valPercent: number) => void;
}) {
  const currentPercent = Math.round(scale * 100);
  const [localVal, setLocalVal] = useState(String(currentPercent));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(String(currentPercent));
    }
  }, [currentPercent, isFocused]);

  const commit = () => {
    const raw = localVal.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.max(10, Math.min(250, Math.round(parsed)));
      onChange(clamped);
      setLocalVal(String(clamped));
    } else {
      setLocalVal(String(currentPercent));
    }
  };

  return (
    <input
      type="text"
      value={isFocused ? localVal : `${localVal}%`}
      onFocus={(e) => {
        setIsFocused(true);
        setLocalVal(String(currentPercent));
        e.currentTarget.select();
      }}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={() => {
        setIsFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="h-7 w-12 rounded-lg border border-border/70 bg-card px-1 text-center font-mono text-[11px] font-bold text-foreground transition-all hover:border-primary/50 focus:border-primary focus:bg-background focus:outline-none"
      title="Type zoom percentage and press Enter"
    />
  );
}
function DraggableFloatingLayersButton({
  active,
  layerCount,
  onClick,
}: {
  active: boolean;
  layerCount: number;
  onClick: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    const startPosX = pos ? pos.x : rect.left;
    const startPosY = pos ? pos.y : rect.top;

    let hasMoved = false;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startMouseX;
      const dy = moveEvent.clientY - startMouseY;
      if (!hasMoved && Math.hypot(dx, dy) > 3) {
        hasMoved = true;
        setIsDragging(true);
      }
      if (hasMoved) {
        const nextX = Math.max(10, Math.min(window.innerWidth - 56, startPosX + dx));
        const nextY = Math.max(60, Math.min(window.innerHeight - 56, startPosY + dy));
        setPos({ x: nextX, y: nextY });
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      setIsDragging(false);

      if (!hasMoved) {
        onClick();
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  return (
    <div
      data-nopan=""
      style={{
        position: "fixed",
        left: pos ? `${pos.x}px` : "auto",
        top: pos ? `${pos.y}px` : "auto",
        bottom: pos ? "auto" : "24px",
        right: pos ? "auto" : "24px",
        zIndex: 9999,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <AppTooltip content="Drag anywhere on screen · Click to open Layers">
        <button
          ref={btnRef}
          type="button"
          onPointerDown={startDrag}
          className={`group relative flex h-11 w-11 items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-xl transition-transform select-none ${
            isDragging
              ? "scale-110 border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
              : active
                ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)] hover:scale-105"
                : "border-border/80 bg-card/95 text-foreground shadow-xl hover:border-primary/60 hover:bg-card hover:shadow-2xl hover:scale-105"
          }`}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          <Motion01Icon
            size={20}
            className={
              active || isDragging
                ? "text-primary-foreground"
                : "text-primary transition-transform group-hover:scale-110"
            }
          />
          {layerCount > 0 ? (
            <span
              className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black shadow-md transition-colors ${
                active || isDragging
                  ? "bg-background text-foreground border border-border"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {layerCount}
            </span>
          ) : null}
        </button>
      </AppTooltip>
    </div>
  );
}

function Index() {
  const { user } = useAuth();
  const [s, setS] = useState<EditorState>(() => {
    const draft = getSavedDraft();
    if (draft) {
      return migrateLegacyContentToLayers({ ...INITIAL_STATE, ...draft });
    }
    return INITIAL_STATE;
  });
  const [tab, setTab] = useState<Tab>("templates");
  const [textSubTab, setTextSubTab] = useState<"add" | "effects">("add");
  const [templateCategory, setTemplateCategory] = useState<"starter" | "premium" | "saved">("starter");
  const [scale, setScale] = useState(0.49);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [dark, setDark] = useState(true);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const isMobile = useIsMobile();
  const [mobileToolDrawerOpen, setMobileToolDrawerOpen] = useState(false);
  const [mobileExportDrawerOpen, setMobileExportDrawerOpen] = useState(false);
  const [croppingImageLayer, setCroppingImageLayer] = useState<ImageLayer | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isExportingFinal, setIsExportingFinal] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  const dragCounterRef = useRef(0);
  const isInitialMountRef = useRef(true);

  // Active template / saved post being edited targets
  const [editingTemplateTarget, setEditingTemplateTarget] = useState<{
    id: string;
    label: string;
    description?: string;
    category?: "starter" | "premium";
  } | null>(null);
  const [editingSavedQuoteTarget, setEditingSavedQuoteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Spacebar pan mode listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        document.body.classList.add("alt-held");
      }
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (e.code === "Space" && !isInput && !spaceRef.current) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        document.body.classList.remove("alt-held");
      }
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    const handleWindowBlur = () => {
      document.body.classList.remove("alt-held");
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      document.body.classList.remove("alt-held");
    };
  }, []);

  // Debounced Auto-Save Working Draft
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    setAutoSaveStatus("saving");
    const timer = setTimeout(() => {
      saveActiveDraft(s);
      setAutoSaveStatus("saved");
    }, 600);
    return () => clearTimeout(timer);
  }, [s]);

  const [stageMarquee, setStageMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Marquee (drag-to-select) is desktop-only. On mobile it used to arm
    // itself off the very first touch's pointerdown and track every
    // subsequent pointermove on `window` regardless of which finger moved —
    // so adding a second finger to pinch-zoom fed that same loop bogus
    // coordinates (jumping between the two touches' pointer ids) while the
    // dedicated touchstart/touchmove pinch handler below was simultaneously
    // trying to scale the stage, fighting each other and making zoom feel
    // unreliable. Bailing out here entirely on mobile removes that
    // competing gesture so multi-finger pinch-zoom is the only thing
    // handling touch there.
    if (isMobile) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, [data-nopan], [contenteditable='true']")) {
      return;
    }

    const stageEl = stageRef.current;
    if (!stageEl) return;
    const stageRect = stageEl.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startStageX = e.clientX - stageRect.left + stageEl.scrollLeft;
    const startStageY = e.clientY - stageRect.top + stageEl.scrollTop;

    const initialSelected = e.shiftKey ? canvasSelection : [];
    let hasMoved = false;

    if (!e.shiftKey) {
      setCanvasSelection([]);
    }

    const onPointerMove = (moveEvt: PointerEvent) => {
      const currentStageRect = stageEl.getBoundingClientRect();
      const currentClientX = moveEvt.clientX;
      const currentClientY = moveEvt.clientY;
      const currentStageX = currentClientX - currentStageRect.left + stageEl.scrollLeft;
      const currentStageY = currentClientY - currentStageRect.top + stageEl.scrollTop;

      const dx = currentClientX - startClientX;
      const dy = currentClientY - startClientY;

      if (!hasMoved && Math.hypot(dx, dy) > 4) {
        hasMoved = true;
      }

      setStageMarquee({
        startX: startStageX,
        startY: startStageY,
        currentX: currentStageX,
        currentY: currentStageY,
      });

      if (hasMoved) {
        const marqueeClientLeft = Math.min(startClientX, currentClientX);
        const marqueeClientRight = Math.max(startClientX, currentClientX);
        const marqueeClientTop = Math.min(startClientY, currentClientY);
        const marqueeClientBottom = Math.max(startClientY, currentClientY);

        const canvasEl = canvasRef.current;
        if (!canvasEl) return;
        const canvasRect = canvasEl.getBoundingClientRect();

        const matched: { kind: "image" | "text" | "shape"; id: string }[] = [...initialSelected];

        // Shapes
        for (const sh of getShapeLayers(s)) {
          const cx = canvasRect.left + (sh.x / 100) * (s.width * scale);
          const cy = canvasRect.top + (sh.y / 100) * (s.height * scale);
          const w = (typeof sh.size === "number" && sh.size > 0 ? sh.size : 200) * scale;
          const h = (typeof sh.height === "number" && sh.height > 0 ? sh.height : w);
          const left = cx - w / 2;
          const right = cx + w / 2;
          const top = cy - h / 2;
          const bottom = cy + h / 2;

          if (!(left > marqueeClientRight || right < marqueeClientLeft || top > marqueeClientBottom || bottom < marqueeClientTop)) {
            if (!matched.some((m) => m.kind === "shape" && m.id === sh.id)) {
              matched.push({ kind: "shape", id: sh.id });
            }
          }
        }

        // Images
        for (const img of getImageLayers(s)) {
          const cx = canvasRect.left + (img.x / 100) * (s.width * scale);
          const cy = canvasRect.top + (img.y / 100) * (s.height * scale);
          const w = (typeof img.size === "number" && img.size > 0 ? img.size : 200) * scale;
          const h = (typeof img.height === "number" && img.height > 0 ? img.height : w);
          const left = cx - w / 2;
          const right = cx + w / 2;
          const top = cy - h / 2;
          const bottom = cy + h / 2;

          if (!(left > marqueeClientRight || right < marqueeClientLeft || top > marqueeClientBottom || bottom < marqueeClientTop)) {
            if (!matched.some((m) => m.kind === "image" && m.id === img.id)) {
              matched.push({ kind: "image", id: img.id });
            }
          }
        }

        // Texts
        for (const txt of getTextLayers(s)) {
          const cx = canvasRect.left + (txt.x / 100) * (s.width * scale);
          const cy = canvasRect.top + (txt.y / 100) * (s.height * scale);
          const baseW = txt.width && txt.width > 0 ? txt.width : Math.max(120, (txt.text?.length || 10) * (txt.size * 0.55));
          const baseH = txt.minHeight && txt.minHeight > 0 ? txt.minHeight : txt.size * 1.5;
          const w = baseW * scale;
          const h = baseH * scale;
          const left = cx - w / 2;
          const right = cx + w / 2;
          const top = cy - h / 2;
          const bottom = cy + h / 2;

          if (!(left > marqueeClientRight || right < marqueeClientLeft || top > marqueeClientBottom || bottom < marqueeClientTop)) {
            if (!matched.some((m) => m.kind === "text" && m.id === txt.id)) {
              matched.push({ kind: "text", id: txt.id });
            }
          }
        }

        setCanvasSelection(matched);
      }
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      setStageMarquee(null);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  // Mobile-only counterpart to handleStagePointerDown's deselect-on-blank-
  // click above: that handler bails out entirely on mobile (marquee/drag-
  // select competes with pinch-zoom there), so tapping empty stage space
  // never cleared a selection on touch devices. A plain `click` doesn't fire
  // for multi-touch/pinch gestures, so it's safe to use here without
  // reintroducing that conflict — it only reacts to a genuine single tap.
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "button, input, textarea, [data-nopan], [data-layer-id], [contenteditable='true']",
      )
    ) {
      return;
    }
    setCanvasSelection([]);
  };

  // Platform templates state (synced with Supabase database & Admin dashboard)
  const [platformTemplates, setPlatformTemplates] = useState<Template[]>(TEMPLATES);

  const loadTemplates = useCallback(async () => {
    try {
      const list = await fetchAllTemplates();
      if (list && list.length > 0) {
        setPlatformTemplates(list);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadTemplates();
    const handleTemplateSaved = () => {
      loadTemplates();
    };
    window.addEventListener("postinseconds:template-saved", handleTemplateSaved);
    return () => window.removeEventListener("postinseconds:template-saved", handleTemplateSaved);
  }, [loadTemplates, tab, saveTemplateOpen]);

  const starterTemplates = useMemo(() => {
    return platformTemplates.filter(
      (t) =>
        (t as any).category === "starter" ||
        (!t.id.includes("founder") &&
          !t.id.includes("hormozi") &&
          !t.id.includes("jasmin") &&
          !t.id.includes("viral") &&
          !t.id.includes("cyber") &&
          !t.id.includes("creator") &&
          !t.id.includes("luxury")),
    );
  }, [platformTemplates]);

  const premiumTemplates = useMemo(() => {
    return platformTemplates.filter(
      (t) =>
        (t as any).category === "premium" ||
        t.id.includes("founder") ||
        t.id.includes("hormozi") ||
        t.id.includes("jasmin") ||
        t.id.includes("viral") ||
        t.id.includes("cyber") ||
        t.id.includes("creator") ||
        t.id.includes("luxury"),
    );
  }, [platformTemplates]);

  // Tracks the canvas's own selection (which layer(s) are currently
  // selected) purely so the top-docked TextSelectionToolbar below knows
  // when to appear — selection itself stays owned by QuoteCanvas; this is
  // just a mirror of it. registerTextLayerHandle collects each text
  // layer's imperative formatting API (see TextLayerHandle in
  // QuoteCanvas.tsx) in a plain Map keyed by id, so the toolbar can drive
  // whichever one is currently selected without the canvas needing to
  // expose its internal DOM/selection state at all.
  const [canvasSelection, setCanvasSelection] = useState<
    { kind: "image" | "text" | "shape"; id: string }[]
  >([]);
  const textLayerHandlesRef = useRef<Map<string, TextLayerHandle>>(new Map());
  const registerTextLayerHandle = useCallback((id: string, handle: TextLayerHandle | null) => {
    if (handle) textLayerHandlesRef.current.set(id, handle);
    else textLayerHandlesRef.current.delete(id);
  }, []);

  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageSizeRef = useRef({ width: 0, height: 0 });
  const isCustomZoomRef = useRef(false);
  // Mirrors `scale` for the pinch-zoom effect below, so that effect can read
  // the always-current scale without depending on `scale` itself — see the
  // comment on that effect for why depending on scale directly was a bug.
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  const [guidesH, setGuidesH] = useState<number[]>([]);
  const [guidesV, setGuidesV] = useState<number[]>([]);

  const calculateFitScale = useCallback(
    (stageW?: number, stageH?: number) => {
      const stW = stageW ?? (stageSizeRef.current.width > 0 ? stageSizeRef.current.width : stageRef.current?.clientWidth ?? 800);
      const stH = stageH ?? (stageSizeRef.current.height > 0 ? stageSizeRef.current.height : stageRef.current?.clientHeight ?? 600);

      const rulerOffset = showRulers ? RULER_SIZE : 0;
      // Exact padding matching stage padding (16px on mobile, 64px on desktop)
      const paddingX = isMobile ? 16 : 64;
      const paddingY = isMobile ? 16 : 64;

      const availW = Math.max(100, stW - rulerOffset - paddingX);
      const availH = Math.max(100, stH - rulerOffset - paddingY);

      const canvasW = s.width > 0 ? s.width : 1200;
      const canvasH = s.height > 0 ? s.height : 1500;

      const scaleX = availW / canvasW;
      const scaleY = availH / canvasH;
      const optimal = Math.min(scaleX, scaleY);

      return Math.max(0.1, Math.min(2.0, Math.floor(optimal * 100) / 100));
    },
    [s.width, s.height, showRulers, isMobile],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      stageSizeRef.current = { width, height };
      setStageSize({ width, height });

      // Automatically recalculate optimal fit when viewport resizes or browser zooms
      if (!isCustomZoomRef.current && width > 100 && height > 100) {
        const autoScale = calculateFitScale(width, height);
        setScale(autoScale);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [calculateFitScale]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Any canvas text (quote/name/tagline, or a free-floating text layer) is
  // directly contentEditable — clicking into one to type gives it browser
  // focus. Clicking anywhere else should end that editing state, but with
  // as many independent drag handlers as the canvas has (each doing its
  // own setPointerCapture + stopPropagation), relying on the browser's
  // implicit "mousedown elsewhere blurs the old focus" behavior is
  // fragile. A capture-phase listener on the document guarantees it
  // regardless — capture runs before any handler's stopPropagation could
  // matter. **Except** for the text-selection toolbar (data-keep-text-
  // editing): that toolbar's whole point is letting the user act on a
  // highlighted range while it's still focused/selected — since this
  // listener runs in the capture phase, it fires before the toolbar
  // buttons' own React handlers (and before their preventDefault, which
  // exists for exactly this) ever get a chance, so without this
  // exclusion every click on the toolbar blurred the text first, which
  // collapsed the Selection, which made every "format the highlighted
  // range" command see no selection at all and silently fall back to
  // "whole layer" instead. Confirmed directly: the console trace for this
  // exact blur pointed straight back to this handler, with
  // relatedTarget: null (this calls `.blur()` directly rather than focus
  // moving to a specific new element, which is why relatedTarget doesn't
  // show it).
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.isContentEditable || active.contains(e.target as Node)) return;
      if ((e.target as HTMLElement | null)?.closest("[data-keep-text-editing]")) return;
      active.blur();
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, []);

  // Sync dark class to html documentElement
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const history = useRef<EditorState[]>([INITIAL_STATE]);
  const historyIdx = useRef(0);
  const lastCommitTimeRef = useRef<number>(0);
  const lastCommitKeyRef = useRef<string>("");

  const commit = useCallback(
    (fn: (prev: EditorState) => EditorState, opts?: { replace?: boolean; key?: string }) => {
      setS((prev) => {
        const next = fn(prev);
        if (next === prev) return prev;

        const now = Date.now();
        const timeSinceLast = now - lastCommitTimeRef.current;
        const sameKey = opts?.key && opts.key === lastCommitKeyRef.current;

        // Group rapid continuous updates (e.g. dragging a layer at 60fps, typing, slider scrubbing)
        // into a single undo frame so 1 press of Ctrl+Z undos the full action immediately.
        const shouldReplace =
          historyIdx.current > 0 &&
          (opts?.replace || (sameKey && timeSinceLast < 600));

        if (shouldReplace) {
          history.current[historyIdx.current] = next;
        } else {
          history.current = history.current.slice(0, historyIdx.current + 1);
          history.current.push(next);
          // Keep a healthy, fast history buffer of 50 states
          if (history.current.length > 50) {
            history.current.shift();
          }
          historyIdx.current = history.current.length - 1;
        }

        lastCommitTimeRef.current = now;
        if (opts?.key) lastCommitKeyRef.current = opts.key;

        return next;
      });
    },
    [],
  );

  const set = useCallback(
    <K extends keyof EditorState>(k: K, v: EditorState[K]) => {
      commit((p) => ({ ...p, [k]: v }), { key: String(k) });
    },
    [commit],
  );

  const undo = useCallback(() => {
    if (historyIdx.current > 0) {
      historyIdx.current -= 1;
      const target = history.current[historyIdx.current];
      if (target) {
        setS(target);
        // Reset grouping timer so subsequent changes start a fresh undo frame
        lastCommitTimeRef.current = 0;
      }
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIdx.current < history.current.length - 1) {
      historyIdx.current += 1;
      const target = history.current[historyIdx.current];
      if (target) {
        setS(target);
        lastCommitTimeRef.current = 0;
      }
    }
  }, []);

  // "Fit canvas to screen" computes the true proportional scale needed
  // to fit the entire canvas comfortably inside the current stage viewport with
  // breathing room on all sides, automatically adapting to browser zoom levels,
  // screen resolutions, and ruler offsets.
  const fit = useCallback(() => {
    isCustomZoomRef.current = false;
    const autoScale = calculateFitScale();
    setScale(autoScale);
    const stageEl = stageRef.current;
    if (stageEl) {
      requestAnimationFrame(() => {
        stageEl.scrollTo({
          left: Math.max(0, (stageEl.scrollWidth - stageEl.clientWidth) / 2),
          top: Math.max(0, (stageEl.scrollHeight - stageEl.clientHeight) / 2),
          behavior: "smooth",
        });
      });
    }
  }, [calculateFitScale]);

  useEffect(() => {
    fit();
  }, [fit, s.width, s.height, showRulers]);

  // Global keyboard shortcuts:
  // - Ctrl+Z (Cmd+Z on Mac): Undo
  // - Ctrl+Y or Ctrl+Shift+Z (Cmd+Shift+Z on Mac): Redo
  // - Ctrl+0 (Cmd+0 on Mac): Fit canvas to screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isInput = active?.tagName === "INPUT" || active?.tagName === "TEXTAREA";

      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        if (!isInput) {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        if (!isInput) {
          e.preventDefault();
          redo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0")) {
        e.preventDefault();
        fit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fit, undo, redo]);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    isCustomZoomRef.current = true;
    setScale((prevScale) => {
      const nextScale = Math.max(0.1, Math.min(2.5, Math.round(prevScale * factor * 100) / 100));
      const stageEl = stageRef.current;
      if (nextScale === prevScale || !stageEl) return nextScale;

      const rect = stageEl.getBoundingClientRect();
      const focalX = clientX !== undefined ? clientX - rect.left : stageEl.clientWidth / 2;
      const focalY = clientY !== undefined ? clientY - rect.top : stageEl.clientHeight / 2;

      const scrollX = stageEl.scrollLeft;
      const scrollY = stageEl.scrollTop;
      const scaleRatio = nextScale / prevScale;

      // Written synchronously (not in a follow-up rAF) — scrollLeft/scrollTop
      // are plain instant DOM writes, so there's nothing to wait a frame
      // for, and deferring them used to add a full extra frame of lag on
      // top of the caller's own rAF throttle (see the pinch-zoom effect
      // below), which is exactly what made touch pinch-zoom feel a beat
      // behind your fingers.
      stageEl.scrollLeft = (scrollX + focalX) * scaleRatio - focalX;
      stageEl.scrollTop = (scrollY + focalY) * scaleRatio - focalY;

      return nextScale;
    });
  }, []);

  const zoomToScale = useCallback((targetScale: number, focalClientX?: number, focalClientY?: number) => {
    isCustomZoomRef.current = true;
    setScale((prevScale) => {
      const nextScale = Math.max(0.1, Math.min(2.5, targetScale));
      const stageEl = stageRef.current;
      if (nextScale === prevScale || !stageEl) return nextScale;

      // Focal point defaults to viewport center (slider/+-/typed-%
      // callers have no natural focal point of their own); pinch-zoom
      // passes the actual midpoint between the two fingers so the canvas
      // zooms around your fingers instead of jumping to re-center itself.
      const rect = stageEl.getBoundingClientRect();
      const focalX = focalClientX !== undefined ? focalClientX - rect.left : stageEl.clientWidth / 2;
      const focalY = focalClientY !== undefined ? focalClientY - rect.top : stageEl.clientHeight / 2;
      const scrollX = stageEl.scrollLeft;
      const scrollY = stageEl.scrollTop;
      const scaleRatio = nextScale / prevScale;

      stageEl.scrollLeft = (scrollX + focalX) * scaleRatio - focalX;
      stageEl.scrollTop = (scrollY + focalY) * scaleRatio - focalY;

      return nextScale;
    });
  }, []);

  // Zoom in/out buttons step by percentage points
  const zoomBy = useCallback((deltaPercent: number) => {
    isCustomZoomRef.current = true;
    setScale((prevScale) => {
      const nextScale = Math.max(0.1, Math.min(2.5, Math.round((prevScale + deltaPercent / 100) * 100) / 100));
      const stageEl = stageRef.current;
      if (!stageEl || nextScale === prevScale) return nextScale;

      const focalX = stageEl.clientWidth / 2;
      const focalY = stageEl.clientHeight / 2;
      const scrollX = stageEl.scrollLeft;
      const scrollY = stageEl.scrollTop;
      const scaleRatio = nextScale / prevScale;

      stageEl.scrollLeft = (scrollX + focalX) * scaleRatio - focalX;
      stageEl.scrollTop = (scrollY + focalY) * scaleRatio - focalY;

      return nextScale;
    });
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Zoom with Ctrl/Cmd or trackpad pinch gesture
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
        zoomAt(factor, e.clientX, e.clientY);
      }
      // Otherwise natural vertical and horizontal scrolling happens!
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Mobile Touch Pinch-to-Zoom support (60fps requestAnimationFrame).
  // Reads/writes `scale` through `scaleRef` rather than closing over the
  // `scale` state value directly, specifically so this effect's deps don't
  // need `scale` in them — the old version depended on [scale, zoomToScale],
  // which re-ran (tearing down and re-registering all four touch listeners)
  // on every single scale change, i.e. on every frame of an active pinch
  // gesture. Removing/re-adding native listeners mid-gesture isn't free and
  // could drop a touchmove landing exactly during the swap — a real
  // contributor to "pinch feels slow", on top of the double-rAF latency
  // fixed in zoomToScale above. `isMobile` replaces it as the dependency
  // instead of dropping to `[zoomToScale]` alone: `canvasStage` (which owns
  // this ref) lives in two different branches of this component's JSX
  // (mobile vs desktop shells), so when `isMobile` resolves after mount and
  // flips the rendered branch, the stage `<div>` is a genuinely new DOM node
  // and this effect must re-run to attach to it — `scale` changing around
  // the same time (via the `fit()` effect) was accidentally standing in for
  // that signal before; `isMobile` is the real one.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    let initialPinchDist: number | null = null;
    let initialScale = scaleRef.current;
    let rafId: number | null = null;
    let pendingScale: number | null = null;
    let pendingFocalX = 0;
    let pendingFocalY = 0;

    const getTouchDist = (e: TouchEvent) => {
      if (e.touches.length < 2) return null;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!t1 || !t2) return null;
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    };

    const getTouchMidpoint = (e: TouchEvent) => {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!t1 || !t2) return null;
      return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        e.stopPropagation();
        initialPinchDist = getTouchDist(e);
        initialScale = scaleRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && initialPinchDist && initialPinchDist > 0) {
        e.preventDefault();
        e.stopPropagation();
        const currentDist = getTouchDist(e);
        const midpoint = getTouchMidpoint(e);
        if (currentDist && midpoint) {
          const ratio = currentDist / initialPinchDist;
          const targetScale = Math.max(0.1, Math.min(2.5, initialScale * ratio));
          pendingScale = Math.round(targetScale * 100) / 100;
          pendingFocalX = midpoint.x;
          pendingFocalY = midpoint.y;

          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              if (pendingScale !== null) {
                zoomToScale(pendingScale, pendingFocalX, pendingFocalY);
              }
              rafId = null;
            });
          }
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDist = null;
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isMobile, zoomToScale]);

  // Templates and saved quotes (loaded the same way — see LeftPanel's
  // "My saved" tab) both come through here, so this is also the one place
  // that needs to upgrade an old-format saved design (fixed `quote`/
  // `boxColor`/... fields, no shapes/texts) into the layer model —
  // migrateLegacyContentToLayers() is a no-op for anything already in the
  // new format (every STARTER_TEMPLATE, and INITIAL_STATE itself).
  const applyTemplate = useCallback((templateState: Partial<EditorState>) => {
    setEditingSavedQuoteTarget(null);
    setCanvasSelection([]);
    commit((prev) => {
      const hasLayers =
        (templateState.shapes && templateState.shapes.length > 0) ||
        (templateState.texts && templateState.texts.length > 0) ||
        (templateState.images && templateState.images.length > 0);

      const merged: EditorState = {
        ...INITIAL_STATE,
        width: prev.width || 1200,
        height: prev.height || 1500,
        exportFormat: prev.exportFormat,
        exportScale: prev.exportScale,
        ...templateState,
        shapes: templateState.shapes ? JSON.parse(JSON.stringify(templateState.shapes)) : [],
        texts: templateState.texts ? JSON.parse(JSON.stringify(templateState.texts)) : [],
        images: templateState.images ? JSON.parse(JSON.stringify(templateState.images)) : [],
        layersInitialized: Boolean(templateState.layersInitialized || hasLayers),
      };
      return migrateLegacyContentToLayers(merged);
    });
  }, [commit]);

  // If a template was selected for editing from the Admin Control Center, load it on mount
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("postinseconds_load_template");
      if (raw) {
        sessionStorage.removeItem("postinseconds_load_template");
        const template = JSON.parse(raw);
        if (template?.state) {
          applyTemplate(template.state);
          const isPrem =
            template.category === "premium" ||
            template.id?.includes("founder") ||
            template.id?.includes("hormozi") ||
            template.id?.includes("jasmin") ||
            template.id?.includes("viral") ||
            template.id?.includes("cyber") ||
            template.id?.includes("creator") ||
            template.id?.includes("luxury");
          setEditingTemplateTarget({
            id: template.id,
            label: template.label || "Untitled Template",
            description: template.description || "",
            category: isPrem ? "premium" : "starter",
          });
        }
      }
    } catch {}
  }, [applyTemplate]);

  const handleQuickSaveTemplate = async () => {
    if (!editingTemplateTarget) return;
    setIsSavingTemplate(true);
    try {
      const updated: Template = {
        id: editingTemplateTarget.id,
        label: editingTemplateTarget.label,
        description: editingTemplateTarget.description || "",
        state: { ...s },
      };
      await upsertTemplate(updated, editingTemplateTarget.category === "premium");
      await loadTemplates();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleQuickSaveSavedQuote = async () => {
    if (!editingSavedQuoteTarget) return;
    setIsSavingTemplate(true);
    try {
      await updateSavedQuoteDesign(
        editingSavedQuoteTarget.id,
        editingSavedQuoteTarget.title,
        { ...s },
        user?.id,
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const renderExport = async (targetScale: number = s.exportScale) => {
    if (!canvasRef.current) return null;
    const mod = await import("html-to-image");
    const opts = {
      pixelRatio: targetScale,
      width: s.width,
      height: s.height,
      cacheBust: false,
    };
    try {
      if (s.exportFormat === "gif") {
        const { renderFullCanvasGif } = await import("@/lib/gifRenderer");
        return await renderFullCanvasGif(canvasRef.current, s);
      }
      return s.exportFormat === "jpg"
        ? await mod.toJpeg(canvasRef.current, { ...opts, quality: 0.95 })
        : s.exportFormat === "webp"
          ? await mod.toCanvas(canvasRef.current, opts).then((c) => c.toDataURL("image/webp", 0.95))
          : await mod.toPng(canvasRef.current, opts);
    } catch (err) {
      console.error("Export render failed:", err);
      return await mod.toPng(canvasRef.current, { ...opts, pixelRatio: 1 });
    }
  };

  // Download now goes through a fast preview step: instant 1x preview render,
  // then final high-res export only when confirmed.
  const openExportPreview = async () => {
    if (!canvasRef.current || busy) return;
    setCanvasSelection([]);
    (document.activeElement as HTMLElement | null)?.blur();
    window.getSelection()?.removeAllRanges();

    setPreviewUrl(null);
    setPreviewOpen(true);
    setBusy(true);

    // Brief tick to clear UI selection handles from DOM
    await new Promise((r) => setTimeout(r, 40));

    try {
      // Instant 1x preview render
      const url = await renderExport(1);
      setPreviewUrl(url);
    } finally {
      setBusy(false);
    }
  };

  const confirmDownload = async () => {
    if (isExportingFinal) return;
    setIsExportingFinal(true);
    try {
      let finalUrl = previewUrl;
      // If higher resolution requested, render full quality for file save
      if (s.exportScale !== 1 && s.exportFormat !== "gif") {
        finalUrl = await renderExport(s.exportScale);
      }
      if (!finalUrl) return;
      const a = document.createElement("a");
      a.href = finalUrl;
      a.download = `quote-canvas.${s.exportFormat}`;
      a.click();
      setPreviewOpen(false);
    } finally {
      setIsExportingFinal(false);
    }
  };

  // When rulers are visible, shift the canvas's effective center by half
  // the ruler strip's thickness so it clears the top/left ruler bands
  // instead of the ruler overlay covering the canvas's own top-left corner.
  // Same offset feeds both the canvas transform and the Rulers component's
  // own coordinate math, so their tick/guide positions stay in sync with
  // where the canvas actually renders.
  const rulerOffset = showRulers ? RULER_SIZE / 2 : 0;
  const effectivePan = { x: pan.x + rulerOffset, y: pan.y + rulerOffset };

  const [onlySelected] = canvasSelection;
  const selectedTextLayer =
    canvasSelection.length === 1 && onlySelected?.kind === "text"
      ? getTextLayers(s).find((t) => t.id === onlySelected.id)
      : undefined;

  const registeredTextHandle = selectedTextLayer
    ? textLayerHandlesRef.current.get(selectedTextLayer.id)
    : undefined;

  const fallbackTextHandle = useMemo((): TextLayerHandle | undefined => {
    if (!selectedTextLayer) return undefined;
    return {
      applyFormat: (cmd) => {
        if (cmd === "bold")
          set("texts", withTextUpdated(s, selectedTextLayer.id, { weight: selectedTextLayer.weight >= 700 ? 400 : 700 }));
        else if (cmd === "italic")
          set("texts", withTextUpdated(s, selectedTextLayer.id, { italic: !selectedTextLayer.italic }));
        else if (cmd === "underline")
          set("texts", withTextUpdated(s, selectedTextLayer.id, { underline: !selectedTextLayer.underline }));
        else if (cmd === "strike")
          set("texts", withTextUpdated(s, selectedTextLayer.id, { strike: !selectedTextLayer.strike }));
      },
      setFontFamily: (v) => set("texts", withTextUpdated(s, selectedTextLayer.id, { fontFamily: v })),
      setSize: (v) => {
        const currentSize = selectedTextLayer.size || 32;
        const ratio = v / currentSize;
        const nextWidth = selectedTextLayer.width ? Math.round(Math.max(40, selectedTextLayer.width * ratio)) : undefined;
        const nextMinHeight = selectedTextLayer.minHeight ? Math.round(selectedTextLayer.minHeight * ratio) : undefined;
        set("texts", withTextUpdated(s, selectedTextLayer.id, {
          size: v,
          ...(nextWidth !== undefined ? { width: nextWidth } : {}),
          ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
        }));
      },
      setColor: (v) => set("texts", withTextUpdated(s, selectedTextLayer.id, { color: v })),
      setAlign: (v) => set("texts", withTextUpdated(s, selectedTextLayer.id, { align: v })),
      setLetterSpacing: (v) => set("texts", withTextUpdated(s, selectedTextLayer.id, { letterSpacing: v })),
      setLineHeight: (v) => set("texts", withTextUpdated(s, selectedTextLayer.id, { lineHeight: v })),
      setVerticalAlign: (v) => set("texts", withTextUpdated(s, selectedTextLayer.id, { verticalAlign: v })),
      updateLayer: (patch) => set("texts", withTextUpdated(s, selectedTextLayer.id, patch)),
      snapshotSelection: () => {},
      getActiveFormat: () => ({
        bold: selectedTextLayer.weight >= 700,
        italic: !!selectedTextLayer.italic,
        underline: !!selectedTextLayer.underline,
        strike: !!selectedTextLayer.strike,
        bulletList: false,
        numberedList: false,
      }),
      subscribeActiveFormat: (cb) => {
        cb({
          bold: selectedTextLayer.weight >= 700,
          italic: !!selectedTextLayer.italic,
          underline: !!selectedTextLayer.underline,
          strike: !!selectedTextLayer.strike,
          bulletList: false,
          numberedList: false,
        });
        return () => {};
      },
    };
  }, [selectedTextLayer, s, set]);

  const selectedTextLayerHandle = registeredTextHandle || fallbackTextHandle;

  const selectedImageLayer =
    canvasSelection.length === 1 && onlySelected?.kind === "image"
      ? getImageLayers(s).find((img) => img.id === onlySelected.id)
      : undefined;

  const selectedShapeLayer =
    canvasSelection.length === 1 && onlySelected?.kind === "shape"
      ? getShapeLayers(s).find((sh) => sh.id === onlySelected.id)
      : undefined;

  const handleSelectLayer = useCallback(
    (
      layer: { kind: "image" | "text" | "shape"; id: string },
      opts?: { toggle?: boolean; selectAll?: boolean },
    ) => {
      setMobileToolDrawerOpen(false);
      if (opts?.selectAll) {
        const all: { kind: "image" | "text" | "shape"; id: string }[] = [
          ...getTextLayers(s).map((t) => ({ kind: "text" as const, id: t.id })),
          ...getImageLayers(s).map((img) => ({ kind: "image" as const, id: img.id })),
          ...getShapeLayers(s).map((sh) => ({ kind: "shape" as const, id: sh.id })),
        ];
        setCanvasSelection(all);
        return;
      }
      if (opts?.toggle) {
        setCanvasSelection((prev) => {
          const exists = prev.some((p) => p.kind === layer.kind && p.id === layer.id);
          return exists
            ? prev.filter((p) => !(p.kind === layer.kind && p.id === layer.id))
            : [...prev, layer];
        });
      } else {
        setCanvasSelection([layer]);
      }
    },
    [s],
  );

  // The canvas stage — drag/drop handlers, gradient backdrop, marquee
  // overlay, the floating per-selection toolbar, QuoteCanvas itself, and the
  // rulers overlay — is identical on desktop and mobile, just hosted inside
  // different surrounding chrome (a normal <main> column on desktop, a
  // full-bleed flex column above the bottom tab bar on mobile). Built once
  // here as a plain JSX value and referenced from both render branches below
  // so none of that logic/markup has to be duplicated.
  const mobileToolbarBottomOffset = "calc(60px + env(safe-area-inset-bottom))";
  const canvasStage = (
    <div
      className={cn(
        "relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background",
        isMobile && "select-none touch-manipulation",
      )}
    >
      {/*
        Two stacked, always-mounted gradient layers crossfaded via
        opacity instead of one element whose background-image swaps
        on the .dark class.
        - Removed/hidden on mobile (md:block) for a clean native background.
        - Fixed in the viewport frame on desktop so the gradient stays static
          and never shifts or tears as the user pans, zooms, or scrolls the canvas.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden md:block transition-opacity duration-500 ease-in-out"
        style={{ background: "var(--gradient-stage-light)", opacity: dark ? 0 : 1 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden md:block transition-opacity duration-500 ease-in-out"
        style={{ background: "var(--gradient-stage-dark)", opacity: dark ? 1 : 0 }}
      />

      {/* Drag and Drop File Hover Overlay */}
      {isDraggingOver ? (
        <div className="pointer-events-none absolute inset-3 z-[150] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/15 shadow-2xl backdrop-blur-sm animate-pulse">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-background/95 px-7 py-6 shadow-2xl">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <ImageUploadIcon size={28} />
            </span>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground">Drop images to add to canvas</p>
              <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPG, WEBP, GIF, SVG</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Scrollable Stage Viewport */}
      <div
        ref={stageRef}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current += 1;
          if (e.dataTransfer.types.includes("Files")) {
            setIsDraggingOver(true);
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
          dragCounterRef.current -= 1;
          if (dragCounterRef.current <= 0) {
            setIsDraggingOver(false);
            dragCounterRef.current = 0;
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingOver(false);
          dragCounterRef.current = 0;

          const files = Array.from(e.dataTransfer.files).filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length === 0) return;

          const readPromises = files.map((file) => {
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => {
                resolve((event.target?.result as string) || "");
              };
              reader.readAsDataURL(file);
            });
          });

          const dataUrls = (await Promise.all(readPromises)).filter(Boolean);
          if (dataUrls.length === 0) return;

          const res = withImagesAdded(s, dataUrls);
          set("images", res.list);
          set("layerOrder", res.layerOrder);
          if (res.newIds[0]) {
            handleSelectLayer({ kind: "image", id: res.newIds[0] });
          }
        }}
        onPointerDown={handleStagePointerDown}
        onClick={handleStageClick}
        // Scrollbar visibility (visible-and-themed on desktop, fully
        // hidden on touch) comes from the global pointer-aware rule in
        // styles.css — no per-element scrollbar classes needed here.
        className="relative h-full w-full overflow-auto"
      >
        {/* Marquee Selection Rectangle (Canva style) */}
        {stageMarquee && Math.hypot(stageMarquee.currentX - stageMarquee.startX, stageMarquee.currentY - stageMarquee.startY) > 4 ? (
          <div
            style={{
              position: "absolute",
              left: Math.min(stageMarquee.startX, stageMarquee.currentX),
              top: Math.min(stageMarquee.startY, stageMarquee.currentY),
              width: Math.abs(stageMarquee.currentX - stageMarquee.startX),
              height: Math.abs(stageMarquee.currentY - stageMarquee.startY),
              border: "1.5px solid var(--color-primary, #6366f1)",
              backgroundColor: "rgba(99, 102, 241, 0.22)",
              boxShadow: "0 0 16px rgba(99, 102, 241, 0.15)",
              borderRadius: 4,
              pointerEvents: "none",
              zIndex: 110,
            }}
          />
        ) : null}

        {/* Floating Selection Toolbar — sticky-top on desktop, docked just
            above the bottom tab bar (Canva-mobile pattern) and horizontally
            scrollable on mobile since its contents don't wrap. */}
        {!isMobile && !stageMarquee && canvasSelection.length === 1 ? (
          <div
            className="pointer-events-none z-40 flex justify-center overflow-visible sticky top-4 h-0 w-full"
            style={{ margin: "0 auto" }}
          >
            <div
              data-nopan=""
              data-keep-text-editing=""
              style={{ maxWidth: "calc(100% - 24px)", width: "fit-content" }}
              className="pointer-events-auto relative"
            >
              {selectedTextLayer && selectedTextLayerHandle ? (
                <TextSelectionToolbar
                  layer={selectedTextLayer}
                  handle={selectedTextLayerHandle}
                  onOpenEffectsTab={() => {
                    setTab("text");
                    setTextSubTab("effects");
                    setLeftPanelCollapsed(false);
                  }}
                />
              ) : selectedImageLayer ? (
                <ImageSelectionToolbar
                  layer={selectedImageLayer}
                  onUpdate={(patch) =>
                    set("images", withImageUpdated(s, selectedImageLayer.id, patch))
                  }
                  onOpenCrop={() => setCroppingImageLayer(selectedImageLayer)}
                />
              ) : selectedShapeLayer ? (
                <ShapeSelectionToolbar
                  layer={selectedShapeLayer}
                  onUpdate={(patch) =>
                    set("shapes", withShapeUpdated(s, selectedShapeLayer.id, patch))
                  }
                  onDuplicate={() => {
                    const dup = withShapeDuplicated(s, selectedShapeLayer.id);
                    set("shapes", dup.list);
                    setCanvasSelection([{ kind: "shape", id: dup.newId }]);
                  }}
                  onDelete={() => {
                    set("shapes", withShapeRemoved(s, selectedShapeLayer.id));
                    setCanvasSelection([]);
                  }}
                  onToggleLock={() =>
                    set(
                      "shapes",
                      withShapeUpdated(s, selectedShapeLayer.id, {
                        locked: !selectedShapeLayer.locked,
                      }),
                    )
                  }
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Scrollable Canvas Centering Area */}
        <div
          className="relative flex min-h-full min-w-full items-center justify-center p-6 md:p-8"
          style={{
            width: "max-content",
            height: "max-content",
            minWidth: "100%",
            minHeight: "100%",
            margin: "auto",
          }}
        >
          <div
            style={{
              width: s.width * scale,
              height: s.height * scale,
              position: "relative",
              flexShrink: 0,
              transform: "translateZ(0)",
              backfaceVisibility: "hidden",
              willChange: "width, height, transform",
            }}
            className="shadow-[var(--shadow-panel)] ring-1 ring-border"
          >
            <div
              style={{
                width: s.width,
                height: s.height,
                transform: `scale(${scale}) translateZ(0)`,
                transformOrigin: "top left",
                backfaceVisibility: "hidden",
              }}
            >
              <QuoteCanvas
                ref={canvasRef}
                s={s}
                interactive
                scale={scale}
                set={set}
                selection={canvasSelection}
                onSelectionChange={setCanvasSelection}
                registerTextLayerHandle={registerTextLayerHandle}
              />
            </div>
          </div>
        </div>

        {showRulers ? (
          <Rulers
            stageWidth={stageSize.width}
            stageHeight={stageSize.height}
            canvasWidth={s.width}
            canvasHeight={s.height}
            scale={scale}
            pan={effectivePan}
            guidesH={guidesH}
            guidesV={guidesV}
            onGuidesHChange={setGuidesH}
            onGuidesVChange={setGuidesV}
            dark={dark}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-screen h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
        <header
          className="sticky top-0 z-50 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 pb-2 sm:gap-4 sm:px-5"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
        >
          <div className="flex items-center gap-2.5 sm:gap-3">
            <img src="/logo.png" alt="Post In Seconds" className="h-8 w-auto sm:h-9" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* 1. + Icon (New Blank Post Action) */}
            <AppTooltip content="Clear canvas and start a fresh blank post">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className="grid h-8 w-8 place-items-center rounded-full border border-border/80 bg-secondary/40 text-muted-foreground transition-all hover:border-border hover:bg-secondary hover:text-foreground active:scale-95 sm:flex sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
                title="New Post"
              >
                <Add01Icon size={15} />
                <span className="hidden sm:inline">New Post</span>
              </button>
            </AppTooltip>

            {editingTemplateTarget ? (
              <div className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 shadow-sm">
                <span className="text-xs font-semibold text-foreground">
                  Editing: <span className="font-bold text-primary">{editingTemplateTarget.label}</span>
                </span>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {editingTemplateTarget.category === "premium" ? "Premium" : "Starter"}
                </span>
                <button
                  type="button"
                  onClick={handleQuickSaveTemplate}
                  disabled={isSavingTemplate}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm transition-all active:scale-95 ${
                    saveSuccess
                      ? "bg-emerald-500 text-white"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                  title="Save changes to template"
                >
                  <Bookmark01Icon size={13} />
                  <span>
                    {saveSuccess ? "✓ Updated!" : isSavingTemplate ? "Updating..." : "Save Updated"}
                  </span>
                </button>
                <Link
                  to="/admin"
                  className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Admin
                </Link>
                <button
                  type="button"
                  onClick={() => setEditingTemplateTarget(null)}
                  className="rounded-full p-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title="Exit editing mode"
                >
                  ✕
                </button>
              </div>
            ) : null}

            {/* 2. Premium Icon */}
            <AppTooltip content="Browse pre-designed Premium templates">
              <div className="flex items-center">
                {/* Mobile compact icon button */}
                <button
                  type="button"
                  onClick={() => {
                    setTab("templates");
                    setTemplateCategory("premium");
                    if (isMobile) {
                      setMobileToolDrawerOpen(true);
                    } else {
                      setLeftPanelCollapsed(false);
                    }
                    window.dispatchEvent(new CustomEvent("postinseconds:open-premium"));
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-sm transition-all hover:bg-amber-500/20 active:scale-95 md:hidden"
                  title="Premium Templates"
                >
                  <Crown03Icon size={16} className="text-amber-500" />
                </button>

                {/* Desktop/Tablet full badge button */}
                <div className="group relative hidden items-center md:inline-flex">
                  {/* Soft ambient rainbow glow underneath bottom edge */}
                  <div
                    className="pointer-events-none absolute -bottom-1.5 left-3 right-3 h-3.5 rounded-full opacity-40 blur-md transition-opacity group-hover:opacity-75"
                    style={{
                      background:
                        "linear-gradient(90deg, hsl(0,100%,63%), hsl(90,100%,63%), hsl(210,100%,63%), hsl(195,100%,63%), hsl(270,100%,63%))",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTab("templates");
                      setTemplateCategory("premium");
                      setLeftPanelCollapsed(false);
                      window.dispatchEvent(new CustomEvent("postinseconds:open-premium"));
                    }}
                    style={{
                      background: dark
                        ? "linear-gradient(#121213,#121213) padding-box, linear-gradient(180deg, #121213 50%, rgba(18,18,19,0.6) 80%, rgba(18,18,19,0)) border-box, linear-gradient(90deg, hsl(0,100%,63%), hsl(90,100%,63%), hsl(210,100%,63%), hsl(195,100%,63%), hsl(270,100%,63%)) border-box"
                        : "linear-gradient(#ffffff,#ffffff) padding-box, linear-gradient(180deg, #ffffff 50%, rgba(255,255,255,0.6) 80%, rgba(255,255,255,0)) border-box, linear-gradient(90deg, hsl(0,100%,63%), hsl(90,100%,63%), hsl(210,100%,63%), hsl(195,100%,63%), hsl(270,100%,63%)) border-box",
                      border: "1.5px solid transparent",
                    }}
                    className={`relative flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 ${
                      dark ? "text-white" : "text-zinc-900"
                    }`}
                  >
                    <span className="tracking-tight">Premium Templates</span>
                    <div className="flex items-center gap-1">
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className={`h-3 w-3 ${dark ? "text-slate-400" : "text-amber-500"}`}
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      <span className={`font-bold ${dark ? "text-white" : "text-zinc-900"}`}>
                        {premiumTemplates.length}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </AppTooltip>

            {/* 3. Mode Change Icon */}
            <AppTooltip content={dark ? "Switch to Light mode" : "Switch to Dark mode"}>
              <button
                type="button"
                onClick={() => setDark((d) => !d)}
                className="grid h-8 w-8 place-items-center rounded-full border border-border/80 bg-secondary/40 text-foreground shadow-sm transition-all hover:bg-secondary active:scale-95 sm:h-auto sm:w-auto sm:px-2.5 sm:py-2"
                title={dark ? "Switch to Light mode" : "Switch to Dark mode"}
              >
                {dark ? <Moon02Icon size={15} /> : <Sun03Icon size={15} />}
              </button>
            </AppTooltip>

            {/* 4. Export Icon */}
            <AppTooltip content="Export & Download options">
              <button
                type="button"
                onClick={() => {
                  if (isMobile) {
                    setMobileExportDrawerOpen(true);
                  } else {
                    setRightPanelCollapsed((prev) => !prev);
                  }
                }}
                className="grid h-8 w-8 place-items-center rounded-full bg-[image:var(--gradient-brand)] text-primary-foreground shadow-[var(--shadow-glow)] transition-all hover:opacity-90 active:scale-95 sm:flex sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-1.5 sm:text-xs sm:font-bold"
                title="Export"
              >
                <Download01Icon size={15} />
                <span className="hidden sm:inline">Export</span>
              </button>
            </AppTooltip>

            {/* 5. User Profile Image Avatar */}
            <UserMenu />
          </div>
        </header>

        {isMobile ? (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Floating Undo & Redo pill on top-left (top-16 left-3) — shown only when user did changes */}
            {(historyIdx.current > 0 || historyIdx.current < history.current.length - 1) ? (
              <div
                className="pointer-events-none fixed left-3 z-40 flex items-center gap-1 rounded-full border border-border/80 bg-card/90 p-1 shadow-md backdrop-blur-xl"
                style={{ top: "calc(env(safe-area-inset-top) + 4rem)" }}
              >
                <AppTooltip content="Undo">
                  <button
                    type="button"
                    onClick={undo}
                    disabled={historyIdx.current <= 0}
                    className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full text-foreground transition-all hover:bg-secondary active:scale-95 disabled:opacity-40"
                    title="Undo"
                  >
                    <Undo02Icon size={15} />
                  </button>
                </AppTooltip>
                <div className="h-3.5 w-px bg-border/80" />
                <AppTooltip content="Redo">
                  <button
                    type="button"
                    onClick={redo}
                    disabled={historyIdx.current >= history.current.length - 1}
                    className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full text-foreground transition-all hover:bg-secondary active:scale-95 disabled:opacity-40"
                    title="Redo"
                  >
                    <Redo02Icon size={15} />
                  </button>
                </AppTooltip>
              </div>
            ) : null}

            {/* Floating Lock & Delete pill on top-right (top-16 right-3) */}
            {(selectedTextLayer || selectedImageLayer || selectedShapeLayer) ? (
              <div
                className="pointer-events-none fixed right-3 z-40 flex items-center gap-1 rounded-full border border-border/80 bg-card/90 p-1 shadow-md backdrop-blur-xl"
                style={{ top: "calc(env(safe-area-inset-top) + 4rem)" }}
              >
                {/* Lock Toggle Button */}
                <AppTooltip content={(selectedTextLayer?.locked || selectedImageLayer?.locked || selectedShapeLayer?.locked) ? "Unlock Layer" : "Lock Layer"}>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTextLayer) {
                        set("texts", withTextUpdated(s, selectedTextLayer.id, { locked: !selectedTextLayer.locked }));
                      } else if (selectedImageLayer) {
                        set("images", withImageUpdated(s, selectedImageLayer.id, { locked: !selectedImageLayer.locked }));
                      } else if (selectedShapeLayer) {
                        set("shapes", withShapeUpdated(s, selectedShapeLayer.id, { locked: !selectedShapeLayer.locked }));
                      }
                    }}
                    className={cn(
                      "pointer-events-auto grid h-7 w-7 place-items-center rounded-full transition-all active:scale-95",
                      (selectedTextLayer?.locked || selectedImageLayer?.locked || selectedShapeLayer?.locked)
                        ? "bg-amber-500/20 text-amber-500"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={(selectedTextLayer?.locked || selectedImageLayer?.locked || selectedShapeLayer?.locked) ? "Unlock Layer" : "Lock Layer"}
                  >
                    {(selectedTextLayer?.locked || selectedImageLayer?.locked || selectedShapeLayer?.locked) ? (
                      <SquareLock02Icon size={14} />
                    ) : (
                      <SquareUnlock02Icon size={14} />
                    )}
                  </button>
                </AppTooltip>

                <div className="h-3.5 w-px bg-border/80" />

                {/* Delete Button */}
                <AppTooltip content="Delete Layer">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedTextLayer) {
                        set("texts", withTextRemoved(s, selectedTextLayer.id));
                      } else if (selectedImageLayer) {
                        set("images", withImageRemoved(s, selectedImageLayer.id));
                      } else if (selectedShapeLayer) {
                        set("shapes", withShapeRemoved(s, selectedShapeLayer.id));
                      }
                      setCanvasSelection([]);
                    }}
                    className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full text-red-500/80 transition-all hover:bg-red-500/10 hover:text-red-500 active:scale-95"
                    title="Delete Layer"
                  >
                    <Delete02Icon size={14} />
                  </button>
                </AppTooltip>
              </div>
            ) : null}

            <div
              className="flex min-h-0 flex-1 flex-col p-3"
              style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom) + 12px)" }}
            >
              {canvasStage}
            </div>

            {!(selectedTextLayer || selectedImageLayer || selectedShapeLayer) ? (
              <MobileBottomTabBar
                activeTab={tab}
                isDrawerOpen={mobileToolDrawerOpen}
                onTabChange={(id) => {
                  if (id === tab && mobileToolDrawerOpen) {
                    setMobileToolDrawerOpen(false);
                  } else {
                    setTab(id);
                    setMobileToolDrawerOpen(true);
                  }
                }}
              />
            ) : (
              <div
                data-nopan=""
                data-keep-text-editing=""
                className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] w-full items-center border-t border-border bg-card/95 backdrop-blur-xl"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                {/* Absolute solid Tick02Icon button on far left */}
                <button
                  type="button"
                  onClick={() => setCanvasSelection([])}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-30 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95"
                  title="Done (Deselect)"
                >
                  <Tick02Icon size={16} />
                </button>

                {/* Left & Right gradient edge fades */}
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-20 w-12 bg-gradient-to-r from-card via-card/90 to-transparent" />
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-20 w-8 bg-gradient-to-l from-card via-card/85 to-transparent" />

                {/* Scrollable toolbar items with pl-14 pr-3 */}
                <div className="w-full overflow-x-auto pl-14 pr-3 py-1 no-scrollbar scroll-smooth [mask-image:linear-gradient(to_right,transparent_0%,black_16px,black_calc(100%-16px),transparent_100%)]">
                  {selectedTextLayer && selectedTextLayerHandle ? (
                    <TextSelectionToolbar
                      layer={selectedTextLayer}
                      handle={selectedTextLayerHandle}
                      onOpenEffectsTab={() => {
                        setTab("text");
                        setTextSubTab("effects");
                        setMobileToolDrawerOpen(true);
                      }}
                    />
                  ) : selectedImageLayer ? (
                    <ImageSelectionToolbar
                      layer={selectedImageLayer}
                      onUpdate={(patch) =>
                        set("images", withImageUpdated(s, selectedImageLayer.id, patch))
                      }
                      onOpenCrop={() => setCroppingImageLayer(selectedImageLayer)}
                    />
                  ) : selectedShapeLayer ? (
                    <ShapeSelectionToolbar
                      layer={selectedShapeLayer}
                      onUpdate={(patch) =>
                        set("shapes", withShapeUpdated(s, selectedShapeLayer.id, patch))
                      }
                      onDuplicate={() => {
                        const dup = withShapeDuplicated(s, selectedShapeLayer.id);
                        set("shapes", dup.list);
                        setCanvasSelection([{ kind: "shape", id: dup.newId }]);
                      }}
                      onDelete={() => {
                        set("shapes", withShapeRemoved(s, selectedShapeLayer.id));
                        setCanvasSelection([]);
                      }}
                      onToggleLock={() =>
                        set(
                          "shapes",
                          withShapeUpdated(s, selectedShapeLayer.id, {
                            locked: !selectedShapeLayer.locked,
                          }),
                        )
                      }
                    />
                  ) : null}
                </div>
              </div>
            )}

            {/* Tool drawer — hosts the exact same LeftPanel used on desktop,
                just inside a bottom sheet instead of a fixed side aside. */}
            <Drawer open={mobileToolDrawerOpen} onOpenChange={setMobileToolDrawerOpen}>
              <DrawerContent className="mt-0 flex h-[75vh] max-h-[75vh] flex-col rounded-t-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
                  <span className="text-sm font-bold text-foreground">
                    {RAIL.find((r) => r.id === tab)?.label}
                  </span>
                  <DrawerClose className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                    Done
                  </DrawerClose>
                </div>
                <div
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
                >
                  <LeftPanel
                    s={s}
                    set={set}
                    applyTemplate={(t) => {
                      setMobileToolDrawerOpen(false);
                      requestAnimationFrame(() => {
                        applyTemplate(t);
                      });
                    }}
                    tab={tab}
                    selection={canvasSelection}
                    onSelectLayer={(layer, opts) => {
                      setMobileToolDrawerOpen(false);
                      requestAnimationFrame(() => {
                        handleSelectLayer(layer, opts);
                      });
                    }}
                    onItemSelect={() => setMobileToolDrawerOpen(false)}
                    textSubTab={textSubTab}
                    onTextSubTabChange={setTextSubTab}
                    templateCategory={templateCategory}
                    onTemplateCategoryChange={setTemplateCategory}
                    onSelectSavedQuote={(quote) => {
                      setMobileToolDrawerOpen(false);
                      requestAnimationFrame(() => {
                        setEditingSavedQuoteTarget({ id: quote.id, title: quote.title });
                      });
                    }}
                    activeSavedQuote={editingSavedQuoteTarget}
                    onCloseSavedQuoteEdit={() => setEditingSavedQuoteTarget(null)}
                  />
                </div>
              </DrawerContent>
            </Drawer>

            {/* Export drawer — the header's Export button (md:hidden) opens
                this; hosts the exact same RightPanel used on desktop. */}
            <Drawer open={mobileExportDrawerOpen} onOpenChange={setMobileExportDrawerOpen}>
              <DrawerContent className="mt-0 flex max-h-[85vh] flex-col rounded-t-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
                  <span className="text-sm font-bold text-foreground">Export</span>
                  <DrawerClose className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                    Done
                  </DrawerClose>
                </div>
                <div
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
                >
                  <RightPanel
                    s={s}
                    set={set}
                    onDownload={() => {
                      openExportPreview();
                      setMobileExportDrawerOpen(false);
                    }}
                    busy={busy}
                  />
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        ) : (
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-20 shrink-0 flex-col items-center gap-2 border-r border-border py-4">
            {RAIL.map((r) => (
              <AppTooltip key={r.id} content={r.label} side="right">
                <button
                  type="button"
                  onClick={() => {
                    setTab(r.id);
                    setLeftPanelCollapsed(false);
                  }}
                  className={cn(
                    "group flex w-14 flex-col items-center gap-1.5 py-1 text-[9px] font-medium",
                    tab === r.id && !leftPanelCollapsed ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                      tab === r.id && !leftPanelCollapsed ? "bg-[#1d1f26] text-white" : "group-hover:bg-secondary",
                    )}
                  >
                    <r.icon size={20} />
                  </span>
                  {r.label}
                </button>
              </AppTooltip>
            ))}
          </nav>

          <aside
            className={cn(
              "shrink-0 space-y-4 overflow-y-auto border-r border-border transition-all duration-300 ease-in-out",
              leftPanelCollapsed
                ? "w-0 p-0 overflow-hidden border-r-0 opacity-0 pointer-events-none"
                : "w-[400px] p-4 opacity-100",
            )}
          >
            <LeftPanel
              s={s}
              set={set}
              applyTemplate={applyTemplate}
              tab={tab}
              selection={canvasSelection}
              onSelectLayer={handleSelectLayer}
              textSubTab={textSubTab}
              onTextSubTabChange={setTextSubTab}
              templateCategory={templateCategory}
              onTemplateCategoryChange={setTemplateCategory}
              onSelectSavedQuote={(quote) => setEditingSavedQuoteTarget({ id: quote.id, title: quote.title })}
              activeSavedQuote={editingSavedQuoteTarget}
              onCloseSavedQuoteEdit={() => setEditingSavedQuoteTarget(null)}
            />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AppTooltip content={leftPanelCollapsed ? "Expand Left Panel" : "Collapse Left Panel"}>
                  <Chip
                    onClick={() => setLeftPanelCollapsed((c) => !c)}
                    active={!leftPanelCollapsed}
                    className="flex h-7 w-7 items-center justify-center p-0"
                  >
                    <SidebarLeftIcon size={14} />
                  </Chip>
                </AppTooltip>
                <div className="h-4 w-px bg-border/60 mx-0.5" />
                <AppTooltip content="Undo last change" shortcut="Ctrl+Z">
                  <Chip onClick={undo} className="flex h-7 w-7 items-center justify-center p-0">
                    <Undo02Icon size={13} />
                  </Chip>
                </AppTooltip>
                <AppTooltip content="Redo change" shortcut="Ctrl+Y">
                  <Chip onClick={redo} className="flex h-7 w-7 items-center justify-center p-0">
                    <Redo02Icon size={13} />
                  </Chip>
                </AppTooltip>
                <AppTooltip content={s.locked ? "Unlock canvas" : "Lock canvas"}>
                  <Chip
                    onClick={() => set("locked", !s.locked)}
                    active={s.locked}
                    className="flex h-7 w-7 items-center justify-center p-0"
                  >
                    {s.locked ? <SquareLock02Icon size={13} /> : <SquareUnlock02Icon size={13} />}
                  </Chip>
                </AppTooltip>
                <AppTooltip content="Clear everything — blank canvas, all layers removed">
                  <Chip
                    onClick={() =>
                      commit((prev) => ({
                        ...INITIAL_STATE,
                        width: prev.width || 1200,
                        height: prev.height || 1500,
                        exportFormat: prev.exportFormat,
                        exportScale: prev.exportScale,
                        texts: [],
                        shapes: [],
                        images: [],
                        quote: "",
                        name: "",
                        tagline: "",
                        bgImage: null,
                      }))
                    }
                    className="flex h-7 w-7 items-center justify-center p-0"
                  >
                    <Delete02Icon size={13} />
                  </Chip>
                </AppTooltip>
                <AppTooltip content="Clear canvas and start a fresh blank post">
                  <Chip
                    onClick={() => setResetConfirmOpen(true)}
                    className="flex h-7 items-center gap-1 px-2 py-0 text-xs"
                  >
                    <ReloadIcon size={12} /> Reset
                  </Chip>
                </AppTooltip>

                {/* Live Autosave Indicator beside Reset */}
                <div className="ml-1 flex items-center">
                  {autoSaveStatus === "saving" ? (
                    <span className="flex h-7 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 text-xs font-semibold text-amber-600 dark:text-amber-400 shadow-sm animate-pulse">
                      <ReloadIcon size={12} className="animate-spin text-amber-500" />
                      Saving...
                    </span>
                  ) : autoSaveStatus === "saved" ? (
                    <span className="flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shadow-sm transition-all">
                      <CheckmarkCircle02Icon size={13} className="text-emerald-500" />
                      Saved
                    </span>
                  ) : (
                    <span className="flex h-7 items-center gap-1.5 rounded-full border border-border/80 bg-secondary/60 px-2.5 text-xs font-medium text-muted-foreground shadow-sm">
                      <CloudIcon size={13} className="text-muted-foreground/80" />
                      Draft saved
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <AppTooltip content="Save current canvas design as a platform template">
                  <button
                    type="button"
                    onClick={() => setSaveTemplateOpen(true)}
                    className="mr-1 flex h-7 items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0 text-xs font-bold text-amber-500 transition-all hover:bg-amber-500/20 active:scale-95"
                  >
                    <AllBookmarkIcon size={13} />
                    <span>Save Template</span>
                  </button>
                </AppTooltip>
                <AppTooltip content="Zoom out 1%" shortcut="-">
                  <Chip onClick={() => zoomBy(-1)} className="flex h-7 w-7 items-center justify-center p-0">
                    <MinusSignIcon size={13} />
                  </Chip>
                </AppTooltip>
                <AppTooltip content="Drag to zoom">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-24">
                      <Range
                        value={Math.round(scale * 100)}
                        min={10}
                        max={200}
                        showInput={false}
                        onChange={(v) => zoomToScale(v / 100)}
                      />
                    </div>
                    <ZoomInput
                      scale={scale}
                      onChange={(pct) => zoomToScale(pct / 100)}
                    />
                  </div>
                </AppTooltip>
                <AppTooltip content="Zoom in 1%" shortcut="+">
                  <Chip onClick={() => zoomBy(1)} className="flex h-7 w-7 items-center justify-center p-0">
                    <Add01Icon size={13} />
                  </Chip>
                </AppTooltip>
                <AppTooltip content="Fit canvas to screen" shortcut="Ctrl+0">
                  <Chip onClick={fit} className="flex h-7 w-7 items-center justify-center p-0">
                    <CenterFocusIcon size={13} />
                  </Chip>
                </AppTooltip>
                <AppTooltip content={showRulers ? "Hide rulers" : "Show rulers"}>
                  <Chip
                    onClick={() => setShowRulers((r) => !r)}
                    active={showRulers}
                    className="flex h-7 w-7 items-center justify-center p-0"
                  >
                    <RulerIcon size={13} />
                  </Chip>
                </AppTooltip>
                <span className="ml-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                  {s.width} × {s.height}px
                </span>
                <div className="h-4 w-px bg-border/60 mx-0.5" />
                <AppTooltip content={rightPanelCollapsed ? "Expand Right Panel (Export & Canvas Size)" : "Collapse Right Panel"}>
                  <Chip
                    onClick={() => setRightPanelCollapsed((c) => !c)}
                    active={!rightPanelCollapsed}
                    className="flex h-7 w-7 items-center justify-center p-0"
                  >
                    <SidebarRightIcon size={14} />
                  </Chip>
                </AppTooltip>
              </div>
            </div>

            {canvasStage}

            <div className="shrink-0">
              <Panel title="Free Templates" defaultOpen={false}>
                <div className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                  {starterTemplates.map((t) => (
                    <TemplatePreview
                      key={t.id}
                      template={t}
                      width={120}
                      onClick={() => applyTemplate(t.state)}
                    />
                  ))}
                </div>
              </Panel>
            </div>
          </main>

          <aside
            className={cn(
              "shrink-0 space-y-3 overflow-y-auto border-l border-border transition-all duration-300 ease-in-out",
              rightPanelCollapsed
                ? "w-0 p-0 overflow-hidden border-l-0 opacity-0 pointer-events-none"
                : "w-[400px] p-4 opacity-100",
            )}
          >
            <RightPanel
              s={s}
              set={set}
              onDownload={openExportPreview}
              busy={busy}
            />
          </aside>

          {/* Sibling of the right aside, not a child of it — position:fixed
              still inherited the aside's opacity-0/pointer-events-none when
              rightPanelCollapsed, since fixed positioning only escapes
              layout, not the CSS cascade. */}
          <DraggableFloatingLayersButton
            active={tab === "layers"}
            layerCount={getTextLayers(s).length + getImageLayers(s).length + getShapeLayers(s).length}
            onClick={() => {
              setTab("layers");
              setLeftPanelCollapsed(false);
            }}
          />
        </div>
        )}

        <GoogleLoginDialog />
        <SaveTemplateDialog
          open={saveTemplateOpen}
          onClose={() => setSaveTemplateOpen(false)}
          s={s}
        />
        <ExportPreviewDialog
          open={previewOpen}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewUrl(null);
          }}
          previewUrl={previewUrl}
          s={s}
          onConfirm={confirmDownload}
          isExporting={isExportingFinal}
        />

        {croppingImageLayer ? (
          <ImageCropDialog
            open={Boolean(croppingImageLayer)}
            onClose={() => setCroppingImageLayer(null)}
            imageSrc={croppingImageLayer.src}
            onCropComplete={(croppedDataUrl) => {
              set("images", withImageUpdated(s, croppingImageLayer.id, { src: croppedDataUrl }));
              setCroppingImageLayer(null);
            }}
          />
        ) : null}

        {/* Start New Blank Design Confirmation Dialog */}
        <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
          <DialogContent className="sm:max-w-[440px] rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary shadow-sm">
                  <SparklesIcon size={20} />
                </span>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Start a new blank design?
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Your current work is automatically saved in history.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
              This will clear the canvas and reset all layers so you can start a fresh new post from scratch.
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetConfirmOpen(false);
                  clearActiveDraft();
                  setEditingSavedQuoteTarget(null);
                  setEditingTemplateTarget(null);
                  commit((prev) => ({
                    ...INITIAL_STATE,
                    width: prev.width || 1200,
                    height: prev.height || 1500,
                    exportFormat: prev.exportFormat,
                    exportScale: prev.exportScale,
                  }));
                  fit();
                }}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90 active:scale-95"
              >
                <Add01Icon size={14} />
                <span>Start New Post</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
