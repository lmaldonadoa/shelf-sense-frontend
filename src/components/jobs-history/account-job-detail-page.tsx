"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, FileJson2, FileSpreadsheet, FileText, Loader2, RefreshCcw, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { HttpError, isFinalJobStatus, ocrApi } from "@/lib/ocrApi";
import type { AnalysisTraceItem, JobDetection, JobImage, OcrPreprocessResult, OcrPreprocessVariant, PrimaryCrop, SupportMemoryItem } from "@/types/ocr-api";
import { JobLiveTimeline } from "@/components/jobs/job-live-timeline";
import { JobMetricsPanel } from "@/components/jobs/job-metrics-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AccountJobDetailPageProps = {
  account?: string;
  jobId: string;
};

type ImageArtifactsView = {
  supportDetections: JobDetection[];
  supportMemory: SupportMemoryItem[];
  supportNameCandidates: string[];
  analysisTrace: AnalysisTraceItem[];
  primaryCrops: PrimaryCrop[];
  primaryCropDebug: unknown[];
};

type VariantPreviewModalState = {
  title: string;
  variant: string;
  preview: string;
} | null;

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getStatusVariant(status: string): "default" | "destructive" | "secondary" {
  const s = status.toLowerCase();
  if (s.includes("fail") || s.includes("error")) return "destructive";
  if (s.includes("complete") || s.includes("success")) return "default";
  return "secondary";
}

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value).trim();
    if (text) return text;
  }
  return "";
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object").map((item) => item as Record<string, unknown>) : [];
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function llmStateMeta(crop: Record<string, unknown>): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (crop.llm_fallback === true) return { label: "Fallback", variant: "secondary" };
  if (crop.llm_ok === true) return { label: "OK", variant: "default" };
  if (crop.llm_ok === false) return { label: "Error", variant: "destructive" };
  return { label: "-", variant: "secondary" };
}

function catalogMemoryStateMeta(memory: Record<string, unknown> | null): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (!memory) return { label: "Sin auditoria", variant: "secondary" };
  const applied = memory.applied === true;
  const blockedReasons = Array.isArray(memory.blocked_reasons) ? memory.blocked_reasons.length : 0;
  const ambiguous = memory.ambiguous_top2 === true;
  if (applied) return { label: "Aplicada", variant: "default" };
  if (blockedReasons > 0 || ambiguous) return { label: "Bloqueada", variant: "destructive" };
  return { label: "Auditada", variant: "secondary" };
}

function diffRow(label: string, beforeValue: unknown, afterValue: unknown): ReactNode {
  const beforeText = formatPrimitive(beforeValue);
  const afterText = formatPrimitive(afterValue);
  const changed = beforeText !== afterText;
  return (
    <div className={`rounded border p-2 text-xs ${changed ? "border-amber-300/20 bg-amber-500/5" : "border-white/10 bg-black/25"}`}>
      <p className="font-semibold text-slate-300">{label}</p>
      {changed ? (
        <p className="mt-1 text-slate-200">{beforeText} {"->"} {afterText}</p>
      ) : (
        <p className="mt-1 text-slate-200">{afterText}</p>
      )}
    </div>
  );
}

function getVariantArtifactUrl(variant: OcrPreprocessVariant | Record<string, unknown> | null | undefined): string | null {
  if (!variant || typeof variant !== "object") return null;
  const artifactUrl = "artifact_url" in variant && typeof variant.artifact_url === "string" ? variant.artifact_url : null;
  const artifactPath = "artifact_path" in variant && typeof variant.artifact_path === "string" ? variant.artifact_path : null;
  return resolveArtifactPreviewUrl(artifactUrl ?? artifactPath);
}

function formatQualityMetrics(metrics: unknown): string {
  const obj = objectOrNull(metrics);
  if (!obj) return "-";
  const pieces = [
    obj.width ? `w ${formatPrimitive(obj.width)}` : null,
    obj.height ? `h ${formatPrimitive(obj.height)}` : null,
    obj.laplacian_var ? `lap ${formatPrimitive(obj.laplacian_var)}` : null,
    obj.mean ? `mean ${formatPrimitive(obj.mean)}` : null,
    obj.stddev ? `std ${formatPrimitive(obj.stddev)}` : null,
  ].filter(Boolean);
  return pieces.length ? pieces.join(" · ") : JSON.stringify(obj);
}

function normalizeDetections(value: unknown): JobDetection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const x = row as Record<string, unknown>;
      const boxRaw = x.box;
      const box: [number, number, number, number] =
        Array.isArray(boxRaw) && boxRaw.length === 4
          ? [Number(boxRaw[0]) || 0, Number(boxRaw[1]) || 0, Number(boxRaw[2]) || 0, Number(boxRaw[3]) || 0]
          : [0, 0, 0, 0];
      return {
        label: typeof x.label === "string" ? x.label : "-",
        conf: typeof x.conf === "number" ? x.conf : 0,
        box,
      } satisfies JobDetection;
    })
    .filter((row): row is JobDetection => Boolean(row));
}

function normalizeSupportMemory(value: unknown): SupportMemoryItem[] {
  if (!Array.isArray(value)) return [];
  const out: SupportMemoryItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const x = row as Record<string, unknown>;
    const boxRaw = x.box;
    const box: [number, number, number, number] | undefined =
      Array.isArray(boxRaw) && boxRaw.length === 4
        ? [Number(boxRaw[0]) || 0, Number(boxRaw[1]) || 0, Number(boxRaw[2]) || 0, Number(boxRaw[3]) || 0]
        : undefined;
    const item: SupportMemoryItem = {
      crop_id: typeof x.crop_id === "string" ? x.crop_id : undefined,
      crop_filename: typeof x.crop_filename === "string" ? x.crop_filename : undefined,
      crop_url: typeof x.crop_url === "string" ? x.crop_url : null,
      download_url: typeof x.download_url === "string" ? x.download_url : null,
      label: typeof x.label === "string" ? x.label : undefined,
      memory_label: typeof x.memory_label === "string" ? x.memory_label : undefined,
      conf: typeof x.conf === "number" ? x.conf : undefined,
      box,
      raw_text: typeof x.raw_text === "string" ? x.raw_text : undefined,
      raw_text_full: typeof x.raw_text_full === "string" ? x.raw_text_full : undefined,
      ocr_preprocess: x.ocr_preprocess && typeof x.ocr_preprocess === "object" ? (x.ocr_preprocess as SupportMemoryItem["ocr_preprocess"]) : null,
    };
    out.push(item);
  }
  return out;
}

function normalizeTrace(value: unknown): AnalysisTraceItem[] {
  if (!Array.isArray(value)) return [];
  const out: AnalysisTraceItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const x = row as Record<string, unknown>;
    const item: AnalysisTraceItem = {
      source: typeof x.source === "string" ? x.source : undefined,
      crop: typeof x.crop === "string" ? x.crop : undefined,
      crop_id: typeof x.crop_id === "string" ? x.crop_id : undefined,
      ocr_raw_text: typeof x.ocr_raw_text === "string" ? x.ocr_raw_text : undefined,
      vision_output: x.vision_output && typeof x.vision_output === "object" ? (x.vision_output as Record<string, unknown>) : null,
      structured_products_before_filter: Array.isArray(x.structured_products_before_filter) ? (x.structured_products_before_filter as Record<string, unknown>[]) : null,
      structured_products_after_enrichment: Array.isArray(x.structured_products_after_enrichment) ? (x.structured_products_after_enrichment as Record<string, unknown>[]) : null,
      semantic_rag: x.semantic_rag && typeof x.semantic_rag === "object" ? (x.semantic_rag as Record<string, unknown>) : null,
      raw_text_preview: typeof x.raw_text_preview === "string" ? x.raw_text_preview : undefined,
      llm_used: typeof x.llm_used === "boolean" ? x.llm_used : undefined,
      llm_session_id: typeof x.llm_session_id === "string" ? x.llm_session_id : undefined,
      llm_ok: typeof x.llm_ok === "boolean" ? x.llm_ok : undefined,
      products_detected: typeof x.products_detected === "number" ? x.products_detected : undefined,
      promotion_catalog_memory: x.promotion_catalog_memory && typeof x.promotion_catalog_memory === "object"
        ? (x.promotion_catalog_memory as Record<string, unknown>)
        : null,
    };
    out.push(item);
  }
  return out;
}

function normalizePrimaryCrops(value: unknown): PrimaryCrop[] {
  if (!Array.isArray(value)) return [];
  const out: PrimaryCrop[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const x = row as Record<string, unknown>;
    const cropId = typeof x.crop_id === "string" ? x.crop_id : "";
    if (!cropId) continue;
    out.push({
      crop_id: cropId,
      crop_filename: typeof x.crop_filename === "string" ? x.crop_filename : null,
      crop_url: typeof x.crop_url === "string" ? x.crop_url : null,
      download_url: typeof x.download_url === "string" ? x.download_url : null,
      source: typeof x.source === "string" ? x.source : "primary",
      label: typeof x.label === "string" ? x.label : null,
      conf: typeof x.conf === "number" ? x.conf : null,
      box: Array.isArray(x.box) ? x.box.map((n) => Number(n) || 0) : null,
      ocr_raw_text: typeof x.ocr_raw_text === "string" ? x.ocr_raw_text : null,
      ocr_text_preview: typeof x.ocr_text_preview === "string" ? x.ocr_text_preview : null,
      vision_used: typeof x.vision_used === "boolean" ? x.vision_used : undefined,
      vision_output: x.vision_output && typeof x.vision_output === "object" ? (x.vision_output as Record<string, unknown>) : null,
      structured_products_before_filter: Array.isArray(x.structured_products_before_filter) ? x.structured_products_before_filter : [],
      structured_products_after_enrichment: Array.isArray(x.structured_products_after_enrichment) ? x.structured_products_after_enrichment : [],
      semantic_rag: x.semantic_rag && typeof x.semantic_rag === "object" ? (x.semantic_rag as Record<string, unknown>) : null,
      promotions_extracted: Array.isArray(x.promotions_extracted) ? x.promotions_extracted : [],
      llm_ok: typeof x.llm_ok === "boolean" ? x.llm_ok : null,
      llm_session_id: typeof x.llm_session_id === "string" ? x.llm_session_id : null,
      promotion_catalog_memory: x.promotion_catalog_memory && typeof x.promotion_catalog_memory === "object"
        ? (x.promotion_catalog_memory as Record<string, unknown>)
        : null,
    });
  }
  return out;
}

function getImageArtifacts(selectedImage: JobImage | null, rawResultJson?: Record<string, unknown>): ImageArtifactsView {
  const fromImage: ImageArtifactsView = {
    supportDetections: selectedImage?.support_detections ?? [],
    supportMemory: selectedImage?.support_memory ?? [],
    supportNameCandidates: selectedImage?.support_name_candidates ?? [],
    analysisTrace: selectedImage?.analysis_trace ?? [],
    primaryCrops: selectedImage?.primary_crops ?? [],
    primaryCropDebug: [],
  };
  const hasData = fromImage.supportDetections.length || fromImage.supportMemory.length || fromImage.supportNameCandidates.length || fromImage.analysisTrace.length || fromImage.primaryCrops.length || fromImage.primaryCropDebug.length;
  if (hasData) return fromImage;

  const rootArtifacts = rawResultJson?.image_artifacts;
  const firstArtifact = Array.isArray(rootArtifacts)
    ? rootArtifacts[0]
    : rootArtifacts && typeof rootArtifacts === "object"
      ? rootArtifacts
      : null;
  if (!firstArtifact || typeof firstArtifact !== "object") return fromImage;
  const x = firstArtifact as Record<string, unknown>;

  return {
    supportDetections: normalizeDetections(x.support_detections),
    supportMemory: normalizeSupportMemory(x.support_memory),
    supportNameCandidates: normalizeStringList(x.support_name_candidates),
    analysisTrace: normalizeTrace(x.analysis_trace),
    primaryCrops: normalizePrimaryCrops(x.primary_crops),
    primaryCropDebug: Array.isArray(x.primary_crop_debug) ? x.primary_crop_debug : [],
  };
}

function readProductValue(product: Record<string, unknown>, keys: string[]): string | number | null {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return value;
  }
  return null;
}

function summarizeSemanticReason(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of ["reason", "summary", "message", "explanation", "decision"]) {
      const v = row[key];
      if (typeof v === "string" && v.trim()) return v;
    }
    try {
      const compact = JSON.stringify(value);
      return compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
    } catch {
      return "-";
    }
  }
  return "-";
}

