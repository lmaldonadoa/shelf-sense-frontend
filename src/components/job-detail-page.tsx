"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileJson2, FileSpreadsheet, FileText, ImageIcon, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { HttpError, isFinalJobStatus, isHttpUrl, ocrApi } from "@/lib/ocrApi";
import type { JobImage } from "@/types/ocr-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { JobStatusCard } from "@/components/jobs/job-status-card";
import { JobImagesTable } from "@/components/jobs/job-images-table";
import { DetectionsTable } from "@/components/jobs/detections-table";
import { JobLiveTimeline } from "@/components/jobs/job-live-timeline";
import { JobMetricsPanel } from "@/components/jobs/job-metrics-panel";
import { JobNoiseReviewPanel } from "@/components/jobs/job-noise-review-panel";

type ArtifactLinkProps = {
  href?: string | null;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

function ArtifactLink({ href, label, icon: Icon }: ArtifactLinkProps) {
  if (!href) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}: No disponible
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-cyan-300/25",
        "bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100",
        "transition hover:border-cyan-200/45 hover:bg-cyan-500/20",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}

function readProductField(product: Record<string, unknown>, keys: string[]): string | number | null {
  for (const key of keys) {
    const value = product[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return value;
  }
  return null;
}

export default function JobDetailPage({ jobId }: { jobId: string }) {
  const [selectedImage, setSelectedImage] = useState<JobImage | null>(null);
  const [autoRequestedResults, setAutoRequestedResults] = useState(false);
  const [terminalEventsSynced, setTerminalEventsSynced] = useState(false);
  const [postCompleteRefreshes, setPostCompleteRefreshes] = useState(0);

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => ocrApi.getJob(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isFinalJobStatus(status) ? false : 3000;
    },
  });

  const resultsQuery = useQuery({
    queryKey: ["job-results", jobId],
    queryFn: () => ocrApi.getJobResults(jobId),
    enabled: false,
    retry: false,
  });

  const combinedImages = useMemo(() => {
    const resultsImages = resultsQuery.data?.images ?? [];
    return resultsImages.length ? resultsImages : jobQuery.data?.images ?? [];
  }, [jobQuery.data?.images, resultsQuery.data?.images]);

  useEffect(() => {
    if (!combinedImages.length) {
      if (selectedImage) setSelectedImage(null);
      return;
    }
    if (!selectedImage) {
      setSelectedImage(combinedImages[0]);
      return;
    }
    const refreshed =
      combinedImages.find((img) => img.id === selectedImage.id) ??
      combinedImages.find((img) => img.file_id && selectedImage.file_id && img.file_id === selectedImage.file_id) ??
      null;
    if (!refreshed) {
      setSelectedImage(combinedImages[0]);
      return;
    }
    if (refreshed !== selectedImage) {
      setSelectedImage(refreshed);
    }
  }, [combinedImages, selectedImage]);

  async function loadResults(silent = false) {
    const res = await resultsQuery.refetch();
    if (res.error instanceof HttpError) {
      if (res.error.status === 404) {
        if (!silent) {
          toast.message("Resultados aun no disponibles", { description: "Procesando resultados" });
        }
        return;
      }
      if (!silent) {
        toast.error("No se pudieron cargar resultados", { description: res.error.detail });
      }
      return;
    }
    if (!silent) {
      toast.success("Resultados cargados");
    }
  }

  useEffect(() => {
    setAutoRequestedResults(false);
    setTerminalEventsSynced(false);
    setPostCompleteRefreshes(0);
  }, [jobId]);

  useEffect(() => {
    const status = (jobQuery.data?.status ?? "").toLowerCase();
    const finalState = status ? isFinalJobStatus(status) : false;
    if (finalState && terminalEventsSynced && !autoRequestedResults && !resultsQuery.data && !resultsQuery.isFetching) {
      setAutoRequestedResults(true);
      void loadResults(true);
    }
  }, [autoRequestedResults, jobQuery.data?.status, resultsQuery.data, resultsQuery.isFetching, terminalEventsSynced]);

  const isTerminal = isFinalJobStatus(jobQuery.data?.status ?? "");
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
  }, [isTerminal, loadResults, missingArtifactUrls, postCompleteRefreshes, resultsQuery.data]);

  const previewUrl =
    selectedImage?.annotated_image_url ??
    selectedImage?.annotated_download_url ??
    null;
  const originalUrl = selectedImage?.original_image_url ?? null;
  const normalizedUserResponse = resultsQuery.data?.user_response;

  return (
    <div className="space-y-6">
      <JobStatusCard
        status={jobQuery.data?.status ?? "unknown"}
        total={jobQuery.data?.total_images ?? 0}
        processed={jobQuery.data?.processed_images ?? 0}
        failed={jobQuery.data?.failed_images ?? 0}
        progress={jobQuery.data?.progress ?? 0}
        error={jobQuery.data?.error}
      />
      {(jobQuery.data?.status ?? "").toLowerCase() === "queued" ? (
        <Card className="border-amber-300/30 bg-amber-500/10">
          <CardContent className="pt-4 text-sm text-amber-100">
            Trabajo en cola. Se procesará automáticamente cuando el runner termine el job actual.
          </CardContent>
        </Card>
      ) : null}

      <JobMetricsPanel jobId={jobId} isTerminal={isTerminal} />

      {jobQuery.data?.account_name && (
        <JobNoiseReviewPanel jobId={jobId} account={jobQuery.data.account_name} />
      )}

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle className="text-base">Contexto PDV / POS</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-xs sm:grid-cols-3">
          <p><span className="text-muted-foreground">id_pdv:</span> {jobQuery.data?.id_pdv ?? "-"}</p>
          <p><span className="text-muted-foreground">subcategoria:</span> {jobQuery.data?.subcategoria ?? "-"}</p>
          <p><span className="text-muted-foreground">usuario_relevo:</span> {jobQuery.data?.usuario_relevo ?? "-"}</p>
          <p><span className="text-muted-foreground">cadena_resuelta:</span> {jobQuery.data?.cadena_resuelta ?? "-"}</p>
          <p><span className="text-muted-foreground">pos_lookup_status:</span> {jobQuery.data?.pos_lookup_status ?? "-"}</p>
          <p><span className="text-muted-foreground">pos_lookup_code:</span> {jobQuery.data?.pos_lookup_code ?? "-"}</p>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Resultados</CardTitle>
          <Button onClick={() => void loadResults()} disabled={resultsQuery.isFetching}>
            {resultsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Cargar resultados
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {resultsQuery.isLoading ? <Skeleton className="h-32 w-full" /> : null}
          {resultsQuery.data?.dedupe_summary ? (
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-300">Consolidacion / Deduplicacion</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Antes</p><p className="text-base font-semibold">{resultsQuery.data.dedupe_summary.before ?? "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">Despues</p><p className="text-base font-semibold">{resultsQuery.data.dedupe_summary.after ?? "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">Eliminados</p><p className="text-base font-semibold">{resultsQuery.data.dedupe_summary.removed ?? "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">Estado</p><p className="text-base font-semibold">{typeof resultsQuery.data.dedupe_summary.enabled === "boolean" ? (resultsQuery.data.dedupe_summary.enabled ? "Activo" : "Inactivo") : "-"}</p></div>
              </div>
              {typeof resultsQuery.data.dedupe_summary.removed === "number" && resultsQuery.data.dedupe_summary.removed > 0 ? (
                <div className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Se consolidaron productos similares para evitar duplicados.
                </div>
              ) : null}
            </div>
          ) : null}
          {normalizedUserResponse ? (
            <div className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-xs sm:grid-cols-3">
              <p><span className="text-muted-foreground">id_pdv:</span> {normalizedUserResponse.id_pdv ?? "-"}</p>
              <p><span className="text-muted-foreground">subcategoria:</span> {normalizedUserResponse.subcategoria ?? "-"}</p>
              <p><span className="text-muted-foreground">usuario_relevo:</span> {normalizedUserResponse.usuario_relevo ?? "-"}</p>
              <p><span className="text-muted-foreground">fecha_relevo:</span> {normalizedUserResponse.fecha_relevo ?? "-"}</p>
              <p><span className="text-muted-foreground">fecha_proceso:</span> {normalizedUserResponse.fecha_proceso ?? "-"}</p>
              <p><span className="text-muted-foreground">timezone:</span> {normalizedUserResponse.timezone ?? "-"}</p>
            </div>
          ) : null}
          {resultsQuery.data?.summary ? (
            <pre className="max-h-40 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">
              {JSON.stringify(resultsQuery.data.summary, null, 2)}
            </pre>
          ) : null}
          {(resultsQuery.data?.products?.length ?? 0) > 0 ? (
            <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-300">Productos normalizados</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-left text-xs">
                  <thead className="border-b border-white/10 text-slate-400">
                    <tr>
                      <th className="px-2 py-2">Producto</th>
                      <th className="px-2 py-2">Gramaje</th>
                      <th className="px-2 py-2">Variante</th>
                      <th className="px-2 py-2">Tipo oferta</th>
                      <th className="px-2 py-2">Vigencia</th>
                      <th className="px-2 py-2">Precio original</th>
                      <th className="px-2 py-2">Precio oferta</th>
                      <th className="px-2 py-2">Cod barra</th>
                      <th className="px-2 py-2">Foto original</th>
                      <th className="px-2 py-2">IA response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(resultsQuery.data?.products ?? []).map((product, index) => {
                      const productName = readProductField(product, ["nombre_producto", "producto", "product_name"]) ?? "-";
                      const gramaje = readProductField(product, ["gramaje", "tamano"]) ?? "-";
                      const variante = readProductField(product, ["variante"]) ?? "-";
                      const fieldAudit = (product.field_audit && typeof product.field_audit === "object") ? (product.field_audit as Record<string, unknown>) : null;
                      const supportEnrichment =
                        fieldAudit?.support_field_enrichment && typeof fieldAudit.support_field_enrichment === "object"
                          ? (fieldAudit.support_field_enrichment as Record<string, unknown>)
                          : null;
                      const variantSelectedReason = typeof supportEnrichment?.variant_selected_reason === "string" ? supportEnrichment.variant_selected_reason : null;
                      const supportApplied = typeof supportEnrichment?.applied === "boolean" ? supportEnrichment.applied : null;
                      const tipoOferta = readProductField(product, ["tipo_oferta", "type_of_promotion", "activity"]) ?? "-";
                      const vigencia = readProductField(product, ["periodo_vigencia"]) ?? "-";
                      const precioOriginal = readProductField(product, ["precio_original", "precio_no_afiliado"]) ?? "-";
                      const precioOferta = readProductField(product, ["precio_oferta", "precio_en_gondola"]) ?? "-";
                      const codBarra = readProductField(product, ["cod_barra", "barcode"]) ?? "-";
                      const fotoOriginalUrl = readProductField(product, ["foto_original_url"]) ?? "-";
                      const iaResponseUrl = readProductField(product, ["ia_response_html_url"]) ?? "-";
                      return (
                        <tr key={`normalized-product-${index}`} className="border-b border-white/5">
                          <td className="px-2 py-2">{String(productName)}</td>
                          <td className="px-2 py-2">{String(gramaje)}</td>
                          <td className="px-2 py-2">
                            <div className="space-y-1">
                              <p>{String(variante)}</p>
                              {variantSelectedReason === "primary_context_variant_signal" ? (
                                <Badge variant="default">Variante confirmada por promoción</Badge>
                              ) : null}
                              {supportApplied === false ? (
                                <Badge variant="destructive">Variante soporte bloqueada</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2 py-2">{String(tipoOferta)}</td>
                          <td className="px-2 py-2">{String(vigencia)}</td>
                          <td className="px-2 py-2">{String(precioOriginal)}</td>
                          <td className="px-2 py-2">{String(precioOferta)}</td>
                          <td className="px-2 py-2">{String(codBarra)}</td>
                          <td className="px-2 py-2">
                            {typeof fotoOriginalUrl === "string" && fotoOriginalUrl.startsWith("http") ? (
                              <a href={fotoOriginalUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">Abrir</a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {typeof iaResponseUrl === "string" && iaResponseUrl.startsWith("http") ? (
                              <a href={iaResponseUrl} target="_blank" rel="noreferrer" className="text-cyan-200 underline">Abrir</a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-slate-300">Artefactos master</p>
            <div className="flex flex-wrap gap-2">
              <ArtifactLink href={resultsQuery.data?.master_html_url} label="Abrir HTML" icon={FileText} />
              <ArtifactLink href={resultsQuery.data?.master_json_url} label="Abrir JSON" icon={FileJson2} />
              <ArtifactLink href={resultsQuery.data?.excel_url} label="Descargar Excel" icon={FileSpreadsheet} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <JobImagesTable images={combinedImages} onSelect={setSelectedImage} />
        <JobLiveTimeline
          jobId={jobId}
          isTerminal={isTerminal}
          onTerminalEventsSynced={() => {
            setTerminalEventsSynced(true);
          }}
        />
      </div>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Detalle por imagen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedImage ? (
            <p className="text-sm text-muted-foreground">Selecciona una fila de imágenes para ver detecciones y preview.</p>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                <p>original_name: {selectedImage.original_name ?? selectedImage.image_name}</p>
                <p>image_process_code: {selectedImage.image_process_code ?? "-"}</p>
                <p>file_id: {selectedImage.file_id ?? "-"}</p>
                <p>processing_status: {selectedImage.processing_status ?? "-"}</p>
                <p>annotated_image_url: {selectedImage.annotated_image_url ?? "No disponible"}</p>
              </div>

              {(selectedImage.processing_status === "needs_review" || selectedImage.status === "needs_review") ? (
                <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  Esta imagen requiere revisión. Usa el reporte técnico completo (.md) como evidencia principal.
                </div>
              ) : null}

              {selectedImage.no_products_reason ? (
                <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
                  <p className="text-xs text-muted-foreground">Motivo sin productos</p>
                  <p>{selectedImage.no_products_reason}</p>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Imagen original</p>
                  {originalUrl && isHttpUrl(originalUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={originalUrl} alt="original" className="max-h-80 w-full rounded-md border border-white/10 object-contain" />
                  ) : (
                    <div className="rounded-md border border-white/10 p-3 text-sm text-muted-foreground">
                      <div className="mb-2 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        No hay imagen original renderizable
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Imagen anotada</p>
                  {previewUrl && isHttpUrl(previewUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="annotated" className="max-h-80 w-full rounded-md border border-white/10 object-contain" />
                  ) : (
                    <div className="rounded-md border border-white/10 p-3 text-sm text-muted-foreground">
                      <div className="mb-2 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        No disponible por URL pública aún
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-slate-300">Auditoría y artefactos por imagen</p>
                <div className="flex flex-wrap gap-2">
                  <ArtifactLink href={selectedImage.result_md_url} label="Auditoría OCR/LLM (.md)" icon={ScrollText} />
                  <ArtifactLink href={selectedImage.result_html_url} label="HTML imagen" icon={FileText} />
                  <ArtifactLink href={selectedImage.support_result_md_url} label="Soporte IA (.md)" icon={ScrollText} />
                  <ArtifactLink href={selectedImage.support_result_html_url} label="Soporte IA (HTML)" icon={FileText} />
                  <ArtifactLink href={selectedImage.ai_process_html_url} label="Proceso IA (HTML)" icon={FileText} />
                  <ArtifactLink href={selectedImage.ai_process_md_url} label="Proceso IA (.md)" icon={ScrollText} />
                  <ArtifactLink href={selectedImage.result_json_url} label="JSON imagen" icon={FileJson2} />
                  <ArtifactLink href={selectedImage.annotated_download_url} label="Descargar anotada" icon={Download} />
                </div>
              </div>

              <DetectionsTable detections={selectedImage.detections ?? []} />
              {(selectedImage.support_detections?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Detecciones soporte</p>
                  <DetectionsTable detections={selectedImage.support_detections ?? []} />
                </div>
              ) : null}

              {selectedImage.ocr_raw_text_primary ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">OCR primario</p>
                  <pre className="max-h-48 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">{selectedImage.ocr_raw_text_primary}</pre>
                </div>
              ) : null}

              {selectedImage.ocr_raw_text_support ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">OCR soporte/promociones</p>
                  <pre className="max-h-48 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">{selectedImage.ocr_raw_text_support}</pre>
                </div>
              ) : null}

              {(selectedImage.promotions_extracted?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Promociones extraídas</p>
                  <pre className="max-h-56 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">{JSON.stringify(selectedImage.promotions_extracted, null, 2)}</pre>
                </div>
              ) : null}

              {selectedImage.vision_outputs ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Salida visión</p>
                  <pre className="max-h-56 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">{JSON.stringify(selectedImage.vision_outputs, null, 2)}</pre>
                </div>
              ) : null}

              {(selectedImage.analysis_trace?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">Trazas OCR/Vision por recorte</p>
                  <div className="space-y-3">
                    {(selectedImage.analysis_trace ?? []).map((item, idx) => (
                      <div key={`${item.crop ?? "trace"}-${idx}`} className="rounded-md border border-white/10 bg-black/20 p-3">
                        <p className="text-xs text-slate-300">source: {item.source ?? "-"} · crop: {item.crop ?? "-"} · llm_ok: {String(item.llm_ok ?? false)}</p>
                        {item.ocr_raw_text ? <pre className="mt-2 max-h-36 overflow-auto rounded border border-white/10 bg-black/25 p-2 text-xs">{item.ocr_raw_text}</pre> : null}
                        {item.vision_output ? <pre className="mt-2 max-h-36 overflow-auto rounded border border-white/10 bg-black/25 p-2 text-xs">{JSON.stringify(item.vision_output, null, 2)}</pre> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
