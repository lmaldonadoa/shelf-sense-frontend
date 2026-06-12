"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  Clock3,
  Gauge,
  Layers3,
  Loader2,
  Rabbit,
  Timer,
  Turtle,
} from "lucide-react";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobMetric, JobMetricsResponse } from "@/types/ocr-api";
import { formatDurationMs, percentOfTotal } from "@/lib/format-duration";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingPanel } from "@/components/ui/async-content";
import { cn } from "@/lib/utils";

type JobMetricsPanelProps = {
  jobId: string;
  isTerminal: boolean;
};

type StepMeta = {
  label: string;
  hint: string;
  tone: "cyan" | "emerald" | "amber" | "violet" | "rose" | "slate";
};

const STEP_META: Record<string, StepMeta> = {
  "detector.primary": { label: "Detector visual", hint: "Localiza etiquetas y regiones en la imagen", tone: "cyan" },
  "ocr.primary": { label: "OCR primario", hint: "Lee texto en crops de promoción", tone: "emerald" },
  "ocr.support": { label: "OCR soporte", hint: "Texto auxiliar de etiquetas de contexto", tone: "emerald" },
  "llm.vision": { label: "Visión LLM", hint: "Estructura promociones desde la imagen", tone: "violet" },
  "semantic_enricher": { label: "Enriquecimiento", hint: "Aliases, RAG y normalización semántica", tone: "amber" },
  "image.total": { label: "Total por imagen", hint: "Tiempo acumulado de toda la imagen", tone: "rose" },
};

const TONE_BAR: Record<StepMeta["tone"], string> = {
  cyan: "bg-cyan-400/85",
  emerald: "bg-emerald-400/85",
  amber: "bg-amber-400/85",
  violet: "bg-violet-400/85",
  rose: "bg-rose-400/85",
  slate: "bg-slate-400/85",
};

function summarizeFromMetrics(metrics: JobMetric[]): JobMetricsResponse["summary_by_step"] {
  const acc = new Map<string, { count: number; total_ms: number; max_ms: number }>();
  for (const metric of metrics) {
    const row = acc.get(metric.step) ?? { count: 0, total_ms: 0, max_ms: 0 };
    row.count += 1;
    row.total_ms += metric.duration_ms;
    row.max_ms = Math.max(row.max_ms, metric.duration_ms);
    acc.set(metric.step, row);
  }
  const output: JobMetricsResponse["summary_by_step"] = {};
  for (const [step, row] of acc.entries()) {
    output[step] = {
      count: row.count,
      total_ms: row.total_ms,
      avg_ms: row.count > 0 ? row.total_ms / row.count : 0,
      max_ms: row.max_ms,
    };
  }
  return output;
}

function computeP95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx] ?? 0;
}

function resolveStepMeta(step: string): StepMeta {
  if (STEP_META[step]) return STEP_META[step];
  const lower = step.toLowerCase();
  if (lower.includes("detector")) return { label: "Detector", hint: "Detección de regiones candidatas", tone: "cyan" };
  if (lower.includes("ocr")) return { label: "OCR", hint: "Extracción de texto", tone: "emerald" };
  if (lower.includes("llm") || lower.includes("vision")) return { label: "Modelo visual", hint: "Inferencia LLM/visión", tone: "violet" };
  if (lower.includes("semantic") || lower.includes("enrich")) return { label: "Semántica", hint: "Enriquecimiento y reglas", tone: "amber" };
  if (lower.includes("total")) return { label: "Total imagen", hint: "Tiempo acumulado por imagen", tone: "rose" };
  return { label: step, hint: "Etapa interna del pipeline", tone: "slate" };
}

