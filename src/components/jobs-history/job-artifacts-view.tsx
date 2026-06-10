"use client";

import { ReactNode } from "react";
import {
  ExternalLink,
  FileJson2,
  FileText,
  ImageIcon,
  ScrollText,
  Sparkles,
} from "lucide-react";
import type { JobImage } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JsonDebugBlock } from "@/components/jobs-history/json-debug-block";
import { cn } from "@/lib/utils";

type ImageArtifactsPreview = {
  supportNameCandidates: string[];
  supportMemory: unknown[];
  primaryCrops: unknown[];
};

export type JobArtifactsViewProps = {
  images: JobImage[];
  selectedImage: JobImage | null;
  onSelectImage: (image: JobImage) => void;
  selectedPreviewUrl: string | null;
  jobId: string;
  resolveUrl: (path?: string | null) => string | null;
  onOpenMdDialog: (title: string, rawUrl: string, downloadFilename?: string) => void;
  artifacts: ImageArtifactsPreview;
  artifactsLoading: boolean;
  artifactsError: boolean;
};

function imageLabel(image: JobImage): string {
  return image.original_name ?? image.image_name ?? `Imagen ${image.id}`;
}

function needsReview(image: JobImage): boolean {
  return image.processing_status === "needs_review" || image.status === "needs_review";
}

function ArtifactLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn("text-cyan-200 underline hover:text-cyan-100", className)}
    >
      {children}
    </a>
  );
}

type ArtifactActionItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
};

function ArtifactActionButton({ item }: { item: ArtifactActionItem }) {
  if (item.onClick) {
    return (
      <Button
        size="sm"
        className={cn(
          "h-auto min-h-9 w-full justify-start whitespace-normal px-3 py-2 text-left text-xs",
          item.primary ? "border-cyan-400/40 bg-cyan-600 hover:bg-cyan-500" : undefined,
        )}
        variant={item.primary ? "default" : "outline"}
        onClick={item.onClick}
      >
        {item.icon ? <span className="mr-2 shrink-0">{item.icon}</span> : null}
        <span className="leading-snug">{item.label}</span>
      </Button>
    );
  }

  if (!item.href) return null;

  return (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "h-auto min-h-9 w-full justify-start whitespace-normal px-3 py-2 text-left text-xs",
      )}
    >
      {item.icon ? <span className="mr-2 shrink-0">{item.icon}</span> : null}
      <span className="leading-snug">{item.label}</span>
      <ExternalLink className="ml-auto h-3 w-3 shrink-0 opacity-50" />
    </a>
  );
}

