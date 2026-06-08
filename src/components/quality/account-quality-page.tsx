"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Loader2, RefreshCcw } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function scoreBadge(score: number): React.ReactNode {
  if (score >= 0.8) return <Badge>Verde</Badge>;
  if (score >= 0.5) return <Badge variant="secondary">Amarillo</Badge>;
  return <Badge variant="destructive">Rojo</Badge>;
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

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Calidad IA</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant={tab === "observabilidad" ? "default" : "outline"} onClick={() => setTab("observabilidad")}>Observabilidad operativa</Button>
          <Button variant={tab === "benchmark_offline" ? "default" : "outline"} onClick={() => setTab("benchmark_offline")}>Benchmark offline (golden set)</Button>
          <Button variant={tab === "benchmark_batch" ? "default" : "outline"} onClick={() => setTab("benchmark_batch")}>Benchmark Batch</Button>
        </CardContent>
      </Card>

      {tab === "observabilidad" ? (
        <>
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Filtros de observabilidad</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2"><Label>account_name</Label><Input value={obsForm.account_name} onChange={(e) => setObsForm((p) => ({ ...p, account_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>created_from</Label><Input type="date" value={obsForm.created_from} onChange={(e) => setObsForm((p) => ({ ...p, created_from: e.target.value }))} /></div>
              <div className="space-y-2"><Label>created_to</Label><Input type="date" value={obsForm.created_to} onChange={(e) => setObsForm((p) => ({ ...p, created_to: e.target.value }))} /></div>
              <div className="space-y-2"><Label>limit_jobs</Label><Input value={obsForm.limit_jobs} onChange={(e) => setObsForm((p) => ({ ...p, limit_jobs: e.target.value }))} /></div>
              <div className="space-y-2"><Label>alert_needs_review_rate</Label><Input value={obsForm.alert_needs_review_rate} onChange={(e) => setObsForm((p) => ({ ...p, alert_needs_review_rate: e.target.value }))} /></div>
              <div className="space-y-2"><Label>alert_llm_ok_rate_drop_below</Label><Input value={obsForm.alert_llm_ok_rate_drop_below} onChange={(e) => setObsForm((p) => ({ ...p, alert_llm_ok_rate_drop_below: e.target.value }))} /></div>
              <div className="space-y-2"><Label>alert_llm_fallback_rate_above</Label><Input value={obsForm.alert_llm_fallback_rate_above} onChange={(e) => setObsForm((p) => ({ ...p, alert_llm_fallback_rate_above: e.target.value }))} /></div>
              <div className="flex items-end"><Button onClick={() => obsMutation.mutate({
                account_name: obsForm.account_name,
                created_from: obsForm.created_from || undefined,
                created_to: obsForm.created_to || undefined,
                limit_jobs: Number(obsForm.limit_jobs || 500),
                alert_needs_review_rate: Number(obsForm.alert_needs_review_rate || 0.25),
                alert_llm_ok_rate_drop_below: Number(obsForm.alert_llm_ok_rate_drop_below || 0.75),
                alert_llm_fallback_rate_above: Number(obsForm.alert_llm_fallback_rate_above || 0.3),
                job_ids: [],
              })} disabled={obsMutation.isPending}>{obsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}Actualizar observabilidad</Button></div>
            </CardContent>
          </Card>
          {!obsRan ? <Card className="border-white/10 bg-white/5 backdrop-blur"><CardContent className="py-4 text-sm text-muted-foreground">Configura filtros y ejecuta consulta.</CardContent></Card> : null}
          {obsMutation.error instanceof HttpError ? <Card className="border-rose-300/30 bg-rose-500/10"><CardContent className="py-4 text-sm text-rose-200">Error: {obsMutation.error.detail}</CardContent></Card> : null}
          {obsData ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <Card className="border-white/10 bg-white/5 backdrop-blur"><CardContent className="py-4"><p className="text-xs text-muted-foreground">needs_review_rate</p><p className="text-xl font-semibold">{pct(obsData.summary.needs_review_rate)}</p></CardContent></Card>
                <Card className="border-white/10 bg-white/5 backdrop-blur"><CardContent className="py-4"><p className="text-xs text-muted-foreground">invention_rate_proxy</p><p className="text-xl font-semibold">{pct(obsData.summary.invention_rate_proxy)}</p></CardContent></Card>
                <Card className="border-white/10 bg-white/5 backdrop-blur"><CardContent className="py-4"><p className="text-xs text-muted-foreground">llm_ok_rate</p><p className="text-xl font-semibold">{pct(obsData.summary.llm_ok_rate)}</p></CardContent></Card>
                <Card className="border-white/10 bg-white/5 backdrop-blur"><CardContent className="py-4"><p className="text-xs text-muted-foreground">llm_fallback_rate</p><p className="text-xl font-semibold">{pct(obsData.summary.llm_fallback_rate)}</p></CardContent></Card>
              </div>
              <Card className="border-white/10 bg-white/5 backdrop-blur"><CardHeader><CardTitle>Alertas</CardTitle></CardHeader><CardContent className="space-y-2">{(obsData.alerts ?? []).length ? obsData.alerts.map((a, i) => <div key={`al-${i}`} className="flex items-start gap-2 rounded-md border border-amber-300/30 bg-amber-500/10 p-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" /><div><p className="font-medium">{a.code}</p><p>{a.message}</p></div></div>) : <Badge>Sin alertas</Badge>}</CardContent></Card>
              <Card className="border-white/10 bg-white/5 backdrop-blur"><CardHeader><CardTitle>Latencia por etapa</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>step</TableHead><TableHead>count</TableHead><TableHead>avg_ms</TableHead><TableHead>p95_ms</TableHead><TableHead>p99_ms</TableHead></TableRow></TableHeader><TableBody>{sortedLatency.map((r) => <TableRow key={`l-${r.step}`}><TableCell>{r.step}</TableCell><TableCell>{r.count}</TableCell><TableCell>{Math.round(r.avg_ms)}</TableCell><TableCell>{Math.round(r.p95_ms)}</TableCell><TableCell>{Math.round(r.p99_ms)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
              <Card className="border-white/10 bg-white/5 backdrop-blur"><CardHeader><CardTitle>Drift por cadena/categoría</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>chain_category</TableHead><TableHead>rows</TableHead><TableHead>needs_review_rate</TableHead><TableHead>semáforo</TableHead></TableRow></TableHeader><TableBody>{(obsData.drift_chain_category ?? []).map((r, i) => <TableRow key={`d-${i}`}><TableCell>{r.chain_category}</TableCell><TableCell>{r.rows}</TableCell><TableCell>{pct(r.needs_review_rate)}</TableCell><TableCell>{driftBadge(r.needs_review_rate)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "benchmark_offline" ? (
        <>
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Benchmark offline</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2"><Label>account_name</Label><Input value={offlineForm.account_name} onChange={(e) => setOfflineForm((p) => ({ ...p, account_name: e.target.value }))} /></div>
              <div className="space-y-2 md:col-span-2"><Label>golden_path</Label><Input value={offlineForm.golden_path} onChange={(e) => setOfflineForm((p) => ({ ...p, golden_path: e.target.value }))} /></div>
              <div className="space-y-2"><Label>created_from</Label><Input type="date" value={offlineForm.created_from} onChange={(e) => setOfflineForm((p) => ({ ...p, created_from: e.target.value }))} /></div>
              <div className="space-y-2"><Label>created_to</Label><Input type="date" value={offlineForm.created_to} onChange={(e) => setOfflineForm((p) => ({ ...p, created_to: e.target.value }))} /></div>
              <div className="space-y-2"><Label>limit_jobs</Label><Input value={offlineForm.limit_jobs} onChange={(e) => setOfflineForm((p) => ({ ...p, limit_jobs: e.target.value }))} /></div>
              <div className="flex items-end"><Button onClick={() => {
                if (!offlineForm.golden_path.trim()) return toast.error("golden_path es requerido");
                offlineMutation.mutate({
                  account_name: offlineForm.account_name,
                  golden_path: offlineForm.golden_path.trim(),
                  created_from: offlineForm.created_from || undefined,
                  created_to: offlineForm.created_to || undefined,
                  limit_jobs: Number(offlineForm.limit_jobs || 500),
                  job_ids: [],
                });
              }} disabled={offlineMutation.isPending}>{offlineMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}Ejecutar benchmark</Button></div>
            </CardContent>
          </Card>
          {!offlineRan ? <Card className="border-white/10 bg-white/5 backdrop-blur"><CardContent className="py-4 text-sm text-muted-foreground">Completa golden_path y ejecuta benchmark.</CardContent></Card> : null}
          {offlineData ? (
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader><CardTitle>Resultado benchmark</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div><p className="text-xs text-muted-foreground">checked</p><p>{offlineData.metrics.checked}</p></div>
                  <div><p className="text-xs text-muted-foreground">exactitud_nombre</p><p>{pct(offlineData.metrics.exactitud_nombre)}</p></div>
                  <div><p className="text-xs text-muted-foreground">exactitud_promo_precio</p><p>{pct(offlineData.metrics.exactitud_promo_precio)}</p></div>
                </div>
                <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>key</TableHead><TableHead>reason</TableHead></TableRow></TableHeader><TableBody>{pagedMisses.map((m, i) => <TableRow key={`m-${i}`}><TableCell>{m.key}</TableCell><TableCell>{m.reason}</TableCell></TableRow>)}</TableBody></Table></div>
                <div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={missOffset === 0} onClick={() => setMissOffset((x) => Math.max(0, x - 10))}>Anterior</Button><Button size="sm" variant="outline" disabled={missOffset + 10 >= misses.length} onClick={() => setMissOffset((x) => x + 10)}>Siguiente</Button></div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === "benchmark_batch" ? (
        <div className="space-y-4">
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Benchmark Batch</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant={batchTab === "ejecutar" ? "default" : "outline"} onClick={() => setBatchTab("ejecutar")}>Ejecutar</Button>
              <Button variant={batchTab === "historial" ? "default" : "outline"} onClick={() => setBatchTab("historial")}>Historial Benchmark</Button>
              <Button variant={batchTab === "ia" ? "default" : "outline"} onClick={() => setBatchTab("ia")}>IA Analista</Button>
            </CardContent>
          </Card>

          {batchTab === "historial" ? (
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader><CardTitle>Historial Benchmark</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table><TableHeader><TableRow><TableHead>benchmark_id</TableHead><TableHead>job_id</TableHead><TableHead>mode</TableHead><TableHead>job_status</TableHead><TableHead>total_images</TableHead><TableHead>created_at</TableHead><TableHead>acción</TableHead></TableRow></TableHeader><TableBody>{(benchmarkHistoryQuery.data ?? []).map((r) => <TableRow key={r.benchmark_id}><TableCell className="font-mono text-xs">{r.benchmark_id}</TableCell><TableCell className="font-mono text-xs">{r.job_id}</TableCell><TableCell>{r.mode}</TableCell><TableCell>{r.status}</TableCell><TableCell>{r.total_images ?? 0}</TableCell><TableCell>{r.created_at ?? "-"}</TableCell><TableCell><Button size="sm" variant="outline" onClick={() => { setSelectedBenchmarkId(r.benchmark_id); setBatchTab("ia"); setIaTab("ejecutar"); }}>Abrir</Button></TableCell></TableRow>)}</TableBody></Table>
              </CardContent>
            </Card>
          ) : null}

          {batchTab === "ia" ? (
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader><CardTitle>IA Analista</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2 md:col-span-2"><Label>benchmark_id</Label><Input value={selectedBenchmarkId} onChange={(e) => setSelectedBenchmarkId(e.target.value)} /></div>
                  <div className="flex items-end"><Button variant="outline" onClick={() => { if (selectedBenchmarkId) selectedBenchmarkReportQuery.refetch(); }}>Cargar reporte</Button></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant={iaTab === "prompt" ? "default" : "outline"} onClick={() => setIaTab("prompt")}>Prompt</Button>
                  <Button variant={iaTab === "ejecutar" ? "default" : "outline"} onClick={() => setIaTab("ejecutar")}>Ejecutar</Button>
                  <Button variant={iaTab === "resultado" ? "default" : "outline"} onClick={() => setIaTab("resultado")}>Resultado</Button>
                  <Button variant={iaTab === "historial" ? "default" : "outline"} onClick={() => setIaTab("historial")}>Historial IA</Button>
                  <Button variant={iaTab === "efectividad" ? "default" : "outline"} onClick={() => setIaTab("efectividad")}>Efectividad</Button>
                </div>
                {iaTab === "efectividad" ? <Card className="border-white/10 bg-black/20">
                  <CardHeader><CardTitle className="text-base">Efectividad IA</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-6">
                      <div><p className="text-xs text-muted-foreground">success_rate</p><p>{pct(aiEffectivenessQuery.data?.summary.success_rate ?? 0)}</p></div>
                      <div><p className="text-xs text-muted-foreground">empty_rate</p><p>{pct(aiEffectivenessQuery.data?.summary.empty_rate ?? 0)}</p></div>
                      <div><p className="text-xs text-muted-foreground">parse_error_rate</p><p>{pct(aiEffectivenessQuery.data?.summary.parse_error_rate ?? 0)}</p></div>
                      <div><p className="text-xs text-muted-foreground">hard_error_rate</p><p>{pct(aiEffectivenessQuery.data?.summary.hard_error_rate ?? 0)}</p></div>
                      <div><p className="text-xs text-muted-foreground">avg_success_score</p><p>{(aiEffectivenessQuery.data?.summary.avg_success_score ?? 0).toFixed(2)}</p></div>
                      <div><p className="text-xs text-muted-foreground">total_reviews</p><p>{aiEffectivenessQuery.data?.summary.total_reviews ?? 0}</p></div>
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
              <Card className="border-white/10 bg-white/5 backdrop-blur">
                <CardHeader><CardTitle>Configuración y ejecución</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2"><Label>account_name</Label><Input value={batchForm.account_name} onChange={(e) => setBatchForm((p) => ({ ...p, account_name: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>config_name</Label><Input value={batchForm.config_name} onChange={(e) => setBatchForm((p) => ({ ...p, config_name: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>mode</Label><select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={batchForm.mode} onChange={(e) => setBatchForm((p) => ({ ...p, mode: e.target.value as "performance_only" | "quality_with_golden" }))}><option value="performance_only">performance_only</option><option value="quality_with_golden">quality_with_golden</option></select></div>
                    {batchForm.mode === "quality_with_golden" ? <div className="space-y-2 md:col-span-3"><Label>golden_path</Label><Input value={batchForm.golden_path} onChange={(e) => setBatchForm((p) => ({ ...p, golden_path: e.target.value }))} /></div> : null}
                    <div className="space-y-2"><Label>concurrency</Label><Input value={batchForm.concurrency} onChange={(e) => setBatchForm((p) => ({ ...p, concurrency: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>max_retries_per_image</Label><Input value={batchForm.max_retries_per_image} onChange={(e) => setBatchForm((p) => ({ ...p, max_retries_per_image: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>timeout_sec</Label><Input value={batchForm.timeout_sec} onChange={(e) => setBatchForm((p) => ({ ...p, timeout_sec: e.target.value }))} /></div>
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
                  }} disabled={createBatchMutation.isPending}>{createBatchMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Iniciar benchmark</Button>
                </CardContent>
              </Card>

              {benchmarkCreated ? (
                <>
                  <Card className="border-white/10 bg-white/5 backdrop-blur"><CardHeader><CardTitle>Estado en vivo</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-5"><div><p className="text-xs text-muted-foreground">benchmark_id</p><p className="font-mono text-xs">{benchmarkCreated.benchmark_id}</p></div><div><p className="text-xs text-muted-foreground">job_id</p><p className="font-mono text-xs">{benchmarkDetailQuery.data?.job_id ?? benchmarkCreated.job_id}</p></div><div><p className="text-xs text-muted-foreground">status</p><p>{benchmarkDetailQuery.data?.status ?? benchmarkCreated.status}</p></div><div><p className="text-xs text-muted-foreground">total</p><p>{benchmarkDetailQuery.data?.total_images ?? benchmarkCreated.total_images}</p></div><div><p className="text-xs text-muted-foreground">eventos/métricas</p><p>{benchmarkEventsQuery.data?.length ?? 0} / {benchmarkMetricsQuery.data?.metrics.length ?? 0}</p></div></CardContent></Card>
                  <Card className="border-white/10 bg-white/5 backdrop-blur"><CardHeader><CardTitle>Analítica agregada</CardTitle></CardHeader><CardContent className="space-y-2">{benchmarkAnalyticsQuery.data ? <div className="grid gap-3 md:grid-cols-5"><div><p className="text-xs text-muted-foreground">needs_review_rate</p><p>{pct(benchmarkAnalyticsQuery.data.summary?.needs_review_rate ?? 0)}</p></div><div><p className="text-xs text-muted-foreground">invention_rate_proxy</p><p>{pct(benchmarkAnalyticsQuery.data.summary?.invention_rate_proxy ?? 0)}</p></div><div><p className="text-xs text-muted-foreground">llm_ok_rate</p><p>{pct(benchmarkAnalyticsQuery.data.summary?.llm_ok_rate ?? 0)}</p></div><div><p className="text-xs text-muted-foreground">llm_fallback_rate</p><p>{pct(benchmarkAnalyticsQuery.data.summary?.llm_fallback_rate ?? 0)}</p></div><div><p className="text-xs text-muted-foreground">total_rows</p><p>{benchmarkAnalyticsQuery.data.summary?.total_rows ?? 0}</p></div></div> : <p className="text-sm text-muted-foreground">Sin analítica aún.</p>}</CardContent></Card>
                  <Card className="border-white/10 bg-white/5 backdrop-blur"><CardHeader><CardTitle>Reporte y artefactos</CardTitle></CardHeader><CardContent className="space-y-2"><div className="flex flex-wrap gap-2">{benchmarkReportQuery.data?.artifacts?.master_html_url ? <a href={benchmarkReportQuery.data.artifacts.master_html_url} target="_blank" rel="noreferrer"><Button size="sm">Master HTML</Button></a> : null}{benchmarkReportQuery.data?.artifacts?.master_json_url ? <a href={benchmarkReportQuery.data.artifacts.master_json_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Master JSON</Button></a> : null}{benchmarkReportQuery.data?.artifacts?.excel_url ? <a href={benchmarkReportQuery.data.artifacts.excel_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Excel</Button></a> : null}<Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(benchmarkReportQuery.data ?? {}, null, 2)); toast.success("Reporte copiado"); }}>Copiar JSON reporte</Button><Button size="sm" variant="outline" onClick={() => downloadJson("benchmark_report.json", benchmarkReportQuery.data ?? {})}><Download className="mr-2 h-4 w-4" />Descargar JSON</Button></div></CardContent></Card>
                </>
              ) : <Card className="border-white/10 bg-white/5 backdrop-blur"><CardContent className="py-4 text-sm text-muted-foreground">Sin benchmark creado aún.</CardContent></Card>}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
