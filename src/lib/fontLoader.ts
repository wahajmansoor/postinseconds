/**
 * Dynamic On-Demand Google Font Loader
 */
const loadedFonts = new Set<string>();

const SYSTEM_AND_GENERIC_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "georgia",
  "times new roman",
  "times",
  "arial",
  "courier new",
  "courier",
  "helvetica",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "impact",
  "comic sans ms",
  "quot",
  "inherit",
  "initial",
  "unset",
]);

export function loadGoogleFont(fontFamilyValue: string) {
  if (typeof document === "undefined" || !fontFamilyValue) return;

  // Unescape HTML entities if any (like &quot; or &#39;)
  const raw = fontFamilyValue
    .replace(/&quot;/g, "")
    .replace(/&#39;/g, "")
    .replace(/&apos;/g, "")
    .replace(/&amp;/g, "");

  // Extract clean font name from values like '"Plus Jakarta Sans", sans-serif'
  const match = raw.match(/["']([^"']+)["']/);
  const firstPart = raw.split(",")[0] ?? "";
  const fontName = ((match && match[1]) ? match[1] : firstPart)
    .replace(/['"]/g, "")
    .trim();

  // Validate that fontName is a real font family name (alphanumeric, spaces, hyphens)
  if (!fontName || fontName.length < 2 || !/^[a-zA-Z0-9\s\-+]+$/.test(fontName)) return;

  const lower = fontName.toLowerCase();
  if (SYSTEM_AND_GENERIC_FONTS.has(lower)) return;
  if (loadedFonts.has(lower)) return;

  loadedFonts.add(lower);
  const linkId = `gfont-${fontName.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(linkId)) return;

  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  const safeName = fontName.replace(/\s+/g, "+");
  link.href = `https://fonts.googleapis.com/css2?family=${safeName}:wght@400;600;700;800&display=swap`;
  link.onerror = () => {
    // Fallback without specific weights if the font has only default weight
    link.href = `https://fonts.googleapis.com/css2?family=${safeName}&display=swap`;
  };
  document.head.appendChild(link);
}
