import { forwardRef, useEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Add01Icon, ArrowDown01Icon, MinusSignIcon, Upload01Icon } from "hugeicons-react";
import { cn } from "@/lib/utils";
import { AppTooltip, InfoTooltip } from "@/components/ui/tooltip";
import { loadGoogleFont } from "@/lib/fontLoader";
import { ColorPicker, ColorPickerContent, ColorArea, ColorSlider, ColorSwatch, ColorSwatchPicker } from "@/components/ui/color-picker";

export { AppTooltip, InfoTooltip, ColorPicker, ColorPickerContent, ColorArea, ColorSlider, ColorSwatch, ColorSwatchPicker };

export function Panel({
  title,
  defaultOpen = true,
  collapsible = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section className="rounded-2xl border border-border bg-card/70 p-4 shadow-[var(--shadow-panel)] backdrop-blur">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
        <div className="space-y-4">{children}</div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card/70 shadow-[var(--shadow-panel)] backdrop-blur transition-all">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </span>
        <ArrowDown01Icon
          size={16}
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            open ? "rotate-180 text-foreground" : "text-muted-foreground",
          )}
        />
      </button>
      {open ? <div className="space-y-4 px-4 pb-4 pt-1">{children}</div> : null}
    </section>
  );
}

export function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card/70 shadow-[var(--shadow-panel)] backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-full px-4 py-3"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </span>
        <ArrowDown01Icon
          size={15}
          className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="space-y-4 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {hint ? <InfoTooltip text={hint} /> : null}
      </div>
      {children}
    </div>
  );
}

export function Chip({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/60 hover:text-foreground",
        active && "border-primary bg-primary text-primary-foreground hover:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3"
    >
      {label ? <span className="text-xs font-medium text-foreground">{label}</span> : null}
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-primary-foreground transition-all",
            checked ? "left-[1.15rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: { label: string; value: string | number; category?: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        const val = e.target.value;
        if (typeof val === "string") loadGoogleFont(val);
        onChange(val);
      }}
      className={cn(
        "w-full rounded-xl border border-border bg-input px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-primary",
        className,
      )}
    >
      {options.map((o) => (
        <option
          key={String(o.value)}
          value={o.value}
          style={{ fontFamily: typeof o.value === "string" ? o.value : undefined }}
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorInput({
  value,
  onChange,
  showHex = true,
  showAlpha = false,
  className,
  swatchClassName,
  align = "start",
}: {
  value: string;
  onChange: (v: string) => void;
  showHex?: boolean | undefined;
  showAlpha?: boolean | undefined;
  className?: string | undefined;
  swatchClassName?: string | undefined;
  align?: "start" | "center" | "end" | undefined;
}) {
  return (
    <ColorPicker
      value={value}
      onChange={onChange}
      showHex={showHex}
      showAlpha={showAlpha}
      className={className}
      swatchClassName={swatchClassName}
      align={align}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-full border border-border bg-input px-4 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
        props.className,
      )}
    />
  );
}

export const AreaInput = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  (props, ref) => {
    return (
      <textarea
        ref={ref}
        {...props}
        className={cn(
          "w-full resize-y rounded-2xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary",
          props.className,
        )}
      />
    );
  }
);
AreaInput.displayName = "AreaInput";

export function Range({
  value,
  min = 0,
  max = 100,
  step = 1,
  showInput = true,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  showInput?: boolean;
  onChange: (v: number) => void;
}) {
  // Kept as separate local string state — mirrors the same pattern used for
  // the zoom-percent field in index.tsx — so the user can freely type/clear
  // digits without every keystroke being clamped and re-rendered mid-edit.
  // Only commits (parses + clamps) on blur or Enter, and re-syncs whenever
  // `value` changes some other way (dragging the slider itself, or the
  // underlying state changing externally).
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const commit = () => {
    const n = Number(inputValue);
    if (Number.isFinite(n)) {
      onChange(Math.min(max, Math.max(min, n)));
    } else {
      setInputValue(String(value));
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="editor-range min-w-0 flex-1"
      />
      {showInput ? (
        <div className="flex shrink-0 items-center rounded-xl border border-border/80 bg-secondary/40 p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
            disabled={value <= min}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
            title="Decrease"
          >
            <MinusSignIcon size={12} />
          </button>
          <input
            type="number"
            value={inputValue}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                e.currentTarget.blur();
              }
            }}
            className="w-10 shrink-0 bg-transparent text-center font-mono text-xs font-semibold text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
            disabled={value >= max}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
            title="Increase"
          >
            <Add01Icon size={12} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function UploadButton({
  label,
  onFile,
  onFiles,
  multiple = false,
  description = "or drag and drop images here",
}: {
  label: string;
  /** Fires once per selected file. Used in single-select mode. */
  onFile?: (dataUrl: string) => void;
  /** Fires once with every selected file (in order). Used when `multiple`
   * is set — batching avoids each file's async FileReader callback
   * clobbering the others by writing from the same stale state snapshot. */
  onFiles?: (dataUrls: string[]) => void;
  multiple?: boolean;
  description?: string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCountRef = useRef(0);

  const processFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const readAsDataUrl = (file: File) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
    if (multiple && onFiles) {
      Promise.all(files.map(readAsDataUrl)).then(onFiles);
    } else if (onFile && files[0]) {
      readAsDataUrl(files[0]).then(onFile);
    }
  };

  return (
    <label
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCountRef.current += 1;
        if (e.dataTransfer.types.includes("Files")) {
          setIsDragOver(true);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCountRef.current -= 1;
        if (dragCountRef.current <= 0) {
          setIsDragOver(false);
          dragCountRef.current = 0;
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        dragCountRef.current = 0;
        processFiles(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-all",
        isDragOver
          ? "border-primary bg-primary/15 shadow-[var(--shadow-glow)] scale-[1.02]"
          : "border-border/80 bg-secondary/30 hover:border-primary/50 hover:bg-secondary/60",
      )}
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary shadow-sm">
        <Upload01Icon size={20} />
      </span>
      <div>
        <span className="block text-xs font-bold text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{description}</span>
      </div>
      <input
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files) processFiles(files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
