"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronRight,
  Download,
  FlaskConical,
  History,
  Loader2,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type {
  BenchmarkAiReviewRow,
  BenchmarkCreateRequest,
  BenchmarkCreateResponse,
  BenchmarkRunRequest,
  BenchmarkRunResponse,
  BenchmarkAiReviewTaskStatus,
  ObservabilitySummaryRequest,
  ObservabilitySummaryResponse,
  UploadItem,
} from "@/types/ocr-api";
import { UploadPanel } from "@/components/jobs/upload-panel";
import { UploadedFilesTable } from "@/components/jobs/uploaded-files-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = { account: string };

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function driftBadge(rate: number) {
  if (rate > 0.25) return <Badge variant="destructive">rojo</Badge>;
  if (rate >= 0.1) return <Badge variant="secondary">amarillo</Badge>;
  return <Badge>verde</Badge>;
}

function isEmptyAiResultPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const meta = obj.result_meta;
  if (meta && typeof meta === "object" && (meta as Record<string, unknown>).is_empty_result === true) return true;
  const result = obj.result;
  return !!(result && typeof result === "object" && Object.keys(result as Record<string, unknown>).length === 0);
}

function extractMasterJsonCandidate(source: unknown): Record<string, unknown> | undefined {
  if (!source || typeof source !== "object") return undefined;
  const obj = source as Record<string, unknown>;
  if (obj.raw_result_json && typeof obj.raw_result_json === "object" && !Array.isArray(obj.raw_result_json)) {
    return obj.raw_result_json as Record<string, unknown>;
  }
  if (obj.result_json && typeof obj.result_json === "object" && !Array.isArray(obj.result_json)) {
    return obj.result_json as Record<string, unknown>;
  }
  return obj;
}

function scoreBadge(score: number): ReactNode {
  if (score >= 0.8) return <Badge className="border-emerald-400/40 bg-emerald-500/20 text-emerald-100">Alto</Badge>;
  if (score >= 0.5) return <Badge className="border-amber-400/40 bg-amber-500/20 text-amber-100">Medio</Badge>;
  return <Badge variant="destructive">Bajo</Badge>;
}

