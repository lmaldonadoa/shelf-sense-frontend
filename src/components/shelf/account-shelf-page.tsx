"use client";

import Link from "next/link";
import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { CreateShelfJobRequest, RecentJob, ShelfAsset, ShelfDatasetRole, ShelfDatasetSummaryResponse, ShelfDiagnostics, ShelfEmbeddingsRecomputeResponse, ShelfEvaluateCropResponse, ShelfExtractedCrop, ShelfHardNegative, ShelfReviewQueueItem, ShelfSku, ShelfSkuDeleteResponse, ShelfSkuImage, ShelfSkuImageResponse, ShelfSkuTestJobResponse } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { UploadPanel } from "@/components/jobs/upload-panel";
import { ShelfCropLightbox } from "@/components/shelf/shelf-crop-lightbox";
import { ShelfSkuUploadSafeguard } from "@/components/shelf/shelf-sku-upload-safeguard";
import { Checkbox } from "@/components/ui/checkbox";
import { MdReportDialog, fetchMarkdownReport } from "@/components/ui/md-report-dialog";
import {
  ShelfAssistEngineUsedCard,
  ShelfAuditSummary,
  ShelfCropAuditDetail,
  ShelfConfigSnapshot,
  ShelfEventsTimeline,
} from "@/components/shelf/shelf-audit-panel";
import { ShelfOcrSkuAssistConfig } from "@/components/shelf/shelf-ocr-sku-assist-config";
import {
  DEFAULT_SHELF_OCR_SKU_ASSIST_DRAFT,
  getOcrAssistDelta,
  ocrAssistDraftFromConfig,
  ocrAssistDraftToPatchPayload,
  resolveAssistEngineUsedSnapshot,
} from "@/lib/shelf-ocr-sku-assist";
import type { JobEvent, ShelfOcrSkuAssistConfigDraft } from "@/types/ocr-api";

type Props = { account: string };
type Tab = "jobs" | "results" | "skus" | "assets" | "index" | "review";
type SkuWorkspaceTab = "catalogo" | "cargas" | "dataset" | "pruebas";
type IndexWorkspaceSection = "indices" | "config" | "tecnico";
type ShelfTrainingBusyState = {
  mode: "single" | "batch";
  skuId: string;
  cropCount: number;
  message: string;
};

type ShelfJobsHistoryFilter = "all" | "recognition" | "crop_extraction" | "sku_test";

const SHELF_DATASET_ROLE_OPTIONS: ShelfDatasetRole[] = ["reference_active", "reference_extra", "validation", "reserve", "rejected"];

type ShelfJobTraceInfo = {
  source_job_id?: string | null;
  rerun_of_job_id?: string | null;
  retry_count?: number;
  reused_inputs?: boolean;
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "completed" || s === "partial_success") return <Badge>completed</Badge>;
  if (s === "failed") return <Badge variant="destructive">failed</Badge>;
  if (s === "running") return <Badge variant="secondary">running</Badge>;
  if (s === "queued") return <Badge variant="outline">queued</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function confidenceBadge(state: string) {
  const s = state.toLowerCase();
  if (s === "high_confidence") return <Badge>high</Badge>;
  if (s === "medium_confidence") return <Badge variant="secondary">medium</Badge>;
  if (s === "low_confidence") return <Badge variant="outline">low</Badge>;
  if (s === "unknown_sku") return <Badge variant="destructive">unknown_sku</Badge>;
  return <Badge variant="outline">{state || "-"}</Badge>;
}

function parseSimpleCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseBulkSkusJson(text: string): Record<string, unknown>[] {
  const data = JSON.parse(text) as unknown;
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)) {
    return ((data as { items: unknown[] }).items).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  if (data && typeof data === "object" && Array.isArray((data as { skus?: unknown[] }).skus)) {
    return ((data as { skus: unknown[] }).skus).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (data && typeof data === "object") return [data as Record<string, unknown>];
  return [];
}

function normalizeBulkShelfSeedRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const skuId = firstNonEmptyString(row.sku_id, row.sku_code, row.codLucky, row.code, row.id);
  const nombre = firstNonEmptyString(row.nombre, row.sku_name, row.newDescription, row.name, row.title);
  if (!skuId || !nombre) return null;

  const metadataSourceKeys = [
    "codSapUnico",
    "fabricante2",
    "imagen",
    "observacion",
    "stackable",
    "maxStack",
    "stack",
    "tamanoX",
    "tamanoY",
  ];
  const metadataEntries = metadataSourceKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(row, key))
    .map((key) => [key, row[key]]);
  const metadata = metadataEntries.length ? Object.fromEntries(metadataEntries) : undefined;

  // Helper para convertir números a string (especialmente para pais)
  const toStringOrUndefined = (value: unknown): string | undefined => {
    if (value === null || value === undefined || value === "") return undefined;
    return String(value).trim() || undefined;
  };

  // Helper para convertir a número float
  const toNumberOrUndefined = (value: unknown): number | undefined => {
    if (value === null || value === undefined || value === "" || value === 0) return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  };

  const result: Record<string, unknown> = {
    sku_id: skuId,
    nombre,
  };

  // Mapear campos opcionales string
  const brandVal = firstNonEmptyString(row.marca, row.brand);
  if (brandVal) result.marca = brandVal;

  const categoryVal = firstNonEmptyString(row.categoria, row.category, row.family);
  if (categoryVal) result.categoria = categoryVal;

  const subcategoryVal = firstNonEmptyString(row.subcategoria, row.subcategory);
  if (subcategoryVal) result.subcategoria = subcategoryVal;

  const segmentVal = firstNonEmptyString(row.segmento, row.segment);
  if (segmentVal) result.segmento = segmentVal;

  const formVal = firstNonEmptyString(row.forma, row.formato, row.variant, row.presentation);
  if (formVal) result.forma = formVal;

  const fabVal = firstNonEmptyString(row.fabricante);
  if (fabVal) result.fabricante = fabVal;

  const fragVal = firstNonEmptyString(row.fragancia_variante, row.fraganciaVariante);
  if (fragVal) result.fragancia_variante = fragVal;

  const sizeVal = firstNonEmptyString(row.tamano, row.size_text, row.size);
  if (sizeVal) result.tamano = sizeVal;

  const eanVal = firstNonEmptyString(row.ean, row.barcode, row.upc);
  if (eanVal) result.ean = eanVal;

  const catCuentaVal = firstNonEmptyString(row.category_cuenta, row.categoryCuenta);
  if (catCuentaVal) result.category_cuenta = catCuentaVal;

  const segFuncVal = firstNonEmptyString(row.segmento_funcional, row.segmentoFuncional);
  if (segFuncVal) result.segmento_funcional = segFuncVal;

  const grupoVal = firstNonEmptyString(row.grupo);
  if (grupoVal) result.grupo = grupoVal;

  // CRÍTICO: pais DEBE ser string, no número
  const paisVal = toStringOrUndefined(row.pais ?? row.country);
  if (paisVal) result.pais = paisVal;

  // Dimensiones como números float
  const xVal = toNumberOrUndefined(row.x_ancho ?? row.x);
  if (xVal !== undefined) result.x_ancho = xVal;

  const yVal = toNumberOrUndefined(row.y_alto ?? row.y);
  if (yVal !== undefined) result.y_alto = yVal;

  const zVal = toNumberOrUndefined(row.z_profundidad ?? row.z);
  if (zVal !== undefined) result.z_profundidad = zVal;

  // Campos por defecto
  const estadoVal = firstNonEmptyString(row.estado, row.status);
  result.estado = estadoVal || "activo";

  result.is_active = row.is_active === false || row.is_active === 0 ? false : true;

  if (metadata) result.metadata = metadata;

  return result;
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value).trim();
    if (text) return text;
  }
  return "";
}

function getSkuCodeValue(sku: ShelfSku): string {
  return firstNonEmptyString(sku.sku_code, sku.sku_id, sku.id);
}

function getSkuNameValue(sku: ShelfSku): string {
  return firstNonEmptyString((sku as Record<string, unknown>).sku_name, (sku as Record<string, unknown>).nombre, (sku as Record<string, unknown>).name);
}

function getSkuBrandValue(sku: ShelfSku): string {
  return firstNonEmptyString((sku as Record<string, unknown>).brand, (sku as Record<string, unknown>).marca);
}

function getSkuFamilyValue(sku: ShelfSku): string {
  // Prioriza categoria (donde se normalizan los datos) sobre family
  return firstNonEmptyString((sku as Record<string, unknown>).categoria, (sku as Record<string, unknown>).family);
}

function getSkuSubcategoryValue(sku: ShelfSku): string {
  return firstNonEmptyString((sku as Record<string, unknown>).subcategoria);
}

function getSkuSegmentValue(sku: ShelfSku): string {
  return firstNonEmptyString((sku as Record<string, unknown>).segmento, (sku as Record<string, unknown>).segmento_funcional);
}

function getSkuManufacturerValue(sku: ShelfSku): string {
  return firstNonEmptyString((sku as Record<string, unknown>).fabricante);
}

function getSkuGroupValue(sku: ShelfSku): string {
  return firstNonEmptyString((sku as Record<string, unknown>).grupo);
}

function getSkuStatusValue(sku: ShelfSku): string {
  return firstNonEmptyString((sku as Record<string, unknown>).estado, activeLabel((sku as Record<string, unknown>).is_active));
}

function getSkuMetadataValue(sku: ShelfSku): Record<string, unknown> | null {
  const metadata = (sku as Record<string, unknown>).metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : null;
}

function hasSkuMetadata(sku: ShelfSku): boolean {
  const metadata = getSkuMetadataValue(sku);
  return Boolean(metadata && Object.keys(metadata).length);
}

function normalizeSkuSearchToken(value: unknown): string {
  return firstNonEmptyString(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function skuSuggestionScore(sku: ShelfSku, query: string): number {
  const q = normalizeSkuSearchToken(query);
  if (!q) return 0;
  const code = normalizeSkuSearchToken(getSkuCodeValue(sku));
  const name = normalizeSkuSearchToken(getSkuNameValue(sku));
  const brand = normalizeSkuSearchToken(getSkuBrandValue(sku));
  const family = normalizeSkuSearchToken(getSkuFamilyValue(sku));
  const size = normalizeSkuSearchToken(firstNonEmptyString((sku as Record<string, unknown>).size_text, (sku as Record<string, unknown>).tamano));

  if (code === q) return 1000;
  if (name === q) return 900;
  if (code.startsWith(q)) return 800;
  if (name.startsWith(q)) return 700;
  if (brand.startsWith(q)) return 600;
  if (family.startsWith(q)) return 500;
  if (code.includes(q)) return 400;
  if (name.includes(q)) return 300;
  if (brand.includes(q)) return 200;
  if (family.includes(q)) return 150;
  if (size.includes(q)) return 120;
  return 0;
}

function buildShelfSkuPayload(row: {
  skuId: string;
  skuName: string;
  brand?: string;
  family?: string;
  variant?: string;
  sizeText?: string;
  barcode?: string;
  estado?: string;
  subcategoria?: string;
  segmento?: string;
  forma?: string;
  fabricante?: string;
  fragancia_variante?: string;
  pais?: string;
  grupo?: string;
  segmento_funcional?: string;
  category_cuenta?: string;
  x_ancho?: string;
  y_alto?: string;
  z_profundidad?: string;
  metadata?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const brand = row.brand || undefined;
  const category = row.family || undefined;
  const format = row.variant || undefined;
  const size = row.sizeText || undefined;
  const barcode = row.barcode || undefined;
  const status = row.estado || "activo";
  const metadata = row.metadata && Object.keys(row.metadata).length ? row.metadata : undefined;
  return {
    // Campos esperados por backend shelf (schema en espanol).
    nombre: row.skuName,
    marca: brand,
    categoria: category,
    formato: format,
    tamano: size,
    ean: barcode,
    estado: status,
    subcategoria: row.subcategoria || undefined,
    segmento: row.segmento || undefined,
    forma: row.forma || undefined,
    fabricante: row.fabricante || undefined,
    fragancia_variante: row.fragancia_variante || undefined,
    pais: row.pais || undefined,
    grupo: row.grupo || undefined,
    segmento_funcional: row.segmento_funcional || undefined,
    category_cuenta: row.category_cuenta || undefined,
    x_ancho: row.x_ancho || undefined,
    y_alto: row.y_alto || undefined,
    z_profundidad: row.z_profundidad || undefined,
    metadata,
    is_active: true,
    // Campos de compatibilidad legacy/mixtos.
    sku_id: row.skuId,
    sku_code: row.skuId,
    sku_name: row.skuName,
    brand,
    family: category,
    variant: format,
    size_text: size,
    barcode,
    estado: status,
  };
}

function normalizeDiagnosticsPayload(input: unknown): ShelfDiagnostics | null {
  if (!input || typeof input !== "object") return null;
  return input as ShelfDiagnostics;
}

function formatStageName(name?: string | null): string {
  if (!name) return "-";
  return name.replaceAll(".", " / ").replaceAll("_", " ");
}

function diagnosticsTone(diag: ShelfDiagnostics | null): "ok" | "warning" | "error" | "neutral" {
  if (!diag) return "neutral";
  if ((diag.errors ?? []).length) return "error";
  if ((diag.warnings ?? []).length || diag.models?.fallback_used) return "warning";
  return "ok";
}

function diagnosticsOutcomeLabel(diag: ShelfDiagnostics | null): string {
  const outcome = diag?.outcome_status ?? "";
  if (outcome === "success") return "OK";
  if (outcome === "success_with_warnings") return "OK con advertencias";
  if (outcome === "success_with_fallback") return "OK degradado / fallback";
  if (outcome === "recoverable_error") return "Error recuperable";
  if (outcome === "failed") return "Falló";
  const tone = diagnosticsTone(diag);
  if (tone === "ok") return "OK";
  if (tone === "warning") return "Advertencias";
  if (tone === "error") return "Error";
  return "Sin diagnóstico";
}

function diagnosticsHeadline(diag: ShelfDiagnostics | null): string {
  if (diag?.summary_message?.trim()) return diag.summary_message;
  const outcome = diag?.outcome_status ?? "";
  if (outcome === "success_with_fallback") return "Embeddings generados con degradación controlada.";
  if (outcome === "success_with_warnings") return "Embeddings generados con advertencias no bloqueantes.";
  if (outcome === "recoverable_error") return "Hubo un error recuperable y el sistema siguió adelante.";
  if (outcome === "failed") return "No fue posible completar el procesamiento.";
  return "Procesamiento completado.";
}

function diagnosticsIsEmbeddingComplete(diag: ShelfDiagnostics | null): boolean {
  if (!diag) return false;
  const loaded = new Set(diag.models?.loaded_models ?? []);
  const failed = diag.models?.failed_models ?? [];
  return !diag.models?.fallback_used && failed.length === 0 && loaded.has("dinov2") && loaded.has("siglip");
}

function diagnosticsEmbeddingUiLabel(diag: ShelfDiagnostics | null): string {
  if (!diag) return "Sin diagnóstico";
  if (diagnosticsIsEmbeddingComplete(diag)) return "Embedding completo: dinov2 + siglip";
  if (diag.models?.fallback_used) return "OK degradado: se usó fallback clásico";
  if ((diag.errors ?? []).length) return "Fallo de embeddings";
  if ((diag.warnings ?? []).length) return "OK con advertencias";
  return diagnosticsOutcomeLabel(diag);
}

function diagnosticsEmbeddingTone(diag: ShelfDiagnostics | null): "default" | "secondary" | "destructive" | "outline" {
  if (!diag) return "outline";
  if (diagnosticsIsEmbeddingComplete(diag)) return "default";
  if (diag.outcome_status === "failed" || (diag.errors ?? []).length) return "destructive";
  if (diag.models?.fallback_used || (diag.warnings ?? []).length) return "secondary";
  return "outline";
}

type ImageEmbeddingHealthBucket = "ok" | "fallback" | "failed" | "partial" | "missing";

function normalizeSkuCoverageLookupKey(value: unknown): string {
  return String(value ?? "").trim();
}

function skuCoverageAliasKeys(sku: ShelfSku): string[] {
  const row = sku as Record<string, unknown>;
  const aliases = [
    getSkuCodeValue(sku),
    firstNonEmptyString(sku.sku_id, sku.sku_code, sku.id),
    firstNonEmptyString(row.sku_code_normalized, row.cod_lucky, row.cod_lucky_barcode),
  ];
  const keys = new Set<string>();
  for (const alias of aliases) {
    const trimmed = normalizeSkuCoverageLookupKey(alias);
    if (!trimmed) continue;
    keys.add(trimmed);
    keys.add(trimmed.toUpperCase());
    keys.add(trimmed.toLowerCase());
  }
  return Array.from(keys);
}

function datasetSummaryTotalsFromResponse(data?: ShelfDatasetSummaryResponse | null): {
  total_images: number;
  indexable_images: number;
  non_indexable_images: number;
} {
  const root = (data ?? {}) as Record<string, unknown>;
  const summary = (root.summary ?? data?.totals ?? {}) as Record<string, unknown>;
  const total_images = Number(summary.total_images ?? summary.images ?? 0) || 0;
  const indexable_images = Number(summary.indexable_images ?? summary.indexable ?? 0) || 0;
  const non_indexable_images = Number(summary.non_indexable_images ?? Math.max(0, total_images - indexable_images)) || 0;
  return { total_images, indexable_images, non_indexable_images };
}

function datasetSummaryBySkuRows(data?: ShelfDatasetSummaryResponse | null): Array<Record<string, unknown>> {
  if (!data) return [];
  const root = data as Record<string, unknown>;
  const candidates = [data.skus, data.by_sku, root.coverage_by_sku, root.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate.map((row) => ((row && typeof row === "object" ? row : {}) as Record<string, unknown>));
    }
  }
  return [];
}

function datasetSummaryRowCounts(row: Record<string, unknown>): { images: number; indexable: number } {
  const images = Number(row.total_images ?? row.count ?? row.images ?? row.image_count ?? row.images_total ?? 0) || 0;
  const indexable = Number(row.indexable_images ?? row.indexable_count ?? row.indexable ?? images) || 0;
  return { images, indexable };
}

function shelfDatasetRoleIsIndexable(role: string, explicit?: unknown): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (explicit === 1 || explicit === "1" || explicit === "true") return true;
  if (explicit === 0 || explicit === "0" || explicit === "false") return false;
  const normalized = role.trim().toLowerCase();
  if (["validation", "reserve", "rejected"].includes(normalized)) return false;
  if (["reference_active", "reference_extra"].includes(normalized)) return true;
  return true;
}

type ImageIndexableBucket = "indexable" | "non_indexable";

function imageIndexableMeta(image: Record<string, unknown>): {
  label: string;
  tone: "default" | "secondary" | "destructive" | "outline";
  bucket: ImageIndexableBucket;
  indexable: boolean;
} {
  const role = firstNonEmptyString(image.dataset_role) || "reference_active";
  const indexable = shelfDatasetRoleIsIndexable(role, image.is_indexable);
  return indexable
    ? { label: "Indexable", tone: "default", bucket: "indexable", indexable: true }
    : { label: "No indexable", tone: "secondary", bucket: "non_indexable", indexable: false };
}

function imageEmbeddingDiagnosticsSummary(image: Record<string, unknown>): Record<string, unknown> | null {
  const summary = image.embedding_diagnostics_summary;
  return summary && typeof summary === "object" ? (summary as Record<string, unknown>) : null;
}

function imageHasExplicitEmbeddingEvidence(image: Record<string, unknown>): boolean {
  const embeddingStatus = firstNonEmptyString(image.embedding_status, image.embedding_state);
  if (embeddingStatus) return true;
  const diagSummary = imageEmbeddingDiagnosticsSummary(image);
  if (diagSummary) return true;
  const embeddingIds = Array.isArray(image.embedding_ids)
    ? image.embedding_ids.filter((id) => id !== null && id !== undefined && String(id).trim() !== "")
    : [];
  const models = Array.isArray(image.embedding_models)
    ? image.embedding_models.map((item) => String(item).toLowerCase()).filter(Boolean)
    : [];
  const diag = normalizeDiagnosticsPayload(image.diagnostics ?? image.embedding_diagnostics);
  return Boolean(embeddingIds.length || models.length || diag);
}

function imageEmbeddingModelsList(image: Record<string, unknown>): string[] {
  const summary = imageEmbeddingDiagnosticsSummary(image);
  const fromSummary = Array.isArray(summary?.available_models)
    ? summary.available_models.map((item) => String(item).toLowerCase()).filter(Boolean)
    : [];
  if (fromSummary.length) return fromSummary;
  return Array.isArray(image.embedding_models)
    ? image.embedding_models.map((item) => String(item).toLowerCase()).filter(Boolean)
    : [];
}

/** Mapea embedding_status canónico del backend. Sin evidencia => null (no inferir faltantes). */
function imageEmbeddingStatusFromBackend(image: Record<string, unknown>): {
  label: string;
  tone: "default" | "secondary" | "destructive" | "outline";
  bucket: ImageEmbeddingHealthBucket;
} | null {
  if (!imageHasExplicitEmbeddingEvidence(image)) return null;

  const models = imageEmbeddingModelsList(image);
  const explicitStatus = firstNonEmptyString(image.embedding_status, image.embedding_state)?.toLowerCase();
  const diagSummary = imageEmbeddingDiagnosticsSummary(image);
  const diag = normalizeDiagnosticsPayload(image.diagnostics ?? image.embedding_diagnostics);
  const fallbackUsed = diagSummary?.fallback_used === true
    || diag?.models?.fallback_used
    || diag?.outcome_status === "success_with_fallback";

  if (explicitStatus === "not_indexable") return null;

  if (explicitStatus === "failed" || (diag?.errors ?? []).length || diag?.outcome_status === "failed") {
    return { label: "Embedding fallido", tone: "destructive", bucket: "failed" };
  }
  if (explicitStatus === "fallback" || fallbackUsed) {
    return { label: "Embedding degradado", tone: "secondary", bucket: "fallback" };
  }
  if (explicitStatus === "pending") {
    return { label: "Pendiente embedding", tone: "secondary", bucket: "missing" };
  }
  if (explicitStatus === "unknown") {
    return { label: "Estado desconocido", tone: "outline", bucket: "missing" };
  }
  if (explicitStatus === "complete") {
    return {
      label: models.length ? models.join(" + ") : "Embedding completo",
      tone: "default",
      bucket: "ok",
    };
  }
  if (explicitStatus === "partial") {
    const missing = Array.isArray(diagSummary?.missing_models)
      ? diagSummary.missing_models.map((item) => String(item)).filter(Boolean)
      : [];
    return {
      label: missing.length ? `Parcial · falta ${missing.join(", ")}` : "Embedding parcial",
      tone: "outline",
      bucket: "partial",
    };
  }

  if (diag?.outcome_status === "failed" || (diag?.errors ?? []).length) {
    return { label: "Embedding fallido", tone: "destructive", bucket: "failed" };
  }
  if (diag?.models?.fallback_used || diag?.outcome_status === "success_with_fallback") {
    return { label: "Embedding degradado", tone: "secondary", bucket: "fallback" };
  }
  if (models.includes("dinov2") && models.includes("siglip")) {
    return { label: "dinov2 + siglip", tone: "default", bucket: "ok" };
  }
  if (models.length) {
    return { label: models.join(" + "), tone: "outline", bucket: "partial" };
  }
  if (diag) {
    return { label: diagnosticsEmbeddingUiLabel(diag), tone: diagnosticsEmbeddingTone(diag), bucket: "partial" };
  }
  return null;
}

function imageEmbeddingHealthMeta(image: Record<string, unknown>): {
  label: string;
  tone: "default" | "secondary" | "destructive" | "outline";
  bucket: ImageEmbeddingHealthBucket;
} {
  return imageEmbeddingStatusFromBackend(image) ?? {
    label: "Estado no disponible",
    tone: "outline",
    bucket: "missing",
  };
}

function previewUrlOf(input: Record<string, unknown>): string | null {
  return firstNonEmptyString(
    input.preview_url,
    input.image_url,
    input.public_url,
    input.download_url,
  ) || null;
}

function previewAvailableOf(input: Record<string, unknown>): boolean {
  const explicit = input.preview_available;
  if (typeof explicit === "boolean") return explicit;
  return Boolean(previewUrlOf(input));
}

function previewUnavailableReasonOf(input: Record<string, unknown>): string {
  return firstNonEmptyString(input.preview_unavailable_reason) || "Sin preview pública";
}

function recentJobCardPreview(job: Record<string, unknown> | null | undefined): string | null {
  if (!job) return null;
  const images = Array.isArray(job.images) ? (job.images as Record<string, unknown>[]) : [];
  const firstImage = images.find((image) => Boolean(firstNonEmptyString(image.original_image_url, image.annotated_image_url, image.download_url))) ?? null;
  if (!firstImage) return null;
  return firstNonEmptyString(firstImage.original_image_url, firstImage.annotated_image_url, firstImage.download_url) || null;
}

function activeLabel(value: unknown): string {
  return value === false || value === 0 ? "Inactivo" : "Activo";
}

function kbLabel(value: unknown): string {
  return typeof value === "number" ? `${Math.max(1, Math.round(value / 1024))} KB` : "-";
}

function countLabel(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function percentLabel(value: number | null, decimals = 0): string {
  if (value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(decimals)}%`;
}

function describeFileLike(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value ?? "-");
  const record = value as Record<string, unknown>;
  const path = firstNonEmptyString(record.path, record.storage_path, record.file_path, record.name);
  const statusParts: string[] = [];
  if (typeof record.exists_before === "boolean") statusParts.push(`exists_before=${record.exists_before ? "si" : "no"}`);
  if (typeof record.deleted === "boolean") statusParts.push(`deleted=${record.deleted ? "si" : "no"}`);
  if (typeof record.dry_run === "boolean") statusParts.push(`dry_run=${record.dry_run ? "si" : "no"}`);
  if (typeof record.exists === "boolean") statusParts.push(`exists=${record.exists ? "si" : "no"}`);
  if (path && statusParts.length) return `${path} (${statusParts.join(", ")})`;
  if (path) return path;
  return JSON.stringify(record);
}

function formatModelNames(input: unknown): string {
  if (!Array.isArray(input)) return "-";
  const values = input.map((item) => String(item).trim()).filter(Boolean);
  return values.length ? values.join(", ") : "-";
}

function diagnosticsHasCode(diag: ShelfDiagnostics | null, code: string): boolean {
  if (!diag) return false;
  const inWarnings = (diag.warnings ?? []).some((item) => item.code === code);
  const inErrors = (diag.errors ?? []).some((item) => item.code === code);
  const inStages = (diag.stages ?? []).some((item) => item.code === code);
  return inWarnings || inErrors || inStages;
}

function confidenceTone(value: unknown): "default" | "secondary" | "destructive" | "outline" {
  if (typeof value !== "number") return "outline";
  if (value >= 0.85) return "default";
  if (value >= 0.6) return "secondary";
  return "destructive";
}

function resultFinalSkuLabel(row: Record<string, unknown>): string {
  const finalSku = row.final_sku;
  if (typeof finalSku === "string") return finalSku;
  if (finalSku && typeof finalSku === "object") {
    const record = finalSku as Record<string, unknown>;
    return firstNonEmptyString(record.sku_id, record.sku_code, record.sku_name) || JSON.stringify(record);
  }
  return "-";
}

function resultHasFinalSku(row: Record<string, unknown>): boolean {
  const finalSku = row.final_sku;
  if (typeof finalSku === "string") return finalSku.trim().length > 0;
  if (finalSku && typeof finalSku === "object") {
    const record = finalSku as Record<string, unknown>;
    return Boolean(firstNonEmptyString(record.sku_id, record.sku_code, record.sku_name));
  }
  return false;
}

function resultSuggestedSkuLabel(row: Record<string, unknown>): string {
  const direct = firstNonEmptyString(row.suggested_sku_id, row.suggested_sku_code, row.suggested_sku_name);
  if (direct) return direct;
  const top = resultTopCandidates(row)[0];
  if (!top) return "-";
  return firstNonEmptyString(top.sku_id, top.sku_code, top.sku_name) || "-";
}

function resultImageIdValue(row: Record<string, unknown>): number | null {
  const value = row.image_id;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function resultCropIdValue(row: Record<string, unknown>): string {
  return firstNonEmptyString(row.crop_id);
}

function resultTopCandidates(row: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(row.top_candidates) ? (row.top_candidates as Record<string, unknown>[]) : [];
}

function candidateSkuCode(candidate: Record<string, unknown>): string {
  return firstNonEmptyString(candidate.sku_id, candidate.sku_code, candidate.cod_lucky) || "";
}

function skuCodesEqual(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return Boolean(left) && left === right;
}

function skuConfusionKey(anchorSku: string, negativeSku: string): string {
  return `${anchorSku.trim().toUpperCase()}::${negativeSku.trim().toUpperCase()}`;
}

function pendingSkuConfusions(
  candidates: Record<string, unknown>[],
  anchorSku: string,
  savedConfusionKeys: Set<string>,
  maxItems = 5,
): string[] {
  const anchor = anchorSku.trim();
  if (!anchor) return [];
  return candidates
    .slice(0, maxItems)
    .map((candidate, candidateIdx) => candidateSkuCode(candidate) || `candidate_${candidateIdx + 1}`)
    .filter((code) => Boolean(code.trim()) && !skuCodesEqual(code, anchor))
    .filter((code) => !savedConfusionKeys.has(skuConfusionKey(anchor, code)));
}

function candidateScoreBreakdown(candidate: Record<string, unknown>): Record<string, unknown> {
  const breakdown = candidate.score_breakdown;
  return breakdown && typeof breakdown === "object" ? (breakdown as Record<string, unknown>) : {};
}

function getHardNegativePenaltyApplied(candidate: Record<string, unknown>): number {
  const value = candidateScoreBreakdown(candidate).hard_negative_penalty_applied;
  return typeof value === "number" ? value : 0;
}

function getHardNegativeAnchors(candidate: Record<string, unknown>): string[] {
  const anchors = candidateScoreBreakdown(candidate).hard_negative_triggered_by;
  return Array.isArray(anchors) ? anchors.map((item) => String(item)).filter(Boolean) : [];
}

function hardNegativeAppliedToCandidate(candidate: Record<string, unknown>): boolean {
  return getHardNegativePenaltyApplied(candidate) > 0;
}

function cropHasHardNegativePenalty(row: Record<string, unknown>): boolean {
  return resultTopCandidates(row).some((candidate) => hardNegativeAppliedToCandidate(candidate));
}

function cropHardNegativePenalizedCount(row: Record<string, unknown>): number {
  return resultTopCandidates(row).filter((candidate) => hardNegativeAppliedToCandidate(candidate)).length;
}

type ParsedHardNegativeSummary = {
  total: number;
  pairs: Array<{ pair: string; anchor: string; negative: string; count: number }>;
};

function parseHardNegativeSummary(summary: Record<string, unknown> | null | undefined): ParsedHardNegativeSummary {
  if (!summary) return { total: 0, pairs: [] };
  const total = Number(summary.total_hard_negative_penalty_applied ?? 0) || 0;
  const pairsRaw = summary.hard_negative_pairs_triggered;
  const pairs: ParsedHardNegativeSummary["pairs"] = [];
  if (pairsRaw && typeof pairsRaw === "object") {
    for (const [pair, count] of Object.entries(pairsRaw as Record<string, unknown>)) {
      const [anchor, negative] = pair.split("->");
      pairs.push({
        pair,
        anchor: anchor?.trim() || pair,
        negative: negative?.trim() || "",
        count: Number(count) || 0,
      });
    }
  }
  return { total, pairs };
}

function hardNegativePairLabel(pair: { anchor: string; negative: string }): string {
  return `${pair.anchor} → ${pair.negative}`;
}

function cropHardNegativeTableLabel(row: Record<string, unknown>): { short: string; title: string } {
  const penalized = resultTopCandidates(row)
    .map((candidate) => ({
      code: candidateSkuCode(candidate) || "?",
      penalty: getHardNegativePenaltyApplied(candidate),
      anchors: getHardNegativeAnchors(candidate),
    }))
    .filter((item) => item.penalty > 0);
  if (!penalized.length) {
    return { short: "-", title: "Sin penalización por hard negative en esta corrida" };
  }
  const totalPenalty = penalized.reduce((sum, item) => sum + item.penalty, 0);
  const short = penalized.length === 1
    ? `−${penalized[0].penalty.toFixed(2)}`
    : `${penalized.length} · −${totalPenalty.toFixed(2)}`;
  const title = penalized
    .map((item) => `${item.code}: −${item.penalty.toFixed(3)}${item.anchors.length ? ` · ancla ${item.anchors.join(", ")}` : ""}`)
    .join(" | ");
  return { short, title };
}

function reviewItemPredictedSkuCode(item: ShelfReviewQueueItem): string {
  const row = item as Record<string, unknown>;
  return firstNonEmptyString(
    item.predicted_sku_code,
    item.suggested_sku_id,
    item.predicted_sku_name,
    item.predicted_sku_id != null ? String(item.predicted_sku_id) : "",
    row.sku_id,
  ) || "";
}

function reviewItemTopCandidates(item: ShelfReviewQueueItem): Record<string, unknown>[] {
  const row = item as Record<string, unknown>;
  const fromApi = Array.isArray(item.top_candidates)
    ? (item.top_candidates as Record<string, unknown>[])
    : Array.isArray(row.top_candidates)
      ? (row.top_candidates as Record<string, unknown>[])
      : [];
  if (fromApi.length) return fromApi;
  const predicted = reviewItemPredictedSkuCode(item);
  if (!predicted) return [];
  return [{
    sku_id: predicted,
    sku_code: predicted,
    sku_name: item.predicted_sku_name,
    score: typeof row.confidence === "number" ? row.confidence : row.score,
  }];
}

type SimilarCandidatesPanelProps = {
  candidates: Record<string, unknown>[];
  anchorSku: string;
  selectedSku?: string;
  onSelectCandidate: (code: string) => void;
  onMarkConfusion: (anchorSku: string, negativeSku: string) => void;
  onMarkAllRemainingConfusions?: (anchorSku: string, negativeSkus: string[]) => void;
  isMarking: boolean;
  isMarkingAll?: boolean;
  savedConfusionKeys: Set<string>;
  maxItems?: number;
};

function SimilarCandidatesPanel({
  candidates,
  anchorSku,
  selectedSku,
  onSelectCandidate,
  onMarkConfusion,
  onMarkAllRemainingConfusions,
  isMarking,
  isMarkingAll = false,
  savedConfusionKeys,
  maxItems = 5,
}: SimilarCandidatesPanelProps) {
  const anchor = anchorSku.trim();
  const anchorReady = Boolean(anchor);
  const visibleCandidates = candidates.slice(0, maxItems);
  const pendingNegatives = pendingSkuConfusions(candidates, anchor, savedConfusionKeys, maxItems);

  if (!candidates.length) {
    return <p className="text-xs text-slate-500">Sin candidatos similares disponibles.</p>;
  }

  return (
    <div className="min-w-0 space-y-2">
      {!anchorReady ? (
        <p className="rounded-md border border-amber-300/25 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-100">
          Confirma primero el SKU correcto para registrar confusiones respecto a ese ancla.
        </p>
      ) : (
        <div className="rounded-md border border-cyan-300/25 bg-cyan-500/10 px-2 py-1.5">
          <p className="break-all font-mono text-xs text-cyan-50">{anchor}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-cyan-100/80">SKU correcto confirmado para este crop.</p>
        </div>
      )}

      {anchorReady && pendingNegatives.length > 0 ? (
        <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-2">
          <p className="text-[11px] leading-relaxed text-amber-50">
            {pendingNegatives.length === 1
              ? "Queda 1 candidato parecido sin marcar como confusión."
              : `Quedan ${pendingNegatives.length} candidatos parecidos sin marcar como confusiones.`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-8 w-full whitespace-normal border-amber-300/40 text-xs leading-snug text-amber-50 hover:bg-amber-500/20"
            disabled={isMarking || isMarkingAll}
            title="No reasigna la imagen. Guarda que estos SKUs se parecen al correcto pero no lo son."
            onClick={() => onMarkAllRemainingConfusions?.(anchor, pendingNegatives)}
          >
            {isMarkingAll
              ? "Guardando confusiones…"
              : pendingNegatives.length === 1
                ? "Marcar restante como confusión"
                : `Marcar ${pendingNegatives.length} restantes como confusiones`}
          </Button>
        </div>
      ) : null}

      <p
        className="break-words text-[11px] leading-relaxed text-slate-400"
        title="Esto no reasigna la imagen. Solo guarda que este SKU suele confundirse con el correcto."
      >
        Marca candidatos parecidos pero incorrectos (hard negative). No mueve la foto al SKU equivocado.
      </p>

      <div className="space-y-2">
        {visibleCandidates.map((candidate, candidateIdx) => {
          const code = candidateSkuCode(candidate) || `candidate_${candidateIdx + 1}`;
          const candidateScore = typeof candidate.score === "number" ? candidate.score : null;
          const isAnchor = anchorReady && skuCodesEqual(code, anchor);
          const isSelected = Boolean(selectedSku) && skuCodesEqual(code, selectedSku ?? "");
          const confusionKey = skuConfusionKey(anchor, code);
          const alreadySaved = savedConfusionKeys.has(confusionKey);
          const canMarkConfusion = anchorReady && !isAnchor && Boolean(code.trim());
          const candidateName = firstNonEmptyString(candidate.sku_name, candidate.nombre, candidate.marca);
          const hnPenalty = getHardNegativePenaltyApplied(candidate);
          const hnAnchors = getHardNegativeAnchors(candidate);
          const hnApplied = hnPenalty > 0;
          const ocrAssistDelta = getOcrAssistDelta(candidate);
          const ocrAssistApplied = ocrAssistDelta !== 0;

          return (
            <div
              key={`sim-cand-${candidateIdx}-${code}`}
              className={`rounded-md border p-2.5 ${
                isSelected || isAnchor
                  ? "border-cyan-300/40 bg-cyan-500/5"
                  : hnApplied
                    ? "border-violet-300/35 bg-violet-500/5"
                    : "border-white/10 bg-black/20"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-xs leading-snug text-slate-100">{code}</p>
                  {candidateName ? (
                    <p className="mt-0.5 break-words text-[11px] leading-snug text-slate-400">{candidateName}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isAnchor ? <Badge variant="default" className="whitespace-nowrap text-[10px]">Correcto</Badge> : null}
                  {hnApplied ? (
                    <Badge variant="secondary" className="whitespace-nowrap text-[10px]" title="Ranking ajustado con confusiones registradas">
                      −{hnPenalty.toFixed(3)} HN
                    </Badge>
                  ) : null}
                  {ocrAssistApplied ? (
                    <Badge
                      variant="outline"
                      className={`whitespace-nowrap border-cyan-300/30 text-[10px] ${ocrAssistDelta > 0 ? "text-cyan-200" : "text-red-200"}`}
                      title="Delta aplicado por ocr_sku_assist en score_breakdown"
                    >
                      {ocrAssistDelta > 0 ? "+" : ""}{ocrAssistDelta.toFixed(3)} assist
                    </Badge>
                  ) : null}
                  <Badge variant={confidenceTone(candidateScore)} className="whitespace-nowrap text-[10px]">
                    {candidateScore !== null ? candidateScore.toFixed(3) : "-"}
                  </Badge>
                </div>
              </div>
              {hnApplied ? (
                <p className="mt-2 text-[11px] leading-snug text-violet-100/90">
                  Ranking ajustado con memoria de confusión
                  {hnAnchors.length ? ` · ancla: ${hnAnchors.join(", ")}` : ""}
                </p>
              ) : null}
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                <Button
                  size="sm"
                  variant={isSelected || isAnchor ? "default" : "outline"}
                  className="h-8 w-full justify-center text-xs"
                  onClick={() => onSelectCandidate(code)}
                  title={isAnchor ? "Este es el SKU correcto del crop" : "Usar este SKU como el correcto"}
                >
                  {isAnchor ? "Es el correcto" : "Elegir como correcto"}
                </Button>
                {canMarkConfusion ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-full justify-center whitespace-normal text-xs leading-snug text-amber-100 hover:text-amber-50"
                    disabled={isMarking || isMarkingAll || alreadySaved}
                    onClick={() => onMarkConfusion(anchor, code)}
                    title="No reasigna la imagen. Solo guarda que este SKU suele confundirse con el correcto."
                  >
                    {alreadySaved ? "Confusión guardada" : "Similar pero incorrecto"}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function resultNumeric(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function resultBoolean(row: Record<string, unknown>, key: string): boolean {
  return Boolean(row[key]);
}

function resultOrderingLabel(row: Record<string, unknown>): string {
  return firstNonEmptyString(row.ordering_label) || "-";
}

function resultTrayLabel(row: Record<string, unknown>): string {
  const tray = resultNumeric(row, "tray_index");
  return tray !== null ? `Piso ${tray}` : "Piso -";
}

function resultPositionLabel(row: Record<string, unknown>): string {
  const position = resultNumeric(row, "position_in_tray");
  return position !== null ? `Pos ${position}` : "Pos -";
}

function resultGlobalOrderLabel(row: Record<string, unknown>): string {
  const order = resultNumeric(row, "global_order");
  return order !== null ? `#${order}` : "#-";
}

function resultEmbeddingDiagnostics(row: Record<string, unknown>): ShelfDiagnostics | null {
  return normalizeDiagnosticsPayload(row.embedding_diagnostics);
}

function resultString(row: Record<string, unknown>, key: string): string {
  return firstNonEmptyString(row[key]);
}

function rerunOutcomeMeta(row: Record<string, unknown>): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } | null {
  const comparison = row.comparison && typeof row.comparison === "object" ? (row.comparison as Record<string, unknown>) : null;
  const outcome = firstNonEmptyString(comparison?.changed_outcome);
  if (outcome === "improved") return { label: "Improved", variant: "default" };
  if (outcome === "same") return { label: "Same", variant: "secondary" };
  if (outcome === "regressed") return { label: "Regressed", variant: "destructive" };
  const hint = row.training_impact_hint && typeof row.training_impact_hint === "object" ? (row.training_impact_hint as Record<string, unknown>) : null;
  if (hint?.improved_vs_source_job === true) return { label: "Improved", variant: "default" };
  if (hint?.unchanged_vs_source_job === true) return { label: "Same", variant: "secondary" };
  if (hint?.regressed_vs_source_job === true) return { label: "Regressed", variant: "destructive" };
  return null;
}

function rerunPendingReasonLabel(row: Record<string, unknown>): string {
  const reason = firstNonEmptyString(row.review_reason, row.pending_reason);
  if (reason === "low_confidence") return "La confianza sigue baja";
  if (reason === "low_delta") return "La diferencia entre candidatos sigue baja";
  if (reason === "unknown_sku") return "No se encontró un SKU confiable";
  if (reason === "no_index_candidate") return "No hubo candidato desde el índice";
  if (reason === "insufficient_reference_support") return "El SKU todavía no tiene suficiente soporte de referencias";
  if (reason === "conflicting_top2") return "Sigue habiendo conflicto entre top1 y top2";
  return reason || "";
}

function rerunUsedIndexLabel(row: Record<string, unknown>): string {
  const usedIndexVersion = row.used_index_version;
  const usedModels = Array.isArray(row.used_models) ? row.used_models.map((item) => String(item)).filter(Boolean) : [];
  if (typeof usedIndexVersion === "number" && usedModels.length === 1) return `${usedModels[0]} v${usedIndexVersion}`;
  if (typeof usedIndexVersion === "number") return `v${usedIndexVersion}`;
  const versions = Array.isArray(row.used_index_versions) ? row.used_index_versions as Record<string, unknown>[] : [];
  const firstVersion = versions[0];
  if (firstVersion) {
    const model = firstNonEmptyString(firstVersion.model_name, firstVersion.engine);
    const version = firstNonEmptyString(firstVersion.version);
    return [model, version ? `v${version}` : ""].filter(Boolean).join(" ");
  }
  return usedModels.length ? usedModels.join(", ") : "";
}

function rerunTrainingSupportLabel(row: Record<string, unknown>): string {
  const refs = row.final_sku_reference_count;
  if (typeof refs === "number") return `${refs} referencias activas`;
  const topRefs = row.top_candidate_reference_count;
  if (typeof topRefs === "number") return `${topRefs} referencias del top1`;
  return "";
}

function segmentationMetaOf(input: Record<string, unknown> | null | undefined): {
  requested: boolean;
  available: boolean;
  applied: boolean;
  reason: string;
  variant: string;
} {
  const row = input ?? {};
  return {
    requested: row.segmentation_requested === true,
    available: row.segmentation_mask_available === true,
    applied: row.segmentation_applied === true,
    reason: firstNonEmptyString(row.segmentation_reason),
    variant: firstNonEmptyString(row.crop_variant, row.crop_type, "bbox"),
  };
}

function segmentationVariantBadge(meta: { requested: boolean; available: boolean; applied: boolean; reason: string; variant: string }): { label: string; variant: "default" | "secondary" | "outline" } {
  if (meta.applied) return { label: meta.variant || "segmented_black_bg", variant: "default" };
  if (meta.requested && !meta.available) return { label: "bbox sin máscara", variant: "secondary" };
  return { label: meta.variant || "bbox", variant: "outline" };
}

function formatPercentLike(value: number | null, digits = 3): string {
  return value === null ? "-" : value.toFixed(digits);
}

function formatThresholdEntries(input: unknown): Array<{ label: string; value: number }> {
  if (!input || typeof input !== "object") return [];
  return Object.entries(input as Record<string, unknown>)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => ({
      label: key.replaceAll("_", " "),
      value: value as number,
    }));
}

function analysisModulesOf(input: unknown): string[] {
  return Array.isArray((input as { analysis_modules?: unknown[] } | null | undefined)?.analysis_modules)
    ? (((input as { analysis_modules?: unknown[] }).analysis_modules ?? []).map((item) => String(item)).filter(Boolean))
    : [];
}

function analysisObjectOf(input: unknown, key: string): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function analysisWarningsOf(input: unknown): Record<string, unknown>[] {
  if (!input || typeof input !== "object") return [];
  const value = (input as Record<string, unknown>).analysis_warnings;
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function analysisStatusLabel(row: Record<string, unknown> | null, fallback = "sin dato"): string {
  return firstNonEmptyString(row?.status, row?.observed_orientation, row?.expected_orientation) || fallback;
}

function renderAnalysisInfoCard(title: string, body: ReactNode, tone: "neutral" | "warning" | "ok" = "neutral") {
  const toneClass = tone === "warning"
    ? "border-amber-300/20 bg-amber-500/10"
    : tone === "ok"
      ? "border-emerald-300/20 bg-emerald-500/10"
      : "border-white/10 bg-slate-950/40";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs text-slate-400">{title}</p>
      <div className="mt-2 text-sm text-slate-100">{body}</div>
    </div>
  );
}

function versionModelName(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const row = input as Record<string, unknown>;
  return firstNonEmptyString(row.model_name, row.model, row.embedding_model, row.name).toLowerCase();
}

function shelfRecentJobTypeLabel(row: RecentJob): string {
  const moduleName = firstNonEmptyString(row.job_module, row.job_type).toLowerCase();
  const testMode = firstNonEmptyString(row.test_mode).toLowerCase();
  if (testMode === "sku_specific" || testMode === "sku_test") return "Prueba de SKU";
  if (moduleName === "shelf_recognition") return "Shelf Recognition";
  if (moduleName.includes("crop")) return "Extracción de crops";
  if (moduleName.includes("shelf")) return moduleName.replaceAll("_", " ");
  return "General";
}

function shelfJobProgressRatio(job: { processed_images?: number | null; total_images?: number | null }): number {
  const total = Number(job.total_images ?? 0);
  const processed = Number(job.processed_images ?? 0);
  if (!total || total <= 0) return 0;
  return Math.min(1, Math.max(0, processed / total));
}

function getShelfJobTraceInfo(input: unknown): ShelfJobTraceInfo {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    source_job_id: typeof row.source_job_id === "string" ? row.source_job_id : null,
    rerun_of_job_id: typeof row.rerun_of_job_id === "string" ? row.rerun_of_job_id : null,
    retry_count: Number.isFinite(Number(row.retry_count)) ? Number(row.retry_count) : undefined,
    reused_inputs: typeof row.reused_inputs === "boolean" ? row.reused_inputs : undefined,
  };
}

function isShelfRecentJob(row: RecentJob): boolean {
  const moduleName = firstNonEmptyString(row.job_module, row.job_type).toLowerCase();
  const testMode = firstNonEmptyString(row.test_mode).toLowerCase();
  return moduleName.includes("shelf") || moduleName.includes("crop") || testMode === "sku_specific" || testMode === "sku_test";
}

function versionSampleDim(input: unknown): number | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const value = row.sample_dim ?? row.dimension ?? row.embedding_dim ?? row.dim;
  return typeof value === "number" ? value : null;
}

function versionDimMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const row = input as Record<string, unknown>;
  const source = row.dim_counts ?? row.dimension_counts ?? row.dims ?? row.dimensions ?? row.sample_dims;
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>).filter(([, value]) => typeof value === "number"),
  ) as Record<string, number>;
}

function versionHasMixedDims(input: unknown): boolean {
  const entries = Object.entries(versionDimMap(input));
  return entries.length > 1;
}

function versionDimsLabel(input: unknown): string {
  const entries = Object.entries(versionDimMap(input));
  if (!entries.length) {
    const sampleDim = versionSampleDim(input);
    return sampleDim !== null ? `{${sampleDim}}` : "-";
  }
  return `{${entries.map(([key, value]) => `${key}: ${value}`).join(", ")}}`;
}

function extractShelfThresholds(input: unknown): Record<string, number> {
  const root = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const shelfConfig = root.shelf_recognition && typeof root.shelf_recognition === "object"
    ? (root.shelf_recognition as Record<string, unknown>)
    : root;
  const thresholds = shelfConfig.confidence_thresholds && typeof shelfConfig.confidence_thresholds === "object"
    ? (shelfConfig.confidence_thresholds as Record<string, unknown>)
    : {};
  return {
    high_min: typeof thresholds.high_min === "number" ? thresholds.high_min : 0.82,
    high_delta: typeof thresholds.high_delta === "number" ? thresholds.high_delta : 0.08,
    medium_min: typeof thresholds.medium_min === "number" ? thresholds.medium_min : 0.68,
    medium_delta: typeof thresholds.medium_delta === "number" ? thresholds.medium_delta : 0.03,
    low_min: typeof thresholds.low_min === "number" ? thresholds.low_min : 0.45,
  };
}

function artifactReportLinks(input: Record<string, unknown>): Array<{ label: string; href: string }> {
  const links: Array<{ label: string; href: string }> = [];
  const html = firstNonEmptyString(input.result_html_url);
  const md = firstNonEmptyString(input.result_md_url);
  const json = firstNonEmptyString(input.result_json_url);
  if (html) links.push({ label: "Reporte HTML", href: html });
  if (md) links.push({ label: "Reporte Markdown", href: md });
  if (json) links.push({ label: "Reporte JSON", href: json });
  return links;
}

function masterReportLinks(input: Record<string, unknown>): Array<{ label: string; href: string }> {
  const links: Array<{ label: string; href: string }> = [];
  const html = firstNonEmptyString(input.master_html_url);
  const md = firstNonEmptyString(input.master_md_url);
  const json = firstNonEmptyString(input.master_json_url);
  if (html) links.push({ label: "Master HTML", href: html });
  if (md) links.push({ label: "Master Markdown", href: md });
  if (json) links.push({ label: "Master JSON", href: json });
  return links;
}

function trainingCropKey(imageId: number | string | null | undefined, cropId: string | null | undefined): string {
  return `${String(imageId ?? "-")}::${String(cropId ?? "-")}`;
}

function extractUiContract(...sources: Array<unknown>): Record<string, unknown> | null {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const direct = (source as Record<string, unknown>).ui_contract;
    if (direct && typeof direct === "object") return direct as Record<string, unknown>;
    const nestedResult = (source as Record<string, unknown>).result_json;
    if (nestedResult && typeof nestedResult === "object") {
      const nestedContract = (nestedResult as Record<string, unknown>).ui_contract;
      if (nestedContract && typeof nestedContract === "object") return nestedContract as Record<string, unknown>;
    }
  }
  return null;
}

type MdDialogRequest = {
  title: string;
  sourceUrl: string;
  downloadFilename?: string;
} | null;

function resolveArtifactPreviewUrl(path?: string | null): string | null {
  if (!path) return null;
  const proxyBase = process.env.NEXT_PUBLIC_OCR_PROXY_BASE ?? "/admin/ocr/proxy";
  const toProxy = (p: string, search = "") => `${proxyBase}${p}${search}`;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const parsed = new URL(path);
      if (parsed.pathname.startsWith("/static/")) return toProxy(parsed.pathname, parsed.search);
      if (parsed.pathname.startsWith("/v1/")) return toProxy(parsed.pathname, parsed.search);
    } catch { /* ignore */ }
    return path;
  }
  if (path.startsWith("/v1/")) return toProxy(path);
  if (path.startsWith("/static/")) return toProxy(path);
  if (path.startsWith("/")) return path;
  const staticIdx = path.replaceAll("\\", "/").indexOf("/static/");
  if (staticIdx >= 0) return toProxy(path.replaceAll("\\", "/").slice(staticIdx));
  return path;
}

export function AccountShelfPage({ account }: Props) {
  const [tab, setTab] = useState<Tab>("jobs");
  const [skuWorkspaceTab, setSkuWorkspaceTab] = useState<SkuWorkspaceTab>("catalogo");
  const [indexWorkspaceSection, setIndexWorkspaceSection] = useState<IndexWorkspaceSection>("indices");
  const [jobPayload, setJobPayload] = useState<CreateShelfJobRequest>({
    account_name: account,
    config_name: "default",
    id_pdv: "",
    image_file_ids: [],
    image_paths: [],
    processing_mode: "recognition",
    subcategoria: "",
    usuario_relevo: "",
  });
  const [imageFileIdsText, setImageFileIdsText] = useState("");
  const [imagePathsText, setImagePathsText] = useState("");
  const [selectedJobFiles, setSelectedJobFiles] = useState<File[]>([]);
  const [uploadedJobFileIds, setUploadedJobFileIds] = useState<string[]>([]);
  const [jobId, setJobId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [recentShelfJobSearch, setRecentShelfJobSearch] = useState("");
  const [selectedArtifactsImageId, setSelectedArtifactsImageId] = useState<number | null>(null);
  const [selectedCropDetail, setSelectedCropDetail] = useState<Record<string, unknown> | null>(null);
  const [cropActionSkuId, setCropActionSkuId] = useState("");
  const [cropActionSkuSearch, setCropActionSkuSearch] = useState("");
  const [debouncedCropActionSkuSearch, setDebouncedCropActionSkuSearch] = useState("");
  const [resultSkuOverrides, setResultSkuOverrides] = useState<Record<string, string>>({});
  const resultSkuInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cropActionNote, setCropActionNote] = useState("");
  const [cropDatasetRole, setCropDatasetRole] = useState<ShelfDatasetRole>("reference_active");
  const [cropDatasetSplit, setCropDatasetSplit] = useState("");
  const [selectedTrainingCropKeys, setSelectedTrainingCropKeys] = useState<string[]>([]);
  const [trainingGroupLabel, setTrainingGroupLabel] = useState("");
  const [resultsViewFilter, setResultsViewFilter] = useState<"all" | "review" | "unassigned" | "selected">("all");
  const [resultsSearchQuery, setResultsSearchQuery] = useState("");
  const [resultsThumbScale, setResultsThumbScale] = useState<"sm" | "md" | "lg">("md");
  const [resultsThumbZoom, setResultsThumbZoom] = useState(100);
  const [resultsBulkFocus, setResultsBulkFocus] = useState(false);
  const [lastResultSelectIndex, setLastResultSelectIndex] = useState<number | null>(null);
  const [resultsTableCollapsed, setResultsTableCollapsed] = useState(true);
  const [cropLightboxIndex, setCropLightboxIndex] = useState<number | null>(null);
  const [shelfJobsHistoryFilter, setShelfJobsHistoryFilter] = useState<ShelfJobsHistoryFilter>("all");

  const [skuForm, setSkuForm] = useState({
    sku_code: "",
    sku_name: "",
    brand: "",
    family: "",
    variant: "",
    size_text: "",
    barcode: "",
    estado: "activo",
    subcategoria: "",
    segmento: "",
    forma: "",
    fabricante: "",
    fragancia_variante: "",
    pais: "",
    grupo: "",
    segmento_funcional: "",
    category_cuenta: "",
    x_ancho: "",
    y_alto: "",
    z_profundidad: "",
    metadata_json: "{\n\n}",
  });
  const [bulkJson, setBulkJson] = useState('[\n  {\n    "sku_code": "SKU001",\n    "sku_name": "Producto 1"\n  }\n]');
  const [bulkPreview, setBulkPreview] = useState<Record<string, unknown>[]>([]);
  const [bulkDataForUpload, setBulkDataForUpload] = useState<Record<string, unknown>[]>([]);
  const [showBulkUploadSafeguard, setShowBulkUploadSafeguard] = useState(false);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [skuImageJson, setSkuImageJson] = useState('{\n  "image_file_id": "file_abc123"\n}');
  const [selectedSkuImageFiles, setSelectedSkuImageFiles] = useState<File[]>([]);
  const [recentSkuImageResponses, setRecentSkuImageResponses] = useState<ShelfSkuImageResponse[]>([]);
  const [skuImageBrowserSkuId, setSkuImageBrowserSkuId] = useState("");
  const [selectedSkuImageDetail, setSelectedSkuImageDetail] = useState<ShelfSkuImageResponse | null>(null);
  const [trainingBusyState, setTrainingBusyState] = useState<ShelfTrainingBusyState | null>(null);
  const [skuDeleteTargetId, setSkuDeleteTargetId] = useState("");
  const [skuDeleteDeleteSku, setSkuDeleteDeleteSku] = useState(true);
  const [skuDeleteDeleteImages, setSkuDeleteDeleteImages] = useState(true);
  const [skuDeleteDeleteAssets, setSkuDeleteDeleteAssets] = useState(false);
  const [skuDeleteDeleteFiles, setSkuDeleteDeleteFiles] = useState(false);
  const [skuDeleteDeactivateEmbeddings, setSkuDeleteDeactivateEmbeddings] = useState(true);
  const [skuDeleteRebuildIndex, setSkuDeleteRebuildIndex] = useState(true);
  const [skuDeleteConfirm, setSkuDeleteConfirm] = useState("");
  const [skuDeletePreview, setSkuDeletePreview] = useState<ShelfSkuDeleteResponse | null>(null);
  const [skuDeleteDialogOpen, setSkuDeleteDialogOpen] = useState(false);
  const [recomputeImageIdsText, setRecomputeImageIdsText] = useState("");
  const [recomputeModelNamesText, setRecomputeModelNamesText] = useState("dinov2\nsiglip");
  const [recomputeRebuildIndex, setRecomputeRebuildIndex] = useState(true);
  const [recomputeIncludeInactiveImages, setRecomputeIncludeInactiveImages] = useState(false);
  const [recomputeLimit, setRecomputeLimit] = useState("500");
  const [lastEmbeddingsRecompute, setLastEmbeddingsRecompute] = useState<ShelfEmbeddingsRecomputeResponse | null>(null);
  const [assetUploadSubcategory, setAssetUploadSubcategory] = useState("");
  const [assetUploadType, setAssetUploadType] = useState("catalog");
  const [assetUploadSkuId, setAssetUploadSkuId] = useState("");
  const [selectedAssetFiles, setSelectedAssetFiles] = useState<File[]>([]);
  const [assetFilterSubcategory, setAssetFilterSubcategory] = useState("");
  const [assetFilterSkuId, setAssetFilterSkuId] = useState("");
  const [assetFilterType, setAssetFilterType] = useState("");
  const [assetSkuSearch, setAssetSkuSearch] = useState("");
  const [skuCatalogSearch, setSkuCatalogSearch] = useState("");
  const [skuCatalogCategoryFilter, setSkuCatalogCategoryFilter] = useState("");
  const [skuCatalogSubcategoryFilter, setSkuCatalogSubcategoryFilter] = useState("");
  const [skuCatalogSegmentFilter, setSkuCatalogSegmentFilter] = useState("");
  const [skuCatalogManufacturerFilter, setSkuCatalogManufacturerFilter] = useState("");
  const [skuCatalogBrandFilter, setSkuCatalogBrandFilter] = useState("");
  const [skuCatalogGroupFilter, setSkuCatalogGroupFilter] = useState("");
  const [skuCatalogStatusFilter, setSkuCatalogStatusFilter] = useState("all");
  const [skuCatalogOnlyActive, setSkuCatalogOnlyActive] = useState(true);
  const [skuCatalogDetailCode, setSkuCatalogDetailCode] = useState("");
  const [skuCatalogPage, setSkuCatalogPage] = useState(1);
  const [skuCatalogPageSize, setSkuCatalogPageSize] = useState(12);
  const [skuImageBrowserIncludeInactive, setSkuImageBrowserIncludeInactive] = useState(true);
  const [datasetSummarySkuId, setDatasetSummarySkuId] = useState("");
  const [imageRoleDrafts, setImageRoleDrafts] = useState<Record<string, { dataset_role: ShelfDatasetRole; dataset_split: string }>>({});
  const [faissShadowEnabledDraft, setFaissShadowEnabledDraft] = useState(false);
  const [faissShadowEngineDraft, setFaissShadowEngineDraft] = useState(true);
  const [datasetPublishPending, setDatasetPublishPending] = useState(false);
  const [hardNegativeSkuId, setHardNegativeSkuId] = useState("");
  const [hardNegativeTargetSkuId, setHardNegativeTargetSkuId] = useState("");
  const [hardNegativeReason, setHardNegativeReason] = useState("similar_packaging");
  const [hardNegativeNote, setHardNegativeNote] = useState("");
  const [savedSkuConfusionKeys, setSavedSkuConfusionKeys] = useState<Set<string>>(() => new Set());
  const [datasetCoverageFilter, setDatasetCoverageFilter] = useState<"all" | "with_images" | "without_images" | "indexable">("all");
  const [datasetImageRoleFilter, setDatasetImageRoleFilter] = useState<string>("all");
  const [datasetImageIndexableFilter, setDatasetImageIndexableFilter] = useState<"all" | ImageIndexableBucket>("all");
  const [datasetToolsExpanded, setDatasetToolsExpanded] = useState(false);
  const [cargasWorkspaceSection, setCargasWorkspaceSection] = useState<"ficha" | "bulk" | "images">("ficha");
  const [thresholdForm, setThresholdForm] = useState({
    high_min: "0.82",
    high_delta: "0.08",
    medium_min: "0.68",
    medium_delta: "0.03",
    low_min: "0.45",
  });
  const [normalizeSkuIdsText, setNormalizeSkuIdsText] = useState("");
  const [normalizeStrategy, setNormalizeStrategy] = useState("uppercase");
  const [normalizeRebuildIndex, setNormalizeRebuildIndex] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState<Record<string, unknown> | null>(null);
  const [indexRebuildScope, setIndexRebuildScope] = useState<"catalogo" | "sku" | "categoria">("catalogo");
  const [indexRebuildSkuId, setIndexRebuildSkuId] = useState("");
  const [indexRebuildCategoria, setIndexRebuildCategoria] = useState("");
  const [indexRebuildAsync, setIndexRebuildAsync] = useState(true);
  const [activeShelfOperationId, setActiveShelfOperationId] = useState("");
  const [reliabilityLimitJobs, setReliabilityLimitJobs] = useState("100");
  const [reliabilityAmbiguousDelta, setReliabilityAmbiguousDelta] = useState("0.03");
  const [reliabilityCreatedFrom, setReliabilityCreatedFrom] = useState("");
  const [reliabilityCreatedTo, setReliabilityCreatedTo] = useState("");
  const [reliabilityCompareBaselineJobId, setReliabilityCompareBaselineJobId] = useState("");
  const [reliabilityCompareCandidateJobId, setReliabilityCompareCandidateJobId] = useState("");
  const [ocrAssistDraft, setOcrAssistDraft] = useState<ShelfOcrSkuAssistConfigDraft>(DEFAULT_SHELF_OCR_SKU_ASSIST_DRAFT);
  const [ocrAssistDirty, setOcrAssistDirty] = useState(false);
  const [mdDialogRequest, setMdDialogRequest] = useState<MdDialogRequest>(null);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewStateFilter, setReviewStateFilter] = useState("all");
  const [reviewSkuSearch, setReviewSkuSearch] = useState("");
  const [reviewDecisionSkuId, setReviewDecisionSkuId] = useState("");
  const [selectedReviewItemId, setSelectedReviewItemId] = useState("");
  const [testSkuId, setTestSkuId] = useState("");
  const [testImagePath, setTestImagePath] = useState("");
  const [testIdPdv, setTestIdPdv] = useState("PDV_TEST_001");
  const [testFiles, setTestFiles] = useState<File[]>([]);
  const [lastSkuTestJob, setLastSkuTestJob] = useState<ShelfSkuTestJobResponse | null>(null);
  const [evaluateCropPath, setEvaluateCropPath] = useState("");
  const [evaluateCropCategoriaHint, setEvaluateCropCategoriaHint] = useState("");
  const [evaluateCropTopK, setEvaluateCropTopK] = useState("5");
  const [evaluateCropOrientationEnabled, setEvaluateCropOrientationEnabled] = useState(true);
  const [evaluateCropGlmOcrEnabled, setEvaluateCropGlmOcrEnabled] = useState(false);
  const [evaluateCropVisualAnalystEnabled, setEvaluateCropVisualAnalystEnabled] = useState(false);
  const [evaluateCropFiles, setEvaluateCropFiles] = useState<File[]>([]);
  const [lastEvaluateCrop, setLastEvaluateCrop] = useState<ShelfEvaluateCropResponse | null>(null);

  const shelfEnabled = String(process.env.NEXT_PUBLIC_ENABLE_SHELF_MODULE ?? "true").toLowerCase() === "true";

  const mdDialogQuery = useQuery({
    queryKey: ["shelf-md-dialog", mdDialogRequest?.sourceUrl],
    enabled: Boolean(mdDialogRequest?.sourceUrl),
    retry: false,
    queryFn: async () => {
      if (!mdDialogRequest?.sourceUrl) return "";
      return fetchMarkdownReport(mdDialogRequest.sourceUrl);
    },
  });

  function openMdDialog(title: string, rawUrl: string, downloadFilename?: string) {
    const sourceUrl = resolveArtifactPreviewUrl(rawUrl) ?? rawUrl;
    setMdDialogRequest({ title, sourceUrl, downloadFilename });
  }

  function loadShelfJob(jobIdToLoad: string, targetTab: Tab = "results") {
    const nextJobId = jobIdToLoad.trim();
    if (!nextJobId) return;
    setJobId(nextJobId);
    setSelectedJobId(nextJobId);
    setSelectedArtifactsImageId(null);
    setSelectedCropDetail(null);
    setResultSkuOverrides({});
    setSelectedTrainingCropKeys([]);
    setTab(targetTab);
  }

  function currentResultSkuValue(resultKey: string, fallback: string): string {
    const liveValue = resultSkuInputRefs.current[resultKey]?.value?.trim();
    if (liveValue) return liveValue;
    const storedValue = resultSkuOverrides[resultKey]?.trim();
    if (storedValue) return storedValue;
    return fallback.trim();
  }

  const createJobMutation = useMutation({
    mutationFn: async () => {
      const manualFileIds = imageFileIdsText.split("\n").map((x) => x.trim()).filter(Boolean);
      const fileIds = Array.from(new Set([...uploadedJobFileIds, ...manualFileIds]));
      const paths = imagePathsText.split("\n").map((x) => x.trim()).filter(Boolean);
      const payload: CreateShelfJobRequest = {
        ...jobPayload,
        account_name: account,
        image_file_ids: fileIds.length ? fileIds : undefined,
        image_paths: paths.length ? paths : undefined,
      };
      if (!payload.id_pdv.trim()) throw new Error("id_pdv es obligatorio.");
      if (!payload.image_file_ids?.length && !payload.image_paths?.length) {
        throw new Error("Debes enviar image_file_ids o image_paths.");
      }
      return ocrApi.createShelfJob(payload);
    },
    onSuccess: (data) => {
      setJobId(data.job_id);
      setSelectedJobId(data.job_id);
      toast.success("Shelf job creado", { description: `${data.job_id} (${data.status})` });
    },
    onError: (e) => toast.error("No se pudo crear shelf job", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const rerunShelfJobMutation = useMutation({
    mutationFn: async (jobIdToRerun: string) => {
      const jobId = jobIdToRerun.trim();
      if (!jobId) throw new Error("No hay job_id para reejecutar.");
      return ocrApi.rerunShelfJob(jobId, {});
    },
    onSuccess: async (data) => {
      if (!data.new_job_id) throw new Error("Backend no devolvió new_job_id.");
      loadShelfJob(data.new_job_id, "results");
      await Promise.all([recentShelfJobsQuery.refetch(), jobQuery.refetch(), resultsQuery.refetch(), eventsQuery.refetch(), metricsQuery.refetch()]);
      toast.success("Reejecución iniciada", { description: data.message ?? `Abriendo nuevo job: ${data.new_job_id}` });
    },
    onError: (e) => toast.error("No se pudo reejecutar el Shelf job", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const uploadJobImagesMutation = useMutation({
    mutationFn: async () => {
      if (!selectedJobFiles.length) throw new Error("Selecciona al menos una imagen.");
      const upload = await ocrApi.uploadImages(account, selectedJobFiles);
      return upload.uploaded.map((item) => item.file_id).filter(Boolean);
    },
    onSuccess: (fileIds) => {
      setUploadedJobFileIds(fileIds);
      setImageFileIdsText(fileIds.join("\n"));
      toast.success("Imágenes de prueba subidas", { description: `file_ids listos: ${fileIds.length}` });
    },
    onError: (e) => toast.error("No se pudieron subir imágenes de prueba", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const jobQuery = useQuery({
    queryKey: ["shelf-job", selectedJobId],
    enabled: Boolean(selectedJobId),
    queryFn: () => ocrApi.getShelfJob(selectedJobId),
    refetchInterval: (q) => {
      const st = q.state.data?.status?.toLowerCase();
      if (!st || ["completed", "partial_success", "failed"].includes(st)) return false;
      return 2500;
    },
  });

  const resultsQuery = useQuery({
    queryKey: ["shelf-results", selectedJobId],
    enabled: Boolean(selectedJobId) && ["completed", "partial_success"].includes((jobQuery.data?.status ?? "").toLowerCase()),
    queryFn: () => ocrApi.getShelfJobResults(selectedJobId),
    retry: false,
  });

  const eventsQuery = useQuery({
    queryKey: ["shelf-events", selectedJobId],
    enabled: Boolean(selectedJobId),
    queryFn: () => ocrApi.getShelfJobEvents(selectedJobId),
    refetchInterval: 3000,
  });

  const metricsQuery = useQuery({
    queryKey: ["shelf-metrics", selectedJobId],
    enabled: Boolean(selectedJobId),
    queryFn: () => ocrApi.getShelfJobMetrics(selectedJobId),
    refetchInterval: 3000,
  });

  const artifactsQuery = useQuery({
    queryKey: ["shelf-artifacts", selectedJobId, selectedArtifactsImageId],
    enabled: Boolean(selectedJobId) && typeof selectedArtifactsImageId === "number",
    queryFn: () => ocrApi.getShelfImageArtifacts(selectedJobId, Number(selectedArtifactsImageId)),
    retry: false,
  });

  const extractedCropsQuery = useQuery({
    queryKey: ["shelf-extracted-crops", selectedJobId, selectedArtifactsImageId],
    enabled: Boolean(selectedJobId) && typeof selectedArtifactsImageId === "number",
    queryFn: () => ocrApi.listShelfExtractedCrops(selectedJobId, Number(selectedArtifactsImageId)),
    retry: false,
  });

  const extractedCropsManifestQuery = useQuery({
    queryKey: ["shelf-extracted-crops-manifest", selectedJobId, selectedArtifactsImageId],
    enabled: Boolean(selectedJobId) && typeof selectedArtifactsImageId === "number",
    queryFn: () => ocrApi.getShelfExtractedCropsManifest(selectedJobId, Number(selectedArtifactsImageId)),
    retry: false,
  });

  const jobExtractedCropsQuery = useQuery({
    queryKey: ["shelf-job-extracted-crops", selectedJobId],
    enabled: Boolean(selectedJobId) && ["completed", "partial_success"].includes((jobQuery.data?.status ?? "").toLowerCase()),
    queryFn: () => ocrApi.listShelfJobExtractedCrops(selectedJobId),
    retry: false,
  });

  const shelfJobsListOptions = useMemo(() => {
    if (shelfJobsHistoryFilter === "recognition") return { processing_mode: "recognition" };
    if (shelfJobsHistoryFilter === "crop_extraction") return { processing_mode: "crop_extraction" };
    if (shelfJobsHistoryFilter === "sku_test") return { job_type: "sku_test" };
    return {};
  }, [shelfJobsHistoryFilter]);

  const recentShelfJobsQuery = useQuery({
    queryKey: ["recent-shelf-jobs", account, shelfJobsHistoryFilter],
    queryFn: () => ocrApi.listShelfJobs(account, 100, shelfJobsListOptions),
    enabled: shelfEnabled && ["jobs", "results"].includes(tab),
    staleTime: 15_000,
  });

  const skuCategoriesQuery = useQuery({
    queryKey: ["shelf-sku-categories", account],
    queryFn: () => ocrApi.listShelfSkuCategories(account),
    enabled: shelfEnabled && ["skus", "assets", "review", "results"].includes(tab),
  });

  const skusQuery = useQuery({
    queryKey: ["shelf-skus", account, skuCatalogCategoryFilter],
    queryFn: () => {
      const cat = skuCatalogCategoryFilter || undefined;
      // Sin filtro de categoría: traer todo (limit=5000 cubre los ~2k actuales)
      // Con filtro: limit=1000 cubre la categoría más grande (JABONES=779)
      const limit = cat ? 1000 : 5000;
      return ocrApi.listShelfSkus(account, limit, undefined, cat);
    },
    enabled: shelfEnabled && ["skus", "assets", "review", "results"].includes(tab),
  });

  const remoteCropSkuSearchQuery = useQuery({
    queryKey: ["shelf-sku-remote-search", account, debouncedCropActionSkuSearch],
    queryFn: () => ocrApi.listShelfSkus(account, 20, debouncedCropActionSkuSearch),
    enabled: shelfEnabled && tab === "results" && debouncedCropActionSkuSearch.trim().length >= 2,
    staleTime: 10_000,
  });

  const reviewQueueQuery = useQuery({
    queryKey: ["shelf-review-queue", account],
    queryFn: () => ocrApi.listShelfReviewQueue(account, "pending"),
    enabled: shelfEnabled && tab === "review",
    refetchInterval: tab === "review" ? 4000 : false,
  });

  const configQuery = useQuery({
    queryKey: ["shelf-config", account],
    queryFn: () => ocrApi.getShelfConfig(account),
    enabled: shelfEnabled && tab === "index",
  });

  const detectorModelsQuery = useQuery({
    queryKey: ["detector-local-models"],
    queryFn: () => ocrApi.getDetectorLocalModels(),
    enabled: shelfEnabled && tab === "index",
    staleTime: 120_000,
  });

  const datasetSummaryQuery = useQuery({
    queryKey: ["shelf-dataset-summary", account, datasetSummarySkuId],
    queryFn: () => ocrApi.getShelfDatasetSummary(account, datasetSummarySkuId.trim() || undefined),
    enabled: shelfEnabled && ["index", "skus"].includes(tab),
    staleTime: 30_000,
  });

  const accountDatasetCoverageQuery = useQuery({
    queryKey: ["shelf-dataset-coverage", account],
    queryFn: () => ocrApi.getShelfDatasetSummary(account),
    enabled: shelfEnabled && tab === "skus" && ["catalogo", "cargas", "dataset", "pruebas"].includes(skuWorkspaceTab),
    staleTime: 30_000,
  });

  const hardNegativesQuery = useQuery({
    queryKey: ["shelf-hard-negatives", account, hardNegativeSkuId],
    queryFn: () => ocrApi.listShelfHardNegatives(account, hardNegativeSkuId.trim()),
    enabled: shelfEnabled && tab === "skus" && skuWorkspaceTab === "dataset" && Boolean(hardNegativeSkuId.trim()),
  });

  const catalogSkuHardNegativesQuery = useQuery({
    queryKey: ["shelf-hard-negatives", account, skuCatalogDetailCode],
    queryFn: () => ocrApi.listShelfHardNegatives(account, skuCatalogDetailCode.trim()),
    enabled: shelfEnabled && tab === "skus" && skuWorkspaceTab === "catalogo" && Boolean(skuCatalogDetailCode.trim()),
  });

  const activeConfigQuery = useQuery({
    queryKey: ["active-config", account],
    queryFn: () => ocrApi.getActiveConfig(account, "default"),
    enabled: shelfEnabled && tab === "index",
  });

  const detectorStatusQuery = useQuery({
    queryKey: ["detector-status", account],
    queryFn: () => ocrApi.getDetectorStatus(account, "default", false),
    enabled: shelfEnabled && tab === "index",
    staleTime: 15_000,
  });

  const versionsQuery = useQuery({
    queryKey: ["shelf-index-versions", account],
    queryFn: () => ocrApi.listShelfVectorIndexVersions(account),
    enabled: shelfEnabled && (tab === "index" || (tab === "skus" && skuWorkspaceTab === "dataset")),
    staleTime: 60_000,
  });

  const shelfOperationQuery = useQuery({
    queryKey: ["shelf-operation-status", account, activeShelfOperationId],
    queryFn: () => ocrApi.getShelfOperationStatus(account, activeShelfOperationId),
    enabled: shelfEnabled && tab === "index" && Boolean(activeShelfOperationId.trim()),
    refetchInterval: (query) => {
      const status = String(query.state.data?.status ?? "").toLowerCase();
      if (!status || ["completed", "failed"].includes(status)) return false;
      return 2500;
    },
  });

  const reliabilitySummaryQuery = useQuery({
    queryKey: ["shelf-reliability-summary", account, reliabilityLimitJobs, reliabilityAmbiguousDelta, reliabilityCreatedFrom, reliabilityCreatedTo],
    queryFn: () => ocrApi.getShelfReliabilitySummary(account, {
      limit_jobs: Number(reliabilityLimitJobs) || 100,
      ambiguous_delta: Number(reliabilityAmbiguousDelta) || 0.03,
      created_from: reliabilityCreatedFrom || undefined,
      created_to: reliabilityCreatedTo || undefined,
    }),
    enabled: shelfEnabled && tab === "index",
  });

  const reliabilityCompareQuery = useQuery({
    queryKey: ["shelf-reliability-compare", account, reliabilityCompareBaselineJobId, reliabilityCompareCandidateJobId],
    queryFn: () => ocrApi.getShelfReliabilityCompare(account, reliabilityCompareBaselineJobId.trim(), reliabilityCompareCandidateJobId.trim()),
    enabled: shelfEnabled && tab === "index" && Boolean(reliabilityCompareBaselineJobId.trim() && reliabilityCompareCandidateJobId.trim()),
  });

  const skuImagesQuery = useQuery({
    queryKey: ["shelf-sku-images", account, skuImageBrowserSkuId, skuImageBrowserIncludeInactive],
    queryFn: () => ocrApi.listShelfSkuImages(account, skuImageBrowserSkuId, { include_inactive: skuImageBrowserIncludeInactive }),
    enabled: shelfEnabled && tab === "skus" && skuWorkspaceTab === "dataset" && Boolean(skuImageBrowserSkuId.trim()),
    refetchInterval: skuWorkspaceTab === "dataset" && Boolean(skuImageBrowserSkuId.trim()) ? 12_000 : false,
  });

  const assetSubcategoriesQuery = useQuery({
    queryKey: ["shelf-asset-subcategories", account],
    queryFn: () => ocrApi.listShelfAssetSubcategories(account),
    enabled: shelfEnabled && tab === "assets",
  });

  const assetsQuery = useQuery({
    queryKey: ["shelf-assets", account, assetFilterSubcategory, assetFilterSkuId, assetFilterType],
    queryFn: () =>
      ocrApi.listShelfAssets(account, {
        subcategoria: assetFilterSubcategory || undefined,
        sku_id: assetFilterSkuId || undefined,
        asset_type: assetFilterType || undefined,
        limit: 200,
      }),
    enabled: shelfEnabled && tab === "assets",
  });

  const createSkuMutation = useMutation({
    mutationFn: async () => {
      if (!skuForm.sku_code.trim() || !skuForm.sku_name.trim()) {
        throw new Error("sku_id/sku_code y sku_name son obligatorios.");
      }
      let metadata: Record<string, unknown> | null = null;
      if (skuForm.metadata_json.trim()) {
        try {
          const parsed = JSON.parse(skuForm.metadata_json) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            metadata = parsed as Record<string, unknown>;
          } else {
            throw new Error("metadata debe ser un objeto JSON.");
          }
        } catch (error) {
          throw new Error(error instanceof Error ? `metadata_json invalido: ${error.message}` : "metadata_json invalido.");
        }
      }
      return ocrApi.createShelfSku(
        account,
        buildShelfSkuPayload({
          skuId: skuForm.sku_code.trim(),
          skuName: skuForm.sku_name.trim(),
          brand: skuForm.brand.trim(),
          family: skuForm.family.trim(),
          variant: skuForm.variant.trim(),
          sizeText: skuForm.size_text.trim(),
          barcode: skuForm.barcode.trim(),
          estado: skuForm.estado.trim(),
          subcategoria: skuForm.subcategoria.trim(),
          segmento: skuForm.segmento.trim(),
          forma: skuForm.forma.trim(),
          fabricante: skuForm.fabricante.trim(),
          fragancia_variante: skuForm.fragancia_variante.trim(),
          pais: skuForm.pais.trim(),
          grupo: skuForm.grupo.trim(),
          segmento_funcional: skuForm.segmento_funcional.trim(),
          category_cuenta: skuForm.category_cuenta.trim(),
          x_ancho: skuForm.x_ancho.trim(),
          y_alto: skuForm.y_alto.trim(),
          z_profundidad: skuForm.z_profundidad.trim(),
          metadata,
        }),
      );
    },
    onSuccess: () => {
      skusQuery.refetch();
      toast.success("SKU creado");
    },
    onError: (e) => toast.error("No se pudo crear SKU", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const items = rows
        .map((row) => normalizeBulkShelfSeedRow(row))
        .filter((row): row is Record<string, unknown> => Boolean(row));
      if (!items.length) throw new Error("No se encontraron filas válidas para seed/update de Shelf.");
      return ocrApi.seedShelfSkus(account, items);
    },
    onSuccess: (result) => {
      skusQuery.refetch();
      const created = typeof result.created === "number" ? result.created : typeof result.created_count === "number" ? result.created_count : undefined;
      const updated = typeof result.updated === "number" ? result.updated : typeof result.updated_count === "number" ? result.updated_count : undefined;
      const total = typeof result.total === "number" ? result.total : typeof result.processed === "number" ? result.processed : created ?? 0;
      const parts = [
        typeof total === "number" ? `Procesados: ${total}` : "",
        typeof created === "number" ? `creados: ${created}` : "",
        typeof updated === "number" ? `actualizados: ${updated}` : "",
      ].filter(Boolean);
      toast.success("Carga masiva completada", { description: parts.join(" · ") || "Seed ejecutado correctamente" });
    },
    onError: (e) => toast.error("No se pudo crear en lote", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const addSkuImageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSkuId.trim()) throw new Error("Selecciona sku_id.");
      const parsed = JSON.parse(skuImageJson) as Record<string, unknown>;
      const imagePath = firstNonEmptyString(parsed.image_path);
      const imageFileId = firstNonEmptyString(parsed.image_file_id);
      const imagePaths = Array.isArray(parsed.image_paths)
        ? parsed.image_paths.map((x) => String(x).trim()).filter(Boolean)
        : [];
      const imageFileIds = Array.isArray(parsed.image_file_ids)
        ? parsed.image_file_ids.map((x) => String(x).trim()).filter(Boolean)
        : [];

      const singles: Array<Record<string, unknown>> = [];
      if (imagePath) singles.push({ image_path: imagePath });
      if (imageFileId) singles.push({ image_file_id: imageFileId });
      for (const p of imagePaths) singles.push({ image_path: p });
      for (const id of imageFileIds) singles.push({ image_file_id: id });

      if (!singles.length) {
        throw new Error("Debes enviar image_path o image_file_id (también se acepta lote con image_paths/image_file_ids).");
      }
      if (imagePath && imageFileId) {
        throw new Error("En payload simple envía exactamente uno: image_path o image_file_id.");
      }

      const responses: ShelfSkuImageResponse[] = [];
      for (const payload of singles) {
        const response = await ocrApi.addShelfSkuImages(account, selectedSkuId.trim(), payload);
        responses.push(response);
      }
      return { added: singles.length, responses };
    },
    onSuccess: (data) => {
      const nextResponses = (data as { responses?: ShelfSkuImageResponse[] }).responses ?? [];
      setRecentSkuImageResponses(nextResponses);
      toast.success("Imagenes asociadas al SKU", { description: `Cargas enviadas: ${String((data as { added?: number }).added ?? 1)}` });
    },
    onError: (e) => toast.error("No se pudo asociar imagenes", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const uploadAndAssociateSkuImagesMutation = useMutation({
    mutationFn: async () => {
      const skuId = selectedSkuId.trim();
      if (!skuId) throw new Error("Selecciona sku_id.");
      if (!selectedSkuImageFiles.length) throw new Error("Selecciona al menos una imagen.");
      const upload = await ocrApi.uploadImages(account, selectedSkuImageFiles);
      const fileIds = (upload.uploaded ?? []).map((item) => item.file_id).filter(Boolean);
      if (!fileIds.length) throw new Error("No se obtuvieron file_id tras upload.");
      const responses: ShelfSkuImageResponse[] = [];
      for (const fileId of fileIds) {
        const response = await ocrApi.addShelfSkuImages(account, skuId, { image_file_id: fileId });
        responses.push(response);
      }
      return { uploaded: fileIds.length, responses };
    },
    onSuccess: (data) => {
      setSelectedSkuImageFiles([]);
      setRecentSkuImageResponses((data as { responses?: ShelfSkuImageResponse[] }).responses ?? []);
      toast.success("Imágenes subidas y asociadas", { description: `Total: ${String((data as { uploaded?: number }).uploaded ?? 0)}` });
    },
    onError: (e) => toast.error("No se pudo subir/asociar imágenes", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const createSkuTestJobMutation = useMutation({
    mutationFn: async () => {
      const skuId = testSkuId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim();
      if (!skuId) throw new Error("Selecciona un sku_id para probar.");
      if (!testIdPdv.trim()) throw new Error("id_pdv es obligatorio.");
      if (testImagePath.trim()) {
        return ocrApi.createShelfSkuTestJob(account, skuId, { image_path: testImagePath.trim(), id_pdv: testIdPdv.trim() });
      }
      if (testFiles.length) {
        const upload = await ocrApi.uploadImages(account, testFiles);
        const fileId = upload.uploaded?.[0]?.file_id;
        if (!fileId) throw new Error("No se obtuvo image_file_id para la prueba.");
        return ocrApi.createShelfSkuTestJob(account, skuId, { image_file_id: fileId, id_pdv: testIdPdv.trim() });
      }
      throw new Error("Debes enviar una imagen de prueba por ruta o desde el explorador.");
    },
    onSuccess: (data) => {
      setLastSkuTestJob(data);
      setSelectedJobId(data.job_id);
      setJobId(data.job_id);
      toast.success("Prueba de SKU creada", { description: `job_id: ${data.job_id}` });
    },
    onError: (e) => toast.error("No se pudo crear prueba de SKU", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const uploadAssetsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssetFiles.length) throw new Error("Selecciona al menos un asset.");
      return ocrApi.uploadShelfAssets(account, {
        files: selectedAssetFiles,
        subcategoria: assetUploadSubcategory.trim() || undefined,
        asset_type: assetUploadType.trim() || undefined,
        sku_id: assetUploadSkuId.trim() || undefined,
      });
    },
    onSuccess: () => {
      setSelectedAssetFiles([]);
      assetsQuery.refetch();
      assetSubcategoriesQuery.refetch();
      toast.success("Assets subidos", { description: "Ya están listos para revisar o adjuntar a un SKU." });
    },
    onError: (e) => toast.error("No se pudieron subir assets", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const attachAssetToSkuMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const skuId = selectedSkuId.trim() || assetUploadSkuId.trim() || skuImageBrowserSkuId.trim();
      if (!assetId) throw new Error("Selecciona un asset.");
      if (!skuId) throw new Error("Selecciona o escribe un sku_id para adjuntar.");
      return ocrApi.attachShelfAssetToSku(account, { asset_id: assetId, sku_id: skuId, source_type: "catalog" });
    },
    onSuccess: () => {
      skuImagesQuery.refetch();
      assetsQuery.refetch();
      toast.success("Asset adjuntado al SKU", { description: "Conviene reconstruir el índice si cambia el dataset relevante." });
    },
    onError: (e) => toast.error("No se pudo adjuntar asset", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const deleteAssetMutation = useMutation({
    mutationFn: async (assetId: number | string) => ocrApi.deleteShelfAsset(account, assetId),
    onSuccess: () => {
      assetsQuery.refetch();
      toast.success("Asset desactivado", { description: "Ya no cuenta como parte activa del dataset." });
    },
    onError: (e) => toast.error("No se pudo desactivar asset", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const getSkuImageDetailMutation = useMutation({
    mutationFn: async (args: { skuId: string; imageId: number | string }) => ocrApi.getShelfSkuImage(account, args.skuId, args.imageId),
    onSuccess: (data) => setSelectedSkuImageDetail(data),
    onError: (e) => toast.error("No se pudo cargar detalle de imagen", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const deleteSkuImageMutation = useMutation({
    mutationFn: async (args: { skuId: string; imageId: number | string }) =>
      ocrApi.deleteShelfSkuImage(account, args.skuId, args.imageId, { rebuild_index: true, delete_file: false }),
    onSuccess: () => {
      skuImagesQuery.refetch();
      setSelectedSkuImageDetail(null);
      toast.success("Imagen desactivada del dataset", { description: "Se recomienda reconstruir índice cuando cierres cambios importantes." });
    },
    onError: (e) => toast.error("No se pudo desactivar imagen", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const evaluateCropMutation = useMutation({
    mutationFn: async () => {
      const analysisModules = [
        "sku_match",
        ...(evaluateCropOrientationEnabled ? ["orientation"] : []),
        ...(evaluateCropGlmOcrEnabled ? ["glm_ocr"] : []),
        ...(evaluateCropVisualAnalystEnabled ? ["visual_analyst"] : []),
      ];
      const payload: { image_path?: string; image_file_id?: string; config_name?: string; categoria_hint?: string; top_k_skus?: number; analysis_modules?: string[] } = {
        config_name: "default",
        categoria_hint: evaluateCropCategoriaHint.trim() || undefined,
        top_k_skus: Number(evaluateCropTopK.trim() || "5") || 5,
        analysis_modules: analysisModules,
      };
      if (evaluateCropFiles.length) {
        const upload = await ocrApi.uploadImages(account, [evaluateCropFiles[0]]);
        const fileId = upload.uploaded?.[0]?.file_id;
        if (!fileId) throw new Error("No se pudo resolver image_file_id para evaluar el crop.");
        payload.image_file_id = fileId;
      } else if (evaluateCropPath.trim()) {
        payload.image_path = evaluateCropPath.trim();
      } else {
        throw new Error("Debes elegir un archivo o escribir image_path.");
      }
      return ocrApi.evaluateShelfCrop(account, payload);
    },
    onSuccess: (data) => {
      setLastEvaluateCrop(data);
      toast.success("Crop evaluado", { description: `${firstNonEmptyString(data.suggested_sku_id, "Sin sugerencia")} · ${firstNonEmptyString(data.confidence_state, "sin estado")}` });
    },
    onError: (e) => toast.error("No se pudo evaluar el crop", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const recomputeEmbeddingsMutation = useMutation({
    mutationFn: async () => {
      const imageIds = recomputeImageIdsText
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (/^\d+$/.test(item) ? Number(item) : item));
      const skuId = selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
      const modelNames = recomputeModelNamesText
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      const limit = Number.parseInt(recomputeLimit.trim(), 10);
      if (!imageIds.length && !skuId) throw new Error("Selecciona un SKU o indica al menos un image_id.");
      return ocrApi.recomputeShelfEmbeddings(account, {
        sku_id: imageIds.length ? undefined : skuId,
        image_ids: imageIds.length ? imageIds : undefined,
        model_names: modelNames.length ? modelNames : undefined,
        include_inactive_images: imageIds.length ? undefined : recomputeIncludeInactiveImages,
        rebuild_index: recomputeRebuildIndex,
        config_name: "default",
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      });
    },
    onSuccess: (data) => {
      setLastEmbeddingsRecompute(data);
      void Promise.all([skuImagesQuery.refetch(), versionsQuery.refetch()]);
      toast.success("Recalculo enviado", { description: "Revisa el resultado técnico para confirmar si SigLIP quedó sano." });
    },
    onError: (e) => toast.error("No se pudo recalcular embeddings", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const adminRecomputeAllEmbeddingsMutation = useMutation({
    mutationFn: async () => {
      return ocrApi.recomputeShelfEmbeddings(account, {
        model_names: ["dinov2", "siglip"],
        rebuild_index: true,
        config_name: "default",
        limit: 5000,
      });
    },
    onSuccess: async (data) => {
      setLastEmbeddingsRecompute(data);
      await Promise.all([versionsQuery.refetch(), resultsQuery.refetch(), skuImagesQuery.refetch()]);
      toast.success("Recalculo global enviado", { description: "Se solicitó recalcular embeddings y reconstruir índice." });
    },
    onError: (e) => toast.error("No se pudo recalcular embeddings + índice", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const deleteSkuMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const skuId = skuDeleteTargetId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
      if (!skuId) throw new Error("Selecciona un sku_id para desactivar o borrar.");
      return ocrApi.deleteShelfSku(account, skuId, {
        dry_run: dryRun,
        delete_sku: skuDeleteDeleteSku,
        delete_images: skuDeleteDeleteImages,
        delete_assets: skuDeleteDeleteAssets,
        delete_files: skuDeleteDeleteFiles,
        deactivate_embeddings: skuDeleteDeactivateEmbeddings,
        rebuild_index: skuDeleteRebuildIndex,
        config_name: "default",
        confirm: dryRun ? "" : skuDeleteConfirm,
      });
    },
    onSuccess: (data, dryRun) => {
      setSkuDeletePreview(data);
      if (!dryRun) {
        const deletedSkuId = firstNonEmptyString(data.sku_id);
        if (deletedSkuId && deletedSkuId === selectedSkuId) setSelectedSkuId("");
        if (deletedSkuId && deletedSkuId === skuImageBrowserSkuId) setSkuImageBrowserSkuId("");
        if (deletedSkuId && deletedSkuId === testSkuId) setTestSkuId("");
        if (deletedSkuId && deletedSkuId === skuDeleteTargetId) setSkuDeleteTargetId("");
        setSelectedSkuImageDetail(null);
        void Promise.all([skusQuery.refetch(), skuImagesQuery.refetch(), assetsQuery.refetch(), versionsQuery.refetch()]);
      }
      toast.success(dryRun ? "Impacto calculado" : "SKU desactivado", {
        description: dryRun ? "Revisa el alcance antes de confirmar." : "El catálogo y el dataset visual ya se actualizaron.",
      });
    },
    onError: (e) => toast.error("No se pudo desactivar el SKU", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const rebuildIndexMutation = useMutation({
    mutationFn: async () => ocrApi.rebuildShelfVectorIndex(account, {}),
    onSuccess: () => {
      setDatasetPublishPending(false);
      versionsQuery.refetch();
      toast.success("Reconstrucción de índice iniciada", { description: "El dataset ya quedó enviado a publicación." });
    },
    onError: (e) => toast.error("No se pudo reconstruir indice", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const normalizeSkusMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const skuIds = normalizeSkuIdsText
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      return ocrApi.normalizeShelfSkus(account, {
        dry_run: dryRun,
        strategy: normalizeStrategy,
        sku_ids: skuIds,
        rebuild_index: dryRun ? false : normalizeRebuildIndex,
        model_names: normalizeRebuildIndex ? ["dinov2", "siglip"] : undefined,
        config_name: "default",
        confirm: dryRun ? undefined : "NORMALIZE_SKUS",
      });
    },
    onSuccess: (data, dryRun) => {
      setNormalizeResult(data);
      if (!dryRun) {
        void Promise.all([skusQuery.refetch(), skuImagesQuery.refetch(), assetsQuery.refetch(), versionsQuery.refetch()]);
      }
      toast.success(dryRun ? "Análisis de normalización listo" : "Normalización aplicada", {
        description: dryRun ? "Revisa el impacto antes de confirmar." : "El catálogo Shelf ya quedó normalizado.",
      });
    },
    onError: (e) => toast.error("No se pudo normalizar SKUs", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const scopedRebuildIndexMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        model_names: ["dinov2", "siglip"],
        only_active_skus: true,
        async_mode: indexRebuildAsync,
        config_name: "default",
      };
      if (indexRebuildScope === "sku" && indexRebuildSkuId.trim()) payload.sku_id = indexRebuildSkuId.trim();
      if (indexRebuildScope === "categoria" && indexRebuildCategoria.trim()) payload.categoria = indexRebuildCategoria.trim();
      return ocrApi.rebuildShelfVectorIndex(account, payload);
    },
    onSuccess: (data) => {
      const operationId = firstNonEmptyString(data.operation_id);
      if (operationId) {
        setActiveShelfOperationId(operationId);
      }
      void versionsQuery.refetch();
      toast.success("Rebuild enviado", { description: operationId ? `Operación: ${operationId}` : "Solicitud procesada." });
    },
    onError: (e) => toast.error("No se pudo enviar rebuild", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const saveThresholdsMutation = useMutation({
    mutationFn: async () => {
      const activeConfig = activeConfigQuery.data;
      if (!activeConfig?.config || typeof activeConfig.config !== "object") {
        throw new Error("No se pudo cargar la config activa completa.");
      }
      const toNumber = (value: string, label: string) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) throw new Error(`Valor inválido en ${label}.`);
        return parsed;
      };
      const nextThresholds = {
        high_min: toNumber(thresholdForm.high_min, "high_min"),
        high_delta: toNumber(thresholdForm.high_delta, "high_delta"),
        medium_min: toNumber(thresholdForm.medium_min, "medium_min"),
        medium_delta: toNumber(thresholdForm.medium_delta, "medium_delta"),
        low_min: toNumber(thresholdForm.low_min, "low_min"),
      };
      const baseConfig = activeConfig.config as Record<string, unknown>;
      const shelfRecognition = baseConfig.shelf_recognition && typeof baseConfig.shelf_recognition === "object"
        ? (baseConfig.shelf_recognition as Record<string, unknown>)
        : {};
      const payload = {
        name: activeConfig.name ?? "default",
        version: "next",
        is_active: Boolean(activeConfig.is_active ?? true),
        config: {
          ...baseConfig,
          shelf_recognition: {
            ...shelfRecognition,
            confidence_thresholds: nextThresholds,
          },
        },
      };
      return ocrApi.createOrUpdateConfig(account, payload);
    },
    onSuccess: async () => {
      await Promise.all([configQuery.refetch(), activeConfigQuery.refetch()]);
      toast.success("Thresholds guardados", { description: "La configuración Shelf ya quedó actualizada." });
    },
    onError: (e) => toast.error("No se pudieron guardar los thresholds", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const saveDetectorLocalModelMutation = useMutation({
    mutationFn: async (localModelPath: string) => {
      const activeConfig = activeConfigQuery.data;
      if (!activeConfig?.config || typeof activeConfig.config !== "object") {
        throw new Error("No se pudo cargar la config activa completa.");
      }
      const nextPath = localModelPath.trim();
      if (!nextPath) throw new Error("Selecciona o escribe un local_model_path.");
      const baseConfig = activeConfig.config as Record<string, unknown>;
      const detectionConfig = baseConfig.detection_config && typeof baseConfig.detection_config === "object"
        ? (baseConfig.detection_config as Record<string, unknown>)
        : {};
      const payload = {
        name: activeConfig.name ?? "default",
        version: "next",
        is_active: Boolean(activeConfig.is_active ?? true),
        config: {
          ...baseConfig,
          detection_config: {
            ...detectionConfig,
            mode: "local",
            local_model_path: nextPath,
          },
        },
      };
      return ocrApi.createOrUpdateConfig(account, payload);
    },
    onSuccess: async () => {
      await Promise.all([activeConfigQuery.refetch(), detectorStatusQuery.refetch()]);
      toast.success("Modelo YOLO guardado", { description: "Shelf seguirá usando este detector local heredado de la cuenta." });
    },
    onError: (e) => toast.error("No se pudo guardar el modelo YOLO", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const saveCropMaskingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const activeConfig = activeConfigQuery.data;
      if (!activeConfig?.config || typeof activeConfig.config !== "object") {
        throw new Error("No se pudo cargar la config activa completa.");
      }
      const baseConfig = activeConfig.config as Record<string, unknown>;
      const shelfRecognition = baseConfig.shelf_recognition && typeof baseConfig.shelf_recognition === "object"
        ? (baseConfig.shelf_recognition as Record<string, unknown>)
        : {};
      const existingMasking = shelfRecognition.crop_masking && typeof shelfRecognition.crop_masking === "object"
        ? (shelfRecognition.crop_masking as Record<string, unknown>)
        : {};
      const payload = {
        name: activeConfig.name ?? "default",
        version: "next",
        is_active: Boolean(activeConfig.is_active ?? true),
        config: {
          ...baseConfig,
          shelf_recognition: {
            ...shelfRecognition,
            crop_masking: {
              ...existingMasking,
              enabled,
              background: firstNonEmptyString(existingMasking.background, "black"),
              only_when_segmentation_available: existingMasking.only_when_segmentation_available !== false,
            },
          },
        },
      };
      return ocrApi.createOrUpdateConfig(account, payload);
    },
    onSuccess: async () => {
      await Promise.all([configQuery.refetch(), activeConfigQuery.refetch()]);
      toast.success("Recortes segmentados actualizados", { description: "Shelf usará máscara solo cuando el modelo local la entregue." });
    },
    onError: (e) => toast.error("No se pudo guardar crop_masking", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const saveShelfVectorStoreMutation = useMutation({
    mutationFn: async () =>
      ocrApi.patchShelfConfig(account, {
        config_name: "default",
        version: "next",
        is_active: true,
        shelf_recognition: {
          vector_store: {
            shadow_engines: faissShadowEngineDraft ? ["faiss"] : [],
            faiss_shadow_enabled: faissShadowEnabledDraft,
          },
        },
      }),
    onSuccess: async () => {
      await Promise.all([configQuery.refetch(), activeConfigQuery.refetch(), versionsQuery.refetch()]);
      toast.success("Config Shelf actualizada", { description: "FAISS shadow quedó guardado en la configuración activa." });
    },
    onError: (e) => toast.error("No se pudo guardar config Shelf", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  useEffect(() => {
    if (!configQuery.data) return;
    const sr = (configQuery.data as Record<string, unknown>).shelf_recognition as Record<string, unknown> | undefined;
    setOcrAssistDraft(ocrAssistDraftFromConfig(sr?.ocr_sku_assist));
    setOcrAssistDirty(false);
  }, [configQuery.data]);

  const saveOcrAssistMutation = useMutation({
    mutationFn: async () =>
      ocrApi.patchShelfConfig(account, {
        config_name: "default",
        version: "next",
        is_active: true,
        shelf_recognition: {
          ocr_sku_assist: ocrAssistDraftToPatchPayload(ocrAssistDraft),
        },
      }),
    onSuccess: async () => {
      await Promise.all([configQuery.refetch(), activeConfigQuery.refetch()]);
      setOcrAssistDirty(false);
      toast.success("OCR SKU Assist configurado", { description: "El cambio aplica a los próximos jobs de recognition." });
    },
    onError: (e) => toast.error("No se pudo guardar OCR SKU Assist", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const patchShelfImageRoleMutation = useMutation({
    mutationFn: async (args: { skuId: string; imageId: number | string; dataset_role: ShelfDatasetRole; dataset_split?: string }) =>
      ocrApi.patchShelfSkuImageDatasetRole(account, args.skuId, args.imageId, {
        dataset_role: args.dataset_role,
        dataset_split: args.dataset_split?.trim() || undefined,
        rebuild_index: false,
        user: "frontend_user",
      }),
    onSuccess: async () => {
      setDatasetPublishPending(true);
      await Promise.all([skuImagesQuery.refetch(), datasetSummaryQuery.refetch(), versionsQuery.refetch()]);
      toast.success("Rol de dataset actualizado", { description: "Falta publicar el índice para que recognition use este cambio." });
    },
    onError: (e) => toast.error("No se pudo actualizar el rol de dataset", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const createHardNegativeMutation = useMutation({
    mutationFn: async () => {
      if (!hardNegativeSkuId.trim()) throw new Error("Selecciona el SKU correcto.");
      if (!hardNegativeTargetSkuId.trim()) throw new Error("Selecciona el SKU parecido pero incorrecto.");
      return ocrApi.createShelfHardNegative(account, hardNegativeSkuId.trim(), {
        negative_sku_id: hardNegativeTargetSkuId.trim(),
        reason: hardNegativeReason.trim() || "similar_packaging",
        note: hardNegativeNote.trim() || undefined,
        user: "frontend",
      });
    },
    onSuccess: async (_data, _vars, _ctx) => {
      const anchor = hardNegativeSkuId.trim();
      const negative = hardNegativeTargetSkuId.trim();
      setSavedSkuConfusionKeys((prev) => {
        const next = new Set(prev);
        next.add(skuConfusionKey(anchor, negative));
        return next;
      });
      await hardNegativesQuery.refetch();
      if (skuCatalogDetailCode.trim() === anchor) {
        await catalogSkuHardNegativesQuery.refetch();
      }
      setHardNegativeTargetSkuId("");
      setHardNegativeNote("");
      toast.success(`Confusión guardada: ${negative} se marcó como similar pero incorrecto para ${anchor}.`);
    },
    onError: () => toast.error("No se pudo guardar la confusión frecuente. Inténtalo de nuevo."),
  });

  const markSkuConfusionMutation = useMutation({
    mutationFn: async (args: { anchorSku: string; negativeSku: string; note?: string }) => {
      const anchor = args.anchorSku.trim();
      const negative = args.negativeSku.trim();
      if (!anchor) throw new Error("Selecciona primero el SKU correcto.");
      if (!negative) throw new Error("Selecciona el SKU confundido.");
      if (skuCodesEqual(anchor, negative)) throw new Error("El SKU confundido no puede ser el mismo que el correcto.");
      return ocrApi.createShelfHardNegative(account, anchor, {
        negative_sku_id: negative,
        reason: "similar_packaging",
        note: args.note?.trim() || "Creado desde curaduría frontend",
        user: "frontend",
      });
    },
    onSuccess: async (_data, variables) => {
      const anchor = variables.anchorSku.trim();
      const negative = variables.negativeSku.trim();
      setSavedSkuConfusionKeys((prev) => {
        const next = new Set(prev);
        next.add(skuConfusionKey(anchor, negative));
        return next;
      });
      if (hardNegativeSkuId.trim() === anchor || !hardNegativeSkuId.trim()) {
        setHardNegativeSkuId(anchor);
        await hardNegativesQuery.refetch();
      }
      if (skuCatalogDetailCode.trim() === anchor) {
        await catalogSkuHardNegativesQuery.refetch();
      }
      toast.success(`Confusión guardada: ${negative} se marcó como similar pero incorrecto para ${anchor}.`);
    },
    onError: () => toast.error("No se pudo guardar la confusión frecuente. Inténtalo de nuevo."),
  });

  const markAllSkuConfusionsMutation = useMutation({
    mutationFn: async (args: { anchorSku: string; negativeSkus: string[]; note?: string }) => {
      const anchor = args.anchorSku.trim();
      const negatives = [...new Set(args.negativeSkus.map((sku) => sku.trim()).filter((sku) => sku && !skuCodesEqual(sku, anchor)))];
      if (!anchor) throw new Error("Selecciona primero el SKU correcto.");
      if (!negatives.length) throw new Error("No hay candidatos pendientes para marcar.");
      const results = await Promise.allSettled(
        negatives.map((negative) =>
          ocrApi.createShelfHardNegative(account, anchor, {
            negative_sku_id: negative,
            reason: "similar_packaging",
            note: args.note?.trim() || "Creado desde curaduría frontend (lote)",
            user: "frontend",
          }),
        ),
      );
      const succeeded = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - succeeded;
      return { anchor, negatives, succeeded, failed, total: negatives.length };
    },
    onSuccess: async (result) => {
      setSavedSkuConfusionKeys((prev) => {
        const next = new Set(prev);
        for (const negative of result.negatives) {
          next.add(skuConfusionKey(result.anchor, negative));
        }
        return next;
      });
      if (hardNegativeSkuId.trim() === result.anchor || !hardNegativeSkuId.trim()) {
        setHardNegativeSkuId(result.anchor);
        await hardNegativesQuery.refetch();
      }
      if (skuCatalogDetailCode.trim() === result.anchor) {
        await catalogSkuHardNegativesQuery.refetch();
      }
      if (result.failed > 0) {
        toast.warning(`Confusiones guardadas: ${result.succeeded}/${result.total}. ${result.failed} fallaron.`);
        return;
      }
      toast.success(
        result.total === 1
          ? `Confusión guardada: ${result.negatives[0]} se marcó como similar pero incorrecto para ${result.anchor}.`
          : `Confusiones guardadas: ${result.total} SKUs marcados como similares pero incorrectos para ${result.anchor}.`,
      );
    },
    onError: () => toast.error("No se pudo guardar la confusión frecuente. Inténtalo de nuevo."),
  });

  const resolveReviewMutation = useMutation({
    mutationFn: async (args: { itemId: number | string; decision: "accept_top1" | "assign_sku" | "mark_unknown" | "discard_crop" }) =>
      ocrApi.decideShelfReviewItem(account, args.itemId, {
        decision: args.decision,
        sku_id: args.decision === "assign_sku" ? reviewDecisionSkuId.trim() : undefined,
      }),
    onSuccess: () => {
      reviewQueueQuery.refetch();
      toast.success("Decision guardada");
    },
    onError: (e) => toast.error("No se pudo guardar decision", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const cropDetailMutation = useMutation({
    mutationFn: async (args: { imageId: number; cropId: string }) => ocrApi.getShelfCropDetail(selectedJobId, args.imageId, args.cropId),
    onSuccess: (data) => {
      setSelectedCropDetail((data.crop && typeof data.crop === "object" ? data.crop : null) as Record<string, unknown> | null);
      toast.success("Detalle del crop cargado");
    },
    onError: (e) => toast.error("No se pudo cargar el detalle del crop", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const cropDecisionMutation = useMutation({
    mutationFn: async (args: {
      imageId: number;
      cropId: string;
      decision: "confirm_sku" | "assign_sku" | "mark_unknown" | "discard_crop" | "reject_suggested_sku";
      skuId?: string;
      rejectedSkuId?: string;
    }) => {
      const payload = {
        decision: args.decision,
        sku_id: args.decision === "assign_sku" ? (args.skuId?.trim() || cropActionSkuId.trim()) : undefined,
        rejected_sku_id: args.decision === "reject_suggested_sku" ? args.rejectedSkuId?.trim() : undefined,
        note: cropActionNote.trim() || undefined,
        user: "frontend_user",
      };
      if (args.decision === "assign_sku" && !payload.sku_id) {
        throw new Error("Debes indicar un sku_id para assign_sku.");
      }
      if (args.decision === "reject_suggested_sku" && !payload.rejected_sku_id) {
        throw new Error("Debes indicar el SKU rechazado.");
      }
      return ocrApi.decideShelfCrop(selectedJobId, args.imageId, args.cropId, payload);
    },
    onSuccess: async () => {
      await Promise.all([resultsQuery.refetch(), artifactsQuery.refetch(), extractedCropsQuery.refetch()]);
      toast.success("Decisión del crop guardada");
    },
    onError: (e) => toast.error("No se pudo guardar la decisión del crop", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const refreshReportsMutation = useMutation({
    mutationFn: async () => ocrApi.refreshShelfJobReports(selectedJobId),
    onSuccess: async () => {
      await Promise.all([jobQuery.refetch(), resultsQuery.refetch(), artifactsQuery.refetch()]);
      toast.success("Reportes regenerados");
    },
    onError: (e) => toast.error("No se pudieron regenerar los reportes", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const promoteCropMutation = useMutation({
    mutationFn: async (args: { imageId: number; cropId: string; skuId?: string }) => {
      const skuId = args.skuId?.trim() || cropActionSkuId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
      if (!skuId) throw new Error("Selecciona o escribe un sku_id para promover el crop.");
      return ocrApi.promoteShelfCropToSku(account, selectedJobId, args.imageId, args.cropId, {
        sku_id: skuId,
        attach_crop_as_reference: true,
        rebuild_index: false,
        dataset_role: cropDatasetRole,
        dataset_split: cropDatasetSplit.trim() || undefined,
        note: cropActionNote.trim() || "Confirmado manualmente desde tarjeta de sugeridos",
        user: "DEMO_USER",
      });
    },
    onMutate: async (args) => {
      const skuId = args.skuId?.trim() || cropActionSkuId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
      setTrainingBusyState({
        mode: "single",
        skuId,
        cropCount: 1,
        message: "Estamos asociando el crop y generando embeddings. La publicación del índice queda como paso separado para cerrar el lote.",
      });
    },
    onSuccess: async () => {
      setDatasetPublishPending(true);
      await Promise.all([skuImagesQuery.refetch(), resultsQuery.refetch(), artifactsQuery.refetch(), versionsQuery.refetch()]);
      toast.success("Crop guardado en el dataset del SKU", { description: "Ahora publica el índice cuando cierres este lote." });
    },
    onSettled: () => {
      setTrainingBusyState(null);
    },
    onError: (e) => toast.error("No se pudo promover el crop", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const batchPromoteCropsMutation = useMutation({
    mutationFn: async () => {
      const skuId = cropActionSkuId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
      if (!skuId) throw new Error("Selecciona o escribe un sku_id para promover el grupo.");
      const grouped = jobExtractedCropsQuery.data?.images ?? [];
      const selectedItemsFromGroups = grouped.flatMap((group) =>
        (group.items ?? []).filter((crop) => {
          const key = trainingCropKey(crop.image_id ?? group.image_id, firstNonEmptyString(crop.crop_id));
          return selectedTrainingCropKeySet.has(key);
        }),
      );
      const selectedItems = [
        ...selectedItemsFromGroups.map((crop) => ({
          image_id: Number(crop.image_id ?? 0),
          crop_id: firstNonEmptyString(crop.crop_id),
          metadata: {
            ui_group_id: trainingGroupLabel.trim() || skuId,
            ui_group_label: trainingGroupLabel.trim() || skuId,
          },
        })),
        ...selectedResultTrainingItems,
      ].filter((crop) => crop.image_id > 0 && crop.crop_id);
      const dedupedItems = Array.from(
        new Map(selectedItems.map((crop) => [trainingCropKey(crop.image_id, crop.crop_id), crop])).values(),
      );
      if (!dedupedItems.length) throw new Error("Selecciona al menos un crop.");
      return ocrApi.batchPromoteShelfCropsToSku(account, selectedJobId, {
        sku_id: skuId,
        attach_crop_as_reference: true,
        rebuild_index: false,
        dataset_role: cropDatasetRole,
        dataset_split: cropDatasetSplit.trim() || undefined,
        source_type: "job_crop_batch",
        note: cropActionNote.trim() || "Confirmación múltiple desde UI",
        user: "DEMO_USER",
        crops: dedupedItems,
      });
    },
    onMutate: async () => {
      const skuId = cropActionSkuId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
      setTrainingBusyState({
        mode: "batch",
        skuId,
        cropCount: selectedTrainingCropsCount,
        message: "Estamos guardando varios crops en el dataset del SKU. La publicación del índice queda separada para que cierres el lote cuando quieras.",
      });
    },
    onSuccess: async () => {
      setDatasetPublishPending(true);
      setSelectedTrainingCropKeys([]);
      await Promise.all([jobExtractedCropsQuery.refetch(), resultsQuery.refetch(), artifactsQuery.refetch(), skuImagesQuery.refetch(), versionsQuery.refetch()]);
      toast.success("Crops guardados en el dataset del SKU", { description: "Ahora publica el índice cuando cierres este lote." });
    },
    onSettled: () => {
      setTrainingBusyState(null);
    },
    onError: (e) => toast.error("No se pudieron promover los crops seleccionados", { description: e instanceof Error ? e.message : "Error inesperado" }),
  });

  const shelfResults = useMemo(() => {
    const root = resultsQuery.data?.result_json && typeof resultsQuery.data.result_json === "object" ? resultsQuery.data.result_json : {};
    return Array.isArray((root as Record<string, unknown>).results) ? ((root as Record<string, unknown>).results as Record<string, unknown>[]) : [];
  }, [resultsQuery.data]);

  const assistEngineUsedSnapshot = useMemo(
    () => resolveAssistEngineUsedSnapshot({
      events: (eventsQuery.data ?? []) as JobEvent[],
      resultJson: resultsQuery.data?.result_json,
    }),
    [eventsQuery.data, resultsQuery.data?.result_json],
  );

  const selectedTrainingCropKeySet = useMemo(() => new Set(selectedTrainingCropKeys), [selectedTrainingCropKeys]);

  useEffect(() => {
    const cfg = (configQuery.data ?? {}) as Record<string, unknown>;
    const shelfRecognition = ((cfg.shelf_recognition ?? {}) as Record<string, unknown>) ?? {};
    const vectorStore = ((shelfRecognition.vector_store ?? {}) as Record<string, unknown>) ?? {};
    setFaissShadowEnabledDraft(Boolean(vectorStore.faiss_shadow_enabled));
    const shadowEngines = Array.isArray(vectorStore.shadow_engines) ? vectorStore.shadow_engines.map((item) => String(item)) : [];
    setFaissShadowEngineDraft(shadowEngines.includes("faiss"));
  }, [configQuery.data]);

  useEffect(() => {
    const candidate = selectedSkuId.trim() || skuImageBrowserSkuId.trim() || cropActionSkuId.trim();
    if (candidate && !datasetSummarySkuId.trim()) {
      setDatasetSummarySkuId(candidate);
    }
  }, [cropActionSkuId, datasetSummarySkuId, selectedSkuId, skuImageBrowserSkuId]);

  useEffect(() => {
    const candidate = selectedSkuId.trim() || skuImageBrowserSkuId.trim();
    if (candidate && !hardNegativeSkuId.trim()) {
      setHardNegativeSkuId(candidate);
    }
  }, [hardNegativeSkuId, selectedSkuId, skuImageBrowserSkuId]);

  const selectedResultTrainingItems = useMemo(() => {
    return shelfResults
      .map((row, idx) => {
        const imageId = resultImageIdValue(row);
        const cropId = resultCropIdValue(row);
        const key = trainingCropKey(imageId, cropId || idx);
        if (imageId === null || !cropId || !selectedTrainingCropKeySet.has(key)) return null;
        return {
          image_id: imageId,
          crop_id: cropId,
          metadata: {
            source: "frontend_results_multi_select",
            ui_group_id: trainingGroupLabel.trim() || cropActionSkuId.trim() || "results_selection",
            ui_group_label: trainingGroupLabel.trim() || cropActionSkuId.trim() || "results_selection",
          },
        };
      })
      .filter((item): item is { image_id: number; crop_id: string; metadata: Record<string, unknown> } => Boolean(item));
  }, [cropActionSkuId, selectedTrainingCropKeySet, shelfResults, trainingGroupLabel]);

  const shelfResultEntries = useMemo(
    () =>
      shelfResults.map((row, idx) => {
        const imageId = resultImageIdValue(row);
        const cropId = resultCropIdValue(row);
        return {
          row,
          idx,
          imageId,
          cropId,
          selectKey: imageId !== null && cropId ? trainingCropKey(imageId, cropId) : null,
        };
      }),
    [shelfResults],
  );

  const filteredShelfResultEntries = useMemo(() => {
    const query = resultsSearchQuery.trim().toLowerCase();
    return shelfResultEntries.filter(({ row, selectKey }) => {
      if (resultsViewFilter === "review" && !resultBoolean(row, "review_required")) return false;
      if (resultsViewFilter === "unassigned" && resultHasFinalSku(row)) return false;
      if (resultsViewFilter === "selected" && (!selectKey || !selectedTrainingCropKeySet.has(selectKey))) return false;
      if (query) {
        const haystack = [
          resultSuggestedSkuLabel(row),
          resultFinalSkuLabel(row),
          resultCropIdValue(row),
          String(row.image_id ?? ""),
          resultTrayLabel(row),
          resultGlobalOrderLabel(row),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [resultsSearchQuery, resultsViewFilter, selectedTrainingCropKeySet, shelfResultEntries]);

  const resultsThumbHeightPx = Math.round(176 * (resultsThumbZoom / 100));
  const resultsGridMinCol = resultsThumbZoom >= 150 ? "360px" : resultsThumbZoom <= 80 ? "300px" : "320px";

  const applyResultsThumbPreset = (preset: "sm" | "md" | "lg") => {
    setResultsThumbScale(preset);
    setResultsThumbZoom(preset === "sm" ? 70 : preset === "lg" ? 160 : 100);
  };

  const toggleTrainingCropSelection = (
    entry: { imageId: number | null; cropId: string; idx: number; selectKey: string | null },
    options?: { shiftKey?: boolean; force?: boolean },
  ) => {
    if (entry.imageId === null || !entry.cropId || !entry.selectKey) return;
    const key = entry.selectKey;
    if (options?.shiftKey && lastResultSelectIndex !== null) {
      const startPos = filteredShelfResultEntries.findIndex((item) => item.idx === lastResultSelectIndex);
      const endPos = filteredShelfResultEntries.findIndex((item) => item.idx === entry.idx);
      if (startPos >= 0 && endPos >= 0) {
        const [from, to] = startPos < endPos ? [startPos, endPos] : [endPos, startPos];
        const rangeKeys = filteredShelfResultEntries
          .slice(from, to + 1)
          .map((item) => item.selectKey)
          .filter((item): item is string => Boolean(item));
        setSelectedTrainingCropKeys((prev) => Array.from(new Set([...prev, ...rangeKeys])));
        setLastResultSelectIndex(entry.idx);
        return;
      }
    }
    setSelectedTrainingCropKeys((prev) => {
      if (options?.force) return prev.includes(key) ? prev : [...prev, key];
      return prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
    });
    setLastResultSelectIndex(entry.idx);
  };

  const selectAllFilteredResults = () => {
    const keys = filteredShelfResultEntries.map((entry) => entry.selectKey).filter((key): key is string => Boolean(key));
    setSelectedTrainingCropKeys((prev) => Array.from(new Set([...prev, ...keys])));
  };

  const selectFilteredBySuggestedSku = () => {
    const sku = cropActionSkuId.trim() || resultSuggestedSkuLabel(filteredShelfResultEntries[0]?.row ?? {});
    if (!sku || sku === "-") {
      toast.message("Escribe un SKU destino o filtra crops con sugerencia clara.");
      return;
    }
    const normalized = normalizeSkuSearchToken(sku);
    const keys = shelfResultEntries
      .filter(({ row }) => {
        const suggested = normalizeSkuSearchToken(resultSuggestedSkuLabel(row));
        const finalSku = normalizeSkuSearchToken(resultFinalSkuLabel(row));
        return suggested === normalized || finalSku === normalized;
      })
      .map((entry) => entry.selectKey)
      .filter((key): key is string => Boolean(key));
    setSelectedTrainingCropKeys((prev) => Array.from(new Set([...prev, ...keys])));
    toast.success(`Seleccionados ${keys.length} crops con SKU ${sku}`);
  };

  const openCropLightboxAt = (filteredIndex: number) => {
    if (filteredIndex < 0 || filteredIndex >= filteredShelfResultEntries.length) return;
    setCropLightboxIndex(filteredIndex);
  };

  const cropLightboxEntry = cropLightboxIndex !== null ? filteredShelfResultEntries[cropLightboxIndex] ?? null : null;
  const cropLightboxUrl = useMemo(() => {
    if (!cropLightboxEntry) return null;
    const cropPreview = previewUrlOf(cropLightboxEntry.row as Record<string, unknown>);
    const cropDownload =
      cropLightboxEntry.imageId !== null && cropLightboxEntry.cropId
        ? ocrApi.getShelfExtractedCropDownloadUrl(selectedJobId, cropLightboxEntry.imageId, cropLightboxEntry.cropId)
        : "";
    return cropPreview || cropDownload || null;
  }, [cropLightboxEntry, selectedJobId]);

  useEffect(() => {
    if (tab !== "results") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        if (cropLightboxIndex !== null) {
          setCropLightboxIndex(null);
          return;
        }
        if (selectedTrainingCropKeys.length) setSelectedTrainingCropKeys([]);
      }
      if ((event.key === "a" || event.key === "A") && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        selectAllFilteredResults();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cropLightboxIndex, selectedTrainingCropKeys.length, tab]);

  const recentShelfJobs = useMemo(() => {
    const q = recentShelfJobSearch.trim().toLowerCase();
    return (recentShelfJobsQuery.data ?? [])
      .filter((row) => (row.account_name ? row.account_name === account : true))
      .filter((row) => isShelfRecentJob(row))
      .filter((row) => {
        if (!q) return true;
        const haystack = [
          row.job_id,
          row.id_pdv,
          row.subcategoria,
          row.job_module,
          row.job_type,
          row.test_mode,
          shelfRecentJobTypeLabel(row),
        ]
          .map((value) => firstNonEmptyString(value))
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 50);
  }, [account, recentShelfJobSearch, recentShelfJobsQuery.data]);

  const recentShelfJobDetailQueries = useQueries({
    queries: recentShelfJobs.slice(0, 20).map((job) => ({
      queryKey: ["recent-shelf-job-detail-card", job.job_id],
      queryFn: () => ocrApi.getShelfJob(job.job_id),
      enabled: shelfEnabled && tab === "jobs" && Boolean(job.job_id),
      staleTime: 20_000,
      retry: false,
    })),
  });

  const recentShelfJobDetailMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    recentShelfJobs.slice(0, 20).forEach((job, index) => {
      const data = recentShelfJobDetailQueries[index]?.data;
      if (data && typeof data === "object") {
        map.set(job.job_id, data as Record<string, unknown>);
      }
    });
    return map;
  }, [recentShelfJobDetailQueries, recentShelfJobs]);

  const cropActionSkuLookup = useMemo(() => {
    const query = debouncedCropActionSkuSearch.trim() || cropActionSkuId.trim();
    const localRows = skusQuery.data ?? [];
    const remoteRows = remoteCropSkuSearchQuery.data ?? [];
    const merged = Array.from(
      new Map(
        [...remoteRows, ...localRows]
          .filter((sku) => Boolean(getSkuCodeValue(sku)))
          .map((sku) => [normalizeSkuSearchToken(getSkuCodeValue(sku)), sku]),
      ).values(),
    );
    const exactMatch = query
      ? merged.find((sku) => normalizeSkuSearchToken(getSkuCodeValue(sku)) === normalizeSkuSearchToken(query)) ?? null
      : null;
    const suggestions = query
      ? merged
          .map((sku) => ({ sku, score: skuSuggestionScore(sku, query) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score || getSkuCodeValue(a.sku).localeCompare(getSkuCodeValue(b.sku)))
          .slice(0, exactMatch ? 8 : 6)
          .map((item) => item.sku)
      : [];
    return {
      query,
      exactMatch,
      suggestions,
      exactVerified: Boolean(exactMatch),
    };
  }, [cropActionSkuId, debouncedCropActionSkuSearch, remoteCropSkuSearchQuery.data, skusQuery.data]);

  const shadowIndexRows = useMemo(() => {
    return (versionsQuery.data ?? []).flatMap((row) => {
      const record = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const modelName = firstNonEmptyString(record.model_name, record.model, record.embedding_model) || "model";
      const shadowIndexes = Array.isArray(record.shadow_indexes) ? record.shadow_indexes : [];
      return shadowIndexes
        .filter((item) => item && typeof item === "object")
        .map((item) => ({ modelName, shadow: item as Record<string, unknown> }));
    });
  }, [versionsQuery.data]);

  const cropMaskingConfig = useMemo(() => {
    const cfg = (configQuery.data ?? {}) as Record<string, unknown>;
    const shelfRecognition = cfg.shelf_recognition && typeof cfg.shelf_recognition === "object"
      ? (cfg.shelf_recognition as Record<string, unknown>)
      : {};
    const cropMasking = shelfRecognition.crop_masking && typeof shelfRecognition.crop_masking === "object"
      ? (shelfRecognition.crop_masking as Record<string, unknown>)
      : {};
    return {
      enabled: cropMasking.enabled === true,
      background: firstNonEmptyString(cropMasking.background, "black"),
      onlyWhenSegmentationAvailable: cropMasking.only_when_segmentation_available !== false,
    };
  }, [configQuery.data]);

  const detectorConfigSummary = useMemo(() => {
    const activeConfigRoot = (activeConfigQuery.data ?? {}) as Record<string, unknown>;
    const activeConfig = activeConfigRoot.config && typeof activeConfigRoot.config === "object"
      ? (activeConfigRoot.config as Record<string, unknown>)
      : activeConfigRoot;
    const detectionConfig = activeConfig.detection_config && typeof activeConfig.detection_config === "object"
      ? (activeConfig.detection_config as Record<string, unknown>)
      : {};
    const roboflow = detectionConfig.roboflow && typeof detectionConfig.roboflow === "object"
      ? (detectionConfig.roboflow as Record<string, unknown>)
      : {};
    const filters = detectionConfig.filters && typeof detectionConfig.filters === "object"
      ? (detectionConfig.filters as Record<string, unknown>)
      : {};
    const primaryAreaFilter = detectionConfig.primary_area_filter && typeof detectionConfig.primary_area_filter === "object"
      ? (detectionConfig.primary_area_filter as Record<string, unknown>)
      : {};
    const allowedLabels = Array.isArray(filters.allowed_labels) ? filters.allowed_labels.map((item) => String(item)).filter(Boolean) : [];
    const ignoredLabels = Array.isArray(filters.ignored_labels) ? filters.ignored_labels.map((item) => String(item)).filter(Boolean) : [];
    return {
      mode: firstNonEmptyString(detectionConfig.mode, "roboflow_api"),
      localModelPath: firstNonEmptyString(detectionConfig.local_model_path),
      minConfidence: filters.min_confidence,
      allowedLabels,
      ignoredLabels,
      fallbackToLocalOnError: Boolean(detectionConfig.fallback_to_local_on_error),
      roboflowWorkspace: firstNonEmptyString(roboflow.workspace),
      roboflowProject: firstNonEmptyString(roboflow.project),
      roboflowVersion: firstNonEmptyString(roboflow.version),
      primaryAreaFilterEnabled: Boolean(primaryAreaFilter.enabled),
      primaryAreaDiscardPct: firstNonEmptyString(primaryAreaFilter.discard_if_smaller_pct),
      primaryAreaMinDetections: firstNonEmptyString(primaryAreaFilter.min_detections),
    };
  }, [activeConfigQuery.data]);

  const selectedArtifactsData = useMemo(() => {
    return (artifactsQuery.data ?? null) as Record<string, unknown> | null;
  }, [artifactsQuery.data]);

  const selectedArtifactsResults = useMemo(() => {
    if (!selectedArtifactsData) return [] as Record<string, unknown>[];
    if (Array.isArray(selectedArtifactsData.results)) return selectedArtifactsData.results as Record<string, unknown>[];
    if (Array.isArray(selectedArtifactsData.productos)) return selectedArtifactsData.productos as Record<string, unknown>[];
    return [] as Record<string, unknown>[];
  }, [selectedArtifactsData]);

  const shelfJobImages = useMemo(() => {
    return (jobQuery.data?.images ?? []).filter((img) => typeof img.id === "number" && img.id >= 0);
  }, [jobQuery.data?.images]);

  const shelfJobStatus = String(jobQuery.data?.status ?? "").toLowerCase();
  const shelfJobFailed = shelfJobStatus === "failed";
  const shelfHasStructuredResults = shelfResults.length > 0 || Boolean(resultsQuery.data?.result_json);
  const selectedArtifactsImageStillExists = useMemo(() => {
    if (typeof selectedArtifactsImageId !== "number") return false;
    return shelfJobImages.some((image) => image.id === selectedArtifactsImageId);
  }, [selectedArtifactsImageId, shelfJobImages]);
  const shelfArtifactsBlocked = shelfJobFailed && (!selectedArtifactsImageStillExists || (!artifactsQuery.data && !shelfHasStructuredResults));

  const shelfUiContract = useMemo(
    () => extractUiContract(jobQuery.data, resultsQuery.data, selectedArtifactsData, jobExtractedCropsQuery.data),
    [jobQuery.data, resultsQuery.data, selectedArtifactsData, jobExtractedCropsQuery.data],
  );

  const processingMode = useMemo(() => {
    return firstNonEmptyString(
      shelfUiContract?.processing_mode,
      (resultsQuery.data?.result_json as Record<string, unknown> | undefined)?.processing_mode,
      (selectedArtifactsData as Record<string, unknown> | null)?.processing_mode,
      jobPayload.processing_mode,
    ) || "recognition";
  }, [jobPayload.processing_mode, resultsQuery.data?.result_json, selectedArtifactsData, shelfUiContract]);

  const rerunTraceability = useMemo(() => {
    const resultRoot = (resultsQuery.data?.result_json && typeof resultsQuery.data.result_json === "object")
      ? (resultsQuery.data.result_json as Record<string, unknown>)
      : {};
    const vectorIndexSnapshot =
      (jobQuery.data && typeof (jobQuery.data as Record<string, unknown>).vector_index_snapshot === "object"
        ? ((jobQuery.data as Record<string, unknown>).vector_index_snapshot as Record<string, unknown>)
        : null)
      ?? (resultRoot.vector_index_snapshot && typeof resultRoot.vector_index_snapshot === "object"
        ? (resultRoot.vector_index_snapshot as Record<string, unknown>)
        : null);
    const datasetPublicationContext =
      (jobQuery.data && typeof (jobQuery.data as Record<string, unknown>).dataset_publication_context === "object"
        ? ((jobQuery.data as Record<string, unknown>).dataset_publication_context as Record<string, unknown>)
        : null)
      ?? (resultRoot.dataset_publication_context && typeof resultRoot.dataset_publication_context === "object"
        ? (resultRoot.dataset_publication_context as Record<string, unknown>)
        : null);
    return {
      vectorIndexSnapshot,
      datasetPublicationContext,
      usedNewerThanSourceJob: vectorIndexSnapshot?.used_newer_than_source_job === true,
      rebuildHappenedBeforeJob: datasetPublicationContext?.rebuild_happened_before_job === true,
      latestRebuildAt: firstNonEmptyString(datasetPublicationContext?.latest_rebuild_at),
      latestRebuildOperationId: firstNonEmptyString(datasetPublicationContext?.latest_rebuild_operation_id),
      snapshotEngine: firstNonEmptyString(vectorIndexSnapshot?.engine),
      snapshotCreatedAt: firstNonEmptyString(vectorIndexSnapshot?.created_at),
      snapshotShadowCount: Array.isArray(vectorIndexSnapshot?.shadow_indexes) ? vectorIndexSnapshot.shadow_indexes.length : 0,
    };
  }, [jobQuery.data, resultsQuery.data?.result_json]);

  const trayRows = useMemo(() => {
    const imageArtifacts = selectedArtifactsData?.image_artifacts;
    if (imageArtifacts && typeof imageArtifacts === "object" && Array.isArray((imageArtifacts as Record<string, unknown>).tray_rows)) {
      return (imageArtifacts as Record<string, unknown>).tray_rows as Record<string, unknown>[];
    }
    return [] as Record<string, unknown>[];
  }, [selectedArtifactsData]);

  const heroPreview = useMemo(() => {
    if (!selectedArtifactsData) return null;
    return previewUrlOf(((selectedArtifactsData.annotated_image as Record<string, unknown> | undefined) ?? selectedArtifactsData) as Record<string, unknown>)
      || previewUrlOf(((selectedArtifactsData.original_image as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>);
  }, [selectedArtifactsData]);

  const artifactHeroSummary = useMemo(() => {
    const rows = selectedArtifactsResults.length ? selectedArtifactsResults : shelfResults;
    const fallbackCount = rows.filter((row) => resultEmbeddingDiagnostics(row)?.models?.fallback_used).length;
    const reviewCount = rows.filter((row) => resultBoolean(row, "review_required")).length;
    const trayCountFromSummary = selectedArtifactsData?.summary && typeof selectedArtifactsData.summary === "object"
      ? (selectedArtifactsData.summary as Record<string, unknown>).tray_count
      : null;
    const trayCount = typeof trayCountFromSummary === "number" ? trayCountFromSummary : trayRows.length;
    const imageSummary = selectedArtifactsData?.summary && typeof selectedArtifactsData.summary === "object"
      ? parseHardNegativeSummary(selectedArtifactsData.summary as Record<string, unknown>)
      : { total: 0, pairs: [] };
    const cropsWithHardNegativePenalty = rows.filter((row) => cropHasHardNegativePenalty(row)).length;
    return {
      resultsCount: rows.length,
      fallbackCount,
      reviewCount,
      trayCount,
      hardNegativeSummary: imageSummary,
      cropsWithHardNegativePenalty,
    };
  }, [selectedArtifactsData, selectedArtifactsResults, shelfResults, trayRows.length]);

  const jobHardNegativeSummary = useMemo(() => {
    const root = resultsQuery.data?.result_json && typeof resultsQuery.data.result_json === "object"
      ? (resultsQuery.data.result_json as Record<string, unknown>)
      : null;
    const summary = root?.summary && typeof root.summary === "object"
      ? (root.summary as Record<string, unknown>)
      : null;
    return parseHardNegativeSummary(summary);
  }, [resultsQuery.data?.result_json]);

  const shelfConfigInfo = useMemo(() => {
    const cfg = configQuery.data ?? {};
    const models = Array.isArray((cfg as Record<string, unknown>).embedding_models) ? ((cfg as Record<string, unknown>).embedding_models as unknown[]) : [];
    const vectorStore = (cfg as Record<string, unknown>).vector_store;
    return {
      models: models.map((x) => String(x)),
      provider: asString((cfg as Record<string, unknown>).embedding_provider || (cfg as Record<string, unknown>).provider || "-"),
      device: asString((cfg as Record<string, unknown>).embedding_device || "-"),
      vectorStore: vectorStore && typeof vectorStore === "object" ? (vectorStore as Record<string, unknown>) : null,
    };
  }, [configQuery.data]);

  const extractedCropGroups = useMemo(() => {
    return Array.isArray(jobExtractedCropsQuery.data?.images) ? jobExtractedCropsQuery.data?.images ?? [] : [];
  }, [jobExtractedCropsQuery.data?.images]);

  const selectedTrainingCropsCount = selectedTrainingCropKeys.length;
  const uiPrimaryView = firstNonEmptyString(shelfUiContract?.primary_view, processingMode === "crop_extraction" ? "shelf_crop_training" : "shelf_recognition_review");
  const uiDisplayFamily = firstNonEmptyString(shelfUiContract?.display_family, "shelf");
  const uiGroupingLabel = firstNonEmptyString(
    (shelfUiContract?.grouping && typeof shelfUiContract.grouping === "object" ? (shelfUiContract.grouping as Record<string, unknown>).label : undefined),
    "percha",
  );
  const uiPanels = shelfUiContract?.panels && typeof shelfUiContract.panels === "object" ? (shelfUiContract.panels as Record<string, unknown>) : null;
  const uiActions = shelfUiContract?.actions && typeof shelfUiContract.actions === "object" ? (shelfUiContract.actions as Record<string, unknown>) : null;
  const showTrainingActions = uiPanels ? uiPanels.show_crop_training_actions !== false : processingMode === "crop_extraction";
  const showResultsGrid = uiPanels ? uiPanels.show_shelf_results_grid !== false : processingMode !== "crop_extraction";

  useEffect(() => {
    if (!configQuery.data) return;
    const next = extractShelfThresholds(configQuery.data);
    setThresholdForm({
      high_min: String(next.high_min),
      high_delta: String(next.high_delta),
      medium_min: String(next.medium_min),
      medium_delta: String(next.medium_delta),
      low_min: String(next.low_min),
    });
  }, [configQuery.data]);

  useEffect(() => {
    setSkuDeletePreview(null);
  }, [
    skuDeleteTargetId,
    skuDeleteDeleteSku,
    skuDeleteDeleteImages,
    skuDeleteDeleteAssets,
    skuDeleteDeleteFiles,
    skuDeleteDeactivateEmbeddings,
    skuDeleteRebuildIndex,
  ]);

  const filteredSkusForPicker = useMemo(() => {
    const rows = skusQuery.data ?? [];
    const q = assetSkuSearch.trim().toLowerCase();
    if (!q) return rows.slice(0, 24);
    return rows
      .filter((sku) => {
        const text = `${getSkuCodeValue(sku)} ${getSkuNameValue(sku)} ${getSkuBrandValue(sku)} ${getSkuFamilyValue(sku)}`.toLowerCase();
        return text.includes(q);
      })
      .slice(0, 24);
  }, [assetSkuSearch, skusQuery.data]);

  const filteredSkusCatalog = useMemo(() => {
    const rows = skusQuery.data ?? [];
    const q = skuCatalogSearch.trim().toLowerCase();
    return rows.filter((sku) => {
      const matchesSearch = !q || [
        getSkuCodeValue(sku),
        getSkuNameValue(sku),
        getSkuBrandValue(sku),
        getSkuFamilyValue(sku),
        getSkuSubcategoryValue(sku),
        getSkuSegmentValue(sku),
        getSkuManufacturerValue(sku),
        getSkuGroupValue(sku),
        firstNonEmptyString((sku as Record<string, unknown>).size_text, (sku as Record<string, unknown>).tamano),
      ].join(" ").toLowerCase().includes(q);
      const matchesCategory = !skuCatalogCategoryFilter || getSkuFamilyValue(sku) === skuCatalogCategoryFilter;
      const matchesSubcategory = !skuCatalogSubcategoryFilter || getSkuSubcategoryValue(sku) === skuCatalogSubcategoryFilter;
      const matchesSegment = !skuCatalogSegmentFilter || getSkuSegmentValue(sku) === skuCatalogSegmentFilter;
      const matchesManufacturer = !skuCatalogManufacturerFilter || getSkuManufacturerValue(sku) === skuCatalogManufacturerFilter;
      const matchesBrand = !skuCatalogBrandFilter || getSkuBrandValue(sku) === skuCatalogBrandFilter;
      const matchesGroup = !skuCatalogGroupFilter || getSkuGroupValue(sku) === skuCatalogGroupFilter;
      const activeValue = !((sku as Record<string, unknown>).is_active === false || (sku as Record<string, unknown>).is_active === 0);
      const statusValue = getSkuStatusValue(sku).toLowerCase();
      const matchesStatus = skuCatalogStatusFilter === "all"
        ? true
        : skuCatalogStatusFilter === "activo"
          ? activeValue || statusValue.includes("activo")
          : !activeValue || statusValue.includes("inactivo");
      const matchesActive = !skuCatalogOnlyActive || activeValue;
      return matchesSearch && matchesCategory && matchesSubcategory && matchesSegment && matchesManufacturer && matchesBrand && matchesGroup && matchesStatus && matchesActive;
    });
  }, [
    skuCatalogBrandFilter,
    skuCatalogCategoryFilter,
    skuCatalogGroupFilter,
    skuCatalogManufacturerFilter,
    skuCatalogOnlyActive,
    skuCatalogSearch,
    skuCatalogSegmentFilter,
    skuCatalogStatusFilter,
    skuCatalogSubcategoryFilter,
    skusQuery.data,
  ]);

  const skuCatalogOptions = useMemo(() => {
    const rows = skusQuery.data ?? [];
    const collect = (getter: (sku: ShelfSku) => string) => Array.from(new Set(rows.map(getter).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    // Usar el endpoint dedicado para categorías (siempre tiene todas)
    const categories = skuCategoriesQuery.data
      ? skuCategoriesQuery.data.map((c) => c.categoria).sort((a, b) => a.localeCompare(b))
      : collect(getSkuFamilyValue);

    return {
      categories,
      subcategories: collect(getSkuSubcategoryValue),
      segments: collect(getSkuSegmentValue),
      manufacturers: collect(getSkuManufacturerValue),
      brands: collect(getSkuBrandValue),
      groups: collect(getSkuGroupValue),
    };
  }, [skusQuery.data, skuCategoriesQuery.data]);

  const selectedSkuCatalogDetail = useMemo(() => {
    const code = skuCatalogDetailCode.trim();
    if (!code) return null;
    return (skusQuery.data ?? []).find((sku) => getSkuCodeValue(sku) === code) ?? null;
  }, [skuCatalogDetailCode, skusQuery.data]);

  const skuCatalogTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredSkusCatalog.length / skuCatalogPageSize));
  }, [filteredSkusCatalog.length, skuCatalogPageSize]);

  const paginatedSkusCatalog = useMemo(() => {
    const start = (skuCatalogPage - 1) * skuCatalogPageSize;
    return filteredSkusCatalog.slice(start, start + skuCatalogPageSize);
  }, [filteredSkusCatalog, skuCatalogPage, skuCatalogPageSize]);

  const datasetSkuCoverageMapBase = useMemo(() => {
    const map = new Map<string, { images: number; indexable: number }>();
    const register = (rawKey: unknown, images: number, indexable: number) => {
      const key = normalizeSkuCoverageLookupKey(rawKey);
      if (!key) return;
      const entry = { images, indexable };
      map.set(key, entry);
      map.set(key.toUpperCase(), entry);
      map.set(key.toLowerCase(), entry);
    };
    for (const row of datasetSummaryBySkuRows(accountDatasetCoverageQuery.data)) {
      const counts = datasetSummaryRowCounts(row);
      for (const alias of [row.sku_id, row.sku_code, row.cod_lucky, row.sku_code_normalized, row.id]) {
        register(alias, counts.images, counts.indexable);
      }
    }
    return map;
  }, [accountDatasetCoverageQuery.data]);

  const filteredCatalogSkus = useMemo(() => {
    return filteredSkusCatalog.filter((sku) => {
      const code = getSkuCodeValue(sku);
      const coverage = code ? datasetSkuCoverageMapBase.get(code) ?? datasetSkuCoverageMapBase.get(code.toUpperCase()) : undefined;
      const imageCount = coverage?.images ?? 0;
      const indexableCount = coverage?.indexable ?? 0;
      if (datasetCoverageFilter === "with_images" && imageCount <= 0) return false;
      if (datasetCoverageFilter === "without_images" && imageCount > 0) return false;
      if (datasetCoverageFilter === "indexable" && indexableCount <= 0) return false;
      return true;
    });
  }, [datasetCoverageFilter, datasetSkuCoverageMapBase, filteredSkusCatalog]);

  const catalogTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredCatalogSkus.length / skuCatalogPageSize));
  }, [filteredCatalogSkus.length, skuCatalogPageSize]);

  const paginatedCatalogSkus = useMemo(() => {
    const start = (skuCatalogPage - 1) * skuCatalogPageSize;
    return filteredCatalogSkus.slice(start, start + skuCatalogPageSize);
  }, [filteredCatalogSkus, skuCatalogPage, skuCatalogPageSize]);

  const filteredDatasetSkus = filteredCatalogSkus;

  const datasetCatalogTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredDatasetSkus.length / skuCatalogPageSize));
  }, [filteredDatasetSkus.length, skuCatalogPageSize]);

  const paginatedDatasetSkus = useMemo(() => {
    const start = (skuCatalogPage - 1) * skuCatalogPageSize;
    return filteredDatasetSkus.slice(start, start + skuCatalogPageSize);
  }, [filteredDatasetSkus, skuCatalogPage, skuCatalogPageSize]);

  const datasetPageSummaryQueries = useQueries({
    queries: paginatedDatasetSkus.map((sku) => {
      const code = getSkuCodeValue(sku);
      return {
        queryKey: ["shelf-dataset-summary-sku", account, code],
        queryFn: () => ocrApi.getShelfDatasetSummary(account, code),
        enabled: shelfEnabled && tab === "skus" && ["catalogo", "cargas", "dataset", "pruebas"].includes(skuWorkspaceTab) && Boolean(code.trim()),
        staleTime: 45_000,
      };
    }),
  });

  const datasetSkuCoverageMap = useMemo(() => {
    const map = new Map(datasetSkuCoverageMapBase);
    const register = (rawKey: unknown, images: number, indexable: number) => {
      const key = normalizeSkuCoverageLookupKey(rawKey);
      if (!key) return;
      const entry = { images, indexable };
      map.set(key, entry);
      map.set(key.toUpperCase(), entry);
      map.set(key.toLowerCase(), entry);
    };
    paginatedDatasetSkus.forEach((sku, idx) => {
      const summary = datasetPageSummaryQueries[idx]?.data;
      const totals = datasetSummaryTotalsFromResponse(summary);
      const counts = {
        images: totals.total_images,
        indexable: totals.indexable_images,
      };
      if (!counts.images && !counts.indexable) return;
      for (const alias of skuCoverageAliasKeys(sku)) {
        register(alias, counts.images, counts.indexable);
      }
      const summarySkuId = firstNonEmptyString(summary?.sku_id);
      if (summarySkuId) register(summarySkuId, counts.images, counts.indexable);
    });
    for (const sku of skusQuery.data ?? []) {
      const aliases = skuCoverageAliasKeys(sku);
      let entry: { images: number; indexable: number } | undefined;
      for (const alias of aliases) {
        entry = map.get(alias) ?? map.get(alias.toUpperCase()) ?? map.get(alias.toLowerCase());
        if (entry) break;
      }
      if (entry) {
        for (const alias of aliases) register(alias, entry.images, entry.indexable);
      }
    }
    return map;
  }, [datasetPageSummaryQueries, datasetSkuCoverageMapBase, paginatedDatasetSkus, skusQuery.data]);

  const datasetAccountTotals = useMemo(() => {
    const totals = datasetSummaryTotalsFromResponse(accountDatasetCoverageQuery.data);
    const skusWithImages = Array.from(datasetSkuCoverageMap.values()).filter((row) => row.images > 0).length;
    const skusWithoutImages = Math.max(0, (skusQuery.data ?? []).length - skusWithImages);
    const skuRows = datasetSummaryBySkuRows(accountDatasetCoverageQuery.data);
    return {
      images: totals.total_images,
      indexable: totals.indexable_images,
      skus: skuRows.length || datasetSkuCoverageMap.size,
      skusWithImages,
      skusWithoutImages,
    };
  }, [accountDatasetCoverageQuery.data, datasetSkuCoverageMap, skusQuery.data]);

  const filteredDatasetImages = useMemo(() => {
    return (skuImagesQuery.data ?? []).filter((image) => {
      const row = image as Record<string, unknown>;
      const role = firstNonEmptyString(row.dataset_role) || "reference_active";
      if (datasetImageRoleFilter !== "all" && role !== datasetImageRoleFilter) return false;
      const indexableMeta = imageIndexableMeta(row);
      if (datasetImageIndexableFilter !== "all" && indexableMeta.bucket !== datasetImageIndexableFilter) return false;
      return true;
    });
  }, [datasetImageIndexableFilter, datasetImageRoleFilter, skuImagesQuery.data]);

  const selectDatasetSku = (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;
    setSelectedSkuId(normalized);
    setSkuImageBrowserSkuId(normalized);
    setDatasetSummarySkuId(normalized);
    setHardNegativeSkuId(normalized);
    setTestSkuId(normalized);
  };

  const selectCatalogSku = (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;
    selectDatasetSku(normalized);
    setSkuCatalogDetailCode(normalized);
  };

  const loadSkuToForm = (sku: ShelfSku) => {
    const code = getSkuCodeValue(sku);
    const row = sku as Record<string, unknown>;
    setSkuForm({
      sku_code: code,
      sku_name: getSkuNameValue(sku),
      brand: getSkuBrandValue(sku),
      family: getSkuFamilyValue(sku),
      variant: firstNonEmptyString(row.variant, row.formato),
      size_text: firstNonEmptyString(row.size_text, row.tamano),
      barcode: firstNonEmptyString(row.barcode, row.ean),
      estado: getSkuStatusValue(sku),
      subcategoria: getSkuSubcategoryValue(sku),
      segmento: getSkuSegmentValue(sku),
      forma: firstNonEmptyString(row.forma),
      fabricante: getSkuManufacturerValue(sku),
      fragancia_variante: firstNonEmptyString(row.fragancia_variante),
      pais: firstNonEmptyString(row.pais),
      grupo: getSkuGroupValue(sku),
      segmento_funcional: firstNonEmptyString(row.segmento_funcional),
      category_cuenta: firstNonEmptyString(row.category_cuenta),
      x_ancho: firstNonEmptyString(row.x_ancho),
      y_alto: firstNonEmptyString(row.y_alto),
      z_profundidad: firstNonEmptyString(row.z_profundidad),
      metadata_json: JSON.stringify(getSkuMetadataValue(sku) ?? {}, null, 2),
    });
  };

  const activeSkuDeleteId = skuDeleteTargetId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
  const activeSkuDeleteInfo = useMemo(() => {
    if (!activeSkuDeleteId) return null;
    return (skusQuery.data ?? []).find((sku) => getSkuCodeValue(sku) === activeSkuDeleteId) ?? null;
  }, [activeSkuDeleteId, skusQuery.data]);

  const activeSkuWorkspaceId = selectedSkuId.trim() || skuImageBrowserSkuId.trim() || testSkuId.trim();
  const activeSkuWorkspaceInfo = useMemo(() => {
    if (!activeSkuWorkspaceId) return null;
    return (skusQuery.data ?? []).find((sku) => getSkuCodeValue(sku) === activeSkuWorkspaceId) ?? null;
  }, [activeSkuWorkspaceId, skusQuery.data]);

  const currentSkuImageIds = useMemo(() => {
    return (skuImagesQuery.data ?? [])
      .map((image) => ((image.image_id ?? image.id ?? null) as number | string | null))
      .filter((value): value is number | string => value !== null);
  }, [skuImagesQuery.data]);

  const currentSkuImageSummary = useMemo(() => {
    const rows = skuImagesQuery.data ?? [];
    const total = rows.length;
    const active = rows.filter((image) => image.is_active !== false && image.is_active !== 0).length;
    return {
      total,
      active,
      inactive: Math.max(0, total - active),
    };
  }, [skuImagesQuery.data]);

  const activeSkuEmbeddingSummary = useMemo(() => {
    const rows = (skuImagesQuery.data ?? []).map((image) => image as Record<string, unknown>);
    if (!rows.length) return { available: false, total: 0, complete: 0, partial: 0, pending: 0, fallback: 0, failed: 0, notIndexable: 0, unknown: 0 };
    const hasBackendContract = rows.some((row) => imageHasExplicitEmbeddingEvidence(row));
    if (!hasBackendContract) {
      return { available: false, total: rows.length, complete: 0, partial: 0, pending: 0, fallback: 0, failed: 0, notIndexable: 0, unknown: 0 };
    }
    const counts = { complete: 0, partial: 0, pending: 0, fallback: 0, failed: 0, notIndexable: 0, unknown: 0 };
    for (const row of rows) {
      const status = firstNonEmptyString(row.embedding_status, row.embedding_state)?.toLowerCase() || "unknown";
      if (status === "complete") counts.complete += 1;
      else if (status === "partial") counts.partial += 1;
      else if (status === "pending") counts.pending += 1;
      else if (status === "fallback") counts.fallback += 1;
      else if (status === "failed") counts.failed += 1;
      else if (status === "not_indexable") counts.notIndexable += 1;
      else counts.unknown += 1;
    }
    return { available: true, total: rows.length, ...counts };
  }, [skuImagesQuery.data]);

  const resolveSkuDatasetCoverageFromMap = (code: string) => {
    for (const alias of [code, code.toUpperCase(), code.toLowerCase()]) {
      const hit = datasetSkuCoverageMap.get(alias);
      if (hit) return hit;
    }
    return { images: 0, indexable: 0 };
  };

  const activeSkuDatasetSummary = useMemo(() => {
    if (!activeSkuWorkspaceId) return null;
    if (datasetSummarySkuId.trim() === activeSkuWorkspaceId && datasetSummaryQuery.data) {
      return datasetSummaryTotalsFromResponse(datasetSummaryQuery.data);
    }
    const pageIdx = paginatedDatasetSkus.findIndex((sku) => getSkuCodeValue(sku) === activeSkuWorkspaceId);
    if (pageIdx >= 0 && datasetPageSummaryQueries[pageIdx]?.data) {
      return datasetSummaryTotalsFromResponse(datasetPageSummaryQueries[pageIdx].data);
    }
    const coverage = resolveSkuDatasetCoverageFromMap(activeSkuWorkspaceId);
    if (coverage.images > 0 || coverage.indexable > 0) {
      return {
        total_images: coverage.images,
        indexable_images: coverage.indexable,
        non_indexable_images: Math.max(0, coverage.images - coverage.indexable),
      };
    }
    return null;
  }, [
    activeSkuWorkspaceId,
    datasetPageSummaryQueries,
    datasetSkuCoverageMap,
    datasetSummaryQuery.data,
    datasetSummarySkuId,
    paginatedDatasetSkus,
  ]);

  const activeSkuDatasetSummaryLoading = Boolean(
    activeSkuWorkspaceId
    && !activeSkuDatasetSummary
    && (
      (datasetSummarySkuId.trim() === activeSkuWorkspaceId && datasetSummaryQuery.isFetching)
      || datasetPageSummaryQueries.some((query, idx) => getSkuCodeValue(paginatedDatasetSkus[idx] ?? {}) === activeSkuWorkspaceId && query.isFetching)
    ),
  );

  const resolveSkuDatasetCoverage = (sku: ShelfSku) => {
    for (const alias of skuCoverageAliasKeys(sku)) {
      const hit = datasetSkuCoverageMap.get(alias) ?? datasetSkuCoverageMap.get(alias.toUpperCase()) ?? datasetSkuCoverageMap.get(alias.toLowerCase());
      if (hit && (hit.images > 0 || hit.indexable > 0)) return hit;
    }
    const code = getSkuCodeValue(sku);
    if (code === activeSkuWorkspaceId && activeSkuDatasetSummary) {
      return { images: activeSkuDatasetSummary.total_images, indexable: activeSkuDatasetSummary.indexable_images };
    }
    return { images: 0, indexable: 0 };
  };

  const recentTrainingDiagnostics = useMemo(() => {
    return recentSkuImageResponses
      .map((response) => ({
        imageId: response.image_id ?? response.id ?? "-",
        diagnostics: normalizeDiagnosticsPayload(response.diagnostics),
        embeddingModels: response.embedding_models ?? [],
      }))
      .filter((item) => item.diagnostics);
  }, [recentSkuImageResponses]);

  const recomputeSummary = useMemo(() => {
    const items = lastEmbeddingsRecompute?.items ?? [];
    const processed = typeof lastEmbeddingsRecompute?.processed_images === "number"
      ? lastEmbeddingsRecompute.processed_images
      : items.length;
    const failed = typeof lastEmbeddingsRecompute?.failed_images === "number"
      ? lastEmbeddingsRecompute.failed_images
      : items.filter((item) => item.status === "failed").length;
    const fallback = items.filter((item) => {
      const diag = normalizeDiagnosticsPayload(item.diagnostics);
      return diag?.outcome_status === "success_with_fallback" || Boolean(diag?.models?.fallback_used);
    }).length;
    const ok = Math.max(0, processed - failed - fallback);
    return {
      processed,
      failed,
      fallback,
      ok,
      successRate: processed > 0 ? ((processed - failed) / processed) * 100 : null,
      fallbackRate: processed > 0 ? (fallback / processed) * 100 : null,
      failedRate: processed > 0 ? (failed / processed) * 100 : null,
    };
  }, [lastEmbeddingsRecompute]);

  const shelfResultFallbackCount = useMemo(() => {
    return shelfResults.filter((row) => Boolean(resultEmbeddingDiagnostics(row)?.models?.fallback_used)).length;
  }, [shelfResults]);

  const vectorIndexHealth = useMemo(() => {
    const rows = versionsQuery.data ?? [];
    const pick = (model: string) => rows.find((item) => versionModelName(item) === model) ?? null;
    const dinov2 = pick("dinov2");
    const siglip = pick("siglip");
    const statusOf = (row: Record<string, unknown> | null) => firstNonEmptyString(row?.status, row?.state) || "-";
    return {
      dinov2: {
        row: dinov2,
        sampleDim: versionSampleDim(dinov2),
        dimsLabel: versionDimsLabel(dinov2),
        mixedDims: versionHasMixedDims(dinov2),
        status: statusOf(dinov2),
      },
      siglip: {
        row: siglip,
        sampleDim: versionSampleDim(siglip),
        dimsLabel: versionDimsLabel(siglip),
        mixedDims: versionHasMixedDims(siglip),
        status: statusOf(siglip),
      },
    };
  }, [versionsQuery.data]);

  useEffect(() => {
    setSkuCatalogPage(1);
  }, [
    skuCatalogBrandFilter,
    skuCatalogCategoryFilter,
    skuCatalogGroupFilter,
    skuCatalogManufacturerFilter,
    skuCatalogOnlyActive,
    skuCatalogPageSize,
    skuCatalogSearch,
    skuCatalogSegmentFilter,
    skuCatalogStatusFilter,
    skuCatalogSubcategoryFilter,
  ]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedCropActionSkuSearch(cropActionSkuSearch.trim());
    }, 450);
    return () => window.clearTimeout(handle);
  }, [cropActionSkuSearch]);

  useEffect(() => {
    if (skuCatalogPage > skuCatalogTotalPages) {
      setSkuCatalogPage(skuCatalogTotalPages);
    }
  }, [skuCatalogPage, skuCatalogTotalPages]);

  useEffect(() => {
    if (skuWorkspaceTab !== "dataset") return;
    if (skuCatalogPage > datasetCatalogTotalPages) {
      setSkuCatalogPage(datasetCatalogTotalPages);
    }
  }, [datasetCatalogTotalPages, skuCatalogPage, skuWorkspaceTab]);

  useEffect(() => {
    if (!shelfJobImages.length) {
      if (typeof selectedArtifactsImageId === "number") setSelectedArtifactsImageId(null);
      return;
    }
    if (typeof selectedArtifactsImageId !== "number" || !shelfJobImages.some((image) => image.id === selectedArtifactsImageId)) {
      setSelectedArtifactsImageId(shelfJobImages[0]?.id ?? null);
    }
  }, [selectedArtifactsImageId, shelfJobImages]);

  useEffect(() => {
    if (shelfArtifactsBlocked) {
      setSelectedCropDetail(null);
    }
  }, [shelfArtifactsBlocked]);

  const filteredReviewSkus = useMemo(() => {
    const rows = skusQuery.data ?? [];
    const q = reviewSkuSearch.trim().toLowerCase();
    if (!q) return rows.slice(0, 18);
    return rows
      .filter((sku) => {
        const text = `${getSkuCodeValue(sku)} ${getSkuNameValue(sku)} ${getSkuBrandValue(sku)} ${getSkuFamilyValue(sku)}`.toLowerCase();
        return text.includes(q);
      })
      .slice(0, 18);
  }, [reviewSkuSearch, skusQuery.data]);

  const filteredReviewItems = useMemo(() => {
    const rows = reviewQueueQuery.data ?? [];
    const q = reviewSearch.trim().toLowerCase();
    return rows.filter((item) => {
      const state = String(item.confidence_state ?? "").toLowerCase();
      const matchesState = reviewStateFilter === "all" || state === reviewStateFilter.toLowerCase();
      const text = `${item.job_id ?? ""} ${item.predicted_sku_name ?? ""} ${item.predicted_sku_id ?? ""} ${item.reason ?? ""}`.toLowerCase();
      const matchesText = !q || text.includes(q);
      return matchesState && matchesText;
    });
  }, [reviewQueueQuery.data, reviewSearch, reviewStateFilter]);

  const assetsSummary = useMemo(() => {
    const rows = assetsQuery.data ?? [];
    return {
      total: rows.length,
      active: rows.filter((asset) => asset.is_active !== false && asset.is_active !== 0).length,
      withSku: rows.filter((asset) => Boolean(firstNonEmptyString(asset.sku_id))).length,
    };
  }, [assetsQuery.data]);

  const selectedReviewItem = useMemo(() => {
    if (!selectedReviewItemId) return null;
    return (reviewQueueQuery.data ?? []).find((item) => String(item.item_id ?? item.id ?? "") === selectedReviewItemId) ?? null;
  }, [reviewQueueQuery.data, selectedReviewItemId]);

  useEffect(() => {
    if (!selectedReviewItemId) return;
    const stillVisible = filteredReviewItems.some((item) => String(item.item_id ?? item.id ?? "") === selectedReviewItemId);
    if (!stillVisible) setSelectedReviewItemId("");
  }, [filteredReviewItems, selectedReviewItemId]);

  const reviewQueueSummary = useMemo(() => {
    const rows = reviewQueueQuery.data ?? [];
    const counts = { total: rows.length, low: 0, medium: 0, unknown: 0, high: 0, other: 0 };
    for (const item of rows) {
      const state = String(item.confidence_state ?? "").toLowerCase();
      if (state === "low_confidence") counts.low += 1;
      else if (state === "medium_confidence") counts.medium += 1;
      else if (state === "unknown_sku") counts.unknown += 1;
      else if (state === "high_confidence") counts.high += 1;
      else counts.other += 1;
    }
    return counts;
  }, [reviewQueueQuery.data]);

  function onBulkFilePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result ?? "");
        if (name.endsWith(".json")) {
          const rows = parseBulkSkusJson(content);
          setBulkPreview(rows);
          setBulkJson(JSON.stringify(rows, null, 2));
          toast.success("JSON cargado", { description: `Rows: ${rows.length}` });
          return;
        }
        if (name.endsWith(".csv")) {
          const rows = parseSimpleCsv(content);
          setBulkPreview(rows);
          setBulkJson(JSON.stringify(rows, null, 2));
          toast.success("CSV cargado", { description: `Rows: ${rows.length}` });
          return;
        }
        if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          toast.message("XLSX detectado", { description: "Para XLSX aqui aun no hay parser local. Exporta a CSV o usa JSON." });
          return;
        }
        toast.error("Formato no soportado", { description: "Usa .json o .csv en esta pantalla." });
      } catch (error) {
        toast.error("No se pudo leer archivo", { description: error instanceof Error ? error.message : "Error inesperado" });
      }
    };
    reader.readAsText(file);
  }

  if (!shelfEnabled) {
    return (
      <Card className="border-amber-300/30 bg-amber-500/10">
        <CardHeader><CardTitle>Modulo Shelf deshabilitado</CardTitle></CardHeader>
        <CardContent className="text-sm text-amber-100">
          Activa `NEXT_PUBLIC_ENABLE_SHELF_MODULE=true` para mostrar esta vista.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {trainingBusyState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-300/30 bg-slate-950/95 p-5 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="mt-1 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300" />
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-semibold text-slate-100">
                    {trainingBusyState.mode === "batch" ? "Entrenando selección de crops" : "Entrenando crop individual"}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">{trainingBusyState.message}</p>
                </div>
                <div className="grid gap-2 text-sm text-slate-200 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">SKU destino</p>
                    <p className="mt-1 font-mono">{trainingBusyState.skuId || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Crops involucrados</p>
                    <p className="mt-1">{trainingBusyState.cropCount}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                  Puedes esperar aquí. El frontend se actualizará solo cuando backend termine de asociar, generar embeddings y refrescar resultados.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="border-violet-300/25 bg-violet-500/10">
        <CardHeader><CardTitle>Shelf Recognition (aislado de promociones)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-slate-400">Embedding models</p>
            <p>{shelfConfigInfo.models.length ? shelfConfigInfo.models.join(", ") : "-"}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-slate-400">Provider / Device</p>
            <p>{shelfConfigInfo.provider} / {shelfConfigInfo.device || "-"}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-slate-400">Vector index</p>
            <p>{shelfConfigInfo.vectorStore ? JSON.stringify(shelfConfigInfo.vectorStore) : "-"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={tab === "jobs" ? "default" : "outline"} onClick={() => setTab("jobs")}>Jobs</Button>
        <Button variant={tab === "results" ? "default" : "outline"} onClick={() => setTab("results")}>Resultados</Button>
        <Button variant={tab === "skus" ? "default" : "outline"} onClick={() => setTab("skus")}>SKUs</Button>
        <Button variant={tab === "assets" ? "default" : "outline"} onClick={() => setTab("assets")}>Assets</Button>
        <Button variant={tab === "index" ? "default" : "outline"} onClick={() => setTab("index")}>Indice y Config</Button>
        <Button variant={tab === "review" ? "default" : "outline"} onClick={() => setTab("review")}>Review Queue</Button>
      </div>

      {tab === "jobs" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-950/60 to-slate-950/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Jobs · crear, monitorear y retomar</p>
                <p className="mt-1 text-xs text-slate-300">Flujo recomendado: sube la imagen, configura PDV y modo, crea el job y abre resultados para curar crops.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {jobId ? <Badge variant="secondary" className="font-mono text-[11px]">Último: {jobId}</Badge> : null}
                {selectedJobId ? <Badge variant="outline" className="font-mono text-[11px]">Activo: {selectedJobId}</Badge> : null}
                <Badge variant="outline">{recentShelfJobs.length} en historial</Badge>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
            <Card className="border-white/10 bg-white/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Nuevo Shelf job</CardTitle>
                <p className="text-xs font-normal text-slate-400">Paso 1: imagen · Paso 2: configuración · Paso 3: crear</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
                  <p className="text-sm font-semibold text-slate-100">1. Subir imagen</p>
                  <p className="mt-1 text-xs text-slate-300">El upload genera <span className="font-mono">image_file_ids</span> listos para el job de recognition.</p>
                  <div className="mt-3">
                    <UploadPanel
                      files={selectedJobFiles}
                      onFilesChange={setSelectedJobFiles}
                      onUpload={() => uploadJobImagesMutation.mutate()}
                      isUploading={uploadJobImagesMutation.isPending}
                    />
                  </div>
                  {uploadedJobFileIds.length ? (
                    <div className="mt-3 rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-3 text-xs text-emerald-50">
                      <p className="font-medium text-emerald-100">{uploadedJobFileIds.length} image_file_id(s) listos</p>
                      <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
                        {uploadedJobFileIds.map((fileId) => <p key={`job-file-${fileId}`} className="font-mono text-[11px]">{fileId}</p>)}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-slate-100">2. Configuración del job</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div><Label>PDV (obligatorio)</Label><Input value={jobPayload.id_pdv} onChange={(e) => setJobPayload((p) => ({ ...p, id_pdv: e.target.value }))} placeholder="PDV_001" /></div>
                    <div>
                      <Label>Modo de procesamiento</Label>
                      <select
                        className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                        value={jobPayload.processing_mode ?? "recognition"}
                        onChange={(e) => setJobPayload((p) => ({ ...p, processing_mode: e.target.value }))}
                      >
                        <option value="recognition">recognition</option>
                        <option value="crop_extraction">crop_extraction</option>
                      </select>
                    </div>
                    <div><Label>Subcategoría</Label><Input value={jobPayload.subcategoria ?? ""} onChange={(e) => setJobPayload((p) => ({ ...p, subcategoria: e.target.value }))} /></div>
                    <div><Label>Usuario relevo</Label><Input value={jobPayload.usuario_relevo ?? ""} onChange={(e) => setJobPayload((p) => ({ ...p, usuario_relevo: e.target.value }))} /></div>
                    <div className="sm:col-span-2"><Label>config_name</Label><Input value={jobPayload.config_name ?? ""} onChange={(e) => setJobPayload((p) => ({ ...p, config_name: e.target.value }))} /></div>
                  </div>
                  <details className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-slate-300">IDs y rutas manuales (avanzado)</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div><Label className="text-xs">image_file_ids</Label><Textarea className="text-xs" value={imageFileIdsText} onChange={(e) => setImageFileIdsText(e.target.value)} rows={4} /></div>
                      <div><Label className="text-xs">image_paths</Label><Textarea className="text-xs" value={imagePathsText} onChange={(e) => setImagePathsText(e.target.value)} rows={4} /></div>
                    </div>
                  </details>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-3">
                  <Button onClick={() => createJobMutation.mutate()} disabled={createJobMutation.isPending}>
                    {createJobMutation.isPending ? "Creando job…" : "3. Crear shelf job"}
                  </Button>
                  {jobId ? <Badge variant="default" className="font-mono">Creado: {jobId}</Badge> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Job activo</CardTitle>
                <p className="text-xs font-normal text-slate-400">Monitorea el estado antes de ir a Resultados</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>job_id a monitorear</Label>
                  <Input className="mt-1 font-mono text-sm" value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} placeholder="2026-..." />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { jobQuery.refetch(); eventsQuery.refetch(); metricsQuery.refetch(); }}>
                    Actualizar estado
                  </Button>
                  {selectedJobId ? (
                    <Button className="flex-1" onClick={() => loadShelfJob(selectedJobId, "results")} disabled={!selectedJobId.trim()}>
                      Ir a resultados
                    </Button>
                  ) : null}
                </div>
                {jobQuery.data ? (
                  <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(jobQuery.data.status)}
                      <span className="font-mono text-sm text-slate-100">{jobQuery.data.job_id}</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Progreso imágenes</span>
                        <span>{jobQuery.data.processed_images ?? 0}/{jobQuery.data.total_images ?? 0}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-cyan-500/80 transition-all"
                          style={{ width: `${Math.round(shelfJobProgressRatio(jobQuery.data) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Fallidas: {jobQuery.data.failed_images ?? 0}
                      {jobQuery.data.id_pdv ? ` · PDV: ${jobQuery.data.id_pdv}` : ""}
                    </p>
                  </div>
                ) : (
                  <div className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 p-4 text-center">
                    <p className="text-sm text-slate-300">Sin job cargado</p>
                    <p className="mt-1 text-xs text-slate-500">Crea uno nuevo o elige del historial</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Historial de jobs</p>
                <p className="text-xs text-slate-300">Retoma análisis anteriores sin volver a subir la imagen.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => recentShelfJobsQuery.refetch()} disabled={recentShelfJobsQuery.isFetching}>
                {recentShelfJobsQuery.isFetching ? "Actualizando…" : "Refrescar"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["all", "Todos"],
                ["recognition", "Reconocimiento"],
                ["crop_extraction", "Extracción"],
                ["sku_test", "Pruebas SKU"],
              ] as const).map(([key, label]) => (
                <Button
                  key={`shelf-jobs-filter-${key}`}
                  size="sm"
                  variant={shelfJobsHistoryFilter === key ? "default" : "outline"}
                  onClick={() => setShelfJobsHistoryFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                value={recentShelfJobSearch}
                onChange={(e) => setRecentShelfJobSearch(e.target.value)}
                placeholder="Buscar job_id, PDV, subcategoría…"
                className="h-9"
              />
              <Badge variant="outline" className="h-9 px-3 font-normal">{recentShelfJobs.length} visibles</Badge>
            </div>
            {recentShelfJobsQuery.isLoading ? (
              <p className="mt-4 text-sm text-slate-400">Cargando jobs recientes…</p>
            ) : recentShelfJobsQuery.error instanceof HttpError ? (
              <p className="mt-4 text-sm text-rose-300">No se pudo cargar el historial: {recentShelfJobsQuery.error.detail}</p>
            ) : recentShelfJobs.length ? (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {recentShelfJobs.map((recentJob) => {
                  const isSelected = recentJob.job_id === selectedJobId;
                  const recentJobDetail = recentShelfJobDetailMap.get(recentJob.job_id);
                  const recentJobPreview = recentJobCardPreview(recentJobDetail);
                  const recentTrace = getShelfJobTraceInfo(recentJobDetail);
                  const progress = shelfJobProgressRatio(recentJob);
                  return (
                    <div
                      key={`recent-shelf-job-${recentJob.job_id}`}
                      className={`rounded-xl border p-3 transition-colors ${isSelected ? "border-cyan-300/40 bg-cyan-500/10 ring-1 ring-cyan-400/20" : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30"}`}
                    >
                      <div className="grid gap-3 sm:grid-cols-[112px_1fr]">
                        <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                          {recentJobPreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={recentJobPreview} alt={`Preview ${recentJob.job_id}`} className="h-24 w-full object-cover sm:h-28" />
                          ) : (
                            <div className="flex h-24 items-center justify-center px-2 text-center text-[11px] text-slate-500 sm:h-28">
                              Sin miniatura
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-sm text-slate-100" title={recentJob.job_id}>{recentJob.job_id}</p>
                              <p className="mt-0.5 text-[11px] text-slate-400">{shelfRecentJobTypeLabel(recentJob)} · {recentJob.subcategoria ?? "Sin subcategoría"}</p>
                            </div>
                            <div className="flex shrink-0 flex-wrap justify-end gap-1">
                              {statusBadge(String(recentJob.status ?? "unknown"))}
                              {isSelected ? <Badge variant="default" className="text-[10px]">Activo</Badge> : null}
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>{recentJob.processed_images ?? 0}/{recentJob.total_images ?? 0} img</span>
                              {(recentJob.failed_images ?? 0) > 0 ? <span className="text-rose-300">{recentJob.failed_images} fallidas</span> : null}
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-cyan-500/70" style={{ width: `${Math.round(progress * 100)}%` }} />
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                            <span>PDV: {recentJob.id_pdv ?? "—"}</span>
                            <span>{formatDateTime(recentJob.updated_at)}</span>
                            {(recentTrace.retry_count ?? 0) > 0 ? <span>Reintento #{recentTrace.retry_count}</span> : null}
                          </div>
                          {recentTrace.source_job_id ? (
                            <p className="mt-1 truncate text-[10px] text-slate-500" title={recentTrace.source_job_id}>
                              Derivado de {recentTrace.source_job_id}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <Button size="sm" onClick={() => loadShelfJob(recentJob.job_id, "results")}>
                              Resultados
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => loadShelfJob(recentJob.job_id, "jobs")}>
                              Cargar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => rerunShelfJobMutation.mutate(recentJob.job_id)}
                              disabled={rerunShelfJobMutation.isPending}
                            >
                              Reejecutar
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 p-6 text-center">
                <p className="text-sm text-slate-300">No hay jobs con estos filtros</p>
                <p className="mt-1 text-xs text-slate-500">Crea un job nuevo o cambia el filtro de tipo</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "results" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Resultados + eventos + métricas</CardTitle></CardHeader>
          <CardContent className={`space-y-4 ${selectedResultTrainingItems.length ? "pb-28" : ""}`}>
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Historial integrado Shelf</p>
                  <p className="text-xs text-slate-300">Cambia de job sin salir de Resultados. Fuente: GET /v1/accounts/{account}/shelf/jobs</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => recentShelfJobsQuery.refetch()} disabled={recentShelfJobsQuery.isFetching}>
                  Refrescar historial
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ["all", "Todos"],
                  ["recognition", "Reconocimiento"],
                  ["crop_extraction", "Extracción"],
                  ["sku_test", "Pruebas SKU"],
                ] as const).map(([key, label]) => (
                  <Button
                    key={`results-jobs-filter-${key}`}
                    size="sm"
                    variant={shelfJobsHistoryFilter === key ? "default" : "outline"}
                    onClick={() => setShelfJobsHistoryFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {recentShelfJobs.slice(0, 8).map((row) => {
                  const jobKey = row.job_id;
                  const active = jobKey === selectedJobId;
                  return (
                    <Button
                      key={`results-quick-job-${jobKey}`}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => loadShelfJob(jobKey, "results")}
                      disabled={!jobKey}
                      className="max-w-full"
                    >
                      <span className="truncate font-mono text-xs">{jobKey}</span>
                    </Button>
                  );
                })}
                {!recentShelfJobs.length && !recentShelfJobsQuery.isLoading ? (
                  <span className="text-xs text-slate-400">Sin jobs Shelf recientes para esta cuenta.</span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Job cargado</p>
                <p className="text-xs text-slate-300">Puedes volver a ejecutarlo con el mismo payload base sin perder el histórico anterior.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {jobQuery.data?.source_job_id ? <Badge variant="secondary">Derivado de {jobQuery.data.source_job_id}</Badge> : null}
                {typeof jobQuery.data?.retry_count === "number" && jobQuery.data.retry_count > 0 ? <Badge variant="outline">Intento {jobQuery.data.retry_count}</Badge> : null}
                {typeof jobQuery.data?.reused_inputs === "boolean" ? <Badge variant="outline">{jobQuery.data.reused_inputs ? "Reusó inputs" : "Inputs nuevos"}</Badge> : null}
                <Button
                  variant="outline"
                  onClick={() => rerunShelfJobMutation.mutate(selectedJobId)}
                  disabled={rerunShelfJobMutation.isPending || !selectedJobId}
                >
                  {rerunShelfJobMutation.isPending ? "Reejecutando..." : "Reejecutar job"}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">status</p><p>{jobQuery.data?.status ?? "-"}</p></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">module</p><p>{String((resultsQuery.data?.result_json as Record<string, unknown> | undefined)?.module ?? "-")}</p></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">processing_mode</p><p>{processingMode}</p></div>
            </div>
            {jobHardNegativeSummary.total > 0 || jobHardNegativeSummary.pairs.length ? (
              <div className="rounded-lg border border-violet-300/25 bg-violet-500/5 p-3">
                <p className="text-sm font-semibold text-violet-100">Memoria de confusión aplicada en este job</p>
                <p className="mt-1 text-xs text-violet-50/80">
                  Backend ajustó el ranking en {jobHardNegativeSummary.total} crop(s) usando hard negatives registrados.
                </p>
                {jobHardNegativeSummary.pairs.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {jobHardNegativeSummary.pairs.map((pair) => (
                      <Badge key={`job-hn-${pair.pair}`} variant="outline" className="border-violet-300/30 text-[10px] text-violet-50">
                        {hardNegativePairLabel(pair)} ×{pair.count}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {(jobQuery.data?.source_job_id || jobQuery.data?.rerun_of_job_id || typeof jobQuery.data?.retry_count === "number") ? (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">source_job_id</p><p className="font-mono text-sm text-slate-100">{jobQuery.data?.source_job_id ?? "-"}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">rerun_of_job_id</p><p className="font-mono text-sm text-slate-100">{jobQuery.data?.rerun_of_job_id ?? "-"}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">retry_count</p><p>{jobQuery.data?.retry_count ?? 0}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">reused_inputs</p><p>{typeof jobQuery.data?.reused_inputs === "boolean" ? (jobQuery.data.reused_inputs ? "Sí" : "No") : "-"}</p></div>
              </div>
            ) : null}
            {(rerunTraceability.vectorIndexSnapshot || rerunTraceability.datasetPublicationContext) ? (
              <div className="rounded-lg border border-sky-300/20 bg-sky-500/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Trazabilidad del rerun</p>
                    <p className="text-xs text-slate-300">Aquí vemos si esta corrida ya usó un índice más nuevo y si corrió después del último rebuild publicado.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rerunTraceability.usedNewerThanSourceJob ? <Badge>Usó índice más nuevo</Badge> : null}
                    {rerunTraceability.vectorIndexSnapshot && !rerunTraceability.usedNewerThanSourceJob ? <Badge variant="secondary">Usó mismo snapshot</Badge> : null}
                    {rerunTraceability.rebuildHappenedBeforeJob ? <Badge variant="outline">Corrió después del rebuild</Badge> : <Badge variant="destructive">Sin rebuild previo detectado</Badge>}
                    {rerunTraceability.snapshotShadowCount > 0 ? <Badge variant="outline">Shadow FAISS generado</Badge> : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">engine</p><p>{rerunTraceability.snapshotEngine || "-"}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">snapshot creado</p><p>{formatDateTime(rerunTraceability.snapshotCreatedAt || null)}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">último rebuild</p><p>{formatDateTime(rerunTraceability.latestRebuildAt || null)}</p></div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">operation_id</p><p className="font-mono text-xs text-slate-100">{rerunTraceability.latestRebuildOperationId || "-"}</p></div>
                </div>
                {rerunTraceability.usedNewerThanSourceJob ? (
                  <p className="mt-3 text-xs text-emerald-100">Este rerun ya usó un índice más nuevo que la corrida comparada.</p>
                ) : rerunTraceability.vectorIndexSnapshot ? (
                  <p className="mt-3 text-xs text-slate-300">Este rerun usó el mismo snapshot de índice que la corrida comparada o backend no detectó un cambio más nuevo.</p>
                ) : null}
              </div>
            ) : null}
            {shelfJobFailed && !shelfHasStructuredResults ? (
              <div className="rounded-lg border border-rose-300/20 bg-rose-500/10 p-3">
                <p className="text-sm font-semibold text-rose-100">El job falló antes de generar artifacts</p>
                <p className="mt-1 text-xs text-rose-50/90">No hay evidencia visual porque el procesamiento falló antes de generar resultados. Mantén esta vista en eventos, métricas y diagnóstico técnico.</p>
              </div>
            ) : null}
            {(vectorIndexHealth.dinov2.mixedDims || vectorIndexHealth.siglip.mixedDims || vectorIndexHealth.siglip.sampleDim === 112 || vectorIndexHealth.dinov2.sampleDim === 112) ? (
              <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-amber-100">Índice inconsistente: recalcular embeddings</p>
                    <p className="mt-1 text-xs text-amber-50/90">
                      dinov2 dims={vectorIndexHealth.dinov2.dimsLabel} · siglip dims={vectorIndexHealth.siglip.dimsLabel}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => adminRecomputeAllEmbeddingsMutation.mutate()}
                    disabled={adminRecomputeAllEmbeddingsMutation.isPending}
                  >
                    Recalcular embeddings + reconstruir índice
                  </Button>
                </div>
              </div>
            ) : null}
            {shelfResultFallbackCount > 0 ? (
              <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-amber-100">Embedding degradado: precisión reducida</p>
                    <p className="mt-1 text-xs text-amber-50/90">Hay {shelfResultFallbackCount} crops con fallback clásico reportado por backend.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => adminRecomputeAllEmbeddingsMutation.mutate()}
                    disabled={adminRecomputeAllEmbeddingsMutation.isPending}
                  >
                    Recalcular embeddings + reconstruir índice
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-violet-300/20 bg-violet-500/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Contrato UI Shelf</p>
                  <p className="text-xs text-slate-300">Esta vista sigue las señales `ui_contract` del backend para decidir qué colección y qué acciones son principales.</p>
                </div>
                <Badge variant="outline">{uiDisplayFamily || "shelf"}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">primary_view</p>
                  <p className="text-sm font-semibold text-slate-100">{uiPrimaryView}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">agrupación</p>
                  <p className="text-sm font-semibold text-slate-100">{uiGroupingLabel}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">crop gallery</p>
                  <p className="text-sm font-semibold text-slate-100">{uiPanels ? String(uiPanels.show_crop_gallery !== false) : "true"}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">training actions</p>
                  <p className="text-sm font-semibold text-slate-100">{String(showTrainingActions)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {uiActions ? (
                  Object.entries(uiActions)
                    .filter(([, value]) => value === true)
                    .slice(0, 8)
                    .map(([key]) => <Badge key={`ui-action-${key}`} variant="outline">{key}</Badge>)
                ) : (
                  <Badge variant="outline">Sin ui_contract explícito; usando fallback frontend</Badge>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Reportes técnicos del job</p>
                  <p className="text-xs text-slate-300">Aquí puedes abrir el reporte maestro del job completo para inspección humana rápida o debug más estructurado.</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {masterReportLinks((resultsQuery.data ?? {}) as Record<string, unknown>).length ? (
                  masterReportLinks((resultsQuery.data ?? {}) as Record<string, unknown>).map((link) => (
                    <span key={`master-link-${link.label}`} className="inline-flex gap-1">
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                      >
                        {link.label}
                      </a>
                      {link.label.toLowerCase().includes("markdown") && (
                        <button
                          type="button"
                          className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-2 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20"
                          onClick={() => openMdDialog(`Master Markdown — ${selectedJobId}`, link.href, `master_${selectedJobId}.md`)}
                        >
                          Ver
                        </button>
                      )}
                    </span>
                  ))
                ) : shelfJobFailed ? (
                  <p className="text-sm text-amber-300">El job falló antes de publicar reportes maestros.</p>
                ) : (
                  <p className="text-sm text-slate-400">Todavía no hay reportes maestros publicados para este job.</p>
                )}
              </div>
            </div>
            {showTrainingActions ? (
              <div className="rounded-xl border border-emerald-300/20 bg-gradient-to-br from-emerald-500/10 via-slate-950/60 to-slate-950/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Mesa de entrenamiento por percha</p>
                    <p className="text-xs text-slate-300">Selecciona crops similares incluso entre distintas perchas, asígnalos a un SKU y promuévelos en lote al catálogo visual.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedJobId ? (
                      <a
                        href={ocrApi.getShelfJobExtractedCropsZipUrl(selectedJobId)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                      >
                        Descargar ZIP del job
                      </a>
                    ) : null}
                    <Button variant="outline" onClick={() => jobExtractedCropsQuery.refetch()} disabled={jobExtractedCropsQuery.isFetching || !selectedJobId}>
                      Refrescar grupos
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Perchas</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{jobExtractedCropsQuery.data?.total_images ?? extractedCropGroups.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Crops del job</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{jobExtractedCropsQuery.data?.total_items ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Seleccionados</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{selectedTrainingCropsCount}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Agrupación</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{firstNonEmptyString(jobExtractedCropsQuery.data?.group_label, "percha")}</p>
                  </div>
                </div>

                <div className={`mt-4 rounded-xl border p-4 ${datasetPublishPending ? "border-amber-300/30 bg-amber-500/10" : "border-cyan-300/20 bg-cyan-500/5"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Paso final: publicar índice</p>
                      <p className="mt-1 text-xs text-slate-300">
                        Guardar crops los deja en el dataset, pero Shelf Recognition no los usa hasta publicar el índice. Haz este paso cuando cierres el lote actual.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={datasetPublishPending ? "secondary" : "outline"}>
                        {datasetPublishPending ? "Pendiente de publicar" : "Sin cambios pendientes"}
                      </Badge>
                      <Button onClick={() => rebuildIndexMutation.mutate()} disabled={rebuildIndexMutation.isPending}>
                        {rebuildIndexMutation.isPending ? "Publicando..." : "Reconstruir índice ahora"}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">1. Guardar en dataset</p>
                      <p className="mt-1 text-sm text-slate-100">Asocia el crop al SKU y deja su rol listo.</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">2. Publicar índice</p>
                      <p className="mt-1 text-sm text-slate-100">Actualiza el índice activo para recognition.</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-xs text-slate-400">3. Probar recognition</p>
                      <p className="mt-1 text-sm text-slate-100">Vuelve a correr las fotos de prueba y compara.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)_auto]">
                  <div className="space-y-2">
                    <Label>SKU destino del grupo</Label>
                    <Input value={cropActionSkuId} onChange={(e) => { setCropActionSkuId(e.target.value); setCropActionSkuSearch(e.target.value); }} placeholder="BLENDAX_PAPAYA_COCO_102G" />
                    <Input
                      value={cropActionSkuSearch}
                      onChange={(e) => setCropActionSkuSearch(e.target.value)}
                      placeholder="Buscar SKU en backend por código, nombre, marca o categoría..."
                    />
                  </div>
                  <div>
                    <Label>Etiqueta del grupo visual</Label>
                    <Input value={trainingGroupLabel} onChange={(e) => setTrainingGroupLabel(e.target.value)} placeholder="Blendax verde" />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={() => batchPromoteCropsMutation.mutate()} disabled={batchPromoteCropsMutation.isPending || !selectedTrainingCropsCount || !cropActionSkuLookup.exactVerified}>
                      Guardar selección en dataset
                    </Button>
                    <Button variant="outline" onClick={() => setSelectedTrainingCropKeys([])} disabled={!selectedTrainingCropsCount}>
                      Limpiar
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>dataset_role</Label>
                    <select
                      className="mt-2 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                      value={cropDatasetRole}
                      onChange={(e) => setCropDatasetRole(e.target.value as ShelfDatasetRole)}
                    >
                      {SHELF_DATASET_ROLE_OPTIONS.map((role) => (
                        <option key={`group-role-${role}`} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>dataset_split (opcional)</Label>
                    <Input value={cropDatasetSplit} onChange={(e) => setCropDatasetSplit(e.target.value)} placeholder="holdout_v1 / train_v1 / reserve_v1" />
                  </div>
                </div>
                {!cropActionSkuLookup.exactVerified && cropActionSkuLookup.query ? (
                  <p className="mt-2 text-xs text-amber-200">Verifica una coincidencia exacta de `sku_id` antes de lanzar el entrenamiento masivo.</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">
                  `Guardar selección en dataset` no publica índice. Usa el botón <span className="font-medium text-slate-200">Reconstruir índice ahora</span> de arriba para que recognition empiece a usar estos cambios.
                </p>

                {cropActionSkuLookup.query.length >= 2 ? (
                  <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Sugerencias de SKU para entrenamiento grupal</p>
                      <Badge variant={cropActionSkuLookup.exactVerified ? "default" : "secondary"}>
                        {cropActionSkuLookup.exactVerified ? "Coincidencia exacta verificada" : "Sin coincidencia exacta todavía"}
                      </Badge>
                    </div>
                    {remoteCropSkuSearchQuery.isLoading ? (
                      <p className="text-sm text-slate-400">Buscando SKUs en backend...</p>
                    ) : remoteCropSkuSearchQuery.error instanceof HttpError ? (
                      <p className="text-sm text-amber-300">No se pudo buscar SKU: {remoteCropSkuSearchQuery.error.detail}</p>
                    ) : cropActionSkuLookup.exactMatch ? (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3">
                          <p className="text-xs uppercase tracking-wide text-emerald-200">SKU exacto encontrado</p>
                          <p className="mt-1 font-mono text-sm text-slate-100">{getSkuCodeValue(cropActionSkuLookup.exactMatch)}</p>
                          <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(cropActionSkuLookup.exactMatch) || "Sin nombre"}</p>
                          <p className="mt-1 text-xs text-slate-400">{getSkuBrandValue(cropActionSkuLookup.exactMatch) || "-"} · {getSkuFamilyValue(cropActionSkuLookup.exactMatch) || "-"}</p>
                        </div>
                        {cropActionSkuLookup.suggestions.length > 1 ? (
                          <div>
                            <p className="mb-2 text-xs text-slate-400">Otras coincidencias cercanas</p>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {cropActionSkuLookup.suggestions
                                .filter((sku) => normalizeSkuSearchToken(getSkuCodeValue(sku)) !== normalizeSkuSearchToken(getSkuCodeValue(cropActionSkuLookup.exactMatch)))
                                .slice(0, 5)
                                .map((sku) => {
                                  const code = getSkuCodeValue(sku);
                                  return (
                                    <button
                                      key={`remote-crop-sku-${code || sku.id}`}
                                      type="button"
                                      onClick={() => {
                                        setCropActionSkuId(code);
                                        setCropActionSkuSearch(code);
                                        setSelectedSkuId(code);
                                      }}
                                      className={`rounded-lg border p-3 text-left ${code === cropActionSkuId ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                                    >
                                      <p className="font-mono text-sm text-slate-100">{code || "-"}</p>
                                      <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(sku) || "Sin nombre"}</p>
                                      <p className="mt-1 text-xs text-slate-400">
                                        {getSkuBrandValue(sku) || "-"} · {getSkuFamilyValue(sku) || "-"}
                                      </p>
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : cropActionSkuLookup.suggestions.length ? (
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {cropActionSkuLookup.suggestions.map((sku) => {
                          const code = getSkuCodeValue(sku);
                          return (
                            <button
                              key={`remote-crop-sku-${code || sku.id}`}
                              type="button"
                              onClick={() => {
                                setCropActionSkuId(code);
                                setCropActionSkuSearch(code);
                                setSelectedSkuId(code);
                              }}
                              className={`rounded-lg border p-3 text-left ${code === cropActionSkuId ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                            >
                              <p className="font-mono text-sm text-slate-100">{code || "-"}</p>
                              <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(sku) || "Sin nombre"}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {getSkuBrandValue(sku) || "-"} · {getSkuFamilyValue(sku) || "-"}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-amber-200">No encontramos una coincidencia clara para ese código o texto. Mejor no entrenar hasta verificar el SKU exacto.</p>
                    )}
                  </div>
                ) : null}

                {jobExtractedCropsQuery.error instanceof HttpError ? (
                  <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/5 p-3 text-sm text-amber-100">
                    No se pudieron cargar los crops agrupados del job: {jobExtractedCropsQuery.error.detail}
                  </div>
                ) : null}

                {extractedCropGroups.length ? (
                  <details className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                      Crops extraídos por percha
                      <span className="ml-2 text-[11px] font-normal text-slate-400">
                        {extractedCropGroups.length} perchas · {jobExtractedCropsQuery.data?.total_items ?? 0} crops · {selectedTrainingCropsCount} seleccionados
                      </span>
                    </summary>
                  <div className="mt-4 space-y-4">
                    {extractedCropGroups.map((group, groupIndex) => {
                      const imageId = Number(group.image_id ?? 0) || 0;
                      const items = group.items ?? [];
                      const groupKeys = items.map((crop) => trainingCropKey(crop.image_id ?? imageId, firstNonEmptyString(crop.crop_id)));
      const selectedInGroup = groupKeys.filter((key) => selectedTrainingCropKeySet.has(key)).length;
                      return (
                        <details key={`crop-group-${group.shelf_group_id ?? imageId ?? groupIndex}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <summary className="cursor-pointer">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-100">{firstNonEmptyString(group.shelf_group_label, group.source_image_name, `image_${imageId}`)}</p>
                                <p className="text-xs text-slate-400">image_id {imageId} · {items.length} crops · seleccionados {selectedInGroup}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setSelectedArtifactsImageId(imageId);
                                  }}
                                >
                                  Abrir artifacts
                                </Button>
                                {group.download_all_api_url ? (
                                  <a
                                    href={`/admin/ocr/proxy${group.download_all_api_url}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                                  >
                                    ZIP percha
                                  </a>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setSelectedTrainingCropKeys((prev) => {
                                      const hasAll = groupKeys.every((key) => prev.includes(key));
                                      if (hasAll) return prev.filter((key) => !groupKeys.includes(key));
                                      return Array.from(new Set([...prev, ...groupKeys]));
                                    });
                                  }}
                                >
                                  {selectedInGroup === items.length && items.length ? "Quitar grupo" : "Seleccionar grupo"}
                                </Button>
                              </div>
                            </div>
                          </summary>
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            {items.map((crop, idx) => {
                              const cropId = firstNonEmptyString(crop.crop_id) || `crop_${idx + 1}`;
                              const cropKey = trainingCropKey(crop.image_id ?? imageId, cropId);
                              const selected = selectedTrainingCropKeySet.has(cropKey);
                              const preview = previewUrlOf(crop as Record<string, unknown>);
                              const cropDownload = firstNonEmptyString(crop.download_url) || ocrApi.getShelfExtractedCropDownloadUrl(selectedJobId, crop.image_id ?? imageId, cropId);
                              return (
                                <div
                                  key={`training-crop-${cropKey}`}
                                  onClick={() => setSelectedTrainingCropKeys((prev) => (prev.includes(cropKey) ? prev.filter((key) => key !== cropKey) : [...prev, cropKey]))}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedTrainingCropKeys((prev) => (prev.includes(cropKey) ? prev.filter((key) => key !== cropKey) : [...prev, cropKey]));
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className={`rounded-lg border p-3 text-left transition ${selected ? "border-emerald-300/40 bg-emerald-500/10" : "border-white/10 bg-slate-950/40 hover:bg-slate-900/50"}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <Badge variant={selected ? "default" : "outline"}>{selected ? "Seleccionado" : "Elegir"}</Badge>
                                    <span className="text-[11px] text-slate-400">{firstNonEmptyString(crop.ordering_label, crop.crop_id, `crop ${idx + 1}`)}</span>
                                  </div>
                                  {previewAvailableOf(crop as Record<string, unknown>) && preview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={preview} alt={cropId} className="mt-3 h-36 w-full rounded-md object-cover" />
                                  ) : (
                                    <div className="mt-3 flex h-36 items-center justify-center rounded-md border border-dashed border-white/10 text-xs text-slate-400">
                                      Sin preview
                                    </div>
                                  )}
                                  <div className="mt-3 space-y-1 text-xs text-slate-300">
                                    <p><span className="text-slate-400">crop_id:</span> {cropId}</p>
                                    <p><span className="text-slate-400">piso / orden:</span> {crop.tray_index ?? "-"} / {crop.order_in_tray ?? crop.position_in_tray ?? "-"}</p>
                                    <p><span className="text-slate-400">global:</span> {crop.global_order ?? "-"}</p>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <a
                                      href={cropDownload}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(event) => event.stopPropagation()}
                                      className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                                    >
                                      Descargar
                                    </a>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedArtifactsImageId(Number(crop.image_id ?? imageId));
                                        cropDetailMutation.mutate({ imageId: Number(crop.image_id ?? imageId), cropId });
                                      }}
                                    >
                                      Detalle
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                  </details>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">Cuando el job termine en modo crop_extraction, aquí aparecerán los crops agrupados por percha para selección masiva.</p>
                )}
              </div>
            ) : null}
            {selectedArtifactsData ? (
              <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-950/60 to-slate-950/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Vista anotada del shelf</p>
                    <p className="text-xs text-slate-300">La imagen anotada te ayuda a validar el orden visual, los pisos detectados y el contexto general del matching.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Pisos detectados: {artifactHeroSummary.trayCount || 0}</Badge>
                    <Badge variant="outline">Resultados: {artifactHeroSummary.resultsCount}</Badge>
                    <Badge variant={artifactHeroSummary.fallbackCount ? "secondary" : "outline"}>Con fallback: {artifactHeroSummary.fallbackCount}</Badge>
                    <Badge variant={artifactHeroSummary.reviewCount ? "destructive" : "outline"}>Revisión: {artifactHeroSummary.reviewCount}</Badge>
                    {artifactHeroSummary.hardNegativeSummary.total > 0 ? (
                      <Badge variant="secondary" title="Crops donde backend aplicó penalización por hard negative">
                        HN aplicados: {artifactHeroSummary.hardNegativeSummary.total}
                      </Badge>
                    ) : null}
                    {artifactHeroSummary.cropsWithHardNegativePenalty > 0 ? (
                      <Badge variant="outline" title="Crops con al menos un candidato penalizado en top_candidates">
                        Ranking ajustado: {artifactHeroSummary.cropsWithHardNegativePenalty}
                      </Badge>
                    ) : null}
                  </div>
                  {artifactHeroSummary.hardNegativeSummary.pairs.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {artifactHeroSummary.hardNegativeSummary.pairs.map((pair) => (
                        <Badge key={`img-hn-${pair.pair}`} variant="outline" className="text-[10px]">
                          {hardNegativePairLabel(pair)} ×{pair.count}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr,0.65fr]">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    {heroPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={heroPreview} alt="Shelf anotado" className="max-h-[520px] w-full rounded-lg bg-slate-950/70 object-contain" />
                    ) : (
                      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-400">
                        Preview anotada no disponible
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Accesos rápidos</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          { label: "Ver original", href: previewUrlOf(((selectedArtifactsData.original_image as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>) ?? "" },
                          ...artifactReportLinks(selectedArtifactsData),
                        ].filter((link) => link.href).map((link) => (
                          <a
                            key={`hero-link-${link.label}`}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Filas / pisos detectados</p>
                      <div className="mt-3 space-y-2">
                        {trayRows.length ? trayRows.map((row, idx) => (
                          <div key={`tray-row-${idx}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-100">Piso {String(row.tray_index ?? idx + 1)}</p>
                              <Badge variant="outline">{String(row.items_count ?? 0)} items</Badge>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              centro_y {typeof row.center_y === "number" ? row.center_y.toFixed(1) : "-"} | alto promedio {typeof row.avg_height === "number" ? row.avg_height.toFixed(1) : "-"}
                            </p>
                          </div>
                        )) : (
                          <p className="text-sm text-slate-400">Todavía no hay tray_rows publicados para esta imagen.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <details
              className="rounded-lg border border-white/10 bg-black/15 px-3 py-2"
              open={!resultsTableCollapsed}
              onToggle={(event) => setResultsTableCollapsed(!(event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                Tabla resumen ({filteredShelfResultEntries.length}/{shelfResults.length})
              </summary>
              <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredShelfResultEntries.length > 0 && filteredShelfResultEntries.every((entry) => entry.selectKey && selectedTrainingCropKeySet.has(entry.selectKey))}
                        onCheckedChange={(checked) => {
                          const keys = filteredShelfResultEntries.map((entry) => entry.selectKey).filter((key): key is string => Boolean(key));
                          if (checked) setSelectedTrainingCropKeys((prev) => Array.from(new Set([...prev, ...keys])));
                          else setSelectedTrainingCropKeys((prev) => prev.filter((key) => !keys.includes(key)));
                        }}
                        aria-label="Seleccionar todos los visibles"
                      />
                    </TableHead>
                    <TableHead>Orden</TableHead>
                    <TableHead>Piso</TableHead>
                    <TableHead>Posición</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>SKU final</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Delta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Revisión</TableHead>
                    <TableHead>Fallback emb.</TableHead>
                    <TableHead>Orientación</TableHead>
                    <TableHead title="Penalización por hard negative aplicada en rerank">HN</TableHead>
                    <TableHead>Top candidato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShelfResultEntries.map((entry) => {
                    const row = entry.row;
                    const i = entry.idx;
                    const selectedForTraining = entry.selectKey ? selectedTrainingCropKeySet.has(entry.selectKey) : false;
                    return (
                    <TableRow
                      key={`shelf-r-${i}`}
                      className={selectedForTraining ? "bg-emerald-500/10" : undefined}
                      onClick={(event) => {
                        if (!entry.selectKey) return;
                        toggleTrainingCropSelection(entry, { shiftKey: event.shiftKey });
                      }}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selectedForTraining}
                          disabled={!entry.selectKey}
                          onCheckedChange={() => entry.selectKey && toggleTrainingCropSelection(entry)}
                          aria-label={`Seleccionar crop ${entry.cropId || i}`}
                        />
                      </TableCell>
                      <TableCell>{resultGlobalOrderLabel(row)}</TableCell>
                      <TableCell>{resultTrayLabel(row)}</TableCell>
                      <TableCell>{resultPositionLabel(row)}</TableCell>
                      <TableCell className="max-w-40 truncate">{firstNonEmptyString(row.crop_id) || String(row.image_id ?? "-")}</TableCell>
                      <TableCell className="max-w-72 truncate">
                        {resultHasFinalSku(row) ? (
                          <span>{resultFinalSkuLabel(row)}</span>
                        ) : (
                          <span className="text-amber-200">Sugerido: {resultSuggestedSkuLabel(row)}</span>
                        )}
                      </TableCell>
                      <TableCell>{formatPercentLike(resultNumeric(row, "confidence"), 4)}</TableCell>
                      <TableCell>{formatPercentLike(resultNumeric(row, "score_delta"))}</TableCell>
                      <TableCell>{confidenceBadge(String(row.confidence_state ?? ""))}</TableCell>
                      <TableCell>
                        <Badge variant={resultBoolean(row, "review_required") ? "destructive" : "outline"}>
                          {resultHasFinalSku(row)
                            ? (resultBoolean(row, "review_required") ? "Revisar" : "OK")
                            : "Sugerido para revisión"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={resultEmbeddingDiagnostics(row)?.models?.fallback_used ? "secondary" : "outline"}>
                          {resultEmbeddingDiagnostics(row)?.models?.fallback_used ? "Sí" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const orientation = analysisObjectOf(row, "orientation_analysis");
                          if (!orientation) return <span className="text-slate-500">-</span>;
                          const observed = firstNonEmptyString(orientation.observed_orientation) || "-";
                          const mismatch = orientation.orientation_matches_expected === false;
                          return <Badge variant={mismatch ? "secondary" : "outline"}>{observed}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="max-w-28 whitespace-nowrap">
                        {(() => {
                          const hn = cropHardNegativeTableLabel(row);
                          if (hn.short === "-") return <span className="text-slate-500">-</span>;
                          return (
                            <Badge variant="secondary" className="font-mono text-[10px]" title={hn.title}>
                              {hn.short}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="max-w-60 truncate">
                        {(() => {
                          const top = resultTopCandidates(row)[0];
                          return top ? `${firstNonEmptyString(top.sku_id, top.sku_code, top.sku_name) || "top_1"} ${typeof top.score === "number" ? `(${top.score.toFixed(3)})` : ""}` : "-";
                        })()}
                      </TableCell>
                    </TableRow>
                  );})}
                  {!shelfResults.length ? (
                    <TableRow>
                      <TableCell colSpan={14}>
                        {shelfJobFailed ? "El job falló antes de generar resultados." : "Sin resultados todavía."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {shelfResults.length && !filteredShelfResultEntries.length ? (
                    <TableRow>
                      <TableCell colSpan={14}>Ningún resultado coincide con los filtros actuales.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              </div>
            </details>

            {shelfResults.length ? (
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
                <div className="mb-3">
                  <p className="text-sm font-semibold">Lectura rápida del matching</p>
                  <p className="text-xs text-slate-300">Cada detección te muestra orden visual, decisión sugerida, umbrales y si hubo degradación del stack de embeddings.</p>
                </div>
                <div className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Modo selección rápida</p>
                      <p className="text-xs text-slate-300">Filtra, agrupa y asigna crops sin perder acciones individuales. Shift+clic rango · Ctrl+A todos visibles · Esc limpiar.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{filteredShelfResultEntries.length} visibles</Badge>
                      <Badge variant={selectedResultTrainingItems.length ? "default" : "outline"}>{selectedResultTrainingItems.length} seleccionados</Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_auto_auto_auto]">
                    <Input
                      value={resultsSearchQuery}
                      onChange={(e) => setResultsSearchQuery(e.target.value)}
                      placeholder="Buscar por SKU, crop, orden, piso..."
                    />
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["all", "Todos"],
                        ["review", "Revisar"],
                        ["unassigned", "Sin asignar"],
                        ["selected", "Seleccionados"],
                      ] as const).map(([key, label]) => (
                        <Button
                          key={`results-filter-${key}`}
                          size="sm"
                          variant={resultsViewFilter === key ? "default" : "outline"}
                          onClick={() => setResultsViewFilter(key)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {([
                        ["sm", "Mini"],
                        ["md", "Medio"],
                        ["lg", "Grande"],
                      ] as const).map(([key, label]) => (
                        <Button
                          key={`thumb-${key}`}
                          size="sm"
                          variant={resultsThumbScale === key ? "default" : "outline"}
                          onClick={() => applyResultsThumbPreset(key)}
                        >
                          {label}
                        </Button>
                      ))}
                      <input
                        type="range"
                        min={60}
                        max={220}
                        step={10}
                        value={resultsThumbZoom}
                        onChange={(e) => setResultsThumbZoom(Number(e.target.value))}
                        className="h-2 w-28 cursor-pointer accent-cyan-400"
                        aria-label="Zoom de miniaturas"
                        title={`Zoom miniaturas ${resultsThumbZoom}%`}
                      />
                      <span className="font-mono text-[11px] text-slate-400">{resultsThumbZoom}%</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={selectAllFilteredResults}>Todos visibles</Button>
                      <Button size="sm" variant="outline" onClick={selectFilteredBySuggestedSku}>Mismo SKU</Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedTrainingCropKeys([])} disabled={!selectedTrainingCropKeys.length}>Limpiar</Button>
                      <Button
                        size="sm"
                        variant={resultsBulkFocus ? "default" : "outline"}
                        onClick={() => setResultsBulkFocus((prev) => !prev)}
                      >
                        {resultsBulkFocus ? "Modo grupal ON" : "Modo grupal"}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className={`mb-4 rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-3 ${resultsBulkFocus ? "ring-1 ring-emerald-400/30" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Entrenamiento grupal desde resultados</p>
                      <p className="text-xs text-slate-300">Marca las tarjetas que pertenecen al mismo SKU, elige el código y usa una sola acción para asignar y entrenar todos juntos.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Seleccionados: {selectedResultTrainingItems.length}</Badge>
                      <Badge variant="outline">SKU destino: {cropActionSkuId || "pendiente"}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(220px,280px)_auto]">
                    <div className="space-y-2">
                      <Label>Buscar o escribir SKU destino</Label>
                      <Input
                        value={cropActionSkuId}
                        onChange={(e) => {
                          setCropActionSkuId(e.target.value);
                          setCropActionSkuSearch(e.target.value);
                        }}
                        placeholder="LML0108"
                      />
                      <Input
                        value={cropActionSkuSearch}
                        onChange={(e) => setCropActionSkuSearch(e.target.value)}
                        placeholder="Buscar SKU por código, nombre, marca o categoría..."
                      />
                    </div>
                    <div>
                      <Label>Etiqueta opcional del grupo</Label>
                      <Input value={trainingGroupLabel} onChange={(e) => setTrainingGroupLabel(e.target.value)} placeholder="Ej: Kalipto limón 1L" />
                    </div>
                    <div className="flex items-end gap-2">
                    <Button onClick={() => batchPromoteCropsMutation.mutate()} disabled={batchPromoteCropsMutation.isPending || !selectedResultTrainingItems.length || !cropActionSkuLookup.exactVerified}>
                        Guardar seleccionados en dataset
                    </Button>
                      <Button variant="outline" onClick={() => setSelectedTrainingCropKeys([])} disabled={!selectedResultTrainingItems.length}>
                        Limpiar
                      </Button>
                    </div>
                  </div>
                  {!cropActionSkuLookup.exactVerified && cropActionSkuLookup.query ? (
                    <p className="mt-2 text-xs text-amber-200">Primero valida un SKU exacto para evitar entrenar los crops seleccionados con un código ambiguo.</p>
                  ) : null}
                  {cropActionSkuLookup.query.length >= 2 ? (
                    <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">Sugerencias de SKU</p>
                        <Badge variant={cropActionSkuLookup.exactVerified ? "default" : "secondary"}>
                          {cropActionSkuLookup.exactVerified ? "Coincidencia exacta verificada" : "Sin coincidencia exacta todavía"}
                        </Badge>
                      </div>
                      {remoteCropSkuSearchQuery.isLoading ? (
                        <p className="text-sm text-slate-400">Buscando coincidencias...</p>
                      ) : remoteCropSkuSearchQuery.error instanceof HttpError ? (
                        <p className="text-sm text-amber-300">No se pudo buscar SKU: {remoteCropSkuSearchQuery.error.detail}</p>
                      ) : cropActionSkuLookup.exactMatch ? (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3">
                            <p className="text-xs uppercase tracking-wide text-emerald-200">SKU exacto encontrado</p>
                            <p className="mt-1 font-mono text-sm text-slate-100">{getSkuCodeValue(cropActionSkuLookup.exactMatch)}</p>
                            <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(cropActionSkuLookup.exactMatch) || "Sin nombre"}</p>
                            <p className="mt-1 text-xs text-slate-400">{getSkuBrandValue(cropActionSkuLookup.exactMatch) || "-"} · {getSkuFamilyValue(cropActionSkuLookup.exactMatch) || "-"}</p>
                          </div>
                          {cropActionSkuLookup.suggestions.length > 1 ? (
                            <div>
                              <p className="mb-2 text-xs text-slate-400">Otras coincidencias cercanas</p>
                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {cropActionSkuLookup.suggestions
                                  .filter((sku) => normalizeSkuSearchToken(getSkuCodeValue(sku)) !== normalizeSkuSearchToken(getSkuCodeValue(cropActionSkuLookup.exactMatch)))
                                  .slice(0, 5)
                                  .map((sku) => {
                                    const code = getSkuCodeValue(sku);
                                    return (
                                      <button
                                        key={`results-remote-sku-${code || sku.id}`}
                                        type="button"
                                        onClick={() => {
                                          setCropActionSkuId(code);
                                          setCropActionSkuSearch(code);
                                          setSelectedSkuId(code);
                                        }}
                                        className={`rounded-lg border p-3 text-left ${code === cropActionSkuId ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                                      >
                                        <p className="font-mono text-sm text-slate-100">{code || "-"}</p>
                                        <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(sku) || "Sin nombre"}</p>
                                        <p className="mt-1 text-xs text-slate-400">{getSkuBrandValue(sku) || "-"} · {getSkuFamilyValue(sku) || "-"}</p>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : cropActionSkuLookup.suggestions.length ? (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {cropActionSkuLookup.suggestions.map((sku) => {
                            const code = getSkuCodeValue(sku);
                            return (
                              <button
                                key={`results-remote-sku-${code || sku.id}`}
                                type="button"
                                onClick={() => {
                                  setCropActionSkuId(code);
                                  setCropActionSkuSearch(code);
                                  setSelectedSkuId(code);
                                }}
                                className={`rounded-lg border p-3 text-left ${code === cropActionSkuId ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                              >
                                <p className="font-mono text-sm text-slate-100">{code || "-"}</p>
                                <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(sku) || "Sin nombre"}</p>
                                <p className="mt-1 text-xs text-slate-400">{getSkuBrandValue(sku) || "-"} · {getSkuFamilyValue(sku) || "-"}</p>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-amber-200">No encontramos una coincidencia clara para ese código o texto. Mejor no entrenar hasta verificar el SKU exacto.</p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${resultsGridMinCol}, 1fr))` }}
                  onWheel={(event) => {
                    if (!event.ctrlKey && !event.metaKey) return;
                    event.preventDefault();
                    setResultsThumbZoom((value) => Math.min(220, Math.max(60, value + (event.deltaY < 0 ? 10 : -10))));
                  }}
                >
                  {filteredShelfResultEntries.map((entry, filteredIdx) => {
                    const row = entry.row;
                    const idx = entry.idx;
                    const imageId = entry.imageId;
                    const cropId = entry.cropId;
                    const finalSku = resultFinalSkuLabel(row);
                    const hasFinalSku = resultHasFinalSku(row);
                    const suggestedSku = resultSuggestedSkuLabel(row);
                    const candidates = resultTopCandidates(row);
                    const resultKey = `${String(imageId ?? "no-image")}::${cropId || idx}`;
                    const selectedSkuForRow = (resultSkuOverrides[resultKey] ?? "").trim()
                      || (hasFinalSku ? finalSku : "")
                      || (suggestedSku !== "-" ? suggestedSku : "")
                      || cropActionSkuId.trim();
                    const rejectedSkuForRow = ((resultSkuOverrides[resultKey] ?? "").trim() || (suggestedSku !== "-" ? suggestedSku : "")).trim();
                    const confidence = resultNumeric(row, "confidence");
                    const scoreDelta = resultNumeric(row, "score_delta");
                    const state = String(row.confidence_state ?? "");
                    const reviewRequired = resultBoolean(row, "review_required");
                    const selectedForTraining = entry.selectKey ? selectedTrainingCropKeySet.has(entry.selectKey) : false;
                    const thresholds = formatThresholdEntries(row.confidence_thresholds);
                    const embeddingDiag = resultEmbeddingDiagnostics(row);
                    const rerunOutcome = rerunOutcomeMeta(row);
                    const pendingReasonLabel = rerunPendingReasonLabel(row);
                    const usedIndexLabel = rerunUsedIndexLabel(row);
                    const trainingSupportLabel = rerunTrainingSupportLabel(row);
                    const matchedAgainstActiveIndex = row.matched_against_active_index;
                    const alreadyPromoted = row.already_promoted_to_dataset === true;
                    const promotedSkuId = resultString(row, "promoted_sku_id");
                    const comparison = row.comparison && typeof row.comparison === "object" ? (row.comparison as Record<string, unknown>) : null;
                    const sourceSnapshot = row.source_job_result_snapshot && typeof row.source_job_result_snapshot === "object"
                      ? (row.source_job_result_snapshot as Record<string, unknown>)
                      : null;
                    const cropPreview = previewUrlOf(row as Record<string, unknown>);
                    const cropDownload = imageId !== null && cropId ? ocrApi.getShelfExtractedCropDownloadUrl(selectedJobId, imageId, cropId) : "";
                    const cropDisplayUrl = cropPreview || cropDownload;
                    const cropZoomUrl = cropDisplayUrl;
                    const segmentationMeta = segmentationMetaOf(row);
                    const segmentationBadge = segmentationVariantBadge(segmentationMeta);
                    return (
                      <div
                        key={`result-card-${idx}`}
                        className={`min-w-0 rounded-lg border p-3 transition-colors ${selectedForTraining ? "border-emerald-300/40 bg-emerald-500/10 ring-1 ring-emerald-400/20" : "border-white/10 bg-slate-950/40"}`}
                        onClick={(event) => {
                          if (!entry.selectKey) return;
                          if ((event.target as HTMLElement).closest("button, a, input, textarea, summary, details")) return;
                          toggleTrainingCropSelection(entry, { shiftKey: event.shiftKey });
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <Checkbox
                              checked={selectedForTraining}
                              disabled={!entry.selectKey}
                              onCheckedChange={() => entry.selectKey && toggleTrainingCropSelection(entry)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Seleccionar crop ${cropId || idx}`}
                            />
                            <div className="min-w-0">
                            <p className="text-[11px] text-slate-400">orden / piso / crop</p>
                            <p className="font-mono text-sm text-slate-100">
                              {resultGlobalOrderLabel(row)} · {resultOrderingLabel(row)} · {firstNonEmptyString(row.crop_id) || String(row.image_id ?? "-")}
                            </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant={selectedForTraining ? "default" : "outline"}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!entry.selectKey) return;
                                toggleTrainingCropSelection(entry, { shiftKey: event.shiftKey });
                              }}
                              disabled={!entry.selectKey}
                            >
                              {selectedForTraining ? "Seleccionado" : "Seleccionar"}
                            </Button>
                            <Badge variant={reviewRequired ? "destructive" : "outline"}>{reviewRequired ? "Revisar" : "Sin revisión"}</Badge>
                            {embeddingDiag?.models?.fallback_used ? <Badge variant="secondary">Fallback</Badge> : null}
                            {resultBoolean(row, "auto_accept_recommended") ? <Badge>Autoaceptable</Badge> : null}
                            {rerunOutcome ? <Badge variant={rerunOutcome.variant}>{rerunOutcome.label}</Badge> : null}
                          </div>
                        </div>

                        <div className="mt-3">
                          <p className="text-[11px] text-slate-400">{hasFinalSku ? "SKU final" : "SKU sugerido"}</p>
                          <p className="text-sm font-semibold text-slate-100">{hasFinalSku ? finalSku : suggestedSku}</p>
                          {!hasFinalSku ? (
                            <p className="mt-1 text-xs text-amber-200">SKU sugerido, requiere revisión.</p>
                          ) : null}
                        </div>

                        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
                          {cropDisplayUrl ? (
                            <button
                              type="button"
                              className="block w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                              onClick={(event) => {
                                event.stopPropagation();
                                openCropLightboxAt(filteredIdx);
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={cropDisplayUrl}
                                alt={cropId || `crop-${idx + 1}`}
                                className="w-full rounded-md bg-slate-950 object-contain"
                                style={{ height: `${resultsThumbHeightPx}px` }}
                              />
                            </button>
                          ) : (
                            <div
                              className="flex items-center justify-center rounded-md border border-dashed border-white/10 text-center text-xs text-slate-400"
                              style={{ height: `${resultsThumbHeightPx}px` }}
                            >
                              Sin preview pública del crop
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {cropZoomUrl ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCropLightboxAt(filteredIdx);
                                }}
                              >
                                Zoom inline
                              </Button>
                            ) : null}
                            {cropDownload ? (
                              <a
                                href={cropDownload}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10"
                              >
                                Descargar crop
                              </a>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (imageId === null || !cropId) return;
                                cropDetailMutation.mutate({ imageId, cropId });
                              }}
                              disabled={imageId === null || !cropId}
                            >
                              Abrir detalle
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={confidenceTone(confidence)}>{confidence !== null ? `confidence ${confidence.toFixed(3)}` : "confidence -"}</Badge>
                          <Badge variant="outline">{scoreDelta !== null ? `delta ${scoreDelta.toFixed(3)}` : "delta -"}</Badge>
                          {state ? confidenceBadge(state) : <Badge variant="outline">sin estado</Badge>}
                          {resultBoolean(row, "manual_review_recommended") ? <Badge variant="destructive">Revisión manual</Badge> : null}
                          {!hasFinalSku ? <Badge variant="secondary">No asignado visualmente</Badge> : null}
                          {embeddingDiag ? <Badge variant={diagnosticsEmbeddingTone(embeddingDiag)}>{diagnosticsEmbeddingUiLabel(embeddingDiag)}</Badge> : null}
                          {usedIndexLabel ? <Badge variant="outline">Índice {usedIndexLabel}</Badge> : null}
                          {matchedAgainstActiveIndex === true ? <Badge variant="outline">Contra índice activo</Badge> : null}
                          {alreadyPromoted ? <Badge variant="secondary">Ya promovido a dataset</Badge> : null}
                          {segmentationMeta.requested || segmentationMeta.applied ? <Badge variant={segmentationBadge.variant}>{segmentationBadge.label}</Badge> : null}
                          {cropHasHardNegativePenalty(row) ? (
                            <Badge variant="secondary" title="Al menos un candidato recibió penalización por hard negative en esta corrida">
                              Ranking ajustado ({cropHardNegativePenalizedCount(row)})
                            </Badge>
                          ) : null}
                        </div>

                        {cropHasHardNegativePenalty(row) ? (
                          <div className="mt-3 rounded-lg border border-violet-300/25 bg-violet-500/5 p-3">
                            <p className="text-xs font-medium text-violet-100">Se aplicó memoria de confusión en este crop</p>
                            <div className="mt-2 space-y-1">
                              {resultTopCandidates(row)
                                .filter((candidate) => hardNegativeAppliedToCandidate(candidate))
                                .map((candidate, hnIdx) => {
                                  const code = candidateSkuCode(candidate) || `penalized_${hnIdx + 1}`;
                                  const anchors = getHardNegativeAnchors(candidate);
                                  return (
                                    <p key={`crop-hn-${idx}-${code}`} className="text-[11px] leading-snug text-violet-50/90">
                                      <span className="font-mono">{code}</span>
                                      {" "}penalizado −{getHardNegativePenaltyApplied(candidate).toFixed(3)}
                                      {anchors.length ? ` · ancla: ${anchors.join(", ")}` : ""}
                                    </p>
                                  );
                                })}
                            </div>
                          </div>
                        ) : null}

                        {(pendingReasonLabel || trainingSupportLabel || rerunOutcome || alreadyPromoted) ? (
                          <details className="mt-3 rounded-lg border border-sky-300/20 bg-sky-500/5 p-3">
                            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-medium text-slate-100 [&::-webkit-details-marker]:hidden">
                              <span>Lectura de rerun</span>
                              {rerunOutcome ? <Badge variant={rerunOutcome.variant}>{rerunOutcome.label}</Badge> : null}
                              <span className="text-[11px] font-normal text-slate-400">expandir</span>
                            </summary>
                            <div className="mt-2 space-y-1 text-xs text-slate-200">
                              {rerunOutcome?.label === "Improved" ? <p>Este crop mejoró respecto a la corrida anterior.</p> : null}
                              {rerunOutcome?.label === "Same" ? <p>Este crop no mostró cambio observable respecto a la corrida anterior.</p> : null}
                              {rerunOutcome?.label === "Regressed" ? <p>Este crop empeoró respecto a la corrida anterior.</p> : null}
                              {pendingReasonLabel ? <p>{pendingReasonLabel}</p> : null}
                              {trainingSupportLabel ? <p>{trainingSupportLabel}</p> : null}
                              {alreadyPromoted ? <p>Este crop ya había sido usado para entrenamiento{promotedSkuId ? ` en ${promotedSkuId}` : ""}.</p> : null}
                            </div>
                          </details>
                        ) : null}

                        {thresholds.length ? (
                          <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                            <summary className="cursor-pointer text-sm font-medium text-slate-100">
                              Thresholds <span className="text-[11px] font-normal text-slate-400">({thresholds.length})</span>
                            </summary>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {thresholds.map((entry) => (
                                <Badge key={`threshold-${idx}-${entry.label}`} variant="outline">
                                  {entry.label}: {entry.value.toFixed(2)}
                                </Badge>
                              ))}
                            </div>
                          </details>
                        ) : null}

                        <details className="mt-3 min-w-0 rounded-lg border border-amber-300/25 bg-amber-500/5 p-3" open>
                          <summary className="cursor-pointer text-sm font-medium leading-snug text-slate-100">
                            Candidatos similares {candidates.length ? <span className="text-[11px] font-normal text-slate-400">({Math.min(candidates.length, 5)})</span> : null}
                          </summary>
                          <div className="mt-2 min-w-0">
                            <SimilarCandidatesPanel
                              candidates={candidates}
                              anchorSku={currentResultSkuValue(resultKey, selectedSkuForRow)}
                              selectedSku={selectedSkuForRow}
                              onSelectCandidate={(code) => setResultSkuOverrides((prev) => ({ ...prev, [resultKey]: code }))}
                              onMarkConfusion={(anchor, negative) => markSkuConfusionMutation.mutate({ anchorSku: anchor, negativeSku: negative })}
                              onMarkAllRemainingConfusions={(anchor, negatives) => markAllSkuConfusionsMutation.mutate({ anchorSku: anchor, negativeSkus: negatives })}
                              isMarking={markSkuConfusionMutation.isPending || markAllSkuConfusionsMutation.isPending}
                              isMarkingAll={markAllSkuConfusionsMutation.isPending}
                              savedConfusionKeys={savedSkuConfusionKeys}
                              maxItems={5}
                            />
                          </div>
                        </details>

                        {resultsBulkFocus && selectedForTraining ? (
                          <p className="mt-3 rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                            Incluido en selección grupal. Usa la barra inferior o el panel de entrenamiento para asignar el SKU a todos.
                          </p>
                        ) : (
                        <details className={`mt-3 rounded-lg border p-3 ${hasFinalSku ? "border-emerald-300/30 bg-emerald-500/10" : "border-amber-300/30 bg-amber-500/10"}`}>
                          <summary className="cursor-pointer text-sm font-medium text-slate-100">
                            {hasFinalSku ? "Reentrenar / reasignar crop" : "Confirmar SKU del crop"}
                            <span className="ml-2 text-[11px] font-normal text-slate-400">{selectedSkuForRow || "sin SKU"}</span>
                          </summary>
                        <div className="mt-3 space-y-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={hasFinalSku ? "default" : "secondary"}>
                                {hasFinalSku ? "Ya asignado" : "Pendiente de confirmar"}
                              </Badge>
                              {rerunOutcome ? <Badge variant={rerunOutcome.variant}>{rerunOutcome.label}</Badge> : null}
                              <p className={`text-[11px] ${hasFinalSku ? "text-emerald-100" : "text-amber-100"}`}>
                                {hasFinalSku ? "SKU destino para reentrenar o reasignar este crop" : "SKU a confirmar para entrenar este crop"}
                              </p>
                            </div>
                            <p className={`mt-1 text-xs ${hasFinalSku ? "text-emerald-50/80" : "text-amber-50/80"}`}>
                              {hasFinalSku
                                ? "Este crop ya tiene un SKU final. Aquí puedes reforzar ese SKU con entrenamiento individual o cambiarlo manualmente."
                                : "Este crop todavía no queda confirmado. Elige el SKU correcto antes de entrenarlo o guardarlo como decisión manual."}
                            </p>
                            {!hasFinalSku && pendingReasonLabel ? (
                              <p className="mt-1 text-xs text-amber-100">Motivo actual: {pendingReasonLabel}</p>
                            ) : null}
                            <Input
                              key={`sku-input-${resultKey}-${selectedSkuForRow}`}
                              ref={(node) => {
                                resultSkuInputRefs.current[resultKey] = node;
                              }}
                              className={`mt-2 ${hasFinalSku ? "border-emerald-300/30 bg-emerald-950/20" : "border-amber-300/30 bg-amber-950/20"}`}
                              defaultValue={selectedSkuForRow}
                              onBlur={(e) => setResultSkuOverrides((prev) => ({ ...prev, [resultKey]: e.target.value }))}
                              placeholder="Buscar o escribir sku_id"
                            />
                            {(() => {
                              const anchorSku = currentResultSkuValue(resultKey, selectedSkuForRow);
                              const pendingConfusions = pendingSkuConfusions(candidates, anchorSku, savedSkuConfusionKeys, 5);
                              if (!anchorSku || !pendingConfusions.length) return null;
                              return (
                                <div className="mt-3 rounded-md border border-amber-300/35 bg-amber-500/10 p-2.5">
                                  <p className="text-[11px] leading-relaxed text-amber-50">
                                    {pendingConfusions.length === 1
                                      ? "Hay 1 candidato similar que aún no está marcado como incorrecto."
                                      : `Hay ${pendingConfusions.length} candidatos similares que aún no están marcados como incorrectos.`}
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-2 h-9 w-full border-amber-300/50 text-xs font-medium text-amber-50 hover:bg-amber-500/20"
                                    disabled={markSkuConfusionMutation.isPending || markAllSkuConfusionsMutation.isPending}
                                    title="No reasigna la imagen. Guarda que estos SKUs se parecen al correcto pero no lo son."
                                    onClick={() => markAllSkuConfusionsMutation.mutate({ anchorSku, negativeSkus: pendingConfusions })}
                                  >
                                    {markAllSkuConfusionsMutation.isPending
                                      ? "Guardando confusiones…"
                                      : pendingConfusions.length === 1
                                        ? "Marcar restante como incorrecto"
                                        : `Marcar ${pendingConfusions.length} restantes como incorrectos`}
                                  </Button>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => {
                                if (imageId === null || !cropId) return;
                                promoteCropMutation.mutate({ imageId, cropId, skuId: currentResultSkuValue(resultKey, selectedSkuForRow) });
                              }}
                              disabled={imageId === null || !cropId || !currentResultSkuValue(resultKey, selectedSkuForRow)}
                            >
                              {hasFinalSku ? "Guardar crop en dataset" : "Confirmar y guardar en dataset"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (imageId === null || !cropId) return;
                                cropDecisionMutation.mutate({ imageId, cropId, decision: "assign_sku", skuId: currentResultSkuValue(resultKey, selectedSkuForRow) });
                              }}
                              disabled={imageId === null || !cropId || !currentResultSkuValue(resultKey, selectedSkuForRow)}
                            >
                              {hasFinalSku ? "Reasignar sin entrenar" : "Confirmar sin entrenar"}
                            </Button>
                            {!hasFinalSku ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (imageId === null || !cropId) return;
                                  cropDecisionMutation.mutate({
                                    imageId,
                                    cropId,
                                    decision: "reject_suggested_sku",
                                    rejectedSkuId: rejectedSkuForRow,
                                  });
                                }}
                                disabled={imageId === null || !cropId || !rejectedSkuForRow}
                              >
                                No es este SKU
                              </Button>
                            ) : null}
                            {!hasFinalSku ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (imageId === null || !cropId) return;
                                  cropDecisionMutation.mutate({ imageId, cropId, decision: "mark_unknown" });
                                }}
                                disabled={imageId === null || !cropId}
                              >
                                Desconocido
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        </details>
                        )}

                        {Array.isArray(row.bbox) ? (
                          <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                            <summary className="cursor-pointer text-sm font-medium text-slate-100">bbox</summary>
                            <p className="mt-2 text-xs text-slate-300">[{row.bbox.join(", ")}]</p>
                          </details>
                        ) : null}

                        {(comparison || sourceSnapshot) ? (
                          <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
                              <span>Antes vs ahora</span>
                              {typeof comparison?.confidence_delta === "number" ? (
                                <Badge variant="outline">Δ {Number(comparison.confidence_delta).toFixed(3)}</Badge>
                              ) : null}
                              {firstNonEmptyString(comparison?.changed_outcome) ? (
                                <Badge variant="secondary">{firstNonEmptyString(comparison?.changed_outcome)}</Badge>
                              ) : null}
                            </summary>
                            <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs text-slate-300">
                              <div className="rounded-md border border-white/10 bg-black/20 p-3">
                                <p className="mb-1 font-semibold text-slate-100">Antes</p>
                                <p>SKU: {firstNonEmptyString(sourceSnapshot?.source_final_sku) || "-"}</p>
                                <p>confidence: {typeof sourceSnapshot?.source_confidence === "number" ? Number(sourceSnapshot.source_confidence).toFixed(3) : "-"}</p>
                                <p>estado: {firstNonEmptyString(sourceSnapshot?.source_confidence_state) || "-"}</p>
                              </div>
                              <div className="rounded-md border border-white/10 bg-black/20 p-3">
                                <p className="mb-1 font-semibold text-slate-100">Ahora</p>
                                <p>SKU: {hasFinalSku ? finalSku : suggestedSku}</p>
                                <p>confidence delta: {typeof comparison?.confidence_delta === "number" ? Number(comparison.confidence_delta).toFixed(3) : "-"}</p>
                                <p>resultado: {firstNonEmptyString(comparison?.changed_outcome) || "-"}</p>
                                <p>salió de revisión: {typeof comparison?.changed_review_required === "boolean" ? (comparison.changed_review_required ? "sí" : "no") : "-"}</p>
                              </div>
                            </div>
                          </details>
                        ) : null}

                        {embeddingDiag ? (
                          <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-slate-100">
                              <span>Panel técnico del crop</span>
                              <Badge variant={diagnosticsEmbeddingTone(embeddingDiag)}>{diagnosticsEmbeddingUiLabel(embeddingDiag)}</Badge>
                            </summary>
                            <div className="mt-3 space-y-3 text-xs text-slate-300">
                              <div className="flex flex-wrap gap-2">
                                <Badge variant={diagnosticsTone(embeddingDiag) === "error" ? "destructive" : diagnosticsTone(embeddingDiag) === "warning" ? "secondary" : "default"}>
                                  {diagnosticsOutcomeLabel(embeddingDiag)}
                                </Badge>
                                {embeddingDiag.total_duration_ms ? <Badge variant="outline">{embeddingDiag.total_duration_ms} ms</Badge> : null}
                              </div>
                              <p>{diagnosticsHeadline(embeddingDiag)}</p>
                              <div className="grid gap-2 md:grid-cols-2">
                                <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Modelos OK</p>
                                  <p>{embeddingDiag.models?.loaded_models?.join(", ") || "-"}</p>
                                </div>
                                <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Modelos con fallo</p>
                                  <p>{embeddingDiag.models?.failed_models?.join(", ") || "-"}</p>
                                </div>
                              </div>
                              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                <p className="text-[11px] uppercase tracking-wide text-slate-400">Estado visual recomendado</p>
                                <p>{diagnosticsEmbeddingUiLabel(embeddingDiag)}</p>
                              </div>
                              {(() => {
                                const orientation = analysisObjectOf(row, "orientation_analysis");
                                const geometry = analysisObjectOf(row, "expected_geometry");
                                const glm = analysisObjectOf(row, "glm_ocr_analysis");
                                const visual = analysisObjectOf(row, "visual_analyst_analysis");
                                const warnings = analysisWarningsOf(row);
                                return (
                                  <>
                                    {orientation ? (
                                      <div className={`rounded-md border p-2 ${orientation.orientation_matches_expected === false ? "border-amber-300/20 bg-amber-500/5" : "border-white/10 bg-slate-950/40"}`}>
                                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Orientación</p>
                                        <p>Observada: {firstNonEmptyString(orientation.observed_orientation) || "-"}</p>
                                        <p>Esperada: {firstNonEmptyString(orientation.expected_orientation) || "-"}</p>
                                        <p>Match: {typeof orientation.orientation_matches_expected === "boolean" ? (orientation.orientation_matches_expected ? "Sí" : "No") : "-"}</p>
                                      </div>
                                    ) : null}
                                    {geometry ? (
                                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Geometría esperada</p>
                                        <p>SKU base: {firstNonEmptyString(geometry.sku_id) || "-"}</p>
                                        <p>Dimensiones: {firstNonEmptyString(geometry.x_ancho) || "-"} x {firstNonEmptyString(geometry.y_alto) || "-"} x {firstNonEmptyString(geometry.z_profundidad) || "-"}</p>
                                      </div>
                                    ) : null}
                                    {glm?.enabled === true ? (
                                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                        <p className="text-[11px] uppercase tracking-wide text-slate-400">OCR GLM</p>
                                        <p>Estado: {analysisStatusLabel(glm)}</p>
                                        <p>{firstNonEmptyString(glm.detected_text, glm.raw_text, glm.summary_message) || "Sin texto publicado"}</p>
                                      </div>
                                    ) : null}
                                    {visual?.enabled === true ? (
                                      <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Analista visual</p>
                                        <p>Estado: {analysisStatusLabel(visual)}</p>
                                        <p>{firstNonEmptyString(visual.summary, visual.visual_summary, visual.message, visual.summary_message) || "Sin resumen publicado"}</p>
                                      </div>
                                    ) : null}
                                    {warnings.length ? (
                                      <div className="rounded-md border border-amber-300/20 bg-amber-500/5 p-2">
                                        <p className="mb-1 text-[11px] uppercase tracking-wide text-amber-200">Analysis warnings</p>
                                        {warnings.map((warning, warningIdx) => (
                                          <p key={`analysis-warning-${idx}-${warningIdx}`}>{firstNonEmptyString(warning.code, warning.message) || "warning"}</p>
                                        ))}
                                      </div>
                                    ) : null}
                                  </>
                                );
                              })()}
                              {(embeddingDiag.warnings?.length ?? 0) > 0 ? (
                                <div className="rounded-md border border-amber-300/20 bg-amber-500/5 p-2">
                                  <p className="mb-1 text-[11px] uppercase tracking-wide text-amber-200">Warnings</p>
                                  {embeddingDiag.warnings?.map((warning, warningIdx) => (
                                    <p key={`warning-${idx}-${warningIdx}`}>{firstNonEmptyString(warning.code, warning.message, warning.action_hint) || "warning"}</p>
                                  ))}
                                </div>
                              ) : null}
                              {(embeddingDiag.errors?.length ?? 0) > 0 ? (
                                <div className="rounded-md border border-red-300/20 bg-red-500/5 p-2">
                                  <p className="mb-1 text-[11px] uppercase tracking-wide text-red-200">Errors</p>
                                  {embeddingDiag.errors?.map((error, errorIdx) => (
                                    <p key={`error-${idx}-${errorIdx}`}>{firstNonEmptyString(error.code, error.message, error.action_hint) || "error"}</p>
                                  ))}
                                </div>
                              ) : null}
                              {(embeddingDiag.stages?.length ?? 0) > 0 ? (
                                <div className="space-y-2">
                                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Stages</p>
                                  {embeddingDiag.stages?.map((stage, stageIdx) => (
                                    <div key={`stage-${idx}-${stageIdx}`} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2">
                                      <div>
                                        <p>{formatStageName(stage.name)}</p>
                                        <p className="text-[11px] text-slate-500">{firstNonEmptyString(stage.code, stage.status) || "-"}</p>
                                      </div>
                                      <Badge variant="outline">{typeof stage.duration_ms === "number" ? `${stage.duration_ms} ms` : "-"}</Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    );
                  })}
                  {!filteredShelfResultEntries.length ? (
                    <div className="col-span-full rounded-lg border border-dashed border-white/15 bg-black/20 p-6 text-center text-sm text-slate-400">
                      Ningún crop coincide con los filtros actuales.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Artifacts por imagen</p>
                  <p className="text-xs text-slate-300">Selecciona una imagen procesada para ver evidencia visual, anotaciones, crops y estructura técnica del resultado.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => artifactsQuery.refetch()}
                  disabled={!selectedJobId || typeof selectedArtifactsImageId !== "number" || shelfArtifactsBlocked}
                >
                  Actualizar artifacts
                </Button>
              </div>

              {shelfJobImages.length ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {shelfJobImages.map((image) => {
                    const selected = image.id === selectedArtifactsImageId;
                    const preview = previewUrlOf(image as unknown as Record<string, unknown>);
                    const hasPreview = previewAvailableOf(image as unknown as Record<string, unknown>);
                    return (
                      <button
                        key={`job-image-${image.id}`}
                        type="button"
                        onClick={() => {
                          if (shelfArtifactsBlocked) return;
                          setSelectedArtifactsImageId(image.id);
                        }}
                        className={`rounded-lg border p-3 text-left transition ${selected ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-slate-950/40 hover:bg-slate-900/50"}`}
                        disabled={shelfArtifactsBlocked}
                      >
                        {hasPreview && preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt={`job image ${image.id}`} className="h-32 w-full rounded-md object-cover" />
                        ) : (
                          <div className="flex h-32 flex-col items-center justify-center rounded-md border border-dashed border-white/10 px-4 text-center text-xs text-slate-400">
                            <span>Sin preview pública</span>
                            <span className="mt-1 text-[11px] text-slate-500">{previewUnavailableReasonOf(image as unknown as Record<string, unknown>)}</span>
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <p className="font-mono text-sm text-slate-100">image_id: {image.id}</p>
                          <Badge variant={selected ? "default" : "outline"}>{selected ? "Seleccionada" : image.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-300">{image.original_name ?? image.image_name ?? "Imagen procesada"}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Aún no hay imágenes procesadas disponibles en este job.</p>
              )}

              {typeof selectedArtifactsImageId === "number" ? (
                <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Detalle técnico de image_id {selectedArtifactsImageId}</p>
                    {artifactsQuery.isLoading ? <Badge variant="secondary">Cargando</Badge> : null}
                  </div>

                  {shelfArtifactsBlocked ? (
                    <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                      El job falló antes de generar artifacts para el image_id actual. Se deshabilitaron crops, detalle y descargas para evitar usar un image_id stale.
                    </div>
                  ) : artifactsQuery.data ? (
                    <div className="mt-3 space-y-4">
                      <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                        <p className="mb-2 text-sm font-semibold">Reportes por imagen</p>
                        <div className="flex flex-wrap gap-2">
                          {artifactReportLinks(artifactsQuery.data as Record<string, unknown>).length ? (
                            artifactReportLinks(artifactsQuery.data as Record<string, unknown>).map((link) => (
                              <span key={`artifact-link-${link.label}`} className="inline-flex gap-1">
                                <a
                                  href={link.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                                >
                                  {link.label}
                                </a>
                                {link.label.toLowerCase().includes("markdown") && (
                                  <button
                                    type="button"
                                    className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-2 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20"
                                    onClick={() => openMdDialog(`Reporte imagen #${selectedArtifactsImageId}`, link.href, `image_${selectedArtifactsImageId}.md`)}
                                  >
                                    Ver
                                  </button>
                                )}
                              </span>
                            ))
                          ) : (
                            <p className="text-sm text-slate-400">No hay reportes HTML/Markdown/JSON publicados para esta imagen todavía.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        {[
                          { label: "Preview principal", value: artifactsQuery.data },
                          { label: "Original", value: (artifactsQuery.data.original_image as Record<string, unknown> | undefined) ?? {} },
                          { label: "Anotada", value: (artifactsQuery.data.annotated_image as Record<string, unknown> | undefined) ?? {} },
                        ].map((item) => {
                          const preview = previewUrlOf(item.value);
                          const hasPreview = previewAvailableOf(item.value);
                          return (
                            <div key={`artifact-block-${item.label}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                              <p className="mb-2 text-xs text-slate-400">{item.label}</p>
                              {hasPreview && preview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={preview} alt={item.label} className="h-44 w-full rounded-md object-cover" />
                              ) : (
                                <div className="flex h-44 flex-col items-center justify-center rounded-md border border-dashed border-white/10 px-4 text-center text-xs text-slate-400">
                                  <span>Sin preview pública</span>
                                  <span className="mt-1 text-[11px] text-slate-500">{previewUnavailableReasonOf(item.value)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <details className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3">
                        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                          <div>
                            <p className="text-sm font-semibold text-slate-100">Crops extraídos</p>
                            <p className="text-xs text-slate-300">
                              {extractedCropsQuery.data?.length ?? 0} crops · expandir para ver galería, curar y descargar ZIP
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                            {typeof selectedArtifactsImageId === "number" ? (
                              <a
                                href={ocrApi.getShelfExtractedCropsZipUrl(selectedJobId, selectedArtifactsImageId)}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                              >
                                Descargar ZIP
                              </a>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => refreshReportsMutation.mutate()}
                              disabled={!selectedJobId || refreshReportsMutation.isPending}
                            >
                              Regenerar reportes
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                extractedCropsQuery.refetch();
                                extractedCropsManifestQuery.refetch();
                              }}
                              disabled={!selectedJobId || typeof selectedArtifactsImageId !== "number"}
                            >
                              Actualizar crops
                            </Button>
                          </div>
                        </summary>

                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
                          <div>
                            <Label>SKU destino para curación/promoción</Label>
                            <Input
                              value={cropActionSkuId}
                              onChange={(e) => setCropActionSkuId(e.target.value)}
                              placeholder={selectedSkuId || skuImageBrowserSkuId || testSkuId || "SKU_123"}
                            />
                          </div>
                          <div>
                            <Label>Nota opcional</Label>
                            <Input
                              value={cropActionNote}
                              onChange={(e) => setCropActionNote(e.target.value)}
                              placeholder="Asignado o promovido desde resultados"
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-4">
                          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <p className="text-xs text-slate-400">Modo reportado</p>
                            <p className="text-sm font-semibold text-slate-100">{processingMode}</p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <p className="text-xs text-slate-400">Crops extraídos</p>
                            <p className="text-lg font-semibold text-slate-100">{extractedCropsQuery.data?.length ?? 0}</p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <p className="text-xs text-slate-400">Pisos detectados</p>
                            <p className="text-lg font-semibold text-slate-100">{String((extractedCropsManifestQuery.data?.total_trays ?? extractedCropsManifestQuery.data?.tray_count ?? trayRows.length ?? 0))}</p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <p className="text-xs text-slate-400">Calidad baja</p>
                            <p className="text-lg font-semibold text-slate-100">
                              {(extractedCropsQuery.data ?? []).filter((crop) => Boolean(crop.quality?.is_low_quality)).length}
                            </p>
                          </div>
                        </div>

                        {extractedCropsQuery.error instanceof HttpError ? (
                          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/5 p-3 text-sm text-amber-100">
                            Este image_id no devolvió crops extraídos todavía: {extractedCropsQuery.error.detail}
                          </div>
                        ) : null}

                        {(extractedCropsQuery.data ?? []).length ? (
                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {(extractedCropsQuery.data ?? []).map((crop: ShelfExtractedCrop, idx) => {
                              const cropPreview = previewUrlOf(crop as Record<string, unknown>);
                              const cropId = firstNonEmptyString(crop.crop_id) || `crop_${idx + 1}`;
                              const cropDownload = firstNonEmptyString(crop.download_url) || (typeof selectedArtifactsImageId === "number" ? ocrApi.getShelfExtractedCropDownloadUrl(selectedJobId, selectedArtifactsImageId, cropId) : "");
                              const segmentationMeta = segmentationMetaOf(crop as Record<string, unknown>);
                              const segmentationBadge = segmentationVariantBadge(segmentationMeta);
                              return (
                                <div key={`extracted-crop-${cropId}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                  {previewAvailableOf(crop as Record<string, unknown>) && cropPreview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={cropPreview} alt={cropId} className="h-36 w-full rounded-md object-cover" />
                                  ) : (
                                    <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-white/10 text-xs text-slate-400">
                                      Sin preview
                                    </div>
                                  )}
                                  <div className="mt-3 space-y-1 text-xs text-slate-300">
                                    <p><span className="text-slate-400">crop_id:</span> {cropId}</p>
                                    <p><span className="text-slate-400">piso / orden:</span> {crop.tray_index ?? "-"} / {crop.order_in_tray ?? crop.position_in_tray ?? "-"}</p>
                                    <p><span className="text-slate-400">label:</span> {firstNonEmptyString(crop.ordering_label) || "-"}</p>
                                    <p><span className="text-slate-400">bbox:</span> {Array.isArray(crop.bbox) ? crop.bbox.join(", ") : "-"}</p>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge variant={segmentationBadge.variant}>{segmentationBadge.label}</Badge>
                                    {segmentationMeta.applied ? <Badge>Segmentación aplicada</Badge> : null}
                                    {segmentationMeta.requested && !segmentationMeta.available ? <Badge variant="secondary">Sin máscara, se usó bbox</Badge> : null}
                                  </div>
                                  {segmentationMeta.reason ? (
                                    <p className="mt-2 text-xs text-slate-400">{segmentationMeta.reason}</p>
                                  ) : null}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {cropDownload ? (
                                      <a
                                        href={cropDownload}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                                      >
                                        Descargar
                                      </a>
                                    ) : null}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (typeof selectedArtifactsImageId !== "number") return;
                                        cropDetailMutation.mutate({ imageId: selectedArtifactsImageId, cropId });
                                      }}
                                    >
                                      Ver detalle
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (typeof selectedArtifactsImageId !== "number") return;
                                        cropDecisionMutation.mutate({ imageId: selectedArtifactsImageId, cropId, decision: "assign_sku" });
                                      }}
                                    >
                                      Asignar SKU
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (typeof selectedArtifactsImageId !== "number") return;
                                        cropDecisionMutation.mutate({ imageId: selectedArtifactsImageId, cropId, decision: "mark_unknown" });
                                      }}
                                    >
                                      Marcar unknown
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (typeof selectedArtifactsImageId !== "number") return;
                                        cropDecisionMutation.mutate({ imageId: selectedArtifactsImageId, cropId, decision: "discard_crop" });
                                      }}
                                    >
                                      Descartar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (typeof selectedArtifactsImageId !== "number") return;
                                        promoteCropMutation.mutate({ imageId: selectedArtifactsImageId, cropId });
                                      }}
                                    >
                                      Promover a SKU
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-400">Si este job se corrió en extracción y ya terminó, aquí deberían aparecer los crops y el botón de descarga ZIP.</p>
                        )}

                        {Object.keys(extractedCropsManifestQuery.data ?? {}).length ? (
                          <details className="mt-4 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-100">Manifest de extracción</summary>
                            <pre className="mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify(extractedCropsManifestQuery.data, null, 2)}</pre>
                          </details>
                        ) : null}

                        {selectedCropDetail ? (
                          <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
                            <p className="mb-2 text-sm font-semibold">Detalle del crop seleccionado</p>
                            <div className="mb-3 grid gap-3 md:grid-cols-[240px_1fr]">
                              <div className="space-y-2">
                                {previewUrlOf(selectedCropDetail) ? (
                                  <a href={previewUrlOf(selectedCropDetail) ?? ""} target="_blank" rel="noreferrer" className="block">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={previewUrlOf(selectedCropDetail) ?? ""}
                                      alt={firstNonEmptyString(selectedCropDetail.crop_id, "crop-seleccionado")}
                                      className="h-56 w-full rounded-md bg-slate-950 object-contain"
                                    />
                                  </a>
                                ) : (
                                  <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-white/10 text-center text-xs text-slate-400">
                                    Sin preview disponible para este crop
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  {previewUrlOf(selectedCropDetail) ? (
                                    <a
                                      href={previewUrlOf(selectedCropDetail) ?? ""}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/15"
                                    >
                                      Abrir grande
                                    </a>
                                  ) : null}
                                  {firstNonEmptyString(selectedCropDetail.download_url) ? (
                                    <a
                                      href={firstNonEmptyString(selectedCropDetail.download_url)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10"
                                    >
                                      Descargar
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                              <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                <p className="text-xs text-slate-400">Resumen visual</p>
                                <div className="mt-2 space-y-1 text-sm text-slate-200">
                                  <p><span className="text-slate-400">crop_id:</span> {firstNonEmptyString(selectedCropDetail.crop_id) || "-"}</p>
                                  <p><span className="text-slate-400">SKU final:</span> {firstNonEmptyString(selectedCropDetail.final_sku, selectedCropDetail.suggested_sku_id) || "-"}</p>
                                  <p><span className="text-slate-400">confidence:</span> {typeof selectedCropDetail.confidence === "number" ? selectedCropDetail.confidence.toFixed(3) : "-"}</p>
                                  <p><span className="text-slate-400">score_delta:</span> {typeof selectedCropDetail.score_delta === "number" ? selectedCropDetail.score_delta.toFixed(3) : "-"}</p>
                                  <p><span className="text-slate-400">estado:</span> {firstNonEmptyString(selectedCropDetail.confidence_state) || "-"}</p>
                                </div>
                              </div>
                            </div>
                            <div className="mb-3 grid gap-3 md:grid-cols-2">
                              {(() => {
                                const orientation = analysisObjectOf(selectedCropDetail, "orientation_analysis");
                                if (!orientation) return null;
                                return renderAnalysisInfoCard(
                                  "Orientación",
                                  <>
                                    <p>Observada: {firstNonEmptyString(orientation.observed_orientation) || "-"}</p>
                                    <p>Esperada: {firstNonEmptyString(orientation.expected_orientation) || "-"}</p>
                                    <p>Match: {typeof orientation.orientation_matches_expected === "boolean" ? (orientation.orientation_matches_expected ? "Sí" : "No") : "-"}</p>
                                  </>,
                                  orientation.orientation_matches_expected === false ? "warning" : "ok",
                                );
                              })()}
                              {(() => {
                                const glm = analysisObjectOf(selectedCropDetail, "glm_ocr_analysis");
                                if (!glm || glm.enabled !== true) return null;
                                return renderAnalysisInfoCard(
                                  "OCR GLM",
                                  <>
                                    <p>Estado: {analysisStatusLabel(glm)}</p>
                                    <p>{firstNonEmptyString(glm.detected_text, glm.raw_text, glm.summary_message) || "Sin texto publicado"}</p>
                                  </>,
                                );
                              })()}
                            </div>
                            <pre className="max-h-72 overflow-auto text-xs">{JSON.stringify(selectedCropDetail, null, 2)}</pre>
                          </div>
                        ) : null}
                      </details>

                      {showResultsGrid && selectedArtifactsResults.length ? (
                        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                          <p className="mb-3 text-sm font-semibold">Lectura técnica por crop</p>
                          <div className="space-y-3">
                            {selectedArtifactsResults.map((row, idx) => {
                              const diag = resultEmbeddingDiagnostics(row);
                              const thresholdEntries = formatThresholdEntries(row.confidence_thresholds);
                              return (
                                <details key={`artifact-result-${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-3" open={idx === 0}>
                                  <summary className="cursor-pointer">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="font-medium text-slate-100">{resultGlobalOrderLabel(row)} · {resultOrderingLabel(row)} · {resultFinalSkuLabel(row)}</p>
                                        <p className="text-xs text-slate-400">{firstNonEmptyString(row.crop_id) || "crop"} · {resultTrayLabel(row)} · {resultPositionLabel(row)}</p>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <Badge variant={confidenceTone(resultNumeric(row, "confidence"))}>{formatPercentLike(resultNumeric(row, "confidence"))}</Badge>
                                        <Badge variant="outline">Δ {formatPercentLike(resultNumeric(row, "score_delta"))}</Badge>
                                        {String(row.confidence_state ?? "") ? confidenceBadge(String(row.confidence_state ?? "")) : null}
                                        {diag?.models?.fallback_used ? <Badge variant="secondary">Fallback</Badge> : null}
                                      </div>
                                    </div>
                                  </summary>
                                  <div className="mt-3 grid gap-3 xl:grid-cols-[1fr,0.9fr]">
                                    <div className="space-y-3">
                                      <div className="grid gap-2 md:grid-cols-2">
                                        <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Top candidate</p>
                                          <p>{(() => {
                                            const top = resultTopCandidates(row)[0];
                                            return top ? `${firstNonEmptyString(top.sku_id, top.sku_code, top.sku_name) || "top_1"} ${typeof top.score === "number" ? `(${top.score.toFixed(3)})` : ""}` : "-";
                                          })()}</p>
                                        </div>
                                        <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Decisión sugerida</p>
                                          <p>{resultBoolean(row, "auto_accept_recommended") ? "Autoaceptable" : resultBoolean(row, "manual_review_recommended") ? "Revisión manual" : "Sin recomendación explícita"}</p>
                                        </div>
                                      </div>
                                      {thresholdEntries.length ? (
                                        <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                                          <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Thresholds</p>
                                          <div className="flex flex-wrap gap-2">
                                            {thresholdEntries.map((entry) => (
                                              <Badge key={`artifact-threshold-${idx}-${entry.label}`} variant="outline">
                                                {entry.label}: {entry.value.toFixed(2)}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="space-y-3">
                                      {diag ? (
                                        <div className="rounded-md border border-white/10 bg-slate-950/40 p-3">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant={diagnosticsTone(diag) === "error" ? "destructive" : diagnosticsTone(diag) === "warning" ? "secondary" : "default"}>
                                              {diagnosticsOutcomeLabel(diag)}
                                            </Badge>
                                            {diag.request_id ? <Badge variant="outline">{diag.request_id}</Badge> : null}
                                          </div>
                                          <p className="mt-2 text-xs text-slate-300">{diagnosticsHeadline(diag)}</p>
                                          <p className="mt-2 text-[11px] text-slate-500">
                                            loaded: {diag.models?.loaded_models?.join(", ") || "-"} · failed: {diag.models?.failed_models?.join(", ") || "-"}
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="rounded-md border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-400">
                                          Este crop no trae embedding_diagnostics.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </details>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <ShelfAuditSummary data={artifactsQuery.data as Record<string, unknown>} />
                      <ShelfConfigSnapshot data={artifactsQuery.data as Record<string, unknown>} />

                      {selectedArtifactsResults.map((row, idx) => (
                        <ShelfCropAuditDetail key={`crop-audit-${idx}`} result={row as unknown as Record<string, unknown>} defaultOpen={idx === 0} />
                      ))}

                      <details className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                        <summary className="cursor-pointer text-xs text-slate-400">JSON crudo (debug)</summary>
                        <div className="mt-2 grid gap-4 md:grid-cols-2">
                          <pre className="max-h-72 overflow-auto text-xs">
                            {JSON.stringify(selectedArtifactsResults.length ? selectedArtifactsResults : artifactsQuery.data, null, 2)}
                          </pre>
                          <pre className="max-h-72 overflow-auto text-xs">
                            {JSON.stringify(
                              {
                                summary: artifactsQuery.data.summary ?? {},
                                image_artifacts: artifactsQuery.data.image_artifacts ?? {},
                                detections: artifactsQuery.data.detections ?? [],
                                primary_crops: artifactsQuery.data.primary_crops ?? [],
                                support_memory: artifactsQuery.data.support_memory ?? [],
                                analysis_trace: artifactsQuery.data.analysis_trace ?? [],
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      </details>
                    </div>
                  ) : artifactsQuery.error instanceof HttpError ? (
                    <p className="mt-3 text-sm text-amber-300">No se pudieron cargar los artifacts: {artifactsQuery.error.detail}</p>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">Selecciona una imagen para inspeccionar sus artifacts.</p>
                  )}
                </div>
              ) : null}
            </div>

            <ShelfAssistEngineUsedCard snapshot={assistEngineUsedSnapshot} />

            <ShelfEventsTimeline
              events={(eventsQuery.data ?? []) as JobEvent[]}
              metrics={(metricsQuery.data?.metrics ?? []) as { id: number | string; step: string; duration_ms: number }[]}
            />
          </CardContent>
        </Card>
      ) : null}

      {tab === "skus" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Catalogo SKU (manual + carga masiva)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Workspace SKU</p>
                  <p className="mt-1 text-xs text-slate-300">
                    La pestaña creció, así que ahora la trabajamos por contexto: catálogo, cargas y entrenamiento, dataset activo y pruebas.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">SKU activo: {selectedSkuId || skuImageBrowserSkuId || testSkuId || "ninguno"}</Badge>
                  <Badge variant="outline">Imagenes activas: {currentSkuImageIds.length}</Badge>
                  <Badge variant="outline">Diagnosticos recientes: {recentTrainingDiagnostics.length}</Badge>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant={skuWorkspaceTab === "catalogo" ? "default" : "outline"} onClick={() => setSkuWorkspaceTab("catalogo")}>Catalogo</Button>
                <Button variant={skuWorkspaceTab === "cargas" ? "default" : "outline"} onClick={() => setSkuWorkspaceTab("cargas")}>Cargas y entrenamiento</Button>
                <Button variant={skuWorkspaceTab === "dataset" ? "default" : "outline"} onClick={() => setSkuWorkspaceTab("dataset")}>Dataset activo</Button>
                <Button variant={skuWorkspaceTab === "pruebas" ? "default" : "outline"} onClick={() => setSkuWorkspaceTab("pruebas")}>Pruebas</Button>
              </div>
            </div>

            {skuWorkspaceTab === "pruebas" ? (
            <>
            <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-950/60 to-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Pruebas · validación puntual de SKU</p>
                  <p className="text-xs text-slate-300">Lanza un job de prueba con escena completa o evalúa un crop aislado. Elige el SKU desde el catálogo o escríbelo directamente.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">SKU: {testSkuId || activeSkuWorkspaceId || "no seleccionado"}</Badge>
                  {lastSkuTestJob?.job_id ? <Badge variant="secondary">Último job: {lastSkuTestJob.job_id}</Badge> : null}
                  {lastEvaluateCrop ? <Badge variant="outline">Última evaluación lista</Badge> : null}
                  <Button variant="outline" size="sm" onClick={() => skusQuery.refetch()} disabled={skusQuery.isFetching}>Refrescar catálogo</Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-slate-100">Buscar SKU para probar</p>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_auto_auto]">
                <Input value={skuCatalogSearch} onChange={(e) => setSkuCatalogSearch(e.target.value)} placeholder="Buscar SKU, nombre, marca, categoría..." />
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={String(skuCatalogPageSize)} onChange={(e) => setSkuCatalogPageSize(Number(e.target.value))}>
                  <option value="12">12 / página</option>
                  <option value="24">24 / página</option>
                  <option value="48">48 / página</option>
                </select>
                <div className="flex items-center justify-center rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-300">Pág. {skuCatalogPage}/{catalogTotalPages}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <select className="h-9 rounded-md border border-white/10 bg-slate-900 px-2 text-xs" value={skuCatalogCategoryFilter} onChange={(e) => setSkuCatalogCategoryFilter(e.target.value)}>
                  <option value="">Todas las categorías</option>
                  {skuCatalogOptions.categories.map((value) => <option key={`pr-cat-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-9 rounded-md border border-white/10 bg-slate-900 px-2 text-xs" value={skuCatalogBrandFilter} onChange={(e) => setSkuCatalogBrandFilter(e.target.value)}>
                  <option value="">Todas las marcas</option>
                  {skuCatalogOptions.brands.map((value) => <option key={`pr-brand-${value}`} value={value}>{value}</option>)}
                </select>
                <label className="ml-auto flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 text-xs text-slate-200">
                  <Switch checked={skuCatalogOnlyActive} onCheckedChange={setSkuCatalogOnlyActive} />
                  Solo activos
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{paginatedCatalogSkus.length} de {filteredCatalogSkus.length} SKUs</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((p) => Math.max(1, p - 1))} disabled={skuCatalogPage <= 1}>Anterior</Button>
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((p) => Math.min(catalogTotalPages, p + 1))} disabled={skuCatalogPage >= catalogTotalPages}>Siguiente</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
              <div className="max-h-[72vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/50 p-2">
                <p className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Catálogo · elegir SKU</p>
                <div className="space-y-2 p-1">
                  {paginatedCatalogSkus.map((sku) => {
                    const code = getSkuCodeValue(sku);
                    const selected = code === testSkuId || code === activeSkuWorkspaceId;
                    const coverage = resolveSkuDatasetCoverage(sku);
                    return (
                      <button
                        key={`pr-sku-${code || sku.id}`}
                        type="button"
                        onClick={() => code && selectCatalogSku(code)}
                        className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-cyan-300/40 bg-cyan-500/10 ring-1 ring-cyan-400/20" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-sm text-slate-100">{code || "—"}</p>
                          <Badge variant={coverage.images > 0 ? "default" : "secondary"}>{coverage.images} img</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-300">{getSkuNameValue(sku) || "Sin nombre"}</p>
                      </button>
                    );
                  })}
                  {!paginatedCatalogSkus.length ? <p className="px-2 py-6 text-center text-sm text-slate-400">Ningún SKU coincide con los filtros.</p> : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Job de prueba SKU</p>
                      <p className="text-xs text-slate-300">Crea un job completo y revisa resultados, artifacts, events y metrics.</p>
                    </div>
                    <Badge variant="outline">POST /shelf/sku-test</Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <Label>sku_id</Label>
                      <Input value={testSkuId} onChange={(e) => setTestSkuId(e.target.value)} placeholder="KALIPTO_DESINF_1L" />
                    </div>
                    <div>
                      <Label>id_pdv</Label>
                      <Input value={testIdPdv} onChange={(e) => setTestIdPdv(e.target.value)} placeholder="PDV_TEST_001" />
                    </div>
                    <div>
                      <Label>imagen local (ruta)</Label>
                      <Input value={testImagePath} onChange={(e) => setTestImagePath(e.target.value)} placeholder="C:\\imagenes\\escena_prueba.jpg" />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Input type="file" accept="image/*" onChange={(e) => setTestFiles(Array.from(e.target.files ?? []))} />
                      <p className="text-xs text-slate-400">Si eliges archivo desde explorador, el frontend hace upload y usa `image_file_id` automáticamente.</p>
                    </div>
                    <Button onClick={() => createSkuTestJobMutation.mutate()} disabled={createSkuTestJobMutation.isPending}>
                      Probar SKU
                    </Button>
                  </div>
                  {lastSkuTestJob ? (
                    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                      <p><span className="text-slate-400">job_id:</span> <span className="font-mono">{lastSkuTestJob.job_id}</span></p>
                      <p><span className="text-slate-400">expected_sku_id:</span> {lastSkuTestJob.expected_sku_id ?? "-"}</p>
                      <p><span className="text-slate-400">test_mode:</span> {lastSkuTestJob.test_mode ?? "-"}</p>
                      {(lastSkuTestJob.recommended_next_steps ?? []).length ? (
                        <div className="mt-2">
                          <p className="text-slate-400">siguientes pasos sugeridos:</p>
                          <div className="mt-1 space-y-1 text-xs text-slate-300">
                            {(lastSkuTestJob.recommended_next_steps ?? []).map((step, idx) => <p key={`next-step-${idx}`}>{step}</p>)}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setTab("results")}>Ir a resultados</Button>
                        <Button size="sm" variant="outline" onClick={() => { jobQuery.refetch(); resultsQuery.refetch(); eventsQuery.refetch(); metricsQuery.refetch(); }}>Actualizar job</Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Evaluar crop directo</p>
                      <p className="text-xs text-slate-300">Imagen recortada → candidatos SKU sin crear un job completo.</p>
                    </div>
                    <Badge variant="outline">POST /shelf/evaluate-crop</Badge>
                  </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>image_path</Label>
                    <Input value={evaluateCropPath} onChange={(e) => setEvaluateCropPath(e.target.value)} placeholder="C:\\crops\\producto_01.jpg" />
                  </div>
                  <div>
                    <Label>categoria_hint</Label>
                    <Input value={evaluateCropCategoriaHint} onChange={(e) => setEvaluateCropCategoriaHint(e.target.value)} placeholder="LIMPIADORES LIQUIDOS" />
                  </div>
                  <div>
                    <Label>top_k_skus</Label>
                    <Input value={evaluateCropTopK} onChange={(e) => setEvaluateCropTopK(e.target.value)} placeholder="5" />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Input type="file" accept="image/*" onChange={(e) => setEvaluateCropFiles(Array.from(e.target.files ?? []))} />
                    <p className="text-xs text-slate-400">Si eliges archivo desde explorador, el frontend lo sube y evalúa usando `image_file_id`.</p>
                  </div>
                  <Button onClick={() => evaluateCropMutation.mutate()} disabled={evaluateCropMutation.isPending}>
                    Evaluar crop
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  El assist de SKU (<span className="font-mono">ocr_sku_assist</span>) se gobierna desde Índice → Config y corre automáticamente si está habilitado.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                    <Switch checked={evaluateCropOrientationEnabled} onCheckedChange={setEvaluateCropOrientationEnabled} />
                    Orientación
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200" title="analysis.glm_ocr informativo. Distinto de ocr_sku_assist (config shelf).">
                    <Switch checked={evaluateCropGlmOcrEnabled} onCheckedChange={setEvaluateCropGlmOcrEnabled} />
                    GLM-OCR informativo
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                    <Switch checked={evaluateCropVisualAnalystEnabled} onCheckedChange={setEvaluateCropVisualAnalystEnabled} />
                    Analista visual opcional
                  </label>
                </div>

                {lastEvaluateCrop ? (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
                      <div className="space-y-3">
                        {previewAvailableOf(lastEvaluateCrop as Record<string, unknown>) && previewUrlOf(lastEvaluateCrop as Record<string, unknown>) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewUrlOf(lastEvaluateCrop as Record<string, unknown>) ?? ""}
                            alt="Crop evaluado"
                            className="h-56 w-full rounded-md bg-slate-950 object-contain"
                          />
                        ) : (
                          <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-white/10 text-center text-xs text-slate-400">
                            {previewUnavailableReasonOf(lastEvaluateCrop as Record<string, unknown>)}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {previewUrlOf(lastEvaluateCrop as Record<string, unknown>) ? (
                            <a
                              href={previewUrlOf(lastEvaluateCrop as Record<string, unknown>) ?? ""}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                            >
                              Abrir imagen
                            </a>
                          ) : null}
                          {firstNonEmptyString((lastEvaluateCrop as Record<string, unknown>).download_url) ? (
                            <a
                              href={firstNonEmptyString((lastEvaluateCrop as Record<string, unknown>).download_url)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                            >
                              Descargar
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={confidenceTone(lastEvaluateCrop.confidence)}>{typeof lastEvaluateCrop.confidence === "number" ? `confidence ${lastEvaluateCrop.confidence.toFixed(3)}` : "confidence -"}</Badge>
                          <Badge variant="outline">{typeof lastEvaluateCrop.score_delta === "number" ? `delta ${lastEvaluateCrop.score_delta.toFixed(3)}` : "delta -"}</Badge>
                          {lastEvaluateCrop.confidence_state ? confidenceBadge(lastEvaluateCrop.confidence_state) : <Badge variant="outline">sin estado</Badge>}
                          <Badge variant={diagnosticsEmbeddingTone(lastEvaluateCrop.embedding_diagnostics ?? null)}>{diagnosticsEmbeddingUiLabel(lastEvaluateCrop.embedding_diagnostics ?? null)}</Badge>
                          {analysisModulesOf(lastEvaluateCrop).map((moduleName) => <Badge key={`eval-module-${moduleName}`} variant="outline">{moduleName}</Badge>)}
                        </div>
                        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                          <p className="text-xs text-slate-400">Sugerencia principal</p>
                          <p className="mt-1 text-lg font-semibold text-slate-100">{firstNonEmptyString(lastEvaluateCrop.suggested_sku_id, resultFinalSkuLabel(lastEvaluateCrop as Record<string, unknown>)) || "-"}</p>
                          <p className="mt-1 text-xs text-slate-300">mode: {firstNonEmptyString(lastEvaluateCrop.mode) || "-"} · modelos: {formatModelNames(lastEvaluateCrop.models_used)}</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {(() => {
                            const orientation = analysisObjectOf(lastEvaluateCrop, "orientation_analysis");
                            if (!orientation) return null;
                            const mismatch = orientation.orientation_matches_expected === false;
                            return renderAnalysisInfoCard(
                              "Orientación",
                              <>
                                <p>Observada: {analysisStatusLabel({ observed_orientation: orientation.observed_orientation })}</p>
                                <p>Esperada: {analysisStatusLabel({ expected_orientation: orientation.expected_orientation })}</p>
                                <p>Match: {typeof orientation.orientation_matches_expected === "boolean" ? (orientation.orientation_matches_expected ? "Sí" : "No") : "-"}</p>
                              </>,
                              mismatch ? "warning" : "ok",
                            );
                          })()}
                          {(() => {
                            const geometry = analysisObjectOf(lastEvaluateCrop, "expected_geometry");
                            if (!geometry) return null;
                            return renderAnalysisInfoCard(
                              "Geometría esperada",
                              <>
                                <p>SKU base: {firstNonEmptyString(geometry.sku_id) || "-"}</p>
                                <p>{firstNonEmptyString(geometry.expected_orientation) ? `Orientación esperada: ${firstNonEmptyString(geometry.expected_orientation)}` : "Sin orientación esperada"}</p>
                                <p>Dimensiones: {firstNonEmptyString(geometry.x_ancho) || "-"} x {firstNonEmptyString(geometry.y_alto) || "-"} x {firstNonEmptyString(geometry.z_profundidad) || "-"}</p>
                              </>,
                            );
                          })()}
                        </div>
                        {(() => {
                          const glm = analysisObjectOf(lastEvaluateCrop, "glm_ocr_analysis");
                          const visual = analysisObjectOf(lastEvaluateCrop, "visual_analyst_analysis");
                          const warnings = analysisWarningsOf(lastEvaluateCrop);
                          return (
                            <>
                              {glm?.enabled === true ? renderAnalysisInfoCard(
                                "OCR GLM",
                                <>
                                  <p>Estado: {analysisStatusLabel(glm)}</p>
                                  <p>{firstNonEmptyString(glm.detected_text, glm.raw_text, glm.summary_message) || "Sin texto publicado"}</p>
                                </>,
                              ) : null}
                              {visual?.enabled === true ? renderAnalysisInfoCard(
                                "Analista visual",
                                <>
                                  <p>Estado: {analysisStatusLabel(visual)}</p>
                                  <p>{firstNonEmptyString(visual.summary, visual.visual_summary, visual.message, visual.summary_message) || "Sin resumen publicado"}</p>
                                </>,
                              ) : null}
                              {warnings.length ? (
                                <div className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
                                  <p className="text-xs text-amber-200">Warnings de análisis</p>
                                  <div className="mt-2 space-y-1 text-sm text-amber-50">
                                    {warnings.map((warning, idx) => (
                                      <p key={`eval-warning-${idx}`}>{firstNonEmptyString(warning.code, warning.message) || "warning"}</p>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                        <ShelfCropAuditDetail
                          result={{
                            crop_id: "evaluate-crop",
                            ocr_sku_assist: (lastEvaluateCrop as Record<string, unknown>).ocr_sku_assist,
                            top_candidates: lastEvaluateCrop.top_candidates ?? [],
                          }}
                          defaultOpen
                        />

                        {(lastEvaluateCrop.top_candidates ?? []).length ? (
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="mb-2 text-sm font-semibold">Candidatos similares</p>
                            <SimilarCandidatesPanel
                              candidates={(lastEvaluateCrop.top_candidates ?? []) as Record<string, unknown>[]}
                              anchorSku={testSkuId.trim() || selectedSkuId.trim() || skuImageBrowserSkuId.trim()}
                              selectedSku={testSkuId.trim()}
                              onSelectCandidate={(code) => {
                                setTestSkuId(code);
                                setSelectedSkuId(code);
                                setCropActionSkuId(code);
                                setCropActionSkuSearch(code);
                              }}
                              onMarkConfusion={(anchor, negative) => markSkuConfusionMutation.mutate({ anchorSku: anchor, negativeSku: negative })}
                              onMarkAllRemainingConfusions={(anchor, negatives) => markAllSkuConfusionsMutation.mutate({ anchorSku: anchor, negativeSkus: negatives })}
                              isMarking={markSkuConfusionMutation.isPending || markAllSkuConfusionsMutation.isPending}
                              isMarkingAll={markAllSkuConfusionsMutation.isPending}
                              savedConfusionKeys={savedSkuConfusionKeys}
                              maxItems={5}
                            />
                          </div>
                        ) : null}
                        {lastEvaluateCrop.embedding_diagnostics ? (
                          <details className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-100">Diagnóstico técnico (embeddings)</summary>
                            <p className="mt-2 text-xs text-slate-300">{diagnosticsHeadline(lastEvaluateCrop.embedding_diagnostics)}</p>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
                </div>
              </div>
            </div>
            </>
            ) : null}

            {skuWorkspaceTab === "catalogo" ? (
            <>
            <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-950/60 to-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Catálogo · explorar y reutilizar SKUs</p>
                  <p className="text-xs text-slate-300">Busca en el catálogo, revisa la ficha completa y salta al dataset, cargas o pruebas sin perder contexto.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Total BD: {skuCategoriesQuery.data ? skuCategoriesQuery.data.reduce((sum, c) => sum + c.count_active, 0) : (skusQuery.data ?? []).length}</Badge>
                  <Badge variant="outline">Cargados: {(skusQuery.data ?? []).length}</Badge>
                  <Badge variant="outline">{datasetAccountTotals.skusWithImages} con imágenes</Badge>
                  <Badge variant="outline">Visibles: {filteredCatalogSkus.length}</Badge>
                  <Button variant="outline" size="sm" onClick={() => { skusQuery.refetch(); accountDatasetCoverageQuery.refetch(); }} disabled={skusQuery.isFetching}>Refrescar</Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-slate-100">Buscar y filtrar</p>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_auto_auto]">
                <Input value={skuCatalogSearch} onChange={(e) => setSkuCatalogSearch(e.target.value)} placeholder="Buscar SKU, nombre, marca, categoría, fabricante..." />
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={String(skuCatalogPageSize)} onChange={(e) => setSkuCatalogPageSize(Number(e.target.value))}>
                  <option value="12">12 / página</option>
                  <option value="24">24 / página</option>
                  <option value="48">48 / página</option>
                </select>
                <div className="flex items-center justify-center rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-300">Pág. {skuCatalogPage}/{catalogTotalPages}</div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogCategoryFilter} onChange={(e) => setSkuCatalogCategoryFilter(e.target.value)}>
                  <option value="">Todas las categorías</option>
                  {skuCatalogOptions.categories.map((value) => {
                    const catData = skuCategoriesQuery.data?.find((c) => c.categoria === value);
                    return <option key={`cat-${value}`} value={value}>{value}{catData ? ` (${catData.count_active})` : ""}</option>;
                  })}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogSubcategoryFilter} onChange={(e) => setSkuCatalogSubcategoryFilter(e.target.value)}>
                  <option value="">Todas las subcategorías</option>
                  {skuCatalogOptions.subcategories.map((value) => <option key={`subcat-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogBrandFilter} onChange={(e) => setSkuCatalogBrandFilter(e.target.value)}>
                  <option value="">Todas las marcas</option>
                  {skuCatalogOptions.brands.map((value) => <option key={`brand-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogManufacturerFilter} onChange={(e) => setSkuCatalogManufacturerFilter(e.target.value)}>
                  <option value="">Todos los fabricantes</option>
                  {skuCatalogOptions.manufacturers.map((value) => <option key={`manufacturer-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogSegmentFilter} onChange={(e) => setSkuCatalogSegmentFilter(e.target.value)}>
                  <option value="">Todos los segmentos</option>
                  {skuCatalogOptions.segments.map((value) => <option key={`segment-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogGroupFilter} onChange={(e) => setSkuCatalogGroupFilter(e.target.value)}>
                  <option value="">Todos los grupos</option>
                  {skuCatalogOptions.groups.map((value) => <option key={`group-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogStatusFilter} onChange={(e) => setSkuCatalogStatusFilter(e.target.value)}>
                  <option value="all">Todos los estados</option>
                  <option value="activo">Activos</option>
                  <option value="inactivo">Inactivos</option>
                </select>
                <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-200">
                  <Switch checked={skuCatalogOnlyActive} onCheckedChange={setSkuCatalogOnlyActive} />
                  Solo activos
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ["all", "Todos"],
                  ["with_images", "Con imágenes"],
                  ["without_images", "Sin imágenes"],
                  ["indexable", "Indexables"],
                ] as const).map(([key, label]) => (
                  <Button key={`cat-cov-${key}`} size="sm" variant={datasetCoverageFilter === key ? "default" : "outline"} onClick={() => setDatasetCoverageFilter(key)}>{label}</Button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{paginatedCatalogSkus.length} de {filteredCatalogSkus.length} SKUs</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((p) => Math.max(1, p - 1))} disabled={skuCatalogPage <= 1}>Anterior</Button>
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((p) => Math.min(catalogTotalPages, p + 1))} disabled={skuCatalogPage >= catalogTotalPages}>Siguiente</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
              <div className="max-h-[72vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/50 p-2">
                <p className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Catálogo · lista</p>
                <div className="space-y-2 p-1">
                  {paginatedCatalogSkus.map((sku) => {
                    const code = getSkuCodeValue(sku);
                    const selected = code === skuCatalogDetailCode || code === activeSkuWorkspaceId;
                    const coverage = resolveSkuDatasetCoverage(sku);
                    const imageCount = coverage.images;
                    return (
                      <button
                        key={`cat-sku-${code || sku.id}`}
                        type="button"
                        onClick={() => code && selectCatalogSku(code)}
                        className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-cyan-300/40 bg-cyan-500/10 ring-1 ring-cyan-400/20" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-sm text-slate-100">{code || "—"}</p>
                          <Badge variant={imageCount > 0 ? "default" : "secondary"}>{imageCount} img</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-300">{getSkuNameValue(sku) || "Sin nombre"}</p>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-400">
                          {getSkuBrandValue(sku) ? <span>{getSkuBrandValue(sku)}</span> : null}
                          {getSkuFamilyValue(sku) ? <span>· {getSkuFamilyValue(sku)}</span> : null}
                        </div>
                        <Badge className="mt-2" variant="outline">{activeLabel((sku as Record<string, unknown>).is_active)}</Badge>
                      </button>
                    );
                  })}
                  {!paginatedCatalogSkus.length ? <p className="px-2 py-6 text-center text-sm text-slate-400">Ningún SKU coincide con los filtros.</p> : null}
                </div>
              </div>

              <div className="space-y-4">
              {selectedSkuCatalogDetail ? (
                <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-base text-slate-100">{getSkuCodeValue(selectedSkuCatalogDetail)}</p>
                      <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(selectedSkuCatalogDetail) || "Sin nombre"}</p>
                      <p className="mt-1 text-xs text-slate-400">{getSkuBrandValue(selectedSkuCatalogDetail) || "-"} · {getSkuFamilyValue(selectedSkuCatalogDetail) || "-"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{getSkuStatusValue(selectedSkuCatalogDetail)}</Badge>
                      {(() => {
                        const code = getSkuCodeValue(selectedSkuCatalogDetail);
                        const cov = selectedSkuCatalogDetail ? resolveSkuDatasetCoverage(selectedSkuCatalogDetail) : undefined;
                        return <Badge variant={(cov?.images ?? 0) > 0 ? "default" : "secondary"}>{cov?.images ?? 0} imágenes · {cov?.indexable ?? 0} indexables</Badge>;
                      })()}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { selectDatasetSku(getSkuCodeValue(selectedSkuCatalogDetail)); setSkuWorkspaceTab("dataset"); }}>Dataset activo</Button>
                    <Button size="sm" variant="outline" onClick={() => { loadSkuToForm(selectedSkuCatalogDetail); setCargasWorkspaceSection("ficha"); setSkuWorkspaceTab("cargas"); }}>Editar en cargas</Button>
                    <Button size="sm" variant="outline" onClick={() => { selectCatalogSku(getSkuCodeValue(selectedSkuCatalogDetail)); setSkuWorkspaceTab("pruebas"); }}>Probar SKU</Button>
                    <Button size="sm" variant="ghost" onClick={() => { const code = getSkuCodeValue(selectedSkuCatalogDetail); setSkuDeleteTargetId(code); setSkuDeleteDialogOpen(true); }}>Desactivar</Button>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-100">
                      <p className="mb-2 text-xs text-slate-400">Identidad</p>
                      <p><span className="text-slate-500">Nombre:</span> {getSkuNameValue(selectedSkuCatalogDetail) || "-"}</p>
                      <p><span className="text-slate-500">Marca:</span> {getSkuBrandValue(selectedSkuCatalogDetail) || "-"}</p>
                      <p><span className="text-slate-500">EAN:</span> {firstNonEmptyString(selectedSkuCatalogDetail.barcode, selectedSkuCatalogDetail.ean) || "-"}</p>
                      <p><span className="text-slate-500">Fabricante:</span> {getSkuManufacturerValue(selectedSkuCatalogDetail) || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-100">
                      <p className="mb-2 text-xs text-slate-400">Clasificación</p>
                      <p><span className="text-slate-500">Categoría:</span> {getSkuFamilyValue(selectedSkuCatalogDetail) || "-"}</p>
                      <p><span className="text-slate-500">Subcategoría:</span> {getSkuSubcategoryValue(selectedSkuCatalogDetail) || "-"}</p>
                      <p><span className="text-slate-500">Segmento:</span> {getSkuSegmentValue(selectedSkuCatalogDetail) || "-"}</p>
                      <p><span className="text-slate-500">Grupo:</span> {getSkuGroupValue(selectedSkuCatalogDetail) || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-100">
                      <p className="mb-2 text-xs text-slate-400">Producto</p>
                      <p><span className="text-slate-500">Formato:</span> {firstNonEmptyString(selectedSkuCatalogDetail.variant, selectedSkuCatalogDetail.formato) || "-"}</p>
                      <p><span className="text-slate-500">Tamaño:</span> {firstNonEmptyString(selectedSkuCatalogDetail.size_text, selectedSkuCatalogDetail.tamano) || "-"}</p>
                      <p><span className="text-slate-500">Forma:</span> {firstNonEmptyString(selectedSkuCatalogDetail.forma) || "-"}</p>
                      <p><span className="text-slate-500">Fragancia:</span> {firstNonEmptyString(selectedSkuCatalogDetail.fragancia_variante) || "-"}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-500/5 p-3 text-sm text-slate-100">
                    <p className="mb-2 text-xs text-amber-100">Confusiones registradas</p>
                    <p className="text-lg font-semibold text-slate-100">{(catalogSkuHardNegativesQuery.data ?? []).length}</p>
                    <p className="mt-1 text-xs text-slate-400">SKUs similares que no deben contarse como este producto.</p>
                    {(catalogSkuHardNegativesQuery.data ?? []).length ? (
                      <div className="mt-2 space-y-1">
                        {(catalogSkuHardNegativesQuery.data ?? []).slice(0, 6).map((item, idx) => (
                          <p key={`cat-hn-${idx}`} className="font-mono text-xs text-slate-300">
                            {String(item.negative_sku_id ?? item.negative_sku_code ?? "-")}
                            {item.reason ? <span className="text-slate-500"> · {String(item.reason)}</span> : null}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr,1.1fr]">
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-100">
                      <p className="mb-2 text-xs text-slate-400">Dimensiones y auditoría</p>
                      <p><span className="text-slate-500">x_ancho:</span> {firstNonEmptyString(selectedSkuCatalogDetail.x_ancho) || "-"}</p>
                      <p><span className="text-slate-500">y_alto:</span> {firstNonEmptyString(selectedSkuCatalogDetail.y_alto) || "-"}</p>
                      <p><span className="text-slate-500">z_profundidad:</span> {firstNonEmptyString(selectedSkuCatalogDetail.z_profundidad) || "-"}</p>
                      <p><span className="text-slate-500">Actualizado:</span> {formatDateTime(selectedSkuCatalogDetail.updated_at)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                      <p className="mb-2 text-xs text-slate-400">Metadata</p>
                      <pre className="max-h-48 overflow-auto text-xs text-slate-200">{JSON.stringify(getSkuMetadataValue(selectedSkuCatalogDetail) ?? {}, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                  <p className="text-sm font-semibold text-slate-200">Selecciona un SKU de la lista</p>
                  <p className="mt-2 max-w-md text-xs text-slate-400">Verás la ficha completa, cobertura de imágenes y accesos directos al dataset, cargas o pruebas.</p>
                </div>
              )}

              <details className="rounded-xl border border-amber-300/20 bg-amber-500/5 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-amber-100">Mantenimiento y tabla rápida</summary>
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">Desactivar o eliminar SKU</p>
                      <p className="text-xs text-slate-300">Flujo protegido en diálogo de confirmación.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">SKU: {activeSkuDeleteId || "no seleccionado"}</Badge>
                      <Button variant="outline" size="sm" onClick={() => setSkuDeleteDialogOpen(true)} disabled={!activeSkuDeleteId}>Abrir diálogo</Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs text-slate-400">Tabla escaneo · {filteredCatalogSkus.length} SKUs filtrados · página {skuCatalogPage}</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>sku_code</TableHead>
                          <TableHead>nombre</TableHead>
                          <TableHead>marca</TableHead>
                          <TableHead>categoria</TableHead>
                          <TableHead>imágenes</TableHead>
                          <TableHead>acción</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedCatalogSkus.map((sku: ShelfSku) => {
                          const code = getSkuCodeValue(sku);
                          const cov = resolveSkuDatasetCoverage(sku);
                          return (
                            <TableRow key={`sku-tbl-${sku.id ?? code}`}>
                              <TableCell className="font-mono text-xs">{code || "-"}</TableCell>
                              <TableCell>{getSkuNameValue(sku) || "-"}</TableCell>
                              <TableCell>{getSkuBrandValue(sku) || "-"}</TableCell>
                              <TableCell>{getSkuFamilyValue(sku) || "-"}</TableCell>
                              <TableCell>{cov.images}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  <Button size="sm" variant="outline" onClick={() => code && selectCatalogSku(code)}>Ver</Button>
                                  <Button size="sm" variant="ghost" onClick={() => { if (!code) return; selectDatasetSku(code); setSkuWorkspaceTab("dataset"); }}>Dataset</Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </details>
              </div>
            </div>
            </>
            ) : null}

            {skuWorkspaceTab === "cargas" ? (
            <>
            <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-950/60 to-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Cargas y entrenamiento · alta y dataset</p>
                  <p className="text-xs text-slate-300">Crea SKUs manualmente, importa lotes o asocia imágenes al dataset. Elige el SKU activo desde el catálogo lateral.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">SKU activo: {activeSkuWorkspaceId || skuForm.sku_code || "ninguno"}</Badge>
                  {activeSkuWorkspaceInfo ? <Badge variant="secondary">{getSkuNameValue(activeSkuWorkspaceInfo) || "sin nombre"}</Badge> : null}
                  <Button size="sm" variant="outline" onClick={() => activeSkuWorkspaceInfo && setSkuWorkspaceTab("dataset")} disabled={!activeSkuWorkspaceId}>Ver dataset</Button>
                  <Button size="sm" variant="outline" onClick={() => skusQuery.refetch()} disabled={skusQuery.isFetching}>Refrescar</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Buscar SKU</p>
                  <Input className="mt-2" value={skuCatalogSearch} onChange={(e) => setSkuCatalogSearch(e.target.value)} placeholder="Filtrar catálogo..." />
                  <div className="mt-2 max-h-[50vh] space-y-2 overflow-y-auto">
                    {paginatedCatalogSkus.slice(0, 24).map((sku) => {
                      const code = getSkuCodeValue(sku);
                      const selected = code === activeSkuWorkspaceId || code === skuForm.sku_code;
                      return (
                        <button
                          key={`cg-sku-${code || sku.id}`}
                          type="button"
                          onClick={() => { if (!code) return; selectCatalogSku(code); loadSkuToForm(sku); }}
                          className={`w-full rounded-md border p-2 text-left text-xs transition ${selected ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-slate-950/40 hover:bg-black/30"}`}
                        >
                          <p className="font-mono text-slate-100">{code || "—"}</p>
                          <p className="mt-1 line-clamp-1 text-slate-400">{getSkuNameValue(sku) || "Sin nombre"}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {activeSkuWorkspaceInfo ? (
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-3 text-xs text-slate-300">
                    <p className="font-mono text-sm text-slate-100">{getSkuCodeValue(activeSkuWorkspaceInfo)}</p>
                    <p className="mt-1">{getSkuBrandValue(activeSkuWorkspaceInfo)} · {getSkuFamilyValue(activeSkuWorkspaceInfo)}</p>
                    <p className="mt-2 text-slate-400">{activeSkuWorkspaceInfo ? resolveSkuDatasetCoverage(activeSkuWorkspaceInfo).images : currentSkuImageSummary.total} imágenes en dataset</p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={cargasWorkspaceSection === "ficha" ? "default" : "outline"} onClick={() => setCargasWorkspaceSection("ficha")}>Ficha manual</Button>
                  <Button size="sm" variant={cargasWorkspaceSection === "bulk" ? "default" : "outline"} onClick={() => setCargasWorkspaceSection("bulk")}>Carga masiva</Button>
                  <Button size="sm" variant={cargasWorkspaceSection === "images" ? "default" : "outline"} onClick={() => setCargasWorkspaceSection("images")}>Imágenes al dataset</Button>
                </div>

              {cargasWorkspaceSection === "ficha" ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-100">Crear o preparar SKU manualmente</p>
                <p className="mb-3 text-xs text-slate-300">Ficha ordenada por bloques: identidad, clasificación, producto y dimensiones.</p>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Identidad</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><Label>sku_id / sku_code</Label><Input value={skuForm.sku_code} onChange={(e) => setSkuForm((p) => ({ ...p, sku_code: e.target.value }))} placeholder="KALIPTO_DESINF_1L" /></div>
                    <div><Label>Nombre</Label><Input value={skuForm.sku_name} onChange={(e) => setSkuForm((p) => ({ ...p, sku_name: e.target.value }))} /></div>
                    <div><Label>Marca</Label><Input value={skuForm.brand} onChange={(e) => setSkuForm((p) => ({ ...p, brand: e.target.value }))} /></div>
                    <div><Label>Fabricante</Label><Input value={skuForm.fabricante} onChange={(e) => setSkuForm((p) => ({ ...p, fabricante: e.target.value }))} /></div>
                    <div><Label>EAN / barcode</Label><Input value={skuForm.barcode} onChange={(e) => setSkuForm((p) => ({ ...p, barcode: e.target.value }))} /></div>
                    <div><Label>Estado</Label><Input value={skuForm.estado} onChange={(e) => setSkuForm((p) => ({ ...p, estado: e.target.value }))} placeholder="activo" /></div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Clasificación</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><Label>Categoría</Label><Input value={skuForm.family} onChange={(e) => setSkuForm((p) => ({ ...p, family: e.target.value }))} /></div>
                    <div><Label>Subcategoría</Label><Input value={skuForm.subcategoria} onChange={(e) => setSkuForm((p) => ({ ...p, subcategoria: e.target.value }))} /></div>
                    <div><Label>Segmento</Label><Input value={skuForm.segmento} onChange={(e) => setSkuForm((p) => ({ ...p, segmento: e.target.value }))} /></div>
                    <div><Label>Segmento funcional</Label><Input value={skuForm.segmento_funcional} onChange={(e) => setSkuForm((p) => ({ ...p, segmento_funcional: e.target.value }))} /></div>
                    <div><Label>Grupo</Label><Input value={skuForm.grupo} onChange={(e) => setSkuForm((p) => ({ ...p, grupo: e.target.value }))} /></div>
                    <div><Label>Category cuenta</Label><Input value={skuForm.category_cuenta} onChange={(e) => setSkuForm((p) => ({ ...p, category_cuenta: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Producto</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><Label>Formato</Label><Input value={skuForm.variant} onChange={(e) => setSkuForm((p) => ({ ...p, variant: e.target.value }))} /></div>
                    <div><Label>Tamaño</Label><Input value={skuForm.size_text} onChange={(e) => setSkuForm((p) => ({ ...p, size_text: e.target.value }))} /></div>
                    <div><Label>Forma</Label><Input value={skuForm.forma} onChange={(e) => setSkuForm((p) => ({ ...p, forma: e.target.value }))} /></div>
                    <div><Label>Fragancia / variante</Label><Input value={skuForm.fragancia_variante} onChange={(e) => setSkuForm((p) => ({ ...p, fragancia_variante: e.target.value }))} /></div>
                    <div><Label>País</Label><Input value={skuForm.pais} onChange={(e) => setSkuForm((p) => ({ ...p, pais: e.target.value }))} /></div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Dimensiones y extras</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div><Label>x_ancho</Label><Input value={skuForm.x_ancho} onChange={(e) => setSkuForm((p) => ({ ...p, x_ancho: e.target.value }))} /></div>
                    <div><Label>y_alto</Label><Input value={skuForm.y_alto} onChange={(e) => setSkuForm((p) => ({ ...p, y_alto: e.target.value }))} /></div>
                    <div><Label>z_profundidad</Label><Input value={skuForm.z_profundidad} onChange={(e) => setSkuForm((p) => ({ ...p, z_profundidad: e.target.value }))} /></div>
                  </div>
                  <div className="mt-3">
                    <Label>metadata JSON</Label>
                    <Textarea value={skuForm.metadata_json} onChange={(e) => setSkuForm((p) => ({ ...p, metadata_json: e.target.value }))} rows={8} className="font-mono text-xs" />
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <Button onClick={() => createSkuMutation.mutate()} disabled={createSkuMutation.isPending}>Crear SKU</Button>
              </div>
            </div>
              ) : null}

            {cargasWorkspaceSection === "bulk" ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-100">Carga masiva SKUs (JSON o CSV)</p>
              <p className="mb-3 text-xs text-slate-300">
                Compatible con formato actual (`sku_code`, `sku_name`) y con seed de demo (`sku_id`, `nombre`, `marca`, `categoria`, `subcategoria`, `tamano`, `ean`).
                Si mandas campos extra dentro de `metadata`, se preservan ahí para no perder detalle al importar.
              </p>
              <div className="mb-3 rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3 text-xs text-slate-200">
                <p className="font-medium text-emerald-100">Modo recomendado para bases tipo Colgate Ecuador</p>
                <p className="mt-1">El frontend ahora transforma campos fuente como `codLucky`, `newDescription`, `category`, `subcategory`, `segment`, `fraganciaVariante`, `x/y/z` y usa `POST /shelf/skus/seed` para crear o actualizar sin perder extras.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[auto_1fr]">
                <div>
                  <Input type="file" accept=".json,.csv,.xlsx,.xls" onChange={onBulkFilePick} />
                  <p className="mt-2 text-xs text-slate-400">XLSX/XLS: por ahora muestra aviso para convertir a CSV.</p>
                </div>
                <Textarea value={bulkJson} onChange={(e) => setBulkJson(e.target.value)} rows={8} className="max-h-80 overflow-auto font-mono text-xs" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      const rows = parseBulkSkusJson(bulkJson);
                      setBulkPreview(rows);
                      toast.success("Preview generado", { description: `Rows: ${rows.length}` });
                    } catch (e) {
                      toast.error("JSON invalido", { description: e instanceof Error ? e.message : "Error inesperado" });
                    }
                  }}
                >
                  Preview lote
                </Button>
                <Button
                  onClick={() => {
                    let rows: Record<string, unknown>[] = [];
                    try {
                      rows = parseBulkSkusJson(bulkJson);
                    } catch {
                      rows = [];
                    }
                    if (!rows.length) {
                      toast.error("No hay filas validas para crear.");
                      return;
                    }
                    const normalized = rows
                      .map((row) => normalizeBulkShelfSeedRow(row))
                      .filter((row): row is Record<string, unknown> => Boolean(row));
                    if (!normalized.length) {
                      toast.error("Ninguna fila tiene sku_id y nombre válidos.");
                      return;
                    }
                    setBulkDataForUpload(normalized);
                    setShowBulkUploadSafeguard(true);
                  }}
                  disabled={bulkCreateMutation.isPending || showBulkUploadSafeguard}
                >
                  Crear lote (Protegido)
                </Button>
              </div>
              {bulkPreview.length ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <p className="text-xs text-slate-300">Preview rows: {bulkPreview.length}</p>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-white/10 bg-black/20 p-3 text-[11px] text-slate-200">
                    {JSON.stringify(bulkPreview.slice(0, 3).map((row) => normalizeBulkShelfSeedRow(row)), null, 2)}
                  </pre>
                </div>
              ) : null}

              {showBulkUploadSafeguard && bulkDataForUpload.length > 0 && (
                <div className="mt-4">
                  <ShelfSkuUploadSafeguard
                    account={account}
                    bulkData={bulkDataForUpload}
                    onUploadSuccess={() => {
                      setShowBulkUploadSafeguard(false);
                      setBulkJson("");
                      setBulkPreview([]);
                      setBulkDataForUpload([]);
                    }}
                  />
                  <Button variant="outline" className="mt-3" onClick={() => setShowBulkUploadSafeguard(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
            ) : null}

            {cargasWorkspaceSection === "images" ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="mb-2 text-sm font-semibold text-slate-100">Agregar imágenes al dataset real del SKU</p>
              <p className="mb-3 text-xs text-slate-300">Este bloque sí escribe directo sobre el dataset del SKU. Úsalo cuando ya sabes exactamente a qué SKU pertenece la imagen.</p>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-2">
                  <Label>sku_id destino</Label>
                  <Input placeholder="sku_id (ej: KALIPTO_DESINF_1L)" value={selectedSkuId} onChange={(e) => setSelectedSkuId(e.target.value)} />
                  <select
                    className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                    value={selectedSkuId || ""}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      selectCatalogSku(e.target.value);
                    }}
                  >
                    <option value="">Selecciona SKU desde catálogo...</option>
                    {paginatedCatalogSkus.map((sku: ShelfSku) => {
                      const code = getSkuCodeValue(sku);
                      const name = getSkuNameValue(sku);
                      if (!code) return null;
                      return <option key={`sku-pick-${code}`} value={code}>{code} - {name || "sin nombre"}</option>;
                    })}
                  </select>
                </div>
                <div className="space-y-2">
                  <Textarea value={skuImageJson} onChange={(e) => setSkuImageJson(e.target.value)} rows={5} />
                  <p className="text-xs text-slate-400">
                    Requerido por request: exactamente uno `image_path` o `image_file_id`. También acepta lote con `image_paths` o `image_file_ids`.
                  </p>
                </div>
                <Button variant="outline" onClick={() => addSkuImageMutation.mutate()} disabled={addSkuImageMutation.isPending}>Agregar imágenes</Button>
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-sm font-semibold">Subir desde explorador y asociar automáticamente</p>
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setSelectedSkuImageFiles(Array.from(e.target.files ?? []))}
                    />
                    <p className="text-xs text-slate-400">Archivos seleccionados: {selectedSkuImageFiles.length}</p>
                  </div>
                  <Button
                    onClick={() => uploadAndAssociateSkuImagesMutation.mutate()}
                    disabled={uploadAndAssociateSkuImagesMutation.isPending || !selectedSkuImageFiles.length}
                  >
                    Subir y asociar
                  </Button>
                </div>
              </div>
            </div>
            ) : null}

            {recentSkuImageResponses.length ? (
              <details className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-3" open>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-100 [&::-webkit-details-marker]:hidden">
                  <span>Diagnóstico de asociación reciente ({recentSkuImageResponses.length})</span>
                  <Button variant="outline" size="sm" onClick={(e) => { e.preventDefault(); setRecentSkuImageResponses([]); }}>Limpiar</Button>
                </summary>
                <div className="mt-3">
                <div className="space-y-3">
                  {recentSkuImageResponses.map((response, idx) => {
                    const diagnostics = normalizeDiagnosticsPayload(response.diagnostics);
                    const tone = diagnosticsTone(diagnostics);
                    const requestId = diagnostics?.request_id ?? "-";
                    const toneClass = tone === "error"
                      ? "border-rose-300/30 bg-rose-500/10"
                      : tone === "warning"
                        ? "border-amber-300/30 bg-amber-500/10"
                        : tone === "ok"
                          ? "border-emerald-300/30 bg-emerald-500/10"
                          : "border-white/10 bg-black/20";
                    const modelList = formatModelNames(response.embedding_models ?? diagnostics?.models?.loaded_models ?? []);
                    return (
                      <div key={`diag-${response.image_id ?? idx}-${requestId}`} className={`rounded-lg border p-3 ${toneClass}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={tone === "ok" ? "default" : tone === "warning" ? "secondary" : "destructive"}>
                            {diagnosticsOutcomeLabel(diagnostics)}
                          </Badge>
                          <Badge variant="outline">image_id: {String(response.image_id ?? "-")}</Badge>
                          <Badge variant="outline">request_id: {requestId}</Badge>
                          <Badge variant="outline">modelos: {modelList}</Badge>
                        </div>
                        <p className="mt-3 text-sm text-slate-100">{diagnosticsHeadline(diagnostics)}</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="text-xs text-slate-400">Provider</p>
                            <p className="mt-1 text-sm text-slate-100">{diagnostics?.models?.provider ?? "-"}</p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="text-xs text-slate-400">Fallback</p>
                            <p className="mt-1 text-sm text-slate-100">{diagnostics?.models?.fallback_used ? "Sí" : "No"}</p>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="text-xs text-slate-400">Duración total</p>
                            <p className="mt-1 text-sm text-slate-100">{typeof diagnostics?.total_duration_ms === "number" ? `${diagnostics.total_duration_ms} ms` : "-"}</p>
                          </div>
                        </div>
                        {(diagnostics?.warnings ?? []).length ? (
                          <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-500/10 p-2">
                            <p className="text-xs font-medium text-amber-100">Warnings</p>
                            {(diagnostics?.warnings ?? []).map((warning, warningIdx) => (
                              <p key={`warn-${requestId}-${warningIdx}`} className="mt-1 text-xs text-amber-50">
                                [{warning.code ?? "WARNING"}] {warning.message ?? "-"} {warning.action_hint ? `- ${warning.action_hint}` : ""}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {(diagnostics?.errors ?? []).length ? (
                          <div className="mt-3 rounded-md border border-rose-300/25 bg-rose-500/10 p-2">
                            <p className="text-xs font-medium text-rose-100">Errores recuperados</p>
                            {(diagnostics?.errors ?? []).map((error, errorIdx) => (
                              <p key={`err-${requestId}-${errorIdx}`} className="mt-1 text-xs text-rose-50">
                                [{error.code ?? "ERROR"}] {error.message ?? "-"} {error.action_hint ? `- ${error.action_hint}` : ""}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {(diagnostics?.stages ?? []).length ? (
                          <div className="mt-3 overflow-x-auto rounded-md border border-white/10 bg-black/20">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>etapa</TableHead>
                                  <TableHead>status</TableHead>
                                  <TableHead>code</TableHead>
                                  <TableHead>duración</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(diagnostics?.stages ?? []).map((stage, stageIdx) => (
                                  <TableRow key={`stage-${requestId}-${stageIdx}`}>
                                    <TableCell>{formatStageName(stage.name)}</TableCell>
                                    <TableCell>{stage.status ?? "-"}</TableCell>
                                    <TableCell>{stage.code ?? "-"}</TableCell>
                                    <TableCell>{typeof stage.duration_ms === "number" ? `${stage.duration_ms} ms` : "-"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                </div>
              </details>
            ) : null}
              </div>
            </div>
            </>
            ) : null}

            {skuWorkspaceTab === "dataset" ? (
            <>
            <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 via-slate-950/60 to-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Dataset activo · browser del catálogo visual</p>
                  <p className="text-xs text-slate-300">Explora imágenes asociadas e indexables vía dataset/summary. El estado de embeddings por imagen viene de GET …/images (embedding_status canónico).</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{datasetAccountTotals.skusWithImages} SKUs con imágenes</Badge>
                  <Badge variant="outline">{datasetAccountTotals.images} imágenes totales</Badge>
                  <Badge variant={datasetPublishPending ? "secondary" : "outline"}>{datasetPublishPending ? "Índice pendiente" : "Índice al día"}</Badge>
                  <Button variant="outline" size="sm" onClick={() => { accountDatasetCoverageQuery.refetch(); datasetSummaryQuery.refetch(); skusQuery.refetch(); }} disabled={accountDatasetCoverageQuery.isFetching}>
                    Refrescar dataset
                  </Button>
                  <Button size="sm" onClick={() => rebuildIndexMutation.mutate()} disabled={rebuildIndexMutation.isPending}>
                    Publicar índice
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">SKUs en catálogo</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{filteredSkusCatalog.length}</p>
                  <p className="mt-1 text-xs text-slate-400">{datasetAccountTotals.skusWithoutImages} sin imágenes</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Imágenes indexables</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{datasetAccountTotals.indexable}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">dinov2 · sample_dim</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{vectorIndexHealth.dinov2.sampleDim ?? "-"}</p>
                  <Badge className="mt-2" variant={vectorIndexHealth.dinov2.sampleDim !== null && vectorIndexHealth.dinov2.sampleDim >= 512 ? "default" : "secondary"}>{vectorIndexHealth.dinov2.status}</Badge>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">siglip · sample_dim</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{vectorIndexHealth.siglip.sampleDim ?? "-"}</p>
                  <Badge className="mt-2" variant={vectorIndexHealth.siglip.sampleDim !== null && vectorIndexHealth.siglip.sampleDim >= 512 ? "default" : "secondary"}>{vectorIndexHealth.siglip.status}</Badge>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">SKU seleccionado</p>
                  <p className="mt-1 font-mono text-sm text-slate-100">{activeSkuWorkspaceId || "—"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {activeSkuDatasetSummaryLoading
                      ? "Cargando resumen…"
                      : activeSkuDatasetSummary
                        ? `${activeSkuDatasetSummary.total_images} asociadas · ${activeSkuDatasetSummary.indexable_images} indexables`
                        : `${currentSkuImageSummary.active} activas en galería`}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-slate-100">Buscar y filtrar catálogo</p>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_auto_auto]">
                <Input value={skuCatalogSearch} onChange={(e) => setSkuCatalogSearch(e.target.value)} placeholder="Buscar SKU, nombre, marca, categoría, fabricante..." />
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={String(skuCatalogPageSize)} onChange={(e) => setSkuCatalogPageSize(Number(e.target.value))}>
                  <option value="12">12 / página</option>
                  <option value="24">24 / página</option>
                  <option value="48">48 / página</option>
                </select>
                <div className="flex items-center justify-center rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-300">Pág. {skuCatalogPage}/{datasetCatalogTotalPages}</div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogCategoryFilter} onChange={(e) => setSkuCatalogCategoryFilter(e.target.value)}>
                  <option value="">Todas las categorías</option>
                  {skuCatalogOptions.categories.map((value) => <option key={`ds-cat-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogSubcategoryFilter} onChange={(e) => setSkuCatalogSubcategoryFilter(e.target.value)}>
                  <option value="">Todas las subcategorías</option>
                  {skuCatalogOptions.subcategories.map((value) => <option key={`ds-sub-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogBrandFilter} onChange={(e) => setSkuCatalogBrandFilter(e.target.value)}>
                  <option value="">Todas las marcas</option>
                  {skuCatalogOptions.brands.map((value) => <option key={`ds-brand-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogManufacturerFilter} onChange={(e) => setSkuCatalogManufacturerFilter(e.target.value)}>
                  <option value="">Todos los fabricantes</option>
                  {skuCatalogOptions.manufacturers.map((value) => <option key={`ds-man-${value}`} value={value}>{value}</option>)}
                </select>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ["all", "Todos"],
                  ["with_images", "Con imágenes"],
                  ["without_images", "Sin imágenes"],
                  ["indexable", "Indexables"],
                ] as const).map(([key, label]) => (
                  <Button key={`ds-cov-${key}`} size="sm" variant={datasetCoverageFilter === key ? "default" : "outline"} onClick={() => setDatasetCoverageFilter(key)}>{label}</Button>
                ))}
                <label className="ml-auto flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-200">
                  <Switch checked={skuCatalogOnlyActive} onCheckedChange={setSkuCatalogOnlyActive} />
                  Solo activos
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{paginatedDatasetSkus.length} de {filteredDatasetSkus.length} SKUs visibles</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((p) => Math.max(1, p - 1))} disabled={skuCatalogPage <= 1}>Anterior</Button>
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((p) => Math.min(datasetCatalogTotalPages, p + 1))} disabled={skuCatalogPage >= datasetCatalogTotalPages}>Siguiente</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
              <div className="max-h-[72vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/50 p-2">
                <p className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Catálogo · cobertura dataset</p>
                <div className="space-y-2 p-1">
                  {paginatedDatasetSkus.map((sku, idx) => {
                    const code = getSkuCodeValue(sku);
                    const coverage = resolveSkuDatasetCoverage(sku);
                    const selected = code === activeSkuWorkspaceId;
                    const imageCount = coverage.images;
                    const indexableCount = coverage.indexable;
                    const coverageSummaryPending = (
                      imageCount === 0
                      && indexableCount === 0
                      && (
                        datasetPageSummaryQueries[idx]?.isFetching
                        || (accountDatasetCoverageQuery.isFetching && !accountDatasetCoverageQuery.data)
                      )
                    );
                    return (
                      <button
                        key={`ds-sku-${code || sku.id}`}
                        type="button"
                        onClick={() => code && selectDatasetSku(code)}
                        className={`w-full rounded-lg border p-3 text-left transition ${selected ? "border-cyan-300/40 bg-cyan-500/10 ring-1 ring-cyan-400/20" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono text-sm text-slate-100">{code || "—"}</p>
                          <Badge variant={imageCount > 0 ? "default" : "secondary"}>{coverageSummaryPending ? "…" : `${imageCount} img`}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-300">{getSkuNameValue(sku) || "Sin nombre"}</p>
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-400">
                          {getSkuBrandValue(sku) ? <span>{getSkuBrandValue(sku)}</span> : null}
                          {getSkuFamilyValue(sku) ? <span>· {getSkuFamilyValue(sku)}</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {coverageSummaryPending ? (
                            <Badge variant="outline" className="text-[10px]">indexables …</Badge>
                          ) : indexableCount > 0 ? (
                            <Badge variant="outline" className="text-[10px]">{indexableCount} indexables</Badge>
                          ) : imageCount > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">0 indexables</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">sin imágenes</Badge>
                          )}
                          {getSkuSubcategoryValue(sku) ? <Badge variant="outline" className="text-[10px]">{getSkuSubcategoryValue(sku)}</Badge> : null}
                        </div>
                      </button>
                    );
                  })}
                  {!paginatedDatasetSkus.length ? (
                    <p className="px-2 py-6 text-center text-sm text-slate-400">Ningún SKU coincide con los filtros actuales.</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                {!activeSkuWorkspaceId ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                    <p className="text-sm font-semibold text-slate-200">Selecciona un SKU de la lista</p>
                    <p className="mt-2 max-w-md text-xs text-slate-400">Verás imágenes asociadas, roles de dataset, conteos indexables desde dataset/summary y podrás registrar confusiones frecuentes en el mismo flujo.</p>
                  </div>
                ) : (
                  <>
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-base text-slate-100">{getSkuCodeValue(activeSkuWorkspaceInfo ?? {})}</p>
                        <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(activeSkuWorkspaceInfo ?? {}) || "Sin nombre"}</p>
                        <p className="mt-1 text-xs text-slate-400">{getSkuBrandValue(activeSkuWorkspaceInfo ?? {}) || "-"} · {getSkuFamilyValue(activeSkuWorkspaceInfo ?? {}) || "-"} · {getSkuSubcategoryValue(activeSkuWorkspaceInfo ?? {}) || "-"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {activeSkuDatasetSummaryLoading ? "Imágenes …" : `${activeSkuDatasetSummary?.total_images ?? "—"} imágenes asociadas`}
                        </Badge>
                        <Badge variant="default">
                          {activeSkuDatasetSummaryLoading ? "Indexables …" : `${activeSkuDatasetSummary?.indexable_images ?? "—"} indexables`}
                        </Badge>
                        <Badge variant="outline">Índice dinov2: {vectorIndexHealth.dinov2.status}</Badge>
                        <Badge variant="outline">Índice siglip: {vectorIndexHealth.siglip.status}</Badge>
                        <Badge variant="outline">{(hardNegativesQuery.data ?? []).length} confusiones</Badge>
                        <Button size="sm" variant="outline" onClick={() => { skuImagesQuery.refetch(); datasetSummaryQuery.refetch(); accountDatasetCoverageQuery.refetch(); versionsQuery.refetch(); }} disabled={skuImagesQuery.isFetching}>Actualizar</Button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                        <p className="font-medium text-slate-100">Imágenes asociadas</p>
                        <p className="mt-1 text-lg font-semibold text-slate-100">{activeSkuDatasetSummary?.total_images ?? (activeSkuDatasetSummaryLoading ? "…" : "—")}</p>
                        <p className="mt-1">Fuente: <span className="font-mono">dataset/summary</span></p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                        <p className="font-medium text-slate-100">Imágenes indexables</p>
                        <p className="mt-1 text-lg font-semibold text-slate-100">{activeSkuDatasetSummary?.indexable_images ?? (activeSkuDatasetSummaryLoading ? "…" : "—")}</p>
                        <p className="mt-1">Indexable ≠ embedding confirmado</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                        <p className="font-medium text-slate-100">Galería local</p>
                        <p className="mt-1 text-lg font-semibold text-slate-100">{currentSkuImageSummary.total}</p>
                        <p className="mt-1">{currentSkuImageSummary.active} activas · {currentSkuImageSummary.inactive} inactivas</p>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                        <p className="font-medium text-slate-100">Embeddings por imagen</p>
                        {skuImagesQuery.isLoading || skuImagesQuery.isFetching ? (
                          <p className="mt-1 text-sm text-slate-200">Cargando estado…</p>
                        ) : activeSkuEmbeddingSummary.available ? (
                          <>
                            <p className="mt-1 text-lg font-semibold text-slate-100">{activeSkuEmbeddingSummary.complete} completas</p>
                            <p className="mt-1">
                              {[
                                activeSkuEmbeddingSummary.partial > 0 ? `${activeSkuEmbeddingSummary.partial} parciales` : "",
                                activeSkuEmbeddingSummary.pending > 0 ? `${activeSkuEmbeddingSummary.pending} pendientes` : "",
                                activeSkuEmbeddingSummary.fallback > 0 ? `${activeSkuEmbeddingSummary.fallback} degradadas` : "",
                                activeSkuEmbeddingSummary.failed > 0 ? `${activeSkuEmbeddingSummary.failed} fallidas` : "",
                                activeSkuEmbeddingSummary.notIndexable > 0 ? `${activeSkuEmbeddingSummary.notIndexable} no indexables` : "",
                              ].filter(Boolean).join(" · ") || "Sin incidencias reportadas"}
                            </p>
                            <p className="mt-1">Fuente: <span className="font-mono">GET …/images</span></p>
                          </>
                        ) : (
                          <>
                            <p className="mt-1 text-sm text-slate-200">Sin embedding_status en la galería</p>
                            <p className="mt-1">Refresca o verifica que backend esté desplegado.</p>
                          </>
                        )}
                      </div>
                    </div>
                    {(datasetSummaryQuery.data?.by_role ?? []).length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(datasetSummaryQuery.data?.by_role ?? []).map((item, idx) => (
                          <Badge key={`ds-role-${idx}`} variant="outline">{String(item.dataset_role ?? "-")}: {String(item.count ?? 0)}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {datasetPublishPending && (activeSkuDatasetSummary?.indexable_images ?? 0) > 0 ? (
                      <div className="mt-3 rounded-lg border border-cyan-300/25 bg-cyan-500/10 p-3 text-xs text-cyan-50">
                        <p className="font-medium text-cyan-100">Acción operativa: publicar índice</p>
                        <p className="mt-1">
                          Hay cambios pendientes de publicación. Esto no implica que falten embeddings; solo sincroniza el índice vectorial con el dataset actual.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">Galería del dataset ({filteredDatasetImages.length}/{skuImagesQuery.data?.length ?? 0})</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <select className="h-9 rounded-md border border-white/10 bg-slate-900 px-2 text-xs" value={datasetImageRoleFilter} onChange={(e) => setDatasetImageRoleFilter(e.target.value)}>
                          <option value="all">Todos los roles</option>
                          {SHELF_DATASET_ROLE_OPTIONS.map((role) => <option key={`ds-img-role-${role}`} value={role}>{role}</option>)}
                        </select>
                        <select className="h-9 rounded-md border border-white/10 bg-slate-900 px-2 text-xs" value={datasetImageIndexableFilter} onChange={(e) => setDatasetImageIndexableFilter(e.target.value as typeof datasetImageIndexableFilter)}>
                          <option value="all">Todas (indexabilidad)</option>
                          <option value="indexable">Solo indexables</option>
                          <option value="non_indexable">No indexables</option>
                        </select>
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                          <Switch checked={skuImageBrowserIncludeInactive} onCheckedChange={setSkuImageBrowserIncludeInactive} />
                          Inactivas
                        </label>
                      </div>
                    </div>
                    {skuImagesQuery.isLoading ? <p className="mt-4 text-sm text-slate-400">Cargando imágenes del SKU...</p> : null}
                    {skuImagesQuery.isFetching && !skuImagesQuery.isLoading ? <p className="mt-2 text-xs text-cyan-200">Actualizando galería...</p> : null}
                    {filteredDatasetImages.length ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {filteredDatasetImages.map((image, idx) => {
                          const preview = previewUrlOf(image as Record<string, unknown>);
                          const imageId = image.image_id ?? image.id ?? idx;
                          const row = image as Record<string, unknown>;
                          const indexableMeta = imageIndexableMeta(row);
                          const embeddingStatus = imageEmbeddingStatusFromBackend(row);
                          const roleDraftKey = `${skuImageBrowserSkuId.trim()}::${String(imageId)}`;
                          const currentDatasetRole = firstNonEmptyString(row.dataset_role) || "reference_active";
                          const currentDatasetSplit = firstNonEmptyString(row.dataset_split);
                          const roleDraft = imageRoleDrafts[roleDraftKey] ?? { dataset_role: currentDatasetRole as ShelfDatasetRole, dataset_split: currentDatasetSplit };
                          const isActive = image.is_active !== false && image.is_active !== 0;
                          return (
                            <div key={`ds-img-${imageId}`} className={`rounded-lg border p-3 ${isActive ? "border-white/10 bg-slate-950/40" : "border-amber-300/20 bg-amber-500/5"}`}>
                              <div className="mb-2 flex flex-wrap gap-1">
                                <Badge variant={indexableMeta.tone}>{indexableMeta.label}</Badge>
                                <Badge variant="outline">{currentDatasetRole}</Badge>
                                {embeddingStatus ? <Badge variant={embeddingStatus.tone}>{embeddingStatus.label}</Badge> : null}
                                {!isActive ? <Badge variant="secondary">inactiva</Badge> : null}
                              </div>
                              {previewAvailableOf(row) && preview ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={preview} alt={`img-${imageId}`} className="h-44 w-full rounded-md object-contain bg-slate-950" />
                              ) : (
                                <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-white/10 text-xs text-slate-400">Sin preview</div>
                              )}
                              <p className="mt-2 font-mono text-[11px] text-slate-400">#{String(imageId)}</p>
                              <div className="mt-2 grid gap-2">
                                <select className="h-9 w-full rounded-md border border-white/10 bg-slate-900 px-2 text-xs" value={roleDraft.dataset_role} onChange={(e) => setImageRoleDrafts((prev) => ({ ...prev, [roleDraftKey]: { dataset_role: e.target.value as ShelfDatasetRole, dataset_split: roleDraft.dataset_split } }))}>
                                  {SHELF_DATASET_ROLE_OPTIONS.map((role) => <option key={`r-${imageId}-${role}`} value={role}>{role}</option>)}
                                </select>
                                <Input className="h-9 text-xs" value={roleDraft.dataset_split} onChange={(e) => setImageRoleDrafts((prev) => ({ ...prev, [roleDraftKey]: { dataset_role: roleDraft.dataset_role, dataset_split: e.target.value } }))} placeholder="split opcional" />
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                <Button size="sm" variant="outline" onClick={() => getSkuImageDetailMutation.mutate({ skuId: skuImageBrowserSkuId.trim(), imageId })}>Detalle</Button>
                                <Button size="sm" variant="outline" onClick={() => patchShelfImageRoleMutation.mutate({ skuId: skuImageBrowserSkuId.trim(), imageId, dataset_role: roleDraft.dataset_role, dataset_split: roleDraft.dataset_split })}>Guardar rol</Button>
                                <Button size="sm" variant="ghost" onClick={() => { setDatasetToolsExpanded(true); setHardNegativeNote(`Confusión visual con imagen ${imageId}`); }}>→ Confusión</Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteSkuImageMutation.mutate({ skuId: skuImageBrowserSkuId.trim(), imageId })}>Desactivar</Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : skuImageBrowserSkuId.trim() ? (
                      <p className="mt-4 text-sm text-slate-400">Este SKU no tiene imágenes para los filtros actuales.</p>
                    ) : null}
                  </div>

                  <details className="rounded-xl border border-white/10 bg-black/20 p-3" open={datasetToolsExpanded} onToggle={(e) => setDatasetToolsExpanded((e.currentTarget as HTMLDetailsElement).open)}>
                    <summary className="cursor-pointer text-sm font-semibold text-slate-100">Confusiones frecuentes y herramientas avanzadas</summary>
                    <div className="mt-4 space-y-4">
                      <p className="text-xs text-slate-400">
                        Registra SKUs que se parecen pero no son el correcto. Esto no reasigna imágenes ni mueve el dataset — solo guarda la relación de confusión (hard negative).
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div><Label>SKU correcto (ancla)</Label><Input value={hardNegativeSkuId} onChange={(e) => { setHardNegativeSkuId(e.target.value); setDatasetSummarySkuId(e.target.value); }} /></div>
                        <div><Label>SKU parecido pero incorrecto</Label><Input value={hardNegativeTargetSkuId} onChange={(e) => setHardNegativeTargetSkuId(e.target.value)} placeholder="SKU que suele confundirse" /></div>
                        <div><Label>Motivo técnico</Label><Input value={hardNegativeReason} onChange={(e) => setHardNegativeReason(e.target.value)} /></div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Input className="max-w-xl" value={hardNegativeNote} onChange={(e) => setHardNegativeNote(e.target.value)} placeholder="Nota: mismo packaging, color similar..." />
                        <Button onClick={() => createHardNegativeMutation.mutate()} disabled={createHardNegativeMutation.isPending || !hardNegativeSkuId.trim() || !hardNegativeTargetSkuId.trim()}>Guardar confusión frecuente</Button>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-100">Confusiones registradas: {(hardNegativesQuery.data ?? []).length}</p>
                        {(hardNegativesQuery.data ?? []).length ? (
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            {(hardNegativesQuery.data ?? []).map((item, idx) => (
                              <div key={`hn-${idx}`} className="rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
                                <p className="font-mono text-slate-100">{String(item.negative_sku_id ?? item.negative_sku_code ?? "-")}</p>
                                <p className="mt-1 text-xs text-slate-400">{String(item.reason ?? "-")} · {String(item.note ?? "")}</p>
                              </div>
                            ))}
                          </div>
                        ) : <p className="mt-1 text-xs text-slate-400">Sin confusiones registradas para este SKU.</p>}
                      </div>

                      <details className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-200">Recalcular embeddings del SKU (acción manual opcional)</summary>
                        <div className="mt-3 grid gap-3 xl:grid-cols-3">
                          <Textarea value={recomputeImageIdsText} onChange={(e) => setRecomputeImageIdsText(e.target.value)} rows={4} placeholder="image_ids (vacío = todo el SKU)" />
                          <Textarea value={recomputeModelNamesText} onChange={(e) => setRecomputeModelNamesText(e.target.value)} rows={4} />
                          <div className="space-y-2">
                            <Button size="sm" variant="outline" onClick={() => setRecomputeImageIdsText(currentSkuImageIds.map(String).join("\n"))} disabled={!currentSkuImageIds.length}>Usar imágenes actuales</Button>
                            <label className="flex items-center gap-2 text-xs"><Switch checked={recomputeRebuildIndex} onCheckedChange={setRecomputeRebuildIndex} />rebuild_index</label>
                            <Button onClick={() => recomputeEmbeddingsMutation.mutate()} disabled={recomputeEmbeddingsMutation.isPending}>Recalcular</Button>
                          </div>
                        </div>
                        {lastEmbeddingsRecompute ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <Badge variant="outline">OK {percentLabel(recomputeSummary.successRate)}</Badge>
                            <Badge variant="outline">fallback {percentLabel(recomputeSummary.fallbackRate)}</Badge>
                            <Badge variant={diagnosticsEmbeddingTone(lastEmbeddingsRecompute.diagnostics ?? null)}>{diagnosticsEmbeddingUiLabel(lastEmbeddingsRecompute.diagnostics ?? null)}</Badge>
                          </div>
                        ) : null}
                      </details>
                    </div>
                  </details>

                  {selectedSkuImageDetail ? (
                    <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">Detalle imagen #{String(selectedSkuImageDetail.image_id ?? selectedSkuImageDetail.id ?? "-")}</p>
                        <Button variant="outline" size="sm" onClick={() => setSelectedSkuImageDetail(null)}>Cerrar</Button>
                      </div>
                      <div className="mt-3 grid gap-4 md:grid-cols-[220px_1fr]">
                        {previewUrlOf(selectedSkuImageDetail as Record<string, unknown>) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrlOf(selectedSkuImageDetail as Record<string, unknown>) ?? ""} alt="detalle" className="h-52 w-full rounded-md object-contain bg-slate-950" />
                        ) : null}
                        <div className="space-y-3 text-xs text-slate-300">
                          {(() => {
                            const detailRow = selectedSkuImageDetail as Record<string, unknown>;
                            const embeddingBadge = imageEmbeddingStatusFromBackend(detailRow);
                            const diagSummary = imageEmbeddingDiagnosticsSummary(detailRow);
                            return (
                              <>
                                <div className="flex flex-wrap gap-1">
                                  {embeddingBadge ? <Badge variant={embeddingBadge.tone}>{embeddingBadge.label}</Badge> : null}
                                  {firstNonEmptyString(detailRow.embedding_status) ? (
                                    <Badge variant="outline">{String(detailRow.embedding_status)}</Badge>
                                  ) : null}
                                </div>
                                {Array.isArray(detailRow.embedding_models) && detailRow.embedding_models.length ? (
                                  <p><span className="text-slate-400">Modelos:</span> {(detailRow.embedding_models as string[]).join(", ")}</p>
                                ) : null}
                                {Array.isArray(detailRow.embedding_ids) && detailRow.embedding_ids.length ? (
                                  <p className="font-mono text-[11px] break-all"><span className="text-slate-400">IDs:</span> {(detailRow.embedding_ids as string[]).join(", ")}</p>
                                ) : null}
                                {diagSummary ? (
                                  <div className="rounded-md border border-white/10 bg-black/20 p-2">
                                    <p className="font-medium text-slate-100">embedding_diagnostics_summary</p>
                                    <p className="mt-1">expected: {Array.isArray(diagSummary.expected_models) ? (diagSummary.expected_models as string[]).join(", ") : "—"}</p>
                                    <p>available: {Array.isArray(diagSummary.available_models) ? (diagSummary.available_models as string[]).join(", ") : "—"}</p>
                                    <p>missing: {Array.isArray(diagSummary.missing_models) && (diagSummary.missing_models as string[]).length ? (diagSummary.missing_models as string[]).join(", ") : "—"}</p>
                                  </div>
                                ) : null}
                              </>
                            );
                          })()}
                          <pre className="max-h-48 overflow-auto rounded-md border border-white/10 bg-black/20 p-3 text-xs">{JSON.stringify(selectedSkuImageDetail, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  </>
                )}
              </div>
            </div>
            </>
            ) : null}            {skuDeleteDialogOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
                <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950/95 px-5 py-4 backdrop-blur">
                    <div>
                      <p className="text-sm font-semibold text-white">Desactivar o borrar SKU mal cargado</p>
                      <p className="text-xs text-slate-300">Primero calcula impacto con dry run. El borrado real exige escribir <code>DELETE_SKU</code>.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSkuDeleteDialogOpen(false)}>Cerrar</Button>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <Input
                          value={skuDeleteTargetId}
                          onChange={(e) => setSkuDeleteTargetId(e.target.value)}
                          placeholder="sku_id a desactivar o borrar"
                        />
                        <select
                          className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            setSkuDeleteTargetId(e.target.value);
                          }}
                        >
                          <option value="">Elegir SKU desde catálogo...</option>
                          {filteredSkusCatalog.slice(0, 100).map((sku) => {
                            const code = getSkuCodeValue(sku);
                            if (!code) return null;
                            return <option key={`sku-delete-pick-${code}`} value={code}>{code} - {getSkuNameValue(sku) || "sin nombre"}</option>;
                          })}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button variant="outline" onClick={() => skusQuery.refetch()}>
                          Refrescar catálogo
                        </Button>
                      </div>
                    </div>

                    {activeSkuDeleteInfo ? (
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                        <p className="font-mono text-slate-100">{getSkuCodeValue(activeSkuDeleteInfo)}</p>
                        <p className="mt-1 text-sm text-slate-100">{getSkuNameValue(activeSkuDeleteInfo) || "Sin nombre"}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {getSkuBrandValue(activeSkuDeleteInfo) ? <Badge variant="outline">{getSkuBrandValue(activeSkuDeleteInfo)}</Badge> : null}
                          {getSkuFamilyValue(activeSkuDeleteInfo) ? <Badge variant="outline">{getSkuFamilyValue(activeSkuDeleteInfo)}</Badge> : null}
                          <Badge variant="outline">{activeLabel((activeSkuDeleteInfo as Record<string, unknown>).is_active)}</Badge>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-100">Desactivar SKU</p><p className="mt-1 text-xs text-slate-400">Pasa el SKU a inactivo y evita que siga disponible como referencia activa.</p></div><Switch checked={skuDeleteDeleteSku} onCheckedChange={setSkuDeleteDeleteSku} /></div></div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-100">Desactivar imágenes</p><p className="mt-1 text-xs text-slate-400">Desactiva las imágenes SKU vinculadas para que salgan del dataset activo.</p></div><Switch checked={skuDeleteDeleteImages} onCheckedChange={setSkuDeleteDeleteImages} /></div></div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-100">Desactivar assets</p><p className="mt-1 text-xs text-slate-400">Incluye assets de entrenamiento vinculados al SKU si quieres limpiar también la biblioteca.</p></div><Switch checked={skuDeleteDeleteAssets} onCheckedChange={setSkuDeleteDeleteAssets} /></div></div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-100">Desactivar embeddings</p><p className="mt-1 text-xs text-slate-400">Saca embeddings del SKU para que dejen de impactar el matching visual.</p></div><Switch checked={skuDeleteDeactivateEmbeddings} onCheckedChange={setSkuDeleteDeactivateEmbeddings} /></div></div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-100">Reconstruir índice</p><p className="mt-1 text-xs text-slate-400">Recomendado después del borrado real para que el índice vectorial quede alineado con el dataset.</p></div><Switch checked={skuDeleteRebuildIndex} onCheckedChange={setSkuDeleteRebuildIndex} /></div></div>
                      <div className="rounded-lg border border-rose-300/20 bg-rose-500/10 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-rose-100">Borrar archivos físicos</p><p className="mt-1 text-xs text-rose-200/80">Úsalo solo si ya no necesitas conservar imágenes ni assets en disco.</p></div><Switch checked={skuDeleteDeleteFiles} onCheckedChange={setSkuDeleteDeleteFiles} /></div></div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => deleteSkuMutation.mutate(true)} disabled={deleteSkuMutation.isPending || !activeSkuDeleteId}>Previsualizar impacto</Button>
                      <Button variant="destructive" onClick={() => deleteSkuMutation.mutate(false)} disabled={deleteSkuMutation.isPending || !activeSkuDeleteId || skuDeleteConfirm !== "DELETE_SKU"}>Ejecutar desactivación real</Button>
                    </div>

                    <div>
                      <Label>Confirmación exacta para borrado real</Label>
                      <Input value={skuDeleteConfirm} onChange={(e) => setSkuDeleteConfirm(e.target.value)} placeholder="DELETE_SKU" />
                    </div>

                    {skuDeletePreview ? (
                      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">Impacto estimado o resultado</p>
                            <p className="text-xs text-slate-300">{skuDeletePreview.dry_run ? "Esto es una previsualización; todavía no se modificó nada." : "Estas son las acciones aplicadas sobre el SKU y su dataset."}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">{skuDeletePreview.delete_mode ?? "soft_deactivate"}</Badge>
                            <Badge variant={skuDeletePreview.dry_run ? "secondary" : "default"}>{skuDeletePreview.dry_run ? "dry_run" : "aplicado"}</Badge>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">Imágenes</p><p className="mt-1 text-sm text-slate-100">{countLabel(skuDeletePreview.impact?.images_active)} activas / {countLabel(skuDeletePreview.impact?.images_total)} total</p></div>
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">Assets</p><p className="mt-1 text-sm text-slate-100">{countLabel(skuDeletePreview.impact?.assets_active)} activos / {countLabel(skuDeletePreview.impact?.assets_total)} total</p></div>
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">Embeddings</p><p className="mt-1 text-sm text-slate-100">{countLabel(skuDeletePreview.impact?.embeddings_active)} activos / {countLabel(skuDeletePreview.impact?.embeddings_total)} total</p></div>
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">Cambios</p><p className="mt-1 text-sm text-slate-100">SKU {skuDeletePreview.changed?.sku_deactivated ? "desactivado" : "sin cambio"} · img {countLabel(skuDeletePreview.changed?.images_deactivated)}</p></div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">Modelos impactados</p><div className="mt-2 flex flex-wrap gap-2">{(skuDeletePreview.impact?.models_impacted ?? []).length ? (skuDeletePreview.impact?.models_impacted ?? []).map((model) => <Badge key={`sku-delete-model-${model}`} variant="outline">{model}</Badge>) : <span className="text-xs text-slate-500">Sin modelos reportados</span>}</div></div>
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">Índice vectorial</p><p className="mt-2 text-sm text-slate-100">rebuild_index: {skuDeletePreview.rebuild_index ? "sí" : "no"} · modo: {skuDeletePreview.rebuild_mode ?? "not_executed"}</p></div>
                        </div>
                        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                          <p className="text-xs text-slate-400">Archivos candidatos / borrados</p>
                          {(skuDeletePreview.impact?.file_candidates ?? []).length || (skuDeletePreview.deleted_files ?? []).length ? (
                            <div className="mt-2 space-y-1 text-xs text-slate-300">
                              {(skuDeletePreview.impact?.file_candidates ?? []).map((entry, idx) => <p key={`sku-file-candidate-${idx}`} className="font-mono break-all">{describeFileLike(entry)}</p>)}
                              {(skuDeletePreview.deleted_files ?? []).map((entry, idx) => <p key={`sku-file-deleted-${idx}`} className="font-mono break-all text-rose-200">{describeFileLike(entry)}</p>)}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500">No se reportaron archivos candidatos ni borrados.</p>
                          )}
                        </div>
                        {skuDeletePreview.diagnostics ? (
                          <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="text-xs text-slate-400">Diagnostics</p>
                            <pre className="mt-2 max-h-56 overflow-auto text-xs text-slate-300">{JSON.stringify(skuDeletePreview.diagnostics, null, 2)}</pre>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "assets" ? (
        <div className="space-y-4">
            <div className="rounded-xl border border-amber-300/20 bg-gradient-to-br from-amber-500/10 via-slate-950/60 to-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Assets · biblioteca visual previa al dataset</p>
                  <p className="text-xs text-slate-300">Sube imágenes por subcategoría, revísalas en el browser y adjúntalas al SKU cuando estés listo para entrar al dataset real.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{assetsSummary.total} visibles</Badge>
                  <Badge variant="outline">{assetsSummary.active} activos</Badge>
                  <Badge variant="outline">{assetsSummary.withSku} con sku sugerido</Badge>
                  <Badge variant="secondary">Destino: {selectedSkuId || assetUploadSkuId || "—"}</Badge>
                  <Button variant="outline" size="sm" onClick={() => assetsQuery.refetch()} disabled={assetsQuery.isFetching}>Refrescar</Button>
                  <Button size="sm" variant="outline" onClick={() => rebuildIndexMutation.mutate()} disabled={rebuildIndexMutation.isPending}>Publicar índice</Button>
                </div>
              </div>
            </div>

            <details className="rounded-xl border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">Flujo recomendado · preparar → asociar → revisar → probar</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">1. Preparar</p>
                  <p className="mt-1 text-sm text-slate-100">Sube assets por subcategoría cuando aún estás armando la biblioteca visual.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">2. Asociar</p>
                  <p className="mt-1 text-sm text-slate-100">Adjunta al SKU destino para crear la base visual del dataset.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">3. Revisar</p>
                  <p className="mt-1 text-sm text-slate-100">Confirma imágenes en SKUs → Dataset activo.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-400">4. Probar</p>
                  <p className="mt-1 text-sm text-slate-100">Publica índice y lanza un Shelf Job de reconocimiento.</p>
                </div>
              </div>
            </details>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
              <div className="max-h-[72vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/50 p-2">
                <p className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">SKU destino</p>
                <div className="space-y-2 p-2">
                  <Input
                    value={assetSkuSearch}
                    onChange={(e) => setAssetSkuSearch(e.target.value)}
                    placeholder="Buscar SKU..."
                    className="h-9 text-xs"
                  />
                  <Button variant="outline" size="sm" className="w-full" onClick={() => skusQuery.refetch()} disabled={skusQuery.isFetching}>Actualizar catálogo</Button>
                  <div className="space-y-2">
                    {filteredSkusForPicker.slice(0, 36).map((sku) => {
                      const code = getSkuCodeValue(sku);
                      const selected = code && code === (selectedSkuId || assetUploadSkuId);
                      return (
                        <button
                          key={`asset-sku-${code}`}
                          type="button"
                          onClick={() => {
                            setSelectedSkuId(code);
                            setAssetUploadSkuId(code);
                            setSkuImageBrowserSkuId(code);
                          }}
                          className={`w-full rounded-lg border p-2 text-left transition ${selected ? "border-amber-300/40 bg-amber-500/10 ring-1 ring-amber-400/20" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-mono text-xs text-slate-100">{code || "—"}</p>
                            <Badge variant={selected ? "default" : "outline"} className="text-[10px]">{selected ? "destino" : "elegir"}</Badge>
                          </div>
                          <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">{getSkuNameValue(sku) || "Sin nombre"}</p>
                        </button>
                      );
                    })}
                    {!filteredSkusForPicker.length ? <p className="py-4 text-center text-xs text-slate-400">Sin coincidencias.</p> : null}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
            <div className="rounded-xl border border-amber-300/20 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Subir assets</p>
                  <p className="mt-1 text-xs text-slate-300">Carga por subcategoría. El SKU es opcional si solo quieres armar biblioteca.</p>
                </div>
                <Badge variant="outline">Archivos: {selectedAssetFiles.length}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div>
                  <Label>subcategoría</Label>
                  <Input value={assetUploadSubcategory} onChange={(e) => setAssetUploadSubcategory(e.target.value)} placeholder="LIMPIEZA" />
                </div>
                <div>
                  <Label>asset_type</Label>
                  <Input value={assetUploadType} onChange={(e) => setAssetUploadType(e.target.value)} placeholder="catalog" />
                </div>
                <div>
                  <Label>sku_id (opcional)</Label>
                  <Input value={assetUploadSkuId} onChange={(e) => setAssetUploadSkuId(e.target.value)} placeholder="KALIPTO_DESINF_1L" />
                </div>
                <div>
                  <Label>archivos</Label>
                  <Input type="file" accept="image/*" multiple onChange={(e) => setSelectedAssetFiles(Array.from(e.target.files ?? []))} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => uploadAssetsMutation.mutate()} disabled={uploadAssetsMutation.isPending || !selectedAssetFiles.length}>
                  Subir assets
                </Button>
                <Button variant="outline" onClick={() => rebuildIndexMutation.mutate()} disabled={rebuildIndexMutation.isPending}>
                  Reconstruir índice
                </Button>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                <p><span className="font-medium text-slate-100">Cuándo usar esta carga:</span> biblioteca visual antes de asociar al SKU.</p>
                <p className="mt-1"><span className="font-medium text-slate-100">Cuándo no:</span> carga directa al dataset → pestaña SKUs → Cargas.</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Asset browser</p>
                  <p className="text-xs text-slate-300">Filtra la biblioteca y adjunta al SKU destino de la barra lateral.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Assets visibles: {(assetsQuery.data ?? []).length}</Badge>
                  <Button variant="outline" onClick={() => {
                    setAssetFilterSubcategory("");
                    setAssetFilterSkuId("");
                    setAssetFilterType("");
                  }}>
                    Limpiar filtros
                  </Button>
                  <Button variant="outline" onClick={() => assetsQuery.refetch()}>Refrescar</Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div>
                  <Label>subcategoría</Label>
                  <Input list="shelf-subcategories" value={assetFilterSubcategory} onChange={(e) => setAssetFilterSubcategory(e.target.value)} placeholder="Todas" />
                  <datalist id="shelf-subcategories">
                    {(assetSubcategoriesQuery.data ?? []).map((item) => <option key={`subcat-${item}`} value={item} />)}
                  </datalist>
                </div>
                <div>
                  <Label>sku_id</Label>
                  <Input value={assetFilterSkuId} onChange={(e) => setAssetFilterSkuId(e.target.value)} placeholder="Opcional" />
                </div>
                <div>
                  <Label>asset_type</Label>
                  <Input value={assetFilterType} onChange={(e) => setAssetFilterType(e.target.value)} placeholder="catalog" />
                </div>
                <div>
                  <Label>Adjuntar a SKU</Label>
                  <Input value={selectedSkuId} onChange={(e) => setSelectedSkuId(e.target.value)} placeholder="sku_id destino" />
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                <p><span className="font-medium text-slate-100">Qué ves aquí:</span> imágenes todavía en modo biblioteca, aunque algunas ya puedan tener `sku_id` sugerido.</p>
                <p className="mt-1"><span className="font-medium text-slate-100">Qué pasa al adjuntar:</span> el asset se convierte en imagen útil del SKU y pasa al dataset real que luego revisas en la pestaña `SKUs`.</p>
              </div>

              {assetsQuery.data?.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {assetsQuery.data.map((asset, idx) => {
                    const assetId = asset.asset_id ?? asset.id ?? idx;
                    const preview = previewUrlOf(asset as Record<string, unknown>);
                    const hasPreview = previewAvailableOf(asset as Record<string, unknown>);
                    const active = (asset.is_active ?? true) !== false && (asset.is_active ?? 1) !== 0;
                    return (
                      <div key={`asset-${assetId}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                        {hasPreview && preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt={String(asset.original_name ?? assetId)} className="h-40 w-full rounded-md object-cover" />
                        ) : (
                          <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed border-white/10 px-4 text-center text-xs text-slate-400">
                            <span>Sin preview pública</span>
                            <span className="mt-1 text-[11px] text-slate-500">{previewUnavailableReasonOf(asset as Record<string, unknown>)}</span>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={active ? "default" : "secondary"}>{active ? "Activo" : "Inactivo"}</Badge>
                          <Badge variant="outline">{firstNonEmptyString(asset.asset_type, "catalog")}</Badge>
                          {asset.subcategoria ? <Badge variant="outline">{asset.subcategoria}</Badge> : null}
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-slate-300">
                          <p><span className="text-slate-400">asset_id:</span> {String(assetId)}</p>
                          <p><span className="text-slate-400">archivo:</span> {firstNonEmptyString(asset.original_name) || "-"}</p>
                          <p><span className="text-slate-400">sku_id:</span> {firstNonEmptyString(asset.sku_id) || "-"}</p>
                          <p><span className="text-slate-400">size:</span> {typeof asset.size_bytes === "number" ? `${Math.round(asset.size_bytes / 1024)} KB` : "-"}</p>
                          <p><span className="text-slate-400">created_at:</span> {firstNonEmptyString(asset.created_at) || "-"}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => attachAssetToSkuMutation.mutate(String(assetId))}
                            disabled={!selectedSkuId.trim()}
                          >
                            Adjuntar a SKU
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteAssetMutation.mutate(assetId)}
                          >
                            Desactivar asset
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">
                  <p>No hay assets para los filtros actuales.</p>
                  <p className="mt-1 text-xs text-slate-500">Prueba Limpiar filtros o sube assets arriba.</p>
                </div>
              )}
            </div>
              </div>
            </div>
        </div>
      ) : null}

      {tab === "index" ? (
        <div className="space-y-4">
            <div className="rounded-xl border border-violet-300/20 bg-gradient-to-br from-violet-500/10 via-slate-950/60 to-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Índice y configuración Shelf</p>
                  <p className="text-xs text-slate-300">Gestiona índice vectorial DINO/SigLIP, mantenimiento del catálogo y parámetros de reconocimiento.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">dinov2: {vectorIndexHealth.dinov2.status}</Badge>
                  <Badge variant="outline">siglip: {vectorIndexHealth.siglip.status}</Badge>
                  <Badge variant="outline">dim {vectorIndexHealth.dinov2.sampleDim ?? "—"} / {vectorIndexHealth.siglip.sampleDim ?? "—"}</Badge>
                  <Button size="sm" onClick={() => rebuildIndexMutation.mutate()} disabled={rebuildIndexMutation.isPending}>Reconstruir índice</Button>
                  <Button size="sm" variant="outline" onClick={() => { versionsQuery.refetch(); configQuery.refetch(); activeConfigQuery.refetch(); }}>Refrescar</Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={indexWorkspaceSection === "indices" ? "default" : "outline"} onClick={() => setIndexWorkspaceSection("indices")}>Índices y operaciones</Button>
              <Button size="sm" variant={indexWorkspaceSection === "config" ? "default" : "outline"} onClick={() => setIndexWorkspaceSection("config")}>Configuración</Button>
              <Button size="sm" variant={indexWorkspaceSection === "tecnico" ? "default" : "outline"} onClick={() => setIndexWorkspaceSection("tecnico")}>Vista técnica</Button>
            </div>

            {indexWorkspaceSection === "indices" ? (
            <div className="space-y-4">
            <div className="rounded-xl border border-amber-300/20 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Normalizar SKUs duplicados por mayúsculas/minúsculas</p>
                  <p className="text-xs text-slate-300">Útil para unificar variantes como `LML0103` vs `lml0103` sin borrar físicamente el historial.</p>
                </div>
                <Badge variant="outline">/shelf/skus/normalize</Badge>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
                <div>
                  <Label>sku_ids opcionales</Label>
                  <Textarea value={normalizeSkuIdsText} onChange={(e) => setNormalizeSkuIdsText(e.target.value)} rows={4} className="font-mono text-xs" />
                  <p className="mt-1 text-xs text-slate-400">Déjalo vacío para analizar todo el catálogo. Uno por línea o separados por coma.</p>
                </div>
                <div>
                  <Label>strategy</Label>
                  <select className="mt-2 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={normalizeStrategy} onChange={(e) => setNormalizeStrategy(e.target.value)}>
                    <option value="uppercase">uppercase</option>
                  </select>
                  <label className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                    <Switch checked={normalizeRebuildIndex} onCheckedChange={setNormalizeRebuildIndex} />
                    Rebuild índice al aplicar
                  </label>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <Button variant="outline" onClick={() => normalizeSkusMutation.mutate(true)} disabled={normalizeSkusMutation.isPending}>
                    Analizar normalización
                  </Button>
                  <Button onClick={() => normalizeSkusMutation.mutate(false)} disabled={normalizeSkusMutation.isPending}>
                    Aplicar normalización
                  </Button>
                </div>
              </div>
              {normalizeResult ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Resultado normalización</p>
                  <pre className="mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify(normalizeResult, null, 2)}</pre>
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Reconstruir índices con alcance controlado</p>
                  <p className="text-xs text-slate-300">Puedes reconstruir todo el catálogo, solo un SKU o una categoría. En async, la operación reporta progreso.</p>
                </div>
                <Badge variant="outline">/shelf/vector-index/rebuild</Badge>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[220px_1fr_1fr_auto]">
                <div>
                  <Label>Alcance</Label>
                  <select className="mt-2 h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={indexRebuildScope} onChange={(e) => setIndexRebuildScope(e.target.value as "catalogo" | "sku" | "categoria")}>
                    <option value="catalogo">Todo el catálogo</option>
                    <option value="sku">Solo un SKU</option>
                    <option value="categoria">Solo una categoría</option>
                  </select>
                </div>
                <div>
                  <Label>sku_id</Label>
                  <Input value={indexRebuildSkuId} onChange={(e) => setIndexRebuildSkuId(e.target.value)} placeholder="LML0103" disabled={indexRebuildScope !== "sku"} />
                </div>
                <div>
                  <Label>categoria</Label>
                  <Input value={indexRebuildCategoria} onChange={(e) => setIndexRebuildCategoria(e.target.value)} placeholder="LIMPIADORES LIQUIDOS" disabled={indexRebuildScope !== "categoria"} />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                    <Switch checked={indexRebuildAsync} onCheckedChange={setIndexRebuildAsync} />
                    Async
                  </label>
                  <Button onClick={() => scopedRebuildIndexMutation.mutate()} disabled={scopedRebuildIndexMutation.isPending}>
                    Lanzar rebuild
                  </Button>
                </div>
              </div>
              {(activeShelfOperationId || shelfOperationQuery.data) ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">operation_id: {activeShelfOperationId || shelfOperationQuery.data?.operation_id || "-"}</Badge>
                    <Badge variant={String(shelfOperationQuery.data?.status ?? "").toLowerCase() === "failed" ? "destructive" : "secondary"}>
                      {shelfOperationQuery.data?.status ?? "running"}
                    </Badge>
                    <Badge variant="outline">
                      {typeof shelfOperationQuery.data?.progress?.percent === "number" ? `${shelfOperationQuery.data?.progress?.percent}%` : "sin %"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">
                    Paso: {firstNonEmptyString(shelfOperationQuery.data?.progress?.step) || "-"} · actual {firstNonEmptyString(shelfOperationQuery.data?.progress?.current) || "0"} / {firstNonEmptyString(shelfOperationQuery.data?.progress?.total) || "0"}
                  </p>
                  {shelfOperationQuery.data?.message ? <p className="mt-1 text-xs text-slate-400">{shelfOperationQuery.data.message}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Confiabilidad y comparación entre jobs</p>
                  <p className="text-xs text-slate-300">Sirve para verificar si un cambio realmente mejora: menos revisión, menos ambiguos y mejor reliability score.</p>
                </div>
                <Badge variant="outline">/shelf/reliability/*</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div><Label>limit_jobs</Label><Input value={reliabilityLimitJobs} onChange={(e) => setReliabilityLimitJobs(e.target.value)} /></div>
                <div><Label>ambiguous_delta</Label><Input value={reliabilityAmbiguousDelta} onChange={(e) => setReliabilityAmbiguousDelta(e.target.value)} /></div>
                <div><Label>created_from</Label><Input type="date" value={reliabilityCreatedFrom} onChange={(e) => setReliabilityCreatedFrom(e.target.value)} /></div>
                <div><Label>created_to</Label><Input type="date" value={reliabilityCreatedTo} onChange={(e) => setReliabilityCreatedTo(e.target.value)} /></div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">avg_reliability_score</p><p className="mt-1 text-lg font-semibold text-slate-100">{typeof reliabilitySummaryQuery.data?.avg_reliability_score === "number" ? reliabilitySummaryQuery.data.avg_reliability_score.toFixed(3) : "-"}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">review_rate</p><p className="mt-1 text-lg font-semibold text-slate-100">{typeof reliabilitySummaryQuery.data?.review_rate === "number" ? `${(reliabilitySummaryQuery.data.review_rate * 100).toFixed(1)}%` : "-"}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">ambiguous_rate</p><p className="mt-1 text-lg font-semibold text-slate-100">{typeof reliabilitySummaryQuery.data?.ambiguous_rate === "number" ? `${(reliabilitySummaryQuery.data.ambiguous_rate * 100).toFixed(1)}%` : "-"}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-slate-400">unknown_rate</p><p className="mt-1 text-lg font-semibold text-slate-100">{typeof reliabilitySummaryQuery.data?.unknown_rate === "number" ? `${(reliabilitySummaryQuery.data.unknown_rate * 100).toFixed(1)}%` : "-"}</p></div>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr_auto]">
                <div>
                  <Label>baseline_job_id</Label>
                  <Input value={reliabilityCompareBaselineJobId} onChange={(e) => setReliabilityCompareBaselineJobId(e.target.value)} placeholder="2026-06-05_11-34-58" />
                </div>
                <div>
                  <Label>candidate_job_id</Label>
                  <Input value={reliabilityCompareCandidateJobId} onChange={(e) => setReliabilityCompareCandidateJobId(e.target.value)} placeholder="2026-06-05_11-34-59" />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => reliabilityCompareQuery.refetch()} disabled={!reliabilityCompareBaselineJobId.trim() || !reliabilityCompareCandidateJobId.trim()}>
                    Comparar jobs
                  </Button>
                </div>
              </div>
              {reliabilityCompareQuery.data ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Comparación baseline vs candidate</p>
                  <pre className="mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify(reliabilityCompareQuery.data, null, 2)}</pre>
                </div>
              ) : null}
              <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-300">JSON resumen confiabilidad</summary>
                <pre className="mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify(reliabilitySummaryQuery.data ?? {}, null, 2)}</pre>
              </details>
            </div>
            </div>
            ) : null}

            {indexWorkspaceSection === "config" ? (
            <div className="space-y-4">
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
              <div className="mb-4 rounded-lg border border-sky-300/20 bg-sky-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Detector heredado de la cuenta</p>
                    <p className="text-xs text-slate-300">
                      Shelf usa este detector general para encontrar productos/crops antes del matching. Aquí solo lo resumimos; la edición completa vive en la configuración general de la cuenta.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">detector/status + config activa</Badge>
                    <Link
                      href={`/accounts/${encodeURIComponent(account)}/config`}
                      className="inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                    >
                      Editar detector
                    </Link>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">mode</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{detectorConfigSummary.mode || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">ready</p>
                    <div className="mt-1">
                      <Badge variant={detectorStatusQuery.data?.ready === false ? "destructive" : "default"}>
                        {detectorStatusQuery.data?.ready === false ? "no listo" : "listo"}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">filters.min_confidence</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{firstNonEmptyString(detectorConfigSummary.minConfidence, "-")}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">fallback_to_local_on_error</p>
                    <div className="mt-1">
                      <Badge variant={detectorConfigSummary.fallbackToLocalOnError ? "default" : "secondary"}>
                        {detectorConfigSummary.fallbackToLocalOnError ? "activo" : "apagado"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Fuente del detector</p>
                    <div className="mt-2 space-y-2 text-sm text-slate-200">
                      {detectorConfigSummary.mode === "local" ? (
                        <p>Modelo local: {detectorConfigSummary.localModelPath || "-"}</p>
                      ) : (
                        <>
                          <p>Workspace: {detectorConfigSummary.roboflowWorkspace || "-"}</p>
                          <p>Project: {detectorConfigSummary.roboflowProject || "-"}</p>
                          <p>Version: {detectorConfigSummary.roboflowVersion || "-"}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">primary_area_filter</p>
                    <div className="mt-2 space-y-2 text-sm text-slate-200">
                      <p>enabled: {detectorConfigSummary.primaryAreaFilterEnabled ? "true" : "false"}</p>
                      <p>discard_if_smaller_pct: {detectorConfigSummary.primaryAreaDiscardPct || "-"}</p>
                      <p>min_detections: {detectorConfigSummary.primaryAreaMinDetections || "-"}</p>
                      </div>
                    </div>
                  </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-100">Modelo YOLO local</p>
                      <p className="mt-1 text-xs text-slate-400">Puedes cambiar el modelo local desde aquí. Esto actualiza la config general heredada por Shelf.</p>
                    </div>
                    <Badge variant={detectorConfigSummary.mode === "local" ? "default" : "secondary"}>
                      {detectorConfigSummary.mode === "local" ? "local activo" : "modo actual: roboflow_api"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <select
                      className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                      value={
                        (detectorModelsQuery.data?.models ?? []).some((model) => model.path === detectorConfigSummary.localModelPath || model.absolute_path === detectorConfigSummary.localModelPath)
                          ? detectorConfigSummary.localModelPath
                          : "__current__"
                      }
                      onChange={(e) => {
                        const next = e.target.value;
                        if (!next || next === "__current__") return;
                        saveDetectorLocalModelMutation.mutate(next);
                      }}
                    >
                      <option value="__current__">
                        {detectorConfigSummary.localModelPath ? `Actual: ${detectorConfigSummary.localModelPath}` : "Selecciona un modelo local"}
                      </option>
                      {(detectorModelsQuery.data?.models ?? []).map((model) => {
                        const value = model.path || model.absolute_path || "";
                        const label = [model.filename || model.path, model.size_bytes ? `${Math.max(1, Math.round(model.size_bytes / 1024 / 1024))} MB` : ""].filter(Boolean).join(" · ");
                        return <option key={`shelf-detector-model-${value}`} value={value}>{label}</option>;
                      })}
                    </select>
                    <Button
                      variant="outline"
                      onClick={() => detectorModelsQuery.refetch()}
                      disabled={detectorModelsQuery.isFetching}
                    >
                      Refrescar modelos
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    {detectorModelsQuery.isLoading ? "Buscando modelos YOLO locales..." : "Si necesitas una ruta custom distinta, sigue disponible la edición completa en Config OCR."}
                  </div>
                  {(detectorModelsQuery.data?.notes ?? []).length ? (
                    <div className="mt-2 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
                      {(detectorModelsQuery.data?.notes ?? []).map((note, idx) => (
                        <p key={`shelf-detector-note-${idx}`}>- {note}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs text-slate-400">allowed_labels</p>
                    <div className="flex flex-wrap gap-2">
                      {detectorConfigSummary.allowedLabels.length ? detectorConfigSummary.allowedLabels.map((label) => (
                        <Badge key={`detector-allowed-${label}`} variant="outline">{label}</Badge>
                      )) : <span className="text-xs text-slate-400">Sin labels permitidas explícitas.</span>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs text-slate-400">ignored_labels</p>
                    <div className="flex flex-wrap gap-2">
                      {detectorConfigSummary.ignoredLabels.length ? detectorConfigSummary.ignoredLabels.map((label) => (
                        <Badge key={`detector-ignored-${label}`} variant="secondary">{label}</Badge>
                      )) : <span className="text-xs text-slate-400">Sin labels ignoradas explícitas.</span>}
                    </div>
                  </div>
                </div>
                {detectorStatusQuery.data?.warnings && Array.isArray(detectorStatusQuery.data.warnings) && detectorStatusQuery.data.warnings.length ? (
                  <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
                    <p className="text-xs font-semibold text-amber-100">Warnings del detector</p>
                    <ul className="mt-2 space-y-1 text-xs text-amber-50">
                      {detectorStatusQuery.data.warnings.map((warning, idx) => <li key={`detector-warning-${idx}`}>- {String(warning)}</li>)}
                    </ul>
                  </div>
                ) : null}
                {detectorStatusQuery.data?.errors && Array.isArray(detectorStatusQuery.data.errors) && detectorStatusQuery.data.errors.length ? (
                  <div className="mt-3 rounded-lg border border-rose-300/20 bg-rose-500/10 p-3">
                    <p className="text-xs font-semibold text-rose-100">Errores del detector</p>
                    <ul className="mt-2 space-y-1 text-xs text-rose-50">
                      {detectorStatusQuery.data.errors.map((error, idx) => <li key={`detector-error-${idx}`}>- {String(error)}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Editor visual de confianza Shelf</p>
                  <p className="text-xs text-slate-300">Aquí defines desde qué porcentaje consideramos un match como alto, medio o bajo. Esto afecta `confidence_state` y las recomendaciones automáticas.</p>
                </div>
                <Badge variant="outline">Config activa: {activeConfigQuery.data?.name ?? "default"} v{activeConfigQuery.data?.version ?? "-"}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <div>
                  <Label>high_min</Label>
                  <Input value={thresholdForm.high_min} onChange={(e) => setThresholdForm((p) => ({ ...p, high_min: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-slate-400">Ej. `0.70` si quieres exigir 70% mínimo para alto.</p>
                </div>
                <div>
                  <Label>high_delta</Label>
                  <Input value={thresholdForm.high_delta} onChange={(e) => setThresholdForm((p) => ({ ...p, high_delta: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-slate-400">Ventaja mínima frente al top2 para autoaceptar.</p>
                </div>
                <div>
                  <Label>medium_min</Label>
                  <Input value={thresholdForm.medium_min} onChange={(e) => setThresholdForm((p) => ({ ...p, medium_min: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-slate-400">Umbral base para “usable pero revisar”.</p>
                </div>
                <div>
                  <Label>medium_delta</Label>
                  <Input value={thresholdForm.medium_delta} onChange={(e) => setThresholdForm((p) => ({ ...p, medium_delta: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-slate-400">Separación mínima para mantenerlo en medio.</p>
                </div>
                <div>
                  <Label>low_min</Label>
                  <Input value={thresholdForm.low_min} onChange={(e) => setThresholdForm((p) => ({ ...p, low_min: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-slate-400">Debajo de esto suele terminar en bajo o unknown.</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">
                <p><span className="font-medium text-slate-100">Ejemplo:</span> si pones `high_min = 0.70`, los resultados de `0.40`, `0.50` o `0.60` dejarán de calificar como alta confianza.</p>
                <p className="mt-1"><span className="font-medium text-slate-100">Importante:</span> esto no filtra por sí solo el `master_html`; cambia la clasificación. Si luego quieres ocultar resultados menores a `0.70` en reportes, ese filtro adicional va en backend.</p>
              </div>
              <div className="mt-4 rounded-lg border border-fuchsia-300/20 bg-fuchsia-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Recortes segmentados para Shelf</p>
                    <p className="mt-1 text-xs text-slate-300">Solo aplica si el modelo local entrega máscara. Si no hay segmentación disponible, el pipeline sigue usando bbox normal.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={cropMaskingConfig.enabled ? "default" : "outline"}>
                      {cropMaskingConfig.enabled ? "Segmentación activada" : "Usando bbox clásico"}
                    </Badge>
                    <Switch
                      checked={cropMaskingConfig.enabled}
                      onCheckedChange={(checked) => saveCropMaskingMutation.mutate(checked)}
                      disabled={saveCropMaskingMutation.isPending || activeConfigQuery.isLoading}
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">background</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{cropMaskingConfig.background}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">only_when_segmentation_available</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{cropMaskingConfig.onlyWhenSegmentationAvailable ? "true" : "false"}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Impacto esperado</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">Solo Shelf Recognition</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => saveThresholdsMutation.mutate()} disabled={saveThresholdsMutation.isPending || activeConfigQuery.isLoading}>
                  Guardar thresholds
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const next = extractShelfThresholds(configQuery.data ?? {});
                    setThresholdForm({
                      high_min: String(next.high_min),
                      high_delta: String(next.high_delta),
                      medium_min: String(next.medium_min),
                      medium_delta: String(next.medium_delta),
                      low_min: String(next.low_min),
                    });
                  }}
                >
                  Restaurar desde config actual
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Dataset summary + FAISS shadow</p>
                  <p className="text-xs text-slate-300">Aquí separas muestras de entrenamiento, validación y reserva, y decides si el rebuild genera artefactos FAISS shadow además del índice activo actual.</p>
                </div>
                <Badge variant="outline">/shelf/dataset/summary + /shelf/config</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={datasetSummarySkuId} onChange={(e) => setDatasetSummarySkuId(e.target.value)} placeholder="SKU opcional para resumen puntual" />
                <Button variant="outline" onClick={() => datasetSummaryQuery.refetch()}>Refrescar resumen</Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Imágenes</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{String(datasetSummaryTotalsFromResponse(datasetSummaryQuery.data).total_images || "-")}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Indexables</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{String(datasetSummaryTotalsFromResponse(datasetSummaryQuery.data).indexable_images || "-")}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">SKUs</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{String(datasetSummaryBySkuRows(datasetSummaryQuery.data).length || datasetSummaryQuery.data?.summary?.skus || datasetSummaryQuery.data?.totals?.skus || "-")}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-xs text-slate-400">by_role</p>
                  <div className="space-y-2 text-sm">
                    {(datasetSummaryQuery.data?.by_role ?? []).length ? (
                      (datasetSummaryQuery.data?.by_role ?? []).map((item, idx) => (
                        <div key={`dataset-role-${idx}`} className="flex items-center justify-between rounded-md border border-white/10 bg-slate-950/40 px-3 py-2">
                          <span>{String(item.dataset_role ?? "-")}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={item.indexable ? "default" : "secondary"}>{item.indexable ? "indexable" : "fuera de índice"}</Badge>
                            <Badge variant="outline">{String(item.count ?? 0)}</Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">Sin resumen por rol todavía.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-xs text-slate-400">by_split</p>
                  <div className="space-y-2 text-sm">
                    {(datasetSummaryQuery.data?.by_split ?? []).length ? (
                      (datasetSummaryQuery.data?.by_split ?? []).map((item, idx) => (
                        <div key={`dataset-split-${idx}`} className="flex items-center justify-between rounded-md border border-white/10 bg-slate-950/40 px-3 py-2">
                          <span>{String(item.dataset_split ?? "sin split")}</span>
                          <Badge variant="outline">{String(item.count ?? 0)}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">Sin splits reportados todavía.</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100">FAISS shadow habilitado</p>
                      <p className="mt-1 text-xs text-slate-400">Genera artefactos shadow de escalabilidad sin cambiar el índice activo del pipeline.</p>
                    </div>
                    <Switch checked={faissShadowEnabledDraft} onCheckedChange={setFaissShadowEnabledDraft} />
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100">Engine shadow FAISS</p>
                      <p className="mt-1 text-xs text-slate-400">Si lo apagas, el shadow_engines queda vacío.</p>
                    </div>
                    <Switch checked={faissShadowEngineDraft} onCheckedChange={setFaissShadowEngineDraft} />
                  </div>
                </div>
                <div className="flex items-end">
                  <Button onClick={() => saveShelfVectorStoreMutation.mutate()} disabled={saveShelfVectorStoreMutation.isPending}>
                    Guardar vector_store
                  </Button>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs text-slate-400">Shadow indexes publicados</p>
                {shadowIndexRows.length ? (
                  <div className="space-y-2">
                    {shadowIndexRows.map((entry, idx) => (
                      <div key={`shadow-index-${idx}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{entry.modelName}</Badge>
                          <Badge variant="secondary">{firstNonEmptyString(entry.shadow.engine, entry.shadow.name, "shadow")}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={String(entry.shadow.status ?? "").toLowerCase() === "unavailable" ? "destructive" : "default"}>
                            {String(entry.shadow.status ?? "ok")}
                          </Badge>
                          {firstNonEmptyString(entry.shadow.version) ? <Badge variant="outline">{String(entry.shadow.version)}</Badge> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Aún no hay shadow indexes publicados o backend no los expuso en versions.</p>
                )}
              </div>
            </div>
            <ShelfOcrSkuAssistConfig
              draft={ocrAssistDraft}
              dirty={ocrAssistDirty}
              saving={saveOcrAssistMutation.isPending}
              onChange={(updater) => {
                setOcrAssistDraft(updater);
                setOcrAssistDirty(true);
              }}
              onSave={() => saveOcrAssistMutation.mutate()}
            />
            </div>
            ) : null}

            {indexWorkspaceSection === "tecnico" ? (
            <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-slate-100">Payloads crudos de backend</p>
              <p className="mt-1 text-xs text-slate-400">Fuente de verdad para depuración: shelf/config y vector-index/versions.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="mb-1 text-xs text-slate-400">shelf/config (fuente de verdad para dino/siglip)</p>
              <pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(configQuery.data ?? {}, null, 2)}</pre>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="mb-1 text-xs text-slate-400">vector-index/versions</p>
              <pre className="max-h-96 overflow-auto text-xs">{JSON.stringify(versionsQuery.data ?? [], null, 2)}</pre>
            </div>
            </div>
            ) : null}
        </div>
      ) : null}

      {tab === "review" ? (
        <div className="space-y-4">
            <div className="rounded-xl border border-rose-300/20 bg-gradient-to-br from-rose-500/10 via-slate-950/60 to-slate-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Review queue · crops pendientes de decisión</p>
                  <p className="text-xs text-slate-300">Resuelve low_confidence y unknown_sku. Elige el SKU correcto en la barra lateral y, si aplica, marca candidatos como similar pero incorrecto.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{reviewQueueSummary.total} en cola</Badge>
                  <Badge variant="secondary">{reviewQueueSummary.low} low</Badge>
                  <Badge variant="outline">{reviewQueueSummary.unknown} unknown</Badge>
                  <Badge variant="outline">{reviewQueueSummary.medium} medium</Badge>
                  <Badge variant="outline">SKU: {reviewDecisionSkuId || "—"}</Badge>
                  <Button size="sm" variant="outline" onClick={() => reviewQueueQuery.refetch()} disabled={reviewQueueQuery.isFetching}>Refrescar</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
              <div className="max-h-[72vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/50 p-2">
                <p className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">SKU correcto (ancla)</p>
                <p className="px-2 pt-2 text-[11px] text-slate-500">Usado para assign_sku y para registrar confusiones. No mueve imágenes al SKU confundido.</p>
                <div className="space-y-2 p-2">
                  <Input
                    placeholder="Buscar SKU..."
                    value={reviewSkuSearch}
                    onChange={(e) => setReviewSkuSearch(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <Button variant="outline" size="sm" className="w-full" onClick={() => skusQuery.refetch()} disabled={skusQuery.isFetching}>Actualizar catálogo</Button>
                  <div className="space-y-2">
                    {filteredReviewSkus.map((sku) => {
                      const code = getSkuCodeValue(sku);
                      const selected = code === reviewDecisionSkuId;
                      return (
                        <button
                          key={`review-sku-${code}`}
                          type="button"
                          onClick={() => setReviewDecisionSkuId(code)}
                          className={`w-full rounded-lg border p-2 text-left transition ${selected ? "border-rose-300/40 bg-rose-500/10 ring-1 ring-rose-400/20" : "border-white/10 bg-black/20 hover:bg-black/30"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-mono text-xs text-slate-100">{code || "—"}</p>
                            <Badge variant={selected ? "default" : "outline"} className="text-[10px]">{selected ? "asignar" : "elegir"}</Badge>
                          </div>
                          <p className="mt-1 line-clamp-1 text-[11px] text-slate-400">{getSkuNameValue(sku) || "Sin nombre"}</p>
                        </button>
                      );
                    })}
                    {!filteredReviewSkus.length ? <p className="py-4 text-center text-xs text-slate-400">Sin coincidencias.</p> : null}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-slate-100">Filtrar cola</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Input placeholder="Buscar job, SKU predicho o motivo..." value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} className="max-w-md" />
                    {([
                      ["all", "Todos"],
                      ["low_confidence", "low_confidence"],
                      ["medium_confidence", "medium"],
                      ["unknown_sku", "unknown"],
                      ["high_confidence", "high"],
                    ] as const).map(([key, label]) => (
                      <Button key={`rq-filter-${key}`} size="sm" variant={reviewStateFilter === key ? "default" : "outline"} onClick={() => setReviewStateFilter(key)}>{label}</Button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{filteredReviewItems.length} de {reviewQueueSummary.total} visibles · auto-refresh 4s</p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>item_id</TableHead>
                        <TableHead>job_id</TableHead>
                        <TableHead>confidence_state</TableHead>
                        <TableHead>predicted_sku</TableHead>
                        <TableHead>accion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReviewItems.map((item: ShelfReviewQueueItem) => {
                        const id = item.item_id ?? item.id ?? 0;
                        const idKey = String(id);
                        const predictedCode = reviewItemPredictedSkuCode(item);
                        const anchorSku = reviewDecisionSkuId.trim();
                        const canMarkPredictedConfusion = Boolean(anchorSku) && Boolean(predictedCode) && !skuCodesEqual(anchorSku, predictedCode);
                        const predictedConfusionKey = canMarkPredictedConfusion ? skuConfusionKey(anchorSku, predictedCode) : "";
                        const predictedConfusionSaved = predictedConfusionKey ? savedSkuConfusionKeys.has(predictedConfusionKey) : false;
                        return (
                          <TableRow
                            key={`rq-${id}`}
                            className={selectedReviewItemId === idKey ? "bg-rose-500/10" : "cursor-pointer hover:bg-white/5"}
                            onClick={() => setSelectedReviewItemId(idKey)}
                          >
                            <TableCell className="font-mono text-xs">{idKey}</TableCell>
                            <TableCell className="font-mono text-xs">{String(item.job_id ?? "-")}</TableCell>
                            <TableCell>{confidenceBadge(String(item.confidence_state ?? ""))}</TableCell>
                            <TableCell>
                              <p className="font-mono text-xs">{predictedCode || "-"}</p>
                              {item.predicted_sku_name && !skuCodesEqual(predictedCode, item.predicted_sku_name) ? (
                                <p className="text-[11px] text-slate-400">{item.predicted_sku_name}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="outline" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "accept_top1" })}>accept_top1</Button>
                                <Button size="sm" variant="outline" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "assign_sku" })} disabled={!reviewDecisionSkuId.trim()}>assign_sku</Button>
                                <Button size="sm" variant="outline" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "mark_unknown" })}>mark_unknown</Button>
                                <Button size="sm" variant="ghost" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "discard_crop" })}>discard</Button>
                                {canMarkPredictedConfusion ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-amber-100 hover:text-amber-50"
                                    disabled={markSkuConfusionMutation.isPending || predictedConfusionSaved}
                                    title="No reasigna la imagen. Solo guarda que este SKU suele confundirse con el correcto."
                                    onClick={() => markSkuConfusionMutation.mutate({ anchorSku, negativeSku: predictedCode })}
                                  >
                                    {predictedConfusionSaved ? "Confusión guardada" : "Similar pero incorrecto"}
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!filteredReviewItems.length ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-slate-400">No hay items para los filtros actuales.</TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>

                {selectedReviewItem ? (
                  <div className="rounded-xl border border-rose-300/20 bg-rose-500/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">Item {selectedReviewItemId} · candidatos similares</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {reviewDecisionSkuId.trim()
                            ? `SKU correcto (ancla): ${reviewDecisionSkuId.trim()}`
                            : "Elige el SKU correcto en la barra lateral para registrar confusiones."}
                        </p>
                      </div>
                      {selectedReviewItem.crop_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selectedReviewItem.crop_url}
                          alt={`crop-${selectedReviewItemId}`}
                          className="h-28 w-28 rounded-md border border-white/10 bg-black/30 object-contain"
                        />
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <SimilarCandidatesPanel
                        candidates={reviewItemTopCandidates(selectedReviewItem)}
                        anchorSku={reviewDecisionSkuId.trim()}
                        selectedSku={reviewDecisionSkuId.trim()}
                        onSelectCandidate={(code) => setReviewDecisionSkuId(code)}
                        onMarkConfusion={(anchor, negative) => markSkuConfusionMutation.mutate({ anchorSku: anchor, negativeSku: negative })}
                        onMarkAllRemainingConfusions={(anchor, negatives) => markAllSkuConfusionsMutation.mutate({ anchorSku: anchor, negativeSkus: negatives })}
                        isMarking={markSkuConfusionMutation.isPending || markAllSkuConfusionsMutation.isPending}
                        isMarkingAll={markAllSkuConfusionsMutation.isPending}
                        savedConfusionKeys={savedSkuConfusionKeys}
                        maxItems={5}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Selecciona un item de la tabla para ver candidatos y registrar confusiones.</p>
                )}
              </div>
            </div>
        </div>
      ) : null}

      {tab === "results" && selectedResultTrainingItems.length ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-emerald-300/30 bg-slate-950/95 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-100">Entrenamiento grupal · {selectedResultTrainingItems.length} crops</p>
              <p className="text-xs text-slate-400">SKU destino: {cropActionSkuId || "pendiente"} · {cropActionSkuLookup.exactVerified ? "verificado" : "sin verificar"}</p>
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:max-w-2xl">
              <Input
                value={cropActionSkuId}
                onChange={(e) => {
                  setCropActionSkuId(e.target.value);
                  setCropActionSkuSearch(e.target.value);
                }}
                placeholder="SKU destino (ej. LML0108)"
              />
              <Input value={trainingGroupLabel} onChange={(e) => setTrainingGroupLabel(e.target.value)} placeholder="Etiqueta del grupo (opcional)" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => batchPromoteCropsMutation.mutate()} disabled={batchPromoteCropsMutation.isPending || !cropActionSkuLookup.exactVerified}>
                Guardar {selectedResultTrainingItems.length} en dataset
              </Button>
              <Button variant="outline" onClick={() => setSelectedTrainingCropKeys([])}>Limpiar</Button>
            </div>
          </div>
        </div>
      ) : null}

      <ShelfCropLightbox
        open={cropLightboxIndex !== null && Boolean(cropLightboxUrl)}
        url={cropLightboxUrl}
        title={
          cropLightboxEntry
            ? `${cropLightboxEntry.cropId || `crop-${(cropLightboxEntry.idx ?? 0) + 1}`} · ${
                resultHasFinalSku(cropLightboxEntry.row) ? resultFinalSkuLabel(cropLightboxEntry.row) : resultSuggestedSkuLabel(cropLightboxEntry.row)
              }`
            : undefined
        }
        currentIndex={cropLightboxIndex ?? 0}
        totalCount={filteredShelfResultEntries.length}
        selected={cropLightboxEntry?.selectKey ? selectedTrainingCropKeySet.has(cropLightboxEntry.selectKey) : false}
        canSelect={Boolean(cropLightboxEntry?.selectKey)}
        onClose={() => setCropLightboxIndex(null)}
        onPrevious={() => {
          if (cropLightboxIndex === null || cropLightboxIndex <= 0) return;
          setCropLightboxIndex(cropLightboxIndex - 1);
        }}
        onNext={() => {
          if (cropLightboxIndex === null || cropLightboxIndex >= filteredShelfResultEntries.length - 1) return;
          setCropLightboxIndex(cropLightboxIndex + 1);
        }}
        onToggleSelect={() => {
          if (!cropLightboxEntry?.selectKey) return;
          toggleTrainingCropSelection(cropLightboxEntry);
        }}
      />

      {resultsQuery.error instanceof HttpError && resultsQuery.error.status === 404 ? (
        <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          /results aun no disponible para este job (procesando o backend sin modulo shelf en este ambiente).
        </div>
      ) : null}

      <MdReportDialog
        open={Boolean(mdDialogRequest)}
        onClose={() => setMdDialogRequest(null)}
        title={mdDialogRequest?.title ?? "Reporte Shelf"}
        markdown={mdDialogQuery.data ?? null}
        isLoading={mdDialogQuery.isLoading}
        error={mdDialogQuery.error instanceof Error ? mdDialogQuery.error.message : mdDialogQuery.error ? "Error al cargar markdown" : null}
        sourceUrl={mdDialogRequest?.sourceUrl ?? null}
        downloadFilename={mdDialogRequest?.downloadFilename}
      />
    </div>
  );
}
