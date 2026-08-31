import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  CrownIcon,
  FlashIcon,
  Image01Icon,
  Tick02Icon,
} from "hugeicons-react";

const DEFAULT_TESTIMONIAL = {
  id: "devon",
  name: "Devon Lane",
  role: "Founder & Marketing Strategist",
  avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
  quote: "Beautiful templates and incredible speed. Highly recommended for any serious daily publisher.",
  rating: 5,
};

const STACK_TESTIMONIALS = [
  DEFAULT_TESTIMONIAL,
  {
    id: "jasmin",
    name: "Jasmin (Jay) Alić",
    role: "#1 LinkedIn Growth Strategist",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    quote: "Post In Seconds is the highest-leverage design studio for text-based creators. Clean, ultra-fast, and drives 10x more reach.",
    rating: 5,
  },
  {
    id: "arlene",
    name: "Arlene McCoy",
    role: "Content Lead & Creator",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    quote: "This tool completely changed the way I design viral quote posts. Super fast, effortless, and gorgeous!",
    rating: 5,
  },
];

function LeftReviewStack() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % STACK_TESTIMONIALS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const count = STACK_TESTIMONIALS.length;
  const currentTestimonial = STACK_TESTIMONIALS[activeIndex] || DEFAULT_TESTIMONIAL;

  return (
    <div
      className="relative w-full max-w-lg select-none cursor-pointer"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onClick={() => setActiveIndex((prev) => (prev + 1) % count)}
    >
      {/* Background Peeking Top Card */}
      <div
        className="absolute -top-3 left-3 right-3 h-16 rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-md transition-all duration-500 pointer-events-none"
        style={{ transform: "scale(0.96)" }}
      />
      {/* Background Peeking Second Card */}
      <div
        className="absolute -top-1.5 left-1.5 right-1.5 h-20 rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-lg transition-all duration-500 pointer-events-none"
        style={{ transform: "scale(0.98)" }}
      />

      {/* Active Featured Card */}
      <div className="relative z-10 rounded-2xl border border-white/15 bg-slate-900/85 p-4 sm:p-5 shadow-2xl backdrop-blur-xl transition-all duration-500">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={currentTestimonial.avatar}
                alt={currentTestimonial.name}
                className="h-10 w-10 sm:h-11 sm:w-11 rounded-full object-cover shadow-md"
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-slate-950">
                <Tick02Icon size={8} className="text-white font-bold" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-bold text-white">
                  {currentTestimonial.name}
                </h4>
              </div>
              <p className="text-xs text-white/50">{currentTestimonial.role}</p>
            </div>
          </div>
          {/* Bigger, Nicer Gold Rating Stars */}
          <div className="flex items-center rounded-full bg-amber-400/10 px-2.5 py-1 border border-amber-400/20 backdrop-blur-xs">
            <div className="flex items-center gap-0.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <svg
                  key={i}
                  className="h-4 w-4 fill-amber-400 text-amber-400 drop-shadow-[0_1px_3px_rgba(245,158,11,0.5)]"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs sm:text-[13px] leading-relaxed text-white/90 font-normal">
          "{currentTestimonial.quote}"
        </p>

        {/* Stack pagination dots */}
        <div className="mt-3 flex items-center gap-1.5 pt-0.5">
          {STACK_TESTIMONIALS.map((_, idx) => (
            <span
              key={idx}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                idx === activeIndex ? "w-5 bg-sky-400" : "w-1.5 bg-white/20",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FloatingCanvasCards() {
  const [activeCard, setActiveCard] = useState(2); // Story by default
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setActiveCard((prev) => (prev + 1) % 5);
    }, 3200);
    return () => clearInterval(timer);
  }, [isPaused]);

  return (
    <div
      className="relative w-full max-w-lg mx-auto h-[360px] sm:h-[400px] flex items-center justify-center select-none my-auto cursor-pointer"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 0. Top Left Yellow Card: Instagram Post */}
      <div
        onClick={() => setActiveCard(0)}
        className={cn(
          "absolute -left-3 sm:-left-6 top-1 w-56 h-36 sm:w-64 sm:h-42 rounded-2xl bg-[#FFCC00] p-4 sm:p-5 shadow-2xl transition-all duration-700 ease-out",
          activeCard === 0
            ? "z-30 scale-110 -rotate-2 -translate-y-2.5 shadow-[0_25px_60px_-12px_rgba(255,204,0,0.35),0_15px_30px_rgba(0,0,0,0.5)] ring-2 ring-amber-300"
            : "z-10 -rotate-6 scale-95 opacity-85 hover:opacity-100 hover:scale-100",
        )}
      >
        <span className="text-xs sm:text-[13px] font-bold text-amber-950/90 tracking-tight">
          Instagram post
        </span>
        <div className="absolute bottom-4 left-4 right-10 h-2.5 rounded-full bg-amber-950/20" />
      </div>

      {/* 1. Top Right Periwinkle/Blue Card: LinkedIn Post */}
      <div
        onClick={() => setActiveCard(1)}
        className={cn(
          "absolute -right-2 sm:-right-4 top-4 w-56 h-36 sm:w-64 sm:h-42 rounded-2xl bg-[#6073FD] p-4 sm:p-5 shadow-2xl transition-all duration-700 ease-out",
          activeCard === 1
            ? "z-30 scale-110 rotate-0 -translate-y-2.5 shadow-[0_25px_60px_-12px_rgba(96,115,253,0.4),0_15px_30px_rgba(0,0,0,0.5)] ring-2 ring-indigo-300"
            : "z-10 -rotate-2 scale-95 opacity-85 hover:opacity-100 hover:scale-100",
        )}
      >
        <span className="text-xs sm:text-[13px] font-bold text-white/95 tracking-tight">
          LinkedIn Post
        </span>
        <div className="absolute bottom-4 left-4 w-24 h-2.5 rounded-full bg-white/40" />
      </div>

      {/* 2. Center White Card: Story */}
      <div
        onClick={() => setActiveCard(2)}
        className={cn(
          "absolute left-8 sm:left-14 top-14 sm:top-18 w-60 h-40 sm:w-72 sm:h-46 rounded-2xl bg-[#F8FAFC] p-4 sm:p-5 shadow-2xl border border-white/40 transition-all duration-700 ease-out",
          activeCard === 2
            ? "z-30 scale-110 rotate-0 -translate-y-2.5 shadow-[0_30px_70px_-15px_rgba(255,255,255,0.25),0_18px_35px_rgba(0,0,0,0.6)] ring-2 ring-white"
            : "z-20 -rotate-2 scale-95 opacity-90 hover:opacity-100 hover:scale-100",
        )}
      >
        <span className="text-xs sm:text-[13.5px] font-bold text-slate-800 tracking-tight">
          Story
        </span>
        <div className="absolute bottom-4.5 left-4 right-12 space-y-2">
          <div className="w-32 h-2.5 rounded-full bg-slate-200" />
          <div className="w-20 h-2.5 rounded-full bg-slate-200" />
        </div>
      </div>

      {/* 3. Bottom Left Green Card: LinkedIn Cover (Wide Rectangle Banner Style) */}
      <div
        onClick={() => setActiveCard(3)}
        className={cn(
          "absolute -left-4 sm:-left-8 bottom-3 w-64 h-24 sm:w-72 sm:h-28 rounded-2xl bg-[#26BA7D] p-3.5 sm:p-4 shadow-2xl transition-all duration-700 ease-out flex flex-col justify-between",
          activeCard === 3
            ? "z-30 scale-110 rotate-0 -translate-y-2.5 shadow-[0_25px_60px_-12px_rgba(38,186,125,0.4),0_15px_30px_rgba(0,0,0,0.5)] ring-2 ring-emerald-300"
            : "z-10 rotate-3 scale-95 opacity-85 hover:opacity-100 hover:scale-100",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-[13px] font-bold text-emerald-950/90 tracking-tight">
            LinkedIn Cover
          </span>
          <div className="h-4 w-4 rounded-full bg-[#176F4B]/40" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 rounded-full bg-[#176F4B]" />
          <div className="w-12 h-2 rounded-full bg-[#176F4B]/50" />
        </div>
      </div>

      {/* 4. Bottom Right Coral/Orange Card: Facebook Post */}
      <div
        onClick={() => setActiveCard(4)}
        className={cn(
          "absolute right-0 sm:right-2 bottom-0 w-56 h-36 sm:w-64 sm:h-40 rounded-2xl bg-[#FF5C38] p-4 sm:p-5 shadow-2xl transition-all duration-700 ease-out",
          activeCard === 4
            ? "z-30 scale-110 rotate-0 -translate-y-2.5 shadow-[0_25px_60px_-12px_rgba(255,92,56,0.4),0_15px_30px_rgba(0,0,0,0.5)] ring-2 ring-orange-300"
            : "z-10 rotate-2 scale-95 opacity-85 hover:opacity-100 hover:scale-100",
        )}
      >
        <span className="text-xs sm:text-[13px] font-bold text-white/95 tracking-tight">
          Facebook Post
        </span>
        <div className="absolute bottom-4 left-4 w-20 h-2.5 rounded-full bg-white/40" />
      </div>
    </div>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const {
    loginWithGoogle,
    isLoading,
    isAuthenticated,
    user,
    googleButtonContainerRef,
    isGoogleButtonReady,
  } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, user, navigate]);

  return (
    <div className="flex min-h-screen w-full bg-white font-sans text-slate-900">
      {/* LEFT COLUMN: Floating Visual Canvas Cards & Value Prop */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#161B2E] p-8 lg:flex xl:p-12">
        {/* Background Image Grid */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25 mix-blend-luminosity pointer-events-none"
          style={{ backgroundImage: "url('/bg-post-in-second.png')" }}
        />
        {/* Dark Vignette Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#161B2E] via-[#161B2E]/75 to-[#161B2E]/50 pointer-events-none" />

        {/* Floating Format Cards */}
        <div className="relative z-10 my-auto">
          <FloatingCanvasCards />
        </div>

        {/* Bottom Typography & Testimonial Stack */}
        <div className="relative z-10 space-y-4 pt-2">
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Every post starts here.
            </h2>
            <p className="mt-1.5 mb-3 text-sm sm:text-base text-slate-300 font-normal leading-relaxed max-w-lg">
              Templates, edits, and exports built for people who publish daily.
            </p>
          </div>

          {/* Interactive Stacked Reviews */}
          <LeftReviewStack />

          <div className="flex items-center justify-between border-t border-white/10 pt-3 text-xs text-white/50">
            <p className="font-medium text-white/70">Trusted by 10,000+ top creators</p>
            <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
              <div className="flex items-center gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <svg
                    key={i}
                    className="h-3.5 w-3.5 fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.4)]"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                ))}
              </div>
              <span className="font-bold text-white text-[11.5px]">4.9 / 5</span>
              <span className="text-white/50 text-[11px]">Rating</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Clean White Sign-in */}
      <div className="flex flex-1 flex-col justify-between bg-slate-50/40 px-4 py-6 sm:p-10 lg:p-12 min-h-screen">
        <div className="hidden sm:block" />

        <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center my-auto">
          {/* Logo - Outside Top */}
          <img src="/logo.png" alt="Post In Seconds" className="h-16 w-16 sm:h-20 sm:w-20 object-contain drop-shadow-xs" />

          {/* Header Title - Outside Top */}
          <h1 className="mt-2.5 sm:mt-3.5 text-xl sm:text-[26px] font-bold tracking-tight text-slate-900">
            Post In Seconds
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed max-w-sm sm:max-w-md">
            Turn your ideas into scroll-stopping content in seconds.
          </p>

          {/* Card Container with Elegant Border - Compact Width */}
          <div className="mt-4 sm:mt-5 w-full max-w-[380px] rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-[0_8px_30px_-5px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.02)]">
            {isAuthenticated && user ? (
              <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 sm:p-5 text-center shadow-sm">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-14 w-14 sm:h-16 sm:w-16 rounded-full object-cover shadow-md ring-4 ring-emerald-400/60 ring-offset-2 ring-offset-emerald-50"
                  />
                  <div className="text-center sm:text-left">
                    <p className="text-sm font-bold text-slate-900">Signed in as {user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                </div>
                <Link
                  to="/"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <span>Continue to Studio Editor</span>
                  <ArrowLeft01Icon size={15} className="rotate-180" />
                </Link>
              </div>
            ) : (
              <div className="w-full space-y-3.5">
                {/* Header text above Google button - 2 Clean Lines */}
                <p className="text-center text-xs sm:text-sm font-medium text-slate-600 leading-snug">
                  Sign in to start creating <br />
                  <span className="font-semibold text-slate-900">scroll stopping posts in seconds.</span>
                </p>

                {/* Google Identity Services Button with User Dropdown & Avatar */}
                <div ref={googleButtonContainerRef} className="flex w-full justify-center" />
                {!isGoogleButtonReady && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => loginWithGoogle()}
                    className="mx-auto flex w-full max-w-[260px] items-center justify-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-50"
                  >
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
                    <span>{isLoading ? "Connecting..." : "Continue with Google"}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Benefits Checklist - Responsive & Spacious */}
          <div className="mt-6 sm:mt-8 w-full text-left space-y-3.5 sm:space-y-4 px-1 sm:px-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <CheckmarkCircle02Icon size={17} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="leading-snug">
                <p className="text-xs sm:text-[13.5px] font-semibold text-slate-800">
                  You can design, everywhere!
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Your projects sync automatically, so you can pick up on any device.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 sm:gap-3">
              <CheckmarkCircle02Icon size={17} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="leading-snug">
                <p className="text-xs sm:text-[13.5px] font-semibold text-slate-800">
                  100+ premium templates!
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  New layouts added every week, built for fast daily posting.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 sm:gap-3">
              <CheckmarkCircle02Icon size={17} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="leading-snug">
                <p className="text-xs sm:text-[13.5px] font-semibold text-slate-800">
                  Export without limits!
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  Download high-resolution PNG, JPG, GIF or WEBP files, no watermark.
                </p>
              </div>
            </div>

            {/* Feature Badges under Checklist - Single Line on Mobile */}
            <div className="flex w-full items-center justify-between gap-1 sm:gap-1.5 pt-2">
              <div className="flex flex-1 items-center justify-center gap-0.5 min-[360px]:gap-1 whitespace-nowrap rounded-full border border-emerald-200/80 bg-emerald-50/70 px-1 min-[360px]:px-1.5 sm:px-2 py-1 text-[9px] min-[360px]:text-[10px] sm:text-[11.5px] font-medium text-emerald-800 shadow-xs">
                <FlashIcon size={11} className="shrink-0 text-emerald-600" />
                <span>10x Faster Creation</span>
              </div>
              <div className="flex flex-1 items-center justify-center gap-0.5 min-[360px]:gap-1 whitespace-nowrap rounded-full border border-amber-200/80 bg-amber-50/70 px-1 min-[360px]:px-1.5 sm:px-2 py-1 text-[9px] min-[360px]:text-[10px] sm:text-[11.5px] font-medium text-amber-900 shadow-xs">
                <CrownIcon size={11} className="shrink-0 text-amber-600" />
                <span>100+ Premium Templates</span>
              </div>
              <div className="flex flex-1 items-center justify-center gap-0.5 min-[360px]:gap-1 whitespace-nowrap rounded-full border border-sky-200/80 bg-sky-50/70 px-1 min-[360px]:px-1.5 sm:px-2 py-1 text-[9px] min-[360px]:text-[10px] sm:text-[11.5px] font-medium text-sky-900 shadow-xs">
                <Image01Icon size={11} className="shrink-0 text-sky-600" />
                <span>Export Ultra HD Quality</span>
              </div>
            </div>

            {/* Mobile App Download on Right Area */}
            <div className="pt-4 sm:pt-5 flex flex-col items-center justify-center gap-1.5 sm:gap-2 text-center">
              <p className="text-[11px] sm:text-[12.5px] font-medium text-slate-500">
                You can download and use on mobile app as well:
              </p>
              <a
                href="https://play.google.com/store"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block transition-all hover:scale-[1.04] active:scale-[0.98] drop-shadow-sm"
              >
                <img
                  src="/Google-Store-Icon.svg"
                  alt="Get it on Google Play"
                  className="h-9 sm:h-11 w-auto object-contain"
                />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 sm:mt-8 border-t border-slate-200/60 pt-4 sm:pt-6 text-center text-xs text-slate-400">
          <p>© {new Date().getFullYear()} Post In Seconds. All Rights Reserved.</p>
        </div>
      </div>
    </div>
  );
}


