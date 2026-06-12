"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Barcode,
  CalendarClock,
  ChevronRight,
  Download,
  FileJson2,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Package,
  RefreshCcw,
  ScrollText,
  Sparkles,
  Store,
  Tag,
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
import { PromotionCardinalityCard } from "@/components/jobs/promotion-cardinality-card";
import type { PromotionCardinality } from "@/types/ocr-api";
import { LoadingPanel } from "@/components/ui/async-content";
import { formatWallClockDuration } from "@/lib/format-duration";
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
  promotionCardinality: PromotionCardinality | null | undefined;
  promotionReviewRequired: boolean;
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
  return formatWallClockDuration(started, finished);
}

function imageLabel(image: JobImage): string {
  return image.original_name ?? image.image_name ?? `Imagen ${image.id}`;
}

function SummaryTile({
  label,
  hint,
  children,
  className,
  onClick,
}: {
  label: string;
  hint?: string;
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
        "rounded-xl border border-white/10 bg-black/20 p-3 text-left",
        onClick && "transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/5",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p> : null}
    </Comp>
  );
}

function OutcomeKpi({
  icon,
  label,
  value,
  hint,
  onClick,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
  onClick?: () => void;
  accent?: "cyan" | "violet" | "emerald" | "amber";
}) {
  const accents = {
    cyan: "border-cyan-400/20 from-cyan-500/10",
    violet: "border-violet-400/20 from-violet-500/10",
    emerald: "border-emerald-400/20 from-emerald-500/10",
    amber: "border-amber-400/20 from-amber-500/10",
  };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-gradient-to-br to-transparent p-4 text-left",
        accents[accent ?? "cyan"],
        onClick && "transition-transform hover:scale-[1.01]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 font-heading text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/25 p-2 text-slate-300">{icon}</div>
      </div>
      <p className="mt-2 text-xs text-slate-400">{hint}</p>
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
  promotionReviewRequired,
  detectedPromotionsLabel,
  chainDiagnostics,
  onNavigate,
}: {
  jobData: JobSummaryData | null | undefined;
  getStatusVariant: (status: string) => "default" | "destructive" | "secondary";
  formatDate: (value?: string | null) => string;
  totalProducts: number;
  totalPromotions: number;
  needsReviewCount: number;
  promotionReviewRequired: boolean;
  detectedPromotionsLabel: string;
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
            {promotionReviewRequired ? (
              <Badge variant="secondary" className="shrink-0 border-amber-400/35 bg-amber-500/15 text-amber-100">
                Requiere revisión
              </Badge>
            ) : null}
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
            <SummaryTile label="Productos" hint="Filas finales" onClick={() => onNavigate("products")}>
              <p className="text-lg font-semibold text-white">{totalProducts}</p>
            </SummaryTile>
            <SummaryTile label="Promociones" hint="Etiquetas detectadas" onClick={() => onNavigate("products")}>
              <p className="text-lg font-semibold text-white">{detectedPromotionsLabel}</p>
            </SummaryTile>
            <SummaryTile
              label="Revisiones"
              hint="Imágenes en needs_review"
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
  const reviewCount = images.filter((img) => img.processing_status === "needs_review" || img.status === "needs_review").length;

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">Imágenes del job</CardTitle>
          <p className="mt-0.5 text-xs text-slate-500">
            {images.length} en total{reviewCount > 0 ? ` · ${reviewCount} requieren revisión` : ""}
          </p>
        </div>
        {images.length > preview.length ? (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onNavigate("artifacts")}>
            Ver todas ({images.length})
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {preview.map((image) => {
          const review = image.processing_status === "needs_review" || image.status === "needs_review";
          const statusLabel = image.processing_status ?? image.status;
          return (
            <button
              key={`overview-image-${image.id}`}
              type="button"
              onClick={() => {
                onSelectImage(image);
                onNavigate("artifacts");
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-500/5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{imageLabel(image)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {image.image_process_code ? `Código ${image.image_process_code}` : `ID ${image.id}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={review ? "destructive" : "outline"} className="text-[10px] capitalize">
                  {review ? "Revisión" : statusLabel}
                </Badge>
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
  promotionCardinality,
  promotionReviewRequired,
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
  const detectedPromotionsLabel =
    typeof promotionCardinality?.detected_promotions === "number"
      ? String(promotionCardinality.detected_promotions)
      : String(totalPromotions);

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
          promotionReviewRequired={promotionReviewRequired}
          detectedPromotionsLabel={detectedPromotionsLabel}
          chainDiagnostics={chainDiagnostics}
          onNavigate={onNavigate}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen del job</CardTitle>
              <p className="text-sm text-slate-400">Identidad, tiempos de ejecución y avance por imagen.</p>
            </CardHeader>
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryTile label="Job" hint="Identificador único de esta corrida">
                      <p className="font-mono text-xs break-all text-slate-100">{jobData?.job_id}</p>
                    </SummaryTile>
                    <SummaryTile label="Cuenta">
                      <p className="text-sm font-medium text-white">{jobData?.account_name ?? resolvedAccount}</p>
                    </SummaryTile>
                    <SummaryTile label="Configuración">
                      <p className="text-sm text-slate-200">{jobData?.config_name ?? "—"}</p>
                    </SummaryTile>
                    <SummaryTile label="Estado">
                      <Badge variant={getStatusVariant(jobData?.status ?? "unknown")} className="uppercase">
                        {jobData?.status ?? "unknown"}
                      </Badge>
                    </SummaryTile>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-slate-300">
                        <CalendarClock className="h-4 w-4 text-cyan-300" />
                        <span className="text-sm font-medium">Línea de tiempo</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Duración total</p>
                        <p className="font-heading text-xl font-semibold text-white">
                          {formatJobDuration(jobData?.started_at, jobData?.finished_at)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <SummaryTile label="Creado"><p className="text-xs text-slate-200">{formatDate(jobData?.created_at)}</p></SummaryTile>
                      <SummaryTile label="Inicio"><p className="text-xs text-slate-200">{formatDate(jobData?.started_at)}</p></SummaryTile>
                      <SummaryTile label="Última actualización"><p className="text-xs text-slate-200">{formatDate(jobData?.updated_at)}</p></SummaryTile>
                      <SummaryTile label="Finalizado"><p className="text-xs text-slate-200">{formatDate(jobData?.finished_at)}</p></SummaryTile>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-4">
                    <p className="text-sm font-medium text-emerald-100">Procesamiento de imágenes</p>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <SummaryTile label="Total">
                        <p className="text-2xl font-semibold text-white">{jobData?.total_images ?? 0}</p>
                      </SummaryTile>
                      <SummaryTile label="Procesadas">
                        <p className="text-2xl font-semibold text-emerald-200">{jobData?.processed_images ?? 0}</p>
                      </SummaryTile>
                      <SummaryTile label="Fallidas">
                        <p className={cn("text-2xl font-semibold", (jobData?.failed_images ?? 0) > 0 ? "text-rose-300" : "text-slate-400")}>
                          {jobData?.failed_images ?? 0}
                        </p>
                      </SummaryTile>
                    </div>
                    {(jobData?.total_images ?? 0) > 0 ? (
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                          <span>Avance</span>
                          <span>
                            {jobData?.processed_images ?? 0}/{jobData?.total_images ?? 0} imágenes
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/30">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                            style={{
                              width: `${Math.min(100, Math.round(((jobData?.processed_images ?? 0) / (jobData?.total_images ?? 1)) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {jobData?.error_message ? (
                    <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-rose-200/80">Error reportado</p>
                      <p className="mt-1 break-words">{jobData.error_message}</p>
                    </div>
                  ) : null}

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
              <div>
                <CardTitle className="text-base">Salida del procesamiento</CardTitle>
                <p className="mt-1 text-sm text-slate-400">
                  Conteos finales, consistencia promocional y enlaces a reportes exportables.
                </p>
              </div>
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
              {resultsLoading || (resultsFetching && !resultsPendingMessage && !resultsErrorDetail) ? (
                <LoadingPanel
                  message="Cargando resultados del job…"
                  subtitle="Productos, promociones y artefactos exportables."
                  variant="cards"
                />
              ) : null}
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

              {resultsLoading || (resultsFetching && !resultsPendingMessage) ? null : (
              <>
              <div className="grid gap-3 sm:grid-cols-3">
                <OutcomeKpi
                  icon={<Package className="h-4 w-4" />}
                  label="Productos finales"
                  value={totalProducts}
                  hint="Filas activas en el resultado consolidado del job."
                  onClick={() => onNavigate("products")}
                  accent="cyan"
                />
                <OutcomeKpi
                  icon={<Tag className="h-4 w-4" />}
                  label="Promociones"
                  value={detectedPromotionsLabel}
                  hint={
                    typeof promotionCardinality?.detected_promotions === "number"
                      ? "Etiquetas promocionales detectadas por el backend."
                      : "Conteo reportado en el resumen del job."
                  }
                  onClick={() => onNavigate("products")}
                  accent="violet"
                />
                <OutcomeKpi
                  icon={<Barcode className="h-4 w-4" />}
                  label="Códigos de barras"
                  value={totalBarcodes}
                  hint="Lecturas EAN/UPC reconocidas en el resultado."
                  onClick={() => onNavigate("products")}
                  accent="emerald"
                />
              </div>

              {normalizedUserResponse ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">Contexto del relevo</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SummaryTile label="PDV"><p className="text-sm font-semibold text-white">{String(normalizedUserResponse.id_pdv ?? "—")}</p></SummaryTile>
                    <SummaryTile label="Subcategoría"><p className="text-sm font-semibold text-white">{String(normalizedUserResponse.subcategoria ?? "—")}</p></SummaryTile>
                    <SummaryTile label="Usuario relevo"><p className="text-sm font-semibold text-white">{String(normalizedUserResponse.usuario_relevo ?? "—")}</p></SummaryTile>
                  </div>
                </div>
              ) : null}

              <PromotionCardinalityCard
                cardinality={promotionCardinality}
                showReviewBadge={promotionReviewRequired}
                onReprocessSuggested={onReprocessByCode}
                reprocessPending={reprocessPending}
              />

              {dedupeSummary ? (
                <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-300" />
                    <p className="text-sm font-medium text-slate-200">Deduplicación de productos</p>
                  </div>
                  <p className="text-xs text-slate-500">Cuántas filas había antes de fusionar duplicados similares.</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryTile label="Antes"><p className="text-xl font-semibold text-white">{String(dedupeSummary.before ?? "—")}</p></SummaryTile>
                    <SummaryTile label="Después"><p className="text-xl font-semibold text-emerald-200">{String(dedupeSummary.after ?? "—")}</p></SummaryTile>
                    <SummaryTile label="Eliminadas"><p className="text-xl font-semibold text-amber-200">{String(dedupeSummary.removed ?? "—")}</p></SummaryTile>
                    <SummaryTile label="Regla">
                      <p className="text-sm font-semibold text-slate-200">
                        {typeof dedupeSummary.enabled === "boolean" ? (dedupeSummary.enabled ? "Activa" : "Inactiva") : "—"}
                      </p>
                    </SummaryTile>
                  </div>
                  {typeof dedupeSummary.removed === "number" && dedupeSummary.removed > 0 ? (
                    <div className="flex items-start gap-2 rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Se consolidaron productos similares para evitar duplicados en el resultado final.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl border border-white/8 bg-black/15 p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Artefactos exportables</p>
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
              </div>
              </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}