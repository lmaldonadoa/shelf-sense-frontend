"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ShelfCropLightboxProps = {
  open: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
};

export function ShelfCropLightbox({ open, url, title, onClose }: ShelfCropLightboxProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) setZoom(1);
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(4, value + 0.25));
      if (event.key === "-") setZoom((value) => Math.max(0.5, value - 0.25));
      if (event.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open || !url) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title || "Vista ampliada del crop"}
      onClick={onClose}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm font-medium text-white">{title || "Crop"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} aria-label="Alejar">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[3.5rem] text-center font-mono text-xs text-slate-300">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom((value) => Math.min(4, value + 0.25))} aria-label="Acercar">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom(1)} aria-label="Restablecer zoom">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
          >
            Abrir en pestaña
          </a>
          <Button size="sm" variant="outline" onClick={onClose} aria-label="Cerrar">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        className="flex flex-1 items-center justify-center overflow-auto p-4"
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          setZoom((value) => {
            const next = value + (event.deltaY < 0 ? 0.15 : -0.15);
            return Math.min(4, Math.max(0.5, next));
          });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={title || "crop ampliado"}
          className="max-h-[calc(100vh-6rem)] max-w-full object-contain transition-transform duration-150"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          draggable={false}
        />
      </div>
      <p className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-slate-500">
        Ctrl + rueda para zoom · + / − · 0 restablecer · Esc cerrar
      </p>
    </div>
  );
}