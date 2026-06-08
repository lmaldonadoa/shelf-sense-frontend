"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CircleHelp, Clock3, GaugeCircle, Timer } from "lucide-react";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobMetric, JobMetricsResponse } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type JobMetricsPanelProps = {
  jobId: string;
  isTerminal: boolean;
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

function formatMs(value: number): string {
  return `${Math.round(value).toLocaleString()} ms`;
}

function humanStep(step: string): string {
  return step === "llm.vision" ? "Vision LLM" : step;
}

function describeStep(step: string): string {
  const s = step.toLowerCase();
  if (s.includes("detector")) return "Deteccion visual de objetos/regiones candidatas.";
  if (s.includes("ocr")) return "Extraccion OCR del texto desde imagen o recortes.";
  if (s.includes("llm.vision")) return "LLM visual para estructurar o validar promociones.";
  if (s.includes("semantic_enricher")) return "Normalizacion y enriquecimiento semantico con aliases y RAG.";
  if (s.includes("image.total")) return "Tiempo total acumulado por imagen.";
  return "Etapa interna del pipeline.";
}

export function JobMetricsPanel({ jobId, isTerminal: _isTerminal }: JobMetricsPanelProps) {
  const [sourceFilter, setSourceFilter] = useState("all");
  const [stepFilter, setStepFilter] = useState("");

  const metricsQuery = useQuery({
    queryKey: ["job-metrics", jobId],
    queryFn: () => ocrApi.getJobMetrics(jobId),
    refetchInterval: _isTerminal ? false : 3500,
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
        .map(([step, row]) => ({ step, ...row }))
        .sort((a, b) => b.avg_ms - a.avg_ms),
    [summaryByStep],
  );

  const totalStages = metrics.length;
  const totalMs = summaryRows.reduce((acc, row) => acc + row.total_ms, 0);
  const slowest = summaryRows[0];
  const p95 = computeP95(metrics.map((x) => x.duration_ms));
  const maxAvg = Math.max(1, ...summaryRows.map((x) => x.avg_ms));

  const filteredMetrics = useMemo(() => {
    return metrics.filter((row) => {
      const bySource = sourceFilter === "all" || (row.source ?? "unknown") === sourceFilter;
      const byStep = !stepFilter.trim() || row.step.toLowerCase().includes(stepFilter.toLowerCase());
      return bySource && byStep;
    });
  }, [metrics, sourceFilter, stepFilter]);

  const stepOptions = useMemo(() => Array.from(new Set(metrics.map((x) => x.step))).sort((a, b) => a.localeCompare(b)), [metrics]);

  const technicalStageGuide = useMemo(() => {
    const seen = new Set<string>();
    const rows = [...summaryRows.map((x) => x.step), ...metrics.map((x) => x.step)];
    return rows
      .filter((step) => {
        if (seen.has(step)) return false;
        seen.add(step);
        return true;
      })
      .map((step) => ({ step, description: describeStep(step) }));
  }, [metrics, summaryRows]);

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-200" />
          Metricas por etapa del pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {metricsQuery.error instanceof HttpError ? (
          <p className="text-sm text-amber-300">No se pudieron cargar metricas: {metricsQuery.error.detail}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 to-cyan-700/5 p-3">
            <p className="text-xs text-muted-foreground">Etapas ejecutadas</p>
            <p className="mt-1 text-xl font-semibold">{totalStages}</p>
          </div>
          <div className="rounded-xl border border-emerald-300/20 bg-gradient-to-br from-emerald-500/10 to-emerald-700/5 p-3">
            <p className="text-xs text-muted-foreground">Tiempo acumulado</p>
            <p className="mt-1 text-xl font-semibold">{formatMs(totalMs)}</p>
          </div>
          <div className="rounded-xl border border-amber-300/20 bg-gradient-to-br from-amber-500/10 to-amber-700/5 p-3">
            <p className="text-xs text-muted-foreground">Etapa mas lenta (avg)</p>
            <p className="mt-1 text-sm font-semibold">{slowest ? `${slowest.step} - ${formatMs(slowest.avg_ms)}` : "-"}</p>
          </div>
          <div className="rounded-xl border border-violet-300/20 bg-gradient-to-br from-violet-500/10 to-violet-700/5 p-3">
            <p className="text-xs text-muted-foreground">P95 aproximado</p>
            <p className="mt-1 text-xl font-semibold">{formatMs(p95)}</p>
          </div>
        </div>

        <details className="rounded-xl border border-white/10 bg-black/20 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-100">
            <CircleHelp className="h-4 w-4 text-cyan-200" />
            Detalles tecnicos por etapa
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {technicalStageGuide.length ? (
              technicalStageGuide.map((item) => (
                <div key={`stage-guide-${item.step}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <p className="text-xs font-medium text-slate-100">{humanStep(item.step)}</p>
                  <p className="mt-1 text-xs text-slate-300">{item.description}</p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-300">Sin etapas registradas todavia.</p>
            )}
          </div>
        </details>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-slate-300">Cuellos de botella por avg_ms</p>
          {!summaryRows.length ? (
            <p className="text-sm text-muted-foreground">Sin metricas todavia.</p>
          ) : (
            <div className="space-y-2">
              {summaryRows.map((row) => {
                const width = Math.max(5, Math.round((row.avg_ms / maxAvg) * 100));
                return (
                  <div key={row.step} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-slate-100">{humanStep(row.step)}</span>
                      <span className="text-slate-300">{formatMs(row.avg_ms)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-cyan-400/80" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Filtro source</label>
              <select
                className="h-9 rounded-md border border-white/10 bg-slate-900 px-2 text-sm"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                <option value="all">all</option>
                <option value="primary">primary</option>
                <option value="support">support</option>
                <option value="unknown">unknown</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Filtro step</label>
              <input
                className="h-9 rounded-md border border-white/10 bg-slate-900 px-2 text-sm"
                list="step-options"
                value={stepFilter}
                onChange={(event) => setStepFilter(event.target.value)}
                placeholder="detector.primary"
              />
              <datalist id="step-options">
                {stepOptions.map((step) => (
                  <option value={step} key={`step-option-${step}`} />
                ))}
              </datalist>
            </div>
            <div className="text-xs text-muted-foreground">
              {metricsQuery.isFetching ? <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> Actualizando...</span> : null}
            </div>
          </div>

          {!filteredMetrics.length ? (
            <p className="text-sm text-muted-foreground">Sin metricas para el filtro actual.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>step</TableHead>
                    <TableHead>source</TableHead>
                    <TableHead>duration_ms</TableHead>
                    <TableHead>crop</TableHead>
                    <TableHead>created_at</TableHead>
                    <TableHead>image_id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMetrics.map((metric) => (
                    <TableRow key={`metric-${metric.id}`}>
                      <TableCell className="max-w-52 truncate" title={describeStep(metric.step)}>
                        <span className="inline-flex items-center gap-1">
                          {humanStep(metric.step)}
                          <CircleHelp className="h-3.5 w-3.5 text-slate-400" />
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{metric.source ?? "unknown"}</Badge>
                      </TableCell>
                      <TableCell>{metric.duration_ms}</TableCell>
                      <TableCell className="max-w-40 truncate">{metric.crop ?? "-"}</TableCell>
                      <TableCell>{new Date(metric.created_at).toLocaleString()}</TableCell>
                      <TableCell>{metric.job_image_id ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
          <p className="inline-flex items-center gap-2"><GaugeCircle className="h-3.5 w-3.5" /> Usa este panel para identificar cuellos de botella reales en detector, OCR, LLM y enricher semantico.</p>
          <p className="mt-1 inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" /> Se refresca automaticamente mientras el job esta en ejecucion.</p>
        </div>
      </CardContent>
    </Card>
  );
}
