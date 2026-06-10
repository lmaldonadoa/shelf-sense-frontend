import { z } from "zod";
import type {
  ActiveConfigResponse,
  AliasListResponse,
  AliasRow,
  ConfigListResponse,
  CreateAccountConfigRequest,
  PipelineConfig,
  CreateJobRequest,
  CreateJobResponse,
  JobEvent,
  JobEventsResponse,
  ImageByProcessCodeResponse,
  AnalysisTraceItem,
  JobDetection,
  JobImage,
  JobMetric,
  JobMetricsResponse,
  JobsMaintenanceAuditRequest,
  JobsMaintenanceAuditResponse,
  JobsMaintenanceCleanupRequest,
  JobsMaintenanceDeleteRequest,
  JobRow,
  JobResponse,
  JobQueueSnapshot,
  JobResultsResponse,
  RecentJobRow,
  RecentJob,
  RecentUpload,
  ReprocessByCodeRequest,
  ReprocessByCodeResponse,
  PromotionsJobRerunRequest,
  PromotionsJobRerunResponse,
  PromotionsBulkRerunRequest,
  PromotionsBulkRerunResponse,
  JobCompareResponse,
  JobDeleteRequest,
  BulkJobDeleteRequest,
  BulkJobDeleteResponse,
  SupportMemoryItem,
  SemanticKnowledgeEntry,
  SemanticKnowledgeListResponse,
  SemanticKnowledgeSearchResponse,
  SemanticKnowledgeMetricsResponse,
  SemanticKnowledgeUpsertRequest,
  SemanticKnowledgeTestRequest,
  SemanticKnowledgeTestResponse,
  SemanticRuleTextSuggestionRequest,
  SemanticRuleTextSuggestionResponse,
  SemanticPreviewOcrRequest,
  SemanticPreviewOcrResponse,
  SemanticPreviewPipelineRequest,
  SemanticPreviewPipelineResponse,
  SemanticLearningCase,
  SemanticLearningCasesResponse,
  SemanticPreviewInsightResponse,
  SemanticRuleDraftAssistResponse,
  SemanticRegressionSmokeResponse,
  SemanticDuplicateCheckResponse,
  AnalyticsResultsQueryRequest,
  AnalyticsResultsQueryResponse,
  AnalyticsResultsFacetsResponse,
  AnalyticsExportRequest,
  AnalyticsExportResponse,
  ObservabilitySummaryRequest,
  ObservabilitySummaryResponse,
  BenchmarkRunRequest,
  BenchmarkRunResponse,
  BenchmarkCreateRequest,
  BenchmarkCreateResponse,
  BenchmarkRunRow,
  BenchmarkReportResponse,
  BenchmarkAnalystPrompt,
  BenchmarkAiReviewRow,
  BenchmarkAiEffectivenessResponse,
  BenchmarkAiReviewRunPayload,
  BenchmarkAiReviewAsyncResponse,
  BenchmarkAiReviewTaskStatus,
  LLMProvidersResponse,
  LLMRoutingDraft,
  LLMRoutingReadResponse,
  LLMRoutingValidateResponse,
  DetectorLocalModelsResponse,
  DetectorStatusResponse,
  DetectorValidateRequest,
  CreateSemanticReviewRequest,
  CreateSemanticReviewResponse,
  SemanticReviewJobResponse,
  SemanticReviewImage,
  SemanticReviewDecisionRequest,
  SemanticAliasRequest,
  UploadResponse,
  PrimaryCrop,
  CanonicalField,
  FieldMapping,
  MasterdataImportBatch,
  MasterdataUploadResponse,
  MasterdataAiMapResponse,
  MasterdataConfirmMapResponse,
  MasterdataPreviewMappedRow,
  MasterdataCatalogRow,
  PreviewCreateSessionRequest,
  PreviewSession,
  PreviewEvent,
  PreviewSnapshotResponse,
  PreviewMetricsResponse,
  PreviewVideoUploadResponse,
  PreviewVideoUploadItem,
  PreviewDiagnosticsResponse,
  ChainsListResponse,
  ChainCatalogItem,
  ChainAlias,
  ChainIgnoredPhrase,
  ChainPromptFiles,
  ChainUpsertRequest,
  ChainAliasUpsertRequest,
  ChainIgnoredPhraseUpsertRequest,
  ChainResolvePreviewResponse,
  AccountPromptFileItem,
  AccountPromptListResponse,
  AccountPromptReadResponse,
  AccountPromptEnsureResponse,
  AccountPromptsBootstrapRequest,
  AccountPromptsBootstrapResponse,
  CreateShelfJobRequest,
  CreateShelfJobResponse,
  ShelfJobResultsResponse,
  ShelfJobRerunResponse,
  ShelfAsset,
  ShelfCropDecisionResponse,
  ShelfCropDetailResponse,
  ShelfEvaluateCropResponse,
  ShelfCropPromoteResponse,
  ShelfDatasetRolePatchResponse,
  ShelfDatasetSummaryResponse,
  ShelfHardNegative,
  ShelfJobExtractedCropsResponse,
  ShelfSku,
  ShelfSkuDeleteRequest,
  ShelfSkuDeleteResponse,
  ShelfEmbeddingsRecomputeRequest,
  ShelfEmbeddingsRecomputeResponse,
  ShelfOperationStatusResponse,
  ShelfReliabilityCompareResponse,
  ShelfReliabilitySummaryResponse,
  ShelfSkuImage,
  ShelfSkuImageResponse,
  ShelfSkuTestJobResponse,
  ShelfReviewQueueItem,
  ShelfExtractedCrop,
} from "@/types/ocr-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const API_PROXY_BASE = process.env.NEXT_PUBLIC_OCR_PROXY_BASE ?? "/admin/ocr/proxy";

export class HttpError extends Error {
  status: number;
  detail: string;
  code?: string;
  payload?: unknown;

  constructor(status: number, detail: string, payload?: unknown) {
    const statusLabel = status > 0 ? String(status) : "NETWORK";
    super(`${statusLabel} - ${detail}`);
    this.name = "HttpError";
    this.status = status;
    this.detail = detail;
    this.code = payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : undefined;
    this.payload = payload;
  }
}

export const createAccountConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  is_active: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});

function normDetection(input: unknown): JobDetection {
  if (!input || typeof input !== "object") return { label: "-", conf: 0, box: [0, 0, 0, 0] };
  const value = input as Record<string, unknown>;
  const label = typeof value.label === "string" ? value.label : "-";
  const conf = typeof value.conf === "number" ? value.conf : typeof value.confidence === "number" ? value.confidence : 0;
  const boxRaw = value.box;
  const box: [number, number, number, number] = Array.isArray(boxRaw) && boxRaw.length === 4
    ? [Number(boxRaw[0]) || 0, Number(boxRaw[1]) || 0, Number(boxRaw[2]) || 0, Number(boxRaw[3]) || 0]
    : [0, 0, 0, 0];
  return { label, conf, box };
}

function normSupportMemoryItem(input: unknown): SupportMemoryItem {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  const boxRaw = value.box;
  const box: [number, number, number, number] | undefined =
    Array.isArray(boxRaw) && boxRaw.length === 4
      ? [Number(boxRaw[0]) || 0, Number(boxRaw[1]) || 0, Number(boxRaw[2]) || 0, Number(boxRaw[3]) || 0]
      : undefined;
  return {
    crop_id: typeof value.crop_id === "string" ? value.crop_id : undefined,
    crop_filename: typeof value.crop_filename === "string" ? value.crop_filename : undefined,
    crop_url: resolveBackendUrl(typeof value.crop_url === "string" ? value.crop_url : null),
    download_url: resolveBackendUrl(typeof value.download_url === "string" ? value.download_url : null),
    label: typeof value.label === "string" ? value.label : undefined,
    memory_label: typeof value.memory_label === "string" ? value.memory_label : undefined,
    conf: typeof value.conf === "number" ? value.conf : undefined,
    box,
    raw_text: typeof value.raw_text === "string" ? value.raw_text : undefined,
    raw_text_full: typeof value.raw_text_full === "string" ? value.raw_text_full : undefined,
    ocr_preprocess:
      value.ocr_preprocess && typeof value.ocr_preprocess === "object"
        ? (value.ocr_preprocess as SupportMemoryItem["ocr_preprocess"])
        : null,
  };
}

function normAnalysisTraceItem(input: unknown): AnalysisTraceItem {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  const boxRaw = value.box;
  const box: [number, number, number, number] | undefined =
    Array.isArray(boxRaw) && boxRaw.length === 4
      ? [Number(boxRaw[0]) || 0, Number(boxRaw[1]) || 0, Number(boxRaw[2]) || 0, Number(boxRaw[3]) || 0]
      : undefined;
  return {
    source: typeof value.source === "string" ? value.source : undefined,
    crop: typeof value.crop === "string" ? value.crop : undefined,
    crop_id: typeof value.crop_id === "string" ? value.crop_id : undefined,
    label: typeof value.label === "string" ? value.label : undefined,
    box,
    ocr_raw_text: typeof value.ocr_raw_text === "string" ? value.ocr_raw_text : undefined,
    vision_output: value.vision_output && typeof value.vision_output === "object" ? (value.vision_output as Record<string, unknown>) : null,
    structured_products_before_filter: Array.isArray(value.structured_products_before_filter)
      ? (value.structured_products_before_filter as Record<string, unknown>[])
      : null,
    structured_products_after_enrichment: Array.isArray(value.structured_products_after_enrichment)
      ? (value.structured_products_after_enrichment as Record<string, unknown>[])
      : null,
    semantic_rag: value.semantic_rag && typeof value.semantic_rag === "object" ? (value.semantic_rag as Record<string, unknown>) : null,
    raw_text_preview: typeof value.raw_text_preview === "string" ? value.raw_text_preview : undefined,
    llm_used: typeof value.llm_used === "boolean" ? value.llm_used : undefined,
    llm_session_id: typeof value.llm_session_id === "string" ? value.llm_session_id : undefined,
    llm_ok: typeof value.llm_ok === "boolean" ? value.llm_ok : undefined,
    products_detected: typeof value.products_detected === "number" ? value.products_detected : undefined,
    ocr_preprocess: value.ocr_preprocess && typeof value.ocr_preprocess === "object" ? (value.ocr_preprocess as Record<string, unknown>) as AnalysisTraceItem["ocr_preprocess"] : null,
  };
}

function normPrimaryCrop(input: unknown): PrimaryCrop | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const cropId = typeof value.crop_id === "string" ? value.crop_id : "";
  if (!cropId) return null;
  return {
    crop_id: cropId,
    crop_filename: typeof value.crop_filename === "string" ? value.crop_filename : null,
    crop_url: resolveBackendUrl(typeof value.crop_url === "string" ? value.crop_url : null),
    download_url: resolveBackendUrl(typeof value.download_url === "string" ? value.download_url : null),
    source: typeof value.source === "string" ? value.source : "primary",
    label: typeof value.label === "string" ? value.label : null,
    conf: typeof value.conf === "number" ? value.conf : null,
    box: Array.isArray(value.box) ? value.box.map((x) => Number(x) || 0) : null,
    ocr_raw_text: typeof value.ocr_raw_text === "string" ? value.ocr_raw_text : null,
    ocr_text_preview: typeof value.ocr_text_preview === "string" ? value.ocr_text_preview : null,
    vision_used: typeof value.vision_used === "boolean" ? value.vision_used : undefined,
    vision_output: value.vision_output && typeof value.vision_output === "object" ? (value.vision_output as Record<string, unknown>) : null,
    structured_products_before_filter: Array.isArray(value.structured_products_before_filter) ? value.structured_products_before_filter : [],
    structured_products_after_enrichment: Array.isArray(value.structured_products_after_enrichment) ? value.structured_products_after_enrichment : [],
    semantic_rag: value.semantic_rag && typeof value.semantic_rag === "object" ? (value.semantic_rag as Record<string, unknown>) : null,
    promotions_extracted: Array.isArray(value.promotions_extracted) ? value.promotions_extracted : [],
    llm_ok: typeof value.llm_ok === "boolean" ? value.llm_ok : null,
    llm_session_id: typeof value.llm_session_id === "string" ? value.llm_session_id : null,
    ocr_preprocess: value.ocr_preprocess && typeof value.ocr_preprocess === "object" ? (value.ocr_preprocess as Record<string, unknown>) as PrimaryCrop["ocr_preprocess"] : null,
  };
}

function normImage(input: unknown): JobImage {
  const x = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as Record<string, unknown>;
  const detections = Array.isArray(x.detections) ? x.detections.map(normDetection) : [];
  const supportDetections = Array.isArray(x.support_detections) ? x.support_detections.map(normDetection) : [];
  const supportMemory = Array.isArray(x.support_memory) ? x.support_memory.map(normSupportMemoryItem) : [];
  const supportNameCandidates = Array.isArray(x.support_name_candidates)
    ? x.support_name_candidates.map((item) => (typeof item === "string" ? item : "")).filter(Boolean)
    : [];
  const analysisTrace = Array.isArray(x.analysis_trace) ? x.analysis_trace.map(normAnalysisTraceItem) : [];
  const primaryCrops = Array.isArray(x.primary_crops) ? x.primary_crops.map(normPrimaryCrop).filter((row): row is PrimaryCrop => Boolean(row)) : [];
  return {
    id: typeof x.id === "number" ? x.id : -1,
    image_process_code: typeof x.image_process_code === "number" ? x.image_process_code : Number.isFinite(Number(x.image_process_code)) ? Number(x.image_process_code) : null,
    file_id: typeof x.file_id === "string" ? x.file_id : null,
    original_name: typeof x.original_name === "string" ? x.original_name : null,
    image_name: typeof x.image_name === "string" ? x.image_name : typeof x.image_path === "string" ? x.image_path : "image",
    original_image_url: resolveBackendUrl(typeof x.original_image_url === "string" ? x.original_image_url : null),
    status: typeof x.status === "string" ? x.status : "unknown",
    processing_status: typeof x.processing_status === "string" ? x.processing_status : null,
    no_products_reason: typeof x.no_products_reason === "string" ? x.no_products_reason : null,
    annotated_image_path: typeof x.annotated_image_path === "string" ? x.annotated_image_path : null,
    annotated_image_url: resolveBackendUrl(typeof x.annotated_image_url === "string" ? x.annotated_image_url : null),
    annotated_download_url: resolveBackendUrl(typeof x.annotated_download_url === "string" ? x.annotated_download_url : null),
    result_json_path: typeof x.result_json_path === "string" ? x.result_json_path : null,
    result_html_path: typeof x.result_html_path === "string" ? x.result_html_path : null,
    result_json_url: resolveBackendUrl(typeof x.result_json_url === "string" ? x.result_json_url : null),
    result_html_url: resolveBackendUrl(typeof x.result_html_url === "string" ? x.result_html_url : null),
    image_md_path: typeof x.image_md_path === "string" ? x.image_md_path : null,
    result_md_url: resolveBackendUrl(typeof x.result_md_url === "string" ? x.result_md_url : null),
    support_result_md_url: resolveBackendUrl(
      typeof x.support_result_md_url === "string"
        ? x.support_result_md_url
        : typeof x.support_md_url === "string"
          ? x.support_md_url
          : typeof x.ai_support_md_url === "string"
            ? x.ai_support_md_url
            : null,
    ),
    support_result_html_url: resolveBackendUrl(
      typeof x.support_result_html_url === "string"
        ? x.support_result_html_url
        : typeof x.support_html_url === "string"
          ? x.support_html_url
          : typeof x.ai_support_html_url === "string"
            ? x.ai_support_html_url
            : null,
    ),
    ai_process_html_url: resolveBackendUrl(
      typeof x.ai_process_html_url === "string"
        ? x.ai_process_html_url
        : typeof x.process_html_url === "string"
          ? x.process_html_url
          : typeof x.ia_process_html_url === "string"
            ? x.ia_process_html_url
            : null,
    ),
    ai_process_md_url: resolveBackendUrl(
      typeof x.ai_process_md_url === "string"
        ? x.ai_process_md_url
        : typeof x.process_md_url === "string"
          ? x.process_md_url
          : typeof x.ia_process_md_url === "string"
            ? x.ia_process_md_url
            : null,
    ),
    ocr_debug: x.ocr_debug && typeof x.ocr_debug === "object" ? (x.ocr_debug as Record<string, unknown>) : null,
    detections,
    support_detections: supportDetections,
    support_memory: supportMemory,
    support_name_candidates: supportNameCandidates,
    analysis_trace: analysisTrace,
    primary_crops: primaryCrops,
    promotions_extracted: Array.isArray(x.promotions_extracted) ? (x.promotions_extracted as Record<string, unknown>[]) : [],
    ocr_raw_text_primary: typeof x.ocr_raw_text_primary === "string" ? x.ocr_raw_text_primary : null,
    ocr_raw_text_support: typeof x.ocr_raw_text_support === "string" ? x.ocr_raw_text_support : null,
    vision_outputs:
      x.vision_outputs && typeof x.vision_outputs === "object"
        ? (x.vision_outputs as Record<string, unknown>[] | Record<string, unknown>)
        : null,
    detections_count: typeof x.detections_count === "number" ? x.detections_count : detections.length,
    error_message: typeof x.error_message === "string" ? x.error_message : typeof x.error === "string" ? x.error : null,
  };
}

function resolveBackendUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      const base = new URL(API_BASE_URL);
      if (parsed.pathname.startsWith("/static/")) {
        return `${API_PROXY_BASE}${parsed.pathname}${parsed.search}`;
      }
      if (parsed.origin === base.origin && parsed.pathname.startsWith("/v1/")) {
        return `${API_PROXY_BASE}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return url;
    }
    return url;
  }
  if (url.startsWith("/v1/")) return `${API_PROXY_BASE}${url}`;
  if (url.startsWith("/static/")) return `${API_PROXY_BASE}${url}`;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return null;
}

function normalizeStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)));
  }
  if (typeof input === "string") {
    const value = input.trim();
    if (!value) return [];
    if (value.startsWith("[") && value.endsWith("]")) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return Array.from(new Set(parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)));
        }
      } catch {
        return [];
      }
    }
    return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
  }
  return [];
}

function normalizeAliasRow(row: unknown): AliasRow {
  const x = (row && typeof row === "object" ? (row as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    id: typeof x.id === "number" ? x.id : -1,
    alias: typeof x.alias === "string" ? x.alias : "",
    canonical: typeof x.canonical === "string" ? x.canonical : "",
    scope: typeof x.scope === "string" ? x.scope : "product",
    is_active: typeof x.is_active === "number" || typeof x.is_active === "boolean" ? (x.is_active as number | boolean) : 0,
    target_keywords: normalizeStringArray(x.target_keywords),
    chain_whitelist: normalizeStringArray(x.chain_whitelist),
    created_at: typeof x.created_at === "string" ? x.created_at : undefined,
    updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
  };
}

function normalizeChainAlias(row: unknown): ChainAlias {
  const x = (row && typeof row === "object" ? (row as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    id: typeof x.id === "number" ? x.id : Number(x.id ?? -1),
    alias_text: typeof x.alias_text === "string" ? x.alias_text : "",
    source: typeof x.source === "string" ? x.source : null,
    is_active: typeof x.is_active === "number" || typeof x.is_active === "boolean" ? (x.is_active as number | boolean) : 1,
  };
}

function normalizeChainIgnoredPhrase(row: unknown): ChainIgnoredPhrase {
  const x = (row && typeof row === "object" ? (row as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    id: typeof x.id === "number" ? x.id : Number(x.id ?? -1),
    phrase: typeof x.phrase === "string" ? x.phrase : "",
    scope: typeof x.scope === "string" ? x.scope : "product",
    chain_whitelist: normalizeStringArray(x.chain_whitelist),
    is_active: typeof x.is_active === "number" || typeof x.is_active === "boolean" ? (x.is_active as number | boolean) : 1,
    created_at: typeof x.created_at === "string" ? x.created_at : undefined,
    updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
  };
}

function normalizeChainPromptFiles(value: unknown): ChainPromptFiles {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const normalized: ChainPromptFiles = {};
  for (const [key, raw] of Object.entries(source)) {
    normalized[key] = typeof raw === "string" && raw.trim() ? raw : raw == null ? null : String(raw);
  }
  return normalized;
}

function normalizeChainCatalogItem(row: unknown): ChainCatalogItem {
  const x = (row && typeof row === "object" ? (row as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    id: typeof x.id === "number" ? x.id : Number(x.id ?? -1),
    chain_code: typeof x.chain_code === "string" ? x.chain_code : "",
    display_name: typeof x.display_name === "string" ? x.display_name : null,
    group_code: typeof x.group_code === "string" ? x.group_code : null,
    is_active: typeof x.is_active === "number" || typeof x.is_active === "boolean" ? (x.is_active as number | boolean) : 1,
    priority: typeof x.priority === "number" ? x.priority : Number.isFinite(Number(x.priority)) ? Number(x.priority) : null,
    aliases: Array.isArray(x.aliases) ? x.aliases.map(normalizeChainAlias).filter((a) => a.alias_text.length > 0) : [],
    ignored_phrases: Array.isArray(x.ignored_phrases)
      ? x.ignored_phrases.map(normalizeChainIgnoredPhrase).filter((item) => item.phrase.length > 0)
      : [],
    prompt_files: normalizeChainPromptFiles(x.prompt_files),
  };
}

function normalizeSemanticKnowledgeRow(row: unknown): SemanticKnowledgeEntry {
  const x = (row && typeof row === "object" ? (row as Record<string, unknown>) : {}) as Record<string, unknown>;
  const isActiveRaw = x.is_active;
  const negativeExamples = normalizeStringArray(x.negative_examples);
  return {
    id: typeof x.id === "number" ? x.id : Number(x.id ?? -1),
    title: typeof x.title === "string" ? x.title : "",
    content: typeof x.content === "string" ? x.content : "",
    entry_type: typeof x.entry_type === "string" ? x.entry_type : "note",
    chain: typeof x.chain === "string" ? x.chain : null,
    category: typeof x.category === "string" ? x.category : null,
    tags: normalizeStringArray(x.tags),
    priority: typeof x.priority === "number" ? x.priority : Number(x.priority ?? 0),
    is_active: typeof isActiveRaw === "boolean" || typeof isActiveRaw === "number" ? isActiveRaw : 1,
    status: typeof x.status === "string" ? x.status : undefined,
    owner: typeof x.owner === "string" ? x.owner : null,
    confidence_target: typeof x.confidence_target === "number" ? x.confidence_target : Number.isFinite(Number(x.confidence_target)) ? Number(x.confidence_target) : null,
    created_from_case: typeof x.created_from_case === "string" ? x.created_from_case : null,
    negative_examples: negativeExamples,
    rollout_scope: x.rollout_scope && typeof x.rollout_scope === "object" ? (x.rollout_scope as Record<string, unknown>) : null,
    success_metrics: x.success_metrics && typeof x.success_metrics === "object" ? (x.success_metrics as Record<string, unknown>) : null,
    rule_version: typeof x.rule_version === "number" ? x.rule_version : Number.isFinite(Number(x.rule_version)) ? Number(x.rule_version) : null,
    canary_flag: typeof x.canary_flag === "boolean" ? x.canary_flag : null,
    shadow_only: typeof x.shadow_only === "boolean" ? x.shadow_only : null,
    created_at: typeof x.created_at === "string" ? x.created_at : undefined,
    updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
    score: typeof x.score === "number" ? x.score : undefined,
  };
}

function normalizeStatus(input: unknown): JobRow["status"] {
  if (typeof input !== "string") return "unknown";
  const value = input.toLowerCase();
  if (value === "queued") return "queued";
  if (value === "running") return "running";
  if (value === "completed") return "completed";
  if (value === "partial_success") return "partial_success";
  if (value === "failed") return "failed";
  return "unknown";
}

function normalizeQueueJobRow(input: unknown): NonNullable<JobQueueSnapshot["running_job"]> {
  const x = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as Record<string, unknown>;
  return {
    job_id: typeof x.job_id === "string" ? x.job_id : "",
    session_id: typeof x.session_id === "string" ? x.session_id : undefined,
    account_name: typeof x.account_name === "string" ? x.account_name : null,
    status: normalizeStatus(x.status),
    total_images: typeof x.total_images === "number" ? x.total_images : Number(x.total_images ?? 0) || 0,
    processed_images: typeof x.processed_images === "number" ? x.processed_images : Number(x.processed_images ?? 0) || 0,
    failed_images: typeof x.failed_images === "number" ? x.failed_images : Number(x.failed_images ?? 0) || 0,
    id_pdv: typeof x.id_pdv === "string" ? x.id_pdv : null,
    subcategoria: typeof x.subcategoria === "string" ? x.subcategoria : null,
    usuario_relevo: typeof x.usuario_relevo === "string" ? x.usuario_relevo : null,
    created_at: typeof x.created_at === "string" ? x.created_at : undefined,
    started_at: typeof x.started_at === "string" ? x.started_at : undefined,
    updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
  };
}

function normalizeSemanticReviewImage(input: unknown): SemanticReviewImage {
  const x = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as Record<string, unknown>;
  const visionAnalysis =
    x.vision_analysis && typeof x.vision_analysis === "object"
      ? (x.vision_analysis as Record<string, unknown>)
      : x.result_json && typeof x.result_json === "object" && (x.result_json as Record<string, unknown>).vision_analysis && typeof (x.result_json as Record<string, unknown>).vision_analysis === "object"
        ? ((x.result_json as Record<string, unknown>).vision_analysis as Record<string, unknown>)
        : null;
  return {
    id: typeof x.id === "number" ? x.id : Number(x.id ?? -1),
    file_id: typeof x.file_id === "string" ? x.file_id : null,
    original_name: typeof x.original_name === "string" ? x.original_name : null,
    image_name: typeof x.image_name === "string" ? x.image_name : typeof x.image_path === "string" ? x.image_path : "image",
    status: typeof x.status === "string" ? x.status : "unknown",
    ocr_chars: typeof x.ocr_chars === "number" ? x.ocr_chars : Number(x.ocr_chars ?? 0),
    has_vision: typeof x.has_vision === "boolean" ? x.has_vision : false,
    error_message: typeof x.error_message === "string" ? x.error_message : null,
    annotated_image_url: resolveBackendUrl(typeof x.annotated_image_url === "string" ? x.annotated_image_url : null),
    annotated_download_url: resolveBackendUrl(typeof x.annotated_download_url === "string" ? x.annotated_download_url : null),
    result_json_url: resolveBackendUrl(typeof x.result_json_url === "string" ? x.result_json_url : null),
    result_md_url: resolveBackendUrl(typeof x.result_md_url === "string" ? x.result_md_url : null),
    ocr_text: typeof x.ocr_text === "string" ? x.ocr_text : null,
    vision_analysis: visionAnalysis,
    decision: typeof x.decision === "string" ? x.decision : null,
    decision_note: typeof x.decision_note === "string" ? x.decision_note : null,
    decision_by: typeof x.decision_by === "string" ? x.decision_by : null,
    decision_at: typeof x.decision_at === "string" ? x.decision_at : null,
    risk_score: typeof x.risk_score === "number" ? x.risk_score : Number.isFinite(Number(x.risk_score)) ? Number(x.risk_score) : null,
    queue_reason: typeof x.queue_reason === "string" ? x.queue_reason : null,
    risk_reasons: normalizeStringArray(x.risk_reasons),
    result_summary: x.result_summary && typeof x.result_summary === "object" ? (x.result_summary as Record<string, unknown>) : null,
  };
}

export function getJobId(row: RecentJobRow): string {
  const candidate = row.job_id ?? row.id ?? row.session_id ?? "";
  return typeof candidate === "string" ? candidate.trim() : "";
}

function normalizeRecentJob(input: unknown): JobRow {
  const x = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as Record<string, unknown>;
  const imageProcessCode =
    typeof x.image_process_code === "number"
      ? x.image_process_code
      : Number.isFinite(Number(x.image_process_code))
        ? Number(x.image_process_code)
        : typeof x.last_image_process_code === "number"
          ? x.last_image_process_code
          : Number.isFinite(Number(x.last_image_process_code))
            ? Number(x.last_image_process_code)
            : Array.isArray(x.image_process_codes) && x.image_process_codes.length
              ? (Number.isFinite(Number(x.image_process_codes[0])) ? Number(x.image_process_codes[0]) : null)
              : null;
  const raw: RecentJobRow = {
    job_id: typeof x.job_id === "string" ? x.job_id : undefined,
    id: typeof x.id === "string" ? x.id : undefined,
    session_id: typeof x.session_id === "string" ? x.session_id : undefined,
    status: normalizeStatus(x.status),
    account_name: typeof x.account_name === "string" ? x.account_name : null,
    job_module:
      typeof x.job_module === "string"
        ? x.job_module
        : typeof x.module === "string"
          ? x.module
          : null,
    job_type: typeof x.job_type === "string" ? x.job_type : null,
    test_mode: typeof x.test_mode === "string" ? x.test_mode : null,
    id_pdv: typeof x.id_pdv === "string" ? x.id_pdv : null,
    subcategoria: typeof x.subcategoria === "string" ? x.subcategoria : null,
    usuario_relevo: typeof x.usuario_relevo === "string" ? x.usuario_relevo : typeof x.usuario === "string" ? x.usuario : null,
    image_process_code: imageProcessCode,
    total_images: typeof x.total_images === "number" ? x.total_images : Number(x.total_images ?? 0) || 0,
    processed_images: typeof x.processed_images === "number" ? x.processed_images : Number(x.processed_images ?? 0) || 0,
    failed_images: typeof x.failed_images === "number" ? x.failed_images : Number(x.failed_images ?? 0) || 0,
    error_message:
      typeof x.error_message === "string"
        ? x.error_message
        : typeof x.error === "string"
          ? x.error
          : null,
    created_at: typeof x.created_at === "string" ? x.created_at : typeof x.started_at === "string" ? x.started_at : "",
    updated_at:
      typeof x.updated_at === "string"
        ? x.updated_at
        : typeof x.finished_at === "string"
          ? x.finished_at
          : typeof x.created_at === "string"
            ? x.created_at
            : "",
    started_at: typeof x.started_at === "string" ? x.started_at : undefined,
    finished_at: typeof x.finished_at === "string" ? x.finished_at : null,
  };
  const jobId = getJobId(raw);
  const createdAt = typeof x.created_at === "string" ? x.created_at : typeof x.started_at === "string" ? x.started_at : "";
  const updatedAt =
    typeof x.updated_at === "string"
      ? x.updated_at
      : typeof x.finished_at === "string"
        ? x.finished_at
        : createdAt;
  return {
    ...raw,
    id: jobId,
    job_id: raw.job_id ?? jobId,
    session_id: jobId,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeJobEvent(input: unknown): JobEvent {
  const x = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as Record<string, unknown>;
  const idValue = typeof x.id === "number" ? x.id : Number(x.id ?? -1);
  const rawLevel = typeof x.level === "string" ? x.level.toUpperCase() : "INFO";
  const level = rawLevel === "ERROR" || rawLevel === "WARNING" ? rawLevel : "INFO";
  return {
    id: Number.isFinite(idValue) ? idValue : -1,
    job_id: typeof x.job_id === "string" ? x.job_id : undefined,
    job_image_id: typeof x.job_image_id === "number" ? x.job_image_id : null,
    level,
    event_type:
      typeof x.event_type === "string"
        ? x.event_type
        : typeof x.type === "string"
          ? x.type
          : "event",
    message: typeof x.message === "string" ? x.message : "",
    payload:
      x.payload ??
      (Object.prototype.hasOwnProperty.call(x, "details")
        ? x.details
        : undefined),
    created_at:
      typeof x.created_at === "string"
        ? x.created_at
        : typeof x.timestamp === "string"
          ? x.timestamp
          : new Date(0).toISOString(),
  };
}

function normalizeJobMetric(input: unknown): JobMetric {
  const x = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) as Record<string, unknown>;
  const idValue = typeof x.id === "number" ? x.id : Number(x.id ?? -1);
  const durationValue = typeof x.duration_ms === "number" ? x.duration_ms : Number(x.duration_ms ?? 0);
  return {
    id: Number.isFinite(idValue) ? idValue : -1,
    job_id: typeof x.job_id === "string" ? x.job_id : "",
    job_image_id: typeof x.job_image_id === "number" ? x.job_image_id : null,
    step: typeof x.step === "string" ? x.step : "unknown",
    duration_ms: Number.isFinite(durationValue) ? durationValue : 0,
    source: typeof x.source === "string" ? x.source : null,
    crop: typeof x.crop === "string" ? x.crop : null,
    payload:
      x.payload && typeof x.payload === "object" && !Array.isArray(x.payload)
        ? (x.payload as Record<string, unknown>)
        : null,
    created_at: typeof x.created_at === "string" ? x.created_at : new Date(0).toISOString(),
  };
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response.text();
  return response.json().catch(() => undefined);
}

function errMsgByStatus(status: number, fallback: string): string {
  if (status === 400) return "Request inválido o file_id no válido.";
  if (status === 404) return "No encontrado o aún no disponible.";
  if (status === 413) return "Se excedió límite de tamaño/cantidad de archivos.";
  if (status === 415) return "Tipo o extensión de archivo no soportado.";
  if (status === 422) return "Error de validación del payload.";
  if (status === 500) return "Error interno de backend.";
  return fallback;
}

function normalizeErrorDetail(body: unknown, status: number, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first && typeof first === "object") {
        const row = first as { msg?: unknown; loc?: unknown };
        const msg = typeof row.msg === "string" ? row.msg : "Validation error";
        const loc = Array.isArray(row.loc) ? row.loc.map((x) => String(x)).join(".") : "";
        return loc ? `${loc}: ${msg}` : msg;
      }
      return JSON.stringify(detail);
    }
    if (detail && typeof detail === "object") return JSON.stringify(detail);
  }
  return errMsgByStatus(status, fallback);
}

function normalizePreviewSession(input: unknown): PreviewSession {
  const x = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const metricsRaw = (x.metrics && typeof x.metrics === "object" ? x.metrics : {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    session_id: typeof x.session_id === "string" ? x.session_id : "",
    status: typeof x.status === "string" ? x.status : "created",
    created_at: typeof x.created_at === "string" ? x.created_at : undefined,
    updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
    started_at: typeof x.started_at === "string" ? x.started_at : null,
    finished_at: typeof x.finished_at === "string" ? x.finished_at : null,
    error_message: typeof x.error_message === "string" ? x.error_message : null,
    account_name: typeof x.account_name === "string" ? x.account_name : "",
    id_pdv: typeof x.id_pdv === "string" ? x.id_pdv : null,
    subcategoria: typeof x.subcategoria === "string" ? x.subcategoria : null,
    usuario_relevo: typeof x.usuario_relevo === "string" ? x.usuario_relevo : null,
    source: x.source && typeof x.source === "object" ? (x.source as Record<string, unknown>) : {},
    runtime: x.runtime && typeof x.runtime === "object" ? (x.runtime as Record<string, unknown>) : {},
    sampling: x.sampling && typeof x.sampling === "object" ? (x.sampling as Record<string, unknown>) : {},
    enrichment: x.enrichment && typeof x.enrichment === "object" ? (x.enrichment as Record<string, unknown>) : {},
    metrics: {
      fps: n(metricsRaw.fps),
      frames_processed: n(metricsRaw.frames_processed),
      yolo_inferences: n(metricsRaw.yolo_inferences),
      ocr_inferences: n(metricsRaw.ocr_inferences),
      llm_inferences: n(metricsRaw.llm_inferences),
      drop_frames: n(metricsRaw.drop_frames),
      last_loop_ms: n(metricsRaw.last_loop_ms),
    },
    active_tracks: n(x.active_tracks),
    latest_cursor: n(x.latest_cursor),
  };
}

async function request(path: string, init: RequestInit, fallback: string, timeoutMs = 20000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const proxyPath = path.startsWith("/") ? path : `/${path}`;
    const isPublicHealth = proxyPath === "/health";
    const targetUrl = isPublicHealth ? `${API_BASE_URL}${proxyPath}` : `${API_PROXY_BASE}${proxyPath}`;
    const headers = new Headers(init.headers ?? {});
    if (!isPublicHealth && typeof window !== "undefined") {
      const activeAccount = window.localStorage.getItem("ocr_active_account_name");
      if (activeAccount?.trim()) headers.set("x-bff-account-name", activeAccount.trim());
    }
    const response = await fetch(targetUrl, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await parseBody(response);
    if (!response.ok) {
      const detail = normalizeErrorDetail(body, response.status, fallback) || response.statusText || errMsgByStatus(response.status, fallback);
      throw new HttpError(response.status, detail, body);
    }
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(0, "Timeout conectando con backend.");
    }
    throw new HttpError(0, "No se pudo conectar con backend. Verifica backend URL y puerto.");
  } finally {
    clearTimeout(timeout);
  }
}

export function deepMerge<T extends Record<string, unknown>, P extends Record<string, unknown>>(base: T, patch: P): T & P {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const prev = output[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prev &&
      typeof prev === "object" &&
      !Array.isArray(prev)
    ) {
      output[key] = deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output as T & P;
}

export const ocrApi = {
  backendUrl: API_BASE_URL,

  health: async (): Promise<Record<string, unknown>> => {
    const body = await request(`/health`, { method: "GET" }, "No se pudo consultar health");
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  getHealth: async (): Promise<Record<string, unknown>> => {
    return ocrApi.health();
  },

  getLlmProviders: async (): Promise<LLMProvidersResponse> => {
    const body = await request(`/v1/llm/providers`, { method: "GET" }, "No se pudo consultar catálogo LLM");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      providers: Array.isArray(data.providers) ? (data.providers as LLMProvidersResponse["providers"]) : [],
      slots: data.slots && typeof data.slots === "object" ? (data.slots as LLMProvidersResponse["slots"]) : {},
      default_template: data.default_template && typeof data.default_template === "object" ? (data.default_template as LLMRoutingDraft) : undefined,
      env_flags: data.env_flags && typeof data.env_flags === "object" ? (data.env_flags as LLMProvidersResponse["env_flags"]) : undefined,
    };
  },

  getLlmRoutingTemplate: async (): Promise<{ llm_routing: LLMRoutingDraft }> => {
    const body = await request(`/v1/llm/routing/template`, { method: "GET" }, "No se pudo consultar template LLM routing");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const routing = data.llm_routing && typeof data.llm_routing === "object"
      ? (data.llm_routing as LLMRoutingDraft)
      : { enabled: false, fallback_to_legacy: true, slots: {} };
    return { llm_routing: routing };
  },

  getDetectorLocalModels: async (): Promise<DetectorLocalModelsResponse> => {
    const body = await request(`/v1/detectors/local-models`, { method: "GET" }, "No se pudo listar modelos locales");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.models) ? data.models : [];
    return {
      models: rows
        .map((x) => {
          const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
          return {
            path: typeof row.path === "string" ? row.path : "",
            absolute_path: typeof row.absolute_path === "string" ? row.absolute_path : undefined,
            filename: typeof row.filename === "string" ? row.filename : undefined,
            size_bytes: Number.isFinite(Number(row.size_bytes)) ? Number(row.size_bytes) : undefined,
          };
        })
        .filter((row) => row.path.length > 0),
      recommended_custom_path: typeof data.recommended_custom_path === "string" ? data.recommended_custom_path : undefined,
      notes: Array.isArray(data.notes) ? data.notes.map((item) => String(item)).filter(Boolean) : [],
    };
  },

  getDetectorStatus: async (accountName: string, configName = "default", checkModelLoad = false): Promise<DetectorStatusResponse> => {
    const q = new URLSearchParams();
    q.set("config_name", configName);
    q.set("check_model_load", String(checkModelLoad));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/detector/status?${q.toString()}`,
      { method: "GET" },
      "No se pudo consultar estado del detector",
    );
    return (body && typeof body === "object" ? body : {}) as DetectorStatusResponse;
  },

  validateDetectorConfig: async (accountName: string, payload: DetectorValidateRequest): Promise<DetectorStatusResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/detector/validate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "No se pudo validar detector",
    );
    return (body && typeof body === "object" ? body : {}) as DetectorStatusResponse;
  },

  uploadMasterdataImport: async (
    accountName: string,
    payload: { file: File; createdBy?: string; sheetName?: string; sampleRows?: number },
  ): Promise<MasterdataUploadResponse> => {
    const form = new FormData();
    form.append("file", payload.file);
    if (payload.createdBy?.trim()) form.append("created_by", payload.createdBy.trim());
    if (payload.sheetName?.trim()) form.append("sheet_name", payload.sheetName.trim());
    if (typeof payload.sampleRows === "number" && Number.isFinite(payload.sampleRows)) {
      form.append("sample_rows", String(payload.sampleRows));
    }
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/imports/upload`,
      { method: "POST", body: form },
      "No se pudo subir archivo de masterdata",
      60000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const preview = (data.preview && typeof data.preview === "object" ? data.preview : {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      batch_id: Number(data.batch_id ?? 0) || 0,
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      canonical_fields: Array.isArray(data.canonical_fields) ? data.canonical_fields.map((x) => String(x)) : [],
      preview: {
        kind: typeof preview.kind === "string" ? preview.kind : undefined,
        selected_sheet: typeof preview.selected_sheet === "string" ? preview.selected_sheet : null,
        available_sheets: Array.isArray(preview.available_sheets) ? preview.available_sheets.map((x) => String(x)) : [],
        headers: Array.isArray(preview.headers) ? preview.headers.map((x) => String(x)) : [],
        sample_rows: Array.isArray(preview.sample_rows) ? (preview.sample_rows as Record<string, unknown>[]) : [],
        total_rows: Number.isFinite(Number(preview.total_rows)) ? Number(preview.total_rows) : undefined,
      },
      batch: data.batch && typeof data.batch === "object" ? (data.batch as MasterdataImportBatch) : undefined,
    };
  },

  listMasterdataImports: async (accountName: string, limit = 50): Promise<MasterdataImportBatch[]> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/imports?limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
      "No se pudo listar imports de masterdata",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.imports) ? data.imports : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((row) => {
      const x = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        id: Number(x.id ?? x.batch_id ?? 0) || 0,
        batch_id: Number(x.batch_id ?? x.id ?? 0) || 0,
        account_name: typeof x.account_name === "string" ? x.account_name : accountName,
        source_filename: typeof x.source_filename === "string" ? x.source_filename : undefined,
        status: typeof x.status === "string" ? x.status : "uploaded",
        mapping: x.mapping && typeof x.mapping === "object" ? (x.mapping as Record<string, unknown>) : null,
        preview: x.preview && typeof x.preview === "object" ? (x.preview as Record<string, unknown>) : null,
        summary: x.summary && typeof x.summary === "object" ? (x.summary as Record<string, unknown>) : null,
        created_by: typeof x.created_by === "string" ? x.created_by : null,
        created_at: typeof x.created_at === "string" ? x.created_at : undefined,
        updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
      } satisfies MasterdataImportBatch;
    });
  },

  getMasterdataImportDetail: async (accountName: string, batchId: number): Promise<MasterdataImportBatch> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/imports/${encodeURIComponent(String(batchId))}`,
      { method: "GET" },
      "No se pudo consultar detalle de import masterdata",
    );
    const x = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const nestedBatch = (x.batch && typeof x.batch === "object" ? x.batch : null) as Record<string, unknown> | null;
    const source = nestedBatch ?? x;
    return {
      id: Number(source.id ?? source.batch_id ?? x.batch_id ?? batchId) || batchId,
      batch_id: Number(source.batch_id ?? source.id ?? x.batch_id ?? batchId) || batchId,
      account_name: typeof source.account_name === "string" ? source.account_name : typeof x.account_name === "string" ? x.account_name : accountName,
      source_filename: typeof source.source_filename === "string" ? source.source_filename : undefined,
      status: typeof source.status === "string" ? source.status : "uploaded",
      mapping:
        (source.mapping && typeof source.mapping === "object" ? (source.mapping as Record<string, unknown>) : null) ??
        (x.mapping && typeof x.mapping === "object" ? (x.mapping as Record<string, unknown>) : null),
      preview:
        (source.preview && typeof source.preview === "object" ? (source.preview as Record<string, unknown>) : null) ??
        (x.preview && typeof x.preview === "object" ? (x.preview as Record<string, unknown>) : null),
      summary:
        (source.summary && typeof source.summary === "object" ? (source.summary as Record<string, unknown>) : null) ??
        (x.summary && typeof x.summary === "object" ? (x.summary as Record<string, unknown>) : null),
      created_by: typeof source.created_by === "string" ? source.created_by : null,
      created_at: typeof source.created_at === "string" ? source.created_at : undefined,
      updated_at: typeof source.updated_at === "string" ? source.updated_at : undefined,
    };
  },

  getMasterdataAiMapSuggestion: async (
    accountName: string,
    batchId: number,
    payload: { sheet_name?: string; model?: string; target_schema?: string } = {},
  ): Promise<MasterdataAiMapResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/imports/${encodeURIComponent(String(batchId))}/ai-map`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "No se pudo generar sugerencia de mapeo IA",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const suggested = (data.suggested_mapping && typeof data.suggested_mapping === "object"
      ? data.suggested_mapping
      : {}) as Record<string, unknown>;
    const mappingObj = (suggested.mapping && typeof suggested.mapping === "object" ? suggested.mapping : {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      suggested_mapping: {
        strategy: typeof suggested.strategy === "string" ? suggested.strategy : undefined,
        mapping: mappingObj as Partial<FieldMapping>,
        confidence: Number.isFinite(Number(suggested.confidence)) ? Number(suggested.confidence) : undefined,
        notes: Array.isArray(suggested.notes) ? suggested.notes.map((x) => String(x)) : [],
        model: typeof suggested.model === "string" ? suggested.model : undefined,
      },
    };
  },

  confirmMasterdataMapping: async (
    accountName: string,
    batchId: number,
    payload: { mapping: Partial<FieldMapping>; sheet_name?: string; dry_run: boolean; created_by?: string; max_rows?: number },
  ): Promise<MasterdataConfirmMapResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/imports/${encodeURIComponent(String(batchId))}/confirm-map`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "No se pudo confirmar mapeo de masterdata",
      60000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const summary = (data.summary && typeof data.summary === "object" ? data.summary : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.preview_mapped_rows) ? data.preview_mapped_rows : [];
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      summary: {
        total_rows_read: Number.isFinite(Number(summary.total_rows_read)) ? Number(summary.total_rows_read) : undefined,
        valid_rows: Number.isFinite(Number(summary.valid_rows)) ? Number(summary.valid_rows) : undefined,
        invalid_rows: Number.isFinite(Number(summary.invalid_rows)) ? Number(summary.invalid_rows) : undefined,
        dry_run: typeof summary.dry_run === "boolean" ? summary.dry_run : undefined,
        imported_rows: Number.isFinite(Number(summary.imported_rows)) ? Number(summary.imported_rows) : undefined,
        sheet_name: typeof summary.sheet_name === "string" ? summary.sheet_name : null,
        headers: Array.isArray(summary.headers) ? summary.headers.map((x) => String(x)) : [],
        mapping: summary.mapping && typeof summary.mapping === "object" ? (summary.mapping as Partial<FieldMapping>) : undefined,
      },
      preview_mapped_rows: rows.map((row) => {
        const x = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
        return {
          row_index: Number(x.row_index ?? 0) || 0,
          raw: x.raw && typeof x.raw === "object" ? (x.raw as Record<string, unknown>) : {},
          mapped: x.mapped && typeof x.mapped === "object" ? (x.mapped as Record<string, unknown>) : {},
          status: typeof x.status === "string" ? x.status : "pending",
          errors: Array.isArray(x.errors) ? x.errors.map((y) => String(y)) : [],
        } satisfies MasterdataPreviewMappedRow;
      }),
    };
  },

  listMasterdataImportRows: async (accountName: string, batchId: number, limit = 200): Promise<MasterdataPreviewMappedRow[]> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/imports/${encodeURIComponent(String(batchId))}/rows?limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
      "No se pudo listar filas mapeadas",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.rows) ? data.rows : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((row) => {
      const x = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        row_index: Number(x.row_index ?? 0) || 0,
        raw: x.raw && typeof x.raw === "object" ? (x.raw as Record<string, unknown>) : {},
        mapped: x.mapped && typeof x.mapped === "object" ? (x.mapped as Record<string, unknown>) : {},
        status: typeof x.status === "string" ? x.status : "pending",
        errors: Array.isArray(x.errors) ? x.errors.map((y) => String(y)) : [],
      } satisfies MasterdataPreviewMappedRow;
    });
  },

  listMasterdataCatalog: async (
    accountName: string,
    params: { brand?: string; family?: string; limit?: number } = {},
  ): Promise<MasterdataCatalogRow[]> => {
    const q = new URLSearchParams();
    if (params.brand?.trim()) q.set("brand", params.brand.trim());
    if (params.family?.trim()) q.set("family", params.family.trim());
    q.set("limit", String(params.limit ?? 300));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/catalog?${q.toString()}`,
      { method: "GET" },
      "No se pudo listar catálogo masterdata",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.rows) ? data.rows : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as MasterdataCatalogRow));
  },

  listMasterdataBrands: async (accountName: string, limit = 300): Promise<string[]> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/brands?limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
      "No se pudo listar brands masterdata",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.brands) ? data.brands : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => String(x)).filter(Boolean);
  },

  listMasterdataFamilies: async (accountName: string, params: { brand?: string; limit?: number } = {}): Promise<string[]> => {
    const q = new URLSearchParams();
    if (params.brand?.trim()) q.set("brand", params.brand.trim());
    q.set("limit", String(params.limit ?? 500));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/families?${q.toString()}`,
      { method: "GET" },
      "No se pudo listar families masterdata",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.families) ? data.families : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => String(x)).filter(Boolean);
  },

  listMasterdataVariants: async (
    accountName: string,
    params: { brand?: string; family?: string; limit?: number } = {},
  ): Promise<string[]> => {
    const q = new URLSearchParams();
    if (params.brand?.trim()) q.set("brand", params.brand.trim());
    if (params.family?.trim()) q.set("family", params.family.trim());
    q.set("limit", String(params.limit ?? 500));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/masterdata/variants?${q.toString()}`,
      { method: "GET" },
      "No se pudo listar variants masterdata",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.variants) ? data.variants : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => String(x)).filter(Boolean);
  },

  createPreviewSession: async (payload: PreviewCreateSessionRequest): Promise<PreviewSession> => {
    const body = await request(
      `/v1/preview/sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "No se pudo crear sesión preview",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const session = data.session ?? data;
    return normalizePreviewSession(session);
  },

  listPreviewSessions: async (limit = 50): Promise<PreviewSession[]> => {
    const body = await request(`/v1/preview/sessions?limit=${encodeURIComponent(String(limit))}`, { method: "GET" }, "No se pudo listar sesiones preview");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.sessions) ? data.sessions : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => normalizePreviewSession(x));
  },

  getPreviewSession: async (sessionId: string): Promise<PreviewSession> => {
    const body = await request(`/v1/preview/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" }, "No se pudo consultar sesión preview");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const session = data.session ?? data;
    return normalizePreviewSession(session);
  },

  controlPreviewSession: async (sessionId: string, action: "start" | "pause" | "resume" | "stop"): Promise<PreviewSession> => {
    const body = await request(
      `/v1/preview/sessions/${encodeURIComponent(sessionId)}/${action}`,
      { method: "POST" },
      `No se pudo ${action} sesión preview`,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const session = data.session ?? data;
    return normalizePreviewSession(session);
  },

  getPreviewSnapshot: async (sessionId: string): Promise<PreviewSnapshotResponse> => {
    const body = await request(
      `/v1/preview/sessions/${encodeURIComponent(sessionId)}/snapshot`,
      { method: "GET" },
      "No se pudo consultar snapshot preview",
    );
    return (body && typeof body === "object" ? body : {}) as PreviewSnapshotResponse;
  },

  getPreviewMetrics: async (sessionId: string): Promise<PreviewMetricsResponse> => {
    const body = await request(
      `/v1/preview/sessions/${encodeURIComponent(sessionId)}/metrics`,
      { method: "GET" },
      "No se pudo consultar métricas preview",
    );
    return (body && typeof body === "object" ? body : {}) as PreviewMetricsResponse;
  },

  getPreviewEvents: async (sessionId: string, params: { after?: number; limit?: number } = {}): Promise<{ items: PreviewEvent[]; next_cursor: number }> => {
    const after = Number.isFinite(Number(params.after)) ? Number(params.after) : 0;
    const limit = Number.isFinite(Number(params.limit)) ? Number(params.limit) : 100;
    const body = await request(
      `/v1/preview/sessions/${encodeURIComponent(sessionId)}/events?after=${encodeURIComponent(String(after))}&limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
      "No se pudo consultar eventos preview",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.events) ? data.events : [];
    const items = rows.map((row) => {
      const x = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        cursor: Number.isFinite(Number(x.cursor)) ? Number(x.cursor) : undefined,
        type: typeof x.type === "string" ? x.type : "unknown",
        session_id: typeof x.session_id === "string" ? x.session_id : sessionId,
        ts: typeof x.ts === "string" ? x.ts : new Date().toISOString(),
        ...x,
      } as PreviewEvent;
    });
    const nextCursor = Number.isFinite(Number(data.next_cursor)) ? Number(data.next_cursor) : items.length ? Number(items[items.length - 1].cursor ?? after) : after;
    return { items, next_cursor: nextCursor };
  },

  uploadPreviewVideo: async (payload: { file: File; accountName?: string; createdBy?: string }): Promise<PreviewVideoUploadResponse> => {
    const form = new FormData();
    form.append("file", payload.file);
    if (payload.accountName?.trim()) form.append("account_name", payload.accountName.trim());
    if (payload.createdBy?.trim()) form.append("created_by", payload.createdBy.trim());
    const body = await request(
      `/v1/preview/uploads/video`,
      { method: "POST", body: form },
      "No se pudo subir video preview",
      120000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      account_name: typeof data.account_name === "string" ? data.account_name : payload.accountName ?? "",
      video_file_id: typeof data.video_file_id === "string" ? data.video_file_id : "",
      original_name: typeof data.original_name === "string" ? data.original_name : undefined,
      mime_type: typeof data.mime_type === "string" ? data.mime_type : undefined,
      size_bytes: Number.isFinite(Number(data.size_bytes)) ? Number(data.size_bytes) : undefined,
      stored_path: typeof data.stored_path === "string" ? data.stored_path : undefined,
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
      expires_at: typeof data.expires_at === "string" ? data.expires_at : undefined,
    };
  },

  listPreviewVideos: async (params: { accountName?: string; limit?: number } = {}): Promise<PreviewVideoUploadItem[]> => {
    const q = new URLSearchParams();
    if (params.accountName?.trim()) q.set("account_name", params.accountName.trim());
    q.set("limit", String(params.limit ?? 50));
    const body = await request(`/v1/preview/uploads/video?${q.toString()}`, { method: "GET" }, "No se pudo listar videos preview");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : [];
    return rows.map((row) => {
      const x = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      return {
        video_file_id: typeof x.video_file_id === "string" ? x.video_file_id : "",
        original_name: typeof x.original_name === "string" ? x.original_name : undefined,
        mime_type: typeof x.mime_type === "string" ? x.mime_type : undefined,
        size_bytes: Number.isFinite(Number(x.size_bytes)) ? Number(x.size_bytes) : undefined,
        storage_path: typeof x.storage_path === "string" ? x.storage_path : undefined,
        created_by: typeof x.created_by === "string" ? x.created_by : undefined,
        expires_at: typeof x.expires_at === "string" ? x.expires_at : undefined,
        created_at: typeof x.created_at === "string" ? x.created_at : undefined,
        account_name: typeof x.account_name === "string" ? x.account_name : undefined,
      } satisfies PreviewVideoUploadItem;
    });
  },

  deletePreviewVideo: async (videoFileId: string, accountName?: string): Promise<Record<string, unknown>> => {
    const q = new URLSearchParams();
    if (accountName?.trim()) q.set("account_name", accountName.trim());
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await request(`/v1/preview/uploads/video/${encodeURIComponent(videoFileId)}${suffix}`, { method: "DELETE" }, "No se pudo eliminar video preview");
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  getPreviewDiagnostics: async (sessionId: string, params: { after?: number; limit?: number } = {}): Promise<PreviewDiagnosticsResponse> => {
    const q = new URLSearchParams();
    q.set("after", String(Number.isFinite(Number(params.after)) ? Number(params.after) : 0));
    q.set("limit", String(Number.isFinite(Number(params.limit)) ? Number(params.limit) : 120));
    const body = await request(
      `/v1/preview/sessions/${encodeURIComponent(sessionId)}/diagnostics?${q.toString()}`,
      { method: "GET" },
      "No se pudo consultar diagnostics preview",
    );
    return (body && typeof body === "object" ? body : {}) as PreviewDiagnosticsResponse;
  },

  getPreviewDiagnosticsMarkdown: async (sessionId: string, params: { after?: number; limit?: number } = {}): Promise<string> => {
    const q = new URLSearchParams();
    q.set("after", String(Number.isFinite(Number(params.after)) ? Number(params.after) : 0));
    q.set("limit", String(Number.isFinite(Number(params.limit)) ? Number(params.limit) : 80));
    const body = await request(
      `/v1/preview/sessions/${encodeURIComponent(sessionId)}/diagnostics.md?${q.toString()}`,
      { method: "GET", headers: { Accept: "text/markdown,text/plain,*/*" } },
      "No se pudo consultar diagnostics markdown",
    );
    return typeof body === "string" ? body : JSON.stringify(body, null, 2);
  },

  listRecentJobs: async ({
    accountName,
    limit = 20,
    jobModule,
  }: { accountName?: string; limit?: number; jobModule?: string } = {}): Promise<RecentJob[]> => {
    const parseRows = (body: unknown): RecentJob[] => {
      const rows = Array.isArray(body)
        ? body
        : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).jobs)
          ? ((body as Record<string, unknown>).jobs as unknown[])
          : [];
      return rows
        .map(normalizeRecentJob)
        .filter((row) => getJobId(row).length > 0)
        .sort((a, b) => {
          const ta = new Date(a.created_at || a.updated_at).getTime();
          const tb = new Date(b.created_at || b.updated_at).getTime();
          return tb - ta;
        });
    };

    const fetchBody = async (withAccountFilter: boolean): Promise<unknown> => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (withAccountFilter && accountName) params.set("account_name", accountName);
      if (jobModule?.trim()) params.set("job_module", jobModule.trim());
      return request(`/v1/ops/jobs/recent?${params.toString()}`, { method: "GET" }, "No se pudo consultar jobs recientes");
    };

    if (accountName) {
      try {
        const body = await fetchBody(true);
        return parseRows(body);
      } catch (error) {
        if (!(error instanceof HttpError) || ![400, 404, 422].includes(error.status)) {
          throw error;
        }
        const legacyBody = await fetchBody(false);
        return parseRows(legacyBody).filter((row) => (row.account_name ? row.account_name === accountName : true));
      }
    }

    const body = await fetchBody(false);
    return parseRows(body);
  },

  getRecentJobs: async (limit = 20): Promise<RecentJob[]> => {
    return ocrApi.listRecentJobs({ limit });
  },

  getJobQueueSnapshot: async ({ accountName, nextLimit = 10 }: { accountName?: string; nextLimit?: number } = {}): Promise<JobQueueSnapshot> => {
    const params = new URLSearchParams();
    if (accountName?.trim()) params.set("account_name", accountName.trim());
    params.set("next_limit", String(Math.min(100, Math.max(1, nextLimit))));
    const body = await request(`/v1/ops/jobs/queue?${params.toString()}`, { method: "GET" }, "No se pudo consultar observabilidad de cola");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const countsByStatusRaw =
      data.counts_by_status && typeof data.counts_by_status === "object" && !Array.isArray(data.counts_by_status)
        ? (data.counts_by_status as Record<string, unknown>)
        : {};
    const counts_by_status: Record<string, number> = {};
    for (const [key, value] of Object.entries(countsByStatusRaw)) counts_by_status[key] = Number(value ?? 0) || 0;
    const next_jobs = Array.isArray(data.next_jobs) ? data.next_jobs.map(normalizeQueueJobRow).filter((row) => row.job_id) : [];
    return {
      queue_mode: typeof data.queue_mode === "string" ? data.queue_mode : undefined,
      job_queue_enabled: typeof data.job_queue_enabled === "boolean" ? data.job_queue_enabled : undefined,
      poll_sec: typeof data.poll_sec === "number" ? data.poll_sec : Number(data.poll_sec ?? 0) || undefined,
      scope_account_name: typeof data.scope_account_name === "string" ? data.scope_account_name : null,
      counts_by_status,
      queued_count: typeof data.queued_count === "number" ? data.queued_count : Number(data.queued_count ?? 0) || 0,
      running_count: typeof data.running_count === "number" ? data.running_count : Number(data.running_count ?? 0) || 0,
      running_job: data.running_job ? normalizeQueueJobRow(data.running_job) : null,
      next_jobs,
      next_limit: typeof data.next_limit === "number" ? data.next_limit : Number(data.next_limit ?? 0) || undefined,
    };
  },

  getRecentUploads: async (accountName: string, limit = 20): Promise<RecentUpload[]> => {
    const body = await request(
      `/v1/ops/uploads/recent?account_name=${encodeURIComponent(accountName)}&limit=${limit}`,
      { method: "GET" },
      "No se pudo consultar uploads recientes",
    );
    if (Array.isArray(body)) return body as RecentUpload[];
    if (body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).uploads)) {
      return (body as { uploads: RecentUpload[] }).uploads;
    }
    return [];
  },

  listConfigs: async (accountName: string, name?: string): Promise<ConfigListResponse> => {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    try {
      const body = await request(
        `/v1/accounts/${encodeURIComponent(accountName)}/pipeline-configs${query}`,
        { method: "GET" },
        "No se pudo consultar configs",
      );
      const data = (body ?? {}) as Record<string, unknown>;
      return {
        account_name: typeof data.account_name === "string" ? data.account_name : accountName,
        configs: Array.isArray(data.configs) ? (data.configs as ConfigListResponse["configs"]) : [],
      };
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 405].includes(error.status)) throw error;
      const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/configs${query}`, { method: "GET" }, "No se pudo consultar configs");
      const data = (body ?? {}) as Record<string, unknown>;
      return {
        account_name: typeof data.account_name === "string" ? data.account_name : accountName,
        configs: Array.isArray(data.configs) ? (data.configs as ConfigListResponse["configs"]) : [],
      };
    }
  },

  getConfigs: async (accountName: string, name?: string): Promise<ConfigListResponse> => {
    return ocrApi.listConfigs(accountName, name);
  },

  getActiveConfig: async (accountName: string, name = "default"): Promise<ActiveConfigResponse> => {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/configs/active${query}`, { method: "GET" }, "No se pudo consultar config activa");
    return body as ActiveConfigResponse;
  },

  getAccountLlmRouting: async (accountName: string, configName = "default"): Promise<LLMRoutingReadResponse> => {
    const query = `?config_name=${encodeURIComponent(configName)}`;
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/llm-routing${query}`,
      { method: "GET" },
      "No se pudo consultar llm_routing",
    );
    return body as LLMRoutingReadResponse;
  },

  validateAccountLlmRouting: async (accountName: string, routing: LLMRoutingDraft): Promise<LLMRoutingValidateResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/llm-routing/validate`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ llm_routing: routing }) },
      "No se pudo validar llm_routing",
    );
    return body as LLMRoutingValidateResponse;
  },

  upsertConfig: async (accountName: string, payload: CreateAccountConfigRequest): Promise<ActiveConfigResponse> => {
    let validated: CreateAccountConfigRequest;
    try {
      validated = createAccountConfigSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Payload invalido en frontend: ${error.issues.map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`).join("; ")}`,
        );
      }
      throw error;
    }
    try {
      const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/pipeline-configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      }, "No se pudo crear/actualizar config");
      return body as ActiveConfigResponse;
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 405].includes(error.status)) throw error;
      const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      }, "No se pudo crear/actualizar config");
      return body as ActiveConfigResponse;
    }
  },

  createAccountConfig: async (accountName: string, payload: CreateAccountConfigRequest): Promise<ActiveConfigResponse> => {
    return ocrApi.upsertConfig(accountName, payload);
  },

  createOrUpdateConfig: async (accountName: string, payload: CreateAccountConfigRequest): Promise<ActiveConfigResponse> => {
    return ocrApi.upsertConfig(accountName, payload);
  },

  activateConfig: async (accountName: string, configId: string | number) => {
    try {
      return await request(
        `/v1/accounts/${encodeURIComponent(accountName)}/pipeline-configs/${encodeURIComponent(String(configId))}/activate`,
        { method: "POST" },
        "No se pudo activar config",
      );
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 405].includes(error.status)) throw error;
      return request(
        `/v1/accounts/${encodeURIComponent(accountName)}/configs/${encodeURIComponent(String(configId))}/activate`,
        { method: "POST" },
        "No se pudo activar config",
      );
    }
  },

  activateAccountConfig: async (accountName: string, configId: string | number) => {
    return ocrApi.activateConfig(accountName, configId);
  },

  updatePipelineConfig: async (accountName: string, config: PipelineConfig): Promise<ActiveConfigResponse> => {
    // Obtener config actual para usar su versión
    const currentConfig = await ocrApi.getActiveConfig(accountName);
    let nextVersion = "next"; // Default: let backend auto-increment

    // Si existe versión actual, intentar incrementarla
    if (currentConfig?.config && typeof currentConfig.config === "object") {
      const rawConfig = currentConfig.config as Record<string, unknown>;
      const version = rawConfig.version;

      // Intentar parsear versión actual y incrementar
      if (typeof version === "number") {
        nextVersion = String(version + 1);
      } else if (typeof version === "string") {
        // Si es "vX", extraer número y incrementar
        const match = version.match(/^v(\d+)$/);
        if (match) {
          nextVersion = `v${parseInt(match[1], 10) + 1}`;
        } else if (!isNaN(Number(version))) {
          // Si es un string numérico, incrementar
          nextVersion = String(Number(version) + 1);
        } else {
          // Fallback a "next" para auto-incrementar
          nextVersion = "next";
        }
      }
    }

    const payload: CreateAccountConfigRequest = {
      name: "default",
      version: nextVersion,
      is_active: true,
      config: config as Record<string, unknown>,
    };
    return ocrApi.upsertConfig(accountName, payload);
  },

  getRagEffectiveness: async (
    accountName: string,
    params?: { period_days?: number },
  ): Promise<{ account_name: string; period_days: number; rules: unknown[] }> => {
    const query = new URLSearchParams();
    if (typeof params?.period_days === "number") query.set("period_days", String(params.period_days));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/quality/rag-effectiveness${query.toString() ? `?${query.toString()}` : ""}`,
      { method: "GET" },
      "No se pudo consultar efectividad de RAG",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      period_days: Number(data.period_days ?? 30) || 30,
      rules: Array.isArray(data.rules) ? data.rules : [],
    };
  },

  listAliases: async (accountName: string, scope = "product"): Promise<AliasListResponse> => {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/aliases${query}`, { method: "GET" }, "No se pudo consultar aliases");
    const data = (body ?? {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      aliases: Array.isArray(data.aliases) ? data.aliases.map(normalizeAliasRow) : [],
    };
  },

  listChains: async (
    accountName: string,
    options?: { includeInactive?: boolean; includeAliases?: boolean; seedIfEmpty?: boolean },
  ): Promise<ChainsListResponse> => {
    const query = new URLSearchParams();
    if (options?.includeInactive !== undefined) query.set("include_inactive", String(options.includeInactive));
    if (options?.includeAliases !== undefined) query.set("include_aliases", String(options.includeAliases));
    if (options?.seedIfEmpty !== undefined) query.set("seed_if_empty", String(options.seedIfEmpty));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains${suffix}`,
      { method: "GET" },
      "No se pudo consultar catálogo de cadenas",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      chains: Array.isArray(data.chains) ? data.chains.map(normalizeChainCatalogItem).filter((c) => c.chain_code.length > 0) : [],
    };
  },

  createChain: async (accountName: string, payload: ChainUpsertRequest): Promise<ChainCatalogItem> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear cadena",
    );
    return normalizeChainCatalogItem(body);
  },

  updateChain: async (accountName: string, chainId: number, payload: ChainUpsertRequest): Promise<ChainCatalogItem> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo actualizar cadena",
    );
    return normalizeChainCatalogItem(body);
  },

  listChainAliases: async (accountName: string, chainId: number, includeInactive = false): Promise<ChainAlias[]> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}/aliases?include_inactive=${String(includeInactive)}`,
      { method: "GET" },
      "No se pudo consultar aliases de cadena",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.aliases) ? data.aliases : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map(normalizeChainAlias).filter((a) => a.alias_text.length > 0);
  },

  upsertChainAlias: async (accountName: string, chainId: number, payload: ChainAliasUpsertRequest): Promise<ChainAlias> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}/aliases`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo guardar alias de cadena",
    );
    return normalizeChainAlias(body);
  },

  deleteChainAlias: async (accountName: string, chainId: number, aliasId: number): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}/aliases/${encodeURIComponent(String(aliasId))}`,
      { method: "DELETE" },
      "No se pudo eliminar alias de cadena",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  listChainIgnoredPhrases: async (accountName: string, chainId: number, scope = "product"): Promise<ChainIgnoredPhrase[]> => {
    const suffix = scope ? `?scope=${encodeURIComponent(scope)}` : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}/ignored-phrases${suffix}`,
      { method: "GET" },
      "No se pudo consultar frases ignoradas de cadena",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.ignored_phrases) ? data.ignored_phrases : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map(normalizeChainIgnoredPhrase).filter((item) => item.phrase.length > 0);
  },

  upsertChainIgnoredPhrase: async (
    accountName: string,
    chainId: number,
    payload: ChainIgnoredPhraseUpsertRequest,
  ): Promise<ChainIgnoredPhrase> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}/ignored-phrases`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo guardar frase ignorada de cadena",
    );
    return normalizeChainIgnoredPhrase(body);
  },

  deleteChainIgnoredPhrase: async (accountName: string, chainId: number, ignoredId: number): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}/ignored-phrases/${encodeURIComponent(String(ignoredId))}`,
      { method: "DELETE" },
      "No se pudo eliminar frase ignorada de cadena",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  listAccountPrompts: async (accountName: string, slot: "ocr" | "vision" | string): Promise<AccountPromptListResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/prompts?slot=${encodeURIComponent(slot)}`,
      { method: "GET" },
      "No se pudo consultar prompts por slot",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.prompts)
      ? data.prompts
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(body)
          ? (body as unknown[])
          : [];
    const prompts: AccountPromptFileItem[] = rows
      .map((row) => {
        const x = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        const promptFile =
          typeof x.prompt_file === "string"
            ? x.prompt_file
            : typeof x.filename === "string"
              ? x.filename
              : typeof x.name === "string"
                ? x.name
                : "";
        return {
          prompt_file: promptFile,
          slot: typeof x.slot === "string" ? x.slot : slot,
          updated_at: typeof x.updated_at === "string" ? x.updated_at : undefined,
          created_at: typeof x.created_at === "string" ? x.created_at : undefined,
          exists: typeof x.exists === "boolean" ? x.exists : true,
        };
      })
      .filter((item) => item.prompt_file.trim().length > 0);
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      slot,
      prompts,
    };
  },

  getAccountPrompt: async (accountName: string, promptFile: string): Promise<AccountPromptReadResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/prompts/${encodeURIComponent(promptFile)}`,
      { method: "GET" },
      "No se pudo leer prompt",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      prompt_file: typeof data.prompt_file === "string" ? data.prompt_file : promptFile,
      content: typeof data.content === "string" ? data.content : typeof data.text === "string" ? data.text : "",
      slot: typeof data.slot === "string" ? data.slot : undefined,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : undefined,
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
    };
  },

  updateAccountPrompt: async (
    accountName: string,
    promptFile: string,
    payload: { content: string; slot?: "ocr" | "vision" | string },
  ): Promise<AccountPromptReadResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/prompts/${encodeURIComponent(promptFile)}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo guardar prompt",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      prompt_file: typeof data.prompt_file === "string" ? data.prompt_file : promptFile,
      content: typeof data.content === "string" ? data.content : payload.content,
      slot: typeof data.slot === "string" ? data.slot : payload.slot,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : undefined,
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
    };
  },

  ensureChainPrompt: async (
    accountName: string,
    chainId: number,
    payload: { slot: "ocr" | "vision" | string; base_prompt_file: string; target_prompt_file: string; overwrite?: boolean },
  ): Promise<AccountPromptEnsureResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(String(chainId))}/prompts/ensure`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear prompt por cadena",
    );
    return (body && typeof body === "object" ? body : {}) as AccountPromptEnsureResponse;
  },

  bootstrapChainPrompts: async (
    accountName: string,
    payload: AccountPromptsBootstrapRequest,
  ): Promise<AccountPromptsBootstrapResponse> => {
    const query = payload.dry_run ? "?dry_run=true" : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/prompts/bootstrap${query}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo ejecutar el bootstrap de prompts por cadena",
    );
    return (body && typeof body === "object" ? body : {}) as AccountPromptsBootstrapResponse;
  },

  resolveChainPreview: async (accountName: string, text: string): Promise<ChainResolvePreviewResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/chains/resolve-preview`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) },
      "No se pudo probar resolución de cadena",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const matchRaw = data.match && typeof data.match === "object" ? (data.match as Record<string, unknown>) : null;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      resolved: Boolean(data.resolved),
      match: matchRaw
        ? {
            chain_code: typeof matchRaw.chain_code === "string" ? matchRaw.chain_code : undefined,
            display_name: typeof matchRaw.display_name === "string" ? matchRaw.display_name : undefined,
            matched_alias: typeof matchRaw.matched_alias === "string" ? matchRaw.matched_alias : undefined,
            resolution_source: typeof matchRaw.resolution_source === "string" ? matchRaw.resolution_source : undefined,
          }
        : null,
    };
  },

  upsertAlias: async (accountName: string, payload: SemanticAliasRequest): Promise<AliasRow> => {
    const bodyPayload: SemanticAliasRequest = {
      alias: payload.alias.trim(),
      canonical: payload.canonical.trim(),
      scope: payload.scope?.trim() || "product",
      is_active: payload.is_active ?? true,
      target_keywords: normalizeStringArray(payload.target_keywords),
      chain_whitelist: normalizeStringArray(payload.chain_whitelist),
    };
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    }, "No se pudo guardar alias");
    return normalizeAliasRow(body);
  },

  listSemanticKnowledge: async (
    accountName: string,
    params?: { entryType?: string; chain?: string; category?: string; activeOnly?: boolean; status?: string; rolloutMode?: "apply" | "shadow" },
  ): Promise<SemanticKnowledgeListResponse> => {
    const query = new URLSearchParams();
    if (params?.entryType?.trim()) query.set("entry_type", params.entryType.trim());
    if (params?.chain?.trim()) query.set("chain", params.chain.trim());
    if (params?.category?.trim()) query.set("category", params.category.trim());
    if (params?.activeOnly) query.set("active_only", "true");
    if (params?.status?.trim()) query.set("status", params.status.trim());
    if (params?.rolloutMode) query.set("rollout_mode", params.rolloutMode);
    const qs = query.toString();
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      "No se pudo consultar conocimiento semántico",
    );
    const data = (body ?? {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      items: Array.isArray(data.items) ? data.items.map(normalizeSemanticKnowledgeRow) : [],
    };
  },

  upsertSemanticKnowledge: async (
    accountName: string,
    payload: SemanticKnowledgeUpsertRequest,
  ): Promise<{ status: string; account_name: string; id: number; duplicate_check?: SemanticDuplicateCheckResponse }> => {
    const parsedId = Number(payload.id);
    const ownerClean = payload.owner?.trim();
    const createdFromCaseClean = payload.created_from_case?.trim();
    const bodyPayload: SemanticKnowledgeUpsertRequest = {
      ...(Number.isFinite(parsedId) && parsedId > 0 ? { id: parsedId } : {}),
      title: payload.title.trim(),
      content: payload.content.trim(),
      entry_type: payload.entry_type.trim() || "note",
      chain: payload.chain?.trim() ? payload.chain.trim() : null,
      category: payload.category?.trim() ? payload.category.trim() : null,
      tags: normalizeStringArray(payload.tags),
      priority: Number.isFinite(Number(payload.priority ?? 0)) ? Number(payload.priority ?? 0) : 0,
      is_active: payload.is_active ?? true,
      status: payload.status?.trim() ? payload.status.trim() : undefined,
      ...(ownerClean ? { owner: ownerClean } : {}),
      confidence_target: Number.isFinite(Number(payload.confidence_target)) ? Number(payload.confidence_target) : 0.8,
      ...(createdFromCaseClean ? { created_from_case: createdFromCaseClean } : {}),
      negative_examples: normalizeStringArray(payload.negative_examples),
      rollout_scope: payload.rollout_scope && typeof payload.rollout_scope === "object" ? payload.rollout_scope : {},
      success_metrics: payload.success_metrics && typeof payload.success_metrics === "object" ? payload.success_metrics : {},
      rule_version: Number.isFinite(Number(payload.rule_version)) ? Number(payload.rule_version) : 1,
    };
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    }, "No se pudo guardar conocimiento semántico");
    const data = (body ?? {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      id: typeof data.id === "number" ? data.id : Number(data.id ?? -1),
      duplicate_check:
        data.duplicate_check && typeof data.duplicate_check === "object"
          ? (data.duplicate_check as SemanticDuplicateCheckResponse)
          : undefined,
    };
  },

  checkSemanticKnowledgeDuplicates: async (
    accountName: string,
    payload: SemanticKnowledgeUpsertRequest,
  ): Promise<SemanticDuplicateCheckResponse> => {
    const parsedId = Number(payload.id);
    const ownerClean = payload.owner?.trim();
    const createdFromCaseClean = payload.created_from_case?.trim();
    const bodyPayload: SemanticKnowledgeUpsertRequest = {
      ...(Number.isFinite(parsedId) && parsedId > 0 ? { id: parsedId } : {}),
      title: payload.title.trim(),
      content: payload.content.trim(),
      entry_type: payload.entry_type.trim() || "note",
      chain: payload.chain?.trim() ? payload.chain.trim() : null,
      category: payload.category?.trim() ? payload.category.trim() : null,
      tags: normalizeStringArray(payload.tags),
      priority: Number.isFinite(Number(payload.priority ?? 0)) ? Number(payload.priority ?? 0) : 0,
      is_active: payload.is_active ?? true,
      status: payload.status?.trim() ? payload.status.trim() : undefined,
      ...(ownerClean ? { owner: ownerClean } : {}),
      confidence_target: Number.isFinite(Number(payload.confidence_target)) ? Number(payload.confidence_target) : 0.8,
      ...(createdFromCaseClean ? { created_from_case: createdFromCaseClean } : {}),
      negative_examples: normalizeStringArray(payload.negative_examples),
      rollout_scope: payload.rollout_scope && typeof payload.rollout_scope === "object" ? payload.rollout_scope : {},
      success_metrics: payload.success_metrics && typeof payload.success_metrics === "object" ? payload.success_metrics : {},
      rule_version: Number.isFinite(Number(payload.rule_version)) ? Number(payload.rule_version) : 1,
    };
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge/duplicate-check`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyPayload) },
      "No se pudo verificar duplicados semánticos",
    );
    return (body && typeof body === "object" ? body : {}) as SemanticDuplicateCheckResponse;
  },

  searchSemanticKnowledge: async (
    accountName: string,
    params: { q: string; chain?: string; category?: string; limit?: number; rolloutMode?: "apply" | "shadow" },
  ): Promise<SemanticKnowledgeSearchResponse> => {
    const query = new URLSearchParams();
    query.set("q", params.q);
    if (params.chain?.trim()) query.set("chain", params.chain.trim());
    if (params.category?.trim()) query.set("category", params.category.trim());
    if (typeof params.limit === "number" && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
    if (params.rolloutMode) query.set("rollout_mode", params.rolloutMode);
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge/search?${query.toString()}`,
      { method: "GET" },
      "No se pudo buscar conocimiento semántico",
    );
    const data = (body ?? {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      query: typeof data.query === "string" ? data.query : params.q,
      items: Array.isArray(data.items) ? data.items.map(normalizeSemanticKnowledgeRow) : [],
    };
  },

  testSemanticKnowledge: async (accountName: string, payload: SemanticKnowledgeTestRequest): Promise<SemanticKnowledgeTestResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge/test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "No se pudo probar semántica con LLM",
      120000,
    );
    return body as SemanticKnowledgeTestResponse;
  },

  suggestSemanticRuleContent: async (
    accountName: string,
    payload: SemanticRuleTextSuggestionRequest,
  ): Promise<SemanticRuleTextSuggestionResponse> => {
    const idea = payload.idea_text.trim();
    const ocr = payload.ocr_text.trim();
    const current = payload.current_rule_content?.trim() ?? "";
    if (!idea) throw new HttpError(400, "idea_text es obligatorio");
    if (!ocr) throw new HttpError(400, "ocr_text es obligatorio");

    const intentBlock = [
      "INTENCION HUMANA DE REGLA:",
      idea,
      "",
      "REQUISITO DE SEGURIDAD:",
      "La regla debe aplicar SOLO al caso observado en OCR y NO sobre-generalizar.",
      "Debe quedar en formato claro para LLM (condicion + transformacion + no aplicar).",
      "",
      "CONTENIDO ACTUAL (si existe):",
      current || "(vacío)",
    ].join("\n");

    const test = await ocrApi.testSemanticKnowledge(accountName, {
      text: ocr.slice(0, 12000),
      mode: "ocr",
      chain: payload.chain,
      category: payload.category,
      model: payload.model,
      knowledge: {
        title: "Sugerencia IA de regla",
        content: intentBlock,
        entry_type: "abbreviation_rule",
        chain: payload.chain ?? null,
        category: payload.category ?? null,
        tags: ["SUGGESTION", "HITL"],
        priority: 7,
        is_active: false,
      },
    });

    const suggested = test.result?.suggested_knowledge_improvement?.trim();
    const explanation = test.result?.explanation?.trim() || "Sugerencia generada con contexto OCR y objetivo humano.";
    const corrections = test.result?.possible_corrections ?? [];

    const fallbackContent = [
      `Objetivo: ${idea}`,
      "Aplicar solo cuando el OCR del recorte contenga evidencia textual consistente con este objetivo.",
      "No aplicar si el contexto corresponde a otro producto, otra categoría o texto promocional mezclado.",
      "Transformación propuesta: (completar con token origen -> token destino).",
    ].join("\n");

    return {
      status: "ok",
      improved_content: suggested || fallbackContent,
      rationale: explanation,
      llm_understood: Boolean(test.result?.understood),
      llm_applies: Boolean(test.result?.applies),
      possible_corrections: corrections,
      suggested_knowledge_improvement: suggested || undefined,
    };
  },

  previewSemanticOcr: async (accountName: string, payload: SemanticPreviewOcrRequest): Promise<SemanticPreviewOcrResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge/preview-ocr`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, dry_run: payload.dry_run ?? true }),
      },
      "No se pudo ejecutar preview OCR",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as SemanticPreviewOcrResponse;
  },

  previewSemanticPipeline: async (accountName: string, payload: SemanticPreviewPipelineRequest): Promise<SemanticPreviewPipelineResponse> => {
    const requestBody = {
      ...payload,
      account_name: payload.account_name ?? accountName,
      config_name: payload.config_name ?? "default",
      dry_run: payload.dry_run ?? true,
      persist_artifacts: payload.persist_artifacts ?? false,
    };
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge/preview-pipeline`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
      "No se pudo ejecutar preview pipeline",
      240000,
    );
    return (body && typeof body === "object" ? body : {}) as SemanticPreviewPipelineResponse;
  },

  createSemanticLearningCase: async (
    accountName: string,
    payload: {
      review_id?: string;
      image_id?: number;
      chain?: string | null;
      category?: string | null;
      risk_type?: string | null;
      status?: string;
      payload?: Record<string, unknown>;
      created_by?: string;
    },
  ): Promise<{ status: string; case_id: number }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/cases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "No se pudo crear caso de curaduría",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return { status: typeof data.status === "string" ? data.status : "ok", case_id: Number(data.case_id ?? 0) || 0 };
  },

  listSemanticLearningCases: async (
    accountName: string,
    params?: { status?: string; risk_type?: string; chain?: string; limit?: number },
  ): Promise<SemanticLearningCasesResponse> => {
    const query = new URLSearchParams();
    if (params?.status?.trim()) query.set("status", params.status.trim());
    if (params?.risk_type?.trim()) query.set("risk_type", params.risk_type.trim());
    if (params?.chain?.trim()) query.set("chain", params.chain.trim());
    if (typeof params?.limit === "number" && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/cases${query.toString() ? `?${query.toString()}` : ""}`,
      { method: "GET" },
      "No se pudo listar casos de curaduría",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      total: Number(data.total ?? 0) || 0,
      items: Array.isArray(data.items)
        ? data.items.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return {
              id: Number(row.id ?? 0) || 0,
              review_id: typeof row.review_id === "string" ? row.review_id : undefined,
              image_id: Number.isFinite(Number(row.image_id)) ? Number(row.image_id) : undefined,
              chain: typeof row.chain === "string" ? row.chain : null,
              category: typeof row.category === "string" ? row.category : null,
              risk_type: typeof row.risk_type === "string" ? row.risk_type : null,
              status: typeof row.status === "string" ? row.status : null,
              payload: row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : null,
              created_by: typeof row.created_by === "string" ? row.created_by : null,
              created_at: typeof row.created_at === "string" ? row.created_at : undefined,
              updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
            } satisfies SemanticLearningCase;
          })
        : [],
    };
  },

  setSemanticLearningCaseStatus: async (
    accountName: string,
    caseId: number,
    status: "open" | "in_review" | "resolved" | "rejected" | string,
  ): Promise<{ status: string; case_id: number; new_status: string }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/cases/${encodeURIComponent(String(caseId))}/status`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) },
      "No se pudo actualizar estado del caso",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      case_id: Number(data.case_id ?? caseId) || caseId,
      new_status: typeof data.new_status === "string" ? data.new_status : status,
    };
  },

  runSemanticLearningTrialOcr: async (
    accountName: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: string; trial_id?: number; result?: Record<string, unknown> }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/trials/ocr`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo ejecutar trial OCR",
      120000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return { status: typeof data.status === "string" ? data.status : "ok", trial_id: Number(data.trial_id ?? 0) || undefined, result: data.result && typeof data.result === "object" ? (data.result as Record<string, unknown>) : undefined };
  },

  runSemanticLearningTrialPipeline: async (
    accountName: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: string; trial_id?: number; result?: Record<string, unknown> }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/trials/pipeline`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo ejecutar trial pipeline",
      240000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return { status: typeof data.status === "string" ? data.status : "ok", trial_id: Number(data.trial_id ?? 0) || undefined, result: data.result && typeof data.result === "object" ? (data.result as Record<string, unknown>) : undefined };
  },

  getSemanticPreviewInsight: async (
    accountName: string,
    payload: {
      preview_json: Record<string, unknown>;
      focus?: "all" | "name" | "barcode" | "dedupe";
      use_llm?: boolean;
      model?: string | null;
    },
  ): Promise<SemanticPreviewInsightResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/preview-insight`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview_json: payload.preview_json,
          focus: payload.focus ?? "all",
          use_llm: payload.use_llm ?? true,
          model: payload.model ?? null,
        }),
      },
      "No se pudo generar Insight AI",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as SemanticPreviewInsightResponse;
  },

  getSemanticRuleDraftAssist: async (
    accountName: string,
    payload: {
      idea_text: string;
      chain?: string | null;
      category?: string | null;
      target_product_name?: string | null;
      ocr_text?: string | null;
      preview_json?: Record<string, unknown> | null;
      model?: string | null;
    },
  ): Promise<SemanticRuleDraftAssistResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/rule-draft-assist`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_text: payload.idea_text,
          chain: payload.chain ?? null,
          category: payload.category ?? null,
          target_product_name: payload.target_product_name ?? null,
          ocr_text: payload.ocr_text ?? null,
          preview_json: payload.preview_json ?? null,
          model: payload.model ?? null,
        }),
      },
      "No se pudo generar sugerencia de regla",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as SemanticRuleDraftAssistResponse;
  },

  runSemanticRegressionSmoke: async (
    accountName: string,
    payload?: { include_legacy_check?: boolean },
  ): Promise<SemanticRegressionSmokeResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-learning/regression/smoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          include_legacy_check: payload?.include_legacy_check ?? true,
        }),
      },
      "No se pudo ejecutar validación semántica",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as SemanticRegressionSmokeResponse;
  },

  getSemanticKnowledgeMetrics: async (
    accountName: string,
    params?: { createdFrom?: string; createdTo?: string; limitJobs?: number },
  ): Promise<SemanticKnowledgeMetricsResponse> => {
    const query = new URLSearchParams();
    if (params?.createdFrom?.trim()) query.set("created_from", params.createdFrom.trim());
    if (params?.createdTo?.trim()) query.set("created_to", params.createdTo.trim());
    if (typeof params?.limitJobs === "number" && Number.isFinite(params.limitJobs)) query.set("limit_jobs", String(params.limitJobs));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-knowledge/metrics${query.toString() ? `?${query.toString()}` : ""}`,
      { method: "GET" },
      "No se pudo consultar métricas semánticas",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      window: data.window && typeof data.window === "object"
        ? {
            created_from: typeof (data.window as Record<string, unknown>).created_from === "string" ? ((data.window as Record<string, unknown>).created_from as string) : null,
            created_to: typeof (data.window as Record<string, unknown>).created_to === "string" ? ((data.window as Record<string, unknown>).created_to as string) : null,
          }
        : undefined,
      summary: data.summary && typeof data.summary === "object"
        ? {
            total_products: Number((data.summary as Record<string, unknown>).total_products ?? 0) || 0,
            rules_observed: Number((data.summary as Record<string, unknown>).rules_observed ?? 0) || 0,
            chains_observed: Number((data.summary as Record<string, unknown>).chains_observed ?? 0) || 0,
          }
        : undefined,
      rules: Array.isArray(data.rules)
        ? data.rules.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return {
              rule: typeof row.rule === "string" ? row.rule : "-",
              considered: Number(row.considered ?? 0) || 0,
              applied: Number(row.applied ?? 0) || 0,
              blocked: Number(row.blocked ?? 0) || 0,
              precision_est: Number(row.precision_est ?? 0) || 0,
            };
          })
        : [],
      chains: Array.isArray(data.chains)
        ? data.chains.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return {
              chain: typeof row.chain === "string" ? row.chain : "-",
              rows: Number(row.rows ?? 0) || 0,
              needs_review_rate: Number(row.needs_review_rate ?? 0) || 0,
            };
          })
        : [],
    };
  },

  queryAnalyticsResults: async (payload: AnalyticsResultsQueryRequest): Promise<AnalyticsResultsQueryResponse> => {
    const body = await request(
      `/v1/analytics/results/query`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo consultar analytics de resultados",
    );
    return body as AnalyticsResultsQueryResponse;
  },

  getAnalyticsFacets: async (payload: AnalyticsResultsQueryRequest): Promise<AnalyticsResultsFacetsResponse> => {
    const body = await request(
      `/v1/analytics/results/facets`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudieron consultar facets",
    );
    return body as AnalyticsResultsFacetsResponse;
  },

  exportAnalyticsResults: async (payload: AnalyticsExportRequest): Promise<AnalyticsExportResponse> => {
    const body = await request(
      `/v1/analytics/results/export`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo exportar analytics a Excel",
    );
    const data = body as AnalyticsExportResponse;
    return {
      ...data,
      excel_url: resolveBackendUrl(data.excel_url ?? null),
    };
  },

  getObservabilitySummary: async (payload: ObservabilitySummaryRequest): Promise<ObservabilitySummaryResponse> => {
    const body = await request(
      `/v1/ops/observability/summary`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo consultar observabilidad operativa",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      summary: {
        total_rows: Number((data.summary as Record<string, unknown> | undefined)?.total_rows ?? 0) || 0,
        needs_review_rate: Number((data.summary as Record<string, unknown> | undefined)?.needs_review_rate ?? 0) || 0,
        invention_rate_proxy: Number((data.summary as Record<string, unknown> | undefined)?.invention_rate_proxy ?? 0) || 0,
        llm_ok_rate: Number((data.summary as Record<string, unknown> | undefined)?.llm_ok_rate ?? 0) || 0,
        llm_fallback_rate: Number((data.summary as Record<string, unknown> | undefined)?.llm_fallback_rate ?? 0) || 0,
      },
      latency_by_step: Array.isArray(data.latency_by_step)
        ? data.latency_by_step.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return {
              step: typeof row.step === "string" ? row.step : "unknown",
              count: Number(row.count ?? 0) || 0,
              avg_ms: Number(row.avg_ms ?? 0) || 0,
              p95_ms: Number(row.p95_ms ?? 0) || 0,
              p99_ms: Number(row.p99_ms ?? 0) || 0,
            };
          })
        : [],
      top_discard_reasons: Array.isArray(data.top_discard_reasons)
        ? data.top_discard_reasons.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return { reason: typeof row.reason === "string" ? row.reason : "-", count: Number(row.count ?? 0) || 0 };
          })
        : [],
      top_rag_applied_rules: Array.isArray(data.top_rag_applied_rules)
        ? data.top_rag_applied_rules.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return { rule: typeof row.rule === "string" ? row.rule : "-", count: Number(row.count ?? 0) || 0 };
          })
        : [],
      top_rag_blocked_rules: Array.isArray(data.top_rag_blocked_rules)
        ? data.top_rag_blocked_rules.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return { rule: typeof row.rule === "string" ? row.rule : "-", count: Number(row.count ?? 0) || 0 };
          })
        : [],
      drift_chain_category: Array.isArray(data.drift_chain_category)
        ? data.drift_chain_category.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return {
              chain_category: typeof row.chain_category === "string" ? row.chain_category : "-",
              rows: Number(row.rows ?? 0) || 0,
              needs_review_rate: Number(row.needs_review_rate ?? 0) || 0,
            };
          })
        : [],
      alerts: Array.isArray(data.alerts)
        ? data.alerts.map((x) => {
            const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
            return {
              level: typeof row.level === "string" ? row.level : "info",
              code: typeof row.code === "string" ? row.code : "unknown",
              message: typeof row.message === "string" ? row.message : "Sin detalle",
            };
          })
        : [],
      scope: data.scope && typeof data.scope === "object" ? (data.scope as Record<string, unknown>) : {},
    };
  },

  runOfflineBenchmark: async (payload: BenchmarkRunRequest): Promise<BenchmarkRunResponse> => {
    const body = await request(
      `/v1/ops/benchmark/run`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo ejecutar benchmark offline",
      120000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const metrics = (data.metrics && typeof data.metrics === "object" ? data.metrics : {}) as Record<string, unknown>;
    const misses = Array.isArray(metrics.misses) ? metrics.misses : [];
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      scope: data.scope && typeof data.scope === "object" ? (data.scope as Record<string, unknown>) : {},
      metrics: {
        checked: Number(metrics.checked ?? 0) || 0,
        exactitud_nombre: Number(metrics.exactitud_nombre ?? 0) || 0,
        exactitud_promo_precio: Number(metrics.exactitud_promo_precio ?? 0) || 0,
        recall_productos_validos: Number(metrics.recall_productos_validos ?? 0) || 0,
        tasa_invento_proxy: Number(metrics.tasa_invento_proxy ?? 0) || 0,
        tasa_needs_review: Number(metrics.tasa_needs_review ?? 0) || 0,
        misses: misses.map((x) => {
          const row = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
          return {
            key: typeof row.key === "string" ? row.key : "-",
            reason: typeof row.reason === "string" ? row.reason : "-",
          };
        }),
      },
    };
  },

  createBenchmarkJob: async (payload: BenchmarkCreateRequest): Promise<BenchmarkCreateResponse> => {
    const body = await request(
      `/v1/benchmark/jobs`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear benchmark batch",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      benchmark_id: typeof data.benchmark_id === "string" ? data.benchmark_id : "",
      job_id: typeof data.job_id === "string" ? data.job_id : "",
      status: typeof data.status === "string" ? data.status : "unknown",
      account_name: typeof data.account_name === "string" ? data.account_name : payload.account_name,
      mode: typeof data.mode === "string" ? data.mode : payload.mode,
      golden_path: typeof data.golden_path === "string" ? data.golden_path : null,
      total_images: Number(data.total_images ?? 0) || 0,
    };
  },

  listBenchmarkJobs: async (accountName: string, limit = 20): Promise<BenchmarkRunRow[]> => {
    const q = new URLSearchParams();
    q.set("account_name", accountName);
    q.set("limit", String(limit));
    const body = await request(`/v1/benchmark/jobs?${q.toString()}`, { method: "GET" }, "No se pudo listar benchmarks");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
        ? ((body as Record<string, unknown>).items as unknown[])
        : [];
    return rows.map((x) => {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        benchmark_id: typeof r.benchmark_id === "string" ? r.benchmark_id : "",
        job_id: typeof r.job_id === "string" ? r.job_id : "",
        account_name: typeof r.account_name === "string" ? r.account_name : accountName,
        mode: typeof r.mode === "string" ? r.mode : "performance_only",
        status: typeof r.status === "string" ? r.status : "unknown",
        golden_path: typeof r.golden_path === "string" ? r.golden_path : null,
        total_images: Number(r.total_images ?? 0) || 0,
        created_at: typeof r.created_at === "string" ? r.created_at : undefined,
        updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
      };
    });
  },

  getBenchmarkJob: async (benchmarkId: string): Promise<BenchmarkRunRow> => {
    const body = await request(`/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}`, { method: "GET" }, "No se pudo consultar benchmark");
    const r = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      benchmark_id: typeof r.benchmark_id === "string" ? r.benchmark_id : benchmarkId,
      job_id: typeof r.job_id === "string" ? r.job_id : "",
      account_name: typeof r.account_name === "string" ? r.account_name : "",
      mode: typeof r.mode === "string" ? r.mode : "performance_only",
      status: typeof r.status === "string" ? r.status : "unknown",
      golden_path: typeof r.golden_path === "string" ? r.golden_path : null,
      total_images: Number(r.total_images ?? 0) || 0,
      created_at: typeof r.created_at === "string" ? r.created_at : undefined,
      updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
    };
  },

  getBenchmarkEvents: async (benchmarkId: string): Promise<JobEventsResponse> => {
    const body = await request(`/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/events`, { method: "GET" }, "No se pudo consultar eventos benchmark");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).events)
        ? ((body as Record<string, unknown>).events as unknown[])
        : [];
    return rows.map(normalizeJobEvent).sort((a, b) => a.id - b.id);
  },

  getBenchmarkMetrics: async (benchmarkId: string): Promise<JobMetricsResponse> => {
    const body = await request(`/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/metrics`, { method: "GET" }, "No se pudo consultar métricas benchmark");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const metricsRaw = Array.isArray(data.metrics) ? data.metrics : [];
    const dedupe = new Map<number, JobMetric>();
    for (const item of metricsRaw.map(normalizeJobMetric)) {
      if (item.id < 0) continue;
      dedupe.set(item.id, item);
    }
    const summarySource =
      data.summary_by_step && typeof data.summary_by_step === "object" && !Array.isArray(data.summary_by_step)
        ? (data.summary_by_step as Record<string, unknown>)
        : {};
    const summary: JobMetricsResponse["summary_by_step"] = {};
    for (const [step, value] of Object.entries(summarySource)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      summary[step] = {
        count: Number(row.count ?? 0) || 0,
        total_ms: Number(row.total_ms ?? 0) || 0,
        avg_ms: Number(row.avg_ms ?? 0) || 0,
        max_ms: Number(row.max_ms ?? 0) || 0,
      };
    }
    return { job_id: typeof data.job_id === "string" ? data.job_id : benchmarkId, metrics: Array.from(dedupe.values()).sort((a, b) => a.id - b.id), summary_by_step: summary };
  },

  getBenchmarkResults: async (benchmarkId: string): Promise<JobResultsResponse> => {
    const body = await request(`/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/results`, { method: "GET" }, "No se pudo consultar resultados benchmark");
    const data = (body ?? {}) as Record<string, unknown>;
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : benchmarkId,
      summary: typeof data.summary === "object" && data.summary ? (data.summary as Record<string, unknown>) : undefined,
      products: Array.isArray(data.products) ? (data.products as Record<string, unknown>[]) : undefined,
      extracted_products: Array.isArray(data.extracted_products) ? (data.extracted_products as Record<string, unknown>[]) : undefined,
      raw_result_json: data.raw_result_json && typeof data.raw_result_json === "object" ? (data.raw_result_json as Record<string, unknown>) : undefined,
      master_json_path: typeof data.master_json_path === "string" ? data.master_json_path : null,
      master_html_path: typeof data.master_html_path === "string" ? data.master_html_path : null,
      master_md_path: typeof data.master_md_path === "string" ? data.master_md_path : null,
      excel_path: typeof data.excel_path === "string" ? data.excel_path : null,
      master_json_url: resolveBackendUrl(typeof data.master_json_url === "string" ? data.master_json_url : null),
      master_html_url: resolveBackendUrl(typeof data.master_html_url === "string" ? data.master_html_url : null),
      master_md_url: resolveBackendUrl(typeof data.master_md_url === "string" ? data.master_md_url : null),
      excel_url: resolveBackendUrl(typeof data.excel_url === "string" ? data.excel_url : null),
      images: Array.isArray(data.images) ? data.images.map(normImage) : [],
    };
  },

  getBenchmarkAnalytics: async (benchmarkId: string): Promise<ObservabilitySummaryResponse> => {
    const body = await request(`/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/analytics`, { method: "GET" }, "No se pudo consultar analytics benchmark");
    return (body ?? {}) as ObservabilitySummaryResponse;
  },

  getBenchmarkReport: async (benchmarkId: string): Promise<BenchmarkReportResponse> => {
    const body = await request(`/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/report`, { method: "GET" }, "No se pudo consultar reporte benchmark");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const artifacts = (data.artifacts && typeof data.artifacts === "object" ? data.artifacts : {}) as Record<string, unknown>;
    return {
      ...data,
      artifacts: {
        master_json_url: resolveBackendUrl(typeof artifacts.master_json_url === "string" ? artifacts.master_json_url : null),
        master_html_url: resolveBackendUrl(typeof artifacts.master_html_url === "string" ? artifacts.master_html_url : null),
        excel_url: resolveBackendUrl(typeof artifacts.excel_url === "string" ? artifacts.excel_url : null),
      },
    };
  },

  listAccountBenchmarkJobs: async (accountName: string, limit = 50): Promise<BenchmarkRunRow[]> => {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/benchmark/jobs?${q.toString()}`, { method: "GET" }, "No se pudo listar historial benchmark");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
        ? ((body as Record<string, unknown>).items as unknown[])
        : [];
    return rows.map((x) => {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        benchmark_id: typeof r.benchmark_id === "string" ? r.benchmark_id : "",
        job_id: typeof r.job_id === "string" ? r.job_id : "",
        account_name: typeof r.account_name === "string" ? r.account_name : accountName,
        mode: typeof r.mode === "string" ? r.mode : "performance_only",
        status: typeof r.job_status === "string" ? r.job_status : typeof r.status === "string" ? r.status : "unknown",
        golden_path: typeof r.golden_path === "string" ? r.golden_path : null,
        total_images: Number(r.total_images ?? 0) || 0,
        created_at: typeof r.created_at === "string" ? r.created_at : undefined,
        updated_at: typeof r.updated_at === "string" ? r.updated_at : typeof r.finished_at === "string" ? r.finished_at : undefined,
      };
    });
  },

  listBenchmarkAiReviews: async (benchmarkId: string, limit = 20): Promise<BenchmarkAiReviewRow[]> => {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    const body = await request(`/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/ai-review?${q.toString()}`, { method: "GET" }, "No se pudo listar IA reviews");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
        ? ((body as Record<string, unknown>).items as unknown[])
        : [];
    return rows.map((x) => {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        review_id: typeof r.review_id === "string" ? r.review_id : "",
        benchmark_id: typeof r.benchmark_id === "string" ? r.benchmark_id : benchmarkId,
        job_id: typeof r.job_id === "string" ? r.job_id : "",
        account_name: typeof r.account_name === "string" ? r.account_name : "",
        model: typeof r.model === "string" ? r.model : null,
        prompt_version: Number(r.prompt_version ?? 0) || null,
        input_source: typeof r.input_source === "string" ? r.input_source : null,
        created_at: typeof r.created_at === "string" ? r.created_at : undefined,
        response_json: r.response_json && typeof r.response_json === "object" ? (r.response_json as Record<string, unknown>) : null,
      };
    });
  },

  listAccountBenchmarkAiReviews: async (accountName: string, limit = 50): Promise<BenchmarkAiReviewRow[]> => {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/benchmark/ai-reviews?${q.toString()}`, { method: "GET" }, "No se pudo listar historial IA");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
        ? ((body as Record<string, unknown>).items as unknown[])
        : [];
    return rows.map((x) => {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        review_id: typeof r.review_id === "string" ? r.review_id : "",
        benchmark_id: typeof r.benchmark_id === "string" ? r.benchmark_id : "",
        job_id: typeof r.job_id === "string" ? r.job_id : "",
        account_name: typeof r.account_name === "string" ? r.account_name : accountName,
        model: typeof r.model === "string" ? r.model : null,
        prompt_version: Number(r.prompt_version ?? 0) || null,
        input_source: typeof r.input_source === "string" ? r.input_source : null,
        created_at: typeof r.created_at === "string" ? r.created_at : undefined,
        response_json: r.response_json && typeof r.response_json === "object" ? (r.response_json as Record<string, unknown>) : null,
      };
    });
  },

  listBenchmarkAnalystPrompts: async (accountName: string): Promise<BenchmarkAnalystPrompt[]> => {
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/benchmark-analyst/prompts`, { method: "GET" }, "No se pudieron cargar prompts IA");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
        ? ((body as Record<string, unknown>).items as unknown[])
        : [];
    return rows.map((x) => {
      const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        version: Number(r.version ?? 0) || 0,
        is_active: Boolean(r.is_active),
        model: typeof r.model === "string" ? r.model : null,
        prompt: typeof r.prompt === "string" ? r.prompt : null,
        created_at: typeof r.created_at === "string" ? r.created_at : undefined,
        updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
      };
    });
  },

  createBenchmarkAnalystPrompt: async (accountName: string, payload: { model?: string; prompt: string }): Promise<{ status: string; version: number }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/benchmark-analyst/prompts`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear prompt IA",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return { status: typeof data.status === "string" ? data.status : "ok", version: Number(data.version ?? 0) || 0 };
  },

  activateBenchmarkAnalystPrompt: async (accountName: string, version: number): Promise<{ status: string }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/benchmark-analyst/prompts/${encodeURIComponent(String(version))}/activate`,
      { method: "POST" },
      "No se pudo activar prompt IA",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return { status: typeof data.status === "string" ? data.status : "ok" };
  },

  bootstrapBenchmarkAnalystPromptV2: async (accountName: string, activate = true): Promise<{ status: string; version?: number }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/benchmark-analyst/prompts/bootstrap-v2?activate=${activate ? "true" : "false"}`,
      { method: "POST" },
      "No se pudo instalar prompt estricto v2",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "ok",
      version: Number.isFinite(Number(data.version)) ? Number(data.version) : undefined,
    };
  },

  runBenchmarkAiReview: async (benchmarkId: string, payload: BenchmarkAiReviewRunPayload): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/ai-review`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo ejecutar análisis IA",
      600000,
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  runBenchmarkAiReviewAsync: async (benchmarkId: string, payload: BenchmarkAiReviewRunPayload): Promise<BenchmarkAiReviewAsyncResponse> => {
    const body = await request(
      `/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/ai-review/async`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo iniciar análisis IA async",
      120000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "accepted",
      benchmark_id: typeof data.benchmark_id === "string" ? data.benchmark_id : benchmarkId,
      task_id: typeof data.task_id === "string" ? data.task_id : "",
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
    };
  },

  getBenchmarkAiReviewTaskStatus: async (benchmarkId: string, taskId: string): Promise<BenchmarkAiReviewTaskStatus> => {
    const body = await request(
      `/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/ai-review/tasks/${encodeURIComponent(taskId)}/status`,
      { method: "GET" },
      "No se pudo consultar estado IA",
      120000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const warningsRaw = Array.isArray(data.warnings) ? data.warnings : [];
    return {
      task_id: typeof data.task_id === "string" ? data.task_id : taskId,
      benchmark_id: typeof data.benchmark_id === "string" ? data.benchmark_id : benchmarkId,
      status: typeof data.status === "string" ? data.status : "queued",
      phase: typeof data.phase === "string" ? data.phase : undefined,
      progress_pct: Number.isFinite(Number(data.progress_pct)) ? Number(data.progress_pct) : undefined,
      elapsed_ms: Number.isFinite(Number(data.elapsed_ms)) ? Number(data.elapsed_ms) : undefined,
      eta_sec: Number.isFinite(Number(data.eta_sec)) ? Number(data.eta_sec) : undefined,
      chunk_index: Number.isFinite(Number(data.chunk_index)) ? Number(data.chunk_index) : undefined,
      chunk_total: Number.isFinite(Number(data.chunk_total)) ? Number(data.chunk_total) : undefined,
      model: typeof data.model === "string" ? data.model : undefined,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : undefined,
      warnings: warningsRaw.map((x) => String(x)),
      error_detail: typeof data.error_detail === "string" ? data.error_detail : null,
    };
  },

  getBenchmarkAiReviewTaskResult: async (benchmarkId: string, taskId: string): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/ai-review/tasks/${encodeURIComponent(taskId)}/result`,
      { method: "GET" },
      "No se pudo consultar resultado IA",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  getBenchmarkAiReviewLatestTask: async (benchmarkId: string): Promise<BenchmarkAiReviewTaskStatus | null> => {
    const body = await request(
      `/v1/benchmark/jobs/${encodeURIComponent(benchmarkId)}/ai-review/tasks/latest`,
      { method: "GET" },
      "No se pudo consultar último task IA",
      120000,
    );
    if (!body || typeof body !== "object") return null;
    const data = body as Record<string, unknown>;
    const taskId = typeof data.task_id === "string" ? data.task_id : "";
    if (!taskId) return null;
    return {
      task_id: taskId,
      benchmark_id: typeof data.benchmark_id === "string" ? data.benchmark_id : benchmarkId,
      status: typeof data.status === "string" ? data.status : "queued",
      phase: typeof data.phase === "string" ? data.phase : undefined,
      progress_pct: Number.isFinite(Number(data.progress_pct)) ? Number(data.progress_pct) : undefined,
      elapsed_ms: Number.isFinite(Number(data.elapsed_ms)) ? Number(data.elapsed_ms) : undefined,
      eta_sec: Number.isFinite(Number(data.eta_sec)) ? Number(data.eta_sec) : undefined,
      chunk_index: Number.isFinite(Number(data.chunk_index)) ? Number(data.chunk_index) : undefined,
      chunk_total: Number.isFinite(Number(data.chunk_total)) ? Number(data.chunk_total) : undefined,
      model: typeof data.model === "string" ? data.model : undefined,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : undefined,
      warnings: Array.isArray(data.warnings) ? data.warnings.map((x) => String(x)) : [],
      error_detail: typeof data.error_detail === "string" ? data.error_detail : null,
    };
  },

  getBenchmarkAiEffectiveness: async (accountName: string, limit = 200): Promise<BenchmarkAiEffectivenessResponse> => {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/benchmark/ai-reviews/effectiveness?${q.toString()}`,
      { method: "GET" },
      "No se pudo consultar efectividad IA",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const summaryRaw = (data.summary && typeof data.summary === "object" ? data.summary : {}) as Record<string, unknown>;
    const byModelRaw = Array.isArray(data.by_model) ? data.by_model : [];
    return {
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      summary: {
        total_reviews: Number(summaryRaw.total_reviews ?? 0) || 0,
        success_rate: Number(summaryRaw.success_rate ?? 0) || 0,
        empty_rate: Number(summaryRaw.empty_rate ?? 0) || 0,
        parse_error_rate: Number(summaryRaw.parse_error_rate ?? 0) || 0,
        hard_error_rate: Number(summaryRaw.hard_error_rate ?? 0) || 0,
        avg_success_score: Number(summaryRaw.avg_success_score ?? 0) || 0,
      },
      by_model: byModelRaw.map((x) => {
        const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
        return {
          model: typeof r.model === "string" ? r.model : "-",
          total_reviews: Number(r.total_reviews ?? 0) || 0,
          success_rate: Number(r.success_rate ?? 0) || 0,
          empty_rate: Number(r.empty_rate ?? 0) || 0,
          parse_error_rate: Number(r.parse_error_rate ?? 0) || 0,
          hard_error_rate: Number(r.hard_error_rate ?? 0) || 0,
          avg_success_score: Number(r.avg_success_score ?? 0) || 0,
        };
      }),
    };
  },

  createSemanticReviewJob: async (accountName: string, payload: CreateSemanticReviewRequest): Promise<CreateSemanticReviewResponse> => {
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/semantic-review/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, "No se pudo crear review semántico");
    return body as CreateSemanticReviewResponse;
  },

  getSemanticReviewJob: async (accountName: string, reviewId: string): Promise<SemanticReviewJobResponse> => {
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/semantic-review/jobs/${encodeURIComponent(reviewId)}`, { method: "GET" }, "No se pudo consultar review semántico");
    const data = (body ?? {}) as Record<string, unknown>;
    return {
      review_id: typeof data.review_id === "string" ? data.review_id : reviewId,
      job_id: typeof data.job_id === "string" ? data.job_id : reviewId,
      status: typeof data.status === "string" ? data.status : "unknown",
      account_name: typeof data.account_name === "string" ? data.account_name : accountName,
      mode: (typeof data.mode === "string" ? data.mode : "ocr") as "ocr" | "ocr_vision",
      total_images: typeof data.total_images === "number" ? data.total_images : undefined,
      processed_images: typeof data.processed_images === "number" ? data.processed_images : undefined,
      failed_images: typeof data.failed_images === "number" ? data.failed_images : undefined,
      error_message: typeof data.error_message === "string" ? data.error_message : null,
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : undefined,
      finished_at: typeof data.finished_at === "string" ? data.finished_at : null,
      images: Array.isArray(data.images) ? data.images.map(normalizeSemanticReviewImage) : [],
    };
  },

  getSemanticReviewEvents: async (accountName: string, reviewId: string): Promise<JobEventsResponse> => {
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/semantic-review/jobs/${encodeURIComponent(reviewId)}/events`, { method: "GET" }, "No se pudo consultar eventos de review semántico");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).events)
        ? ((body as Record<string, unknown>).events as unknown[])
        : [];
    return rows.map(normalizeJobEvent).sort((a, b) => a.id - b.id);
  },

  getSemanticReviewMetrics: async (accountName: string, reviewId: string): Promise<JobMetricsResponse> => {
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/semantic-review/jobs/${encodeURIComponent(reviewId)}/metrics`, { method: "GET" }, "No se pudo consultar métricas de review semántico");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const metricsRaw = Array.isArray(data.metrics) ? data.metrics : [];
    const dedupe = new Map<number, JobMetric>();
    for (const item of metricsRaw.map(normalizeJobMetric)) {
      if (item.id < 0) continue;
      dedupe.set(item.id, item);
    }
    const summarySource =
      data.summary_by_step && typeof data.summary_by_step === "object" && !Array.isArray(data.summary_by_step)
        ? (data.summary_by_step as Record<string, unknown>)
        : {};
    const summary: JobMetricsResponse["summary_by_step"] = {};
    for (const [step, value] of Object.entries(summarySource)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      summary[step] = {
        count: typeof row.count === "number" ? row.count : Number(row.count ?? 0) || 0,
        total_ms: typeof row.total_ms === "number" ? row.total_ms : Number(row.total_ms ?? 0) || 0,
        avg_ms: typeof row.avg_ms === "number" ? row.avg_ms : Number(row.avg_ms ?? 0) || 0,
        max_ms: typeof row.max_ms === "number" ? row.max_ms : Number(row.max_ms ?? 0) || 0,
      };
    }
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : reviewId,
      metrics: Array.from(dedupe.values()).sort((a, b) => a.id - b.id),
      summary_by_step: summary,
    };
  },

  setSemanticReviewImageDecision: async (
    accountName: string,
    reviewId: string,
    imageId: number,
    payload: SemanticReviewDecisionRequest,
  ): Promise<{ status: string; review_id: string; image_id: number; decision: string }> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/semantic-review/jobs/${encodeURIComponent(reviewId)}/images/${encodeURIComponent(String(imageId))}/decision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "No se pudo guardar decisión de tarjeta",
    );
    return body as { status: string; review_id: string; image_id: number; decision: string };
  },

  uploadImages: async (accountName: string, files: File[]): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append("account_name", accountName);
    files.forEach((file) => formData.append("files", file));
    const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/uploads/images`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    const body = await parseBody(res);
    if (!res.ok) {
      const detail = normalizeErrorDetail(body, res.status, "No se pudo subir imágenes");
      throw new HttpError(res.status, detail, body);
    }
    return body as UploadResponse;
  },

  createJob: async (payload: CreateJobRequest, options?: { idempotencyKey?: string }): Promise<CreateJobResponse> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options?.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    const body = await request(`/v1/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }, "No se pudo crear job");
    const data = body as Record<string, unknown>;
    return {
      ...(body as CreateJobResponse),
      id_pdv: typeof data.id_pdv === "string" ? data.id_pdv : undefined,
      subcategoria: typeof data.subcategoria === "string" ? data.subcategoria : undefined,
      usuario_relevo: typeof data.usuario_relevo === "string" ? data.usuario_relevo : null,
      fecha_relevo: typeof data.fecha_relevo === "string" ? data.fecha_relevo : undefined,
      cadena_resuelta: typeof data.cadena_resuelta === "string" ? data.cadena_resuelta : null,
      pos_lookup_status: typeof data.pos_lookup_status === "string" ? data.pos_lookup_status : undefined,
      pos_lookup_code: typeof data.pos_lookup_code === "string" ? data.pos_lookup_code : null,
      pos_context: data.pos_context && typeof data.pos_context === "object" ? (data.pos_context as Record<string, unknown>) : null,
    };
  },

  getJob: async (jobId: string): Promise<JobResponse> => {
    const body = await request(`/v1/jobs/${jobId}`, { method: "GET" }, "No se pudo consultar job");
    const data = body as Record<string, unknown>;
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : jobId,
      status: typeof data.status === "string" ? data.status : "unknown",
      account_name: typeof data.account_name === "string" ? data.account_name : undefined,
      id_pdv: typeof data.id_pdv === "string" ? data.id_pdv : undefined,
      subcategoria: typeof data.subcategoria === "string" ? data.subcategoria : undefined,
      usuario_relevo: typeof data.usuario_relevo === "string" ? data.usuario_relevo : null,
      fecha_relevo: typeof data.fecha_relevo === "string" ? data.fecha_relevo : undefined,
      cadena_resuelta: typeof data.cadena_resuelta === "string" ? data.cadena_resuelta : null,
      pos_lookup_status: typeof data.pos_lookup_status === "string" ? data.pos_lookup_status : undefined,
      pos_lookup_code: typeof data.pos_lookup_code === "string" ? data.pos_lookup_code : null,
      pos_context: data.pos_context && typeof data.pos_context === "object" ? (data.pos_context as Record<string, unknown>) : null,
      config_name: typeof data.config_name === "string" ? data.config_name : undefined,
      total_images: typeof data.total_images === "number" ? data.total_images : undefined,
      processed_images: typeof data.processed_images === "number" ? data.processed_images : undefined,
      failed_images: typeof data.failed_images === "number" ? data.failed_images : undefined,
      progress: typeof data.progress === "number" ? data.progress : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
      error_message:
        typeof data.error_message === "string"
          ? data.error_message
          : typeof data.error === "string"
            ? data.error
            : null,
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
      started_at: typeof data.started_at === "string" ? data.started_at : undefined,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : undefined,
      finished_at: typeof data.finished_at === "string" ? data.finished_at : null,
      images: Array.isArray(data.images) ? data.images.map(normImage) : [],
    };
  },

  auditJobsMaintenance: async (payload: JobsMaintenanceAuditRequest): Promise<JobsMaintenanceAuditResponse> => {
    const body = await request(
      "/v1/admin/jobs/maintenance/audit",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo auditar el estado de jobs",
    );
    return (body && typeof body === "object" ? body : {}) as JobsMaintenanceAuditResponse;
  },

  getJobMaintenance: async (jobId: string): Promise<JobsMaintenanceAuditResponse> => {
    const body = await request(
      `/v1/admin/jobs/${encodeURIComponent(jobId)}/maintenance`,
      { method: "GET" },
      "No se pudo consultar el diagnóstico del job",
    );
    return (body && typeof body === "object" ? body : {}) as JobsMaintenanceAuditResponse;
  },

  cleanupJobsMaintenance: async (payload: JobsMaintenanceCleanupRequest): Promise<JobsMaintenanceAuditResponse> => {
    const body = await request(
      "/v1/admin/jobs/maintenance/cleanup",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo ejecutar la limpieza batch de jobs",
    );
    return (body && typeof body === "object" ? body : {}) as JobsMaintenanceAuditResponse;
  },

  deleteJobMaintenance: async (jobId: string, payload: JobsMaintenanceDeleteRequest): Promise<JobsMaintenanceAuditResponse> => {
    const body = await request(
      `/v1/admin/jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo borrar el job",
    );
    return (body && typeof body === "object" ? body : {}) as JobsMaintenanceAuditResponse;
  },

  getJobEvents: async (jobId: string): Promise<JobEventsResponse> => {
    const body = await request(`/v1/jobs/${jobId}/events`, { method: "GET" }, "No se pudo consultar eventos");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).events)
        ? ((body as Record<string, unknown>).events as unknown[])
        : [];
    return rows
      .map(normalizeJobEvent)
      .filter((event) => Number.isFinite(event.id) && event.id >= 0)
      .sort((a, b) => a.id - b.id);
  },

  getJobResults: async (jobId: string): Promise<JobResultsResponse> => {
    const body = await request(`/v1/jobs/${jobId}/results`, { method: "GET" }, "No se pudo consultar resultados");
    const data = body as Record<string, unknown>;
    const nested = (typeof data.result_json === "object" && data.result_json ? data.result_json : {}) as Record<string, unknown>;
    const topUserResponse =
      data.user_response && typeof data.user_response === "object"
        ? (data.user_response as Record<string, unknown>)
        : undefined;
    const nestedUserResponse =
      nested.user_response && typeof nested.user_response === "object"
        ? (nested.user_response as Record<string, unknown>)
        : undefined;
    const normalizedUserResponse = topUserResponse ?? nestedUserResponse;
    const imagesRaw = Array.isArray(data.images) ? data.images : Array.isArray(data.results) ? data.results : [];
    const nestedProducts = Array.isArray(nested.productos) ? (nested.productos as Record<string, unknown>[]) : undefined;
    const normalizedProducts = Array.isArray(normalizedUserResponse?.productos)
      ? (normalizedUserResponse?.productos as Record<string, unknown>[])
      : undefined;
    const nestedSummary =
      typeof nested.summary === "object" && nested.summary
        ? (nested.summary as Record<string, unknown>)
        : typeof data.summary_json === "object" && data.summary_json
          ? (data.summary_json as Record<string, unknown>)
          : undefined;
    const dedupeRaw =
      (data.dedupe_summary && typeof data.dedupe_summary === "object" ? data.dedupe_summary : undefined) ??
      (nested.dedupe_summary && typeof nested.dedupe_summary === "object" ? nested.dedupe_summary : undefined);

    const artifactsImage = Array.isArray(nested.image_artifacts)
      ? nested.image_artifacts
      : typeof nested.image_artifacts === "object" && nested.image_artifacts
        ? [nested.image_artifacts]
        : [];

    const allImages = [...imagesRaw, ...artifactsImage].map(normImage);
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : undefined,
      summary:
        (typeof data.summary === "object" && data.summary ? (data.summary as Record<string, unknown>) : undefined) ??
        nestedSummary,
      dedupe_summary: dedupeRaw
        ? {
            before: typeof (dedupeRaw as Record<string, unknown>).before === "number" ? ((dedupeRaw as Record<string, unknown>).before as number) : undefined,
            after: typeof (dedupeRaw as Record<string, unknown>).after === "number" ? ((dedupeRaw as Record<string, unknown>).after as number) : undefined,
            removed: typeof (dedupeRaw as Record<string, unknown>).removed === "number" ? ((dedupeRaw as Record<string, unknown>).removed as number) : undefined,
            enabled: typeof (dedupeRaw as Record<string, unknown>).enabled === "boolean" ? ((dedupeRaw as Record<string, unknown>).enabled as boolean) : undefined,
          }
        : null,
      products:
        normalizedProducts ??
        (Array.isArray(data.products) ? (data.products as Record<string, unknown>[]) : undefined) ??
        nestedProducts,
      extracted_products: Array.isArray(data.extracted_products) ? (data.extracted_products as Record<string, unknown>[]) : undefined,
      support_detections:
        typeof nested.image_artifacts === "object" &&
        nested.image_artifacts &&
        Array.isArray((nested.image_artifacts as Record<string, unknown>).support_detections)
          ? ((nested.image_artifacts as Record<string, unknown>).support_detections as Record<string, unknown>[])
          : undefined,
      master_json_path: typeof data.master_json_path === "string" ? data.master_json_path : null,
      master_html_path: typeof data.master_html_path === "string" ? data.master_html_path : null,
      excel_path: typeof data.excel_path === "string" ? data.excel_path : null,
      master_json_url: resolveBackendUrl(typeof data.master_json_url === "string" ? data.master_json_url : null),
      master_html_url: resolveBackendUrl(typeof data.master_html_url === "string" ? data.master_html_url : null),
      master_md_url: resolveBackendUrl(typeof data.master_md_url === "string" ? data.master_md_url : null),
      excel_url: resolveBackendUrl(typeof data.excel_url === "string" ? data.excel_url : null),
      raw_result_json: nested,
      user_response: normalizedUserResponse
        ? {
            job_id: typeof normalizedUserResponse.job_id === "string" ? normalizedUserResponse.job_id : undefined,
            account_name: typeof normalizedUserResponse.account_name === "string" ? normalizedUserResponse.account_name : undefined,
            id_pdv: typeof normalizedUserResponse.id_pdv === "string" ? normalizedUserResponse.id_pdv : undefined,
            subcategoria: typeof normalizedUserResponse.subcategoria === "string" ? normalizedUserResponse.subcategoria : undefined,
            usuario_relevo: typeof normalizedUserResponse.usuario_relevo === "string" ? normalizedUserResponse.usuario_relevo : null,
            fecha_relevo: typeof normalizedUserResponse.fecha_relevo === "string" ? normalizedUserResponse.fecha_relevo : undefined,
            fecha_proceso: typeof normalizedUserResponse.fecha_proceso === "string" ? normalizedUserResponse.fecha_proceso : undefined,
            chain_diagnostics:
              normalizedUserResponse.chain_diagnostics && typeof normalizedUserResponse.chain_diagnostics === "object"
                ? (normalizedUserResponse.chain_diagnostics as Record<string, unknown>)
                : undefined,
            timezone: typeof normalizedUserResponse.timezone === "string" ? normalizedUserResponse.timezone : undefined,
            imagenes: Array.isArray(normalizedUserResponse.imagenes) ? (normalizedUserResponse.imagenes as Record<string, unknown>[]) : [],
            productos: normalizedProducts ?? [],
          }
        : undefined,
      images: allImages,
    };
  },

  getJobImageArtifacts: async (jobId: string, imageId: number): Promise<JobImage> => {
    const body = await request(
      `/v1/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/artifacts`,
      { method: "GET" },
      "No se pudo consultar artifacts de imagen",
    );
    return normImage(body);
  },

  getImageByProcessCode: async (imageProcessCode: number): Promise<ImageByProcessCodeResponse> => {
    const body = await request(`/v1/images/${encodeURIComponent(String(imageProcessCode))}`, { method: "GET" }, "No se pudo buscar imagen por código");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      image_process_code: Number(data.image_process_code ?? imageProcessCode) || imageProcessCode,
      job_id: typeof data.job_id === "string" ? data.job_id : "",
      account_name: typeof data.account_name === "string" ? data.account_name : undefined,
      image_status: typeof data.image_status === "string" ? data.image_status : undefined,
      source_file_id: typeof data.source_file_id === "string" ? data.source_file_id : null,
      source_original_name: typeof data.source_original_name === "string" ? data.source_original_name : null,
      id_pdv: typeof data.id_pdv === "string" ? data.id_pdv : null,
      subcategoria: typeof data.subcategoria === "string" ? data.subcategoria : null,
      usuario_relevo: typeof data.usuario_relevo === "string" ? data.usuario_relevo : null,
      fecha_relevo: typeof data.fecha_relevo === "string" ? data.fecha_relevo : null,
      fecha_proceso: typeof data.fecha_proceso === "string" ? data.fecha_proceso : null,
      pos_lookup_status: typeof data.pos_lookup_status === "string" ? data.pos_lookup_status : null,
      pos_lookup_code: typeof data.pos_lookup_code === "string" ? data.pos_lookup_code : null,
      master_json_url: resolveBackendUrl(typeof data.master_json_url === "string" ? data.master_json_url : null),
      master_html_url: resolveBackendUrl(typeof data.master_html_url === "string" ? data.master_html_url : null),
      excel_url: resolveBackendUrl(typeof data.excel_url === "string" ? data.excel_url : null),
      image: data.image && typeof data.image === "object" ? normImage(data.image) : null,
    };
  },

  reprocessImageByProcessCode: async (imageProcessCode: number, payload: ReprocessByCodeRequest = {}): Promise<ReprocessByCodeResponse> => {
    const body = await request(
      `/v1/images/${encodeURIComponent(String(imageProcessCode))}/reprocess`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo reprocesar imagen por código",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : "",
      status: typeof data.status === "string" ? data.status : "queued",
      account_name: typeof data.account_name === "string" ? data.account_name : undefined,
      config_name: typeof data.config_name === "string" ? data.config_name : undefined,
      id_pdv: typeof data.id_pdv === "string" ? data.id_pdv : undefined,
      subcategoria: typeof data.subcategoria === "string" ? data.subcategoria : undefined,
      usuario_relevo: typeof data.usuario_relevo === "string" ? data.usuario_relevo : null,
      fecha_relevo: typeof data.fecha_relevo === "string" ? data.fecha_relevo : null,
      queue_mode: typeof data.queue_mode === "string" ? data.queue_mode : undefined,
      reprocess_from_image_process_code: Number(data.reprocess_from_image_process_code ?? 0) || undefined,
      source_job_id: typeof data.source_job_id === "string" ? data.source_job_id : undefined,
      source_file_id: typeof data.source_file_id === "string" ? data.source_file_id : undefined,
    };
  },

  getJobMetrics: async (jobId: string): Promise<JobMetricsResponse> => {
    const body = await request(`/v1/jobs/${jobId}/metrics`, { method: "GET" }, "No se pudo consultar métricas");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const metricsRaw = Array.isArray(data.metrics) ? data.metrics : [];
    const dedupe = new Map<number, JobMetric>();
    for (const item of metricsRaw.map(normalizeJobMetric)) {
      if (item.id < 0) continue;
      dedupe.set(item.id, item);
    }
    const summarySource =
      data.summary_by_step && typeof data.summary_by_step === "object" && !Array.isArray(data.summary_by_step)
        ? (data.summary_by_step as Record<string, unknown>)
        : {};
    const summary: JobMetricsResponse["summary_by_step"] = {};
    for (const [step, value] of Object.entries(summarySource)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      summary[step] = {
        count: typeof row.count === "number" ? row.count : Number(row.count ?? 0) || 0,
        total_ms: typeof row.total_ms === "number" ? row.total_ms : Number(row.total_ms ?? 0) || 0,
        avg_ms: typeof row.avg_ms === "number" ? row.avg_ms : Number(row.avg_ms ?? 0) || 0,
        max_ms: typeof row.max_ms === "number" ? row.max_ms : Number(row.max_ms ?? 0) || 0,
      };
    }
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : jobId,
      metrics: Array.from(dedupe.values()).sort((a, b) => a.id - b.id),
      summary_by_step: summary,
    };
  },

  listShelfJobs: async (
    accountName: string,
    limit = 100,
    options: { processing_mode?: string; job_type?: string } = {},
  ): Promise<RecentJob[]> => {
    const parseShelfJobListBody = (body: unknown): RecentJob[] => {
      const rows = Array.isArray(body)
        ? body
        : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).jobs)
          ? ((body as Record<string, unknown>).jobs as unknown[])
          : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
            ? ((body as Record<string, unknown>).items as unknown[])
            : [];
      return rows
        .map(normalizeRecentJob)
        .filter((row) => getJobId(row).length > 0)
        .sort((a, b) => {
          const aTime = new Date(a.created_at || a.updated_at || 0).getTime();
          const bTime = new Date(b.created_at || b.updated_at || 0).getTime();
          return bTime - aTime;
        });
    };

    const isShelfModuleJob = (row: RecentJob): boolean => {
      const moduleName = String(row.job_module ?? row.job_type ?? "").trim().toLowerCase();
      const testMode = String(row.test_mode ?? "").trim().toLowerCase();
      return (
        moduleName.includes("shelf")
        || moduleName.includes("crop")
        || testMode === "sku_specific"
        || testMode === "sku_test"
      );
    };

    const mergeShelfJobs = (...groups: RecentJob[][]): RecentJob[] => {
      const map = new Map<string, RecentJob>();
      for (const group of groups) {
        for (const row of group) {
          const jobId = getJobId(row);
          if (!jobId) continue;
          map.set(jobId, row);
        }
      }
      return Array.from(map.values()).sort((a, b) => {
        const aTime = new Date(a.created_at || a.updated_at || 0).getTime();
        const bTime = new Date(b.created_at || b.updated_at || 0).getTime();
        return bTime - aTime;
      });
    };

    let dedicatedRows: RecentJob[] = [];
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (options.processing_mode?.trim()) params.set("processing_mode", options.processing_mode.trim());
      if (options.job_type?.trim()) params.set("job_type", options.job_type.trim());
      const body = await request(
        `/v1/accounts/${encodeURIComponent(accountName)}/shelf/jobs?${params.toString()}`,
        { method: "GET" },
        "No se pudieron listar los jobs Shelf"
      );
      dedicatedRows = parseShelfJobListBody(body);
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 405].includes(error.status)) {
        throw error;
      }
    }

    if (dedicatedRows.length >= limit) {
      return dedicatedRows.slice(0, limit);
    }

    const recentRows = (await ocrApi.listRecentJobs({
      accountName,
      limit: Math.max(limit, 100),
      jobModule: "shelf_recognition",
    }))
      .filter(isShelfModuleJob)
      .filter((row) => !row.account_name || row.account_name === accountName);

    return mergeShelfJobs(dedicatedRows, recentRows).slice(0, limit);
  },

  createShelfJob: async (payload: CreateShelfJobRequest): Promise<CreateShelfJobResponse> => {
    const body = await request(
      `/v1/shelf/jobs`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear job Shelf",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : "",
      status: typeof data.status === "string" ? data.status : "queued",
      module: typeof data.module === "string" ? data.module : undefined,
      queue_mode: typeof data.queue_mode === "string" ? data.queue_mode : undefined,
      account_name: typeof data.account_name === "string" ? data.account_name : undefined,
      id_pdv: typeof data.id_pdv === "string" ? data.id_pdv : undefined,
      config_name: typeof data.config_name === "string" ? data.config_name : undefined,
      total_images: Number.isFinite(Number(data.total_images)) ? Number(data.total_images) : undefined,
    };
  },

  getShelfJob: async (jobId: string): Promise<JobResponse> => {
    const body = await request(`/v1/shelf/jobs/${encodeURIComponent(jobId)}`, { method: "GET" }, "No se pudo consultar job Shelf");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : jobId,
      status: typeof data.status === "string" ? data.status : "unknown",
      account_name: typeof data.account_name === "string" ? data.account_name : undefined,
      id_pdv: typeof data.id_pdv === "string" ? data.id_pdv : undefined,
      subcategoria: typeof data.subcategoria === "string" ? data.subcategoria : undefined,
      usuario_relevo: typeof data.usuario_relevo === "string" ? data.usuario_relevo : null,
      config_name: typeof data.config_name === "string" ? data.config_name : undefined,
      total_images: Number(data.total_images ?? 0) || 0,
      processed_images: Number(data.processed_images ?? 0) || 0,
      failed_images: Number(data.failed_images ?? 0) || 0,
      progress: Number(data.progress ?? 0) || 0,
      error: typeof data.error === "string" ? data.error : undefined,
      error_message: typeof data.error_message === "string" ? data.error_message : null,
      created_at: typeof data.created_at === "string" ? data.created_at : undefined,
      started_at: typeof data.started_at === "string" ? data.started_at : undefined,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : undefined,
      finished_at: typeof data.finished_at === "string" ? data.finished_at : null,
      source_job_id: typeof data.source_job_id === "string" ? data.source_job_id : null,
      rerun_of_job_id: typeof data.rerun_of_job_id === "string" ? data.rerun_of_job_id : null,
      retry_count: Number.isFinite(Number(data.retry_count)) ? Number(data.retry_count) : undefined,
      reused_inputs: typeof data.reused_inputs === "boolean" ? data.reused_inputs : undefined,
      images: Array.isArray(data.images) ? data.images.map(normImage) : [],
    };
  },

  rerunShelfJob: async (jobId: string, payload: Record<string, unknown> = {}): Promise<ShelfJobRerunResponse> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/rerun`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo reejecutar el job Shelf",
      30000,
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    return {
      status: typeof data.status === "string" ? data.status : "queued",
      job_module: typeof data.job_module === "string" ? data.job_module : undefined,
      source_job_id: typeof data.source_job_id === "string" ? data.source_job_id : null,
      rerun_of_job_id: typeof data.rerun_of_job_id === "string" ? data.rerun_of_job_id : null,
      new_job_id: typeof data.new_job_id === "string" ? data.new_job_id : "",
      reused_inputs: typeof data.reused_inputs === "boolean" ? data.reused_inputs : undefined,
      retry_count: Number.isFinite(Number(data.retry_count)) ? Number(data.retry_count) : undefined,
      processing_mode: typeof data.processing_mode === "string" ? data.processing_mode : null,
      test_mode: typeof data.test_mode === "string" ? data.test_mode : null,
      force_refresh_reports: typeof data.force_refresh_reports === "boolean" ? data.force_refresh_reports : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  },

  getShelfJobResults: async (jobId: string): Promise<ShelfJobResultsResponse> => {
    const body = await request(`/v1/shelf/jobs/${encodeURIComponent(jobId)}/results`, { method: "GET" }, "No se pudo consultar resultados Shelf");
    return (body && typeof body === "object" ? body : {}) as ShelfJobResultsResponse;
  },

  getShelfJobEvents: async (jobId: string): Promise<JobEventsResponse> => {
    const body = await request(`/v1/shelf/jobs/${encodeURIComponent(jobId)}/events`, { method: "GET" }, "No se pudo consultar eventos Shelf");
    const rows = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).events)
        ? ((body as Record<string, unknown>).events as unknown[])
        : [];
    return rows.map(normalizeJobEvent).sort((a, b) => a.id - b.id);
  },

  getShelfJobMetrics: async (jobId: string): Promise<JobMetricsResponse> => {
    const body = await request(`/v1/shelf/jobs/${encodeURIComponent(jobId)}/metrics`, { method: "GET" }, "No se pudo consultar métricas Shelf");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const metricsRaw = Array.isArray(data.metrics) ? data.metrics : [];
    const metrics = metricsRaw.map(normalizeJobMetric).filter((x) => x.id >= 0);
    const summary: JobMetricsResponse["summary_by_step"] = {};
    const summaryRaw = data.summary_by_step && typeof data.summary_by_step === "object" ? (data.summary_by_step as Record<string, unknown>) : {};
    for (const [step, value] of Object.entries(summaryRaw)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      summary[step] = {
        count: Number(row.count ?? 0) || 0,
        total_ms: Number(row.total_ms ?? 0) || 0,
        avg_ms: Number(row.avg_ms ?? 0) || 0,
        max_ms: Number(row.max_ms ?? 0) || 0,
      };
    }
    return {
      job_id: typeof data.job_id === "string" ? data.job_id : jobId,
      metrics,
      summary_by_step: summary,
    };
  },

  getShelfImageArtifacts: async (jobId: string, imageId: number): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/artifacts`,
      { method: "GET" },
      "No se pudo consultar artifacts Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  createShelfSku: async (accountName: string, payload: Record<string, unknown>): Promise<ShelfSku> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear SKU Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfSku;
  },

  seedShelfSkus: async (accountName: string, items: Record<string, unknown>[]): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/seed`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, fail_on_error: false }) },
      "No se pudo sembrar/actualizar SKUs Shelf",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  listShelfSkuCategories: async (accountName: string): Promise<Array<{ categoria: string; count_total: number; count_active: number }>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/categories`,
      { method: "GET" },
      "No se pudo listar categorías de SKUs Shelf",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const categories = Array.isArray(data.categories) ? data.categories : [];
    return categories as Array<{ categoria: string; count_total: number; count_active: number }>;
  },

  listShelfSkus: async (accountName: string, limit = 300, query?: string, categoria?: string): Promise<ShelfSku[]> => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    const q = query?.trim();
    if (q) {
      params.set("q", q);
      params.set("search", q);
    }
    const cat = categoria?.trim();
    if (cat) {
      params.set("categoria", cat);
    }
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus?${params.toString()}`,
      { method: "GET" },
      "No se pudo listar SKUs Shelf",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.skus) ? data.skus : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as ShelfSku));
  },

  getShelfSku: async (accountName: string, skuId: number | string): Promise<ShelfSku> => {
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}`, { method: "GET" }, "No se pudo consultar SKU Shelf");
    return (body && typeof body === "object" ? body : {}) as ShelfSku;
  },

  deleteShelfSku: async (
    accountName: string,
    skuId: number | string,
    payload: ShelfSkuDeleteRequest,
  ): Promise<ShelfSkuDeleteResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}`,
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo desactivar o borrar el SKU Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfSkuDeleteResponse;
  },

  createShelfSkuTestJob: async (
    accountName: string,
    skuId: number | string,
    payload: { image_path?: string; image_file_id?: string; id_pdv: string },
  ): Promise<ShelfSkuTestJobResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/test-job`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear prueba de SKU",
      120000,
    );
    return (body && typeof body === "object" ? body : { job_id: "" }) as ShelfSkuTestJobResponse;
  },

  evaluateShelfCrop: async (
    accountName: string,
    payload: { image_path?: string; image_file_id?: string; config_name?: string; categoria_hint?: string; top_k_skus?: number; analysis_modules?: string[] },
  ): Promise<ShelfEvaluateCropResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/evaluate-crop`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo evaluar el crop",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as ShelfEvaluateCropResponse;
  },

  uploadShelfAssets: async (accountName: string, payload: { files: File[]; subcategoria?: string; asset_type?: string; sku_id?: string }): Promise<Record<string, unknown>> => {
    const form = new FormData();
    for (const file of payload.files) form.append("files", file);
    if (payload.subcategoria) form.append("subcategoria", payload.subcategoria);
    if (payload.asset_type) form.append("asset_type", payload.asset_type);
    if (payload.sku_id) form.append("sku_id", payload.sku_id);
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/assets/upload`,
      { method: "POST", body: form },
      "No se pudieron subir assets Shelf",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  listShelfAssets: async (
    accountName: string,
    params: { subcategoria?: string; sku_id?: string; asset_type?: string; limit?: number } = {},
  ): Promise<ShelfAsset[]> => {
    const q = new URLSearchParams();
    if (params.subcategoria) q.set("subcategoria", params.subcategoria);
    if (params.sku_id) q.set("sku_id", params.sku_id);
    if (params.asset_type) q.set("asset_type", params.asset_type);
    if (params.limit) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/assets${suffix}`,
      { method: "GET" },
      "No se pudieron listar assets Shelf",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.assets) ? data.assets : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as ShelfAsset));
  },

  listShelfAssetSubcategories: async (accountName: string): Promise<string[]> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/assets/subcategories`,
      { method: "GET" },
      "No se pudieron listar subcategorías Shelf",
    );
    if (Array.isArray(body)) return body.map((x) => String(x)).filter(Boolean);
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.subcategories) ? data.subcategories : [];
    return rows.map((x) => String(x)).filter(Boolean);
  },

  getShelfAsset: async (accountName: string, assetId: number | string): Promise<ShelfAsset> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/assets/${encodeURIComponent(String(assetId))}`,
      { method: "GET" },
      "No se pudo consultar asset Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfAsset;
  },

  deleteShelfAsset: async (accountName: string, assetId: number | string): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/assets/${encodeURIComponent(String(assetId))}`,
      { method: "DELETE" },
      "No se pudo desactivar asset Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  attachShelfAssetToSku: async (
    accountName: string,
    payload: { asset_id?: number | string; asset_ids?: Array<number | string>; sku_id: string; source_type?: string },
  ): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/assets/attach-to-sku`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo adjuntar asset al SKU",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  addShelfSkuImages: async (accountName: string, skuId: number | string, payload: Record<string, unknown>): Promise<ShelfSkuImageResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/images`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo cargar imagen SKU Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfSkuImageResponse;
  },

  getShelfRequestDiagnostics: async (accountName: string, requestId: string): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/requests/${encodeURIComponent(requestId)}/diagnostics`,
      { method: "GET" },
      "No se pudo consultar diagnostics Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  listShelfExtractedCrops: async (jobId: string, imageId: number | string): Promise<ShelfExtractedCrop[]> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/extracted-crops`,
      { method: "GET" },
      "No se pudieron consultar los crops extraídos",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.crops) ? data.crops : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as ShelfExtractedCrop));
  },

  listShelfJobExtractedCrops: async (jobId: string): Promise<ShelfJobExtractedCropsResponse> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/extracted-crops`,
      { method: "GET" },
      "No se pudieron consultar los crops agrupados del job",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfJobExtractedCropsResponse;
  },

  getShelfExtractedCropsManifest: async (jobId: string, imageId: number | string): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/extracted-crops/manifest`,
      { method: "GET" },
      "No se pudo consultar el manifest de crops",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  getShelfExtractedCropDownloadUrl: (jobId: string, imageId: number | string, cropId: string): string => {
    return `${API_PROXY_BASE}/v1/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/extracted-crops/${encodeURIComponent(cropId)}/download`;
  },

  getShelfExtractedCropsZipUrl: (jobId: string, imageId: number | string): string => {
    return `${API_PROXY_BASE}/v1/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/extracted-crops/download-all`;
  },

  getShelfJobExtractedCropsZipUrl: (jobId: string): string => {
    return `${API_PROXY_BASE}/v1/shelf/jobs/${encodeURIComponent(jobId)}/extracted-crops/download-all`;
  },

  getShelfCropDetail: async (jobId: string, imageId: number | string, cropId: string): Promise<ShelfCropDetailResponse> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/results/${encodeURIComponent(cropId)}`,
      { method: "GET" },
      "No se pudo consultar el detalle del crop",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfCropDetailResponse;
  },

  decideShelfCrop: async (
    jobId: string,
    imageId: number | string,
    cropId: string,
    payload: {
      decision: "confirm_sku" | "assign_sku" | "mark_unknown" | "discard_crop" | "reject_suggested_sku";
      sku_id?: string;
      rejected_sku_id?: string;
      note?: string;
      user?: string;
    },
  ): Promise<ShelfCropDecisionResponse> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/results/${encodeURIComponent(cropId)}/decision`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo guardar la decisión del crop",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfCropDecisionResponse;
  },

  refreshShelfJobReports: async (jobId: string): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}/refresh-reports`,
      { method: "POST" },
      "No se pudieron regenerar los reportes del job",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  promoteShelfCropToSku: async (
    accountName: string,
    jobId: string,
    imageId: number | string,
    cropId: string,
    payload: { sku_id: string; attach_crop_as_reference?: boolean; rebuild_index?: boolean; dataset_role?: string; dataset_split?: string; note?: string; user?: string },
  ): Promise<ShelfCropPromoteResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(String(imageId))}/results/${encodeURIComponent(cropId)}/promote-to-sku`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo promover el crop al SKU",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfCropPromoteResponse;
  },

  batchPromoteShelfCropsToSku: async (
    accountName: string,
    jobId: string,
    payload: {
      sku_id: string;
      attach_crop_as_reference?: boolean;
      rebuild_index?: boolean;
      dataset_role?: string;
      dataset_split?: string;
      source_type?: string;
      note?: string;
      user?: string;
      crops: Array<{ image_id: number; crop_id: string; dataset_role?: string; dataset_split?: string; metadata?: Record<string, unknown> }>;
    },
  ): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/jobs/${encodeURIComponent(jobId)}/crops/promote-to-sku`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudieron promover los crops seleccionados al SKU",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  listShelfSkuImages: async (
    accountName: string,
    skuId: number | string,
    params: { include_inactive?: boolean } = {},
  ): Promise<ShelfSkuImage[]> => {
    const q = new URLSearchParams();
    if (typeof params.include_inactive === "boolean") q.set("include_inactive", String(params.include_inactive));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/images${suffix}`,
      { method: "GET" },
      "No se pudo listar imágenes SKU Shelf",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.images) ? data.images : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as ShelfSkuImage));
  },

  getShelfSkuImage: async (accountName: string, skuId: number | string, imageId: number | string): Promise<ShelfSkuImageResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/images/${encodeURIComponent(String(imageId))}`,
      { method: "GET" },
      "No se pudo consultar imagen SKU Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfSkuImageResponse;
  },

  deleteShelfSkuImage: async (
    accountName: string,
    skuId: number | string,
    imageId: number | string,
    params: { rebuild_index?: boolean; delete_file?: boolean } = {},
  ): Promise<Record<string, unknown>> => {
    const q = new URLSearchParams();
    if (typeof params.rebuild_index === "boolean") q.set("rebuild_index", String(params.rebuild_index));
    if (typeof params.delete_file === "boolean") q.set("delete_file", String(params.delete_file));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/images/${encodeURIComponent(String(imageId))}${suffix}`,
      { method: "DELETE" },
      "No se pudo desactivar imagen SKU",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  rebuildShelfVectorIndex: async (accountName: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/vector-index/rebuild`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo reconstruir índice vectorial Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  normalizeShelfSkus: async (accountName: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/normalize`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo normalizar el catálogo Shelf",
      120000,
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  getShelfOperationStatus: async (accountName: string, operationId: string): Promise<ShelfOperationStatusResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/operations/${encodeURIComponent(operationId)}`,
      { method: "GET" },
      "No se pudo consultar la operación Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfOperationStatusResponse;
  },

  getShelfReliabilitySummary: async (
    accountName: string,
    params: {
      limit_jobs?: number;
      ambiguous_delta?: number;
      job_ids?: string[];
      created_from?: string;
      created_to?: string;
    } = {},
  ): Promise<ShelfReliabilitySummaryResponse> => {
    const query = new URLSearchParams();
    if (typeof params.limit_jobs === "number") query.set("limit_jobs", String(params.limit_jobs));
    if (typeof params.ambiguous_delta === "number") query.set("ambiguous_delta", String(params.ambiguous_delta));
    if (params.job_ids?.length) query.set("job_ids", params.job_ids.join(","));
    if (params.created_from) query.set("created_from", params.created_from);
    if (params.created_to) query.set("created_to", params.created_to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/reliability/summary${suffix}`,
      { method: "GET" },
      "No se pudo consultar el resumen de confiabilidad Shelf",
      30000,
    );
    return (body && typeof body === "object" ? body : {}) as ShelfReliabilitySummaryResponse;
  },

  getShelfReliabilityCompare: async (
    accountName: string,
    baselineJobId: string,
    candidateJobId: string,
  ): Promise<ShelfReliabilityCompareResponse> => {
    const query = new URLSearchParams({
      baseline_job_id: baselineJobId,
      candidate_job_id: candidateJobId,
    });
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/reliability/compare?${query.toString()}`,
      { method: "GET" },
      "No se pudo comparar confiabilidad Shelf",
      30000,
    );
    return (body && typeof body === "object" ? body : {}) as ShelfReliabilityCompareResponse;
  },

  recomputeShelfEmbeddings: async (
    accountName: string,
    payload: ShelfEmbeddingsRecomputeRequest,
  ): Promise<ShelfEmbeddingsRecomputeResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/embeddings/recompute`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudieron recalcular embeddings Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfEmbeddingsRecomputeResponse;
  },

  listShelfVectorIndexVersions: async (accountName: string): Promise<Record<string, unknown>[]> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/vector-index/versions`,
      { method: "GET" },
      "No se pudo listar versiones de índice Shelf",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.versions) ? data.versions : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as Record<string, unknown>));
  },

  getShelfConfig: async (accountName: string): Promise<Record<string, unknown>> => {
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/shelf/config`, { method: "GET" }, "No se pudo consultar config Shelf");
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  patchShelfConfig: async (accountName: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/config`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo actualizar config Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  getShelfDatasetSummary: async (accountName: string, skuId?: string): Promise<ShelfDatasetSummaryResponse> => {
    const suffix = skuId?.trim() ? `?sku_id=${encodeURIComponent(skuId.trim())}` : "";
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/dataset/summary${suffix}`,
      { method: "GET" },
      "No se pudo consultar el resumen del dataset Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfDatasetSummaryResponse;
  },

  patchShelfSkuImageDatasetRole: async (
    accountName: string,
    skuId: string | number,
    imageId: string | number,
    payload: { dataset_role: string; dataset_split?: string; note?: string; user?: string; rebuild_index?: boolean },
  ): Promise<ShelfDatasetRolePatchResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/images/${encodeURIComponent(String(imageId))}/dataset-role`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo actualizar el rol de dataset de la imagen",
    );
    return (body && typeof body === "object" ? body : {}) as ShelfDatasetRolePatchResponse;
  },

  listShelfHardNegatives: async (accountName: string, skuId: string | number): Promise<ShelfHardNegative[]> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/hard-negatives`,
      { method: "GET" },
      "No se pudo listar hard negatives del SKU",
    );
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.hard_negatives) ? data.hard_negatives : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as ShelfHardNegative));
  },

  createShelfHardNegative: async (
    accountName: string,
    skuId: string | number,
    payload: { negative_sku_id: string; reason?: string; note?: string; user?: string },
  ): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/skus/${encodeURIComponent(String(skuId))}/hard-negatives`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo crear hard negative",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  listShelfReviewQueue: async (accountName: string, status = "pending"): Promise<ShelfReviewQueueItem[]> => {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
    const body = await request(`/v1/accounts/${encodeURIComponent(accountName)}/shelf/review-queue${suffix}`, { method: "GET" }, "No se pudo consultar cola de curaduría Shelf");
    const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.queue) ? data.queue : Array.isArray(body) ? (body as unknown[]) : [];
    return rows.map((x) => ((x && typeof x === "object" ? x : {}) as ShelfReviewQueueItem));
  },

  decideShelfReviewItem: async (
    accountName: string,
    itemId: number | string,
    payload: { decision: "accept_top1" | "assign_sku" | "mark_unknown" | "discard_crop"; sku_id?: number | string },
  ): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/shelf/review-queue/${encodeURIComponent(String(itemId))}/decision`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo resolver item de curaduría Shelf",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  // ---------------------------------------------------------------------------
  // Promotions: rerun, bulk rerun, compare, delete
  // ---------------------------------------------------------------------------

  rerunPromotionsJob: async (
    accountName: string,
    jobId: string,
    payload: PromotionsJobRerunRequest,
  ): Promise<PromotionsJobRerunResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/jobs/${encodeURIComponent(jobId)}/rerun`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo reejecutar el job de promociones",
      30000,
    );
    return (body && typeof body === "object" ? body : {}) as PromotionsJobRerunResponse;
  },

  bulkRerunPromotionsJobs: async (
    accountName: string,
    payload: PromotionsBulkRerunRequest,
  ): Promise<PromotionsBulkRerunResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/jobs/bulk-rerun`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo reejecutar los jobs de promociones",
      60000,
    );
    return (body && typeof body === "object" ? body : {}) as PromotionsBulkRerunResponse;
  },

  compareJobs: async (
    accountName: string,
    jobIdA: string,
    jobIdB: string,
  ): Promise<JobCompareResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/jobs/${encodeURIComponent(jobIdA)}/compare/${encodeURIComponent(jobIdB)}`,
      { method: "GET" },
      "No se pudo comparar jobs",
    );
    return (body && typeof body === "object" ? body : {}) as JobCompareResponse;
  },

  deletePromotionsJob: async (
    accountName: string,
    jobId: string,
    payload: JobDeleteRequest,
  ): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo eliminar el job",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  bulkDeletePromotionsJobs: async (
    accountName: string,
    payload: BulkJobDeleteRequest,
  ): Promise<BulkJobDeleteResponse> => {
    const body = await request(
      `/v1/accounts/${encodeURIComponent(accountName)}/jobs/bulk-delete`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo eliminar los jobs",
    );
    return (body && typeof body === "object" ? body : {}) as BulkJobDeleteResponse;
  },

  deleteShelfJob: async (jobId: string, payload: JobDeleteRequest): Promise<Record<string, unknown>> => {
    const body = await request(
      `/v1/shelf/jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo eliminar el shelf job",
    );
    return (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  },

  bulkDeleteShelfJobs: async (payload: BulkJobDeleteRequest): Promise<BulkJobDeleteResponse> => {
    const body = await request(
      "/v1/shelf/jobs/bulk-delete",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      "No se pudo eliminar los shelf jobs",
    );
    return (body && typeof body === "object" ? body : {}) as BulkJobDeleteResponse;
  },

  getAnnotatedDownloadUrl: (jobId: string, imageId: number): string => {
    return `${API_PROXY_BASE}/v1/jobs/${jobId}/images/${imageId}/annotated`;
  },
};

export function isFinalJobStatus(status: string): boolean {
  return ["completed", "failed", "partial_success", "cancelled", "canceled", "done", "error", "success"].includes(status.toLowerCase());
}

export function isHttpUrl(value?: string | null): boolean {
  if (!value) return false;
  return value.startsWith("http://") || value.startsWith("https://");
}

export function maskSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).map(([k, v]) => (typeof v === "string" && v.includes("***") ? [k, "***"] : [k, v])));
}
