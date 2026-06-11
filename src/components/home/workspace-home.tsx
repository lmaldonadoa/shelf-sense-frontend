"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Flame,
  GraduationCap,
  History,
  Layers3,
  LineChart,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Video,
  Wifi,
  Zap,
} from "lucide-react";
import { ocrApi } from "@/lib/ocrApi";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HOME_ACCOUNT = "colgate_ecuador";
const QUEUE_POLL_MS = 4_000;
const RECENT_POLL_ACTIVE_MS = 5_000;
const RECENT_POLL_IDLE_MS = 45_000;

function isActiveJobStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return ["running", "queued", "processing"].includes(normalized);
}

function isPreviewActiveStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return ["running", "paused"].includes(normalized);
}

function isBenchmarkTerminalStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return ["completed", "success", "partial_success", "done", "failed", "error"].includes(normalized);
}

function readMetricNumber(source: Record<string, unknown> | undefined | null, key: string): number | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function previewSourceLabel(source: Record<string, unknown>): string {
  const type = String(source.type ?? "source");
  if (type === "video_file") return "Video";
  if (type === "rtsp") return "RTSP";
  if (type === "webcam") return "Webcam";
  return toTitleCase(type);
}

function healthLabel(payload?: Record<string, unknown>): string {
  if (!payload) return "Desconocido";
  const status = String(payload.status ?? payload.health ?? "ok").toLowerCase();
  if (["ok", "healthy", "up"].includes(status)) return "OK";
  if (["degraded", "warn", "warning"].includes(status)) return "Degradado";
  if (["down", "error", "failed"].includes(status)) return "Caído";
  return toTitleCase(status);
}

function healthTone(payload?: Record<string, unknown>): string {
  const label = healthLabel(payload);
  if (label === "OK") return "text-emerald-200";
  if (label === "Degradado") return "text-amber-200";
  return "text-rose-200";
}

async function fetchWhatsappEventSummary(accountName: string): Promise<{ pending: number; failed: number; recent: number }> {
  const qs = new URLSearchParams({ account_name: accountName, limit: "40" });
  const res = await fetch(`/admin/ocr/inbound/whatsapp/events?${qs.toString()}`, { method: "GET", cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "WhatsApp no disponible");
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.events)
      ? body.events
      : Array.isArray(body?.items)
        ? body.items
        : [];
  let pending = 0;
  let failed = 0;
  for (const row of rows) {
    const status = String((row as { process_status?: string }).process_status ?? "").toLowerCase();
    if (["pending", "received", "queued", "new"].includes(status)) pending += 1;
    if (["failed", "error"].includes(status)) failed += 1;
  }
  return { pending, failed, recent: rows.length };
}

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
  if (["completed", "success", "done", "partial_success"].includes(normalized)) return "bg-emerald-500/20 text-emerald-100 border-emerald-400/40";
  if (["failed", "error"].includes(normalized)) return "bg-rose-500/20 text-rose-100 border-rose-400/40";
  if (["running", "queued", "processing"].includes(normalized)) return "bg-amber-500/20 text-amber-100 border-amber-400/40";
  return "bg-slate-500/20 text-slate-100 border-slate-300/40";
}

function jobProgressRatio(job: { processed_images?: number; total_images?: number }): number {
  const total = Number(job.total_images ?? 0);
  const processed = Number(job.processed_images ?? 0);
  if (!total) return 0;
  return Math.min(1, Math.max(0, processed / total));
}

type KpiCardProps = {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accent: string;
  bar?: number;
  barClass?: string;
  loading?: boolean;
};

