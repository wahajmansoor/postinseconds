import DOMPurify from "dompurify";

// Sanitizes rich text HTML before it's ever rendered via
// dangerouslySetInnerHTML (TextLayer.html — per-selection bold/italic/
// underline/strike from the highlight-to-style popover). This is a real
// stored-XSS surface: that HTML can come from a saved design or template
// loaded from Supabase, not just from this session's own editing, so it
// has to be sanitized on every render, not only right after editing.
// Deliberately a strict allowlist (a handful of formatting tags + a
// handful of CSS properties on `style`) rather than a blocklist — nothing
// unrecognized survives, including anything execCommand happens to emit
// that isn't in the list. DOMPurify needs a real DOM, so this only runs in
// the browser; server-side (or any environment without `window`) it
// returns "" and callers fall back to the plain-text `text` field instead
// of ever rendering unsanitized HTML.
// `ul`/`ol`/`li` support the text-selection toolbar's bullet/numbered list
// buttons. `list-style-type`/`padding-left`/`margin` are allowed on `style`
// specifically so those render correctly — Tailwind's Preflight resets
// `ul, ol { list-style: none; margin: 0; padding: 0 }` globally, so
// without an explicit inline override here every list would render with no
// markers and no indent. QuoteCanvas sets that inline style itself right
// after execCommand builds the list (see applyFormat) precisely so it
// survives being captured into `t.html` and re-sanitized on every render.
// `font-family`/`font-size` support the toolbar's font/size controls
// applying to just a highlighted range (via applyStyleSmart in
// QuoteCanvas.tsx) instead of the whole layer.
const RICH_TEXT_ALLOWED_TAGS = [
  "b", "strong", "i", "em", "u", "strike", "s", "del", "span", "font", "br", "div", "p", "ul", "ol", "li",
];
const RICH_TEXT_ALLOWED_ATTR = ["style", "color"];
const RICH_TEXT_ALLOWED_STYLE_PROPS = new Set([
  "color", "font-weight", "font-style", "text-decoration", "list-style-type", "padding-left", "margin",
  "font-family", "font-size", "letter-spacing", "line-height", "display", "text-transform",
]);
let richTextHooksReady = false;

export function sanitizeTextHtml(raw: string): string {
  if (typeof window === "undefined") return "";
  if (!richTextHooksReady) {
    richTextHooksReady = true;
    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
      if (data.attrName !== "style") return;
      const normalized = data.attrValue.replace(/&quot;/g, "'").replace(/"/g, "'");
      data.attrValue = normalized
        .split(";")
        .map((decl) => decl.trim())
        .filter(Boolean)
        .filter((decl) => {
          const colonIdx = decl.indexOf(":");
          if (colonIdx === -1) return false;
          const prop = decl.slice(0, colonIdx).trim().toLowerCase();
          return RICH_TEXT_ALLOWED_STYLE_PROPS.has(prop);
        })
        .join("; ");
    });
  }
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
  });
  let stripped = clean;
  while (/<(span|b|i|u|s)\b[^>]*>\s*<\/\1>/i.test(stripped)) {
    stripped = stripped.replace(/<(span|b|i|u|s)\b[^>]*>\s*<\/\1>/gi, "");
  }
  return stripped;
}

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  if (hex.startsWith("rgba")) {
    return hex.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
  }
  if (hex.startsWith("rgb")) {
    return hex.replace(/rgb\(([^)]+)\)/, `rgba($1, ${alpha})`);
  }
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type CanvasPreset = { label: string; w: number; h: number };

export const CANVAS_PRESETS: CanvasPreset[] = [
  { label: "1:1", w: 1200, h: 1200 },
  { label: "4:5", w: 1200, h: 1500 },
  { label: "5:4", w: 1500, h: 1200 },
  { label: "3:4", w: 1200, h: 1600 },
  { label: "9:16", w: 1080, h: 1920 },
  { label: "16:9", w: 1920, h: 1080 },
];

export const GRADIENTS = [
  { label: "Violet Dusk", value: "linear-gradient(180deg, #0b0616 0%, #6d28d9 60%, #7c3aed 100%)" },
  { label: "Ember", value: "linear-gradient(140deg, #1a1a1a 0%, #7c2d12 55%, #e85d3a 100%)" },
  { label: "Ocean", value: "linear-gradient(160deg, #0c2340 0%, #1a4a6e 55%, #5cbdb9 100%)" },
  { label: "Mint", value: "linear-gradient(200deg, #0d1b2a 0%, #1b4332 60%, #2dd4a8 100%)" },
  { label: "Sunset", value: "linear-gradient(135deg, #ff6b35 0%, #e84393 55%, #6c5ce7 100%)" },
  { label: "Noir", value: "linear-gradient(160deg, #050608 0%, #12141a 50%, #20242f 100%)" },
  { label: "Frost", value: "linear-gradient(160deg, #e8f0f8 0%, #b8d4e8 55%, #2e6b8a 100%)" },
  { label: "Blush", value: "linear-gradient(150deg, #f8e8ee 0%, #c9a0dc 60%, #9b72cf 100%)" },
  { label: "Cyberpunk", value: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" },
  { label: "Velvet Rose", value: "linear-gradient(145deg, #2b091f 0%, #831843 50%, #f43f5e 100%)" },
  { label: "Emerald", value: "linear-gradient(155deg, #052e16 0%, #065f46 55%, #10b981 100%)" },
  { label: "Cosmic Aurora", value: "linear-gradient(140deg, #030712 0%, #1e1b4b 45%, #0284c7 100%)" },
  { label: "Royal Sapphire", value: "linear-gradient(150deg, #0f172a 0%, #1e3a8a 50%, #3b82f6 100%)" },
  { label: "Sunset Flare", value: "linear-gradient(135deg, #31102f 0%, #9f1239 50%, #fb923c 100%)" },
  { label: "Golden Luxury", value: "linear-gradient(145deg, #1c1917 0%, #78350f 50%, #f59e0b 100%)" },
  { label: "Clean Minimal", value: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)" },
];

export type FontOption = {
  label: string;
  value: string;
  category?: "sans" | "serif" | "mono" | "display" | "handwriting";
};

export const FONTS: FontOption[] = [
  // Top Modern Sans-Serif (25)
  { label: "Outfit", value: '"Outfit", sans-serif', category: "sans" },
  { label: "Inter", value: '"Inter", sans-serif', category: "sans" },
  { label: "Plus Jakarta Sans", value: '"Plus Jakarta Sans", sans-serif', category: "sans" },
  { label: "Poppins", value: '"Poppins", sans-serif', category: "sans" },
  { label: "Montserrat", value: '"Montserrat", sans-serif', category: "sans" },
  { label: "Space Grotesk", value: '"Space Grotesk", sans-serif', category: "sans" },
  { label: "DM Sans", value: '"DM Sans", sans-serif', category: "sans" },
  { label: "Manrope", value: '"Manrope", sans-serif', category: "sans" },
  { label: "Urbanist", value: '"Urbanist", sans-serif', category: "sans" },
  { label: "Work Sans", value: '"Work Sans", sans-serif', category: "sans" },
  { label: "Raleway", value: '"Raleway", sans-serif', category: "sans" },
  { label: "Nunito", value: '"Nunito", sans-serif', category: "sans" },
  { label: "Rubik", value: '"Rubik", sans-serif', category: "sans" },
  { label: "Sora", value: '"Sora", sans-serif', category: "sans" },
  { label: "Syne", value: '"Syne", sans-serif', category: "sans" },
  { label: "Figtree", value: '"Figtree", sans-serif', category: "sans" },
  { label: "Lexend", value: '"Lexend", sans-serif', category: "sans" },
  { label: "Bricolage Grotesque", value: '"Bricolage Grotesque", sans-serif', category: "sans" },
  { label: "Instrument Sans", value: '"Instrument Sans", sans-serif', category: "sans" },
  { label: "Spline Sans", value: '"Spline Sans", sans-serif', category: "sans" },
  { label: "Public Sans", value: '"Public Sans", sans-serif', category: "sans" },
  { label: "Epilogue", value: '"Epilogue", sans-serif', category: "sans" },
  { label: "Archivo", value: '"Archivo", sans-serif', category: "sans" },
  { label: "Cabin", value: '"Cabin", sans-serif', category: "sans" },
  { label: "Red Hat Display", value: '"Red Hat Display", sans-serif', category: "sans" },

  // Top Editorial & Luxury Serifs (15)
  { label: "Playfair Display", value: '"Playfair Display", Georgia, serif', category: "serif" },
  { label: "Lora", value: '"Lora", Georgia, serif', category: "serif" },
  { label: "Merriweather", value: '"Merriweather", Georgia, serif', category: "serif" },
  { label: "Cormorant Garamond", value: '"Cormorant Garamond", Georgia, serif', category: "serif" },
  { label: "Cinzel", value: '"Cinzel", serif', category: "serif" },
  { label: "Prata", value: '"Prata", serif', category: "serif" },
  { label: "Fraunces", value: '"Fraunces", serif', category: "serif" },
  { label: "Bodoni Moda", value: '"Bodoni Moda", serif', category: "serif" },
  { label: "DM Serif Display", value: '"DM Serif Display", serif', category: "serif" },
  { label: "Libre Baskerville", value: '"Libre Baskerville", serif', category: "serif" },
  { label: "EB Garamond", value: '"EB Garamond", serif', category: "serif" },
  { label: "Newsreader", value: '"Newsreader", serif', category: "serif" },
  { label: "Spectral", value: '"Spectral", serif', category: "serif" },
  { label: "Marcellus", value: '"Marcellus", serif', category: "serif" },
  { label: "Rozha One", value: '"Rozha One", serif', category: "serif" },

  // Top Modern Monospace (5)
  { label: "JetBrains Mono", value: '"JetBrains Mono", ui-monospace, monospace', category: "mono" },
  { label: "Space Mono", value: '"Space Mono", monospace', category: "mono" },
  { label: "Fira Code", value: '"Fira Code", monospace', category: "mono" },
  { label: "IBM Plex Mono", value: '"IBM Plex Mono", monospace', category: "mono" },
  { label: "Source Code Pro", value: '"Source Code Pro", monospace', category: "mono" },

  // Top Display & Handwriting (5)
  { label: "Bebas Neue", value: '"Bebas Neue", sans-serif', category: "display" },
  { label: "Anton", value: '"Anton", sans-serif', category: "display" },
  { label: "Caveat", value: '"Caveat", cursive', category: "handwriting" },
  { label: "Dancing Script", value: '"Dancing Script", cursive', category: "handwriting" },
  { label: "Pacifico", value: '"Pacifico", cursive', category: "handwriting" },
];

export const WEIGHTS = [
  { label: "Light", value: 300 },
  { label: "Regular", value: 400 },
  { label: "Medium", value: 500 },
  { label: "SemiBold", value: 600 },
  { label: "Bold", value: 700 },
  { label: "Black", value: 800 },
];

export const BOX_COLORS = [
  "#ffffff",
  "#0d0d0d",
  "#4f46e5",
  "#2dd4a8",
  "#ef4444",
  "#f59e0b",
  "#a78bfa",
  "#ec4899",
  "#14b8a6",
  "#94a3b8",
];

export function normalizeColorToHex(color?: string | null): string {
  if (!color) return "#ffffff";
  const c = color.trim().toLowerCase();
  if (c.startsWith("#")) {
    if (c.length === 4) {
      return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    return c;
  }
  const rgbMatch = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1] ?? "0", 10).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2] ?? "0", 10).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3] ?? "0", 10).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  if (c === "white") return "#ffffff";
  if (c === "black") return "#000000";
  return c;
}

