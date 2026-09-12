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
  "b",
  "strong",
  "i",
  "em",
  "u",
  "strike",
  "s",
  "del",
  "span",
  "font",
  "br",
  "div",
  "p",
  "ul",
  "ol",
  "li",
];
const RICH_TEXT_ALLOWED_ATTR = ["style", "color"];
const RICH_TEXT_ALLOWED_STYLE_PROPS = new Set([
  "color",
  "font-weight",
  "font-style",
  "text-decoration",
  "list-style-type",
  "padding-left",
  "margin",
  "font-family",
  "font-size",
  "letter-spacing",
  "line-height",
  "display",
  "text-transform",
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
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function getHexLuminance(hex: string): number {
  if (!hex || typeof hex !== "string") return 255;
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return 255;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function isCanvasBackgroundDark(bg?: string): boolean {
  if (!bg) return false;
  if (bg.includes("gradient")) {
    const matches = bg.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/g);
    if (matches && matches.length > 0) {
      let total = 0;
      for (const m of matches) total += getHexLuminance(m);
      return total / matches.length < 140;
    }
    return true;
  }
  return getHexLuminance(bg) < 140;
}

export type CanvasPreset = { label: string; w: number; h: number };

export type CanvasPresetGroup = {
  key: string;
  label: string;
  presets: CanvasPreset[];
};

// Presets grouped by platform, shown in the New Post size picker
// (NewPostSizePicker.tsx). `key` matches CANVAS_PRESET_GROUP_ICONS in
// SocialPlatformIcons.tsx so each group can show its brand badge.
export const CANVAS_PRESET_GROUPS: CanvasPresetGroup[] = [
  {
    key: "linkedin",
    label: "LinkedIn",
    presets: [
      // Feed matches the app's own default blank-canvas size (see
      // newPostCanvasSize's initial state in index.tsx), so it's the one
      // that shows pre-selected when the New Post dialog first opens.
      { label: "Feed", w: 1200, h: 1500 },
      { label: "Cover Photo (Business)", w: 2256, h: 382 },
      { label: "Cover Photo (Personal)", w: 1584, h: 396 },
      { label: "Celebration Post", w: 2100, h: 1200 },
    ],
  },
  {
    key: "facebook",
    label: "Facebook",
    presets: [
      { label: "News Feed", w: 1200, h: 1200 },
      { label: "Stories", w: 1080, h: 1920 },
      { label: "Cover Photo", w: 1660, h: 624 },
      { label: "Open Graph", w: 2400, h: 1260 },
    ],
  },
  {
    key: "instagram",
    label: "Instagram",
    presets: [
      { label: "Feed - Square", w: 1080, h: 1080 },
      { label: "Feed - Portrait", w: 1080, h: 1350 },
      { label: "Stories", w: 1080, h: 1920 },
      { label: "Reels", w: 1080, h: 1920 },
    ],
  },
  {
    key: "twitter",
    label: "Twitter",
    presets: [
      { label: "One Image", w: 2400, h: 1350 },
      { label: "Two Images", w: 2800, h: 3200 },
      { label: "Cover Photo", w: 2400, h: 800 },
      { label: "Open Graph", w: 2400, h: 1260 },
    ],
  },
  {
    key: "youtube",
    label: "YouTube",
    presets: [{ label: "Video Thumbnail", w: 1280, h: 720 }],
  },
];

// Matches a canvas's current width/height back to the platform preset it
// came from (if any) — e.g. so the header's New Post button can show that
// platform's own icon for the size you're currently working in. Returns
// the group's `key` (matches CANVAS_PRESET_GROUP_ICONS in
// SocialPlatformIcons.tsx) or null for a custom/unmatched size. Several
// presets across different groups share the exact same pixel size (e.g.
// Instagram/LinkedIn/Facebook Stories are all 1080×1920), so on its own
// this just returns whichever group happens to come first — see
// groupHasExactPreset below for how index.tsx breaks that tie in favor of
// whichever specific preset was actually clicked.
export function findCanvasPresetGroupKey(width: number, height: number): string | null {
  for (const group of CANVAS_PRESET_GROUPS) {
    if (group.presets.some((p) => p.w === width && p.h === height)) return group.key;
  }
  return null;
}

// True if `groupKey` has a preset matching width/height exactly. Used to
// validate a remembered "explicitly selected platform" against the CURRENT
// canvas size — e.g. the header keeps showing Instagram's icon after you
// pick Instagram Reels (even though LinkedIn/Facebook Stories share that
// same 1080×1920 size and would otherwise win findCanvasPresetGroupKey's
// first-match search), but automatically stops trusting that memory the
// moment something else (a template, a saved design, undo/redo) changes
// the canvas to a size Instagram Reels no longer matches.
export function groupHasExactPreset(groupKey: string, width: number, height: number): boolean {
  const group = CANVAS_PRESET_GROUPS.find((g) => g.key === groupKey);
  if (!group) return false;
  return group.presets.some((p) => p.w === width && p.h === height);
}

// Whether the current canvas size matches one of LinkedIn's own cover-photo
// presets (Personal/Business) rather than a feed-post-shaped one — used by
// ExportControls to decide which LinkedIn preview mockup actually applies:
// a cover photo is framed on your profile page (LinkedInProfilePreviewDialog),
// completely differently from how a feed post renders
// (PostPreviewDialog), so only one of "LinkedIn Post Preview"/"LinkedIn
// Profile Preview" ever makes sense to offer at a time.
export function isLinkedInCoverPhotoSize(width: number, height: number): boolean {
  const linkedin = CANVAS_PRESET_GROUPS.find((g) => g.key === "linkedin");
  if (!linkedin) return false;
  return linkedin.presets.some(
    (p) => p.label.startsWith("Cover Photo") && p.w === width && p.h === height,
  );
}

// Whether the current canvas size matches LinkedIn's own Feed preset
// exactly — the counterpart check to isLinkedInCoverPhotoSize above, used
// by ExportControls so "LinkedIn Post Preview" only ever offers to mock up
// a size that's actually shaped like a LinkedIn feed post, rather than any
// arbitrary non-cover canvas (an Instagram square, a custom size, etc.)
// that the post-card mockup was never designed to represent.
export function isLinkedInFeedSize(width: number, height: number): boolean {
  const linkedin = CANVAS_PRESET_GROUPS.find((g) => g.key === "linkedin");
  if (!linkedin) return false;
  return linkedin.presets.some((p) => p.label === "Feed" && p.w === width && p.h === height);
}

const CURATED_GRADIENTS = [
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
  {
    label: "Cosmic Aurora",
    value: "linear-gradient(140deg, #030712 0%, #1e1b4b 45%, #0284c7 100%)",
  },
  {
    label: "Royal Sapphire",
    value: "linear-gradient(150deg, #0f172a 0%, #1e3a8a 50%, #3b82f6 100%)",
  },
  {
    label: "Sunset Flare",
    value: "linear-gradient(135deg, #31102f 0%, #9f1239 50%, #fb923c 100%)",
  },
  {
    label: "Golden Luxury",
    value: "linear-gradient(145deg, #1c1917 0%, #78350f 50%, #f59e0b 100%)",
  },
  {
    label: "Clean Minimal",
    value: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)",
  },
];

// The full 180-gradient set from github.com/itmeo/webgradients (MIT
// licensed — "free for personal and commercial use"), transcribed from its
// own gradients.json. Replaces the earlier cosine-palette and gradientti
// sources: this one dataset alone is bigger and more varied than both
// combined, so keeping them too would've meant mostly-redundant entries
// with no real new coverage. CURATED_GRADIENTS above (deeper/moodier dark
// tones this set skews away from) and MONOCHROMATIC_GRADIENTS below (true
// single-hue ramps, which nothing here has either) still fill in what this
// set doesn't cover.
function webGradientCss(deg: number, stops: [string, number][]): string {
  return `linear-gradient(${deg}deg, ${stops.map(([color, pos]) => `${color} ${pos}%`).join(", ")})`;
}
const WEBGRADIENTS: { name: string; deg: number; stops: [string, number][] }[] = [
  {
    name: "Warm Flame",
    deg: 45,
    stops: [
      ["#ff9a9e", 0],
      ["#fad0c4", 99],
      ["#fad0c4", 100],
    ],
  },
  {
    name: "Night Fade",
    deg: 0,
    stops: [
      ["#a18cd1", 0],
      ["#fbc2eb", 100],
    ],
  },
  {
    name: "Spring Warmth",
    deg: 0,
    stops: [
      ["#fad0c4", 0],
      ["#fad0c4", 1],
      ["#ffd1ff", 100],
    ],
  },
  {
    name: "Juicy Peach",
    deg: 90,
    stops: [
      ["#ffecd2", 0],
      ["#fcb69f", 100],
    ],
  },
  {
    name: "Young Passion",
    deg: 90,
    stops: [
      ["#ff8177", 0],
      ["#ff867a", 0],
      ["#ff8c7f", 21],
      ["#f99185", 52],
      ["#cf556c", 78],
      ["#b12a5b", 100],
    ],
  },
  {
    name: "Lady Lips",
    deg: 0,
    stops: [
      ["#ff9a9e", 0],
      ["#fecfef", 99],
      ["#fecfef", 100],
    ],
  },
  {
    name: "Sunny Morning",
    deg: 120,
    stops: [
      ["#f6d365", 0],
      ["#fda085", 100],
    ],
  },
  {
    name: "Rainy Ashville",
    deg: 0,
    stops: [
      ["#fbc2eb", 0],
      ["#a6c1ee", 100],
    ],
  },
  {
    name: "Frozen Dreams",
    deg: 0,
    stops: [
      ["#fdcbf1", 0],
      ["#fdcbf1", 1],
      ["#e6dee9", 100],
    ],
  },
  {
    name: "Winter Neva",
    deg: 120,
    stops: [
      ["#a1c4fd", 0],
      ["#c2e9fb", 100],
    ],
  },
  {
    name: "Dusty Grass",
    deg: 120,
    stops: [
      ["#d4fc79", 0],
      ["#96e6a1", 100],
    ],
  },
  {
    name: "Tempting Azure",
    deg: 120,
    stops: [
      ["#84fab0", 0],
      ["#8fd3f4", 100],
    ],
  },
  {
    name: "Heavy Rain",
    deg: 0,
    stops: [
      ["#cfd9df", 0],
      ["#e2ebf0", 100],
    ],
  },
  {
    name: "Amy Crisp",
    deg: 120,
    stops: [
      ["#a6c0fe", 0],
      ["#f68084", 100],
    ],
  },
  {
    name: "Mean Fruit",
    deg: 120,
    stops: [
      ["#fccb90", 0],
      ["#d57eeb", 100],
    ],
  },
  {
    name: "Lilac Sky",
    deg: 120,
    stops: [
      ["#e0c3fc", 0],
      ["#8ec5fc", 100],
    ],
  },
  {
    name: "Ripe Malinka",
    deg: 120,
    stops: [
      ["#f093fb", 0],
      ["#f5576c", 100],
    ],
  },
  {
    name: "Cloudy Knoxville",
    deg: 120,
    stops: [
      ["#fdfbfb", 0],
      ["#ebedee", 100],
    ],
  },
  {
    name: "Malibu Beach",
    deg: 0,
    stops: [
      ["#4facfe", 0],
      ["#00f2fe", 100],
    ],
  },
  {
    name: "New Life",
    deg: 0,
    stops: [
      ["#43e97b", 0],
      ["#38f9d7", 100],
    ],
  },
  {
    name: "True Sunset",
    deg: 0,
    stops: [
      ["#fa709a", 0],
      ["#fee140", 100],
    ],
  },
  {
    name: "Morpheus Den",
    deg: 0,
    stops: [
      ["#30cfd0", 0],
      ["#330867", 100],
    ],
  },
  {
    name: "Rare Wind",
    deg: 0,
    stops: [
      ["#a8edea", 0],
      ["#fed6e3", 100],
    ],
  },
  {
    name: "Near Moon",
    deg: 0,
    stops: [
      ["#5ee7df", 0],
      ["#b490ca", 100],
    ],
  },
  {
    name: "Wild Apple",
    deg: 0,
    stops: [
      ["#d299c2", 0],
      ["#fef9d7", 100],
    ],
  },
  {
    name: "Saint Petersburg",
    deg: 135,
    stops: [
      ["#f5f7fa", 0],
      ["#c3cfe2", 100],
    ],
  },
  {
    name: "Arielle's Smile",
    deg: 0,
    stops: [
      ["#16d9e3", 0],
      ["#30c7ec", 47],
      ["#46aef7", 100],
    ],
  },
  {
    name: "Plum Plate",
    deg: 135,
    stops: [
      ["#667eea", 0],
      ["#764ba2", 100],
    ],
  },
  {
    name: "Everlasting Sky",
    deg: 135,
    stops: [
      ["#fdfcfb", 0],
      ["#e2d1c3", 100],
    ],
  },
  {
    name: "Happy Fisher",
    deg: 120,
    stops: [
      ["#89f7fe", 0],
      ["#66a6ff", 100],
    ],
  },
  {
    name: "Blessing",
    deg: 0,
    stops: [
      ["#fddb92", 0],
      ["#d1fdff", 100],
    ],
  },
  {
    name: "Sharpeye Eagle",
    deg: 0,
    stops: [
      ["#9890e3", 0],
      ["#b1f4cf", 100],
    ],
  },
  {
    name: "Ladoga Bottom",
    deg: 0,
    stops: [
      ["#ebc0fd", 0],
      ["#d9ded8", 100],
    ],
  },
  {
    name: "Lemon Gate",
    deg: 0,
    stops: [
      ["#96fbc4", 0],
      ["#f9f586", 100],
    ],
  },
  {
    name: "Itmeo Branding",
    deg: 180,
    stops: [
      ["#2af598", 0],
      ["#009efd", 100],
    ],
  },
  {
    name: "Zeus Miracle",
    deg: 0,
    stops: [
      ["#cd9cf2", 0],
      ["#f6f3ff", 100],
    ],
  },
  {
    name: "Old Hat",
    deg: 0,
    stops: [
      ["#e4afcb", 0],
      ["#b8cbb8", 0],
      ["#b8cbb8", 0],
      ["#e2c58b", 30],
      ["#c2ce9c", 64],
      ["#7edbdc", 100],
    ],
  },
  {
    name: "Star Wine",
    deg: 0,
    stops: [
      ["#b8cbb8", 0],
      ["#b8cbb8", 0],
      ["#b465da", 0],
      ["#cf6cc9", 33],
      ["#ee609c", 66],
      ["#ee609c", 100],
    ],
  },
  {
    name: "Deep Blue",
    deg: 120,
    stops: [
      ["#e0c3fc", 0],
      ["#8ec5fc", 100],
    ],
  },
  {
    name: "Coup de Grace",
    deg: 0,
    stops: [
      ["#DCD9D4", 0],
      ["#DCD9D4", 100],
    ],
  },
  {
    name: "Happy Acid",
    deg: 0,
    stops: [
      ["#37ecba", 0],
      ["#72afd3", 100],
    ],
  },
  {
    name: "Awesome Pine",
    deg: 0,
    stops: [
      ["#ebbba7", 0],
      ["#cfc7f8", 100],
    ],
  },
  {
    name: "New York",
    deg: 0,
    stops: [
      ["#fff1eb", 0],
      ["#ace0f9", 100],
    ],
  },
  {
    name: "Shy Rainbow",
    deg: 0,
    stops: [
      ["#eea2a2", 0],
      ["#bbc1bf", 19],
      ["#57c6e1", 42],
    ],
  },
  {
    name: "Loon Crest",
    deg: 0,
    stops: [
      ["#989898", 0],
      ["#989898", 100],
    ],
  },
  {
    name: "Mixed Hopes",
    deg: 0,
    stops: [
      ["#c471f5", 0],
      ["#fa71cd", 100],
    ],
  },
  {
    name: "Fly High",
    deg: 0,
    stops: [
      ["#48c6ef", 0],
      ["#6f86d6", 100],
    ],
  },
  {
    name: "Strong Bliss",
    deg: 0,
    stops: [
      ["#f78ca0", 0],
      ["#f9748f", 19],
      ["#fd868c", 60],
    ],
  },
  {
    name: "Fresh Milk",
    deg: 0,
    stops: [
      ["#feada6", 0],
      ["#f5efef", 100],
    ],
  },
  {
    name: "Snow Again",
    deg: 0,
    stops: [
      ["#e6e9f0", 0],
      ["#eef1f5", 100],
    ],
  },
  {
    name: "February Ink",
    deg: 0,
    stops: [
      ["#accbee", 0],
      ["#e7f0fd", 100],
    ],
  },
  {
    name: "Kind Steel",
    deg: -20,
    stops: [
      ["#e9defa", 0],
      ["#fbfcdb", 100],
    ],
  },
  {
    name: "Soft Grass",
    deg: 0,
    stops: [
      ["#c1dfc4", 0],
      ["#deecdd", 100],
    ],
  },
  {
    name: "Grown Early",
    deg: 0,
    stops: [
      ["#0ba360", 0],
      ["#3cba92", 100],
    ],
  },
  {
    name: "Sharp Blues",
    deg: 0,
    stops: [
      ["#00c6fb", 0],
      ["#005bea", 100],
    ],
  },
  {
    name: "Shady Water",
    deg: 0,
    stops: [
      ["#74ebd5", 0],
      ["#9face6", 100],
    ],
  },
  {
    name: "Dirty Beauty",
    deg: 0,
    stops: [
      ["#6a85b6", 0],
      ["#bac8e0", 100],
    ],
  },
  {
    name: "Great Whale",
    deg: 0,
    stops: [
      ["#a3bded", 0],
      ["#6991c7", 100],
    ],
  },
  {
    name: "Teen Notebook",
    deg: 0,
    stops: [
      ["#9795f0", 0],
      ["#fbc8d4", 100],
    ],
  },
  {
    name: "Polite Rumors",
    deg: 0,
    stops: [
      ["#a7a6cb", 0],
      ["#8989ba", 52],
      ["#8989ba", 100],
    ],
  },
  {
    name: "Sweet Period",
    deg: 0,
    stops: [
      ["#3f51b1", 0],
      ["#5a55ae", 13],
      ["#7b5fac", 25],
      ["#8f6aae", 38],
      ["#a86aa4", 50],
      ["#cc6b8e", 62],
      ["#f18271", 75],
      ["#f3a469", 87],
      ["#f7c978", 100],
    ],
  },
  {
    name: "Wide Matrix",
    deg: 0,
    stops: [
      ["#fcc5e4", 0],
      ["#fda34b", 15],
      ["#ff7882", 35],
      ["#c8699e", 52],
      ["#7046aa", 71],
      ["#0c1db8", 87],
      ["#020f75", 100],
    ],
  },
  {
    name: "Soft Cherish",
    deg: 0,
    stops: [
      ["#dbdcd7", 0],
      ["#dddcd7", 24],
      ["#e2c9cc", 30],
      ["#e7627d", 46],
      ["#b8235a", 59],
      ["#801357", 71],
      ["#3d1635", 84],
      ["#1c1a27", 100],
    ],
  },
  {
    name: "Red Salvation",
    deg: 0,
    stops: [
      ["#f43b47", 0],
      ["#453a94", 100],
    ],
  },
  {
    name: "Burning Spring",
    deg: 0,
    stops: [
      ["#4fb576", 0],
      ["#44c489", 30],
      ["#28a9ae", 46],
      ["#28a2b7", 59],
      ["#4c7788", 71],
      ["#6c4f63", 80],
      ["#432c39", 100],
    ],
  },
  {
    name: "Night Party",
    deg: 0,
    stops: [
      ["#0250c5", 0],
      ["#d43f8d", 100],
    ],
  },
  {
    name: "Sky Glider",
    deg: 0,
    stops: [
      ["#88d3ce", 0],
      ["#6e45e2", 100],
    ],
  },
  {
    name: "Heaven Peach",
    deg: 0,
    stops: [
      ["#d9afd9", 0],
      ["#97d9e1", 100],
    ],
  },
  {
    name: "Purple Division",
    deg: 0,
    stops: [
      ["#7028e4", 0],
      ["#e5b2ca", 100],
    ],
  },
  {
    name: "Aqua Splash",
    deg: 15,
    stops: [
      ["#13547a", 0],
      ["#80d0c7", 100],
    ],
  },
  {
    name: "Above Clouds",
    deg: 0,
    stops: [
      ["#BDBBBE", 0],
      ["#9D9EA3", 100],
    ],
  },
  {
    name: "Spiky Naga",
    deg: 0,
    stops: [
      ["#505285", 0],
      ["#585e92", 12],
      ["#65689f", 25],
    ],
  },
  {
    name: "Love Kiss",
    deg: 0,
    stops: [
      ["#ff0844", 0],
      ["#ffb199", 100],
    ],
  },
  {
    name: "Sharp Glass",
    deg: 0,
    stops: [
      ["#C9CCD3", 0],
      ["#C9CCD3", 100],
    ],
  },
  {
    name: "Clean Mirror",
    deg: 45,
    stops: [
      ["#93a5cf", 0],
      ["#e4efe9", 100],
    ],
  },
  {
    name: "Premium Dark",
    deg: 0,
    stops: [
      ["#434343", 0],
      ["#000000", 100],
    ],
  },
  {
    name: "Cold Evening",
    deg: 0,
    stops: [
      ["#0c3483", 0],
      ["#a2b6df", 100],
      ["#6b8cce", 100],
    ],
  },
  {
    name: "Cochiti Lake",
    deg: 45,
    stops: [
      ["#93a5cf", 0],
      ["#e4efe9", 100],
    ],
  },
  {
    name: "Summer Games",
    deg: 0,
    stops: [
      ["#92fe9d", 0],
      ["#00c9ff", 100],
    ],
  },
  {
    name: "Passionate Bed",
    deg: 0,
    stops: [
      ["#ff758c", 0],
      ["#ff7eb3", 100],
    ],
  },
  {
    name: "Mountain Rock",
    deg: 0,
    stops: [
      ["#868f96", 0],
      ["#596164", 100],
    ],
  },
  {
    name: "Desert Hump",
    deg: 0,
    stops: [
      ["#c79081", 0],
      ["#dfa579", 100],
    ],
  },
  {
    name: "Jungle Day",
    deg: 45,
    stops: [
      ["#8baaaa", 0],
      ["#ae8b9c", 100],
    ],
  },
  {
    name: "Phoenix Start",
    deg: 0,
    stops: [
      ["#f83600", 0],
      ["#f9d423", 100],
    ],
  },
  {
    name: "October Silence",
    deg: -20,
    stops: [
      ["#b721ff", 0],
      ["#21d4fd", 100],
    ],
  },
  {
    name: "Faraway River",
    deg: -20,
    stops: [
      ["#6e45e2", 0],
      ["#88d3ce", 100],
    ],
  },
  {
    name: "Alchemist Lab",
    deg: -20,
    stops: [
      ["#d558c8", 0],
      ["#24d292", 100],
    ],
  },
  {
    name: "Over Sun",
    deg: 60,
    stops: [
      ["#abecd6", 0],
      ["#fbed96", 100],
    ],
  },
  {
    name: "Premium White",
    deg: 0,
    stops: [
      ["#d5d4d0", 0],
      ["#d5d4d0", 1],
      ["#eeeeec", 31],
    ],
  },
  {
    name: "Mars Party",
    deg: 0,
    stops: [
      ["#5f72bd", 0],
      ["#9b23ea", 100],
    ],
  },
  {
    name: "Eternal Constance",
    deg: 0,
    stops: [
      ["#09203f", 0],
      ["#537895", 100],
    ],
  },
  {
    name: "Japan Blush",
    deg: -20,
    stops: [
      ["#ddd6f3", 0],
      ["#faaca8", 100],
      ["#faaca8", 100],
    ],
  },
  {
    name: "Smiling Rain",
    deg: -20,
    stops: [
      ["#dcb0ed", 0],
      ["#99c99c", 100],
    ],
  },
  {
    name: "Cloudy Apple",
    deg: 0,
    stops: [
      ["#f3e7e9", 0],
      ["#e3eeff", 99],
      ["#e3eeff", 100],
    ],
  },
  {
    name: "Big Mango",
    deg: 0,
    stops: [
      ["#c71d6f", 0],
      ["#d09693", 100],
    ],
  },
  {
    name: "Healthy Water",
    deg: 60,
    stops: [
      ["#96deda", 0],
      ["#50c9c3", 100],
    ],
  },
  {
    name: "Amour Amour",
    deg: 0,
    stops: [
      ["#f77062", 0],
      ["#fe5196", 100],
    ],
  },
  {
    name: "Risky Concrete",
    deg: 0,
    stops: [
      ["#c4c5c7", 0],
      ["#dcdddf", 52],
      ["#ebebeb", 100],
    ],
  },
  {
    name: "Strong Stick",
    deg: 0,
    stops: [
      ["#a8caba", 0],
      ["#5d4157", 100],
    ],
  },
  {
    name: "Vicious Stance",
    deg: 60,
    stops: [
      ["#29323c", 0],
      ["#485563", 100],
    ],
  },
  {
    name: "Palo Alto",
    deg: -60,
    stops: [
      ["#16a085", 0],
      ["#f4d03f", 100],
    ],
  },
  {
    name: "Happy Memories",
    deg: -60,
    stops: [
      ["#ff5858", 0],
      ["#f09819", 100],
    ],
  },
  {
    name: "Midnight Bloom",
    deg: -20,
    stops: [
      ["#2b5876", 0],
      ["#4e4376", 100],
    ],
  },
  {
    name: "Crystalline",
    deg: -20,
    stops: [
      ["#00cdac", 0],
      ["#8ddad5", 100],
    ],
  },
  {
    name: "Raccoon Back",
    deg: -180,
    stops: [
      ["#BCC5CE", 0],
      ["#929EAD", 98],
    ],
  },
  {
    name: "Party Bliss",
    deg: 0,
    stops: [
      ["#4481eb", 0],
      ["#04befe", 100],
    ],
  },
  {
    name: "Confident Cloud",
    deg: 0,
    stops: [
      ["#dad4ec", 0],
      ["#dad4ec", 1],
      ["#f3e7e9", 100],
    ],
  },
  {
    name: "Le Cocktail",
    deg: 45,
    stops: [
      ["#874da2", 0],
      ["#c43a30", 100],
    ],
  },
  {
    name: "River City",
    deg: 0,
    stops: [
      ["#4481eb", 0],
      ["#04befe", 100],
    ],
  },
  {
    name: "Frozen Berry",
    deg: 0,
    stops: [
      ["#e8198b", 0],
      ["#c7eafd", 100],
    ],
  },
  {
    name: "Elegance",
    deg: 0,
    stops: [
      ["#EADFDF", 59],
      ["#ECE2DF", 100],
    ],
  },
  {
    name: "Child Care",
    deg: -20,
    stops: [
      ["#f794a4", 0],
      ["#fdd6bd", 100],
    ],
  },
  {
    name: "Flying Lemon",
    deg: 60,
    stops: [
      ["#64b3f4", 0],
      ["#c2e59c", 100],
    ],
  },
  {
    name: "New Retrowave",
    deg: 0,
    stops: [
      ["#3b41c5", 0],
      ["#a981bb", 49],
      ["#ffc8a9", 100],
    ],
  },
  {
    name: "Hidden Jaguar",
    deg: 0,
    stops: [
      ["#0fd850", 0],
      ["#f9f047", 100],
    ],
  },
  {
    name: "Above The Sky",
    deg: 0,
    stops: [
      ["#d3d3d3", 0],
      ["#d3d3d3", 1],
      ["#e0e0e0", 26],
    ],
  },
  {
    name: "Nega",
    deg: 45,
    stops: [
      ["#ee9ca7", 0],
      ["#ffdde1", 100],
    ],
  },
  {
    name: "Dense Water",
    deg: 0,
    stops: [
      ["#3ab5b0", 0],
      ["#3d99be", 31],
      ["#56317a", 100],
    ],
  },
  {
    name: "Chemic Aqua",
    deg: 0,
    stops: [
      ["#CDDCDC", 0],
      ["#CDDCDC", 100],
    ],
  },
  {
    name: "Seashore",
    deg: 0,
    stops: [
      ["#209cff", 0],
      ["#68e0cf", 100],
    ],
  },
  {
    name: "Marble Wall",
    deg: 0,
    stops: [
      ["#bdc2e8", 0],
      ["#bdc2e8", 1],
      ["#e6dee9", 100],
    ],
  },
  {
    name: "Cheerful Caramel",
    deg: 0,
    stops: [
      ["#e6b980", 0],
      ["#eacda3", 100],
    ],
  },
  {
    name: "Night Sky",
    deg: 0,
    stops: [
      ["#1e3c72", 0],
      ["#1e3c72", 1],
      ["#2a5298", 100],
    ],
  },
  {
    name: "Magic Lake",
    deg: 0,
    stops: [
      ["#d5dee7", 0],
      ["#ffafbd", 0],
      ["#c9ffbf", 100],
    ],
  },
  {
    name: "Young Grass",
    deg: 0,
    stops: [
      ["#9be15d", 0],
      ["#00e3ae", 100],
    ],
  },
  {
    name: "Colorful Peach",
    deg: 0,
    stops: [
      ["#ed6ea0", 0],
      ["#ec8c69", 100],
    ],
  },
  {
    name: "Gentle Care",
    deg: 0,
    stops: [
      ["#ffc3a0", 0],
      ["#ffafbd", 100],
    ],
  },
  {
    name: "Plum Bath",
    deg: 0,
    stops: [
      ["#cc208e", 0],
      ["#6713d2", 100],
    ],
  },
  {
    name: "Happy Unicorn",
    deg: 0,
    stops: [
      ["#b3ffab", 0],
      ["#12fff7", 100],
    ],
  },
  {
    name: "Full Metal",
    deg: 0,
    stops: [
      ["#D5DEE7", 0],
      ["#E8EBF2", 50],
      ["#E2E7ED", 100],
    ],
  },
  {
    name: "African Field",
    deg: 0,
    stops: [
      ["#65bd60", 0],
      ["#5ac1a8", 25],
      ["#3ec6ed", 50],
    ],
  },
  {
    name: "Solid Stone",
    deg: 0,
    stops: [
      ["#243949", 0],
      ["#517fa4", 100],
    ],
  },
  {
    name: "Orange Juice",
    deg: -20,
    stops: [
      ["#fc6076", 0],
      ["#ff9a44", 100],
    ],
  },
  {
    name: "Glass Water",
    deg: 0,
    stops: [
      ["#dfe9f3", 0],
      ["#ffffff", 100],
    ],
  },
  {
    name: "Slick Carbon",
    deg: 180,
    stops: [
      ["#323232", 0],
      ["#3F3F3F", 40],
      ["#1C1C1C", 150],
    ],
  },
  {
    name: "North Miracle",
    deg: 0,
    stops: [
      ["#00dbde", 0],
      ["#fc00ff", 100],
    ],
  },
  {
    name: "Fruit Blend",
    deg: 0,
    stops: [
      ["#f9d423", 0],
      ["#ff4e50", 100],
    ],
  },
  {
    name: "Millennium Pine",
    deg: 0,
    stops: [
      ["#50cc7f", 0],
      ["#f5d100", 100],
    ],
  },
  {
    name: "High Flight",
    deg: 0,
    stops: [
      ["#0acffe", 0],
      ["#495aff", 100],
    ],
  },
  {
    name: "Mole Hall",
    deg: -20,
    stops: [
      ["#616161", 0],
      ["#9bc5c3", 100],
    ],
  },
  {
    name: "Earl Gray",
    deg: 0,
    stops: [
      ["#E4E4E1", 0],
      ["#E4E4E1", 100],
    ],
  },
  {
    name: "Space Shift",
    deg: 60,
    stops: [
      ["#3d3393", 0],
      ["#2b76b9", 37],
      ["#2cacd1", 65],
      ["#35eb93", 100],
    ],
  },
  {
    name: "Forest Inei",
    deg: 0,
    stops: [
      ["#df89b5", 0],
      ["#bfd9fe", 100],
    ],
  },
  {
    name: "Royal Garden",
    deg: 0,
    stops: [
      ["#ed6ea0", 0],
      ["#ec8c69", 100],
    ],
  },
  {
    name: "Rich Metal",
    deg: 0,
    stops: [
      ["#d7d2cc", 0],
      ["#304352", 100],
    ],
  },
  {
    name: "Juicy Cake",
    deg: 0,
    stops: [
      ["#e14fad", 0],
      ["#f9d423", 100],
    ],
  },
  {
    name: "Smart Indigo",
    deg: 0,
    stops: [
      ["#b224ef", 0],
      ["#7579ff", 100],
    ],
  },
  {
    name: "Sand Strike",
    deg: 0,
    stops: [
      ["#c1c161", 0],
      ["#c1c161", 0],
      ["#d4d4b1", 100],
    ],
  },
  {
    name: "Norse Beauty",
    deg: 0,
    stops: [
      ["#ec77ab", 0],
      ["#7873f5", 100],
    ],
  },
  {
    name: "Aqua Guidance",
    deg: 0,
    stops: [
      ["#007adf", 0],
      ["#00ecbc", 100],
    ],
  },
  {
    name: "Sun Veggie",
    deg: -225,
    stops: [
      ["#20E2D7", 0],
      ["#F9FEA5", 100],
    ],
  },
  {
    name: "Sea Lord",
    deg: -225,
    stops: [
      ["#2CD8D5", 0],
      ["#C5C1FF", 56],
      ["#FFBAC3", 100],
    ],
  },
  {
    name: "Black Sea",
    deg: -225,
    stops: [
      ["#2CD8D5", 0],
      ["#6B8DD6", 48],
      ["#8E37D7", 100],
    ],
  },
  {
    name: "Grass Shampoo",
    deg: -225,
    stops: [
      ["#DFFFCD", 0],
      ["#90F9C4", 48],
      ["#39F3BB", 100],
    ],
  },
  {
    name: "Landing Aircraft",
    deg: -225,
    stops: [
      ["#5D9FFF", 0],
      ["#B8DCFF", 48],
      ["#6BBBFF", 100],
    ],
  },
  {
    name: "Witch Dance",
    deg: -225,
    stops: [
      ["#A8BFFF", 0],
      ["#884D80", 100],
    ],
  },
  {
    name: "Sleepless Night",
    deg: -225,
    stops: [
      ["#5271C4", 0],
      ["#B19FFF", 48],
      ["#ECA1FE", 100],
    ],
  },
  {
    name: "Angel Care",
    deg: -225,
    stops: [
      ["#FFE29F", 0],
      ["#FFA99F", 48],
      ["#FF719A", 100],
    ],
  },
  {
    name: "Crystal River",
    deg: -225,
    stops: [
      ["#22E1FF", 0],
      ["#1D8FE1", 48],
      ["#625EB1", 100],
    ],
  },
  {
    name: "Soft Lipstick",
    deg: -225,
    stops: [
      ["#B6CEE8", 0],
      ["#F578DC", 100],
    ],
  },
  {
    name: "Salt Mountain",
    deg: -225,
    stops: [
      ["#FFFEFF", 0],
      ["#D7FFFE", 100],
    ],
  },
  {
    name: "Perfect White",
    deg: -225,
    stops: [
      ["#E3FDF5", 0],
      ["#FFE6FA", 100],
    ],
  },
  {
    name: "Fresh Oasis",
    deg: -225,
    stops: [
      ["#7DE2FC", 0],
      ["#B9B6E5", 100],
    ],
  },
  {
    name: "Strict November",
    deg: -225,
    stops: [
      ["#CBBACC", 0],
      ["#2580B3", 100],
    ],
  },
  {
    name: "Morning Salad",
    deg: -225,
    stops: [
      ["#B7F8DB", 0],
      ["#50A7C2", 100],
    ],
  },
  {
    name: "Deep Relief",
    deg: -225,
    stops: [
      ["#7085B6", 0],
      ["#87A7D9", 50],
      ["#DEF3F8", 100],
    ],
  },
  {
    name: "Sea Strike",
    deg: -225,
    stops: [
      ["#77FFD2", 0],
      ["#6297DB", 48],
      ["#1EECFF", 100],
    ],
  },
  {
    name: "Night Call",
    deg: -225,
    stops: [
      ["#AC32E4", 0],
      ["#7918F2", 48],
      ["#4801FF", 100],
    ],
  },
  {
    name: "Supreme Sky",
    deg: -225,
    stops: [
      ["#D4FFEC", 0],
      ["#57F2CC", 48],
      ["#4596FB", 100],
    ],
  },
  {
    name: "Light Blue",
    deg: -225,
    stops: [
      ["#9EFBD3", 0],
      ["#57E9F2", 48],
      ["#45D4FB", 100],
    ],
  },
  {
    name: "Mind Crawl",
    deg: -225,
    stops: [
      ["#473B7B", 0],
      ["#3584A7", 51],
      ["#30D2BE", 100],
    ],
  },
  {
    name: "Lily Meadow",
    deg: -225,
    stops: [
      ["#65379B", 0],
      ["#886AEA", 53],
      ["#6457C6", 100],
    ],
  },
  {
    name: "Sugar Lollipop",
    deg: -225,
    stops: [
      ["#A445B2", 0],
      ["#D41872", 52],
      ["#FF0066", 100],
    ],
  },
  {
    name: "Sweet Dessert",
    deg: -225,
    stops: [
      ["#7742B2", 0],
      ["#F180FF", 52],
      ["#FD8BD9", 100],
    ],
  },
  {
    name: "Magic Ray",
    deg: -225,
    stops: [
      ["#FF3CAC", 0],
      ["#562B7C", 52],
      ["#2B86C5", 100],
    ],
  },
  {
    name: "Teen Party",
    deg: -225,
    stops: [
      ["#FF057C", 0],
      ["#8D0B93", 50],
      ["#321575", 100],
    ],
  },
  {
    name: "Frozen Heat",
    deg: -225,
    stops: [
      ["#FF057C", 0],
      ["#7C64D5", 48],
      ["#4CC3FF", 100],
    ],
  },
  {
    name: "Gagarin View",
    deg: -225,
    stops: [
      ["#69EACB", 0],
      ["#EACCF8", 48],
      ["#6654F1", 100],
    ],
  },
  {
    name: "Fabled Sunset",
    deg: -225,
    stops: [
      ["#231557", 0],
      ["#44107A", 29],
      ["#FF1361", 67],
    ],
  },
  {
    name: "Perfect Blue",
    deg: -225,
    stops: [
      ["#3D4E81", 0],
      ["#5753C9", 48],
      ["#6E7FF3", 100],
    ],
  },
];
const GENERATED_GRADIENTS = WEBGRADIENTS.map(({ name, deg, stops }) => ({
  label: name,
  value: webGradientCss(deg, stops),
}));

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

// A true monochromatic ramp per hue (dark tint -> light tint of the SAME
// hue) — none of the three sets above actually have these; they're all
// multi-hue by design. Matches Canva's own "Monochromatic" row, which is
// exactly this: one swatch per hue, each staying within that one hue's own
// shade/tint range rather than blending toward a different color.
const MONOCHROMATIC_HUES: { name: string; hue: number; sat: number }[] = [
  { name: "Gray", hue: 220, sat: 8 },
  { name: "Red", hue: 355, sat: 65 },
  { name: "Orange", hue: 28, sat: 80 },
  { name: "Gold", hue: 45, sat: 75 },
  { name: "Green", hue: 140, sat: 55 },
  { name: "Teal", hue: 175, sat: 60 },
  { name: "Blue", hue: 215, sat: 65 },
  { name: "Purple", hue: 275, sat: 55 },
];
const MONOCHROMATIC_GRADIENTS = MONOCHROMATIC_HUES.map(({ name, hue, sat }) => ({
  label: `${name} Tones`,
  value: `linear-gradient(135deg, ${hsl(hue, sat, 18)} 0%, ${hsl(hue, sat, 45)} 50%, ${hsl(hue, Math.max(15, sat - 20), 82)} 100%)`,
}));

// Auto-classifies a gradient into Canva's own picker groupings (Cool tones
// / Warm tones / Monochromatic) straight from its actual CSS, instead of
// hand-tagging every one of the ~45 gradients above — parses every color
// literal (#hex or rgb(...), covering all three generators above) back to
// HSL, then buckets on hue spread (tight spread + a genuinely single-hue
// ramp = monochromatic, same idea MONOCHROMATIC_GRADIENTS is built from
// directly) and average hue otherwise (warm = reds/oranges/yellows/pinks,
// cool = greens/teals/blues/purples — same split the reference image's
// rows actually land on: greens sit in "Cool tones" there, not "Warm").
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s: s * 100, l: l * 100 };
}
function extractHslColors(css: string): { h: number; s: number; l: number }[] {
  const colors: { h: number; s: number; l: number }[] = [];
  const hexRe = /#([0-9a-fA-F]{6})/g;
  for (const m of css.matchAll(hexRe)) {
    const n = parseInt(m[1]!, 16);
    colors.push(rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255));
  }
  const rgbRe = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g;
  for (const m of css.matchAll(rgbRe)) {
    colors.push(rgbToHsl(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  const hslRe = /hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)/g;
  for (const m of css.matchAll(hslRe)) {
    colors.push({ h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) });
  }
  return colors;
}
function classifyGradient(css: string): "cool" | "warm" | "monochromatic" {
  const colors = extractHslColors(css);
  if (colors.length === 0) return "cool";
  const avgSat = colors.reduce((sum, c) => sum + c.s, 0) / colors.length;
  // Circular hue spread: max pairwise angular distance, not a plain
  // max-min (hue wraps at 360, so red at 355 and 5 are actually adjacent).
  const angDist = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  let spread = 0;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      spread = Math.max(spread, angDist(colors[i]!.h, colors[j]!.h));
    }
  }
  if (avgSat < 18 || spread < 20) return "monochromatic";
  // Circular mean hue via averaging unit vectors — a plain arithmetic mean
  // breaks the same way min/max does across the 360/0 wrap.
  const sumX = colors.reduce((s, c) => s + Math.cos((c.h * Math.PI) / 180), 0);
  const sumY = colors.reduce((s, c) => s + Math.sin((c.h * Math.PI) / 180), 0);
  const avgHue = ((Math.atan2(sumY, sumX) * 180) / Math.PI + 360) % 360;
  return avgHue <= 75 || avgHue >= 300 ? "warm" : "cool";
}

