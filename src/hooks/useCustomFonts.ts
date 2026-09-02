// Shared fetch of the current user's uploaded custom fonts. Every font
// picker in the editor (TextSelectionToolbar, MultiMixedSelectionToolbar,
// LeftPanel's FontPickerField) calls this same hook — react-query dedupes
// concurrent/repeated calls with the same key to one underlying fetch, so
// having three pickers mounted at once still only fetches the list once.
// Also registers each family's @font-face rules as soon as they're
// fetched, so a custom font is immediately usable/visible anywhere in the
// editor without every picker needing to remember to do that itself.
import { useEffect } from "react";
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

  const families = query.data ?? [];

  useEffect(() => {
    if (families.length > 0) registerCustomFontFaces(families);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [families]);

  return {
    families,
    options: families.map(customFontFamilyToOption),
    isLoading: query.isLoading,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: customFontsQueryKey(user?.id) });
    },
  };
}
