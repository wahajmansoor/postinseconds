import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { upsertTemplate, saveQuoteDesign } from "@/lib/supabase";
import { compressImageFile } from "@/lib/imageCompression";
import { type EditorState, type Template } from "./types";
import { TemplatePreview } from "./TemplatePreview";
import {
  CheckmarkCircle02Icon,
  CrownIcon,
  Folder01Icon,
  SecurityCheckIcon,
  SparklesIcon,
  StarCircleIcon,
} from "hugeicons-react";
import { toast } from "@/components/ui/sonner";

interface SaveTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  s: EditorState;
  onSaved?: (newTemplate: Template) => void;
}

export function SaveTemplateDialog({ open, onClose, s, onSaved }: SaveTemplateDialogProps) {
  const { user, isAdmin, isAuthenticated, openLoginModal } = useAuth();
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [saveType, setSaveType] = useState<"premium" | "starter" | "my_saved">("my_saved");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Set default save type and auto pre-fill template title from canvas postName or text
  React.useEffect(() => {
    if (open) {
      if (s.postName && s.postName.trim() && s.postName !== "Untitled Post") {
        setLabel(s.postName.trim().slice(0, 45));
      } else {
        const mainText = s.texts && s.texts.length > 0 ? s.texts[0]?.text : "";
        if (mainText && mainText.trim()) {
          setLabel(mainText.trim().slice(0, 45));
        } else {
          setLabel(s.postName || "Untitled Post");
        }
      }
    }
    if (isAdmin) {
      setSaveType("premium");
    } else {
      setSaveType("my_saved");
    }
  }, [isAdmin, open, s]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    setSaving(true);
    try {
      if (isAdmin && (saveType === "premium" || saveType === "starter")) {
        // ADMIN: Save to global platform templates
        const isPremium = saveType === "premium";
        const templateId = (isPremium ? "premium-custom-" : "starter-custom-") + Math.random().toString(36).substring(2, 9);

        const newTemplate: Template = {
          id: templateId,
          label: label.trim(),
          category: isPremium ? "premium" : "starter",
          is_premium: isPremium,
          description:
            description.trim() || (isPremium ? "Custom Premium Pro layout" : "Custom Starter layout"),
          thumbnailUrl: thumbnailUrl.trim() || undefined,
          state: { ...s },
        };

        const ok = await upsertTemplate(newTemplate, isPremium, user?.email);
        if (!ok) {
          toast.error("Failed to save template. Please check database permissions.");
          return;
        }
        if (onSaved) onSaved(newTemplate);
      } else {
        // REGULAR USER (OR ADMIN SAVING PRIVATELY): Save to user's personal saved library
        const userId = user?.id || "local_user";
        await saveQuoteDesign(userId, label.trim(), { ...s });
        if (onSaved) {
          onSaved({
            id: "quote_" + Date.now(),
            label: label.trim(),
            description: `Saved ${new Date().toLocaleDateString()}`,
            state: { ...s },
          });
        }
      }

      // Broadcast custom event so LeftPanel and top toolbar update instantly
      window.dispatchEvent(
        new CustomEvent("postinseconds:template-saved", {
          detail: { category: saveType },
        }),
      );

      setSuccess(true);
      toast.success(
        saveType === "premium"
          ? "Premium Template published successfully!"
          : saveType === "starter"
            ? "Starter Template published successfully!"
            : "Template saved to your personal library!",
      );
      setTimeout(() => {
        setSuccess(false);
        setLabel("");
        setDescription("");
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error("Save template error:", err);
      toast.error(err.message || "Could not save template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span
              className={`grid h-9 w-9 place-items-center rounded-xl shadow-md ${
                saveType === "premium"
                  ? "bg-gradient-to-tr from-amber-500 to-pink-500 text-white"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {saveType === "premium" ? <StarCircleIcon size={18} /> : <Folder01Icon size={18} />}
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                {isAdmin && saveType !== "my_saved" ? "Publish Platform Template" : "Save to My Templates"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isAdmin && saveType !== "my_saved"
                  ? "Publish to the global templates catalog for all users."
                  : "Save to your personal library to reload, edit, and reuse anytime."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckmarkCircle02Icon size={28} />
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">Template Saved Successfully!</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAdmin && saveType !== "my_saved"
                ? `Published to platform ${saveType === "premium" ? "Premium" : "Starter"} templates.`
                : "Saved to your personal 'My Saved Templates' tab to reuse anytime."}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            {/* Live Preview Card */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/80 bg-muted/40 p-3">
              <TemplatePreview
                template={{
                  id: "preview",
                  label: label || "Template Preview",
                  description: description,
                  thumbnailUrl: thumbnailUrl.trim() || undefined,
                  state: s,
                }}
                width={180}
              />
              {thumbnailUrl ? (
                <span className="mt-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                  ✓ Custom Thumbnail Active
                </span>
              ) : null}
            </div>

            {/* Role-Based Destination Selector */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Save Location</label>
                {isAdmin ? (
                  <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-500">
                    <CrownIcon size={11} /> Admin Controls
                  </span>
                ) : null}
              </div>

              {isAdmin ? (
                /* ADMIN SELECTOR: Premium / Starter / My Saved */
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveType("premium")}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                      saveType === "premium"
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-500 shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <StarCircleIcon size={16} />
                    <span className="text-[11px]">Platform Premium</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSaveType("starter")}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                      saveType === "starter"
                        ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <SparklesIcon size={16} />
                    <span className="text-[11px]">Platform Starter</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSaveType("my_saved")}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                      saveType === "my_saved"
                        ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-500 shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Folder01Icon size={16} />
                    <span className="text-[11px]">Personal Library</span>
                  </button>
                </div>
              ) : (
                /* REGULAR USER NOTICE: Personal Saved Library */
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <Folder01Icon size={15} className="text-primary" />
                    <span>My Saved Templates</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    This template will be saved to your personal library so you can reuse and customize it anytime with 1 click.
                  </p>
                </div>
              )}
            </div>

            {/* Template Name */}
            <div>
              <label htmlFor="save-template-name" className="mb-1.5 block text-xs font-semibold text-foreground">
                Template Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                id="save-template-name"
                name="templateName"
                required
                placeholder="e.g. My Weekly Announcement Design"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            {/* Description (for Admin platform templates) */}
            {isAdmin && saveType !== "my_saved" ? (
              <>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="save-template-thumbnail" className="text-xs font-semibold text-foreground">
                      Cover / Thumbnail Image (Optional)
                    </label>
                    {thumbnailUrl ? (
                      <button
                        type="button"
                        onClick={() => setThumbnailUrl("")}
                        className="text-[10px] font-medium text-destructive hover:underline"
                      >
                        Remove Cover
                      </button>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="save-template-thumbnail"
                      name="templateThumbnailUrl"
                      placeholder="Paste image URL (e.g. Unsplash or CDN)"
                      value={thumbnailUrl}
                      onChange={(e) => setThumbnailUrl(e.target.value)}
                      className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-border bg-secondary/60 px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary shrink-0">
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const compressed = await compressImageFile(file, {
                                maxDimension: 600,
                                quality: 0.82,
                              });
                              setThumbnailUrl(compressed);
                            } catch (err) {
                              console.error("Failed to compress image:", err);
                            }
                          }
                        }}
                      />
                    </label>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                    Showcases this cover in the template list while keeping placeholder images inside the canvas to protect against copyright issues.
                  </p>
                </div>

                <div>
                  <label htmlFor="save-template-desc" className="mb-1.5 block text-xs font-semibold text-foreground">Description</label>
                  <input
                    type="text"
                    id="save-template-desc"
                    name="templateDescription"
                    placeholder="e.g. High-impact dark theme with top badge and custom gradients."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </>
            ) : null}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-border/80 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !label.trim()}
                className={`flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50 ${
                  saveType === "premium"
                    ? "bg-gradient-to-r from-amber-500 to-pink-500"
                    : "bg-primary"
                }`}
              >
                {saving
                  ? "Saving..."
                  : isAdmin && saveType !== "my_saved"
                    ? "Publish to Platform"
                    : "Save Updated File"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
