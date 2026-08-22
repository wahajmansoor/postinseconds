import {
  GeometricShapes01Icon,
  ImageUploadIcon,
  Layout01Icon,
  TextSmallcapsIcon,
  Layers01Icon as Motion01Icon,
} from "hugeicons-react";

// Custom pasted-in icon (not part of hugeicons-react) — needs an explicit
// viewBox so it actually rescales when rendered at a size other than the
// 24px it was authored for, unlike a bare width/height would.
function BackgroundTabIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        fill="currentColor"
        d="M3.103 16.767c.053.51.133.95.253 1.339l14.75-14.75a7 7 0 0 0-1.339-.253zM13.589 3q.857 0 1.567.015a1 1 0 0 1-.06.07L3.078 15.1a1 1 0 0 1-.064.057 82 82 0 0 1-.015-1.57zm-3.376 0h1.503a.7.7 0 0 1-.165.254l-8.303 8.303A.7.7 0 0 1 3 11.72v-1.506l7.213-7.212Zm-3.525.175c.495-.08 1.063-.124 1.728-.147a2 2 0 0 1-.093.103L3.027 8.427c.023-.67.067-1.241.148-1.739zm12.594.788L3.963 19.283q.351.444.8.79l15.31-15.31a4.5 4.5 0 0 0-.79-.8Zm1.392 2.032-.033.031L5.997 20.67l-.004.004c.394.112.84.186 1.357.234L20.908 7.35a7.5 7.5 0 0 0-.234-1.355m.317 3.197-11.8 11.8c.482.006 1.007.008 1.583.008L21 10.774q0-.862-.009-1.582M21 12.704l-.058.053-8.167 8.167a1 1 0 0 0-.068.076h.103q.8 0 1.483-.003l6.704-6.704q.004-.683.003-1.483zm-.06 3.547-4.69 4.689c.76-.05 1.378-.142 1.9-.31l2.479-2.478c.168-.523.26-1.141.31-1.9Z"
      />
    </svg>
  );
}

// Single source of truth for the editor's 6 primary tool tabs — consumed by
// both the desktop left icon rail and the mobile bottom tab bar (index.tsx /
// MobileBottomTabBar.tsx) so the two never drift out of sync.
export const RAIL = [
  { id: "templates", label: "Templates", icon: Layout01Icon },
  { id: "text", label: "Text", icon: TextSmallcapsIcon },
  { id: "uploads", label: "Uploads", icon: ImageUploadIcon },
  { id: "elements", label: "Elements", icon: GeometricShapes01Icon },
  { id: "layers", label: "Layers", icon: Motion01Icon },
  { id: "background", label: "Background", icon: BackgroundTabIcon },
] as const;

export type Tab = (typeof RAIL)[number]["id"];