function SkeletonBar({ className = "h-8 w-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-700/60 ${className}`} />;
}

function KpiCard({ label, value, hint, icon, accent, bar, barClass = "bg-cyan-400", loading }: KpiCardProps) {
  return (
    <Card className={`border-white/10 bg-gradient-to-br ${accent} to-black/20`}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
            {loading ? (
              <div className="mt-2 space-y-2">
                <SkeletonBar className="h-8 w-28" />
                <SkeletonBar className="h-3 w-36" />
              </div>
            ) : (
              <>
                <p className="mt-2 font-heading text-2xl font-semibold text-slate-50">{value}</p>
                <p className="mt-1 text-xs text-slate-400">{hint}</p>
              </>
            )}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-slate-200">{icon}</div>
        </div>
        {typeof bar === "number" ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusMixChart({ completed, running, failed, other }: { completed: number; running: number; failed: number; other: number }) {
  const total = completed + running + failed + other;
  if (!total) {
    return <p className="text-xs text-slate-400">Sin jobs en la ventana reciente.</p>;
  }
  const segments = [
    { key: "completed", value: completed, color: "#34d399", label: "Completados" },
    { key: "running", value: running, color: "#fbbf24", label: "En curso" },
    { key: "failed", value: failed, color: "#fb7185", label: "Fallidos" },
    { key: "other", value: other, color: "#94a3b8", label: "Otros" },
  ].filter((s) => s.value > 0);

  let cursor = 0;
  const gradient = segments
    .map((segment) => {
      const pct = (segment.value / total) * 100;
      const start = cursor;
      cursor += pct;
      return `${segment.color} ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className="mx-auto h-28 w-28 shrink-0 rounded-full border border-white/10 shadow-inner sm:mx-0"
        style={{ background: `conic-gradient(${gradient})` }}
        aria-hidden
      >
        <div className="m-auto flex h-full w-full items-center justify-center p-5">
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950/95 text-center">
            <p className="font-heading text-lg font-semibold text-slate-100">{total}</p>
            <p className="text-[10px] text-slate-400">jobs</p>
          </div>
        </div>
      </div>
      <div className="grid flex-1 gap-2">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="text-slate-300">{segment.label}</span>
            </div>
            <span className="font-mono text-slate-400">{segment.value} · {asPercent(segment.value / total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobActivityStrip({ jobs }: { jobs: Array<{ id: string; status: string }> }) {
  if (!jobs.length) return <p className="text-xs text-slate-400">Sin actividad reciente.</p>;
  const tone = (status: string) => {
    const s = status.toLowerCase();
    if (["completed", "partial_success"].includes(s)) return "bg-emerald-400";
    if (["failed", "error"].includes(s)) return "bg-rose-400";
    if (["running", "processing"].includes(s)) return "bg-amber-400";
    if (s === "queued") return "bg-slate-400";
    return "bg-slate-500";
  };
  return (
    <div className="space-y-2">
      <div className="flex h-8 gap-1 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-1">
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            title={`${job.id} · ${toTitleCase(job.status)}`}
            className={`min-w-[6px] flex-1 rounded-sm transition hover:opacity-80 ${tone(job.status)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> OK</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> En curso</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Fallido</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> Cola</span>
      </div>
    </div>
  );
}

type ModuleTileProps = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  accent: string;
  loading?: boolean;
  metrics: Array<{ label: string; value: string; tone?: string }>;
  footer?: ReactNode;
};

function ModuleTile({ title, description, href, icon, accent, loading, metrics, footer }: ModuleTileProps) {
  return (
    <div className={`rounded-xl border border-white/10 bg-gradient-to-br ${accent} to-black/20 p-4`}>
      <Link href={href} className="group block transition hover:opacity-95">
        <div className="flex items-start justify-between gap-2">
          <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-slate-200">{icon}</div>
          <ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
        </div>
        <p className="mt-3 font-semibold text-slate-100">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </Link>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={`sk-${index}`} className="rounded-md border border-white/10 bg-black/20 px-2 py-2">
                <SkeletonBar className="mb-1 h-3 w-16" />
                <SkeletonBar className="h-5 w-10" />
              </div>
            ))
          : metrics.map((metric) => (
              <div key={`${title}-${metric.label}`} className="rounded-md border border-white/10 bg-black/20 px-2 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{metric.label}</p>
                <p className={`mt-0.5 font-heading text-lg font-semibold ${metric.tone ?? "text-slate-100"}`}>{metric.value}</p>
              </div>
            ))}
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}

export function WorkspaceHome() {
  const queryClient = useQueryClient();
  const shelfEnabled = String(process.env.NEXT_PUBLIC_ENABLE_SHELF_MODULE ?? "true").toLowerCase() === "true";
  const recent = useQuery({
    queryKey: ["home-recent-jobs", HOME_ACCOUNT],
    queryFn: () => ocrApi.listRecentJobs({ accountName: HOME_ACCOUNT, limit: 10 }),
    staleTime: 4_000,
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const hasActive = rows.some((row) => isActiveJobStatus(row.status));
      return hasActive ? RECENT_POLL_ACTIVE_MS : RECENT_POLL_IDLE_MS;
    },
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
    staleTime: 8_000,
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const hasActive = rows.some((row) => !isBenchmarkTerminalStatus(row.status));
      return hasActive ? 8_000 : 90_000;
    },
    retry: false,
  });

  const previewSessions = useQuery({
    queryKey: ["home-preview-sessions"],
    queryFn: () => ocrApi.listPreviewSessions(40),
    staleTime: 3_000,
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []).filter((session) => session.account_name === HOME_ACCOUNT);
      const hasActive = rows.some((session) => isPreviewActiveStatus(session.status));
      return hasActive ? 5_000 : 15_000;
    },
    retry: false,
  });

  const benchmarkAiEffectiveness = useQuery({
    queryKey: ["home-benchmark-ai-effectiveness", HOME_ACCOUNT],
    queryFn: () => ocrApi.getBenchmarkAiEffectiveness(HOME_ACCOUNT, 50),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });
  const queue = useQuery({
    queryKey: ["home-job-queue", HOME_ACCOUNT],
    queryFn: () => ocrApi.getJobQueueSnapshot({ accountName: HOME_ACCOUNT, nextLimit: 5 }),
    staleTime: 2_000,
    refetchInterval: (query) => {
      const pollSec = query.state.data?.poll_sec;
      if (typeof pollSec === "number" && pollSec > 0) return Math.max(QUEUE_POLL_MS, pollSec * 1000);
      return QUEUE_POLL_MS;
    },
    retry: false,
  });

  const health = useQuery({
    queryKey: ["home-health"],
    queryFn: () => ocrApi.getHealth(),
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const masterdataImports = useQuery({
    queryKey: ["home-masterdata-imports", HOME_ACCOUNT],
    queryFn: () => ocrApi.listMasterdataImports(HOME_ACCOUNT, 5),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });

  const trainingCases = useQuery({
    queryKey: ["home-training-cases", HOME_ACCOUNT],
    queryFn: () => ocrApi.listSemanticLearningCases(HOME_ACCOUNT, { limit: 80 }),
    staleTime: 45_000,
    refetchInterval: 90_000,
    retry: false,
  });

  const shelfReviewQueue = useQuery({
    queryKey: ["home-shelf-review-queue", HOME_ACCOUNT],
    queryFn: () => ocrApi.listShelfReviewQueue(HOME_ACCOUNT, "pending"),
    enabled: shelfEnabled,
    staleTime: 4_000,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? QUEUE_POLL_MS : 12_000),
    retry: false,
  });

  const shelfDataset = useQuery({
    queryKey: ["home-shelf-dataset", HOME_ACCOUNT],
    queryFn: () => ocrApi.getShelfDatasetSummary(HOME_ACCOUNT),
    enabled: shelfEnabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });

  const shelfSkuCategories = useQuery({
    queryKey: ["home-shelf-sku-categories", HOME_ACCOUNT],
    queryFn: () => ocrApi.listShelfSkuCategories(HOME_ACCOUNT),
    enabled: shelfEnabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });

  const shelfJobs = useQuery({
    queryKey: ["home-shelf-jobs", HOME_ACCOUNT],
    queryFn: () => ocrApi.listShelfJobs(HOME_ACCOUNT, 8),
    enabled: shelfEnabled,
    staleTime: 4_000,
    refetchInterval: (query) => {
      const rows = query.state.data ?? [];
      const hasActive = rows.some((row) => isActiveJobStatus(row.status));
      return hasActive ? RECENT_POLL_ACTIVE_MS : 60_000;
    },
    retry: false,
  });

  const whatsappSummary = useQuery({
    queryKey: ["home-whatsapp-summary", HOME_ACCOUNT],
    queryFn: () => fetchWhatsappEventSummary(HOME_ACCOUNT),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const recentRows = useMemo(() => recent.data ?? [], [recent.data]);
  const benchmarkRows = benchmark.data ?? [];

  const latestBenchmark = useMemo(() => {
    const completed = benchmarkRows.find((row) => ["completed", "success", "partial_success"].includes(row.status.toLowerCase()));
    return completed ?? benchmarkRows[0] ?? null;
  }, [benchmarkRows]);

  const latestBenchmarkReport = useQuery({
    queryKey: ["home-benchmark-report", latestBenchmark?.benchmark_id],
    queryFn: () => ocrApi.getBenchmarkReport(latestBenchmark!.benchmark_id),
    enabled: Boolean(latestBenchmark?.benchmark_id) && isBenchmarkTerminalStatus(latestBenchmark?.status ?? ""),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: false,
  });

  const accountPreviewSessions = useMemo(
    () => (previewSessions.data ?? []).filter((session) => session.account_name === HOME_ACCOUNT),
    [previewSessions.data],
  );

  const activePreviewSessions = useMemo(
    () => accountPreviewSessions.filter((session) => isPreviewActiveStatus(session.status)),
    [accountPreviewSessions],
  );

  const benchmarkMetrics = useMemo(() => {
    const metrics = latestBenchmarkReport.data?.metrics;
    return metrics && typeof metrics === "object" ? (metrics as Record<string, unknown>) : null;
  }, [latestBenchmarkReport.data?.metrics]);

  const runningBenchmark = useMemo(
    () => benchmarkRows.find((row) => !isBenchmarkTerminalStatus(row.status)) ?? null,
    [benchmarkRows],
  );

  const stats = useMemo(() => {
    const total = recentRows.length;
    const completed = recentRows.filter((row) => row.status === "completed" || row.status === "partial_success").length;
    const running = recentRows.filter((row) => row.status === "running").length;
    const failed = recentRows.filter((row) => row.status === "failed").length;
    const queued = recentRows.filter((row) => row.status === "queued").length;
    const other = Math.max(0, total - completed - running - failed - queued);
    const successRate = total > 0 ? completed / total : 0;
    const imagesProcessed = recentRows.reduce((sum, row) => sum + Number(row.processed_images ?? 0), 0);
    const imagesTotal = recentRows.reduce((sum, row) => sum + Number(row.total_images ?? 0), 0);
    return { total, completed, running, failed, queued, other, successRate, imagesProcessed, imagesTotal };
  }, [recentRows]);

  const activityJobs = useMemo(
    () => recentRows.slice(0, 10).map((job) => ({ id: job.id, status: job.status })),
    [recentRows],
  );

  const trainingOpenCount = useMemo(() => {
    const items = trainingCases.data?.items ?? [];
    return items.filter((item) => ["open", "in_review"].includes(String(item.status ?? "").toLowerCase())).length;
  }, [trainingCases.data?.items]);

  const shelfActiveSkuCount = useMemo(() => {
    return (shelfSkuCategories.data ?? []).reduce((sum, row) => sum + Number(row.count_active ?? 0), 0);
  }, [shelfSkuCategories.data]);

  const shelfRunningJob = useMemo(() => {
    return (shelfJobs.data ?? []).find((job) => isActiveJobStatus(job.status)) ?? null;
  }, [shelfJobs.data]);

  const shelfDatasetImages = useMemo(() => {
    const summary = shelfDataset.data?.summary ?? shelfDataset.data?.totals;
    return Number(summary?.indexable_images ?? summary?.images ?? summary?.total_images ?? 0);
  }, [shelfDataset.data]);

  const lastMasterdataImport = masterdataImports.data?.[0] ?? null;

  const topBlockedRules = useMemo(() => {
    return (observability.data?.top_rag_blocked_rules ?? []).slice(0, 2);
  }, [observability.data?.top_rag_blocked_rules]);

  const queueLive = (queue.data?.running_count ?? 0) > 0 || (queue.data?.queued_count ?? 0) > 0;

  const lastUpdatedLabel = useMemo(() => {
    const stamps = [recent.dataUpdatedAt, observability.dataUpdatedAt, queue.dataUpdatedAt, health.dataUpdatedAt].filter(Boolean);
    if (!stamps.length) return null;
    return relativeDate(new Date(Math.max(...stamps)).toISOString());
  }, [recent.dataUpdatedAt, observability.dataUpdatedAt, queue.dataUpdatedAt, health.dataUpdatedAt]);

  const refreshDashboard = () => {
    void queryClient.invalidateQueries({ queryKey: ["home-recent-jobs", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-observability", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-semantic-metrics", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-benchmark-jobs", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-benchmark-report", latestBenchmark?.benchmark_id] });
    void queryClient.invalidateQueries({ queryKey: ["home-benchmark-ai-effectiveness", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-preview-sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["home-job-queue", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-health"] });
    void queryClient.invalidateQueries({ queryKey: ["home-masterdata-imports", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-training-cases", HOME_ACCOUNT] });
    void queryClient.invalidateQueries({ queryKey: ["home-whatsapp-summary", HOME_ACCOUNT] });
    if (shelfEnabled) {
      void queryClient.invalidateQueries({ queryKey: ["home-shelf-review-queue", HOME_ACCOUNT] });
      void queryClient.invalidateQueries({ queryKey: ["home-shelf-dataset", HOME_ACCOUNT] });
      void queryClient.invalidateQueries({ queryKey: ["home-shelf-sku-categories", HOME_ACCOUNT] });
      void queryClient.invalidateQueries({ queryKey: ["home-shelf-jobs", HOME_ACCOUNT] });
    }
  };

  const topLatency = useMemo(() => {
    const rows = observability.data?.latency_by_step ?? [];
    return [...rows].sort((a, b) => b.p95_ms - a.p95_ms).slice(0, 5);
  }, [observability.data?.latency_by_step]);

  const topRules = useMemo(() => {
    const rows = semanticMetrics.data?.rules ?? [];
    return [...rows].sort((a, b) => b.applied - a.applied).slice(0, 5);
  }, [semanticMetrics.data?.rules]);

  const isRefreshing =
    recent.isFetching
    || observability.isFetching
    || queue.isFetching
    || health.isFetching
    || trainingCases.isFetching
    || whatsappSummary.isFetching
    || previewSessions.isFetching
    || latestBenchmarkReport.isFetching
    || (shelfEnabled && (shelfReviewQueue.isFetching || shelfJobs.isFetching));

  const quickLinks = [
    { href: "/jobs/new", title: "Crear Job", desc: "Subir imágenes y ejecutar OCR + Vision", icon: <Zap className="h-4 w-4" />, tone: "border-cyan-300/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-100" },
    { href: "/analytics", title: "Analytics", desc: "Filtrar resultados y exportar Excel", icon: <LineChart className="h-4 w-4" />, tone: "border-lime-300/30 bg-lime-500/10 hover:bg-lime-500/20 text-lime-100" },
    { href: `/accounts/${HOME_ACCOUNT}/training`, title: "Training IA", desc: "Casos, aliases y reglas semánticas", icon: <GraduationCap className="h-4 w-4" />, tone: "border-sky-300/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-100" },
    { href: `/accounts/${HOME_ACCOUNT}/semantic-review`, title: "Curaduría Semántica", desc: "Revisar evidencia y reglas RAG", icon: <Bot className="h-4 w-4" />, tone: "border-amber-300/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100" },
    ...(shelfEnabled
      ? [{ href: `/accounts/${HOME_ACCOUNT}/shelf`, title: "Shelf Recognition", desc: "Facing, Top-K y curaduría de SKU", icon: <Package className="h-4 w-4" />, tone: "border-violet-300/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-100" }]
      : []),
  ];

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-cyan-950/50 shadow-xl shadow-cyan-950/20">
        <div className="border-b border-white/5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-300" />
                <h1 className="font-heading text-xl font-semibold tracking-tight text-white sm:text-2xl">Centro Operativo OCR</h1>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Vista ejecutiva de jobs, calidad, cola y módulos clave. Datos en vivo de la cuenta operativa.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-cyan-300/30 bg-cyan-500/10 text-cyan-100">{HOME_ACCOUNT}</Badge>
              {isRefreshing ? (
                <Badge variant="outline" className="gap-1 border-white/15 text-slate-300">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Actualizando
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-400/30 text-emerald-100">En vivo</Badge>
              )}
              {lastUpdatedLabel ? (
                <span className="text-[11px] text-slate-500">Sync {lastUpdatedLabel}</span>
              ) : null}
              <button
                type="button"
                onClick={refreshDashboard}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/25 px-2.5 py-1 text-xs text-slate-200 transition hover:bg-black/40 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                Refrescar
              </button>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-5">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 ${item.tone}`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-white/10 bg-black/20 p-2">{item.icon}</span>
                <ArrowRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </div>
              <p className="mt-3 font-semibold">{item.title}</p>
              <p className="mt-1 text-xs text-slate-300/90">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Éxito reciente"
          value={asPercent(stats.successRate)}
          hint={`${stats.completed} de ${stats.total} jobs`}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />}
          accent="from-emerald-500/10"
          bar={stats.successRate}
          barClass="bg-emerald-400"
          loading={recent.isLoading}
        />
        <KpiCard
          label="En ejecución"
          value={String(stats.running)}
          hint={queue.data ? `${queue.data.running_count} en cola global` : "Monitoreo en vivo"}
          icon={<Activity className="h-4 w-4 text-amber-300" />}
          accent="from-amber-500/10"
          loading={recent.isLoading || queue.isLoading}
        />
        <KpiCard
          label="Imágenes"
          value={asCompactInt(stats.imagesProcessed)}
          hint={stats.imagesTotal > 0 ? `${asCompactInt(stats.imagesTotal)} en ventana` : "Procesadas recientes"}
          icon={<BarChart3 className="h-4 w-4 text-violet-300" />}
          accent="from-violet-500/10"
          bar={stats.imagesTotal > 0 ? stats.imagesProcessed / stats.imagesTotal : undefined}
          barClass="bg-violet-400"
          loading={recent.isLoading}
        />
        <KpiCard
          label="Needs review"
          value={asPercent(observability.data?.summary.needs_review_rate ?? 0)}
          hint="Calidad operativa"
          icon={<Target className="h-4 w-4 text-cyan-300" />}
          accent="from-cyan-500/10"
          bar={observability.data?.summary.needs_review_rate ?? 0}
          barClass="bg-cyan-400"
          loading={observability.isLoading}
        />
        <KpiCard
          label="LLM OK"
          value={asPercent(observability.data?.summary.llm_ok_rate ?? 0)}
          hint="Tasa de respuesta válida"
          icon={<Bot className="h-4 w-4 text-lime-300" />}
          accent="from-lime-500/10"
          bar={observability.data?.summary.llm_ok_rate ?? 0}
          barClass="bg-lime-400"
          loading={observability.isLoading}
        />
        <KpiCard
          label="Reglas RAG"
          value={asCompactInt(semanticMetrics.data?.summary?.rules_observed ?? 0)}
          hint="Motor semántico"
          icon={<Layers3 className="h-4 w-4 text-fuchsia-300" />}
          accent="from-fuchsia-500/10"
          loading={semanticMetrics.isLoading}
        />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-slate-300">Módulos operativos</h2>
            <p className="text-xs text-slate-500">Shelf, training y sistema con enlaces directos a cada área.</p>
          </div>
        </div>
        <div className={`grid gap-3 ${shelfEnabled ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>
          {shelfEnabled ? (
            <ModuleTile
              title="Shelf Recognition"
              description="Curaduría, catálogo SKU y jobs de facing."
              href={`/accounts/${HOME_ACCOUNT}/shelf`}
              icon={<Package className="h-4 w-4 text-violet-300" />}
              accent="from-violet-500/10"
              loading={shelfReviewQueue.isLoading || shelfSkuCategories.isLoading}
              metrics={[
                { label: "Curaduría", value: String(shelfReviewQueue.data?.length ?? 0), tone: (shelfReviewQueue.data?.length ?? 0) > 0 ? "text-amber-200" : "text-slate-100" },
                { label: "SKUs activos", value: asCompactInt(shelfActiveSkuCount) },
                { label: "Dataset", value: asCompactInt(shelfDatasetImages), tone: "text-violet-200" },
                { label: "Jobs shelf", value: String((shelfJobs.data ?? []).length) },
              ]}
              footer={
                shelfRunningJob ? (
                  <div className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-2 text-[11px]">
                    <p className="text-violet-100">Job shelf activo: <span className="font-mono">{shelfRunningJob.id}</span></p>
                    {shelfRunningJob.total_images > 0 ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.round(jobProgressRatio(shelfRunningJob) * 100)}%` }} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">Sin job shelf en ejecución.</p>
                )
              }
            />
          ) : null}
          <ModuleTile
            title="Training IA"
            description="Casos abiertos y reglas RAG bloqueadas."
            href={`/accounts/${HOME_ACCOUNT}/training`}
            icon={<GraduationCap className="h-4 w-4 text-sky-300" />}
            accent="from-sky-500/10"
            loading={trainingCases.isLoading || observability.isLoading}
            metrics={[
              { label: "Casos abiertos", value: String(trainingOpenCount), tone: trainingOpenCount > 0 ? "text-amber-200" : "text-slate-100" },
              { label: "Total casos", value: String(trainingCases.data?.total ?? trainingCases.data?.items.length ?? 0) },
              { label: "RAG bloqueadas", value: String(observability.data?.top_rag_blocked_rules?.length ?? 0) },
              { label: "Reglas vistas", value: asCompactInt(semanticMetrics.data?.summary?.rules_observed ?? 0) },
            ]}
            footer={
              topBlockedRules.length ? (
                <div className="space-y-1">
                  {topBlockedRules.map((rule) => (
                    <p key={`blocked-${rule.rule}`} className="line-clamp-1 text-[11px] text-rose-200/90">
                      {rule.rule} · {rule.count}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">Sin reglas bloqueadas en la ventana.</p>
              )
            }
          />
          <ModuleTile
            title="Sistema e integraciones"
            description="Salud backend, masterdata e inbound WhatsApp."
            href="/ops"
            icon={<Wifi className="h-4 w-4 text-emerald-300" />}
            accent="from-emerald-500/10"
            loading={health.isLoading || masterdataImports.isLoading}
            metrics={[
              { label: "Backend", value: healthLabel(health.data), tone: healthTone(health.data) },
              {
                label: "Masterdata",
                value: lastMasterdataImport ? toTitleCase(lastMasterdataImport.status) : "—",
                tone: "text-cyan-200",
              },
              {
                label: "WA pendientes",
                value: whatsappSummary.isError ? "N/D" : String(whatsappSummary.data?.pending ?? 0),
                tone: (whatsappSummary.data?.pending ?? 0) > 0 ? "text-amber-200" : "text-slate-100",
              },
              {
                label: "WA fallidos",
                value: whatsappSummary.isError ? "N/D" : String(whatsappSummary.data?.failed ?? 0),
                tone: (whatsappSummary.data?.failed ?? 0) > 0 ? "text-rose-200" : "text-slate-100",
              },
            ]}
            footer={
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Link href={`/accounts/${HOME_ACCOUNT}/masterdata`} className="text-cyan-200 hover:text-cyan-100">
                  Masterdata {lastMasterdataImport?.source_filename ? `· ${lastMasterdataImport.source_filename}` : ""}
                </Link>
                <Link href={`/accounts/${HOME_ACCOUNT}/inbound-whatsapp`} className="text-emerald-200 hover:text-emerald-100">
                  WhatsApp
                </Link>
              </div>
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-slate-300">Monitoreo en vivo</h2>
          <p className="text-xs text-slate-500">Preview realtime y último score de calidad benchmark.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Video className="h-4 w-4 text-pink-300" />
                Preview Realtime
                {previewSessions.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
              </CardTitle>
              <CardDescription>
                Sesiones de la cuenta · poll {activePreviewSessions.length > 0 ? "5s" : "15s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-pink-400/25 bg-pink-500/10 p-3 text-center">
                  <p className="font-heading text-2xl font-semibold text-pink-100">{activePreviewSessions.length}</p>
                  <p className="text-[11px] text-pink-200/80">Activas</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                  <p className="font-heading text-2xl font-semibold text-slate-100">{accountPreviewSessions.length}</p>
                  <p className="text-[11px] text-slate-400">Total cuenta</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                  <p className="font-heading text-2xl font-semibold text-slate-100">
                    {activePreviewSessions.reduce((sum, session) => sum + Number(session.active_tracks ?? 0), 0)}
                  </p>
                  <p className="text-[11px] text-slate-400">Tracks</p>
                </div>
              </div>
              {activePreviewSessions.slice(0, 2).map((session) => (
                <div key={session.session_id} className="rounded-md border border-pink-400/25 bg-pink-500/10 px-3 py-2 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-slate-100">{session.session_id}</span>
                    <Badge className={statusBadgeClass(session.status)}>{toTitleCase(session.status)}</Badge>
                  </div>
                  <p className="mt-1 text-slate-400">
                    {previewSourceLabel(session.source)}
                    {session.subcategoria ? ` · ${session.subcategoria}` : ""}
                    {session.id_pdv ? ` · PDV ${session.id_pdv}` : ""}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                    <span>FPS {session.metrics.fps.toFixed(1)}</span>
                    <span>Frames {session.metrics.frames_processed}</span>
                    <span>Tracks {session.active_tracks ?? 0}</span>
                  </div>
                </div>
              ))}
              {!activePreviewSessions.length && !previewSessions.isLoading ? (
                <p className="text-xs text-slate-400">Sin sesiones preview activas para {HOME_ACCOUNT}.</p>
              ) : null}
              {previewSessions.isLoading ? <p className="text-xs text-slate-400">Cargando sesiones…</p> : null}
              <Link href={`/accounts/${HOME_ACCOUNT}/preview`} className="inline-flex items-center text-xs text-pink-200 hover:text-pink-100">
                Abrir Preview Realtime <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-lime-300" />
                Calidad y Benchmark
                {benchmark.isFetching || latestBenchmarkReport.isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                ) : null}
              </CardTitle>
              <CardDescription>
                Último benchmark evaluado · {benchmarkRows.length} en historial reciente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestBenchmark ? (
                <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-slate-100">{latestBenchmark.benchmark_id}</span>
                    <Badge className={statusBadgeClass(latestBenchmark.status)}>{toTitleCase(latestBenchmark.status)}</Badge>
                  </div>
                  <p className="mt-1 text-slate-400">
                    Modo {toTitleCase(latestBenchmark.mode)} · {latestBenchmark.total_images ?? 0} imágenes
                  </p>
                  {latestBenchmark.updated_at ? (
                    <p className="mt-0.5 text-[10px] text-slate-500">Actualizado {relativeDate(latestBenchmark.updated_at)}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Sin benchmarks recientes para esta cuenta.</p>
              )}
              {runningBenchmark ? (
                <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Benchmark en curso: <span className="font-mono">{runningBenchmark.benchmark_id}</span>
                </div>
              ) : null}
              {benchmarkMetrics ? (
                <div className="space-y-2">
                  {[
                    { key: "exactitud_nombre", label: "Exactitud nombre", tone: "bg-lime-400" },
                    { key: "recall_productos_validos", label: "Recall productos", tone: "bg-cyan-400" },
                    { key: "tasa_needs_review", label: "Needs review", tone: "bg-amber-400" },
                    { key: "tasa_invento_proxy", label: "Invention proxy", tone: "bg-rose-400" },
                  ].map((metric) => {
                    const value = readMetricNumber(benchmarkMetrics, metric.key);
                    if (value == null) return null;
                    return (
                      <div key={metric.key}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-slate-400">{metric.label}</span>
                          <span className="font-medium text-slate-200">{asPercent(value)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div className={`h-full rounded-full ${metric.tone}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : latestBenchmark && !latestBenchmarkReport.isLoading ? (
                <p className="text-xs text-slate-400">Reporte de métricas no disponible para el último benchmark.</p>
              ) : null}
              {benchmarkAiEffectiveness.data?.summary ? (
                <div className="rounded-md border border-lime-400/25 bg-lime-500/10 px-3 py-2 text-[11px]">
                  <p className="text-lime-100">
                    IA analista · score {benchmarkAiEffectiveness.data.summary.avg_success_score.toFixed(2)}
                    {" · "}{benchmarkAiEffectiveness.data.summary.total_reviews} reviews
                  </p>
                </div>
              ) : null}
              <Link href={`/accounts/${HOME_ACCOUNT}/quality`} className="inline-flex items-center text-xs text-lime-200 hover:text-lime-100">
                Módulo Calidad IA <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              Mix de estados
            </CardTitle>
            <CardDescription>Distribución de los últimos {stats.total} jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusMixChart completed={stats.completed} running={stats.running} failed={stats.failed} other={stats.other + stats.queued} />
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4 text-amber-300" />
              Cola OCR
              {queue.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
            </CardTitle>
            <CardDescription>
              Tiempo real · poll {Math.round(QUEUE_POLL_MS / 1000)}s
              {queue.data?.poll_sec ? ` · backend ${queue.data.poll_sec}s` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {queue.data ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={queueLive ? "border-amber-400/40 text-amber-100" : "border-emerald-400/30 text-emerald-100"}>
                    {queueLive ? "Cola activa" : "Cola idle"}
                  </Badge>
                  {queue.data.queue_mode ? (
                    <Badge variant="outline" className="border-white/15 text-slate-300">{queue.data.queue_mode}</Badge>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-3 text-center">
                    <p className="font-heading text-2xl font-semibold text-amber-100">{queue.data.queued_count}</p>
                    <p className="text-[11px] text-amber-200/80">Pendientes</p>
                  </div>
                  <div className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 p-3 text-center">
                    <p className="font-heading text-2xl font-semibold text-cyan-100">{queue.data.running_count}</p>
                    <p className="text-[11px] text-cyan-200/80">Ejecutando</p>
                  </div>
                </div>
                {Object.keys(queue.data.counts_by_status ?? {}).length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(queue.data.counts_by_status ?? {}).map(([status, count]) => (
                      <Badge key={status} variant="outline" className="border-white/15 text-[10px] text-slate-300">
                        {status}: {count}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {queue.data.running_job ? (
                  <div className="rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2 py-2 text-[11px]">
                    <p className="font-medium text-cyan-100">Job activo</p>
                    <p className="mt-0.5 font-mono text-slate-200">{queue.data.running_job.job_id}</p>
                    {queue.data.running_job.total_images ? (
                      <div className="mt-2">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Progreso</span>
                          <span>{queue.data.running_job.processed_images ?? 0}/{queue.data.running_job.total_images}</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-400"
                            style={{ width: `${Math.round(jobProgressRatio(queue.data.running_job) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {(queue.data.next_jobs ?? []).slice(0, 3).map((job) => (
                  <div key={job.job_id} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px]">
                    <span className="font-mono text-slate-200">{job.job_id}</span>
                    <span className="ml-2 text-slate-500">{toTitleCase(String(job.status))}</span>
                  </div>
                ))}
              </>
            ) : queue.isLoading ? (
              <p className="text-xs text-slate-400">Cargando cola…</p>
            ) : (
              <p className="text-xs text-amber-300/90">Cola no disponible en este momento.</p>
            )}
            <Link href="/ops" className="inline-flex items-center text-xs text-cyan-200 hover:text-cyan-100">
              Diagnóstico ops (vista completa) <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-300" />
              Salud del pipeline
            </CardTitle>
            <CardDescription>LLM y accesos rápidos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">LLM OK rate</span>
                <span className="font-medium text-emerald-200">{asPercent(observability.data?.summary.llm_ok_rate ?? 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(0, (observability.data?.summary.llm_ok_rate ?? 0) * 100))}%` }} />
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">LLM fallback rate</span>
                <span className="font-medium text-amber-200">{asPercent(observability.data?.summary.llm_fallback_rate ?? 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, Math.max(0, (observability.data?.summary.llm_fallback_rate ?? 0) * 100))}%` }} />
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">Invention rate (proxy)</span>
                <span className="font-medium text-rose-200">{asPercent(observability.data?.summary.invention_rate_proxy ?? 0)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.min(100, Math.max(0, (observability.data?.summary.invention_rate_proxy ?? 0) * 100))}%` }} />
              </div>
            </div>
            <JobActivityStrip jobs={activityJobs} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href={`/accounts/${HOME_ACCOUNT}/config`} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm transition hover:bg-black/35">
                <Bot className="mr-2 inline h-4 w-4" /> Config OCR / LLM
              </Link>
              <Link href={`/accounts/${HOME_ACCOUNT}/preview`} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm transition hover:bg-black/35">
                <Activity className="mr-2 inline h-4 w-4" /> Preview realtime
              </Link>
              <Link href={`/accounts/${HOME_ACCOUNT}/masterdata`} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm transition hover:bg-black/35">
                <Layers3 className="mr-2 inline h-4 w-4" /> Masterdata
              </Link>
              {shelfEnabled ? (
                <Link href={`/accounts/${HOME_ACCOUNT}/shelf`} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm transition hover:bg-black/35">
                  <Package className="mr-2 inline h-4 w-4" /> Shelf
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-white/5 xl:col-span-7">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Jobs recientes
              </CardTitle>
              <CardDescription>Últimas ejecuciones con progreso e identidad de imagen</CardDescription>
            </div>
            <Link href={`/accounts/${HOME_ACCOUNT}/jobs`} className="text-xs text-cyan-200 hover:text-cyan-100">
              Ver historial completo <ArrowRight className="ml-1 inline h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentRows.slice(0, 7).map((job) => {
              const progress = jobProgressRatio(job);
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block rounded-xl border border-white/10 bg-black/20 px-3 py-3 transition hover:border-white/20 hover:bg-black/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-xs text-slate-100">{job.id}</span>
                      <p className="mt-1 text-[11px] text-slate-400">
                        PDV {job.id_pdv ?? "—"} · Usuario {job.usuario_relevo ?? "—"} · {job.subcategoria ?? "sin subcat"}
                      </p>
                      {job.image_process_code != null ? (
                        <p className="mt-0.5 text-[10px] text-cyan-300/80">Código imagen: {job.image_process_code}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={statusBadgeClass(job.status)}>{toTitleCase(job.status)}</Badge>
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Clock3 className="h-3 w-3" />
                        {relativeDate(job.updated_at || job.created_at)}
                      </span>
                    </div>
                  </div>
                  {job.total_images > 0 ? (
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Imágenes</span>
                        <span>{job.processed_images}/{job.total_images}{job.failed_images > 0 ? ` · ${job.failed_images} fallidas` : ""}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-cyan-500/80" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </div>
                    </div>
                  ) : null}
                </Link>
              );
            })}
            {recent.isLoading ? <p className="text-sm text-slate-400">Cargando jobs…</p> : null}
            {!recentRows.length && !recent.isLoading ? <p className="text-sm text-muted-foreground">Sin jobs recientes por ahora.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Alertas y benchmark
            </CardTitle>
            <CardDescription>Señales que requieren atención</CardDescription>
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
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Sin alertas críticas
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-slate-300">
                Benchmarks recientes: <span className="font-semibold text-cyan-200">{benchmarkRows.length}</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">Último: {benchmarkRows[0] ? toTitleCase(benchmarkRows[0].status) : "—"}</p>
              <Link href={`/accounts/${HOME_ACCOUNT}/quality`} className="mt-2 inline-flex items-center text-xs text-cyan-200 hover:text-cyan-100">
                Módulo Calidad IA <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
            {stats.failed > 0 ? (
              <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-100">
                {stats.failed} job(s) fallidos en la ventana reciente
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-orange-300" />
              Latencia por etapa
            </CardTitle>
            <CardDescription>Top p95 del pipeline</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topLatency.map((row) => (
              <div key={row.step}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-300">{toTitleCase(row.step)}</span>
                  <span className="font-mono text-slate-400">p95 {asDurationMs(row.p95_ms)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                    style={{ width: `${Math.min(100, Math.max(6, (row.p95_ms / Math.max(topLatency[0]?.p95_ms || 1, 1)) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            {!topLatency.length ? <p className="text-xs text-slate-400">Sin datos de latencia todavía.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-emerald-300" />
              Reglas RAG más aplicadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(observability.data?.top_rag_applied_rules ?? []).slice(0, 5).map((rule) => (
              <div key={`${rule.rule}-${rule.count}`} className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="line-clamp-2 text-xs text-slate-200">{rule.rule}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{
                      width: `${Math.min(100, Math.max(8, ((rule.count ?? 0) / Math.max((observability.data?.top_rag_applied_rules?.[0]?.count ?? 1), 1)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-emerald-300">Aplicada {rule.count} veces</p>
              </div>
            ))}
            {!(observability.data?.top_rag_applied_rules?.length) ? <p className="text-xs text-slate-400">Sin reglas en la ventana actual.</p> : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 xl:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-rose-300" />
              Top descartes
            </CardTitle>
            <CardDescription>Motivos más frecuentes en la ventana</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(observability.data?.top_discard_reasons ?? []).slice(0, 5).map((row) => (
              <div key={`${row.reason}-${row.count}`} className="rounded-md border border-white/10 bg-black/20 p-2">
                <p className="line-clamp-2 text-xs text-slate-200">{row.reason}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-rose-400"
                    style={{
                      width: `${Math.min(100, Math.max(8, ((row.count ?? 0) / Math.max((observability.data?.top_discard_reasons?.[0]?.count ?? 1), 1)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-rose-300">{row.count} ocurrencias</p>
              </div>
            ))}
            {!(observability.data?.top_discard_reasons?.length) ? <p className="text-xs text-slate-400">Sin descartes registrados.</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-white/10 bg-white/5 xl:col-span-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers3 className="h-4 w-4 text-fuchsia-300" />
              Rendimiento semántico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {topRules.map((row) => (
                <div key={row.rule} className="rounded-md border border-white/10 bg-black/20 p-2">
                  <p className="line-clamp-1 text-xs text-slate-200">{row.rule}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${Math.min(100, Math.max(4, row.precision_est * 100))}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{row.applied} aplicadas</span>
                    <span>precisión {asPercent(row.precision_est)}</span>
                  </div>
                </div>
              ))}
            </div>
            {!topRules.length ? <p className="text-xs text-slate-400">Sin métricas semánticas por ahora.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-fuchsia-300" />
            Deriva por cadena / categoría
          </CardTitle>
          <CardDescription>Tasa de needs review por segmento</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(observability.data?.drift_chain_category ?? []).slice(0, 6).map((row) => (
              <div key={row.chain_category} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{row.chain_category}</span>
                  <span className="text-slate-500">{row.rows} filas</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-400" style={{ width: `${Math.min(100, Math.max(0, row.needs_review_rate * 100))}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-fuchsia-200">Needs review {asPercent(row.needs_review_rate)}</p>
              </div>
            ))}
          </div>
          {!observability.data?.drift_chain_category?.length ? <p className="text-xs text-slate-400">No hay deriva registrada en el periodo actual.</p> : null}
        </CardContent>
      </Card>

      {(recent.isError || observability.isError || semanticMetrics.isError || benchmark.isError) ? (
        <Card className="border-rose-400/30 bg-rose-500/10">
          <CardContent className="pt-4 text-sm text-rose-100">
            Hubo un problema cargando parte del dashboard. Puedes seguir trabajando y reintentar refrescando la página.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}