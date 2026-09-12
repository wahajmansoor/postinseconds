import type React from "react";
import { hexToRgba, type TextLayer } from "./types";

export type RgbColor = { r: number; g: number; b: number };

export function parseColorRgb(input?: string): RgbColor | null {
  if (!input) return null;
  const str = input.trim();
  if (str.startsWith("#")) {
    const raw = str.replace("#", "");
    const full =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return null;
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
    };
  }
  const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  if (str.includes("gradient")) {
    const hexes = str.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/g);
    if (hexes && hexes.length > 0) {
      let r = 0;
      let g = 0;
      let b = 0;
      let valid = 0;
      for (const h of hexes) {
        const parsed = parseColorRgb(h);
        if (parsed) {
          r += parsed.r;
          g += parsed.g;
          b += parsed.b;
          valid++;
        }
      }
      if (valid > 0) {
        return {
          r: Math.round(r / valid),
          g: Math.round(g / valid),
          b: Math.round(b / valid),
        };
      }
    }
  }
  return null;
}

export function getRgbLuminance(rgb: RgbColor): number {
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

export function isBlueBackground(bg?: string): boolean {
  if (!bg) return false;
  const rgb = parseColorRgb(bg);
  if (!rgb) {
    const lower = bg.toLowerCase();
    return (
      lower.includes("blue") ||
      lower.includes("cyan") ||
      lower.includes("navy") ||
      lower.includes("indigo")
    );
  }
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta > 20 && b === max && b > r * 1.15 && b > g * 1.05) {
    return true;
  }

  if (delta > 15) {
    let h = 0;
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    if (h >= 175 && h <= 265) {
      return true;
    }
  }
  return false;
}

export function isWarmBackground(bg?: string): boolean {
  if (!bg) return false;
  const rgb = parseColorRgb(bg);
  if (!rgb) return false;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta > 20) {
    let h = 0;
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    if (h >= 30 && h <= 75) {
      return true;
    }
  }
  return false;
}

export function getSmartHighlightColor(canvasBg?: string): string {
  if (!canvasBg) return "#0021FF";

  // 1. If background is blue / navy / cyan -> Electric Yellow highlight pops with maximum clarity
  if (isBlueBackground(canvasBg)) {
    return "#FFE600";
  }

  // 2. If background is warm / yellow / amber -> Royal Blue
  if (isWarmBackground(canvasBg)) {
    return "#0021FF";
  }

  // 3. If background is dark (luminance < 130) -> Electric Yellow
  const rgb = parseColorRgb(canvasBg);
  if (rgb) {
    const lum = getRgbLuminance(rgb);
    if (lum < 130) {
      return "#FFE600";
    }
  }

  // 4. Default light / neutral background -> Royal Blue
  return "#0021FF";
}

export function getSmartTextColorForHighlight(highlightBgColor: string): string {
  const rgb = parseColorRgb(highlightBgColor);
  if (!rgb) return "#0d0d12";
  const lum = getRgbLuminance(rgb);
  return lum >= 150 ? "#0d0d12" : "#ffffff";
}

export type HighlightPresetOption = {
  name: string;
  color: string;
  textColor: string;
  isRecommended?: boolean;
};

export function getRecommendedHighlightColors(canvasBg?: string): HighlightPresetOption[] {
  const isBlue = isBlueBackground(canvasBg);
  const isWarm = isWarmBackground(canvasBg);
  const rgb = parseColorRgb(canvasBg);
  const isDark = rgb ? getRgbLuminance(rgb) < 130 : false;

  if (isBlue) {
    return [
      { name: "Electric Yellow", color: "#FFE600", textColor: "#0d0d12", isRecommended: true },
      { name: "Pure White", color: "#FFFFFF", textColor: "#0d0d12" },
      { name: "Neon Lime", color: "#A3E635", textColor: "#0d0d12" },
      { name: "Bright Coral", color: "#FF5722", textColor: "#ffffff" },
      { name: "Cyan Pop", color: "#00F0FF", textColor: "#0d0d12" },
      { name: "Deep Charcoal", color: "#0F172A", textColor: "#ffffff" },
    ];
  }

  if (isDark) {
    return [
      { name: "Electric Yellow", color: "#FFE600", textColor: "#0d0d12", isRecommended: true },
      { name: "Cyber Cyan", color: "#00F0FF", textColor: "#0d0d12" },
      { name: "Royal Blue", color: "#0021FF", textColor: "#ffffff" },
      { name: "Pure White", color: "#FFFFFF", textColor: "#0d0d12" },
      { name: "Neon Pink", color: "#EC4899", textColor: "#ffffff" },
      { name: "Lime Glow", color: "#A3E635", textColor: "#0d0d12" },
    ];
  }

  if (isWarm) {
    return [
      { name: "Royal Blue", color: "#0021FF", textColor: "#ffffff", isRecommended: true },
      { name: "Deep Charcoal", color: "#0F172A", textColor: "#ffffff" },
      { name: "Pure White", color: "#FFFFFF", textColor: "#0d0d12" },
      { name: "Emerald Green", color: "#059669", textColor: "#ffffff" },
      { name: "Crimson Red", color: "#DC2626", textColor: "#ffffff" },
      { name: "Purple Dream", color: "#7C3AED", textColor: "#ffffff" },
    ];
  }

  // Light / neutral
  return [
    { name: "Royal Blue", color: "#0021FF", textColor: "#ffffff", isRecommended: true },
    { name: "Electric Yellow", color: "#FFE600", textColor: "#0d0d12" },
    { name: "Deep Charcoal", color: "#0F172A", textColor: "#ffffff" },
    { name: "Purple Dream", color: "#7C3AED", textColor: "#ffffff" },
    { name: "Emerald Green", color: "#059669", textColor: "#ffffff" },
    { name: "Bright Coral", color: "#FF5722", textColor: "#ffffff" },
  ];
}

