"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type JobDetailViewKey = "overview" | "visual" | "debug_ocr" | "products" | "artifacts";

const VIEW_TABS: Array<{ key: JobDetailViewKey; label: string; shortLabel: string }> = [
  { key: "overview", label: "Resumen", shortLabel: "Resumen" },
  { key: "visual", label: "Visual/OCR", shortLabel: "Visual" },
  { key: "debug_ocr", label: "Debug OCR / Ensemble", shortLabel: "Debug" },
  { key: "products", label: "Productos", shortLabel: "Productos" },
  { key: "artifacts", label: "Artefactos", shortLabel: "Files" },
];

export type JobViewTabsProps = {
  activeView: JobDetailViewKey;
  onViewChange: (view: JobDetailViewKey) => void;
  secondaryActions?: ReactNode;
};

export function JobViewTabs({ activeView, onViewChange, secondaryActions }: JobViewTabsProps) {
  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <div
        className="-mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-0.5 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0"
        role="tablist"
        aria-label="Vistas del job"
      >
        {VIEW_TABS.map((tab) => {
          const isActive = activeView === tab.key;
          return (
            <Button
              key={tab.key}
              size="sm"
              role="tab"
              aria-selected={isActive}
              variant={isActive ? "default" : "outline"}
              className={cn(
                "shrink-0 snap-start",
                isActive ? "ring-1 ring-cyan-300/40" : "border-white/15 bg-black/20",
              )}
              onClick={() => onViewChange(tab.key)}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </Button>
          );
        })}
      </div>
      {secondaryActions ? (
        <div className="flex flex-wrap items-center gap-2">{secondaryActions}</div>
      ) : null}
    </div>
  );
}