function resolveArtifactPreviewUrl(path?: string | null): string | null {
  if (!path) return null;
  const proxyBase = process.env.NEXT_PUBLIC_OCR_PROXY_BASE ?? "/admin/ocr/proxy";
  const toProxy = (p: string, search = "") => `${proxyBase}${p}${search}`;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const parsed = new URL(path);
      if (parsed.pathname.startsWith("/static/")) return toProxy(parsed.pathname, parsed.search);
      if (parsed.pathname.startsWith("/v1/")) return toProxy(parsed.pathname, parsed.search);
    } catch {
      // ignore parse error and continue fallback
    }
    return path;
  }
  if (path.startsWith("/v1/")) return toProxy(path);
  if (path.startsWith("/static/")) return toProxy(path);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
  if (path.startsWith("/")) return path;
  const staticIdx = path.replaceAll("\\", "/").indexOf("/static/");
  if (staticIdx >= 0) {
    const suffix = path.replaceAll("\\", "/").slice(staticIdx);
    return toProxy(suffix);
  }
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function AccountJobDetailPage({ account, jobId }: AccountJobDetailPageProps) {
  const [selectedImage, setSelectedImage] = useState<JobImage | null>(null);
  const [resultsPendingMessage, setResultsPendingMessage] = useState<string | null>(null);
  const [memoryLabelFilter, setMemoryLabelFilter] = useState<string>("all");
  const [postCompleteRefreshes, setPostCompleteRefreshes] = useState(0);
  const [activeView, setActiveView] = useState<"overview" | "visual" | "debug_ocr" | "products" | "artifacts">("overview");
  const [showPrimaryCompare, setShowPrimaryCompare] = useState<Record<string, boolean>>({});
  const [showSupportCompare, setShowSupportCompare] = useState<Record<string, boolean>>({});
  const [primaryPreprocessView, setPrimaryPreprocessView] = useState<Record<string, "active" | "shadow">>({});
  const [supportPreprocessView, setSupportPreprocessView] = useState<Record<string, "active" | "shadow">>({});
  const [variantPreviewModal, setVariantPreviewModal] = useState<VariantPreviewModalState>(null);
  const [imageProcessCodeInput, setImageProcessCodeInput] = useState("");
  const [lookupResult, setLookupResult] = useState<{ job_id?: string; account_name?: string; image_status?: string } | null>(null);
  const [reprocessJobId, setReprocessJobId] = useState<string | null>(null);
  const chainLogDoneRef = useRef<Record<string, boolean>>({});

  const jobQuery = useQuery({
    queryKey: ["account-job-detail", account, jobId],
    queryFn: () => ocrApi.getJob(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isFinalJobStatus(status) ? false : 3000;
    },
  });

  const resultsQuery = useQuery({
    queryKey: ["account-job-results", account, jobId],
    queryFn: () => ocrApi.getJobResults(jobId),
    enabled: false,
    retry: false,
  });
  const mdReportQuery = useQuery({
    queryKey: ["job-image-md-report", selectedImage?.id, selectedImage?.result_md_url],
    enabled: Boolean(selectedImage?.result_md_url),
    retry: false,
    queryFn: async () => {
      if (!selectedImage?.result_md_url) return "";
      const mdUrl = resolveArtifactPreviewUrl(selectedImage.result_md_url) ?? selectedImage.result_md_url;
      const response = await fetch(mdUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar markdown (${response.status})`);
      return response.text();
    },
  });
  const imageArtifactsQuery = useQuery({
    queryKey: ["job-image-artifacts", jobId, selectedImage?.id],
    enabled: Boolean(selectedImage?.id),
    retry: false,
    queryFn: async () => {
      if (!selectedImage?.id) return null;
      return ocrApi.getJobImageArtifacts(jobId, selectedImage.id);
    },
  });

  const lookupByCodeMutation = useMutation({
    mutationFn: async () => {
      const code = Number(imageProcessCodeInput.trim());
      if (!Number.isFinite(code) || code <= 0) throw new Error("Ingresa un image_process_code válido.");
      return ocrApi.getImageByProcessCode(code);
    },
    onSuccess: (data) => {
      setLookupResult({ job_id: data.job_id, account_name: data.account_name, image_status: data.image_status });
      toast.success("Imagen encontrada por código", { description: `Job: ${data.job_id}` });
    },
    onError: (error) => {
      toast.error("No se pudo buscar por código", { description: error instanceof Error ? error.message : "Error inesperado" });
    },
  });

  const reprocessByCodeMutation = useMutation({
    mutationFn: async () => {
      const code = Number(imageProcessCodeInput.trim());
      if (!Number.isFinite(code) || code <= 0) throw new Error("Ingresa un image_process_code válido.");
      return ocrApi.reprocessImageByProcessCode(code, {
        config_name: jobQuery.data?.config_name ?? "default",
        id_pdv: jobQuery.data?.id_pdv,
        subcategoria: jobQuery.data?.subcategoria,
        usuario_relevo: jobQuery.data?.usuario_relevo ?? null,
      });
    },
    onSuccess: (data) => {
      setReprocessJobId(data.job_id);
      toast.success("Reproceso encolado", { description: `Nuevo job: ${data.job_id}` });
    },
    onError: (error) => {
      toast.error("No se pudo reprocesar por código", { description: error instanceof Error ? error.message : "Error inesperado" });
    },
  });

  const isTerminal = isFinalJobStatus(jobQuery.data?.status ?? "");
  const resolvedAccount = account ?? jobQuery.data?.account_name ?? "colgate_ecuador";

  const images = useMemo(() => {
    const fromResults = resultsQuery.data?.images ?? [];
    if (fromResults.length) return fromResults;
    return jobQuery.data?.images ?? [];
  }, [jobQuery.data?.images, resultsQuery.data?.images]);

  useEffect(() => {
    setResultsPendingMessage(null);
    setPostCompleteRefreshes(0);
  }, [jobId]);

  useEffect(() => {
    if (!images.length) {
      if (selectedImage) setSelectedImage(null);
      return;
    }
    if (!selectedImage) {
      setSelectedImage(images[0]);
      return;
    }
    const refreshed =
      images.find((image) => image.id === selectedImage.id) ??
      images.find((image) => image.file_id && selectedImage.file_id && image.file_id === selectedImage.file_id) ??
      null;
    if (!refreshed) {
      setSelectedImage(images[0] ?? null);
      return;
    }
    if (refreshed !== selectedImage) {
      setSelectedImage(refreshed);
    }
  }, [images, selectedImage]);

  useEffect(() => {
    if (selectedImage?.image_process_code && !imageProcessCodeInput) {
      setImageProcessCodeInput(String(selectedImage.image_process_code));
    }
  }, [imageProcessCodeInput, selectedImage?.image_process_code]);

  async function loadResults(silent = false) {
    setResultsPendingMessage(null);
    const response = await resultsQuery.refetch();
    if (response.error instanceof HttpError) {
      if (response.error.status === 404) {
        const msg = "Resultados aun no disponibles";
        setResultsPendingMessage(msg);
        if (!silent) toast.message(msg);
        return;
      }
      if (!silent) toast.error("Error cargando resultados", { description: response.error.message });
      return;
    }
    if (!silent) toast.success("Resultados cargados");
  }

  useEffect(() => {
    if (!isTerminal) return;
    if (resultsQuery.data || resultsQuery.isFetching) return;
    void loadResults(true);
  }, [isTerminal, resultsQuery.data, resultsQuery.isFetching]);

  const summary = (resultsQuery.data?.summary ?? {}) as Record<string, unknown>;
  const products = (resultsQuery.data?.products ?? []) as Record<string, unknown>[];
  const totalProducts = typeof summary.total_products === "number" ? summary.total_products : products.length;
  const totalPromotions = typeof summary.total_promotions === "number" ? summary.total_promotions : products.filter((product) => Boolean(product.promotion)).length;
  const totalBarcodes = typeof summary.total_barcodes === "number" ? summary.total_barcodes : products.filter((product) => Boolean(product.barcode)).length;
  const dedupeSummary = resultsQuery.data?.dedupe_summary ?? null;
  const normalizedUserResponse = resultsQuery.data?.user_response;
  const chainDiagnostics = useMemo(() => {
    const fromUser =
      normalizedUserResponse && typeof normalizedUserResponse === "object"
        ? ((normalizedUserResponse as Record<string, unknown>).chain_diagnostics as Record<string, unknown> | undefined)
        : undefined;
    const resultDataRaw = resultsQuery.data as Record<string, unknown> | undefined;
    const jobMetaRaw =
      resultDataRaw?.job_metadata && typeof resultDataRaw.job_metadata === "object"
        ? (resultDataRaw.job_metadata as Record<string, unknown>)
        : null;
    const requested = fromUser?.requested_chain ?? jobMetaRaw?.cadena_solicitada ?? null;
    const resolved = fromUser?.resolved_chain ?? jobMetaRaw?.cadena_resuelta ?? (jobQuery.data as Record<string, unknown> | undefined)?.cadena_resuelta ?? null;
    const resolutionSource = fromUser?.resolution_source ?? jobMetaRaw?.chain_resolution_source ?? null;
    const resolutionConfidence = fromUser?.resolution_confidence ?? jobMetaRaw?.chain_resolution_confidence ?? null;
    const resolutionReason = fromUser?.resolution_reason ?? jobMetaRaw?.chain_resolution_reason ?? null;
    const posLookupStatus = fromUser?.pos_lookup_status ?? jobMetaRaw?.pos_lookup_status ?? (jobQuery.data as Record<string, unknown> | undefined)?.pos_lookup_status ?? null;
    const posLookupCode = fromUser?.pos_lookup_code ?? jobMetaRaw?.pos_lookup_code ?? (jobQuery.data as Record<string, unknown> | undefined)?.pos_lookup_code ?? null;
    const chainCatalogMatch = fromUser?.chain_catalog_match ?? jobMetaRaw?.chain_catalog_match ?? null;
    const chainCatalogCandidates = fromUser?.chain_catalog_candidates ?? jobMetaRaw?.chain_catalog_candidates ?? null;
    const posContext = fromUser?.pos_context ?? jobMetaRaw?.pos_context ?? (jobQuery.data as Record<string, unknown> | undefined)?.pos_context ?? null;

    const requestedCandidates = new Set<string>();
    const retrievedChainKeys = new Set<string>();
    let allowGlobalFallback: boolean | null = null;
    for (const image of resultsQuery.data?.images ?? []) {
      for (const trace of image.analysis_trace ?? []) {
        const rag = trace.semantic_rag as Record<string, unknown> | null | undefined;
        if (!rag) continue;
        if (Array.isArray(rag.requested_chain_candidates)) {
          for (const c of rag.requested_chain_candidates) if (typeof c === "string" && c.trim()) requestedCandidates.add(c.trim());
        }
        if (Array.isArray(rag.requested_chains)) {
          for (const c of rag.requested_chains) if (typeof c === "string" && c.trim()) requestedCandidates.add(c.trim());
        }
        if (Array.isArray(rag.retrieved_chain_keys)) {
          for (const c of rag.retrieved_chain_keys) if (typeof c === "string" && c.trim()) retrievedChainKeys.add(c.trim());
        }
        const ragItems = Array.isArray(rag.items) ? (rag.items as Record<string, unknown>[]) : [];
        for (const item of ragItems) {
          const retrievedWith = item.retrieved_with;
          const chain = item.chain;
          if (typeof retrievedWith === "string" && retrievedWith.trim()) retrievedChainKeys.add(retrievedWith.trim());
          if (typeof chain === "string" && chain.trim()) retrievedChainKeys.add(chain.trim());
        }
        if (typeof rag.allow_global_fallback === "boolean") allowGlobalFallback = rag.allow_global_fallback;
      }
    }

    return {
      requested,
      resolved,
      resolutionSource,
      resolutionConfidence,
      resolutionReason,
      posLookupStatus,
      posLookupCode,
      chainCatalogMatch,
      chainCatalogCandidates,
      posContext,
      requestedCandidates: Array.from(requestedCandidates),
      retrievedChainKeys: Array.from(retrievedChainKeys),
      allowGlobalFallback,
    };
  }, [jobQuery.data, normalizedUserResponse, resultsQuery.data]);

  useEffect(() => {
    if (!resultsQuery.data) return;
    const chainDiagRaw =
      normalizedUserResponse && typeof normalizedUserResponse === "object"
        ? ((normalizedUserResponse as Record<string, unknown>).chain_diagnostics as Record<string, unknown> | undefined)
        : undefined;
    const logKey = `${jobId}:${resultsQuery.data.job_id ?? "results"}:${resultsQuery.data.master_json_url ?? "-"}`;
    if (chainLogDoneRef.current[logKey]) return;
    chainLogDoneRef.current[logKey] = true;

    const resultDataRaw = resultsQuery.data as Record<string, unknown>;
    const jobMetaRaw = resultDataRaw?.job_metadata;
    const requestedFromMeta =
      jobMetaRaw && typeof jobMetaRaw === "object"
        ? (jobMetaRaw as Record<string, unknown>).cadena_solicitada
        : undefined;
    console.info("[CHAIN] requested:", chainDiagRaw?.requested_chain ?? requestedFromMeta);
    console.info("[CHAIN] resolved:", chainDiagRaw?.resolved_chain ?? (jobQuery.data as Record<string, unknown> | undefined)?.cadena_resuelta);
    console.info("[CHAIN] pos_lookup_status:", chainDiagRaw?.pos_lookup_status ?? (jobQuery.data as Record<string, unknown> | undefined)?.pos_lookup_status, "code:", chainDiagRaw?.pos_lookup_code ?? (jobQuery.data as Record<string, unknown> | undefined)?.pos_lookup_code);
    console.info("[CHAIN] catalog_match:", chainDiagRaw?.chain_catalog_match ?? null);
    console.info("[CHAIN] pos_context:", chainDiagRaw?.pos_context ?? (jobQuery.data as Record<string, unknown> | undefined)?.pos_context ?? null);

    const traceImages = resultsQuery.data.images ?? [];
    for (const image of traceImages) {
      for (const t of image.analysis_trace ?? []) {
        const rag = t.semantic_rag as Record<string, unknown> | null | undefined;
        if (!rag) continue;
        console.info("[CHAIN-RAG] source:", t.source ?? "-", "crop:", t.crop ?? t.crop_id ?? "-");
        console.info("[CHAIN-RAG] requested candidates:", rag.requested_chain_candidates ?? []);
        console.info("[CHAIN-RAG] retrieved chains:", rag.retrieved_chain_keys ?? []);
        console.info("[CHAIN-RAG] allow_global_fallback:", rag.allow_global_fallback ?? null);
      }
    }
  }, [jobId, jobQuery.data, normalizedUserResponse, resultsQuery.data]);

  const selectedPreviewUrl =
    selectedImage?.annotated_image_url ??
    selectedImage?.annotated_download_url ??
    null;

  const missingArtifactUrls = useMemo(() => {
    const masterMissing = !resultsQuery.data?.master_html_url || !resultsQuery.data?.master_json_url || !resultsQuery.data?.excel_url;
    const imagesMissing = (resultsQuery.data?.images ?? []).some((img) => !img.annotated_image_url && !img.annotated_download_url);
    return masterMissing || imagesMissing;
  }, [resultsQuery.data?.excel_url, resultsQuery.data?.images, resultsQuery.data?.master_html_url, resultsQuery.data?.master_json_url]);

  useEffect(() => {
    if (!isTerminal || !resultsQuery.data || !missingArtifactUrls) return;
    if (postCompleteRefreshes >= 3) return;
    const timer = setTimeout(() => {
      setPostCompleteRefreshes((prev) => prev + 1);
      void loadResults(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isTerminal, missingArtifactUrls, postCompleteRefreshes, resultsQuery.data]);

  const artifacts = useMemo(
    () => getImageArtifacts(imageArtifactsQuery.data ?? selectedImage, resultsQuery.data?.raw_result_json),
    [imageArtifactsQuery.data, resultsQuery.data?.raw_result_json, selectedImage],
  );

  const memoryLabels = useMemo(() => {
    const unique = new Set<string>();
    for (const item of artifacts.supportMemory) {
      if (item.memory_label) unique.add(item.memory_label);
    }
    return Array.from(unique);
  }, [artifacts.supportMemory]);

  const filteredSupportMemory = useMemo(() => {
    if (memoryLabelFilter === "all") return artifacts.supportMemory;
    return artifacts.supportMemory.filter((item) => item.memory_label === memoryLabelFilter);
  }, [artifacts.supportMemory, memoryLabelFilter]);

  const combinedDetections = useMemo(() => {
    const primary = (selectedImage?.detections ?? []).map((item) => ({ ...item, source: "PRIMARY" as const }));
    const support = artifacts.supportDetections.map((item) => ({ ...item, source: "SUPPORT" as const }));
    return [...primary, ...support];
  }, [artifacts.supportDetections, selectedImage?.detections]);

  const ocrDebug = useMemo(() => {
    if (!selectedImage?.ocr_debug || typeof selectedImage.ocr_debug !== "object") return null;
    return selectedImage.ocr_debug as Record<string, unknown>;
  }, [selectedImage?.ocr_debug]);

  const ocrDebugSummary = (ocrDebug?.summary && typeof ocrDebug.summary === "object")
    ? (ocrDebug.summary as Record<string, unknown>)
    : null;
  const ocrDebugConfig = (ocrDebug?.config && typeof ocrDebug.config === "object")
    ? (ocrDebug.config as Record<string, unknown>)
    : null;
  const ocrDebugPrimaryCrops = Array.isArray(ocrDebug?.primary_crops) ? (ocrDebug?.primary_crops as Record<string, unknown>[]) : [];
  const ocrDebugProductAudit = Array.isArray(ocrDebug?.product_audit) ? (ocrDebug?.product_audit as Record<string, unknown>[]) : [];
  const promotionCatalogMemoryConfig = useMemo(() => {
    const rawRoot = objectOrNull(resultsQuery.data?.raw_result_json);
    const imageArtifacts = objectOrNull(rawRoot?.image_artifacts);
    const auditContext = objectOrNull(imageArtifacts?.audit_context);
    return objectOrNull(auditContext?.promotion_catalog_memory_config);
  }, [resultsQuery.data?.raw_result_json]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-slate-400">
            <Link href={`/accounts/${encodeURIComponent(resolvedAccount)}/jobs`} className="hover:text-slate-200">Cuenta {resolvedAccount}</Link>
            {" > "}
            <span>Jobs</span>
            {" > "}
            <span className="font-mono">{jobId}</span>
          </p>
          <h1 className="font-heading text-2xl text-white">Visor Operativo de Job OCR</h1>
          <p className="text-xs text-slate-300">Promociones es la fuente principal. Etiquetas/Productos se usan como soporte y trazabilidad.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "overview", label: "Resumen" },
            { key: "visual", label: "Visual/OCR" },
            { key: "debug_ocr", label: "Debug OCR / Ensemble" },
            { key: "products", label: "Productos" },
            { key: "artifacts", label: "Artefactos" },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="sm"
              variant={activeView === tab.key ? "default" : "outline"}
              onClick={() => setActiveView(tab.key as typeof activeView)}
            >
              {tab.label}
            </Button>
          ))}
          <Button variant="outline" onClick={() => void navigator.clipboard.writeText(jobId).then(() => toast.success("ID de job copiado"))}>Copiar ID Job</Button>
          <Button variant="outline" onClick={() => void jobQuery.refetch()} disabled={jobQuery.isFetching}>
            {jobQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Reintentar resumen
          </Button>
        </div>
      </div>

      {activeView === "overview" ? (
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Resumen</CardTitle></CardHeader>
            <CardContent>
              {jobQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-44" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : jobQuery.error ? (
                <p className="text-sm text-rose-300">No se pudo cargar detalle de job.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">job_id</p><p className="font-mono text-xs">{jobQuery.data?.job_id}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">status</p><Badge variant={getStatusVariant(jobQuery.data?.status ?? "unknown")}>{jobQuery.data?.status ?? "unknown"}</Badge></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">account_name</p><p>{jobQuery.data?.account_name ?? resolvedAccount}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">config_name</p><p>{jobQuery.data?.config_name ?? "-"}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">created_at</p><p className="text-xs">{formatDate(jobQuery.data?.created_at)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">started_at</p><p className="text-xs">{formatDate(jobQuery.data?.started_at)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">updated_at</p><p className="text-xs">{formatDate(jobQuery.data?.updated_at)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">finished_at</p><p className="text-xs">{formatDate(jobQuery.data?.finished_at)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">total_images</p><p>{jobQuery.data?.total_images ?? 0}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">processed_images</p><p>{jobQuery.data?.processed_images ?? 0}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">failed_images</p><p>{jobQuery.data?.failed_images ?? 0}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">error</p><p className="text-xs text-rose-300">{jobQuery.data?.error_message ?? "-"}</p></div>
                  </div>
                  {(jobQuery.data?.status ?? "").toLowerCase() === "queued" ? (
                    <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Trabajo en cola. Se procesará automáticamente cuando el runner termine el job actual.
                    </div>
                  ) : null}
	                </>
	              )}
	            </CardContent>
	          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Soporte por image_process_code</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                <Input value={imageProcessCodeInput} onChange={(e) => setImageProcessCodeInput(e.target.value)} placeholder="Ej: 123456" />
                <Button variant="outline" onClick={() => lookupByCodeMutation.mutate()} disabled={lookupByCodeMutation.isPending}>
                  {lookupByCodeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Buscar por código
                </Button>
                <Button onClick={() => reprocessByCodeMutation.mutate()} disabled={reprocessByCodeMutation.isPending}>
                  {reprocessByCodeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Reprocesar
                </Button>
              </div>
              {lookupResult ? <p className="text-xs text-muted-foreground">lookup: job={lookupResult.job_id ?? "-"} | account={lookupResult.account_name ?? "-"} | status={lookupResult.image_status ?? "-"}</p> : null}
              {reprocessJobId ? (
                <Link href={`/accounts/${encodeURIComponent(resolvedAccount)}/jobs/${encodeURIComponent(reprocessJobId)}`} className="text-cyan-200 underline text-sm">
                  Abrir nuevo job reprocesado: {reprocessJobId}
                </Link>
              ) : null}
            </CardContent>
          </Card>

	          <JobMetricsPanel jobId={jobId} isTerminal={isTerminal} />
	        </div>

        <div className="space-y-6">
          <JobLiveTimeline jobId={jobId} isTerminal={isTerminal} />

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Resultados y artefactos</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    const events = await ocrApi.getJobEvents(jobId);
                    downloadJsonFile(`${jobId}_events.json`, events);
                  } catch (error) {
                    toast.error("No se pudo exportar eventos", { description: error instanceof HttpError ? error.message : "Error inesperado" });
                  }
                }}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar eventos JSON
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    const metrics = await ocrApi.getJobMetrics(jobId);
                    downloadJsonFile(`${jobId}_metrics.json`, metrics);
                  } catch (error) {
                    toast.error("No se pudo exportar metricas", { description: error instanceof HttpError ? error.message : "Error inesperado" });
                  }
                }}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar metricas JSON
                </Button>
                <Button size="sm" onClick={() => void loadResults()} disabled={resultsQuery.isFetching}>
                  {resultsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Reintentar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {resultsQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}
              {resultsPendingMessage ? <p className="text-sm text-amber-300">{resultsPendingMessage}</p> : null}
              {resultsQuery.error instanceof HttpError && resultsQuery.error.status !== 404 ? (
                <p className="text-sm text-rose-300">No se pudieron cargar resultados: {resultsQuery.error.detail}</p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">total_products</p><p className="text-lg font-semibold">{totalProducts}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">total_promotions</p><p className="text-lg font-semibold">{totalPromotions}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">total_barcodes</p><p className="text-lg font-semibold">{totalBarcodes}</p></div>
              </div>
              {normalizedUserResponse ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">id_pdv</p><p className="text-sm font-semibold">{normalizedUserResponse.id_pdv ?? "-"}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">subcategoria</p><p className="text-sm font-semibold">{normalizedUserResponse.subcategoria ?? "-"}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">usuario_relevo</p><p className="text-sm font-semibold">{normalizedUserResponse.usuario_relevo ?? "-"}</p></div>
                </div>
              ) : null}
              {dedupeSummary ? (
                <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Consolidacion / Deduplicacion</p>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Antes</p><p className="text-base font-semibold">{dedupeSummary.before ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Despues</p><p className="text-base font-semibold">{dedupeSummary.after ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Eliminados</p><p className="text-base font-semibold">{dedupeSummary.removed ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Estado</p><p className="text-base font-semibold">{typeof dedupeSummary.enabled === "boolean" ? (dedupeSummary.enabled ? "Activo" : "Inactivo") : "-"}</p></div>
                  </div>
                  {typeof dedupeSummary.removed === "number" && dedupeSummary.removed > 0 ? (
                    <div className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Se consolidaron productos similares para evitar duplicados.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {resultsQuery.data?.master_html_url ? <a href={resolveArtifactPreviewUrl(resultsQuery.data.master_html_url) ?? resultsQuery.data.master_html_url} target="_blank" rel="noreferrer"><Button size="sm"><FileText className="mr-2 h-4 w-4" />Abrir Master HTML</Button></a> : null}
                {resultsQuery.data?.master_json_url ? <a href={resolveArtifactPreviewUrl(resultsQuery.data.master_json_url) ?? resultsQuery.data.master_json_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><FileJson2 className="mr-2 h-4 w-4" />Abrir Master JSON</Button></a> : null}
                {resultsQuery.data?.excel_url ? <a href={resolveArtifactPreviewUrl(resultsQuery.data.excel_url) ?? resultsQuery.data.excel_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><FileSpreadsheet className="mr-2 h-4 w-4" />Descargar Excel</Button></a> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-cyan-300/25 bg-cyan-500/10 backdrop-blur">
        <CardHeader><CardTitle className="text-base">Diagnóstico de cadena</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">cadena_solicitada</p><p className="text-sm font-semibold">{String(chainDiagnostics.requested ?? "-")}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-muted-foreground">cadena_resuelta</p>
            <p className="text-sm font-semibold">{String(chainDiagnostics.resolved ?? "-")}</p>
            <div className="mt-1">
              <Badge
                variant="secondary"
                className={
                  chainDiagnostics.resolutionSource === "requested_explicit"
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : chainDiagnostics.resolutionSource === "chain_catalog_alias"
                      ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
                      : chainDiagnostics.resolutionSource === "chain_catalog_alias_ambiguous"
                        ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                        : chainDiagnostics.resolutionSource === "unresolved"
                          ? "border-rose-400/40 bg-rose-500/15 text-rose-100"
                          : ""
                }
              >
                {chainDiagnostics.resolutionSource === "requested_explicit"
                  ? "Explícita (usuario)"
                  : chainDiagnostics.resolutionSource === "chain_catalog_alias"
                    ? "Resuelta por catálogo"
                    : chainDiagnostics.resolutionSource === "chain_catalog_alias_ambiguous"
                      ? "Ambigua"
                      : chainDiagnostics.resolutionSource === "unresolved"
                        ? "No resuelta (unknown)"
                        : String(chainDiagnostics.resolutionSource ?? "-")}
              </Badge>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">confianza</p><p className="text-sm font-semibold">{typeof chainDiagnostics.resolutionConfidence === "number" ? `${Math.round(chainDiagnostics.resolutionConfidence * 100)}%` : "-"}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">motivo</p><p className="text-xs">{String(chainDiagnostics.resolutionReason ?? "-")}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-muted-foreground">pos_lookup</p>
            <p className="text-sm font-semibold">
              {chainDiagnostics.posLookupStatus || chainDiagnostics.posLookupCode
                ? `${String(chainDiagnostics.posLookupStatus ?? "-")} (${String(chainDiagnostics.posLookupCode ?? "-")})`
                : "no disponible en este job"}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-muted-foreground">chain_catalog_match</p>
            {chainDiagnostics.chainCatalogMatch && typeof chainDiagnostics.chainCatalogMatch === "object" ? (
              <div className="space-y-1 text-xs">
                <p><span className="text-slate-400">chain_code:</span> {String((chainDiagnostics.chainCatalogMatch as Record<string, unknown>).chain_code ?? "-")}</p>
                <p><span className="text-slate-400">matched_alias:</span> {String((chainDiagnostics.chainCatalogMatch as Record<string, unknown>).matched_alias ?? "-")}</p>
                <p><span className="text-slate-400">display_name:</span> {String((chainDiagnostics.chainCatalogMatch as Record<string, unknown>).display_name ?? "-")}</p>
              </div>
            ) : (
              <p className="text-sm font-semibold">-</p>
            )}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">candidatos_catalogo</p>
            {Array.isArray(chainDiagnostics.chainCatalogCandidates) && chainDiagnostics.chainCatalogCandidates.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>chain_code</TableHead>
                      <TableHead>matched_alias</TableHead>
                      <TableHead>priority</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chainDiagnostics.chainCatalogCandidates.map((item, idx) => {
                      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
                      return (
                        <TableRow key={`cand-${idx}`}>
                          <TableCell>{String(row.chain_code ?? "-")}</TableCell>
                          <TableCell>{String(row.matched_alias ?? "-")}</TableCell>
                          <TableCell>{typeof row.priority === "number" ? row.priority : "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-xs">-</p>
            )}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">requested_chain_candidates (RAG)</p><p className="text-xs">{chainDiagnostics.requestedCandidates.length ? chainDiagnostics.requestedCandidates.join(", ") : "-"}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">retrieved_chain_keys (RAG)</p><p className="text-xs">{chainDiagnostics.retrievedChainKeys.length ? chainDiagnostics.retrievedChainKeys.join(", ") : "-"}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">allow_global_fallback</p><p className="text-sm font-semibold">{chainDiagnostics.allowGlobalFallback === null ? "-" : String(chainDiagnostics.allowGlobalFallback)}</p></div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">pos_context</p><p className="text-xs">{chainDiagnostics.posContext && typeof chainDiagnostics.posContext === "object" ? "Disponible (ver consola [CHAIN])" : "-"}</p></div>
          {String(chainDiagnostics.resolved ?? "").toLowerCase() === "unknown" ? (
            <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 sm:col-span-2 xl:col-span-4">
              Cadena no resuelta con confianza alta. Se evita usar contexto semántico específico de cadena para prevenir contaminación.
            </div>
          ) : null}
          <div className="rounded-lg border border-slate-500/30 bg-slate-500/10 px-3 py-2 text-xs text-slate-200 sm:col-span-2 xl:col-span-4">
            La cadena solo se asigna con evidencia fuerte. Si no hay match confiable, queda en <span className="font-mono">unknown</span> para no aplicar reglas/RAG de otra cadena por error.
          </div>
        </CardContent>
      </Card>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Deteccion visual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!selectedImage ? (
            <p className="text-sm text-muted-foreground">Selecciona una imagen para ver deteccion y memoria.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Promociones detectadas</p><p className="text-lg font-semibold">{selectedImage.detections?.length ?? 0}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Soporte detectado</p><p className="text-lg font-semibold">{artifacts.supportDetections.length}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Memoria capturada</p><p className="text-lg font-semibold">{artifacts.supportMemory.length}</p></div>
              </div>

              {!combinedDetections.length ? (
                <p className="text-sm text-muted-foreground">Sin boxes registrados para esta imagen.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fuente</TableHead>
                        <TableHead>Label</TableHead>
                        <TableHead>Conf</TableHead>
                        <TableHead>Box</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedDetections.map((row, idx) => (
                        <TableRow key={`det-${idx}-${row.label}`}>
                          <TableCell><Badge variant={row.source === "PRIMARY" ? "default" : "secondary"}>{row.source}</Badge></TableCell>
                          <TableCell>{row.label}</TableCell>
                          <TableCell>{row.conf.toFixed(4)}</TableCell>
                          <TableCell>[{row.box.join(", ")}]</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Primary crop debug</CardTitle></CardHeader>
        <CardContent>
          {!selectedImage ? (
            <p className="text-sm text-muted-foreground">Selecciona una imagen para ver debug de crops primarios.</p>
          ) : !(artifacts.primaryCropDebug.length) ? (
            <p className="text-sm text-muted-foreground">Sin primary_crop_debug en este job/imagen.</p>
          ) : (
            <pre className="max-h-80 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">
              {JSON.stringify(artifacts.primaryCropDebug, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>OCR Preprocess A/B por crop</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!selectedImage ? (
            <p className="text-sm text-muted-foreground">Selecciona una imagen para ver comparación OCR A/B.</p>
          ) : !(artifacts.primaryCrops.length) ? (
            <p className="text-sm text-muted-foreground">Sin primary_crops en esta imagen (job antiguo o sin promociones detectadas).</p>
          ) : (
            <div className="space-y-4">
              {artifacts.primaryCrops.map((crop) => {
                const pre = (crop.ocr_preprocess ?? null) as OcrPreprocessResult | null;
                const variants = Array.isArray(pre?.variants) ? pre?.variants ?? [] : [];
                const shadowVariants = Array.isArray(pre?.shadow_variants) ? pre?.shadow_variants ?? [] : [];
                const selectedVariant = pre?.selected_variant ?? null;
                const heuristicWinner = pre?.heuristic_winner ?? null;
                const disabledReason = pre?.disabled_reason ?? null;
                const semanticRerankUsed = pre?.semantic_rerank_used === true;
                const semanticRerankReason = pre?.semantic_rerank_reason ?? null;
                const shadowSummary = pre?.shadow_summary && typeof pre.shadow_summary === "object" ? pre.shadow_summary : null;
                const compareKey = crop.crop_id;
                const preprocessMode = primaryPreprocessView[compareKey] ?? (shadowVariants.length ? "active" : "active");
                const displayedVariants = preprocessMode === "shadow" ? shadowVariants : variants;
                const displayedWinner = preprocessMode === "shadow"
                  ? shadowSummary?.best_variant ?? null
                  : selectedVariant;
                const selectedData = displayedVariants.find((v) => v?.variant === displayedWinner) ?? displayedVariants[0] ?? null;
                const processedPreviewUrl = getVariantArtifactUrl(selectedData);
                const cropPreviewUrl = crop.crop_url ? resolveArtifactPreviewUrl(crop.crop_url) : null;
                const compareEnabled = Boolean(showPrimaryCompare[compareKey]);
                const ocrUsedLabel = preprocessMode === "shadow" ? (displayedWinner ?? "sin ganador shadow") : (selectedVariant ?? "original");
                return (
                  <div key={`ab-${crop.crop_id}`} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">{crop.crop_id}</Badge>
                      <Badge variant={pre?.enabled ? "default" : "secondary"}>{pre?.enabled ? "A/B activo" : "A/B inactivo"}</Badge>
                      <Badge variant={preprocessMode === "shadow" ? "secondary" : "default"}>
                        {preprocessMode === "shadow" ? "Auditando shadow" : "OCR usado"}: {ocrUsedLabel}{pre?.enabled ? "" : " (A/B inactivo)"}
                      </Badge>
                      {heuristicWinner ? <Badge variant="outline">heuristic_winner: {heuristicWinner}</Badge> : null}
                      {semanticRerankUsed ? <Badge variant="outline">semantic_rerank aplicado</Badge> : null}
                      {!pre?.enabled && disabledReason ? <Badge variant="destructive">reason: {disabledReason}</Badge> : null}
                      <Badge variant="outline">{crop.label ?? "promociones"}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPrimaryCompare((prev) => ({ ...prev, [compareKey]: !compareEnabled }))}
                        disabled={!processedPreviewUrl || (preprocessMode === "active" && ocrUsedLabel === "original")}
                      >
                        {compareEnabled ? "Ocultar comparación" : `Comparar original vs ${preprocessMode === "shadow" ? "shadow visible" : "OCR usado"}`}
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={preprocessMode === "active" ? "default" : "outline"}
                        onClick={() => setPrimaryPreprocessView((prev) => ({ ...prev, [compareKey]: "active" }))}
                      >
                        Activas
                      </Button>
                      <Button
                        size="sm"
                        variant={preprocessMode === "shadow" ? "default" : "outline"}
                        onClick={() => setPrimaryPreprocessView((prev) => ({ ...prev, [compareKey]: "shadow" }))}
                        disabled={!shadowVariants.length}
                      >
                        Shadow
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {preprocessMode === "shadow"
                          ? "Estas variantes se auditan, pero no reemplazan el OCR final."
                          : "Estas variantes sí compiten por el texto final del crop."}
                      </span>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-4">
                      <div className="rounded-md border border-white/10 bg-black/25 p-3 text-xs">
                        <p className="text-slate-400">selected_variant</p>
                        <p className="mt-1 font-semibold text-slate-100">{selectedVariant ?? "-"}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/25 p-3 text-xs">
                        <p className="text-slate-400">heuristic_winner</p>
                        <p className="mt-1 font-semibold text-slate-100">{heuristicWinner ?? "-"}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/25 p-3 text-xs">
                        <p className="text-slate-400">shadow best</p>
                        <p className="mt-1 font-semibold text-slate-100">{shadowSummary?.best_variant ?? "-"}</p>
                      </div>
                      <div className={`rounded-md border p-3 text-xs ${shadowSummary?.would_replace_active ? "border-amber-300/30 bg-amber-500/10" : "border-white/10 bg-black/25"}`}>
                        <p className="text-slate-400">shadow vs activa</p>
                        <p className="mt-1 font-semibold text-slate-100">
                          {shadowSummary?.would_replace_active ? "Shadow habría ganado" : "Sin reemplazo sugerido"}
                        </p>
                        <p className="mt-1 text-slate-300">
                          delta: {typeof shadowSummary?.score_delta_vs_active === "number" ? shadowSummary.score_delta_vs_active.toFixed(4) : "-"}
                        </p>
                      </div>
                    </div>

                    {semanticRerankUsed && semanticRerankReason ? (
                      <div className="rounded-md border border-cyan-300/20 bg-cyan-500/5 p-3 text-xs text-cyan-50">
                        <span className="font-semibold">semantic_rerank_reason:</span> {semanticRerankReason}
                      </div>
                    ) : null}

                    {shadowSummary?.would_replace_active ? (
                      <div className="rounded-md border border-amber-300/25 bg-amber-500/10 p-3 text-sm text-amber-50">
                        Shadow detectó una variante con mejor score que la activa, pero quedó en auditoría y no reemplazó el resultado final.
                      </div>
                    ) : null}

                    <div className={compareEnabled ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold tracking-wide text-slate-300">Vista de referencia (original)</p>
                        {cropPreviewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cropPreviewUrl} alt={crop.crop_filename ?? crop.crop_id} className="h-44 w-full rounded-md border border-white/10 object-contain bg-black/30" />
                        ) : (
                          <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground">Sin miniatura original</div>
                        )}
                      </div>
                      {compareEnabled ? (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold tracking-wide text-slate-300">Vista usada para OCR ({ocrUsedLabel})</p>
                          {processedPreviewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={processedPreviewUrl} alt={`processed-${crop.crop_id}`} className="h-44 w-full rounded-md border border-cyan-300/30 object-contain bg-black/30" />
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground">No hay artefacto de variante guardado</div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {!displayedVariants.length ? (
                      <p className="text-xs text-muted-foreground">
                        {preprocessMode === "shadow" ? "No hay variantes shadow en este crop." : "No hay variantes OCR activas en este crop."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>variant</TableHead>
                              <TableHead>mode</TableHead>
                              <TableHead>score</TableHead>
                              <TableHead>chars</TableHead>
                              <TableHead>elapsed_ms</TableHead>
                              <TableHead>quality</TableHead>
                              <TableHead>skip</TableHead>
                              <TableHead>preview</TableHead>
                              <TableHead>artefacto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {displayedVariants.map((row, idx) => {
                              const artifact = getVariantArtifactUrl(row);
                              const isWinner = row?.variant === displayedWinner;
                              return (
                                <TableRow key={`variant-${crop.crop_id}-${idx}`}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span>{row?.variant ?? "-"}</span>
                                      {isWinner ? <Badge>{preprocessMode === "shadow" ? "mejor shadow" : "usada por pipeline"}</Badge> : null}
                                      {row?.shadow_only ? <Badge variant="outline">shadow_only</Badge> : null}
                                    </div>
                                  </TableCell>
                                  <TableCell>{row?.mode ?? (preprocessMode === "shadow" ? "shadow" : "active")}</TableCell>
                                  <TableCell>{typeof row?.score === "number" ? row.score.toFixed(4) : "-"}</TableCell>
                                  <TableCell>{typeof row?.chars === "number" ? row.chars : "-"}</TableCell>
                                  <TableCell>{typeof row?.elapsed_ms === "number" ? row.elapsed_ms : "-"}</TableCell>
                                  <TableCell className="max-w-72 truncate" title={formatQualityMetrics(row?.quality_metrics)}>{formatQualityMetrics(row?.quality_metrics)}</TableCell>
                                  <TableCell className="max-w-72 truncate" title={typeof row?.ocr_skipped_reason === "string" ? row.ocr_skipped_reason : ""}>{typeof row?.ocr_skipped_reason === "string" ? row.ocr_skipped_reason : "-"}</TableCell>
                                  <TableCell className="max-w-80">
                                    <div className="space-y-2">
                                      <p className="truncate" title={typeof row?.raw_text_preview === "string" ? row.raw_text_preview : ""}>{typeof row?.raw_text_preview === "string" ? row.raw_text_preview : "-"}</p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setVariantPreviewModal({
                                          title: `Crop ${crop.crop_id}`,
                                          variant: row?.variant ?? "-",
                                          preview: typeof row?.raw_text_preview === "string" ? row.raw_text_preview : "",
                                        })}
                                      >
                                        Ver texto completo
                                      </Button>
                                    </div>
                                  </TableCell>
                                  <TableCell>{artifact ? <a href={artifact} target="_blank" rel="noreferrer" className="text-cyan-200 underline">Ver</a> : <span className="text-muted-foreground">sin artefacto</span>}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Recortes PRIMARY (promociones)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!selectedImage ? (
            <p className="text-sm text-muted-foreground">Selecciona una imagen para ver recortes primary.</p>
          ) : !(artifacts.primaryCrops.length) ? (
            <p className="text-sm text-muted-foreground">No hay primary_crops en esta imagen (job viejo o sin promociones).</p>
          ) : (
            <div className="space-y-4">
              {artifacts.primaryCrops.map((crop) => (
                <div key={`primary-crop-${crop.crop_id}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  {(() => {
                    const pre = crop.ocr_preprocess;
                    const selectedVariant = pre?.selected_variant ?? "original";
                    const disabledReason = pre?.disabled_reason ?? null;
                    return (
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={pre?.enabled ? "default" : "secondary"}>{pre?.enabled ? "A/B activo" : "A/B inactivo"}</Badge>
                        <Badge variant="outline">OCR usado: {selectedVariant}{pre?.enabled ? "" : " (A/B inactivo)"}</Badge>
                        {!pre?.enabled && disabledReason ? <Badge variant="destructive">reason: {disabledReason}</Badge> : null}
                      </div>
                    );
                  })()}
                  <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                    <div className="space-y-2">
                      {crop.crop_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveArtifactPreviewUrl(crop.crop_url) ?? crop.crop_url} alt={crop.crop_filename ?? crop.crop_id} className="h-40 w-full rounded-md border border-white/10 object-contain bg-black/30" />
                      ) : (
                        <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground">
                          Sin miniatura
                        </div>
                      )}
                      {crop.download_url ? (
                        <a href={resolveArtifactPreviewUrl(crop.download_url) ?? crop.download_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="w-full">
                            <Download className="mr-2 h-4 w-4" />
                            Descargar crop
                          </Button>
                        </a>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge>{crop.crop_id}</Badge>
                        <Badge variant="secondary">{crop.label ?? "promociones"}</Badge>
                        <Badge variant="outline">conf: {typeof crop.conf === "number" ? crop.conf.toFixed(4) : "-"}</Badge>
                        <Badge variant={crop.llm_ok === false ? "destructive" : "secondary"}>llm_ok: {crop.llm_ok === false ? "error" : "ok"}</Badge>
                        <Badge variant="outline">session: {crop.llm_session_id ?? "-"}</Badge>
                      </div>
                      <p className="text-xs text-slate-300">box: {Array.isArray(crop.box) ? `[${crop.box.join(", ")}]` : "-"}</p>
                      <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs text-slate-200">
                        <p className="mb-1 font-semibold text-slate-300">OCR preview</p>
                        <p>{crop.ocr_text_preview ?? "Sin preview"}</p>
                      </div>
                      <details>
                        <summary className="cursor-pointer text-cyan-200 text-xs">Ver OCR crudo completo</summary>
                        <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{crop.ocr_raw_text ?? ""}</pre>
                      </details>
                      <details>
                        <summary className="cursor-pointer text-cyan-200 text-xs">Ver salida visión/LLM y productos derivados</summary>
                        <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">
{JSON.stringify({
  vision_used: crop.vision_used ?? false,
  vision_output: crop.vision_output ?? null,
  structured_products_before_filter: crop.structured_products_before_filter ?? [],
  structured_products_after_enrichment: crop.structured_products_after_enrichment ?? [],
  semantic_rag: crop.semantic_rag ?? {},
  promotions_extracted: crop.promotions_extracted ?? [],
}, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Memoria de soporte</CardTitle>
          <Button size="sm" variant="outline" onClick={() => {
            if (!selectedImage) return;
            downloadJsonFile(`${jobId}_${selectedImage.id}_debug.json`, {
              image: {
                id: selectedImage.id,
                original_name: selectedImage.original_name,
                image_name: selectedImage.image_name,
                status: selectedImage.status,
              },
              support_memory: artifacts.supportMemory,
              support_name_candidates: artifacts.supportNameCandidates,
              analysis_trace: artifacts.analysisTrace,
              primary_crops: artifacts.primaryCrops,
            });
          }} disabled={!selectedImage}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar debug JSON
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedImage ? (
            <p className="text-sm text-muted-foreground">Selecciona una imagen para ver memoria.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={memoryLabelFilter === "all" ? "default" : "outline"} onClick={() => setMemoryLabelFilter("all")}>all</Button>
                {memoryLabels.map((label) => (
                  <Button key={`memory-label-${label}`} size="sm" variant={memoryLabelFilter === label ? "default" : "outline"} onClick={() => setMemoryLabelFilter(label)}>
                    MEMORY: {label.toUpperCase()}
                  </Button>
                ))}
              </div>

              {filteredSupportMemory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay memoria para el filtro seleccionado.</p>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>crop</TableHead>
                          <TableHead>memory_label</TableHead>
                          <TableHead>label/conf</TableHead>
                          <TableHead>raw_text</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSupportMemory.map((item, idx) => (
                          <TableRow key={`memory-${idx}-${item.crop_filename ?? "crop"}`}>
                            <TableCell className="max-w-52 truncate">{item.crop_filename ?? item.crop_id ?? "-"}</TableCell>
                            <TableCell>{item.memory_label ?? "-"}</TableCell>
                            <TableCell>{item.label ?? "-"} / {typeof item.conf === "number" ? item.conf.toFixed(4) : "-"}</TableCell>
                            <TableCell className="max-w-96">
                              <details>
                                <summary className="cursor-pointer text-cyan-200">Ver texto OCR</summary>
                                <pre className="mt-2 max-h-36 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{item.raw_text_full ?? item.raw_text ?? ""}</pre>
                              </details>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3">
                    {filteredSupportMemory.map((item, idx) => {
                      const cropUrl = resolveArtifactPreviewUrl(item.crop_url ?? null);
                      const pre = (item.ocr_preprocess ?? null) as OcrPreprocessResult | null;
                      const variants = Array.isArray(pre?.variants) ? pre?.variants ?? [] : [];
                      const shadowVariants = Array.isArray(pre?.shadow_variants) ? pre?.shadow_variants ?? [] : [];
                      const selected = pre?.selected_variant ?? null;
                      const heuristicWinner = pre?.heuristic_winner ?? null;
                      const disabledReason = pre?.disabled_reason ?? null;
                      const compareKey = item.crop_id ?? item.crop_filename ?? `support_${idx}`;
                      const preprocessMode = supportPreprocessView[compareKey] ?? (shadowVariants.length ? "active" : "active");
                      const displayedVariants = preprocessMode === "shadow" ? shadowVariants : variants;
                      const shadowSummary = pre?.shadow_summary && typeof pre.shadow_summary === "object" ? pre.shadow_summary : null;
                      const displayedWinner = preprocessMode === "shadow" ? shadowSummary?.best_variant ?? null : selected;
                      const selectedVariant = displayedVariants.find((row) => row?.variant === displayedWinner) ?? displayedVariants[0] ?? null;
                      const selectedArtifact = getVariantArtifactUrl(selectedVariant);
                      const compareEnabled = Boolean(showSupportCompare[compareKey]);
                      const ocrUsedLabel = preprocessMode === "shadow" ? (displayedWinner ?? "sin ganador shadow") : (selected ?? "original");
                      return (
                        <div key={`support-visual-${idx}-${item.crop_id ?? item.crop_filename ?? "crop"}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline">{item.crop_id ?? "-"}</Badge>
                            <Badge variant="secondary">{item.memory_label ?? "support"}</Badge>
                            <Badge variant="outline">{item.label ?? "-"} / {typeof item.conf === "number" ? item.conf.toFixed(4) : "-"}</Badge>
                            {pre?.enabled ? <Badge>A/B activo</Badge> : <Badge variant="secondary">A/B n/a</Badge>}
                            <Badge variant={preprocessMode === "shadow" ? "secondary" : "outline"}>
                              {preprocessMode === "shadow" ? "Auditando shadow" : "OCR usado"}: {ocrUsedLabel}{pre?.enabled ? "" : " (A/B inactivo)"}
                            </Badge>
                            {heuristicWinner ? <Badge variant="outline">heuristic_winner: {heuristicWinner}</Badge> : null}
                            {!pre?.enabled && disabledReason ? <Badge variant="destructive">reason: {disabledReason}</Badge> : null}
                            {item.download_url ? <a href={resolveArtifactPreviewUrl(item.download_url) ?? item.download_url} target="_blank" rel="noreferrer" className="text-cyan-200 underline">Descargar crop</a> : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setShowSupportCompare((prev) => ({ ...prev, [compareKey]: !compareEnabled }))}
                              disabled={!selectedArtifact || (preprocessMode === "active" && ocrUsedLabel === "original")}
                            >
                              {compareEnabled ? "Ocultar comparación" : `Comparar original vs ${preprocessMode === "shadow" ? "shadow visible" : "OCR usado"}`}
                            </Button>
                          </div>
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant={preprocessMode === "active" ? "default" : "outline"}
                              onClick={() => setSupportPreprocessView((prev) => ({ ...prev, [compareKey]: "active" }))}
                            >
                              Activas
                            </Button>
                            <Button
                              size="sm"
                              variant={preprocessMode === "shadow" ? "default" : "outline"}
                              onClick={() => setSupportPreprocessView((prev) => ({ ...prev, [compareKey]: "shadow" }))}
                              disabled={!shadowVariants.length}
                            >
                              Shadow
                            </Button>
                            {shadowSummary?.would_replace_active ? (
                              <Badge variant="secondary">Shadow habría superado la variante activa</Badge>
                            ) : null}
                          </div>
                          <div className={compareEnabled ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
                            <div className="space-y-1">
                              <p className="text-xs text-slate-300">Vista de referencia (original)</p>
                              {cropUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={cropUrl} alt={item.crop_filename ?? item.crop_id ?? "support-crop"} className="h-36 w-full rounded-md border border-white/10 object-contain bg-black/30" />
                              ) : (
                                <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground">Sin miniatura</div>
                              )}
                            </div>
                            {compareEnabled ? (
                              <div className="space-y-1">
                                <p className="text-xs text-slate-300">Vista usada para OCR ({ocrUsedLabel})</p>
                                {selectedArtifact ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={selectedArtifact} alt={`${item.crop_id ?? "support"}-processed`} className="h-36 w-full rounded-md border border-cyan-300/30 object-contain bg-black/30" />
                                ) : (
                                  <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground">No hay artefacto de variante guardado</div>
                                )}
                              </div>
                            ) : null}
                          </div>
                          {displayedVariants.length ? (
                            <div className="mt-3 overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>variant</TableHead>
                                    <TableHead>mode</TableHead>
                                    <TableHead>score</TableHead>
                                    <TableHead>chars</TableHead>
                                    <TableHead>elapsed_ms</TableHead>
                                    <TableHead>quality</TableHead>
                                    <TableHead>skip</TableHead>
                                    <TableHead>preview</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {displayedVariants.map((row, vIdx) => (
                                    <TableRow key={`support-variant-${idx}-${vIdx}`}>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <span>{row?.variant ?? "-"}</span>
                                          {row?.variant === displayedWinner ? <Badge>{preprocessMode === "shadow" ? "mejor shadow" : "usada"}</Badge> : null}
                                        </div>
                                      </TableCell>
                                      <TableCell>{row?.mode ?? (preprocessMode === "shadow" ? "shadow" : "active")}</TableCell>
                                      <TableCell>{typeof row?.score === "number" ? row.score.toFixed(4) : "-"}</TableCell>
                                      <TableCell>{typeof row?.chars === "number" ? row.chars : "-"}</TableCell>
                                      <TableCell>{typeof row?.elapsed_ms === "number" ? row.elapsed_ms : "-"}</TableCell>
                                      <TableCell className="max-w-72 truncate" title={formatQualityMetrics(row?.quality_metrics)}>{formatQualityMetrics(row?.quality_metrics)}</TableCell>
                                      <TableCell className="max-w-72 truncate" title={typeof row?.ocr_skipped_reason === "string" ? row.ocr_skipped_reason : ""}>{typeof row?.ocr_skipped_reason === "string" ? row.ocr_skipped_reason : "-"}</TableCell>
                                      <TableCell className="max-w-80">
                                        <div className="space-y-2">
                                          <p className="truncate" title={typeof row?.raw_text_preview === "string" ? row.raw_text_preview : ""}>{typeof row?.raw_text_preview === "string" ? row.raw_text_preview : "-"}</p>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setVariantPreviewModal({
                                              title: `Soporte ${item.crop_id ?? item.crop_filename ?? "crop"}`,
                                              variant: row?.variant ?? "-",
                                              preview: typeof row?.raw_text_preview === "string" ? row.raw_text_preview : "",
                                            })}
                                          >
                                            Ver texto completo
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-muted-foreground">
                              {preprocessMode === "shadow" ? "No hay variantes shadow en este crop de soporte." : "No hay variantes OCR activas en este crop de soporte."}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-300">support_name_candidates</p>
                <div className="flex flex-wrap gap-2">
                  {artifacts.supportNameCandidates.length ? artifacts.supportNameCandidates.map((item) => (
                    <Badge key={`candidate-${item}`} variant="outline">{item}</Badge>
                  )) : <p className="text-sm text-muted-foreground">Sin candidatos de nombre.</p>}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Reporte técnico de análisis OCR/LLM</CardTitle>
          <div className="flex flex-wrap gap-2">
            {selectedImage?.result_md_url ? (
              <a href={resolveArtifactPreviewUrl(selectedImage.result_md_url) ?? selectedImage.result_md_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  <ScrollText className="mr-2 h-4 w-4" />
                  Abrir .md
                </Button>
              </a>
            ) : null}
            {selectedImage?.support_result_md_url ? (
              <a href={resolveArtifactPreviewUrl(selectedImage.support_result_md_url) ?? selectedImage.support_result_md_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">Soporte IA .md</Button>
              </a>
            ) : null}
            {selectedImage?.support_result_html_url ? (
              <a href={resolveArtifactPreviewUrl(selectedImage.support_result_html_url) ?? selectedImage.support_result_html_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">Soporte IA HTML</Button>
              </a>
            ) : null}
            {selectedImage?.ai_process_html_url ? (
              <a href={resolveArtifactPreviewUrl(selectedImage.ai_process_html_url) ?? selectedImage.ai_process_html_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">Proceso IA HTML</Button>
              </a>
            ) : null}
            {selectedImage?.ai_process_md_url ? (
              <a href={resolveArtifactPreviewUrl(selectedImage.ai_process_md_url) ?? selectedImage.ai_process_md_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">Proceso IA .md</Button>
              </a>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-300">
            Debug de asistencia y evidencias. Este reporte no es pensamiento interno oculto, es trazabilidad técnica del pipeline OCR/LLM.
          </p>
          {!selectedImage ? <p className="text-sm text-muted-foreground">Selecciona una imagen para ver su reporte.</p> : null}
          {selectedImage && (selectedImage.processing_status === "needs_review" || selectedImage.status === "needs_review") ? (
            <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              Esta imagen esta en needs_review. Usa este .md como evidencia principal de auditoria.
            </div>
          ) : null}
          {selectedImage?.no_products_reason ? (
            <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
              <p className="text-xs text-muted-foreground">Motivo sin productos</p>
              <p>{selectedImage.no_products_reason}</p>
            </div>
          ) : null}
          {selectedImage ? (
            !selectedImage.result_md_url ? (
              <p className="text-sm text-muted-foreground">No disponible.</p>
            ) : mdReportQuery.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : mdReportQuery.error ? (
              <p className="text-sm text-amber-300">No se pudo cargar el contenido del .md. Puedes abrirlo en una pestaña nueva.</p>
            ) : (
              <pre className="max-h-80 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs whitespace-pre-wrap">
                {mdReportQuery.data}
              </pre>
            )
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "visual" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Traza OCR + LLM</CardTitle></CardHeader>
        <CardContent>
          {!artifacts.analysisTrace.length ? (
            <p className="text-sm text-muted-foreground">Sin traza registrada para esta imagen.</p>
          ) : (
            <div className="space-y-2">
              {artifacts.analysisTrace.map((trace, idx) => (
                <div key={`trace-${idx}-${trace.crop ?? "crop"}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  {(() => {
                    const catalogMemory = objectOrNull(trace.promotion_catalog_memory);
                    const catalogMeta = catalogMemoryStateMeta(catalogMemory);
                    return (
                      <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={trace.source === "support" ? "secondary" : "default"}>{(trace.source ?? "primary").toUpperCase()}</Badge>
                    <span className="text-xs text-slate-300">crop: {trace.crop ?? "-"}</span>
                    <Badge variant={trace.llm_used ? "default" : "outline"}>llm_used: {trace.llm_used ? "si" : "no"}</Badge>
                    <Badge variant={trace.llm_ok === false ? "destructive" : "secondary"}>llm_ok: {trace.llm_ok === false ? "error" : "ok"}</Badge>
                    <Badge variant="outline">products_detected: {trace.products_detected ?? 0}</Badge>
                    <Badge variant={catalogMeta.variant}>catalog_memory: {catalogMeta.label}</Badge>
                    {catalogMemory?.mode ? <Badge variant="outline">mode: {formatPrimitive(catalogMemory.mode)}</Badge> : null}
                    {catalogMemory?.catalog_status ? <Badge variant="outline">estado: {formatPrimitive(catalogMemory.catalog_status)}</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-100">{trace.raw_text_preview ?? "Sin preview"}</p>
                  {trace.llm_session_id ? <p className="mt-1 text-xs text-muted-foreground">llm_session_id: {trace.llm_session_id}</p> : null}
                  {catalogMemory ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs">
                        <p className="font-semibold text-slate-300">Aplicacion</p>
                        <p>applied: {formatPrimitive(catalogMemory.applied)}</p>
                        <p>campos: {Array.isArray(catalogMemory.applied_fields) ? catalogMemory.applied_fields.join(", ") || "-" : "-"}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs">
                        <p className="font-semibold text-slate-300">Ranking</p>
                        <p>candidatos: {formatPrimitive(catalogMemory.candidates_count)}</p>
                        <p>delta top1-top2: {formatPrimitive(catalogMemory.top_score_delta)}</p>
                        <p>ambiguous_top2: {formatPrimitive(catalogMemory.ambiguous_top2)}</p>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs">
                        <p className="font-semibold text-slate-300">Top candidate</p>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-200">{JSON.stringify(catalogMemory.top_candidate ?? null, null, 2)}</pre>
                      </div>
                      <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs">
                        <p className="font-semibold text-slate-300">Blocked reasons</p>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-200">{JSON.stringify(catalogMemory.blocked_reasons ?? [], null, 2)}</pre>
                      </div>
                    </div>
                  ) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "products" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Productos finales</CardTitle></CardHeader>
        <CardContent>
          {!products.length ? (
            <p className="text-sm text-muted-foreground">Sin productos extraidos aun.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image code</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Tipo oferta</TableHead>
                    <TableHead>Precio oferta</TableHead>
                    <TableHead>Explicación backend</TableHead>
                    <TableHead>Estado variante</TableHead>
                    <TableHead>Memoria catálogo</TableHead>
                    <TableHead>Detalle técnico</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product, idx) => {
                    const assisted = product.name_assisted_from_support === true;
                    const originalName = typeof product.producto_original === "string" ? product.producto_original : "-";
                    const ragContextCount = typeof product.text_semantic_rag_context_count === "number" ? product.text_semantic_rag_context_count : 0;
                    const ragApplied = Array.isArray(product.text_semantic_rag_applied_rules) ? product.text_semantic_rag_applied_rules.length : 0;
                    const ragRulesDetected = Array.isArray(product.text_semantic_rag_normalization_rules) ? product.text_semantic_rag_normalization_rules.length : 0;
                    const measureCorrections = Array.isArray(product.measure_noise_corrections) ? product.measure_noise_corrections : [];
                    const productName = readProductValue(product, ["nombre_producto", "producto", "product_name", "name"]) ?? "-";
                    const gramaje = readProductValue(product, ["gramaje", "tamano"]) ?? "-";
                    const variante = readProductValue(product, ["variante"]) ?? "-";
                    const fieldAudit = (product.field_audit && typeof product.field_audit === "object") ? (product.field_audit as Record<string, unknown>) : null;
                    const supportEnrichment =
                      fieldAudit?.support_field_enrichment && typeof fieldAudit.support_field_enrichment === "object"
                        ? (fieldAudit.support_field_enrichment as Record<string, unknown>)
                        : null;
                    const variantSelectedReason = typeof supportEnrichment?.variant_selected_reason === "string" ? supportEnrichment.variant_selected_reason : null;
                    const supportApplied = typeof supportEnrichment?.applied === "boolean" ? supportEnrichment.applied : null;
                    const supportReason = typeof supportEnrichment?.reason === "string" ? supportEnrichment.reason : "-";
                    const variantPrimaryHint = typeof supportEnrichment?.variant_primary_hint === "string" ? supportEnrichment.variant_primary_hint : "-";
                    const variantSupportHint = typeof supportEnrichment?.variant_support_hint === "string" ? supportEnrichment.variant_support_hint : "-";
                    const tipoOferta = readProductValue(product, ["tipo_oferta", "type_of_promotion", "activity"]) ?? "-";
                    const precioOferta = readProductValue(product, ["precio_oferta", "precio_en_gondola"]) ?? "-";
                    const fotoOriginalUrl = readProductValue(product, ["foto_original_url"]) ?? "-";
                    const iaResponseUrl = readProductValue(product, ["ia_response_html_url"]) ?? "-";
                    const imageProcessCode = readProductValue(product, ["image_process_code"]) ?? "-";
                    const semanticReasonSummary = summarizeSemanticReason(product.text_semantic_reason);
                    const promotionCatalogMemory = objectOrNull(product.promotion_catalog_memory);
                    const catalogMeta = catalogMemoryStateMeta(promotionCatalogMemory);
                    const catalogAppliedFields = Array.isArray(promotionCatalogMemory?.applied_fields)
                      ? promotionCatalogMemory.applied_fields.map((item) => String(item)).filter(Boolean)
                      : [];
                    const catalogBlockedReasons = Array.isArray(promotionCatalogMemory?.blocked_reasons)
                      ? promotionCatalogMemory.blocked_reasons.map((item) => String(item)).filter(Boolean)
                      : [];
                    return (
                      <TableRow key={`product-${idx}`}>
                        <TableCell className="font-mono text-xs">{String(imageProcessCode)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p>{String(productName)}</p>
                            {assisted && originalName !== "-" ? <p className="text-xs text-muted-foreground">{originalName} -&gt; {String(productName)}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>{String(gramaje)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p>{String(variante)}</p>
                            {variantSelectedReason === "primary_context_variant_signal" ? (
                              <Badge variant="default">Variante confirmada por promoción</Badge>
                            ) : null}
                            {supportApplied === false ? (
                              <Badge variant="destructive">Variante bloqueada</Badge>
                            ) : null}
                            {supportApplied === true ? (
                              <Badge variant="default">Variante aplicada</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{String(tipoOferta)}</TableCell>
                        <TableCell>{String(precioOferta)}</TableCell>
                        <TableCell className="max-w-72 truncate text-xs" title={semanticReasonSummary}>{semanticReasonSummary}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {supportApplied === false ? <Badge variant="destructive">Variante bloqueada</Badge> : null}
                            {supportApplied === true ? <Badge variant="default">Variante aplicada</Badge> : null}
                            {variantSelectedReason === "primary_context_variant_signal" ? <Badge variant="secondary">Confirmada por promoción</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[240px] space-y-1 text-xs">
                            <Badge variant={catalogMeta.variant}>{catalogMeta.label}</Badge>
                            <p>mode: {formatPrimitive(promotionCatalogMemory?.mode)}</p>
                            <p>estado: {formatPrimitive(promotionCatalogMemory?.catalog_status)}</p>
                            <p>delta top1-top2: {formatPrimitive(promotionCatalogMemory?.top_score_delta)}</p>
                            {catalogAppliedFields.length ? (
                              <p className="text-emerald-200">campos: {catalogAppliedFields.join(", ")}</p>
                            ) : null}
                            {catalogBlockedReasons.length ? (
                              <p className="text-rose-200" title={catalogBlockedReasons.join(" | ")}>bloqueos: {catalogBlockedReasons.length}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2 min-w-[380px]">
                            <details>
                              <summary className="cursor-pointer text-cyan-200">Ver detalle</summary>
                              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                                <div className="rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                                  <p className="mb-1 font-semibold text-slate-300">Trazabilidad variante</p>
                                  <p>applied: {supportApplied === null ? "-" : supportApplied ? "true" : "false"}</p>
                                  <p>reason: {supportReason}</p>
                                  <p>variant_primary_hint: {variantPrimaryHint}</p>
                                  <p>variant_support_hint: {variantSupportHint}</p>
                                  <p>variant_selected_reason: {variantSelectedReason ?? "-"}</p>
                                </div>
                                <div className="rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                                  <p className="mb-1 font-semibold text-slate-300">RAG y calidad</p>
                                  <p>RAG context: {ragContextCount}</p>
                                  <p>Reglas aplicadas: {ragApplied}</p>
                                  <p>Reglas detectadas: {ragRulesDetected}</p>
                                  <p>Correcciones de medida: {measureCorrections.length}</p>
                                </div>
                                <div className="rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                                  <p className="mb-1 font-semibold text-slate-300">Memoria de catálogo</p>
                                  <p>mode: {formatPrimitive(promotionCatalogMemory?.mode)}</p>
                                  <p>applied: {formatPrimitive(promotionCatalogMemory?.applied)}</p>
                                  <p>candidates_count: {formatPrimitive(promotionCatalogMemory?.candidates_count)}</p>
                                  <p>top_score_delta: {formatPrimitive(promotionCatalogMemory?.top_score_delta)}</p>
                                  <p>ambiguous_top2: {formatPrimitive(promotionCatalogMemory?.ambiguous_top2)}</p>
                                </div>
                                <div className="rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                                  <p className="mb-1 font-semibold text-slate-300">Enlaces</p>
                                  <p>
                                    foto_original:{" "}
                                    {typeof fotoOriginalUrl === "string" && fotoOriginalUrl.startsWith("http") ? (
                                      <a href={resolveArtifactPreviewUrl(fotoOriginalUrl) ?? fotoOriginalUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">Abrir</a>
                                    ) : "-"}
                                  </p>
                                  <p>
                                    ia_response:{" "}
                                    {typeof iaResponseUrl === "string" && iaResponseUrl.startsWith("http") ? (
                                      <a href={resolveArtifactPreviewUrl(iaResponseUrl) ?? iaResponseUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">Abrir</a>
                                    ) : "-"}
                                  </p>
                                </div>
                                <div className="rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                                  <details>
                                    <summary className="cursor-pointer text-cyan-200">field_audit</summary>
                                    <pre className="mt-2 max-h-28 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-xs">{JSON.stringify(product.field_audit ?? {}, null, 2)}</pre>
                                  </details>
                                  <details>
                                    <summary className="cursor-pointer text-cyan-200">text_semantic_reason</summary>
                                    <pre className="mt-2 max-h-28 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-xs">{JSON.stringify(product.text_semantic_reason ?? null, null, 2)}</pre>
                                  </details>
                                  <details>
                                    <summary className="cursor-pointer text-cyan-200">text_semantic_rag_titles</summary>
                                    <pre className="mt-2 max-h-28 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-xs">{JSON.stringify(product.text_semantic_rag_titles ?? [], null, 2)}</pre>
                                  </details>
                                  <details>
                                    <summary className="cursor-pointer text-cyan-200">promotion_catalog_memory</summary>
                                    <pre className="mt-2 max-h-28 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-xs">{JSON.stringify(product.promotion_catalog_memory ?? null, null, 2)}</pre>
                                  </details>
                                </div>
                              </div>
                            </details>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      {activeView === "debug_ocr" ? (
      <div className="space-y-6">
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>OCR Debug / Ensemble</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selectedImage ? (
              <p className="text-muted-foreground">Selecciona una imagen para ver su trazabilidad OCR/Ensemble.</p>
            ) : !ocrDebug ? (
              <p className="text-muted-foreground">Esta imagen no trae `ocr_debug` (job anterior o debug no habilitado).</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-muted-foreground">primary_crops</p>
                    <p className="text-lg font-semibold">{String(ocrDebugSummary?.primary_crops ?? ocrDebugPrimaryCrops.length ?? 0)}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-muted-foreground">support_memory_crops</p>
                    <p className="text-lg font-semibold">{String(ocrDebugSummary?.support_memory_crops ?? 0)}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-muted-foreground">products</p>
                    <p className="text-lg font-semibold">{String(ocrDebugSummary?.products ?? 0)}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-muted-foreground">ensemble_enabled</p>
                    <p className="text-lg font-semibold">{String(Boolean(ocrDebugConfig?.ensemble_enabled))}</p>
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs">
                  <p><span className="text-muted-foreground">config.enabled:</span> {String(Boolean(ocrDebugConfig?.enabled))}</p>
                  <p><span className="text-muted-foreground">config.variants:</span> {Array.isArray(ocrDebugConfig?.variants) ? ocrDebugConfig?.variants.join(", ") : "-"}</p>
                  <p><span className="text-muted-foreground">config.internal_zones_enabled:</span> {String(Boolean(ocrDebugConfig?.internal_zones_enabled))}</p>
                </div>
                {promotionCatalogMemoryConfig ? (
                  <div className="rounded-md border border-violet-300/20 bg-violet-500/10 p-3 text-xs">
                    <p className="mb-1 font-semibold text-violet-100">promotion_catalog_memory en esta corrida</p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <p><span className="text-violet-200/80">enabled:</span> {formatPrimitive(promotionCatalogMemoryConfig.enabled)}</p>
                      <p><span className="text-violet-200/80">mode:</span> {formatPrimitive(promotionCatalogMemoryConfig.mode)}</p>
                      <p><span className="text-violet-200/80">source:</span> {formatPrimitive(promotionCatalogMemoryConfig.source)}</p>
                      <p><span className="text-violet-200/80">min_score:</span> {formatPrimitive(promotionCatalogMemoryConfig.min_score)}</p>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-cyan-200">Ver config completa usada</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(promotionCatalogMemoryConfig, null, 2)}</pre>
                    </details>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        {ocrDebugPrimaryCrops.length ? (
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Primary Crops: Como Se Leyo Cada Crop</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {ocrDebugPrimaryCrops.map((crop, idx) => {
                const preprocess = crop.ocr_preprocess && typeof crop.ocr_preprocess === "object" ? (crop.ocr_preprocess as Record<string, unknown>) : null;
                const variants = Array.isArray(preprocess?.variants) ? (preprocess?.variants as Record<string, unknown>[]) : [];
                const shadowVariants = Array.isArray(preprocess?.shadow_variants) ? (preprocess?.shadow_variants as Record<string, unknown>[]) : [];
                const selectedVariant = typeof preprocess?.selected_variant === "string" ? preprocess.selected_variant : "original";
                const heuristicWinner = typeof preprocess?.heuristic_winner === "string" ? preprocess.heuristic_winner : null;
                const semanticRerankReason = typeof preprocess?.semantic_rerank_reason === "string" ? preprocess.semantic_rerank_reason : null;
                const semanticRerankUsed = preprocess?.semantic_rerank_used === true;
                const shadowSummary = objectOrNull(preprocess?.shadow_summary);
                const ocrEnsemble = crop.ocr_ensemble && typeof crop.ocr_ensemble === "object" ? (crop.ocr_ensemble as Record<string, unknown>) : null;
                const fieldSources = ocrEnsemble?.field_sources && typeof ocrEnsemble.field_sources === "object" ? (ocrEnsemble.field_sources as Record<string, unknown>) : {};
                const evidenceByField = ocrEnsemble?.evidence_by_field && typeof ocrEnsemble.evidence_by_field === "object" ? (ocrEnsemble.evidence_by_field as Record<string, unknown>) : {};
                const sanityChecks = Array.isArray(ocrEnsemble?.sanity_checks) ? (ocrEnsemble.sanity_checks as Record<string, unknown>[]) : [];
                const internalZones = Array.isArray(ocrEnsemble?.internal_zones) ? (ocrEnsemble.internal_zones as Record<string, unknown>[]) : [];
                const llmMeta = llmStateMeta(crop);
                const visionResponseMeta = objectOrNull(crop.vision_response_meta);
                const visualBeforeRules = objectArray(crop.visual_structured_products_before_rules);
                const productsAfterSemantic = objectArray(crop.products_after_semantic_enrichment);
                const beforeTop = visualBeforeRules[0] ?? null;
                const afterTop = productsAfterSemantic[0] ?? null;
                return (
                  <div key={`ocr-debug-primary-${idx}-${String(crop.crop_id ?? "crop")}`} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge>{String(crop.crop_id ?? "-")}</Badge>
                      <Badge variant="secondary">{String(crop.label ?? "-")}</Badge>
                      <Badge variant="outline">source: {String(crop.source ?? "primary")}</Badge>
                      <Badge variant="outline">llm_ok: {String(crop.llm_ok ?? "-")}</Badge>
                      <Badge variant="outline">selected_variant: {selectedVariant}</Badge>
                      {heuristicWinner ? <Badge variant="outline">heuristic_winner: {heuristicWinner}</Badge> : null}
                      {semanticRerankUsed ? <Badge variant="outline">semantic_rerank</Badge> : null}
                      {shadowVariants.length ? <Badge variant="outline">shadow_variants: {String(shadowVariants.length)}</Badge> : null}
                      {selectedVariant === "adaptive_threshold" ? <Badge>OCR usado: adaptive_threshold</Badge> : null}
                    </div>
                    <p className="text-xs text-slate-300">box: {Array.isArray(crop.box) ? `[${crop.box.join(", ")}]` : "-"}</p>
                    <p className="text-xs text-slate-300">llm_session_id: {String(crop.llm_session_id ?? "-")}</p>
                    {shadowSummary ? (
                      <div className={`rounded-md border p-2 text-xs ${shadowSummary.would_replace_active === true ? "border-amber-300/30 bg-amber-500/10" : "border-white/10 bg-black/25"}`}>
                        <p>
                          <span className="font-semibold text-slate-300">shadow_summary:</span>{" "}
                          best={formatPrimitive(shadowSummary.best_variant)} · active={formatPrimitive(shadowSummary.active_best_variant)} ·
                          would_replace_active={formatPrimitive(shadowSummary.would_replace_active)} ·
                          delta={formatPrimitive(shadowSummary.score_delta_vs_active)}
                        </p>
                        {semanticRerankReason ? <p className="mt-1 text-slate-300">semantic_rerank_reason: {semanticRerankReason}</p> : null}
                      </div>
                    ) : null}
                    <div className="rounded-md border border-white/10 bg-black/25 p-2 text-xs">
                      <p className="font-semibold text-slate-300">OCR preview</p>
                      <p>{String(crop.ocr_text_preview ?? "-")}</p>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-cyan-200 text-xs">OCR crudo completo</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{String(crop.ocr_raw_text ?? "")}</pre>
                    </details>

                    <div className="rounded-md border border-violet-300/20 bg-violet-500/5 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-200">Interpretación Visual / LLM</p>
                          <p className="mt-1 text-slate-300">Compara lo que leyó OCR, lo que entendió el modelo visual y lo que dejaron las reglas semánticas.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">modelo: {firstText(crop.llm_model) || "-"}</Badge>
                          <Badge variant="outline">prompt: {firstText(crop.llm_prompt_file) || "-"}</Badge>
                          <Badge variant={llmMeta.variant}>{llmMeta.label}</Badge>
                          <Badge variant="outline">products_detected: {firstText(crop.products_detected) || "-"}</Badge>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-4">
                        <div className="rounded border border-white/10 bg-black/25 p-2">
                          <p className="text-[11px] text-slate-400">raw_chars</p>
                          <p className="mt-1 text-slate-200">{visionResponseMeta ? formatPrimitive(visionResponseMeta.raw_chars) : "Respuesta cruda no disponible para corridas anteriores"}</p>
                        </div>
                        <div className="rounded border border-white/10 bg-black/25 p-2">
                          <p className="text-[11px] text-slate-400">parse_ok</p>
                          <p className="mt-1 text-slate-200">{visionResponseMeta ? formatPrimitive(visionResponseMeta.parse_ok) : "-"}</p>
                        </div>
                        <div className="rounded border border-white/10 bg-black/25 p-2">
                          <p className="text-[11px] text-slate-400">attempt</p>
                          <p className="mt-1 text-slate-200">{visionResponseMeta ? formatPrimitive(visionResponseMeta.attempt) : "-"}</p>
                        </div>
                        <div className="rounded border border-white/10 bg-black/25 p-2">
                          <p className="text-[11px] text-slate-400">elapsed_sec</p>
                          <p className="mt-1 text-slate-200">{visionResponseMeta ? formatPrimitive(visionResponseMeta.elapsed_sec) : "-"}</p>
                        </div>
                      </div>

                      {firstText(crop.llm_fallback_reason) ? (
                        <div className="mt-3 rounded border border-amber-300/20 bg-amber-500/5 p-2 text-amber-100">
                          <span className="font-semibold">Fallback:</span> {firstText(crop.llm_fallback_reason)}
                        </div>
                      ) : null}

                      {visionResponseMeta ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-cyan-200">Respuesta cruda del modelo visual</summary>
                          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{firstText(visionResponseMeta.raw_preview) || "Sin raw_preview"}</pre>
                        </details>
                      ) : (
                        <p className="mt-3 text-slate-400">Respuesta cruda no disponible para corridas anteriores.</p>
                      )}

                      <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        <div className="rounded border border-white/10 bg-black/25 p-2">
                          <p className="mb-2 font-semibold text-slate-300">Lo que entendió el modelo visual antes de reglas</p>
                          {visualBeforeRules.length ? (
                            <pre className="max-h-52 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(visualBeforeRules, null, 2)}</pre>
                          ) : (
                            <p className="text-slate-400">El visual no devolvió productos estructurados.</p>
                          )}
                        </div>
                        <div className="rounded border border-white/10 bg-black/25 p-2">
                          <p className="mb-2 font-semibold text-slate-300">Resultado después de reglas semánticas</p>
                          {productsAfterSemantic.length ? (
                            <pre className="max-h-52 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(productsAfterSemantic, null, 2)}</pre>
                          ) : (
                            <p className="text-slate-400">Sin resultado estructurado después de reglas.</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="mb-2 font-semibold text-slate-300">Diferencias clave: visual antes vs resultado final</p>
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {diffRow("producto", beforeTop?.producto, afterTop?.producto)}
                          {diffRow("tamano", beforeTop?.tamano, afterTop?.tamano)}
                          {diffRow("precio_en_gondola", beforeTop?.precio_en_gondola, afterTop?.precio_en_gondola)}
                          {diffRow("precio_no_afiliado", beforeTop?.precio_no_afiliado, afterTop?.precio_no_afiliado)}
                          {diffRow("barcode", beforeTop?.barcode, afterTop?.barcode)}
                          {diffRow("codigo_interno", beforeTop?.codigo_interno, afterTop?.codigo_interno)}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>variant</TableHead>
                            <TableHead>score</TableHead>
                            <TableHead>chars</TableHead>
                            <TableHead>elapsed_ms</TableHead>
                            <TableHead>preview</TableHead>
                            <TableHead>artefacto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {variants.map((variant, vIdx) => {
                            const artifactUrl = resolveArtifactPreviewUrl(
                              (typeof variant.artifact_url === "string" ? variant.artifact_url : null) ??
                              (typeof variant.artifact_path === "string" ? variant.artifact_path : null),
                            );
                            const variantName = String(variant.variant ?? "-");
                            return (
                              <TableRow key={`ocr-variant-${idx}-${vIdx}`}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span>{variantName}</span>
                                    {variantName === selectedVariant ? <Badge variant="secondary">usada por pipeline</Badge> : null}
                                  </div>
                                </TableCell>
                                <TableCell>{typeof variant.score === "number" ? variant.score.toFixed(4) : "-"}</TableCell>
                                <TableCell>{typeof variant.chars === "number" ? variant.chars : "-"}</TableCell>
                                <TableCell>{typeof variant.elapsed_ms === "number" ? variant.elapsed_ms : "-"}</TableCell>
                                <TableCell className="max-w-96">
                                  <div className="space-y-2">
                                    <p className="truncate" title={String(variant.raw_text_preview ?? "")}>{String(variant.raw_text_preview ?? "-")}</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setVariantPreviewModal({
                                        title: `Debug crop ${String(crop.crop_id ?? "-")}`,
                                        variant: variantName,
                                        preview: typeof variant.raw_text_preview === "string" ? variant.raw_text_preview : "",
                                      })}
                                    >
                                      Ver texto completo
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell>{artifactUrl ? <a href={artifactUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">ver variante</a> : <span className="text-muted-foreground">sin artefacto</span>}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {shadowVariants.length ? (
                      <details>
                        <summary className="cursor-pointer text-cyan-200 text-xs">Ver variantes shadow</summary>
                        <div className="mt-2 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>variant</TableHead>
                                <TableHead>score</TableHead>
                                <TableHead>chars</TableHead>
                                <TableHead>elapsed_ms</TableHead>
                                <TableHead>skip</TableHead>
                                <TableHead>quality</TableHead>
                                <TableHead>artefacto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {shadowVariants.map((variant, shadowIdx) => {
                                const artifactUrl = resolveArtifactPreviewUrl(
                                  (typeof variant.artifact_url === "string" ? variant.artifact_url : null) ??
                                  (typeof variant.artifact_path === "string" ? variant.artifact_path : null),
                                );
                                return (
                                  <TableRow key={`shadow-variant-${idx}-${shadowIdx}`}>
                                    <TableCell>{String(variant.variant ?? "-")}</TableCell>
                                    <TableCell>{typeof variant.score === "number" ? variant.score.toFixed(4) : "-"}</TableCell>
                                    <TableCell>{typeof variant.chars === "number" ? variant.chars : "-"}</TableCell>
                                    <TableCell>{typeof variant.elapsed_ms === "number" ? variant.elapsed_ms : "-"}</TableCell>
                                    <TableCell className="max-w-72 truncate" title={String(variant.ocr_skipped_reason ?? "")}>{String(variant.ocr_skipped_reason ?? "-")}</TableCell>
                                    <TableCell className="max-w-72 truncate" title={formatQualityMetrics(variant.quality_metrics)}>{formatQualityMetrics(variant.quality_metrics)}</TableCell>
                                    <TableCell>{artifactUrl ? <a href={artifactUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">abrir</a> : <span className="text-muted-foreground">sin artefacto</span>}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    ) : null}

                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-300">field_sources</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(fieldSources).length ? Object.entries(fieldSources).map(([k, v]) => (
                          <Badge key={`field-source-${idx}-${k}`} variant="outline">{k} -&gt; {String(v)}</Badge>
                        )) : <span className="text-xs text-muted-foreground">Sin field_sources.</span>}
                      </div>
                    </div>

                    <details>
                      <summary className="cursor-pointer text-cyan-200 text-xs">evidence_by_field</summary>
                      <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(evidenceByField, null, 2)}</pre>
                    </details>

                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-300">sanity_checks</p>
                      <div className="space-y-1">
                        {sanityChecks.length ? sanityChecks.map((check, cIdx) => {
                          const level = String(check.level ?? "info");
                          return (
                            <div key={`sanity-${idx}-${cIdx}`} className="rounded border border-white/10 bg-black/25 p-2 text-xs">
                              <span className="font-semibold">{level.toUpperCase()}:</span> {String(check.code ?? "-")} {String(check.message ?? "")}
                            </div>
                          );
                        }) : <p className="text-xs text-muted-foreground">Sin sanity_checks.</p>}
                      </div>
                    </div>

                    {internalZones.length ? (
                      <details>
                        <summary className="cursor-pointer text-cyan-200 text-xs">internal_zones</summary>
                        <div className="mt-2 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>zone</TableHead>
                                <TableHead>box_ratio</TableHead>
                                <TableHead>elapsed_ms</TableHead>
                                <TableHead>raw_text_preview</TableHead>
                                <TableHead>artefacto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {internalZones.map((zone, zIdx) => {
                                const artifactUrl = resolveArtifactPreviewUrl(
                                  (typeof zone.artifact_url === "string" ? zone.artifact_url : null) ??
                                  (typeof zone.artifact_path === "string" ? zone.artifact_path : null),
                                );
                                return (
                                  <TableRow key={`zone-${idx}-${zIdx}`}>
                                    <TableCell>{String(zone.zone ?? "-")}</TableCell>
                                    <TableCell>{Array.isArray(zone.box_ratio) ? `[${zone.box_ratio.join(", ")}]` : "-"}</TableCell>
                                    <TableCell>{typeof zone.elapsed_ms === "number" ? zone.elapsed_ms : "-"}</TableCell>
                                    <TableCell className="max-w-80 truncate" title={String(zone.raw_text_preview ?? "")}>{String(zone.raw_text_preview ?? "-")}</TableCell>
                                    <TableCell>{artifactUrl ? <a href={artifactUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">abrir</a> : <span className="text-muted-foreground">sin artefacto</span>}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Auditoria de productos</CardTitle></CardHeader>
          <CardContent>
            {!ocrDebugProductAudit.length ? (
              <p className="text-sm text-muted-foreground">Sin product_audit en esta imagen.</p>
            ) : (
              <div className="space-y-3">
                {ocrDebugProductAudit.map((audit, idx) => (
                  <div key={`product-audit-${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge>{String(audit.producto ?? "-")}</Badge>
                      <Badge variant="outline">{String(audit.crop_image_filename ?? "-")}</Badge>
                      <Badge variant="outline">confidence: {typeof audit.product_confidence_score === "number" ? audit.product_confidence_score.toFixed(3) : "-"}</Badge>
                      <Badge variant={audit.needs_review_reason ? "destructive" : "secondary"}>needs_review: {String(audit.needs_review_reason ?? "no")}</Badge>
                    </div>
                    <p className="text-xs text-slate-300">evidence_tokens: {Array.isArray(audit.evidence_tokens) ? audit.evidence_tokens.join(", ") : "-"}</p>
                    <p className="text-xs text-slate-300">support_evidence_tokens: {Array.isArray(audit.support_evidence_tokens) ? audit.support_evidence_tokens.join(", ") : "-"}</p>
                    <details>
                      <summary className="cursor-pointer text-cyan-200 text-xs">field_audit</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(audit.field_audit ?? {}, null, 2)}</pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      ) : null}

      {activeView === "artifacts" ? (
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Imagenes y artefactos por imagen</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!images.length ? (
            <p className="text-sm text-muted-foreground">Sin imagenes reportadas en este job.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>original_name</TableHead>
                      <TableHead>image_process_code</TableHead>
                      <TableHead>status</TableHead>
                      <TableHead>processing_status</TableHead>
                      <TableHead>no_products_reason</TableHead>
                      <TableHead>annotated_image_url</TableHead>
                      <TableHead>result_json_url</TableHead>
                      <TableHead>result_html_url</TableHead>
                      <TableHead>result_md_url</TableHead>
                      <TableHead>soporte_ia_md</TableHead>
                      <TableHead>soporte_ia_html</TableHead>
                      <TableHead>proceso_ia_html</TableHead>
                      <TableHead>proceso_ia_md</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {images.map((image) => (
                      <TableRow key={`image-row-${image.id}-${image.file_id ?? image.original_name ?? ""}`} className="cursor-pointer" onClick={() => setSelectedImage(image)}>
                        <TableCell>{image.original_name ?? image.image_name}</TableCell>
                        <TableCell className="font-mono text-xs">{image.image_process_code ?? "-"}</TableCell>
                        <TableCell>{image.status}</TableCell>
                        <TableCell>
                          {image.processing_status ?? "-"}
                          {(image.processing_status === "needs_review" || image.status === "needs_review") ? <Badge variant="secondary" className="ml-2">needs_review</Badge> : null}
                        </TableCell>
                        <TableCell className="max-w-72 truncate" title={image.no_products_reason ?? ""}>{image.no_products_reason ?? "-"}</TableCell>
                        <TableCell>{image.annotated_image_url ? <a href={resolveArtifactPreviewUrl(image.annotated_image_url) ?? image.annotated_image_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Ver anotada</a> : "No disponible"}</TableCell>
                        <TableCell>{image.result_json_url ? <a href={resolveArtifactPreviewUrl(image.result_json_url) ?? image.result_json_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Abrir JSON imagen</a> : "No disponible"}</TableCell>
                        <TableCell>{image.result_html_url ? <a href={resolveArtifactPreviewUrl(image.result_html_url) ?? image.result_html_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Abrir HTML imagen</a> : "No disponible"}</TableCell>
                        <TableCell>{image.result_md_url ? <a href={resolveArtifactPreviewUrl(image.result_md_url) ?? image.result_md_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Abrir reporte tecnico (.md)</a> : "No disponible"}</TableCell>
                        <TableCell>{image.support_result_md_url ? <a href={resolveArtifactPreviewUrl(image.support_result_md_url) ?? image.support_result_md_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Abrir soporte IA (.md)</a> : "No disponible"}</TableCell>
                        <TableCell>{image.support_result_html_url ? <a href={resolveArtifactPreviewUrl(image.support_result_html_url) ?? image.support_result_html_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Abrir soporte IA (HTML)</a> : "No disponible"}</TableCell>
                        <TableCell>{image.ai_process_html_url ? <a href={resolveArtifactPreviewUrl(image.ai_process_html_url) ?? image.ai_process_html_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Abrir proceso IA (HTML)</a> : "No disponible"}</TableCell>
                        <TableCell>{image.ai_process_md_url ? <a href={resolveArtifactPreviewUrl(image.ai_process_md_url) ?? image.ai_process_md_url} className="text-cyan-200 underline" target="_blank" rel="noreferrer">Abrir proceso IA (.md)</a> : "No disponible"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedImage ? (
                <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-sm text-slate-300">Preview: {selectedImage.original_name ?? selectedImage.image_name}</p>
                  {selectedPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedPreviewUrl} alt={selectedImage.original_name ?? "annotated"} className="max-h-96 w-full rounded-md border border-white/10 object-contain" />
                  ) : (
                    <p className="text-sm text-muted-foreground">No hay preview disponible.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {selectedImage.annotated_image_url ? <a href={resolveArtifactPreviewUrl(selectedImage.annotated_image_url) ?? selectedImage.annotated_image_url} target="_blank" rel="noreferrer"><Button size="sm">Ver anotada</Button></a> : null}
                    {selectedImage.result_json_url ? <a href={resolveArtifactPreviewUrl(selectedImage.result_json_url) ?? selectedImage.result_json_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Abrir JSON imagen</Button></a> : null}
                    {selectedImage.result_html_url ? <a href={resolveArtifactPreviewUrl(selectedImage.result_html_url) ?? selectedImage.result_html_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Abrir HTML imagen</Button></a> : null}
                    {selectedImage.result_md_url ? <a href={resolveArtifactPreviewUrl(selectedImage.result_md_url) ?? selectedImage.result_md_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ScrollText className="mr-2 h-4 w-4" />Abrir reporte tecnico (.md)</Button></a> : null}
                    {selectedImage.support_result_md_url ? <a href={resolveArtifactPreviewUrl(selectedImage.support_result_md_url) ?? selectedImage.support_result_md_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Soporte IA .md</Button></a> : null}
                    {selectedImage.support_result_html_url ? <a href={resolveArtifactPreviewUrl(selectedImage.support_result_html_url) ?? selectedImage.support_result_html_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Soporte IA HTML</Button></a> : null}
                    {selectedImage.ai_process_html_url ? <a href={resolveArtifactPreviewUrl(selectedImage.ai_process_html_url) ?? selectedImage.ai_process_html_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Proceso IA HTML</Button></a> : null}
                    {selectedImage.ai_process_md_url ? <a href={resolveArtifactPreviewUrl(selectedImage.ai_process_md_url) ?? selectedImage.ai_process_md_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Proceso IA .md</Button></a> : null}
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/25 p-3">
                    <p className="mb-2 text-xs font-semibold tracking-wide text-slate-300">Paso a paso (/artifacts)</p>
                    {imageArtifactsQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}
                    {imageArtifactsQuery.error ? (
                      <p className="text-xs text-amber-300">No se pudo cargar /artifacts para esta imagen. Mostrando fallback de results.</p>
                    ) : null}
                    <div className="space-y-3 text-xs">
                      <div>
                        <p className="mb-1 text-slate-300">support_name_candidates</p>
                        <pre className="max-h-28 overflow-auto rounded border border-white/10 bg-black/30 p-2">{JSON.stringify(artifacts.supportNameCandidates ?? [], null, 2)}</pre>
                      </div>
                      <div>
                        <p className="mb-1 text-slate-300">support_memory.raw_text</p>
                        <pre className="max-h-32 overflow-auto rounded border border-white/10 bg-black/30 p-2">
{JSON.stringify((artifacts.supportMemory ?? []).map((x) => ({ crop_id: x.crop_id, memory_label: x.memory_label, raw_text: x.raw_text ?? x.raw_text_full ?? "" })), null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-slate-300">structured_products_before_filter</p>
                        <pre className="max-h-36 overflow-auto rounded border border-white/10 bg-black/30 p-2">
{JSON.stringify((artifacts.primaryCrops ?? []).map((crop) => ({ crop_id: crop.crop_id, structured_products_before_filter: crop.structured_products_before_filter ?? [] })), null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-slate-300">structured_products_after_enrichment</p>
                        <pre className="max-h-36 overflow-auto rounded border border-white/10 bg-black/30 p-2">
{JSON.stringify((artifacts.primaryCrops ?? []).map((crop) => ({ crop_id: crop.crop_id, structured_products_after_enrichment: crop.structured_products_after_enrichment ?? [] })), null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      ) : null}

      {variantPreviewModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-slate-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Texto preview de variante</h3>
                <p className="text-sm text-slate-300">{variantPreviewModal.title} · {variantPreviewModal.variant}</p>
              </div>
              <Button variant="outline" onClick={() => setVariantPreviewModal(null)}>Cerrar</Button>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm text-slate-100">
                {variantPreviewModal.preview || "Sin texto preview disponible para esta variante."}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