export const SHADOWS: Record<string, string> = {
  none: "none",
  small: "0 2px 8px rgba(0,0,0,0.18)",
  medium: "0 10px 24px rgba(0,0,0,0.25)",
  large: "0 24px 60px rgba(0,0,0,0.35)",
};

export type BoxStyle = "solid" | "gradient" | "glass" | "outline";
export type ImageShape = "circle" | "rounded" | "square";
export type ExportFormat = "png" | "jpg" | "webp" | "gif";

// One entry in the free-floating "Images" gallery — each is independently
// draggable, resizable and stackable on the canvas, so a design can carry
// any number of photos/stickers instead of just one.
export type ImageLayer = {
  id: string;
  src: string;
  x: number; // canvas %, center point
  y: number; // canvas %, center point
  size: number; // px width
  // Optional independent height, set the first time a top/bottom edge
  // handle is dragged — until then the image renders at its natural aspect
  // ratio (undefined means "auto"), same optional/fallback pattern used
  // throughout this file. Once set, the image stretches/crops to fill an
  // explicit box instead of scaling proportionally.
  height?: number | undefined;
  radius: number; // px corner radius
  shadow: boolean;
  shadowBlur: number;
  layer: "front" | "behind"; // stacked relative to the quote box; ties within
  // the same side are broken by array order (later = drawn on top)
  // When true, dragging/resizing is disabled (matches the box's own
  // `locked` field) but it stays selectable so it can be unlocked again.
  locked?: boolean | undefined;
  // When true, hidden from the canvas entirely but kept in the Layers
  // panel list so it can be shown again — distinct from deleting it.
  hidden?: boolean | undefined;
  opacity?: number | undefined; // 0-100 (default 100)
  flipH?: boolean | undefined;
  flipV?: boolean | undefined;
  shadowX?: number | undefined;
  shadowY?: number | undefined;
  shadowSpread?: number | undefined;
  shadowColor?: string | undefined;
  shadowOpacity?: number | undefined;
  objectFit?: "cover" | "contain" | "fill" | undefined;
  // Degrees, clockwise, around the layer's own center. Unset means 0 — same
  // optional/fallback pattern as everything else here.
  rotation?: number | undefined;
};

export type TextEffectType =
  | "none"
  | "drop"
  | "glow"
  | "echo"
  | "outline"
  | "background"
  | "splice"
  | "hollow"
  | "neon"
  | "glitch";

export type TextShapeType = "none" | "curve";

// One entry in the free-floating "Text" gallery — extra text blocks beyond
// the fixed quote/name/tagline, each independently draggable, editable in
// place (click straight into it on the canvas) and resizable.
export type TextLayer = {
  id: string;
  text: string;
  x: number; // canvas %, center point
  y: number; // canvas %, center point
  size: number; // font px
  color: string;
  fontFamily: string;
  weight: number;
  align: "left" | "center" | "right" | "justify";
  italic: boolean;
  underline: boolean;
  strike: boolean;
  uppercase?: boolean | undefined;
  locked?: boolean | undefined;
  hidden?: boolean | undefined;
  // Corner handles scale `size` (font); the 4 pill-shaped edge handles
  // resize the box instead — left/right rewrap text within a wider/
  // narrower column via `width`, top/bottom reserve extra vertical room
  // via `minHeight`, neither touching font size. Unset means "auto":
  // shrink-wrapped up to a 520px cap for width, no minimum for height —
  // same optional/fallback pattern as ImageLayer.height.
  width?: number | undefined;
  minHeight?: number | undefined;
  // Per-selection rich formatting (bold/italic/underline/strike applied to
  // just part of the text, via the highlight-to-style popover) — sanitized
  // HTML, takes priority over `text` for rendering when present. `text`
  // stays in sync as a plain-text mirror (used by the sidebar's plain
  // input and anywhere a plain label is needed) — editing `text` directly
  // there clears `html`, since the two would otherwise no longer match.
  html?: string | undefined;
  // Spacing & vertical anchor (Canva/Figma parity)
  letterSpacing?: number | undefined; // e.g. -50 to 500 (unitless, /1000 em)
  lineHeight?: number | undefined; // e.g. 0.8 to 2.5 (line-height multiplier)
  verticalAlign?: "top" | "middle" | "bottom" | undefined; // Anchor text box

  // Text Effects (Canva-style)
  effectType?: TextEffectType;
  effectColor?: string;
  effectThickness?: number;
  effectOffset?: number;
  effectDirection?: number;
  effectBlur?: number;
  effectOpacity?: number;
  effectRoundness?: number;
  effectSpread?: number;

  // Shape Effects
  shapeType?: TextShapeType;
  curveAmount?: number;

  // Degrees, clockwise, around the layer's own center. Unset means 0 — same
  // optional/fallback pattern as everything else here.
  rotation?: number;
};

// The set of decorative silhouettes offered in the "Shapes" picker. A few
// of the more elaborate ones from a typical shape picker (scalloped/stamp
// edges, true ring/crescent segments) were left out deliberately — they
// need real SVG paths to render correctly, and a rough CSS approximation
// would just look wrong. Everything here renders with plain border-radius
// or clip-path, so it's exact.
export type ShapeKind =
  | "rect" // square / rounded square / circle, via radius
  | "triangle"
  | "triangle-down"
  | "diamond"
  | "plus"
  | "hexagon"
  | "parallelogram"
  | "parallelogram-mirror"
  | "trapezoid"
  | "trapezoid-down"
  | "arch"
  | "u-shape"
  | "right-triangle"
  | "quarter-circle";

// Picker entries — several share a `kind` (square/rounded/circle are all
// "rect") and differ only in the radius they start with.
export const SHAPE_PRESETS: { id: string; label: string; kind: ShapeKind; radius: number }[] = [
  { id: "square", label: "Square", kind: "rect", radius: 0 },
  { id: "rounded", label: "Rounded square", kind: "rect", radius: 28 },
  { id: "circle", label: "Circle", kind: "rect", radius: 999 },
  { id: "triangle", label: "Triangle", kind: "triangle", radius: 0 },
  { id: "triangle-down", label: "Triangle (flipped)", kind: "triangle-down", radius: 0 },
  { id: "diamond", label: "Diamond", kind: "diamond", radius: 0 },
  { id: "plus", label: "Plus", kind: "plus", radius: 0 },
  { id: "hexagon", label: "Hexagon", kind: "hexagon", radius: 0 },
  { id: "parallelogram", label: "Parallelogram", kind: "parallelogram", radius: 0 },
  {
    id: "parallelogram-mirror",
    label: "Parallelogram (mirrored)",
    kind: "parallelogram-mirror",
    radius: 0,
  },
  { id: "trapezoid", label: "Trapezoid", kind: "trapezoid", radius: 0 },
  { id: "trapezoid-down", label: "Trapezoid (flipped)", kind: "trapezoid-down", radius: 0 },
  { id: "arch", label: "Arch", kind: "arch", radius: 999 },
  { id: "u-shape", label: "U shape", kind: "u-shape", radius: 999 },
  { id: "right-triangle", label: "Right triangle", kind: "right-triangle", radius: 0 },
  { id: "quarter-circle", label: "Quarter circle", kind: "quarter-circle", radius: 999 },
];

export type ShadowPreset = {
  id: string;
  label: string;
  gradient: string;
  width: number;
  height: number;
  x: number;
  y: number;
  opacity?: number;
  radius?: number;
  theme?: "black" | "white";
  description?: string;
  category: "gradient" | "spotlight" | "ground" | "vignette" | "ambient";
};

