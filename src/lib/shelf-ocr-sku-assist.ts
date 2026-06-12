import type {
  JobEvent,
  ShelfAssistEngine,
  ShelfAssistEngineConfigured,
  ShelfAssistEngineUsedEvent,
  ShelfCategoriaMatchStrategy,
  ShelfOcrSkuAssistConfigDraft,
  ShelfOcrSkuAssistCrop,
  ShelfOcrSkuAssistSummary,
  ShelfOcrSkuAssistVisionConfig,
  ShelfShadowEngine,
} from "@/types/ocr-api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStringRecord(raw: unknown): Record<string, number> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

const ASSIST_ENGINES: ShelfAssistEngine[] = ["ocr", "vision_llm", "both"];
const SHADOW_ENGINES: Exclude<ShelfShadowEngine, null>[] = ["ocr", "vision_llm"];
const CATEGORIA_MATCH_STRATEGIES: ShelfCategoriaMatchStrategy[] = ["exact", "substring", "tokens"];

export const DEFAULT_CATEGORIA_MATCH_STRATEGIES: ShelfCategoriaMatchStrategy[] = [...CATEGORIA_MATCH_STRATEGIES];

export function isShelfAssistEngine(value: unknown): value is ShelfAssistEngine {
  return typeof value === "string" && ASSIST_ENGINES.includes(value as ShelfAssistEngine);
}

export function isShelfShadowEngine(value: unknown): value is ShelfShadowEngine {
  return value === null || (typeof value === "string" && SHADOW_ENGINES.includes(value as Exclude<ShelfShadowEngine, null>));
}

export function shelfAssistEngineLabel(engine: ShelfAssistEngine | string | null | undefined): string {
  if (engine === "ocr") return "OCR";
  if (engine === "vision_llm") return "Vision LLM";
  if (engine === "both") return "OCR + Vision";
  return engine ? String(engine) : "-";
}

export function shelfShadowEngineLabel(engine: ShelfShadowEngine | string | null | undefined): string {
  if (!engine) return "Sin auditoría";
  return `Auditoría: ${shelfAssistEngineLabel(engine)}`;
}

export function usesVisionAssist(engine: ShelfAssistEngine | null | undefined, shadowEngine: ShelfShadowEngine | null | undefined): boolean {
  return engine === "vision_llm" || engine === "both" || shadowEngine === "vision_llm";
}

export const DEFAULT_SHELF_OCR_SKU_ASSIST_VISION: ShelfOcrSkuAssistVisionConfig = {
  model: null,
  prompt_file: "shelf_vision_sku_assist_prompt.txt",
  timeout_sec: 30,
  num_ctx: 2048,
  num_predict: 256,
  temperature: 0,
  keep_alive: "30m",
  max_retries: 2,
  score_boost_marca: 0.05,
  score_boost_tamano: 0.05,
  score_boost_variante: 0.03,
  score_boost_color: 0.03,
  score_boost_tipo_envase: 0.02,
  score_penalty_on_conflict: 0.05,
  max_total_boost: 0.12,
};

export const DEFAULT_SHELF_OCR_SKU_ASSIST_DRAFT: ShelfOcrSkuAssistConfigDraft = {
  enabled: false,
  only_when_ambiguous: true,
  engine: "ocr",
  shadow_engine: null,
  apply_to_top_k: 3,
  reorder_top_candidates: true,
  prefetch_catalog_by_category: true,
  categoria_match_strategies: [...DEFAULT_CATEGORIA_MATCH_STRATEGIES],
  prefetch_max_rows: 2000,
  num_predict: 128,
  num_ctx: 1024,
  timeout_sec: 12,
  min_text_chars: 4,
  score_boost_barcode_exact: 0.2,
  score_boost_marca: 0.05,
  score_boost_tamano: 0.05,
  score_boost_variante: 0.03,
  score_penalty_on_conflict: 0.05,
  vision: { ...DEFAULT_SHELF_OCR_SKU_ASSIST_VISION },
};

