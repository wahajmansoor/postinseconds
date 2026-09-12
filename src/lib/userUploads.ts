export interface UserUploadItem {
  id: string;
  src: string;
  name?: string;
  createdAt: string;
}

const STORAGE_KEY = "postinseconds_uploaded_images_v2";
const EVENT_NAME = "postinseconds_user_uploads_updated";

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

  const next = [newItem, ...current.slice(0, 49)]; // keep up to 50 uploads
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

  const next = current.slice(0, 50);
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
