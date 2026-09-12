import { ArrowLeft01Icon, FilterIcon, RefreshIcon, SparklesIcon } from "hugeicons-react";
import type React from "react";
import { useState } from "react";
import type { TextEffectType, TextLayer, TextShapeType } from "./types";
import { ColorInput, Range } from "./ui";
import {
  getSmartHighlightColor,
  getSmartTextColorForHighlight,
  getRecommendedHighlightColors,
} from "./textEffects";

type Props = {
  layer: TextLayer | null;
  onChange: (patch: Partial<Omit<TextLayer, "id">>) => void;
  canvasBg?: string;
};

type EffectOption = {
  id: TextEffectType;
  label: string;
  renderPreview: () => React.ReactNode;
};

const EFFECT_OPTIONS: EffectOption[] = [
  {
    id: "none",
    label: "None",
    renderPreview: () => <span className="text-4xl font-black text-foreground">Ag</span>,
  },
  {
    id: "drop",
    label: "Drop",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-foreground"
        style={{ textShadow: "3px 3px 6px rgba(0,0,0,0.8)" }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "glow",
    label: "Glow",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-foreground"
        style={{ textShadow: "0 0 10px #0021FF, 0 0 20px #0021FF" }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "echo",
    label: "Echo",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-foreground"
        style={{
          textShadow: "2px 2px 0 rgba(255,255,255,0.4), 4px 4px 0 rgba(255,255,255,0.2)",
        }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "outline",
    label: "Outline",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-transparent"
        style={{ WebkitTextStroke: "1.5px #38bdf8" }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "background",
    label: "Background",
    renderPreview: () => (
      <div className="rounded-xl bg-primary px-2.5 py-0.5 shadow-sm">
        <span className="text-3xl font-black text-primary-foreground">Ag</span>
      </div>
    ),
  },
  {
    id: "splice",
    label: "Splice",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-transparent"
        style={{
          WebkitTextStroke: "1.5px #ffffff",
          textShadow: "2.5px 2.5px 0 #0021FF",
        }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "hollow",
    label: "Hollow",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-transparent"
        style={{
          WebkitTextStroke: "1.5px #ffffff",
        }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "neon",
    label: "Neon",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-white"
        style={{
          textShadow: "0 0 4px #fff, 0 0 10px #38bdf8, 0 0 20px #0021FF",
        }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "glitch",
    label: "Glitch",
    renderPreview: () => (
      <span
        className="text-4xl font-black text-foreground"
        style={{
          textShadow: "2px -2px 0 #06b6d4, -2px 2px 0 #ff007f",
        }}
      >
        Ag
      </span>
    ),
  },
];

export function TextEffectsPanel({ layer, onChange, canvasBg }: Props) {
  const currentEffect = layer?.effectType ?? "none";
  const currentShape = layer?.shapeType ?? "none";

  // Mode: "grid" (show all cards) or "detail" (show only properties for clicked item)
  const [activeDetail, setActiveDetail] = useState<TextEffectType | TextShapeType | null>(null);

  if (!layer) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <p className="text-xs font-medium">Select a text layer on canvas to apply text effects.</p>
      </div>
    );
  }

  const smartDefaultBgColor = getSmartHighlightColor(canvasBg);

  const handleSelectEffect = (effect: TextEffectType) => {
    if (effect === "none") {
      onChange({ effectType: "none" });
      setActiveDetail(null);
    } else {
      const effectColor =
        layer.effectColor ??
        (effect === "background"
          ? smartDefaultBgColor
          : effect === "neon"
            ? "#0021FF"
            : "#000000");

      const smartTextColor =
        effect === "background"
          ? getSmartTextColorForHighlight(effectColor)
          : undefined;

      onChange({
        effectType: effect,
        effectColor,
        ...(smartTextColor ? { color: smartTextColor } : {}),
        effectThickness: layer.effectThickness ?? 40,
        effectOffset: layer.effectOffset ?? 50,
        effectDirection: layer.effectDirection ?? 45,
        effectBlur: layer.effectBlur ?? 50,
        effectOpacity: layer.effectOpacity ?? (effect === "background" ? 80 : 100),
        effectRoundness: layer.effectRoundness ?? 50,
        effectSpread: layer.effectSpread ?? 50,
      });
      setActiveDetail(effect);
    }
  };

  const handleSelectShape = (shape: TextShapeType) => {
    if (shape === "none") {
      onChange({ shapeType: "none" });
      setActiveDetail(null);
    } else {
      onChange({
        shapeType: shape,
        curveAmount: layer.curveAmount ?? 50,
      });
      setActiveDetail(shape);
    }
  };

  // If in detail mode (user clicked an effect or shape card to edit its properties)
  const showingDetail = activeDetail && activeDetail !== "none";

  return (
    <div className="flex flex-col gap-4">
      {showingDetail ? (
        /* DETAIL CONTROLS VIEW */
        <div className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm animate-in fade-in slide-in-from-left-2 duration-150">
          {/* Header with Back button */}
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <button
              type="button"
              onClick={() => setActiveDetail(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-foreground transition-colors hover:text-primary"
            >
              <ArrowLeft01Icon size={16} />
              <span>Back to Effects</span>
            </button>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              {activeDetail}
            </span>
          </div>

          <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">
            {activeDetail} Properties
          </h4>

          {/* Thickness Control */}
          {["outline", "splice", "hollow"].includes(activeDetail) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Thickness</span>
              </div>
              <Range
                min={1}
                max={100}
                value={layer.effectThickness ?? 40}
                onChange={(v) => onChange({ effectThickness: v })}
                showInput={true}
              />
            </div>
          )}

          {/* Offset Control */}
          {["drop", "echo", "splice", "glitch"].includes(activeDetail) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Offset</span>
              </div>
              <Range
                min={0}
                max={100}
                value={layer.effectOffset ?? 50}
                onChange={(v) => onChange({ effectOffset: v })}
                showInput={true}
              />
            </div>
          )}

          {/* Direction Control */}
          {["drop", "echo", "splice"].includes(activeDetail) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Direction</span>
              </div>
              <Range
                min={0}
                max={360}
                step={5}
                value={layer.effectDirection ?? 45}
                onChange={(v) => onChange({ effectDirection: v })}
                showInput={true}
              />
            </div>
          )}

          {/* Blur Control */}
          {["drop", "glow", "neon"].includes(activeDetail) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Blur</span>
              </div>
              <Range
                min={0}
                max={100}
                value={layer.effectBlur ?? 50}
                onChange={(v) => onChange({ effectBlur: v })}
                showInput={true}
              />
            </div>
          )}

          {/* Transparency Control */}
          {["drop", "glow", "echo", "background"].includes(activeDetail) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Transparency</span>
              </div>
              <Range
                min={0}
                max={100}
                value={layer.effectOpacity ?? (activeDetail === "background" ? 80 : 100)}
                onChange={(v) => onChange({ effectOpacity: v })}
                showInput={true}
              />
            </div>
          )}

          {/* Color Control */}
          {["drop", "glow", "echo", "outline", "background", "splice", "hollow", "neon", "glitch"].includes(activeDetail) && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {activeDetail === "background" ? "Highlight Color" : "Effect Color"}
                </span>
                <ColorInput
                  value={layer.effectColor ?? (activeDetail === "background" ? smartDefaultBgColor : activeDetail === "neon" ? "#0021FF" : "#000000")}
                  onChange={(c) => {
                    const smartTextColor =
                      activeDetail === "background"
                        ? getSmartTextColorForHighlight(c)
                        : undefined;
                    onChange({
                      effectColor: c,
                      ...(smartTextColor ? { color: smartTextColor } : {}),
                    });
                  }}
                  showHex={true}
                  swatchClassName="h-7 w-7 rounded-lg border-border"
                />
              </div>

              {/* Recommended Highlight Swatches for Background Effect */}
              {activeDetail === "background" && (
                <div className="rounded-xl border border-border/70 bg-secondary/30 p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      <SparklesIcon size={12} className="text-amber-500" />
                      Smart Highlight Colors
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Auto-contrasted
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {getRecommendedHighlightColors(canvasBg).map((opt) => {
                      const isActive =
                        (layer.effectColor || smartDefaultBgColor).toLowerCase() ===
                        opt.color.toLowerCase();
                      return (
                        <button
                          key={opt.color}
                          type="button"
                          title={`${opt.name}${opt.isRecommended ? " (Recommended)" : ""}`}
                          onClick={() => {
                            onChange({
                              effectColor: opt.color,
                              color: opt.textColor,
                            });
                          }}
                          className={`group relative flex h-7 w-full items-center justify-center rounded-lg border transition-all cursor-pointer ${
                            isActive
                              ? "border-primary ring-2 ring-primary/40 shadow-sm scale-105"
                              : "border-border/60 hover:scale-105 hover:border-foreground/40"
                          }`}
                          style={{ backgroundColor: opt.color }}
                        >
                          {opt.isRecommended && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-amber-950 shadow">
                              ★
                            </span>
                          )}
                          <span
                            className="text-[9px] font-extrabold"
                            style={{ color: opt.textColor }}
                          >
                            Ag
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Background Specific Controls */}
          {activeDetail === "background" && (
            <>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground">Roundness</span>
                </div>
                <Range
                  min={0}
                  max={100}
                  value={layer.effectRoundness ?? 50}
                  onChange={(v) => onChange({ effectRoundness: v })}
                  showInput={true}
                />
              </div>
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground">Spread</span>
                </div>
                <Range
                  min={0}
                  max={100}
                  value={layer.effectSpread ?? 50}
                  onChange={(v) => onChange({ effectSpread: v })}
                  showInput={true}
                />
              </div>
            </>
          )}

          {/* Curve Shape Control */}
          {activeDetail === "curve" && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Curve Bend (1 - 100)</span>
              </div>
              <Range
                min={1}
                max={100}
                value={layer.curveAmount ?? 50}
                onChange={(v) => onChange({ curveAmount: v })}
                showInput={true}
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                if (activeDetail === "curve") {
                  onChange({ shapeType: "none" });
                } else {
                  onChange({ effectType: "none" });
                }
                setActiveDetail(null);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
            >
              <RefreshIcon size={14} />
              <span>Reset {activeDetail} Effect</span>
            </button>
          </div>
        </div>
      ) : (
        /* GRID VIEW (MATCHES SHAPES / STUDIO CARDS) */
        <>
          {/* Effects Section */}
          <div>
            <p className="mb-2.5 text-xs font-bold text-foreground">Text Effects</p>
            <div className="grid grid-cols-3 gap-2.5">
              {EFFECT_OPTIONS.map((opt) => {
                const isActive = currentEffect === opt.id;
                return (
                  <div key={opt.id} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectEffect(opt.id);
                        if (opt.id !== "none") setActiveDetail(opt.id);
                      }}
                      className={`relative flex h-24 w-full items-center justify-center rounded-xl transition-all ${
                        isActive
                          ? "border-2 border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40 scale-[1.02]"
                          : "border border-border/80 bg-secondary/30 hover:border-border hover:bg-secondary/60 hover:scale-[1.02]"
                      }`}
                    >
                      {isActive && opt.id !== "none" && (
                        <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                          <FilterIcon size={10} />
                        </span>
                      )}
                      {opt.renderPreview()}
                    </button>
                    <span className={`text-[11px] font-semibold ${isActive ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {opt.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shape Section */}
          <div className="border-t border-border/60 pt-4">
            <p className="mb-2.5 text-xs font-bold text-foreground">Shape</p>
            <div className="grid grid-cols-3 gap-2.5">
              {/* None Shape */}
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectShape("none")}
                  className={`flex h-24 w-full items-center justify-center rounded-xl transition-all ${
                    currentShape === "none"
                      ? "border-2 border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40 scale-[1.02]"
                      : "border border-border/80 bg-secondary/30 hover:border-border hover:bg-secondary/60 hover:scale-[1.02]"
                  }`}
                >
                  <span className={`text-base font-black ${currentShape === "none" ? "text-primary" : "text-foreground"}`}>
                    None
                  </span>
                </button>
                <span className={`text-[11px] font-semibold ${currentShape === "none" ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  None
                </span>
              </div>

              {/* Curve Shape */}
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectShape("curve");
                    setActiveDetail("curve");
                  }}
                  className={`flex h-24 w-full items-center justify-center rounded-xl transition-all ${
                    currentShape === "curve"
                      ? "border-2 border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40 scale-[1.02]"
                      : "border border-border/80 bg-secondary/30 hover:border-border hover:bg-secondary/60 hover:scale-[1.02]"
                  }`}
                >
                  <svg viewBox="0 0 100 60" className="h-10 w-16 text-foreground">
                    <path id="curvePreviewPath" d="M 10,45 Q 50,10 90,45" fill="none" />
                    <text fill="currentColor" fontSize="16" fontWeight="900">
                      <textPath href="#curvePreviewPath" startOffset="50%" textAnchor="middle">
                        ABCD
                      </textPath>
                    </text>
                  </svg>
                </button>
                <span className={`text-[11px] font-semibold ${currentShape === "curve" ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  Curve
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
