import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { updateOwnProfile } from "@/lib/supabase";
import { compressImageFile } from "@/lib/imageCompression";
import { CheckmarkCircle02Icon, ImageUploadIcon, UserCircleIcon } from "hugeicons-react";

interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function EditProfileDialog({ open, onClose }: EditProfileDialogProps) {
  const { user, updateLocalUser } = useAuth();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the form to the current profile every time the dialog opens
  useEffect(() => {
    if (open && user) {
      setName(user.name);
      setAvatar(user.avatar);
      setSuccess(false);
    }
  }, [open, user]);

  if (!user) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // A profile avatar never needs to be more than a few hundred px on
    // screen — capping much smaller than the general upload paths
    // (imageCompression.ts's own 1920px default) keeps a full-resolution
    // phone photo from bloating every profiles row that ever loads it.
    compressImageFile(file, { maxDimension: 512 }).then(setAvatar);
    e.target.value = "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const ok = await updateOwnProfile(user.id, {
        full_name: name.trim(),
        avatar_url: avatar,
      });
      if (ok) {
        updateLocalUser({ name: name.trim(), avatar });
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1200);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary shadow-md">
              <UserCircleIcon size={18} />
            </span>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Edit Profile</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Update how your name and photo appear across the app.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckmarkCircle02Icon size={28} />
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">Profile updated!</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <input
              type="file"
              id="edit-profile-avatar-input"
              name="avatar"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative h-20 w-20 overflow-hidden rounded-full border-2 border-border shadow-md transition-all hover:border-primary"
                title="Click to upload new photo"
              >
                {avatar ? (
                  <img src={avatar} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-muted text-muted-foreground">
                    <UserCircleIcon size={36} />
                  </div>
                )}
                <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ImageUploadIcon size={16} />
                  <span className="mt-0.5">Upload</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Change photo
              </button>
            </div>

            <div>
              <label htmlFor="edit-profile-full-name" className="mb-1.5 block text-xs font-semibold text-foreground">Full name</label>
              <input
                type="text"
                id="edit-profile-full-name"
                name="fullName"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>

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
                disabled={saving || !name.trim()}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
