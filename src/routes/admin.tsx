import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { SignupPage } from "@/components/auth/SignupPage";
import { useAuth } from "@/lib/auth";
import { FullScreenLogoLoader } from "@/components/FullScreenLogoLoader";
import { SecurityCheckIcon } from "hugeicons-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Control Center — Post In Seconds" },
      { name: "description", content: "Admin Dashboard for template and user management." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  return <AdminGate />;
}

function AdminGate() {
  const { user, isAuthenticated, isAdmin, isLoading } = useAuth();

  // Each branch below replaces the previous one outright (React unmounts
  // one, mounts the other), but fading each incoming view in via
  // animate-in/fade-in — the same enter-animation utilities used for every
  // dialog/menu/popover elsewhere in this app — turns what would otherwise
  // be an instant, jarring pop into a soft 200ms appearance instead.
  //
  // isLoading covers the initial session check, login, AND logout (all
  // three flow through the same AuthProvider flag) — so this one branch is
  // what shows for all of them. Deliberately the same FullScreenLogoLoader
  // used for the dark/light toggle and the studio's own auth gate, so
  // every "please wait a moment" state in the app reads as one consistent
  // thing instead of several different loading styles.
  if (isLoading) {
    // Fade-in classes go directly on the loader's own fixed element, not a
    // wrapping div — see StudioGate's identical fix (index.tsx) for why: a
    // wrapping div picks up a transform from tw-animate-css's enter
    // keyframe for the whole animation, which turns it into the containing
    // block for the loader's `position: fixed` instead of the viewport,
    // pinning the logo near the top until the animation ends and it jumps
    // to true center.
    return <FullScreenLogoLoader className="animate-in fade-in duration-200" />;
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="animate-in fade-in duration-200">
        <SignupPage />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background px-4 text-center text-foreground animate-in fade-in duration-200">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <SecurityCheckIcon size={24} />
        </span>
        <h1 className="mt-4 text-lg font-bold">Admin access required</h1>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Signed in as {user.email}, but this account doesn't have admin privileges.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Back to Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-200">
      <AdminDashboard />
    </div>
  );
}
