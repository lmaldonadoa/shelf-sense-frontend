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
import { ShelfSkuUploadSafeguard } from "@/components/shelf/shelf-sku-upload-safeguard";

type Props = { account: string };
type Tab = "jobs" | "results" | "skus" | "assets" | "index" | "review";
type SkuWorkspaceTab = "catalogo" | "cargas" | "dataset" | "pruebas";
type ShelfTrainingBusyState = {
  mode: "single" | "batch";
  skuId: string;
  cropCount: number;
  message: string;
};

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
    "segment",
    "subcategory",
    "categoryCuenta",
    "country",
  ];
  const metadataEntries = metadataSourceKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(row, key))
    .map((key) => [key, row[key]]);
  const metadata = metadataEntries.length ? Object.fromEntries(metadataEntries) : undefined;

  return {
    sku_id: skuId,
    nombre,
    marca: firstNonEmptyString(row.marca, row.brand),
    categoria: firstNonEmptyString(row.categoria, row.category, row.family),
    subcategoria: firstNonEmptyString(row.subcategoria, row.subcategory),
    segmento: firstNonEmptyString(row.segmento, row.segment),
    forma: firstNonEmptyString(row.forma, row.formato, row.variant, row.presentation),
    fabricante: firstNonEmptyString(row.fabricante),
    fragancia_variante: firstNonEmptyString(row.fragancia_variante, row.fraganciaVariante),
    tamano: firstNonEmptyString(row.tamano, row.size_text, row.size),
    ean: firstNonEmptyString(row.ean, row.barcode, row.upc),
    category_cuenta: firstNonEmptyString(row.category_cuenta, row.categoryCuenta),
    x_ancho: firstNonEmptyString(row.x_ancho, row.x),
    y_alto: firstNonEmptyString(row.y_alto, row.y),
    z_profundidad: firstNonEmptyString(row.z_profundidad, row.z),
    segmento_funcional: firstNonEmptyString(row.segmento_funcional, row.segmentoFuncional),
    pais: firstNonEmptyString(row.pais, row.country),
    grupo: firstNonEmptyString(row.grupo),
    estado: firstNonEmptyString(row.estado, row.status, "activo"),
    is_active: row.is_active === false || row.is_active === 0 ? false : true,
    metadata,
  };
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
  return firstNonEmptyString((sku as Record<string, unknown>).family, (sku as Record<string, unknown>).categoria);
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

