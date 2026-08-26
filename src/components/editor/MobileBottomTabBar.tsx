import { RAIL, type Tab } from "./rail";
import { cn } from "@/lib/utils";

type Props = {
  activeTab: Tab;
  /** Whether the tab's drawer is currently open — drives the active-tab
   * highlight independently of `activeTab` alone, since the last-opened tab
   * stays "selected" even after its drawer is dismissed. */
  isDrawerOpen: boolean;
  onTabChange: (id: Tab) => void;
};

// Canva-mobile-style bottom app bar: a fixed row of the same 6 tool tabs the
// desktop icon rail exposes (single source of truth in ./rail), each tap
// handed back to index.tsx which owns whether that opens/closes/switches the
// mobile tool drawer. This component stays a stateless nav strip on purpose.
export function MobileBottomTabBar({ activeTab, isDrawerOpen, onTabChange }: Props) {
  return (
    <nav
      className={cn(
        // z-50 — above every Drawer/DrawerContent in the app (z-30, see
        // ui.tsx) — so this stays visible and tappable even while the tool
        // drawer is open at its full-screen tall height, letting a tap on
        // a different tab switch tools directly without needing to close
        // the current drawer first. index.tsx's own onTabChange already
        // only closes the drawer when re-tapping the SAME already-open
        // tab — tapping a different one just swaps `tab` while leaving it
        // open, so this is the one thing that was actually stopping that
        // from being reachable: the bar sitting BEHIND the drawer,
        // invisible and untappable, at the old z-30.
        "fixed inset-x-0 bottom-0 z-[100] flex h-[60px] w-full items-center border-t border-border bg-card/95 backdrop-blur-xl pointer-events-auto",
        "shadow-[0_-12px_28px_-14px_oklch(0_0_0/0.14)] dark:shadow-[0_-12px_28px_-14px_oklch(0_0_0/0.6)]",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Light gradient fade effect on left side */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-20 w-8 bg-gradient-to-r from-card via-card/85 to-transparent" />

      {/* Light gradient fade effect on right side */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-20 w-8 bg-gradient-to-l from-card via-card/85 to-transparent" />

      {/* Fullwidth scrollable slider row with gaps between buttons */}
      <div className="flex min-w-full items-center justify-between gap-3 overflow-x-auto px-4 no-scrollbar scroll-smooth [mask-image:linear-gradient(to_right,transparent_0%,black_16px,black_calc(100%-16px),transparent_100%)]">
        {RAIL.map((r) => {
          const active = activeTab === r.id && isDrawerOpen;
          return (
            <button
              key={r.id}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.currentTarget.blur();
                onTabChange(r.id);
              }}
              className={cn(
                "group relative flex min-w-[52px] flex-1 flex-col items-center justify-center gap-1 py-1 text-[9px] font-medium transition-transform active:scale-95 shrink-0",
                active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                  active
                    ? "bg-secondary dark:bg-[#1d1f26] text-foreground dark:text-white shadow-sm ring-1 ring-border/50"
                    : "bg-transparent text-muted-foreground group-hover:bg-secondary/60 group-hover:text-foreground",
                )}
              >
                <r.icon size={18} />
              </span>
              <span className="leading-none whitespace-nowrap">{r.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
