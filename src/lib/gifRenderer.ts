import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { parseGIF, decompressFrames, type ParsedFrame } from "gifuct-js";
import type { EditorState, ImageLayer } from "@/components/editor/types";
import { getImageLayers } from "@/components/editor/types";

/**
 * Decodes an animated GIF source (data URL, blob, or URL) into an array of frame canvases.
 */
export async function decodeGifToFrameCanvases(
  src: string,
): Promise<{ canvases: HTMLCanvasElement[]; delays: number[] } | null> {
  try {
    const res = await fetch(src);
    const buffer = await res.arrayBuffer();
    const parsed = parseGIF(buffer);
    const frames: ParsedFrame[] = decompressFrames(parsed, true);

    if (!frames || frames.length === 0) return null;

    const { width, height } = parsed.lsd;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    if (!tempCtx) return null;

    const frameCanvases: HTMLCanvasElement[] = [];
    const delays: number[] = [];
    let prevImageData: ImageData | null = null;

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (!frame) continue;

      if (frame.disposalType === 2) {
        // Clear to transparent
        tempCtx.clearRect(0, 0, width, height);
      } else if (frame.disposalType === 3 && prevImageData) {
        // Restore previous
        tempCtx.putImageData(prevImageData, 0, 0);
      }

      prevImageData = tempCtx.getImageData(0, 0, width, height);

      // Draw the current frame patch
      const patchData = new ImageData(
        new Uint8ClampedArray(frame.patch),
        frame.dims.width,
        frame.dims.height,
      );

      const patchCanvas = document.createElement("canvas");
      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      const patchCtx = patchCanvas.getContext("2d");
      if (patchCtx) {
        patchCtx.putImageData(patchData, 0, 0);
        tempCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
      }

      // Snapshot this complete composite frame
      const outCanvas = document.createElement("canvas");
      outCanvas.width = width;
      outCanvas.height = height;
      const outCtx = outCanvas.getContext("2d");
      if (outCtx) {
        outCtx.drawImage(tempCanvas, 0, 0);
      }

      frameCanvases.push(outCanvas);
      delays.push(frame.delay > 0 ? frame.delay : 100);
    }

    return { canvases: frameCanvases, delays };
  } catch (err) {
    console.warn("Failed to decode GIF frames:", err);
    return null;
  }
}

/**
 * Encodes a single HTMLCanvasElement into a high-quality GIF object URL.
 */
export async function encodeCanvasToGif(
  canvas: HTMLCanvasElement,
  options?: {
    quality?: number;
    delay?: number;
  },
): Promise<string> {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to obtain 2D canvas context");

  const gif = GIFEncoder();
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 256 colors palette quantization
  const palette = quantize(data, 256);
  const index = applyPalette(data, palette);

  gif.writeFrame(index, width, height, {
    palette,
    delay: options?.delay ?? 100,
  });
  gif.finish();

  const bytes = gif.bytes();
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "image/gif",
  });
  return URL.createObjectURL(blob);
}

/**
 * Captures the full canvas as an animated GIF, preserving animations
 * from any uploaded animated GIF images or layers on the canvas.
 */
export async function renderFullCanvasGif(
  canvasElement: HTMLElement,
  s: EditorState,
): Promise<string> {
  const mod = await import("html-to-image");

  const captureOpts = {
    pixelRatio: s.exportScale,
    width: s.width,
    height: s.height,
    cacheBust: false,
    skipAutoScale: true,
    // Same reasoning as the PNG/JPG/WEBP path in index.tsx's renderExport —
    // excludes the dashed margin guide (data-margin-guide) from every frame
    // this GIF export renders, since it's a live editing aid tied to
    // showMargins, not part of the actual canvas content.
    filter: (node: HTMLElement) => !node.hasAttribute?.("data-margin-guide"),
  };

  const imageLayers = getImageLayers(s);

  // Find all image layers that might be animated GIFs
  const gifLayerDecoders: {
    layer: ImageLayer;
    domImg: HTMLImageElement;
    originalSrc: string;
    decoded: { canvases: HTMLCanvasElement[]; delays: number[] };
  }[] = [];

  for (const layer of imageLayers) {
    const domImg = canvasElement.querySelector(
      `[data-layer-id="${layer.id}"] img`,
    ) as HTMLImageElement | null;
    if (domImg && layer.src) {
      const isGif =
        layer.src.startsWith("data:image/gif") ||
        layer.src.includes(".gif") ||
        layer.src.startsWith("blob:");
      if (isGif) {
        const decoded = await decodeGifToFrameCanvases(layer.src);
        if (decoded && decoded.canvases.length > 1) {
          gifLayerDecoders.push({
            layer,
            domImg,
            originalSrc: domImg.src,
            decoded,
          });
        }
      }
    }
  }

  // If no animated GIF layers were found, render a crisp single static frame
  if (gifLayerDecoders.length === 0) {
    const canvas = await mod.toCanvas(canvasElement, captureOpts);
    return await encodeCanvasToGif(canvas);
  }

  // Calculate total frames to render (cap at 36 frames for speed & memory)
  const maxFrames = Math.max(
    ...gifLayerDecoders.map((d) => d.decoded.canvases.length),
  );
  const totalFrames = Math.min(36, maxFrames);
  const avgDelay =
    gifLayerDecoders[0]?.decoded.delays[0] &&
    gifLayerDecoders[0].decoded.delays[0] >= 20
      ? gifLayerDecoders[0].decoded.delays[0]
      : 100;

  // Convert frame canvases to data URLs for fast DOM swapping
  const cachedFrameDataUrls = gifLayerDecoders.map((d) => {
    return d.decoded.canvases.map((c) => c.toDataURL("image/png"));
  });

  const gif = GIFEncoder();

  try {
    for (let i = 0; i < totalFrames; i++) {
      // Swap DOM image elements to frame i
      for (let dIdx = 0; dIdx < gifLayerDecoders.length; dIdx++) {
        const decoder = gifLayerDecoders[dIdx];
        const urls = cachedFrameDataUrls[dIdx];
        if (decoder && urls && urls.length > 0) {
          const frameUrl = urls[i % urls.length];
          if (frameUrl) {
            decoder.domImg.src = frameUrl;
          }
        }
      }

      // Render the composite canvas at frame i
      const canvas = await mod.toCanvas(canvasElement, captureOpts);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);

      gif.writeFrame(index, canvas.width, canvas.height, {
        palette,
        delay: avgDelay,
      });
    }
  } finally {
    // Restore original sources on all DOM images
    for (const d of gifLayerDecoders) {
      d.domImg.src = d.originalSrc;
    }
  }

  gif.finish();
  const bytes = gif.bytes();
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "image/gif",
  });
  return URL.createObjectURL(blob);
}