export const SHADOW_OVERLAY_PRESETS: ShadowPreset[] = [
  // ==================== BLACK SHADOWS ====================
  // 1. Bottom & Top Gradient Fades
  {
    id: "bottom-fade-full",
    label: "Bottom Fade (Full)",
    gradient: "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0) 100%)",
    width: 1200,
    height: 650,
    x: 50,
    y: 75,
    opacity: 95,
    theme: "black",
    category: "gradient",
    description: "Deep bottom gradient overlay for maximum quote readability",
  },
  {
    id: "bottom-fade-soft",
    label: "Soft Bottom Feather",
    gradient: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)",
    width: 1200,
    height: 500,
    x: 50,
    y: 80,
    opacity: 85,
    theme: "black",
    category: "gradient",
    description: "Gentle natural bottom gradient",
  },
  {
    id: "bottom-fade-heavy",
    label: "Heavy Bottom Block",
    gradient: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.88) 35%, rgba(0,0,0,0) 100%)",
    width: 1200,
    height: 750,
    x: 50,
    y: 72,
    opacity: 98,
    theme: "black",
    category: "gradient",
    description: "Dense solid bottom block for high contrast text",
  },
  {
    id: "bottom-arch-horizon",
    label: "Curved Horizon Bottom",
    gradient: "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 90%)",
    width: 1200,
    height: 700,
    x: 50,
    y: 78,
    opacity: 95,
    theme: "black",
    category: "vignette",
    description: "Curved upward horizon bottom shadow",
  },
  {
    id: "top-fade-full",
    label: "Top Header Fade",
    gradient: "linear-gradient(to bottom, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0) 100%)",
    width: 1200,
    height: 650,
    x: 50,
    y: 25,
    opacity: 95,
    theme: "black",
    category: "gradient",
    description: "Top-down fade for headers and badges",
  },
  {
    id: "top-fade-soft",
    label: "Soft Top Feather",
    gradient: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)",
    width: 1200,
    height: 500,
    x: 50,
    y: 20,
    opacity: 85,
    theme: "black",
    category: "gradient",
    description: "Gentle natural top gradient",
  },
  {
    id: "top-bar-narrow",
    label: "Top Navigation Bar",
    gradient: "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)",
    width: 1200,
    height: 250,
    x: 50,
    y: 10,
    opacity: 90,
    theme: "black",
    category: "gradient",
    description: "Subtle top bar shade for status bars",
  },
  {
    id: "left-edge-fade",
    label: "Left Edge Fade",
    gradient: "linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 100%)",
    width: 600,
    height: 1500,
    x: 25,
    y: 50,
    opacity: 90,
    theme: "black",
    category: "gradient",
    description: "Side dark curtain on left",
  },
  {
    id: "right-edge-fade",
    label: "Right Edge Fade",
    gradient: "linear-gradient(to left, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 100%)",
    width: 600,
    height: 1500,
    x: 75,
    y: 50,
    opacity: 90,
    theme: "black",
    category: "gradient",
    description: "Side dark curtain on right",
  },
  {
    id: "dual-edge-vignette",
    label: "Dual Edge Cinema Fade",
    gradient: "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, transparent 28%, transparent 72%, rgba(0,0,0,0.9) 100%)",
    width: 1200,
    height: 1500,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "black",
    category: "vignette",
    description: "Simultaneous top & bottom dramatic cinema vignette",
  },

  // 2. Spotlights & Radial Ambient Shadows
  {
    id: "center-spotlight-radial",
    label: "Center Spotlight (Dark)",
    gradient: "radial-gradient(circle at center, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0) 75%)",
    width: 900,
    height: 900,
    x: 50,
    y: 50,
    opacity: 90,
    radius: 999,
    theme: "black",
    category: "spotlight",
    description: "Dramatic circular dark focus area in the center",
  },
  {
    id: "center-spotlight-soft",
    label: "Soft Diffused Spotlight",
    gradient: "radial-gradient(circle at center, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 80%)",
    width: 1100,
    height: 1100,
    x: 50,
    y: 50,
    opacity: 85,
    radius: 999,
    theme: "black",
    category: "spotlight",
    description: "Wide gentle center focus circle",
  },
  {
    id: "corner-spotlight-tl",
    label: "Corner Spotlight (Top-Left)",
    gradient: "radial-gradient(circle at 0% 0%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
    width: 1000,
    height: 1000,
    x: 35,
    y: 35,
    opacity: 90,
    theme: "black",
    category: "spotlight",
    description: "Soft curved shadow originating from top-left corner",
  },
  {
    id: "corner-spotlight-tr",
    label: "Corner Spotlight (Top-Right)",
    gradient: "radial-gradient(circle at 100% 0%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
    width: 1000,
    height: 1000,
    x: 65,
    y: 35,
    opacity: 90,
    theme: "black",
    category: "spotlight",
    description: "Soft curved shadow originating from top-right corner",
  },
  {
    id: "corner-spotlight-bl",
    label: "Corner Spotlight (Bottom-Left)",
    gradient: "radial-gradient(circle at 0% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
    width: 1000,
    height: 1000,
    x: 35,
    y: 65,
    opacity: 90,
    theme: "black",
    category: "spotlight",
    description: "Soft curved shadow originating from bottom-left corner",
  },
  {
    id: "corner-spotlight-br",
    label: "Corner Spotlight (Bottom-Right)",
    gradient: "radial-gradient(circle at 100% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
    width: 1000,
    height: 1000,
    x: 65,
    y: 65,
    opacity: 90,
    theme: "black",
    category: "spotlight",
    description: "Soft curved shadow originating from bottom-right corner",
  },
  {
    id: "inverted-vignette",
    label: "Deep Vignette (Dark Corners)",
    gradient: "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.95) 100%)",
    width: 1200,
    height: 1500,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "black",
    category: "vignette",
    description: "Full canvas lens vignette keeping the center bright",
  },

  // 3. Ground, Floor & Drop Shadows
  {
    id: "ground-oval-shadow",
    label: "Oval Ground Shadow",
    gradient: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 85%)",
    width: 700,
    height: 180,
    x: 50,
    y: 80,
    opacity: 90,
    radius: 999,
    theme: "black",
    category: "ground",
    description: "Realistic floor contact shadow beneath cards, avatars or products",
  },
  {
    id: "wide-pedestal-shadow",
    label: "Wide Pedestal Shadow",
    gradient: "radial-gradient(ellipse 60% 30% at 50% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)",
    width: 900,
    height: 220,
    x: 50,
    y: 85,
    opacity: 90,
    radius: 999,
    theme: "black",
    category: "ground",
    description: "Soft wide base shadow for grounding floating designs",
  },
  {
    id: "horizontal-shadow-bar",
    label: "Horizontal Shadow Bar",
    gradient: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.9) 50%, transparent 100%)",
    width: 1000,
    height: 200,
    x: 50,
    y: 50,
    opacity: 85,
    theme: "black",
    category: "ground",
    description: "Subtle horizontal ambient band for text or separators",
  },
  {
    id: "horizontal-divider-line",
    label: "Slim Horizon Shadow",
    gradient: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.85) 50%, transparent 100%)",
    width: 1100,
    height: 80,
    x: 50,
    y: 50,
    opacity: 85,
    theme: "black",
    category: "ground",
    description: "Thin soft horizontal dividing shadow",
  },
  {
    id: "vertical-cylinder-shadow",
    label: "Vertical Cylinder Shadow",
    gradient: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.85) 50%, transparent 100%)",
    width: 280,
    height: 1200,
    x: 50,
    y: 50,
    opacity: 85,
    theme: "black",
    category: "ambient",
    description: "Vertical diffused shadow column",
  },
  {
    id: "diagonal-cinema-slash",
    label: "Diagonal Shadow Slash (45°)",
    gradient: "linear-gradient(135deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0) 80%)",
    width: 1200,
    height: 1500,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "black",
    category: "ambient",
    description: "Bold 45-degree angle dramatic lighting",
  },
  {
    id: "diagonal-cinema-slash-inv",
    label: "Diagonal Shadow Slash (135°)",
    gradient: "linear-gradient(225deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0) 80%)",
    width: 1200,
    height: 1500,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "black",
    category: "ambient",
    description: "Inverted angle dramatic shadow sweep",
  },
  {
    id: "dense-ambient-fog",
    label: "Atmospheric Ambient Fog",
    gradient: "radial-gradient(circle at 50% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0) 85%)",
    width: 1200,
    height: 800,
    x: 50,
    y: 75,
    opacity: 95,
    theme: "black",
    category: "ambient",
    description: "Deep moody fog spreading from the base",
  },

  // ==================== WHITE OVERLAYS / GLOWS ====================
  {
    id: "white-mist-bottom",
    label: "White Mist Bottom Fade",
    gradient: "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.7) 45%, rgba(255,255,255,0) 100%)",
    width: 1200,
    height: 600,
    x: 50,
    y: 80,
    opacity: 95,
    theme: "white",
    category: "gradient",
    description: "Crisp white bottom fade for light mode quotes",
  },
  {
    id: "white-mist-soft-bottom",
    label: "Soft White Bottom Glow",
    gradient: "linear-gradient(to top, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)",
    width: 1200,
    height: 480,
    x: 50,
    y: 82,
    opacity: 90,
    theme: "white",
    category: "gradient",
    description: "Gentle white feather on bottom",
  },
  {
    id: "white-mist-top",
    label: "White Top Header Fade",
    gradient: "linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.65) 45%, rgba(255,255,255,0) 100%)",
    width: 1200,
    height: 600,
    x: 50,
    y: 20,
    opacity: 95,
    theme: "white",
    category: "gradient",
    description: "Clean top white luminous curtain",
  },
  {
    id: "white-spotlight-center",
    label: "White Center Glow",
    gradient: "radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
    width: 850,
    height: 850,
    x: 50,
    y: 50,
    opacity: 90,
    radius: 999,
    theme: "white",
    category: "spotlight",
    description: "Luminous center ambient glow",
  },
  {
    id: "white-spotlight-soft",
    label: "Soft Diffused White Center",
    gradient: "radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.3) 55%, rgba(255,255,255,0) 80%)",
    width: 1100,
    height: 1100,
    x: 50,
    y: 50,
    opacity: 85,
    radius: 999,
    theme: "white",
    category: "spotlight",
    description: "Wide radiant ambient cloud",
  },
  {
    id: "white-corner-tl",
    label: "White Flare (Top-Left)",
    gradient: "radial-gradient(circle at 0% 0%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
    width: 1000,
    height: 1000,
    x: 35,
    y: 35,
    opacity: 90,
    theme: "white",
    category: "spotlight",
    description: "Sun flare from top-left corner",
  },
  {
    id: "white-corner-tr",
    label: "White Flare (Top-Right)",
    gradient: "radial-gradient(circle at 100% 0%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
    width: 1000,
    height: 1000,
    x: 65,
    y: 35,
    opacity: 90,
    theme: "white",
    category: "spotlight",
    description: "Sun flare from top-right corner",
  },
  {
    id: "white-corner-bl",
    label: "White Flare (Bottom-Left)",
    gradient: "radial-gradient(circle at 0% 100%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
    width: 1000,
    height: 1000,
    x: 35,
    y: 65,
    opacity: 90,
    theme: "white",
    category: "spotlight",
    description: "Bottom-left radiant light sweep",
  },
  {
    id: "white-corner-br",
    label: "White Flare (Bottom-Right)",
    gradient: "radial-gradient(circle at 100% 100%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
    width: 1000,
    height: 1000,
    x: 65,
    y: 65,
    opacity: 90,
    theme: "white",
    category: "spotlight",
    description: "Bottom-right radiant light sweep",
  },
  {
    id: "white-ground-oval",
    label: "White Oval Light Base",
    gradient: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 85%)",
    width: 700,
    height: 180,
    x: 50,
    y: 80,
    opacity: 90,
    radius: 999,
    theme: "white",
    category: "ground",
    description: "Luminous ground halo beneath floating elements",
  },
  {
    id: "white-horizontal-bar",
    label: "White Horizontal Light Bar",
    gradient: "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.95) 50%, transparent 100%)",
    width: 1000,
    height: 180,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "white",
    category: "ground",
    description: "Horizontal radiant beam band",
  },
  {
    id: "white-vertical-beam",
    label: "White Vertical Light Pillar",
    gradient: "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)",
    width: 300,
    height: 1200,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "white",
    category: "ambient",
    description: "Vertical luminous spotlight pillar",
  },
  {
    id: "white-dual-cinema",
    label: "White Dual Cinema Glow",
    gradient: "linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, transparent 28%, transparent 72%, rgba(255,255,255,0.92) 100%)",
    width: 1200,
    height: 1500,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "white",
    category: "vignette",
    description: "Bright top & bottom illuminated cinema borders",
  },
  {
    id: "white-inverted-vignette",
    label: "White Radiant Vignette",
    gradient: "radial-gradient(ellipse at center, rgba(255,255,255,0) 30%, rgba(255,255,255,0.6) 70%, rgba(255,255,255,0.95) 100%)",
    width: 1200,
    height: 1500,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "white",
    category: "vignette",
    description: "Illuminated white edge frame",
  },
  {
    id: "white-diagonal-sunbeam",
    label: "White Diagonal Sunbeam (45°)",
    gradient: "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0) 80%)",
    width: 1200,
    height: 1500,
    x: 50,
    y: 50,
    opacity: 90,
    theme: "white",
    category: "ambient",
    description: "Dramatic 45° diagonal sunlight streak",
  },
  {
    id: "white-arch-horizon",
    label: "White Arch Horizon",
    gradient: "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 90%)",
    width: 1200,
    height: 700,
    x: 50,
    y: 78,
    opacity: 95,
    theme: "white",
    category: "vignette",
    description: "Curved upward horizon bright sunrise flare",
  },
];

// True for the kinds actually built from a rectangle (border-radius), where
// a "radius" control has a visible effect. clip-path kinds ignore
// border-radius entirely, so the control is hidden for those instead of
// sitting there doing nothing.
export function shapeSupportsRadius(kind: ShapeKind): boolean {
  return kind === "rect" || kind === "arch" || kind === "u-shape" || kind === "quarter-circle";
}

export function getShapeLabel(shape: ShapeLayer): string {
  if (shape.kind === "rect") {
    if (shape.radius >= 80) return "Circle";
    if (shape.radius > 0) return "Rounded Square";
    return "Square";
  }
  const preset = SHAPE_PRESETS.find((p) => p.kind === shape.kind);
  return preset ? preset.label : `${shape.kind.replace(/-/g, " ")}`;
}

export function getMatchingShapePresetId(shape: ShapeLayer): string {
  if (shape.kind === "rect") {
    if (shape.radius >= 80) return "circle";
    if (shape.radius > 0) return "rounded";
    return "square";
  }
  return SHAPE_PRESETS.find((p) => p.kind === shape.kind)?.id ?? shape.kind;
}

