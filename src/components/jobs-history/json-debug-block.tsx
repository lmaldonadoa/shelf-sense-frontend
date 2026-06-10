"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return value;
      }
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export type JsonDebugBlockProps = {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
  maxHeightClassName?: string;
  tone?: "default" | "violet" | "emerald";
  className?: string;
};

export function JsonDebugBlock({
  label,
  value,
  defaultOpen = false,
  maxHeightClassName = "max-h-52",
  tone = "default",
  className,
}: JsonDebugBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const formatted = useMemo(() => formatJsonValue(value), [value]);
  const lineCount = formatted ? formatted.split("\n").length : 0;

  const toneClasses =
    tone === "violet"
      ? "border-violet-400/25 bg-violet-950/20"
      : tone === "emerald"
        ? "border-emerald-400/25 bg-emerald-950/20"
        : "border-white/10 bg-black/25";

  const headerTone =
    tone === "violet"
      ? "border-violet-400/20 bg-violet-500/10 text-violet-100"
      : tone === "emerald"
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
        : "border-white/10 bg-white/5 text-slate-300";

  return (
    <div className={cn("overflow-hidden rounded-lg border", toneClasses, className)}>
      <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-2", headerTone)}>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{label}</span>
          <span className="font-normal normal-case text-slate-500">{lineCount} líneas</span>
        </button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2"
          onClick={() => {
            void navigator.clipboard.writeText(formatted).then(() => toast.success("JSON copiado"));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open ? (
        <pre
          className={cn(
            "overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-slate-100",
            maxHeightClassName,
          )}
        >
          {formatted || "-"}
        </pre>
      ) : null}
    </div>
  );
}