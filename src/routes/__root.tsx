import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";
import { Alert02Icon, ReloadIcon } from "hugeicons-react";

import appCss from "../styles.css?url";
import { Toaster } from "../components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { OfflineGate } from "@/components/OfflineScreen";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error; reset: () => void }) {
  console.error(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center animate-in fade-in zoom-in-95 duration-500">
        {/* Gently bobbing icon badge — friendly rather than alarming, since
            this is usually just a transient hiccup a refresh clears up. */}
        <div
          className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-[image:var(--gradient-brand)] shadow-[var(--shadow-glow)] animate-bounce"
          style={{ animationDuration: "2.2s" }}
        >
          <Alert02Icon size={34} className="text-white" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          Oops, this page took a tumble
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Something went wrong loading this page. It's usually just a passing
          hiccup, a quick refresh sorts it right out.
        </p>
        <div className="mt-8">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="group inline-flex items-center gap-2 rounded-2xl bg-[image:var(--gradient-brand)] px-6 py-3 text-sm font-bold text-white shadow-[var(--shadow-glow)] transition-transform hover:scale-105 active:scale-95"
          >
            <ReloadIcon
              size={16}
              className="transition-transform duration-500 group-hover:rotate-180"
            />
            Refresh Page
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
      },
      { title: "Quote Canvas Studio" },
      { name: "description", content: "Modern canvas editor for shareable quote images." },
      { name: "author", content: "Post In Seconds" },
      { property: "og:title", content: "Quote Canvas Studio" },
      { property: "og:description", content: "Modern canvas editor for shareable quote images." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800;900&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => { });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineGate>
        <AuthProvider>
          <Outlet />
          {/* bottom-center everywhere for consistency (most call sites were
              already overriding position to this per-toast — see Toaster's
              own comment for the full rationale, including the mobile
              offset). richColors dropped in favor of Toaster's own custom
              per-type icons/card styling, see sonner.tsx. */}
          <Toaster
            position="bottom-center"
            offset={{ bottom: 24 }}
            mobileOffset={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
          />
        </AuthProvider>
      </OfflineGate>
    </QueryClientProvider>
  );
}