// Single source of truth for a shape's visual geometry, shared by the
// picker's preview swatches and the actual canvas-rendered layer so they
// can never drift apart.
export function shapeCss(kind: ShapeKind, radius: number): { borderRadius?: string; clipPath?: string } {
  switch (kind) {
    case "rect":
      return { borderRadius: `${radius}px` };
    case "arch":
      return { borderRadius: `${radius}px ${radius}px 0 0` };
    case "u-shape":
      return { borderRadius: `0 0 ${radius}px ${radius}px` };
    case "quarter-circle":
      return { borderRadius: `0 0 ${radius}px 0` };
    case "triangle":
      return { clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" };
    case "triangle-down":
      return { clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)" };
    case "diamond":
      return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    case "plus":
      return {
        clipPath:
          "polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)",
      };
    case "hexagon":
      return { clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" };
    case "parallelogram":
      return { clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)" };
    case "parallelogram-mirror":
      return { clipPath: "polygon(0% 0%, 75% 0%, 100% 100%, 25% 100%)" };
    case "trapezoid":
      return { clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)" };
    case "trapezoid-down":
      return { clipPath: "polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)" };
    case "right-triangle":
      return { clipPath: "polygon(0% 0%, 0% 100%, 100% 100%)" };
    default:
      return {};
  }
}

// Full box-style rendering for a shape — background (solid/gradient/glass),
// border (outline) and box-shadow — mirroring the old quote box's own
// style computation so a shape can stand in for it with full visual
// parity instead of the plain solid-fill-only look shapes started with.
// Shared by the canvas render and the sidebar's preview swatches.
export function shapeFillStyle(shape: ShapeLayer): {
  background: string;
  border: string;
  boxShadow: string;
  backdropFilter: string | undefined;
  opacity?: number | undefined;
} {
  const style = shape.style ?? "solid";
  const background =
    style === "gradient"
      ? (shape.gradient ?? "linear-gradient(135deg, #ffffff 0%, #ede9fe 100%)")
      : style === "outline"
        ? "transparent"
        : hexToRgba(shape.color, (style === "glass" ? 0.55 : 1) * (shape.opacity / 100));
  const border = style === "outline" ? `${shape.strokeWidth ?? 3}px solid ${shape.color}` : "none";
  const boxShadow = shape.shadow
    ? `${shape.shadowX ?? 0}px ${shape.shadowY ?? 12}px ${shape.shadowBlur}px ${shape.shadowSpread ?? 0}px ${hexToRgba(
        shape.shadowColor ?? "#000000",
        (shape.shadowOpacity ?? 35) / 100,
      )}`
    : "none";
  return {
    background,
    border,
    boxShadow,
    opacity: style === "gradient" || style === "outline" ? shape.opacity / 100 : undefined,
    backdropFilter: style === "glass" ? "blur(14px)" : undefined,
  };
}

// One entry in the free-floating "Shapes" gallery — decorative silhouettes
// (square, triangle, diamond, ...), each independently draggable, resizable
// and colorable, same interaction model as the Images/Text galleries.
export type ShapeLayer = {
  id: string;
  kind: ShapeKind;
  x: number; // canvas %, center point
  y: number; // canvas %, center point
  size: number; // px width
  // Optional independent height — unset defaults to `size` (a square,
  // matching every shape's original behavior). Set once a top/bottom edge
  // handle is dragged, same fallback pattern as ImageLayer.height above.
  height?: number | undefined;
  color: string;
  opacity: number; // 0-100
  radius: number; // px — only visible when shapeSupportsRadius(kind)
  shadow: boolean;
  shadowBlur: number;
  layer: "front" | "behind";
  locked?: boolean | undefined;
  hidden?: boolean | undefined;
  // Full box-style parity, so a shape can stand in for the old quote box
  // with no visual downgrade. "solid" ignores `gradient`; "outline" draws
  // a border using `color` (same pattern the old box always used, no
  // separate border-color field needed); "glass" adds a translucent blur
  // backdrop. Unset means "solid", matching every shape's original look.
  style?: BoxStyle | undefined;
  gradient?: string | undefined; // CSS gradient string, used when style === "gradient"
  strokeWidth?: number | undefined;
  flipH?: boolean | undefined;
  flipV?: boolean | undefined;
  // Full shadow controls. `shadow`/`shadowBlur` above stay as the on/off +
  // blur pair for back-compat; these fill in the rest, each defaulting to
  // the old box's own shadow defaults when unset.
  shadowX?: number | undefined;
  shadowY?: number | undefined;
  shadowSpread?: number | undefined;
  shadowColor?: string | undefined;
  shadowOpacity?: number | undefined; // 0-100
  // Degrees, clockwise, around the layer's own center. Unset means 0 — same
  // optional/fallback pattern as everything else here.
  rotation?: number | undefined;
};

export type EditorState = {
  // content
  quote: string;
  name: string;
  tagline: string;
  verified: number;
  avatar: string | null;
  avatarShape: ImageShape;
  avatarSize: number;
  avatarBorder: number;
  avatarBorderColor: string;
  avatarShadow: boolean;
  avatarShadowBlur: number;
  avatarShadowColor: string;
  authorBelow: boolean;
  authorSpacing: number;
  // Independent top/bottom margin for the author container. Optional and
  // layered on top of authorSpacing (which still drives the default: only
  // the side facing the quote gets it, per authorBelow) so older templates
  // and saved designs that predate these fields keep rendering exactly as
  // they did before — set either one explicitly to override that default.
  authorSpacingTop?: number;
  authorSpacingBottom?: number;
  authorAlign: "left" | "center" | "right";
  avatarPosition: "left" | "right" | "top";
  authorTextAlign: "left" | "center" | "right";
  // Free-floating images gallery — any number of independently draggable,
  // resizable, stackable photos. Optional, defaults to none via
  // getImageLayers() below so older saved designs are unaffected.
  images?: ImageLayer[];
  // Free-floating text gallery — any number of extra editable text blocks,
  // same optional/fallback pattern via getTextLayers() below.
  texts?: TextLayer[];
  // Free-floating shapes gallery — any number of decorative shapes (square,
  // triangle, diamond, etc.), same optional/fallback pattern via
  // getShapeLayers() below. Replaces the old single decorative-shape fields.
  shapes?: ShapeLayer[];
  layerOrder?: { kind: "text" | "image" | "shape"; id: string }[];

  // decorative elements
  showQuoteIcon: boolean;
  quoteIconSize: number;
  quoteIconColor: string;
  quoteIconOpacity: number;
  quoteIconPosition: "left" | "center" | "right";
  quoteIconLineHeight: number;
  // Free canvas position (%), draggable on the canvas like the box/badge.
  // Optional — legacy templates that only set quoteIconPosition keep
  // rendering inline just above the quote text (their original behavior);
  // once either is set, the icon switches to floating freely at that spot.
  quoteIconX?: number;
  quoteIconY?: number;
  // Per-element lock, same meaning as ImageLayer/TextLayer/ShapeLayer's
  // `locked` — set from the Layers panel, independent of the box's own
  // `locked` field below.
  quoteIconLocked?: boolean;

  showDots: boolean;
  dotsColor: string;
  dotsOpacity: number;
  dotsSize: number;
  dotsPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  // Free canvas position (%), draggable — same optional/fallback pattern as
  // quoteIconX/Y: unset means "derive a default from dotsPosition's corner".
  dotsX?: number;
  dotsY?: number;
  dotsLocked?: boolean;

  topButtonText: string;
  showTopButton: boolean;
  topButtonX: number;
  topButtonY: number;
  topButtonBg: string;
  topButtonColor: string;
  topButtonRadius: number;
  topButtonSize: number;
  topButtonFont: string;
  // Horizontal/vertical padding — the lever left/right and top/bottom drag
  // handles on the badge use, since it has no separate width/height field
  // of its own (it's sized by its content + this padding, like a CSS
  // `padding: Y X` shorthand).
  topButtonPadX: number;
  topButtonPadY: number;
  topButtonLocked?: boolean;


  // Set once this design has been initialized under the shapes/texts
  // layer model — either built that way from the start (INITIAL_STATE, a
  // STARTER_TEMPLATE, blankState) or upgraded from an old fixed-field save
  // by migrateLegacyContentToLayers() below. Distinct from "shapes/texts
  // are non-empty" so that deliberately deleting every layer down to zero
  // doesn't look like un-migrated legacy data and get old content
  // resurrected on the next load.
  layersInitialized?: boolean;

  showDivider: boolean;
  dividerColor: string;
  dividerThickness: number;
  dividerOpacity: number;
  // Free canvas position (%), draggable — same pattern as quoteIconX/Y.
  // Used to render as a floating line now that it no longer sits inside
  // the old box's content flow (the box is a freely-movable shape now,
  // same as everything else, so nothing has a fixed "content flow" for
  // this to sit inside anymore). Unset defaults to canvas center.
  dividerX?: number;
  dividerY?: number;
  dividerWidth?: number; // px, defaults to 200
  dividerLocked?: boolean;

  // typography
  quoteFont: string;
  quoteSize: number;
  quoteWeight: number;
  quoteAlign: "left" | "center" | "right";
  quoteItalic: boolean;
  quoteUnderline: boolean;
  quoteStrike: boolean;
  lineHeight: number;
  textColor: string;
  authorFont: string;
  authorSize: number;
  authorWeight: number;
  authorColor: string;
  taglineFont: string;
  taglineSize: number;
  taglineWeight: number;
  taglineColor: string;

  // canvas
  width: number;
  height: number;

  // quote box
  posX: number;
  posY: number;
  boxWidth: number;
  boxStyle: BoxStyle;
  boxGradient: string;
  opacity: number;
  radius: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
  shadowOn: boolean;
  shX: number;
  shY: number;
  shBlur: number;
  shSpread: number;
  shColor: string;
  shOpacity: number;
  boxColor: string;
  locked: boolean;

  // background
  background: string;
  bgImage: string | null;
  bgBlur: number;
  bgDim: number;
  bgImageZoom?: number;
  bgImagePosX?: number;
  bgImagePosY?: number;
  canvasRadius?: number;

  // export
  exportFormat: ExportFormat;
  exportScale: number;
};

export type Template = {
  id: string;
  label: string;
  description: string;
  state: Partial<EditorState>;
};

// Builds the shapes/texts/images that make up a classic "quote card" —
// a box shape plus quote/name/tagline text plus an optional avatar image,
// positioned to visually sit inside the box. This is the layer-based
// replacement for what used to be a single hardcoded box+quote+author
// render in QuoteCanvas — every INITIAL_STATE/STARTER_TEMPLATE below (and
// migrateLegacyContentToLayers() further down, for old saved designs)
// builds its layout through this one function so the math lives in one
// place. Position/size are approximate — good starting points, not
// pixel-perfect replicas of the old flow layout — since every layer this
// produces is freely draggable/resizable afterward anyway.
function buildQuoteCardLayers(opts: {
  canvasWidth: number;
  canvasHeight: number;
  boxWidthPct: number; // % of canvas width
  boxHeightPx: number;
  boxStyle: BoxStyle;
  boxColor: string;
  boxGradient?: string;
  boxRadius: number;
  boxOpacity: number;
  boxShadow: boolean;
  quoteFont: string;
  quoteSize: number;
  quoteWeight: number;
  quoteItalic?: boolean;
  quoteAlign: "left" | "center" | "right";
  textColor: string;
  authorColor: string;
  taglineColor: string;
  quoteText: string;
  nameText: string;
  taglineText: string;
  avatarSrc: string | null;
}): { shapes: ShapeLayer[]; texts: TextLayer[]; images: ImageLayer[] } {
  const boxWidthPx = Math.round((opts.boxWidthPct / 100) * opts.canvasWidth);
  const halfHeightPct = (opts.boxHeightPx / 2 / opts.canvasHeight) * 100;
  const contentWidthPx = boxWidthPx - 110;
  const isLeftAlign = opts.quoteAlign === "left";
  const avatarSize = 56;

  const box: ShapeLayer = {
    id: newLayerId(),
    kind: "rect",
    x: 50,
    y: 50,
    size: boxWidthPx,
    height: opts.boxHeightPx,
    color: opts.boxColor,
    opacity: opts.boxOpacity,
    radius: opts.boxRadius,
    style: opts.boxStyle,
    ...(opts.boxGradient !== undefined ? { gradient: opts.boxGradient } : {}),
    shadow: opts.boxShadow,
    shadowBlur: 50,
    shadowX: 0,
    shadowY: 20,
    shadowSpread: 0,
    shadowColor: "#000000",
    shadowOpacity: 25,
    layer: "front",
  };

  const quote: TextLayer = {
    id: newLayerId(),
    text: opts.quoteText,
    x: 50,
    y: Number((50 - halfHeightPct * 0.35).toFixed(2)),
    width: contentWidthPx,
    size: opts.quoteSize,
    color: opts.textColor,
    fontFamily: opts.quoteFont,
    weight: opts.quoteWeight,
    align: opts.quoteAlign,
    italic: opts.quoteItalic ?? false,
    underline: false,
    strike: false,
    lineHeight: 1.35,
  };

  const texts: TextLayer[] = [quote];
  const images: ImageLayer[] = [];

  const authorBaseY = 50 + halfHeightPct * 0.52;

  if (isLeftAlign) {
    if (opts.avatarSrc) {
      const avatarXPct = 50 - (opts.boxWidthPct / 2) + ((55 + avatarSize / 2) / opts.canvasWidth) * 100;
      images.push({
        id: newLayerId(),
        src: opts.avatarSrc,
        x: Number(avatarXPct.toFixed(2)),
        y: Number(authorBaseY.toFixed(2)),
        size: avatarSize,
        height: avatarSize,
        radius: 999,
        shadow: false,
        shadowBlur: 24,
        layer: "front",
      });

      const textLeftMarginPx = 55 + avatarSize + 16;
      const textWidthPx = boxWidthPx - textLeftMarginPx - 45;
      const textXPct = 50 - (opts.boxWidthPct / 2) + ((textLeftMarginPx + textWidthPx / 2) / opts.canvasWidth) * 100;

      texts.push(
        {
          id: newLayerId(),
          text: opts.nameText,
          x: Number(textXPct.toFixed(2)),
          y: Number((authorBaseY - 1.4).toFixed(2)),
          width: textWidthPx,
          size: 22,
          color: opts.authorColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 700,
          align: "left",
          italic: false,
          underline: false,
          strike: false,
        },
        {
          id: newLayerId(),
          text: opts.taglineText,
          x: Number(textXPct.toFixed(2)),
          y: Number((authorBaseY + 1.4).toFixed(2)),
          width: textWidthPx,
          size: 15,
          color: opts.taglineColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 400,
          align: "left",
          italic: false,
          underline: false,
          strike: false,
        },
      );
    } else {
      texts.push(
        {
          id: newLayerId(),
          text: opts.nameText,
          x: 50,
          y: Number((authorBaseY - 1.4).toFixed(2)),
          width: contentWidthPx,
          size: 22,
          color: opts.authorColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 700,
          align: "left",
          italic: false,
          underline: false,
          strike: false,
        },
        {
          id: newLayerId(),
          text: opts.taglineText,
          x: 50,
          y: Number((authorBaseY + 1.4).toFixed(2)),
          width: contentWidthPx,
          size: 15,
          color: opts.taglineColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 400,
          align: "left",
          italic: false,
          underline: false,
          strike: false,
        },
      );
    }
  } else {
    // Center aligned
    if (opts.avatarSrc) {
      images.push({
        id: newLayerId(),
        src: opts.avatarSrc,
        x: 50,
        y: Number((50 + halfHeightPct * 0.28).toFixed(2)),
        size: avatarSize,
        height: avatarSize,
        radius: 999,
        shadow: false,
        shadowBlur: 24,
        layer: "front",
      });

      texts.push(
        {
          id: newLayerId(),
          text: opts.nameText,
          x: 50,
          y: Number((50 + halfHeightPct * 0.54).toFixed(2)),
          width: contentWidthPx,
          size: 22,
          color: opts.authorColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 700,
          align: "center",
          italic: false,
          underline: false,
          strike: false,
        },
        {
          id: newLayerId(),
          text: opts.taglineText,
          x: 50,
          y: Number((50 + halfHeightPct * 0.72).toFixed(2)),
          width: contentWidthPx,
          size: 15,
          color: opts.taglineColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 400,
          align: "center",
          italic: false,
          underline: false,
          strike: false,
        },
      );
    } else {
      texts.push(
        {
          id: newLayerId(),
          text: opts.nameText,
          x: 50,
          y: Number((authorBaseY - 1.4).toFixed(2)),
          width: contentWidthPx,
          size: 22,
          color: opts.authorColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 700,
          align: "center",
          italic: false,
          underline: false,
          strike: false,
        },
        {
          id: newLayerId(),
          text: opts.taglineText,
          x: 50,
          y: Number((authorBaseY + 1.4).toFixed(2)),
          width: contentWidthPx,
          size: 15,
          color: opts.taglineColor,
          fontFamily: '"Outfit", sans-serif',
          weight: 400,
          align: "center",
          italic: false,
          underline: false,
          strike: false,
        },
      );
    }
  }

  return {
    shapes: [box],
    texts,
    images,
  };
}

const DEFAULT_QUOTE_TEXT = "The best way to predict the future is to create it.";
const DEFAULT_NAME_TEXT = "Jasmin (Jay) Alić";
const DEFAULT_TAGLINE_TEXT = "Building the best brands & businesses on LinkedIn™";
const DEFAULT_AVATAR_SRC = "/defult-img.jpg";
const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_CANVAS_HEIGHT = 1500;

export const STARTER_TEMPLATES: Template[] = [
  {
    id: "linkedin",
    label: "LinkedIn Pro",
    description: "Clean, professional gradient for thought-leadership posts.",
    state: {
      background: "linear-gradient(180deg, #0b0616 0%, #6d28d9 60%, #7c3aed 100%)",
      bgImage: null,
      layersInitialized: true,
      ...buildQuoteCardLayers({
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        boxWidthPct: 76,
        boxHeightPx: 480,
        boxStyle: "solid",
        boxColor: "#ffffff",
        boxRadius: 24,
        boxOpacity: 100,
        boxShadow: true,
        quoteFont: '"Outfit", sans-serif',
        quoteSize: 44,
        quoteWeight: 700,
        quoteAlign: "left",
        textColor: "#0d0d12",
        authorColor: "#0d0d12",
        taglineColor: "#5b5b6b",
        quoteText: DEFAULT_QUOTE_TEXT,
        nameText: DEFAULT_NAME_TEXT,
        taglineText: DEFAULT_TAGLINE_TEXT,
        avatarSrc: DEFAULT_AVATAR_SRC,
      }),
    },
  },
  {
    id: "minimal",
    label: "Minimal Light",
    description: "Crisp white card on a subtle light gradient.",
    state: {
      background: "linear-gradient(160deg, #e8f0f8 0%, #b8d4e8 55%, #2e6b8a 100%)",
      bgImage: null,
      layersInitialized: true,
      ...buildQuoteCardLayers({
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        boxWidthPct: 74,
        boxHeightPx: 500,
        boxStyle: "solid",
        boxColor: "#ffffff",
        boxRadius: 20,
        boxOpacity: 100,
        boxShadow: true,
        quoteFont: '"Outfit", sans-serif',
        quoteSize: 36,
        quoteWeight: 600,
        quoteAlign: "center",
        textColor: "#0d0d12",
        authorColor: "#0d0d12",
        taglineColor: "#6b7280",
        quoteText: DEFAULT_QUOTE_TEXT,
        nameText: DEFAULT_NAME_TEXT,
        taglineText: DEFAULT_TAGLINE_TEXT,
        avatarSrc: DEFAULT_AVATAR_SRC,
      }),
    },
  },
  {
    id: "neon",
    label: "Neon Night",
    description: "High-contrast dark neon for a bold, modern feel.",
    state: {
      background: "linear-gradient(160deg, #0c2340 0%, #1a4a6e 55%, #5cbdb9 100%)",
      bgImage: null,
      layersInitialized: true,
      ...buildQuoteCardLayers({
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        boxWidthPct: 76,
        boxHeightPx: 480,
        boxStyle: "glass",
        boxColor: "#05121b",
        boxRadius: 16,
        boxOpacity: 75,
        boxShadow: true,
        quoteFont: '"Space Grotesk", sans-serif',
        quoteSize: 42,
        quoteWeight: 700,
        quoteAlign: "left",
        textColor: "#e2fffa",
        authorColor: "#e2fffa",
        taglineColor: "#93d8cf",
        quoteText: DEFAULT_QUOTE_TEXT,
        nameText: DEFAULT_NAME_TEXT,
        taglineText: DEFAULT_TAGLINE_TEXT,
        avatarSrc: DEFAULT_AVATAR_SRC,
      }),
    },
  },
  {
    id: "editorial",
    label: "Editorial Serif",
    description: "Magazine-style serif on a warm paper tone.",
    state: {
      background: "linear-gradient(150deg, #f6efe6 0%, #e6d8c3 60%, #c8a97e 100%)",
      bgImage: null,
      layersInitialized: true,
      ...buildQuoteCardLayers({
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        boxWidthPct: 78,
        boxHeightPx: 520,
        boxStyle: "solid",
        boxColor: "#fffaf3",
        boxRadius: 8,
        boxOpacity: 100,
        boxShadow: true,
        quoteFont: '"Playfair Display", Georgia, serif',
        quoteSize: 42,
        quoteWeight: 500,
        quoteItalic: true,
        quoteAlign: "left",
        textColor: "#1c1a17",
        authorColor: "#1c1a17",
        taglineColor: "#7a6c58",
        quoteText: DEFAULT_QUOTE_TEXT,
        nameText: DEFAULT_NAME_TEXT,
        taglineText: DEFAULT_TAGLINE_TEXT,
        avatarSrc: DEFAULT_AVATAR_SRC,
      }),
    },
  },
  {
    id: "bold",
    label: "Bold Statement",
    description: "Oversized type with a punchy sunset gradient.",
    state: {
      background: "linear-gradient(135deg, #ff6b35 0%, #e84393 55%, #6c5ce7 100%)",
      bgImage: null,
      layersInitialized: true,
      ...buildQuoteCardLayers({
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        boxWidthPct: 80,
        boxHeightPx: 520,
        boxStyle: "outline",
        boxColor: "#ffffff",
        boxRadius: 0,
        boxOpacity: 0,
        boxShadow: false,
        quoteFont: '"Poppins", "Outfit", sans-serif',
        quoteSize: 46,
        quoteWeight: 800,
        quoteAlign: "left",
        textColor: "#ffffff",
        authorColor: "#ffffff",
        taglineColor: "#ffe4d6",
        quoteText: DEFAULT_QUOTE_TEXT,
        nameText: DEFAULT_NAME_TEXT,
        taglineText: DEFAULT_TAGLINE_TEXT,
        avatarSrc: DEFAULT_AVATAR_SRC,
      }),
    },
  },
  {
    id: "sunset",
    label: "Sunset Glow",
    description: "Soft glass card floating on a warm dusk gradient.",
    state: {
      background: "linear-gradient(140deg, #1a1a1a 0%, #7c2d12 55%, #e85d3a 100%)",
      bgImage: null,
      layersInitialized: true,
      ...buildQuoteCardLayers({
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
        boxWidthPct: 76,
        boxHeightPx: 480,
        boxStyle: "glass",
        boxColor: "#1a0d08",
        boxRadius: 24,
        boxOpacity: 60,
        boxShadow: true,
        quoteFont: '"Space Grotesk", sans-serif',
        quoteSize: 42,
        quoteWeight: 600,
        quoteAlign: "left",
        textColor: "#fff7f2",
        authorColor: "#fff7f2",
        taglineColor: "#f3c3ac",
        quoteText: DEFAULT_QUOTE_TEXT,
        nameText: DEFAULT_NAME_TEXT,
        taglineText: DEFAULT_TAGLINE_TEXT,
        avatarSrc: DEFAULT_AVATAR_SRC,
      }),
    },
  },
];

export const PREMIUM_TEMPLATES: Template[] = [];

export const TEMPLATES: Template[] = [...STARTER_TEMPLATES, ...PREMIUM_TEMPLATES];

// The old fixed quote/name/tagline/avatar/box fields below are kept only
// for backward compatibility (older saved designs still carry them as
// plain JSON) — rendering no longer reads them at all. Real content lives
// in shapes/texts/images, built via buildQuoteCardLayers() above so the
// app's own default design isn't a special case of the layer model, it's
// a plain instance of it.
export const INITIAL_STATE: EditorState = {
  quote: "",
  name: "",
  tagline: "",
  verified: 0,
  avatar: null,
  avatarShape: "circle",
  avatarSize: 100,
  avatarBorder: 0,
  avatarBorderColor: "#0021ff",
  avatarShadow: false,
  avatarShadowBlur: 20,
  avatarShadowColor: "#0021ff",
  authorBelow: true,
  authorSpacing: 28,
  authorAlign: "left",
  avatarPosition: "left",
  authorTextAlign: "left",
  topButtonText: "Repost this",
  showTopButton: false,
  topButtonX: 78,
  topButtonY: 8,
  topButtonBg: "#ffffff",
  topButtonColor: "#0d0d12",
  topButtonRadius: 12,
  topButtonSize: 16,
  topButtonFont: '"Outfit", sans-serif',
  topButtonPadX: 18,
  topButtonPadY: 10,

  showQuoteIcon: false,
  quoteIconSize: 48,
  quoteIconColor: "#0021ff",
  quoteIconOpacity: 100,
  quoteIconPosition: "left",
  quoteIconLineHeight: 0.9,

  showDots: false,
  dotsColor: "#ffffff",
  dotsOpacity: 35,
  dotsSize: 160,
  dotsPosition: "top-right",

  showDivider: false,
  dividerColor: "#ffffff",
  dividerThickness: 1,
  dividerOpacity: 20,

  quoteFont: '"Outfit", sans-serif',
  quoteSize: 44,
  quoteWeight: 700,
  quoteAlign: "left",
  quoteItalic: false,
  quoteUnderline: false,
  quoteStrike: false,
  lineHeight: 1.3,
  textColor: "#0d0d12",
  authorFont: '"Outfit", sans-serif',
  authorSize: 24,
  authorWeight: 600,
  authorColor: "#0d0d12",
  taglineFont: '"Outfit", sans-serif',
  taglineSize: 16,
  taglineWeight: 400,
  taglineColor: "#5b5b6b",

  width: DEFAULT_CANVAS_WIDTH,
  height: DEFAULT_CANVAS_HEIGHT,

  posX: 50,
  posY: 50,
  boxWidth: 76,
  boxStyle: "solid",
  boxGradient: "linear-gradient(135deg, #ffffff 0%, #ede9fe 100%)",
  opacity: 100,
  radius: 24,
  padTop: 60,
  padRight: 60,
  padBottom: 60,
  padLeft: 60,
  shadowOn: true,
  shX: 0,
  shY: 20,
  shBlur: 50,
  shSpread: 0,
  shColor: "#000000",
  shOpacity: 25,
  boxColor: "#ffffff",
  locked: false,

  background: "#ffffff",
  bgImage: null,
  bgBlur: 0,
  bgDim: 0,
  bgImageZoom: 100,
  bgImagePosX: 50,
  bgImagePosY: 50,

  exportFormat: "png",
  exportScale: 2,
  layersInitialized: true,

  shapes: [],
  texts: [],
  images: [],
};

export function blankState(prev: EditorState): EditorState {
  return {
    ...INITIAL_STATE,
    width: prev.width,
    height: prev.height,
    exportFormat: prev.exportFormat,
    exportScale: prev.exportScale,
    background: "#ffffff",
    bgImage: null,
    bgBlur: 0,
    bgDim: 0,
    bgImageZoom: 100,
    bgImagePosX: 50,
    bgImagePosY: 50,
    shapes: [],
    texts: [],
    images: [],
    layersInitialized: true,
    showQuoteIcon: false,
    showDots: false,
    showTopButton: false,
    showDivider: false,
  };
}

// Upgrades an old-format design (fixed `quote`/`boxColor`/... fields, no
// `layersInitialized` marker) into the layer model, the first time it's
// loaded — real saved designs in Supabase and any state predating this
// migration still open and look the same, just built from shapes/texts
// from then on instead of the old fixed fields (which are left in place,
// now unused, purely for backward-compat typing). Gated on the explicit
// `layersInitialized` marker rather than "shapes/texts are non-empty", so
// that deliberately deleting every layer down to zero doesn't look like
// un-migrated legacy data and resurrect the old content on the next load.
export function migrateLegacyContentToLayers(s: EditorState): EditorState {
  if (s.layersInitialized) return s;

  const built = buildQuoteCardLayers({
    canvasWidth: s.width,
    canvasHeight: s.height,
    boxWidthPct: s.boxWidth,
    boxHeightPx: Math.round(s.height * 0.32),
    boxStyle: s.boxStyle,
    boxColor: s.boxColor,
    boxGradient: s.boxGradient,
    boxRadius: s.radius,
    boxOpacity: s.opacity,
    boxShadow: s.shadowOn,
    quoteFont: s.quoteFont,
    quoteSize: s.quoteSize,
    quoteWeight: s.quoteWeight,
    quoteItalic: s.quoteItalic,
    quoteAlign: s.quoteAlign,
    textColor: s.textColor,
    authorColor: s.authorColor,
    taglineColor: s.taglineColor,
    quoteText: s.quote,
    nameText: s.name,
    taglineText: s.tagline,
    avatarSrc: s.avatar,
  });

  return {
    ...s,
    shapes: [...getShapeLayers(s), ...built.shapes],
    texts: [...getTextLayers(s), ...built.texts],
    images: [...getImageLayers(s), ...built.images],
    quote: "",
    name: "",
    tagline: "",
    layersInitialized: true,
  };
}

// --- Images gallery helpers -------------------------------------------
// Small pure functions so QuoteCanvas (drag/resize on the canvas) and
// LeftPanel (the sidebar list + upload button) share one definition of how
// the gallery is read and mutated, instead of duplicating the array math.

export function getImageLayers(s: EditorState): ImageLayer[] {
  return s.images ?? [];
}

function newLayerId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Staggers each new layer slightly so dropping several in a row doesn't
// stack them in one unmovable pile — every next one lands a bit further
// down/right, still well inside the canvas.
//
// Default width is at least half the canvas width, not a flat 200px — on a
// large canvas a flat 200px lands small enough to be hard to spot and a
// fiddly target to grab/drag; scaling with the canvas keeps a freshly
// added image comfortably visible and easy to grab no matter the canvas
// size. Height is deliberately left unset ("auto"/aspect-ratio-driven, the
// normal default for an untouched image) rather than also forced to 50%
// canvas height — the image should show at its own original proportions
// (just scaled up/down to a visible width), not stretched/cropped into a
// box shaped by the canvas's own aspect ratio.
function makeImageLayer(position: number, src: string, canvasWidth: number): ImageLayer {
  const offset = (position % 6) * 6;
  const minVisibleWidth = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth * 0.5 : 200;
  return {
    id: newLayerId(),
    src,
    x: 50 + offset,
    y: 30 + offset,
    size: Math.round(Math.max(200, minVisibleWidth)),
    radius: 0,
    shadow: false,
    shadowBlur: 24,
    layer: "front",
  };
}

export function withImageAdded(s: EditorState, src: string): ImageLayer[] {
  const list = getImageLayers(s);
  return [makeImageLayer(0, src, s.width), ...list];
}

// Batched multi-file add — prepends every src in one array update
export function withImagesAdded(
  s: EditorState,
  srcs: string[],
): { list: ImageLayer[]; layerOrder: UnifiedLayerRef[]; newIds: string[] } {
  const list = getImageLayers(s);
  const newLayers = srcs.map((src, i) => makeImageLayer(list.length + i, src, s.width));
  const newImages = [...list, ...newLayers];
  const newRefs: UnifiedLayerRef[] = newLayers.map((img) => ({ kind: "image" as const, id: img.id }));
  const layerOrder = [...getUnifiedLayers(s), ...newRefs];
  return { list: newImages, layerOrder, newIds: newLayers.map((n) => n.id) };
}

export function withImageUpdated(
  s: EditorState,
  id: string,
  patch: Partial<Omit<ImageLayer, "id">>,
): ImageLayer[] {
  return getImageLayers(s).map((img) => (img.id === id ? { ...img, ...patch } : img));
}

export function withImageRemoved(s: EditorState, id: string): ImageLayer[] {
  return getImageLayers(s).filter((img) => img.id !== id);
}

// Clones the image right next to itself (slightly offset so the copy isn't
// hidden exactly underneath the original) and returns it, so the caller can
// select it immediately after duplicating.
export function withImageDuplicated(s: EditorState, id: string): { list: ImageLayer[]; newId: string } {
  const list = getImageLayers(s);
  const idx = list.findIndex((img) => img.id === id);
  if (idx === -1) return { list, newId: id };
  const src = list[idx]!;
  const copy: ImageLayer = { ...src, id: newLayerId(), x: src.x + 4, y: src.y + 4 };
  return { list: [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)], newId: copy.id };
}

export function withImageReordered(s: EditorState, id: string, direction: "up" | "down"): ImageLayer[] {
  const list = [...getImageLayers(s)];
  const idx = list.findIndex((img) => img.id === id);
  if (idx === -1) return list;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= list.length) return list;
  const item = list[idx]!;
  list.splice(idx, 1);
  list.splice(target, 0, item);
  return list;
}

