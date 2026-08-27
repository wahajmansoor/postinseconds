import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pipette, Check, ChevronDown, Copy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// --- Color Math Helpers (RGBA, HSVA, HSLA, HEX) ---

export interface RGBA {
  r: number; // 0 - 255
  g: number; // 0 - 255
  b: number; // 0 - 255
  a: number; // 0 - 1
}

export interface HSVA {
  h: number; // 0 - 360
  s: number; // 0 - 100
  v: number; // 0 - 100
  a: number; // 0 - 1
}

export interface HSLA {
  h: number; // 0 - 360
  s: number; // 0 - 100
  l: number; // 0 - 100
  a: number; // 0 - 1
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function parseColorToRgba(input: string): RGBA {
  const str = input.trim();
  // Check hex
  if (str.startsWith("#")) {
    let hex = str.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("") + "ff";
    } else if (hex.length === 4) {
      hex = hex.split("").map((c) => c + c).join("");
    } else if (hex.length === 6) {
      hex += "ff";
    }
    if (hex.length === 8) {
      const num = parseInt(hex, 16);
      if (!isNaN(num)) {
        return {
          r: (num >> 24) & 255,
          g: (num >> 16) & 255,
          b: (num >> 8) & 255,
          a: Math.round(((num & 255) / 255) * 100) / 100,
        };
      }
    }
  }

  // Check rgb/rgba
  const rgbMatch = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    return {
      r: clamp(parseFloat(rgbMatch[1]), 0, 255),
      g: clamp(parseFloat(rgbMatch[2]), 0, 255),
      b: clamp(parseFloat(rgbMatch[3]), 0, 255),
      a: rgbMatch[4] !== undefined ? clamp(parseFloat(rgbMatch[4]), 0, 1) : 1,
    };
  }

  // Check hsl/hsla
  const hslMatch = str.match(/hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (hslMatch && hslMatch[1] && hslMatch[2] && hslMatch[3]) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);
    const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
    return hslaToRgba({ h, s, l, a });
  }

  // Fallback black
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function rgbaToHsva({ r, g, b, a }: RGBA): HSVA {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const diff = max - min;

  let h = 0;
  if (diff !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / diff) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / diff + 2;
    } else {
      h = (rNorm - gNorm) / diff + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : Math.round((diff / max) * 100);
  const v = Math.round(max * 100);

  return { h, s, v, a };
}

export function hsvaToRgba({ h, s, v, a }: HSVA): RGBA {
  const sNorm = s / 100;
  const vNorm = v / 100;
  const c = vNorm * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vNorm - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h <= 360) {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  };
}

export function hsvaToHsla({ h, s, v, a }: HSVA): HSLA {
  const sNorm = s / 100;
  const vNorm = v / 100;
  const l = (2 - sNorm) * vNorm / 2;
  const sHsl = l !== 0 && l !== 1 ? (sNorm * vNorm) / (l < 0.5 ? l * 2 : 2 - l * 2) : 0;
  return {
    h,
    s: Math.round(sHsl * 100),
    l: Math.round(l * 100),
    a,
  };
}

export function hslaToRgba({ h, s, l, a }: HSLA): RGBA {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h <= 360) {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  };
}

export function rgbaToHex({ r, g, b, a }: RGBA, includeAlpha = false): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (includeAlpha || a < 1) {
    const alphaHex = toHex(Math.round(a * 255));
    return `${hex}${alphaHex}`.toUpperCase();
  }
  return hex.toUpperCase();
}

// HeroUI Color Palettes
export const HEROUI_PALETTES = [
  {
    name: "HeroUI Theme",
    colors: [
      "#006FEE", // Primary
      "#7828C8", // Secondary
      "#17C964", // Success
      "#F5A524", // Warning
      "#F31260", // Danger
      "#18181B", // Dark
      "#71717A", // Default/Zinc
      "#06B6D4", // Cyan
    ],
  },
  {
    name: "Vibrant",
    colors: [
      "#38BDF8", "#818CF8", "#C084FC", "#F472B6", "#FB7185", "#FB923C", "#FBBF24", "#4ADE80",
    ],
  },
  {
    name: "Monochrome & Slate",
    colors: [
      "#000000", "#1E293B", "#334155", "#64748B", "#94A3B8", "#CBD5E1", "#F1F5F9", "#FFFFFF",
    ],
  },
];

