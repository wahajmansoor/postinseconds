import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/**
 * Fires a single short, light tactile pulse — used to confirm a dragged
 * layer just snapped to an alignment guide (canvas center/edges, or another
 * layer's edge/center — i.e. corner and item-to-item alignment).
 *
 * On the native Android/iOS app this is a real haptic "tick" via Capacitor's
 * Haptics plugin. In a plain browser (web build / PWA) there's no Capacitor
 * runtime, so it falls back to the Vibration API, which most Android
 * browsers support and desktop/iOS Safari silently ignore.
 */
export function triggerAlignmentHaptic() {
  if (Capacitor.isNativePlatform()) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(10);
  } catch {
    // Vibration API not available/allowed — nothing to fall back to.
  }
}
