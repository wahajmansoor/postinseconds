import type React from "react";
import { useRef, useState } from "react";
import {
  CropIcon,
  EyeIcon,
  Layers01Icon,
  Upload01Icon,
} from "hugeicons-react";
import { AppTooltip } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ImageLayer } from "./types";
import { Chip, ColorInput, Field, Range, Toggle } from "./ui";
import { cn } from "@/lib/utils";
import { ImageCropDialog } from "./ImageCropDialog";

interface ImageSelectionToolbarProps {
  layer: ImageLayer;
  onUpdate: (patch: Partial<Omit<ImageLayer, "id">>) => void;
  onOpenCrop?: () => void;
}

export function ImageSelectionToolbar({
  layer,
  onUpdate,
  onOpenCrop,
}: ImageSelectionToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        onUpdate({ src: dataUrl });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const btnClass =
    "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors hover:bg-secondary";

  return (
    <div
      data-nopan=""
      data-keep-text-editing=""
      className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap md:rounded-2xl md:border md:border-border/80 md:bg-background/95 md:p-1.5 md:shadow-2xl md:backdrop-blur-md"
    >
      {/* Hidden file input for Replace Image */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 1. Replace Image Button */}
      <AppTooltip content="Replace this image with a new photo">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(btnClass, "border border-border/60 bg-secondary/40 text-foreground")}
        >
          <Upload01Icon size={15} className="text-primary" />
          <span>Replace</span>
        </button>
      </AppTooltip>

      {/* 2. Crop Image Button */}
      <AppTooltip content="Crop, frame, and adjust this image">
        <button
          type="button"
          onClick={() => {
            if (onOpenCrop) {
              onOpenCrop();
            } else {
              setCropOpen(true);
            }
          }}
          className={cn(btnClass, "border border-border/60 bg-secondary/40 text-foreground")}
        >
          <CropIcon size={15} className="text-primary" />
          <span>Crop</span>
        </button>
      </AppTooltip>

      {!onOpenCrop ? (
        <ImageCropDialog
          open={cropOpen}
          onClose={() => setCropOpen(false)}
          imageSrc={layer.src}
          onCropComplete={(croppedDataUrl) => onUpdate({ src: croppedDataUrl })}
        />
      ) : null}

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 2. Corner Radius Popover */}
      <Popover open={radiusOpen} onOpenChange={setRadiusOpen}>
        <AppTooltip content="Adjust corner radius">
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                btnClass,
                radiusOpen && "bg-secondary text-primary",
                layer.radius > 0 ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span className="text-[11px] font-semibold">
                Radius: {layer.radius === 999 ? "Circle" : `${layer.radius}px`}
              </span>
            </button>
          </PopoverTrigger>
        </AppTooltip>
        <PopoverContent
          align="center"
          sideOffset={8}
          className="w-64 space-y-3 p-3 shadow-xl"
          data-nopan=""
          data-keep-text-editing=""
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Corner Radius</span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {layer.radius === 999 ? "Pill / Circle" : `${layer.radius}px`}
            </span>
          </div>

          <Range
            value={layer.radius}
            min={0}
            max={200}
            onChange={(v) => onUpdate({ radius: v })}
          />

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "0px", val: 0 },
              { label: "8px", val: 8 },
              { label: "16px", val: 16 },
              { label: "24px", val: 24 },
              { label: "40px", val: 40 },
              { label: "Circle", val: 999 },
            ].map((p) => (
              <Chip
                key={p.label}
                active={layer.radius === p.val}
                onClick={() => onUpdate({ radius: p.val })}
                className="justify-center py-1 text-[11px]"
              >
                {p.label}
              </Chip>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 3. Opacity Popover */}
      <Popover open={opacityOpen} onOpenChange={setOpacityOpen}>
        <AppTooltip content="Adjust layer opacity">
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                btnClass,
                opacityOpen && "bg-secondary text-primary",
                (layer.opacity ?? 100) < 100 && "text-primary",
              )}
            >
              <EyeIcon size={15} />
              <span className="text-xs font-semibold">{layer.opacity ?? 100}%</span>
            </button>
          </PopoverTrigger>
        </AppTooltip>
        <PopoverContent
          align="center"
          sideOffset={8}
          className="w-56 space-y-3 p-3 shadow-xl"
          data-nopan=""
          data-keep-text-editing=""
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Layer Opacity</span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {layer.opacity ?? 100}%
            </span>
          </div>

          <Range
            value={layer.opacity ?? 100}
            min={5}
            max={100}
            onChange={(v) => onUpdate({ opacity: v })}
          />

          <div className="grid grid-cols-4 gap-1">
            {[100, 75, 50, 25].map((op) => (
              <Chip
                key={op}
                active={(layer.opacity ?? 100) === op}
                onClick={() => onUpdate({ opacity: op })}
                className="justify-center py-1 text-[10px]"
              >
                {op}%
              </Chip>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* 4. Drop Shadow Popover */}
      <Popover open={shadowOpen} onOpenChange={setShadowOpen}>
        <AppTooltip content="Drop shadow & depth">
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                btnClass,
                shadowOpen && "bg-secondary text-primary",
                layer.shadow ? "text-primary font-semibold" : "text-muted-foreground",
              )}
            >
              <Layers01Icon size={14} />
              <span className="text-[11px]">Shadow</span>
            </button>
          </PopoverTrigger>
        </AppTooltip>
        <PopoverContent
          align="center"
          sideOffset={8}
          className="w-[350px] space-y-3.5 p-4 shadow-2xl rounded-2xl border border-border/80 bg-background/95 backdrop-blur-md"
          data-nopan=""
          data-keep-text-editing=""
        >
          <Toggle
            checked={layer.shadow}
            onChange={(v) => onUpdate({ shadow: v })}
            label="Drop shadow"
          />

          {layer.shadow ? (
            <div className="space-y-3 border-t border-border/50 pt-3">
              {/* All Range Sliders on Top with full width */}
              <Field label={`Blur — ${layer.shadowBlur}px`}>
                <Range
                  value={layer.shadowBlur}
                  min={0}
                  max={100}
                  onChange={(v) => onUpdate({ shadowBlur: v })}
                  showInput={true}
                />
              </Field>

              <Field label={`Spread — ${layer.shadowSpread ?? 0}px`}>
                <Range
                  value={layer.shadowSpread ?? 0}
                  min={-20}
                  max={40}
                  onChange={(v) => onUpdate({ shadowSpread: v })}
                  showInput={true}
                />
              </Field>

              <Field label={`Offset X — ${layer.shadowX ?? 0}px`}>
                <Range
                  value={layer.shadowX ?? 0}
                  min={-50}
                  max={50}
                  onChange={(v) => onUpdate({ shadowX: v })}
                  showInput={true}
                />
              </Field>

              <Field label={`Offset Y — ${layer.shadowY ?? 12}px`}>
                <Range
                  value={layer.shadowY ?? 12}
                  min={-50}
                  max={50}
                  onChange={(v) => onUpdate({ shadowY: v })}
                  showInput={true}
                />
              </Field>

              <Field label={`Opacity — ${layer.shadowOpacity ?? 35}%`}>
                <Range
                  value={layer.shadowOpacity ?? 35}
                  min={0}
                  max={100}
                  onChange={(v) => onUpdate({ shadowOpacity: v })}
                  showInput={true}
                />
              </Field>

              {/* Color Picker at Bottom */}
              <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
                <span className="text-xs font-semibold text-muted-foreground">Shadow Color</span>
                <ColorInput
                  value={layer.shadowColor ?? "#000000"}
                  onChange={(v) => onUpdate({ shadowColor: v })}
                  showHex={true}
                  swatchClassName="h-7 w-7 rounded-lg border-border"
                />
              </div>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 5. Flip Controls */}
      <AppTooltip content="Flip horizontally">
        <button
          type="button"
          onClick={() => onUpdate({ flipH: !layer.flipH })}
          className={cn(btnClass, "px-2", layer.flipH && "bg-secondary text-primary font-bold")}
          title="Flip Horizontal"
        >
          <span className="text-sm font-bold">⇄</span>
        </button>
      </AppTooltip>

      <AppTooltip content="Flip vertically">
        <button
          type="button"
          onClick={() => onUpdate({ flipV: !layer.flipV })}
          className={cn(btnClass, "px-2", layer.flipV && "bg-secondary text-primary font-bold")}
          title="Flip Vertical"
        >
          <span className="text-sm font-bold">⇅</span>
        </button>
      </AppTooltip>

      <div className="mx-1 h-5 w-px shrink-0 bg-border/80" />

      {/* 6. Layer Stacking Order */}
      <AppTooltip
        content={
          layer.layer === "behind"
            ? "Currently behind text (click to bring to front)"
            : "Currently in front of text (click to send behind)"
        }
      >
        <button
          type="button"
          onClick={() => onUpdate({ layer: layer.layer === "behind" ? "front" : "behind" })}
          className={cn(btnClass, "gap-1.5 text-xs text-muted-foreground hover:text-foreground")}
        >
          <Layers01Icon size={15} />
          <span>{layer.layer === "behind" ? "Behind Text" : "In Front"}</span>
        </button>
      </AppTooltip>
    </div>
  );
}
