"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Flame,
  History,
  Layers3,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { ocrApi } from "@/lib/ocrApi";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const HOME_ACCOUNT = "colgate_ecuador";

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function asCompactInt(value: number): string {
  return new Intl.NumberFormat("es-EC", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function asDurationMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function toTitleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function relativeDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
}

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (["completed", "success", "done"].includes(normalized)) return "bg-emerald-500/20 text-emerald-100 border-emerald-400/40";
  if (["failed", "error"].includes(normalized)) return "bg-rose-500/20 text-rose-100 border-rose-400/40";
  if (["running", "queued", "processing"].includes(normalized)) return "bg-amber-500/20 text-amber-100 border-amber-400/40";
  return "bg-slate-500/20 text-slate-100 border-slate-300/40";
}

export function WorkspaceHome() {
  const shelfEnabled = String(process.env.NEXT_PUBLIC_ENABLE_SHELF_MODULE ?? "true").toLowerCase() === "true";
  const recent = useQuery({
    queryKey: ["home-recent-jobs"],
    queryFn: () => ocrApi.listRecentJobs({ accountName: HOME_ACCOUNT, limit: 10 }),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const observability = useQuery({
    queryKey: ["home-observability", HOME_ACCOUNT],
    queryFn: () =>
      ocrApi.getObservabilitySummary({
        account_name: HOME_ACCOUNT,
        limit_jobs: 120,
      }),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  const semanticMetrics = useQuery({
    queryKey: ["home-semantic-metrics", HOME_ACCOUNT],
    queryFn: () => ocrApi.getSemanticKnowledgeMetrics(HOME_ACCOUNT, { limitJobs: 120 }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const benchmark = useQuery({
    queryKey: ["home-benchmark-jobs", HOME_ACCOUNT],
    queryFn: () => ocrApi.listAccountBenchmarkJobs(HOME_ACCOUNT, 8),
    staleTime: 45_000,
    refetchInterval: 90_000,
  });
  const queue = useQuery({
    queryKey: ["home-job-queue", HOME_ACCOUNT],
    queryFn: () => ocrApi.getJobQueueSnapshot({ accountName: HOME_ACCOUNT, nextLimit: 5 }),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const recentRows = useMemo(() => recent.data ?? [], [recent.data]);
  const benchmarkRows = benchmark.data ?? [];

  const stats = useMemo(() => {
    const total = recentRows.length;
    const completed = recentRows.filter((row) => row.status === "completed" || row.status === "partial_success").length;
    const running = recentRows.filter((row) => row.status === "running").length;
    const failed = recentRows.filter((row) => row.status === "failed").length;
    const successRate = total > 0 ? completed / total : 0;
    return { total, completed, running, failed, successRate };
  }, [recentRows]);

  const topLatency = useMemo(() => {
    const rows = observability.data?.latency_by_step ?? [];
    return [...rows].sort((a, b) => b.p95_ms - a.p95_ms).slice(0, 5);
  }, [observability.data?.latency_by_step]);

  const topRules = useMemo(() => {
    const rows = semanticMetrics.data?.rules ?? [];
    return [...rows].sort((a, b) => b.applied - a.applied).slice(0, 5);
  }, [semanticMetrics.data?.rules]);

  return (
    <div className="space-y-6">
      <Card className="border-cyan-300/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-200" />
              Centro Operativo OCR
            </span>
            <Badge className="border-cyan-300/30 bg-cyan-500/10 text-cyan-100">Cuenta: {HOME_ACCOUNT}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Link href="/jobs/new" className="group rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-4 transition hover:-translate-y-0.5 hover:bg-cyan-500/20">
            <p className="font-semibold text-cyan-100">Crear Job</p>
            <p className="mt-1 text-xs text-slate-300">Subir imagenes y ejecutar OCR + Vision.</p>
            <ArrowRight className="mt-3 h-4 w-4 text-cyan-200 transition group-hover:translate-x-1" />
          </Link>
          <Link href="/analytics" className="group rounded-xl border border-lime-300/30 bg-lime-500/10 p-4 transition hover:-translate-y-0.5 hover:bg-lime-500/20">
            <p className="font-semibold text-lime-100">Analytics</p>
            <p className="mt-1 text-xs text-slate-300">Filtrar resultados y exportar Excel.</p>
            <ArrowRight className="mt-3 h-4 w-4 text-lime-200 transition group-hover:translate-x-1" />
          </Link>
          <Link href="/accounts/colgate_ecuador/semantic-review" className="group rounded-xl border border-amber-300/30 bg-amber-500/10 p-4 transition hover:-translate-y-0.5 hover:bg-amber-500/20">
            <p className="font-semibold text-amber-100">Curaduria Semantica</p>
            <p className="mt-1 text-xs text-slate-300">Revisar evidencia y guardar reglas RAG.</p>
            <ArrowRight className="mt-3 h-4 w-4 text-amber-200 transition group-hover:translate-x-1" />
          </Link>
          {shelfEnabled ? (
            <Link href="/accounts/colgate_ecuador/shelf" className="group rounded-xl border border-violet-300/30 bg-violet-500/10 p-4 transition hover:-translate-y-0.5 hover:bg-violet-500/20">
              <p className="font-semibold text-violet-100">Shelf Recognition</p>
              <p className="mt-1 text-xs text-slate-300">Detección por facing, ranking Top-K y curaduría de SKU.</p>
              <ArrowRight className="mt-3 h-4 w-4 text-violet-200 transition group-hover:translate-x-1" />
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/10 bg-white/5">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-slate-400">Exito reciente</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-200">{asPercent(stats.successRate)}</p>
            <p className="mt-1 text-xs text-slate-400">{stats.completed} de {stats.total} jobs</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-slate-400">Jobs corriendo</p>
            <p className="mt-2 text-2xl font-semibold text-amber-200">{stats.running}</p>
            <p className="mt-1 text-xs text-slate-400">Monitoreo en vivo</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-slate-400">Needs review</p>
            <p className="mt-2 text-2xl font-semibold text-cyan-200">{asPercent(observability.data?.summary.needs_review_rate ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-400">Calidad operativa actual</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-slate-400">Reglas observadas</p>
            <p className="mt-2 text-2xl font-semibold text-fuchsia-200">{asCompactInt(semanticMetrics.data?.summary?.rules_observed ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-400">Motor semantico / RAG</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-white/5 xl:col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Estado de Jobs Recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRows.slice(0, 7).map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="grid gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3 transition hover:bg-black/30 sm:grid-cols-[1.4fr_auto_auto] sm:items-start"
              >
                <div className="space-y-1">
                  <span className="font-mono text-xs text-slate-100">{job.id}</span>
                  <p className="text-[11px] text-slate-300">
                    PDV: {job.id_pdv ?? "-"} | Usuario: {job.usuario_relevo ?? "-"} | Subcat: {job.subcategoria ?? "-"}
                  </p>
                  <p className="text-[11px] text-cyan-200">
                    Código único imagen: {job.image_process_code ?? "-"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Clock3 className="h-3.5 w-3.5" />
                  {relativeDate(job.updated_at || job.created_at)}
                </div>
                <Badge className={statusBadgeClass(job.status)}>{toTitleCase(job.status)}</Badge>
              </Link>
            ))}
            {recent.isLoading ? <p className="text-sm text-slate-400">Cargando jobs...</p> : null}
            {!recentRows.length && !recent.isLoading ? <p className="text-sm text-muted-foreground">Sin jobs recientes por ahora.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Salud Operativa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-white/10 bg-black/20 p-2 text-xs text-slate-200">
              Cola OCR: {queue.data ? `${queue.data.queued_count} pendientes | ${queue.data.running_count} ejecutando` : "No disponible"}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">LLM OK rate</span>
                <span className="font-medium text-emerald-200">{asPercent(observability.data?.summary.llm_ok_rate ?? 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, (observability.data?.summary.llm_ok_rate ?? 0) * 100))}%` }} />
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">LLM fallback rate</span>
                <span className="font-medium text-amber-200">{asPercent(observability.data?.summary.llm_fallback_rate ?? 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, Math.max(0, (observability.data?.summary.llm_fallback_rate ?? 0) * 100))}%` }} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/ops" className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm hover:bg-black/30">
                <BarChart3 className="mr-2 inline h-4 w-4" /> Diagnostico backend / ops
              </Link>
              <Link href="/accounts/colgate_ecuador/config" className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm hover:bg-black/30">
                <Bot className="mr-2 inline h-4 w-4" /> Configuracion OCR / Vision LLM
              </Link>
              <Link href="/accounts/colgate_ecuador/preview" className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm hover:bg-black/30">
                <Activity className="mr-2 inline h-4 w-4" /> Preview Realtime
              </Link>
              <Link href="/accounts/colgate_ecuador/masterdata" className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm hover:bg-black/30">
                <Layers3 className="mr-2 inline h-4 w-4" /> Masterdata Catalog
              </Link>
              {shelfEnabled ? (
                <Link href="/accounts/colgate_ecuador/shelf" className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm hover:bg-black/30">
                  <Target className="mr-2 inline h-4 w-4" /> Shelf Recognition
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4" />
              Latencia por etapa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topLatency.map((row) => (
              <div key={row.step}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-300">{toTitleCase(row.step)}</span>
                  <span className="text-slate-400">p95 {asDurationMs(row.p95_ms)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-cyan-400"
                    style={{ width: `${Math.min(100, Math.max(6, (row.p95_ms / Math.max(topLatency[0]?.p95_ms || 1, 1)) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            {!topLatency.length ? <p className="text-xs text-slate-400">Sin datos de latencia todavia.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Reglas RAG mas aplicadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(observability.data?.top_rag_applied_rules ?? []).slice(0, 5).map((rule) => (
              <div key={`${rule.rule}-${rule.count}`} className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="line-clamp-2 text-xs text-slate-200">{rule.rule}</p>
                <p className="mt-1 text-xs text-emerald-300">Aplicada: {rule.count}</p>
              </div>
            ))}
            {!(observability.data?.top_rag_applied_rules?.length) ? <p className="text-xs text-slate-400">Sin reglas aplicadas en la ventana actual.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers3 className="h-4 w-4" />
              Rendimiento semantico
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topRules.map((row) => (
              <div key={row.rule} className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="line-clamp-1 text-xs text-slate-200">{row.rule}</p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                  <span>aplicadas {row.applied}</span>
                  <span>precision {asPercent(row.precision_est)}</span>
                </div>
              </div>
            ))}
            {!topRules.length ? <p className="text-xs text-slate-400">Sin metricas semanticas por ahora.</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-white/5 xl:col-span-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Deriva por cadena / categoria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(observability.data?.drift_chain_category ?? []).slice(0, 6).map((row) => (
              <div key={row.chain_category} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{row.chain_category}</span>
                  <span className="text-slate-400">rows {row.rows}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${Math.min(100, Math.max(0, row.needs_review_rate * 100))}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-fuchsia-200">Needs review: {asPercent(row.needs_review_rate)}</p>
              </div>
            ))}
            {!observability.data?.drift_chain_category?.length ? <p className="text-xs text-slate-400">No hay deriva registrada en el periodo actual.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Alertas y benchmark
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {(observability.data?.alerts ?? []).slice(0, 3).map((alert) => (
                <div key={`${alert.code}-${alert.message}`} className="rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-xs">
                  <p className="font-semibold text-amber-100">{alert.code}</p>
                  <p className="text-amber-50/90">{alert.message}</p>
                </div>
              ))}
              {!(observability.data?.alerts?.length) ? (
                <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-2 text-xs text-emerald-100">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Sin alertas criticas
                </div>
              ) : null}
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-2">
              <p className="text-xs text-slate-300">Benchmarks recientes: <span className="font-semibold text-cyan-200">{benchmarkRows.length}</span></p>
              <p className="mt-1 text-xs text-slate-400">Ultimo estado: {benchmarkRows[0] ? toTitleCase(benchmarkRows[0].status) : "-"}</p>
              <Link href="/accounts/colgate_ecuador/benchmark" className="mt-2 inline-flex items-center text-xs text-cyan-200 hover:text-cyan-100">
                Ver modulo benchmark <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {(recent.isError || observability.isError || semanticMetrics.isError || benchmark.isError || queue.isError) ? (
        <Card className="border-rose-400/30 bg-rose-500/10">
          <CardContent className="pt-4 text-sm text-rose-100">
            Hubo un problema cargando parte del dashboard. Puedes seguir trabajando y reintentar refrescando la pagina.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
