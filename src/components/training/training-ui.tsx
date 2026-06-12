"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/async-content";
import { Skeleton } from "@/components/ui/skeleton";

export type TrainingTone = "sky" | "violet" | "emerald" | "amber" | "rose" | "cyan";

const TONE_STYLES: Record<
  TrainingTone,
  { section: string; icon: string; badge: string; form: string; kpi: string }
> = {
  sky: {
    section: "border-sky-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-sky-950/40 shadow-lg shadow-sky-950/15",
    icon: "text-sky-300",
    badge: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    form: "border-sky-300/20 bg-sky-500/5",
    kpi: "border-sky-400/20 bg-sky-500/10 text-sky-50",
  },
  violet: {
    section: "border-violet-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-violet-950/40 shadow-lg shadow-violet-950/15",
    icon: "text-violet-300",
    badge: "border-violet-400/30 bg-violet-500/10 text-violet-100",
    form: "border-violet-300/20 bg-violet-500/5",
    kpi: "border-violet-400/20 bg-violet-500/10 text-violet-50",
  },
  emerald: {
    section: "border-emerald-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-emerald-950/40 shadow-lg shadow-emerald-950/15",
    icon: "text-emerald-300",
    badge: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    form: "border-emerald-300/20 bg-emerald-500/5",
    kpi: "border-emerald-400/20 bg-emerald-500/10 text-emerald-50",
  },
  amber: {
    section: "border-amber-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-amber-950/35 shadow-lg shadow-amber-950/15",
    icon: "text-amber-300",
    badge: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    form: "border-amber-300/20 bg-amber-500/5",
    kpi: "border-amber-400/20 bg-amber-500/10 text-amber-50",
  },
  rose: {
    section: "border-rose-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-rose-950/35 shadow-lg shadow-rose-950/15",
    icon: "text-rose-300",
    badge: "border-rose-400/30 bg-rose-500/10 text-rose-100",
    form: "border-rose-300/20 bg-rose-500/5",
    kpi: "border-rose-400/20 bg-rose-500/10 text-rose-50",
  },
  cyan: {
    section: "border-cyan-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-cyan-950/35 shadow-lg shadow-cyan-950/15",
    icon: "text-cyan-300",
    badge: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
    form: "border-cyan-300/20 bg-cyan-500/5",
    kpi: "border-cyan-400/20 bg-cyan-500/10 text-cyan-50",
  },
};

export function TrainingSectionHero({
  icon,
  title,
  description,
  tone = "sky",
  badges,
  kpis,
  footer,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  tone?: TrainingTone;
  badges?: ReactNode;
  kpis?: Array<{ label: string; value: ReactNode; hint?: string }>;
  footer?: ReactNode;
}) {
  const styles = TONE_STYLES[tone];

  return (
    <section className={`overflow-hidden rounded-2xl border ${styles.section}`}>
      <div className="border-b border-white/5 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={styles.icon}>{icon}</span>
              <h2 className="font-heading text-base font-semibold text-white sm:text-lg">{title}</h2>
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-300">{description}</p>
          </div>
          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
        </div>
      </div>

      {kpis && kpis.length > 0 ? (
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5 sm:pb-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className={`rounded-xl border px-3 py-2.5 text-center ${styles.kpi}`}>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">{kpi.label}</p>
              <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{kpi.value}</p>
              {kpi.hint ? <p className="mt-0.5 text-[10px] text-slate-400">{kpi.hint}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {footer ? <div className="border-t border-white/5 px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  );
}

export function TrainingCountBadge({ count, label, tone = "sky" }: { count: number; label: string; tone?: TrainingTone }) {
  return (
    <Badge className={`text-[10px] ${TONE_STYLES[tone].badge}`}>
      {count} {label}
    </Badge>
  );
}

export function TrainingFormCard({
  title,
  tone = "sky",
  children,
  className,
}: {
  title: string;
  tone?: TrainingTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`${TONE_STYLES[tone].form} ${className ?? ""}`}>
      <CardHeader className="gap-1 px-4 py-3 sm:px-5">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}

export function TrainingPanelCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader className="gap-1 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {description ? <CardDescription className="text-[11px]">{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}

export function TrainingListShell({
  loading,
  empty,
  emptyMessage,
  emptySubtitle,
  children,
  scrollable = true,
}: {
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: ReactNode;
  emptySubtitle?: ReactNode;
  children: ReactNode;
  scrollable?: boolean;
}) {
  return (
    <Card className="border-white/10 bg-white/5">
      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="space-y-4 px-4 py-6" role="status" aria-live="polite" aria-busy="true">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              Cargando datos…
            </div>
            <TableSkeleton rows={5} cols={4} />
            <div className="space-y-2">
              <Skeleton className="h-3 w-full bg-white/8" />
              <Skeleton className="h-3 w-[85%] bg-white/8" />
            </div>
          </div>
        ) : empty ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-slate-300">{emptyMessage ?? "Sin registros."}</p>
            {emptySubtitle ? <p className="mt-2 text-xs text-slate-500">{emptySubtitle}</p> : null}
          </div>
        ) : (
          <div className={scrollable ? "max-h-[min(60vh,600px)] overflow-y-auto overflow-x-auto" : undefined}>
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TrainingFooterNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-950/15 px-3 py-2.5 text-[11px] leading-5 text-sky-200/80">
      {children}
    </div>
  );
}

export function TrainingTypePill({
  active,
  label,
  description,
  onClick,
  tone = "emerald",
}: {
  active: boolean;
  label: string;
  description?: string;
  onClick: () => void;
  tone?: TrainingTone;
}) {
  const ring =
    tone === "violet"
      ? "ring-violet-400/40 bg-violet-500/20 text-violet-100"
      : tone === "emerald"
        ? "ring-emerald-400/40 bg-emerald-500/20 text-emerald-100"
        : tone === "amber"
          ? "ring-amber-400/40 bg-amber-500/20 text-amber-100"
          : "ring-sky-400/40 bg-sky-500/20 text-sky-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 ${
        active ? `border-white/20 ring-1 ${ring}` : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30"
      }`}
    >
      <p className="text-xs font-semibold text-slate-100">{label}</p>
      {description ? <p className="mt-1 text-[10px] leading-4 text-slate-400">{description}</p> : null}
    </button>
  );
}