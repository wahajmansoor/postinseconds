import { Toaster as Sonner } from "sonner";
import {
  Alert01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  ReloadIcon,
} from "hugeicons-react";
import { cn } from "@/lib/utils";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Bottom-center + slide-up-from-bottom is Sonner's own default animation for
// that position (see position on the Toaster call site in __root.tsx) — the
// styling below is what actually makes that feel like part of this app
// rather than a generic library toast: same card surface, radius, and blur
// as every other floating panel (popovers, the mobile bottom bar), a
// neutral background with the type color carried only by the icon (success/
// error/warning/info) instead of tinting the whole toast — cleaner than
// Sonner's own richColors, whose hardcoded palette didn't match this app's
// oklch tokens, and it means every toast still reads as one consistent
// "system" surface, not a rotating set of colored banners.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CheckmarkCircle02Icon size={19} className="text-emerald-500" />,
        error: <CancelCircleIcon size={19} className="text-red-500" />,
        warning: <Alert01Icon size={19} className="text-amber-500" />,
        info: <InformationCircleIcon size={19} className="text-sky-500" />,
        loading: <ReloadIcon size={17} className="animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast: cn(
            "group toast",
            "group-[.toaster]:gap-3 group-[.toaster]:rounded-2xl group-[.toaster]:border group-[.toaster]:border-border/70",
            "group-[.toaster]:bg-card/95 group-[.toaster]:text-foreground group-[.toaster]:backdrop-blur-xl",
            "group-[.toaster]:px-4 group-[.toaster]:py-3.5 group-[.toaster]:shadow-2xl",
          ),
          title: "group-[.toast]:text-[13px] group-[.toast]:font-semibold group-[.toast]:leading-snug",
          description: "group-[.toast]:text-[12px] group-[.toast]:text-muted-foreground",
          icon: "group-[.toast]:shrink-0",
          actionButton:
            "group-[.toast]:rounded-full group-[.toast]:bg-primary group-[.toast]:px-3 group-[.toast]:font-semibold group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-full group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground",
          closeButton:
            "group-[.toast]:border-border/70 group-[.toast]:bg-card group-[.toast]:text-muted-foreground group-[.toast]:transition-colors hover:group-[.toast]:bg-secondary hover:group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
