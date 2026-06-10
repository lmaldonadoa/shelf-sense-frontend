"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type OcrCompareImagesProps = {
  compareEnabled: boolean;
  originalUrl?: string | null;
  processedUrl?: string | null;
  originalLabel?: string;
  processedLabel?: string;
  originalAlt?: string;
  processedAlt?: string;
  imageClassName?: string;
};

export function OcrCompareImages({
  compareEnabled,
  originalUrl,
  processedUrl,
  originalLabel = "Vista de referencia (original)",
  processedLabel = "Vista usada para OCR",
  originalAlt = "original",
  processedAlt = "processed",
  imageClassName = "h-44",
}: OcrCompareImagesProps) {
  const [mobileView, setMobileView] = useState<"original" | "processed">("original");

  if (!compareEnabled) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-slate-300">{originalLabel}</p>
        {originalUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={originalUrl}
            alt={originalAlt}
            className={cn("w-full rounded-md border border-white/10 object-contain bg-black/30", imageClassName)}
          />
        ) : (
          <div className={cn("flex items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground", imageClassName)}>
            Sin miniatura original
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mb-2 flex gap-2 md:hidden">
        <Button
          size="sm"
          variant={mobileView === "original" ? "default" : "outline"}
          onClick={() => setMobileView("original")}
        >
          Original
        </Button>
        <Button
          size="sm"
          variant={mobileView === "processed" ? "default" : "outline"}
          onClick={() => setMobileView("processed")}
          disabled={!processedUrl}
        >
          OCR usado
        </Button>
      </div>

      <div className="md:grid md:gap-3 lg:grid-cols-2">
        <div className={cn("space-y-2", mobileView !== "original" ? "hidden md:block" : undefined)}>
          <p className="text-xs font-semibold tracking-wide text-slate-300">{originalLabel}</p>
          {originalUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={originalUrl}
              alt={originalAlt}
              className={cn("w-full rounded-md border border-white/10 object-contain bg-black/30", imageClassName)}
            />
          ) : (
            <div className={cn("flex items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground", imageClassName)}>
              Sin miniatura original
            </div>
          )}
        </div>
        <div className={cn("space-y-2", mobileView !== "processed" ? "hidden md:block" : undefined)}>
          <p className="text-xs font-semibold tracking-wide text-slate-300">{processedLabel}</p>
          {processedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={processedUrl}
              alt={processedAlt}
              className={cn("w-full rounded-md border border-cyan-300/30 object-contain bg-black/30", imageClassName)}
            />
          ) : (
            <div className={cn("flex items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground", imageClassName)}>
              No hay artefacto de variante guardado
            </div>
          )}
        </div>
      </div>
    </>
  );
}