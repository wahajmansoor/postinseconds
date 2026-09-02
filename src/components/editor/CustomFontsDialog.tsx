// Upload + manage the current user's custom (TTF/OTF) fonts. Several files
// that are really weight/style variants of the same typeface (Regular,
// SemiBold, Bold, Black, ...) get grouped under one family — either
// automatically (same family name detected/typed) or by explicitly using
// "+ Add variant" on an existing family — so the rest of the editor's font
// pickers offer them as a single font with a normal weight dropdown, the
// same as any Google Font.
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  uploadCustomFontVariant,
  deleteCustomFontVariant,
  deleteCustomFontFamily,
  renameCustomFontFamily,
  updateCustomFontVariant,
  inspectFontFile,
  type CustomFontFamily,
  type CustomFontVariant,
} from "@/lib/customFonts";
import { useCustomFonts } from "@/hooks/useCustomFonts";
import { ALL_FONT_WEIGHTS } from "./types";
import { cn } from "@/lib/utils";
import {
  TextFontIcon,
  Upload01Icon,
  Delete02Icon,
  Add01Icon,
  Loading03Icon,
  AlertCircleIcon,
} from "hugeicons-react";

interface CustomFontsDialogProps {
  open: boolean;
  onClose: () => void;
}

type PendingUpload = {
  key: string;
  fileName: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

export function CustomFontsDialog({ open, onClose }: CustomFontsDialogProps) {
  const { user } = useAuth();
  const { families, isLoading, refresh } = useCustomFonts();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  // familyId to force new variants into (via each family's own "+ Add
  // variant" button) — null means "auto-detect/create per file" (the main
  // uploader at the top).
  const addVariantTargetRef = useRef<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clicking the hidden file input opens the browser's native OS file
  // picker, which steals the whole window's focus for as long as it's
  // open. Radix Dialog's dismiss-on-outside-interaction logic reads that
  // focus loss (and its return once the picker closes, whether a file was
  // picked or the picker was cancelled) as "the user clicked/focused
  // something outside the dialog" and closes it — a well-documented Radix
  // Dialog + <input type="file"> interaction, confirmed here by the fact
  // it can't even be reproduced in headless/CDP-driven testing (Playwright
  // intercepts the file-chooser request before a real native dialog, and
  // thus a real window-focus loss, ever happens). Guarded by suppressing
  // any outside-dismissal for as long as a file-picker interaction is in
  // flight: the flag goes up the instant the input is pressed, and comes
  // down either when the window regains focus (the reliable signal a
  // native OS dialog just closed) or after a safety-net timeout in case
  // that event doesn't fire for some reason.
  const suppressDismissRef = useRef(false);
  const armDismissSuppression = () => {
    suppressDismissRef.current = true;
    const clear = () => {
      suppressDismissRef.current = false;
      window.removeEventListener("focus", clear);
    };
    window.addEventListener("focus", clear);
    setTimeout(clear, 2000);
  };

  if (!user) return null;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => /\.(ttf|otf)$/i.test(f.name));
    if (files.length === 0) return;

    const forcedTarget = addVariantTargetRef.current;
    addVariantTargetRef.current = null;

    // Group files uploaded in the same batch by detected family name too,
    // so selecting "Regular.ttf" + "Bold.ttf" of the same typeface at once
    // lands in one family even though neither exists yet.
    const newFamiliesThisBatch = new Map<string, { id: string; name: string }>();

    const uploads = files.map(async (file) => {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setPending((p) => [...p, { key, fileName: file.name, status: "uploading" }]);
      try {
        const info = await inspectFontFile(file);
        if (!info.format) {
          throw new Error("Not a recognizable TTF/OTF font file.");
        }
        const detectedFamilyName =
          info.familyName?.trim() || file.name.replace(/\.(ttf|otf)$/i, "").trim() || "Custom Font";

        let target = forcedTarget;
        if (!target) {
          const existing = families.find(
            (f) => f.familyName.toLowerCase() === detectedFamilyName.toLowerCase(),
          );
          const inThisBatch = newFamiliesThisBatch.get(detectedFamilyName.toLowerCase());
          target = existing
            ? { id: existing.familyId, name: existing.familyName }
            : (inThisBatch ?? { id: crypto.randomUUID(), name: detectedFamilyName });
          if (!existing) newFamiliesThisBatch.set(detectedFamilyName.toLowerCase(), target);
        }

        await uploadCustomFontVariant({
          userId: user.id,
          file,
          familyId: target.id,
          familyName: target.name,
          variantLabel: info.suggestedLabel,
          weight: info.weight,
          italic: info.italic,
          format: info.format,
        });
        setPending((p) => p.map((x) => (x.key === key ? { ...x, status: "done" } : x)));
      } catch (err) {
        setPending((p) =>
          p.map((x) =>
            x.key === key
              ? {
                  ...x,
                  status: "error",
                  error: err instanceof Error ? err.message : "Upload failed",
                }
              : x,
          ),
        );
      }
    });

    await Promise.all(uploads);
    refresh();
    // Clear finished/errored entries after a short delay so success flashes
    // briefly instead of vanishing instantly, but errors don't linger
    // forever cluttering the dialog.
    setTimeout(() => setPending((p) => p.filter((x) => x.status === "uploading")), 3000);
  };

  const startAddVariant = (family: CustomFontFamily) => {
    addVariantTargetRef.current = { id: family.familyId, name: family.familyName };
    armDismissSuppression();
    fileInputRef.current?.click();
  };

  const commitRename = async (family: CustomFontFamily) => {
    const trimmed = editingName.trim();
    setEditingFamilyId(null);
    if (!trimmed || trimmed === family.familyName) return;
    await renameCustomFontFamily(family.familyId, user.id, trimmed);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        onInteractOutside={(e) => {
          if (suppressDismissRef.current) e.preventDefault();
        }}
        className="max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl border border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl flex flex-col"
      >
        <DialogHeader className="border-b border-border/60 p-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <TextFontIcon size={18} />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-foreground">Custom Fonts</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Upload your own TTF/OTF files — different weights of the same font (Regular,
                SemiBold, Bold, Black...) can be grouped into one font family.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Upload zone */}
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/80 bg-secondary/30 px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-secondary/50"
            onPointerDown={armDismissSuppression}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              addVariantTargetRef.current = null;
              void handleFiles(e.dataTransfer.files);
            }}
          >
            <Upload01Icon size={22} className="text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Click to upload, or drag and drop .ttf / .otf files
            </span>
            <span className="text-[11px] text-muted-foreground">
              You can select several files at once — matching family names are grouped
              automatically.
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ttf,.otf,font/ttf,font/otf"
              multiple
              // `sr-only` (clipped to 1px, not `display:none`) rather than
              // the usual `hidden` class here — this is the real fix for
              // the dialog closing itself the instant this upload zone is
              // clicked. A `display:none` element can never become
              // document.activeElement; when the label tries to hand focus
              // off to it on click, focus has nowhere valid to land inside
              // the dialog, and Radix's Dialog reads that as focus escaping
              // outside the modal and closes it — immediately, before any
              // native file picker even opens, which is why the earlier
              // "suppress dismissal while a native picker might be open"
              // guard alone didn't fix this. Keeping the input focusable
              // (just visually clipped to nothing) means focus lands on a
              // real element still inside the dialog's DOM, so Radix never
              // sees an outside-focus event to react to in the first place.
              className="sr-only"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {pending.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-border/60 bg-card/60 p-2.5">
              {pending.map((p) => (
                <div key={p.key} className="flex items-center gap-2 text-xs">
                  {p.status === "uploading" ? (
                    <Loading03Icon
                      size={13}
                      className="shrink-0 animate-spin text-muted-foreground"
                    />
                  ) : p.status === "error" ? (
                    <AlertCircleIcon size={13} className="shrink-0 text-destructive" />
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.fileName}</span>
                  {p.status === "error" && (
                    <span className="shrink-0 text-[10px] text-destructive">{p.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Existing families */}
          {isLoading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Loading your fonts…
            </div>
          ) : families.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No custom fonts uploaded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {families.map((family) => (
                <FamilyCard
                  key={family.familyId}
                  family={family}
                  isEditingName={editingFamilyId === family.familyId}
                  editingName={editingName}
                  onStartEditName={() => {
                    setEditingFamilyId(family.familyId);
                    setEditingName(family.familyName);
                  }}
                  onChangeEditingName={setEditingName}
                  onCommitName={() => commitRename(family)}
                  onAddVariant={() => startAddVariant(family)}
                  onDeleteFamily={async () => {
                    await deleteCustomFontFamily(family);
                    refresh();
                  }}
                  onUpdateVariant={async (variant, patch) => {
                    await updateCustomFontVariant(variant.id, patch);
                    refresh();
                  }}
                  onDeleteVariant={async (variant) => {
                    await deleteCustomFontVariant(variant);
                    refresh();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FamilyCard({
  family,
  isEditingName,
  editingName,
  onStartEditName,
  onChangeEditingName,
  onCommitName,
  onAddVariant,
  onDeleteFamily,
  onUpdateVariant,
  onDeleteVariant,
}: {
  family: CustomFontFamily;
  isEditingName: boolean;
  editingName: string;
  onStartEditName: () => void;
  onChangeEditingName: (v: string) => void;
  onCommitName: () => void;
  onAddVariant: () => void;
  onDeleteFamily: () => void;
  onUpdateVariant: (
    variant: CustomFontVariant,
    patch: { weight?: number; italic?: boolean },
  ) => void;
  onDeleteVariant: (variant: CustomFontVariant) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {isEditingName ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => onChangeEditingName(e.target.value)}
            onBlur={onCommitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
            className="min-w-0 flex-1 rounded-lg border border-primary/50 bg-input px-2 py-1 text-sm font-semibold text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onStartEditName}
            style={{ fontFamily: `"${family.familyName}"` }}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground hover:text-primary"
            title="Click to rename"
          >
            {family.familyName}
          </button>
        )}
        <button
          type="button"
          onClick={onDeleteFamily}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Delete font family"
        >
          <Delete02Icon size={14} />
        </button>
      </div>

      <div className="space-y-1.5">
        {family.variants.map((variant) => (
          <div
            key={variant.id}
            className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/60 px-2 py-1.5"
          >
            <span
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
              title={variant.fileName}
            >
              {variant.fileName}
            </span>
            <select
              value={variant.weight}
              onChange={(e) => onUpdateVariant(variant, { weight: Number(e.target.value) })}
              className="shrink-0 rounded-lg border border-border/70 bg-input px-1.5 py-1 text-[11px] text-foreground outline-none"
            >
              {ALL_FONT_WEIGHTS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
            <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={variant.italic}
                onChange={(e) => onUpdateVariant(variant, { italic: e.target.checked })}
                className="accent-primary"
              />
              Italic
            </label>
            <button
              type="button"
              onClick={() => onDeleteVariant(variant)}
              className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Delete this variant"
            >
              <Delete02Icon size={12} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddVariant}
        className={cn(
          "mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary",
        )}
      >
        <Add01Icon size={13} />
        Add variant to this font
      </button>
    </div>
  );
}
