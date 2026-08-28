import { createFileRoute } from "@tanstack/react-router";
import { SignupPage } from "@/components/auth/SignupPage";
import { AuthProvider } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign in with Google — Post In Seconds" },
      {
        name: "description",
        content: "Join Post In Seconds to design viral quote cards and publish templates.",
      },
    ],
  }),
  component: SignupRouteComponent,
});

function SignupRouteComponent() {
  return <SignupPage />;
}
