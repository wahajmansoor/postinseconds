import { cn } from "@/lib/utils";

// Shared full-screen logo overlay — used both for the dark/light theme
// toggle (index.tsx, held open briefly with its own opacity fade while the
// restyle happens hidden underneath) and for auth loading states
// (StudioGate/AdminGate, shown for as long as isLoading is true: initial
// session check, login, and logout all flow through the same flag). Kept
// as one component so both places look and feel identical rather than
// drifting into two different "loading" treatments.
export function FullScreenLogoLoader({
  className,
  "aria-hidden": ariaHidden,
}: {
  className?: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <div
      aria-hidden={ariaHidden}
      className={cn(
        "fixed inset-0 z-[999] flex flex-col items-center justify-center gap-3 bg-background",
        className,
      )}
    >
      <img src="/logo.png" alt="" className="h-14 w-auto animate-pulse" />
      <p className="text-md font-medium text-muted-foreground">Loading, please wait...</p>
    </div>
  );
}