function benchmarkStatusBadge(status: string): ReactNode {
  const normalized = status.toLowerCase();
  if (["completed", "success", "partial_success", "done"].includes(normalized)) {
    return <Badge className="border-emerald-400/40 bg-emerald-500/20 text-emerald-100">{status}</Badge>;
  }
  if (["failed", "error"].includes(normalized)) {
    return <Badge variant="destructive">{status}</Badge>;
  }
  if (["running", "processing", "queued"].includes(normalized)) {
    return <Badge className="border-amber-400/40 bg-amber-500/20 text-amber-100">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function toTitleCase(value: string): string {
  return value.replace(/_/g, " ").trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

function MetricBarRow({ label, value, tone = "bg-cyan-400" }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">{pct(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
    </div>
  );
}

function QualityKpiCard({
  label,
  value,
  hint,
  accent,
  bar,
  barClass = "bg-cyan-400",
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  bar?: number;
  barClass?: string;
}) {
  return (
    <Card className={`border-white/10 bg-gradient-to-br ${accent} to-black/20`}>
      <CardContent className="pt-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-2 font-heading text-2xl font-semibold text-slate-50">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
        {typeof bar === "number" ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QualityTabButton({
  active,
  onClick,
  icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition ${
        active
          ? "border-cyan-300/40 bg-cyan-500/15 shadow-lg shadow-cyan-950/20"
          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={active ? "text-cyan-200" : "text-slate-400"}>{icon}</span>
        <span className={`font-semibold ${active ? "text-cyan-50" : "text-slate-200"}`}>{label}</span>
      </div>
      {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
    </button>
  );
}

function QualitySubTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
        active
          ? "border-lime-300/40 bg-lime-500/20 text-lime-100"
          : "border-white/10 bg-black/20 text-slate-300 hover:bg-black/30"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed border-white/15 bg-black/15">
      <CardContent className="py-8 text-center">
        <p className="font-medium text-slate-200">{title}</p>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </CardContent>
    </Card>
  );
}

function StepBadge({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/15 font-semibold text-cyan-100">
        {step}
      </span>
      <span>{label}</span>
    </div>
  );
}

function aiPhaseLabel(phase: string): string {
  if (phase === "preparing") return "Preparando análisis";
  if (phase === "loading_input") return "Cargando entrada";
  if (phase === "compacting") return "Resumiendo contexto";
  if (phase === "chunking") return "Dividiendo en fragmentos";
  if (phase === "processing_chunks") return "Analizando fragmentos";
  if (phase === "consolidating") return "Consolidando hallazgos";
  if (phase === "saving_review") return "Guardando resultado";
  if (phase === "done") return "Completado";
  if (phase === "error") return "Error en análisis";
  return phase || "Procesando";
}

export function AccountQualityPage({ account }: Props) {
  const [tab, setTab] = useState<"observabilidad" | "benchmark_offline" | "benchmark_batch">("observabilidad");
  const [batchTab, setBatchTab] = useState<"ejecutar" | "historial" | "ia">("ejecutar");
  const [iaTab, setIaTab] = useState<"prompt" | "ejecutar" | "resultado" | "historial" | "efectividad">("prompt");

  const [obsForm, setObsForm] = useState({
    account_name: account,
    created_from: "",
    created_to: "",
    limit_jobs: "500",
    alert_needs_review_rate: "0.25",
    alert_llm_ok_rate_drop_below: "0.75",
    alert_llm_fallback_rate_above: "0.30",
  });
  const [obsData, setObsData] = useState<ObservabilitySummaryResponse | null>(null);
  const [obsRan, setObsRan] = useState(false);

  const [offlineForm, setOfflineForm] = useState({
    account_name: account,
    golden_path: "",
    created_from: "",
    created_to: "",
    limit_jobs: "500",
  });
  const [offlineData, setOfflineData] = useState<BenchmarkRunResponse | null>(null);
  const [offlineRan, setOfflineRan] = useState(false);
  const [missOffset, setMissOffset] = useState(0);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedItems, setUploadedItems] = useState<UploadItem[]>([]);
  const [batchForm, setBatchForm] = useState({
    account_name: account,
    config_name: "default",
    mode: "performance_only" as "performance_only" | "quality_with_golden",
    golden_path: "",
    concurrency: "2",
    max_retries_per_image: "1",
    timeout_sec: "120",
  });
  const [benchmarkCreated, setBenchmarkCreated] = useState<BenchmarkCreateResponse | null>(null);
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState("");

  const [promptModel, setPromptModel] = useState("qwen3:8b");
  const [promptDraft, setPromptDraft] = useState("");
  const [aiRunModel, setAiRunModel] = useState("qwen3:8b");
  const [aiRunPromptVersion, setAiRunPromptVersion] = useState("");
  const [aiRunNotes, setAiRunNotes] = useState("");
  const [aiCompactMode, setAiCompactMode] = useState(true);
  const [aiMaxPromptChars, setAiMaxPromptChars] = useState("16000");
  const [aiMaxChunks, setAiMaxChunks] = useState("12");
  const [aiChunkOverlapChars, setAiChunkOverlapChars] = useState("300");
  const [aiRunResult, setAiRunResult] = useState<Record<string, unknown> | null>(null);
  const [selectedHistoryReview, setSelectedHistoryReview] = useState<BenchmarkAiReviewRow | null>(null);
  const [benchmarkSourceJson, setBenchmarkSourceJson] = useState<Record<string, unknown> | null>(null);
  const [usePrecalculatedData, setUsePrecalculatedData] = useState(true);
  const [useAsyncAi, setUseAsyncAi] = useState(true);
  const [aiTaskId, setAiTaskId] = useState("");
  const [aiTaskStatus, setAiTaskStatus] = useState<BenchmarkAiReviewTaskStatus | null>(null);
  const [resolvedTaskId, setResolvedTaskId] = useState("");

  const obsMutation = useMutation({
    mutationFn: (payload: ObservabilitySummaryRequest) => ocrApi.getObservabilitySummary(payload),
    onSuccess: (data) => {
      setObsData(data);
      setObsRan(true);
      toast.success("Observabilidad actualizada");
    },
    onError: (error) => {
      setObsRan(true);
      setObsData(null);
      toast.error("Error en observabilidad", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
    },
  });

  const offlineMutation = useMutation({
    mutationFn: (payload: BenchmarkRunRequest) => ocrApi.runOfflineBenchmark(payload),
    onSuccess: (data) => {
      setOfflineData(data);
      setOfflineRan(true);
      setMissOffset(0);
      toast.success("Benchmark ejecutado");
    },
    onError: (error) => {
      setOfflineRan(true);
      setOfflineData(null);
      toast.error("Error en benchmark", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => ocrApi.uploadImages(batchForm.account_name, files),
    onSuccess: (data) => {
      setUploadedItems(data.uploaded);
      toast.success("Upload listo", { description: `${data.uploaded.length} imágenes subidas` });
    },
    onError: (error) => toast.error("Upload falló", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });

  const createBatchMutation = useMutation({
    mutationFn: (payload: BenchmarkCreateRequest) => ocrApi.createBenchmarkJob(payload),
    onSuccess: (data) => {
      setBenchmarkCreated(data);
      setSelectedBenchmarkId(data.benchmark_id);
      toast.success("Benchmark iniciado", { description: data.benchmark_id });
    },
    onError: (error) => toast.error("Error creando benchmark", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });

  const benchmarkHistoryQuery = useQuery({
    queryKey: ["benchmark-history-account", batchForm.account_name],
    queryFn: () => ocrApi.listAccountBenchmarkJobs(batchForm.account_name, 50),
    enabled: tab === "benchmark_batch" && batchTab === "historial",
  });
  const benchmarkDetailQuery = useQuery({
    queryKey: ["benchmark-detail", benchmarkCreated?.benchmark_id],
    queryFn: () => ocrApi.getBenchmarkJob(benchmarkCreated?.benchmark_id ?? ""),
    enabled: Boolean(benchmarkCreated?.benchmark_id),
    refetchInterval: (q) => {
      const status = (q.state.data?.status ?? "").toLowerCase();
      return ["completed", "failed", "partial_success"].includes(status) ? false : 3000;
    },
  });
  const benchmarkEventsQuery = useQuery({
    queryKey: ["benchmark-events", benchmarkCreated?.benchmark_id],
    queryFn: () => ocrApi.getBenchmarkEvents(benchmarkCreated?.benchmark_id ?? ""),
    enabled: Boolean(benchmarkCreated?.benchmark_id),
    refetchInterval: 3000,
  });
  const benchmarkMetricsQuery = useQuery({
    queryKey: ["benchmark-metrics", benchmarkCreated?.benchmark_id],
    queryFn: () => ocrApi.getBenchmarkMetrics(benchmarkCreated?.benchmark_id ?? ""),
    enabled: Boolean(benchmarkCreated?.benchmark_id),
    refetchInterval: 4000,
  });
  const benchmarkAnalyticsQuery = useQuery({
    queryKey: ["benchmark-analytics", benchmarkCreated?.benchmark_id],
    queryFn: () => ocrApi.getBenchmarkAnalytics(benchmarkCreated?.benchmark_id ?? ""),
    enabled: Boolean(benchmarkCreated?.benchmark_id),
    refetchInterval: 5000,
  });
  const benchmarkReportQuery = useQuery({
    queryKey: ["benchmark-report", benchmarkCreated?.benchmark_id],
    queryFn: () => ocrApi.getBenchmarkReport(benchmarkCreated?.benchmark_id ?? ""),
    enabled: Boolean(benchmarkCreated?.benchmark_id),
    refetchInterval: 5000,
  });
  const selectedBenchmarkReportQuery = useQuery({
    queryKey: ["benchmark-selected-report", selectedBenchmarkId],
    queryFn: () => ocrApi.getBenchmarkReport(selectedBenchmarkId),
    enabled: Boolean(selectedBenchmarkId),
  });
  const promptsQuery = useQuery({
    queryKey: ["benchmark-prompts", batchForm.account_name],
    queryFn: () => ocrApi.listBenchmarkAnalystPrompts(batchForm.account_name),
    enabled: tab === "benchmark_batch" && batchTab === "ia" && iaTab === "prompt",
  });
  const aiByBenchmarkQuery = useQuery({
    queryKey: ["benchmark-ai-by-benchmark", selectedBenchmarkId],
    queryFn: () => ocrApi.listBenchmarkAiReviews(selectedBenchmarkId, 20),
    enabled: Boolean(selectedBenchmarkId) && tab === "benchmark_batch" && batchTab === "ia" && iaTab === "historial",
  });
  const aiGlobalQuery = useQuery({
    queryKey: ["benchmark-ai-global", batchForm.account_name],
    queryFn: () => ocrApi.listAccountBenchmarkAiReviews(batchForm.account_name, 50),
    enabled: tab === "benchmark_batch" && batchTab === "ia" && iaTab === "historial",
  });
  const aiEffectivenessQuery = useQuery({
    queryKey: ["benchmark-ai-effectiveness", batchForm.account_name],
    queryFn: () => ocrApi.getBenchmarkAiEffectiveness(batchForm.account_name, 200),
    enabled: tab === "benchmark_batch" && batchTab === "ia",
  });
  const benchmarkResultsForAiQuery = useQuery({
    queryKey: ["benchmark-results-for-ai", selectedBenchmarkId],
    queryFn: () => ocrApi.getBenchmarkResults(selectedBenchmarkId),
    enabled: Boolean(selectedBenchmarkId),
  });

  const aiPayload = () => ({
    account_name: batchForm.account_name,
    model: aiRunModel || undefined,
    notes: aiRunNotes || undefined,
    prompt_version: aiRunPromptVersion ? Number(aiRunPromptVersion) : undefined,
    compact_mode: aiCompactMode,
    max_prompt_chars: Number(aiMaxPromptChars || 16000),
    max_chunks: Number(aiMaxChunks || 12),
    chunk_overlap_chars: Number(aiChunkOverlapChars || 300),
    master_json: usePrecalculatedData ? extractMasterJsonCandidate(benchmarkSourceJson) : undefined,
  });

  const createPromptMutation = useMutation({
    mutationFn: () => ocrApi.createBenchmarkAnalystPrompt(batchForm.account_name, { model: promptModel, prompt: promptDraft }),
    onSuccess: () => {
      toast.success("Prompt creado");
      setPromptDraft("");
      promptsQuery.refetch();
    },
    onError: (error) => toast.error("Error creando prompt", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });
  const activatePromptMutation = useMutation({
    mutationFn: (version: number) => ocrApi.activateBenchmarkAnalystPrompt(batchForm.account_name, version),
    onSuccess: () => {
      toast.success("Prompt activado");
      promptsQuery.refetch();
    },
    onError: (error) => toast.error("Error activando prompt", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });
  const bootstrapPromptMutation = useMutation({
    mutationFn: () => ocrApi.bootstrapBenchmarkAnalystPromptV2(batchForm.account_name, true),
    onSuccess: () => {
      toast.success("Prompt estricto v2 instalado y activado");
      promptsQuery.refetch();
    },
    onError: (error) => toast.error("No se pudo instalar prompt v2", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });
  const runAiAsyncMutation = useMutation({
    mutationFn: () => ocrApi.runBenchmarkAiReviewAsync(selectedBenchmarkId, aiPayload()),
    onSuccess: (data) => {
      setAiTaskId(data.task_id);
      setResolvedTaskId("");
      setAiTaskStatus({
        task_id: data.task_id,
        benchmark_id: data.benchmark_id,
        status: "queued",
        phase: "preparing",
        progress_pct: 0,
      });
      toast.success("Análisis IA iniciado", { description: `Task ${data.task_id}` });
    },
    onError: (error) => toast.error("Error iniciando análisis IA", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });
  const runAiMutation = useMutation({
    mutationFn: () => ocrApi.runBenchmarkAiReview(selectedBenchmarkId, aiPayload()),
    onSuccess: (data) => {
      setAiRunResult(data);
      setIaTab("resultado");
      toast.success("Análisis IA completado");
      aiByBenchmarkQuery.refetch();
      aiGlobalQuery.refetch();
    },
    onError: (error) => toast.error("Error ejecutando análisis IA", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });
  const aiTaskStatusQuery = useQuery({
    queryKey: ["benchmark-ai-task-status", selectedBenchmarkId, aiTaskId],
    queryFn: () => ocrApi.getBenchmarkAiReviewTaskStatus(selectedBenchmarkId, aiTaskId),
    enabled: Boolean(selectedBenchmarkId && aiTaskId),
    refetchInterval: (q) => {
      const status = String(q.state.data?.status ?? "").toLowerCase();
      return status === "completed" || status === "failed" || status === "cancelled" ? false : 1500;
    },
  });

  const sortedLatency = useMemo(() => [...(obsData?.latency_by_step ?? [])].sort((a, b) => b.p95_ms - a.p95_ms), [obsData?.latency_by_step]);
  const misses = offlineData?.metrics.misses ?? [];
  const pagedMisses = misses.slice(missOffset, missOffset + 10);
  const aiRows = useMemo(() => {
    const m = new Map<string, BenchmarkAiReviewRow>();
    for (const row of [...(aiByBenchmarkQuery.data ?? []), ...(aiGlobalQuery.data ?? [])]) {
      m.set(`${row.review_id}-${row.created_at ?? ""}`, row);
    }
    return Array.from(m.values()).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [aiByBenchmarkQuery.data, aiGlobalQuery.data]);
  const aiRawPayload = useMemo<Record<string, unknown>>(
    () => (aiRunResult ?? selectedBenchmarkReportQuery.data ?? {}) as Record<string, unknown>,
    [aiRunResult, selectedBenchmarkReportQuery.data],
  );
  const aiIsEmptyResult = useMemo(() => isEmptyAiResultPayload(aiRawPayload), [aiRawPayload]);
  const aiResultWarning = useMemo(() => {
    const meta = aiRawPayload.result_meta;
    if (meta && typeof meta === "object") {
      const warning = (meta as Record<string, unknown>).warning;
      if (typeof warning === "string" && warning.trim()) return warning;
    }
    return aiIsEmptyResult ? "La IA devolvió JSON vacío; reintenta con prompt más específico o modelo distinto." : null;
  }, [aiRawPayload, aiIsEmptyResult]);
  const aiAnalysisPayload = useMemo<unknown>(() => {
    const raw = aiRawPayload;
    return raw.result ?? raw.response_json ?? raw.response ?? raw.analysis ?? raw;
  }, [aiRawPayload]);
  const aiPrettyView = useMemo<Record<string, unknown> | null>(() => {
    const source = aiRawPayload.pretty_view ?? aiRawPayload.response_json;
    if (source && typeof source === "object" && !Array.isArray(source)) return source as Record<string, unknown>;
    return null;
  }, [aiRawPayload]);
  const aiResultMeta = useMemo(
    () => ((aiRawPayload.result_meta && typeof aiRawPayload.result_meta === "object" ? aiRawPayload.result_meta : {}) as Record<string, unknown>),
    [aiRawPayload],
  );
  const aiSuccessScore = useMemo(() => Number(aiResultMeta.success_score ?? 0) || 0, [aiResultMeta]);
  const aiContentQualityScore = useMemo(() => Number(aiResultMeta.content_quality_score ?? 0) || 0, [aiResultMeta]);
  const aiIsInformative = useMemo(() => Boolean(aiResultMeta.is_informative ?? false), [aiResultMeta]);
  const aiContentSignals = useMemo(
    () => (Array.isArray(aiResultMeta.content_signals) ? aiResultMeta.content_signals.map((x) => String(x)) : []),
    [aiResultMeta],
  );
  const aiInputDiagnostics = useMemo(
    () => ({
      master_json_path_used: aiResultMeta.master_json_path_used ?? null,
      master_json_file_exists: aiResultMeta.master_json_file_exists ?? null,
      master_json_file_size_bytes: aiResultMeta.master_json_file_size_bytes ?? null,
      master_json_read_error: aiResultMeta.master_json_read_error ?? null,
      master_json_source: aiResultMeta.master_json_source ?? null,
      chosen_result_source: aiResultMeta.chosen_result_source ?? null,
      compact_too_short_detected: aiResultMeta.compact_too_short_detected ?? null,
      auto_deep_fallback_triggered: aiResultMeta.auto_deep_fallback_triggered ?? null,
      auto_retry_triggered: aiResultMeta.auto_retry_triggered ?? null,
      compact_input_keys: aiResultMeta.compact_input_keys ?? null,
      compact_images_count: aiResultMeta.compact_images_count ?? null,
      compact_products_count: aiResultMeta.compact_products_count ?? null,
      compact_prompt_chars_before_llm: aiResultMeta.compact_prompt_chars_before_llm ?? null,
      deep_prompt_chars: aiResultMeta.deep_prompt_chars ?? null,
      deep_chunk_count: aiResultMeta.deep_chunk_count ?? null,
    }),
    [aiResultMeta],
  );
  const aiLiveStatus = aiTaskStatusQuery.data ?? aiTaskStatus;
  const isAiRunning = useMemo(() => {
    const s = String(aiLiveStatus?.status ?? "").toLowerCase();
    return s === "queued" || s === "running";
  }, [aiLiveStatus]);
  const aiLiveProgressPct = Number(aiLiveStatus?.progress_pct ?? 0) || 0;
  const aiLiveElapsedSec = Math.max(0, Math.floor((Number(aiLiveStatus?.elapsed_ms ?? 0) || 0) / 1000));
  const aiLiveEtaSec = Number(aiLiveStatus?.eta_sec ?? 0) || 0;
  const aiLivePhase = String(aiLiveStatus?.phase ?? "preparing");

  useEffect(() => {
    if (benchmarkResultsForAiQuery.data) {
      setBenchmarkSourceJson(benchmarkResultsForAiQuery.data as Record<string, unknown>);
    }
  }, [benchmarkResultsForAiQuery.data]);

  useEffect(() => {
    if (!aiTaskStatusQuery.data) return;
    setAiTaskStatus(aiTaskStatusQuery.data);
    const status = String(aiTaskStatusQuery.data.status ?? "").toLowerCase();
    if (status === "completed" && selectedBenchmarkId && aiTaskId && resolvedTaskId !== aiTaskId) {
      setResolvedTaskId(aiTaskId);
      ocrApi
        .getBenchmarkAiReviewTaskResult(selectedBenchmarkId, aiTaskId)
        .then((data) => {
          setAiRunResult(data);
          setIaTab("resultado");
          toast.success("Análisis IA completado");
          aiByBenchmarkQuery.refetch();
          aiGlobalQuery.refetch();
        })
        .catch((error) => {
          if (error instanceof HttpError && error.status === 409) return;
          toast.error("No se pudo cargar resultado final", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
        });
    } else if (status === "failed" || status === "cancelled") {
      const detail = aiTaskStatusQuery.data.error_detail || aiTaskStatusQuery.data.warnings?.[0] || "El task de IA finalizó con error";
      toast.error("Análisis IA falló", { description: detail });
    }
  }, [aiTaskStatusQuery.data, selectedBenchmarkId, aiTaskId, resolvedTaskId, aiByBenchmarkQuery, aiGlobalQuery]);

  useEffect(() => {
    if (!selectedBenchmarkId || !useAsyncAi) return;
    ocrApi
      .getBenchmarkAiReviewLatestTask(selectedBenchmarkId)
      .then((latest) => {
        if (!latest?.task_id) return;
        const status = String(latest.status ?? "").toLowerCase();
        if (status === "queued" || status === "running" || status === "completed") {
          setAiTaskId(latest.task_id);
          setAiTaskStatus(latest);
        }
      })
      .catch(() => undefined);
  }, [selectedBenchmarkId, useAsyncAi]);

  const batchIsRunning = useMemo(() => {
    const status = String(benchmarkDetailQuery.data?.status ?? benchmarkCreated?.status ?? "").toLowerCase();
    return ["running", "queued", "processing"].includes(status);
  }, [benchmarkDetailQuery.data?.status, benchmarkCreated?.status]);

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-2xl border border-lime-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-lime-950/40 shadow-xl shadow-lime-950/20">
        <div className="border-b border-white/5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-lime-300" />
                <h1 className="font-heading text-xl font-semibold tracking-tight text-white sm:text-2xl">Calidad IA</h1>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Observabilidad del pipeline, benchmarks offline y ejecución batch con analista IA.
              </p>
            </div>
            <Badge className="border-lime-300/30 bg-lime-500/10 text-lime-100">{account}</Badge>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
          <QualityTabButton
            active={tab === "observabilidad"}
            onClick={() => setTab("observabilidad")}
            icon={<Activity className="h-4 w-4" />}
            label="Observabilidad"
            description="Salud operativa, alertas y deriva"
          />
          <QualityTabButton
            active={tab === "benchmark_offline"}
            onClick={() => setTab("benchmark_offline")}
            icon={<Target className="h-4 w-4" />}
            label="Benchmark offline"
            description="Golden set sobre jobs históricos"
          />
          <QualityTabButton
            active={tab === "benchmark_batch"}
            onClick={() => setTab("benchmark_batch")}
            icon={<BarChart3 className="h-4 w-4" />}
            label="Benchmark batch"
            description="Lotes, historial e IA analista"
          />
        </div>
      </section>

      {tab === "observabilidad" ? (
        <>
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                Consulta de observabilidad
              </CardTitle>
              <CardDescription>Define la ventana de jobs y umbrales de alerta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2"><Label>Cuenta</Label><Input value={obsForm.account_name} onChange={(e) => setObsForm((p) => ({ ...p, account_name: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Desde</Label><Input type="date" value={obsForm.created_from} onChange={(e) => setObsForm((p) => ({ ...p, created_from: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Hasta</Label><Input type="date" value={obsForm.created_to} onChange={(e) => setObsForm((p) => ({ ...p, created_to: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Límite de jobs</Label><Input value={obsForm.limit_jobs} onChange={(e) => setObsForm((p) => ({ ...p, limit_jobs: e.target.value }))} /></div>
              </div>
              <details className="rounded-lg border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-200">Umbrales de alerta (avanzado)</summary>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="space-y-2"><Label>Needs review máx.</Label><Input value={obsForm.alert_needs_review_rate} onChange={(e) => setObsForm((p) => ({ ...p, alert_needs_review_rate: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>LLM OK mín.</Label><Input value={obsForm.alert_llm_ok_rate_drop_below} onChange={(e) => setObsForm((p) => ({ ...p, alert_llm_ok_rate_drop_below: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Fallback máx.</Label><Input value={obsForm.alert_llm_fallback_rate_above} onChange={(e) => setObsForm((p) => ({ ...p, alert_llm_fallback_rate_above: e.target.value }))} /></div>
                </div>
              </details>
              <Button onClick={() => obsMutation.mutate({
                account_name: obsForm.account_name,
                created_from: obsForm.created_from || undefined,
                created_to: obsForm.created_to || undefined,
                limit_jobs: Number(obsForm.limit_jobs || 500),
                alert_needs_review_rate: Number(obsForm.alert_needs_review_rate || 0.25),
                alert_llm_ok_rate_drop_below: Number(obsForm.alert_llm_ok_rate_drop_below || 0.75),
                alert_llm_fallback_rate_above: Number(obsForm.alert_llm_fallback_rate_above || 0.3),
                job_ids: [],
              })} disabled={obsMutation.isPending}>
                {obsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Actualizar observabilidad
              </Button>
            </CardContent>
          </Card>
          {!obsRan ? <EmptyState title="Sin consulta aún" description="Configura filtros y pulsa Actualizar observabilidad." /> : null}
          {obsMutation.error instanceof HttpError ? (
            <Card className="border-rose-300/30 bg-rose-500/10"><CardContent className="py-4 text-sm text-rose-200">Error: {obsMutation.error.detail}</CardContent></Card>
          ) : null}
          {obsData ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <QualityKpiCard label="Needs review" value={pct(obsData.summary.needs_review_rate)} accent="from-cyan-500/10" bar={obsData.summary.needs_review_rate} barClass="bg-cyan-400" />
                <QualityKpiCard label="Invention proxy" value={pct(obsData.summary.invention_rate_proxy)} accent="from-rose-500/10" bar={obsData.summary.invention_rate_proxy} barClass="bg-rose-400" />
                <QualityKpiCard label="LLM OK" value={pct(obsData.summary.llm_ok_rate)} accent="from-emerald-500/10" bar={obsData.summary.llm_ok_rate} barClass="bg-emerald-400" />
                <QualityKpiCard label="LLM fallback" value={pct(obsData.summary.llm_fallback_rate)} accent="from-amber-500/10" bar={obsData.summary.llm_fallback_rate} barClass="bg-amber-400" />
                <QualityKpiCard label="Filas analizadas" value={String(obsData.summary.total_rows)} hint="En la ventana" accent="from-violet-500/10" />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card className="border-white/10 bg-white/5">
                  <CardHeader><CardTitle className="text-base">Alertas operativas</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(obsData.alerts ?? []).length ? obsData.alerts.map((a, i) => (
                      <div key={`al-${i}`} className="flex items-start gap-2 rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <div><p className="font-medium text-amber-100">{a.code}</p><p className="text-amber-50/90">{a.message}</p></div>
                      </div>
                    )) : (
                      <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">Sin alertas en la ventana actual.</div>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5">
                  <CardHeader><CardTitle className="text-base">Latencia por etapa (p95)</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {sortedLatency.slice(0, 6).map((row) => (
                      <div key={`l-${row.step}`}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-slate-300">{toTitleCase(row.step)}</span>
                          <span className="font-mono text-slate-400">{Math.round(row.p95_ms)} ms</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                            style={{ width: `${Math.min(100, Math.max(6, (row.p95_ms / Math.max(sortedLatency[0]?.p95_ms || 1, 1)) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
              <Card className="border-white/10 bg-white/5">
                <CardHeader><CardTitle className="text-base">Deriva por cadena / categoría</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(obsData.drift_chain_category ?? []).map((row, i) => (
                      <div key={`d-${i}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-200">{row.chain_category}</span>
                          <span className="text-slate-500">{row.rows} filas</span>
                        </div>
                        <MetricBarRow label="Needs review" value={row.needs_review_rate} tone="bg-fuchsia-400" />
                        <div className="mt-2">{driftBadge(row.needs_review_rate)}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "benchmark_offline" ? (
        <>
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-amber-300" />Benchmark offline (golden set)</CardTitle>
              <CardDescription>Evalúa jobs históricos contra un golden path sin subir imágenes nuevas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <StepBadge step={1} label="Golden path" />
                <StepBadge step={2} label="Ventana temporal" />
                <StepBadge step={3} label="Ejecutar" />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2"><Label>Cuenta</Label><Input value={offlineForm.account_name} onChange={(e) => setOfflineForm((p) => ({ ...p, account_name: e.target.value }))} /></div>
                <div className="space-y-2 md:col-span-2"><Label>Golden path</Label><Input placeholder="ruta/al/golden.json" value={offlineForm.golden_path} onChange={(e) => setOfflineForm((p) => ({ ...p, golden_path: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Desde</Label><Input type="date" value={offlineForm.created_from} onChange={(e) => setOfflineForm((p) => ({ ...p, created_from: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Hasta</Label><Input type="date" value={offlineForm.created_to} onChange={(e) => setOfflineForm((p) => ({ ...p, created_to: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Límite jobs</Label><Input value={offlineForm.limit_jobs} onChange={(e) => setOfflineForm((p) => ({ ...p, limit_jobs: e.target.value }))} /></div>
              </div>
              <Button onClick={() => {
                if (!offlineForm.golden_path.trim()) return toast.error("golden_path es requerido");
                offlineMutation.mutate({
                  account_name: offlineForm.account_name,
                  golden_path: offlineForm.golden_path.trim(),
                  created_from: offlineForm.created_from || undefined,
                  created_to: offlineForm.created_to || undefined,
                  limit_jobs: Number(offlineForm.limit_jobs || 500),
                  job_ids: [],
                });
              }} disabled={offlineMutation.isPending}>
                {offlineMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Ejecutar benchmark offline
              </Button>
            </CardContent>
          </Card>
          {!offlineRan ? <EmptyState title="Benchmark no ejecutado" description="Indica el golden path y lanza la evaluación offline." /> : null}
          {offlineData ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <QualityKpiCard label="Revisados" value={String(offlineData.metrics.checked)} accent="from-slate-500/10" />
                <QualityKpiCard label="Exactitud nombre" value={pct(offlineData.metrics.exactitud_nombre)} accent="from-emerald-500/10" bar={offlineData.metrics.exactitud_nombre} barClass="bg-emerald-400" />
                <QualityKpiCard label="Exactitud promo/precio" value={pct(offlineData.metrics.exactitud_promo_precio)} accent="from-lime-500/10" bar={offlineData.metrics.exactitud_promo_precio} barClass="bg-lime-400" />
                <QualityKpiCard label="Recall productos" value={pct(offlineData.metrics.recall_productos_validos)} accent="from-cyan-500/10" bar={offlineData.metrics.recall_productos_validos} barClass="bg-cyan-400" />
                <QualityKpiCard label="Needs review" value={pct(offlineData.metrics.tasa_needs_review)} accent="from-amber-500/10" bar={offlineData.metrics.tasa_needs_review} barClass="bg-amber-400" />
                <QualityKpiCard label="Invention proxy" value={pct(offlineData.metrics.tasa_invento_proxy)} accent="from-rose-500/10" bar={offlineData.metrics.tasa_invento_proxy} barClass="bg-rose-400" />
              </div>
              <Card className="border-white/10 bg-white/5">
                <CardHeader>
                  <CardTitle className="text-base">Misses ({misses.length})</CardTitle>
                  <CardDescription>Casos que no pasaron la validación contra golden.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <Table>
                      <TableHeader><TableRow><TableHead>Clave</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {pagedMisses.map((m, i) => (
                          <TableRow key={`m-${i}`}><TableCell className="font-mono text-xs">{m.key}</TableCell><TableCell>{m.reason}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">{missOffset + 1}–{Math.min(missOffset + 10, misses.length)} de {misses.length}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={missOffset === 0} onClick={() => setMissOffset((x) => Math.max(0, x - 10))}>Anterior</Button>
                      <Button size="sm" variant="outline" disabled={missOffset + 10 >= misses.length} onClick={() => setMissOffset((x) => x + 10)}>Siguiente</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "benchmark_batch" ? (
        <div className="space-y-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-lime-300" />Benchmark batch</CardTitle>
              <CardDescription>Ejecuta lotes, revisa historial y lanza el analista IA sobre reportes.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <QualitySubTab active={batchTab === "ejecutar"} onClick={() => setBatchTab("ejecutar")}><Play className="mr-1 inline h-3.5 w-3.5" />Ejecutar</QualitySubTab>
              <QualitySubTab active={batchTab === "historial"} onClick={() => setBatchTab("historial")}><History className="mr-1 inline h-3.5 w-3.5" />Historial</QualitySubTab>
              <QualitySubTab active={batchTab === "ia"} onClick={() => setBatchTab("ia")}><Bot className="mr-1 inline h-3.5 w-3.5" />IA Analista</QualitySubTab>
            </CardContent>
          </Card>

          {batchTab === "historial" ? (
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-base">Historial de benchmarks</CardTitle>
                <CardDescription>Últimos 50 runs de la cuenta. Abre uno para analizarlo con IA.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {benchmarkHistoryQuery.isLoading ? <p className="text-sm text-slate-400">Cargando historial…</p> : null}
                {(benchmarkHistoryQuery.data ?? []).map((row) => (
                  <div key={row.benchmark_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-slate-100">{row.benchmark_id}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Job {row.job_id} · {toTitleCase(row.mode)} · {row.total_images ?? 0} imgs
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{row.created_at ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {benchmarkStatusBadge(row.status)}
                      <Button size="sm" variant="outline" onClick={() => { setSelectedBenchmarkId(row.benchmark_id); setBatchTab("ia"); setIaTab("ejecutar"); }}>
                        Abrir <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {!benchmarkHistoryQuery.isLoading && !(benchmarkHistoryQuery.data ?? []).length ? (
                  <EmptyState title="Sin benchmarks" description="Ejecuta un batch para ver historial aquí." />
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {batchTab === "ia" ? (
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-300" />IA Analista</CardTitle>
                <CardDescription>Prompts, ejecución async, resultados y efectividad del analista sobre benchmarks.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-violet-400/20 bg-violet-500/10 p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Label>Benchmark seleccionado</Label>
                      <Input className="font-mono text-xs" placeholder="benchmark_id" value={selectedBenchmarkId} onChange={(e) => setSelectedBenchmarkId(e.target.value)} />
                    </div>
                    <div className="flex items-end">
                      <Button variant="outline" onClick={() => { if (selectedBenchmarkId) selectedBenchmarkReportQuery.refetch(); }}>Cargar reporte</Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <QualitySubTab active={iaTab === "prompt"} onClick={() => setIaTab("prompt")}>Prompt</QualitySubTab>
                  <QualitySubTab active={iaTab === "ejecutar"} onClick={() => setIaTab("ejecutar")}>Ejecutar</QualitySubTab>
                  <QualitySubTab active={iaTab === "resultado"} onClick={() => setIaTab("resultado")}>Resultado</QualitySubTab>
                  <QualitySubTab active={iaTab === "historial"} onClick={() => setIaTab("historial")}>Historial IA</QualitySubTab>
                  <QualitySubTab active={iaTab === "efectividad"} onClick={() => setIaTab("efectividad")}>Efectividad</QualitySubTab>
                </div>
                {iaTab === "efectividad" ? <Card className="border-white/10 bg-black/20">
                  <CardHeader><CardTitle className="text-base">Efectividad del analista IA</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <QualityKpiCard label="Success rate" value={pct(aiEffectivenessQuery.data?.summary.success_rate ?? 0)} accent="from-emerald-500/10" bar={aiEffectivenessQuery.data?.summary.success_rate} barClass="bg-emerald-400" />
                      <QualityKpiCard label="Empty rate" value={pct(aiEffectivenessQuery.data?.summary.empty_rate ?? 0)} accent="from-slate-500/10" bar={aiEffectivenessQuery.data?.summary.empty_rate} barClass="bg-slate-400" />
                      <QualityKpiCard label="Parse errors" value={pct(aiEffectivenessQuery.data?.summary.parse_error_rate ?? 0)} accent="from-amber-500/10" bar={aiEffectivenessQuery.data?.summary.parse_error_rate} barClass="bg-amber-400" />
                      <QualityKpiCard label="Hard errors" value={pct(aiEffectivenessQuery.data?.summary.hard_error_rate ?? 0)} accent="from-rose-500/10" bar={aiEffectivenessQuery.data?.summary.hard_error_rate} barClass="bg-rose-400" />
                      <QualityKpiCard label="Avg score" value={(aiEffectivenessQuery.data?.summary.avg_success_score ?? 0).toFixed(2)} accent="from-violet-500/10" />
                      <QualityKpiCard label="Reviews" value={String(aiEffectivenessQuery.data?.summary.total_reviews ?? 0)} accent="from-cyan-500/10" />
                    </div>
                    <div className="overflow-x-auto">
                      <Table><TableHeader><TableRow><TableHead>model</TableHead><TableHead>success</TableHead><TableHead>empty</TableHead><TableHead>parse</TableHead><TableHead>hard</TableHead><TableHead>avg_score</TableHead></TableRow></TableHeader><TableBody>{(aiEffectivenessQuery.data?.by_model ?? []).map((r) => <TableRow key={`eff-${r.model}`}><TableCell>{r.model}</TableCell><TableCell>{pct(r.success_rate)}</TableCell><TableCell>{pct(r.empty_rate)}</TableCell><TableCell>{pct(r.parse_error_rate)}</TableCell><TableCell>{pct(r.hard_error_rate)}</TableCell><TableCell>{r.avg_success_score.toFixed(2)}</TableCell></TableRow>)}</TableBody></Table>
                    </div>
                  </CardContent>
                </Card> : null}
                {iaTab === "prompt" ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2"><Label>model</Label><Input value={promptModel} onChange={(e) => setPromptModel(e.target.value)} /></div>
                      <div className="flex items-end gap-2"><Button onClick={() => { if (!promptDraft.trim()) return toast.error("Prompt requerido"); createPromptMutation.mutate(); }} disabled={createPromptMutation.isPending}>Crear nueva versión</Button><Button variant="outline" onClick={() => bootstrapPromptMutation.mutate()} disabled={bootstrapPromptMutation.isPending}>Instalar prompt estricto v2</Button></div>
                      <div className="space-y-2 md:col-span-2"><Label>prompt</Label><textarea className="min-h-32 w-full rounded-md border border-white/10 bg-slate-900 p-2 text-sm" value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} /></div>
                    </div>
                    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>version</TableHead><TableHead>activa</TableHead><TableHead>model</TableHead><TableHead>created_at</TableHead><TableHead>acción</TableHead></TableRow></TableHeader><TableBody>{(promptsQuery.data ?? []).map((p) => <TableRow key={p.version}><TableCell>v{p.version}</TableCell><TableCell>{p.is_active ? "sí" : "no"}</TableCell><TableCell>{p.model ?? "-"}</TableCell><TableCell>{p.created_at ?? "-"}</TableCell><TableCell><Button size="sm" variant="outline" disabled={p.is_active || activatePromptMutation.isPending} onClick={() => activatePromptMutation.mutate(p.version)}>Activar</Button></TableCell></TableRow>)}</TableBody></Table></div>
                  </div>
                ) : null}
                {iaTab === "ejecutar" ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2"><Label>model</Label><Input value={aiRunModel} onChange={(e) => setAiRunModel(e.target.value)} /></div>
                      <div className="space-y-2"><Label>prompt_version</Label><Input value={aiRunPromptVersion} onChange={(e) => setAiRunPromptVersion(e.target.value)} /></div>
                      <div className="space-y-2"><Label>notes</Label><Input value={aiRunNotes} onChange={(e) => setAiRunNotes(e.target.value)} /></div>
                      <div className="space-y-2"><Label>compact_mode</Label><select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={aiCompactMode ? "on" : "off"} onChange={(e) => setAiCompactMode(e.target.value === "on")}><option value="on">ON</option><option value="off">OFF</option></select></div>
                      <div className="space-y-2"><Label>max_prompt_chars</Label><Input value={aiMaxPromptChars} onChange={(e) => setAiMaxPromptChars(e.target.value)} /></div>
                      <div className="space-y-2"><Label>max_chunks</Label><Input value={aiMaxChunks} onChange={(e) => setAiMaxChunks(e.target.value)} /></div>
                      <div className="space-y-2"><Label>chunk_overlap_chars</Label><Input value={aiChunkOverlapChars} onChange={(e) => setAiChunkOverlapChars(e.target.value)} /></div>
                      <div className="space-y-2"><Label>usar JSON precalculado</Label><select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={usePrecalculatedData ? "on" : "off"} onChange={(e) => setUsePrecalculatedData(e.target.value === "on")}><option value="on">ON</option><option value="off">OFF</option></select></div>
                      <div className="space-y-2"><Label>modo ejecución</Label><select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={useAsyncAi ? "async" : "sync"} onChange={(e) => setUseAsyncAi(e.target.value === "async")}><option value="async">Async (recomendado)</option><option value="sync">Sync (legacy)</option></select></div>
                    </div>
                    <Button
                      onClick={() => {
                        if (!selectedBenchmarkId) return toast.error("Selecciona benchmark_id");
                        if (useAsyncAi) {
                          runAiAsyncMutation.mutate();
                        } else {
                          runAiMutation.mutate();
                        }
                      }}
                      disabled={runAiMutation.isPending || runAiAsyncMutation.isPending || isAiRunning}
                    >
                      {runAiMutation.isPending || runAiAsyncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Analizar Benchmark
                    </Button>
                    {isAiRunning ? (
                      <Card className="border-cyan-300/30 bg-cyan-500/10">
                        <CardContent className="space-y-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-cyan-100">Analizando benchmark con IA...</p>
                            <p className="text-xs text-cyan-100/90">Tiempo transcurrido: {String(Math.floor(aiLiveElapsedSec / 60)).padStart(2, "0")}:{String(aiLiveElapsedSec % 60).padStart(2, "0")}</p>
                          </div>
                          <p className="text-xs text-cyan-100/90">
                            Fase: {aiPhaseLabel(aiLivePhase)}
                          </p>
                          <p className="text-xs text-cyan-100/90">
                            Progreso: {aiLiveStatus?.chunk_index ?? 0}/{aiLiveStatus?.chunk_total ?? 0} chunks
                            {aiLiveEtaSec > 0 ? ` · ETA ${Math.ceil(aiLiveEtaSec / 60)} min` : ""}
                          </p>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-cyan-950/60">
                            <div className="h-full rounded-full bg-cyan-400 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, aiLiveProgressPct))}%` }} />
                          </div>
                          <p className="text-xs text-cyan-100/80">
                            Procesando chunks del análisis IA. Esto puede tardar varios minutos según tamaño y modelo.
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (!selectedBenchmarkId) return toast.error("Selecciona benchmark_id");
                          try {
                            const data = await benchmarkResultsForAiQuery.refetch();
                            if (!data.data) {
                              toast.error("No se pudo cargar resultados del benchmark");
                              return;
                            }
                            setBenchmarkSourceJson(data.data as Record<string, unknown>);
                            toast.success("JSON fuente cargado");
                          } catch (error) {
                            toast.error("No se pudo cargar JSON fuente", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
                          }
                        }}
                        disabled={benchmarkResultsForAiQuery.isFetching}
                      >
                        {benchmarkResultsForAiQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Cargar JSON fuente (benchmark/results)
                      </Button>
                      {selectedBenchmarkReportQuery.data?.artifacts?.master_json_url ? (
                        <a href={selectedBenchmarkReportQuery.data.artifacts.master_json_url} target="_blank" rel="noreferrer">
                          <Button variant="outline">Abrir master JSON</Button>
                        </a>
                      ) : null}
                    </div>
                    {benchmarkSourceJson ? (
                      <Card className="border-white/10 bg-black/20">
                        <CardHeader><CardTitle className="text-sm">Fuente de datos benchmark (JSON real)</CardTitle></CardHeader>
                        <CardContent>
                          <pre className="max-h-80 overflow-auto rounded-md border border-white/10 bg-black/20 p-3 text-xs">{JSON.stringify(benchmarkSourceJson, null, 2)}</pre>
                        </CardContent>
                      </Card>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">task_id: {aiTaskId || "-"}</Badge>
                      <Badge variant="outline">task_status: {String(aiLiveStatus?.status ?? "-")}</Badge>
                      <Badge variant="outline">task_phase: {String(aiLiveStatus?.phase ?? "-")}</Badge>
                      <Badge variant="outline">input_kind: {String(aiResultMeta.input_kind ?? "-")}</Badge>
                      <Badge variant="outline">chosen_result_source: {String(aiInputDiagnostics.chosen_result_source ?? "-")}</Badge>
                      <Badge variant="outline">master_keys_count: {String(aiResultMeta.master_keys_count ?? "-")}</Badge>
                      <Badge variant="outline">used_chunking: {String(aiResultMeta.used_chunking ?? false)}</Badge>
                      <Badge variant="outline">chunk_count: {String(aiResultMeta.chunk_count ?? 0)}</Badge>
                      <Badge variant="outline">max_prompt_chars: {String(aiResultMeta.max_prompt_chars ?? "-")}</Badge>
                      <Badge variant="outline">prompt_chars: {String(aiResultMeta.prompt_chars ?? "-")}</Badge>
                      <Badge variant="outline">parse_error: {String(aiResultMeta.parse_error ?? false)}</Badge>
                      <Badge variant="outline">hard_error: {String(aiResultMeta.hard_error ?? false)}</Badge>
                      {scoreBadge(aiSuccessScore)}
                    </div>
                    <Card className="border-white/10 bg-black/20">
                      <CardHeader><CardTitle className="text-sm">Diagnóstico de entrada</CardTitle></CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        {aiInputDiagnostics.auto_retry_triggered === true ? (
                          <div className="rounded-md border border-cyan-300/35 bg-cyan-500/10 px-3 py-2 text-cyan-100">
                            Se reintentó automáticamente en modo profundo.
                          </div>
                        ) : null}
                        {aiInputDiagnostics.master_json_read_error ? (
                          <div className="rounded-md border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-amber-100">
                            Warning: {String(aiInputDiagnostics.master_json_read_error)}
                          </div>
                        ) : null}
                        <div className="grid gap-2 md:grid-cols-2">
                          <div><span className="text-muted-foreground">master_json_source:</span> {String(aiInputDiagnostics.master_json_source ?? "-")}</div>
                          <div><span className="text-muted-foreground">master_json_path_used:</span> {String(aiInputDiagnostics.master_json_path_used ?? "-")}</div>
                          <div><span className="text-muted-foreground">master_json_file_exists:</span> {String(aiInputDiagnostics.master_json_file_exists ?? "-")}</div>
                          <div><span className="text-muted-foreground">master_json_file_size_bytes:</span> {String(aiInputDiagnostics.master_json_file_size_bytes ?? "-")}</div>
                          <div><span className="text-muted-foreground">chosen_result_source:</span> {String(aiInputDiagnostics.chosen_result_source ?? "-")}</div>
                          <div><span className="text-muted-foreground">compact_too_short_detected:</span> {String(aiInputDiagnostics.compact_too_short_detected ?? "-")}</div>
                          <div><span className="text-muted-foreground">auto_deep_fallback_triggered:</span> {String(aiInputDiagnostics.auto_deep_fallback_triggered ?? "-")}</div>
                          <div><span className="text-muted-foreground">auto_retry_triggered:</span> {String(aiInputDiagnostics.auto_retry_triggered ?? "-")}</div>
                          <div><span className="text-muted-foreground">compact_images_count:</span> {String(aiInputDiagnostics.compact_images_count ?? "-")}</div>
                          <div><span className="text-muted-foreground">compact_products_count:</span> {String(aiInputDiagnostics.compact_products_count ?? "-")}</div>
                          <div><span className="text-muted-foreground">compact_prompt_chars_before_llm:</span> {String(aiInputDiagnostics.compact_prompt_chars_before_llm ?? "-")}</div>
                          <div><span className="text-muted-foreground">deep_prompt_chars:</span> {String(aiInputDiagnostics.deep_prompt_chars ?? "-")}</div>
                          <div><span className="text-muted-foreground">deep_chunk_count:</span> {String(aiInputDiagnostics.deep_chunk_count ?? "-")}</div>
                          <div className="md:col-span-2"><span className="text-muted-foreground">compact_input_keys:</span> {Array.isArray(aiInputDiagnostics.compact_input_keys) ? aiInputDiagnostics.compact_input_keys.join(", ") : String(aiInputDiagnostics.compact_input_keys ?? "-")}</div>
                        </div>
                      </CardContent>
                    </Card>
                    {aiResultWarning ? <div className="rounded-md border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{aiResultWarning}</div> : null}
                    {aiIsEmptyResult ? <Button variant="outline" onClick={() => { setAiMaxPromptChars("12000"); setAiCompactMode(true); toast.info("Sugerido: prompt más corto y compacto activado"); }}>Reintentar con menor max_prompt_chars</Button> : null}
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Meta respuesta</p>
                        <pre className="max-h-80 overflow-auto rounded-md border border-white/10 bg-black/20 p-3 text-xs">{JSON.stringify(aiRawPayload, null, 2)}</pre>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Análisis IA (contenido)</p>
                        <pre className="max-h-80 overflow-auto rounded-md border border-cyan-400/25 bg-cyan-500/5 p-3 text-xs">{JSON.stringify(aiAnalysisPayload, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                ) : null}
                {iaTab === "resultado" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Técnico: {aiSuccessScore.toFixed(2)}</Badge>
                      {scoreBadge(aiSuccessScore)}
                      <Badge variant="outline">Contenido: {aiContentQualityScore.toFixed(2)}</Badge>
                      {scoreBadge(aiContentQualityScore)}
                      <Badge variant={aiIsInformative ? "default" : "secondary"}>{aiIsInformative ? "Informativo" : "Poco informativo"}</Badge>
                    </div>
                    {!aiIsInformative ? <div className="rounded-md border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">Respuesta válida pero poco informativa. Reintentar con prompt v2 y notas más específicas.</div> : null}
                    {aiContentSignals.length ? <div className="flex flex-wrap gap-2">{aiContentSignals.map((s) => <Badge key={`sig-${s}`} variant="secondary">{s}</Badge>)}</div> : null}
                    {aiPrettyView ? <div className="grid gap-3 md:grid-cols-2">
                      <Card className="border-white/10 bg-black/20"><CardHeader><CardTitle className="text-sm">Resumen ejecutivo</CardTitle></CardHeader><CardContent><pre className="max-h-56 overflow-auto text-xs">{JSON.stringify(aiPrettyView.executive_summary ?? {}, null, 2)}</pre></CardContent></Card>
                      <Card className="border-white/10 bg-black/20"><CardHeader><CardTitle className="text-sm">Salud del pipeline</CardTitle></CardHeader><CardContent><pre className="max-h-56 overflow-auto text-xs">{JSON.stringify(aiPrettyView.pipeline_health ?? {}, null, 2)}</pre></CardContent></Card>
                      <Card className="border-white/10 bg-black/20"><CardHeader><CardTitle className="text-sm">Top fallos y anomalías</CardTitle></CardHeader><CardContent><pre className="max-h-56 overflow-auto text-xs">{JSON.stringify({ top_failures: aiPrettyView.top_failures ?? [], anomalies: aiPrettyView.anomalies ?? [] }, null, 2)}</pre></CardContent></Card>
                      <Card className="border-white/10 bg-black/20"><CardHeader><CardTitle className="text-sm">Acciones recomendadas</CardTitle></CardHeader><CardContent><pre className="max-h-56 overflow-auto text-xs">{JSON.stringify(aiPrettyView.recommended_actions ?? [], null, 2)}</pre></CardContent></Card>
                    </div> : <p className="text-sm text-muted-foreground">No hay pretty_view en esta respuesta. Usa fallback JSON.</p>}
                    <details className="rounded-md border border-white/10 bg-black/20 p-3"><summary className="cursor-pointer text-sm">JSON crudo</summary><pre className="mt-2 max-h-80 overflow-auto text-xs">{JSON.stringify(aiAnalysisPayload ?? {}, null, 2)}</pre></details>
                  </div>
                ) : null}
                {iaTab === "historial" ? (
                  <div className="overflow-x-auto">
                    <Table><TableHeader><TableRow><TableHead>review_id</TableHead><TableHead>benchmark_id</TableHead><TableHead>job_id</TableHead><TableHead>model</TableHead><TableHead>prompt_version</TableHead><TableHead>success</TableHead><TableHead>content</TableHead><TableHead>info</TableHead><TableHead>estado</TableHead><TableHead>created_at</TableHead><TableHead>acción</TableHead></TableRow></TableHeader><TableBody>{aiRows.map((r) => {
                      const empty = isEmptyAiResultPayload(r.response_json ?? null);
                      const meta = (r.response_json?.meta ?? r.response_json?.result_meta ?? {}) as Record<string, unknown>;
                      const success = Number(meta.success_score ?? 0) || 0;
                      const content = Number(meta.content_quality_score ?? 0) || 0;
                      const informative = Boolean(meta.is_informative ?? false);
                      return <TableRow key={`${r.review_id}-${r.created_at ?? ""}`}><TableCell className="font-mono text-xs">{r.review_id}</TableCell><TableCell className="font-mono text-xs">{r.benchmark_id}</TableCell><TableCell className="font-mono text-xs">{r.job_id ?? "-"}</TableCell><TableCell>{r.model ?? "-"}</TableCell><TableCell>{r.prompt_version ?? "-"}</TableCell><TableCell>{success.toFixed(2)}</TableCell><TableCell>{content.toFixed(2)}</TableCell><TableCell>{informative ? "Sí" : "No"}</TableCell><TableCell>{empty ? <Badge variant="secondary">Vacío</Badge> : <Badge>OK</Badge>}</TableCell><TableCell>{r.created_at ?? "-"}</TableCell><TableCell className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setSelectedBenchmarkId(r.benchmark_id); setAiRunModel(r.model ?? aiRunModel); setAiRunPromptVersion(r.prompt_version ? String(r.prompt_version) : ""); setIaTab("ejecutar"); }}>Reintentar</Button><Button size="sm" variant="outline" onClick={() => { setSelectedHistoryReview(r); setAiRunResult(r.response_json ?? {}); setIaTab("resultado"); }}>Ver detalle</Button></TableCell></TableRow>;
                    })}</TableBody></Table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {batchTab === "ejecutar" ? (
            <>
              <div className="grid gap-4 xl:grid-cols-12">
                <Card className="border-white/10 bg-white/5 xl:col-span-7">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-cyan-300" />Configurar y lanzar batch</CardTitle>
                    <CardDescription>Paso 1 configuración · Paso 2 upload · Paso 3 iniciar</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex flex-wrap gap-4">
                      <StepBadge step={1} label="Config" />
                      <StepBadge step={2} label="Imágenes" />
                      <StepBadge step={3} label="Iniciar" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2"><Label>Cuenta</Label><Input value={batchForm.account_name} onChange={(e) => setBatchForm((p) => ({ ...p, account_name: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Config</Label><Input value={batchForm.config_name} onChange={(e) => setBatchForm((p) => ({ ...p, config_name: e.target.value }))} /></div>
                      <div className="space-y-2">
                        <Label>Modo</Label>
                        <select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={batchForm.mode} onChange={(e) => setBatchForm((p) => ({ ...p, mode: e.target.value as "performance_only" | "quality_with_golden" }))}>
                          <option value="performance_only">Solo rendimiento</option>
                          <option value="quality_with_golden">Calidad con golden</option>
                        </select>
                      </div>
                      {batchForm.mode === "quality_with_golden" ? (
                        <div className="space-y-2 md:col-span-3"><Label>Golden path</Label><Input value={batchForm.golden_path} onChange={(e) => setBatchForm((p) => ({ ...p, golden_path: e.target.value }))} /></div>
                      ) : null}
                      <div className="space-y-2"><Label>Concurrencia</Label><Input value={batchForm.concurrency} onChange={(e) => setBatchForm((p) => ({ ...p, concurrency: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Reintentos / imagen</Label><Input value={batchForm.max_retries_per_image} onChange={(e) => setBatchForm((p) => ({ ...p, max_retries_per_image: e.target.value }))} /></div>
                      <div className="space-y-2"><Label>Timeout (s)</Label><Input value={batchForm.timeout_sec} onChange={(e) => setBatchForm((p) => ({ ...p, timeout_sec: e.target.value }))} /></div>
                    </div>
                    <UploadPanel files={selectedFiles} onFilesChange={setSelectedFiles} onUpload={() => uploadMutation.mutate(selectedFiles)} isUploading={uploadMutation.isPending} />
                    <UploadedFilesTable uploaded={uploadedItems} />
                    <Button onClick={() => {
                      if (!uploadedItems.length) return toast.error("Primero sube imágenes");
                      if (batchForm.mode === "quality_with_golden" && !batchForm.golden_path.trim()) return toast.error("golden_path es requerido");
                      createBatchMutation.mutate({
                        image_paths: [],
                        image_file_ids: uploadedItems.map((u) => u.file_id),
                        account_name: batchForm.account_name,
                        config_name: batchForm.config_name,
                        mode: batchForm.mode,
                        golden_path: batchForm.mode === "quality_with_golden" ? batchForm.golden_path.trim() : null,
                        concurrency: Number(batchForm.concurrency || 2),
                        max_retries_per_image: Number(batchForm.max_retries_per_image || 1),
                        timeout_sec: Number(batchForm.timeout_sec || 120),
                        export_excel: true,
                        output_name: null,
                        db_excel: null,
                        skip_qwen: null,
                        cadena: null,
                      });
                    }} disabled={createBatchMutation.isPending}>
                      {createBatchMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      Iniciar benchmark batch
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5 xl:col-span-5">
                  <CardHeader>
                    <CardTitle className="text-base">Estado del run</CardTitle>
                    <CardDescription>{benchmarkCreated ? "Monitoreo en vivo del benchmark activo." : "Aquí verás progreso tras iniciar."}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {benchmarkCreated ? (
                      <>
                        <div className="rounded-lg border border-cyan-400/25 bg-cyan-500/10 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono text-xs text-slate-100">{benchmarkCreated.benchmark_id}</p>
                            {benchmarkStatusBadge(benchmarkDetailQuery.data?.status ?? benchmarkCreated.status)}
                          </div>
                          <p className="mt-2 text-[11px] text-slate-400">Job {benchmarkDetailQuery.data?.job_id ?? benchmarkCreated.job_id}</p>
                          <p className="text-[11px] text-slate-400">{benchmarkDetailQuery.data?.total_images ?? benchmarkCreated.total_images} imágenes</p>
                          {batchIsRunning ? (
                            <div className="mt-3">
                              <div className="mb-1 flex justify-between text-[10px] text-cyan-200/80">
                                <span>Procesando…</span>
                                <span>{benchmarkEventsQuery.data?.length ?? 0} eventos</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                                <div className="h-full animate-pulse rounded-full bg-cyan-400" style={{ width: "66%" }} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md border border-white/10 bg-black/20 p-2"><p className="text-slate-500">Eventos</p><p className="font-semibold text-slate-100">{benchmarkEventsQuery.data?.length ?? 0}</p></div>
                          <div className="rounded-md border border-white/10 bg-black/20 p-2"><p className="text-slate-500">Métricas</p><p className="font-semibold text-slate-100">{benchmarkMetricsQuery.data?.metrics.length ?? 0}</p></div>
                        </div>
                        <Button size="sm" variant="outline" className="w-full" onClick={() => { setSelectedBenchmarkId(benchmarkCreated.benchmark_id); setBatchTab("ia"); setIaTab("ejecutar"); }}>
                          Analizar con IA <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <EmptyState title="Sin benchmark activo" description="Sube imágenes e inicia un batch para monitorear aquí." />
                    )}
                  </CardContent>
                </Card>
              </div>

              {benchmarkCreated ? (
                <>
                  <Card className="border-white/10 bg-white/5">
                    <CardHeader><CardTitle className="text-base">Analítica agregada</CardTitle></CardHeader>
                    <CardContent>
                      {benchmarkAnalyticsQuery.data ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <QualityKpiCard label="Needs review" value={pct(benchmarkAnalyticsQuery.data.summary?.needs_review_rate ?? 0)} accent="from-cyan-500/10" bar={benchmarkAnalyticsQuery.data.summary?.needs_review_rate} barClass="bg-cyan-400" />
                          <QualityKpiCard label="Invention" value={pct(benchmarkAnalyticsQuery.data.summary?.invention_rate_proxy ?? 0)} accent="from-rose-500/10" bar={benchmarkAnalyticsQuery.data.summary?.invention_rate_proxy} barClass="bg-rose-400" />
                          <QualityKpiCard label="LLM OK" value={pct(benchmarkAnalyticsQuery.data.summary?.llm_ok_rate ?? 0)} accent="from-emerald-500/10" bar={benchmarkAnalyticsQuery.data.summary?.llm_ok_rate} barClass="bg-emerald-400" />
                          <QualityKpiCard label="Fallback" value={pct(benchmarkAnalyticsQuery.data.summary?.llm_fallback_rate ?? 0)} accent="from-amber-500/10" bar={benchmarkAnalyticsQuery.data.summary?.llm_fallback_rate} barClass="bg-amber-400" />
                          <QualityKpiCard label="Filas" value={String(benchmarkAnalyticsQuery.data.summary?.total_rows ?? 0)} accent="from-violet-500/10" />
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">Sin analítica aún — el benchmark puede estar en curso.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card className="border-white/10 bg-white/5">
                    <CardHeader><CardTitle className="text-base">Reporte y artefactos</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {benchmarkReportQuery.data?.artifacts?.master_html_url ? <a href={benchmarkReportQuery.data.artifacts.master_html_url} target="_blank" rel="noreferrer"><Button size="sm">Master HTML</Button></a> : null}
                        {benchmarkReportQuery.data?.artifacts?.master_json_url ? <a href={benchmarkReportQuery.data.artifacts.master_json_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Master JSON</Button></a> : null}
                        {benchmarkReportQuery.data?.artifacts?.excel_url ? <a href={benchmarkReportQuery.data.artifacts.excel_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Excel</Button></a> : null}
                        <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(benchmarkReportQuery.data ?? {}, null, 2)); toast.success("Reporte copiado"); }}>Copiar JSON</Button>
                        <Button size="sm" variant="outline" onClick={() => downloadJson("benchmark_report.json", benchmarkReportQuery.data ?? {})}><Download className="mr-2 h-4 w-4" />Descargar</Button>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
