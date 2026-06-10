"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Download,
  FileJson2,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Package,
  RefreshCcw,
  ScrollText,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobImage } from "@/types/ocr-api";
import { JobLiveTimeline } from "@/components/jobs/job-live-timeline";
import { JobMetricsPanel } from "@/components/jobs/job-metrics-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { JobDetailViewKey } from "@/components/jobs-history/job-view-tabs";
import { cn } from "@/lib/utils";

type JobSummaryData = {
  job_id?: string;
  status?: string;
  account_name?: string;
  config_name?: string;
  created_at?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  finished_at?: string | null;
  total_images?: number;
  processed_images?: number;
  failed_images?: number;
  error_message?: string | null;
};

type ChainDiagnosticsSlice = {
  requested: unknown;
  resolved: unknown;
  resolutionSource: unknown;
  resolutionConfidence: unknown;
};

export type JobOverviewViewProps = {
  jobId: string;
  resolvedAccount: string;
  isTerminal: boolean;
  jobLoading: boolean;
  jobError: boolean;
  jobData: JobSummaryData | null | undefined;
  getStatusVariant: (status: string) => "default" | "destructive" | "secondary";
  formatDate: (value?: string | null) => string;
  images: JobImage[];
  totalProducts: number;
  totalPromotions: number;
  totalBarcodes: number;
  needsReviewCount: number;
  chainDiagnostics: ChainDiagnosticsSlice;
  normalizedUserResponse: Record<string, unknown> | null | undefined;
  dedupeSummary: Record<string, unknown> | null | undefined;
  resultsLoading: boolean;
  resultsFetching: boolean;
  resultsPendingMessage: string | null;
  resultsErrorDetail: string | null;
  masterHtmlUrl?: string | null;
  masterJsonUrl?: string | null;
  excelUrl?: string | null;
  resolveArtifactPreviewUrl: (path?: string | null) => string | null;
  onLoadResults: () => void;
  onNavigate: (view: JobDetailViewKey) => void;
  onSelectImage: (image: JobImage) => void;
  imageProcessCodeInput: string;
  onImageProcessCodeInputChange: (value: string) => void;
  onLookupByCode: () => void;
  onReprocessByCode: () => void;
  lookupPending: boolean;
  reprocessPending: boolean;
  lookupResult: { job_id?: string; account_name?: string; image_status?: string } | null;
  reprocessJobId: string | null;
};

