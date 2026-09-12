export interface UserUploadItem {
  id: string;
  src: string;
  name?: string;
  createdAt: string;
}

const STORAGE_KEY = "postinseconds_uploaded_images_v2";
const EVENT_NAME = "postinseconds_user_uploads_updated";

// PERFORMANCE: this library stores base64 data URLs (not just references)
// directly in localStorage, and every save re-serializes the WHOLE array
// with JSON.stringify — cheap for a few small images, but the existing
// 50-item cap alone doesn't bound total size (50 large images can still be
// tens of MB), so a heavy user's every single new upload could mean
// stringifying+writing a multi-MB blob synchronously on the main thread,
// and risks silently hitting localStorage's ~5-10MB quota (already caught
// further down, but only after paying the cost of building the oversized
// string). Trimming by an approximate total-byte budget (evicting oldest
// first, same as the existing count cap already did) keeps the typical
// case small regardless of how large individual uploads are.
const MAX_TOTAL_BYTES = 8 * 1024 * 1024; // ~8MB of stored data URLs

type UploadItemLike = { src: string };

// A data URL's on-the-wire base64 payload is ~4/3 the size of the actual
// decoded bytes; approximate is fine here, this only drives an eviction
// heuristic, not anything correctness-sensitive.
function approxBytes(dataUrl: string): number {
  return Math.ceil((dataUrl.length * 3) / 4);
}

function trimToByteBudget<T extends UploadItemLike>(items: T[]): T[] {
  let total = 0;
  const kept: T[] = [];
  for (const item of items) {
    const size = approxBytes(item.src);
    if (kept.length > 0 && total + size > MAX_TOTAL_BYTES) break;
    kept.push(item);
    total += size;
  }
  return kept;
}

export function getSavedUserUploads(): UserUploadItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Error reading saved user uploads:", e);
    return [];
  }
}

export function saveUserUpload(src: string, name?: string): UserUploadItem {
  const current = getSavedUserUploads();
  // Check if identical data URL already exists in library
  const existing = current.find((item) => item.src === src);
  if (existing) return existing;

  const newItem: UserUploadItem = {
    id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    src,
    name: name || "Uploaded image",
    createdAt: new Date().toISOString(),
  };

  // Count cap (50) first, then the byte-budget trim — newest-first order is
  // already established by the [newItem, ...current] order, so trimming
  // either list just drops the oldest overflow off the end either way.
  const next = trimToByteBudget([newItem, ...current.slice(0, 49)]);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  } catch (e) {
    console.warn("Storage quota limit reached when saving upload:", e);
  }
  return newItem;
}

export function saveUserUploads(items: { src: string; name?: string }[]): UserUploadItem[] {
  const current = getSavedUserUploads();
  const added: UserUploadItem[] = [];

  for (const item of items) {
    if (!item.src) continue;
    if (current.some((c) => c.src === item.src)) continue;
    const newItem: UserUploadItem = {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      src: item.src,
      name: item.name || "Uploaded image",
      createdAt: new Date().toISOString(),
    };
    added.push(newItem);
    current.unshift(newItem);
  }

  const next = trimToByteBudget(current.slice(0, 50));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  } catch (e) {
    console.warn("Storage quota limit reached when saving batch uploads:", e);
  }
  return added;
}

export function deleteUserUpload(id: string): void {
  const current = getSavedUserUploads();
  const next = current.filter((item) => item.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  } catch (e) {
    console.error("Error deleting user upload:", e);
  }
}

export function subscribeUserUploads(callback: (items: UserUploadItem[]) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    callback(getSavedUserUploads());
  };

  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
