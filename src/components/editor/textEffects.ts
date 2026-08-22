import type React from "react";
import { hexToRgba, type TextLayer } from "./types";

export function getTextEffectStyle(t: TextLayer): React.CSSProperties {
  const effect = t.effectType ?? "none";
  if (effect === "none") return {};

  const color = t.effectColor ?? (effect === "background" ? "#0021FF" : effect === "neon" ? "#0021FF" : "#000000");
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