// Batch image helpers — same shape/reasoning as withShapesUpdated/
// withShapesLockSet/withShapesAligned/withShapesShifted in the Shapes
// section below, for the multi-select Image toolbar's own Arrange/Align/
// Advanced panel (withUnifiedLayersReordered above is already kind-
// agnostic, so it's reused as-is for images — no image-specific arrange
// helper needed).
export function withImagesUpdated(
  s: EditorState,
  ids: string[],
  patch: Partial<Omit<ImageLayer, "id">>,
): ImageLayer[] {
  const idSet = new Set(ids);
  return getImageLayers(s).map((img) => (idSet.has(img.id) && !img.locked ? { ...img, ...patch } : img));
}

export function withImagesLockSet(s: EditorState, ids: string[], locked: boolean): ImageLayer[] {
  const idSet = new Set(ids);
  return getImageLayers(s).map((img) => (idSet.has(img.id) ? { ...img, locked } : img));
}

export function withImagesAligned(s: EditorState, ids: string[], edge: ShapeAlignEdge): ImageLayer[] {
  const idSet = new Set(ids);
  return getImageLayers(s).map((img) => {
    if (!idSet.has(img.id) || img.locked) return img;
    const w = img.size;
    const h = img.height ?? img.size;
    switch (edge) {
      case "left":
        return { ...img, x: (w / 2 / s.width) * 100 };
      case "center-h":
        return { ...img, x: 50 };
      case "right":
        return { ...img, x: 100 - (w / 2 / s.width) * 100 };
      case "top":
        return { ...img, y: (h / 2 / s.height) * 100 };
      case "middle-v":
        return { ...img, y: 50 };
      case "bottom":
        return { ...img, y: 100 - (h / 2 / s.height) * 100 };
      default:
        return img;
    }
  });
}

