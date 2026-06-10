"use client";

import { ChevronLeft, ChevronRight, ImageIcon, ScrollText } from "lucide-react";
import type { JobImage } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type JobImageContextBarProps = {
  images: JobImage[];
  selectedImage: JobImage | null;
  onSelectImage: (image: JobImage) => void;
  annotatedUrl?: string | null;
  onOpenMdReport?: () => void;
  showMdReport?: boolean;
  className?: string;
};

function imageLabel(image: JobImage): string {
  return image.original_name ?? image.image_name ?? `Imagen ${image.id}`;
}

function needsReview(image: JobImage): boolean {
  return image.processing_status === "needs_review" || image.status === "needs_review";
}

export function JobImageContextBar({
  images,
  selectedImage,
  onSelectImage,
  annotatedUrl,
  onOpenMdReport,
  showMdReport = false,
  className,
}: JobImageContextBarProps) {
  if (!images.length) {
    return (
      <div
        className={cn(
          "rounded-lg border border-white/10 bg-slate-950/90 px-3 py-3 text-sm text-muted-foreground backdrop-blur",
          className,
        )}
      >
        Sin imágenes en este job.
      </div>
    );
  }

  const currentIndex = selectedImage
    ? images.findIndex((image) => image.id === selectedImage.id)
    : -1;
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const current = selectedImage ?? images[0];

  const goTo = (direction: -1 | 1) => {
    const nextIndex = (safeIndex + direction + images.length) % images.length;
    onSelectImage(images[nextIndex]);
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-20 rounded-lg border border-cyan-300/20 bg-slate-950/95 px-3 py-3 shadow-lg shadow-black/20 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => goTo(-1)}
              disabled={images.length <= 1}
              aria-label="Imagen anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => goTo(1)}
              disabled={images.length <= 1}
              aria-label="Imagen siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ImageIcon className="h-4 w-4 shrink-0 text-cyan-300" />
              <p className="truncate text-sm font-semibold text-white" title={imageLabel(current)}>
                {imageLabel(current)}
              </p>
              <span className="shrink-0 text-xs text-slate-400">
                {safeIndex + 1} / {images.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px]">
                {current.status}
              </Badge>
              {current.processing_status ? (
                <Badge variant="secondary" className="text-[10px]">
                  {current.processing_status}
                </Badge>
              ) : null}
              {needsReview(current) ? (
                <Badge variant="destructive" className="text-[10px]">
                  needs_review
                </Badge>
              ) : null}
              {typeof current.detections?.length === "number" ? (
                <Badge variant="outline" className="text-[10px]">
                  {current.detections.length} promos
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="job-image-select">
            Seleccionar imagen
          </label>
          <select
            id="job-image-select"
            value={current.id}
            onChange={(event) => {
              const next = images.find((image) => image.id === Number(event.target.value));
              if (next) onSelectImage(next);
            }}
            className="h-9 w-full min-w-0 rounded-md border border-white/15 bg-black/40 px-2 text-sm text-slate-100 sm:max-w-xs"
          >
            {images.map((image, index) => (
              <option key={`job-image-opt-${image.id}`} value={image.id}>
                {index + 1}. {imageLabel(image)}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2">
            {annotatedUrl ? (
              <a href={annotatedUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  Ver anotada
                </Button>
              </a>
            ) : null}
            {showMdReport && onOpenMdReport ? (
              <Button
                size="sm"
                className="border-cyan-400/40 bg-cyan-600 hover:bg-cyan-500"
                onClick={onOpenMdReport}
              >
                <ScrollText className="mr-2 h-4 w-4" />
                Reporte .md
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}