function parseCategoriaMatchStrategies(raw: unknown): ShelfCategoriaMatchStrategy[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CATEGORIA_MATCH_STRATEGIES];
  const parsed = raw
    .map((item) => String(item).trim().toLowerCase())
    .filter((item): item is ShelfCategoriaMatchStrategy => CATEGORIA_MATCH_STRATEGIES.includes(item as ShelfCategoriaMatchStrategy));
  return parsed.length ? parsed : [...DEFAULT_CATEGORIA_MATCH_STRATEGIES];
}

export function getOcrAssistDelta(candidate: Record<string, unknown>): number {
  const breakdown = candidate.score_breakdown;
  if (!isRecord(breakdown)) return 0;
  const value = breakdown.ocr_assist_delta;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseVisionConfig(raw: unknown): ShelfOcrSkuAssistVisionConfig {
  const vision = isRecord(raw) ? raw : {};
  const scoreBoost = isRecord(vision.score_boost) ? vision.score_boost : {};
  return {
    model: typeof vision.model === "string" ? vision.model : null,
    prompt_file: typeof vision.prompt_file === "string" ? vision.prompt_file : DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.prompt_file,
    timeout_sec: Number(vision.timeout_sec) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.timeout_sec,
    num_ctx: Number(vision.num_ctx) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.num_ctx,
    num_predict: Number(vision.num_predict) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.num_predict,
    temperature: Number(vision.temperature) || 0,
    keep_alive: typeof vision.keep_alive === "string" ? vision.keep_alive : DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.keep_alive,
    max_retries: Number(vision.max_retries) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.max_retries,
    score_boost_marca: Number(scoreBoost.marca) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.score_boost_marca,
    score_boost_tamano: Number(scoreBoost.tamano) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.score_boost_tamano,
    score_boost_variante: Number(scoreBoost.variante) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.score_boost_variante,
    score_boost_color: Number(scoreBoost.color) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.score_boost_color,
    score_boost_tipo_envase: Number(scoreBoost.tipo_envase) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.score_boost_tipo_envase,
    score_penalty_on_conflict: Number(vision.score_penalty_on_conflict) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.score_penalty_on_conflict,
    max_total_boost: Number(vision.max_total_boost) || DEFAULT_SHELF_OCR_SKU_ASSIST_VISION.max_total_boost,
  };
}

export function ocrAssistDraftFromConfig(raw: unknown): ShelfOcrSkuAssistConfigDraft {
  const oa = isRecord(raw) ? raw : {};
  const sb = isRecord(oa.score_boost) ? oa.score_boost : {};
  const engine = isShelfAssistEngine(oa.engine) ? oa.engine : DEFAULT_SHELF_OCR_SKU_ASSIST_DRAFT.engine;
  const shadowEngine = oa.shadow_engine === null || oa.shadow_engine === undefined
    ? null
    : isShelfShadowEngine(oa.shadow_engine) && oa.shadow_engine !== null
      ? oa.shadow_engine
      : null;

  return {
    enabled: Boolean(oa.enabled),
    only_when_ambiguous: oa.only_when_ambiguous !== false,
    engine,
    shadow_engine: shadowEngine,
    apply_to_top_k: Number(oa.apply_to_top_k) || 3,
    reorder_top_candidates: oa.reorder_top_candidates !== false,
    prefetch_catalog_by_category: oa.prefetch_catalog_by_category !== false,
    categoria_match_strategies: parseCategoriaMatchStrategies(oa.categoria_match_strategies),
    prefetch_max_rows: Number(oa.prefetch_max_rows) || 2000,
    num_predict: Number(oa.num_predict) || 128,
    num_ctx: Number(oa.num_ctx) || 1024,
    timeout_sec: Number(oa.timeout_sec) || 12,
    min_text_chars: Number(oa.min_text_chars) || 4,
    score_boost_barcode_exact: Number(sb.barcode_exact) || 0.2,
    score_boost_marca: Number(sb.marca) || 0.05,
    score_boost_tamano: Number(sb.tamano) || 0.05,
    score_boost_variante: Number(sb.variante) || 0.03,
    score_penalty_on_conflict: Number(oa.score_penalty_on_conflict) || 0.05,
    vision: parseVisionConfig(oa.vision),
  };
}

export function ocrAssistDraftToPatchPayload(draft: ShelfOcrSkuAssistConfigDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    enabled: draft.enabled,
    only_when_ambiguous: draft.only_when_ambiguous,
    engine: draft.engine,
    shadow_engine: draft.shadow_engine,
    apply_to_top_k: draft.apply_to_top_k,
    reorder_top_candidates: draft.reorder_top_candidates,
    prefetch_catalog_by_category: draft.prefetch_catalog_by_category,
    categoria_match_strategies: draft.categoria_match_strategies,
    prefetch_max_rows: draft.prefetch_max_rows,
    num_predict: draft.num_predict,
    num_ctx: draft.num_ctx,
    timeout_sec: draft.timeout_sec,
    min_text_chars: draft.min_text_chars,
    score_boost: {
      barcode_exact: draft.score_boost_barcode_exact,
      marca: draft.score_boost_marca,
      tamano: draft.score_boost_tamano,
      variante: draft.score_boost_variante,
    },
    score_penalty_on_conflict: draft.score_penalty_on_conflict,
  };

  if (usesVisionAssist(draft.engine, draft.shadow_engine)) {
    payload.vision = {
      model: draft.vision.model,
      prompt_file: draft.vision.prompt_file,
      timeout_sec: draft.vision.timeout_sec,
      num_ctx: draft.vision.num_ctx,
      num_predict: draft.vision.num_predict,
      temperature: draft.vision.temperature,
      keep_alive: draft.vision.keep_alive,
      max_retries: draft.vision.max_retries,
      score_boost: {
        marca: draft.vision.score_boost_marca,
        tamano: draft.vision.score_boost_tamano,
        variante: draft.vision.score_boost_variante,
        color: draft.vision.score_boost_color,
        tipo_envase: draft.vision.score_boost_tipo_envase,
      },
      score_penalty_on_conflict: draft.vision.score_penalty_on_conflict,
      max_total_boost: draft.vision.max_total_boost,
    };
  }

  return payload;
}