export function withImagesShifted(s: EditorState, ids: string[], dxPercent: number, dyPercent: number): ImageLayer[] {
  const idSet = new Set(ids);
  return getImageLayers(s).map((img) =>
    idSet.has(img.id) && !img.locked ? { ...img, x: img.x + dxPercent, y: img.y + dyPercent } : img,
  );
}

// --- Text gallery helpers -----------------------------------------------
// Same shape as the images gallery helpers above, for extra draggable text
// blocks beyond the fixed quote/name/tagline.

export function getTextLayers(s: EditorState): TextLayer[] {
  return s.texts ?? [];
}

function isDarkBg(bg: string): boolean {
  if (!bg) return false;
  if (bg.startsWith("#")) {
    const hex = bg.replace("#", "");
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 < 140;
    }
  }
  return bg.includes("gradient") || bg.includes("black") || bg.includes("dark") || bg.includes("#0") || bg.includes("#1");
}

function makeTextLayer(
  _position: number,
  opts?: {
    text?: string;
    size?: number;
    weight?: number;
    color?: string;
    fontFamily?: string;
    width?: number;
    x?: number;
    y?: number;
    align?: "left" | "center" | "right" | "justify";
  },
): TextLayer {
  return {
    id: newLayerId(),
    text: opts?.text ?? "New text",
    x: opts?.x ?? 50,
    y: opts?.y ?? 50,
    size: opts?.size ?? 32,
    color: opts?.color ?? "#0d0d12",
    fontFamily: opts?.fontFamily ?? '"Outfit", sans-serif',
    weight: opts?.weight ?? 600,
    align: opts?.align ?? "center",
    italic: false,
    underline: false,
    strike: false,
    ...(opts?.width !== undefined ? { width: opts.width } : {}),
  };
}