// --- HeroUI Color Components ---

/**
 * 2D Color Area for selecting Saturation and Brightness (HSB/HSV)
 */
export function ColorArea({
  hsva,
  onChange,
  className,
}: {
  hsva: HSVA;
  onChange: (newHsva: HSVA) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handlePointer = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      const s = Math.round((x / rect.width) * 100);
      const v = Math.round((1 - y / rect.height) * 100);
      onChange({ ...hsva, s, v });
    },
    [hsva, onChange],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointer(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (isDragging.current) handlePointer(e);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const hueColor = `hsl(${hsva.h}, 100%, 50%)`;
  const currentColorHex = rgbaToHex(hsvaToRgba(hsva));

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "relative h-36 w-full cursor-crosshair overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 shadow-sm select-none touch-none",
        className,
      )}
      style={{ backgroundColor: hueColor }}
    >
      {/* Saturation gradient: white to transparent */}
      <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
      {/* Brightness gradient: transparent to black */}
      <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />

      {/* HeroUI Signature Thumb: Ring with inner color fill and shadow */}
      <div
        className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_2px_8px_rgba(0,0,0,0.4)] ring-1 ring-black/15 transition-transform duration-75"
        style={{
          left: `${hsva.s}%`,
          top: `${100 - hsva.v}%`,
          backgroundColor: currentColorHex,
        }}
      />
    </div>
  );
}

/**
 * 1D Hue or Alpha Slider with HeroUI styling
 */
