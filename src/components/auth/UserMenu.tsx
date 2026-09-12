import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditProfileDialog } from "@/components/auth/EditProfileDialog";
import {
  Crown03Icon,
  Logout01Icon,
  UserSquareIcon,
  SparklesIcon,
  CreditCardIcon,
  FlashIcon,
} from "hugeicons-react";
import { createStripePortalSession } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

function AvatarImg({
  src,
  name,
  className,
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const initial = (name?.trim()?.charAt(0) || "U").toUpperCase();

  if (!src || hasError) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-full bg-gradient-to-tr from-primary to-amber-500 font-black text-white shadow-xs",
          className,
        )}
      >
        <span>{initial}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || "User Avatar"}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}

export function UserMenu() {
  const { user, isAuthenticated, isAdmin, isPro, logout, openUpgradeModal } = useAuth();
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const handleManageSubscription = async () => {
    if (!user) return;
    setLoadingPortal(true);
    try {
      const returnUrl = typeof window !== "undefined" ? window.location.origin : "";
      // createStripePortalSession now verifies the caller server-side from
      // this access token instead of trusting a client-supplied userId —
      // see its own comment in stripe.ts for why that used to let anyone
      // open anyone else's Stripe billing portal.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { url } = await createStripePortalSession({
        data: {
          accessToken: session?.access_token,
          returnUrl,
        },
      });
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      toast.error("Could not open billing portal", {
        description: err.message || "Please contact support.",
      });
    } finally {
      setLoadingPortal(false);
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openUpgradeModal}
          className="hidden sm:flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-extrabold text-amber-950 shadow-md shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Crown03Icon size={14} />
          <span>Upgrade to PRO</span>
        </button>

        <Link
          to="/signup"
          className="flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-2.5 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-md transition-all hover:border-primary/40 hover:bg-accent active:scale-95 sm:px-3.5"
        >
          {/* Google 'G' Icon */}
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span className="hidden sm:inline">Sign in with Google</span>
          <span className="text-[11px] font-bold sm:hidden">Sign in</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Top Navbar Upgrade Button for Free Users */}
      {!isPro && !isAdmin && (
        <button
          type="button"
          onClick={openUpgradeModal}
          className="hidden sm:flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-extrabold text-amber-950 shadow-md shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Crown03Icon size={14} />
          <span>Upgrade to PRO</span>
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-border/80 bg-background/80 p-0.5 sm:p-1 sm:pr-3 text-xs font-medium text-foreground shadow-sm backdrop-blur-md transition-all hover:border-primary/40 hover:bg-accent active:scale-95"
          >
            <div className="relative">
              <AvatarImg
                src={user.avatar}
                name={user.name}
                className="h-8 w-8 rounded-full object-cover ring-1.5 ring-border shadow-sm text-xs"
              />
              {isPro && (
                <div className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-gradient-to-tr from-amber-500 to-orange-400 text-amber-950 shadow-xs ring-1 ring-background">
                  <Crown03Icon size={9} />
                </div>
              )}
            </div>
            <span className="hidden max-w-[110px] truncate text-xs font-semibold sm:inline sm:max-w-[150px]">
              {user.name}
            </span>
            {isPro && (
              <span className="hidden sm:inline rounded-full bg-amber-500/15 px-1.5 py-0.2 text-[9px] font-black uppercase text-amber-600 dark:text-amber-400">
                PRO
              </span>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5 shadow-xl">
          <DropdownMenuLabel className="px-2 py-1.5">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <AvatarImg
                  src={user.avatar}
                  name={user.name}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/25 shadow-sm text-sm"
                />
                {isPro && (
                  <div className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-gradient-to-tr from-amber-500 to-orange-400 text-amber-950 shadow-xs">
                    <Crown03Icon size={10} />
                  </div>
                )}
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5 truncate">
                  <p className="truncate text-xs font-bold text-foreground">{user.name}</p>
                  {isPro && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[8px] font-black uppercase text-amber-500">
                      PRO
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          {/* Upgrade CTA or Manage Subscription in Dropdown */}
          {!isPro && !isAdmin ? (
            <DropdownMenuItem
              onSelect={openUpgradeModal}
              className="cursor-pointer gap-2 rounded-lg bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
            >
              <Crown03Icon size={14} className="text-amber-500" />
              <span>Upgrade to PRO</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={loadingPortal}
              onSelect={handleManageSubscription}
              className="cursor-pointer gap-2 rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
            >
              <CreditCardIcon size={14} className="text-foreground" />
              <span>{loadingPortal ? "Opening Billing Portal..." : "Billing & Invoices"}</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onSelect={() => {
              setTimeout(() => setEditProfileOpen(true), 0);
            }}
            className="cursor-pointer gap-2 rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
          >
            <UserSquareIcon size={14} className="text-foreground" />
            <span>Edit Profile</span>
          </DropdownMenuItem>

          {isAdmin ? (
            <DropdownMenuItem asChild>
              <Link
                to="/admin"
                className="flex cursor-pointer items-center gap-2 rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
              >
                <Crown03Icon size={14} className="text-foreground" />
                <span>Admin Control Center</span>
              </Link>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={logout}
            className="cursor-pointer gap-2 rounded-lg text-xs text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Logout01Icon size={14} />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>

        <EditProfileDialog open={editProfileOpen} onClose={() => setEditProfileOpen(false)} />
      </DropdownMenu>
    </div>
  );
}