export function parseOcrSkuAssistSummary(raw: unknown, options?: { allowEmpty?: boolean }): ShelfOcrSkuAssistSummary | null {
  if (!isRecord(raw)) return null;
  const parsed: ShelfOcrSkuAssistSummary = {
    total_ocr_assist_ran: Number(raw.total_ocr_assist_ran) || 0,
    total_ocr_assist_reordered: Number(raw.total_ocr_assist_reordered) || 0,
    ocr_assist_gate_reasons: parseStringRecord(raw.ocr_assist_gate_reasons) ?? {},
    assist_engine_breakdown: parseStringRecord(raw.assist_engine_breakdown) ?? {},
    total_shadow_assist_ran: Number(raw.total_shadow_assist_ran) || 0,
    total_shadow_would_reorder: Number(raw.total_shadow_would_reorder) || 0,
    shadow_engine_breakdown: parseStringRecord(raw.shadow_engine_breakdown) ?? {},
  };

  const hasSignal =
    parsed.total_ocr_assist_ran > 0 ||
    parsed.total_ocr_assist_reordered > 0 ||
    parsed.total_shadow_assist_ran > 0 ||
    parsed.total_shadow_would_reorder > 0 ||
    Object.keys(parsed.ocr_assist_gate_reasons).length > 0 ||
    Object.keys(parsed.assist_engine_breakdown).length > 0 ||
    Object.keys(parsed.shadow_engine_breakdown).length > 0;

  return hasSignal || options?.allowEmpty ? parsed : null;
}