function formatJobDuration(started?: string | null, finished?: string | null): string {
  if (!started || !finished) return "En curso o sin cerrar";
  const startMs = new Date(started).getTime();
  const endMs = new Date(finished).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "-";
  const totalSec = Math.round((endMs - startMs) / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${remMin}m`;
}

function imageLabel(image: JobImage): string {
  return image.original_name ?? image.image_name ?? `Imagen ${image.id}`;
}

function SummaryTile({
  label,
  children,
  className,
  onClick,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-white/10 bg-black/20 p-3 text-left",
        onClick && "transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/5",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </Comp>
  );
}

function JobOverviewStatusBar({
  jobData,
  getStatusVariant,
  formatDate,
  totalProducts,
  totalPromotions,
  needsReviewCount,
  chainDiagnostics,
  onNavigate,
}: {
  jobData: JobSummaryData | null | undefined;
  getStatusVariant: (status: string) => "default" | "destructive" | "secondary";
  formatDate: (value?: string | null) => string;
  totalProducts: number;
  totalPromotions: number;
  needsReviewCount: number;
  chainDiagnostics: ChainDiagnosticsSlice;
  onNavigate: (view: JobDetailViewKey) => void;
}) {
  const status = jobData?.status ?? "unknown";
  const totalImages = jobData?.total_images ?? 0;
  const processedImages = jobData?.processed_images ?? 0;
  const failedImages = jobData?.failed_images ?? 0;
  const progressPct = totalImages > 0 ? Math.min(100, Math.round((processedImages / totalImages) * 100)) : 0;
  const resolvedChain = String(chainDiagnostics.resolved ?? "-");
  const requestedChain = String(chainDiagnostics.requested ?? "-");

  return (
    <Card className="border-cyan-300/25 bg-gradient-to-br from-cyan-500/10 via-slate-950/40 to-black/30 backdrop-blur">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Badge variant={getStatusVariant(status)} className="shrink-0 px-3 py-1 text-sm uppercase">
              {status}
            </Badge>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Estado operativo del job</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Duración: {formatJobDuration(jobData?.started_at, jobData?.finished_at)}
                {jobData?.finished_at ? ` · fin ${formatDate(jobData.finished_at)}` : jobData?.started_at ? ` · inicio ${formatDate(jobData.started_at)}` : ""}
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1 xl:max-w-md">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
              <span>Progreso de imágenes</span>
              <span className="font-mono">
                {processedImages}/{totalImages}
                {failedImages > 0 ? ` · ${failedImages} fallidas` : ""}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <SummaryTile label="Productos" onClick={() => onNavigate("products")}>
              <p className="text-lg font-semibold text-white">{totalProducts}</p>
            </SummaryTile>
            <SummaryTile label="Promos" onClick={() => onNavigate("products")}>
              <p className="text-lg font-semibold text-white">{totalPromotions}</p>
            </SummaryTile>
            <SummaryTile
              label="Review"
              onClick={needsReviewCount > 0 ? () => onNavigate("artifacts") : undefined}
              className={needsReviewCount > 0 ? "border-amber-300/30 bg-amber-500/10" : undefined}
            >
              <p className={cn("text-lg font-semibold", needsReviewCount > 0 ? "text-amber-100" : "text-white")}>
                {needsReviewCount}
              </p>
            </SummaryTile>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onNavigate("visual")}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Visual/OCR
          </Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate("artifacts")}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Artefactos
          </Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate("products")}>
            <Package className="mr-2 h-4 w-4" />
            Productos
          </Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate("debug_ocr")}>
            <ScrollText className="mr-2 h-4 w-4" />
            Debug OCR
          </Button>
        </div>

        {(requestedChain !== "-" || resolvedChain !== "-") ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs">
            <Store className="h-4 w-4 text-cyan-300" />
            <span className="text-slate-400">Cadena:</span>
            <span className="font-medium text-slate-200">{requestedChain}</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-semibold text-white">{resolvedChain}</span>
            {typeof chainDiagnostics.resolutionConfidence === "number" ? (
              <Badge variant="outline">{Math.round(chainDiagnostics.resolutionConfidence * 100)}% conf.</Badge>
            ) : null}
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-cyan-200" onClick={() => onNavigate("visual")}>
              Ver diagnóstico
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function JobOverviewImagesMiniList({
  images,
  onSelectImage,
  onNavigate,
}: {
  images: JobImage[];
  onSelectImage: (image: JobImage) => void;
  onNavigate: (view: JobDetailViewKey) => void;
}) {
  if (!images.length) return null;
  const preview = images.slice(0, 6);

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Imágenes del job</CardTitle>
        {images.length > preview.length ? (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onNavigate("artifacts")}>
            Ver todas ({images.length})
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {preview.map((image) => {
          const review = image.processing_status === "needs_review" || image.status === "needs_review";
          return (
            <button
              key={`overview-image-${image.id}`}
              type="button"
              onClick={() => {
                onSelectImage(image);
                onNavigate("artifacts");
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{imageLabel(image)}</p>
                <p className="text-[11px] text-slate-400">
                  {image.status}
                  {image.processing_status ? ` · ${image.processing_status}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {review ? <Badge variant="destructive" className="text-[10px]">review</Badge> : null}
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function JobOverviewView({
  jobId,
  resolvedAccount,
  isTerminal,
  jobLoading,
  jobError,
  jobData,
  getStatusVariant,
  formatDate,
  images,
  totalProducts,
  totalPromotions,
  totalBarcodes,
  needsReviewCount,
  chainDiagnostics,
  normalizedUserResponse,
  dedupeSummary,
  resultsLoading,
  resultsFetching,
  resultsPendingMessage,
  resultsErrorDetail,
  masterHtmlUrl,
  masterJsonUrl,
  excelUrl,
  resolveArtifactPreviewUrl,
  onLoadResults,
  onNavigate,
  onSelectImage,
  imageProcessCodeInput,
  onImageProcessCodeInputChange,
  onLookupByCode,
  onReprocessByCode,
  lookupPending,
  reprocessPending,
  lookupResult,
  reprocessJobId,
}: JobOverviewViewProps) {
  return (
    <div className="space-y-6">
      {!jobLoading && jobData ? (
        <JobOverviewStatusBar
          jobData={jobData}
          getStatusVariant={getStatusVariant}
          formatDate={formatDate}
          totalProducts={totalProducts}
          totalPromotions={totalPromotions}
          needsReviewCount={needsReviewCount}
          chainDiagnostics={chainDiagnostics}
          onNavigate={onNavigate}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Resumen del job</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {jobLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-44" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : jobError ? (
                <p className="text-sm text-rose-300">No se pudo cargar detalle de job.</p>
              ) : (
                <>
                  <details open className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">Identidad</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <SummaryTile label="job_id"><p className="font-mono text-xs break-all">{jobData?.job_id}</p></SummaryTile>
                      <SummaryTile label="account_name"><p className="text-sm">{jobData?.account_name ?? resolvedAccount}</p></SummaryTile>
                      <SummaryTile label="config_name"><p className="text-sm">{jobData?.config_name ?? "-"}</p></SummaryTile>
                      <SummaryTile label="status"><Badge variant={getStatusVariant(jobData?.status ?? "unknown")}>{jobData?.status ?? "unknown"}</Badge></SummaryTile>
                    </div>
                  </details>

                  <details open className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">Ejecución</summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <SummaryTile label="created_at"><p className="text-xs">{formatDate(jobData?.created_at)}</p></SummaryTile>
                      <SummaryTile label="started_at"><p className="text-xs">{formatDate(jobData?.started_at)}</p></SummaryTile>
                      <SummaryTile label="updated_at"><p className="text-xs">{formatDate(jobData?.updated_at)}</p></SummaryTile>
                      <SummaryTile label="finished_at"><p className="text-xs">{formatDate(jobData?.finished_at)}</p></SummaryTile>
                      <SummaryTile label="total_images"><p className="text-lg font-semibold">{jobData?.total_images ?? 0}</p></SummaryTile>
                      <SummaryTile label="processed_images"><p className="text-lg font-semibold text-emerald-200">{jobData?.processed_images ?? 0}</p></SummaryTile>
                      <SummaryTile label="failed_images"><p className="text-lg font-semibold text-rose-200">{jobData?.failed_images ?? 0}</p></SummaryTile>
                      <SummaryTile label="error"><p className="text-xs text-rose-300 break-words">{jobData?.error_message ?? "-"}</p></SummaryTile>
                    </div>
                  </details>

                  {(jobData?.status ?? "").toLowerCase() === "queued" ? (
                    <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
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
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  value={imageProcessCodeInput}
                  onChange={(e) => onImageProcessCodeInputChange(e.target.value)}
                  placeholder="Ej: 123456"
                />
                <Button variant="outline" onClick={onLookupByCode} disabled={lookupPending}>
                  {lookupPending ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Buscar por código
                </Button>
                <Button onClick={onReprocessByCode} disabled={reprocessPending}>
                  {reprocessPending ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Reprocesar
                </Button>
              </div>
              {lookupResult ? (
                <p className="text-xs text-muted-foreground">
                  lookup: job={lookupResult.job_id ?? "-"} | account={lookupResult.account_name ?? "-"} | status={lookupResult.image_status ?? "-"}
                </p>
              ) : null}
              {reprocessJobId ? (
                <Link
                  href={`/accounts/${encodeURIComponent(resolvedAccount)}/jobs/${encodeURIComponent(reprocessJobId)}`}
                  className="text-sm text-cyan-200 underline"
                >
                  Abrir nuevo job reprocesado: {reprocessJobId}
                </Link>
              ) : null}
            </CardContent>
          </Card>

          <JobOverviewImagesMiniList images={images} onSelectImage={onSelectImage} onNavigate={onNavigate} />
          <JobMetricsPanel jobId={jobId} isTerminal={isTerminal} />
        </div>

        <div className="space-y-6">
          <JobLiveTimeline jobId={jobId} isTerminal={isTerminal} />

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader className="flex flex-col gap-3">
              <CardTitle>Resultados y artefactos</CardTitle>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-start"
                  onClick={async () => {
                    try {
                      const events = await ocrApi.getJobEvents(jobId);
                      const blob = new Blob([JSON.stringify(events, null, 2)], { type: "application/json;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `${jobId}_events.json`;
                      document.body.appendChild(anchor);
                      anchor.click();
                      anchor.remove();
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      toast.error("No se pudo exportar eventos", {
                        description: error instanceof HttpError ? error.message : "Error inesperado",
                      });
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar eventos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="justify-start"
                  onClick={async () => {
                    try {
                      const metrics = await ocrApi.getJobMetrics(jobId);
                      const blob = new Blob([JSON.stringify(metrics, null, 2)], { type: "application/json;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = `${jobId}_metrics.json`;
                      document.body.appendChild(anchor);
                      anchor.click();
                      anchor.remove();
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      toast.error("No se pudo exportar metricas", {
                        description: error instanceof HttpError ? error.message : "Error inesperado",
                      });
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar métricas
                </Button>
                <Button size="sm" className="justify-start sm:col-span-2 lg:col-span-1" onClick={onLoadResults} disabled={resultsFetching}>
                  {resultsFetching ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Reintentar resultados
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {resultsLoading ? <Skeleton className="h-24 w-full" /> : null}
              {resultsPendingMessage ? (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-amber-100">{resultsPendingMessage}</p>
                  <Button size="sm" variant="outline" onClick={onLoadResults} disabled={resultsFetching}>
                    Reintentar ahora
                  </Button>
                </div>
              ) : null}
              {resultsErrorDetail ? (
                <p className="text-sm text-rose-300">No se pudieron cargar resultados: {resultsErrorDetail}</p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryTile label="total_products" onClick={() => onNavigate("products")}>
                  <p className="text-lg font-semibold">{totalProducts}</p>
                </SummaryTile>
                <SummaryTile label="total_promotions" onClick={() => onNavigate("products")}>
                  <p className="text-lg font-semibold">{totalPromotions}</p>
                </SummaryTile>
                <SummaryTile label="total_barcodes" onClick={() => onNavigate("products")}>
                  <p className="text-lg font-semibold">{totalBarcodes}</p>
                </SummaryTile>
              </div>

              {normalizedUserResponse ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <SummaryTile label="id_pdv"><p className="text-sm font-semibold">{String(normalizedUserResponse.id_pdv ?? "-")}</p></SummaryTile>
                  <SummaryTile label="subcategoria"><p className="text-sm font-semibold">{String(normalizedUserResponse.subcategoria ?? "-")}</p></SummaryTile>
                  <SummaryTile label="usuario_relevo"><p className="text-sm font-semibold">{String(normalizedUserResponse.usuario_relevo ?? "-")}</p></SummaryTile>
                </div>
              ) : null}

              {dedupeSummary ? (
                <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Consolidacion / Deduplicacion</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Antes</p><p className="text-base font-semibold">{String(dedupeSummary.before ?? "-")}</p></div>
                    <div><p className="text-xs text-muted-foreground">Despues</p><p className="text-base font-semibold">{String(dedupeSummary.after ?? "-")}</p></div>
                    <div><p className="text-xs text-muted-foreground">Eliminados</p><p className="text-base font-semibold">{String(dedupeSummary.removed ?? "-")}</p></div>
                    <div><p className="text-xs text-muted-foreground">Estado</p><p className="text-base font-semibold">{typeof dedupeSummary.enabled === "boolean" ? (dedupeSummary.enabled ? "Activo" : "Inactivo") : "-"}</p></div>
                  </div>
                  {typeof dedupeSummary.removed === "number" && dedupeSummary.removed > 0 ? (
                    <div className="flex items-start gap-2 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Se consolidaron productos similares para evitar duplicados.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {masterHtmlUrl ? (
                  <a href={resolveArtifactPreviewUrl(masterHtmlUrl) ?? masterHtmlUrl} target="_blank" rel="noreferrer">
                    <Button size="sm"><FileText className="mr-2 h-4 w-4" />Abrir Master HTML</Button>
                  </a>
                ) : null}
                {masterJsonUrl ? (
                  <a href={resolveArtifactPreviewUrl(masterJsonUrl) ?? masterJsonUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><FileJson2 className="mr-2 h-4 w-4" />Abrir Master JSON</Button>
                  </a>
                ) : null}
                {excelUrl ? (
                  <a href={resolveArtifactPreviewUrl(excelUrl) ?? excelUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><FileSpreadsheet className="mr-2 h-4 w-4" />Descargar Excel</Button>
                  </a>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}