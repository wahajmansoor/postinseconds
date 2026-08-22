import { useEffect, useRef, useState } from "react";
import { Cancel01Icon, Upload01Icon } from "hugeicons-react";
import { Range } from "./ui";

const SIZE = 320;
const OUT = 512;

export function CropDialog({
  open,
  initialSrc,
  onClose,
  onSave,
}: {
  open: boolean;
  initialSrc: string | null;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(initialSrc);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [dragOver, setDragOver] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (open) {
      setSrc(initialSrc);
      setZoom(1);
      setOff({ x: 0, y: 0 });
    }
  }, [open, initialSrc]);

  if (!open) return null;

  const readFile = (file?: File | null) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      setSrc(String(r.result));
      setZoom(1);
      setOff({ x: 0, y: 0 });
    };
    r.readAsDataURL(file);
  };

  const save = () => {
    const img = imgRef.current;
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const base = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    const s = base * zoom * (OUT / SIZE);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    const x = OUT / 2 - w / 2 + off.x * (OUT / SIZE);
    const y = OUT / 2 - h / 2 + off.y * (OUT / SIZE);
    ctx.drawImage(img, x, y, w, h);
    onSave(c.toDataURL("image/png"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Profile image</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Cancel01Icon size={16} />
          </button>
        </div>

        {src ? (
          <>
            <div
              className="relative mx-auto overflow-hidden rounded-full border border-border bg-secondary"
              style={{ width: SIZE, height: SIZE, touchAction: "none", cursor: "grab" }}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setOff({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
              }}
              onPointerUp={() => (drag.current = null)}
            >
              <img
                ref={imgRef}
                src={src}
                alt="Crop preview"
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  transform: `translate(-50%, -50%) translate(${off.x}px, ${off.y}px) scale(${zoom})`,
                  width: SIZE,
                  height: SIZE,
                  objectFit: "cover",
                }}
              />
            </div>
            <div className="mt-4 space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Zoom — {zoom.toFixed(1)}x
              </span>
              <Range value={zoom} min={1} max={3} step={0.1} onChange={setZoom} />
            </div>
          </>
        ) : null}

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            readFile(e.dataTransfer.files?.[0]);
          }}
          className={`mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-xs transition-colors ${
            dragOver ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
          }`}
        >
          <Upload01Icon size={16} />
          Drag & drop an image here, or click to browse
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => readFile(e.target.files?.[0])}
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!src}
            className="rounded-lg bg-[image:var(--gradient-brand)] px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            Save image
          </button>
        </div>
      </div>
    </div>
  );
}
