import { createFileRoute } from "@tanstack/react-router";
import { SignupPage } from "@/components/auth/SignupPage";
import { AuthProvider } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in with Google — Post In Seconds" },
      { name: "description", content: "Sign in to Post In Seconds with Google." },
    ],
  }),
  component: LoginRouteComponent,
});

function LoginRouteComponent() {
  return <SignupPage />;
}