export function withTextAdded(
  s: EditorState,
  opts?: {
    text?: string;
    size?: number;
    weight?: number;
    color?: string;
    fontFamily?: string;
    width?: number;
    x?: number;
    y?: number;
    align?: "left" | "center" | "right" | "justify";
  },
): { list: TextLayer[]; layerOrder: UnifiedLayerRef[]; newId: string } {
  const list = getTextLayers(s);
  const dark = isDarkBg(s.background);
  const fallbackColor = dark ? "#ffffff" : "#0d0d12";
  const newText = makeTextLayer(list.length, { ...opts, color: opts?.color ?? fallbackColor });
  const newTexts = [...list, newText];
  const layerOrder = [...getUnifiedLayers(s), { kind: "text" as const, id: newText.id }];
  return { list: newTexts, layerOrder, newId: newText.id };
}

export function withTextUpdated(
  s: EditorState,
  id: string,
  patch: Partial<Omit<TextLayer, "id">>,
): TextLayer[] {
  return getTextLayers(s).map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function withTextRemoved(s: EditorState, id: string): TextLayer[] {
  return getTextLayers(s).filter((t) => t.id !== id);
}

export function withTextDuplicated(s: EditorState, id: string): { list: TextLayer[]; newId: string } {
  const list = getTextLayers(s);
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return { list, newId: id };
  const src = list[idx]!;
  const copy: TextLayer = { ...src, id: newLayerId(), x: src.x + 4, y: src.y + 4 };
  return { list: [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)], newId: copy.id };
}

export function withTextReordered(s: EditorState, id: string, direction: "up" | "down"): TextLayer[] {
  const list = [...getTextLayers(s)];
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return list;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= list.length) return list;
  const item = list[idx]!;
  list.splice(idx, 1);
  list.splice(target, 0, item);
  return list;
}

// --- Shapes gallery helpers ----------------------------------------------
// Same shape as the images/text gallery helpers above.

export function getShapeLayers(s: EditorState): ShapeLayer[] {
  return s.shapes ?? [];
}

function makeShapeLayer(position: number, kind: ShapeKind, radius: number): ShapeLayer {
  const offset = (position % 6) * 6;
  return {
    id: newLayerId(),
    kind,
    x: 50 + offset,
    y: 50 + offset,
    size: 200,
    color: "#0021ff",
    opacity: 100,
    radius,
    shadow: false,
    shadowBlur: 24,
    layer: "front",
  };
}

export function withShapeAdded(
  s: EditorState,
  kind: ShapeKind,
  radius: number,
): { list: ShapeLayer[]; layerOrder: UnifiedLayerRef[]; newId: string } {
  const list = getShapeLayers(s);
  const newShape = makeShapeLayer(list.length, kind, radius);
  const newShapes = [...list, newShape];
  const layerOrder = [...getUnifiedLayers(s), { kind: "shape" as const, id: newShape.id }];
  return { list: newShapes, layerOrder, newId: newShape.id };
}

export function withShapeUpdated(
  s: EditorState,
  id: string,
  patch: Partial<Omit<ShapeLayer, "id">>,
): ShapeLayer[] {
  return getShapeLayers(s).map((sh) => (sh.id === id ? { ...sh, ...patch } : sh));
}

// Same as withShapeUpdated but applies one patch to every id in a multi-
// selection at once (e.g. the top toolbar's batch color/dimension controls
// when several shapes are selected together) — locked shapes are skipped,
// same guard withMultipleLayersRemoved below already uses for deletion.
export function withShapesUpdated(
  s: EditorState,
  ids: string[],
  patch: Partial<Omit<ShapeLayer, "id">>,
): ShapeLayer[] {
  const idSet = new Set(ids);
  return getShapeLayers(s).map((sh) => (idSet.has(sh.id) && !sh.locked ? { ...sh, ...patch } : sh));
}

// Toggles the locked flag itself across a multi-selection — deliberately
// NOT routed through withShapesUpdated above, since that skips already-
// locked shapes (protecting them from bulk color/dimension edits); a
// lock/unlock control has to reach locked shapes too, or "Unlock All"
// could never actually unlock anything.
export function withShapesLockSet(s: EditorState, ids: string[], locked: boolean): ShapeLayer[] {
  const idSet = new Set(ids);
  return getShapeLayers(s).map((sh) => (idSet.has(sh.id) ? { ...sh, locked } : sh));
}

export function withShapeRemoved(s: EditorState, id: string): ShapeLayer[] {
  return getShapeLayers(s).filter((sh) => sh.id !== id);
}

export function withShapeDuplicated(s: EditorState, id: string): { list: ShapeLayer[]; newId: string } {
  const list = getShapeLayers(s);
  const idx = list.findIndex((sh) => sh.id === id);
  if (idx === -1) return { list, newId: id };
  const src = list[idx]!;
  const copy: ShapeLayer = { ...src, id: newLayerId(), x: src.x + 4, y: src.y + 4 };
  return { list: [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)], newId: copy.id };
}

export function withShapeReordered(s: EditorState, id: string, direction: "up" | "down"): ShapeLayer[] {
  const list = [...getShapeLayers(s)];
  const idx = list.findIndex((sh) => sh.id === id);
  if (idx === -1) return list;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= list.length) return list;
  const item = list[idx]!;
  list.splice(idx, 1);
  list.splice(target, 0, item);
  return list;
}

export function withShadowAdded(s: EditorState, preset: ShadowPreset): { list: ShapeLayer[]; newId: string } {
  const list = getShapeLayers(s);
  const newId = newLayerId();
  const shadowLayer: ShapeLayer = {
    id: newId,
    kind: "rect",
    x: preset.x,
    y: preset.y,
    size: preset.width,
    height: preset.height,
    style: "gradient",
    gradient: preset.gradient,
    color: "#000000",
    opacity: preset.opacity ?? 90,
    radius: preset.radius ?? 0,
    layer: "behind",
    shadow: false,
    shadowBlur: 0,
  };
  return { list: [shadowLayer, ...list], newId };
}

// --- Unified Layer Stacking Helper ---------------------------------------
export type UnifiedLayerRef = { kind: "text" | "image" | "shape"; id: string };

export function getUnifiedLayers(s: EditorState): UnifiedLayerRef[] {
  const texts = s.texts ?? [];
  const images = s.images ?? [];
  const shapes = s.shapes ?? [];
  const totalCount = texts.length + images.length + shapes.length;

  if (totalCount === 0) return [];

  const allKnown = new Map<string, UnifiedLayerRef>();
  for (let i = 0; i < texts.length; i++) allKnown.set(texts[i]!.id, { kind: "text", id: texts[i]!.id });
  for (let i = 0; i < images.length; i++) allKnown.set(images[i]!.id, { kind: "image", id: images[i]!.id });
  for (let i = 0; i < shapes.length; i++) allKnown.set(shapes[i]!.id, { kind: "shape", id: shapes[i]!.id });

  if (!s.layerOrder || s.layerOrder.length === 0) {
    const shapesBehind: UnifiedLayerRef[] = [];
    const shapesFront: UnifiedLayerRef[] = [];
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i]!;
      if (sh.layer === "behind") shapesBehind.push({ kind: "shape", id: sh.id });
      else shapesFront.push({ kind: "shape", id: sh.id });
    }
    const imgRefs: UnifiedLayerRef[] = images.map((img) => ({ kind: "image" as const, id: img.id }));
    const textRefs: UnifiedLayerRef[] = texts.map((t) => ({ kind: "text" as const, id: t.id }));
    return [...shapesBehind, ...imgRefs, ...shapesFront, ...textRefs];
  }

  const result: UnifiedLayerRef[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < s.layerOrder.length; i++) {
    const item = s.layerOrder[i]!;
    if (allKnown.has(item.id)) {
      result.push(item);
      seen.add(item.id);
    }
  }

  for (const [id, ref] of allKnown.entries()) {
    if (!seen.has(id)) {
      result.push(ref);
    }
  }

  return result;
}

export function withUnifiedLayerReordered(
  s: EditorState,
  id: string,
  direction: "up" | "down",
): { layerOrder: UnifiedLayerRef[] } {
  const currentStack = getUnifiedLayers(s);
  const idx = currentStack.findIndex((item) => item.id === id);
  if (idx === -1) return { layerOrder: currentStack };

  const targetIdx = direction === "up" ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= currentStack.length) return { layerOrder: currentStack };

  const nextStack = [...currentStack];
  const item = nextStack[idx]!;
  nextStack.splice(idx, 1);
  nextStack.splice(targetIdx, 0, item);

  return { layerOrder: nextStack };
}

export function withUnifiedLayersReordered(
  s: EditorState,
  ids: string[],
  direction: "forward" | "backward" | "front" | "back",
): { layerOrder: UnifiedLayerRef[] } {
  const idSet = new Set(ids);
  const stack = getUnifiedLayers(s);

  if (direction === "front" || direction === "back") {
    const selectedItems = stack.filter((item) => idSet.has(item.id));
    const otherItems = stack.filter((item) => !idSet.has(item.id));
    if (selectedItems.length === 0) return { layerOrder: stack };
    return {
      layerOrder: direction === "front" ? [...otherItems, ...selectedItems] : [...selectedItems, ...otherItems],
    };
  }

  const next = [...stack];
  if (direction === "forward") {
    for (let i = next.length - 2; i >= 0; i--) {
      if (idSet.has(next[i]!.id) && !idSet.has(next[i + 1]!.id)) {
        const tmp = next[i]!;
        next[i] = next[i + 1]!;
        next[i + 1] = tmp;
      }
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (idSet.has(next[i]!.id) && !idSet.has(next[i - 1]!.id)) {
        const tmp = next[i]!;
        next[i] = next[i - 1]!;
        next[i - 1] = tmp;
      }
    }
  }
  return { layerOrder: next };
}

