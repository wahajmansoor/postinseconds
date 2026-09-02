// User-uploaded custom fonts (TTF/OTF) — Supabase-backed so they follow the
// user's account across devices instead of living only in one browser.
// Deliberately NOT embedded as base64 into the design JSON the way images
// are (see imageCompression.ts) — a font is a reusable asset shared across
// every design, not per-design content, so it lives once in Supabase
// Storage and every design just references the family by name.
import { supabase } from "./supabase";
import type { FontOption } from "@/components/editor/types";
import { parseFontFile, weightToLabel, type ParsedFontInfo } from "./fontFileParser";

const BUCKET = "custom-fonts";

export type CustomFontVariant = {
  id: string;
  familyId: string;
  familyName: string;
  variantLabel: string;
  weight: number;
  italic: boolean;
  fileName: string;
  storagePath: string;
  format: "truetype" | "opentype";
  url: string;
  createdAt: string;
};

export type CustomFontFamily = {
  familyId: string;
  familyName: string;
  /** Sorted by weight (then non-italic before italic at the same weight). */
  variants: CustomFontVariant[];
};

type VariantRow = {
  id: string;
  family_id: string;
  family_name: string;
  variant_label: string;
  weight: number;
  italic: boolean;
  file_name: string;
  storage_path: string;
  format: string;
  created_at: string;
};

function rowToVariant(row: VariantRow): CustomFontVariant {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
  return {
    id: row.id,
    familyId: row.family_id,
    familyName: row.family_name,
    variantLabel: row.variant_label,
    weight: row.weight,
    italic: row.italic,
    fileName: row.file_name,
    storagePath: row.storage_path,
    format: row.format === "opentype" ? "opentype" : "truetype",
    url: data.publicUrl,
    createdAt: row.created_at,
  };
}

function groupIntoFamilies(variants: CustomFontVariant[]): CustomFontFamily[] {
  const byFamily = new Map<string, CustomFontFamily>();
  for (const v of variants) {
    let fam = byFamily.get(v.familyId);
    if (!fam) {
      fam = { familyId: v.familyId, familyName: v.familyName, variants: [] };
      byFamily.set(v.familyId, fam);
    }
    fam.variants.push(v);
  }
  const families = Array.from(byFamily.values());
  for (const fam of families) {
    fam.variants.sort((a, b) => a.weight - b.weight || Number(a.italic) - Number(b.italic));
  }
  families.sort((a, b) => a.familyName.localeCompare(b.familyName));
  return families;
}

export async function fetchCustomFontFamilies(userId: string): Promise<CustomFontFamily[]> {
  const { data, error } = await supabase
    .from("custom_font_variants")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return groupIntoFamilies(((data as VariantRow[]) ?? []).map(rowToVariant));
}

