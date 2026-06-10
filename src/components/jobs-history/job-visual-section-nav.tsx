"use client";

import { cn } from "@/lib/utils";

export const VISUAL_SECTIONS = [
  { id: "job-visual-chain", label: "Cadena" },
  { id: "job-visual-detection", label: "Detección" },
  { id: "job-visual-primary-debug", label: "Primary debug" },
  { id: "job-visual-ocr-ab", label: "OCR A/B" },
  { id: "job-visual-primary-crops", label: "Recortes" },
  { id: "job-visual-support-memory", label: "Memoria" },
  { id: "job-visual-md-report", label: "Reporte" },
  { id: "job-visual-trace", label: "Traza LLM" },
] as const;

export type JobVisualSectionNavProps = {
  className?: string;
};

export function JobVisualSectionNav({ className }: JobVisualSectionNavProps) {
  return (
    <nav
      className={cn(
        "sticky top-[4.75rem] z-10 -mx-1 flex gap-1.5 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/90 px-2 py-2 backdrop-blur",
        className,
      )}
      aria-label="Secciones Visual/OCR"
    >
      {VISUAL_SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="shrink-0 snap-start rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-cyan-100"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}