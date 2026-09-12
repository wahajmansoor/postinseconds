import { useEffect, useMemo, useRef, useState } from "react";
import { TemplatePreview } from "./TemplatePreview";
import {
  Add01Icon,
  ArrowDown01Icon,
  MinusSignIcon,
  Copy01Icon,
  CropIcon,
  StarCircleIcon,
  Folder01Icon,
  Delete02Icon,
  SquareLock02Icon,
  SquareUnlock02Icon,
  Image01Icon,
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
  CheckmarkCircle02Icon,
  Layers01Icon,
  Tick02Icon,
  Search01Icon,
  Cancel01Icon,
  ReloadIcon,
  Crown03Icon,
  SparklesIcon,
} from "hugeicons-react";
import { CaseUpper } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { loadGoogleFont } from "@/lib/fontLoader";
import {
  fetchSavedQuotes,
  deleteSavedQuote,
  updateSavedQuoteDesign,
  fetchAllTemplates,
  type DbSavedQuote,
} from "@/lib/supabase";
import { useCustomFonts } from "@/hooks/useCustomFonts";
import { CustomFontsDialog } from "./CustomFontsDialog";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { ImageCropDialog } from "./ImageCropDialog";
import { TextEffectsPanel } from "./TextEffectsPanel";
import { VERIFIED_PICKER_ICONS } from "./VerifiedBadges";
import {
  getSavedUserUploads,
  saveUserUploads,
  deleteUserUpload,
  subscribeUserUploads,
  type UserUploadItem,
} from "@/lib/userUploads";
import {
  getAvailableFontWeights,
  getCanvasFontsInUse,
  getFontPool,
  loadGoogleFontsCatalog,
  PREMIUM_TEMPLATES,
  SHADOW_OVERLAY_PRESETS,
  SHAPE_PRESETS,
  LINE_PRESETS,
  FRAME_PRESETS,
  frameShapeCss,
  CANVA_FRAME_PLACEHOLDER_SRC,
  withFrameAdded,
  isLineShape,
  STARTER_TEMPLATES,
  TEMPLATES,
  getImageLayers,
  getMatchingShapePresetId,
  getShapeLabel,
  getShapeLayers,
  getTextLayers,
  getUnifiedLayers,
  parseGradientCss,
  reduceGradientStops,
  withMultipleLayersDuplicated,
  withMultipleLayersRemoved,
  withUnifiedLayerReordered,
  sanitizeTextHtml,
  shapeCss,
  shapeFillStyle,
  shapeSupportsRadius,
  withImageDuplicated,
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
  type FontOption,
  type ImageLayer,
  type ImageShape,
  type ShadowPreset,
  type TextLayer,
  type Template,
  type ShapeLayer,
} from "./types";
import { LineShapeSvg } from "./LineShapeSvg";
import {
  AreaInput,
  Chip,
  ColorInput,
  ColorSwatchPicker,
  Field,
  FontPickerField,
  GradientSwatchGrid,
  Panel,
  Range,
  Select,
  TextInput,
  Toggle,
  UploadButton,
  useHoldRepeat,
} from "./ui";
import { cn } from "@/lib/utils";

function setCrispDragImage(e: React.DragEvent, label: string) {
  if (!e.dataTransfer || typeof document === "undefined") return;
  const ghost = document.createElement("div");
  ghost.style.position = "fixed";
  ghost.style.top = "-9999px";
  ghost.style.left = "-9999px";
  ghost.style.display = "inline-flex";
  ghost.style.alignItems = "center";
  ghost.style.justifyContent = "center";
  ghost.style.padding = "6px 14px";
  ghost.style.borderRadius = "8px";
  ghost.style.backgroundColor = "#18181b";
  ghost.style.color = "#ffffff";
  ghost.style.fontSize = "12px";
  ghost.style.fontWeight = "600";
  ghost.style.border = "1px solid rgba(255,255,255,0.2)";
  ghost.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "9999999";
  ghost.style.whiteSpace = "nowrap";
  ghost.textContent = label;

  document.body.appendChild(ghost);
  const w = ghost.offsetWidth || 100;
  const h = ghost.offsetHeight || 30;
  try {
    e.dataTransfer.setDragImage(ghost, w / 2, h / 2);
  } catch {}
  setTimeout(() => {
    if (document.body.contains(ghost)) {
      document.body.removeChild(ghost);
    }
  }, 0);
}

