import type { CreateShelfJobRequest, JobEvent } from "@/types/ocr-api";

export const SHELF_RECOGNITION_MODULE = "shelf_recognition";

/** Rejects empty values and the shelf module name (never a real category). */
export function normalizeShelfSubcategoria(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === SHELF_RECOGNITION_MODULE) return undefined;
  return trimmed;
}

/** Body for POST /v1/shelf/jobs — omits empty optionals; always includes subcategoria when set. */
export function buildCreateShelfJobBody(input: CreateShelfJobRequest): Record<string, unknown> {
  const subcategoria = normalizeShelfSubcategoria(input.subcategoria ?? input.categoria_hint);
  const usuario = String(input.usuario_relevo ?? "").trim() || undefined;
  const configName = String(input.config_name ?? "").trim() || "default";

  const body: Record<string, unknown> = {
    account_name: input.account_name,
    config_name: configName,
    id_pdv: String(input.id_pdv ?? "").trim(),
    processing_mode: input.processing_mode ?? "recognition",
  };

  if (input.image_file_ids?.length) body.image_file_ids = input.image_file_ids;
  if (input.image_paths?.length) body.image_paths = input.image_paths;
  if (subcategoria) body.subcategoria = subcategoria;
  if (usuario) body.usuario_relevo = usuario;

  return body;
}

export function buildShelfJobRerunOverrides(
  input: { categoria_hint?: string | null; subcategoria?: string | null } = {},
): Record<string, unknown> {
  const hint = normalizeShelfSubcategoria(input.categoria_hint ?? input.subcategoria);
  if (!hint) return {};
  return { categoria_hint: hint };
}

export function shelfJobEventsIncludeNoCategoriaHint(events: JobEvent[]): boolean {
  return events.some((event) => event.event_type === "shelf.no_categoria_hint");
}