export function AccountShelfPage({ account }: Props) {
  const [tab, setTab] = useState<Tab>("jobs");
  const [skuWorkspaceTab, setSkuWorkspaceTab] = useState<SkuWorkspaceTab>("catalogo");
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
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewStateFilter, setReviewStateFilter] = useState("all");
  const [reviewSkuSearch, setReviewSkuSearch] = useState("");
  const [reviewDecisionSkuId, setReviewDecisionSkuId] = useState("");
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

  const recentShelfJobsQuery = useQuery({
    queryKey: ["recent-shelf-jobs", account],
    queryFn: () => ocrApi.listRecentJobs({ accountName: account, limit: 80 }),
    enabled: shelfEnabled && ["jobs", "results"].includes(tab),
    staleTime: 15_000,
  });

  const skusQuery = useQuery({
    queryKey: ["shelf-skus", account],
    queryFn: () => ocrApi.listShelfSkus(account, 400),
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
  });

  const hardNegativesQuery = useQuery({
    queryKey: ["shelf-hard-negatives", account, hardNegativeSkuId],
    queryFn: () => ocrApi.listShelfHardNegatives(account, hardNegativeSkuId.trim()),
    enabled: shelfEnabled && tab === "skus" && Boolean(hardNegativeSkuId.trim()),
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
    enabled: shelfEnabled && tab === "index",
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
    enabled: shelfEnabled && tab === "skus" && Boolean(skuImageBrowserSkuId.trim()),
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
      if (!hardNegativeSkuId.trim()) throw new Error("Selecciona el SKU base.");
      if (!hardNegativeTargetSkuId.trim()) throw new Error("Selecciona el SKU negativo.");
      return ocrApi.createShelfHardNegative(account, hardNegativeSkuId.trim(), {
        negative_sku_id: hardNegativeTargetSkuId.trim(),
        reason: hardNegativeReason.trim() || "similar_packaging",
        note: hardNegativeNote.trim() || undefined,
        user: "frontend_user",
      });
    },
    onSuccess: async () => {
      await hardNegativesQuery.refetch();
      setHardNegativeTargetSkuId("");
      setHardNegativeNote("");
      toast.success("Hard negative guardado");
    },
    onError: (e) => toast.error("No se pudo guardar hard negative", { description: e instanceof Error ? e.message : "Error inesperado" }),
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
      .slice(0, 12);
  }, [account, recentShelfJobSearch, recentShelfJobsQuery.data]);

  const recentShelfJobDetailQueries = useQueries({
    queries: recentShelfJobs.slice(0, 12).map((job) => ({
      queryKey: ["recent-shelf-job-detail-card", job.job_id],
      queryFn: () => ocrApi.getShelfJob(job.job_id),
      enabled: shelfEnabled && tab === "jobs" && Boolean(job.job_id),
      staleTime: 20_000,
      retry: false,
    })),
  });

  const recentShelfJobDetailMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    recentShelfJobs.slice(0, 12).forEach((job, index) => {
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
    return {
      resultsCount: rows.length,
      fallbackCount,
      reviewCount,
      trayCount,
    };
  }, [selectedArtifactsData, selectedArtifactsResults, shelfResults, trayRows.length]);

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
    return {
      categories: collect(getSkuFamilyValue),
      subcategories: collect(getSkuSubcategoryValue),
      segments: collect(getSkuSegmentValue),
      manufacturers: collect(getSkuManufacturerValue),
      brands: collect(getSkuBrandValue),
      groups: collect(getSkuGroupValue),
    };
  }, [skusQuery.data]);

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
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Crear y monitorear Shelf jobs</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
              <div className="mb-3">
                <p className="text-sm font-semibold">Subir imagen de prueba</p>
                <p className="text-xs text-slate-300">Este es el camino más simple para probar reconocimiento: subes la imagen aquí, el frontend obtiene `image_file_ids` y luego crea el shelf job.</p>
              </div>
              <UploadPanel
                files={selectedJobFiles}
                onFilesChange={setSelectedJobFiles}
                onUpload={() => uploadJobImagesMutation.mutate()}
                isUploading={uploadJobImagesMutation.isPending}
              />
              {uploadedJobFileIds.length ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                  <p className="font-medium text-slate-100">image_file_ids listos para el job</p>
                  <div className="mt-2 space-y-1">
                    {uploadedJobFileIds.map((fileId) => <p key={`job-file-${fileId}`} className="font-mono">{fileId}</p>)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>config_name</Label><Input value={jobPayload.config_name ?? ""} onChange={(e) => setJobPayload((p) => ({ ...p, config_name: e.target.value }))} /></div>
              <div><Label>id_pdv (obligatorio)</Label><Input value={jobPayload.id_pdv} onChange={(e) => setJobPayload((p) => ({ ...p, id_pdv: e.target.value }))} /></div>
              <div>
                <Label>processing_mode</Label>
                <select
                  className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                  value={jobPayload.processing_mode ?? "recognition"}
                  onChange={(e) => setJobPayload((p) => ({ ...p, processing_mode: e.target.value }))}
                >
                  <option value="recognition">recognition</option>
                  <option value="crop_extraction">crop_extraction</option>
                </select>
              </div>
              <div><Label>subcategoria</Label><Input value={jobPayload.subcategoria ?? ""} onChange={(e) => setJobPayload((p) => ({ ...p, subcategoria: e.target.value }))} /></div>
              <div><Label>usuario_relevo</Label><Input value={jobPayload.usuario_relevo ?? ""} onChange={(e) => setJobPayload((p) => ({ ...p, usuario_relevo: e.target.value }))} /></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>image_file_ids (uno por linea)</Label><Textarea value={imageFileIdsText} onChange={(e) => setImageFileIdsText(e.target.value)} rows={4} /></div>
              <div><Label>image_paths (uno por linea)</Label><Textarea value={imagePathsText} onChange={(e) => setImagePathsText(e.target.value)} rows={4} /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => createJobMutation.mutate()} disabled={createJobMutation.isPending}>Crear shelf job</Button>
              {jobId ? <Badge variant="secondary">job_id: {jobId}</Badge> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Monitorear job_id</Label><Input value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} placeholder="2026-..." /></div>
              <div className="flex items-end gap-2"><Button variant="outline" onClick={() => { jobQuery.refetch(); eventsQuery.refetch(); metricsQuery.refetch(); }}>Refresh</Button></div>
            </div>
            {jobQuery.data ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center gap-2">{statusBadge(jobQuery.data.status)}<span className="font-mono">{jobQuery.data.job_id}</span></div>
                <p className="mt-1 text-xs text-slate-300">imagenes: {jobQuery.data.processed_images ?? 0}/{jobQuery.data.total_images ?? 0} | failed: {jobQuery.data.failed_images ?? 0}</p>
              </div>
            ) : null}

            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">Retomar análisis anteriores</p>
                  <p className="text-xs text-slate-300">Puedes volver a un job previo de Shelf, cargar sus resultados y seguir revisando crops o entrenamiento sin volver a subir la imagen.</p>
                </div>
                <Button variant="outline" onClick={() => recentShelfJobsQuery.refetch()} disabled={recentShelfJobsQuery.isFetching}>
                  Refrescar historial
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={recentShelfJobSearch}
                  onChange={(e) => setRecentShelfJobSearch(e.target.value)}
                  placeholder="Buscar por job_id, tipo, PDV o subcategoría..."
                />
                <div className="rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
                  {recentShelfJobs.length} visibles
                </div>
              </div>
              {recentShelfJobsQuery.isLoading ? (
                <p className="mt-3 text-sm text-slate-400">Cargando jobs recientes de Shelf...</p>
              ) : recentShelfJobsQuery.error instanceof HttpError ? (
                <p className="mt-3 text-sm text-rose-300">No se pudo cargar el historial reciente: {recentShelfJobsQuery.error.detail}</p>
              ) : recentShelfJobs.length ? (
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {recentShelfJobs.map((recentJob) => {
                    const isSelected = recentJob.job_id === selectedJobId;
                    const recentJobDetail = recentShelfJobDetailMap.get(recentJob.job_id);
                    const recentJobPreview = recentJobCardPreview(recentJobDetail);
                    const recentTrace = getShelfJobTraceInfo(recentJobDetail);
                    return (
                      <div
                        key={`recent-shelf-job-${recentJob.job_id}`}
                        className={`rounded-lg border p-3 ${isSelected ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-black/20"}`}
                      >
                        <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                          <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                            {recentJobPreview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={recentJobPreview} alt={`Preview ${recentJob.job_id}`} className="h-28 w-full object-cover" />
                            ) : (
                              <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-slate-500">
                                Sin miniatura
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-mono text-sm text-slate-100">{recentJob.job_id}</p>
                                <p className="mt-1 text-xs text-slate-400">{shelfRecentJobTypeLabel(recentJob)} · {recentJob.subcategoria ?? "Sin subcategoría"}</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {statusBadge(String(recentJob.status ?? "unknown"))}
                                {(recentTrace.retry_count ?? 0) > 0 ? <Badge variant="secondary">Reejecución #{recentTrace.retry_count}</Badge> : null}
                                {isSelected ? <Badge variant="outline">Cargado</Badge> : null}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
                              <p><span className="text-slate-400">PDV:</span> {recentJob.id_pdv ?? "-"}</p>
                              <p><span className="text-slate-400">Actualizado:</span> {formatDateTime(recentJob.updated_at)}</p>
                              <p><span className="text-slate-400">Imágenes:</span> {recentJob.processed_images}/{recentJob.total_images}</p>
                              <p><span className="text-slate-400">Fallidas:</span> {recentJob.failed_images}</p>
                              {recentTrace.source_job_id ? <p className="md:col-span-2"><span className="text-slate-400">Derivado de:</span> <span className="font-mono">{recentTrace.source_job_id}</span></p> : null}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button size="sm" onClick={() => loadShelfJob(recentJob.job_id, "results")}>
                                Abrir resultados
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => loadShelfJob(recentJob.job_id, "jobs")}>
                                Solo cargar job
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
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
                <p className="mt-3 text-sm text-slate-400">No encontramos jobs recientes de Shelf con esos filtros.</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "results" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Resultados + eventos + métricas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
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
                    <a
                      key={`master-link-${link.label}`}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                    >
                      {link.label}
                    </a>
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
                  <div className="mt-4 space-y-4">
                    {extractedCropGroups.map((group, groupIndex) => {
                      const imageId = Number(group.image_id ?? 0) || 0;
                      const items = group.items ?? [];
                      const groupKeys = items.map((crop) => trainingCropKey(crop.image_id ?? imageId, firstNonEmptyString(crop.crop_id)));
      const selectedInGroup = groupKeys.filter((key) => selectedTrainingCropKeySet.has(key)).length;
                      return (
                        <details key={`crop-group-${group.shelf_group_id ?? imageId ?? groupIndex}`} className="rounded-lg border border-white/10 bg-black/20 p-3" open={groupIndex === 0}>
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
                  </div>
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
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
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
                    <TableHead>Top candidato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shelfResults.map((row, i) => (
                    <TableRow key={`shelf-r-${i}`}>
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
                      <TableCell className="max-w-60 truncate">
                        {(() => {
                          const top = resultTopCandidates(row)[0];
                          return top ? `${firstNonEmptyString(top.sku_id, top.sku_code, top.sku_name) || "top_1"} ${typeof top.score === "number" ? `(${top.score.toFixed(3)})` : ""}` : "-";
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!shelfResults.length ? (
                    <TableRow>
                      <TableCell colSpan={12}>
                        {shelfJobFailed ? "El job falló antes de generar resultados." : "Sin resultados todavía."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            {shelfResults.length ? (
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
                <div className="mb-3">
                  <p className="text-sm font-semibold">Lectura rápida del matching</p>
                  <p className="text-xs text-slate-300">Cada detección te muestra orden visual, decisión sugerida, umbrales y si hubo degradación del stack de embeddings.</p>
                </div>
                <div className="mb-4 rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-3">
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
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {shelfResults.map((row, idx) => {
                    const finalSku = resultFinalSkuLabel(row);
                    const hasFinalSku = resultHasFinalSku(row);
                    const suggestedSku = resultSuggestedSkuLabel(row);
                    const candidates = resultTopCandidates(row);
                    const imageId = resultImageIdValue(row);
                    const cropId = resultCropIdValue(row);
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
                    const selectedForTraining = imageId !== null && cropId ? selectedTrainingCropKeySet.has(trainingCropKey(imageId, cropId)) : false;
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
                      <div key={`result-card-${idx}`} className={`rounded-lg border p-3 ${selectedForTraining ? "border-emerald-300/40 bg-emerald-500/10" : "border-white/10 bg-slate-950/40"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] text-slate-400">orden / piso / crop</p>
                            <p className="font-mono text-sm text-slate-100">
                              {resultGlobalOrderLabel(row)} · {resultOrderingLabel(row)} · {firstNonEmptyString(row.crop_id) || String(row.image_id ?? "-")}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant={selectedForTraining ? "default" : "outline"}
                              onClick={() => {
                                if (imageId === null || !cropId) return;
                                const key = trainingCropKey(imageId, cropId);
                                setSelectedTrainingCropKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
                              }}
                              disabled={imageId === null || !cropId}
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
                            <a href={cropZoomUrl} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={cropDisplayUrl}
                                alt={cropId || `crop-${idx + 1}`}
                                className="h-44 w-full rounded-md bg-slate-950 object-contain"
                              />
                            </a>
                          ) : (
                            <div className="flex h-44 items-center justify-center rounded-md border border-dashed border-white/10 text-center text-xs text-slate-400">
                              Sin preview pública del crop
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {cropZoomUrl ? (
                              <a
                                href={cropZoomUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/15"
                              >
                                Ver grande / zoom
                              </a>
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
                        </div>

                        {(pendingReasonLabel || trainingSupportLabel || rerunOutcome || alreadyPromoted) ? (
                          <div className="mt-3 rounded-lg border border-sky-300/20 bg-sky-500/5 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[11px] text-sky-100">Lectura de rerun</p>
                              {rerunOutcome ? <Badge variant={rerunOutcome.variant}>{rerunOutcome.label}</Badge> : null}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-slate-200">
                              {rerunOutcome?.label === "Improved" ? <p>Este crop mejoró respecto a la corrida anterior.</p> : null}
                              {rerunOutcome?.label === "Same" ? <p>Este crop no mostró cambio observable respecto a la corrida anterior.</p> : null}
                              {rerunOutcome?.label === "Regressed" ? <p>Este crop empeoró respecto a la corrida anterior.</p> : null}
                              {pendingReasonLabel ? <p>{pendingReasonLabel}</p> : null}
                              {trainingSupportLabel ? <p>{trainingSupportLabel}</p> : null}
                              {alreadyPromoted ? <p>Este crop ya había sido usado para entrenamiento{promotedSkuId ? ` en ${promotedSkuId}` : ""}.</p> : null}
                            </div>
                          </div>
                        ) : null}

                        {thresholds.length ? (
                          <div className="mt-3">
                            <p className="text-[11px] text-slate-400">Thresholds</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {thresholds.map((entry) => (
                                <Badge key={`threshold-${idx}-${entry.label}`} variant="outline">
                                  {entry.label}: {entry.value.toFixed(2)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] text-slate-400">Top candidatos</p>
                          {candidates.length ? (
                            <div className="space-y-2">
                              {candidates.slice(0, 3).map((candidate, candidateIdx) => {
                                const candidateLabel = firstNonEmptyString(candidate.sku_id, candidate.sku_code, candidate.sku_name) || `candidate_${candidateIdx + 1}`;
                                const candidateScore = typeof candidate.score === "number" ? candidate.score : null;
                                return (
                                  <button
                                    key={`candidate-${idx}-${candidateIdx}`}
                                    type="button"
                                    onClick={() => setResultSkuOverrides((prev) => ({ ...prev, [resultKey]: candidateLabel }))}
                                    className={`w-full rounded-md border bg-black/20 p-2 text-left ${selectedSkuForRow === candidateLabel ? "border-cyan-300/40" : "border-white/10"}`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs text-slate-100">{candidateLabel}</p>
                                      <Badge variant={confidenceTone(candidateScore)}>{candidateScore !== null ? candidateScore.toFixed(3) : "-"}</Badge>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Sin top_candidates disponibles.</p>
                          )}
                        </div>

                        <div className={`mt-3 space-y-3 rounded-lg border p-3 ${hasFinalSku ? "border-emerald-300/30 bg-emerald-500/10" : "border-amber-300/30 bg-amber-500/10"}`}>
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

                        {Array.isArray(row.bbox) ? (
                          <div className="mt-3">
                            <p className="text-[11px] text-slate-400">bbox</p>
                            <p className="text-xs text-slate-300">[{row.bbox.join(", ")}]</p>
                          </div>
                        ) : null}

                        {(comparison || sourceSnapshot) ? (
                          <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                            <summary className="cursor-pointer text-sm font-medium text-slate-100">Antes vs ahora</summary>
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
                            <summary className="cursor-pointer text-sm font-medium text-slate-100">Panel técnico del crop</summary>
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
                              <a
                                key={`artifact-link-${link.label}`}
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                              >
                                {link.label}
                              </a>
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

                      <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">Crops extraídos</p>
                            <p className="text-xs text-slate-300">Si este image_id tiene recortes disponibles, aquí puedes descargarlos uno por uno o bajar el ZIP completo.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
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
                        </div>

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
                          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="mb-2 text-sm font-semibold">Manifest de extracción</p>
                            <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(extractedCropsManifestQuery.data, null, 2)}</pre>
                          </div>
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
                      </div>

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

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                          <p className="mb-2 text-sm font-semibold">Resultados shelf</p>
                          <pre className="max-h-72 overflow-auto text-xs">
                            {JSON.stringify(selectedArtifactsResults.length ? selectedArtifactsResults : artifactsQuery.data, null, 2)}
                          </pre>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                          <p className="mb-2 text-sm font-semibold">Detecciones y análisis</p>
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
                      </div>
                    </div>
                  ) : artifactsQuery.error instanceof HttpError ? (
                    <p className="mt-3 text-sm text-amber-300">No se pudieron cargar los artifacts: {artifactsQuery.error.detail}</p>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">Selecciona una imagen para inspeccionar sus artifacts.</p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">Eventos clave</p>
                <div className="max-h-64 overflow-auto rounded border border-white/10 bg-black/20 p-2 text-xs">
                  {(eventsQuery.data ?? []).map((ev) => (
                    <div key={`ev-${ev.id}`} className="mb-1 border-b border-white/5 pb-1">
                      <span className="font-mono">{ev.event_type}</span> | {ev.level} | {ev.message}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Metricas</p>
                <div className="max-h-64 overflow-auto rounded border border-white/10 bg-black/20 p-2 text-xs">
                  {(metricsQuery.data?.metrics ?? []).map((m) => (
                    <div key={`m-${m.id}`} className="mb-1 border-b border-white/5 pb-1">
                      {m.step} | {m.duration_ms.toFixed(1)} ms
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Probar SKU</p>
                  <p className="text-xs text-slate-300">Usa el helper oficial para lanzar una prueba puntual y luego revisar resultados, artifacts, events y metrics del job generado.</p>
                </div>
                <Badge variant="outline">SKU prueba: {testSkuId || selectedSkuId || skuImageBrowserSkuId || "no seleccionado"}</Badge>
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
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
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

              <div className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Evaluar crop directo</p>
                    <p className="text-xs text-slate-300">Úsalo cuando ya tienes la imagen recortada y solo quieres saber qué SKU parece ser, sin crear un job completo.</p>
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
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                    <Switch checked={evaluateCropOrientationEnabled} onCheckedChange={setEvaluateCropOrientationEnabled} />
                    Orientación
                  </label>
                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                    <Switch checked={evaluateCropGlmOcrEnabled} onCheckedChange={setEvaluateCropGlmOcrEnabled} />
                    OCR GLM opcional
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
                        {(lastEvaluateCrop.top_candidates ?? []).length ? (
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="mb-2 text-sm font-semibold">Top candidatos</p>
                            <div className="space-y-2">
                              {(lastEvaluateCrop.top_candidates ?? []).slice(0, 5).map((candidate, idx) => {
                                const code = firstNonEmptyString(candidate.sku_id, candidate.nombre, `candidate_${idx + 1}`);
                                return (
                                  <button
                                    key={`eval-candidate-${idx}-${code}`}
                                    type="button"
                                    onClick={() => {
                                      setTestSkuId(code);
                                      setSelectedSkuId(code);
                                      setCropActionSkuId(code);
                                      setCropActionSkuSearch(code);
                                    }}
                                    className="w-full rounded-md border border-white/10 bg-black/20 p-2 text-left hover:bg-black/30"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm text-slate-100">{code}</p>
                                      <Badge variant={confidenceTone(candidate.score)}>{typeof candidate.score === "number" ? candidate.score.toFixed(3) : "-"}</Badge>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">{firstNonEmptyString(candidate.nombre, candidate.marca, candidate.categoria) || "Sin descripción"}</p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        {lastEvaluateCrop.embedding_diagnostics ? (
                          <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                            <p className="text-sm font-semibold">Diagnóstico técnico</p>
                            <p className="mt-2 text-xs text-slate-300">{diagnosticsHeadline(lastEvaluateCrop.embedding_diagnostics)}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            ) : null}

            {skuWorkspaceTab === "catalogo" ? (
            <>
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Catálogo SKU</p>
                  <p className="mt-1 text-sm text-slate-100">Aquí eliges, revisas y reutilizas SKUs que ya existen. También puedes cargar uno al formulario para tomarlo como base.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Imagen directa al SKU</p>
                  <p className="mt-1 text-sm text-slate-100">Usa esta carga cuando ya sabes a qué SKU pertenece la imagen y quieres meterla directo al dataset real.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Assets separados</p>
                  <p className="mt-1 text-sm text-slate-100">La pestaña Assets es una biblioteca previa. Sirve para preparar y revisar imágenes antes de vincularlas a un SKU concreto.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Explorar SKUs existentes</p>
                  <p className="text-xs text-slate-300">Busca por SKU, nombre, marca, categoría, subcategoría o fabricante. También puedes revisar la ficha completa antes de usarlo.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Total: {(skusQuery.data ?? []).length}</Badge>
                  <Badge variant="outline">Visibles: {filteredSkusCatalog.length}</Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1.5fr_auto_auto_auto]">
                <Input
                  value={skuCatalogSearch}
                  onChange={(e) => setSkuCatalogSearch(e.target.value)}
                  placeholder="Buscar por SKU, nombre, marca, categoría, subcategoría o fabricante..."
                />
                <select
                  className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                  value={String(skuCatalogPageSize)}
                  onChange={(e) => setSkuCatalogPageSize(Number(e.target.value))}
                >
                  <option value="12">12 por página</option>
                  <option value="24">24 por página</option>
                  <option value="48">48 por página</option>
                </select>
                <div className="flex items-center justify-center rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-300">
                  Página {skuCatalogPage} de {skuCatalogTotalPages}
                </div>
                <Button variant="outline" onClick={() => skusQuery.refetch()}>Refrescar catálogo</Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogCategoryFilter} onChange={(e) => setSkuCatalogCategoryFilter(e.target.value)}>
                  <option value="">Todas las categorías</option>
                  {skuCatalogOptions.categories.map((value) => <option key={`cat-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogSubcategoryFilter} onChange={(e) => setSkuCatalogSubcategoryFilter(e.target.value)}>
                  <option value="">Todas las subcategorías</option>
                  {skuCatalogOptions.subcategories.map((value) => <option key={`subcat-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogSegmentFilter} onChange={(e) => setSkuCatalogSegmentFilter(e.target.value)}>
                  <option value="">Todos los segmentos</option>
                  {skuCatalogOptions.segments.map((value) => <option key={`segment-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogManufacturerFilter} onChange={(e) => setSkuCatalogManufacturerFilter(e.target.value)}>
                  <option value="">Todos los fabricantes</option>
                  {skuCatalogOptions.manufacturers.map((value) => <option key={`manufacturer-${value}`} value={value}>{value}</option>)}
                </select>
                <select className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={skuCatalogBrandFilter} onChange={(e) => setSkuCatalogBrandFilter(e.target.value)}>
                  <option value="">Todas las marcas</option>
                  {skuCatalogOptions.brands.map((value) => <option key={`brand-${value}`} value={value}>{value}</option>)}
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Mostrando {paginatedSkusCatalog.length} de {filteredSkusCatalog.length} SKUs filtrados.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((page) => Math.max(1, page - 1))} disabled={skuCatalogPage <= 1}>
                    Anterior
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSkuCatalogPage((page) => Math.min(skuCatalogTotalPages, page + 1))} disabled={skuCatalogPage >= skuCatalogTotalPages}>
                    Siguiente
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {paginatedSkusCatalog.map((sku) => {
                  const code = getSkuCodeValue(sku);
                  const isActiveSku = code && code === (selectedSkuId || skuImageBrowserSkuId || testSkuId);
                  return (
                    <div key={`sku-catalog-card-${code || sku.id}`} className={`rounded-lg border p-3 ${isActiveSku ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-slate-950/40"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-sm text-slate-100">{code || "-"}</p>
                        <Badge variant={isActiveSku ? "default" : "outline"}>{activeLabel((sku as Record<string, unknown>).is_active)}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-100">{getSkuNameValue(sku) || "Sin nombre"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                        {getSkuBrandValue(sku) ? <span>{getSkuBrandValue(sku)}</span> : null}
                        {getSkuFamilyValue(sku) ? <span>{getSkuFamilyValue(sku)}</span> : null}
                        {getSkuSubcategoryValue(sku) ? <span>{getSkuSubcategoryValue(sku)}</span> : null}
                        {getSkuSegmentValue(sku) ? <span>{getSkuSegmentValue(sku)}</span> : null}
                        {firstNonEmptyString((sku as Record<string, unknown>).size_text, (sku as Record<string, unknown>).tamano) ? <span>{firstNonEmptyString((sku as Record<string, unknown>).size_text, (sku as Record<string, unknown>).tamano)}</span> : null}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                        <div><span className="text-slate-500">Fabricante:</span> {getSkuManufacturerValue(sku) || "-"}</div>
                        <div><span className="text-slate-500">Grupo:</span> {getSkuGroupValue(sku) || "-"}</div>
                        <div><span className="text-slate-500">Estado:</span> {getSkuStatusValue(sku) || "-"}</div>
                        <div><span className="text-slate-500">Metadata:</span> {hasSkuMetadata(sku) ? "Sí" : "No"}</div>
                      </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSkuCatalogDetailCode(code)}
                          >
                            Ver detalle
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                            setSelectedSkuId(code);
                            setSkuImageBrowserSkuId(code);
                            setTestSkuId(code);
                            setSkuWorkspaceTab("dataset");
                          }}
                          >
                            Usar este SKU
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSkuDeleteTargetId(code);
                              setSelectedSkuId(code);
                              setSkuImageBrowserSkuId(code);
                              setSkuDeleteDialogOpen(true);
                            }}
                          >
                            Desactivar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                            setSkuForm({
                              sku_code: code,
                              sku_name: getSkuNameValue(sku),
                              brand: getSkuBrandValue(sku),
                              family: getSkuFamilyValue(sku),
                              variant: firstNonEmptyString((sku as Record<string, unknown>).variant, (sku as Record<string, unknown>).formato),
                              size_text: firstNonEmptyString((sku as Record<string, unknown>).size_text, (sku as Record<string, unknown>).tamano),
                              barcode: firstNonEmptyString((sku as Record<string, unknown>).barcode, (sku as Record<string, unknown>).ean),
                              estado: getSkuStatusValue(sku),
                              subcategoria: getSkuSubcategoryValue(sku),
                              segmento: getSkuSegmentValue(sku),
                              forma: firstNonEmptyString((sku as Record<string, unknown>).forma),
                              fabricante: getSkuManufacturerValue(sku),
                              fragancia_variante: firstNonEmptyString((sku as Record<string, unknown>).fragancia_variante),
                              pais: firstNonEmptyString((sku as Record<string, unknown>).pais),
                              grupo: getSkuGroupValue(sku),
                              segmento_funcional: firstNonEmptyString((sku as Record<string, unknown>).segmento_funcional),
                              category_cuenta: firstNonEmptyString((sku as Record<string, unknown>).category_cuenta),
                              x_ancho: firstNonEmptyString((sku as Record<string, unknown>).x_ancho),
                              y_alto: firstNonEmptyString((sku as Record<string, unknown>).y_alto),
                              z_profundidad: firstNonEmptyString((sku as Record<string, unknown>).z_profundidad),
                              metadata_json: JSON.stringify(getSkuMetadataValue(sku) ?? {}, null, 2),
                            });
                            setSkuWorkspaceTab("cargas");
                          }}
                        >
                          Cargar al formulario
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
                {filteredSkusCatalog.length > paginatedSkusCatalog.length ? (
                  <p className="mt-3 text-xs text-slate-400">Navega por páginas para revisar el catálogo completo sin hacer gigante la vista.</p>
                ) : null}
              </div>

              {selectedSkuCatalogDetail ? (
                <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Detalle del SKU</p>
                      <p className="text-xs text-slate-300">Revisa la ficha completa antes de pasar al dataset, pruebas o edición.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{getSkuCodeValue(selectedSkuCatalogDetail)}</Badge>
                      <Badge variant="outline">{getSkuStatusValue(selectedSkuCatalogDetail)}</Badge>
                    </div>
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
              ) : null}

              <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Mantenimiento del SKU</p>
                    <p className="text-xs text-slate-300">El flujo de eliminar o desactivar SKU ahora vive en un diálogo para no ocupar media pantalla.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">SKU objetivo: {activeSkuDeleteId || "no seleccionado"}</Badge>
                    <Button variant="outline" onClick={() => setSkuDeleteDialogOpen(true)} disabled={!activeSkuDeleteId}>
                      Abrir diálogo
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Tabla rápida del catálogo</p>
                    <p className="text-xs text-slate-300">Sirve para escanear datos existentes. Hoy no hay endpoint de edición directa, pero sí puedes cargar cualquier SKU al formulario superior.</p>
                  </div>
                  <Badge variant="outline">Catálogo filtrado: {filteredSkusCatalog.length}</Badge>
                </div>
                <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>id</TableHead>
                        <TableHead>sku_code</TableHead>
                        <TableHead>nombre</TableHead>
                        <TableHead>marca</TableHead>
                        <TableHead>categoria</TableHead>
                        <TableHead>subcategoria</TableHead>
                        <TableHead>segmento</TableHead>
                        <TableHead>fabricante</TableHead>
                        <TableHead>tamano</TableHead>
                        <TableHead>updated_at</TableHead>
                        <TableHead>accion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSkusCatalog.map((sku: ShelfSku) => (
                        <TableRow key={`sku-${sku.id ?? sku.sku_id ?? sku.sku_code ?? Math.random()}`}>
                          <TableCell>{String(sku.id ?? sku.sku_id ?? "-")}</TableCell>
                          <TableCell>{getSkuCodeValue(sku) || "-"}</TableCell>
                          <TableCell>{getSkuNameValue(sku) || "-"}</TableCell>
                          <TableCell>{getSkuBrandValue(sku) || "-"}</TableCell>
                          <TableCell>{getSkuFamilyValue(sku) || "-"}</TableCell>
                          <TableCell>{getSkuSubcategoryValue(sku) || "-"}</TableCell>
                          <TableCell>{getSkuSegmentValue(sku) || "-"}</TableCell>
                          <TableCell>{getSkuManufacturerValue(sku) || "-"}</TableCell>
                          <TableCell>{firstNonEmptyString((sku as Record<string, unknown>).size_text, (sku as Record<string, unknown>).tamano) || "-"}</TableCell>
                          <TableCell>{String(sku.updated_at ?? "-")}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const code = getSkuCodeValue(sku);
                                  setSelectedSkuId(code);
                                  setSkuImageBrowserSkuId(code);
                                  setTestSkuId(code);
                                  setSkuWorkspaceTab("dataset");
                                }}
                              >
                                Abrir
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const code = getSkuCodeValue(sku);
                                  setSkuDeleteTargetId(code);
                                  setSelectedSkuId(code);
                                  setSkuDeleteDialogOpen(true);
                                }}
                              >
                                Desactivar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
            ) : null}

            {skuWorkspaceTab === "cargas" ? (
              <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-sm font-semibold">Crear o preparar SKU manualmente</p>
                <p className="mb-3 text-xs text-slate-300">La ficha ahora está ordenada por bloques para que sea más claro revisar qué existe, qué falta y qué quieres ajustar antes de seguir.</p>
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

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-sm font-semibold">Carga masiva SKUs (JSON o CSV)</p>
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
                    setBulkDataForUpload(rows);
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

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-sm font-semibold">Agregar imágenes al dataset real del SKU</p>
              <p className="mb-3 text-xs text-slate-300">Este bloque sí escribe directo sobre el dataset del SKU. Úsalo cuando ya sabes exactamente a qué SKU pertenece la imagen.</p>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-2">
                  <Input placeholder="sku_id (ej: KALIPTO_DESINF_1L)" value={selectedSkuId} onChange={(e) => setSelectedSkuId(e.target.value)} />
                  <select
                    className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setSelectedSkuId(e.target.value);
                    }}
                  >
                    <option value="">Selecciona SKU desde catálogo...</option>
                    {(skusQuery.data ?? []).map((sku: ShelfSku) => {
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

            {recentSkuImageResponses.length ? (
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Diagnóstico de asociación reciente</p>
                    <p className="text-xs text-slate-300">Resumen técnico amigable de lo que hizo backend al asociar imágenes al SKU.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setRecentSkuImageResponses([])}>Limpiar panel</Button>
                </div>
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
            ) : null}
            </div>
            ) : null}

            {skuWorkspaceTab === "dataset" ? (
            <>
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">SKU seleccionado para dataset y reentrenamiento</p>
                  <p className="text-xs text-slate-300">Al elegir un SKU en el catálogo, esta zona te deja revisar sus imágenes, recalcular embeddings y validar si DINOv2 / SigLIP quedaron sanos.</p>
                </div>
                <Badge variant="outline">SKU activo: {activeSkuWorkspaceId || "no seleccionado"}</Badge>
              </div>
              {activeSkuWorkspaceInfo ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">SKU</p>
                    <p className="mt-1 font-mono text-sm text-slate-100">{getSkuCodeValue(activeSkuWorkspaceInfo)}</p>
                    <p className="mt-1 text-sm text-slate-200">{getSkuNameValue(activeSkuWorkspaceInfo) || "Sin nombre"}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Marca / familia</p>
                    <p className="mt-1 text-sm text-slate-100">{getSkuBrandValue(activeSkuWorkspaceInfo) || "-"}</p>
                    <p className="mt-1 text-sm text-slate-300">{getSkuFamilyValue(activeSkuWorkspaceInfo) || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Imágenes cargadas</p>
                    <p className="mt-1 text-sm text-slate-100">{currentSkuImageSummary.total} total</p>
                    <p className="mt-1 text-sm text-slate-300">{currentSkuImageSummary.active} activas / {currentSkuImageSummary.inactive} inactivas</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs text-slate-400">Último recálculo</p>
                    <p className="mt-1 text-sm text-slate-100">{recomputeSummary.processed} procesadas</p>
                    <p className="mt-1 text-sm text-slate-300">OK {percentLabel(recomputeSummary.successRate)} · fallback {percentLabel(recomputeSummary.fallbackRate)} · fallo {percentLabel(recomputeSummary.failedRate)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">Selecciona un SKU desde Catálogo para cargar aquí su contexto técnico.</p>
              )}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">dinov2</p>
                    <Badge variant={vectorIndexHealth.dinov2.sampleDim !== null && vectorIndexHealth.dinov2.sampleDim >= 512 ? "default" : "secondary"}>
                      {vectorIndexHealth.dinov2.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-100">sample_dim: {vectorIndexHealth.dinov2.sampleDim ?? "-"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {vectorIndexHealth.dinov2.sampleDim !== null && vectorIndexHealth.dinov2.sampleDim < 512
                      ? "Embeddings antiguos o degradados: conviene recalcular."
                      : "Dimensión esperada sana para dinov2."}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">siglip</p>
                    <Badge variant={vectorIndexHealth.siglip.sampleDim !== null && vectorIndexHealth.siglip.sampleDim >= 512 ? "default" : "secondary"}>
                      {vectorIndexHealth.siglip.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-100">sample_dim: {vectorIndexHealth.siglip.sampleDim ?? "-"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {vectorIndexHealth.siglip.sampleDim !== null && vectorIndexHealth.siglip.sampleDim < 512
                      ? "Embeddings antiguos o degradados: conviene recalcular."
                      : "Dimensión esperada sana para siglip."}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Recalcular embeddings</p>
                  <p className="text-xs text-slate-300">Si dejas vacío `image_ids`, el frontend reentrena el SKU activo completo usando sus imágenes del dataset.</p>
                </div>
                <Badge variant="outline">/shelf/embeddings/recompute</Badge>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
                <div className="space-y-2">
                  <Label>image_ids</Label>
                  <Textarea value={recomputeImageIdsText} onChange={(e) => setRecomputeImageIdsText(e.target.value)} rows={5} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRecomputeImageIdsText(currentSkuImageIds.map((item) => String(item)).join("\n"))} disabled={!currentSkuImageIds.length}>
                      Usar imágenes del SKU actual
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRecomputeImageIdsText("")}>Limpiar</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>model_names</Label>
                  <Textarea value={recomputeModelNamesText} onChange={(e) => setRecomputeModelNamesText(e.target.value)} rows={5} />
                  <p className="text-xs text-slate-400">Recomendado: `dinov2` y `siglip`, uno por línea.</p>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">Incluir inactivas</p>
                        <p className="mt-1 text-xs text-slate-400">Solo aplica cuando reentrenas por `sku_id` completo.</p>
                      </div>
                      <Switch checked={recomputeIncludeInactiveImages} onCheckedChange={setRecomputeIncludeInactiveImages} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">rebuild_index</p>
                        <p className="mt-1 text-xs text-slate-400">Lo normal es dejarlo activo para que el índice se alinee con el nuevo embedding.</p>
                      </div>
                      <Switch checked={recomputeRebuildIndex} onCheckedChange={setRecomputeRebuildIndex} />
                    </div>
                  </div>
                  <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                    <Label>limit</Label>
                    <Input value={recomputeLimit} onChange={(e) => setRecomputeLimit(e.target.value)} placeholder="500" />
                    <p className="text-xs text-slate-400">Límite máximo de imágenes cuando reentrenas un SKU completo.</p>
                  </div>
                  <Button onClick={() => recomputeEmbeddingsMutation.mutate()} disabled={recomputeEmbeddingsMutation.isPending}>
                    Recalcular embeddings
                  </Button>
                </div>
              </div>
              {lastEmbeddingsRecompute ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">status: {String(lastEmbeddingsRecompute.status ?? "-")}</Badge>
                    <Badge variant="outline">sku_id: {(lastEmbeddingsRecompute.sku_id ?? activeSkuWorkspaceId) || "-"}</Badge>
                    <Badge variant="outline">modelos: {formatModelNames(lastEmbeddingsRecompute.used_models ?? lastEmbeddingsRecompute.model_names)}</Badge>
                    <Badge variant="outline">rebuild_index: {lastEmbeddingsRecompute.rebuild_index ? "sí" : "no"}</Badge>
                    <Badge variant={diagnosticsEmbeddingTone(lastEmbeddingsRecompute.diagnostics ?? null)}>
                      {diagnosticsEmbeddingUiLabel(lastEmbeddingsRecompute.diagnostics ?? null)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">% OK</p><p className="mt-1 text-sm text-slate-100">{percentLabel(recomputeSummary.successRate)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">% fallback</p><p className="mt-1 text-sm text-slate-100">{percentLabel(recomputeSummary.fallbackRate)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">% fallo</p><p className="mt-1 text-sm text-slate-100">{percentLabel(recomputeSummary.failedRate)}</p></div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">Procesadas</p><p className="mt-1 text-sm text-slate-100">{recomputeSummary.processed}</p></div>
                  </div>
                  {lastEmbeddingsRecompute.diagnostics ? (
                    <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={diagnosticsTone(lastEmbeddingsRecompute.diagnostics) === "ok" ? "default" : diagnosticsTone(lastEmbeddingsRecompute.diagnostics) === "warning" ? "secondary" : "destructive"}>
                          {diagnosticsOutcomeLabel(lastEmbeddingsRecompute.diagnostics)}
                        </Badge>
                        <Badge variant="outline">fallback: {lastEmbeddingsRecompute.diagnostics?.models?.fallback_used ? "sí" : "no"}</Badge>
                        <Badge variant="outline">failed_models: {formatModelNames(lastEmbeddingsRecompute.diagnostics?.models?.failed_models)}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-300">{diagnosticsHeadline(lastEmbeddingsRecompute.diagnostics)}</p>
                      {diagnosticsHasCode(lastEmbeddingsRecompute.diagnostics, "MODEL_CACHE_CORRUPT_OR_INACCESSIBLE") ? (
                        <p className="mt-2 text-xs text-amber-200">Backend sigue reportando cache/tokenizer corrupto o inaccesible para algún modelo.</p>
                      ) : null}
                      {diagnosticsHasCode(lastEmbeddingsRecompute.diagnostics, "MODEL_LOAD_OK") ? (
                        <p className="mt-1 text-xs text-emerald-200">Se registró carga de modelo OK en este recálculo.</p>
                      ) : null}
                    </div>
                  ) : (
                    <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300">{JSON.stringify(lastEmbeddingsRecompute, null, 2)}</pre>
                  )}
                  {(lastEmbeddingsRecompute.items ?? []).length ? (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-slate-950/40">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>image_id</TableHead>
                            <TableHead>status</TableHead>
                            <TableHead>outcome</TableHead>
                            <TableHead>fallback</TableHead>
                            <TableHead>modelos</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(lastEmbeddingsRecompute.items ?? []).map((item, idx) => {
                            const diagnostics = normalizeDiagnosticsPayload(item.diagnostics);
                            return (
                              <TableRow key={`recompute-item-${String(item.image_id ?? idx)}`}>
                                <TableCell>{String(item.image_id ?? "-")}</TableCell>
                                <TableCell>{item.status ?? "-"}</TableCell>
                                <TableCell>{diagnosticsOutcomeLabel(diagnostics)}</TableCell>
                                <TableCell>{diagnostics?.models?.fallback_used ? "sí" : "no"}</TableCell>
                                <TableCell>{formatModelNames(item.model_names)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Roles de dataset y hard negatives</p>
                  <p className="text-xs text-slate-300">Separa muestras de referencia, validación y reserva; además registra confusiones visuales reales entre SKUs parecidos.</p>
                </div>
                <Badge variant="outline">SKU base: {hardNegativeSkuId || skuImageBrowserSkuId || selectedSkuId || "sin seleccionar"}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <Label>SKU para summary / hard negatives</Label>
                  <Input
                    value={hardNegativeSkuId}
                    onChange={(e) => {
                      setHardNegativeSkuId(e.target.value);
                      setDatasetSummarySkuId(e.target.value);
                    }}
                    placeholder="LML0108"
                  />
                </div>
                <div>
                  <Label>SKU negativo</Label>
                  <Input value={hardNegativeTargetSkuId} onChange={(e) => setHardNegativeTargetSkuId(e.target.value)} placeholder="LML0122" />
                </div>
                <div>
                  <Label>reason</Label>
                  <Input value={hardNegativeReason} onChange={(e) => setHardNegativeReason(e.target.value)} placeholder="similar_packaging" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={hardNegativeNote} onChange={(e) => setHardNegativeNote(e.target.value)} placeholder="Nota opcional: mismo color, formato y aroma parecido" />
                <Button onClick={() => createHardNegativeMutation.mutate()} disabled={createHardNegativeMutation.isPending || !hardNegativeSkuId.trim() || !hardNegativeTargetSkuId.trim()}>
                  Guardar hard negative
                </Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                  <p className="mb-2 text-xs text-slate-400">Resumen del dataset por rol</p>
                  <div className="space-y-2">
                    {(datasetSummaryQuery.data?.by_role ?? []).length ? (
                      (datasetSummaryQuery.data?.by_role ?? []).map((item, idx) => (
                        <div key={`sku-role-${idx}`} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
                          <span>{String(item.dataset_role ?? "-")}</span>
                          <Badge variant="outline">{String(item.count ?? 0)}</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">Sin datos por rol para este SKU todavía.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                  <p className="mb-2 text-xs text-slate-400">Hard negatives registrados</p>
                  <div className="space-y-2">
                    {(hardNegativesQuery.data ?? []).length ? (
                      (hardNegativesQuery.data ?? []).map((item, idx) => (
                        <div key={`hard-negative-${idx}`} className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
                          <p className="font-mono text-slate-100">{String(item.negative_sku_id ?? item.negative_sku_code ?? "-")}</p>
                          <p className="mt-1 text-xs text-slate-300">{String(item.reason ?? "sin razón")} · {String(item.note ?? "-")}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">Todavía no hay hard negatives para este SKU.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Dataset visual por SKU</p>
                  <p className="text-xs text-slate-300">Aquí ves las imágenes que realmente están asociadas al SKU y que alimentan embeddings e índice vectorial.</p>
                </div>
                <Button variant="outline" onClick={() => rebuildIndexMutation.mutate()} disabled={rebuildIndexMutation.isPending}>
                  Reconstruir índice
                </Button>
              </div>
              <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr_auto_auto]">
                <Input
                  placeholder="sku_id para navegar imágenes del dataset"
                  value={skuImageBrowserSkuId}
                  onChange={(e) => setSkuImageBrowserSkuId(e.target.value)}
                />
                <select
                  className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setSkuImageBrowserSkuId(e.target.value);
                  }}
                >
                  <option value="">Elegir SKU desde catálogo...</option>
                  {(filteredSkusCatalog.slice(0, 100)).map((sku) => {
                    const code = getSkuCodeValue(sku);
                    if (!code) return null;
                    return <option key={`sku-browser-pick-${code}`} value={code}>{code} - {getSkuNameValue(sku) || "sin nombre"}</option>;
                  })}
                </select>
                <div className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-300">
                  <Switch checked={skuImageBrowserIncludeInactive} onCheckedChange={setSkuImageBrowserIncludeInactive} />
                  <span>Ver inactivas</span>
                </div>
                <Button variant="outline" onClick={() => skuImagesQuery.refetch()} disabled={!skuImageBrowserSkuId.trim()}>
                  Ver imágenes
                </Button>
              </div>

              {skuImagesQuery.data?.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {skuImagesQuery.data.map((image, idx) => {
                    const preview = previewUrlOf(image as Record<string, unknown>);
                    const imageId = image.image_id ?? image.id ?? idx;
                    const hasPreview = previewAvailableOf(image as Record<string, unknown>);
                    const roleDraftKey = `${skuImageBrowserSkuId.trim()}::${String(imageId)}`;
                    const currentDatasetRole = firstNonEmptyString((image as Record<string, unknown>).dataset_role) || "reference_active";
                    const currentDatasetSplit = firstNonEmptyString((image as Record<string, unknown>).dataset_split);
                    const roleDraft = imageRoleDrafts[roleDraftKey] ?? {
                      dataset_role: currentDatasetRole as ShelfDatasetRole,
                      dataset_split: currentDatasetSplit,
                    };
                    return (
                      <div key={`sku-image-${imageId}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                        {hasPreview && preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt={`SKU image ${imageId}`} className="h-40 w-full rounded-md object-cover" />
                        ) : (
                          <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed border-white/10 px-4 text-center text-xs text-slate-400">
                            <span>Sin preview pública</span>
                            <span className="mt-1 text-[11px] text-slate-500">{previewUnavailableReasonOf(image as Record<string, unknown>)}</span>
                          </div>
                        )}
                        <div className="mt-3 space-y-1 text-xs text-slate-300">
                          <p><span className="text-slate-400">id:</span> {String(imageId)}</p>
                          <p><span className="text-slate-400">source_type:</span> {firstNonEmptyString((image as Record<string, unknown>).source_type, (image as Record<string, unknown>).asset_type) || "-"}</p>
                          <p><span className="text-slate-400">dataset_role:</span> {currentDatasetRole}</p>
                          <p><span className="text-slate-400">dataset_split:</span> {currentDatasetSplit || "-"}</p>
                          <p><span className="text-slate-400">content_hash:</span> {firstNonEmptyString((image as Record<string, unknown>).content_hash) || "-"}</p>
                          <p><span className="text-slate-400">estado:</span> {activeLabel((image as Record<string, unknown>).is_active)}</p>
                          <p><span className="text-slate-400">created_at:</span> {firstNonEmptyString((image as Record<string, unknown>).created_at) || "-"}</p>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <select
                            className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
                            value={roleDraft.dataset_role}
                            onChange={(e) => setImageRoleDrafts((prev) => ({
                              ...prev,
                              [roleDraftKey]: {
                                dataset_role: e.target.value as ShelfDatasetRole,
                                dataset_split: roleDraft.dataset_split,
                              },
                            }))}
                          >
                            {SHELF_DATASET_ROLE_OPTIONS.map((role) => (
                              <option key={`image-role-${imageId}-${role}`} value={role}>{role}</option>
                            ))}
                          </select>
                          <Input
                            value={roleDraft.dataset_split}
                            onChange={(e) => setImageRoleDrafts((prev) => ({
                              ...prev,
                              [roleDraftKey]: {
                                dataset_role: roleDraft.dataset_role,
                                dataset_split: e.target.value,
                              },
                            }))}
                            placeholder="dataset_split opcional"
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => getSkuImageDetailMutation.mutate({ skuId: skuImageBrowserSkuId.trim(), imageId })}
                          >
                            Ver detalle
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => patchShelfImageRoleMutation.mutate({
                              skuId: skuImageBrowserSkuId.trim(),
                              imageId,
                              dataset_role: roleDraft.dataset_role,
                              dataset_split: roleDraft.dataset_split,
                            })}
                          >
                            Guardar rol
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteSkuImageMutation.mutate({ skuId: skuImageBrowserSkuId.trim(), imageId })}
                          >
                            Desactivar imagen
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : skuImageBrowserSkuId.trim() ? (
                <p className="mt-4 text-sm text-slate-400">No hay imágenes asociadas para este SKU todavía.</p>
              ) : (
                <p className="mt-4 text-sm text-slate-400">Elige un SKU arriba para ver su dataset visual sin salir de esta pantalla.</p>
              )}

              {selectedSkuImageDetail ? (
                <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Detalle de imagen SKU</p>
                    <Button variant="outline" size="sm" onClick={() => setSelectedSkuImageDetail(null)}>Cerrar detalle</Button>
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-[220px_1fr]">
                    <div>
                      {previewUrlOf(selectedSkuImageDetail as Record<string, unknown>) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrlOf(selectedSkuImageDetail as Record<string, unknown>) ?? ""}
                          alt={`Detalle ${String(selectedSkuImageDetail.image_id ?? selectedSkuImageDetail.id ?? "-")}`}
                          className="h-52 w-full rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-white/10 text-xs text-slate-400">
                          Sin preview
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/20 p-3 text-xs">
                        {JSON.stringify(selectedSkuImageDetail, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            </>
            ) : null}

            {skuDeleteDialogOpen ? (
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
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Assets de entrenamiento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-4">
              <p className="text-sm font-semibold">Cómo trabajar un SKU de punta a punta</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">1. Preparar</p>
                  <p className="mt-1 text-sm text-slate-100">Sube assets por subcategoría cuando aún estás armando la biblioteca visual. Si ya sabes el SKU, puedes saltar directo a la pestaña SKUs.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">2. Asociar</p>
                  <p className="mt-1 text-sm text-slate-100">Adjunta imágenes al SKU. Eso crea la base visual que luego entra a embeddings e índice vectorial.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">3. Revisar</p>
                  <p className="mt-1 text-sm text-slate-100">Abre el browser de imágenes por SKU para confirmar que el dataset quedó bien y desactivar imágenes malas.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">4. Probar</p>
                  <p className="mt-1 text-sm text-slate-100">Reconstruye índice y luego crea un Shelf Job para probar reconocimiento real. Los logs visibles aquí son diagnostics, events y metrics.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Biblioteca de assets previos</p>
                  <p className="mt-1 text-xs text-slate-300">Úsala cuando quieres subir imágenes primero, revisarlas y recién después decidir a qué SKU adjuntarlas.</p>
                </div>
                <Badge variant="outline">Archivos seleccionados: {selectedAssetFiles.length}</Badge>
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
                <p><span className="font-medium text-slate-100">Cuándo usar esta carga:</span> cuando todavía estás preparando material visual y quieres ver miniaturas, filtrar y adjuntar más tarde.</p>
                <p className="mt-1"><span className="font-medium text-slate-100">Cuándo no usarla:</span> si ya sabes el SKU y quieres que la imagen entre directo al dataset real. En ese caso usa la carga de la pestaña `SKUs`.</p>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Selector de SKU</p>
                  <p className="text-xs text-slate-300">Busca por código, nombre, marca o categoría y deja fijo el SKU destino para adjuntar assets sin perderte.</p>
                </div>
                <Badge variant="outline">SKU destino: {selectedSkuId || assetUploadSkuId || "no seleccionado"}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  value={assetSkuSearch}
                  onChange={(e) => setAssetSkuSearch(e.target.value)}
                  placeholder="Buscar SKU por código, nombre, marca o categoría..."
                />
                <Button variant="outline" onClick={() => skusQuery.refetch()}>Actualizar SKUs</Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredSkusForPicker.map((sku) => {
                  const code = getSkuCodeValue(sku);
                  const selected = code && code === (selectedSkuId || assetUploadSkuId);
                  return (
                    <button
                      key={`sku-card-${code}`}
                      type="button"
                      onClick={() => {
                        setSelectedSkuId(code);
                        setAssetUploadSkuId(code);
                        setSkuImageBrowserSkuId(code);
                      }}
                      className={`rounded-lg border p-3 text-left transition ${selected ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-slate-950/40 hover:bg-slate-900/50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-sm text-slate-100">{code || "-"}</p>
                        <Badge variant={selected ? "default" : "outline"}>{selected ? "Seleccionado" : "Elegir"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-100">{getSkuNameValue(sku) || "Sin nombre"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                        {getSkuBrandValue(sku) ? <span>{getSkuBrandValue(sku)}</span> : null}
                        {getSkuFamilyValue(sku) ? <span>{getSkuFamilyValue(sku)}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Asset Browser</p>
                  <p className="text-xs text-slate-300">Carga todos los assets por defecto. Usa filtros solo cuando quieras acotar la vista.</p>
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
                <div className="mt-4 rounded-lg border border-dashed border-white/10 p-4 text-sm text-slate-400">
                  <p>No hay assets para los filtros actuales.</p>
                  <p className="mt-1 text-xs text-slate-500">Si acabas de entrar a la pestaña y esperabas ver todo, prueba `Limpiar filtros` o sube assets nuevos en el bloque superior.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "index" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Índice vectorial, DINO/SigLIP y configuración</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => rebuildIndexMutation.mutate()} disabled={rebuildIndexMutation.isPending}>Reconstruir índice</Button>
              <Button variant="outline" onClick={() => { versionsQuery.refetch(); configQuery.refetch(); }}>Refrescar</Button>
            </div>
            <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-4">
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
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-slate-400">Resumen confiabilidad</p>
                <pre className="mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify(reliabilitySummaryQuery.data ?? {}, null, 2)}</pre>
              </div>
            </div>
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-4">
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
                  <p className="mt-1 text-lg font-semibold text-slate-100">{String(datasetSummaryQuery.data?.totals?.images ?? "-")}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">Indexables</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{String(datasetSummaryQuery.data?.totals?.indexable_images ?? "-")}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-slate-400">SKUs</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{String(datasetSummaryQuery.data?.totals?.skus ?? "-")}</p>
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
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="mb-1 text-xs text-slate-400">shelf/config (fuente de verdad para dino/siglip)</p>
              <pre className="max-h-56 overflow-auto text-xs">{JSON.stringify(configQuery.data ?? {}, null, 2)}</pre>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="mb-1 text-xs text-slate-400">vector-index/versions</p>
              <pre className="max-h-56 overflow-auto text-xs">{JSON.stringify(versionsQuery.data ?? [], null, 2)}</pre>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "review" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Review Queue (low_confidence / unknown_sku)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Selector de SKU</p>
                  <p className="text-xs text-slate-300">Busca el SKU correcto por código, nombre, marca o categoría y úsalo para `assign_sku`.</p>
                </div>
                <Badge variant="outline">SKU seleccionado: {reviewDecisionSkuId || "ninguno"}</Badge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <Input
                  placeholder="Buscar SKU para asignar..."
                  value={reviewSkuSearch}
                  onChange={(e) => setReviewSkuSearch(e.target.value)}
                />
                <Button variant="outline" onClick={() => skusQuery.refetch()}>Actualizar catálogo</Button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredReviewSkus.map((sku) => {
                  const code = getSkuCodeValue(sku);
                  const selected = code === reviewDecisionSkuId;
                  return (
                    <button
                      key={`review-sku-${code}`}
                      type="button"
                      onClick={() => setReviewDecisionSkuId(code)}
                      className={`rounded-lg border p-3 text-left transition ${selected ? "border-cyan-300/40 bg-cyan-500/10" : "border-white/10 bg-slate-950/40 hover:bg-slate-900/50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-sm text-slate-100">{code || "-"}</p>
                        <Badge variant={selected ? "default" : "outline"}>{selected ? "Seleccionado" : "Usar"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-100">{getSkuNameValue(sku) || "Sin nombre"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                        {getSkuBrandValue(sku) ? <span>{getSkuBrandValue(sku)}</span> : null}
                        {getSkuFamilyValue(sku) ? <span>{getSkuFamilyValue(sku)}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input placeholder="Buscar por job, predicted SKU o motivo..." value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} className="max-w-md" />
              <select
                value={reviewStateFilter}
                onChange={(e) => setReviewStateFilter(e.target.value)}
                className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
              >
                <option value="all">Todos los estados</option>
                <option value="low_confidence">low_confidence</option>
                <option value="medium_confidence">medium_confidence</option>
                <option value="unknown_sku">unknown_sku</option>
                <option value="high_confidence">high_confidence</option>
              </select>
              <Button variant="outline" onClick={() => reviewQueueQuery.refetch()}>Refrescar</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10">
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
                    return (
                      <TableRow key={`rq-${id}`}>
                        <TableCell>{String(id)}</TableCell>
                        <TableCell>{String(item.job_id ?? "-")}</TableCell>
                        <TableCell>{confidenceBadge(String(item.confidence_state ?? ""))}</TableCell>
                        <TableCell>{String(item.predicted_sku_name ?? item.predicted_sku_id ?? "-")}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="outline" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "accept_top1" })}>accept_top1</Button>
                            <Button size="sm" variant="outline" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "assign_sku" })}>assign_sku</Button>
                            <Button size="sm" variant="outline" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "mark_unknown" })}>mark_unknown</Button>
                            <Button size="sm" variant="outline" onClick={() => resolveReviewMutation.mutate({ itemId: id, decision: "discard_crop" })}>discard_crop</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!filteredReviewItems.length ? (
                    <TableRow>
                      <TableCell colSpan={5}>No hay items para los filtros actuales.</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {resultsQuery.error instanceof HttpError && resultsQuery.error.status === 404 ? (
        <div className="rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          /results aun no disponible para este job (procesando o backend sin modulo shelf en este ambiente).
        </div>
      ) : null}
    </div>
  );
}
