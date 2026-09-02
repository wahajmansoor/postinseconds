// Minimal SFNT (TTF/OTF) binary parser — reads just enough of a font file's
// own tables to auto-suggest a family name, style label, weight, and italic
// flag when the user uploads it, so the Custom Fonts uploader doesn't force
// them to type "Bold" by hand for a file that already says so internally.
// Deliberately doesn't touch glyph data (glyf/CFF/etc.) at all — only the
// table directory, `head`, `OS/2`, and `name` tables, which together are a
// few hundred bytes near the start/middle of the file regardless of how
// large the glyph set is.
//
// Reference: the OpenType spec's table layouts (head, OS/2, name) — these
// three tables have been stable since TrueType's original 1990s spec and
// every real-world font (Google Fonts, Adobe, a designer's export from
// Glyphs/FontLab/FontForge) includes them, so this covers the vast
// majority of uploads. A font missing them (unusual — e.g. a stripped
// subset) just falls back to filename-derived guesses, handled by the
// caller.

export type ParsedFontInfo = {
  format: "truetype" | "opentype" | null;
  /** Font Family name from the `name` table (prefers the "Typographic
   * Family" record over the legacy 4-style-limited one). */
  familyName: string | null;
  /** Font Subfamily / style name, e.g. "Bold", "SemiBold Italic". */
  subfamilyName: string | null;
  /** OS/2.usWeightClass rounded to the nearest 100, clamped to [100,900]. */
  weight: number | null;
  italic: boolean;
};

const WIN_PLATFORM_ID = 3;
const MAC_PLATFORM_ID = 1;

function readNameTable(view: DataView, tableStart: number, tableLength: number) {
  // Both name table formats (0 and 1) share this same record layout for
  // the part we care about — format 1's extra language-tag records live
  // after it and are irrelevant here.
  const format = view.getUint16(tableStart);
  if (format !== 0 && format !== 1) return null;
  const count = view.getUint16(tableStart + 2);
  const stringStorageStart = tableStart + view.getUint16(tableStart + 4);
  const records: { platformID: number; encodingID: number; nameID: number; text: string }[] = [];

  for (let i = 0; i < count; i++) {
    const recordStart = tableStart + 6 + i * 12;
    if (recordStart + 12 > tableStart + tableLength) break;
    const platformID = view.getUint16(recordStart);
    const encodingID = view.getUint16(recordStart + 2);
    const nameID = view.getUint16(recordStart + 6);
    const length = view.getUint16(recordStart + 8);
    const offset = view.getUint16(recordStart + 10);
    const strStart = stringStorageStart + offset;
    if (strStart + length > view.byteLength) continue;

    let text = "";
    if (platformID === WIN_PLATFORM_ID) {
      // UTF-16BE, the near-universal case for Windows-platform name records.
      try {
        text = new TextDecoder("utf-16be").decode(
          new Uint8Array(view.buffer, view.byteOffset + strStart, length),
        );
      } catch {
        continue;
      }
    } else if (platformID === MAC_PLATFORM_ID) {
      // Mac Roman — approximated as Latin-1/ASCII, close enough for the
      // plain-ASCII family/style names virtually every real font uses.
      let s = "";
      for (let j = 0; j < length; j++) s += String.fromCharCode(view.getUint8(strStart + j));
      text = s;
    } else {
      continue;
    }
    if (text) records.push({ platformID, encodingID, nameID, text });
  }
  return records;
}

function pickName(
  records: { platformID: number; encodingID: number; nameID: number; text: string }[],
  preferredId: number,
  fallbackId: number,
): string | null {
  const byId = (id: number) =>
    records.find((r) => r.nameID === id && r.platformID === WIN_PLATFORM_ID) ??
    records.find((r) => r.nameID === id);
  return byId(preferredId)?.text ?? byId(fallbackId)?.text ?? null;
}

