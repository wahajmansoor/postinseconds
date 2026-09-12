import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { PRO_PLANS, createStripeCheckoutSession } from "@/lib/stripe";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Crown03Icon,
  StarCircleIcon,
} from "hugeicons-react";
import { toast } from "@/components/ui/sonner";

interface UpgradeProModalProps {
  open: boolean;
  onClose: () => void;
  highlightTemplateName?: string;
}

export function UpgradeProModal({ open, onClose, highlightTemplateName }: UpgradeProModalProps) {
  const { user, isAuthenticated, isPro, openLoginModal } = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleCheckout = async () => {
    if (!isAuthenticated || !user) {
      onClose();
      openLoginModal();
      toast.info("Please sign in with Google to upgrade to Pro", {
        description: "Your lifetime purchase will be linked directly to your account.",
      });
      return;
    }

    if (isPro) {
      toast.success("You are already a Pro member!", {
        description: "All premium templates and features are unlocked on your account.",
      });
      onClose();
      return;
    }

    setIsRedirecting(true);
    try {
      const originUrl = typeof window !== "undefined" ? window.location.origin : "";
      const result = await createStripeCheckoutSession({
        data: {
          planId: "lifetime",
          userId: user.id,
          userEmail: user.email,
          originUrl,
        },
      });

      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error("No checkout URL returned from server");
      }
    } catch (err: any) {
      console.error("Failed to start checkout:", err);
      toast.error("Checkout initialization failed", {
        description: err.message || "Please try again or contact support.",
      });
      setIsRedirecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg overflow-hidden border-border/70 bg-card/95 p-0 shadow-2xl backdrop-blur-xl sm:rounded-3xl max-h-[92vh] flex flex-col">
        {/* Top visual banner */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent px-6 pt-7 pb-6 border-b border-border/50">
          <div className="absolute -top-12 -right-12 h-44 w-44 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />

          <div className="flex items-center gap-3.5">
            <div className="grid h-13 w-13 place-items-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 text-amber-950 shadow-lg shadow-amber-500/20 ring-4 ring-amber-500/20 shrink-0">
              <Crown03Icon size={26} className="animate-pulse" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                Unlock PostInSeconds{" "}
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                  PRO
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {highlightTemplateName
                  ? `Get "${highlightTemplateName}" plus lifetime access to all premium templates`
                  : "Unlimited lifetime access to all premium templates, 4K exports & updates"}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Pricing card */}
        <div className="px-6 py-6">
          <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500">
                  <StarCircleIcon size={15} />
                  <span>One-Time Lifetime Pass</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  No recurring charges or subscriptions.
                </p>
              </div>

              <div className="text-right">
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-3xl font-black text-foreground tracking-tight">$59</span>
                  <span className="text-xs font-medium text-muted-foreground">USD</span>
                </div>
                <p className="text-[10px] font-bold uppercase text-amber-500">One-time payment</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Footer */}
        <div className="p-4 sm:p-5 border-t border-border/60 bg-background/50">
          <button
            type="button"
            disabled={isRedirecting}
            onClick={handleCheckout}
            className="w-full relative overflow-hidden flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_auto] hover:bg-right px-6 py-3.5 text-lg font-extrabold text-amber-950 shadow-lg shadow-amber-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 cursor-pointer"
          >
            {isRedirecting ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-950 border-t-transparent" />
                <span>Redirecting to Stripe...</span>
              </>
            ) : (
              <>
                <Crown03Icon size={22} />
                <span>Get Lifetime Pro for $59</span>
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