export function ColorSlider({
  channel,
  hsva,
  onChange,
  className,
}: {
  channel: "hue" | "alpha";
  hsva: HSVA;
  onChange: (value: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handlePointer = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      if (channel === "hue") {
        const h = Math.round((x / rect.width) * 360);
        onChange(h >= 360 ? 0 : h);
      } else {
        const a = Math.round((x / rect.width) * 100) / 100;
        onChange(a);
      }
    },
    [channel, onChange],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointer(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (isDragging.current) handlePointer(e);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const isHue = channel === "hue";
  const solidColor = rgbaToHex(hsvaToRgba({ ...hsva, a: 1 }));

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        "relative h-3.5 w-full cursor-pointer rounded-full border border-black/5 dark:border-white/10 shadow-inner select-none touch-none",
        !isHue && "overflow-hidden",
        className,
      )}
      style={
        isHue
          ? {
              background:
                "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
            }
          : {
              backgroundImage:
                "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
              backgroundSize: "8px 8px",
              backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
            }
      }
    >
      {!isHue && (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, transparent, ${solidColor})`,
          }}
        />
      )}
      {/* Thumb handle */}
      <div
        className="pointer-events-none absolute top-1/2 h-4.5 w-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-1 ring-black/10"
        style={{
          left: isHue ? `${(hsva.h / 360) * 100}%` : `${hsva.a * 100}%`,
          backgroundColor: isHue
            ? `hsl(${hsva.h}, 100%, 50%)`
            : rgbaToHex(hsvaToRgba(hsva)),
        }}
      />
    </div>
  );
}

/**
 * HeroUI Color Swatch Preview
 */
export function ColorSwatch({
  color,
  size = "md",
  className,
  onClick,
}: {
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
}) {
  const sizeClasses = {
    sm: "h-6 w-6 rounded-lg",
    md: "h-8 w-8 rounded-xl",
    lg: "h-10 w-10 rounded-2xl",
  }[size];

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative shrink-0 overflow-hidden border border-black/10 dark:border-white/15 shadow-sm transition-transform hover:scale-105 active:scale-95 cursor-pointer",
        sizeClasses,
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
        backgroundSize: "6px 6px",
      }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: color || "#000000" }} />
    </div>
  );
}

/**
 * HeroUI Color Swatch Grid / Preset Picker
 */
export function ColorSwatchPicker({
  value,
  onChange,
  palettes = HEROUI_PALETTES,
}: {
  value: string;
  onChange: (color: string) => void;
  palettes?: { name: string; colors: string[] }[];
}) {
  const normalizedValue = value.toUpperCase();

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Presets</span>
      </div>
      <div className="flex flex-col gap-2">
        {palettes.map((palette) => (
          <div key={palette.name} className="flex items-center justify-between gap-1.5">
            {palette.colors.map((c) => {
              const isSelected = normalizedValue === c.toUpperCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange(c)}
                  title={`${palette.name}: ${c}`}
                  className={cn(
                    "relative flex h-6 w-6 items-center justify-center rounded-lg border border-black/10 dark:border-white/15 transition-all hover:scale-115 active:scale-95",
                    isSelected && "ring-2 ring-primary ring-offset-1 dark:ring-offset-black scale-105 shadow-sm",
                  )}
                  style={{ backgroundColor: c }}
                >
                  {isSelected && (
                    <Check
                      size={12}
                      className={cn(
                        c.toUpperCase() === "#FFFFFF" || c.toUpperCase() === "#F1F5F9" || c.toUpperCase() === "#E2E8F0"
                          ? "text-black"
                          : "text-white",
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main HeroUI ColorPicker Component ---

export interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  showAlpha?: boolean | undefined;
  showHex?: boolean | undefined;
  className?: string | undefined;
  swatchClassName?: string | undefined;
  align?: "start" | "center" | "end" | undefined;
  enableEyeDropper?: boolean | undefined;
}

function InteractiveCanvasEyedropper({
  currentColor,
  onSelect,
  onClose,
}: {
  currentColor: string;
  onSelect: (hex: string) => void;
  onClose: () => void;
}) {
  const [sampledColor, setSampledColor] = useState(currentColor);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; visible: boolean }>({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
    visible: false,
  });
  const [isCapturing, setIsCapturing] = useState(true);
  const sampledCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    let unmounted = false;
    const capture = async () => {
      try {
        const target =
          document.querySelector<HTMLElement>("[data-quote-canvas]") ||
          document.querySelector<HTMLElement>("#quote-canvas-root") ||
          document.body;

        canvasRectRef.current = target.getBoundingClientRect();
        const mod = await import("html-to-image");
        const canvas = await mod.toCanvas(target, {
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          cacheBust: false,
          skipFonts: true,
        });
        if (!unmounted) {
          sampledCanvasRef.current = canvas;
          setIsCapturing(false);
        }
      } catch (err) {
        console.warn("Eyedropper canvas snapshot failed, using element sampling:", err);
        if (!unmounted) setIsCapturing(false);
      }
    };
    void capture();
    return () => {
      unmounted = true;
    };
  }, []);

  const sampleColorAt = useCallback((clientX: number, clientY: number): string => {
    const canvas = sampledCanvasRef.current;
    const rect = canvasRectRef.current;
    if (canvas && rect && rect.width > 0 && rect.height > 0) {
      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;
      if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
        const px = Math.max(0, Math.min(canvas.width - 1, Math.round(relX * canvas.width)));
        const py = Math.max(0, Math.min(canvas.height - 1, Math.round(relY * canvas.height)));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const pixel = ctx.getImageData(px, py, 1, 1).data;
          const r = (pixel[0] ?? 0).toString(16).padStart(2, "0");
          const g = (pixel[1] ?? 0).toString(16).padStart(2, "0");
          const b = (pixel[2] ?? 0).toString(16).padStart(2, "0");
          return `#${r}${g}${b}`;
        }
      }
    }
    // Fallback: query element under pointer
    const el = document.elementFromPoint(clientX, clientY);
    if (el) {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor || style.color;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
        const rgba = parseColorToRgba(bg);
        return rgbaToHex(rgba, false);
      }
    }
    return sampledColor;
  }, [sampledColor]);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const color = sampleColorAt(e.clientX, e.clientY);
    setSampledColor(color);
    setLoupePos({ x: e.clientX, y: e.clientY, visible: true });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const color = sampleColorAt(e.clientX, e.clientY);
    setSampledColor(color);
    setLoupePos({ x: e.clientX, y: e.clientY, visible: true });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const finalColor = sampleColorAt(e.clientX, e.clientY);
    onSelect(finalColor);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setLoupePos((p) => ({ ...p, visible: false }))}
      style={{ touchAction: "none" }}
      className="fixed inset-0 z-[99999] cursor-crosshair select-none bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-150"
    >
      {/* Top instruction header */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-full border border-white/20 bg-background/95 px-4 py-2 shadow-2xl backdrop-blur-xl pointer-events-auto">
        <span
          className="h-5 w-5 rounded-full border border-black/20 shadow-sm"
          style={{ backgroundColor: sampledColor }}
        />
        <span className="font-mono text-xs font-bold text-foreground">{sampledColor.toUpperCase()}</span>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">
          {isCapturing ? "Preparing eyedropper..." : "Tap or drag across canvas to sample"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="rounded-full bg-secondary/80 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary active:scale-95 cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Floating Magnifier Loupe */}
      {loupePos.visible ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-[120%] flex flex-col items-center gap-1 transition-transform ease-out duration-75"
          style={{
            left: loupePos.x,
            top: Math.max(80, loupePos.y - 20),
          }}
        >
          <div
            className="relative grid h-16 w-16 place-items-center rounded-full border-4 border-white shadow-[0_4px_20px_rgba(0,0,0,0.5)] ring-2 ring-black/20"
            style={{ backgroundColor: sampledColor }}
          >
            {/* Center crosshair */}
            <div className="h-2 w-2 rounded-full border border-white bg-black/40 shadow-sm" />
          </div>
          <span className="rounded-md bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold text-white shadow-md">
            {sampledColor.toUpperCase()}
          </span>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export function ColorPickerContent({
  value,
  onChange,
  showAlpha = false,
  enableEyeDropper = true,
}: {
  value: string;
  onChange: (value: string) => void;
  showAlpha?: boolean | undefined;
  enableEyeDropper?: boolean | undefined;
}) {
  const [hsva, setHsva] = useState<HSVA>(() => {
    const rgba = parseColorToRgba(value || "#000000");
    return rgbaToHsva(rgba);
  });

  const [format, setFormat] = useState<"hex" | "rgb" | "hsb" | "hsl">("hex");
  const [hexInput, setHexInput] = useState(() => rgbaToHex(parseColorToRgba(value || "#000000")).replace("#", ""));
  const [copied, setCopied] = useState(false);
  const [isSamplingScreen, setIsSamplingScreen] = useState(false);

  // Sync external changes
  useEffect(() => {
    const rgba = parseColorToRgba(value || "#000000");
    const newHsva = rgbaToHsva(rgba);
    setHsva(newHsva);
    setHexInput(rgbaToHex(rgba, showAlpha).replace("#", ""));
  }, [value, showAlpha]);

  const updateHsva = useCallback(
    (newHsva: HSVA) => {
      setHsva(newHsva);
      const rgba = hsvaToRgba(newHsva);
      const hex = rgbaToHex(rgba, showAlpha && newHsva.a < 1);
      setHexInput(hex.replace("#", ""));
      onChange(hex);
    },
    [onChange, showAlpha],
  );

  // Screen Eyedropper — tries Chromium native EyeDropper API first;
  // seamlessly falls back to Interactive in-canvas Touch Eyedropper on mobile & Safari.
  const handleEyeDropper = async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window) {
      try {
        // @ts-expect-error - experimental Chromium API
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result?.sRGBHex) {
          const rgba = parseColorToRgba(result.sRGBHex);
          updateHsva(rgbaToHsva(rgba));
          return;
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    // Fallback: full-screen touch color sampler for mobile, Android, iOS & WebViews
    setIsSamplingScreen(true);
  };

  const handleCopy = () => {
    const hex = `#${hexInput}`;
    navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, showAlpha ? 8 : 6);
    setHexInput(raw);
    if (raw.length === 6 || raw.length === 3 || raw.length === 8) {
      const rgba = parseColorToRgba(`#${raw}`);
      const newHsva = rgbaToHsva(rgba);
      setHsva(newHsva);
      onChange(rgbaToHex(rgba, showAlpha && newHsva.a < 1));
    }
  };

  const rgba = hsvaToRgba(hsva);
  const hsla = hsvaToHsla(hsva);
  const currentColor = rgbaToHex(rgba, showAlpha && hsva.a < 1);

  return (
    // max-md: this is used both as a plain desktop popover (fixed w-68 is
    // correct there) and directly inside FloatingDropdown's mobile bottom
    // sheet (Text Color, Background Solid) — on mobile it should fill the
    // sheet's own width instead of floating narrow inside it with blank
    <div className="flex w-68 max-md:w-full flex-col gap-3 p-3.5 max-md:gap-2.5 max-md:p-2.5 text-popover-foreground">
      {/* 1. HeroUI 2D Color Area - Desktop only, hidden on mobile for clean compact layout */}
      <div className="hidden md:block">
        <ColorArea hsva={hsva} onChange={updateHsva} />
      </div>

      {/* 2. Color Controls (Sliders + EyeDropper + Swatch) */}
      <div className="flex items-center gap-2.5">
        <ColorSwatch color={currentColor} size="md" />

        <div className="flex flex-1 flex-col gap-2">
          <ColorSlider channel="hue" hsva={hsva} onChange={(h) => updateHsva({ ...hsva, h })} />
          {showAlpha && (
            <ColorSlider channel="alpha" hsva={hsva} onChange={(a) => updateHsva({ ...hsva, a })} />
          )}
        </div>

        {enableEyeDropper && (
          <button
            type="button"
            onClick={handleEyeDropper}
            title="Eyedropper (Pick color from screen)"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/10 dark:border-white/15 bg-secondary/60 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground active:scale-95 cursor-pointer"
          >
            <Pipette size={14} />
          </button>
        )}
      </div>

      {isSamplingScreen ? (
        <InteractiveCanvasEyedropper
          currentColor={currentColor}
          onSelect={(hex) => {
            const parsed = parseColorToRgba(hex);
            updateHsva(rgbaToHsva(parsed));
            setIsSamplingScreen(false);
          }}
          onClose={() => setIsSamplingScreen(false)}
        />
      ) : null}

      {/* 3. HeroUI ColorField (Format Switcher & Values) */}
      <div className="flex items-center gap-1.5 rounded-xl border border-black/10 dark:border-white/15 bg-secondary/40 p-1">
        <button
          type="button"
          onClick={() =>
            setFormat((f) => (f === "hex" ? "rgb" : f === "rgb" ? "hsb" : f === "hsb" ? "hsl" : "hex"))
          }
          className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <span>{format}</span>
          <ChevronDown size={11} />
        </button>

        {format === "hex" && (
          <div className="flex flex-1 items-center gap-1">
            <span className="text-xs font-semibold text-muted-foreground">#</span>
            <input
              type="text"
              value={hexInput.toUpperCase()}
              onChange={handleHexChange}
              maxLength={showAlpha ? 8 : 6}
              className="w-full bg-transparent font-mono text-xs font-semibold uppercase tracking-wider text-foreground outline-none"
            />
          </div>
        )}

        {format === "rgb" && (
          <div className="grid flex-1 grid-cols-3 gap-1">
            <input
              type="number"
              min={0}
              max={255}
              value={rgba.r}
              onChange={(e) => updateHsva(rgbaToHsva({ ...rgba, r: clamp(Number(e.target.value), 0, 255) }))}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={rgba.g}
              onChange={(e) => updateHsva(rgbaToHsva({ ...rgba, g: clamp(Number(e.target.value), 0, 255) }))}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={rgba.b}
              onChange={(e) => updateHsva(rgbaToHsva({ ...rgba, b: clamp(Number(e.target.value), 0, 255) }))}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
          </div>
        )}

        {format === "hsb" && (
          <div className="grid flex-1 grid-cols-3 gap-1">
            <input
              type="number"
              min={0}
              max={360}
              value={hsva.h}
              onChange={(e) => updateHsva({ ...hsva, h: clamp(Number(e.target.value), 0, 360) })}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={hsva.s}
              onChange={(e) => updateHsva({ ...hsva, s: clamp(Number(e.target.value), 0, 100) })}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={hsva.v}
              onChange={(e) => updateHsva({ ...hsva, v: clamp(Number(e.target.value), 0, 100) })}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
          </div>
        )}

        {format === "hsl" && (
          <div className="grid flex-1 grid-cols-3 gap-1">
            <input
              type="number"
              min={0}
              max={360}
              value={hsla.h}
              onChange={(e) => updateHsva({ ...hsva, h: clamp(Number(e.target.value), 0, 360) })}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={hsla.s}
              onChange={(e) => {
                const newHsla = { ...hsla, s: clamp(Number(e.target.value), 0, 100) };
                updateHsva(rgbaToHsva(hslaToRgba(newHsla)));
              }}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={hsla.l}
              onChange={(e) => {
                const newHsla = { ...hsla, l: clamp(Number(e.target.value), 0, 100) };
                updateHsva(rgbaToHsva(hslaToRgba(newHsla)));
              }}
              className="w-full rounded-md bg-secondary/60 px-1 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground outline-none"
            />
          </div>
        )}

        {showAlpha && (
          <div className="flex w-12 items-center rounded-md bg-secondary/60 px-1 py-0.5">
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(hsva.a * 100)}
              onChange={(e) => updateHsva({ ...hsva, a: clamp(Number(e.target.value) / 100, 0, 1) })}
              className="w-full bg-transparent text-right font-mono text-[11px] font-semibold text-foreground outline-none"
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleCopy}
          title="Copy hex color"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
      </div>

      {/* 4. HeroUI ColorSwatchPicker (Palettes) */}
      <ColorSwatchPicker
        value={currentColor}
        onChange={(c) => {
          const rgba = parseColorToRgba(c);
          updateHsva(rgbaToHsva(rgba));
        }}
      />
    </div>
  );
}

export interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  showAlpha?: boolean | undefined;
  showHex?: boolean | undefined;
  showIcon?: boolean | undefined;
  className?: string | undefined;
  swatchClassName?: string | undefined;
  align?: "start" | "center" | "end" | undefined;
  enableEyeDropper?: boolean | undefined;
}

/**
 * HeroUI ColorPicker with Radix Popover Integration
 */
export function ColorPicker({
  value,
  onChange,
  showAlpha = false,
  showHex = true,
  showIcon = false,
  className,
  swatchClassName,
  align = "start",
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const formattedHex = value && value.startsWith("#") ? value.toUpperCase() : (value || "#000000").toUpperCase();

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {showIcon ? (
            <button
              type="button"
              className={cn(
                "relative flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/80 bg-secondary/60 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground hover:scale-105 active:scale-95 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary",
                swatchClassName,
              )}
              title="Custom color picker / eyedropper"
            >
              <Pipette size={14} className="text-foreground" />
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background shadow-sm"
                style={{ backgroundColor: value || "#000000" }}
              />
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                "relative flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/20 dark:border-white/20 shadow-sm transition-all hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                swatchClassName,
              )}
              style={{ backgroundColor: value || "#000000" }}
              title="Custom color picker"
            />
          )}
        </PopoverTrigger>
        <PopoverContent
          data-keep-text-editing=""
          data-nopan=""
          align={align}
          sideOffset={6}
          className="w-auto rounded-3xl border border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-150 z-[100]"
        >
          <ColorPickerContent
            value={value}
            onChange={onChange}
            showAlpha={showAlpha}
          />
        </PopoverContent>
      </Popover>

      {/* HEX input for quick manual entry */}
      {showHex && (
        <input
          type="text"
          value={formattedHex}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith("#")) v = "#" + v;
            onChange(v);
          }}
          placeholder="#000000"
          maxLength={7}
          className="w-24 rounded-full border border-border bg-input px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-foreground outline-none transition-colors focus:border-primary"
        />
      )}
    </div>
  );
}
