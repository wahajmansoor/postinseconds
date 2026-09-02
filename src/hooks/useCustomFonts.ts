// Shared fetch of the current user's uploaded custom fonts. Every font
// picker in the editor (TextSelectionToolbar, MultiMixedSelectionToolbar,
// LeftPanel's FontPickerField) calls this same hook — react-query dedupes
// concurrent/repeated calls with the same key to one underlying fetch, so
// having three pickers mounted at once still only fetches the list once.
// Also registers each family's @font-face rules as soon as they're
// fetched, so a custom font is immediately usable/visible anywhere in the
// editor without every picker needing to remember to do that itself.
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  fetchCustomFontFamilies,
  registerCustomFontFaces,
  customFontFamilyToOption,
  type CustomFontFamily,
} from "@/lib/customFonts";
import type { FontOption } from "@/components/editor/types";

export function customFontsQueryKey(userId: string | undefined) {
  return ["custom-fonts", userId] as const;
}

// Stable empty-array reference for query.data's "not loaded yet" state —
// `query.data ?? []` would otherwise build a brand new array every render
// (react-query's `data` itself is stable, but the `?? []` fallback isn't).
const EMPTY_FAMILIES: CustomFontFamily[] = [];

export function useCustomFonts(): {
  families: CustomFontFamily[];
  options: FontOption[];
  isLoading: boolean;
  refresh: () => void;
} {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: customFontsQueryKey(user?.id),
    queryFn: () => fetchCustomFontFamilies(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const families = query.data ?? EMPTY_FAMILIES;

  useEffect(() => {
    if (families.length > 0) registerCustomFontFaces(families);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families]);

  // Every font picker's own `filteredFonts`/`currentFontLabel` useMemo
  // depends on this `options` array by reference. Without memoizing it
  // here, `.map()` returned a fresh array on every render regardless of
  // whether `families` had actually changed — which meant those memos (and
  // an effect keyed on one of them that resets a picker's keyboard-focused
  // row back to the active font whenever its results list "changes")
  // recomputed on every render too, silently snapping arrow-key navigation
  // back to the top the instant the next render happened. Confirmed live as
  // the actual cause of a real "arrow keys don't work in the font picker"
  // report — this alone fixes it.
  const options = useMemo(() => families.map(customFontFamilyToOption), [families]);

  return {
    families,
    options,
    isLoading: query.isLoading,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: customFontsQueryKey(user?.id) });
    },
  };
}