export function parseAssistEngineConfigured(raw: unknown): ShelfAssistEngineConfigured | null {
  if (!isRecord(raw)) return null;
  const engine = isShelfAssistEngine(raw.engine) ? raw.engine : typeof raw.engine === "string" ? raw.engine : undefined;
  const shadowEngine =
    raw.shadow_engine === null || raw.shadow_engine === undefined
      ? null
      : typeof raw.shadow_engine === "string"
        ? raw.shadow_engine
        : undefined;

  const parsed: ShelfAssistEngineConfigured = {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    engine,
    shadow_engine: shadowEngine,
    only_when_ambiguous: typeof raw.only_when_ambiguous === "boolean" ? raw.only_when_ambiguous : undefined,
    apply_to_top_k: typeof raw.apply_to_top_k === "number" ? raw.apply_to_top_k : undefined,
  };

  const hasSignal = Object.values(parsed).some((value) => value !== undefined);
  return hasSignal ? parsed : null;
}

export function parseAssistEngineUsedEvent(raw: unknown): ShelfAssistEngineUsedEvent | null {
  if (!isRecord(raw)) return null;
  const configured = parseAssistEngineConfigured(raw.configured);
  const observed = parseOcrSkuAssistSummary(raw.observed, { allowEmpty: true }) ?? undefined;
  if (!configured && !observed) return null;

  return {
    processing_mode: typeof raw.processing_mode === "string" ? raw.processing_mode : undefined,
    configured: configured ?? undefined,
    observed,
    source: raw.source === "result_summary" ? "result_summary" : raw.source === "job_event" ? "job_event" : undefined,
  };
}

export function findAssistEngineUsedEvent(events: JobEvent[] | null | undefined): ShelfAssistEngineUsedEvent | null {
  if (!events?.length) return null;
  const match = [...events].reverse().find((event) => event.event_type === "shelf.assist_engine_used");
  if (!match?.payload) return null;
  const parsed = parseAssistEngineUsedEvent(match.payload);
  return parsed ? { ...parsed, source: "job_event" } : null;
}

export function buildAssistEngineUsedFromResult(
  resultJson: unknown,
  configured?: ShelfAssistEngineConfigured | null,
): ShelfAssistEngineUsedEvent | null {
  if (!isRecord(resultJson)) return null;
  const summary = isRecord(resultJson.summary) ? resultJson.summary : null;
  const observed = summary ? parseOcrSkuAssistSummary(summary, { allowEmpty: true }) : null;
  const processingMode = typeof summary?.processing_mode === "string"
    ? summary.processing_mode
    : typeof resultJson.job_metadata === "object" && resultJson.job_metadata && "processing_mode" in (resultJson.job_metadata as Record<string, unknown>)
      ? String((resultJson.job_metadata as Record<string, unknown>).processing_mode)
      : undefined;

  if (!observed && !configured) return null;

  return {
    processing_mode: processingMode,
    configured: configured ?? undefined,
    observed: observed ?? undefined,
    source: "result_summary",
  };
}

export function resolveAssistEngineUsedSnapshot(args: {
  events?: JobEvent[] | null;
  resultJson?: unknown;
  configured?: ShelfAssistEngineConfigured | null;
}): ShelfAssistEngineUsedEvent | null {
  return findAssistEngineUsedEvent(args.events) ?? buildAssistEngineUsedFromResult(args.resultJson, args.configured);
}

function parseAssistCandidate(raw: unknown) {
  if (!isRecord(raw)) return null;
  const signals = Array.isArray(raw.signals) ? raw.signals.map((item) => String(item)).filter(Boolean) : [];
  const components = isRecord(raw.components)
    ? Object.fromEntries(
        Object.entries(raw.components)
          .filter(([, value]) => typeof value === "number")
          .map(([key, value]) => [key, value as number]),
      )
    : undefined;
  return {
    rank_before: Number(raw.rank_before) || 0,
    sku_id: typeof raw.sku_id === "string" ? raw.sku_id : String(raw.sku_id ?? ""),
    delta: Number(raw.delta) || 0,
    signals,
    components,
  };
}

function parseAssistMotor(raw: unknown) {
  if (!isRecord(raw)) return undefined;
  const attributesPreview = isRecord(raw.attributes_preview) ? raw.attributes_preview : undefined;
  return {
    status: typeof raw.status === "string" ? raw.status : undefined,
    model: typeof raw.model === "string" ? raw.model : undefined,
    prompt_file: typeof raw.prompt_file === "string" ? raw.prompt_file : undefined,
    duration_ms: typeof raw.duration_ms === "number" ? raw.duration_ms : undefined,
    text_preview: typeof raw.text_preview === "string" ? raw.text_preview : undefined,
    attributes_preview: attributesPreview,
    raw_preview: typeof raw.raw_preview === "string" ? raw.raw_preview : undefined,
  };
}