type Props = {
  s: EditorState;
  set: <K extends keyof EditorState>(
    k: K,
    v: EditorState[K] | ((prev: EditorState[K], prevState: EditorState) => EditorState[K]),
  ) => void;
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
        <GradientSwatchGrid value={gradient} onChange={onChange} />
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
    <div
      className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card"
      style={{ width: 158 }}
    >
      <div className="animate-pulse bg-secondary/70" style={{ width: 158, height: 198 }} />
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
  const { user, isAdmin, isPro, openUpgradeModal } = useAuth();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const handleSelectTemplate = (t: Template) => {
    const isPrem =
      t.is_premium === true ||
      (t as any).category === "premium" ||
      t.id.includes("founder") ||
      t.id.includes("hormozi") ||
      t.id.includes("jasmin") ||
      t.id.includes("viral") ||
      t.id.includes("cyber") ||
      t.id.includes("creator") ||
      t.id.includes("luxury");

    if (isPrem && !isPro && !isAdmin) {
      openUpgradeModal();
      return;
    }

    applyTemplate({ ...t.state, postName: t.label });
    onItemSelect?.();
  };
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
  const [savedUploads, setSavedUploads] = useState<UserUploadItem[]>(getSavedUserUploads);

  useEffect(() => {
    return subscribeUserUploads(setSavedUploads);
  }, []);

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

  const isTemplatePremium = (t: Template) => {
    if (t.category === "premium" || t.is_premium === true) return true;
    if (t.category === "starter" || t.is_premium === false) return false;
    return (
      t.id.startsWith("premium-") ||
      t.id.includes("founder") ||
      t.id.includes("hormozi") ||
      t.id.includes("jasmin") ||
      t.id.includes("viral") ||
      t.id.includes("cyber") ||
      t.id.includes("creator") ||
      t.id.includes("luxury")
    );
  };

  const starterTemplates = useMemo(() => {
    return platformTemplates.filter((t) => !isTemplatePremium(t));
  }, [platformTemplates]);

  const premiumTemplates = useMemo(() => {
    return platformTemplates.filter((t) => isTemplatePremium(t));
  }, [platformTemplates]);

  const [starterSearch, setStarterSearch] = useState("");
  const [premiumSearch, setPremiumSearch] = useState("");
  const [savedSearch, setSavedSearch] = useState("");

  const matchesTemplateQuery = (
    item: { label?: string; description?: string; state?: any },
    query: string,
  ) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    if (item.label && item.label.toLowerCase().includes(q)) return true;
    if (item.description && item.description.toLowerCase().includes(q)) return true;
    if (item.state) {
      if (typeof item.state.quote === "string" && item.state.quote.toLowerCase().includes(q))
        return true;
      if (typeof item.state.name === "string" && item.state.name.toLowerCase().includes(q))
        return true;
      if (typeof item.state.tagline === "string" && item.state.tagline.toLowerCase().includes(q))
        return true;
      if (Array.isArray(item.state.texts)) {
        if (
          item.state.texts.some(
            (txt: any) =>
              (typeof txt?.text === "string" && txt.text.toLowerCase().includes(q)) ||
              (typeof txt?.html === "string" && txt.html.toLowerCase().includes(q)),
          )
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const filteredStarterTemplates = useMemo(() => {
    return starterTemplates.filter((t) => matchesTemplateQuery(t, starterSearch));
  }, [starterTemplates, starterSearch]);

  const filteredPremiumTemplates = useMemo(() => {
    return premiumTemplates.filter((t) => matchesTemplateQuery(t, premiumSearch));
  }, [premiumTemplates, premiumSearch]);

  const filteredSavedQuotes = useMemo(() => {
    return userSavedQuotes.filter((q) =>
      matchesTemplateQuery(
        {
          label: q.title,
          description: `Saved ${new Date(q.created_at).toLocaleDateString()}`,
          state: q.state,
        },
        savedSearch,
      ),
    );
  }, [userSavedQuotes, savedSearch]);

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
        onTemplateCategoryChange?.("saved" as any);
      } else if (cat === "premium") {
        onTemplateCategoryChange?.("premium");
      } else if (cat === "starter") {
        onTemplateCategoryChange?.("starter");
      }
    };
    const handleOpenPremium = () => {
      onTemplateCategoryChange?.("premium");
    };
    window.addEventListener("postinseconds:template-saved", handleTemplateSaved);
    window.addEventListener("postinseconds:open-premium-templates", handleOpenPremium);
    return () => {
      window.removeEventListener("postinseconds:template-saved", handleTemplateSaved);
      window.removeEventListener("postinseconds:open-premium-templates", handleOpenPremium);
    };
  }, [onTemplateCategoryChange]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeletingSaved, setIsDeletingSaved] = useState(false);

  const handleDeleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const [gradStart, setGradStart] = useState("#6366f1");
  const [gradEnd, setGradEnd] = useState("#ec4899");
  const [gradMid, setGradMid] = useState("#a855f7");
  const [useMid, setUseMid] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [shadowThemeFilter, setShadowThemeFilter] = useState<"black" | "white">("black");
  // Collapse state for the Elements tab's three sub-sections (Lines,
  // Shapes, Shadows & Highlights) — declared up here with every other
  // hook in this component (not inside the `tab === "elements"` branch
  // that renders them) for the same Rules-of-Hooks reason as
  // shadowThemeFilter above: every hook has to run on every render
  // regardless of which `tab` is active.
  const [elementsFramesOpen, setElementsFramesOpen] = useState(true);
  const [elementsLinesOpen, setElementsLinesOpen] = useState(true);
  const [elementsShapesOpen, setElementsShapesOpen] = useState(true);
  const [elementsShadowsOpen, setElementsShadowsOpen] = useState(true);
  // Full Google Fonts catalog (~1,900 families beyond the curated FONTS
  // list) for the Text tab's Font Family dropdown — loaded lazily once
  // that tab is actually open, not on mount, so pages that never touch
  // the Text tab never pay for the chunk. See loadGoogleFontsCatalog in
  // types.ts; declared up here (not inside `tab === "text"`) for the same
  // Rules-of-Hooks reason as the state above.
  const [fontCatalog, setFontCatalog] = useState<FontOption[] | null>(null);
  const { options: customFontOptions } = useCustomFonts();
  const [customFontsDialogOpen, setCustomFontsDialogOpen] = useState(false);
  // Fonts already used elsewhere in the current design — see
  // getCanvasFontsInUse's own comment in types.ts. Recomputed whenever the
  // font-bearing fields it reads change; the `pool` it resolves labels
  // against is the same one the picker itself searches, so a canvas font's
  // display label always matches what the rest of the app calls it.
  const canvasFontsInUse = useMemo(
    () => getCanvasFontsInUse(s, getFontPool(fontCatalog, customFontOptions)),
    [
      s.quote,
      s.quoteFont,
      s.name,
      s.authorFont,
      s.tagline,
      s.taglineFont,
      s.showTopButton,
      s.topButtonText,
      s.topButtonFont,
      s.texts,
      fontCatalog,
      customFontOptions,
    ],
  );
  useEffect(() => {
    if (tab !== "text" || fontCatalog) return;
    let cancelled = false;
    loadGoogleFontsCatalog().then((list) => {
      if (!cancelled) setFontCatalog(list);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, fontCatalog]);
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

  useEffect(() => {
    const handleResetCanvas = () => {
      setGradStart("#6366f1");
      setGradEnd("#ec4899");
      setGradMid("#a855f7");
      setUseMid(false);
      setGradAngle(135);
      setGradType("linear");
    };
    window.addEventListener("postinseconds:reset-canvas", handleResetCanvas);
    return () => window.removeEventListener("postinseconds:reset-canvas", handleResetCanvas);
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

  // Picking a curated/gallery preset also populates the Custom Gradient
  // studio's own fields, letting the user fine-tune it with the same
  // controls instead of the studio staying stuck on whatever it last
  // showed. This used to only match one exact shape (a positive-angle,
  // hex-only, EXACTLY-3-stop linear gradient) via regex — which silently
  // failed (and left the studio unchanged) for the vast majority of the
  // 200+-gradient gallery: plain 2-stop gradients, negative angles
  // (several webgradients entries use e.g. -20deg/-225deg), radial
  // gradients, rgb()-based ones (COSINE_PALETTES), and anything with more
  // than 3 real stops. parseGradientCss/reduceGradientStops handle all of
  // that generally instead of one narrow hand-written shape.
  const applyCuratedGradientToStudio = (value: string) => {
    const parsed = parseGradientCss(value);
    if (!parsed) return;
    const { start, mid, end } = reduceGradientStops(parsed.stops);
    setGradType(parsed.type);
    if (parsed.type === "linear") setGradAngle(parsed.angle);
    setGradStart(start);
    setGradEnd(end);
    setUseMid(mid !== undefined);
    setGradMid(mid ?? "#a855f7");
  };

  // Keeps Create Custom Gradient in sync with s.background from ANY
  // source — not just clicks on this panel's own "Curated Gradients" grid
  // (applyCuratedGradientToStudio's original one caller). The toolbar's
  // own Gradient picker (BackgroundSelectionToolbar) sets s.background
  // directly and has no idea this separate studio's local state exists;
  // without watching s.background itself, picking a gradient from there
  // left this studio showing whatever it last had, same "doesn't show in
  // Custom" bug as before, just from a different entry point. Skipped when
  // s.background already equals customGradValue — that means the change
  // just came from this studio's own Apply button, so re-parsing would be
  // a pointless (if harmless) round trip.
  useEffect(() => {
    if (s.background.includes("gradient") && s.background !== customGradValue) {
      applyCuratedGradientToStudio(s.background);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.background]);

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
      ? (textLayersList.find((t) => t.id === selectedTextSel.id) ?? null)
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
    set("texts", (_, prevS) =>
      withTextUpdated(prevS, layer.id, {
        size: newSize,
        ...(nextWidth !== undefined ? { width: nextWidth } : {}),
        ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
      }),
    );
  });
  const fontSizeIncHold = useHoldRepeat(() => {
    const layer = activeTextLayerForSizeStepper;
    if (!layer) return;
    const newSize = Math.min(300, (layer.size || 32) + 2);
    const ratio = newSize / (layer.size || 32);
    const nextWidth = layer.width ? Math.round(Math.max(40, layer.width * ratio)) : undefined;
    const nextMinHeight = layer.minHeight ? Math.round(layer.minHeight * ratio) : undefined;
    set("texts", (_, prevS) =>
      withTextUpdated(prevS, layer.id, {
        size: newSize,
        ...(nextWidth !== undefined ? { width: nextWidth } : {}),
        ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
      }),
    );
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
  const dragStateRef = useRef<{ startIndex: number; startY: number; rowPitch: number } | null>(
    null,
  );
  const [multiSelectMode, setMultiSelectMode] = useState(false);

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
            {templatesLoading ? (
              <span className="h-3.5 w-4 animate-pulse rounded-full bg-secondary" />
            ) : (
              <span className="rounded-full bg-secondary px-1.5 py-0.2 text-[9px] text-muted-foreground">
                {starterSearch ? filteredStarterTemplates.length : starterTemplates.length}
              </span>
            )}
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
            {templatesLoading ? (
              <span className="h-3.5 w-4 animate-pulse rounded-full bg-amber-500/15" />
            ) : (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                {premiumSearch ? filteredPremiumTemplates.length : premiumTemplates.length}
              </span>
            )}
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
            {templatesLoading ? (
              <span className="h-3.5 w-4 animate-pulse rounded-full bg-primary/10" />
            ) : (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[9px] font-bold text-primary">
                {savedSearch ? filteredSavedQuotes.length : userSavedQuotes.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: FREE / STARTER TEMPLATES */}
        {activeCategory === "starter" ? (
          <Panel title="Free Templates">
            {/* Search Bar for Free Templates */}
            <div className="relative mb-3">
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-muted-foreground">
                  <Search01Icon size={15} />
                </span>
                <input
                  type="text"
                  value={starterSearch}
                  onChange={(e) => setStarterSearch(e.target.value)}
                  placeholder="Search free templates..."
                  className="h-9 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground/70 transition-all focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                />
                {starterSearch ? (
                  <button
                    type="button"
                    onClick={() => setStarterSearch("")}
                    className="absolute right-2.5 grid h-5 w-5 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                    title="Clear search"
                  >
                    <Cancel01Icon size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Select any starter template to edit
              </span>
              {templatesLoading ? (
                <span className="h-4 w-16 animate-pulse rounded-full bg-secondary" />
              ) : (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  {filteredStarterTemplates.length} templates
                </span>
              )}
            </div>

            {filteredStarterTemplates.length === 0 && !templatesLoading ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
                <Search01Icon size={24} className="text-muted-foreground/40" />
                <p className="mt-2 text-xs font-semibold text-foreground">No templates found</p>
                <p className="mt-1 px-4 text-[11px] text-muted-foreground">
                  No free templates match "{starterSearch}".
                </p>
                <button
                  type="button"
                  onClick={() => setStarterSearch("")}
                  className="mt-3 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="columns-2 gap-3 [column-fill:_balance]">
                {templatesLoading
                  ? Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="mb-3 inline-block w-full break-inside-avoid">
                      <TemplateCardSkeleton />
                    </div>
                  ))
                  : filteredStarterTemplates.map((t) => (
                    <div key={t.id} className="mb-3 inline-block w-full break-inside-avoid">
                      <TemplatePreview
                        template={t}
                        width={158}
                        onClick={() => handleSelectTemplate(t)}
                      />
                    </div>
                  ))}
              </div>
            )}
          </Panel>
        ) : null}

        {/* TAB 2: PREMIUM PRO TEMPLATES */}
        {activeCategory === "premium" ? (
          <Panel title="Premium Templates">
            {/* PRO Status or Upgrade CTA Banner */}
            {isPro || isAdmin ? (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-500 shadow-xs">
                <div className="flex items-center gap-1.5">
                  <Crown03Icon size={15} className="text-amber-500 shrink-0" />
                  <span className="font-bold">PRO Member Unlocked</span>
                </div>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  Full Access
                </span>
              </div>
            ) : (
              <div className="mb-3 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent p-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500 dark:text-amber-400">
                    <Crown03Icon size={16} />
                    <span>PRO Creator Templates</span>
                  </div>
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.2 text-[9px] font-black uppercase text-amber-500">
                    Paid Only
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  Upgrade & apply, customize, and export all premium templates.
                </p>
                <button
                  type="button"
                  onClick={openUpgradeModal}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-xs font-bold text-amber-950 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
                >
                  <Crown03Icon size={14} />
                  <span>Unlock All Premium Templates</span>
                </button>
              </div>
            )}

            {/* Search Bar for Premium Templates */}
            <div className="relative mb-3">
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-muted-foreground">
                  <Search01Icon size={15} />
                </span>
                <input
                  type="text"
                  value={premiumSearch}
                  onChange={(e) => setPremiumSearch(e.target.value)}
                  placeholder="Search premium templates..."
                  className="h-9 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground/70 transition-all focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                />
                {premiumSearch ? (
                  <button
                    type="button"
                    onClick={() => setPremiumSearch("")}
                    className="absolute right-2.5 grid h-5 w-5 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                    title="Clear search"
                  >
                    <Cancel01Icon size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Curated high-converting viral layouts
              </span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                {filteredPremiumTemplates.length} templates
              </span>
            </div>

            {filteredPremiumTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
                <Search01Icon size={24} className="text-muted-foreground/40" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  {premiumSearch ? "No premium templates found" : "No premium templates yet"}
                </p>
                <p className="mt-1 px-4 text-[11px] text-muted-foreground">
                  {premiumSearch
                    ? `No premium templates match "${premiumSearch}".`
                    : "Publish one from the Admin dashboard to see it here."}
                </p>
                {premiumSearch ? (
                  <button
                    type="button"
                    onClick={() => setPremiumSearch("")}
                    className="mt-3 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
                  >
                    Clear Search
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="columns-2 gap-3 [column-fill:_balance]">
                {filteredPremiumTemplates.map((t) => (
                  <div key={t.id} className="mb-3 inline-block w-full break-inside-avoid">
                    <TemplatePreview
                      template={t}
                      width={158}
                      onClick={() => handleSelectTemplate(t)}
                    />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        ) : null}

        {/* TAB 3: MY SAVED TEMPLATES */}
        {activeCategory === ("saved" as any) ? (
          <Panel title="My Saved Templates">
            {/* Search Bar for Saved Templates */}
            <div className="relative mb-3">
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-muted-foreground">
                  <Search01Icon size={15} />
                </span>
                <input
                  type="text"
                  value={savedSearch}
                  onChange={(e) => setSavedSearch(e.target.value)}
                  placeholder="Search saved templates..."
                  className="h-9 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-8 text-xs text-foreground placeholder:text-muted-foreground/70 transition-all focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                />
                {savedSearch ? (
                  <button
                    type="button"
                    onClick={() => setSavedSearch("")}
                    className="absolute right-2.5 grid h-5 w-5 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                    title="Clear search"
                  >
                    <Cancel01Icon size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mb-3 space-y-2 border-b border-border/60 pb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Your personal saved designs</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {filteredSavedQuotes.length} saved
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
                      await updateSavedQuoteDesign(
                        activeSavedQuote.id,
                        activeSavedQuote.title,
                        s,
                        user?.id,
                      );
                      await loadSavedQuotes();
                      setUpdatingId(null);
                      setUpdatedId(activeSavedQuote.id);
                      setTimeout(() => setUpdatedId(null), 2200);
                    }}
                    disabled={updatingId === activeSavedQuote.id}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-amber-950 shadow-md transition-all hover:bg-amber-400 active:scale-95 disabled:opacity-50"
                  >
                    <Bookmark01Icon size={14} />
                    <span>
                      {updatedId === activeSavedQuote.id
                        ? "✓ Saved!"
                        : updatingId === activeSavedQuote.id
                          ? "Saving..."
                          : "Save Update"}
                    </span>
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
                  Design your quote and click "+ Save Canvas as New Template" above to reuse it
                  anytime!
                </p>
              </div>
            ) : filteredSavedQuotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
                <Search01Icon size={24} className="text-muted-foreground/40" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  No saved templates found
                </p>
                <p className="mt-1 px-4 text-[11px] text-muted-foreground">
                  No saved templates match "{savedSearch}".
                </p>
                <button
                  type="button"
                  onClick={() => setSavedSearch("")}
                  className="mt-3 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="columns-2 gap-3 [column-fill:_balance]">
                {filteredSavedQuotes.map((q) => (
                  <div
                    key={q.id}
                    className="group relative mb-3 inline-block w-full break-inside-avoid"
                  >
                    <TemplatePreview
                      template={{
                        id: q.id,
                        label: q.title,
                        description: `Saved ${new Date(q.created_at).toLocaleDateString()}`,
                        state: q.state,
                      }}
                      width={158}
                      onClick={() => {
                        applyTemplate({ ...q.state, postName: q.title });
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

        <CustomFontsDialog
          open={customFontsDialogOpen}
          onClose={() => setCustomFontsDialogOpen(false)}
        />

        {/* Delete Saved Template Confirmation Dialog */}
        <Dialog
          open={Boolean(deleteConfirmId)}
          onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        >
          <DialogContent className="sm:max-w-[420px] rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive shadow-sm">
                  <Delete02Icon size={20} />
                </span>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Delete saved template?
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    This action cannot be undone.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">
                "{userSavedQuotes.find((q) => q.id === deleteConfirmId)?.title || "this template"}"
              </span>{" "}
              from your saved library?
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                disabled={isDeletingSaved}
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSaved}
                onClick={async () => {
                  if (!deleteConfirmId) return;
                  setIsDeletingSaved(true);
                  try {
                    await deleteSavedQuote(deleteConfirmId);
                    await loadSavedQuotes();
                    toast.success("Template deleted");
                    setDeleteConfirmId(null);
                  } catch {
                    toast.error("Failed to delete template");
                  } finally {
                    setIsDeletingSaved(false);
                  }
                }}
                className="flex items-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground shadow-md transition-all hover:bg-destructive/90 active:scale-95 disabled:opacity-50"
              >
                <Delete02Icon size={14} />
                <span>{isDeletingSaved ? "Deleting..." : "Delete Template"}</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (tab === "text") {
    const textLayersList = getTextLayers(s);
    const selectedTextSel = selection?.find((sel) => sel.kind === "text");
    const activeTextLayer = selectedTextSel
      ? (textLayersList.find((t) => t.id === selectedTextSel.id) ?? null)
      : textLayersList.length > 0
        ? textLayersList[0]
        : null;

    const DEFAULT_TEXT_COLORS = ["#ffffff", "#0d0d12"];
    const refineTextColorFromCanvas = async (
      textId: string,
      x: number,
      y: number,
      guessedColor: string,
    ) => {
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
          if (data[i + 3] === 0) continue;
          total +=
            ((data[i] ?? 0) * 299 + (data[i + 1] ?? 0) * 587 + (data[i + 2] ?? 0) * 114) / 1000;
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
      } catch { }
    };

    // Waits for the exact font/weight/size a new preset text is about to
    // render with to actually be ready before the layer is ever added —
    // without this, the layer would render for one frame in whatever
    // fallback font the browser has on hand (its default sans-serif is
    // usually wider than Outfit), then visibly reflow/un-wrap once the
    // real webfont's stylesheet+file finish loading and the browser swaps
    // it in.
    const ensureFontReady = async (fontFamily: string, weight: number, size: number) => {
      loadGoogleFont(fontFamily);
      if (typeof document === "undefined" || !("fonts" in document)) return;
      try {
        await Promise.race([
          document.fonts.load(`${weight} ${size}px ${fontFamily}`),
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]);
      } catch { }
    };

    const measureSingleLineWidth = (
      text: string,
      weight: number,
      size: number,
    ): number | undefined => {
      if (typeof document === "undefined") return undefined;
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return undefined;
        ctx.font = `${weight} ${size}px "Outfit", sans-serif`;
        const measured = ctx.measureText(text).width;
        if (!Number.isFinite(measured) || measured <= 0) return undefined;
        const withMargin = Math.ceil(measured) + 16;
        return Math.min(withMargin, Math.round(s.width * 0.92));
      } catch {
        return undefined;
      }
    };

    const addPresetText = async (preset: {
      text: string;
      size: number;
      weight: number;
      kind: "heading" | "subheading" | "body";
      color?: string;
    }) => {
      await ensureFontReady('"Outfit", sans-serif', preset.weight, preset.size);
      const existingTexts = getTextLayers(s);

      let targetY = 50;
      if (preset.kind === "heading") {
        targetY = 42;
      } else if (preset.kind === "subheading") {
        const heading = existingTexts.find((t) => (t.size || 0) >= 70) || existingTexts[0];
        if (heading) {
          const headingHeightPct = ((heading.size || 84) / s.height) * 100;
          targetY = Math.min(85, Math.round(heading.y + headingHeightPct * 1.1 + 2));
        } else {
          targetY = 52;
        }
      } else if (preset.kind === "body") {
        const subheading = existingTexts.find((t) => (t.size || 0) >= 40 && (t.size || 0) < 70);
        const heading = existingTexts.find((t) => (t.size || 0) >= 70);
        const reference = subheading || heading || existingTexts[existingTexts.length - 1];
        if (reference) {
          const refHeightPct = ((reference.size || 52) / s.height) * 100;
          targetY = Math.min(90, Math.round(reference.y + refHeightPct * 1.1 + 2));
        } else {
          targetY = 60;
        }
      }

      const defaultColor = preset.kind === "heading" ? "#000000" : undefined;
      const res = withTextAdded(s, {
        text: preset.text,
        size: preset.size,
        weight: preset.weight,
        ...(defaultColor ? { color: defaultColor } : {}),
        ...(preset.color ? { color: preset.color } : {}),
        x: 50,
        y: targetY,
      });

      set("texts", res.list);
      set("layerOrder", res.layerOrder);
      if (res.newId) {
        onSelectLayer?.({ kind: "text", id: res.newId });
        const added = res.list.find((t) => t.id === res.newId);
        if (added && preset.kind !== "heading")
          void refineTextColorFromCanvas(added.id, added.x, added.y, added.color);
        // Auto start editing, highlight entire text and open virtual keyboard / desktop focus
        const triggerStartEditing = () => {
          const handles = (window as any).__PIX_TEXT_HANDLES__;
          if (handles && typeof handles.get === "function") {
            const h = handles.get(res.newId);
            h?.startEditing?.();
          }
        };
        setTimeout(triggerStartEditing, 40);
        setTimeout(triggerStartEditing, 160);
        setTimeout(triggerStartEditing, 320);
      }
      onItemSelect?.();
    };

    const updateActiveLayer = (patch: Partial<Omit<TextLayer, "id">>) => {
      if (!activeTextLayer) return;
      if (patch.fontFamily) {
        loadGoogleFont(patch.fontFamily);
      }
      set("texts", (_, prevS) => withTextUpdated(prevS, activeTextLayer.id, patch));
    };

    const FONT_WEIGHTS = [
      { label: "Thin (100)", value: 100 },
      { label: "Extra Light (200)", value: 200 },
      { label: "Light (300)", value: 300 },
      { label: "Regular (400)", value: 400 },
      { label: "Medium (500)", value: 500 },
      { label: "SemiBold (600)", value: 600 },
      { label: "Bold (700)", value: 700 },
      { label: "Extra Bold (800)", value: 800 },
      { label: "Black (900)", value: 900 },
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
            <TextEffectsPanel
              layer={activeTextLayer ?? null}
              onChange={updateActiveLayer}
              canvasBg={s.background}
            />
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
                    draggable={true}
                    onDragStart={(e) => {
                      setCrispDragImage(e, "Add a heading");
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          type: "text",
                          text: "Add a heading",
                          size: 84,
                          weight: 700,
                        }),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() =>
                      addPresetText({
                        text: "Add a heading",
                        size: 84,
                        weight: 700,
                        kind: "heading",
                      })
                    }
                    className="group flex w-full cursor-grab active:cursor-grabbing items-center justify-between rounded-xl border border-border/80 bg-secondary/40 px-3.5 py-3 text-left transition-all hover:border-primary hover:bg-secondary hover:shadow-sm"
                    title="Click or drag to canvas"
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
                    draggable={true}
                    onDragStart={(e) => {
                      setCrispDragImage(e, "Add a subheading");
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          type: "text",
                          text: "Add a subheading",
                          size: 52,
                          weight: 600,
                        }),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() =>
                      addPresetText({
                        text: "Add a subheading",
                        size: 52,
                        weight: 600,
                        kind: "subheading",
                      })
                    }
                    className="group flex w-full cursor-grab active:cursor-grabbing items-center justify-between rounded-xl border border-border/80 bg-secondary/40 px-3.5 py-2.5 text-left transition-all hover:border-primary hover:bg-secondary hover:shadow-sm"
                    title="Click or drag to canvas"
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
                    draggable={true}
                    onDragStart={(e) => {
                      setCrispDragImage(e, "Add body text");
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          type: "text",
                          text: "Add a little bit of body text",
                          size: 32,
                          weight: 400,
                        }),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() =>
                      addPresetText({
                        text: "Add a little bit of body text",
                        size: 32,
                        weight: 400,
                        kind: "body",
                      })
                    }
                    className="group flex w-full cursor-grab active:cursor-grabbing items-center justify-between rounded-xl border border-border/80 bg-secondary/40 px-3.5 py-2 text-left transition-all hover:border-primary hover:bg-secondary hover:shadow-sm"
                    title="Click or drag to canvas"
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
                    <p className="text-xs font-bold text-foreground">Selected Text Style</p>
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
                      <FontPickerField
                        value={activeTextLayer.fontFamily}
                        onChange={(v) => {
                          updateActiveLayer({ fontFamily: v });
                          onItemSelect?.();
                        }}
                        catalog={fontCatalog}
                        customFonts={customFontOptions}
                        canvasFonts={canvasFontsInUse}
                        onOpenCustomFonts={() => setCustomFontsDialogOpen(true)}
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
                              const newSize = Math.max(
                                10,
                                Math.min(300, Number(e.target.value) || 32),
                              );
                              const ratio = newSize / (activeTextLayer.size || 32);
                              const nextWidth = activeTextLayer.width
                                ? Math.round(Math.max(40, activeTextLayer.width * ratio))
                                : undefined;
                              const nextMinHeight = activeTextLayer.minHeight
                                ? Math.round(activeTextLayer.minHeight * ratio)
                                : undefined;
                              updateActiveLayer({
                                size: newSize,
                                ...(nextWidth !== undefined ? { width: nextWidth } : {}),
                                ...(nextMinHeight !== undefined
                                  ? { minHeight: nextMinHeight }
                                  : {}),
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
                          options={getAvailableFontWeights(
                            activeTextLayer.fontFamily,
                            fontCatalog,
                            customFontOptions,
                          ).map((w) => ({
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
                        {/* Same 24-color default palette as every other color
                            picker's own Presets grid (ColorSwatchPicker,
                            backed by HEROUI_PALETTES) — this Field used to
                            keep its own separate, shorter 12-color circular
                            QUICK_COLORS list instead of sharing that one,
                            the one spot left still showing round swatches
                            after every other picker had already moved to
                            square ones. */}
                        <ColorSwatchPicker
                          value={activeTextLayer.color}
                          onChange={(c) => {
                            updateActiveLayer({ color: c });
                            onItemSelect?.();
                          }}
                        />
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
                            onClick={() => updateActiveLayer({ italic: !activeTextLayer.italic })}
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
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveLayer({ uppercase: !activeTextLayer.uppercase })
                            }
                            className={cn(
                              "flex flex-1 items-center justify-center rounded-md py-1 text-xs transition-colors",
                              activeTextLayer.uppercase
                                ? "bg-background font-bold text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Uppercase"
                          >
                            <CaseUpper size={14} />
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
          <div className="flex flex-col gap-4">
            <UploadButton
              label="Upload images"
              multiple
              onFiles={(files) => {
                saveUserUploads(files.map((src) => ({ src })));
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
              Upload photos or drag any image file from your computer directly onto the canvas. Click or drag saved images below to place them.
            </p>

            {/* User Uploads Library Gallery */}
            {savedUploads.length > 0 && (
              <div className="flex flex-col gap-2 pt-1 border-t border-border/70">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Upload Library</span>
                  <span className="text-[10px] text-muted-foreground">{savedUploads.length} images</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {savedUploads.map((item) => (
                    <div
                      key={item.id}
                      draggable={true}
                      onDragStart={(e) => {
                        setCrispDragImage(e, "Image");
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ type: "image", src: item.src }),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        const res = withImagesAdded(s, [item.src]);
                        set("images", res.list);
                        set("layerOrder", res.layerOrder);
                        if (res.newIds[0]) {
                          onSelectLayer?.({ kind: "image", id: res.newIds[0] });
                        }
                        onItemSelect?.();
                      }}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-border/80 bg-secondary/40 cursor-grab active:cursor-grabbing hover:border-primary hover:shadow-md transition-all"
                      title="Click to add or drag directly onto canvas"
                    >
                      <img src={item.src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteUserUpload(item.id);
                        }}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-md bg-black/70 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                        title="Delete from upload library"
                      >
                        <Delete02Icon size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Currently on Canvas */}
            {getImageLayers(s).length > 0 ? (
              <div className="flex flex-col gap-2 pt-2 border-t border-border/70">
                <span className="text-xs font-bold text-foreground">Active Canvas Images</span>
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
                      <span className="text-xs font-semibold text-foreground">Image {i + 1}</span>
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
      const rowEl = (e.currentTarget as HTMLElement).closest(
        "[data-layer-row]",
      ) as HTMLElement | null;
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
      dragLayerId === id
        ? { transform: `translateY(${dragDeltaY}px)`, position: "relative", zIndex: 50 }
        : undefined;

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
                {multiSelectMode
                  ? "Tap layers to select or deselect multiple. Use Delete or Deselect All to manage selection."
                  : "Click any layer to select & highlight it on the canvas. Tap Select to pick multiple layers."}
              </p>
            </div>

            {totalCount > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/50 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {selection?.length ? `${selection.length} selected` : "No selection"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {selection && selection.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const result = withMultipleLayersDuplicated(s, selection, { x: 3, y: 3 });
                          set("texts", result.texts);
                          set("images", result.images);
                          set("shapes", result.shapes);
                          set("layerOrder", result.layerOrder);
                          if (result.newSelection.length > 0) {
                            onSelectLayer?.(
                              {
                                kind: result.newSelection[0]!.kind,
                                id: result.newSelection[0]!.id,
                              },
                              { selectAll: false, toggle: false },
                            );
                          }
                        }}
                        className="flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
                        title="Duplicate all selected layers"
                      >
                        <Copy01Icon size={12} />
                        {selection.length}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const result = withMultipleLayersRemoved(s, selection);
                          set("texts", result.texts);
                          set("images", result.images);
                          set("shapes", result.shapes);
                          set("layerOrder", result.layerOrder);
                          onSelectLayer?.(
                            { kind: "text", id: "" },
                            { selectAll: false, toggle: false },
                          );
                        }}
                        className="flex items-center gap-1 rounded-lg bg-destructive/15 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/25"
                        title="Delete all selected layers"
                      >
                        <Delete02Icon size={12} />
                        {selection.length}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      onSelectLayer?.(
                        { kind: "text", id: "" },
                        { selectAll: !allSelected, toggle: false },
                      )
                    }
                    className="flex items-center gap-1 rounded-lg bg-secondary/80 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
                  >
                    <Layers01Icon size={12} />
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMultiSelectMode((m) => !m)}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                      multiSelectMode
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary/80 text-foreground hover:bg-secondary",
                    )}
                    title={multiSelectMode ? "Exit multi-select mode" : "Select multiple layers"}
                  >
                    <CheckmarkCircle02Icon size={12} />
                    <span>{multiSelectMode ? "Done" : "Select"}</span>
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

                  if (kind === "text") {
                    const t = textLayers.find((item) => item.id === id);
                    if (!t) return null;
                    return (
                      <div
                        key={t.id}
                        data-layer-row=""
                        onClick={(e) =>
                          onSelectLayer?.(
                            { kind: "text", id: t.id },
                            { toggle: multiSelectMode || e.shiftKey },
                          )
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
                        {multiSelectMode ? (
                          <div
                            className={cn(
                              "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-all",
                              selected
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-muted-foreground/40 bg-card hover:border-primary",
                            )}
                          >
                            {selected ? <Tick02Icon size={10} className="stroke-[3]" /> : null}
                          </div>
                        ) : (
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
                        )}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            T
                          </span>
                          <span
                            className={cn(
                              "truncate font-medium text-foreground",
                              t.hidden && "line-through text-muted-foreground",
                            )}
                          >
                            {t.text || "Text Layer"}
                          </span>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const { list, newId } = withTextDuplicated(s, t.id);
                              set("texts", list);
                              onSelectLayer?.({ kind: "text", id: newId });
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Duplicate text layer"
                          >
                            <Copy01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("texts", (_, prevS) =>
                                withTextUpdated(prevS, t.id, { hidden: !t.hidden }),
                              )
                            }
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              t.hidden
                                ? "text-amber-500 font-bold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title={t.hidden ? "Show layer" : "Hide layer"}
                          >
                            {t.hidden ? <ViewOffIcon size={13} /> : <ViewIcon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("texts", (_, prevS) =>
                                withTextUpdated(prevS, t.id, { locked: !t.locked }),
                              )
                            }
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              t.locked
                                ? "text-amber-400"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title={t.locked ? "Unlock layer" : "Lock layer"}
                          >
                            {t.locked ? (
                              <SquareLock02Icon size={13} />
                            ) : (
                              <SquareUnlock02Icon size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => set("texts", (_, prevS) => withTextRemoved(prevS, t.id))}
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
                          onSelectLayer?.(
                            { kind: "image", id: img.id },
                            { toggle: multiSelectMode || e.shiftKey },
                          )
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
                        {multiSelectMode ? (
                          <div
                            className={cn(
                              "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-all",
                              selected
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-muted-foreground/40 bg-card hover:border-primary",
                            )}
                          >
                            {selected ? <Tick02Icon size={10} className="stroke-[3]" /> : null}
                          </div>
                        ) : (
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
                        )}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <img
                            src={img.src}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded object-cover"
                          />
                          <span
                            className={cn(
                              "truncate font-medium text-foreground",
                              img.hidden && "line-through text-muted-foreground",
                            )}
                          >
                            Image
                          </span>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const { list, newId } = withImageDuplicated(s, img.id);
                              set("images", list);
                              onSelectLayer?.({ kind: "image", id: newId });
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Duplicate image layer"
                          >
                            <Copy01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("images", (_, prevS) =>
                                withImageUpdated(prevS, img.id, { hidden: !img.hidden }),
                              )
                            }
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              img.hidden
                                ? "text-amber-500 font-bold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title={img.hidden ? "Show layer" : "Hide layer"}
                          >
                            {img.hidden ? <ViewOffIcon size={13} /> : <ViewIcon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("images", (_, prevS) =>
                                withImageUpdated(prevS, img.id, { locked: !img.locked }),
                              )
                            }
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              img.locked
                                ? "text-amber-400"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title={img.locked ? "Unlock layer" : "Lock layer"}
                          >
                            {img.locked ? (
                              <SquareLock02Icon size={13} />
                            ) : (
                              <SquareUnlock02Icon size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("images", (_, prevS) => withImageRemoved(prevS, img.id))
                            }
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
                          onSelectLayer?.(
                            { kind: "shape", id: sh.id },
                            { toggle: multiSelectMode || e.shiftKey },
                          )
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
                        {multiSelectMode ? (
                          <div
                            className={cn(
                              "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-all",
                              selected
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-muted-foreground/40 bg-card hover:border-primary",
                            )}
                          >
                            {selected ? <Tick02Icon size={10} className="stroke-[3]" /> : null}
                          </div>
                        ) : (
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
                        )}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <div
                            className="h-5 w-5 shrink-0 border border-border/80"
                            style={{
                              background:
                                sh.style === "gradient"
                                  ? (sh.gradient ??
                                    "linear-gradient(135deg, #ffffff 0%, #ede9fe 100%)")
                                  : sh.style === "outline"
                                    ? "transparent"
                                    : sh.color,
                              borderColor: sh.style === "outline" ? sh.color : undefined,
                              ...shapeCss(sh.kind, sh.radius >= 80 ? 999 : Math.min(sh.radius, 8)),
                            }}
                          />
                          <span
                            className={cn(
                              "truncate font-medium capitalize text-foreground",
                              sh.hidden && "line-through text-muted-foreground",
                            )}
                          >
                            {label}
                          </span>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const { list, newId } = withShapeDuplicated(s, sh.id);
                              set("shapes", list);
                              onSelectLayer?.({ kind: "shape", id: newId });
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Duplicate shape layer"
                          >
                            <Copy01Icon size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("shapes", (_, prevS) =>
                                withShapeUpdated(prevS, sh.id, { hidden: !sh.hidden }),
                              )
                            }
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              sh.hidden
                                ? "text-amber-500 font-bold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title={sh.hidden ? "Show layer" : "Hide layer"}
                          >
                            {sh.hidden ? <ViewOffIcon size={13} /> : <ViewIcon size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set("shapes", (_, prevS) =>
                                withShapeUpdated(prevS, sh.id, { locked: !sh.locked }),
                              )
                            }
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                              sh.locked
                                ? "text-amber-400"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title={sh.locked ? "Unlock layer" : "Lock layer"}
                          >
                            {sh.locked ? (
                              <SquareLock02Icon size={13} />
                            ) : (
                              <SquareUnlock02Icon size={13} />
                            )}
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
            Font, size, weight, color and alignment now live on each individual text layer's own
            card -- click any text directly on the canvas to select it, or manage every text layer
            from the Elements tab.
          </p>
        </Panel>
      </>
    );
  }

  if (tab === "elements") {
    const selectedShapeSel = selection?.find((sel) => sel.kind === "shape");
    const activeShapeLayer = selectedShapeSel
      ? (getShapeLayers(s).find((sh) => sh.id === selectedShapeSel.id) ?? null)
      : null;

    const displayedShadows = SHADOW_OVERLAY_PRESETS.filter(
      (preset) => (preset.theme ?? "black") === shadowThemeFilter,
    );

    return (
      <>
        <Panel title="Elements">
          <div className="flex flex-col gap-5">
            {/* 1. Image Frames (Canva style) */}
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/30 p-3">
              <button
                type="button"
                onClick={() => setElementsFramesOpen((o) => !o)}
                className="flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-foreground">Frames</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {FRAME_PRESETS.length} frames
                  </span>
                  <ArrowDown01Icon
                    size={14}
                    className={cn(
                      "text-muted-foreground transition-transform duration-200",
                      elementsFramesOpen ? "rotate-180 text-foreground" : "text-muted-foreground",
                    )}
                  />
                </div>
              </button>
              {elementsFramesOpen ? (
                <>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Mask photos into custom shapes. Click to add a frame, then upload or replace
                    with your own photo.
                  </p>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {FRAME_PRESETS.map((preset) => {
                      const frameStyle = frameShapeCss(preset.kind, 8);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          draggable={true}
                          onDragStart={(e) => {
                            setCrispDragImage(e, preset.label || "Frame");
                            e.dataTransfer.setData(
                              "application/json",
                              JSON.stringify({
                                type: "frame",
                                frameKind: preset.kind,
                              }),
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => {
                            const res = withFrameAdded(s, preset.kind);
                            set("images", res.list);
                            set("layerOrder", res.layerOrder);
                            if (res.newId) {
                              onSelectLayer?.({ kind: "image", id: res.newId });
                            }
                            onItemSelect?.();
                          }}
                          title={preset.label}
                          className="group relative flex aspect-square cursor-grab active:cursor-grabbing items-center justify-center rounded-xl border border-border/80 bg-card/60 p-1.5 shadow-sm transition-all hover:scale-105 hover:border-primary hover:bg-secondary"
                        >
                          <div
                            className="h-full w-full overflow-hidden"
                            style={{
                              ...frameStyle,
                            }}
                          >
                            <img
                              src={CANVA_FRAME_PLACEHOLDER_SRC}
                              alt={preset.label}
                              className="h-full w-full object-cover transition-transform group-hover:scale-110"
                              draggable={false}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>

            {/* 2. Lines */}
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/30 p-3">
              <button
                type="button"
                onClick={() => setElementsLinesOpen((o) => !o)}
                className="flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-foreground">Lines</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {LINE_PRESETS.length} styles
                  </span>
                  <ArrowDown01Icon
                    size={14}
                    className={cn(
                      "text-muted-foreground transition-transform duration-200",
                      elementsLinesOpen ? "rotate-180 text-foreground" : "text-muted-foreground",
                    )}
                  />
                </div>
              </button>
              {elementsLinesOpen ? (
                <>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Solid, dashed, arrows, and decorative marker lines for dividers and accents.
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {LINE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        draggable={true}
                        onDragStart={(e) => {
                          setCrispDragImage(e, preset.label || "Line");
                          e.dataTransfer.setData(
                            "application/json",
                            JSON.stringify({
                              type: "shape",
                              kind: preset.kind,
                              radius: 0,
                            }),
                          );
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => {
                          const res = withShapeAdded(s, preset.kind, 0);
                          set("shapes", res.list);
                          set("layerOrder", res.layerOrder);
                          if (res.newId) {
                            onSelectLayer?.({ kind: "shape", id: res.newId });
                          }
                          onItemSelect?.();
                        }}
                        title={preset.label}
                        className="flex h-11 cursor-grab active:cursor-grabbing items-center justify-center rounded-xl border border-border/80 bg-card/90 px-3 text-foreground shadow-sm transition-all hover:scale-105 hover:border-primary/60 hover:bg-secondary hover:text-primary"
                      >
                        <LineShapeSvg kind={preset.kind} strokeWidth={2.5} preserveAspect={true} />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            {/* 2. Geometric Shapes */}
            <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/30 p-3">
              <button
                type="button"
                onClick={() => setElementsShapesOpen((o) => !o)}
                className="flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-foreground">Shapes</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {SHAPE_PRESETS.length} shapes
                  </span>
                  <ArrowDown01Icon
                    size={14}
                    className={cn(
                      "text-muted-foreground transition-transform duration-200",
                      elementsShapesOpen ? "rotate-180 text-foreground" : "text-muted-foreground",
                    )}
                  />
                </div>
              </button>
              {elementsShapesOpen ? (
                <>
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
                          draggable={true}
                          onDragStart={(e) => {
                            setCrispDragImage(e, preset.label || "Shape");
                            e.dataTransfer.setData(
                              "application/json",
                              JSON.stringify({
                                type: "shape",
                                kind: preset.kind,
                                radius: preset.radius,
                              }),
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }}
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
                          className="flex aspect-square cursor-grab active:cursor-grabbing items-center justify-center rounded-lg border border-border bg-secondary/60 p-2 text-muted-foreground transition-all hover:scale-105 hover:border-primary hover:bg-secondary hover:text-foreground"
                        >
                          <span
                            className="block h-full w-full"
                            style={{
                              background: "currentColor",
                              ...shapeCss(preset.kind, previewRadius),
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>

            {/* 2. Shadows & Highlights (Under Shapes) */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/30 p-3">
              <button
                type="button"
                onClick={() => setElementsShadowsOpen((o) => !o)}
                className="flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-foreground">Shadows & Highlights</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {displayedShadows.length} presets
                  </span>
                  <ArrowDown01Icon
                    size={14}
                    className={cn(
                      "text-muted-foreground transition-transform duration-200",
                      elementsShadowsOpen ? "rotate-180 text-foreground" : "text-muted-foreground",
                    )}
                  />
                </div>
              </button>
              {elementsShadowsOpen ? (
                <>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Gradient overlays, dark vignettes, and ground drop shadows to enhance
                    readability and contrast.
                  </p>

                  {/* Black & White Filter Tabs */}
                  <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 bg-background/60 p-1">
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
                      <span>Black Shadows</span>
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
                      <span>White Highlights</span>
                    </button>
                  </div>

                  {/* Active Shadow Inspector (if a gradient shape is active) */}
                  {activeShapeLayer && activeShapeLayer.style === "gradient" ? (
                    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-primary">
                          Active Shadow Controls
                        </span>
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
                          <span className="font-mono text-foreground">
                            {activeShapeLayer.opacity}%
                          </span>
                        </div>
                        <Range
                          min={5}
                          max={100}
                          value={activeShapeLayer.opacity}
                          onChange={(v) =>
                            set("shapes", (_, prevS) =>
                              withShapeUpdated(prevS, activeShapeLayer.id, { opacity: v }),
                            )
                          }
                        />

                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                "layerOrder",
                                (_, prevS) =>
                                  withUnifiedLayerReordered(prevS, activeShapeLayer.id, "up")
                                    .layerOrder,
                              )
                            }
                            className="flex items-center justify-center rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary"
                            title="Bring Forward"
                          >
                            Forward ↑
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              set(
                                "layerOrder",
                                withUnifiedLayerReordered(s, activeShapeLayer.id, "down")
                                  .layerOrder,
                              )
                            }
                            className="flex items-center justify-center rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary"
                            title="Send Backward"
                          >
                            Backward ↓
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
                            Flip ⇅
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
                            "group relative flex aspect-square w-full flex-col justify-end overflow-hidden rounded-xl border shadow-xs transition-all hover:scale-105 hover:border-primary hover:shadow-lg active:scale-95",
                            isWhite
                              ? "border-zinc-800 bg-[#0c0d12] hover:bg-[#181a20]"
                              : "border-zinc-300/80 bg-[#ffffff] hover:bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-100",
                          )}
                        >
                          {/* Shadow / Glow Overlay */}
                          <div
                            className="pointer-events-none absolute inset-0 transition-transform duration-200 group-hover:scale-105"
                            style={{
                              background: preset.gradient,
                              opacity: (preset.opacity ?? 90) / 100,
                            }}
                          />

                          {/* Subtle Inner Glow Ring */}
                          <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/5" />

                          {/* Label on bottom */}
                          <div className="relative z-10 w-full bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 pt-3 text-left">
                            <span className="block truncate text-[9px] font-semibold text-white drop-shadow-xs">
                              {preset.label}
                            </span>
                          </div>

                          {/* Pixel-perfect Centered Hover Plus Icon */}
                          <span className="absolute right-1.5 top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                            <Add01Icon size={10} className="shrink-0" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
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
          {/* Same 24-color default palette as every other color picker's
              own Presets grid (ColorSwatchPicker, backed by
              HEROUI_PALETTES) — this panel used to keep its own separate,
              shorter 12-color list instead of sharing that one. */}
          <ColorSwatchPicker
            value={s.background.startsWith("#") ? s.background : "#ffffff"}
            onChange={(v) => {
              set("background", v);
              set("bgImage", null);
              onItemSelect?.();
            }}
          />
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
                  {((s.bgImageZoom ?? 100) !== 100 ||
                    (s.bgImagePosX ?? 50) !== 50 ||
                    (s.bgImagePosY ?? 50) !== 50) && (
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
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Quick align:
                  </span>
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
                  setGradStart("#6366f1");
                  setGradEnd("#ec4899");
                  setGradMid("#a855f7");
                  setUseMid(false);
                  setGradAngle(135);
                  setGradType("linear");
                }}
                className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                title="Reset gradient builder to default"
              >
                <ReloadIcon size={11} />
                <span>Reset</span>
              </button>
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

          <Toggle checked={useMid} onChange={setUseMid} label="Add 3rd accent color stop" />
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
        <GradientSwatchGrid
          value={!s.bgImage ? s.background : undefined}
          onChange={(v) => {
            set("background", v);
            set("bgImage", null);
            applyCuratedGradientToStudio(v);
            onItemSelect?.();
          }}
        />
      </Panel>
    </>
  );
}
