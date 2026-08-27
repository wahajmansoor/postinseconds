import { createFileRoute, Link } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchAllTemplates,
  upsertTemplate,
  updateSavedQuoteDesign,
  fetchSavedQuotes,
  getSavedDraft,
  saveActiveDraft,
  clearActiveDraft,
  fetchCloudActiveDraft,
  upsertCloudActiveDraft,
  subscribeToCloudActiveDraft,
} from "@/lib/supabase";
import { compressImageFiles } from "@/lib/imageCompression";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import { toast } from "sonner";
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
import { BackgroundSelectionToolbar } from "@/components/editor/BackgroundSelectionToolbar";
import { ImageSelectionToolbar } from "@/components/editor/ImageSelectionToolbar";
import { ImageCropDialog } from "@/components/editor/ImageCropDialog";
import { EraseImageDialog } from "@/components/editor/EraseImageDialog";
import { ShapeSelectionToolbar } from "@/components/editor/ShapeSelectionToolbar";
import {
  MultiShapeSelectionToolbar,
  type ShapeArrangeDirection,
} from "@/components/editor/MultiShapeSelectionToolbar";
import { MultiImageSelectionToolbar } from "@/components/editor/MultiImageSelectionToolbar";
import { MultiMixedSelectionToolbar } from "@/components/editor/MultiMixedSelectionToolbar";
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
  withImagesAligned,
  withImagesLockSet,
  withImagesShifted,
  withImagesUpdated,
  withMultipleLayersRemoved,
  withShapeDuplicated,
  withShapeRemoved,
  withShapeUpdated,
  withShapesAligned,
  withShapesLockSet,
  withShapesShifted,
  withShapesUpdated,
  withTextDuplicated,
  withTextRemoved,
  withTextUpdated,
  withTextsUpdated,
  withTextsLockSet,
  withMixedLayersAligned,
  withMixedLayersShifted,
  withUnifiedLayersReordered,
  getUnifiedLayers,
  getArrangeEligibility,
  type EditorState,
  type ImageLayer,
  type MixedLayerRef,
  type ShapeAlignEdge,
  type ShapeLayer,
  type Template,
} from "@/components/editor/types";
import {
  AppTooltip,
  Chip,
  MOBILE_SHEET_MAX_HEIGHT_FRACTION,
  MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION,
  MOBILE_TOOL_DRAWER_SNAP_POINTS,
  Range,
} from "@/components/editor/ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ExportPreviewDialog } from "@/components/editor/ExportPreviewDialog";
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
      id="canvas-zoom-percentage-input"
      name="zoomPercentage"
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

// A visible, draggable scrollbar for the canvas stage — needed now that the
// stage itself uses no native scrolling at all (see the canvas transform
// and applyZoom/panForFocal in Index; that switch away from native
// overflow scrolling is what fixed pinch-zoom's lag/jump/flash issues, but
// it also removed the browser's own scrollbar as a side effect). This is a
// from-scratch equivalent: `origin` is the same value the canvas transform
// itself uses, so the thumb always reflects exactly what's on screen, and
// dragging it moves `pan` by the same amount the track was dragged,
// converted through the content/track size ratio.
// `EDGE_MARGIN` (gap from the stage's own edges) and `CORNER_RESERVE`
// (extra gap at the end nearest the other scrollbar, so they don't overlap
// where they'd otherwise cross) define the visual track — trackLength is
// derived from the SAME two constants the CSS positioning below uses, so
// the thumb's math can never drift out of sync with where it's actually
// drawn.
const SCROLLBAR_EDGE_MARGIN = 3;
const SCROLLBAR_CORNER_RESERVE = 12;

