import { useEffect, useMemo, useRef, useState } from "react";
import { TemplatePreview } from "./TemplatePreview";
import {
  Add01Icon,
  MinusSignIcon,
  Copy01Icon,
  CropIcon,
  StarCircleIcon,
  Folder01Icon,
  Delete02Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  Image01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  ViewIcon,
  ViewOffIcon,
  Bookmark01Icon,
  DragDropVerticalIcon,
} from "hugeicons-react";
import { useAuth } from "@/lib/auth";
import { loadGoogleFont } from "@/lib/fontLoader";
import { fetchSavedQuotes, deleteSavedQuote, updateSavedQuoteDesign, fetchAllTemplates, type DbSavedQuote } from "@/lib/supabase";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { ImageCropDialog } from "./ImageCropDialog";
import { TextEffectsPanel } from "./TextEffectsPanel";
import { VERIFIED_PICKER_ICONS } from "./VerifiedBadges";
import {
  FONTS,
  GRADIENTS,
  PREMIUM_TEMPLATES,
  SHADOW_OVERLAY_PRESETS,
  SHAPE_PRESETS,
  STARTER_TEMPLATES,
  TEMPLATES,
  getImageLayers,
  getMatchingShapePresetId,
  getShapeLabel,
  getShapeLayers,
  getTextLayers,
  getUnifiedLayers,
  withMultipleLayersRemoved,
  withUnifiedLayerReordered,
  sanitizeTextHtml,
  shapeCss,
  shapeFillStyle,
  shapeSupportsRadius,
  withImageRemoved,
  withImageReordered,
  withImageUpdated,
  withImagesAdded,
  withShadowAdded,
  withShapeAdded,
  withShapeDuplicated,
  withShapeRemoved,
  withShapeReordered,
  withShapeUpdated,
  withTextAdded,
  withTextDuplicated,
  withTextRemoved,
  withTextReordered,
  withTextUpdated,
  type BoxStyle,
  type EditorState,
  type ImageLayer,
  type ImageShape,
  type ShadowPreset,
  type TextLayer,
  type Template,
} from "./types";
import {
  AreaInput,
  Chip,
  ColorInput,
  Field,
  Panel,
  Range,
  Select,
  TextInput,
  Toggle,
  UploadButton,
  useHoldRepeat,
} from "./ui";
import { cn } from "@/lib/utils";

type Props = {
  s: EditorState;
  set: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
  applyTemplate: (t: Partial<EditorState>) => void;
  tab: "templates" | "text" | "uploads" | "elements" | "layers" | "style" | "background";
  selection?: { kind: "image" | "text" | "shape"; id: string }[];
  onSelectLayer?: (
    layer: { kind: "image" | "text" | "shape"; id: string },
    opts?: { toggle?: boolean; selectAll?: boolean },
  ) => void;
  onItemSelect?: () => void;
  textSubTab?: "add" | "effects";
  onTextSubTabChange?: (sub: "add" | "effects") => void;
  templateCategory?: "starter" | "premium" | "saved";
  onTemplateCategoryChange?: (cat: "starter" | "premium" | "saved") => void;
  onSelectSavedQuote?: (quote: DbSavedQuote) => void;
  activeSavedQuote?: { id: string; title: string } | null;
  onCloseSavedQuoteEdit?: () => void;
  // The canvas's own export DOM node (same ref index.tsx hands to
  // html-to-image for downloads) — optional purely so this component still
  // works if a caller doesn't have one handy; without it, newly added text
  // just keeps withTextAdded's flat-background-only color guess instead of
  // getting refined against the real rendered pixels. See
  // refineTextColorFromCanvas below.
  canvasRef?: React.RefObject<HTMLDivElement | null>;
};

const VERIFIED_ICONS = VERIFIED_PICKER_ICONS;
const SHAPES: ImageShape[] = ["circle", "rounded", "square"];
const SHAPE_STYLES: BoxStyle[] = ["solid", "gradient", "glass", "outline"];

function parseGradient(gradient?: string): {
  type: "linear" | "radial";
  angle: number;
  start: string;
  mid: string;
  end: string;
  hasMid: boolean;
} {
  const def = {
    type: "linear" as const,
    angle: 135,
    start: "#6366f1",
    mid: "#8b5cf6",
    end: "#ec4899",
    hasMid: false,
  };
  if (!gradient) return def;
  const isRadial = gradient.includes("radial-gradient");
  const isLinear = gradient.includes("linear-gradient");
  if (!isRadial && !isLinear) return def;

  const angleMatch = gradient.match(/(\d+)deg/);
  const angle = angleMatch && angleMatch[1] ? parseInt(angleMatch[1], 10) : 135;

  const colors = gradient.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/g) || [];
  if (colors.length >= 3 && colors[0] && colors[1] && colors[2]) {
    return {
      type: isRadial ? "radial" : "linear",
      angle,
      start: colors[0],
      mid: colors[1],
      end: colors[2],
      hasMid: true,
    };
  } else if (colors.length >= 2 && colors[0] && colors[1]) {
    return {
      type: isRadial ? "radial" : "linear",
      angle,
      start: colors[0],
      mid: "#8b5cf6",
      end: colors[1],
      hasMid: false,
    };
  }
  return { ...def, type: isRadial ? "radial" : "linear", angle };
}