export type GradientCategory = "cool" | "warm" | "monochromatic";
export const GRADIENTS: { label: string; value: string; category: GradientCategory }[] = [
  ...CURATED_GRADIENTS,
  ...GENERATED_GRADIENTS,
  ...MONOCHROMATIC_GRADIENTS,
].map((g) => ({ ...g, category: classifyGradient(g.value) }));

// Parses an arbitrary linear-/radial-gradient() CSS string back into its
// angle and ordered color stops — the piece every "Custom" gradient editor
// in the app (BackgroundSelectionToolbar, and the two in LeftPanel) was
// missing. None of them ever read the CURRENTLY APPLIED background back
// into their own start/mid/end/accent2 fields on open — Custom always
// showed its own leftover local state (defaults, or whatever was last
// typed in there this session) with zero connection to whatever preset the
// user had actually just picked from the gallery. That's the "gradient
// doesn't show in Custom" bug: it wasn't SOME gradients failing, it was
// EVERY preset, since nothing ever synced them in the first place.
export function parseGradientCss(
  css: string,
): { type: "linear" | "radial"; angle: number; stops: { color: string; pos: number }[] } | null {
  const trimmed = css.trim();
  const isRadial = trimmed.startsWith("radial-gradient");
  const isLinear = trimmed.startsWith("linear-gradient");
  if (!isRadial && !isLinear) return null;

  const open = trimmed.indexOf("(");
  const close = trimmed.lastIndexOf(")");
  if (open < 0 || close < 0) return null;
  const inner = trimmed.slice(open + 1, close);

  // Split on top-level commas only — rgba(...)/hsla(...) stops have their
  // own internal commas that must NOT split the list.
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  if (parts.length === 0) return null;

  let angle = 135;
  let stopParts = parts;
  const first = parts[0] ?? "";
  if (isLinear && /^-?\d+(\.\d+)?deg$/.test(first)) {
    angle = parseFloat(first);
    stopParts = parts.slice(1);
  } else if (!/^(#|rgba?\(|hsla?\()/i.test(first)) {
    // Non-angle, non-color leading token — e.g. "to right" (linear) or
    // "circle at center" (radial). Not a stop; drop it.
    stopParts = parts.slice(1);
  }

  const colorStopRe = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))\s*(-?\d+(?:\.\d+)?)?%?/;
  const stops = stopParts
    .map((p, i) => {
      const m = p.match(colorStopRe);
      if (!m) return null;
      const pos = m[2] !== undefined ? Number(m[2]) : (i / Math.max(1, stopParts.length - 1)) * 100;
      return { color: m[1]!, pos };
    })
    .filter((s): s is { color: string; pos: number } => s !== null);

  return stops.length > 0 ? { type: isRadial ? "radial" : "linear", angle, stops } : null;
}

