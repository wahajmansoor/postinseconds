import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Crown03Icon, SparklesIcon, CheckmarkCircle02Icon } from "hugeicons-react";

interface ProSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onNavigateToPremium?: () => void;
  planName?: string;
}

export function ProSuccessModal({
  open,
  onClose,
  onNavigateToPremium,
  planName = "Pro Membership",
}: ProSuccessModalProps) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    let animId: number | null = null;
    let isActive = true;

    import("canvas-confetti")
      .then((module) => {
        if (!isActive) return;
        const confetti = module.default ?? module;
        const end = Date.now() + 2.5 * 1000;
        const colors = ["#f59e0b", "#f97316", "#fbbf24", "#e11d48", "#10b981"];

        function frame() {
          if (!isActive) return;
          confetti({
            particleCount: 4,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors,
          });
          confetti({
            particleCount: 4,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors,
          });

          if (Date.now() < end) {
            animId = requestAnimationFrame(frame);
          }
        }
        frame();
      })
      .catch((e) => {
        console.error("Confetti error:", e);
      });

    return () => {
      isActive = false;
      if (animId !== null) cancelAnimationFrame(animId);
    };
  }, [open]);

  const handleStartCreating = () => {
    onClose();
    if (onNavigateToPremium) {
      onNavigateToPremium();
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("postinseconds:open-premium-templates"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg overflow-hidden border-border/70 bg-card/95 p-0 shadow-2xl backdrop-blur-xl sm:rounded-3xl text-center">
        <div className="relative bg-gradient-to-b from-amber-500/20 via-orange-500/10 to-transparent p-6 pt-8 pb-4">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-tr from-amber-500 to-orange-400 text-amber-950 shadow-xl ring-8 ring-amber-500/20 animate-bounce">
            <Crown03Icon size={32} />
          </div>

          <DialogTitle className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            You're Now a{" "}
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              PRO Member!
            </span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Payment successfully confirmed. All premium templates, fonts, and pro features are now
            completely unlocked on your canvas.
          </DialogDescription>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-3.5 rounded-2xl border border-border/70 bg-secondary/40 p-3.5 text-left text-sm sm:text-base font-semibold text-foreground shadow-sm">
            <CheckmarkCircle02Icon size={22} className="text-amber-500 shrink-0" />
            <span>Instant access to all 50+ Premium Pro Templates</span>
          </div>
          <div className="flex items-center gap-3.5 rounded-2xl border border-border/70 bg-secondary/40 p-3.5 text-left text-sm sm:text-base font-semibold text-foreground shadow-sm">
            <CheckmarkCircle02Icon size={22} className="text-amber-500 shrink-0" />
            <span>Unlimited 4K High-Res & Animated GIF Exports</span>
          </div>
          <div className="flex items-center gap-3.5 rounded-2xl border border-border/70 bg-secondary/40 p-3.5 text-left text-sm sm:text-base font-semibold text-foreground shadow-sm">
            <CheckmarkCircle02Icon size={22} className="text-amber-500 shrink-0" />
            <span>Commercial License & Custom Typography Uploads</span>
          </div>
        </div>

        <div className="p-6 border-t border-border/60 bg-background/50">
          <button
            type="button"
            onClick={handleStartCreating}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 px-5 text-lg font-extrabold text-amber-950 shadow-lg shadow-amber-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Crown03Icon size={22} />
            <span>Start Creating with Premium Templates</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