function MetricsKpi({
  icon,
  label,
  value,
  hint,
  subvalue,
  tone = "cyan",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  subvalue?: string;
  tone?: "cyan" | "emerald" | "amber" | "violet";
}) {
  const border: Record<string, string> = {
    cyan: "border-cyan-400/20 from-cyan-500/12 to-cyan-950/20",
    emerald: "border-emerald-400/20 from-emerald-500/12 to-emerald-950/20",
    amber: "border-amber-400/20 from-amber-500/12 to-amber-950/20",
    violet: "border-violet-400/20 from-violet-500/12 to-violet-950/20",
  };
  const iconTone: Record<string, string> = {
    cyan: "text-cyan-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
  };

  return (
    <div className={cn("rounded-xl border bg-gradient-to-br p-3.5", border[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 font-heading text-2xl font-semibold tracking-tight text-white">{value}</p>
          {subvalue ? <p className="mt-0.5 font-mono text-[10px] text-slate-500">{subvalue}</p> : null}
        </div>
        <div className={cn("rounded-lg border border-white/10 bg-black/25 p-2", iconTone[tone])}>{icon}</div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}

export function JobMetricsPanel({ jobId, isTerminal }: JobMetricsPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");

  const metricsQuery = useQuery({
    queryKey: ["job-metrics", jobId],
    queryFn: () => ocrApi.getJobMetrics(jobId),
    refetchInterval: isTerminal ? false : 3500,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: false,
  });

  const metrics = useMemo(() => {
    const rows = metricsQuery.data?.metrics ?? [];
    const map = new Map<number, JobMetric>();
    for (const row of rows) {
      if (row.id < 0) continue;
      map.set(row.id, row);
    }
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [metricsQuery.data?.metrics]);

  const summaryByStep = useMemo(() => {
    const source = metricsQuery.data?.summary_by_step ?? {};
    if (Object.keys(source).length) return source;
    return summarizeFromMetrics(metrics);
  }, [metrics, metricsQuery.data?.summary_by_step]);

  const summaryRows = useMemo(
    () =>
      Object.entries(summaryByStep)
        .map(([step, row]) => ({ step, meta: resolveStepMeta(step), ...row }))
        .sort((a, b) => b.total_ms - a.total_ms),
    [summaryByStep],
  );

  const totalPipelineMs = summaryRows.reduce((acc, row) => acc + row.total_ms, 0);
  const totalFormatted = formatDurationMs(totalPipelineMs);
  const slowest = summaryRows[0];
  const fastest = summaryRows.length > 1 ? summaryRows[summaryRows.length - 1] : null;
  const p95 = computeP95(metrics.map((x) => x.duration_ms));
  const p95Formatted = formatDurationMs(p95);
  const maxTotal = Math.max(1, ...summaryRows.map((x) => x.total_ms));

  const filteredMetrics = useMemo(() => {
    return metrics.filter((row) => sourceFilter === "all" || (row.source ?? "unknown") === sourceFilter);
  }, [metrics, sourceFilter]);

  const sourceOptions = useMemo(() => {
    const set = new Set(metrics.map((x) => x.source ?? "unknown"));
    return ["all", ...Array.from(set).sort()];
  }, [metrics]);

  return (
    <Card className="overflow-hidden border-cyan-300/15 bg-gradient-to-br from-slate-950/80 via-[#0a1018] to-cyan-950/20 backdrop-blur">
      <CardHeader className="border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              Rendimiento del pipeline
            </CardTitle>
            <CardDescription className="mt-1 max-w-xl text-sm">
              Cuánto tarda cada etapa. Los tiempos son <span className="text-slate-300">duración real medida</span> en milisegundos y se muestran también en segundos cuando conviene.
            </CardDescription>
          </div>
          {metricsQuery.isFetching ? (
            <Badge variant="outline" className="gap-1 border-cyan-400/25 text-cyan-100">
              <Loader2 className="h-3 w-3 animate-spin" />
              Actualizando
            </Badge>
          ) : isTerminal ? (
            <Badge variant="outline" className="border-white/15 text-slate-400">Job finalizado</Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-emerald-400/25 text-emerald-100">
              <Timer className="h-3 w-3" />
              En vivo
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {metricsQuery.isLoading && !metrics.length ? (
          <LoadingPanel
            message="Midiendo tiempos del pipeline…"
            subtitle="Recopilando duración por etapa en ms y segundos."
            variant="cards"
          />
        ) : null}

        {metricsQuery.error instanceof HttpError ? (
          <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            No se pudieron cargar métricas: {metricsQuery.error.detail}
          </p>
        ) : null}

        {metricsQuery.isLoading && !metrics.length ? null : (
        <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricsKpi
            icon={<Clock3 className="h-4 w-4" />}
            label="Tiempo medido"
            value={totalFormatted.primary}
            subvalue={totalFormatted.secondary || undefined}
            hint="Suma de todas las etapas registradas en este job."
            tone="cyan"
          />
          <MetricsKpi
            icon={<Layers3 className="h-4 w-4" />}
            label="Mediciones"
            value={String(metrics.length)}
            hint="Cantidad de eventos de timing capturados (por imagen, crop o etapa)."
            tone="emerald"
          />
          <MetricsKpi
            icon={<Turtle className="h-4 w-4" />}
            label="Etapa más pesada"
            value={slowest ? formatDurationMs(slowest.avg_ms).primary : "—"}
            subvalue={slowest ? slowest.meta.label : undefined}
            hint={slowest ? `${slowest.meta.hint} · promedio por ejecución` : "Sin datos aún"}
            tone="amber"
          />
          <MetricsKpi
            icon={<Gauge className="h-4 w-4" />}
            label="P95 latencia"
            value={p95Formatted.primary}
            subvalue={p95Formatted.secondary || undefined}
            hint="El 95% de las mediciones fueron más rápidas que este valor."
            tone="violet"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-200">Tiempo por etapa</p>
            {fastest && slowest && fastest.step !== slowest.step ? (
              <p className="text-xs text-slate-500">
                Más rápida: <span className="text-emerald-300">{fastest.meta.label}</span> ({formatDurationMs(fastest.avg_ms).primary})
              </p>
            ) : null}
          </div>

          {!summaryRows.length ? (
            <p className="rounded-lg border border-white/8 bg-black/20 px-3 py-4 text-sm text-slate-500">
              Aún no hay métricas. Aparecerán cuando el pipeline registre tiempos por etapa.
            </p>
          ) : (
            <div className="space-y-3">
              {summaryRows.map((row) => {
                const avg = formatDurationMs(row.avg_ms);
                const total = formatDurationMs(row.total_ms);
                const pct = percentOfTotal(row.total_ms, totalPipelineMs);
                const width = Math.max(4, Math.round((row.total_ms / maxTotal) * 100));
                return (
                  <div key={row.step} className="rounded-xl border border-white/8 bg-black/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-100">{row.meta.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.meta.hint}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-white">{avg.primary}</p>
                        <p className="text-[10px] text-slate-500">promedio · {row.count}×</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={cn("h-full rounded-full transition-all", TONE_BAR[row.meta.tone])}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>Total acumulado: <span className="text-slate-300">{total.primary}</span></span>
                      <span>Participación: <span className="text-slate-300">{pct}%</span></span>
                      <span>Máximo: <span className="text-slate-300">{formatDurationMs(row.max_ms).primary}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
        >
          <span>Detalle técnico por medición</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", showDetails && "rotate-180")} />
        </button>

        {showDetails ? (
          <div className="space-y-3 rounded-xl border border-white/8 bg-black/25 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Origen</span>
              {sourceOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSourceFilter(option)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    sourceFilter === option
                      ? "border-cyan-400/35 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-slate-400 hover:text-slate-200",
                  )}
                >
                  {option === "all" ? "Todos" : option}
                </button>
              ))}
            </div>

            {!filteredMetrics.length ? (
              <p className="text-sm text-slate-500">Sin mediciones para este filtro.</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {filteredMetrics.map((metric) => {
                  const meta = resolveStepMeta(metric.step);
                  const duration = formatDurationMs(metric.duration_ms);
                  return (
                    <div
                      key={`metric-${metric.id}`}
                      className="grid gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 sm:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200">{meta.label}</p>
                        <p className="truncate font-mono text-[10px] text-slate-500">{metric.step}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
                          {metric.source ? <span>origen: {metric.source}</span> : null}
                          {metric.crop ? <span>crop: {metric.crop}</span> : null}
                          {metric.job_image_id ? <span>img #{metric.job_image_id}</span> : null}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-mono text-sm font-semibold text-white">{duration.primary}</p>
                        {duration.secondary ? <p className="font-mono text-[10px] text-slate-500">{duration.secondary}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <p className="flex items-start gap-2 text-xs text-slate-500">
          <Rabbit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-500/80" />
          Usa el total acumulado para ver dónde se va el tiempo; el promedio indica cuánto tarda cada pasada de esa etapa.
        </p>
        </>
        )}
      </CardContent>
    </Card>
  );
}