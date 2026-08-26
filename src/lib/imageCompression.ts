// Client-side image downscale + re-encode, run on every upload before the
// result ever becomes a data URL. Every image upload path in this app
// embeds the result directly as base64 (no object storage) — an
// uncompressed phone photo (often 3-8MB) goes straight into whatever JSON
// blob it lands in: a saved design, the live cross-device draft, a profile
// avatar. This is the single biggest lever on that footprint — a typical
// photo shrinks by 80-95% with no visible quality loss at editor/canvas
// sizes, since designs are viewed/exported nowhere near full camera
// resolution anyway.
//
// Animated GIFs are passed through untouched — drawing to a canvas only
// ever captures a single frame, which would silently kill the animation.
// Everything else is resized to fit within maxDimension (never upscaled,
// so a small source stays exactly as-is) and re-encoded as JPEG at
// `quality`, EXCEPT when the source might carry real transparency
// (PNG/WEBP — logos, stickers, screenshots with a transparent background),
// which stays PNG so a lossy re-encode doesn't flatten that to a solid
// color.

export interface CompressImageOptions {
  /** Longest edge, in px, the output is scaled down to fit within. Never
   * upscales a smaller source. */
  maxDimension?: number;
  /** JPEG quality, 0-1. Ignored for sources that stay PNG (see above). */
  quality?: number;
}

const DEFAULT_MAX_DIMENSION = 1920;
const DEFAULT_QUALITY = 0.82;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function compressImageFile(file: File, opts: CompressImageOptions = {}): Promise<string> {
  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  // Animated GIFs and SVGs: canvas re-encoding only ever keeps one frame for GIFs,
  // and rasterizes vector SVGs to lossy JPEG (which turns transparent areas black).
  // Pass both through directly as plain uncompressed data URLs.
  if (
    file.type === "image/gif" ||
    file.type === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg")
  ) {
    return readAsDataUrl(file);
  }

  return readAsDataUrl(file).then(
    (dataUrl) =>
      new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const { naturalWidth: w, naturalHeight: h } = img;
          if (!w || !h) {
            // Couldn't read real dimensions — bail to the uncompressed
            // original rather than fail (or mis-size) the upload.
            resolve(dataUrl);
            return;
          }
          const scale = Math.min(1, maxDimension / Math.max(w, h));
          const targetW = Math.max(1, Math.round(w * scale));
          const targetH = Math.max(1, Math.round(h * scale));

          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const keepsAlpha = file.type === "image/png" || file.type === "image/webp";
          const outMime = keepsAlpha ? "image/png" : "image/jpeg";
          const compressed = canvas.toDataURL(outMime, keepsAlpha ? undefined : quality);

          // Guard against the rare case the "compressed" result actually
          // comes out larger (an already-tiny/optimized source, or a PNG
          // that just doesn't shrink) — never make an upload bigger than
          // what the user actually provided.
          resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
        };
        // Decode failed for any reason — fall back to the plain
        // (uncompressed) read rather than fail the upload entirely.
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      }),
  );
}

export function compressImageFiles(files: File[], opts?: CompressImageOptions): Promise<string[]> {
  return Promise.all(files.map((f) => compressImageFile(f, opts)));
}
