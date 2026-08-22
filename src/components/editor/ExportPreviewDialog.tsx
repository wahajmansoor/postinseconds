import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download01Icon, ReloadIcon } from "hugeicons-react";
import type { EditorState } from "./types";

interface ExportPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  previewUrl: string | null;
  s: EditorState;
  onConfirm: () => void;
  isExporting?: boolean;
}

export function ExportPreviewDialog({
  open,
  onClose,
  previewUrl,
  s,
  onConfirm,
  isExporting = false,
}: ExportPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !isExporting && onClose()}>
      <DialogContent
        onPointerDownOutside={(e) => isExporting && e.preventDefault()}
        onInteractOutside={(e) => isExporting && e.preventDefault()}
        className="rounded-2xl border border-border bg-background p-6 shadow-2xl backdrop-blur-xl sm:max-w-[560px]"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">Export Preview</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {s.width * s.exportScale} × {s.height * s.exportScale}px · {s.exportFormat.toUpperCase()} ({s.exportScale}x resolution)
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex min-h-[220px] max-h-[60vh] items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-muted/40 p-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Export preview"
              className="max-h-[55vh] w-auto max-w-full rounded-lg object-contain shadow-md"
            />
          ) : (
            <div className="flex flex-col items-center gap-2.5 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <ReloadIcon size={18} className="animate-spin text-primary" />
              </span>
              <p className="text-xs font-medium text-foreground">Generating instant preview…</p>
              <p className="text-[11px] text-muted-foreground">Preparing your canvas layout</p>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border/80 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!previewUrl || isExporting}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <ReloadIcon size={14} className="animate-spin" />
                <span>Preparing High-Res...</span>
              </>
            ) : (
              <>
                <Download01Icon size={14} />
                <span>Download {s.exportFormat.toUpperCase()}</span>
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
