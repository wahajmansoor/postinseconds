// Upload + manage the current user's custom (TTF/OTF) fonts.
import React, { useRef, useState } from "react";
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
  Crown03Icon,
  CheckmarkCircle02Icon,
} from "hugeicons-react";
import { toast } from "@/components/ui/sonner";

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
  const { user, isPro, openUpgradeModal } = useAuth();
  const { families, isLoading, refresh } = useCustomFonts();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [editingFamilyId, setEditingFamilyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  // familyId to force new variants into (via each family's own "+ Add
  // variant" button) — null means "auto-detect/create per file" (the main
  // uploader at the top).
  const addVariantTargetRef = useRef<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!isPro) {
      onClose();
      openUpgradeModal();
      toast.info("Custom Fonts is a PRO Feature", {
        description: "Upgrade to PRO to upload and manage custom TTF/OTF brand typography.",
      });
      return;
    }
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
          {!isPro ? (
            <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-b from-amber-500/15 via-orange-500/5 to-transparent p-6 text-center space-y-4 shadow-lg">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-amber-950 shadow-md shadow-amber-500/25 ring-4 ring-amber-500/20">
                <Crown03Icon size={28} />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Custom Brand Fonts is a{" "}
                  <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                    PRO Feature
                  </span>
                </h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                  Upgrade to PRO to upload and manage custom TTF/OTF brand typography, unlock 50+
                  creator templates, and export in 4K resolution.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openUpgradeModal();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-xs font-extrabold text-amber-950 shadow-md shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer w-full sm:w-auto"
                >
                  <Crown03Icon size={16} />
                  <span>Get Lifetime Pro for $59</span>
                </button>
              </div>
            </div>
          ) : (
            /* Upload zone */
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
                className="sr-only"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}

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