function ShapeGradientControl({
  gradient,
  onChange,
}: {
  gradient?: string | undefined;
  onChange: (grad: string) => void;
}) {
  const [tab, setTab] = useState<"presets" | "custom">("presets");
  const parsed = useMemo(() => parseGradient(gradient), [gradient]);

  const [start, setStart] = useState<string>(parsed.start);
  const [end, setEnd] = useState<string>(parsed.end);
  const [mid, setMid] = useState<string>(parsed.mid);
  const [useMid, setUseMid] = useState<boolean>(parsed.hasMid);
  const [type, setType] = useState<"linear" | "radial">(parsed.type);
  const [angle, setAngle] = useState<number>(parsed.angle);

  useEffect(() => {
    const p = parseGradient(gradient);
    setStart(p.start);
    setEnd(p.end);
    setMid(p.mid);
    setUseMid(p.hasMid);
    setType(p.type);
    setAngle(p.angle);
  }, [gradient]);

  const emitCustom = (
    s: string,
    e: string,
    m: string,
    uMid: boolean,
    t: "linear" | "radial",
    a: number,
  ) => {
    let result = "";
    if (t === "linear") {
      result = uMid
        ? `linear-gradient(${a}deg, ${s} 0%, ${m} 50%, ${e} 100%)`
        : `linear-gradient(${a}deg, ${s} 0%, ${e} 100%)`;
    } else {
      result = uMid
        ? `radial-gradient(circle, ${s} 0%, ${m} 50%, ${e} 100%)`
        : `radial-gradient(circle, ${s} 0%, ${e} 100%)`;
    }
    onChange(result);
  };

  const previewGrad = useMemo(() => {
    if (type === "linear") {
      return useMid
        ? `linear-gradient(${angle}deg, ${start} 0%, ${mid} 50%, ${end} 100%)`
        : `linear-gradient(${angle}deg, ${start} 0%, ${end} 100%)`;
    }
    return useMid
      ? `radial-gradient(circle, ${start} 0%, ${mid} 50%, ${end} 100%)`
      : `radial-gradient(circle, ${start} 0%, ${end} 100%)`;
  }, [type, angle, start, end, mid, useMid]);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-secondary/30 p-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-0.5">
        <button
          type="button"
          onClick={() => setTab("presets")}
          className={cn(
            "rounded-md py-1 text-xs font-semibold transition-colors",
            tab === "presets"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Presets
        </button>
        <button
          type="button"
          onClick={() => setTab("custom")}
          className={cn(
            "rounded-md py-1 text-xs font-semibold transition-colors",
            tab === "custom"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Custom Gradient
        </button>
      </div>

      {tab === "presets" ? (
        <div className="grid grid-cols-4 gap-2">
          {GRADIENTS.map((g) => (
            <button
              key={g.label}
              type="button"
              title={g.label}
              onClick={() => onChange(g.value)}
              style={{ background: g.value }}
              className={cn(
                "h-8 w-full rounded-lg border transition-transform hover:scale-105",
                gradient === g.value
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-border",
              )}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div
            className="h-8 w-full rounded-lg border border-border/80 shadow-inner"
            style={{ background: previewGrad }}
          />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Start color">
              <ColorInput
                value={start}
                onChange={(v) => {
                  setStart(v);
                  emitCustom(v, end, mid, useMid, type, angle);
                }}
              />
            </Field>
            <Field label="End color">
              <ColorInput
                value={end}
                onChange={(v) => {
                  setEnd(v);
                  emitCustom(start, v, mid, useMid, type, angle);
                }}
              />
            </Field>
          </div>

          <Toggle
            checked={useMid}
            onChange={(checked) => {
              setUseMid(checked);
              emitCustom(start, end, mid, checked, type, angle);
            }}
            label="Add 3rd accent color"
          />

          {useMid ? (
            <Field label="Middle color stop">
              <ColorInput
                value={mid}
                onChange={(v) => {
                  setMid(v);
                  emitCustom(start, end, v, true, type, angle);
                }}
              />
            </Field>
          ) : null}

          <Field label="Gradient type">
            <div className="grid grid-cols-2 gap-2">
              <Chip
                active={type === "linear"}
                onClick={() => {
                  setType("linear");
                  emitCustom(start, end, mid, useMid, "linear", angle);
                }}
              >
                Linear
              </Chip>
              <Chip
                active={type === "radial"}
                onClick={() => {
                  setType("radial");
                  emitCustom(start, end, mid, useMid, "radial", angle);
                }}
              >
                Radial
              </Chip>
            </div>
          </Field>

          {type === "linear" ? (
            <Field label={`Angle — ${angle}°`}>
              <Range
                value={angle}
                min={0}
                max={360}
                onChange={(a) => {
                  setAngle(a);
                  emitCustom(start, end, mid, useMid, type, a);
                }}
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => {
                      setAngle(deg);
                      emitCustom(start, end, mid, useMid, type, deg);
                    }}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                      angle === deg
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
  );
}

// Placeholder for one TemplatePreview card (162px wide, matching its own
// default aspect-ratio math for a 1200x1500 design: 162 * 1500/1200 ≈ 203)
// — shown in the Free Templates grid while the real list is still loading,
// instead of the bundled local TEMPLATES fallback flashing on screen and
// then getting silently swapped for whatever's actually published.
function TemplateCardSkeleton() {
  return (
    <div className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card" style={{ width: 162 }}>
      <div className="animate-pulse bg-secondary/70" style={{ width: 162, height: 203 }} />
      <div className="space-y-1.5 px-2.5 py-2">
        <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-secondary/70" />
        <div className="h-2 w-1/2 animate-pulse rounded-full bg-secondary/50" />
      </div>
    </div>
  );
}

export function LeftPanel({
  s,
  set,
  applyTemplate,
  tab,
  selection,
  onSelectLayer,
  onItemSelect,
  textSubTab = "add",
  onTextSubTabChange,
  templateCategory,
  onTemplateCategoryChange,
  onSelectSavedQuote,
  activeSavedQuote,
  onCloseSavedQuoteEdit,
  canvasRef,
}: Props) {
  const { user, isAdmin } = useAuth();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  // Always-current mirror of the `s` prop, for the async color-refine below
  // — that runs after an `await`, by which point the `s` this render closed
  // over is stale (new layers/edits may have landed since), so it needs a
  // way to read the latest state instead of the snapshot it started with.
  const sRef = useRef(s);
  useEffect(() => {
    sRef.current = s;
  }, [s]);
  const [croppingImage, setCroppingImage] = useState<ImageLayer | null>(null);
  const [userSavedQuotes, setUserSavedQuotes] = useState<DbSavedQuote[]>([]);
  const [platformTemplates, setPlatformTemplates] = useState<Template[]>(TEMPLATES);
  // Starts true (not false) — platformTemplates itself starts pre-filled
  // with the local TEMPLATES fallback so there's SOMETHING to compute
  // starterTemplates/premiumTemplates from before the real fetch lands,
  // but that fallback is a static bundled snapshot, not what's actually
  // published right now — showing it as if it were live content, then
  // silently swapping it out once fetchAllTemplates resolves, reads as a
  // flash of wrong/stale templates. The Free Templates grid renders a
  // skeleton instead of that fallback for as long as this is true.
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatedId, setUpdatedId] = useState<string | null>(null);

  const loadSavedQuotes = async () => {
    const [quotes, allTemplates] = await Promise.all([
      fetchSavedQuotes(user?.id),
      fetchAllTemplates(),
    ]);
    setUserSavedQuotes(quotes);
    if (allTemplates && allTemplates.length > 0) {
      setPlatformTemplates(allTemplates);
    }
    setTemplatesLoading(false);
  };

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

  useEffect(() => {
    if (tab === "templates") {
      loadSavedQuotes();
    }
  }, [tab, user]);

  useEffect(() => {
    const handleTemplateSaved = (e: any) => {
      loadSavedQuotes();
      const cat = e?.detail?.category;
      if (cat === "my_saved" || !cat) {
        setActiveCategory("saved");
      } else if (cat === "premium") {
        setActiveCategory("premium");
      } else if (cat === "starter") {
        setActiveCategory("starter");
      }
    };
    window.addEventListener("postinseconds:template-saved", handleTemplateSaved);
    return () => window.removeEventListener("postinseconds:template-saved", handleTemplateSaved);
  }, []);

  const handleDeleteSaved = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this saved template?")) {
      await deleteSavedQuote(id);
      await loadSavedQuotes();
    }
  };

  const [gradStart, setGradStart] = useState("#6366f1");
  const [gradEnd, setGradEnd] = useState("#ec4899");
  const [gradMid, setGradMid] = useState("#a855f7");
  const [useMid, setUseMid] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shadowThemeFilter, setShadowThemeFilter] = useState<"all" | "black" | "white">("all");
  const [activeCategory, setActiveCategory] = useState<"starter" | "premium" | "saved">(
    templateCategory ?? "starter",
  );

  const handleCategoryChange = (cat: "starter" | "premium" | "saved") => {
    setActiveCategory(cat);
    onTemplateCategoryChange?.(cat);
  };

  useEffect(() => {
    if (templateCategory) {
      setActiveCategory(templateCategory);
    }
  }, [templateCategory]);

  useEffect(() => {
    const handleOpenPremium = () => {
      handleCategoryChange("premium");
    };
    window.addEventListener("postinseconds:open-premium", handleOpenPremium);
    return () => window.removeEventListener("postinseconds:open-premium", handleOpenPremium);
  }, []);
  const [gradAngle, setGradAngle] = useState(135);
  const [gradType, setGradType] = useState<"linear" | "radial">("linear");
  const [savedGradients, setSavedGradients] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("postinseconds_saved_gradients");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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

  // Curated presets (see GRADIENTS in types.ts) are all a consistent
  // 3-stop `linear-gradient(ANGLEdeg, C1 0%, C2 X%, C3 100%)` shape, so
  // picking one can also populate the Custom Gradient studio's own fields —
  // letting the user fine-tune a curated preset with the same controls,
  // instead of the studio staying stuck on whatever it last showed.
  const applyCuratedGradientToStudio = (value: string) => {
    const match = value.match(
      /^linear-gradient\((\d+)deg,\s*(#[0-9a-fA-F]{3,8})\s+0%,\s*(#[0-9a-fA-F]{3,8})\s+\d+%,\s*(#[0-9a-fA-F]{3,8})\s+100%\)$/,
    );
    if (!match) return;
    const [, angle, start, mid, end] = match;
    setGradType("linear");
    setGradAngle(Number(angle));
    setGradStart(start!);
    setGradMid(mid!);
    setGradEnd(end!);
    setUseMid(true);
  };

  const saveCustomGradient = () => {
    if (savedGradients.includes(customGradValue)) return;
    const next = [customGradValue, ...savedGradients];
    setSavedGradients(next);
    try {
      localStorage.setItem("postinseconds_saved_gradients", JSON.stringify(next));
    } catch { }
  };

  const removeSavedGradient = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = savedGradients.filter((g) => g !== val);
    setSavedGradients(next);
    try {
      localStorage.setItem("postinseconds_saved_gradients", JSON.stringify(next));
    } catch { }
  };

  // Hoisted out of the `tab === "text"` branch below (it's recomputed
  // there too, from the same props) purely so the two hold-repeat hooks
  // right after it can see it — every hook in this component has to be
  // called unconditionally, on every render, regardless of which `tab` is
  // active, or React throws once the user switches tabs and the hook count
  // between renders no longer matches.
  const activeTextLayerForSizeStepper = (() => {
    const textLayersList = getTextLayers(s);
    const selectedTextSel = selection?.find((sel) => sel.kind === "text");
    return selectedTextSel
      ? textLayersList.find((t) => t.id === selectedTextSel.id) ?? null
      : textLayersList.length > 0
        ? textLayersList[0]
        : null;
  })();
  // Press-and-hold repeat for the Font Size -/+ buttons in the Text tab —
  // see useHoldRepeat's own comment in ui.tsx.
  const fontSizeDecHold = useHoldRepeat(() => {
    const layer = activeTextLayerForSizeStepper;
    if (!layer) return;
    const newSize = Math.max(10, (layer.size || 32) - 2);
    const ratio = newSize / (layer.size || 32);
    const nextWidth = layer.width ? Math.round(Math.max(40, layer.width * ratio)) : undefined;
    const nextMinHeight = layer.minHeight ? Math.round(layer.minHeight * ratio) : undefined;
    set("texts", withTextUpdated(s, layer.id, {
      size: newSize,
      ...(nextWidth !== undefined ? { width: nextWidth } : {}),
      ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
    }));
  });
  const fontSizeIncHold = useHoldRepeat(() => {
    const layer = activeTextLayerForSizeStepper;
    if (!layer) return;
    const newSize = Math.min(300, (layer.size || 32) + 2);
    const ratio = newSize / (layer.size || 32);
    const nextWidth = layer.width ? Math.round(Math.max(40, layer.width * ratio)) : undefined;
    const nextMinHeight = layer.minHeight ? Math.round(layer.minHeight * ratio) : undefined;
    set("texts", withTextUpdated(s, layer.id, {
      size: newSize,
      ...(nextWidth !== undefined ? { width: nextWidth } : {}),
      ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
    }));
  });

  // Drag-to-reorder state for the Layers tab's list (see its own grip
  // handle/pointer handlers below) — declared up here with every other
  // hook in this component, not inside the `tab === "layers"` branch that
  // actually uses it, for the same Rules-of-Hooks reason fontSizeDecHold/
  // fontSizeIncHold above are: every hook has to run on every render
  // regardless of which `tab` is active, or React throws once the user
  // switches tabs and the hook count between renders no longer matches.
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  // Index (within the Layers tab's top-to-bottom display order — see
  // displayLayers below) the dragged row is currently hovering over; null
  // while nothing is being dragged.
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // How far the dragged row itself has moved from its start position —
  // applied as a translateY so it visibly follows the pointer/finger for
  // the whole gesture, independent of dragOverIndex (which jumps in whole-
  // row increments; this is continuous).
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const dragStateRef = useRef<{ startIndex: number; startY: number; rowPitch: number } | null>(null);

  if (tab === "templates") {
    return (
      <>
        {/* 3 Main Template Tabs: Free, Premium, Saved */}
        <div className="mb-3.5 grid grid-cols-3 gap-1 rounded-2xl border border-border/80 bg-secondary/40 p-1">
          <button
            type="button"
            onClick={() => handleCategoryChange("starter")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all",
              activeCategory === "starter"
                ? "bg-background text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Free</span>
            <span className="rounded-full bg-secondary px-1.5 py-0.2 text-[9px] text-muted-foreground">
              {starterTemplates.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleCategoryChange("premium")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all",
              activeCategory === "premium"
                ? "bg-background text-foreground shadow-sm font-bold text-amber-500 dark:text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <StarCircleIcon size={13} className="text-amber-500" />
            <span>Premium</span>
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400">
              {premiumTemplates.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleCategoryChange("saved")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all",
              activeCategory === ("saved" as any)
                ? "bg-background text-foreground shadow-sm font-bold text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Folder01Icon size={13} />
            <span>Saved</span>
            <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[9px] font-bold text-primary">
              {userSavedQuotes.length}
            </span>
          </button>
        </div>

        {/* TAB 1: FREE / STARTER TEMPLATES */}
        {activeCategory === "starter" ? (
          <Panel title="Free Templates">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Select any starter template to edit</span>
              {templatesLoading ? (
                <span className="h-4 w-16 animate-pulse rounded-full bg-secondary" />
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  {starterTemplates.length} templates
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {templatesLoading
                ? Array.from({ length: 6 }, (_, i) => <TemplateCardSkeleton key={i} />)
                : starterTemplates.map((t) => (
                  <TemplatePreview
                    key={t.id}
                    template={t}
                    width={162}
                    onClick={() => {
                      applyTemplate(t.state);
                      onItemSelect?.();
                    }}
                  />
                ))}
            </div>
          </Panel>
        ) : null}

        {/* TAB 2: PREMIUM PRO TEMPLATES */}
        {activeCategory === "premium" ? (
          <Panel title="Premium Templates">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Curated high-converting viral layouts</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                {premiumTemplates.length} templates
              </span>
            </div>

            {premiumTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                <StarCircleIcon size={28} className="text-muted-foreground/40" />
                <p className="mt-2 text-xs font-semibold text-foreground">No premium templates yet</p>
                <p className="mt-1 px-4 text-[11px] text-muted-foreground">
                  Publish one from the Admin dashboard to see it here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {premiumTemplates.map((t) => (
                  <TemplatePreview
                    key={t.id}
                    template={t}
                    width={162}
                    onClick={() => {
                      applyTemplate(t.state);
                      onItemSelect?.();
                    }}
                  />
                ))}
              </div>
            )}
          </Panel>
        ) : null}

        {/* TAB 3: MY SAVED TEMPLATES */}
        {activeCategory === ("saved" as any) ? (
          <Panel title="My Saved Templates">
            <div className="mb-3 space-y-2 border-b border-border/60 pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Your personal saved designs</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {userSavedQuotes.length} saved
                </span>
              </div>

              {activeSavedQuote ? (
                <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 shadow-sm">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                      <span className="font-bold text-amber-500">Editing Saved Post</span>
                    </div>
                    {onCloseSavedQuoteEdit ? (
                      <button
                        type="button"
                        onClick={onCloseSavedQuoteEdit}
                        className="rounded-md px-1 py-0.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        title="Exit editing mode"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setUpdatingId(activeSavedQuote.id);
                      await updateSavedQuoteDesign(activeSavedQuote.id, activeSavedQuote.title, s, user?.id);
                      await loadSavedQuotes();
                      setUpdatingId(null);
                      setUpdatedId(activeSavedQuote.id);
                      setTimeout(() => setUpdatedId(null), 2200);
                    }}
                    disabled={updatingId === activeSavedQuote.id}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-amber-950 shadow-md transition-all hover:bg-amber-400 active:scale-95 disabled:opacity-50"
                  >
                    <Bookmark01Icon size={14} />
                    <span>{updatedId === activeSavedQuote.id ? "✓ Saved!" : updatingId === activeSavedQuote.id ? "Saving..." : "Save Update"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaveTemplateOpen(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-95"
                  >
                    <span>+ Save as New Template</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSaveTemplateOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-95"
                >
                  <Bookmark01Icon size={14} />
                  <span>+ Save Canvas as New Template</span>
                </button>
              )}
            </div>

            {userSavedQuotes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-8 text-center">
                <Folder01Icon size={28} className="mx-auto text-muted-foreground/40" />
                <p className="mt-2 text-xs font-semibold text-foreground">No saved designs yet</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Design your quote and click "+ Save Canvas as New Template" above to reuse it anytime!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {userSavedQuotes.map((q) => (
                  <div key={q.id} className="group relative">
                    <TemplatePreview
                      template={{
                        id: q.id,
                        label: q.title,
                        description: `Saved ${new Date(q.created_at).toLocaleDateString()}`,
                        state: q.state,
                      }}
                      width={162}
                      onClick={() => {
                        applyTemplate(q.state);
                        onSelectSavedQuote?.(q);
                        onItemSelect?.();
                      }}
                    />
                    <button
                      type="button"
                      title="Delete saved template"
                      onClick={(e) => handleDeleteSaved(q.id, e)}
                      className="absolute -top-1.5 -right-1.5 z-10 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:scale-110"
                    >
                      <Delete02Icon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        ) : null}

        <SaveTemplateDialog
          open={saveTemplateOpen}
          onClose={() => {
            setSaveTemplateOpen(false);
            loadSavedQuotes();
          }}
          s={s}
          onSaved={() => loadSavedQuotes()}
        />
      </>
    );
  }

  if (tab === "text") {
    const textLayersList = getTextLayers(s);
    const selectedTextSel = selection?.find((sel) => sel.kind === "text");
    const activeTextLayer = selectedTextSel
      ? textLayersList.find((t) => t.id === selectedTextSel.id) ?? null
      : textLayersList.length > 0
        ? textLayersList[0]
        : null;

    // withTextAdded's own color pick (see isDarkBg in types.ts) is a fast,
    // instant guess against the canvas's flat `background` setting alone —
    // it has no idea a background IMAGE, gradient, or another layer might
    // actually sit under this text's specific (x, y) drop point. This
    // renders the real canvas to a small offscreen bitmap right after
    // (reusing the same html-to-image snapshot export already uses) and
    // samples the actual pixels there, flipping the color if the fast
    // guess turns out to have been wrong. New text still appears instantly
    // either way — this only ever corrects it a moment later, and never
    // touches a color the user has since picked by hand.
    const DEFAULT_TEXT_COLORS = ["#ffffff", "#0d0d12"];
    const refineTextColorFromCanvas = async (textId: string, x: number, y: number, guessedColor: string) => {
      const node = canvasRef?.current;
      if (!node) return;
      try {
        const mod = await import("html-to-image");
        const canvas = await mod.toCanvas(node, {
          pixelRatio: 0.25,
          width: s.width,
          height: s.height,
          cacheBust: false,
          skipFonts: true,
          fontEmbedCSS: "",
        });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const px = Math.round((x / 100) * canvas.width);
        const py = Math.round((y / 100) * canvas.height);
        const boxRadius = Math.max(4, Math.round(canvas.width * 0.04));
        const sx = Math.max(0, Math.min(canvas.width - 1, px - boxRadius));
        const sy = Math.max(0, Math.min(canvas.height - 1, py - boxRadius));
        const sw = Math.min(canvas.width - sx, boxRadius * 2);
        const sh = Math.min(canvas.height - sy, boxRadius * 2);
        if (sw <= 0 || sh <= 0) return;
        const { data } = ctx.getImageData(sx, sy, sw, sh);
        let total = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue; // fully transparent — nothing visually there, ignore
          total += ((data[i] ?? 0) * 299 + (data[i + 1] ?? 0) * 587 + (data[i + 2] ?? 0) * 114) / 1000;
          count++;
        }
        if (count === 0) return;
        const nextColor = total / count < 140 ? "#ffffff" : "#0d0d12";
        if (nextColor === guessedColor) return;
        const latest = sRef.current;
        const stillDefault = getTextLayers(latest).some(
          (t) => t.id === textId && DEFAULT_TEXT_COLORS.includes(t.color),
        );
        if (stillDefault) {
          set("texts", withTextUpdated(latest, textId, { color: nextColor }));
        }
      } catch {
        // Best-effort refinement only — keep the fast heuristic's guess on failure.
      }
    };

    // Waits for the exact font/weight/size a new preset text is about to
    // render with to actually be ready before the layer is ever added —
    // without this, the layer would render for one frame in whatever
    // fallback font the browser has on hand (its default sans-serif is
    // usually wider than Outfit), then visibly reflow/un-wrap once the
    // real webfont's stylesheet+file finish loading and the browser swaps
    // it in. loadGoogleFont's own <link> injection dedupes per family, but
    // that alone doesn't wait for the fetch — document.fonts.load is what
    // actually blocks until this specific weight is usable, matching the
    // CSS font shorthand text itself renders with (family alone isn't
    // enough: a bold heading can still trigger its own separate fetch/swap
    // even after a lighter weight of the same family already loaded).
    // Resolves near-instantly once a font's been loaded once this session
    // (browser cache), so this only adds a perceptible pause the very
    // first time a given family/weight combo is used.
    const ensureFontReady = async (fontFamily: string, weight: number, size: number) => {
      loadGoogleFont(fontFamily);
      if (typeof document === "undefined" || !("fonts" in document)) return;
      try {
        await Promise.race([
          document.fonts.load(`${weight} ${size}px ${fontFamily}`),
          new Promise((resolve) => setTimeout(resolve, 800)), // never block on a slow/offline connection
        ]);
      } catch {
        // Best-effort only — worst case, today's occasional flash/reflow.
      }
    };

    // Measures the preset's real one-line rendered width (now that
    // ensureFontReady has guaranteed the actual webfont, not a fallback,
    // is what gets measured) so the new layer can be given that as an
    // explicit width — skipping QuoteCanvas's fit-content-up-to-a-canvas-
    // relative-maxWidth sizing, which is only ever an estimate and was
    // wrapping short presets like "Add a heading" onto two lines even
    // though they'd comfortably fit on one under their real metrics. Falls
    // back to `undefined` (today's estimate-based sizing) if canvas
    // measurement isn't available for any reason.
    const measureSingleLineWidth = (text: string, weight: number, size: number): number | undefined => {
      if (typeof document === "undefined") return undefined;
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        ctx.font = `${weight} ${size}px "Outfit", sans-serif`;
        const measured = ctx.measureText(text).width;
        if (!Number.isFinite(measured) || measured <= 0) return undefined;
        // A little breathing room — canvas measureText and the actual
        // contentEditable's own text layout engine don't round/kern
        // identically down to the pixel, so a bare-minimum width can still
        // wrap by a hair in the real DOM.
        const withMargin = Math.ceil(measured) + 16;
        // Still bounded by the canvas itself, same margin QuoteCanvas's own
        // estimate used — a genuinely too-long preset should wrap rather
        // than spill off the canvas, this only replaces the estimate with
        // a real measurement for the common case where it comfortably fits.
        return Math.min(withMargin, Math.round(s.width * 0.92));
      } catch {
        return undefined;
      }
    };

    const addPresetText = async (preset: { text: string; size: number; weight: number }) => {
      await ensureFontReady('"Outfit", sans-serif', preset.weight, preset.size);
      const width = measureSingleLineWidth(preset.text, preset.weight, preset.size);
      const res = withTextAdded(s, { ...preset, ...(width !== undefined ? { width } : {}) });
      set("texts", res.list);
      set("layerOrder", res.layerOrder);
      if (res.newId) {
        onSelectLayer?.({ kind: "text", id: res.newId });
        const added = res.list.find((t) => t.id === res.newId);
        if (added) void refineTextColorFromCanvas(added.id, added.x, added.y, added.color);
      }
      onItemSelect?.();
    };

    const updateActiveLayer = (patch: Partial<Omit<TextLayer, "id">>) => {
      if (!activeTextLayer) return;
      set("texts", withTextUpdated(s, activeTextLayer.id, patch));
    };

    const FONT_WEIGHTS = [
      { label: "Regular", value: 400 },
      { label: "Semibold", value: 600 },
      { label: "Bold", value: 700 },
      { label: "Black", value: 900 },
    ];

    const QUICK_COLORS = [
      "#ffffff",
      "#0f172a",
      "#f8fafc",
      "#38bdf8",
      "#818cf8",
      "#c084fc",
      "#f43f5e",
      "#fbbf24",
      "#34d399",
      "#94a3b8",
    ];

    return (
      <>
        {/* Sub-tab Navigation: Text Studio vs Effects */}
        <div className="mb-3.5 grid grid-cols-2 gap-1 rounded-2xl border border-border/80 bg-secondary/40 p-1">
          <button
            type="button"
            onClick={() => onTextSubTabChange?.("add")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all",
              textSubTab === "add"
                ? "bg-background text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Text Studio</span>
          </button>
          <button
            type="button"
            onClick={() => onTextSubTabChange?.("effects")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all",
              textSubTab === "effects"
                ? "bg-background text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Effects</span>
          </button>
        </div>

        {textSubTab === "effects" ? (
          <Panel title="Text Effects & Shape">
            <TextEffectsPanel layer={activeTextLayer ?? null} onChange={updateActiveLayer} />
          </Panel>
        ) : (
          <Panel title="Text Studio">
            <div className="flex flex-col gap-4">
              {/* 1. Add Text Presets */}
              <div>
                <p className="mb-2 text-xs font-bold text-foreground">Add text block</p>
                <div className="flex flex-col gap-2">
                  {/* Heading */}
                  <button
                    type="button"
                    onClick={() =>
                      addPresetText({ text: "Add a heading", size: 100, weight: 700 })
                    }
                    className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-border/80 bg-secondary/40 px-3.5 py-3 text-left transition-all hover:border-primary hover:bg-secondary hover:shadow-sm"
                  >
                    <span className="text-base font-bold tracking-tight text-foreground group-hover:text-primary">
                      Add a heading
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary">
                      <Add01Icon size={14} />
                    </span>
                  </button>

                  {/* Subheading */}
                  <button
                    type="button"
                    onClick={() =>
                      addPresetText({ text: "Add a subheading", size: 75, weight: 600 })
                    }
                    className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-border/80 bg-secondary/40 px-3.5 py-2.5 text-left transition-all hover:border-primary hover:bg-secondary hover:shadow-sm"
                  >
                    <span className="text-xs font-semibold text-foreground group-hover:text-primary">
                      Add a subheading
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary">
                      <Add01Icon size={14} />
                    </span>
                  </button>

                  {/* Body Text */}
                  <button
                    type="button"
                    onClick={() =>
                      addPresetText({
                        text: "Add a little bit of body text",
                        size: 50,
                        weight: 400,
                      })
                    }
                    className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-border/80 bg-secondary/40 px-3.5 py-2 text-left transition-all hover:border-primary hover:bg-secondary hover:shadow-sm"
                  >
                    <span className="text-[11px] font-normal text-muted-foreground group-hover:text-foreground">
                      Add body text
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary">
                      <Add01Icon size={14} />
                    </span>
                  </button>
                </div>
              </div>

              {/* 2. Text Layer List if more than 1 */}
              {textLayersList.length > 1 && (
                <div>
                  <p className="mb-1.5 text-xs font-bold text-foreground">Canvas Text Layers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {textLayersList.map((t, idx) => {
                      const isSelected = activeTextLayer?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSelectLayer?.({ kind: "text", id: t.id })}
                          className={cn(
                            "max-w-[140px] truncate rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all",
                            isSelected
                              ? "border-primary bg-primary/10 font-bold text-primary shadow-sm"
                              : "border-border bg-card text-muted-foreground hover:border-border/80 hover:text-foreground",
                          )}
                          title={t.text}
                        >
                          {t.text ? t.text.slice(0, 18) : `Text ${idx + 1}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Selected Text Layer Styling Inspector */}
              {activeTextLayer ? (
                <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold text-foreground">
                      Selected Text Style
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const { list, newId } = withTextDuplicated(s, activeTextLayer.id);
                          set("texts", list);
                          onSelectLayer?.({ kind: "text", id: newId });
                        }}
                        title="Duplicate text layer"
                        className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Copy01Icon size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          set("texts", withTextRemoved(s, activeTextLayer.id));
                        }}
                        title="Delete text layer"
                        className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Delete02Icon size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {/* Content input */}
                    <Field label="Text Content">
                      <AreaInput
                        rows={3}
                        value={activeTextLayer.text}
                        onChange={(e) =>
                          updateActiveLayer({
                            text: e.target.value,
                            html: sanitizeTextHtml(e.target.value),
                          })
                        }
                        className="text-xs"
                        placeholder="Type text here..."
                      />
                    </Field>

                    {/* Font Family */}
                    <Field label="Font Family">
                      <Select
                        value={activeTextLayer.fontFamily}
                        onChange={(v) => {
                          updateActiveLayer({ fontFamily: v });
                          onItemSelect?.();
                        }}
                        options={FONTS.map((f) => ({ label: f.label, value: f.value }))}
                        className="h-8 rounded-xl px-2.5 py-0 text-xs font-medium"
                      />
                    </Field>

                    {/* Font Size & Weight */}
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Font Size">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            {...fontSizeDecHold}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-secondary/50 text-foreground hover:bg-secondary"
                          >
                            <MinusSignIcon size={13} />
                          </button>
                          <TextInput
                            type="number"
                            value={activeTextLayer.size}
                            onChange={(e) => {
                              const newSize = Math.max(10, Math.min(300, Number(e.target.value) || 32));
                              const ratio = newSize / (activeTextLayer.size || 32);
                              const nextWidth = activeTextLayer.width ? Math.round(Math.max(40, activeTextLayer.width * ratio)) : undefined;
                              const nextMinHeight = activeTextLayer.minHeight ? Math.round(activeTextLayer.minHeight * ratio) : undefined;
                              updateActiveLayer({
                                size: newSize,
                                ...(nextWidth !== undefined ? { width: nextWidth } : {}),
                                ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
                              });
                            }}
                            className="h-8 text-center text-xs"
                          />
                          <button
                            type="button"
                            {...fontSizeIncHold}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-secondary/50 text-foreground hover:bg-secondary"
                          >
                            <Add01Icon size={13} />
                          </button>
                        </div>
                      </Field>

                      <Field label="Font Weight">
                        <Select
                          value={String(activeTextLayer.weight)}
                          onChange={(v) => updateActiveLayer({ weight: Number(v) })}
                          options={FONT_WEIGHTS.map((w) => ({
                            label: w.label,
                            value: String(w.value),
                          }))}
                          className="h-8 rounded-xl px-2.5 py-0 text-xs font-medium"
                        />
                      </Field>
                    </div>

                    {/* Text Color */}
                    <Field label="Text Color">
                      <div className="flex flex-col gap-2">
                        <ColorInput
                          value={activeTextLayer.color}
                          onChange={(c) => updateActiveLayer({ color: c })}
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                updateActiveLayer({ color: c });
                                onItemSelect?.();
                              }}
                              style={{ backgroundColor: c }}
                              className={cn(
                                "h-5 w-5 rounded-full border shadow-sm transition-transform hover:scale-110",
                                activeTextLayer.color.toLowerCase() === c.toLowerCase()
                                  ? "ring-2 ring-primary ring-offset-1"
                                  : "border-border/60",
                              )}
                              title={c}
                            />
                          ))}
                        </div>
                      </div>
                    </Field>

                    {/* Alignment & Styles */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Field label="Alignment">
                        <div className="flex rounded-lg border border-border bg-secondary/30 p-0.5">
                          {(
                            [
                              { align: "left" as const, Icon: TextAlignLeftIcon },
                              { align: "center" as const, Icon: TextAlignCenterIcon },
                              { align: "right" as const, Icon: TextAlignRightIcon },
                            ] as const
                          ).map(({ align, Icon }) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => updateActiveLayer({ align })}
                              className={cn(
                                "flex flex-1 items-center justify-center rounded-md py-1 text-xs transition-colors",
                                activeTextLayer.align === align
                                  ? "bg-background font-bold text-primary shadow-sm"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <Icon size={14} />
                            </button>
                          ))}
                        </div>
                      </Field>

                      <Field label="Format">
                        <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveLayer({
                                weight: activeTextLayer.weight >= 700 ? 400 : 700,
                              })
                            }
                            className={cn(
                              "flex flex-1 items-center justify-center rounded-md py-1 text-xs transition-colors",
                              activeTextLayer.weight >= 700
                                ? "bg-background font-bold text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Bold"
                          >
                            <TextBoldIcon size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveLayer({ italic: !activeTextLayer.italic })
                            }
                            className={cn(
                              "flex flex-1 items-center justify-center rounded-md py-1 text-xs transition-colors",
                              activeTextLayer.italic
                                ? "bg-background font-bold text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Italic"
                          >
                            <TextItalicIcon size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveLayer({ underline: !activeTextLayer.underline })
                            }
                            className={cn(
                              "flex flex-1 items-center justify-center rounded-md py-1 text-xs transition-colors",
                              activeTextLayer.underline
                                ? "bg-background font-bold text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Underline"
                          >
                            <TextUnderlineIcon size={14} />
                          </button>
                        </div>
                      </Field>
                    </div>

                    {/* Line Height & Letter Spacing */}
                    <div className="space-y-2 pt-1 border-t border-border/60">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-muted-foreground">Line Height</span>
                        <span className="font-mono text-foreground">
                          {(activeTextLayer.lineHeight ?? 1.3).toFixed(1)}
                        </span>
                      </div>
                      <Range
                        min={8}
                        max={25}
                        value={Math.round((activeTextLayer.lineHeight ?? 1.3) * 10)}
                        onChange={(v) => updateActiveLayer({ lineHeight: v / 10 })}
                      />

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="font-semibold text-muted-foreground">Letter Spacing</span>
                        <span className="font-mono text-foreground">
                          {activeTextLayer.letterSpacing ?? 0}
                        </span>
                      </div>
                      <Range
                        min={-50}
                        max={200}
                        value={activeTextLayer.letterSpacing ?? 0}
                        onChange={(v) => updateActiveLayer({ letterSpacing: v })}
                      />
                    </div>

                  </div>
                </div>
              ) : null}
            </div>
          </Panel>
        )}
      </>
    );
  }

  if (tab === "uploads") {
    return (
      <>
        <Panel title="Uploads">
          <div className="flex flex-col gap-3">
            <UploadButton
              label="Upload images"
              multiple
              onFiles={(files) => {
                const res = withImagesAdded(s, files);
                set("images", res.list);
                set("layerOrder", res.layerOrder);
                const firstNew = res.newIds[0];
                if (firstNew) {
                  onSelectLayer?.({ kind: "image", id: firstNew });
                }
                onItemSelect?.();
              }}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Select multiple photos at once from the file picker, then drag each one straight on
              the canvas to move it, or drag a corner handle to resize it.
            </p>
            {getImageLayers(s).length > 0 ? (
              <div className="flex flex-col gap-3">
                {getImageLayers(s).map((img, i) => (
                  <div
                    key={img.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-2.5"
                  >
                    <img
                      src={img.src}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                    <div className="flex flex-1 items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Image {i + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Chip
                          onClick={() => setCroppingImage(img)}
                          className="px-2.5 py-1 text-[11px] text-primary hover:border-primary"
                        >
                          <CropIcon size={12} className="mr-1 inline" />
                          Crop
                        </Chip>
                        <Chip
                          onClick={() => set("images", withImageRemoved(s, img.id))}
                          className="px-2.5 py-1 text-[11px] text-destructive hover:border-destructive hover:text-destructive"
                        >
                          Remove
                        </Chip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {croppingImage ? (
              <ImageCropDialog
                open={Boolean(croppingImage)}
                onClose={() => setCroppingImage(null)}
                imageSrc={croppingImage.src}
                onCropComplete={(croppedDataUrl) => {
                  set("images", withImageUpdated(s, croppingImage.id, { src: croppedDataUrl }));
                  setCroppingImage(null);
                }}
              />
            ) : null}
          </div>
        </Panel>
      </>
    );
  }

  if (tab === "layers") {
    const textLayers = getTextLayers(s);
    const imageLayers = getImageLayers(s);
    const shapeLayers = getShapeLayers(s);
    const unifiedLayers = getUnifiedLayers(s);
    const displayLayers = [...unifiedLayers].reverse();
    const totalCount = unifiedLayers.length;

    const isLayerSelected = (kind: "image" | "text" | "shape", id: string) =>
      selection?.some((item) => item.kind === kind && item.id === id) ?? false;

    // Commits a drag-to-reorder gesture (see the grip handle's pointer
    // handlers in each row branch below) — moves the dragged layer from
    // its start position to wherever dragOverIndex ended up, in one shot,
    // rather than mutating layerOrder on every pointermove. displayLayers
    // is top-to-bottom (front-most layer first); reversing the result
    // converts back to layerOrder's own back-to-front storage order.
    const commitLayerDrag = () => {
      const st = dragStateRef.current;
      if (st && dragOverIndex !== null && dragOverIndex !== st.startIndex) {
        const reordered = [...displayLayers];
        const [moved] = reordered.splice(st.startIndex, 1);
        if (moved) {
          reordered.splice(dragOverIndex, 0, moved);
          set("layerOrder", [...reordered].reverse());
        }
      }
      dragStateRef.current = null;
      setDragLayerId(null);
      setDragOverIndex(null);
      setDragDeltaY(0);
    };

    // Starts a drag from any row's grip handle — shared across the text/
    // image/shape row branches below since the gesture itself doesn't
    // care which kind of layer it's holding, only its display index.
    const startLayerDrag = (e: React.PointerEvent, id: string, panelIdx: number) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const rowEl = (e.currentTarget as HTMLElement).closest("[data-layer-row]") as HTMLElement | null;
      // +6 accounts for the list's own space-y-1.5 gap between rows, so a
      // drag crosses into the next row exactly when it visually would.
      const rowPitch = rowEl ? rowEl.getBoundingClientRect().height + 6 : 44;
      dragStateRef.current = { startIndex: panelIdx, startY: e.clientY, rowPitch };
      setDragLayerId(id);
      setDragOverIndex(panelIdx);
      setDragDeltaY(0);
    };

    const moveLayerDrag = (e: React.PointerEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      e.stopPropagation();
      const deltaY = e.clientY - st.startY;
      setDragDeltaY(deltaY);
      const shift = Math.round(deltaY / st.rowPitch);
      setDragOverIndex(Math.min(displayLayers.length - 1, Math.max(0, st.startIndex + shift)));
    };

    const endLayerDrag = (e: React.PointerEvent) => {
      e.stopPropagation();
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { }
      commitLayerDrag();
    };

    // The dragged row itself follows the pointer continuously via this
    // translateY, independent of dragOverIndex (which only moves in whole-
    // row increments) — see moveLayerDrag above.
    const dragRowStyle = (id: string): React.CSSProperties | undefined =>
      dragLayerId === id ? { transform: `translateY(${dragDeltaY}px)`, position: "relative", zIndex: 50 } : undefined;

    const allSelected =
      totalCount > 0 &&
      textLayers.every((t) => isLayerSelected("text", t.id)) &&
      imageLayers.every((img) => isLayerSelected("image", img.id)) &&
      shapeLayers.every((sh) => isLayerSelected("shape", sh.id));

    return (
      <>
        <Panel title={`Layers (${totalCount})`}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] leading-snug text-muted-foreground">
                Click any layer to select & highlight it on the canvas. Shift+Click to select multiple.
              </p>
            </div>

            {totalCount > 0 ? (
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {selection?.length ? `${selection.length} selected` : "No selection"}
                </span>
                <div className="flex items-center gap-1.5">
                  {selection && selection.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        const result = withMultipleLayersRemoved(s, selection);
                        set("texts", result.texts);
                        set("images", result.images);
                        set("shapes", result.shapes);
                        set("layerOrder", result.layerOrder);
                        onSelectLayer?.({ kind: "text", id: "" }, { selectAll: false, toggle: false });
                      }}
                      className="flex items-center gap-1 rounded-lg bg-destructive/15 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/25"
                      title="Delete all selected layers"
                    >
                      <Delete02Icon size={12} />
                      Delete ({selection.length})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      onSelectLayer?.(
                        { kind: "text", id: "" },
                        { selectAll: !allSelected, toggle: false },
                      )
                    }
                    className="rounded-lg bg-secondary/80 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
                  >
                    {allSelected ? "Deselect All" : "Select All (Shift+A)"}
                  </button>
                </div>
              </div>
            ) : null}

            {totalCount === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                No extra layers yet. Add text, uploads, or shapes from the left sidebar!
              </div>
            ) : null}

            {/* Unified Layers List — single list for all text, image, and shape layers */}
            {displayLayers.length > 0 ? (
              <div className="relative space-y-1.5">
                {/* Drop-position indicator — a thin line showing exactly
                    where the dragged row will land, instead of (just)
                    highlighting a whole target row. Positioned off
                    dragStateRef's rowPitch (the row height + gap measured
                    when the drag started), same approximation the drag's
                    own index math uses, so the line and the actual drop
                    slot always agree. -3px centers the 2px line in the
                    3px half of the list's 6px (space-y-1.5) row gap. */}
                {dragLayerId !== null && dragOverIndex !== null && dragStateRef.current ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-primary shadow-[0_0_6px_1px_rgba(0,33,255,0.5)]"
                    style={{
                      top: dragOverIndex * dragStateRef.current.rowPitch - 3,
                      transition: "top 100ms ease-out",
                    }}
                  />
                ) : null}
                {displayLayers.map(({ kind, id }, panelIdx) => {
                  const selected = isLayerSelected(kind, id);
                  const isTop = panelIdx === 0;
                  const isBottom = panelIdx === displayLayers.length - 1;

                  if (kind === "text") {
                    const t = textLayers.find((item) => item.id === id);
                    if (!t) return null;
                    return (
                      <div
                        key={t.id}
                        data-layer-row=""
                        onClick={(e) =>
                          onSelectLayer?.({ kind: "text", id: t.id }, { toggle: e.shiftKey })
                        }
                        style={dragRowStyle(t.id)}
                        className={cn(
                          "group flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-xs transition-all",
                          selected
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                            : "border-border/80 bg-secondary/30 hover:border-border hover:bg-secondary/60",
                          t.hidden && "opacity-55",
                          dragLayerId === t.id && "shadow-lg ring-1 ring-primary/50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => startLayerDrag(e, t.id, panelIdx)}
                          onPointerMove={moveLayerDrag}
                          onPointerUp={endLayerDrag}
                          onPointerCancel={endLayerDrag}
                          className="flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <DragDropVerticalIcon size={14} />
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                              selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                            )}
                          >
                            T
                          </span>
                          <span className={cn("truncate font-medium text-foreground", t.hidden && "line-through text-muted-foreground")}>
                            {t.text || "Text Layer"}
                          </span>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => set("layerOrder", withUnifiedLayerReordered(s, t.id, "up").layerOrder)}
                            disabled={isTop}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                            title="Move up (Sort up)"
                          >
                            <ArrowUp01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => set("layerOrder", withUnifiedLayerReordered(s, t.id, "down").layerOrder)}
                            disabled={isBottom}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                            title="Move down (Sort down)"
                          >
                            <ArrowDown01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => set("texts", withTextUpdated(s, t.id, { hidden: !t.hidden }))}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              t.hidden ? "text-amber-500 font-bold" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={t.hidden ? "Show layer" : "Hide layer"}
                          >
                            {t.hidden ? <ViewOffIcon size={13} /> : <ViewIcon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => set("texts", withTextUpdated(s, t.id, { locked: !t.locked }))}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              t.locked ? "text-amber-400" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={t.locked ? "Unlock layer" : "Lock layer"}
                          >
                            {t.locked ? <SquareLock02Icon size={13} /> : <SquareUnlock02Icon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => set("texts", withTextRemoved(s, t.id))}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete text layer"
                          >
                            <Delete02Icon size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (kind === "image") {
                    const img = imageLayers.find((item) => item.id === id);
                    if (!img) return null;
                    return (
                      <div
                        key={img.id}
                        data-layer-row=""
                        onClick={(e) =>
                          onSelectLayer?.({ kind: "image", id: img.id }, { toggle: e.shiftKey })
                        }
                        style={dragRowStyle(img.id)}
                        className={cn(
                          "group flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-xs transition-all",
                          selected
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                            : "border-border/80 bg-secondary/30 hover:border-border hover:bg-secondary/60",
                          img.hidden && "opacity-55",
                          dragLayerId === img.id && "shadow-lg ring-1 ring-primary/50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => startLayerDrag(e, img.id, panelIdx)}
                          onPointerMove={moveLayerDrag}
                          onPointerUp={endLayerDrag}
                          onPointerCancel={endLayerDrag}
                          className="flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <DragDropVerticalIcon size={14} />
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <img
                            src={img.src}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded object-cover"
                          />
                          <span className={cn("truncate font-medium text-foreground", img.hidden && "line-through text-muted-foreground")}>
                            Image
                          </span>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => set("layerOrder", withUnifiedLayerReordered(s, img.id, "up").layerOrder)}
                            disabled={isTop}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                            title="Move up (Sort up)"
                          >
                            <ArrowUp01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => set("layerOrder", withUnifiedLayerReordered(s, img.id, "down").layerOrder)}
                            disabled={isBottom}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                            title="Move down (Sort down)"
                          >
                            <ArrowDown01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => set("images", withImageUpdated(s, img.id, { hidden: !img.hidden }))}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              img.hidden ? "text-amber-500 font-bold" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={img.hidden ? "Show layer" : "Hide layer"}
                          >
                            {img.hidden ? <ViewOffIcon size={13} /> : <ViewIcon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => set("images", withImageUpdated(s, img.id, { locked: !img.locked }))}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              img.locked ? "text-amber-400" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={img.locked ? "Unlock layer" : "Lock layer"}
                          >
                            {img.locked ? <SquareLock02Icon size={13} /> : <SquareUnlock02Icon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => set("images", withImageRemoved(s, img.id))}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete image layer"
                          >
                            <Delete02Icon size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (kind === "shape") {
                    const sh = shapeLayers.find((item) => item.id === id);
                    if (!sh) return null;
                    const label = getShapeLabel(sh);
                    return (
                      <div
                        key={sh.id}
                        data-layer-row=""
                        onClick={(e) =>
                          onSelectLayer?.({ kind: "shape", id: sh.id }, { toggle: e.shiftKey })
                        }
                        style={dragRowStyle(sh.id)}
                        className={cn(
                          "group flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-xs transition-all",
                          selected
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                            : "border-border/80 bg-secondary/30 hover:border-border hover:bg-secondary/60",
                          sh.hidden && "opacity-55",
                          dragLayerId === sh.id && "shadow-lg ring-1 ring-primary/50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => startLayerDrag(e, sh.id, panelIdx)}
                          onPointerMove={moveLayerDrag}
                          onPointerUp={endLayerDrag}
                          onPointerCancel={endLayerDrag}
                          className="flex h-6 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/40 transition-colors hover:text-foreground active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <DragDropVerticalIcon size={14} />
                        </button>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div
                            className="h-5 w-5 shrink-0 border border-border/80"
                            style={{
                              background:
                                sh.style === "gradient"
                                  ? sh.gradient ?? "linear-gradient(135deg, #ffffff 0%, #ede9fe 100%)"
                                  : sh.style === "outline"
                                    ? "transparent"
                                    : sh.color,
                              borderColor: sh.style === "outline" ? sh.color : undefined,
                              ...shapeCss(sh.kind, sh.radius >= 80 ? 999 : Math.min(sh.radius, 8)),
                            }}
                          />
                          <span className={cn("truncate font-medium capitalize text-foreground", sh.hidden && "line-through text-muted-foreground")}>
                            {label}
                          </span>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => set("layerOrder", withUnifiedLayerReordered(s, sh.id, "up").layerOrder)}
                            disabled={isTop}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                            title="Move up (Sort up)"
                          >
                            <ArrowUp01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => set("layerOrder", withUnifiedLayerReordered(s, sh.id, "down").layerOrder)}
                            disabled={isBottom}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-20"
                            title="Move down (Sort down)"
                          >
                            <ArrowDown01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => set("shapes", withShapeUpdated(s, sh.id, { hidden: !sh.hidden }))}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              sh.hidden ? "text-amber-500 font-bold" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={sh.hidden ? "Show layer" : "Hide layer"}
                          >
                            {sh.hidden ? <ViewOffIcon size={13} /> : <ViewIcon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("shapes", withShapeUpdated(s, sh.id, { locked: !sh.locked }))
                            }
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              sh.locked ? "text-amber-400" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={sh.locked ? "Unlock layer" : "Lock layer"}
                          >
                            {sh.locked ? <SquareLock02Icon size={13} /> : <SquareUnlock02Icon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => set("shapes", withShapeRemoved(s, sh.id))}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete shape layer"
                          >
                            <Delete02Icon size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return null;
                })}
              </div>
            ) : null}
          </div>
        </Panel>
      </>
    );
  }

  if (tab === "style") {
    return (
      <>
        <Panel title="Typography">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Font, size, weight, color and alignment now live on each individual text layer's
            own card -- click any text directly on the canvas to select it, or manage every
            text layer from the Elements tab.
          </p>
        </Panel>
      </>
    );
  }

  if (tab === "elements") {
    const selectedShapeSel = selection?.find((sel) => sel.kind === "shape");
    const activeShapeLayer = selectedShapeSel
      ? getShapeLayers(s).find((sh) => sh.id === selectedShapeSel.id) ?? null
      : null;

    const displayedShadows = SHADOW_OVERLAY_PRESETS.filter(
      (preset) => shadowThemeFilter === "all" || (preset.theme ?? "black") === shadowThemeFilter,
    );

    return (
      <>
        <Panel title="Elements">
          <div className="flex flex-col gap-5">
            {/* 1. Geometric Shapes */}
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Shapes</span>
                <span className="text-[10px] text-muted-foreground">{SHAPE_PRESETS.length} shapes</span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Click any shape to add to your canvas. Drag handles to resize or reposition.
              </p>
              <div className="grid grid-cols-4 gap-2 pt-1">
                {SHAPE_PRESETS.map((preset) => {
                  const previewRadius = preset.id === "rounded" ? 8 : preset.radius;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        const res = withShapeAdded(s, preset.kind, preset.radius);
                        set("shapes", res.list);
                        set("layerOrder", res.layerOrder);
                        if (res.newId) {
                          onSelectLayer?.({ kind: "shape", id: res.newId });
                        }
                        onItemSelect?.();
                      }}
                      title={preset.label}
                      className="flex aspect-square items-center justify-center rounded-lg border border-border bg-secondary/60 p-2 text-muted-foreground transition-all hover:scale-105 hover:border-primary hover:bg-secondary hover:text-foreground"
                    >
                      <span
                        className="block h-full w-full"
                        style={{ background: "currentColor", ...shapeCss(preset.kind, previewRadius) }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Shadows & Highlights (Under Shapes) */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Shadows & Highlights</span>
                <span className="text-[10px] text-muted-foreground">{displayedShadows.length} presets</span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Gradient overlays, dark vignettes, and ground drop shadows to enhance readability and contrast.
              </p>

              {/* Black & White Filter Tabs */}
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/80 bg-background/60 p-1">
                <button
                  type="button"
                  onClick={() => setShadowThemeFilter("all")}
                  className={cn(
                    "flex items-center justify-center rounded-lg py-1.5 text-xs font-semibold transition-all",
                    shadowThemeFilter === "all"
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setShadowThemeFilter("black")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all",
                    shadowThemeFilter === "black"
                      ? "bg-zinc-950 text-white shadow-sm ring-1 ring-zinc-700"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-black ring-1 ring-white/40" />
                  <span>Black</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShadowThemeFilter("white")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all",
                    shadowThemeFilter === "white"
                      ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-300"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-white ring-1 ring-black/30" />
                  <span>White</span>
                </button>
              </div>

              {/* Active Shadow Inspector (if a gradient shape is active) */}
              {activeShapeLayer && activeShapeLayer.style === "gradient" ? (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-primary">Active Shadow Controls</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const { list, newId } = withShapeDuplicated(s, activeShapeLayer.id);
                          set("shapes", list);
                          onSelectLayer?.({ kind: "shape", id: newId });
                        }}
                        title="Duplicate shadow"
                        className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Copy01Icon size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => set("shapes", withShapeRemoved(s, activeShapeLayer.id))}
                        title="Delete shadow"
                        className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Delete02Icon size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-muted-foreground">Opacity</span>
                      <span className="font-mono text-foreground">{activeShapeLayer.opacity}%</span>
                    </div>
                    <Range
                      min={5}
                      max={100}
                      value={activeShapeLayer.opacity}
                      onChange={(v) =>
                        set("shapes", withShapeUpdated(s, activeShapeLayer.id, { opacity: v }))
                      }
                    />

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "shapes",
                            withShapeUpdated(s, activeShapeLayer.id, {
                              layer: activeShapeLayer.layer === "behind" ? "front" : "behind",
                            }),
                          )
                        }
                        className="flex items-center justify-center rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary"
                      >
                        Layer: {activeShapeLayer.layer === "behind" ? "Behind Text" : "Front"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "shapes",
                            withShapeUpdated(s, activeShapeLayer.id, {
                              flipV: !activeShapeLayer.flipV,
                            }),
                          )
                        }
                        className="flex items-center justify-center rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary"
                      >
                        Flip Vertical ⇅
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "shapes",
                            withShapeUpdated(s, activeShapeLayer.id, {
                              x: 50,
                              y: 80,
                              size: s.width,
                              height: Math.round(s.height * 0.45),
                            }),
                          )
                        }
                        className="rounded border border-border bg-secondary/50 py-1 text-[10px] font-semibold hover:bg-secondary"
                      >
                        Snap Bottom
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "shapes",
                            withShapeUpdated(s, activeShapeLayer.id, {
                              x: 50,
                              y: 20,
                              size: s.width,
                              height: Math.round(s.height * 0.45),
                            }),
                          )
                        }
                        className="rounded border border-border bg-secondary/50 py-1 text-[10px] font-semibold hover:bg-secondary"
                      >
                        Snap Top
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "shapes",
                            withShapeUpdated(s, activeShapeLayer.id, {
                              x: 50,
                              y: 50,
                              size: s.width,
                              height: s.height,
                            }),
                          )
                        }
                        className="rounded border border-border bg-secondary/50 py-1 text-[10px] font-semibold hover:bg-secondary"
                      >
                        Full Canvas
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* High-Contrast Shadows Grid */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                {displayedShadows.map((preset) => {
                  const isWhite = preset.theme === "white";
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        const { list, newId } = withShadowAdded(s, preset);
                        set("shapes", list);
                        onSelectLayer?.({ kind: "shape", id: newId });
                        onItemSelect?.();
                      }}
                      title={preset.description || preset.label}
                      className={cn(
                        "group relative flex aspect-square w-full overflow-hidden rounded-xl border shadow-sm transition-all hover:scale-105 hover:border-primary hover:shadow-lg active:scale-95",
                        isWhite
                          ? "border-zinc-800 bg-[#0e0f14]"
                          : "border-zinc-200 bg-[#ffffff] dark:border-zinc-700/80",
                      )}
                    >
                      {/* Shadow / Glow Overlay */}
                      <div
                        className="pointer-events-none absolute inset-0 transition-transform group-hover:scale-105"
                        style={{
                          background: preset.gradient,
                          opacity: (preset.opacity ?? 90) / 100,
                        }}
                      />

                      {/* Subtle Inner Glow Ring */}
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/5" />

                      {/* Hover Plus Icon */}
                      <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                        +
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <Panel title="Solid Color">
        <div className="flex flex-col gap-3">
          <ColorInput
            value={s.background.startsWith("#") ? s.background : "#ffffff"}
            onChange={(v) => {
              set("background", v);
              set("bgImage", null);
            }}
          />
          <div className="grid grid-cols-6 gap-2 pt-1">
            {[
              { label: "White", color: "#ffffff" },
              { label: "Soft Gray", color: "#f4f4f5" },
              { label: "Dark Gray", color: "#18181b" },
              { label: "Pure Black", color: "#000000" },
              { label: "Indigo", color: "#4f46e5" },
              { label: "Rose", color: "#e11d48" },
              { label: "Emerald", color: "#059669" },
              { label: "Amber", color: "#d97706" },
              { label: "Sky", color: "#0284c7" },
              { label: "Purple", color: "#7c3aed" },
              { label: "Teal", color: "#0d9488" },
              { label: "Slate", color: "#334155" },
            ].map((c) => (
              <button
                key={c.color}
                type="button"
                title={c.label}
                onClick={() => {
                  set("background", c.color);
                  set("bgImage", null);
                  onItemSelect?.();
                }}
                style={{ background: c.color }}
                className={cn(
                  "h-8 w-full rounded-xl border transition-all hover:scale-105",
                  s.background.toLowerCase() === c.color.toLowerCase() && !s.bgImage
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border shadow-sm",
                )}
              />
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Background image">
        <div className="flex flex-col gap-3">
          <UploadButton
            label={s.bgImage ? "Change background image" : "Upload background image"}
            onFile={(d) => {
              set("bgImage", d);
              onItemSelect?.();
            }}
          />
          {s.bgImage ? (
            <>
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
                  <span className="text-xs font-semibold text-foreground">Position & Zoom</span>
                  {((s.bgImageZoom ?? 100) !== 100 || (s.bgImagePosX ?? 50) !== 50 || (s.bgImagePosY ?? 50) !== 50) && (
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
                  )}
                </div>

                <Field label={`Zoom — ${s.bgImageZoom ?? 100}%`}>
                  {/* min is 100, not 50 — anything lower shrinks the image
                      below its own "fills the canvas" size, exposing the
                      background behind it instead of zooming out (see the
                      clamp in QuoteCanvas.tsx's own render). */}
                  <Range
                    value={s.bgImageZoom ?? 100}
                    min={100}
                    max={300}
                    onChange={(v) => set("bgImageZoom", v)}
                  />
                </Field>

                <Field label={`Left ↔ Right position — ${s.bgImagePosX ?? 50}%`}>
                  <Range
                    value={s.bgImagePosX ?? 50}
                    min={0}
                    max={100}
                    onChange={(v) => set("bgImagePosX", v)}
                  />
                </Field>

                <Field label={`Top ↕ Bottom position — ${s.bgImagePosY ?? 50}%`}>
                  <Range
                    value={s.bgImagePosY ?? 50}
                    min={0}
                    max={100}
                    onChange={(v) => set("bgImagePosY", v)}
                  />
                </Field>

                <div className="flex items-center gap-1.5 pt-1">
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
      </Panel>

      <Panel title="Create Custom Gradient">
        <div className="flex flex-col gap-3">
          <div
            className="relative flex h-24 w-full items-end justify-between rounded-2xl border border-border p-3 shadow-inner transition-all"
            style={{ background: customGradValue }}
          >
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
              {gradType === "radial" ? "Radial Gradient" : `${gradAngle}° Linear`}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  set("background", customGradValue);
                  set("bgImage", null);
                  onItemSelect?.();
                }}
                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-950 shadow-md transition-transform hover:scale-105 active:scale-95"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={saveCustomGradient}
                className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
              >
                <Add01Icon size={12} />
                Save
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Start color">
              <ColorInput value={gradStart} onChange={setGradStart} />
            </Field>
            <Field label="End color">
              <ColorInput value={gradEnd} onChange={setGradEnd} />
            </Field>
          </div>

          <Toggle
            checked={useMid}
            onChange={setUseMid}
            label="Add 3rd accent color stop"
          />
          {useMid ? (
            <Field label="Middle color stop">
              <ColorInput value={gradMid} onChange={setGradMid} />
            </Field>
          ) : null}

          <Field label="Gradient type">
            <div className="grid grid-cols-2 gap-2">
              <Chip active={gradType === "linear"} onClick={() => setGradType("linear")}>
                Linear
              </Chip>
              <Chip active={gradType === "radial"} onClick={() => setGradType("radial")}>
                Radial
              </Chip>
            </div>
          </Field>

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
      </Panel>

      {savedGradients.length > 0 ? (
        <Panel title={`My Saved Gradients (${savedGradients.length})`}>
          <div className="grid grid-cols-4 gap-2">
            {savedGradients.map((val, idx) => (
              <div key={idx} className="group relative">
                <button
                  type="button"
                  title="Click to apply"
                  onClick={() => {
                    set("background", val);
                    set("bgImage", null);
                    onItemSelect?.();
                  }}
                  style={{ background: val }}
                  className={cn(
                    "h-12 w-full rounded-2xl border transition-all hover:scale-105",
                    s.background === val && !s.bgImage
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border",
                  )}
                />
                <button
                  type="button"
                  title="Delete saved gradient"
                  onClick={(e) => removeSavedGradient(val, e)}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white shadow group-hover:flex"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="Curated Gradients">
        <div className="grid grid-cols-4 gap-2">
          {GRADIENTS.map((g) => (
            <button
              key={g.label}
              type="button"
              title={g.label}
              onClick={() => {
                set("background", g.value);
                set("bgImage", null);
                applyCuratedGradientToStudio(g.value);
                onItemSelect?.();
              }}
              style={{ background: g.value }}
              className={cn(
                "h-12 w-full rounded-2xl border transition-transform hover:scale-105",
                s.background === g.value && !s.bgImage ? "border-primary ring-2 ring-primary/40" : "border-border",
              )}
            />
          ))}
        </div>
      </Panel>
    </>
  );
}