function ArtifactActionGroup({
  title,
  items,
}: {
  title: string;
  items: ArtifactActionItem[];
}) {
  const visible = items.filter((item) => item.href || item.onClick);
  if (!visible.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="grid gap-2">
        {visible.map((item) => (
          <ArtifactActionButton key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

function buildArtifactActions(
  image: JobImage,
  jobId: string,
  resolveUrl: (path?: string | null) => string | null,
  onOpenMdDialog: (title: string, rawUrl: string, downloadFilename?: string) => void,
): {
  primary: ArtifactActionItem[];
  support: ArtifactActionItem[];
  process: ArtifactActionItem[];
} {
  const label = imageLabel(image);

  return {
    primary: [
      image.annotated_image_url
        ? {
            key: "annotated",
            label: "Ver imagen anotada",
            icon: <ImageIcon className="h-3.5 w-3.5" />,
            href: resolveUrl(image.annotated_image_url) ?? image.annotated_image_url,
          }
        : null,
      image.result_md_url
        ? {
            key: "md-modal",
            label: "Ver reporte técnico (.md)",
            icon: <ScrollText className="h-3.5 w-3.5" />,
            primary: true,
            onClick: () =>
              onOpenMdDialog(
                `Reporte OCR/LLM · ${label}`,
                image.result_md_url!,
                `${jobId}_${image.id}_ocr_debug.md`,
              ),
          }
        : null,
      image.result_md_url
        ? {
            key: "md-tab",
            label: "Abrir reporte (.md) en pestaña",
            icon: <ScrollText className="h-3.5 w-3.5" />,
            href: resolveUrl(image.result_md_url) ?? image.result_md_url,
          }
        : null,
      image.result_json_url
        ? {
            key: "json",
            label: "Abrir JSON de imagen",
            icon: <FileJson2 className="h-3.5 w-3.5" />,
            href: resolveUrl(image.result_json_url) ?? image.result_json_url,
          }
        : null,
      image.result_html_url
        ? {
            key: "html",
            label: "Abrir HTML de imagen",
            icon: <FileText className="h-3.5 w-3.5" />,
            href: resolveUrl(image.result_html_url) ?? image.result_html_url,
          }
        : null,
    ].filter(Boolean) as ArtifactActionItem[],
    support: [
      image.support_result_md_url
        ? {
            key: "support-md",
            label: "Soporte IA (.md)",
            href: resolveUrl(image.support_result_md_url) ?? image.support_result_md_url,
          }
        : null,
      image.support_result_html_url
        ? {
            key: "support-html",
            label: "Soporte IA (HTML)",
            href: resolveUrl(image.support_result_html_url) ?? image.support_result_html_url,
          }
        : null,
    ].filter(Boolean) as ArtifactActionItem[],
    process: [
      image.ai_process_html_url
        ? {
            key: "process-html",
            label: "Proceso IA (HTML)",
            icon: <Sparkles className="h-3.5 w-3.5" />,
            href: resolveUrl(image.ai_process_html_url) ?? image.ai_process_html_url,
          }
        : null,
      image.ai_process_md_url
        ? {
            key: "process-md",
            label: "Proceso IA (.md)",
            icon: <Sparkles className="h-3.5 w-3.5" />,
            href: resolveUrl(image.ai_process_md_url) ?? image.ai_process_md_url,
          }
        : null,
    ].filter(Boolean) as ArtifactActionItem[],
  };
}

function SelectedImagePreviewPanel({
  image,
  previewUrl,
  jobId,
  resolveUrl,
  onOpenMdDialog,
  artifacts,
  artifactsLoading,
  artifactsError,
}: {
  image: JobImage;
  previewUrl: string | null;
  jobId: string;
  resolveUrl: (path?: string | null) => string | null;
  onOpenMdDialog: (title: string, rawUrl: string, downloadFilename?: string) => void;
  artifacts: ImageArtifactsPreview;
  artifactsLoading: boolean;
  artifactsError: boolean;
}) {
  const actions = buildArtifactActions(image, jobId, resolveUrl, onOpenMdDialog);
  const label = imageLabel(image);

  return (
    <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-b from-slate-950/90 to-black/40 shadow-xl shadow-black/20">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-start gap-2">
          <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preview seleccionado</p>
            <p className="mt-1 break-words text-sm font-semibold leading-snug text-white">{label}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px]">{image.status}</Badge>
          {image.processing_status ? (
            <Badge variant="secondary" className="text-[10px]">{image.processing_status}</Badge>
          ) : null}
          {needsReview(image) ? <Badge variant="destructive" className="text-[10px]">needs_review</Badge> : null}
          {image.image_process_code ? (
            <Badge variant="outline" className="font-mono text-[10px]">#{image.image_process_code}</Badge>
          ) : null}
        </div>
        {image.no_products_reason ? (
          <p className="mt-2 rounded-md border border-amber-300/20 bg-amber-500/10 px-2 py-1.5 text-xs leading-relaxed text-amber-100">
            {image.no_products_reason}
          </p>
        ) : null}
      </div>

      <div className="border-b border-white/10 bg-black/30 p-4">
        <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-white/10 bg-black/40 p-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={label}
              className="max-h-48 w-full object-contain xl:max-h-56"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <p>No hay preview disponible para esta imagen.</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 pb-6">
        <ArtifactActionGroup title="Artefactos principales" items={actions.primary} />
        <ArtifactActionGroup title="Soporte IA" items={actions.support} />
        <ArtifactActionGroup title="Proceso IA" items={actions.process} />

        {!actions.primary.length && !actions.support.length && !actions.process.length ? (
          <p className="text-sm text-muted-foreground">Sin artefactos enlazados para esta imagen.</p>
        ) : null}

        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Paso a paso (/artifacts)</p>
          {artifactsLoading ? <Skeleton className="h-20 w-full" /> : null}
          {artifactsError ? (
            <p className="text-xs text-amber-300">
              No se pudo cargar /artifacts para esta imagen. Mostrando fallback de results.
            </p>
          ) : null}
          <JsonDebugBlock
            label="support_name_candidates"
            value={artifacts.supportNameCandidates ?? []}
            maxHeightClassName="max-h-28"
          />
          <JsonDebugBlock
            label="support_memory.raw_text"
            value={(artifacts.supportMemory ?? []).map((x) => {
              const row = x as Record<string, unknown>;
              return {
                crop_id: row.crop_id,
                memory_label: row.memory_label,
                raw_text: row.raw_text ?? row.raw_text_full ?? "",
              };
            })}
            maxHeightClassName="max-h-32"
          />
          <JsonDebugBlock
            label="structured_products_before_filter"
            value={(artifacts.primaryCrops ?? []).map((crop) => {
              const row = crop as Record<string, unknown>;
              return {
                crop_id: row.crop_id,
                structured_products_before_filter: row.structured_products_before_filter ?? [],
              };
            })}
            maxHeightClassName="max-h-36"
          />
          <JsonDebugBlock
            label="structured_products_after_enrichment"
            value={(artifacts.primaryCrops ?? []).map((crop) => {
              const row = crop as Record<string, unknown>;
              return {
                crop_id: row.crop_id,
                structured_products_after_enrichment: row.structured_products_after_enrichment ?? [],
              };
            })}
            maxHeightClassName="max-h-36"
          />
        </div>
      </div>
    </div>
  );
}

function ImageArtifactMobileCard({
  image,
  selected,
  jobId,
  resolveUrl,
  onSelect,
  onOpenMdDialog,
}: {
  image: JobImage;
  selected: boolean;
  jobId: string;
  resolveUrl: (path?: string | null) => string | null;
  onSelect: () => void;
  onOpenMdDialog: (title: string, rawUrl: string, downloadFilename?: string) => void;
}) {
  const actionGroups = buildArtifactActions(image, jobId, resolveUrl, onOpenMdDialog);
  const primaryAction =
    actionGroups.primary.find((item) => item.key === "md-modal") ??
    actionGroups.primary.find((item) => item.key === "annotated") ??
    actionGroups.primary[0];

  return (
    <div
      className={cn(
        "w-full rounded-lg border p-3 transition-colors",
        selected
          ? "border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30"
          : "border-white/10 bg-black/20",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full rounded-md text-left transition-colors hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-semibold text-white">{imageLabel(image)}</p>
            {needsReview(image) ? <Badge variant="destructive">review</Badge> : null}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-300">
            <span className="font-mono">{image.image_process_code ?? "-"}</span>
            <span>·</span>
            <span>{image.status}</span>
            {image.processing_status ? (
              <>
                <span>·</span>
                <span>{image.processing_status}</span>
              </>
            ) : null}
          </div>
        </div>
      </button>
      {primaryAction?.onClick || primaryAction?.href ? (
        <div className="mt-2">
          <ArtifactActionButton item={primaryAction} />
        </div>
      ) : null}
    </div>
  );
}

export function JobArtifactsView({
  images,
  selectedImage,
  onSelectImage,
  selectedPreviewUrl,
  jobId,
  resolveUrl,
  onOpenMdDialog,
  artifacts,
  artifactsLoading,
  artifactsError,
}: JobArtifactsViewProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Imagenes y artefactos por imagen</CardTitle>
      </CardHeader>
      <CardContent>
        {!images.length ? (
          <p className="text-sm text-muted-foreground">Sin imagenes reportadas en este job.</p>
        ) : (
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-xs text-slate-400 xl:hidden">Selecciona una imagen para ver el preview detallado.</p>

              <div className="space-y-2 xl:hidden">
                {images.map((image) => (
                  <ImageArtifactMobileCard
                    key={`artifact-mobile-${image.id}`}
                    image={image}
                    selected={selectedImage?.id === image.id}
                    jobId={jobId}
                    resolveUrl={resolveUrl}
                    onSelect={() => onSelectImage(image)}
                    onOpenMdDialog={onOpenMdDialog}
                  />
                ))}
              </div>

              <div className="hidden xl:block">
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[10rem]">original_name</TableHead>
                        <TableHead>code</TableHead>
                        <TableHead>status</TableHead>
                        <TableHead>processing</TableHead>
                        <TableHead className="min-w-[8rem]">motivo</TableHead>
                        <TableHead>anotada</TableHead>
                        <TableHead>json</TableHead>
                        <TableHead>html</TableHead>
                        <TableHead className="sticky right-0 z-10 min-w-[9rem] bg-slate-950/95 backdrop-blur">reporte .md</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {images.map((image) => (
                        <TableRow
                          key={`image-row-${image.id}-${image.file_id ?? image.original_name ?? ""}`}
                          className={cn(
                            "cursor-pointer",
                            selectedImage?.id === image.id ? "bg-cyan-500/10" : undefined,
                          )}
                          onClick={() => onSelectImage(image)}
                        >
                          <TableCell className="max-w-[14rem] whitespace-normal break-words" title={imageLabel(image)}>
                            <span className="line-clamp-2 text-sm">{imageLabel(image)}</span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{image.image_process_code ?? "-"}</TableCell>
                          <TableCell className="text-xs">{image.status}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col gap-1">
                              <span>{image.processing_status ?? "-"}</span>
                              {needsReview(image) ? <Badge variant="secondary" className="w-fit text-[10px]">review</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[12rem] whitespace-normal text-xs text-slate-300" title={image.no_products_reason ?? ""}>
                            <span className="line-clamp-2">{image.no_products_reason ?? "-"}</span>
                          </TableCell>
                          <TableCell>
                            {image.annotated_image_url ? (
                              <ArtifactLink href={resolveUrl(image.annotated_image_url) ?? image.annotated_image_url}>
                                Ver
                              </ArtifactLink>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {image.result_json_url ? (
                              <ArtifactLink href={resolveUrl(image.result_json_url) ?? image.result_json_url}>JSON</ArtifactLink>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {image.result_html_url ? (
                              <ArtifactLink href={resolveUrl(image.result_html_url) ?? image.result_html_url}>HTML</ArtifactLink>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell
                            className="sticky right-0 z-10 bg-slate-950/95 backdrop-blur"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {image.result_md_url ? (
                              <Button
                                size="sm"
                                className="h-7 border-cyan-400/40 bg-cyan-600 text-xs hover:bg-cyan-500"
                                onClick={() =>
                                  onOpenMdDialog(
                                    `Reporte OCR/LLM · ${imageLabel(image)}`,
                                    image.result_md_url!,
                                    `${jobId}_${image.id}_ocr_debug.md`,
                                  )
                                }
                              >
                                <ScrollText className="mr-1 h-3 w-3" />
                                Ver
                              </Button>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Soporte IA y Proceso IA disponibles en el panel de preview →
                </p>
              </div>
            </div>

            <aside className="w-full shrink-0 xl:w-[22rem] 2xl:w-[26rem]">
              {selectedImage ? (
                <div className="xl:sticky xl:top-28">
                  <div className="max-h-[min(calc(100vh-7rem),48rem)] overflow-y-auto overscroll-y-contain rounded-xl pr-1 [scrollbar-gutter:stable]">
                    <SelectedImagePreviewPanel
                      image={selectedImage}
                      previewUrl={selectedPreviewUrl}
                      jobId={jobId}
                      resolveUrl={resolveUrl}
                      onOpenMdDialog={onOpenMdDialog}
                      artifacts={artifacts}
                      artifactsLoading={artifactsLoading}
                      artifactsError={artifactsError}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-muted-foreground">
                  Selecciona una imagen de la lista para ver preview y artefactos.
                </div>
              )}
            </aside>
          </div>
        )}
      </CardContent>
    </Card>
  );
}