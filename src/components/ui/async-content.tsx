"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, idx) => (
          <Skeleton key={`head-${idx}`} className="h-8 w-full bg-white/10" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={`row-${row}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={`cell-${row}-${col}`} className="h-10 w-full bg-white/8" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={`card-skel-${idx}`} className="rounded-xl border border-white/8 bg-black/20 p-4 space-y-3">
          <Skeleton className="h-4 w-1/3 bg-white/10" />
          <Skeleton className="h-8 w-2/3 bg-white/10" />
          <Skeleton className="h-3 w-full bg-white/8" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-xl border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-5 w-40 bg-white/10" />
      {Array.from({ length: lines }).map((_, idx) => (
        <Skeleton key={`line-${idx}`} className="h-4 w-full bg-white/8" style={{ width: `${88 - idx * 8}%` }} />
      ))}
    </div>
  );
}

export function LoadingPanel({
  message = "Cargando datos…",
  subtitle,
  variant = "panel",
  className,
}: {
  message?: string;
  subtitle?: string;
  variant?: "panel" | "table" | "cards" | "compact";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/5 via-black/20 to-transparent",
        variant === "compact" ? "px-4 py-6" : "p-5 sm:p-6",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-500/10">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{message}</p>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {variant === "table" ? (
        <div className="mt-5">
          <TableSkeleton />
        </div>
      ) : null}
      {variant === "cards" ? (
        <div className="mt-5">
          <CardGridSkeleton />
        </div>
      ) : null}
      {variant === "panel" ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-3 w-full bg-white/8" />
          <Skeleton className="h-3 w-[92%] bg-white/8" />
          <Skeleton className="h-3 w-[78%] bg-white/8" />
        </div>
      ) : null}
    </div>
  );
}

export function AsyncContent({
  loading,
  error,
  empty,
  emptyMessage = "Sin datos para mostrar.",
  emptySubtitle,
  loadingMessage = "Cargando datos…",
  loadingSubtitle,
  loadingVariant = "panel",
  children,
  className,
}: {
  loading?: boolean;
  error?: ReactNode;
  empty?: boolean;
  emptyMessage?: ReactNode;
  emptySubtitle?: ReactNode;
  loadingMessage?: string;
  loadingSubtitle?: string;
  loadingVariant?: "panel" | "table" | "cards" | "compact";
  children: ReactNode;
  className?: string;
}) {
  if (loading) {
    return (
      <LoadingPanel
        message={loadingMessage}
        subtitle={loadingSubtitle}
        variant={loadingVariant}
        className={className}
      />
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100", className)}>
        {error}
      </div>
    );
  }

  if (empty) {
    return (
      <div className={cn("rounded-xl border border-white/10 bg-black/20 px-4 py-8 text-center", className)}>
        <p className="text-sm text-slate-300">{emptyMessage}</p>
        {emptySubtitle ? <p className="mt-2 text-xs text-slate-500">{emptySubtitle}</p> : null}
      </div>
    );
  }

  return <>{children}</>;
}

export function TabLoadingDot({ className }: { className?: string }) {
  return <Loader2 className={cn("h-3 w-3 animate-spin text-cyan-300", className)} aria-hidden="true" />;
}