function CanvasScrollbar({
  orientation,
  stageLength,
  contentLength,
  origin,
  onPanDelta,
}: {
  orientation: "horizontal" | "vertical";
  stageLength: number;
  contentLength: number;
  origin: number;
  onPanDelta: (delta: number) => void;
}) {
  const dragLastClientRef = useRef<number | null>(null);
  const trackLength = stageLength - SCROLLBAR_EDGE_MARGIN - SCROLLBAR_CORNER_RESERVE;
  const scrollRange = contentLength - stageLength;

  // Content fits entirely within the viewport — nothing to scroll, same as
  // a native scrollbar auto-hiding itself.
  if (scrollRange <= 1 || trackLength <= 0) return null;

  const thumbFrac = Math.max(0, Math.min(1, stageLength / contentLength));
  const thumbLength = Math.max(32, thumbFrac * trackLength);
  const usableTrack = trackLength - thumbLength;
  const offsetFrac = usableTrack > 0 ? Math.max(0, Math.min(1, -origin / scrollRange)) : 0;
  const thumbPos = offsetFrac * usableTrack;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragLastClientRef.current = orientation === "horizontal" ? e.clientX : e.clientY;
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const last = dragLastClientRef.current;
    if (last === null || usableTrack <= 0) return;
    e.stopPropagation();
    const current = orientation === "horizontal" ? e.clientX : e.clientY;
    const deltaTrack = current - last;
    dragLastClientRef.current = current;
    onPanDelta(-(deltaTrack / usableTrack) * scrollRange);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragLastClientRef.current = null;
  };

  const isH = orientation === "horizontal";
  return (
    <div
      data-nopan=""
      style={{
        position: "absolute",
        left: isH ? SCROLLBAR_EDGE_MARGIN : undefined,
        right: isH ? SCROLLBAR_CORNER_RESERVE : SCROLLBAR_EDGE_MARGIN,
        bottom: isH ? SCROLLBAR_EDGE_MARGIN : SCROLLBAR_CORNER_RESERVE,
        top: isH ? undefined : SCROLLBAR_EDGE_MARGIN,
        height: isH ? 8 : undefined,
        width: isH ? undefined : 8,
        zIndex: 45,
        pointerEvents: "auto",
      }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        // Deliberately NOT the app's own theme foreground/background —
        // this thumb sits on top of the CANVAS's own content, which can
        // be any color (including plain white or black), completely
        // independent of the app's light/dark theme. A neutral mid-gray
        // fill plus both a light ring AND a dark shadow keeps it visible
        // against white, black, and colored/photo backgrounds alike — the
        // same "readable on anything" approach already used for the
        // resize handles in QuoteCanvas.
        className="rounded-full bg-[rgba(120,120,120,0.6)] transition-colors hover:bg-[rgba(120,120,120,0.8)] active:bg-[rgba(120,120,120,0.9)]"
        style={{
          position: "absolute",
          left: isH ? thumbPos : 0,
          top: isH ? 0 : thumbPos,
          width: isH ? thumbLength : "100%",
          height: isH ? "100%" : thumbLength,
          // Tailwind's shadow-[...] arbitrary value doesn't reliably apply
          // a multi-layer (comma-separated) box-shadow — plain inline
          // style avoids that entirely.
          boxShadow: "0 0 0 1px rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.4)",
          // Plain default cursor on hover/drag, not a resize cursor —
          // dragging a scrollbar thumb is a drag, not a resize, and
          // ew-resize/ns-resize wrongly implied the track itself could be
          // stretched. Matches native scrollbars and Figma's own.
          cursor: "default",
          touchAction: "none",
        }}
      />
    </div>
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
          className={`group relative flex h-11 w-11 items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-xl transition-transform select-none ${isDragging
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
              className={`absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black shadow-md transition-colors ${active || isDragging
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

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mime: string = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : "image/png";
  const binary = atob(parts[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// Normalizes an exported image's URL (a `data:` URL for png/jpg/webp from
// html-to-image, or a `blob:` URL for gif from gifRenderer.ts's own
// URL.createObjectURL) into a plain base64 payload + mime type, for handing
// to @capacitor/filesystem below — it only accepts base64/text, not a URL.
async function urlToBase64(url: string): Promise<{ base64: string; mime: string }> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const header = url.slice(5, comma); // "image/png;base64"
    const mime = header.split(";")[0] || "application/octet-stream";
    return { base64: url.slice(comma + 1), mime };
  }
  const res = await fetch(url);
  const blob = await res.blob();
  const mime = blob.type || "application/octet-stream";
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string; // "data:<mime>;base64,<payload>"
      const i = result.indexOf(",");
      resolve(i === -1 ? "" : result.slice(i + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { base64, mime };
}

// Saves an exported image inside the wrapped native app (Capacitor/Android
// — see capacitor.config.ts). Plain `<a download>` + `.click()` (the web
// path in confirmDownload below) is a browser-only trick: inside a native
// WebView there's no download manager backing it, no Android permission
// prompt, nothing — the click is simply a no-op, which is exactly why
// "Download" silently did nothing in the mobile app while working fine in
// a real browser. Writes the file into the app's own cache dir (no storage
// permission needed for that, unlike the public Pictures/Downloads
// directories) and hands it to the native OS share sheet, whose "Save
// image"/"Save to Files" options are what actually persists it to a place
async function saveExportedImageNative(url: string, filename: string): Promise<void> {
  const { base64 } = await urlToBase64(url);

  // 1. Try saving directly into Documents storage (accessible by phone Gallery / File Manager)
  try {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== "granted") {
      await Filesystem.requestPermissions();
    }
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch { }
    toast.success(`Image saved successfully to your Gallery/Documents!`, { position: "bottom-center" });
    return;
  } catch (docErr) {
    console.warn("Direct save to Documents failed, attempting external storage:", docErr);
  }

  // 2. Try External Storage
  try {
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.ExternalStorage,
      recursive: true,
    });
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch { }
    toast.success(`Image saved successfully to your Gallery / Downloads!`, { position: "bottom-center" });
    return;
  } catch (extErr) {
    console.warn("External storage write failed, falling back to cache save:", extErr);
  }

  // 3. Fallback: save to app cache
  try {
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch { }
    toast.success(`Downloaded ${filename}!`, { position: "bottom-center" });
  } catch (cacheErr) {
    console.error("Native write failed:", cacheErr);
    toast.error("Failed to save image to device.", { position: "bottom-center" });
  }
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
  const [mobileToolDrawerSnap, setMobileToolDrawerSnap] = useState<number | string | null>(
    MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION,
  );
  // Ground-truth for how tall the tool drawer's box actually is ON SCREEN
  // right now (in px) — measured directly off the DOM instead of trusting
  // vaul's activeSnapPoint/setActiveSnapPoint controlled-state callback,
  // which turned out not to reflect the real drag state reliably (both the
  // canvas-lift amount and the drawer's own scrollable-content sizing were
  // silently never updating past the tall default because of it). See the
  // measurement effect below for how this gets kept current.
  const toolDrawerContentRef = useRef<HTMLDivElement>(null);
  const [mobileToolDrawerVisiblePx, setMobileToolDrawerVisiblePx] = useState(0);
  const [mobileExportDrawerOpen, setMobileExportDrawerOpen] = useState(false);
  const [croppingImageLayer, setCroppingImageLayer] = useState<ImageLayer | null>(null);
  // Same lifted-state reasoning as croppingImageLayer above — see
  // onOpenErase's own comment in ImageSelectionToolbar.tsx.
  const [erasingImageLayer, setErasingImageLayer] = useState<ImageLayer | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isExportingFinal, setIsExportingFinal] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  const dragCounterRef = useRef(0);
  const isInitialMountRef = useRef(true);
  // Set right before applying a draft that came FROM Supabase (either the
  // one-time load-on-sign-in below, or a live update from another open
  // tab/device) so the very next run of the auto-save effect below knows
  // to skip re-uploading it — otherwise every remote update would
  // round-trip straight back out as a redundant write.
  const applyingRemoteDraftRef = useRef(false);
  // The `updated_at` of the newest cloud-draft row this client already
  // knows about — either the one it just fetched/loaded, or the one it
  // most recently pushed itself. subscribeToCloudActiveDraft's realtime
  // callback ALSO fires for this client's own writes (see its comment), so
  // every incoming update must be compared against this before applying:
  // a delayed echo of a write this client made earlier can otherwise arrive
  // AFTER further local edits (e.g. mid a fast drag-then-drag-something-else
  // sequence) and silently overwrite them with the older snapshot — visible
  // as a layer snapping back, or an unrelated layer's position reverting.
  // ISO 8601 strings compare correctly with plain `<`/`>` here since every
  // value comes from the same fixed UTC format.
  const lastKnownDraftUpdatedAtRef = useRef<string>("");

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
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (e.code === "Space" && !isInput && !spaceRef.current) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Debounced Auto-Save Working Draft — always writes the fast local
  // (per-device) cache; additionally pushes to the signed-in account's
  // cloud draft (see supabase.ts's "Cloud-synced active draft" section) so
  // opening the editor elsewhere, or another already-open tab/device, sees
  // the same in-progress design. Skips the cloud push specifically when
  // this run was triggered by APPLYING a cloud update (see
  // applyingRemoteDraftRef's own comment) — nothing changed to actually
  // save, that state already lives on the server.
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    const skipCloudPush = applyingRemoteDraftRef.current;
    applyingRemoteDraftRef.current = false;
    setAutoSaveStatus("saving");
    const timer = setTimeout(() => {
      saveActiveDraft(s);
      if (user?.id && !skipCloudPush) {
        void upsertCloudActiveDraft(user.id, s).then((updatedAt) => {
          // Record what we just pushed as "already known" BEFORE its
          // realtime echo can arrive — see lastKnownDraftUpdatedAtRef's own
          // comment. Guarded with a `>` check (not a bare assignment) in
          // case a newer remote update (a genuinely different tab/device)
          // slipped in and got applied while this push was in flight.
          if (updatedAt && updatedAt > lastKnownDraftUpdatedAtRef.current) {
            lastKnownDraftUpdatedAtRef.current = updatedAt;
          }
        });
      }
      setAutoSaveStatus("saved");
    }, 600);
    return () => clearTimeout(timer);
  }, [s, user?.id]);

  // Load-on-sign-in: once we know who's signed in, pull their cloud draft
  // (if any — a brand new account, or one that's never used this device's
  // browser before, won't have one yet) and let it win over whatever
  // localStorage/INITIAL_STATE the initial useState above already picked,
  // since the cloud copy is the account-wide source of truth this feature
  // exists for. Only ever runs once per signed-in session (userId flips
  // from undefined to a real id exactly once per sign-in) — an empty
  // dependency-free re-check on every render would fight the user's own
  // subsequent edits.
  const loadedCloudDraftForUserRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = user?.id;
    if (!userId || loadedCloudDraftForUserRef.current === userId) return;
    loadedCloudDraftForUserRef.current = userId;
    let cancelled = false;
    (async () => {
      const cloudDraft = await fetchCloudActiveDraft(userId);
      if (cancelled || !cloudDraft) return;
      if (cloudDraft.updatedAt > lastKnownDraftUpdatedAtRef.current) {
        lastKnownDraftUpdatedAtRef.current = cloudDraft.updatedAt;
      }
      applyingRemoteDraftRef.current = true;
      setS(migrateLegacyContentToLayers({ ...INITIAL_STATE, ...cloudDraft.state }));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Live sync: another open tab/device (same account) saving pushes its
  // new state here in real time via Supabase Realtime — see
  // subscribeToCloudActiveDraft's own comment for why no extra de-dupe is
  // needed against this client's OWN writes.
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    const unsubscribe = subscribeToCloudActiveDraft(userId, (remoteState, updatedAt) => {
      // This fires for this client's OWN writes too, not just a different
      // tab/device (see subscribeToCloudActiveDraft's comment) — a delayed
      // echo of something this client already pushed (or already applied)
      // must be dropped, or it can overwrite newer local edits made in the
      // meantime with an older snapshot. Only apply genuinely new
      // information.
      if (updatedAt <= lastKnownDraftUpdatedAtRef.current) return;
      lastKnownDraftUpdatedAtRef.current = updatedAt;
      applyingRemoteDraftRef.current = true;
      setS(migrateLegacyContentToLayers({ ...INITIAL_STATE, ...remoteState }));
    });
    return unsubscribe;
  }, [user?.id]);

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
    // Stage-relative, not client-relative — but the stage has no native
    // scrolling any more (see the canvas transform in the JSX below, and
    // applyZoom/panForFocal above), so its own bounding rect is a fixed
    // viewport position and this needs no scroll-offset correction.
    const startStageX = e.clientX - stageRect.left;
    const startStageY = e.clientY - stageRect.top;

    const initialSelected = e.shiftKey ? canvasSelection : [];
    let hasMoved = false;

    if (!e.shiftKey) {
      setCanvasSelection([]);
      setIsBackgroundSelected(false);
    }

    const onPointerMove = (moveEvt: PointerEvent) => {
      const currentStageRect = stageEl.getBoundingClientRect();
      const currentClientX = moveEvt.clientX;
      const currentClientY = moveEvt.clientY;
      const currentStageX = currentClientX - currentStageRect.left;
      const currentStageY = currentClientY - currentStageRect.top;

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
    setIsBackgroundSelected(false);
  };

  // Platform templates state (synced with Supabase database & Admin dashboard)
  const [platformTemplates, setPlatformTemplates] = useState<Template[]>(TEMPLATES);

  const loadTemplates = useCallback(async () => {
    try {
      const list = await fetchAllTemplates();
      if (list && list.length > 0) {
        setPlatformTemplates(list);
      }
    } catch { }
  }, []);

  useEffect(() => {
    loadTemplates();
    const handleTemplateSaved = () => {
      loadTemplates();
    };
    window.addEventListener("postinseconds:template-saved", handleTemplateSaved);
    return () => window.removeEventListener("postinseconds:template-saved", handleTemplateSaved);
  }, [loadTemplates, tab, saveTemplateOpen]);

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
  // A separate flag rather than a 4th canvasSelection "kind" — canvasSelection's
  // type is threaded through QuoteCanvas, the marquee, group-drag, and every
  // per-layer toolbar, all of which only ever expect image/text/shape; adding
  // a "canvas" kind there would mean auditing all of them for a case that
  // isn't really a layer at all. Mutually exclusive with a non-empty
  // canvasSelection by construction: onSelectBackground below only fires
  // for a background click (which clears canvasSelection first), and the
  // effect right after this state clears it back out the moment any real
  // layer becomes selected through any of those other paths instead.
  const [isBackgroundSelected, setIsBackgroundSelected] = useState(false);
  useEffect(() => {
    if (canvasSelection.length > 0) setIsBackgroundSelected(false);
  }, [canvasSelection]);
  const textLayerHandlesRef = useRef<Map<string, TextLayerHandle>>(new Map());
  const registerTextLayerHandle = useCallback((id: string, handle: TextLayerHandle | null) => {
    if (handle) textLayerHandlesRef.current.set(id, handle);
    else textLayerHandlesRef.current.delete(id);
    if (typeof window !== "undefined") {
      (window as any).__PIX_TEXT_HANDLES__ = textLayerHandlesRef.current;
    }
  }, []);

  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [showRulers, setShowRulers] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageSizeRef = useRef({ width: 0, height: 0 });
  const isCustomZoomRef = useRef(false);
  // Mirrors `scale`/`pan` for the wheel/pinch/pan-drag effects below, so
  // those effects can read the always-current values without depending on
  // `scale`/`pan` themselves — depending on them directly would re-run
  // (tearing down and re-registering) all their native event listeners on
  // every single frame of a live gesture, which is exactly the kind of
  // per-frame cost this whole pan/zoom rewrite is trying to eliminate.
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  const panRef = useRef(pan);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  // True for as long as a second touch is also down — a pinch gesture in
  // progress. Passed to QuoteCanvas as suppressDragRef, which every layer's
  // own drag-to-move checks and bails out on: pointer events fire
  // independently of (and alongside) the touch events the pinch/pan effect
  // below reads, so without this, one finger of a two-finger pinch landing
  // on a layer dragged that layer at the same time the canvas itself was
  // being zoomed/panned underneath it. A ref, not state — flips mid-
  // gesture and must never trigger a re-render.
  const suppressDragRef = useRef(false);
  const [guidesH, setGuidesH] = useState<number[]>([]);
  const [guidesV, setGuidesV] = useState<number[]>([]);

  const calculateFitScale = useCallback(
    (stageW?: number, stageH?: number) => {
      const stW = stageW ?? (stageSizeRef.current.width > 0 ? stageSizeRef.current.width : stageRef.current?.clientWidth ?? 800);
      const stH = stageH ?? (stageSizeRef.current.height > 0 ? stageSizeRef.current.height : stageRef.current?.clientHeight ?? 600);

      const rulerOffset = showRulers ? RULER_SIZE : 0;
      // Exact padding matching stage padding (16px on mobile, 64px on desktop).
      // paddingY is bigger than paddingX on desktop specifically: the
      // floating text/image/shape selection toolbar (sticky top-4, ~68px
      // including its own height) floats independently of the canvas, near
      // the stage's own top edge — at fit scale a canvas tall enough to
      // nearly fill the stage left too little clearance up there and the
      // toolbar visibly overlapped the canvas's own top edge. Centering
      // splits this budget evenly top+bottom, so reserving enough for the
      // toolbar means doubling it (some of that ends up as harmless extra
      // breathing room at the bottom too, a fine trade for "never overlaps").
      const paddingX = isMobile ? 12 : 64;
      const paddingY = isMobile ? 12 : 160;

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

  // useLayoutEffect (not useEffect) + a synchronous measurement below,
  // specifically to avoid a flash on first load: `stageSize` starts at
  // {0,0} and `scale` starts at a guessed 0.49 (see their useState calls),
  // so the very first paint — before anything measures the real stage —
  // rendered the canvas using those placeholder values, i.e. small and
  // pinned to the top-left, then visibly snapped to centered/fit a frame
  // later once ResizeObserver's (technically async) callback landed.
  // Measuring synchronously here means React finishes updating state and
  // re-rendering with the CORRECT values before the browser ever paints
  // anything — useLayoutEffect specifically blocks paint until it (and any
  // state updates it triggers) settle, which plain useEffect does not.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const applyStageSize = (width: number, height: number) => {
      stageSizeRef.current = { width, height };
      setStageSize({ width, height });
      // Automatically recalculate optimal fit when viewport resizes or browser zooms
      if (!isCustomZoomRef.current && width > 100 && height > 100) {
        setScale(calculateFitScale(width, height));
        setPan({ x: 0, y: 0 });
      }
    };

    const initialRect = el.getBoundingClientRect();
    if (initialRect.width > 100 && initialRect.height > 100) {
      applyStageSize(initialRect.width, initialRect.height);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      applyStageSize(width, height);
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

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIdx.current > 0);
    setCanRedo(historyIdx.current < history.current.length - 1);
  }, []);

  const commit = useCallback(
    (fn: (prev: EditorState) => EditorState, opts?: { replace?: boolean | undefined; key?: string | undefined }) => {
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
          (opts?.replace || (sameKey && timeSinceLast < 1000));

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

        updateUndoRedoState();
        return next;
      });
    },
    [updateUndoRedoState],
  );

  const set = useCallback(
    <K extends keyof EditorState>(
      k: K,
      v: EditorState[K] | ((prev: EditorState[K], prevState: EditorState) => EditorState[K]),
      opts?: { replace?: boolean | undefined },
    ) => {
      commit(
        (p) => {
          const nextVal =
            typeof v === "function"
              ? (v as (prev: EditorState[K], state: EditorState) => EditorState[K])(p[k], p)
              : v;
          return { ...p, [k]: nextVal };
        },
        { key: String(k), ...(opts?.replace !== undefined ? { replace: opts.replace } : {}) },
      );
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
      updateUndoRedoState();
    }
  }, [updateUndoRedoState]);

  const redo = useCallback(() => {
    if (historyIdx.current < history.current.length - 1) {
      historyIdx.current += 1;
      const target = history.current[historyIdx.current];
      if (target) {
        setS(target);
        lastCommitTimeRef.current = 0;
      }
      updateUndoRedoState();
    }
  }, [updateUndoRedoState]);

  // "Fit canvas to screen" computes the true proportional scale needed
  // to fit the entire canvas comfortably inside the current stage viewport with
  // breathing room on all sides, automatically adapting to browser zoom levels,
  // screen resolutions, and ruler offsets. `pan` is centered relative to the
  // stage (see the canvas transform in the JSX below and Rulers' own origin
  // math, which use the exact same convention) — {x:0,y:0} always means
  // perfectly centered, so "fit" is just "recompute scale, zero out pan".
  const fit = useCallback(() => {
    isCustomZoomRef.current = false;
    setScale(calculateFitScale());
    setPan({ x: 0, y: 0 });
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

  // Where a given (scale, pan) combination places the canvas's own top-left
  // corner on screen — same convention as Rulers' own origin math (pan is
  // an offset from a naturally-centered position, {x:0,y:0} = centered,
  // not an absolute coordinate). Shared by applyZoom below and the pinch
  // handler so both always agree with what's actually on screen.
  const canvasOrigin = useCallback(
    (atScale: number, atPan: { x: number; y: number }, stageW: number, stageH: number) => {
      const rOffset = showRulers ? RULER_SIZE / 2 : 0;
      return {
        x: stageW / 2 + atPan.x + rOffset - (s.width * atScale) / 2,
        y: stageH / 2 + atPan.y + rOffset - (s.height * atScale) / 2,
      };
    },
    [s.width, s.height, showRulers],
  );

  // Solves the `pan` that puts a given CONTENT-space point (contentX,
  // contentY) under a given screen-space focal point at a given scale —
  // i.e. the inverse of canvasOrigin. This is the one piece of math the
  // whole zoom/pinch system is built on: "zoom around a focal point" is
  // just "find the content point under the focal point, then solve the pan
  // that keeps it there at the new scale".
  const panForFocal = useCallback(
    (
      atScale: number,
      focalX: number,
      focalY: number,
      contentX: number,
      contentY: number,
      stageW: number,
      stageH: number,
    ) => {
      const rOffset = showRulers ? RULER_SIZE / 2 : 0;
      return {
        x: focalX - contentX * atScale - stageW / 2 - rOffset + (s.width * atScale) / 2,
        y: focalY - contentY * atScale - stageH / 2 - rOffset + (s.height * atScale) / 2,
      };
    },
    [s.width, s.height, showRulers],
  );

  // Keeps `pan` inside the range that's actually meaningful: when the
  // canvas fits entirely within the stage at a given scale, there's
  // nothing to scroll to at all, so pan is pinned to exactly {0,0}
  // (centered) — no drifting the already-fully-visible canvas off into
  // empty space. When the canvas IS bigger than the stage, pan is bounded
  // to the range that keeps at least one edge of the canvas reachable
  // (same convention as a native scrollbar: you can't scroll past the
  // content). Derived by solving canvasOrigin's own formula for the pan
  // values that put origin.x at its two extremes (0 = canvas's left edge
  // at the stage's left edge, stageW - contentW = canvas's right edge at
  // the stage's right edge), so this always agrees with what's actually
  // on screen.
  const clampPan = useCallback(
    (rawPan: { x: number; y: number }, atScale: number, stageW: number, stageH: number) => {
      if (stageW <= 0 || stageH <= 0) return rawPan;
      const rOffset = showRulers ? RULER_SIZE / 2 : 0;
      const scrollRangeX = s.width * atScale - stageW;
      const scrollRangeY = s.height * atScale - stageH;
      const x =
        scrollRangeX > 0
          ? Math.max(-scrollRangeX / 2 - rOffset, Math.min(scrollRangeX / 2 - rOffset, rawPan.x))
          : 0;
      const y =
        scrollRangeY > 0
          ? Math.max(-scrollRangeY / 2 - rOffset, Math.min(scrollRangeY / 2 - rOffset, rawPan.y))
          : 0;
      return { x, y };
    },
    [s.width, s.height, showRulers],
  );

  // Mobile only: pans (in screen pixels, same 1:1 unit `pan` state already
  // uses — see canvasOrigin/panForFocal above) so a given layer's on-screen
  // rect sits inside whatever's currently a "safe" viewing area, instead of
  // being covered by mobile-only chrome. The persistent 60px bottom bar
  // (tab bar / selection toolbar) doesn't need special-casing here — the
  // stage element's own layout already reserves space for it (see
  // `canvasStage`'s wrapper paddingBottom), so `stageRect` alone already
  // excludes it. What it does NOT reserve for is the tool drawer, which is
  // `position: fixed` to the *window* at 75vh rather than laid out inside
  // the stage — callers covering that case pass `maxSafeViewportY` (the
  // drawer's top edge in viewport coordinates) to additionally treat
  // everything below that line as unsafe.
  const panLayerIntoView = useCallback(
    (layerId: string, opts?: { maxSafeViewportY?: number }) => {
      // If we are at fit scale and no drawer is covering the canvas, canvas is already centered and fully visible
      if (!opts?.maxSafeViewportY && !isCustomZoomRef.current) return;

      const stageEl = stageRef.current;
      if (!stageEl) return;
      const target = stageEl.querySelector(`[data-layer-id="${layerId}"]`) as HTMLElement | null;
      if (!target) return;

      const stageRect = stageEl.getBoundingClientRect();
      const margin = 24;
      const safeTop = stageRect.top + margin;
      const safeBottom = Math.min(stageRect.bottom, opts?.maxSafeViewportY ?? stageRect.bottom) - margin;
      const safeLeft = stageRect.left + margin;
      const safeRight = stageRect.right - margin;
      if (safeBottom <= safeTop || safeRight <= safeLeft) return;

      const elRect = target.getBoundingClientRect();

      // Only actually move anything when the layer isn't already comfortably
      // inside the safe band — re-centering on every selection even when the
      // layer was already fine where it was would feel jumpy for no reason.
      let deltaY = 0;
      if (elRect.top < safeTop || elRect.bottom > safeBottom) {
        deltaY = (safeTop + safeBottom) / 2 - (elRect.top + elRect.bottom) / 2;
      }
      let deltaX = 0;
      if (elRect.left < safeLeft || elRect.right > safeRight) {
        deltaX = (safeLeft + safeRight) / 2 - (elRect.left + elRect.right) / 2;
      }
      if (!deltaX && !deltaY) return;

      setPan((p) =>
        clampPan({ x: p.x + deltaX, y: p.y + deltaY }, scaleRef.current, stageRect.width, stageRect.height),
      );
    },
    [clampPan],
  );

  // Keeps mobileToolDrawerVisiblePx (see its own comment above) current by
  // directly measuring the drawer's real on-screen intersection every
  // frame while it's open — a transform-driven slide (which is all vaul
  // does between snap points, and continuously while mid-drag) doesn't fire
  // ResizeObserver, IntersectionObserver's own throttling is too coarse to
  // track a drag smoothly, and the activeSnapPoint callback route already
  // proved unreliable — so this reads the one thing that's always accurate
  // regardless of any of that: the element's actual bounding rect against
  // the viewport, right now. rAF-driven rather than on some fixed interval
  // so it tracks a live drag as smoothly as the drag itself renders, and
  // stops immediately (no idle polling) the moment the drawer closes.
  useEffect(() => {
    if (!isMobile || !mobileToolDrawerOpen) {
      setMobileToolDrawerVisiblePx(0);
      return;
    }
    let rafId: number;
    const measure = () => {
      const el = toolDrawerContentRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        setMobileToolDrawerVisiblePx((prev) => (Math.abs(prev - visible) > 1 ? visible : prev));
      }
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, [isMobile, mobileToolDrawerOpen]);

  // Trigger 1: a fresh single-layer selection on mobile when zoomed in
  useEffect(() => {
    const only = canvasSelection.length === 1 ? canvasSelection[0] : undefined;
    if (!isMobile || !only || !isCustomZoomRef.current) return;
    const raf = requestAnimationFrame(() => panLayerIntoView(only.id));
    return () => cancelAnimationFrame(raf);
  }, [isMobile, canvasSelection, panLayerIntoView]);

  // Trigger 2: the mobile tool drawer opening while a layer stays selected
  useEffect(() => {
    const only = canvasSelection.length === 1 ? canvasSelection[0] : undefined;
    if (!isMobile || !mobileToolDrawerOpen || !only) return;
    const maxSafeViewportY = window.innerHeight * (1 - MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION);
    const raf = requestAnimationFrame(() => panLayerIntoView(only.id, { maxSafeViewportY }));
    return () => cancelAnimationFrame(raf);
  }, [isMobile, mobileToolDrawerOpen, canvasSelection, panLayerIntoView]);

  // Restore canvas to normal centered fit when drawer closes or selection clears on mobile
  const prevDrawerOpenRef = useRef(mobileToolDrawerOpen);
  useEffect(() => {
    let t: number | undefined;
    if (isMobile) {
      if (prevDrawerOpenRef.current && !mobileToolDrawerOpen && !isCustomZoomRef.current) {
        fit();
        t = window.setTimeout(fit, 320);
      }
      prevDrawerOpenRef.current = mobileToolDrawerOpen;
    }
    return () => {
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [isMobile, mobileToolDrawerOpen, fit]);

  const prevSelectionLenRef = useRef(canvasSelection.length);
  useEffect(() => {
    let t: number | undefined;
    if (isMobile) {
      if (prevSelectionLenRef.current > 0 && canvasSelection.length === 0 && !isCustomZoomRef.current) {
        fit();
        t = window.setTimeout(fit, 320);
      }
      prevSelectionLenRef.current = canvasSelection.length;
    }
    return () => {
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [isMobile, canvasSelection.length, fit]);

  // The one real zoom primitive — wheel, buttons, and the slider/typed-%
  // input all funnel through this (pinch has its own variant below, since
  // a pinch gesture also needs to pan by the fingers' own movement, which
  // this alone doesn't do — see the touch effect). No native scrolling
  // involved at all: `pan` is plain state (see the canvas transform in the
  // JSX below), so this is pure arithmetic via canvasOrigin/panForFocal —
  // compositor-only (transform, not layout), so unlike the old
  // scrollLeft/scrollTop approach there's no reflow to throttle and nothing
  // that can desync from a debounce mid-gesture.
  const applyZoom = useCallback(
    (nextScaleRaw: number, focalClientX?: number, focalClientY?: number) => {
      const stageEl = stageRef.current;
      if (!stageEl) return;
      const prevScale = scaleRef.current;
      const nextScale = Math.max(0.1, Math.min(2.5, Math.round(nextScaleRaw * 100) / 100));
      if (nextScale === prevScale) return;
      isCustomZoomRef.current = true;

      const rect = stageEl.getBoundingClientRect();
      const stageW = rect.width;
      const stageH = rect.height;
      const focalX = focalClientX !== undefined ? focalClientX - rect.left : stageW / 2;
      const focalY = focalClientY !== undefined ? focalClientY - rect.top : stageH / 2;
      const prevPan = panRef.current;

      const origin = canvasOrigin(prevScale, prevPan, stageW, stageH);
      const contentX = (focalX - origin.x) / prevScale;
      const contentY = (focalY - origin.y) / prevScale;

      const nextPan = panForFocal(nextScale, focalX, focalY, contentX, contentY, stageW, stageH);
      setPan(clampPan(nextPan, nextScale, stageW, stageH));
      setScale(nextScale);
    },
    [canvasOrigin, panForFocal, clampPan],
  );

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      applyZoom(scaleRef.current * factor, clientX, clientY);
    },
    [applyZoom],
  );

  // Focal point defaults to viewport center (slider/+-/typed-% callers have
  // no natural focal point of their own); pinch-zoom passes the actual
  // midpoint between the two fingers so the canvas zooms around your
  // fingers instead of jumping to re-center itself.
  const zoomToScale = useCallback(
    (targetScale: number, focalClientX?: number, focalClientY?: number) => {
      applyZoom(targetScale, focalClientX, focalClientY);
    },
    [applyZoom],
  );

  // Zoom in/out buttons step by percentage points
  const zoomBy = useCallback(
    (deltaPercent: number) => {
      applyZoom(scaleRef.current + deltaPercent / 100);
    },
    [applyZoom],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Zoom with Ctrl/Cmd (mouse wheel) or a trackpad pinch gesture
      // (browsers report those as wheel events with ctrlKey set too).
      // Scaled off the actual deltaY magnitude rather than a flat step —
      // one discrete mouse-wheel notch (deltaY around ±100) now zooms a
      // snappy ~16% instead of a flat 5%, while a trackpad's much smaller
      // per-event deltas during a continuous scroll still add up smoothly
      // instead of jumping — a flat step big enough to feel fast for a
      // mouse notch would have made trackpad zoom feel jerky.
      // No cursor position passed — always zooms around the stage's own
      // center (applyZoom's default focal point) rather than the cursor,
      // so the canvas grows/shrinks symmetrically instead of drifting
      // toward wherever the mouse happens to be.
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        zoomAt(factor);
        return;
      }
      // Plain scroll pans instead — the stage has no native scrolling of
      // its own anymore (see the canvas transform below), so this is what
      // replaces it. Shift+wheel is the standard convention for turning a
      // vertical-only mouse wheel into horizontal panning. Clamped so this
      // is a genuine no-op — not just a tiny nudge — once the canvas
      // already fits inside the stage; there's nothing to scroll to.
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      const { width: stageW, height: stageH } = stageSizeRef.current;
      setPan((p) => clampPan({ x: p.x - dx, y: p.y - dy }, scaleRef.current, stageW, stageH));
      isCustomZoomRef.current = true;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, clampPan]);

  // Mobile touch: two fingers pinch-zoom AND pan together (Canva/Figma-
  // style — the midpoint moving pans, the distance changing zooms, both at
  // once), one finger pans on its own (replacing the native touch-scroll
  // lost by the stage no longer using native overflow scrolling at all —
  // see the canvas transform in the JSX below). rAF-throttled to 60fps.
  //
  // Everything for an active gesture is computed fresh each frame from a
  // FIXED snapshot taken once at touchstart (initialScale/initialPan/the
  // content point under the very first touch), never by accumulating
  // per-frame deltas — that's what keeps a long gesture drift-free and
  // lets pinch and pan combine correctly in one pass instead of two
  // updates fighting each other (see panForFocal above).
  //
  // Reads/writes scale/pan through scaleRef/panRef rather than closing over
  // the state values directly, specifically so this effect's deps don't
  // need them — depending on scale/pan directly would re-run (tearing down
  // and re-registering all the touch listeners) on every single frame of
  // an active gesture, dropping the touchmove landing exactly during the
  // swap — a real contributor to "pinch feels slow". `isMobile` is the
  // dependency instead: `canvasStage` (which owns this ref) lives in two
  // different branches of this component's JSX (mobile vs desktop shells),
  // so when `isMobile` resolves after mount and flips the rendered branch,
  // the stage `<div>` is a genuinely new DOM node and this effect must
  // re-run to attach to it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    let rafId: number | null = null;

    // Two-finger pinch+pan gesture state. Zoom always anchors at the
    // stage's own fixed center (initialContentX/Y is the content point
    // that was at center when the gesture started) — not the pinch
    // midpoint — so the canvas grows/shrinks symmetrically instead of
    // drifting toward wherever the fingers happen to be. The midpoint's
    // own movement is tracked separately, as a total offset from where the
    // gesture started (not accumulated frame-by-frame, same drift-free
    // reasoning as everything else here), and added on top of the zoom's
    // own pan — so two fingers dragging together while pinching still
    // pans normally alongside the zoom.
    let pinchActive = false;
    let initialPinchDist = 0;
    let initialScale = 1;
    let initialStageRect: DOMRect | null = null;
    let initialContentX = 0;
    let initialContentY = 0;
    let initialMidX = 0;
    let initialMidY = 0;
    let pendingScale: number | null = null;
    let pendingDragX = 0;
    let pendingDragY = 0;

    // Single-finger pan gesture state. Only actually engages (and calls
    // preventDefault, which is what suppresses the browser's normal
    // touch→click synthesis) once movement clears a small threshold — a
    // quick tap-without-drag needs to fall through untouched so
    // handleStageClick's mobile deselect-on-tap still fires normally.
    let panTouchId: number | null = null;
    let panActive = false;
    let panStartX = 0;
    let panStartY = 0;
    let panLastX = 0;
    let panLastY = 0;
    let pendingPanDx = 0;
    let pendingPanDy = 0;
    let hasPendingPan = false;

    const getTouchDist = (t1: Touch, t2: Touch) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const getTouchMidpoint = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const scheduleFrame = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pendingScale !== null && initialStageRect) {
          isCustomZoomRef.current = true;
          const centerX = initialStageRect.width / 2;
          const centerY = initialStageRect.height / 2;
          const zoomPan = panForFocal(
            pendingScale,
            centerX,
            centerY,
            initialContentX,
            initialContentY,
            initialStageRect.width,
            initialStageRect.height,
          );
          setScale(pendingScale);
          // The zoom's own pan (keeping the stage center fixed) plus
          // however far the fingers have additionally dragged since the
          // gesture started — see the state comment above. Clamped so a
          // fast pinch can't fling the canvas past its actual bounds.
          setPan(
            clampPan(
              { x: zoomPan.x + pendingDragX, y: zoomPan.y + pendingDragY },
              pendingScale,
              initialStageRect.width,
              initialStageRect.height,
            ),
          );
          pendingScale = null;
        } else if (hasPendingPan) {
          isCustomZoomRef.current = true;
          const { width: stageW, height: stageH } = stageSizeRef.current;
          setPan((p) => clampPan({ x: p.x + pendingPanDx, y: p.y + pendingPanDy }, scaleRef.current, stageW, stageH));
          pendingPanDx = 0;
          pendingPanDy = 0;
          hasPendingPan = false;
        }
      });
    };

    let suppressCooldownTimer: ReturnType<typeof setTimeout> | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        // Upgrading from a single-finger pan (or starting fresh) into a
        // pinch — reset both gesture states cleanly from here.
        panActive = false;
        panTouchId = null;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        if (!t1 || !t2) return;
        e.preventDefault();
        e.stopPropagation();
        const stageEl = stageRef.current;
        if (!stageEl) return;
        pinchActive = true;
        suppressDragRef.current = true;
        if (suppressCooldownTimer) {
          clearTimeout(suppressCooldownTimer);
          suppressCooldownTimer = null;
        }
        // Deselect any object immediately so two-finger zooming never leaves or triggers a selection
        setCanvasSelection([]);
        setIsBackgroundSelected(false);
        initialPinchDist = getTouchDist(t1, t2);
        initialScale = scaleRef.current;
        initialStageRect = stageEl.getBoundingClientRect();
        const midpoint = getTouchMidpoint(t1, t2);
        initialMidX = midpoint.x;
        initialMidY = midpoint.y;
        const centerX = initialStageRect.width / 2;
        const centerY = initialStageRect.height / 2;
        const origin = canvasOrigin(initialScale, panRef.current, initialStageRect.width, initialStageRect.height);
        initialContentX = (centerX - origin.x) / initialScale;
        initialContentY = (centerY - origin.y) / initialScale;
        return;
      }

      if (e.touches.length === 1 && !pinchActive && !suppressDragRef.current) {
        const touch = e.touches[0];
        if (!touch) return;
        const target = touch.target as HTMLElement | null;
        if (
          target?.closest(
            "button, input, textarea, [data-nopan], [data-layer-id], [contenteditable='true']",
          )
        ) {
          return;
        }
        panTouchId = touch.identifier;
        panActive = false;
        panStartX = touch.clientX;
        panStartY = touch.clientY;
        panLastX = touch.clientX;
        panLastY = touch.clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pinchActive && e.touches.length >= 2 && initialStageRect) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        if (!t1 || !t2) return;
        e.preventDefault();
        e.stopPropagation();
        const currentDist = getTouchDist(t1, t2);
        if (currentDist > 0 && initialPinchDist > 0) {
          const ratio = currentDist / initialPinchDist;
          const midpoint = getTouchMidpoint(t1, t2);
          pendingScale = Math.max(0.1, Math.min(2.5, Math.round(initialScale * ratio * 100) / 100));
          pendingDragX = midpoint.x - initialMidX;
          pendingDragY = midpoint.y - initialMidY;
          scheduleFrame();
        }
        return;
      }

      if (panTouchId !== null && !pinchActive) {
        let touch: Touch | null = null;
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t && t.identifier === panTouchId) {
            touch = t;
            break;
          }
        }
        if (!touch) return;

        if (!panActive) {
          if (Math.hypot(touch.clientX - panStartX, touch.clientY - panStartY) < 6) return;
          panActive = true;
        }
        e.preventDefault();
        e.stopPropagation();
        pendingPanDx += touch.clientX - panLastX;
        pendingPanDy += touch.clientY - panLastY;
        hasPendingPan = true;
        panLastX = touch.clientX;
        panLastY = touch.clientY;
        scheduleFrame();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        if (pinchActive) {
          // Keep suppressDragRef active during gesture end cooldown so trailing tap events do not select objects
          suppressDragRef.current = true;
          if (suppressCooldownTimer) clearTimeout(suppressCooldownTimer);
          suppressCooldownTimer = setTimeout(() => {
            suppressDragRef.current = false;
            suppressCooldownTimer = null;
          }, 300);
        } else if (!suppressCooldownTimer) {
          suppressDragRef.current = false;
        }
        pinchActive = false;
        initialStageRect = null;
        pendingScale = null;
        pendingDragX = 0;
        pendingDragY = 0;
      }
      if (e.touches.length === 0 && suppressCooldownTimer) {
        // Cooldown timer will reset suppressDragRef
      }
      if (panTouchId !== null) {
        let stillDown = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i]?.identifier === panTouchId) {
            stillDown = true;
            break;
          }
        }
        if (!stillDown) {
          panTouchId = null;
          panActive = false;
        }
      }
      if (e.touches.length === 0 && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        pendingPanDx = 0;
        pendingPanDy = 0;
        hasPendingPan = false;
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
  }, [isMobile, canvasOrigin, panForFocal, clampPan]);

  // Templates and saved quotes (loaded the same way — see LeftPanel's
  // "My saved" tab) both come through here, so this is also the one place
  // that needs to upgrade an old-format saved design (fixed `quote`/
  // `boxColor`/... fields, no shapes/texts) into the layer model —
  // migrateLegacyContentToLayers() is a no-op for anything already in the
  // new format (every STARTER_TEMPLATE, and INITIAL_STATE itself).
  const applyTemplate = useCallback((templateState: Partial<EditorState>) => {
    setEditingSavedQuoteTarget(null);
    setCanvasSelection([]);
    setIsBackgroundSelected(false);
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
    } catch { }
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
    setIsBackgroundSelected(false);
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
      if (!finalUrl) {
        finalUrl = previewUrl || (await renderExport(1));
      }
      if (!finalUrl) return;
      const filename = `quote-canvas.${s.exportFormat}`;

      // 1. Native Capacitor App (Android/iOS standalone build)
      if (Capacitor.isNativePlatform()) {
        await saveExportedImageNative(finalUrl, filename);
      } else {
        // Direct browser file download (saved directly into device Downloads / Gallery without opening share dialog)
        const blob = finalUrl.startsWith("blob:")
          ? await fetch(finalUrl).then((r) => r.blob())
          : dataUrlToBlob(finalUrl);

        const blobUrl = finalUrl.startsWith("blob:") ? finalUrl : URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        toast.success(`Downloaded ${filename}!`, { position: "bottom-center" });
        setTimeout(() => {
          document.body.removeChild(a);
          if (!finalUrl.startsWith("blob:")) {
            URL.revokeObjectURL(blobUrl);
          }
        }, 3000);
      }
      setPreviewOpen(false);
    } catch (err) {
      console.error("Download failed:", err);
      toast.error("Failed to download image.", { position: "bottom-center" });
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
  // Where the canvas wrapper's transform actually places it on screen —
  // canvasOrigin already folds the ruler offset in itself (given the raw
  // `pan`, not effectivePan above), matching exactly what applyZoom and the
  // pinch handler use to compute `pan` in the first place.
  const canvasWrapperOrigin = canvasOrigin(scale, pan, stageSize.width, stageSize.height);

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
          set("texts", (_, prevS) =>
            withTextUpdated(prevS, selectedTextLayer.id, {
              weight: selectedTextLayer.weight >= 700 ? 400 : 700,
            }),
          );
        else if (cmd === "italic")
          set("texts", (_, prevS) =>
            withTextUpdated(prevS, selectedTextLayer.id, { italic: !selectedTextLayer.italic }),
          );
        else if (cmd === "underline")
          set("texts", (_, prevS) =>
            withTextUpdated(prevS, selectedTextLayer.id, { underline: !selectedTextLayer.underline }),
          );
        else if (cmd === "strike")
          set("texts", (_, prevS) =>
            withTextUpdated(prevS, selectedTextLayer.id, { strike: !selectedTextLayer.strike }),
          );
      },
      setFontFamily: (v) =>
        set("texts", (_, prevS) => withTextUpdated(prevS, selectedTextLayer.id, { fontFamily: v })),
      setSize: (v) => {
        set("texts", (_, prevS) => {
          const currentT = getTextLayers(prevS).find((t) => t.id === selectedTextLayer.id);
          const currentSize = currentT?.size || selectedTextLayer.size || 32;
          const ratio = v / currentSize;
          const nextWidth = selectedTextLayer.width
            ? Math.round(Math.max(40, selectedTextLayer.width * ratio))
            : undefined;
          const nextMinHeight = selectedTextLayer.minHeight
            ? Math.round(selectedTextLayer.minHeight * ratio)
            : undefined;
          return withTextUpdated(prevS, selectedTextLayer.id, {
            size: v,
            ...(nextWidth !== undefined ? { width: nextWidth } : {}),
            ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
          });
        });
      },
      setColor: (v) =>
        set("texts", (_, prevS) => withTextUpdated(prevS, selectedTextLayer.id, { color: v })),
      setAlign: (v) =>
        set("texts", (_, prevS) => withTextUpdated(prevS, selectedTextLayer.id, { align: v })),
      setLetterSpacing: (v) =>
        set("texts", (_, prevS) => withTextUpdated(prevS, selectedTextLayer.id, { letterSpacing: v })),
      setLineHeight: (v) =>
        set("texts", (_, prevS) => withTextUpdated(prevS, selectedTextLayer.id, { lineHeight: v })),
      setVerticalAlign: (v) =>
        set("texts", (_, prevS) => withTextUpdated(prevS, selectedTextLayer.id, { verticalAlign: v })),
      updateLayer: (patch) =>
        set("texts", (_, prevS) => withTextUpdated(prevS, selectedTextLayer.id, patch)),
      snapshotSelection: () => { },
      getActiveFormat: () => ({
        bold: selectedTextLayer.weight >= 700,
        italic: !!selectedTextLayer.italic,
        underline: !!selectedTextLayer.underline,
        strike: !!selectedTextLayer.strike,
        uppercase: !!selectedTextLayer.uppercase,
        bulletList: false,
        numberedList: false,
      }),
      subscribeActiveFormat: (cb) => {
        cb({
          bold: selectedTextLayer.weight >= 700,
          italic: !!selectedTextLayer.italic,
          underline: !!selectedTextLayer.underline,
          strike: !!selectedTextLayer.strike,
          uppercase: !!selectedTextLayer.uppercase,
          bulletList: false,
          numberedList: false,
        });
        return () => { };
      },
      startEditing: () => { },
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

  // Batch editing: when every currently-selected layer is a shape (two or
  // more — e.g. several rectangles/circles dropped as decoration), surface
  // a toolbar that changes fill color and width/height across all of them
  // at once via withShapesUpdated, instead of forcing one-at-a-time edits.
  const multiSelectedShapeLayers =
    canvasSelection.length > 1 && canvasSelection.every((sel) => sel.kind === "shape")
      ? (canvasSelection
        .map((sel) => getShapeLayers(s).find((sh) => sh.id === sel.id))
        .filter(Boolean) as ShapeLayer[])
      : [];
  const isMultiShapeSelection = multiSelectedShapeLayers.length > 1;

  const unifiedLayers = useMemo(
    () => getUnifiedLayers(s),
    [s.layerOrder, s.texts, s.images, s.shapes],
  );

  // Position-panel callbacks for the multi-shape toolbar (Arrange/Align/
  // Advanced X-Y) — shared between the desktop and mobile render slots
  // below rather than re-inlined at each, since both need the exact same
  // logic. Recomputed every render (multiSelectedShapeLayers/`s` aren't
  // memoized), same as this file's other per-render callbacks (e.g.
  // handleSelectLayer) — useCallback here is for consistency with that
  // pattern, not a real memoization win.
  const handleShapeArrange = useCallback(
    (direction: ShapeArrangeDirection) => {
      const ids = multiSelectedShapeLayers.map((l) => l.id);
      commit(
        (prev) => ({
          ...prev,
          layerOrder: withUnifiedLayersReordered(prev, ids, direction).layerOrder,
        }),
        { key: "arrange" },
      );
    },
    [multiSelectedShapeLayers, commit],
  );
  const handleShapeAlign = useCallback(
    (edge: ShapeAlignEdge) => {
      set("shapes", (_, prev) =>
        withShapesAligned(prev, multiSelectedShapeLayers.map((l) => l.id), edge),
      );
    },
    [multiSelectedShapeLayers, set],
  );
  const handleShapeShiftGroup = useCallback(
    (dxPercent: number, dyPercent: number) => {
      set("shapes", (_, prev) =>
        withShapesShifted(prev, multiSelectedShapeLayers.map((l) => l.id), dxPercent, dyPercent),
      );
    },
    [multiSelectedShapeLayers, set],
  );

  // Same batch-editing idea as multiSelectedShapeLayers above, for a
  // multi-selection made entirely of images — Arrange/Align/Advanced X-Y,
  // same as shapes (withUnifiedLayersReordered is kind-agnostic and shared
  // as-is; withImagesAligned/withImagesShifted are the image-specific
  // counterparts to withShapesAligned/withShapesShifted).
  const multiSelectedImageLayers =
    canvasSelection.length > 1 && canvasSelection.every((sel) => sel.kind === "image")
      ? (canvasSelection
        .map((sel) => getImageLayers(s).find((img) => img.id === sel.id))
        .filter(Boolean) as ImageLayer[])
      : [];
  const isMultiImageSelection = multiSelectedImageLayers.length > 1;

  // Mixed multi-selection: 2+ layers that are NOT all the same kind (i.e.
  // not covered by isMultiShapeSelection or isMultiImageSelection). Also
  // covers "all text" multi-selection which previously had no dedicated
  // toolbar at all. Fired whenever there are 2+ layers selected and neither
  // of the homogeneous toolbars applies.
  const isMixedMultiSelection =
    canvasSelection.length > 1 && !isMultiShapeSelection && !isMultiImageSelection;

  // Text layers that are part of a mixed multi-selection
  const mixedSelectedTextLayers = isMixedMultiSelection
    ? (canvasSelection
      .filter((sel) => sel.kind === "text")
      .map((sel) => getTextLayers(s).find((t) => t.id === sel.id))
      .filter(Boolean) as import("@/components/editor/types").TextLayer[])
    : [];
  const mixedAllText = isMixedMultiSelection && canvasSelection.every((sel) => sel.kind === "text");

  const handleMixedAlign = useCallback(
    (edge: ShapeAlignEdge) => {
      const result = withMixedLayersAligned(s, canvasSelection as MixedLayerRef[], edge);
      set("texts", result.texts);
      set("images", result.images);
      set("shapes", result.shapes);
    },
    [canvasSelection, s, set],
  );

  const handleMixedArrange = useCallback(
    (direction: ShapeArrangeDirection) => {
      const ids = canvasSelection.map((l) => l.id);
      commit(
        (prev) => ({
          ...prev,
          layerOrder: withUnifiedLayersReordered(prev, ids, direction).layerOrder,
        }),
        { key: "arrange" },
      );
    },
    [canvasSelection, commit],
  );

  const handleMixedUpdateAllTexts = useCallback(
    (patch: Partial<Omit<import("@/components/editor/types").TextLayer, "id">>) => {
      if (!mixedAllText) return;
      set("texts", (_, prev) =>
        withTextsUpdated(prev, mixedSelectedTextLayers.map((t) => t.id), patch),
      );
    },
    [mixedAllText, mixedSelectedTextLayers, set],
  );

  const handleImageArrange = useCallback(
    (direction: ShapeArrangeDirection) => {
      const ids = multiSelectedImageLayers.map((l) => l.id);
      commit(
        (prev) => ({
          ...prev,
          layerOrder: withUnifiedLayersReordered(prev, ids, direction).layerOrder,
        }),
        { key: "arrange" },
      );
    },
    [multiSelectedImageLayers, commit],
  );
  const handleImageAlign = useCallback(
    (edge: ShapeAlignEdge) => {
      set("images", (_, prev) =>
        withImagesAligned(prev, multiSelectedImageLayers.map((l) => l.id), edge),
      );
    },
    [multiSelectedImageLayers, set],
  );
  const handleImageShiftGroup = useCallback(
    (dxPercent: number, dyPercent: number) => {
      set("images", (_, prev) =>
        withImagesShifted(prev, multiSelectedImageLayers.map((l) => l.id), dxPercent, dyPercent),
      );
    },
    [multiSelectedImageLayers, set],
  );

  const handleSingleArrange = useCallback(
    (id: string, direction: ShapeArrangeDirection) => {
      commit(
        (prev) => ({
          ...prev,
          layerOrder: withUnifiedLayersReordered(prev, [id], direction).layerOrder,
        }),
        { key: "arrange" },
      );
    },
    [commit],
  );

  // Keeps a floating toolbar popover (font, color, shadow, gradient, ...)
  // open and fully usable even after the layer it belongs to stops being
  // the live canvas selection — e.g. the user clicked the canvas background
  // to check a color against it, or selected a different layer, while that
  // popover was still open. Each of the four selection toolbars reports up
  // via onAnyPopoverOpenChange whenever ANY of its own popovers opens or
  // closes. Tracked per KIND (one slot each for text/image/shape/
  // background, not a single shared value) so opening a popover in one
  // toolbar can never clobber another toolbar's still-open, now-detached
  // one — e.g. a Text popover left floating after a background click stays
  // put even if the user goes on to select an image and opens one of ITS
  // popovers too; several can be detached at once. "background" doesn't
  // need a real per-instance id — there's only ever one, so its slot just
  // holds a constant. While a kind's toolbar is no longer what live
  // selection would show, the toolbar's own render slot below falls back
  // to this pin to keep the SAME component instance mounted (`detached`)
  // instead of unmounting it — a fresh instance in a new slot would lose
  // the popover's own state (search text, drag position, which one is
  // open) the instant it detached, which defeats the point.
  const [pinnedOwners, setPinnedOwners] = useState<{
    text: string | null;
    image: string | null;
    shape: string | null;
    background: string | null;
  }>({ text: null, image: null, shape: null, background: null });
  const handlePinnedPopoverChange = useCallback(
    (kind: "text" | "image" | "shape" | "background", id: string, open: boolean) => {
      setPinnedOwners((prev) =>
        prev[kind] === id && !open
          ? { ...prev, [kind]: null }
          : open
            ? { ...prev, [kind]: id }
            : prev,
      );
    },
    [],
  );

  // "Is any FloatingDropdown popover open right now" (radius/opacity/
  // shadow/font/color/spacing/... across every selection toolbar) — any
  // `pinnedOwners` slot going non-null already means exactly that (see the
  // long comment above it), reused here as trigger 3's signal instead of
  // adding new callback plumbing through every toolbar component.
  const anyPopoverOpen = !!(pinnedOwners.text || pinnedOwners.image || pinnedOwners.shape || pinnedOwners.background);

  const [floatingDrawerHeightPx, setFloatingDrawerHeightPx] = useState(0);

  // Measures the exact real-time visible height of the active floating drawer/popover
  // on mobile, so the canvas only lifts by the exact height of the drawer (e.g. Spacing ~240px
  // vs Font ~380px) without any awkward empty gap above small drawers.
  useEffect(() => {
    if (!isMobile || !anyPopoverOpen) {
      setFloatingDrawerHeightPx(0);
      return;
    }
    let rafId: number;
    const measure = () => {
      const el = document.querySelector<HTMLElement>("[data-floating-dropdown]");
      if (el) {
        const rect = el.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        if (visible > 0) {
          setFloatingDrawerHeightPx((prev) => (Math.abs(prev - visible) > 1 ? visible : prev));
        }
      }
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(rafId);
  }, [isMobile, anyPopoverOpen]);

  // Whether the canvas area should currently be lifted clear of an open
  // property popover — adapts directly to the measured height of the open drawer.
  const mobileDrawerLiftActive = isMobile && anyPopoverOpen && floatingDrawerHeightPx > 0;

  // Whether the tool drawer has been dragged down far enough to treat the
  // canvas as "should come back into view" — deliberately NOT the same
  // continuous, always-tracking value the drawer's own scrollable content
  // uses (mobileToolDrawerVisiblePx). While the drawer sits at its tall
  // default (or anywhere still closer to tall than to the peek height),
  // the canvas is fully hidden behind it either way, so there's nothing to
  // gain from also reflowing/shrinking it in lockstep with every frame of
  // that — it can just stay exactly where it normally sits, untouched,
  // until the drag actually gets close to the peek height, at which point
  // it snaps into its lifted position in one clean step (with its own
  // transition — see where this is used below) instead of following the
  // whole drag continuously. The cutoff sits at the midpoint between the
  // two snap fractions, so it's roughly "closer to peek than to tall".
  const mobileToolDrawerNearPeek =
    isMobile &&
    mobileToolDrawerOpen &&
    mobileToolDrawerVisiblePx > 0 &&
    mobileToolDrawerVisiblePx < window.innerHeight * ((1 + MOBILE_SHEET_MAX_HEIGHT_FRACTION) / 2);

  // Trigger 3: a FloatingDropdown popover opening. Adapts safely to the exact measured drawer height.
  useEffect(() => {
    const only = canvasSelection.length === 1 ? canvasSelection[0] : undefined;
    if (!isMobile || !only || !anyPopoverOpen || floatingDrawerHeightPx <= 0) return;
    const maxSafeViewportY = window.innerHeight - floatingDrawerHeightPx - 16;
    const raf = requestAnimationFrame(() => panLayerIntoView(only.id, { maxSafeViewportY }));
    return () => cancelAnimationFrame(raf);
  }, [isMobile, canvasSelection, anyPopoverOpen, floatingDrawerHeightPx, panLayerIntoView]);

  // Restore canvas to normal centered fit when any toolbar property drawer closes on mobile
  const prevAnyPopoverOpenRef = useRef(anyPopoverOpen);
  useEffect(() => {
    let t: number | undefined;
    if (isMobile) {
      if (prevAnyPopoverOpenRef.current && !anyPopoverOpen && !mobileToolDrawerOpen && !isCustomZoomRef.current) {
        fit();
        t = window.setTimeout(fit, 320);
      }
      prevAnyPopoverOpenRef.current = anyPopoverOpen;
    }
    return () => {
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [isMobile, anyPopoverOpen, mobileToolDrawerOpen, fit]);

  const textDetached = !selectedTextLayer && !!pinnedOwners.text;
  const imageDetached = !selectedImageLayer && !!pinnedOwners.image;
  const shapeDetached = !selectedShapeLayer && !!pinnedOwners.shape;
  const backgroundDetached = !isBackgroundSelected && !!pinnedOwners.background;
  const pinnedTextLayer = textDetached
    ? getTextLayers(s).find((t) => t.id === pinnedOwners.text)
    : undefined;
  const pinnedTextLayerHandle = pinnedTextLayer
    ? textLayerHandlesRef.current.get(pinnedTextLayer.id)
    : undefined;
  const pinnedImageLayer = imageDetached
    ? getImageLayers(s).find((img) => img.id === pinnedOwners.image)
    : undefined;
  const pinnedShapeLayer = shapeDetached
    ? getShapeLayers(s).find((sh) => sh.id === pinnedOwners.shape)
    : undefined;

  const handleSelectLayer = useCallback(
    (
      layer: { kind: "image" | "text" | "shape"; id: string },
      opts?: { toggle?: boolean; selectAll?: boolean },
    ) => {
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
        on the .dark class. Shown on every viewport width — the toolbar
        floats above the canvas via an overlay (not reserved space), and
        with the canvas centered rather than filling the stage, a plain
        flat bg-background fallback (previously used below the md
        breakpoint) left a visible flat gray/dark box in that gap instead
        of reading as an intentional backdrop. Fixed in the viewport frame
        so the gradient stays static and never shifts or tears as the user
        pans, zooms, or scrolls the canvas.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out"
        style={{ background: "var(--gradient-stage-light)", opacity: dark ? 0 : 1 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out"
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

          // Downscaled + re-encoded before ever becoming a data URL — see
          // imageCompression.ts's own comment for why this matters (every
          // image in this app is embedded as base64, not uploaded to
          // object storage).
          const dataUrls = (await compressImageFiles(files)).filter(Boolean);
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
        // No native scrolling — panning is handled entirely as explicit
        // `pan` state (wheel/pinch/one-finger-drag effects above), applied
        // as a transform on the canvas wrapper below. That's what makes
        // zoom purely compositor-driven with no layout reflow, and what
        // keeps the canvas reliably centered instead of fighting a native
        // scroll range that used to change size mid-gesture.
        className="relative h-full w-full overflow-hidden"
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
            scrollable on mobile since its contents don't wrap.

            Four independent slots below (not one ternary picking a single
            winner) so a toolbar whose layer stopped being the live
            selection can keep rendering — invisibly, `detached` — purely to
            keep hosting whichever of its own popovers is still open (see
            the pinnedOwners comment above). Each slot only ever
            mounts ONE component instance across a live→detached transition
            (same slot, same element type, just different props), which is
            what lets that popover's own state survive the transition
            instead of resetting. */}
        {!isMobile &&
          !stageMarquee &&
          (canvasSelection.length === 1 ||
            isMultiShapeSelection ||
            isMultiImageSelection ||
            isMixedMultiSelection ||
            isBackgroundSelected ||
            textDetached ||
            imageDetached ||
            shapeDetached ||
            backgroundDetached) ? (
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
              {(selectedTextLayer && selectedTextLayerHandle) || (textDetached && pinnedTextLayer && pinnedTextLayerHandle) ? (
                <TextSelectionToolbar
                  layer={(selectedTextLayer ?? pinnedTextLayer)!}
                  handle={(selectedTextLayerHandle ?? pinnedTextLayerHandle)!}
                  detached={textDetached}
                  onArrange={(dir) => handleSingleArrange((selectedTextLayer ?? pinnedTextLayer)!.id, dir)}
                  canArrange={getArrangeEligibility(unifiedLayers, (selectedTextLayer ?? pinnedTextLayer)!.id)}
                  onAnyPopoverOpenChange={(open) =>
                    handlePinnedPopoverChange("text", (selectedTextLayer ?? pinnedTextLayer)!.id, open)
                  }
                  onOpenEffectsTab={() => {
                    setTab("text");
                    setTextSubTab("effects");
                    setLeftPanelCollapsed(false);
                  }}
                />
              ) : null}
              {selectedImageLayer || (imageDetached && pinnedImageLayer) ? (
                <ImageSelectionToolbar
                  layer={(selectedImageLayer ?? pinnedImageLayer)!}
                  detached={imageDetached}
                  onArrange={(dir) => handleSingleArrange((selectedImageLayer ?? pinnedImageLayer)!.id, dir)}
                  canArrange={getArrangeEligibility(unifiedLayers, (selectedImageLayer ?? pinnedImageLayer)!.id)}
                  onAnyPopoverOpenChange={(open) =>
                    handlePinnedPopoverChange("image", (selectedImageLayer ?? pinnedImageLayer)!.id, open)
                  }
                  onUpdate={(patch) =>
                    set("images", (_, prevS) =>
                      withImageUpdated(prevS, (selectedImageLayer ?? pinnedImageLayer)!.id, patch),
                    )
                  }
                  onOpenCrop={() => setCroppingImageLayer((selectedImageLayer ?? pinnedImageLayer)!)}
                  onOpenErase={() => setErasingImageLayer((selectedImageLayer ?? pinnedImageLayer)!)}
                />
              ) : null}
              {selectedShapeLayer || (shapeDetached && pinnedShapeLayer) ? (
                <ShapeSelectionToolbar
                  layer={(selectedShapeLayer ?? pinnedShapeLayer)!}
                  detached={shapeDetached}
                  onArrange={(dir) => handleSingleArrange((selectedShapeLayer ?? pinnedShapeLayer)!.id, dir)}
                  canArrange={getArrangeEligibility(unifiedLayers, (selectedShapeLayer ?? pinnedShapeLayer)!.id)}
                  onAnyPopoverOpenChange={(open) =>
                    handlePinnedPopoverChange("shape", (selectedShapeLayer ?? pinnedShapeLayer)!.id, open)
                  }
                  onUpdate={(patch) =>
                    set("shapes", (_, prevS) =>
                      withShapeUpdated(prevS, (selectedShapeLayer ?? pinnedShapeLayer)!.id, patch),
                    )
                  }
                  onDuplicate={() => {
                    const dup = withShapeDuplicated(s, (selectedShapeLayer ?? pinnedShapeLayer)!.id);
                    set("shapes", dup.list);
                    setCanvasSelection([{ kind: "shape", id: dup.newId }]);
                  }}
                  onDelete={() => {
                    set("shapes", withShapeRemoved(s, (selectedShapeLayer ?? pinnedShapeLayer)!.id));
                    setCanvasSelection([]);
                  }}
                  onToggleLock={() =>
                    set(
                      "shapes",
                      withShapeUpdated(s, (selectedShapeLayer ?? pinnedShapeLayer)!.id, {
                        locked: !(selectedShapeLayer ?? pinnedShapeLayer)!.locked,
                      }),
                    )
                  }
                />
              ) : null}
              {isMultiShapeSelection ? (
                <MultiShapeSelectionToolbar
                  layers={multiSelectedShapeLayers}
                  canvasWidth={s.width}
                  canvasHeight={s.height}
                  onArrange={handleShapeArrange}
                  canArrange={getArrangeEligibility(unifiedLayers, multiSelectedShapeLayers.map((l) => l.id))}
                  onAlign={handleShapeAlign}
                  onShiftGroup={handleShapeShiftGroup}
                  onUpdateAll={(patch) =>
                    set("shapes", (_, prev) =>
                      withShapesUpdated(
                        prev,
                        multiSelectedShapeLayers.map((l) => l.id),
                        patch,
                      ),
                    )
                  }
                  onToggleLockAll={() => {
                    const allLocked = multiSelectedShapeLayers.every((l) => l.locked);
                    set("shapes", (_, prev) =>
                      withShapesLockSet(
                        prev,
                        multiSelectedShapeLayers.map((l) => l.id),
                        !allLocked,
                      ),
                    );
                  }}
                  onDeleteAll={() => {
                    commit((prev) => {
                      const result = withMultipleLayersRemoved(prev, canvasSelection);
                      return { ...prev, ...result };
                    });
                    setCanvasSelection([]);
                  }}
                />
              ) : null}
              {isMultiImageSelection ? (
                <MultiImageSelectionToolbar
                  layers={multiSelectedImageLayers}
                  canvasWidth={s.width}
                  canvasHeight={s.height}
                  onArrange={handleImageArrange}
                  canArrange={getArrangeEligibility(unifiedLayers, multiSelectedImageLayers.map((l) => l.id))}
                  onAlign={handleImageAlign}
                  onShiftGroup={handleImageShiftGroup}
                  onUpdateAll={(patch) =>
                    set("images", (_, prev) =>
                      withImagesUpdated(
                        prev,
                        multiSelectedImageLayers.map((l) => l.id),
                        patch,
                      ),
                    )
                  }
                  onToggleLockAll={() => {
                    const allLocked = multiSelectedImageLayers.every((l) => l.locked);
                    set("images", (_, prev) =>
                      withImagesLockSet(
                        prev,
                        multiSelectedImageLayers.map((l) => l.id),
                        !allLocked,
                      ),
                    );
                  }}
                  onDeleteAll={() => {
                    commit((prev) => {
                      const result = withMultipleLayersRemoved(prev, canvasSelection);
                      return { ...prev, ...result };
                    });
                    setCanvasSelection([]);
                  }}
                />
              ) : null}
              {isMixedMultiSelection ? (
                <MultiMixedSelectionToolbar
                  selectedIds={canvasSelection as MixedLayerRef[]}
                  textLayers={mixedSelectedTextLayers}
                  allText={mixedAllText}
                  canvasWidth={s.width}
                  canvasHeight={s.height}
                  onAlign={handleMixedAlign}
                  onArrange={handleMixedArrange}
                  canArrange={getArrangeEligibility(unifiedLayers, canvasSelection.map((l) => l.id))}
                  onUpdateAllTexts={mixedAllText ? handleMixedUpdateAllTexts : undefined}
                  onToggleLockAll={() => {
                    const allLocked = canvasSelection.every((sel) => {
                      if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                      if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                      return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                    });
                    const textIds = canvasSelection.filter((l) => l.kind === "text").map((l) => l.id);
                    const imageIds = canvasSelection.filter((l) => l.kind === "image").map((l) => l.id);
                    const shapeIds = canvasSelection.filter((l) => l.kind === "shape").map((l) => l.id);
                    if (textIds.length) set("texts", (_, prev) => withTextsLockSet(prev, textIds, !allLocked));
                    if (imageIds.length) set("images", (_, prev) => withImagesLockSet(prev, imageIds, !allLocked));
                    if (shapeIds.length) set("shapes", (_, prev) => withShapesLockSet(prev, shapeIds, !allLocked));
                  }}
                  allLocked={canvasSelection.every((sel) => {
                    if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                    if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                    return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                  })}
                  onDeleteAll={() => {
                    commit((prev) => {
                      const result = withMultipleLayersRemoved(prev, canvasSelection);
                      return { ...prev, ...result };
                    });
                    setCanvasSelection([]);
                  }}
                />
              ) : null}
              {isBackgroundSelected || backgroundDetached ? (
                <BackgroundSelectionToolbar
                  s={s}
                  set={set}
                  detached={backgroundDetached}
                  onAnyPopoverOpenChange={(open) => handlePinnedPopoverChange("background", "background", open)}
                  onOpenBackgroundTab={() => {
                    setTab("background");
                    setLeftPanelCollapsed(false);
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Canvas wrapper — a single translate+scale transform, computed by
            canvasWrapperOrigin above (same formula applyZoom/the pinch
            handler solve `pan` against, and Rulers uses for its own tick
            marks). No layout-affecting width/height changes with zoom or
            pan at all any more: this box is always the canvas's own fixed,
            unscaled size, purely repositioned/resized on the compositor —
            which is what makes zoom/pan smooth and reliably centered,
            instead of fighting a native scroll range that used to resize
            mid-gesture. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: s.width,
            height: s.height,
            transform: `translate(${canvasWrapperOrigin.x}px, ${canvasWrapperOrigin.y}px) scale(${scale})`,
            transformOrigin: "0 0",
            // Counter-scaled like every other selection indicator in the
            // app (resize handles, layer outlines) — this div sits inside
            // the same transform: scale(${scale}) as the canvas content,
            // so a flat "3px" here would render thinner at low zoom and
            // thicker at high zoom instead of a true, constant 3px.
            outline: isBackgroundSelected ? `${3 / (scale || 1)}px solid #0021ff` : "none",
          }}
          id="quote-canvas-root"
          data-quote-canvas="true"
          className="shadow-[var(--shadow-panel)] ring-1 ring-border"
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
            suppressDragRef={suppressDragRef}
            onSelectBackground={() => {
              setCanvasSelection([]);
              setIsBackgroundSelected(true);
            }}
          />
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

        {/* Desktop only — mobile already has native two-finger pinch/pan for
            scrolling around a zoomed-in canvas, so this drag-thumb overlay is
            just redundant chrome eating into already-tight canvas edge space
            there (and its own pointer handling would compete with edge-swipe
            gestures). Mouse/trackpad users still get it since that's the only
            way to pan without holding spacebar or a two-finger trackpad
            gesture on desktop. */}
        {!isMobile ? (
          <>
            <CanvasScrollbar
              orientation="horizontal"
              stageLength={stageSize.width}
              contentLength={s.width * scale}
              origin={canvasWrapperOrigin.x}
              onPanDelta={(delta) =>
                setPan((p) => clampPan({ ...p, x: p.x + delta }, scale, stageSize.width, stageSize.height))
              }
            />
            <CanvasScrollbar
              orientation="vertical"
              stageLength={stageSize.height}
              contentLength={s.height * scale}
              origin={canvasWrapperOrigin.y}
              onPanDelta={(delta) =>
                setPan((p) => clampPan({ ...p, y: p.y + delta }, scale, stageSize.width, stageSize.height))
              }
            />
          </>
        ) : null}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-screen h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
        <header
          className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 pb-2 sm:gap-4 sm:px-5"
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
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm transition-all active:scale-95 ${saveSuccess
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
                    className={`relative flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 ${dark ? "text-white" : "text-zinc-900"
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
            {/* Floating Undo & Redo pill on top-left (top-16 left-3) — shown only when changes exist */}
            {(canUndo || canRedo) ? (
              <div
                className="pointer-events-none fixed left-4 z-20 flex items-center gap-1 rounded-full border border-border/80 bg-card/90 p-1 shadow-md backdrop-blur-xl"
                style={{ top: "calc(env(safe-area-inset-top) + 4.5rem)" }}
              >
                <AppTooltip content="Undo">
                  <button
                    type="button"
                    onClick={undo}
                    disabled={!canUndo}
                    className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full text-foreground transition-all hover:bg-secondary active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
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
                    disabled={!canRedo}
                    className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full text-foreground transition-all hover:bg-secondary active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                    title="Redo"
                  >
                    <Redo02Icon size={15} />
                  </button>
                </AppTooltip>
              </div>
            ) : null}

            {/* Floating Lock & Delete pill on top-right (top-16 right-3) */}
            {(selectedTextLayer || selectedImageLayer || selectedShapeLayer || isMultiShapeSelection || isMultiImageSelection || isMixedMultiSelection) ? (
              <div
                className="pointer-events-none fixed right-4 z-20 flex items-center gap-1 rounded-full border border-border/80 bg-card/90 p-1 shadow-md backdrop-blur-xl"
                style={{ top: "calc(env(safe-area-inset-top) + 4.5rem)" }}
              >
                {/* Lock Toggle Button */}
                <AppTooltip
                  content={
                    (selectedTextLayer?.locked ||
                      selectedImageLayer?.locked ||
                      selectedShapeLayer?.locked ||
                      (isMultiShapeSelection && multiSelectedShapeLayers.every((l) => l.locked)) ||
                      (isMultiImageSelection && multiSelectedImageLayers.every((l) => l.locked)) ||
                      (isMixedMultiSelection &&
                        canvasSelection.every((sel) => {
                          if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                          if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                          return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                        })))
                      ? "Unlock Layer"
                      : "Lock Layer"
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isMultiShapeSelection) {
                        const allLocked = multiSelectedShapeLayers.every((l) => l.locked);
                        set("shapes", (_, prev) =>
                          withShapesLockSet(
                            prev,
                            multiSelectedShapeLayers.map((l) => l.id),
                            !allLocked,
                          ),
                        );
                      } else if (isMultiImageSelection) {
                        const allLocked = multiSelectedImageLayers.every((l) => l.locked);
                        set("images", (_, prev) =>
                          withImagesLockSet(
                            prev,
                            multiSelectedImageLayers.map((l) => l.id),
                            !allLocked,
                          ),
                        );
                      } else if (isMixedMultiSelection) {
                        const allLocked = canvasSelection.every((sel) => {
                          if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                          if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                          return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                        });
                        const textIds = canvasSelection.filter((l) => l.kind === "text").map((l) => l.id);
                        const imageIds = canvasSelection.filter((l) => l.kind === "image").map((l) => l.id);
                        const shapeIds = canvasSelection.filter((l) => l.kind === "shape").map((l) => l.id);
                        if (textIds.length) set("texts", (_, prev) => withTextsLockSet(prev, textIds, !allLocked));
                        if (imageIds.length) set("images", (_, prev) => withImagesLockSet(prev, imageIds, !allLocked));
                        if (shapeIds.length) set("shapes", (_, prev) => withShapesLockSet(prev, shapeIds, !allLocked));
                      } else if (selectedTextLayer) {
                        set("texts", (_, prev) =>
                          withTextUpdated(prev, selectedTextLayer.id, {
                            locked: !selectedTextLayer.locked,
                          }),
                        );
                      } else if (selectedImageLayer) {
                        set("images", (_, prev) =>
                          withImageUpdated(prev, selectedImageLayer.id, {
                            locked: !selectedImageLayer.locked,
                          }),
                        );
                      } else if (selectedShapeLayer) {
                        set("shapes", (_, prev) =>
                          withShapeUpdated(prev, selectedShapeLayer.id, {
                            locked: !selectedShapeLayer.locked,
                          }),
                        );
                      }
                    }}
                    className={cn(
                      "pointer-events-auto grid h-7 w-7 place-items-center rounded-full transition-all active:scale-95",
                      (selectedTextLayer?.locked ||
                        selectedImageLayer?.locked ||
                        selectedShapeLayer?.locked ||
                        (isMultiShapeSelection && multiSelectedShapeLayers.every((l) => l.locked)) ||
                        (isMultiImageSelection && multiSelectedImageLayers.every((l) => l.locked)) ||
                        (isMixedMultiSelection &&
                          canvasSelection.every((sel) => {
                            if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                            if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                            return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                          })))
                        ? "bg-amber-500/20 text-amber-500"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title={
                      (selectedTextLayer?.locked ||
                        selectedImageLayer?.locked ||
                        selectedShapeLayer?.locked ||
                        (isMultiShapeSelection && multiSelectedShapeLayers.every((l) => l.locked)) ||
                        (isMultiImageSelection && multiSelectedImageLayers.every((l) => l.locked)) ||
                        (isMixedMultiSelection &&
                          canvasSelection.every((sel) => {
                            if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                            if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                            return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                          })))
                        ? "Unlock Layer"
                        : "Lock Layer"
                    }
                  >
                    {(selectedTextLayer?.locked ||
                      selectedImageLayer?.locked ||
                      selectedShapeLayer?.locked ||
                      (isMultiShapeSelection && multiSelectedShapeLayers.every((l) => l.locked)) ||
                      (isMultiImageSelection && multiSelectedImageLayers.every((l) => l.locked)) ||
                      (isMixedMultiSelection &&
                        canvasSelection.every((sel) => {
                          if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                          if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                          return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                        }))) ? (
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
                      if (isMultiShapeSelection || isMultiImageSelection || isMixedMultiSelection) {
                        commit((prev) => {
                          const result = withMultipleLayersRemoved(prev, canvasSelection);
                          return { ...prev, ...result };
                        });
                      } else if (selectedTextLayer) {
                        set("texts", (_, prev) => withTextRemoved(prev, selectedTextLayer.id));
                      } else if (selectedImageLayer) {
                        set("images", (_, prev) => withImageRemoved(prev, selectedImageLayer.id));
                      } else if (selectedShapeLayer) {
                        set("shapes", (_, prev) => withShapeRemoved(prev, selectedShapeLayer.id));
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
              style={{
                // Reserves room at the bottom for whatever's actually
                // covering it — a fixed MOBILE_SHEET_MAX_HEIGHT_FRACTION for
                // an open property popover (never resizes) OR the tool
                // drawer once it's been dragged down near its own peek
                // height (mobileToolDrawerNearPeek — a clean on/off snap,
                // not a continuous drag-follow; see its own comment above
                // for why). REPLACES the bottom-tab-bar reservation in the
                // last branch rather than adding to it — once anything is
                // open it already covers that whole strip itself (higher
                // z-index, same screen-bottom real estate), so stacking both
                // was reserving the same dead space twice, which is exactly
                // what showed up as a gap between the fitted canvas and the
                // sheet's own top edge.
                //
                // This is a real reflow, not a transform: canvasStage below
                // is `flex-1` inside this box, so shrinking the box's own
                // available height shrinks canvasStage's actual measured
                // size, which its existing ResizeObserver (the stageRef
                // effect above) already reacts to by recalculating
                // `scale`/`pan` to re-fit the whole canvas inside whatever
                // room is left — the same path that already keeps it fitted
                // on rotation/window resize. A translateY (tried first)
                // doesn't work for this: it only repositions an already-
                // fixed-size box, which ResizeObserver has no reason to
                // notice, so the canvas itself never actually resizes.
                paddingBottom: mobileDrawerLiftActive
                  ? `${floatingDrawerHeightPx + 8}px`
                  : mobileToolDrawerNearPeek
                    ? `${mobileToolDrawerVisiblePx}px`
                    : "calc(60px + env(safe-area-inset-bottom) + 12px)",
                transition: "padding-bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1)", marginBottom: "20px",
              }}
            >
              {canvasStage}
            </div>

            {typeof document !== "undefined"
              ? createPortal(
                !(
                  selectedTextLayer ||
                  selectedImageLayer ||
                  selectedShapeLayer ||
                  isMultiShapeSelection ||
                  isMultiImageSelection ||
                  isMixedMultiSelection ||
                  isBackgroundSelected
                ) ? (
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
                    className="fixed inset-x-0 bottom-0 z-[100] flex h-[60px] w-full items-center border-t border-border bg-card/95 backdrop-blur-xl pointer-events-auto"
                    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                  >
                    {/* Absolute solid Tick02Icon button on far left */}
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        setCanvasSelection([]);
                        setIsBackgroundSelected(false);
                      }}
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
                          onArrange={(dir) => handleSingleArrange(selectedTextLayer.id, dir)}
                          canArrange={getArrangeEligibility(unifiedLayers, selectedTextLayer.id)}
                          onAnyPopoverOpenChange={(open) =>
                            handlePinnedPopoverChange("text", selectedTextLayer.id, open)
                          }
                          onOpenEffectsTab={() => {
                            setTab("text");
                            setTextSubTab("effects");
                            setMobileToolDrawerOpen(true);
                          }}
                        />
                      ) : selectedImageLayer ? (
                        <ImageSelectionToolbar
                          layer={selectedImageLayer}
                          onArrange={(dir) => handleSingleArrange(selectedImageLayer.id, dir)}
                          canArrange={getArrangeEligibility(unifiedLayers, selectedImageLayer.id)}
                          onAnyPopoverOpenChange={(open) =>
                            handlePinnedPopoverChange("image", selectedImageLayer.id, open)
                          }
                          onUpdate={(patch) =>
                            set("images", (_, prevS) => withImageUpdated(prevS, selectedImageLayer.id, patch))
                          }
                          onOpenCrop={() => setCroppingImageLayer(selectedImageLayer)}
                          onOpenErase={() => setErasingImageLayer(selectedImageLayer)}
                        />
                      ) : selectedShapeLayer ? (
                        <ShapeSelectionToolbar
                          layer={selectedShapeLayer}
                          onArrange={(dir) => handleSingleArrange(selectedShapeLayer.id, dir)}
                          canArrange={getArrangeEligibility(unifiedLayers, selectedShapeLayer.id)}
                          onAnyPopoverOpenChange={(open) =>
                            handlePinnedPopoverChange("shape", selectedShapeLayer.id, open)
                          }
                          onUpdate={(patch) =>
                            set("shapes", (_, prevS) => withShapeUpdated(prevS, selectedShapeLayer.id, patch))
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
                      ) : isMultiShapeSelection ? (
                        <MultiShapeSelectionToolbar
                          layers={multiSelectedShapeLayers}
                          canvasWidth={s.width}
                          canvasHeight={s.height}
                          onAnyPopoverOpenChange={(open) =>
                            handlePinnedPopoverChange("shape", "multi-shape", open)
                          }
                          onArrange={handleShapeArrange}
                          canArrange={getArrangeEligibility(unifiedLayers, multiSelectedShapeLayers.map((l) => l.id))}
                          onAlign={handleShapeAlign}
                          onShiftGroup={handleShapeShiftGroup}
                          onUpdateAll={(patch) =>
                            set("shapes", (_, prev) =>
                              withShapesUpdated(
                                prev,
                                multiSelectedShapeLayers.map((l) => l.id),
                                patch,
                              ),
                            )
                          }
                          onToggleLockAll={() => {
                            const allLocked = multiSelectedShapeLayers.every((l) => l.locked);
                            set("shapes", (_, prev) =>
                              withShapesLockSet(
                                prev,
                                multiSelectedShapeLayers.map((l) => l.id),
                                !allLocked,
                              ),
                            );
                          }}
                          onDeleteAll={() => {
                            commit((prev) => {
                              const result = withMultipleLayersRemoved(prev, canvasSelection);
                              return { ...prev, ...result };
                            });
                            setCanvasSelection([]);
                          }}
                        />
                      ) : isMultiImageSelection ? (
                        <MultiImageSelectionToolbar
                          layers={multiSelectedImageLayers}
                          canvasWidth={s.width}
                          canvasHeight={s.height}
                          onAnyPopoverOpenChange={(open) =>
                            handlePinnedPopoverChange("image", "multi-image", open)
                          }
                          onArrange={handleImageArrange}
                          canArrange={getArrangeEligibility(unifiedLayers, multiSelectedImageLayers.map((l) => l.id))}
                          onAlign={handleImageAlign}
                          onShiftGroup={handleImageShiftGroup}
                          onUpdateAll={(patch) =>
                            set("images", (_, prev) =>
                              withImagesUpdated(
                                prev,
                                multiSelectedImageLayers.map((l) => l.id),
                                patch,
                              ),
                            )
                          }
                          onToggleLockAll={() => {
                            const allLocked = multiSelectedImageLayers.every((l) => l.locked);
                            set("images", (_, prev) =>
                              withImagesLockSet(
                                prev,
                                multiSelectedImageLayers.map((l) => l.id),
                                !allLocked,
                              ),
                            );
                          }}
                          onDeleteAll={() => {
                            commit((prev) => {
                              const result = withMultipleLayersRemoved(prev, canvasSelection);
                              return { ...prev, ...result };
                            });
                            setCanvasSelection([]);
                          }}
                        />
                      ) : isMixedMultiSelection ? (
                        <MultiMixedSelectionToolbar
                          selectedIds={canvasSelection as MixedLayerRef[]}
                          textLayers={mixedSelectedTextLayers}
                          allText={mixedAllText}
                          canvasWidth={s.width}
                          canvasHeight={s.height}
                          onAlign={handleMixedAlign}
                          onArrange={handleMixedArrange}
                          canArrange={getArrangeEligibility(unifiedLayers, canvasSelection.map((l) => l.id))}
                          onUpdateAllTexts={mixedAllText ? handleMixedUpdateAllTexts : undefined}
                          onAnyPopoverOpenChange={(open) =>
                            handlePinnedPopoverChange("text", "multi-mixed", open)
                          }
                          onToggleLockAll={() => {
                            const allLocked = canvasSelection.every((sel) => {
                              if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                              if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                              return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                            });
                            const textIds = canvasSelection.filter((l) => l.kind === "text").map((l) => l.id);
                            const imageIds = canvasSelection.filter((l) => l.kind === "image").map((l) => l.id);
                            const shapeIds = canvasSelection.filter((l) => l.kind === "shape").map((l) => l.id);
                            if (textIds.length) set("texts", (_, prev) => withTextsLockSet(prev, textIds, !allLocked));
                            if (imageIds.length) set("images", (_, prev) => withImagesLockSet(prev, imageIds, !allLocked));
                            if (shapeIds.length) set("shapes", (_, prev) => withShapesLockSet(prev, shapeIds, !allLocked));
                          }}
                          allLocked={canvasSelection.every((sel) => {
                            if (sel.kind === "text") return getTextLayers(s).find((t) => t.id === sel.id)?.locked;
                            if (sel.kind === "image") return getImageLayers(s).find((img) => img.id === sel.id)?.locked;
                            return getShapeLayers(s).find((sh) => sh.id === sel.id)?.locked;
                          })}
                          onDeleteAll={() => {
                            commit((prev) => {
                              const result = withMultipleLayersRemoved(prev, canvasSelection);
                              return { ...prev, ...result };
                            });
                            setCanvasSelection([]);
                          }}
                        />
                      ) : isBackgroundSelected ? (
                        <BackgroundSelectionToolbar
                          s={s}
                          set={set}
                          onAnyPopoverOpenChange={(open) => handlePinnedPopoverChange("background", "background", open)}
                          onOpenBackgroundTab={() => {
                            setTab("background");
                            setMobileToolDrawerOpen(true);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                ),
                document.body,
              )
              : null}

            {/* Tool drawer — hosts the exact same LeftPanel used on desktop,
                just inside a bottom sheet instead of a fixed side aside.
                Canva's own mobile pattern (see MOBILE_TOOL_DRAWER_SNAP_POINTS
                in ui.tsx): opens tall by default — real room to browse/type
                — and dragging it down locks it to a short "peek" height
                instead of closing immediately, where the canvas is fully
                visible again; dragging down again from there is what
                actually closes it. No dark overlay/background scale-down
                (unlike the Export drawer below) at either height, matching
                Canva's own look — nothing dims even while it's tall.
                pointer-events-none on the overlay on top of that (not just
                transparent) so it doesn't swallow touches either — the user
                can still drag/pan whatever sliver of canvas is visible above
                the sheet; tapping it no longer closes the drawer via the
                overlay because of that, only the Done button/swipe-down do
                now. */}
            <Drawer
              open={mobileToolDrawerOpen}
              onOpenChange={(open) => {
                setMobileToolDrawerOpen(open);
                if (open) {
                  setMobileToolDrawerSnap(MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION);
                }
              }}
              shouldScaleBackground={false}
              snapPoints={MOBILE_TOOL_DRAWER_SNAP_POINTS}
              activeSnapPoint={mobileToolDrawerSnap}
              setActiveSnapPoint={setMobileToolDrawerSnap}
              modal={false}
            >
              <DrawerContent
                ref={toolDrawerContentRef}
                data-keep-text-editing=""
                overlayClassName="bg-transparent pointer-events-none"
                // The overlay's own pointer-events-none only stops IT from
                // swallowing taps — it doesn't touch Radix's separate
                // DismissableLayer machinery underneath, which still treats
                // any pointerdown outside this Content's own DOM subtree as
                // a close signal by default (modal mode, the default here,
                // doesn't call preventDefault() on it internally). The
                // bottom nav bar lives in a completely different part of
                // the tree — floating above this drawer via z-index, not
                // rendered inside it — so every tap on it counted as
                // "outside", closing the drawer out from under onTabChange
                // before it ever got to just swap `tab` and leave it open.
                // Same fix as EraseImageDialog's own onOpenChange hardening
                // earlier this session: block Radix's own close path here,
                // and let ONLY the explicit Done button / swipe-down (both
                // handled separately, neither goes through this) close it.
                onPointerDownOutside={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
                // A fixed h-[92vh] (genuinely near-full-screen — see
                // MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION's own comment for
                // why 92 and not a literal 100), not max-h — vaul's snap
                // points only ever TRANSLATE this box between heights, they
                // never resize it, so with a content-driven max-height a tab
                // with modest content (Text/Uploads/Layers, next to
                // something like a full template gallery) would just render
                // shorter outright and never actually look "tall" no matter
                // which snap point is nominally active. Forcing a genuine
                // fixed height fixes that — and doesn't break the short
                // "peek" position either: since the box stays anchored to
                // the screen's bottom edge, translating a 92vh-tall box down
                // until only 45vh of it remains on screen looks IDENTICAL
                // to a box that was only ever 45vh tall to begin with.
                className="mt-0 flex h-[92vh] flex-col rounded-t-2xl"
              >
                {/* Constrains header+content to however much of the (fixed
                    h-[92vh]) box above is ACTUALLY visible on screen right
                    now — mobileToolDrawerVisiblePx, measured live off the
                    DOM (see its own comment above). Without this, the
                    content below always measures its available height
                    against the full 92vh box regardless of how much of it
                    is on screen, so content shorter than 92vh but taller
                    than the visible 45vh would render (and fit) entirely,
                    with zero scroll distance left to bring the rest into
                    view — the flex-1 + min-h-0 below still does the actual
                    "subtract the header's real height" arithmetic, this
                    inner wrapper just caps the total either has to work
                    with to match reality. */}
                <div
                  className="flex min-h-0 flex-col"
                  style={{
                    // Falls back to the tall default for the one frame
                    // before the measurement effect's first rAF callback
                    // lands (mobileToolDrawerVisiblePx starts at 0) —
                    // matches what vaul itself opens the sheet at anyway.
                    height:
                      mobileToolDrawerVisiblePx > 0
                        ? `${mobileToolDrawerVisiblePx}px`
                        : `${MOBILE_TOOL_DRAWER_OPEN_HEIGHT_FRACTION * 100}vh`,
                  }}
                >
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
                    // +60px on top of what was already here — the bottom
                    // nav now floats ABOVE this drawer (z-50 vs. its own
                    // z-30, see MobileBottomTabBar's own comment) so it can
                    // stay tappable while the drawer's open, which also
                    // means it now visually sits on top of whatever this
                    // content renders in that same strip; without this the
                    // last ~60px of scrolled content would end up hidden
                    // behind it instead of just scrolling clear underneath.
                    style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom) + 40px)" }}
                  >
                    <LeftPanel
                      s={s}
                      set={set}
                      applyTemplate={(t) => {
                        applyTemplate(t);
                        setMobileToolDrawerOpen(false);
                      }}
                      tab={tab}
                      selection={canvasSelection}
                      onSelectLayer={(layer, opts) => {
                        handleSelectLayer(layer, opts);
                      }}
                      onItemSelect={() => {
                        setMobileToolDrawerOpen(false);
                      }}
                      textSubTab={textSubTab}
                      onTextSubTabChange={setTextSubTab}
                      templateCategory={templateCategory}
                      onTemplateCategoryChange={setTemplateCategory}
                      onSelectSavedQuote={(quote) => {
                        setEditingSavedQuoteTarget({ id: quote.id, title: quote.title });
                      }}
                      activeSavedQuote={editingSavedQuoteTarget}
                      onCloseSavedQuoteEdit={() => setEditingSavedQuoteTarget(null)}
                      canvasRef={canvasRef}
                    />
                  </div>
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
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 40px)" }}
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
                canvasRef={canvasRef}
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
                    <Chip
                      onClick={undo}
                      disabled={!canUndo}
                      className="flex h-7 w-7 items-center justify-center p-0 disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <Undo02Icon size={13} />
                    </Chip>
                  </AppTooltip>
                  <AppTooltip content="Redo change" shortcut="Ctrl+Y">
                    <Chip
                      onClick={redo}
                      disabled={!canRedo}
                      className="flex h-7 w-7 items-center justify-center p-0 disabled:opacity-30 disabled:pointer-events-none"
                    >
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
                  <AppTooltip content="Zoom out 10%" shortcut="-">
                    <Chip onClick={() => zoomBy(-10)} className="flex h-7 w-7 items-center justify-center p-0">
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
                  <AppTooltip content="Zoom in 10%" shortcut="+">
                    <Chip onClick={() => zoomBy(10)} className="flex h-7 w-7 items-center justify-center p-0">
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

        {erasingImageLayer ? (
          <EraseImageDialog
            open={Boolean(erasingImageLayer)}
            onClose={() => setErasingImageLayer(null)}
            imageSrc={erasingImageLayer.src}
            onErased={(erasedDataUrl) => {
              set("images", withImageUpdated(s, erasingImageLayer.id, { src: erasedDataUrl }));
              setErasingImageLayer(null);
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
