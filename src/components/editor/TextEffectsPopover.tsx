import { FilterIcon, MultiplicationSignIcon } from "hugeicons-react";
import type React from "react";
import { useRef } from "react";
import type { TextEffectType, TextLayer, TextShapeType } from "./types";
import { ColorInput } from "./ui";

type Props = {
  layer: TextLayer;
  onChange: (patch: Partial<Omit<TextLayer, "id">>) => void;
  onClose?: () => void;
  className?: string;
};

type EffectOption = {
  id: TextEffectType;
  label: string;
  renderPreview: (active: boolean) => React.ReactNode;
};

const EFFECT_OPTIONS: EffectOption[] = [
  {
    id: "none",
    label: "None",
    renderPreview: () => (
      <span className="text-2xl font-black text-zinc-900">
        Ag
      </span>
    ),
  },
  {
    id: "drop",
    label: "Drop",
    renderPreview: () => (
      <span
        className="text-2xl font-black text-zinc-900"
        style={{ textShadow: "3px 3px 5px rgba(0,0,0,0.4)" }}
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
        className="text-2xl font-black text-zinc-900"
        style={{ textShadow: "0 0 8px #0021FF, 0 0 16px #0021FF" }}
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
        className="text-2xl font-black text-zinc-900"
        style={{
          textShadow: "2px 2px 0 rgba(0,0,0,0.4), 4px 4px 0 rgba(0,0,0,0.2)",
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
        className="text-2xl font-black text-white"
        style={{ WebkitTextStroke: "1.5px #18181b" }}
      >
        Ag
      </span>
    ),
  },
  {
    id: "background",
    label: "Background",
    renderPreview: () => (
      <div className="rounded-lg bg-zinc-900 px-2 py-0.5 shadow">
        <span className="text-2xl font-black text-white">Ag</span>
      </div>
    ),
  },
  {
    id: "splice",
    label: "Splice",
    renderPreview: () => (
      <span
        className="text-2xl font-black"
        style={{
          WebkitTextStroke: "1.5px #18181b",
          WebkitTextFillColor: "transparent",
          textShadow: "2px 2px 0 #0021FF",
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
        className="text-2xl font-black"
        style={{
          WebkitTextStroke: "1.5px #18181b",
          WebkitTextFillColor: "transparent",
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
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-900">
        <span
          className="text-xl font-black text-white"
          style={{
            textShadow: "0 0 4px #fff, 0 0 8px #3b82f6, 0 0 14px #0021FF",
          }}
        >
          Ag
        </span>
      </div>
    ),
  },
  {
    id: "glitch",
    label: "Glitch",
    renderPreview: () => (
      <span
        className="text-2xl font-black text-zinc-900"
        style={{
          textShadow: "2px -2px 0 #06b6d4, -2px 2px 0 #0021FF",
        }}
      >
        Ag
      </span>
    ),
  },
];

export function TextEffectsPopover({ layer, onChange, onClose, className = "" }: Props) {
  const currentEffect = layer.effectType ?? "none";
  const currentShape = layer.shapeType ?? "none";
  const controlsRef = useRef<HTMLDivElement>(null);

  const handleSelectEffect = (effect: TextEffectType) => {
    if (effect === "none") {
      onChange({ effectType: "none" });
    } else {
      onChange({
        effectType: effect,
        effectColor: layer.effectColor ?? (effect === "background" ? "#0021FF" : effect === "neon" ? "#0021FF" : "#000000"),
        effectThickness: layer.effectThickness ?? 40,
        effectOffset: layer.effectOffset ?? 50,
        effectDirection: layer.effectDirection ?? 45,
        effectBlur: layer.effectBlur ?? 50,
        effectOpacity: layer.effectOpacity ?? (effect === "background" ? 80 : 100),
        effectRoundness: layer.effectRoundness ?? 50,
        effectSpread: layer.effectSpread ?? 50,
      });
    }
  };

  const handleSelectShape = (shape: TextShapeType) => {
    if (shape === "none") {
      onChange({ shapeType: "none" });
    } else {
      onChange({
        shapeType: shape,
        curveAmount: layer.curveAmount ?? 50,
      });
    }
  };

  const hasActiveControls = currentEffect !== "none" || currentShape !== "none";

  return (
    <div
      className={`relative z-[9999] flex flex-row-reverse items-start gap-3 ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Main Effects & Shapes Gallery Panel */}
      <div className="w-80 shrink-0 rounded-2xl border border-border/80 bg-background/95 p-4 text-foreground shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-tight text-foreground">Effects</h3>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <MultiplicationSignIcon size={16} />
            </button>
          ) : null}
        </div>

        {/* Grid of Effects */}
        <div className="grid grid-cols-3 gap-2.5">
          {EFFECT_OPTIONS.map((opt) => {
            const isActive = currentEffect === opt.id;
            return (
              <div key={opt.id} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectEffect(opt.id)}
                  className={`relative flex h-20 w-full items-center justify-center rounded-xl transition-all ${
                    isActive
                      ? "border-2 border-primary bg-white ring-2 ring-primary/40 shadow-xl scale-[1.03]"
                      : "border border-zinc-200 bg-white hover:border-primary/60 hover:shadow-md"
                  }`}
                >
                  {isActive && opt.id !== "none" && (
                    <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                      <FilterIcon size={10} />
                    </span>
                  )}
                  {opt.renderPreview(isActive)}
                </button>
                <span className={`text-[11px] font-semibold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  {opt.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Section: Shape */}
        <div className="mt-5 border-t border-border/60 pt-4">
          <h4 className="mb-2.5 text-xs font-bold text-foreground">Shape</h4>
          <div className="grid grid-cols-3 gap-2.5">
            {/* None shape */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => handleSelectShape("none")}
                className={`flex h-20 w-full items-center justify-center rounded-xl transition-all ${
                  currentShape === "none"
                    ? "border-2 border-primary bg-white ring-2 ring-primary/40 shadow-xl scale-[1.03]"
                    : "border border-zinc-200 bg-white hover:border-primary/60 hover:shadow-md"
                }`}
              >
                <span className={`text-base font-black ${currentShape === "none" ? "text-primary" : "text-zinc-900"}`}>
                  None
                </span>
              </button>
              <span className={`text-[11px] font-semibold ${currentShape === "none" ? "text-primary" : "text-muted-foreground"}`}>
                None
              </span>
            </div>

            {/* Curve shape */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => handleSelectShape("curve")}
                className={`flex h-20 w-full items-center justify-center rounded-xl transition-all ${
                  currentShape === "curve"
                    ? "border-2 border-primary bg-white ring-2 ring-primary/40 shadow-xl scale-[1.03]"
                    : "border border-zinc-200 bg-white hover:border-primary/60 hover:shadow-md"
                }`}
              >
                <svg viewBox="0 0 100 60" className="h-10 w-16 text-zinc-900">
                  <path id="curvePreviewPath" d="M 10,45 Q 50,10 90,45" fill="none" />
                  <text fill="currentColor" fontSize="16" fontWeight="900">
                    <textPath href="#curvePreviewPath" startOffset="50%" textAnchor="middle">
                      ABCD
                    </textPath>
                  </text>
                </svg>
              </button>
              <span className={`text-[11px] font-semibold ${currentShape === "curve" ? "text-primary" : "text-muted-foreground"}`}>
                Curve
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Side Fine-Tuning Controls Panel (Show on Left of Effect Panel) */}
      {hasActiveControls && (
        <div
          ref={controlsRef}
          className="w-72 shrink-0 space-y-3.5 rounded-2xl border border-border/80 bg-background/95 p-4 text-foreground shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-right-2 duration-200"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
              {currentEffect !== "none" ? `${currentEffect} Controls` : "Shape Controls"}
            </h4>
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              Active
            </span>
          </div>

          {/* Effect Color */}
          {["drop", "glow", "echo", "outline", "background", "splice", "hollow", "neon", "glitch"].includes(currentEffect) && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Color</span>
              <ColorInput
                value={layer.effectColor ?? (currentEffect === "background" ? "#0021FF" : currentEffect === "neon" ? "#0021FF" : "#000000")}
                onChange={(c) => onChange({ effectColor: c })}
                showHex={true}
                swatchClassName="h-6 w-6 rounded-lg border-border"
              />
            </div>
          )}

          {/* Thickness control for outline, splice, hollow */}
          {["outline", "splice", "hollow"].includes(currentEffect) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Thickness</span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {layer.effectThickness ?? 40}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={layer.effectThickness ?? 40}
                onChange={(e) => onChange({ effectThickness: Number(e.target.value) })}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>
          )}

          {/* Offset control for drop, echo, splice, glitch */}
          {["drop", "echo", "splice", "glitch"].includes(currentEffect) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Offset</span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {layer.effectOffset ?? 50}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={layer.effectOffset ?? 50}
                onChange={(e) => onChange({ effectOffset: Number(e.target.value) })}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>
          )}

          {/* Direction control for drop, echo, splice */}
          {["drop", "echo", "splice"].includes(currentEffect) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Direction</span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {layer.effectDirection ?? 45}°
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={layer.effectDirection ?? 45}
                onChange={(e) => onChange({ effectDirection: Number(e.target.value) })}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>
          )}

          {/* Blur control for drop, glow, neon */}
          {["drop", "glow", "neon"].includes(currentEffect) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Blur</span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {layer.effectBlur ?? 50}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={layer.effectBlur ?? 50}
                onChange={(e) => onChange({ effectBlur: Number(e.target.value) })}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>
          )}

          {/* Opacity control for drop, glow, echo, background */}
          {["drop", "glow", "echo", "background"].includes(currentEffect) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Transparency</span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {layer.effectOpacity ?? (currentEffect === "background" ? 80 : 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={layer.effectOpacity ?? (currentEffect === "background" ? 80 : 100)}
                onChange={(e) => onChange({ effectOpacity: Number(e.target.value) })}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>
          )}

          {/* Background specific: Roundness & Spread */}
          {currentEffect === "background" && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Roundness</span>
                  <span className="font-mono text-xs font-medium text-foreground">
                    {layer.effectRoundness ?? 50}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={layer.effectRoundness ?? 50}
                  onChange={(e) => onChange({ effectRoundness: Number(e.target.value) })}
                  className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Spread</span>
                  <span className="font-mono text-xs font-medium text-foreground">
                    {layer.effectSpread ?? 50}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={layer.effectSpread ?? 50}
                  onChange={(e) => onChange({ effectSpread: Number(e.target.value) })}
                  className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
                />
              </div>
            </>
          )}

          {/* Curve Shape control */}
          {currentShape === "curve" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Curve Bend</span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {layer.curveAmount ?? 50}
                </span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={layer.curveAmount ?? 50}
                onChange={(e) => onChange({ curveAmount: Number(e.target.value) })}
                className="h-1.5 w-full cursor-grab appearance-none rounded-lg bg-secondary accent-primary"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
