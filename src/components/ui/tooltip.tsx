"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { InformationCircleIcon } from "hugeicons-react";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-xs overflow-hidden rounded-xl border border-border/70 bg-popover/95 px-3 py-1.5 text-[11px] font-medium text-popover-foreground shadow-xl backdrop-blur-md transition-all animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * Modern Sleek Tooltip Wrapper
 */
export function AppTooltip({
  content,
  shortcut,
  side = "top",
  children,
  className,
}: {
  content: React.ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  className?: string;
}) {
  if (!content) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        <div className="flex items-center gap-1.5">
          <span>{content}</span>
          {shortcut ? (
            <kbd className="ml-1 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-muted-foreground shadow-2xs">
              {shortcut}
            </kbd>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Helper Info Tooltip Icon for Field Titles & Explanations
 */
export function InfoTooltip({
  text,
  side = "top",
}: {
  text: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <AppTooltip content={text} side={side}>
      <span className="inline-flex cursor-help items-center text-muted-foreground/70 transition-colors hover:text-foreground">
        <InformationCircleIcon size={13} />
      </span>
    </AppTooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