export function parseFontFile(buffer: ArrayBuffer): ParsedFontInfo {
  const result: ParsedFontInfo = {
    format: null,
    familyName: null,
    subfamilyName: null,
    weight: null,
    italic: false,
  };
  if (buffer.byteLength < 12) return result;
  const view = new DataView(buffer);

  const sfntVersion = view.getUint32(0);
  if (sfntVersion === 0x4f54544f) {
    result.format = "opentype"; // 'OTTO' — CFF-flavored OpenType
  } else if (sfntVersion === 0x00010000 || sfntVersion === 0x74727565) {
    result.format = "truetype"; // TrueType-flavored (glyf outlines)
  } else {
    return result; // Not a recognizable single-font SFNT (e.g. a .ttc collection) — bail.
  }

  const numTables = view.getUint16(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const entryStart = 12 + i * 16;
    if (entryStart + 16 > buffer.byteLength) break;
    const tag = String.fromCharCode(
      view.getUint8(entryStart),
      view.getUint8(entryStart + 1),
      view.getUint8(entryStart + 2),
      view.getUint8(entryStart + 3),
    );
    tables.set(tag, {
      offset: view.getUint32(entryStart + 8),
      length: view.getUint32(entryStart + 12),
    });
  }

  const head = tables.get("head");
  if (head && head.offset + 46 <= buffer.byteLength) {
    const macStyle = view.getUint16(head.offset + 44);
    if (macStyle & 0x02) result.italic = true; // bit 1 = italic
  }

  const os2 = tables.get("OS/2");
  if (os2 && os2.offset + 64 <= buffer.byteLength) {
    const usWeightClass = view.getUint16(os2.offset + 4);
    if (usWeightClass > 0) {
      result.weight = Math.min(900, Math.max(100, Math.round(usWeightClass / 100) * 100));
    }
    const fsSelection = view.getUint16(os2.offset + 62);
    if (fsSelection & 0x01) result.italic = true; // bit 0 = italic
  }

  const name = tables.get("name");
  if (name && name.offset + name.length <= buffer.byteLength) {
    const records = readNameTable(view, name.offset, name.length);
    if (records) {
      // nameID 16/17 ("Typographic Family/Subfamily") are the correct
      // group for fonts with more than the legacy 4 basic styles — e.g. a
      // "Black" weight is usually only present under 16/17, since the
      // legacy nameID 1/2 pair is meant to only ever describe one of
      // Regular/Bold/Italic/Bold Italic per family per the old spec.
      result.familyName = pickName(records, 16, 1);
      result.subfamilyName = pickName(records, 17, 2);
    }
  }

  return result;
}

// Best-effort weight/italic guess purely from a style name string (used as
// a fallback when OS/2 is missing, and to sanity-check/override a
// generic-looking OS/2 weight against an explicit word in the style name —
// e.g. some hand-exported fonts leave usWeightClass at the default 400
// even for a file clearly named "Bold"). Order matters: longer/more
// specific phrases first so "Extra Bold" matches before plain "Bold" does.
const WEIGHT_KEYWORDS: [RegExp, number][] = [
  [/\bthin\b/i, 100],
  [/\bhairline\b/i, 100],
  [/\bextra[\s-]?light\b|\bultra[\s-]?light\b/i, 200],
  [/\blight\b/i, 300],
  [/\bregular\b|\bnormal\b|\bbook\b/i, 400],
  [/\bmedium\b/i, 500],
  [/\bsemi[\s-]?bold\b|\bdemi[\s-]?bold\b/i, 600],
  [/\bextra[\s-]?bold\b|\bultra[\s-]?bold\b/i, 800],
  [/\bbold\b/i, 700],
  [/\bblack\b|\bheavy\b/i, 900],
];

export function guessWeightFromName(styleName: string): number | null {
  for (const [re, weight] of WEIGHT_KEYWORDS) {
    if (re.test(styleName)) return weight;
  }
  return null;
}

export function guessItalicFromName(styleName: string): boolean {
  return /\bitalic\b|\boblique\b/i.test(styleName);
}

// Human-readable label for a weight+italic pair — matches the wording
// ALL_FONT_WEIGHTS (types.ts) already uses elsewhere in the app, so a
// custom font's variant list reads the same way a Google Font's does.
const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

export function weightToLabel(weight: number, italic: boolean): string {
  const base = WEIGHT_LABELS[weight] ?? `${weight}`;
  return italic ? `${base} Italic` : base;
}