export function getArrangeEligibility(
  sOrStack: EditorState | UnifiedLayerRef[],
  ids: string[] | string,
): {
  canForward: boolean;
  canBackward: boolean;
  canFront: boolean;
  canBack: boolean;
} {
  const targetIds = Array.isArray(ids) ? ids : [ids];
  if (targetIds.length === 0) {
    return { canForward: false, canBackward: false, canFront: false, canBack: false };
  }
  const stack = Array.isArray(sOrStack) ? sOrStack : getUnifiedLayers(sOrStack);
  if (stack.length <= 1) {
    return { canForward: false, canBackward: false, canFront: false, canBack: false };
  }

  if (targetIds.length === 1) {
    const targetId = targetIds[0];
    const idx = stack.findIndex((item) => item.id === targetId);
    if (idx === -1) {
      return { canForward: false, canBackward: false, canFront: false, canBack: false };
    }
    const isTop = idx === stack.length - 1;
    const isBottom = idx === 0;
    return {
      canForward: !isTop,
      canFront: !isTop,
      canBackward: !isBottom,
      canBack: !isBottom,
    };
  }

  const idSet = new Set(targetIds);
  const selectedIndices: number[] = [];
  for (let i = 0; i < stack.length; i++) {
    if (idSet.has(stack[i]!.id)) selectedIndices.push(i);
  }

  if (selectedIndices.length === 0) {
    return { canForward: false, canBackward: false, canFront: false, canBack: false };
  }

  const canForward = selectedIndices.some(
    (i) => i < stack.length - 1 && !idSet.has(stack[i + 1]!.id),
  );
  const canBackward = selectedIndices.some(
    (i) => i > 0 && !idSet.has(stack[i - 1]!.id),
  );
  const isAllAtTop = selectedIndices.every(
    (i, idxInSel) => i === stack.length - selectedIndices.length + idxInSel,
  );
  const isAllAtBottom = selectedIndices.every((i, idxInSel) => i === idxInSel);

  return {
    canForward,
    canBackward,
    canFront: !isAllAtTop,
    canBack: !isAllAtBottom,
  };
}

// Align edge, relative to the CANVAS (not the selection's own bounding
// box) — same convention as Canva's own Position panel: each selected
// shape moves independently to line up with the canvas edge/center, using
// its own width/height, rather than lining up against each other.
export type ShapeAlignEdge = "left" | "center-h" | "right" | "top" | "middle-v" | "bottom";

export function withShapesAligned(s: EditorState, ids: string[], edge: ShapeAlignEdge): ShapeLayer[] {
  const idSet = new Set(ids);
  return getShapeLayers(s).map((sh) => {
    if (!idSet.has(sh.id) || sh.locked) return sh;
    const w = sh.size;
    const h = sh.height ?? sh.size;
    switch (edge) {
      case "left":
        return { ...sh, x: (w / 2 / s.width) * 100 };
      case "center-h":
        return { ...sh, x: 50 };
      case "right":
        return { ...sh, x: 100 - (w / 2 / s.width) * 100 };
      case "top":
        return { ...sh, y: (h / 2 / s.height) * 100 };
      case "middle-v":
        return { ...sh, y: 50 };
      case "bottom":
        return { ...sh, y: 100 - (h / 2 / s.height) * 100 };
      default:
        return sh;
    }
  });
}

// Shifts every selected shape by the same delta (in canvas % — same units
// x/y are already stored in) — used by the multi-select "Advanced" panel's
// X/Y fields to move the whole group together: the caller works out
// dxPercent/dyPercent from the desired new group position vs the group's
// current bounding box, this just applies that one delta uniformly.
export function withShapesShifted(s: EditorState, ids: string[], dxPercent: number, dyPercent: number): ShapeLayer[] {
  const idSet = new Set(ids);
  return getShapeLayers(s).map((sh) =>
    idSet.has(sh.id) && !sh.locked ? { ...sh, x: sh.x + dxPercent, y: sh.y + dyPercent } : sh,
  );
}

export function withMultipleLayersRemoved(
  s: EditorState,
  selected: { kind: "text" | "image" | "shape"; id: string }[],
): {
  texts: TextLayer[];
  images: ImageLayer[];
  shapes: ShapeLayer[];
  layerOrder: UnifiedLayerRef[];
} {
  const textIds = new Set(selected.filter((item) => item.kind === "text").map((item) => item.id));
  const imageIds = new Set(selected.filter((item) => item.kind === "image").map((item) => item.id));
  const shapeIds = new Set(selected.filter((item) => item.kind === "shape").map((item) => item.id));

  const texts = (s.texts ?? []).filter((t) => !textIds.has(t.id) || t.locked);
  const images = (s.images ?? []).filter((img) => !imageIds.has(img.id) || img.locked);
  const shapes = (s.shapes ?? []).filter((sh) => !shapeIds.has(sh.id) || sh.locked);

  const deletedIds = new Set([
    ...(s.texts ?? []).filter((t) => textIds.has(t.id) && !t.locked).map((t) => t.id),
    ...(s.images ?? []).filter((img) => imageIds.has(img.id) && !img.locked).map((img) => img.id),
    ...(s.shapes ?? []).filter((sh) => shapeIds.has(sh.id) && !sh.locked).map((sh) => sh.id),
  ]);

  const layerOrder = getUnifiedLayers(s).filter((item) => !deletedIds.has(item.id));

  return { texts, images, shapes, layerOrder };
}

// Duplicates every id in a multi-selection at once — same shape of input as
// withMultipleLayersRemoved above, used for the Alt+drag "duplicate the
// whole group" gesture in QuoteCanvas (single-item Alt+drag already used
// withTextDuplicated/withImageDuplicated/withShapeDuplicated directly; this
// is the batch equivalent so a multi-selection can be duplicated in one
// state update instead of one id at a time). Each copy keeps its original's
// exact x/y (no offset) — the caller immediately starts dragging the copies
// from the mouse's current position, so an offset here would just be
// discarded the instant the drag's own first move event lands. `newSelection`
// carries each copy's starting x/y along with its kind/id so the caller can
// seed a group-drag baseline without a second lookup pass; locked layers are
// skipped (not duplicated), same guard every other bulk operation here uses.
export function withMultipleLayersDuplicated(
  s: EditorState,
  selected: { kind: "text" | "image" | "shape"; id: string }[],
): {
  texts: TextLayer[];
  images: ImageLayer[];
  shapes: ShapeLayer[];
  layerOrder: UnifiedLayerRef[];
  newSelection: { kind: "text" | "image" | "shape"; id: string; startX: number; startY: number }[];
} {
  const textIds = new Set(selected.filter((item) => item.kind === "text").map((item) => item.id));
  const imageIds = new Set(selected.filter((item) => item.kind === "image").map((item) => item.id));
  const shapeIds = new Set(selected.filter((item) => item.kind === "shape").map((item) => item.id));

  const newSelection: { kind: "text" | "image" | "shape"; id: string; startX: number; startY: number }[] = [];
  const newRefs: UnifiedLayerRef[] = [];

  const texts = getTextLayers(s).flatMap((t) => {
    if (!textIds.has(t.id) || t.locked) return [t];
    const copy: TextLayer = { ...t, id: newLayerId() };
    newSelection.push({ kind: "text", id: copy.id, startX: copy.x, startY: copy.y });
    newRefs.push({ kind: "text", id: copy.id });
    return [t, copy];
  });
  const images = getImageLayers(s).flatMap((img) => {
    if (!imageIds.has(img.id) || img.locked) return [img];
    const copy: ImageLayer = { ...img, id: newLayerId() };
    newSelection.push({ kind: "image", id: copy.id, startX: copy.x, startY: copy.y });
    newRefs.push({ kind: "image", id: copy.id });
    return [img, copy];
  });
  const shapes = getShapeLayers(s).flatMap((sh) => {
    if (!shapeIds.has(sh.id) || sh.locked) return [sh];
    const copy: ShapeLayer = { ...sh, id: newLayerId() };
    newSelection.push({ kind: "shape", id: copy.id, startX: copy.x, startY: copy.y });
    newRefs.push({ kind: "shape", id: copy.id });
    return [sh, copy];
  });

  const layerOrder = [...getUnifiedLayers(s), ...newRefs];

  return { texts, images, shapes, layerOrder, newSelection };
}

// Batch text utilities — mirrors withShapesAligned / withShapesShifted /
// withShapesUpdated / withShapesLockSet for a multi-text selection.

export function withTextsAligned(s: EditorState, ids: string[], edge: ShapeAlignEdge): TextLayer[] {
  const idSet = new Set(ids);
  return getTextLayers(s).map((t) => {
    if (!idSet.has(t.id) || t.locked) return t;
    const el = typeof document !== "undefined"
      ? (document.querySelector(`[data-layer-id="${t.id}"]`) as HTMLElement | null)
      : null;
    const w = el ? el.offsetWidth : (t.width ?? 400);
    const h = el ? el.offsetHeight : (t.minHeight ?? t.size * 1.3);
    switch (edge) {
      case "left":      return { ...t, x: (w / 2 / s.width) * 100 };
      case "center-h":  return { ...t, x: 50 };
      case "right":     return { ...t, x: 100 - (w / 2 / s.width) * 100 };
      case "top":       return { ...t, y: (h / 2 / s.height) * 100 };
      case "middle-v":  return { ...t, y: 50 };
      case "bottom":    return { ...t, y: 100 - (h / 2 / s.height) * 100 };
      default:          return t;
    }
  });
}

export function withTextsShifted(s: EditorState, ids: string[], dxPercent: number, dyPercent: number): TextLayer[] {
  const idSet = new Set(ids);
  return getTextLayers(s).map((t) =>
    idSet.has(t.id) && !t.locked ? { ...t, x: t.x + dxPercent, y: t.y + dyPercent } : t,
  );
}

export function withTextsUpdated(
  s: EditorState,
  ids: string[],
  patch: Partial<Omit<TextLayer, "id">>,
): TextLayer[] {
  const idSet = new Set(ids);
  return getTextLayers(s).map((t) =>
    idSet.has(t.id) && !t.locked ? { ...t, ...patch } : t,
  );
}

export function withTextsLockSet(s: EditorState, ids: string[], locked: boolean): TextLayer[] {
  const idSet = new Set(ids);
  return getTextLayers(s).map((t) =>
    idSet.has(t.id) ? { ...t, locked } : t,
  );
}

// Cross-kind alignment: aligns every selected layer (text, image, or shape)
// independently against the same canvas edge/center. Each kind still uses
// its own typed helper so all the width/height logic stays consistent.
export type MixedLayerRef = { kind: "text" | "image" | "shape"; id: string };

export function withMixedLayersAligned(
  s: EditorState,
  selected: MixedLayerRef[],
  edge: ShapeAlignEdge,
): { texts: TextLayer[]; images: ImageLayer[]; shapes: ShapeLayer[] } {
  const textIds = selected.filter((l) => l.kind === "text").map((l) => l.id);
  const imageIds = selected.filter((l) => l.kind === "image").map((l) => l.id);
  const shapeIds = selected.filter((l) => l.kind === "shape").map((l) => l.id);
  return {
    texts: textIds.length ? withTextsAligned(s, textIds, edge) : getTextLayers(s),
    images: imageIds.length ? withImagesAligned(s, imageIds, edge) : getImageLayers(s),
    shapes: shapeIds.length ? withShapesAligned(s, shapeIds, edge) : getShapeLayers(s),
  };
}

export function withMixedLayersShifted(
  s: EditorState,
  selected: MixedLayerRef[],
  dxPercent: number,
  dyPercent: number,
): { texts: TextLayer[]; images: ImageLayer[]; shapes: ShapeLayer[] } {
  const textIds = selected.filter((l) => l.kind === "text").map((l) => l.id);
  const imageIds = selected.filter((l) => l.kind === "image").map((l) => l.id);
  const shapeIds = selected.filter((l) => l.kind === "shape").map((l) => l.id);
  return {
    texts: textIds.length ? withTextsShifted(s, textIds, dxPercent, dyPercent) : getTextLayers(s),
    images: imageIds.length ? withImagesShifted(s, imageIds, dxPercent, dyPercent) : getImageLayers(s),
    shapes: shapeIds.length ? withShapesShifted(s, shapeIds, dxPercent, dyPercent) : getShapeLayers(s),
  };
}
