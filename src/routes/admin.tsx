import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { SignupPage } from "@/components/auth/SignupPage";
import { AuthProvider, useAuth } from "@/lib/auth";
import { SecurityCheckIcon, SparklesIcon } from "hugeicons-react";

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
  return (
    <AuthProvider>
      <AdminGate />
    </AuthProvider>
  );
}

function AdminGate() {
  const { user, isAuthenticated, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <span className="grid h-12 w-12 animate-pulse place-items-center rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 shadow-xl">
            <SparklesIcon size={24} className="text-white" />
          </span>
          <p className="text-xs font-semibold text-muted-foreground animate-pulse">
            Verifying Admin Access...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <SignupPage />;
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background px-4 text-center text-foreground">
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

  return <AdminDashboard />;
}