export function adjustTextsForNewBackground(
  texts: TextLayer[] | undefined,
  newBg: string,
  prevBg?: string,
): TextLayer[] | undefined {
  if (!texts || texts.length === 0) return texts;

  const newIsBlue = isBlueBackground(newBg);
  const prevHighlight = prevBg ? getSmartHighlightColor(prevBg) : "#0021FF";
  const newHighlight = getSmartHighlightColor(newBg);

  return texts.map((t) => {
    if (t.effectType !== "background") return t;

    const currentEffectColor = t.effectColor || prevHighlight;
    const isClashing =
      (newIsBlue && isBlueBackground(currentEffectColor)) ||
      currentEffectColor.toLowerCase() === prevHighlight.toLowerCase();

    if (isClashing || !t.effectColor) {
      const nextTextColor = getSmartTextColorForHighlight(newHighlight);
      return {
        ...t,
        effectColor: newHighlight,
        color: nextTextColor,
      };
    }
    return t;
  });
}

export function getTextEffectStyle(t: TextLayer, canvasBg?: string): React.CSSProperties {
  const effect = t.effectType ?? "none";
  if (effect === "none") return {};

  const defaultBgColor = getSmartHighlightColor(canvasBg);
  const color =
    t.effectColor ??
    (effect === "background" ? defaultBgColor : effect === "neon" ? "#0021FF" : "#000000");
  const offset = t.effectOffset ?? 50; // 0-100 scale
  const direction = t.effectDirection ?? 45; // 0-360 deg
  const blur = t.effectBlur ?? 50; // 0-100 scale
  const opacity = (t.effectOpacity ?? (effect === "background" ? 80 : 100)) / 100; // 0-1
  const thickness = t.effectThickness ?? 40; // 0-100 scale

  const rad = (direction * Math.PI) / 180;
  const dist = (offset / 100) * (t.size * 0.25);
  const offX = Math.round(Math.cos(rad) * dist);
  const offY = Math.round(Math.sin(rad) * dist);
  const blurPx = Math.round((blur / 100) * (t.size * 0.35));
  const strokePx = Math.max(1, Math.round((thickness / 100) * (t.size * 0.08)));

  const rgbaColor = hexToRgba(color, opacity);

  switch (effect) {
    case "drop": {
      return {
        textShadow: `${offX}px ${offY}px ${blurPx}px ${rgbaColor}`,
      };
    }
    case "glow": {
      const gBlur1 = Math.max(2, blurPx);
      const gBlur2 = Math.max(6, Math.round(blurPx * 1.8));
      return {
        textShadow: `0 0 ${gBlur1}px ${rgbaColor}, 0 0 ${gBlur2}px ${rgbaColor}`,
      };
    }
    case "echo": {
      const echo1 = `${offX}px ${offY}px 0 ${hexToRgba(color, opacity * 0.65)}`;
      const echo2 = `${offX * 2}px ${offY * 2}px 0 ${hexToRgba(color, opacity * 0.35)}`;
      return {
        textShadow: `${echo1}, ${echo2}`,
      };
    }
    case "outline": {
      return {
        WebkitTextStroke: `${strokePx}px ${color}`,
      };
    }
    case "background": {
      const roundness = t.effectRoundness ?? 50;
      const spread = t.effectSpread ?? 50;
      const padY = Math.round((spread / 100) * (t.size * 0.25));
      const padX = Math.round((spread / 100) * (t.size * 0.45));
      const radiusPx = Math.round((roundness / 100) * (t.size * 0.4));
      return {
        backgroundColor: rgbaColor,
        borderRadius: `${radiusPx}px`,
        padding: `${padY}px ${padX}px`,
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      };
    }
    case "splice": {
      return {
        WebkitTextStroke: `${strokePx}px ${t.color}`,
        WebkitTextFillColor: "transparent",
        color: "transparent",
        textShadow: `${offX}px ${offY}px 0 ${color}`,
      };
    }
    case "hollow": {
      return {
        WebkitTextStroke: `${strokePx}px ${color || t.color}`,
        WebkitTextFillColor: "transparent",
        color: "transparent",
      };
    }
    case "neon": {
      const nColor = color === "#000000" ? "#0021FF" : color;
      return {
        color: "#ffffff",
        WebkitTextFillColor: "#ffffff",
        textShadow: `0 0 4px #fff, 0 0 10px #fff, 0 0 18px ${nColor}, 0 0 30px ${nColor}, 0 0 45px ${nColor}`,
      };
    }
    case "glitch": {
      const gOff = Math.max(2, Math.round((offset / 100) * (t.size * 0.12)));
      const color1 = color === "#000000" ? "#06b6d4" : color;
      const color2 = "#0021FF";
      return {
        textShadow: `${gOff}px ${-gOff}px 0 ${color1}, ${-gOff}px ${gOff}px 0 ${color2}`,
      };
    }
    default:
      return {};
  }
}
