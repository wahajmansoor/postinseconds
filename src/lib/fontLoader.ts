/**
 * Dynamic On-Demand Google Font Loader
 */
const loadedFonts = new Set<string>();

export function loadGoogleFont(fontFamilyValue: string) {
  if (typeof document === "undefined" || !fontFamilyValue) return;

  // Extract clean font name from values like '"Plus Jakarta Sans", sans-serif'
  const match = fontFamilyValue.match(/^"([^"]+)"/);
  const firstPart = fontFamilyValue.split(",")[0] ?? "";
  const fontName = match ? match[1] : firstPart.replace(/['"]/g, "").trim();
  if (!fontName || loadedFonts.has(fontName)) return;

  // Skip system fonts
  const systemFonts = [
    "serif",
    "sans-serif",
    "monospace",
    "ui-sans-serif",
    "system-ui",
    "Georgia",
    "Times New Roman",
    "Arial",
    "Courier New",
  ];
  if (systemFonts.includes(fontName)) return;

  loadedFonts.add(fontName);
  const linkId = `gfont-${fontName.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(linkId)) return;

  const link = document.createElement("link");
  link.id = linkId;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap`;
  link.onerror = () => {
    // Fallback if specific axes are not available for this font
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}&display=swap`;
  };
  document.head.appendChild(link);
}