// Reduces an arbitrary-length stop list down to the 2-4 stops every
// Custom gradient editor's UI actually has fields for (start, optional
// mid, optional accent2, end) — lossy for anything with more real stops
// than that (most of the WEBGRADIENTS/COSINE_PALETTES entries), but shows
// something recognizably related to the source gradient instead of the
// editor's unrelated leftover defaults.
export function reduceGradientStops(stops: { color: string; pos: number }[]): {
  start: string;
  mid?: string;
  accent2?: string;
  end: string;
} {
  const n = stops.length;
  if (n === 0) return { start: "#6366f1", end: "#ec4899" };
  if (n === 1) return { start: stops[0]!.color, end: stops[0]!.color };
  if (n === 2) return { start: stops[0]!.color, end: stops[n - 1]!.color };
  if (n === 3) return { start: stops[0]!.color, mid: stops[1]!.color, end: stops[2]!.color };
  return {
    start: stops[0]!.color,
    mid: stops[Math.round((n - 1) / 3)]!.color,
    accent2: stops[Math.round((2 * (n - 1)) / 3)]!.color,
    end: stops[n - 1]!.color,
  };
}

export type FontOption = {
  label: string;
  value: string;
  category?: "sans" | "serif" | "mono" | "display" | "handwriting";
  weights?: number[];
  /** True for a user-uploaded custom font (see lib/customFonts.ts) — lets a
   * picker badge it and sort it ahead of the Google Fonts catalog. */
  isCustom?: boolean;
  /** True for a font already used somewhere else in the current canvas
   * (see getCanvasFontsInUse below) — sorts second, after isCustom but
   * ahead of the plain catalog, so reusing a font already in the design is
   * as quick as picking a custom one. */
  isCanvasFont?: boolean;
};

