import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { PREMIUM_TEMPLATES } from "@/components/editor/types";
import { ArrowLeft01Icon, CheckmarkCircle02Icon, FlashIcon, StarCircleIcon } from "hugeicons-react";

export function SignupPage() {
  const { loginWithGoogle, isLoading, isAuthenticated, user } = useAuth();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* LEFT COLUMN: Hero Visual Showcase */}
      <div className="relative hidden w-1/2 flex-col justify-end overflow-hidden bg-zinc-950 p-12 lg:flex">
        {/* Background Image with Ambient Overlays */}
        <img
          src="/bg-post-in-second.png"
          alt="Post In Seconds Creator Studio"
          className="absolute inset-0 h-full w-full object-cover object-center opacity-60 filter saturate-125"
        />
        {/* Dark Vignette & Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-transparent to-black/80" />

        {/* Floating Social Proof & Creator Card */}
        <div className="relative z-10 space-y-6">
          <div className="rounded-3xl border border-white/15 bg-black/40 p-6 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <img
                src="/jasmin-avatar.jpg"
                alt="Jasmin Alić"
                className="h-12 w-12 rounded-full object-cover ring-2 ring-emerald-400/80 shadow-md"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-bold text-white">Jasmin (Jay) Alić</h4>
                  {/* LinkedIn Verified Badge */}
                  <svg className="h-3.5 w-3.5 text-[#0077B5]" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM6.5 11.5l6-6-1-1-5 5-2-2-1 1 3 3z" />
                  </svg>
                </div>
                <p className="text-[11px] font-medium text-white/70">#1 LinkedIn Growth Strategist</p>
              </div>
            </div>

            <p className="mt-3.5 text-sm font-medium leading-relaxed text-white/90">
              "Post In Seconds is the highest-leverage design studio for text-based creators. Clean, ultra-fast, and drives 10x more reach."
            </p>

            <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-3 text-[11px] font-semibold text-white/70">
              <span className="flex items-center gap-1 text-emerald-400">
                <FlashIcon size={14} /> 10x Faster Creation
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-amber-400">
                <StarCircleIcon size={14} /> {PREMIUM_TEMPLATES.length} Premium Templates
              </span>
            </div>
          </div>

          {/* Metrics summary */}
          <div className="flex items-center justify-between px-2 text-xs font-medium text-white/60">
            <p>Trusted by 10,000+ top creators & executives</p>
            <p className="flex items-center gap-1 text-white/80">
              <span className="text-amber-400">★★★★★</span> 4.9/5 Rating
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Authentication Form */}
      <div className="flex w-full flex-col justify-between p-8 sm:p-12 lg:w-1/2 lg:p-16">
        {/* Center Container */}
        <div className="mx-auto my-auto w-full max-w-md space-y-8 py-8">
          {/* Logo + Header Title — logo sits directly above the headline
              instead of pinned separately at the very top of the page */}
          <div className="text-center sm:text-left">
            <div className="flex justify-center sm:justify-start">
              <img src="/logo.png" alt="Post In Seconds" className="h-16 w-auto sm:h-20" />
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-foreground">
              Sign in to Post In Seconds
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Design viral quote cards, customize your author branding, and save them to your personal
              library in seconds.
            </p>
          </div>

          {/* Already logged in status */}
          {isAuthenticated && user ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <div className="flex items-center justify-center gap-2.5">
                <img src={user.avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-emerald-500" />
                <div className="text-left">
                  <p className="text-xs font-bold text-foreground">Signed in as {user.name}</p>
                  <p className="text-[10px] text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Link
                to="/"
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <span>Continue to Studio Editor</span>
                <ArrowLeft01Icon size={14} className="rotate-180" />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* PRIMARY GOOGLE SIGN-IN BUTTON */}
              <button
                type="button"
                disabled={isLoading}
                onClick={() => loginWithGoogle()}
                className="group relative flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card px-6 py-4 text-sm font-bold text-foreground shadow-md transition-all hover:border-primary/60 hover:bg-accent hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
              >
                {/* Official Google Multicolor 'G' Logo */}
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
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
                <span className="tracking-tight">
                  {isLoading ? "Connecting to Google..." : "Sign in with Google"}
                </span>
              </button>

              {/* Benefits checklist */}
              <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 text-xs space-y-2.5">
                <div className="flex items-center gap-2.5 text-foreground font-medium">
                  <CheckmarkCircle02Icon size={16} className="text-emerald-500 shrink-0" />
                  <span>Save designs to the cloud and pick up where you left off, on any device</span>
                </div>
                <div className="flex items-center gap-2.5 text-foreground font-medium">
                  <CheckmarkCircle02Icon size={16} className="text-emerald-500 shrink-0" />
                  <span>Premium templates with floating 3D image cutouts</span>
                </div>
                <div className="flex items-center gap-2.5 text-foreground font-medium">
                  <CheckmarkCircle02Icon size={16} className="text-emerald-500 shrink-0" />
                  <span>High-resolution exports in PNG, JPG, or WEBP — zero watermark</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="border-t border-border/60 pt-4 text-center text-[10px] text-muted-foreground">
          <p>© {new Date().getFullYear()} Post In Seconds Studio. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