function sanitizeForPath(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export type UploadCustomFontVariantInput = {
  userId: string;
  file: File;
  /** Pass an existing family's id to add this file as another variant of
   * that family; omit (or pass a fresh crypto.randomUUID()) to start a new
   * family. */
  familyId: string;
  familyName: string;
  variantLabel: string;
  weight: number;
  italic: boolean;
  format: "truetype" | "opentype";
};

export async function uploadCustomFontVariant(
  input: UploadCustomFontVariantInput,
): Promise<CustomFontVariant> {
  const variantId = crypto.randomUUID();
  const ext = input.format === "opentype" ? "otf" : "ttf";
  const storagePath = `${input.userId}/${input.familyId}/${variantId}-${sanitizeForPath(input.file.name)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.format === "opentype" ? "font/otf" : "font/ttf",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const row = {
    id: variantId,
    user_id: input.userId,
    family_id: input.familyId,
    family_name: input.familyName,
    variant_label: input.variantLabel,
    weight: input.weight,
    italic: input.italic,
    file_name: input.file.name,
    storage_path: storagePath,
    format: input.format,
  };
  const { error: insertError } = await supabase.from("custom_font_variants").insert(row);
  if (insertError) {
    // Best-effort cleanup so a failed DB insert doesn't leave an orphaned
    // file behind with nothing pointing at it.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw insertError;
  }

  return rowToVariant({ ...row, created_at: new Date().toISOString() });
}

export async function deleteCustomFontVariant(variant: CustomFontVariant): Promise<void> {
  const { error: dbError } = await supabase
    .from("custom_font_variants")
    .delete()
    .eq("id", variant.id);
  if (dbError) throw dbError;
  await supabase.storage.from(BUCKET).remove([variant.storagePath]);
}

export async function deleteCustomFontFamily(family: CustomFontFamily): Promise<void> {
  const { error: dbError } = await supabase
    .from("custom_font_variants")
    .delete()
    .eq("family_id", family.familyId);
  if (dbError) throw dbError;
  await supabase.storage.from(BUCKET).remove(family.variants.map((v) => v.storagePath));
}

export async function updateCustomFontVariant(
  variantId: string,
  patch: { weight?: number; italic?: boolean; variantLabel?: string },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.weight !== undefined) row["weight"] = patch.weight;
  if (patch.italic !== undefined) row["italic"] = patch.italic;
  if (patch.variantLabel !== undefined) row["variant_label"] = patch.variantLabel;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("custom_font_variants").update(row).eq("id", variantId);
  if (error) throw error;
}

export async function renameCustomFontFamily(
  familyId: string,
  userId: string,
  newName: string,
): Promise<void> {
  const { error } = await supabase
    .from("custom_font_variants")
    .update({ family_name: newName })
    .eq("family_id", familyId)
    .eq("user_id", userId);
  if (error) throw error;
}

// Reads a File's own binary and returns the same auto-detected info the
// upload dialog pre-fills the form with — split out from the dialog
// component so it's independently testable and reusable.
export async function inspectFontFile(
  file: File,
): Promise<Omit<ParsedFontInfo, "weight"> & { weight: number; suggestedLabel: string }> {
  const buffer = await file.arrayBuffer();
  const info = parseFontFile(buffer);
  const weight = info.weight ?? 400;
  const italic = info.italic;
  return { ...info, weight, suggestedLabel: weightToLabel(weight, italic) };
}

// ---------------------------------------------------------------------------
// @font-face registration — the runtime counterpart of loadGoogleFont
// (fontLoader.ts), just backed by the user's own uploaded files instead of
// Google's CDN. Rebuilds the *entire* stylesheet from the given families
// every call, rather than incrementally appending rules keyed by variant
// id — a variant's weight/italic/family name can change after its rule was
// first injected (editing a variant in the manager dialog), and appending
// forever would leave a stale rule declaring the old weight/style sitting
// alongside the new one, which the browser would still consider a valid
// (wrong) match. The families list here is always small (a handful of a
// user's own uploads), so rebuilding on every call — every react-query
// refetch after an upload/edit/delete — costs nothing measurable.
// ---------------------------------------------------------------------------
let styleEl: HTMLStyleElement | null = null;

function getStyleEl(): HTMLStyleElement {
  if (styleEl && styleEl.isConnected) return styleEl;
  styleEl = document.getElementById("custom-fonts-style") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "custom-fonts-style";
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

export function registerCustomFontFaces(families: CustomFontFamily[]): void {
  if (typeof document === "undefined") return;
  let css = "";
  for (const family of families) {
    for (const variant of family.variants) {
      css += `@font-face{font-family:${JSON.stringify(family.familyName)};src:url(${JSON.stringify(
        variant.url,
      )}) format(${JSON.stringify(variant.format)});font-weight:${variant.weight};font-style:${
        variant.italic ? "italic" : "normal"
      };font-display:swap;}\n`;
    }
  }
  getStyleEl().textContent = css;
}

// Converts a family into the same FontOption shape every picker already
// works with (see types.ts) — `value` is just the quoted family name with
// no generic fallback, same as how a Google Font's value looks once quoted.
export function customFontFamilyToOption(family: CustomFontFamily): FontOption {
  return {
    label: family.familyName,
    value: `"${family.familyName}"`,
    isCustom: true,
    weights: Array.from(new Set(family.variants.map((v) => v.weight))).sort((a, b) => a - b),
  };
}