export function parseOcrSkuAssistCrop(raw: unknown): ShelfOcrSkuAssistCrop | null {
  if (!isRecord(raw)) return null;
  const shadowRaw = isRecord(raw.shadow) ? raw.shadow : null;
  const shadow = shadowRaw
    ? {
        engine: typeof shadowRaw.engine === "string" ? shadowRaw.engine : undefined,
        ran: shadowRaw.ran === true,
        gate_reason: typeof shadowRaw.gate_reason === "string" ? shadowRaw.gate_reason : undefined,
        would_reorder: shadowRaw.would_reorder === true,
        order_before: Array.isArray(shadowRaw.order_before) ? shadowRaw.order_before.map((item) => String(item)) : undefined,
        order_hypothetical: Array.isArray(shadowRaw.order_hypothetical)
          ? shadowRaw.order_hypothetical.map((item) => String(item))
          : undefined,
        per_candidate: Array.isArray(shadowRaw.per_candidate)
          ? shadowRaw.per_candidate.map(parseAssistCandidate).filter((item): item is NonNullable<typeof item> => Boolean(item))
          : undefined,
        vision: parseAssistMotor(shadowRaw.vision),
        ocr: parseAssistMotor(shadowRaw.ocr),
      }
    : undefined;

  const parsed: ShelfOcrSkuAssistCrop = {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    engine: isShelfAssistEngine(raw.engine) ? raw.engine : typeof raw.engine === "string" ? raw.engine : undefined,
    shadow_engine: raw.shadow_engine === null ? null : typeof raw.shadow_engine === "string" ? raw.shadow_engine : undefined,
    only_when_ambiguous: typeof raw.only_when_ambiguous === "boolean" ? raw.only_when_ambiguous : undefined,
    ran: raw.ran === true,
    gate_reason: typeof raw.gate_reason === "string" ? raw.gate_reason : undefined,
    reordered: raw.reordered === true,
    catalog_prefetch: isRecord(raw.catalog_prefetch) ? (raw.catalog_prefetch as Record<string, unknown>) : undefined,
    ocr: parseAssistMotor(raw.ocr),
    vision: parseAssistMotor(raw.vision),
    per_candidate: Array.isArray(raw.per_candidate)
      ? raw.per_candidate.map(parseAssistCandidate).filter((item): item is NonNullable<typeof item> => Boolean(item))
      : undefined,
    order_before: Array.isArray(raw.order_before) ? raw.order_before.map((item) => String(item)) : undefined,
    order_after: Array.isArray(raw.order_after) ? raw.order_after.map((item) => String(item)) : undefined,
    shadow,
    ocr_sku_assist_short: typeof raw.ocr_sku_assist_short === "string" ? raw.ocr_sku_assist_short : undefined,
  };

  const hasSignal =
    parsed.ran ||
    parsed.reordered ||
    parsed.gate_reason ||
    parsed.engine ||
    parsed.shadow ||
    parsed.ocr ||
    parsed.vision;

  return hasSignal ? parsed : null;
}

export function buildOcrSkuAssistShortLine(assist: ShelfOcrSkuAssistCrop): string {
  if (assist.ocr_sku_assist_short) return assist.ocr_sku_assist_short;
  const parts = [
    `engine=${assist.engine ?? "-"}`,
    `ran=${assist.ran ? "true" : "false"}`,
    `reordered=${assist.reordered ? "true" : "false"}`,
    `gate_reason=${assist.gate_reason ?? "-"}`,
    `shadow_engine=${assist.shadow_engine ?? "-"}`,
    `shadow_ran=${assist.shadow?.ran ? "true" : "false"}`,
    `shadow_would_reorder=${assist.shadow?.would_reorder ? "true" : "false"}`,
  ];
  return parts.join(" | ");
}