export const ALL_FONT_WEIGHTS = [
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

export const FONTS: FontOption[] = [
  // Top Modern Sans-Serif (25)
  {
    label: "Outfit",
    value: '"Outfit", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Inter",
    value: '"Inter", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Plus Jakarta Sans",
    value: '"Plus Jakarta Sans", sans-serif',
    category: "sans",
    weights: [200, 300, 400, 500, 600, 700, 800],
  },
  {
    label: "Poppins",
    value: '"Poppins", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Montserrat",
    value: '"Montserrat", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Space Grotesk",
    value: '"Space Grotesk", sans-serif',
    category: "sans",
    weights: [300, 400, 500, 600, 700],
  },
  {
    label: "DM Sans",
    value: '"DM Sans", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Manrope",
    value: '"Manrope", sans-serif',
    category: "sans",
    weights: [200, 300, 400, 500, 600, 700, 800],
  },
  {
    label: "Urbanist",
    value: '"Urbanist", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Work Sans",
    value: '"Work Sans", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Raleway",
    value: '"Raleway", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Nunito",
    value: '"Nunito", sans-serif',
    category: "sans",
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Rubik",
    value: '"Rubik", sans-serif',
    category: "sans",
    weights: [300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Sora",
    value: '"Sora", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
  },
  {
    label: "Syne",
    value: '"Syne", sans-serif',
    category: "sans",
    weights: [400, 500, 600, 700, 800],
  },
  {
    label: "Figtree",
    value: '"Figtree", sans-serif',
    category: "sans",
    weights: [300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Lexend",
    value: '"Lexend", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Bricolage Grotesque",
    value: '"Bricolage Grotesque", sans-serif',
    category: "sans",
    weights: [200, 300, 400, 500, 600, 700, 800],
  },
  {
    label: "Instrument Sans",
    value: '"Instrument Sans", sans-serif',
    category: "sans",
    weights: [400, 500, 600, 700],
  },
  {
    label: "Spline Sans",
    value: '"Spline Sans", sans-serif',
    category: "sans",
    weights: [300, 400, 500, 600, 700],
  },
  {
    label: "Public Sans",
    value: '"Public Sans", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Epilogue",
    value: '"Epilogue", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Archivo",
    value: '"Archivo", sans-serif',
    category: "sans",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  { label: "Cabin", value: '"Cabin", sans-serif', category: "sans", weights: [400, 500, 600, 700] },
  {
    label: "Red Hat Display",
    value: '"Red Hat Display", sans-serif',
    category: "sans",
    weights: [300, 400, 500, 600, 700, 800, 900],
  },

  // Top Editorial & Luxury Serifs (15)
  {
    label: "Playfair Display",
    value: '"Playfair Display", Georgia, serif',
    category: "serif",
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    label: "Lora",
    value: '"Lora", Georgia, serif',
    category: "serif",
    weights: [400, 500, 600, 700],
  },
  {
    label: "Merriweather",
    value: '"Merriweather", Georgia, serif',
    category: "serif",
    weights: [300, 400, 700, 900],
  },
  {
    label: "Cormorant Garamond",
    value: '"Cormorant Garamond", Georgia, serif',
    category: "serif",
    weights: [300, 400, 500, 600, 700],
  },
  {
    label: "Cinzel",
    value: '"Cinzel", serif',
    category: "serif",
    weights: [400, 500, 600, 700, 800, 900],
  },
  { label: "Prata", value: '"Prata", serif', category: "serif", weights: [400] },
  {
    label: "Fraunces",
    value: '"Fraunces", serif',
    category: "serif",
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  {
    label: "Bodoni Moda",
    value: '"Bodoni Moda", serif',
    category: "serif",
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    label: "DM Serif Display",
    value: '"DM Serif Display", serif',
    category: "serif",
    weights: [400],
  },
  {
    label: "Libre Baskerville",
    value: '"Libre Baskerville", serif',
    category: "serif",
    weights: [400, 700],
  },
  {
    label: "EB Garamond",
    value: '"EB Garamond", serif',
    category: "serif",
    weights: [400, 500, 600, 700, 800],
  },
  {
    label: "Newsreader",
    value: '"Newsreader", serif',
    category: "serif",
    weights: [200, 300, 400, 500, 600, 700, 800],
  },
  {
    label: "Spectral",
    value: '"Spectral", serif',
    category: "serif",
    weights: [200, 300, 400, 500, 600, 700, 800],
  },
  { label: "Marcellus", value: '"Marcellus", serif', category: "serif", weights: [400] },
  { label: "Rozha One", value: '"Rozha One", serif', category: "serif", weights: [400] },

  // Top Modern Monospace (5)
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", ui-monospace, monospace',
    category: "mono",
    weights: [100, 200, 300, 400, 500, 600, 700, 800],
  },
  { label: "Space Mono", value: '"Space Mono", monospace', category: "mono", weights: [400, 700] },
  {
    label: "Fira Code",
    value: '"Fira Code", monospace',
    category: "mono",
    weights: [300, 400, 500, 600, 700],
  },
  {
    label: "IBM Plex Mono",
    value: '"IBM Plex Mono", monospace',
    category: "mono",
    weights: [100, 200, 300, 400, 500, 600, 700],
  },
  {
    label: "Source Code Pro",
    value: '"Source Code Pro", monospace',
    category: "mono",
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
  },

  // Top Display & Handwriting (5)
  { label: "Bebas Neue", value: '"Bebas Neue", sans-serif', category: "display", weights: [400] },
  { label: "Anton", value: '"Anton", sans-serif', category: "display", weights: [400] },
  {
    label: "Caveat",
    value: '"Caveat", cursive',
    category: "handwriting",
    weights: [400, 500, 600, 700],
  },
  {
    label: "Dancing Script",
    value: '"Dancing Script", cursive',
    category: "handwriting",
    weights: [400, 500, 600, 700],
  },
  { label: "Pacifico", value: '"Pacifico", cursive', category: "handwriting", weights: [400] },
];

// `extraCatalog` lets callers that have already loaded the full Google
// Fonts catalog (see loadGoogleFontsCatalog below) get a real per-family
// weight list for a font outside the curated FONTS set too, instead of
// always falling back to "offer all 9 weights" for anything not hand-picked.
export function getAvailableFontWeights(
  fontFamily?: string,
  extraCatalog?: FontOption[] | null,
  customFonts?: FontOption[] | null,
): { label: string; value: number }[] {
  if (!fontFamily) return ALL_FONT_WEIGHTS;
  const clean = fontFamily.replace(/['"]/g, "").split(",")[0]?.trim().toLowerCase();
  const pool = getFontPool(extraCatalog, customFonts);
  const found = pool.find((f) => {
    const fClean = f.value.replace(/['"]/g, "").split(",")[0]?.trim().toLowerCase();
    return fClean === clean || f.label.toLowerCase() === clean;
  });
  if (found && found.weights && found.weights.length > 0) {
    return ALL_FONT_WEIGHTS.filter((w) => found.weights!.includes(w.value));
  }
  return ALL_FONT_WEIGHTS;
}

// Best-effort display name for a raw fontFamily CSS value (e.g.
// '"Zilla Slab", serif') when it doesn't match anything in FONTS or a
// loaded catalog — pulls out the quoted/first family name instead of
// falling back to a generic label, so a font picked from the full Google
// Fonts catalog still shows its real name in triggers/labels even before
// (or without) that catalog being loaded in the component asking.
export function cleanFontFamily(val?: string): string {
  if (!val) return "";
  const match = val.match(/["']([^"']+)["']/);
  const name = (match?.[1] ?? val.split(",")[0])?.replace(/['"]/g, "")?.trim();
  return name || val.trim();
}

export function isSameFontFamily(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const cleanA = cleanFontFamily(a).toLowerCase();
  const cleanB = cleanFontFamily(b).toLowerCase();
  return !!cleanA && cleanA === cleanB;
}

export function findFontOption(fonts: FontOption[], value?: string): FontOption | undefined {
  if (!value) return undefined;
  const clean = cleanFontFamily(value).toLowerCase();
  if (!clean) return undefined;
  return fonts.find((f) => {
    return (
      isSameFontFamily(f.value, value) ||
      f.label.toLowerCase() === clean ||
      cleanFontFamily(f.value).toLowerCase() === clean
    );
  });
}

export function fontFamilyToLabel(fontFamily?: string): string {
  if (!fontFamily) return "Text Font";
  const name = cleanFontFamily(fontFamily);
  return name || "Text Font";
}

// Lazily loads the full ~1,900-family Google Fonts catalog (see
// googleFontsCatalog.ts for where the data comes from and why it lives in
// its own module) — call this once a font picker is actually opened, not
// eagerly, so the data chunk is fetched on demand instead of bloating
// every editor page load. Safe to call from several components at once:
// dynamic import() is cached by the module system, so calls after the
// first just resolve from that cache instead of re-fetching.
export async function loadGoogleFontsCatalog(): Promise<FontOption[]> {
  const mod = await import("./googleFontsCatalog");
  return mod.GOOGLE_FONTS_CATALOG;
}

// The curated FONTS plus (once loaded) the full Google Fonts catalog, as
// one deduped pool — every font picker's "what font is this value?" lookup
// and its search box both read from this same combined list. `customFonts`
// (see lib/customFonts.ts) and `canvasFonts` (see getCanvasFontsInUse below)
// go first, in that order, so a name collision resolves to the more
// specific/relevant entry — findFontOption/searchAllFonts below both do a
// plain linear scan, so whichever list comes first wins ties.
export function getFontPool(
  catalog?: FontOption[] | null,
  customFonts?: FontOption[] | null,
  canvasFonts?: FontOption[] | null,
): FontOption[] {
  let pool = FONTS;
  if (canvasFonts && canvasFonts.length > 0) pool = canvasFonts.concat(pool);
  if (customFonts && customFonts.length > 0) pool = customFonts.concat(pool);
  return catalog && catalog.length > 0 ? pool.concat(catalog) : pool;
}

function fontSortRank(f: FontOption): number {
  return f.isCustom ? 2 : f.isCanvasFont ? 1 : 0;
}

// Shared search/browse behavior for every font picker in the app —
// alphabetical (not popularity/category order, and not "curated only until
// you type") so a picker reads the same way whether you're scanning the
// full list or narrowing it with a query: pass the loaded catalog (see
// loadGoogleFontsCatalog above) once it resolves, or omit/pass null before
// then to browse/search the curated list alone in the meantime. Callers
// render the (potentially ~1,900-long) result with per-row lazy preview
// loading — see FontRow in ui.tsx — rather than eagerly fetching a
// stylesheet for every row up front.
export function searchAllFonts(
  query: string,
  catalog?: FontOption[] | null,
  customFonts?: FontOption[] | null,
  canvasFonts?: FontOption[] | null,
): FontOption[] {
  const q = query.trim().toLowerCase();
  const seenAt = new Map<string, number>();
  const results: FontOption[] = [];
  for (const f of getFontPool(catalog, customFonts, canvasFonts)) {
    const key = f.label.toLowerCase();
    const existingIdx = seenAt.get(key);
    if (existingIdx !== undefined) {
      // Same font already added from an earlier (higher-priority) list —
      // e.g. one of the user's own custom fonts that's also already used
      // somewhere in the canvas. Merge isCanvasFont onto that existing
      // entry instead of just dropping this duplicate outright, so a
      // custom-and-in-use font still gets its "in use" badge rather than
      // silently losing that signal to dedup.
      if (f.isCanvasFont && !results[existingIdx]!.isCanvasFont) {
        results[existingIdx] = { ...results[existingIdx]!, isCanvasFont: true };
      }
      continue;
    }
    if (q && !key.includes(q)) continue;
    seenAt.set(key, results.length);
    results.push(f);
  }
  // Custom (user-uploaded) fonts sort first, then fonts already used
  // elsewhere in the canvas, alphabetical within each group — both are
  // more relevant to reach for than scrolling an 1,800+ entry Google Fonts
  // list, just in different ways (fonts you added vs. fonts you're already
  // using in this design).
  results.sort((a, b) => fontSortRank(b) - fontSortRank(a) || a.label.localeCompare(b.label));
  return results;
}

// Every font actually in use somewhere in the current design right now —
// the fixed quote/author/tagline/repost-button fields plus every
// free-floating Text gallery layer — deduped and shaped as FontOption so it
// slots into the same pickers as the custom-fonts/Google-fonts lists (see
// searchAllFonts above). Only counts a field whose own content is actually
// non-empty/visible (an empty tagline's font isn't really "in use" yet),
// and resolves each raw fontFamily value against `pool` (curated + loaded
// Google catalog + custom fonts, whichever the caller already has handy)
// so the label shown matches what the rest of the app calls that font
// rather than falling back to a raw CSS value.
export function getCanvasFontsInUse(s: EditorState, pool: FontOption[]): FontOption[] {
  const seen = new Set<string>();
  const result: FontOption[] = [];
  const add = (fontFamily: string | undefined) => {
    if (!fontFamily) return;
    const key = cleanFontFamily(fontFamily).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    const found = findFontOption(pool, fontFamily);
    result.push({
      label: found?.label ?? fontFamilyToLabel(fontFamily),
      value: found?.value ?? fontFamily,
      ...(found?.weights ? { weights: found.weights } : {}),
      isCanvasFont: true,
    });
  };

  if (s.quote?.trim()) add(s.quoteFont);
  if (s.name?.trim()) add(s.authorFont);
  if (s.tagline?.trim()) add(s.taglineFont);
  if (s.showTopButton && s.topButtonText?.trim()) add(s.topButtonFont);
  for (const t of getTextLayers(s)) {
    if (t.text?.trim()) add(t.fontFamily);
  }

  return result;
}

export const WEIGHTS = ALL_FONT_WEIGHTS;

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
    const r = parseInt(rgbMatch[1] ?? "0", 10)
      .toString(16)
      .padStart(2, "0");
    const g = parseInt(rgbMatch[2] ?? "0", 10)
      .toString(16)
      .padStart(2, "0");
    const b = parseInt(rgbMatch[3] ?? "0", 10)
      .toString(16)
      .padStart(2, "0");
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

export type FrameKind =
  | "square"
  | "rounded"
  | "circle"
  | "triangle"
  | "triangle-down"
  | "diamond"
  | "pentagon"
  | "hexagon-v"
  | "hexagon-h"
  | "octagon"
  | "star-4"
  | "star-5"
  | "star-6"
  | "star-8"
  | "burst-12"
  | "burst-16"
  | "scallop-8"
  | "scallop-12"
  | "rosette-20"
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "arrow-bidirectional-h"
  | "arrow-bidirectional-v"
  | "arrow-pentagon-right"
  | "arrow-chevron-right"
  | "ribbon-horizontal"
  | "hexagon-horizontal-pill"
  | "speech-bubble-square"
  | "speech-bubble-round"
  | "heart"
  | "cross"
  | "cloud"
  | "pennant-down"
  | "banner-concave-bottom"
  | "scalloped-corners"
  | "chamfered-square"
  | "curved-top-square"
  | "parallelogram-right"
  | "parallelogram-left"
  | "trapezoid-up"
  | "trapezoid-down"
  | "u-shape"
  | "arch"
  | "shield";

// One entry in the free-floating "Images" gallery — each is independently
// draggable, resizable and stackable on the canvas, so a design can carry
// any number of photos/stickers instead of just one.
export type ImageLayer = {
  id: string;
  src: string;
  // The image exactly as first uploaded, before any crop/erase/paint edit
  // ever touched it — set once in makeImageLayer and never patched again
  // afterward (withImageUpdated's crop/erase patches only ever touch
  // `src`), so "Restore Original Image" in EraseImageDialog can undo every
  // past edit rather than just whatever this one dialog session started
  // from. Optional so layers saved before this field existed don't break;
  // callers fall back to `src` itself in that case.
  originalSrc?: string | undefined;
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
  frameShape?: FrameKind | undefined; // Shape mask for photo frames (Canva style)
  frameOffsetX?: number | undefined; // Horizontal position/pan inside frame (0-100%, default 50%)
  frameOffsetY?: number | undefined; // Vertical position/pan inside frame (0-100%, default 50%)
  frameZoom?: number | undefined; // Zoom scale factor inside frame (100-300%, default 100%)
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
export type LineKind =
  | "line-solid"
  | "line-dashed"
  | "line-dash-short"
  | "line-dotted"
  | "line-arrow-right"
  | "line-arrow-open-right"
  | "line-arrow-dotted-right"
  | "line-tbar"
  | "line-double-arrow"
  | "line-double-arrow-dotted"
  | "line-square-ends"
  | "line-circle-ends"
  | "line-diamond-ends"
  | "line-square-hollow-ends"
  | "line-circle-hollow-ends"
  | "line-diamond-hollow-ends";

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
  | "quarter-circle"
  | LineKind;

export function isLineShape(kind: ShapeKind | string): boolean {
  return typeof kind === "string" && kind.startsWith("line-");
}

// The newer, independently-configurable line model — ShapeLayer.lineStyle/
// lineStartCap/lineEndCap below. Older shapes (created before this existed,
// or from LINE_PRESETS) carry none of these three fields and keep rendering
// through the legacy `kind`-driven switch in LineShapeSvg instead — kind
// itself no longer changes for a line once these are in play, so a shape
// can't end up in a mixed/inconsistent state. `lineStyle` presence is what
export type LineType = "straight" | "curved" | "elbowed";
export type LineStrokeStyle = "solid" | "dash-long" | "dash-short" | "dotted";
export type LineEndCapKind =
  | "none"
  | "arrow"
  | "arrow-open"
  | "circle"
  | "circle-hollow"
  | "square"
  | "square-hollow"
  | "diamond"
  | "diamond-hollow"
  | "tbar";

// Seeds lineStyle/lineStartCap/lineEndCap from a legacy `kind` the first
// time a line shape's Start/End/Style controls are touched, so switching a
// LINE_PRESETS-created shape onto the new independent model doesn't change
// how it looks until the user actually picks something different.
export function inferLineStyleFromKind(kind: LineKind): {
  style: LineStrokeStyle;
  start: LineEndCapKind;
  end: LineEndCapKind;
} {
  const style: LineStrokeStyle = kind.includes("dotted")
    ? "dotted"
    : kind.includes("dash-short")
      ? "dash-short"
      : kind.includes("dashed")
        ? "dash-long"
        : "solid";
  switch (kind) {
    case "line-arrow-right":
    case "line-arrow-open-right":
    case "line-arrow-dotted-right":
      return {
        style,
        start: "none",
        end: kind === "line-arrow-open-right" ? "arrow-open" : "arrow",
      };
    case "line-tbar":
      return { style, start: "tbar", end: "tbar" };
    case "line-double-arrow":
    case "line-double-arrow-dotted":
      return { style, start: "arrow", end: "arrow" };
    case "line-square-ends":
      return { style, start: "square", end: "square" };
    case "line-circle-ends":
      return { style, start: "circle", end: "circle" };
    case "line-diamond-ends":
      return { style, start: "diamond", end: "diamond" };
    case "line-square-hollow-ends":
      return { style, start: "square-hollow", end: "square-hollow" };
    case "line-circle-hollow-ends":
      return { style, start: "circle-hollow", end: "circle-hollow" };
    case "line-diamond-hollow-ends":
      return { style, start: "diamond-hollow", end: "diamond-hollow" };
    default:
      return { style, start: "none", end: "none" };
  }
}

// The (lineStyle, lineStartCap, lineEndCap) triple actually in effect for a
// line shape right now — its own three fields once set, or the same triple
// inferred from `kind` before they ever are (see inferLineStyleFromKind's
// own comment). Used to keep the Lines preset gallery's "active" highlight
// and the Line Style panel's own controls reading off one single source of
// truth, so picking from either stays in sync with the other instead of
// each tracking a different field.
export function effectiveLineTriple(layer: {
  kind: ShapeKind;
  lineStyle?: LineStrokeStyle | undefined;
  lineStartCap?: LineEndCapKind | undefined;
  lineEndCap?: LineEndCapKind | undefined;
}): { style: LineStrokeStyle; start: LineEndCapKind; end: LineEndCapKind } {
  if (layer.lineStyle !== undefined) {
    return {
      style: layer.lineStyle,
      start: layer.lineStartCap ?? "none",
      end: layer.lineEndCap ?? "none",
    };
  }
  return inferLineStyleFromKind(layer.kind as LineKind);
}

export const LINE_PRESETS: { id: string; label: string; kind: LineKind }[] = [
  { id: "line-solid", label: "Solid Line", kind: "line-solid" },
  { id: "line-dashed", label: "Long Dash", kind: "line-dashed" },
  { id: "line-dash-short", label: "Short Dash", kind: "line-dash-short" },
  { id: "line-dotted", label: "Dotted Line", kind: "line-dotted" },
  { id: "line-arrow-right", label: "Solid Arrow Right", kind: "line-arrow-right" },
  { id: "line-arrow-open-right", label: "Open Arrow Right", kind: "line-arrow-open-right" },
  { id: "line-arrow-dotted-right", label: "Dotted Arrow Right", kind: "line-arrow-dotted-right" },
  { id: "line-tbar", label: "T-Bar Line", kind: "line-tbar" },
  { id: "line-double-arrow", label: "Double Arrow", kind: "line-double-arrow" },
  {
    id: "line-double-arrow-dotted",
    label: "Dotted Double Arrow",
    kind: "line-double-arrow-dotted",
  },
  { id: "line-square-ends", label: "Square Ends", kind: "line-square-ends" },
  { id: "line-circle-ends", label: "Circle Ends", kind: "line-circle-ends" },
  { id: "line-diamond-ends", label: "Diamond Ends", kind: "line-diamond-ends" },
  { id: "line-square-hollow-ends", label: "Hollow Square Ends", kind: "line-square-hollow-ends" },
  { id: "line-circle-hollow-ends", label: "Hollow Circle Ends", kind: "line-circle-hollow-ends" },
  {
    id: "line-diamond-hollow-ends",
    label: "Hollow Diamond Ends",
    kind: "line-diamond-hollow-ends",
  },
];

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

export const CANVA_FRAME_PLACEHOLDER_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
      <defs>
        <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#bce4ff" />
          <stop offset="100%" stop-color="#eaf5ff" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#sky)" />
      <g fill="#ffffff" opacity="0.95">
        <path d="M125 125 C125 100 145 80 170 80 C190 80 207 94 213 113 C220 109 228 107 237 107 C260 107 279 126 279 149 C279 151 279 153 278 155 C288 158 295 167 295 178 C295 192 284 203 270 203 L135 203 C118 203 105 190 105 173 C105 158 116 145 130 143 C127 138 125 131 125 125 Z" />
      </g>
      <path d="M -20 270 Q 80 190 220 235 Q 340 275 420 225 L 420 420 L -20 420 Z" fill="#7ba315" />
      <path d="M -20 315 Q 120 245 280 305 Q 360 335 420 305 L 420 420 L -20 420 Z" fill="#9bc81e" />
    </svg>`,
  );

export const FRAME_PRESETS: { id: string; label: string; kind: FrameKind }[] = [
  { id: "square", label: "Square Frame", kind: "square" },
  { id: "rounded", label: "Rounded Frame", kind: "rounded" },
  { id: "circle", label: "Circle Frame", kind: "circle" },
  { id: "triangle", label: "Triangle Frame", kind: "triangle" },
  { id: "triangle-down", label: "Inverted Triangle Frame", kind: "triangle-down" },
  { id: "diamond", label: "Diamond Frame", kind: "diamond" },
  { id: "pentagon", label: "Pentagon Frame", kind: "pentagon" },
  { id: "hexagon-v", label: "Hexagon Vertical Frame", kind: "hexagon-v" },
  { id: "hexagon-h", label: "Hexagon Horizontal Frame", kind: "hexagon-h" },
  {
    id: "hexagon-horizontal-pill",
    label: "Elongated Hexagon Frame",
    kind: "hexagon-horizontal-pill",
  },
  { id: "octagon", label: "Octagon Frame", kind: "octagon" },
  { id: "star-4", label: "4-Point Star Frame", kind: "star-4" },
  { id: "star-5", label: "5-Point Star Frame", kind: "star-5" },
  { id: "star-6", label: "6-Point Star Frame", kind: "star-6" },
  { id: "star-8", label: "Eight Pointed Star Inflated Frame", kind: "star-8" },
  { id: "burst-12", label: "12-Point Burst Frame", kind: "burst-12" },
  { id: "burst-16", label: "16-Point Sunburst Frame", kind: "burst-16" },
  { id: "scallop-8", label: "Scalloped Octagon Frame", kind: "scallop-8" },
  { id: "scallop-12", label: "Scalloped Badge Frame", kind: "scallop-12" },
  { id: "rosette-20", label: "Rosette Stamp Frame", kind: "rosette-20" },
  { id: "arrow-up", label: "Up Arrow Frame", kind: "arrow-up" },
  { id: "arrow-down", label: "Down Arrow Frame", kind: "arrow-down" },
  { id: "arrow-right", label: "Right Arrow Frame", kind: "arrow-right" },
  { id: "arrow-left", label: "Left Arrow Frame", kind: "arrow-left" },
  {
    id: "arrow-bidirectional-h",
    label: "Double Arrow Horizontal Frame",
    kind: "arrow-bidirectional-h",
  },
  {
    id: "arrow-bidirectional-v",
    label: "Double Arrow Vertical Frame",
    kind: "arrow-bidirectional-v",
  },
  { id: "arrow-pentagon-right", label: "Tag / Signpost Frame", kind: "arrow-pentagon-right" },
  { id: "arrow-chevron-right", label: "Chevron Notch Frame", kind: "arrow-chevron-right" },
  { id: "ribbon-horizontal", label: "Ribbon Banner Frame", kind: "ribbon-horizontal" },
  { id: "speech-bubble-square", label: "Speech Bubble Square Frame", kind: "speech-bubble-square" },
  { id: "speech-bubble-round", label: "Speech Bubble Oval Frame", kind: "speech-bubble-round" },
  { id: "heart", label: "Heart Frame", kind: "heart" },
  { id: "cross", label: "Cross Plus Frame", kind: "cross" },
  { id: "cloud", label: "Cloud Frame", kind: "cloud" },
  { id: "pennant-down", label: "Pennant Ribbon Frame", kind: "pennant-down" },
  { id: "banner-concave-bottom", label: "Banner Concave Frame", kind: "banner-concave-bottom" },
  { id: "scalloped-corners", label: "Notched Corner Frame", kind: "scalloped-corners" },
  { id: "chamfered-square", label: "Chamfered Square Frame", kind: "chamfered-square" },
  { id: "curved-top-square", label: "Barrel Curve Frame", kind: "curved-top-square" },
  { id: "parallelogram-right", label: "Parallelogram Frame", kind: "parallelogram-right" },
  { id: "parallelogram-left", label: "Parallelogram Mirrored Frame", kind: "parallelogram-left" },
  { id: "trapezoid-up", label: "Trapezoid Frame", kind: "trapezoid-up" },
  { id: "trapezoid-down", label: "Inverted Trapezoid Frame", kind: "trapezoid-down" },
  { id: "u-shape", label: "U-Shape Arch Down Frame", kind: "u-shape" },
  { id: "arch", label: "Arch Portal Frame", kind: "arch" },
  { id: "shield", label: "Shield Frame", kind: "shield" },
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
    gradient:
      "linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0) 100%)",
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
    gradient:
      "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)",
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
    gradient:
      "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 90%)",
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
    gradient:
      "linear-gradient(to bottom, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.65) 45%, rgba(0,0,0,0) 100%)",
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
    gradient:
      "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 100%)",
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
    gradient:
      "linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 100%)",
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
    gradient:
      "linear-gradient(to left, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 100%)",
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
    gradient:
      "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, transparent 28%, transparent 72%, rgba(0,0,0,0.9) 100%)",
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
    gradient:
      "radial-gradient(circle at center, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0) 75%)",
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
    gradient:
      "radial-gradient(circle at center, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 0% 0%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 100% 0%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 0% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 100% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 80%)",
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
    gradient:
      "radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.95) 100%)",
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
    gradient:
      "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 85%)",
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
    gradient:
      "radial-gradient(ellipse 60% 30% at 50% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0) 100%)",
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
    gradient:
      "linear-gradient(135deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0) 80%)",
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
    gradient:
      "linear-gradient(225deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 50% 100%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0) 85%)",
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
    gradient:
      "linear-gradient(to top, rgba(255,255,255,1) 0%, rgba(255,255,255,0.7) 45%, rgba(255,255,255,0) 100%)",
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
    gradient:
      "linear-gradient(to top, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0) 100%)",
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
    gradient:
      "linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0.65) 45%, rgba(255,255,255,0) 100%)",
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
    gradient:
      "radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
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
    gradient:
      "radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.3) 55%, rgba(255,255,255,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 0% 0%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 100% 0%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 0% 100%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
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
    gradient:
      "radial-gradient(circle at 100% 100%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0) 80%)",
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
    gradient:
      "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 85%)",
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
    gradient:
      "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.95) 50%, transparent 100%)",
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
    gradient:
      "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)",
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
    gradient:
      "linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, transparent 28%, transparent 72%, rgba(255,255,255,0.92) 100%)",
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
    gradient:
      "radial-gradient(ellipse at center, rgba(255,255,255,0) 30%, rgba(255,255,255,0.6) 70%, rgba(255,255,255,0.95) 100%)",
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
    gradient:
      "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0) 80%)",
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
    gradient:
      "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 90%)",
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

const LINE_STYLE_LABELS: Record<LineStrokeStyle, string> = {
  solid: "Solid",
  "dash-long": "Long Dash",
  "dash-short": "Short Dash",
  dotted: "Dotted",
};

const LINE_CAP_LABELS: Record<LineEndCapKind, string> = {
  none: "",
  arrow: "Arrow",
  "arrow-open": "Open Arrow",
  circle: "Circle",
  "circle-hollow": "Hollow Circle",
  square: "Square",
  "square-hollow": "Hollow Square",
  diamond: "Diamond",
  "diamond-hollow": "Hollow Diamond",
  tbar: "T-Bar",
};

export function getShapeLabel(shape: ShapeLayer): string {
  if (isLineShape(shape.kind)) {
    // Once a line has been touched by the Line Style/Ends controls, `kind`
    // itself deliberately stays frozen at whatever it was before (see
    // inferLineStyleFromKind's own comment) — looking it up in LINE_PRESETS
    // would keep showing the shape's ORIGINAL preset name forever, no
    // matter what the user actually changed it to since. Describe the
    // shape's real current (style, start, end) triple instead once it's in
    // play.
    if (shape.lineStyle !== undefined) {
      const styleLabel = LINE_STYLE_LABELS[shape.lineStyle];
      const start = shape.lineStartCap ?? "none";
      const end = shape.lineEndCap ?? "none";
      if (start === "none" && end === "none") return `${styleLabel} Line`;
      if (start === end) return `${LINE_CAP_LABELS[start]} Ends`;
      const parts = [start, end].filter((c) => c !== "none").map((c) => LINE_CAP_LABELS[c]);
      return parts.length ? `${parts.join(" / ")} Line` : `${styleLabel} Line`;
    }
    const linePreset = LINE_PRESETS.find((p) => p.kind === shape.kind);
    return linePreset ? linePreset.label : "Line";
  }
  if (shape.kind === "rect") {
    if (shape.radius >= 80) return "Circle";
    if (shape.radius > 0) return "Rounded Square";
    return "Square";
  }
  const preset = SHAPE_PRESETS.find((p) => p.kind === shape.kind);
  return preset ? preset.label : `${shape.kind.replace(/-/g, " ")}`;
}

export function getMatchingShapePresetId(shape: ShapeLayer): string {
  if (isLineShape(shape.kind)) {
    return shape.kind;
  }
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
export function shapeCss(
  kind: ShapeKind,
  radius: number,
): { borderRadius?: string; clipPath?: string } {
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

// Single source of truth for frame/mask geometry on photos and image layers
export function frameShapeCss(
  kind: FrameKind | undefined,
  radius?: number,
): { borderRadius?: string; clipPath?: string } {
  if (!kind) {
    return typeof radius === "number" && radius > 0 ? { borderRadius: `${radius}px` } : {};
  }
  switch (kind) {
    case "square":
      return { borderRadius: "0px" };
    case "rounded":
      return { borderRadius: typeof radius === "number" && radius > 0 ? `${radius}px` : "20%" };
    case "circle":
      return { borderRadius: "50%" };
    case "triangle":
      return { clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" };
    case "triangle-down":
      return { clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)" };
    case "diamond":
      return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    case "pentagon":
      return { clipPath: "polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)" };
    case "hexagon-v":
      return { clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)" };
    case "hexagon-h":
      return { clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" };
    case "octagon":
      return {
        clipPath:
          "polygon(29.3% 0%, 70.7% 0%, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0% 70.7%, 0% 29.3%)",
      };
    case "star-4":
      return {
        clipPath: "polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%)",
      };
    case "star-5":
      return {
        clipPath:
          "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
      };
    case "star-6":
      // True hexagram (Star of David): two overlapping equilateral triangles.
      // Outer points sit at radius R (every 60°); inner points sit at R/√3
      // (≈57.7% of R, every 60° offset by 30°) — the exact intersection
      // radius of two equilateral triangles sharing a center, so all 6 tips
      // and all 6 inner notches are evenly spaced and equal, unlike the
      // previous hand-approximated values which were visibly lopsided.
      return {
        clipPath:
          "polygon(50% 0%, 64.4% 25%, 93.3% 25%, 78.9% 50%, 93.3% 75%, 64.4% 75%, 50% 100%, 35.6% 75%, 6.7% 75%, 21.1% 50%, 6.7% 25%, 35.6% 25%)",
      };
    case "star-8":
      return {
        clipPath:
          "polygon(50% 0%, 63.5% 17.3%, 85.4% 14.6%, 82.7% 36.5%, 100% 50%, 82.7% 63.5%, 85.4% 85.4%, 63.5% 82.7%, 50% 100%, 36.5% 82.7%, 14.6% 85.4%, 17.3% 63.5%, 0% 50%, 17.3% 36.5%, 14.6% 14.6%, 36.5% 17.3%)",
      };
    case "burst-12":
      return {
        clipPath:
          "polygon(50% 0%, 59.1% 16.2%, 75% 6.7%, 76.8% 25.3%, 93.3% 25%, 83.8% 40.9%, 100% 50%, 83.8% 59.1%, 93.3% 75%, 76.8% 74.7%, 75% 93.3%, 59.1% 83.8%, 50% 100%, 40.9% 83.8%, 25% 93.3%, 23.2% 74.7%, 6.7% 75%, 16.2% 59.1%, 0% 50%, 16.2% 40.9%, 6.7% 25%, 23.2% 25.3%, 25% 6.7%, 40.9% 16.2%)",
      };
    case "burst-16":
      return {
        clipPath:
          "polygon(50% 0%, 57.4% 12.7%, 69.1% 3.8%, 71.1% 18.4%, 85.4% 14.6%, 81.6% 28.9%, 96.2% 30.9%, 87.3% 42.6%, 100% 50%, 87.3% 57.4%, 96.2% 69.1%, 81.6% 71.1%, 85.4% 85.4%, 71.1% 81.6%, 69.1% 96.2%, 57.4% 87.3%, 50% 100%, 42.6% 87.3%, 30.9% 96.2%, 28.9% 81.6%, 14.6% 85.4%, 18.4% 71.1%, 3.8% 69.1%, 12.7% 57.4%, 0% 50%, 12.7% 42.6%, 3.8% 30.9%, 18.4% 28.9%, 14.6% 14.6%, 28.9% 18.4%, 30.9% 3.8%, 42.6% 12.7%)",
      };
    case "scallop-8":
      return {
        clipPath: "url(#clip-frame-scallop-8)",
      };
    case "scallop-12":
      return {
        clipPath: "url(#clip-frame-scallop-12)",
      };
    case "rosette-20":
      return {
        clipPath: "url(#clip-frame-rosette-20)",
      };
    case "arrow-right":
      return { clipPath: "polygon(0% 30%, 60% 30%, 60% 10%, 100% 50%, 60% 90%, 60% 70%, 0% 70%)" };
    case "arrow-left":
      return {
        clipPath: "polygon(40% 10%, 40% 30%, 100% 30%, 100% 70%, 40% 70%, 40% 90%, 0% 50%)",
      };
    case "arrow-up":
      return {
        clipPath: "polygon(50% 0%, 90% 40%, 70% 40%, 70% 100%, 30% 100%, 30% 40%, 10% 40%)",
      };
    case "arrow-down":
      return { clipPath: "polygon(30% 0%, 70% 0%, 70% 60%, 90% 60%, 50% 100%, 10% 60%, 30% 60%)" };
    case "arrow-bidirectional-h":
      return {
        clipPath:
          "polygon(0% 50%, 25% 15%, 25% 35%, 75% 35%, 75% 15%, 100% 50%, 75% 85%, 75% 65%, 25% 65%, 25% 85%)",
      };
    case "arrow-bidirectional-v":
      return {
        clipPath:
          "polygon(50% 0%, 85% 25%, 65% 25%, 65% 75%, 85% 75%, 50% 100%, 15% 75%, 35% 75%, 35% 25%, 15% 25%)",
      };
    case "arrow-pentagon-right":
      return { clipPath: "polygon(0% 0%, 75% 0%, 100% 50%, 75% 100%, 0% 100%)" };
    case "arrow-chevron-right":
      return { clipPath: "polygon(0% 0%, 70% 0%, 100% 50%, 70% 100%, 0% 100%, 30% 50%)" };
    case "ribbon-horizontal":
      return { clipPath: "polygon(0% 0%, 100% 0%, 85% 50%, 100% 100%, 0% 100%, 15% 50%)" };
    case "hexagon-horizontal-pill":
      return { clipPath: "polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%)" };
    case "speech-bubble-square":
      return { clipPath: "url(#clip-frame-speech-bubble-square)" };
    case "speech-bubble-round":
      return {
        clipPath: "url(#clip-frame-speech-bubble-round)",
      };
    case "heart":
      return {
        clipPath: "url(#clip-frame-heart)",
      };
    case "cross":
      return {
        clipPath:
          "polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)",
      };
    case "cloud":
      return {
        clipPath: "url(#clip-frame-cloud)",
      };
    case "pennant-down":
      return { clipPath: "polygon(0% 0%, 100% 0%, 100% 75%, 50% 100%, 0% 75%)" };
    case "banner-concave-bottom":
      return { clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 50% 85%, 0% 100%)" };
    case "scalloped-corners":
      return {
        clipPath: "url(#clip-frame-scalloped-corners)",
      };
    case "chamfered-square":
      return {
        clipPath: "polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%)",
      };
    case "curved-top-square":
      return {
        clipPath: "url(#clip-frame-curved-top-square)",
      };
    case "parallelogram-right":
      return { clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)" };
    case "parallelogram-left":
      return { clipPath: "polygon(0% 0%, 75% 0%, 100% 100%, 25% 100%)" };
    case "trapezoid-up":
      return { clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)" };
    case "trapezoid-down":
      return { clipPath: "polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)" };
    case "u-shape":
      return { clipPath: "url(#clip-frame-u-shape)" };
    case "arch":
      return { clipPath: "url(#clip-frame-arch)" };
    case "shield":
      return { clipPath: "url(#clip-frame-shield)" };
    default:
      return typeof radius === "number" && radius > 0 ? { borderRadius: `${radius}px` } : {};
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
  if (isLineShape(shape.kind)) {
    return {
      background: "transparent",
      border: "none",
      boxShadow: "none",
      backdropFilter: undefined,
      opacity: (shape.opacity ?? 100) / 100,
    };
  }
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
  // Line shapes only (isLineShape(kind)) — "rounded end points" toggle,
  // applies to the plain stroke ends only (not decorative markers, which
  // draw their own explicit shape). Unset means "round", matching every
  // line's original hardcoded look before this was made a per-shape choice.
  lineCap?: "round" | "butt" | undefined;
  // Line shapes only, and only once set — see inferLineStyleFromKind's own
  // comment for why these three stay undefined on any shape still using the
  // legacy `kind`-driven look. lineStyle is the stroke pattern (solid/dash/
  // dot); lineStartCap/lineEndCap are the independently-chosen decoration
  // at each end (arrow, circle, tbar, etc — see LineEndCapKind), replacing
  // `kind`'s old one-preset-covers-both-ends limitation.
  lineStyle?: LineStrokeStyle | undefined;
  lineStartCap?: LineEndCapKind | undefined;
  lineEndCap?: LineEndCapKind | undefined;
  lineType?: LineType | undefined;
  lineCurvature?: number | undefined;
  lineWaypoints?: { x: number; y: number }[] | undefined;
  // Elbowed lines only — Canva's own "corner rounding" slider for
  // connector-style lines: how much each interior bend gets filleted into
  // an arc instead of a sharp 90° corner. Pixels, unset means the old
  // hardcoded auto-computed radius (see LineShapeSvg's own cornerR
  // fallback), so every elbow line drawn before this existed keeps its
  // original look with no migration needed.
  lineCornerRadius?: number | undefined;
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

  // post name / design title
  postName?: string | undefined;
  thumbnailUrl?: string | undefined;

  // export
  exportFormat: ExportFormat;
  exportScale: number;
};

export type Template = {
  id: string;
  label: string;
  description: string;
  thumbnailUrl?: string | undefined;
  state: Partial<EditorState>;
  is_premium?: boolean | undefined;
  category?: "starter" | "premium" | string | undefined;
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
      const avatarXPct =
        50 - opts.boxWidthPct / 2 + ((55 + avatarSize / 2) / opts.canvasWidth) * 100;
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
      const textXPct =
        50 - opts.boxWidthPct / 2 + ((textLeftMarginPx + textWidthPx / 2) / opts.canvasWidth) * 100;

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
const DEFAULT_AVATAR_SRC = "/default-img.png";
const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_CANVAS_HEIGHT = 1500;

// Bundled defaults removed at the user's explicit request (2026-09-12) — the
// Free/Premium tabs now start genuinely empty until real templates are
// created through the Admin Dashboard, both here (the offline/pre-fetch
// fallback) and as actual rows in the live `templates` table (deleted
// separately, see supabase_schema.sql's own note on this). Previously held
// six built-in designs (linkedin/minimal/neon/editorial/bold/sunset) — see
// git history if any of these need to be restored as a real admin-created
// template later.
export const STARTER_TEMPLATES: Template[] = [];

export const PREMIUM_TEMPLATES: Template[] = [];

export const TEMPLATES: Template[] = [...STARTER_TEMPLATES, ...PREMIUM_TEMPLATES];

// The old fixed quote/name/tagline/avatar/box fields below are kept only
// for backward compatibility (older saved designs still carry them as
// plain JSON) — rendering no longer reads them at all. Real content lives
// in shapes/texts/images, built via buildQuoteCardLayers() above so the
// app's own default design isn't a special case of the layer model, it's
// a plain instance of it.
export const INITIAL_STATE: EditorState = {
  postName: "Untitled Post",
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
  canvasRadius: 0,

  exportFormat: "png",
  exportScale: 1,
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

// Applies the CURRENT design to a new canvas size, instead of discarding it
// for a blank canvas (see handleStartNewPost's "Start Blank" in index.tsx) —
// the New Post dialog's "Resize" action.
//
// Every layer's own x/y is already canvas-% (see ImageLayer/TextLayer/
// ShapeLayer's own comments), so repositioning is automatic — an element at
// 50%/50% stays centered no matter what the new width/height are. What
// isn't automatic is each layer's absolute-pixel SIZE fields (font size,
// image/shape width, radius, shadow spread, ...): left alone, a 400px-wide
// image would look enormous on a resize down to a small square, or tiny on
// a resize up to a big canvas. Everything below scales those by one uniform
// factor — Math.min() of the width/height ratios, so every element keeps
// its own aspect ratio and the whole layout shrinks/grows together rather
// than one axis stretching more than the other.
//
// Deliberately only touches images/texts/shapes plus width/height —
// QuoteCanvas renders exclusively from those three arrays (confirmed: none
// of the legacy quote/box/decorative top-level fields like quoteSize,
// boxWidth, topButtonSize, dotsSize etc. are read anywhere in
// QuoteCanvas.tsx any more, only kept around for migrateLegacyContentToLayers
// above to convert old saved designs on load), so scaling them too would be
// dead work with real risk of guessing a field's unit wrong.
export function resizeEditorStateToNewSize(
  s: EditorState,
  newWidth: number,
  newHeight: number,
): EditorState {
  const oldWidth = s.width || newWidth;
  const oldHeight = s.height || newHeight;
  if (oldWidth === newWidth && oldHeight === newHeight) return s;

  const scale = Math.min(newWidth / oldWidth, newHeight / oldHeight);
  const scalePx = (n: number) => Math.round(n * scale);
  const scaleOptPx = (n: number | undefined) => (n === undefined ? n : scalePx(n));

  const images = getImageLayers(s).map((img) => ({
    ...img,
    size: scalePx(img.size),
    height: scaleOptPx(img.height),
    radius: scalePx(img.radius),
    shadowBlur: scalePx(img.shadowBlur),
    shadowX: scaleOptPx(img.shadowX),
    shadowY: scaleOptPx(img.shadowY),
    shadowSpread: scaleOptPx(img.shadowSpread),
  }));

  const texts = getTextLayers(s).map((t) => ({
    ...t,
    size: scalePx(t.size),
    width: scaleOptPx(t.width),
    minHeight: scaleOptPx(t.minHeight),
  }));

  const shapes = getShapeLayers(s).map((sh) => ({
    ...sh,
    size: scalePx(sh.size),
    height: scaleOptPx(sh.height),
    radius: scalePx(sh.radius),
    shadowBlur: scalePx(sh.shadowBlur),
    strokeWidth: scaleOptPx(sh.strokeWidth),
    lineCornerRadius: scaleOptPx(sh.lineCornerRadius),
    shadowX: scaleOptPx(sh.shadowX),
    shadowY: scaleOptPx(sh.shadowY),
    shadowSpread: scaleOptPx(sh.shadowSpread),
    // An elbowed/curved line's waypoints are absolute pixel coordinates
    // inside its own size/height box (see withMultipleLayersScaled's
    // matching comment) — size/height above already scale by this same
    // factor, so the waypoints need to as well or the line's actual bend/
    // curve shape stops matching its own (correctly resized) box.
    ...(sh.lineWaypoints
      ? { lineWaypoints: sh.lineWaypoints.map((p) => ({ x: p.x * scale, y: p.y * scale })) }
      : {}),
  }));

  return {
    ...s,
    width: newWidth,
    height: newHeight,
    images,
    texts,
    shapes,
    // exactOptionalPropertyTypes: only include when actually set, since
    // explicitly assigning `undefined` here differs from the key being
    // absent altogether.
    ...(s.canvasRadius !== undefined ? { canvasRadius: scalePx(s.canvasRadius) } : {}),
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
    originalSrc: src,
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

export function withFrameAdded(
  s: EditorState,
  frameKind: FrameKind,
  opts?: { x?: number; y?: number },
): { list: ImageLayer[]; layerOrder: UnifiedLayerRef[]; newId: string } {
  const list = getImageLayers(s);
  const position = list.length;
  const offset = (position % 6) * 4;
  const defaultSize = Math.min(Math.round(s.width * 0.45), 380);
  const newImg: ImageLayer = {
    id: newLayerId(),
    src: CANVA_FRAME_PLACEHOLDER_SRC,
    originalSrc: CANVA_FRAME_PLACEHOLDER_SRC,
    x: opts?.x ?? 50 + offset,
    y: opts?.y ?? 50 + offset,
    size: defaultSize,
    height: defaultSize,
    radius: frameKind === "rounded" ? 28 : 0,
    frameShape: frameKind,
    shadow: false,
    shadowBlur: 24,
    layer: "front",
    objectFit: "cover",
  };
  const newImages = [...list, newImg];
  const newRef: UnifiedLayerRef = { kind: "image" as const, id: newImg.id };
  const layerOrder = [...getUnifiedLayers(s), newRef];
  return { list: newImages, layerOrder, newId: newImg.id };
}

// Batched multi-file add — prepends every src in one array update
export function withImagesAdded(
  s: EditorState,
  srcs: string[],
  opts?: { x?: number; y?: number },
): { list: ImageLayer[]; layerOrder: UnifiedLayerRef[]; newIds: string[] } {
  const list = getImageLayers(s);
  const newLayers = srcs.map((src, i) => {
    const layer = makeImageLayer(list.length + i, src, s.width);
    if (opts?.x !== undefined) layer.x = opts.x;
    if (opts?.y !== undefined) layer.y = opts.y;
    return layer;
  });
  const newImages = [...list, ...newLayers];
  const newRefs: UnifiedLayerRef[] = newLayers.map((img) => ({
    kind: "image" as const,
    id: img.id,
  }));
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
export function withImageDuplicated(
  s: EditorState,
  id: string,
): { list: ImageLayer[]; newId: string } {
  const list = getImageLayers(s);
  const idx = list.findIndex((img) => img.id === id);
  if (idx === -1) return { list, newId: id };
  const src = list[idx]!;
  const copy: ImageLayer = { ...src, id: newLayerId(), x: src.x + 4, y: src.y + 4 };
  return { list: [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)], newId: copy.id };
}

export function withImageReordered(
  s: EditorState,
  id: string,
  direction: "up" | "down",
): ImageLayer[] {
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
  return getImageLayers(s).map((img) =>
    idSet.has(img.id) && !img.locked ? { ...img, ...patch } : img,
  );
}

export function withImagesLockSet(s: EditorState, ids: string[], locked: boolean): ImageLayer[] {
  const idSet = new Set(ids);
  return getImageLayers(s).map((img) => (idSet.has(img.id) ? { ...img, locked } : img));
}

export function withImagesAligned(
  s: EditorState,
  ids: string[],
  edge: ShapeAlignEdge,
): ImageLayer[] {
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

export function withImagesShifted(
  s: EditorState,
  ids: string[],
  dxPercent: number,
  dyPercent: number,
): ImageLayer[] {
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
  return (
    bg.includes("gradient") ||
    bg.includes("black") ||
    bg.includes("dark") ||
    bg.includes("#0") ||
    bg.includes("#1")
  );
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

export function withTextDuplicated(
  s: EditorState,
  id: string,
): { list: TextLayer[]; newId: string } {
  const list = getTextLayers(s);
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return { list, newId: id };
  const src = list[idx]!;
  const copy: TextLayer = { ...src, id: newLayerId(), x: src.x + 4, y: src.y + 4 };
  return { list: [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)], newId: copy.id };
}

export function withTextReordered(
  s: EditorState,
  id: string,
  direction: "up" | "down",
): TextLayer[] {
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

function makeShapeLayer(
  position: number,
  kind: ShapeKind,
  radius: number,
  isDarkBg = false,
): ShapeLayer {
  const offset = (position % 6) * 6;
  const isLine = isLineShape(kind);
  const defaultLineColor = isDarkBg ? "#ffffff" : "#000000";
  return {
    id: newLayerId(),
    kind,
    x: 50 + (isLine ? 0 : offset),
    y: 50 + offset,
    size: isLine ? 500 : 200,
    height: isLine ? 24 : undefined,
    color: isLine ? defaultLineColor : "#0021ff",
    strokeWidth: isLine ? 4 : undefined,
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
  opts?: { x?: number; y?: number; size?: number; color?: string; opacity?: number; shadow?: boolean },
): { list: ShapeLayer[]; layerOrder: UnifiedLayerRef[]; newId: string } {
  const list = getShapeLayers(s);
  const isDark = isCanvasBackgroundDark(s.background);
  const newShape = makeShapeLayer(list.length, kind, radius, isDark);
  if (opts?.x !== undefined) newShape.x = opts.x;
  if (opts?.y !== undefined) newShape.y = opts.y;
  if (opts?.size !== undefined) newShape.size = opts.size;
  if (opts?.color !== undefined) newShape.color = opts.color;
  if (opts?.opacity !== undefined) newShape.opacity = opts.opacity;
  if (opts?.shadow !== undefined) newShape.shadow = opts.shadow;
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

export function withShapeDuplicated(
  s: EditorState,
  id: string,
): { list: ShapeLayer[]; newId: string } {
  const list = getShapeLayers(s);
  const idx = list.findIndex((sh) => sh.id === id);
  if (idx === -1) return { list, newId: id };
  const src = list[idx]!;
  const copy: ShapeLayer = { ...src, id: newLayerId(), x: src.x + 4, y: src.y + 4 };
  return { list: [...list.slice(0, idx + 1), copy, ...list.slice(idx + 1)], newId: copy.id };
}

export function withShapeReordered(
  s: EditorState,
  id: string,
  direction: "up" | "down",
): ShapeLayer[] {
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

export function withShadowAdded(
  s: EditorState,
  preset: ShadowPreset,
): { list: ShapeLayer[]; newId: string } {
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
  for (let i = 0; i < texts.length; i++)
    allKnown.set(texts[i]!.id, { kind: "text", id: texts[i]!.id });
  for (let i = 0; i < images.length; i++)
    allKnown.set(images[i]!.id, { kind: "image", id: images[i]!.id });
  for (let i = 0; i < shapes.length; i++)
    allKnown.set(shapes[i]!.id, { kind: "shape", id: shapes[i]!.id });

  if (!s.layerOrder || s.layerOrder.length === 0) {
    const shapesBehind: UnifiedLayerRef[] = [];
    const shapesFront: UnifiedLayerRef[] = [];
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i]!;
      if (sh.layer === "behind") shapesBehind.push({ kind: "shape", id: sh.id });
      else shapesFront.push({ kind: "shape", id: sh.id });
    }
    const imgRefs: UnifiedLayerRef[] = images.map((img) => ({
      kind: "image" as const,
      id: img.id,
    }));
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
      layerOrder:
        direction === "front"
          ? [...otherItems, ...selectedItems]
          : [...selectedItems, ...otherItems],
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
  const canBackward = selectedIndices.some((i) => i > 0 && !idSet.has(stack[i - 1]!.id));
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

export function withShapesAligned(
  s: EditorState,
  ids: string[],
  edge: ShapeAlignEdge,
): ShapeLayer[] {
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
export function withShapesShifted(
  s: EditorState,
  ids: string[],
  dxPercent: number,
  dyPercent: number,
): ShapeLayer[] {
  const idSet = new Set(ids);
  return getShapeLayers(s).map((sh) =>
    idSet.has(sh.id) && !sh.locked ? { ...sh, x: sh.x + dxPercent, y: sh.y + dyPercent } : sh,
  );
}

// Locks/unlocks every id in a mixed-kind multi-selection at once — same
// shape of input as withMultipleLayersRemoved below, used by QuoteCanvas's
// own canvas-anchored multi-selection badge (Lock/Duplicate/Delete), which
// spans text/image/shape together rather than being scoped to one kind the
// way withTextsLockSet/withImagesLockSet/withShapesLockSet individually are.
export function withMultipleLayersLockSet(
  s: EditorState,
  selected: { kind: "text" | "image" | "shape"; id: string }[],
  locked: boolean,
): { texts: TextLayer[]; images: ImageLayer[]; shapes: ShapeLayer[] } {
  const textIds = selected.filter((item) => item.kind === "text").map((item) => item.id);
  const imageIds = selected.filter((item) => item.kind === "image").map((item) => item.id);
  const shapeIds = selected.filter((item) => item.kind === "shape").map((item) => item.id);
  return {
    texts: withTextsLockSet(s, textIds, locked),
    images: withImagesLockSet(s, imageIds, locked),
    shapes: withShapesLockSet(s, shapeIds, locked),
  };
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
  offset?: { x?: number; y?: number } | undefined,
): {
  texts: TextLayer[];
  images: ImageLayer[];
  shapes: ShapeLayer[];
  layerOrder: UnifiedLayerRef[];
  newSelection: { kind: "text" | "image" | "shape"; id: string; startX: number; startY: number }[];
} {
  const dx = offset?.x ?? 0;
  const dy = offset?.y ?? 0;
  const textIds = new Set(selected.filter((item) => item.kind === "text").map((item) => item.id));
  const imageIds = new Set(selected.filter((item) => item.kind === "image").map((item) => item.id));
  const shapeIds = new Set(selected.filter((item) => item.kind === "shape").map((item) => item.id));

  const newSelection: {
    kind: "text" | "image" | "shape";
    id: string;
    startX: number;
    startY: number;
  }[] = [];
  const newRefs: UnifiedLayerRef[] = [];

  const texts = getTextLayers(s).flatMap((t) => {
    if (!textIds.has(t.id) || t.locked) return [t];
    const copy: TextLayer = { ...t, id: newLayerId(), x: t.x + dx, y: t.y + dy };
    newSelection.push({ kind: "text", id: copy.id, startX: copy.x, startY: copy.y });
    newRefs.push({ kind: "text", id: copy.id });
    return [t, copy];
  });
  const images = getImageLayers(s).flatMap((img) => {
    if (!imageIds.has(img.id) || img.locked) return [img];
    const copy: ImageLayer = { ...img, id: newLayerId(), x: img.x + dx, y: img.y + dy };
    newSelection.push({ kind: "image", id: copy.id, startX: copy.x, startY: copy.y });
    newRefs.push({ kind: "image", id: copy.id });
    return [img, copy];
  });
  const shapes = getShapeLayers(s).flatMap((sh) => {
    if (!shapeIds.has(sh.id) || sh.locked) return [sh];
    const copy: ShapeLayer = { ...sh, id: newLayerId(), x: sh.x + dx, y: sh.y + dy };
    newSelection.push({ kind: "shape", id: copy.id, startX: copy.x, startY: copy.y });
    newRefs.push({ kind: "shape", id: copy.id });
    return [sh, copy];
  });

  const layerOrder = [...getUnifiedLayers(s), ...newRefs];

  return { texts, images, shapes, layerOrder, newSelection };
}

/**
 * Rotates multiple selected layers by a given degree delta.
 * If mode is "group", rotates their positions around the collective center as well.
 */
export function withMultipleLayersRotated(
  s: EditorState,
  selected: { kind: "text" | "image" | "shape"; id: string }[],
  rotationDeltaDeg: number,
  mode: "individual" | "group" = "group",
): {
  texts: TextLayer[];
  images: ImageLayer[];
  shapes: ShapeLayer[];
} {
  const textIds = new Set(selected.filter((item) => item.kind === "text").map((item) => item.id));
  const imageIds = new Set(selected.filter((item) => item.kind === "image").map((item) => item.id));
  const shapeIds = new Set(selected.filter((item) => item.kind === "shape").map((item) => item.id));

  if (mode === "group" && rotationDeltaDeg !== 0) {
    const rad = (rotationDeltaDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const allSelectedItems: { x: number; y: number }[] = [
      ...getTextLayers(s).filter((t) => textIds.has(t.id) && !t.locked),
      ...getImageLayers(s).filter((img) => imageIds.has(img.id) && !img.locked),
      ...getShapeLayers(s).filter((sh) => shapeIds.has(sh.id) && !sh.locked),
    ];

    if (allSelectedItems.length > 0) {
      const centerX =
        allSelectedItems.reduce((acc, item) => acc + item.x, 0) / allSelectedItems.length;
      const centerY =
        allSelectedItems.reduce((acc, item) => acc + item.y, 0) / allSelectedItems.length;
      const aspect = s.width / s.height;

      const rotatePoint = (px: number, py: number) => {
        const dx = (px - centerX) * aspect;
        const dy = py - centerY;
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        return {
          x: centerX + rx / aspect,
          y: centerY + ry,
        };
      };

      const texts = getTextLayers(s).map((t) => {
        if (!textIds.has(t.id) || t.locked) return t;
        const pt = rotatePoint(t.x, t.y);
        const nextRotation = ((((t.rotation ?? 0) + rotationDeltaDeg) % 360) + 360) % 360;
        return { ...t, x: pt.x, y: pt.y, rotation: Math.round(nextRotation) };
      });

      const images = getImageLayers(s).map((img) => {
        if (!imageIds.has(img.id) || img.locked) return img;
        const pt = rotatePoint(img.x, img.y);
        const nextRotation = ((((img.rotation ?? 0) + rotationDeltaDeg) % 360) + 360) % 360;
        return { ...img, x: pt.x, y: pt.y, rotation: Math.round(nextRotation) };
      });

      const shapes = getShapeLayers(s).map((sh) => {
        if (!shapeIds.has(sh.id) || sh.locked) return sh;
        const pt = rotatePoint(sh.x, sh.y);
        const nextRotation = ((((sh.rotation ?? 0) + rotationDeltaDeg) % 360) + 360) % 360;
        return { ...sh, x: pt.x, y: pt.y, rotation: Math.round(nextRotation) };
      });

      return { texts, images, shapes };
    }
  }

  const texts = getTextLayers(s).map((t) => {
    if (!textIds.has(t.id) || t.locked) return t;
    const nextRotation = ((((t.rotation ?? 0) + rotationDeltaDeg) % 360) + 360) % 360;
    return { ...t, rotation: Math.round(nextRotation) };
  });

  const images = getImageLayers(s).map((img) => {
    if (!imageIds.has(img.id) || img.locked) return img;
    const nextRotation = ((((img.rotation ?? 0) + rotationDeltaDeg) % 360) + 360) % 360;
    return { ...img, rotation: Math.round(nextRotation) };
  });

  const shapes = getShapeLayers(s).map((sh) => {
    if (!shapeIds.has(sh.id) || sh.locked) return sh;
    const nextRotation = ((((sh.rotation ?? 0) + rotationDeltaDeg) % 360) + 360) % 360;
    return { ...sh, rotation: Math.round(nextRotation) };
  });

  return { texts, images, shapes };
}

/**
 * Scales multiple selected layers relative to the group's bounding box.
 * Takes the original bounding box and new bounding box, and maps all item
 * positions, dimensions, font sizes, stroke widths proportionally.
 */
export function withMultipleLayersScaled(
  s: EditorState,
  selected: { kind: "text" | "image" | "shape"; id: string }[],
  initialItems: {
    kind: "text" | "image" | "shape";
    id: string;
    x: number; // canvas %
    y: number; // canvas %
    size: number;
    width?: number | undefined;
    height?: number | undefined;
    strokeWidth?: number | undefined;
    lineCornerRadius?: number | undefined;
  }[],
  origBounds: { left: number; top: number; width: number; height: number },
  newBounds: { left: number; top: number; width: number; height: number },
): {
  texts: TextLayer[];
  images: ImageLayer[];
  shapes: ShapeLayer[];
} {
  const scaleX = origBounds.width > 0 ? newBounds.width / origBounds.width : 1;
  const scaleY = origBounds.height > 0 ? newBounds.height / origBounds.height : 1;
  const uniformScale = (scaleX + scaleY) / 2;

  const itemMap = new Map(initialItems.map((item) => [`${item.kind}:${item.id}`, item]));

  const texts = getTextLayers(s).map((t) => {
    const orig = itemMap.get(`text:${t.id}`);
    if (!orig || t.locked) return t;

    const origPxX = (orig.x / 100) * s.width;
    const origPxY = (orig.y / 100) * s.height;

    const relX = origPxX - origBounds.left;
    const relY = origPxY - origBounds.top;

    const newPxX = newBounds.left + relX * scaleX;
    const newPxY = newBounds.top + relY * scaleY;

    const nextSize = Math.max(8, Math.round(orig.size * uniformScale));
    const nextWidth =
      orig.width !== undefined ? Math.max(40, Math.round(orig.width * scaleX)) : undefined;
    const nextMinHeight =
      orig.height !== undefined ? Math.max(20, Math.round(orig.height * scaleY)) : undefined;

    return {
      ...t,
      x: (newPxX / s.width) * 100,
      y: (newPxY / s.height) * 100,
      size: nextSize,
      ...(nextWidth !== undefined ? { width: nextWidth } : {}),
      ...(nextMinHeight !== undefined ? { minHeight: nextMinHeight } : {}),
    };
  });

  const images = getImageLayers(s).map((img) => {
    const orig = itemMap.get(`image:${img.id}`);
    if (!orig || img.locked) return img;

    const origPxX = (orig.x / 100) * s.width;
    const origPxY = (orig.y / 100) * s.height;

    const relX = origPxX - origBounds.left;
    const relY = origPxY - origBounds.top;

    const newPxX = newBounds.left + relX * scaleX;
    const newPxY = newBounds.top + relY * scaleY;

    const nextSize = Math.max(10, Math.round(orig.size * scaleX));
    const nextHeight =
      orig.height !== undefined ? Math.max(10, Math.round(orig.height * scaleY)) : undefined;

    return {
      ...img,
      x: (newPxX / s.width) * 100,
      y: (newPxY / s.height) * 100,
      size: nextSize,
      ...(nextHeight !== undefined ? { height: nextHeight } : {}),
    };
  });

  const shapes = getShapeLayers(s).map((sh) => {
    const orig = itemMap.get(`shape:${sh.id}`);
    if (!orig || sh.locked) return sh;

    const origPxX = (orig.x / 100) * s.width;
    const origPxY = (orig.y / 100) * s.height;

    const relX = origPxX - origBounds.left;
    const relY = origPxY - origBounds.top;

    const newPxX = newBounds.left + relX * scaleX;
    const newPxY = newBounds.top + relY * scaleY;

    const isLine = isLineShape(sh.kind);
    const nextSize = Math.max(10, Math.round(orig.size * (isLine ? uniformScale : scaleX)));
    // A line's `height` isn't decorative padding — for an elbowed or curved
    // line it's the tight-fit bounding box the auto-expand-on-drag handlers
    // (see QuoteCanvas's own comments on those) size to just barely contain
    // the actual waypoints. Scaling it by the group's raw scaleY while
    // `size` scales by the uniform (width+height averaged) factor meant the
    // two could drift apart the moment a group resize wasn't perfectly
    // proportional — the box then no longer matched the line's own aspect
    // ratio, leaving visible slack around it instead of staying tight.
    // Lines use the same uniformScale as `size` for exactly that reason;
    // every other shape kind keeps the independent scaleY it always had.
    const nextHeight =
      orig.height !== undefined
        ? Math.max(4, Math.round(orig.height * (isLine ? uniformScale : scaleY)))
        : undefined;
    const nextStrokeWidth =
      orig.strokeWidth !== undefined
        ? Math.max(1, Math.min(24, Math.round(orig.strokeWidth * uniformScale)))
        : undefined;
    // Same uniformScale as the waypoints it fillets — a corner radius set
    // relative to a small elbow box would otherwise swallow the whole bend
    // (or vanish to a hard corner) the instant the group scales up or down.
    const nextCornerRadius =
      orig.lineCornerRadius !== undefined
        ? Math.max(0, Math.round(orig.lineCornerRadius * uniformScale))
        : undefined;
    // The waypoints themselves are stored as absolute pixel coordinates in
    // the shape's OLD size/height box — left un-scaled here, they'd stay
    // anchored to their old positions while size/height (and therefore the
    // percentages LineShapeSvg/QuoteCanvas's handles measure them against)
    // change underneath them, distorting the actual bend/curve shape rather
    // than just resizing its box uniformly around it.
    const nextWaypoints =
      isLine && sh.lineWaypoints
        ? sh.lineWaypoints.map((p) => ({ x: p.x * uniformScale, y: p.y * uniformScale }))
        : undefined;

    return {
      ...sh,
      x: (newPxX / s.width) * 100,
      y: (newPxY / s.height) * 100,
      size: nextSize,
      ...(nextHeight !== undefined ? { height: nextHeight } : {}),
      ...(nextStrokeWidth !== undefined ? { strokeWidth: nextStrokeWidth } : {}),
      ...(nextCornerRadius !== undefined ? { lineCornerRadius: nextCornerRadius } : {}),
      ...(nextWaypoints !== undefined ? { lineWaypoints: nextWaypoints } : {}),
    };
  });

  return { texts, images, shapes };
}

// Batch text utilities — mirrors withShapesAligned / withShapesShifted /
// withShapesUpdated / withShapesLockSet for a multi-text selection.

export function withTextsAligned(s: EditorState, ids: string[], edge: ShapeAlignEdge): TextLayer[] {
  const idSet = new Set(ids);
  return getTextLayers(s).map((t) => {
    if (!idSet.has(t.id) || t.locked) return t;
    const el =
      typeof document !== "undefined"
        ? (document.querySelector(`[data-layer-id="${t.id}"]`) as HTMLElement | null)
        : null;
    const w = el ? el.offsetWidth : (t.width ?? 400);
    const h = el ? el.offsetHeight : (t.minHeight ?? t.size * 1.3);
    switch (edge) {
      case "left":
        return { ...t, x: (w / 2 / s.width) * 100 };
      case "center-h":
        return { ...t, x: 50 };
      case "right":
        return { ...t, x: 100 - (w / 2 / s.width) * 100 };
      case "top":
        return { ...t, y: (h / 2 / s.height) * 100 };
      case "middle-v":
        return { ...t, y: 50 };
      case "bottom":
        return { ...t, y: 100 - (h / 2 / s.height) * 100 };
      default:
        return t;
    }
  });
}

export function withTextsShifted(
  s: EditorState,
  ids: string[],
  dxPercent: number,
  dyPercent: number,
): TextLayer[] {
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
  return getTextLayers(s).map((t) => (idSet.has(t.id) && !t.locked ? { ...t, ...patch } : t));
}

export function withTextsLockSet(s: EditorState, ids: string[], locked: boolean): TextLayer[] {
  const idSet = new Set(ids);
  return getTextLayers(s).map((t) => (idSet.has(t.id) ? { ...t, locked } : t));
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
    images: imageIds.length
      ? withImagesShifted(s, imageIds, dxPercent, dyPercent)
      : getImageLayers(s),
    shapes: shapeIds.length
      ? withShapesShifted(s, shapeIds, dxPercent, dyPercent)
      : getShapeLayers(s),
  };
}

export type SpaceEvenlyDirection = "vertical" | "horizontal" | "tidy";

export function withMixedLayersSpacedEvenly(
  s: EditorState,
  selected: MixedLayerRef[],
  direction: SpaceEvenlyDirection,
): { texts: TextLayer[]; images: ImageLayer[]; shapes: ShapeLayer[] } {
  if (selected.length < 2) {
    return {
      texts: getTextLayers(s),
      images: getImageLayers(s),
      shapes: getShapeLayers(s),
    };
  }

  const items = selected.map((ref) => {
    if (ref.kind === "text") {
      const t = getTextLayers(s).find((item) => item.id === ref.id);
      const el =
        typeof document !== "undefined"
          ? (document.querySelector(`[data-layer-id="${ref.id}"]`) as HTMLElement | null)
          : null;
      const w = el ? el.offsetWidth : (t?.width ?? 300);
      const h = el ? el.offsetHeight : (t?.minHeight ?? (t ? t.size * 1.3 : 40));
      return {
        id: ref.id,
        kind: ref.kind,
        x: t?.x ?? 50,
        y: t?.y ?? 50,
        w,
        h,
        locked: t?.locked ?? false,
      };
    } else if (ref.kind === "image") {
      const img = getImageLayers(s).find((item) => item.id === ref.id);
      return {
        id: ref.id,
        kind: ref.kind,
        x: img?.x ?? 50,
        y: img?.y ?? 50,
        w: img?.size ?? 200,
        h: img?.height ?? img?.size ?? 200,
        locked: img?.locked ?? false,
      };
    } else {
      const sh = getShapeLayers(s).find((item) => item.id === ref.id);
      return {
        id: ref.id,
        kind: ref.kind,
        x: sh?.x ?? 50,
        y: sh?.y ?? 50,
        w: sh?.size ?? 200,
        h: sh?.height ?? sh?.size ?? 200,
        locked: sh?.locked ?? false,
      };
    }
  });

  const unlocked = items.filter((item) => !item.locked);
  if (unlocked.length < 2) {
    return {
      texts: getTextLayers(s),
      images: getImageLayers(s),
      shapes: getShapeLayers(s),
    };
  }

  const newPositions = new Map<string, { x?: number; y?: number }>();

  const distributeVertical = () => {
    const sorted = [...unlocked].sort((a, b) => a.y - b.y);
    const top0 = (sorted[0]!.y / 100) * s.height - sorted[0]!.h / 2;
    const last = sorted[sorted.length - 1]!;
    const bottomLast = (last.y / 100) * s.height + last.h / 2;

    const totalSpan = bottomLast - top0;
    const sumHeights = sorted.reduce((acc, it) => acc + it.h, 0);
    const gap = (totalSpan - sumHeights) / (sorted.length - 1);

    let currentTop = top0;
    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i]!;
      const centerYPx = currentTop + it.h / 2;
      const nextY = Math.round((centerYPx / s.height) * 10000) / 100;
      const prevPos = newPositions.get(it.id) || {};
      newPositions.set(it.id, { ...prevPos, y: nextY });
      currentTop += it.h + gap;
    }
  };

  const distributeHorizontal = () => {
    const sorted = [...unlocked].sort((a, b) => a.x - b.x);
    const left0 = (sorted[0]!.x / 100) * s.width - sorted[0]!.w / 2;
    const last = sorted[sorted.length - 1]!;
    const rightLast = (last.x / 100) * s.width + last.w / 2;

    const totalSpan = rightLast - left0;
    const sumWidths = sorted.reduce((acc, it) => acc + it.w, 0);
    const gap = (totalSpan - sumWidths) / (sorted.length - 1);

    let currentLeft = left0;
    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i]!;
      const centerXPx = currentLeft + it.w / 2;
      const nextX = Math.round((centerXPx / s.width) * 10000) / 100;
      const prevPos = newPositions.get(it.id) || {};
      newPositions.set(it.id, { ...prevPos, x: nextX });
      currentLeft += it.w + gap;
    }
  };

  if (direction === "vertical") {
    distributeVertical();
  } else if (direction === "horizontal") {
    distributeHorizontal();
  } else if (direction === "tidy") {
    const minX = Math.min(...unlocked.map((it) => it.x));
    const maxX = Math.max(...unlocked.map((it) => it.x));
    const minY = Math.min(...unlocked.map((it) => it.y));
    const maxY = Math.max(...unlocked.map((it) => it.y));

    const spanX = (maxX - minX) * s.width;
    const spanY = (maxY - minY) * s.height;

    if (spanY > spanX * 1.3) {
      const avgX = unlocked.reduce((acc, it) => acc + it.x, 0) / unlocked.length;
      for (const it of unlocked) {
        newPositions.set(it.id, { x: Math.round(avgX * 100) / 100 });
      }
      distributeVertical();
    } else if (spanX > spanY * 1.3) {
      const avgY = unlocked.reduce((acc, it) => acc + it.y, 0) / unlocked.length;
      for (const it of unlocked) {
        newPositions.set(it.id, { y: Math.round(avgY * 100) / 100 });
      }
      distributeHorizontal();
    } else {
      distributeHorizontal();
      distributeVertical();
    }
  }

  const texts = getTextLayers(s).map((t) => {
    const p = newPositions.get(t.id);
    if (!p) return t;
    return {
      ...t,
      ...(p.x !== undefined ? { x: p.x } : {}),
      ...(p.y !== undefined ? { y: p.y } : {}),
    };
  });

  const images = getImageLayers(s).map((img) => {
    const p = newPositions.get(img.id);
    if (!p) return img;
    return {
      ...img,
      ...(p.x !== undefined ? { x: p.x } : {}),
      ...(p.y !== undefined ? { y: p.y } : {}),
    };
  });

  const shapes = getShapeLayers(s).map((sh) => {
    const p = newPositions.get(sh.id);
    if (!p) return sh;
    return {
      ...sh,
      ...(p.x !== undefined ? { x: p.x } : {}),
      ...(p.y !== undefined ? { y: p.y } : {}),
    };
  });

  return { texts, images, shapes };
}

export function withShapesSpacedEvenly(
  s: EditorState,
  ids: string[],
  direction: SpaceEvenlyDirection,
): ShapeLayer[] {
  const refs: MixedLayerRef[] = ids.map((id) => ({ kind: "shape", id }));
  return withMixedLayersSpacedEvenly(s, refs, direction).shapes;
}

export function withImagesSpacedEvenly(
  s: EditorState,
  ids: string[],
  direction: SpaceEvenlyDirection,
): ImageLayer[] {
  const refs: MixedLayerRef[] = ids.map((id) => ({ kind: "image", id }));
  return withMixedLayersSpacedEvenly(s, refs, direction).images;
}

export function withTextsSpacedEvenly(
  s: EditorState,
  ids: string[],
  direction: SpaceEvenlyDirection,
): TextLayer[] {
  const refs: MixedLayerRef[] = ids.map((id) => ({ kind: "text", id }));
  return withMixedLayersSpacedEvenly(s, refs, direction).texts;
}
