export type ApiError = { detail: string };

export type UploadItem = {
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  public_url: string | null;
};

export type UploadResponse = {
  uploaded: UploadItem[];
};

export type SupportLabelsConfig = {
  enabled: boolean;
  label: string;
  max_support_crops: number;
  min_primary_products: number;
  min_low_confidence_ratio: number;
  memory_enabled?: boolean;
  memory_ocr_enabled?: boolean;
  memory_labels?: string[];
  max_memory_crops?: number;
  memory_ocr_prompt?: string;
  debug_text_limit?: number;
  assist_primary_name_enabled?: boolean;
  assist_only_when_low_confidence?: boolean;
  assist_min_similarity?: number;
  assist_semantic_repair_enabled?: boolean;
  assist_semantic_repair_only?: boolean;
};

export type DetectionConfig = {
  mode?: string;
  min_confidence?: number;
  allowed_labels?: string[];
  ignored_labels?: string[];
  [key: string]: unknown;
};

export type TextEnrichmentConfig = {
  enabled?: boolean;
  model?: string;
  promotion_catalog_memory?: {
    enabled?: boolean;
    source?: string;
    mode?: "off" | "shadow" | "assist" | "validate" | string;
    max_candidates?: number;
    min_score?: number;
    require_local_evidence?: boolean;
    allow_product_name_rewrite?: boolean;
    allow_field_fill?: string[];
    audit_only_fields?: string[];
    block_if_ambiguous_top2_delta_below?: number;
    include_in_enricher_prompt?: boolean;
    [key: string]: unknown;
  };
  semantic_rag?: {
    enabled?: boolean;
    limit?: number;
    [key: string]: unknown;
  };
  normalization_map?: Record<string, string>;
  [key: string]: unknown;
};

export type QwenVlConfig = {
  model?: string;
  prompt_file?: string;
  enabled_sources?: string[];
  timeout_sec?: number;
  max_retries?: number;
  retry_delay_sec?: number;
  [key: string]: unknown;
};

export type OcrPreprocessConfig = {
  enabled?: boolean;
  variants?: string[];
  shadow_variants?: string[];
  ensemble_enabled?: boolean;
  shadow_enabled?: boolean;
  shadow_ocr_enabled?: boolean;
  select_best?: boolean;
  store_artifacts?: boolean;
  contrast_alpha?: number;
  contrast_beta?: number;
  sharpen_strength?: number;
  adaptive_block_size?: number;
  adaptive_c?: number;
  jpeg_quality?: number;
  [key: string]: unknown;
};

export type OcrPreprocessVariant = {
  variant?: string;
  mode?: string;
  shadow_only?: boolean;
  score?: number;
  chars?: number;
  elapsed_ms?: number;
  artifact_path?: string;
  artifact_url?: string | null;
  raw_text_preview?: string;
  ocr_skipped_reason?: string | null;
  quality_metrics?: Record<string, unknown> | null;
};

export type OcrPreprocessShadowSummary = {
  enabled?: boolean;
  ocr_enabled?: boolean;
  count?: number;
  best_variant?: string | null;
  best_score?: number | null;
  active_best_variant?: string | null;
  active_best_score?: number | null;
  would_replace_active?: boolean;
  score_delta_vs_active?: number | null;
  [key: string]: unknown;
};

export type OcrPreprocessResult = {
  enabled?: boolean;
  selected_variant?: string;
  heuristic_winner?: string | null;
  semantic_rerank_used?: boolean;
  semantic_rerank_reason?: string | null;
  disabled_reason?: string | null;
  variants?: OcrPreprocessVariant[];
  shadow_variants?: OcrPreprocessVariant[];
  shadow_summary?: OcrPreprocessShadowSummary | null;
};

export type PipelineConfig = {
  detection_config?: DetectionConfig;
  support_labels?: SupportLabelsConfig;
  text_enrichment?: TextEnrichmentConfig;
  qwen_vl?: QwenVlConfig;
  ocr_preprocess?: OcrPreprocessConfig;
  [key: string]: unknown;
};

export type PipelineConfigRequest = {
  name: string;
  version: string;
  is_active: boolean;
  config: PipelineConfig;
};

export type CreateJobRequest = {
  account_name: string;
  config_name?: string;
  image_file_ids?: string[];
  image_paths?: string[];
  id_pdv: string;
  subcategoria: string;
  usuario_relevo?: string | null;
  db_excel?: string | null;
  output_name?: string | null;
  skip_qwen?: boolean | null;
  cadena?: string | null;
  export_excel?: boolean | null;
};

export type CreateJobResponse = {
  job_id: string;
  status?: string;
  account_name?: string;
  id_pdv?: string;
  subcategoria?: string;
  usuario_relevo?: string | null;
  fecha_relevo?: string;
  cadena_resuelta?: string | null;
  pos_lookup_status?: "found" | "not_found" | "missing_id_pdv" | "error" | string;
  pos_lookup_code?: string | null;
  pos_context?: Record<string, unknown> | null;
  idempotency_key?: string;
  created_new?: boolean;
  config_name?: string;
  effective_settings?: {
    skip_qwen?: boolean;
    cadena?: string;
    export_excel?: boolean;
  };
  total_images?: number;
  message?: string;
};

export type JobDetection = {
  label: string;
  conf: number;
  box: [number, number, number, number];
};

export type SupportMemoryItem = {
  crop_id?: string;
  crop_filename?: string;
  crop_url?: string | null;
  download_url?: string | null;
  label?: string;
  memory_label?: string;
  conf?: number;
  box?: [number, number, number, number];
  raw_text?: string;
  raw_text_full?: string;
  ocr_preprocess?: OcrPreprocessResult | null;
};

export type AnalysisTraceItem = {
  source?: "primary" | "support" | string;
  crop?: string;
  crop_id?: string;
  label?: string;
  box?: [number, number, number, number];
  ocr_raw_text?: string;
  vision_output?: Record<string, unknown> | null;
  structured_products_before_filter?: Record<string, unknown>[] | null;
  structured_products_after_enrichment?: Record<string, unknown>[] | null;
  semantic_rag?: Record<string, unknown> | null;
  raw_text_preview?: string;
  llm_used?: boolean;
  llm_session_id?: string;
  llm_ok?: boolean;
  products_detected?: number;
  ocr_preprocess?: OcrPreprocessResult | null;
  promotion_catalog_memory?: Record<string, unknown> | null;
};

export type PrimaryCrop = {
  crop_id: string;
  crop_filename?: string | null;
  crop_url?: string | null;
  download_url?: string | null;
  source?: "primary" | string;
  label?: string | null;
  conf?: number | null;
  box?: number[] | null;
  ocr_raw_text?: string | null;
  ocr_text_preview?: string | null;
  vision_used?: boolean;
  vision_output?: Record<string, unknown> | null;
  structured_products_before_filter?: unknown[];
  structured_products_after_enrichment?: unknown[];
  semantic_rag?: { count?: number; items?: unknown[] } | Record<string, unknown> | null;
  promotions_extracted?: unknown[];
  llm_ok?: boolean | null;
  llm_session_id?: string | null;
  ocr_preprocess?: OcrPreprocessResult | null;
  promotion_catalog_memory?: Record<string, unknown> | null;
};

export type JobImage = {
  id: number;
  image_process_code?: number | null;
  file_id?: string | null;
  original_name?: string | null;
  image_name?: string;
  original_image_url?: string | null;
  status: string;
  processing_status?: string | null;
  no_products_reason?: string | null;
  annotated_image_path?: string | null;
  annotated_image_url?: string | null;
  annotated_download_url?: string | null;
  result_json_path?: string | null;
  result_html_path?: string | null;
  result_json_url?: string | null;
  result_html_url?: string | null;
  image_md_path?: string | null;
  result_md_url?: string | null;
  support_result_md_url?: string | null;
  support_result_html_url?: string | null;
  ai_process_html_url?: string | null;
  ai_process_md_url?: string | null;
  ocr_debug?: Record<string, unknown> | null;
  detections?: JobDetection[];
  support_detections?: JobDetection[];
  support_memory?: SupportMemoryItem[];
  support_name_candidates?: string[];
  analysis_trace?: AnalysisTraceItem[];
  primary_crops?: PrimaryCrop[];
  promotions_extracted?: Record<string, unknown>[];
  ocr_raw_text_primary?: string | null;
  ocr_raw_text_support?: string | null;
  vision_outputs?: Record<string, unknown>[] | Record<string, unknown> | null;
  error_message?: string | null;
  detections_count?: number;
};

export type JobsMaintenanceAuditRequest = {
  account_name?: string | null;
  job_module?: string | null;
  status?: string | null;
  job_ids?: string[];
  include_ok?: boolean;
  include_files?: boolean;
  limit?: number;
};

export type JobsMaintenanceCleanupRequest = JobsMaintenanceAuditRequest & {
  dry_run: boolean;
  delete_db_rows?: boolean;
  delete_local_files?: boolean;
  delete_azure_originals?: boolean;
  include_running_jobs?: boolean;
  confirm?: string;
};

export type JobsMaintenanceDeleteRequest = {
  dry_run: boolean;
  delete_db_rows?: boolean;
  delete_local_files?: boolean;
  delete_azure_originals?: boolean;
  include_running_jobs?: boolean;
  confirm?: string;
};

export type JobsMaintenanceAuditItem = {
  job_id: string;
  account_name?: string | null;
  job_module?: string | null;
  status?: string | null;
  health?: "ok" | "broken" | string;
  issues?: string[];
  counts?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  files?: {
    missing?: string[];
    existing_generated?: string[];
    existing_source_not_deleted?: string[];
    [key: string]: unknown;
  } | null;
  azure_originals?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type JobsMaintenanceOrphanDir = {
  path?: string | null;
  name?: string | null;
  exists?: boolean;
  orphan_type?: string | null;
  size_bytes?: number | null;
  files_count?: number | null;
  [key: string]: unknown;
};

export type JobsMaintenanceAuditResponse = {
  status?: string;
  summary?: {
    jobs_scanned?: number;
    jobs_returned?: number;
    broken_jobs?: number;
    orphan_output_dirs?: number;
    [key: string]: unknown;
  };
  items?: JobsMaintenanceAuditItem[];
  orphan_output_dirs?: JobsMaintenanceOrphanDir[];
  [key: string]: unknown;
};

export type JobResponse = {
  job_id: string;
  status: string;
  account_name?: string;
  id_pdv?: string;
  subcategoria?: string;
  usuario_relevo?: string | null;
  fecha_relevo?: string;
  cadena_resuelta?: string | null;
  pos_lookup_status?: "found" | "not_found" | "missing_id_pdv" | "error" | string;
  pos_lookup_code?: string | null;
  pos_context?: Record<string, unknown> | null;
  config_name?: string;
  total_images?: number;
  processed_images?: number;
  failed_images?: number;
  progress?: number;
  error?: string;
  error_message?: string | null;
  created_at?: string;
  started_at?: string;
  updated_at?: string;
  finished_at?: string | null;
  source_job_id?: string | null;
  rerun_of_job_id?: string | null;
  retry_count?: number;
  reused_inputs?: boolean;
  images: JobImage[];
};

export type JobEvent = {
  id: number;
  job_id?: string;
  job_image_id?: number | null;
  level: "INFO" | "WARNING" | "ERROR";
  event_type: string;
  message: string;
  payload?: unknown;
  created_at: string;
};

export type JobEventsResponse = JobEvent[];

export type JobMetric = {
  id: number;
  job_id: string;
  job_image_id?: number | null;
  step: string;
  duration_ms: number;
  source?: string | null;
  crop?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

export type JobMetricsSummaryItem = {
  count: number;
  total_ms: number;
  avg_ms: number;
  max_ms: number;
};

export type JobMetricsResponse = {
  job_id: string;
  metrics: JobMetric[];
  summary_by_step: Record<string, JobMetricsSummaryItem>;
};

export type JobResultsResponse = {
  job_id?: string;
  summary?: Record<string, unknown>;
  dedupe_summary?: {
    before?: number;
    after?: number;
    removed?: number;
    enabled?: boolean;
  } | null;
  products?: Record<string, unknown>[];
  extracted_products?: Record<string, unknown>[];
  support_detections?: Record<string, unknown>[];
  master_json_path?: string | null;
  master_html_path?: string | null;
  master_md_path?: string | null;
  excel_path?: string | null;
  master_json_url?: string | null;
  master_html_url?: string | null;
  master_md_url?: string | null;
  excel_url?: string | null;
  raw_result_json?: Record<string, unknown>;
  user_response?: {
    job_id?: string;
    account_name?: string;
    id_pdv?: string;
    subcategoria?: string;
    usuario_relevo?: string | null;
    fecha_relevo?: string;
    fecha_proceso?: string;
    chain_diagnostics?: Record<string, unknown>;
    timezone?: string;
    imagenes?: Array<Record<string, unknown> & { image_process_code?: number }>;
    productos?: Array<Record<string, unknown> & { image_process_code?: number }>;
  };
  images: JobImage[];
};

export type JobResult = JobResultsResponse;

export type ImageByProcessCodeResponse = {
  image_process_code: number;
  job_id: string;
  account_name?: string;
  image_status?: string;
  source_file_id?: string | null;
  source_original_name?: string | null;
  id_pdv?: string | null;
  subcategoria?: string | null;
  usuario_relevo?: string | null;
  fecha_relevo?: string | null;
  fecha_proceso?: string | null;
  pos_lookup_status?: string | null;
  pos_lookup_code?: string | null;
  master_json_url?: string | null;
  master_html_url?: string | null;
  master_md_url?: string | null;
  excel_url?: string | null;
  image?: JobImage | null;
};

export type ReprocessByCodeRequest = {
  config_name?: string;
  id_pdv?: string;
  subcategoria?: string;
  usuario_relevo?: string | null;
  usuario?: string | null;
  account_name?: string;
};

export type ReprocessByCodeResponse = {
  job_id: string;
  status: string;
  account_name?: string;
  config_name?: string;
  id_pdv?: string;
  subcategoria?: string;
  usuario_relevo?: string | null;
  fecha_relevo?: string | null;
  queue_mode?: string;
  reprocess_from_image_process_code?: number;
  source_job_id?: string;
  source_file_id?: string;
};

export type CanonicalField =
  | "company_name"
  | "brand_name"
  | "brand_aliases"
  | "product_family"
  | "variant"
  | "size_text"
  | "size_value"
  | "size_unit"
  | "barcode"
  | "category"
  | "country"
  | "notes";

export type FieldMapping = Record<CanonicalField, string | null>;

export type MasterdataImportBatch = {
  id: number;
  batch_id?: number;
  account_name?: string;
  source_filename?: string;
  status: "uploaded" | "mapped" | "validated" | "importing" | "imported" | string;
  mapping?: Record<string, unknown> | null;
  preview?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MasterdataPreviewMappedRow = {
  row_index: number;
  raw: Record<string, unknown>;
  mapped: Record<string, unknown>;
  status: "valid" | "invalid" | "pending" | string;
  errors: string[];
};

export type MasterdataUploadResponse = {
  status: string;
  batch_id: number;
  account_name: string;
  canonical_fields: string[];
  preview: {
    kind?: string;
    selected_sheet?: string | null;
    available_sheets?: string[];
    headers?: string[];
    sample_rows?: Record<string, unknown>[];
    total_rows?: number;
  };
  batch?: MasterdataImportBatch;
};

export type MasterdataAiMapResponse = {
  status: string;
  suggested_mapping: {
    strategy?: string;
    mapping: Partial<FieldMapping>;
    confidence?: number;
    notes?: string[];
    model?: string;
  };
};

export type MasterdataConfirmMapResponse = {
  status: string;
  summary: {
    total_rows_read?: number;
    valid_rows?: number;
    invalid_rows?: number;
    dry_run?: boolean;
    imported_rows?: number;
    sheet_name?: string | null;
    headers?: string[];
    mapping?: Partial<FieldMapping>;
  };
  preview_mapped_rows: MasterdataPreviewMappedRow[];
};

export type MasterdataCatalogRow = {
  sku_name?: string | null;
  company_name?: string | null;
  brand_name?: string | null;
  family_name?: string | null;
  variant_name?: string | null;
  size_text?: string | null;
  size_value?: string | number | null;
  size_unit?: string | null;
  barcode?: string | null;
  category?: string | null;
  country?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type AccountConfig = {
  id: string | number;
  account_name: string;
  name: string;
  version: string;
  is_active: boolean;
  config: PipelineConfig;
  created_at?: string;
  updated_at?: string;
};

export type ConfigListResponse = {
  account_name: string;
  configs: AccountConfig[];
};

export type ActiveConfigResponse = AccountConfig;

export type CreateAccountConfigRequest = PipelineConfigRequest;

export type SemanticAliasRequest = {
  alias: string;
  canonical: string;
  scope?: string;
  is_active?: boolean;
  target_keywords?: string[];
  chain_whitelist?: string[];
};

export type AliasRow = {
  id: number;
  alias: string;
  canonical: string;
  scope: string;
  is_active: number | boolean;
  target_keywords?: string[];
  chain_whitelist?: string[];
  created_at?: string;
  updated_at?: string;
};

export type AliasListResponse = {
  account_name: string;
  aliases: AliasRow[];
};

export type JobStatus = "queued" | "running" | "completed" | "partial_success" | "failed" | "unknown";

export type RecentJobRow = {
  job_id?: string;
  id?: string;
  session_id?: string;
  status: JobStatus;
  account_name?: string | null;
  job_module?: string | null;
  job_type?: string | null;
  test_mode?: string | null;
  id_pdv?: string | null;
  subcategoria?: string | null;
  usuario_relevo?: string | null;
  image_process_code?: number | null;
  total_images: number;
  processed_images: number;
  failed_images: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string | null;
};

export type JobRow = RecentJobRow & {
  id: string;
  job_id: string;
  session_id: string;
  account_name?: string | null;
};

export type RecentJob = JobRow;
export type RecentUpload = Record<string, unknown>;

export type QueueJobRow = {
  job_id: string;
  session_id?: string;
  account_name?: string | null;
  status: JobStatus | string;
  total_images?: number;
  processed_images?: number;
  failed_images?: number;
  id_pdv?: string | null;
  subcategoria?: string | null;
  usuario_relevo?: string | null;
  created_at?: string;
  started_at?: string;
  updated_at?: string;
};

export type JobQueueSnapshot = {
  queue_mode?: string;
  job_queue_enabled?: boolean;
  poll_sec?: number;
  scope_account_name?: string | null;
  counts_by_status?: Record<string, number>;
  queued_count: number;
  running_count: number;
  running_job: QueueJobRow | null;
  next_jobs: QueueJobRow[];
  next_limit?: number;
};

export type SemanticKnowledgeEntry = {
  id: number;
  title: string;
  content: string;
  entry_type: string;
  chain?: string | null;
  category?: string | null;
  tags?: string[];
  priority?: number;
  is_active: number | boolean;
  status?: "draft" | "canary" | "active" | "paused" | "deprecated" | string;
  owner?: string | null;
  confidence_target?: number | null;
  created_from_case?: string | null;
  negative_examples?: string[];
  rollout_scope?: Record<string, unknown> | null;
  success_metrics?: Record<string, unknown> | null;
  rule_version?: number | null;
  canary_flag?: boolean | null;
  shadow_only?: boolean | null;
  created_at?: string;
  updated_at?: string;
  score?: number;
};

export type SemanticKnowledgeListResponse = {
  account_name: string;
  items: SemanticKnowledgeEntry[];
};

export type SemanticKnowledgeUpsertRequest = {
  id?: number;
  title: string;
  content: string;
  entry_type: string;
  chain?: string | null;
  category?: string | null;
  tags?: string[];
  priority?: number;
  is_active?: boolean;
  status?: "draft" | "canary" | "active" | "paused" | "deprecated" | string;
  owner?: string | null;
  confidence_target?: number | null;
  created_from_case?: string | null;
  negative_examples?: string[];
  rollout_scope?: Record<string, unknown> | null;
  success_metrics?: Record<string, unknown> | null;
  rule_version?: number | null;
};

export type SemanticKnowledgeSearchResponse = {
  account_name: string;
  query: string;
  items: SemanticKnowledgeEntry[];
};

export type SemanticReviewMode = "ocr" | "ocr_vision";

export type CreateSemanticReviewRequest = {
  image_file_ids: string[];
  mode: SemanticReviewMode;
  chain?: string | null;
  category?: string | null;
  notes?: string | null;
  vision_model?: string | null;
  vision_prompt_file?: string | null;
};

export type SemanticReviewImage = {
  id: number;
  file_id?: string | null;
  original_name?: string | null;
  image_name?: string;
  status: string;
  ocr_chars?: number;
  has_vision?: boolean;
  error_message?: string | null;
  annotated_image_url?: string | null;
  annotated_download_url?: string | null;
  result_json_url?: string | null;
  result_md_url?: string | null;
  ocr_text?: string | null;
  vision_analysis?: Record<string, unknown> | null;
  decision?: "saved" | "discarded" | "pending" | "needs_review" | string | null;
  decision_note?: string | null;
  decision_by?: string | null;
  decision_at?: string | null;
  risk_score?: number | null;
  queue_reason?: string | null;
  risk_reasons?: string[];
  result_summary?: Record<string, unknown> | null;
};

export type SemanticKnowledgeMetricsResponse = {
  account_name: string;
  window?: {
    created_from?: string | null;
    created_to?: string | null;
  };
  summary?: {
    total_products?: number;
    rules_observed?: number;
    chains_observed?: number;
  };
  rules: Array<{
    rule: string;
    considered: number;
    applied: number;
    blocked: number;
    precision_est: number;
  }>;
  chains: Array<{
    chain: string;
    rows: number;
    needs_review_rate: number;
  }>;
};

export type CreateSemanticReviewResponse = {
  review_id: string;
  job_id: string;
  status: string;
  account_name: string;
  mode: SemanticReviewMode;
  total_images: number;
};

export type SemanticReviewJobResponse = {
  review_id: string;
  job_id: string;
  status: string;
  account_name: string;
  mode: SemanticReviewMode;
  total_images?: number;
  processed_images?: number;
  failed_images?: number;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
  images: SemanticReviewImage[];
};

export type SemanticReviewDecisionRequest = {
  decision: "saved" | "discarded" | "pending" | "needs_review";
  note?: string;
  decision_by?: string;
};

export type SemanticKnowledgeTestRequest = {
  text: string;
  mode?: "ocr" | "ocr_vision" | string;
  chain?: string;
  category?: string;
  model?: string;
  knowledge_id?: number;
  knowledge?: SemanticKnowledgeUpsertRequest;
  vision_analysis?: Record<string, unknown>;
};

export type SemanticKnowledgeTestResponse = {
  account_name: string;
  model?: string;
  knowledge_items?: Array<Record<string, unknown>>;
  result?: {
    understood?: boolean;
    applies?: boolean;
    explanation?: string;
    possible_corrections?: Array<{ from?: string; to?: string; reason?: string }>;
    suggested_knowledge_improvement?: string;
    [key: string]: unknown;
  };
};

export type SemanticRuleTextSuggestionRequest = {
  idea_text: string;
  ocr_text: string;
  chain?: string;
  category?: string;
  model?: string;
  current_rule_content?: string;
};

export type SemanticRuleTextSuggestionResponse = {
  status: "ok";
  improved_content: string;
  rationale: string;
  llm_understood?: boolean;
  llm_applies?: boolean;
  possible_corrections?: Array<{ from?: string; to?: string; reason?: string }>;
  suggested_knowledge_improvement?: string;
};

export type SemanticPreviewOcrRequest = {
  text: string;
  chain?: string | null;
  category?: string | null;
  candidate_rule: SemanticKnowledgeUpsertRequest;
  dry_run?: boolean;
};

export type SemanticPreviewPipelineRequest = {
  account_name?: string;
  config_name?: string;
  image_file_id?: string;
  image_path?: string;
  chain?: string | null;
  category?: string | null;
  candidate_rule: SemanticKnowledgeUpsertRequest;
  dry_run?: boolean;
  persist_artifacts?: boolean;
};

export type SemanticPreviewDiff = {
  name_changed?: boolean;
  applied_rules_count?: number;
};

export type SemanticPreviewOcrResponse = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  diff?: SemanticPreviewDiff;
  [key: string]: unknown;
};

export type SemanticPreviewPipelineResponse = {
  summary?: Record<string, unknown>;
  dedupe_summary?: {
    before?: number;
    after?: number;
    removed?: number;
    enabled?: boolean;
  } | null;
  products?: Record<string, unknown>[];
  processing_status?: string | null;
  no_products_reason?: string | null;
  [key: string]: unknown;
};

export type SemanticLearningCase = {
  id: number;
  review_id?: string;
  image_id?: number;
  chain?: string | null;
  category?: string | null;
  risk_type?: string | null;
  status?: string | null;
  payload?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SemanticLearningCasesResponse = {
  account_name: string;
  total: number;
  items: SemanticLearningCase[];
};

export type SemanticPreviewInsightResponse = {
  account_name: string;
  mode: string;
  insight_struct?: {
    focus?: string;
    processing_status?: string;
    summary?: Record<string, unknown>;
    dedupe_summary?: Record<string, unknown>;
    products_count?: number;
    per_product_findings?: Array<{
      index?: number;
      producto?: string;
      barcode?: string;
      name_changed?: boolean;
      name_before?: string;
      name_after?: string;
      rules_applied_count?: number;
      rules_blocked_count?: number;
      product_confidence_score?: number;
      rule_opportunities?: Array<{
        rule?: string;
        blocked?: boolean;
        cause?: string;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    }>;
    rules_applied_total?: number;
    rules_blocked_total?: number;
    blocked_reasons?: Record<string, number>;
    missed_rule_opportunities?: Array<{
      rule?: string;
      blocked?: boolean;
      cause?: string;
      block_reason?: string;
      mapping?: string;
      product_index?: number;
      [key: string]: unknown;
    }>;
    mapping_stats?: Array<{
      mapping?: string;
      applied_count?: number;
      blocked_count?: number;
      blocked_reasons?: string[] | Record<string, number>;
      recommendation?: string;
      [key: string]: unknown;
    }>;
    barcode_conflicts?: unknown[];
    risk_flags?: unknown[];
    [key: string]: unknown;
  };
  insight_narrative?: {
    executive_summary?: string;
    what_worked?: string[];
    what_failed?: string[];
    why_blocked?: string[];
    recommended_actions?: string[];
    missed_rules_analysis?: Array<
      | string
      | {
          producto?: string;
          producto_idx?: number;
          regla?: string;
          blocked?: boolean;
          mapping?: string;
          block_reason?: string;
          possible_causes?: string[];
          suggested_fix?: string;
          cause?: string;
          [key: string]: unknown;
        }
    >;
    mapping_insights?: string[];
    confidence?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type SemanticRuleDraftAssistResponse = {
  status?: string;
  suggestion?: {
    title_suggestion?: string;
    improved_content?: string;
    expected_match_signals?: string[];
    expected_non_match_signals?: string[];
    dry_validation?: {
      applies_likely?: boolean;
      reason?: string;
      matched_signals?: string[];
      missing_signals?: string[];
      [key: string]: unknown;
    };
    notes_for_human?: string[];
    duplicate_check?: {
      has_duplicates?: boolean;
      candidate_mapping_signatures?: string[];
      duplicates?: Array<{
        id?: number;
        title?: string;
        entry_type?: string;
        status?: string;
        is_active?: boolean;
        chain?: string | null;
        category?: string | null;
        overlap_mappings?: string[];
        severity?: string;
        recommendation?: string;
      }>;
      checked_rules?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type SemanticDuplicateCheckResponse = {
  has_duplicates?: boolean;
  candidate_mapping_signatures?: string[];
  duplicates?: Array<{
    id?: number;
    title?: string;
    entry_type?: string;
    status?: string;
    is_active?: boolean;
    chain?: string | null;
    category?: string | null;
    overlap_mappings?: string[];
    severity?: string;
    recommendation?: string;
  }>;
  checked_rules?: number;
};

export type SemanticRegressionSmokeResponse = {
  account_name?: string;
  mode?: string;
  dry_run?: boolean;
  result?: {
    suite?: string;
    status?: "passed" | "failed" | string;
    summary?: {
      total?: number;
      passed?: number;
      failed?: number;
      [key: string]: unknown;
    };
    checks?: Array<{
      check?: string;
      expected?: string;
      actual?: string;
      passed?: boolean;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type AnalyticsResultsQueryRequest = {
  account_name?: string | null;
  country?: string | null;
  job_ids?: string[];
  chains?: string[];
  categories?: string[];
  activities?: string[];
  promotion_types?: string[];
  products?: string[];
  barcodes?: string[];
  query?: string | null;
  created_from?: string | null;
  created_to?: string | null;
  limit_jobs?: number;
  limit?: number;
  offset?: number;
  include_raw_product?: boolean;
};

export type AnalyticsSummary = {
  total_rows: number;
  total_jobs: number;
  total_barcodes: number;
  total_chains: number;
};

export type AnalyticsPagination = {
  total: number;
  offset: number;
  limit: number;
  returned: number;
};

export type AnalyticsFacets = {
  accounts: string[];
  countries: string[];
  chains: string[];
  categories: string[];
  activities: string[];
  promotion_types: string[];
  jobs: string[];
};

export type AnalyticsResultsQueryResponse = {
  summary: AnalyticsSummary;
  pagination: AnalyticsPagination;
  items: Record<string, unknown>[];
  facets: AnalyticsFacets;
};

export type AnalyticsResultsFacetsResponse = {
  summary: AnalyticsSummary;
  facets: AnalyticsFacets;
};

export type AnalyticsExportRequest = AnalyticsResultsQueryRequest & {
  columns?: string[];
  extra_fields?: string[];
  include_code_columns?: boolean;
  filename?: string;
};

export type AnalyticsExportResponse = {
  status: string;
  rows: number;
  columns: string[];
  excel_path?: string;
  excel_url?: string | null;
};

export type ObservabilitySummaryRequest = {
  account_name: string;
  created_from?: string;
  created_to?: string;
  job_ids?: string[];
  limit_jobs?: number;
  alert_needs_review_rate?: number;
  alert_llm_ok_rate_drop_below?: number;
  alert_llm_fallback_rate_above?: number;
};

export type ObservabilitySummaryResponse = {
  summary: {
    total_rows: number;
    needs_review_rate: number;
    invention_rate_proxy: number;
    llm_ok_rate: number;
    llm_fallback_rate: number;
  };
  latency_by_step: Array<{
    step: string;
    count: number;
    avg_ms: number;
    p95_ms: number;
    p99_ms: number;
  }>;
  top_discard_reasons: Array<{ reason: string; count: number }>;
  top_rag_applied_rules: Array<{ rule: string; count: number }>;
  top_rag_blocked_rules: Array<{ rule: string; count: number }>;
  drift_chain_category: Array<{
    chain_category: string;
    rows: number;
    needs_review_rate: number;
  }>;
  alerts: Array<{ level: string; code: string; message: string }>;
  scope: Record<string, unknown>;
};

export type BenchmarkRunRequest = {
  account_name: string;
  golden_path: string;
  created_from?: string;
  created_to?: string;
  job_ids?: string[];
  limit_jobs?: number;
};

export type BenchmarkRunResponse = {
  status: string;
  scope: Record<string, unknown>;
  metrics: {
    checked: number;
    exactitud_nombre: number;
    exactitud_promo_precio: number;
    recall_productos_validos: number;
    tasa_invento_proxy: number;
    tasa_needs_review: number;
    misses: Array<{ key: string; reason: string }>;
  };
};

export type BenchmarkJobMode = "performance_only" | "quality_with_golden";

export type BenchmarkCreateRequest = {
  image_paths: string[];
  image_file_ids: string[];
  account_name: string;
  config_name: string;
  mode: BenchmarkJobMode;
  golden_path?: string | null;
  concurrency?: number;
  max_retries_per_image?: number;
  timeout_sec?: number;
  output_name?: string | null;
  db_excel?: string | null;
  skip_qwen?: boolean | null;
  cadena?: string | null;
  export_excel?: boolean | null;
};

export type BenchmarkCreateResponse = {
  benchmark_id: string;
  job_id: string;
  status: string;
  account_name: string;
  mode: string;
  golden_path?: string | null;
  total_images: number;
};

export type BenchmarkRunRow = {
  benchmark_id: string;
  job_id: string;
  account_name: string;
  mode: string;
  status: string;
  golden_path?: string | null;
  total_images?: number;
  created_at?: string;
  updated_at?: string;
};

export type BenchmarkReportResponse = {
  benchmark?: Record<string, unknown>;
  job?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
  artifacts?: {
    master_json_url?: string | null;
    master_html_url?: string | null;
    excel_url?: string | null;
  };
  [key: string]: unknown;
};

export type BenchmarkAnalystPrompt = {
  version: number;
  is_active: boolean;
  model?: string | null;
  prompt?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BenchmarkAiReviewRow = {
  review_id: string;
  benchmark_id: string;
  job_id?: string;
  account_name?: string;
  model?: string | null;
  prompt_version?: number | null;
  input_source?: string | null;
  created_at?: string;
  response_json?: Record<string, unknown> | null;
};

export type BenchmarkAiEffectivenessSummary = {
  total_reviews: number;
  success_rate: number;
  empty_rate: number;
  parse_error_rate: number;
  hard_error_rate: number;
  avg_success_score: number;
};

export type BenchmarkAiEffectivenessByModel = BenchmarkAiEffectivenessSummary & {
  model: string;
};

export type BenchmarkAiEffectivenessResponse = {
  account_name: string;
  summary: BenchmarkAiEffectivenessSummary;
  by_model: BenchmarkAiEffectivenessByModel[];
};

export type BenchmarkAiReviewRunPayload = {
  account_name?: string;
  model?: string;
  master_json?: Record<string, unknown>;
  master_json_path?: string;
  notes?: string;
  prompt_version?: number;
  compact_mode?: boolean;
  max_prompt_chars?: number;
  max_chunks?: number;
  chunk_overlap_chars?: number;
};

export type BenchmarkAiReviewAsyncResponse = {
  status: string;
  benchmark_id: string;
  task_id: string;
  created_at?: string;
};

export type BenchmarkAiReviewTaskStatus = {
  task_id: string;
  benchmark_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | string;
  phase?:
    | "preparing"
    | "loading_input"
    | "compacting"
    | "chunking"
    | "processing_chunks"
    | "consolidating"
    | "saving_review"
    | "done"
    | "error"
    | string;
  progress_pct?: number;
  elapsed_ms?: number;
  eta_sec?: number;
  chunk_index?: number;
  chunk_total?: number;
  model?: string;
  updated_at?: string;
  warnings?: string[];
  error_detail?: string | null;
};

export type LLMSlotId = "ocr" | "vision" | "text_enrichment" | "semantic_match" | "benchmark_analyst";

export type LLMSlotBindingDraft = {
  provider_id: string;
  model?: string;
  base_url?: string | null;
  api_key_env?: string | null;
  enabled?: boolean;
  prompt_file?: string;
  timeout_sec?: number;
  max_retries?: number;
  retry_delay_sec?: number;
  temperature?: number;
  extra_options?: Record<string, unknown>;
};

export type LLMRoutingDraft = {
  enabled: boolean;
  fallback_to_legacy: boolean;
  slots: Partial<Record<LLMSlotId, LLMSlotBindingDraft>>;
};

export type LLMProviderCatalogItem = {
  provider_id: string;
  display_name: string;
  backend?: string;
  implementation_status?: "active" | "stub" | "planned" | string;
  default_base_url?: string | null;
  auth_style?: string;
  api_key_env_vars?: string[];
  openai_compatible?: boolean;
  capabilities_by_slot?: Record<string, Record<string, unknown>>;
};

export type LLMProvidersResponse = {
  providers: LLMProviderCatalogItem[];
  slots: Record<string, Record<string, unknown>>;
  default_template?: LLMRoutingDraft;
  env_flags?: Record<string, Record<string, unknown>>;
};

export type LLMRoutingResolvedSlot = {
  slot: LLMSlotId | string;
  provider_id?: string;
  model?: string;
  base_url?: string | null;
  api_key_env?: string | null;
  api_key_configured?: boolean;
  timeout_sec?: number;
  implementation_status?: string;
  would_use_factory?: boolean;
  active_execution_path?: string;
};

export type LLMRoutingReadResponse = {
  account_name: string;
  config_name: string;
  routing: {
    routing_globally_enabled?: boolean;
    routing_config_enabled?: boolean;
    fallback_to_legacy?: boolean;
    effective_execution?: string;
    note?: string;
    slots?: Record<string, LLMRoutingResolvedSlot>;
  };
};

export type LLMRoutingValidateResponse = {
  status: string;
  account_name: string;
  warnings?: string[];
  normalized?: LLMRoutingDraft;
};

export type DetectorLocalModelRow = {
  path: string;
  absolute_path?: string;
  filename?: string;
  size_bytes?: number;
};

export type DetectorLocalModelsResponse = {
  models: DetectorLocalModelRow[];
  recommended_custom_path?: string;
  notes?: string[];
};

export type DetectorStatusResponse = {
  ready?: boolean;
  mode?: string;
  dependencies?: Record<string, boolean>;
  local?: Record<string, unknown>;
  roboflow?: Record<string, unknown>;
  warnings?: string[];
  errors?: string[];
  [key: string]: unknown;
};

export type DetectorValidateRequest = {
  config_name?: string;
  check_model_load?: boolean;
  detection_config: Record<string, unknown>;
};

export type PreviewSessionStatus = "created" | "running" | "paused" | "stopping" | "stopped" | "completed" | "error";

export type PreviewCreateSessionRequest = {
  account_name: string;
  config_name?: string;
  id_pdv?: string;
  subcategoria?: string;
  usuario_relevo?: string;
  source: {
    type: "video_file" | "rtsp" | "webcam";
    path?: string;
    video_file_id?: string;
    url?: string;
    device_index?: number;
  };
  runtime?: {
    target_fps?: number;
    detector_mode?: string;
    detector_model_path?: string;
    yolo_confidence?: number;
    detector_every_n_frames?: number;
    detector_max_width?: number;
    use_vision_llm?: boolean;
    stream_mode?: "live" | "buffered" | string;
    stream_buffer_seconds?: number;
    stream_output_fps?: number;
    stream_min_frames?: number;
  };
  sampling?: {
    ocr_interval_ms?: number;
    llm_interval_ms?: number;
    min_crop_area?: number;
    retrigger_iou_delta?: number;
    ocr_prompt?: string;
  };
  enrichment?: {
    use_aliases?: boolean;
    use_rag?: boolean;
    use_semantic_llm?: boolean;
    use_text_enricher?: boolean;
    semantic_model?: string | null;
    rag_limit?: number;
  };
};

export type PreviewSession = {
  session_id: string;
  status: PreviewSessionStatus | string;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  account_name: string;
  id_pdv?: string | null;
  subcategoria?: string | null;
  usuario_relevo?: string | null;
  source: Record<string, unknown>;
  runtime: Record<string, unknown>;
  sampling: Record<string, unknown>;
  enrichment: Record<string, unknown>;
  metrics: {
    fps: number;
    frames_processed: number;
    yolo_inferences: number;
    ocr_inferences: number;
    llm_inferences: number;
    drop_frames: number;
    last_loop_ms: number;
    [k: string]: number;
  };
  active_tracks: number;
  latest_cursor: number;
  [k: string]: unknown;
};

export type PreviewEvent = {
  cursor?: number;
  type: string;
  session_id: string;
  ts: string;
  [k: string]: unknown;
};

export type PreviewSnapshotResponse = Record<string, unknown>;

export type PreviewMetricsResponse = {
  fps?: number;
  frames_processed?: number;
  yolo_inferences?: number;
  ocr_inferences?: number;
  llm_inferences?: number;
  semantic_llm_inferences?: number;
  drop_frames?: number;
  last_loop_ms?: number;
  [k: string]: unknown;
};

export type PreviewDiagnosticsResponse = {
  runtime_profile?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  bottleneck_hint?: { stage?: string; reason?: string; [k: string]: unknown };
  tracks?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  events_cursor?: number;
  [k: string]: unknown;
};

export type PreviewVideoUploadItem = {
  video_file_id: string;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
  storage_path?: string;
  created_by?: string;
  expires_at?: string;
  created_at?: string;
  account_name?: string;
};

export type PreviewVideoUploadResponse = {
  status: string;
  account_name: string;
  video_file_id: string;
  original_name?: string;
  mime_type?: string;
  size_bytes?: number;
  stored_path?: string;
  created_at?: string;
  expires_at?: string;
};

export type ChainAlias = {
  id: number;
  alias_text: string;
  source?: string | null;
  is_active: number | boolean;
};

export type ChainIgnoredPhrase = {
  id: number;
  phrase: string;
  scope: string;
  chain_whitelist?: string[];
  is_active: number | boolean;
  created_at?: string;
  updated_at?: string;
};

export type ChainPromptFiles = {
  ocr?: string | null;
  vision?: string | null;
  [key: string]: string | null | undefined;
};

export type ChainCatalogItem = {
  id: number;
  chain_code: string;
  display_name?: string | null;
  group_code?: string | null;
  is_active: number | boolean;
  priority?: number | null;
  aliases?: ChainAlias[];
  ignored_phrases?: ChainIgnoredPhrase[];
  prompt_files?: ChainPromptFiles;
};

export type ChainsListResponse = {
  account_name: string;
  chains: ChainCatalogItem[];
};

export type ChainUpsertRequest = {
  chain_code: string;
  display_name?: string | null;
  group_code?: string | null;
  is_active?: boolean;
  priority?: number;
};

export type ChainAliasUpsertRequest = {
  alias_text: string;
  source?: string | null;
  is_active?: boolean;
};

export type ChainIgnoredPhraseUpsertRequest = {
  phrase: string;
  scope?: string;
  is_active?: boolean;
};

export type AccountPromptSlot = "ocr" | "vision" | string;

export type AccountPromptFileItem = {
  prompt_file: string;
  slot?: AccountPromptSlot;
  updated_at?: string;
  created_at?: string;
  exists?: boolean;
};

export type AccountPromptListResponse = {
  account_name: string;
  slot: AccountPromptSlot;
  prompts: AccountPromptFileItem[];
};

export type AccountPromptReadResponse = {
  account_name: string;
  prompt_file: string;
  content: string;
  slot?: AccountPromptSlot;
  updated_at?: string;
  created_at?: string;
};

export type AccountPromptEnsureResponse = {
  status?: string;
  account_name?: string;
  chain_id?: number;
  slot?: AccountPromptSlot;
  prompt_file?: string;
  config_patch?: Record<string, unknown>;
  [key: string]: unknown;
};

export type AccountPromptsBootstrapRequest = {
  slots: Array<"ocr" | "vision" | string>;
  base_prompt_files: Record<string, string>;
  overwrite?: boolean;
  only_active_chains?: boolean;
  apply_config_patch?: boolean;
  config_name?: string;
  dry_run?: boolean;
};

export type AccountPromptsBootstrapResponse = {
  status?: string;
  account_name?: string;
  merged_config_patch?: Record<string, unknown>;
  chains_processed?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ChainResolvePreviewResponse = {
  account_name: string;
  resolved: boolean;
  match?: {
    chain_code?: string;
    display_name?: string;
    matched_alias?: string;
    resolution_source?: string;
  } | null;
};

export type ShelfConfidenceState = "high_confidence" | "medium_confidence" | "low_confidence" | "unknown_sku" | string;

export type CreateShelfJobRequest = {
  account_name: string;
  config_name?: string;
  id_pdv: string;
  image_file_ids?: string[];
  image_paths?: string[];
  processing_mode?: "recognition" | "crop_extraction" | string;
  subcategoria?: string;
  usuario_relevo?: string | null;
};

export type ShelfExtractedCrop = {
  crop_id?: string;
  image_id?: number | null;
  preview_url?: string | null;
  image_url?: string | null;
  download_url?: string | null;
  crop_image_filename?: string | null;
  storage_path?: string | null;
  tray_index?: number | null;
  order_in_tray?: number | null;
  position_in_tray?: number | null;
  global_order?: number | null;
  ordering_label?: string | null;
  bbox?: number[];
  width?: number | null;
  height?: number | null;
  detected_as?: string | null;
  quality?: {
    is_low_quality?: boolean;
    reasons?: string[];
    [key: string]: unknown;
  } | null;
  preview_available?: boolean;
  preview_unavailable_reason?: string | null;
  [key: string]: unknown;
};

export type ShelfCropDetailResponse = {
  status?: string;
  module?: string;
  job_id?: string;
  account_name?: string;
  crop?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ShelfCropDecisionResponse = {
  status?: string;
  job_id?: string;
  image_id?: number | string;
  crop_id?: string;
  [key: string]: unknown;
};

export type ShelfCropPromoteResponse = {
  status?: string;
  sku_id?: string | number | null;
  job_id?: string;
  image_id?: number | string;
  crop_id?: string;
  dataset_role?: string | null;
  dataset_split?: string | null;
  diagnostics?: ShelfDiagnostics | null;
  [key: string]: unknown;
};

export type ShelfJobExtractedCropGroup = {
  image_id?: number | null;
  shelf_group_id?: string | null;
  shelf_group_label?: string | null;
  source_image_name?: string | null;
  processing_mode?: string | null;
  total_items?: number | null;
  manifest_api_url?: string | null;
  download_all_api_url?: string | null;
  artifacts_api_url?: string | null;
  items?: ShelfExtractedCrop[];
  [key: string]: unknown;
};

export type ShelfJobExtractedCropsResponse = {
  job_id?: string;
  account_name?: string;
  grouping_mode?: string | null;
  group_label?: string | null;
  total_images?: number | null;
  total_items?: number | null;
  download_all_api_url?: string | null;
  batch_promote_api_url?: string | null;
  images?: ShelfJobExtractedCropGroup[];
  items?: ShelfExtractedCrop[];
  [key: string]: unknown;
};

export type CreateShelfJobResponse = {
  job_id: string;
  status: string;
  module?: string;
  queue_mode?: string;
  account_name?: string;
  id_pdv?: string;
  config_name?: string;
  total_images?: number;
};

export type ShelfJobRerunResponse = {
  status: string;
  job_module?: string;
  source_job_id?: string | null;
  rerun_of_job_id?: string | null;
  new_job_id: string;
  reused_inputs?: boolean;
  retry_count?: number;
  processing_mode?: string | null;
  test_mode?: string | null;
  force_refresh_reports?: boolean;
  message?: string;
};

export type ShelfCandidate = {
  sku_id?: number | string | null;
  sku_code?: string | null;
  sku_name?: string | null;
  score?: number | null;
  [key: string]: unknown;
};

export type ShelfResultItem = {
  image_id?: number;
  crop_id?: string;
  bbox?: number[];
  tray_index?: number | null;
  position_in_tray?: number | null;
  global_order?: number | null;
  ordering_label?: string | null;
  final_sku?: ShelfCandidate | Record<string, unknown> | null;
  top_candidates?: ShelfCandidate[];
  confidence?: number | null;
  score_delta?: number | null;
  confidence_state?: ShelfConfidenceState;
  review_required?: boolean;
  auto_accept_recommended?: boolean;
  manual_review_recommended?: boolean;
  confidence_thresholds?: {
    high_min?: number | null;
    high_delta?: number | null;
    medium_min?: number | null;
    medium_delta?: number | null;
    low_min?: number | null;
    [key: string]: unknown;
  } | null;
  embedding_diagnostics?: ShelfDiagnostics | null;
  [key: string]: unknown;
};

export type ShelfJobResultsResponse = {
  job_id?: string;
  status?: string;
  result_json?: {
    module?: string;
    summary?: Record<string, unknown>;
    results?: ShelfResultItem[];
    job_metadata?: Record<string, unknown>;
    image_artifacts?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ShelfSku = {
  id?: number;
  sku_id?: number | string;
  sku_code?: string;
  sku_name?: string;
  nombre?: string | null;
  brand?: string | null;
  marca?: string | null;
  family?: string | null;
  categoria?: string | null;
  variant?: string | null;
  formato?: string | null;
  size_text?: string | null;
  tamano?: string | null;
  barcode?: string | null;
  ean?: string | null;
  estado?: string | null;
  subcategoria?: string | null;
  segmento?: string | null;
  forma?: string | null;
  fabricante?: string | null;
  fragancia_variante?: string | null;
  pais?: string | null;
  grupo?: string | null;
  segmento_funcional?: string | null;
  category_cuenta?: string | null;
  x_ancho?: number | string | null;
  y_alto?: number | string | null;
  z_profundidad?: number | string | null;
  metadata?: Record<string, unknown> | null;
  is_active?: boolean | number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type ShelfSkuDeleteRequest = {
  dry_run: boolean;
  delete_sku?: boolean;
  delete_images?: boolean;
  delete_assets?: boolean;
  delete_files?: boolean;
  deactivate_embeddings?: boolean;
  rebuild_index?: boolean;
  config_name?: string;
  confirm?: string;
};

export type ShelfSkuDeleteResponse = {
  status?: string;
  account_name?: string;
  sku_id?: string | number | null;
  dry_run?: boolean;
  delete_mode?: string | null;
  physical_delete_files?: boolean;
    impact?: {
    sku?: Record<string, unknown> | null;
    images_total?: number;
    images_active?: number;
    assets_total?: number;
    assets_active?: number;
      embeddings_total?: number;
      embeddings_active?: number;
      models_impacted?: string[];
      file_candidates?: unknown[];
      [key: string]: unknown;
    } | null;
  changed?: {
    sku_deactivated?: boolean;
    images_deactivated?: number;
    assets_deactivated?: number;
    embeddings_deactivated?: number;
    [key: string]: unknown;
  } | null;
  deleted_files?: unknown[];
  rebuild_index?: boolean;
  rebuild_mode?: string | null;
  rebuild_result?: Record<string, unknown> | null;
  diagnostics?: ShelfDiagnostics | null;
  [key: string]: unknown;
};

export type ShelfEmbeddingsRecomputeRequest = {
  sku_id?: string;
  image_ids?: Array<number | string>;
  model_names?: string[];
  include_inactive_images?: boolean;
  rebuild_index?: boolean;
  config_name?: string;
  limit?: number;
};

export type ShelfEmbeddingsRecomputeItem = {
  image_id?: number | string;
  sku_id?: string | number | null;
  model_names?: string[];
  status?: string;
  diagnostics?: ShelfDiagnostics | null;
  [key: string]: unknown;
};

export type ShelfEmbeddingsRecomputeResponse = {
  status?: string;
  account_name?: string;
  sku_id?: string | null;
  image_ids?: Array<number | string>;
  model_names?: string[];
  used_models?: string[];
  processed_images?: number;
  failed_images?: number;
  items?: ShelfEmbeddingsRecomputeItem[];
  rebuild_index?: boolean;
  rebuild_result?: Record<string, unknown> | null;
  diagnostics?: ShelfDiagnostics | null;
  [key: string]: unknown;
};

export type ShelfSkuImage = {
  id?: number;
  image_id?: number;
  sku_id?: string | number | null;
  dataset_role?: string | null;
  dataset_split?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  public_url?: string | null;
  source_type?: string | null;
  content_hash?: string | null;
  is_active?: boolean | number;
  metadata?: Record<string, unknown> | null;
  updated_at?: string;
  preview_available?: boolean;
  preview_unavailable_reason?: string | null;
  image_url?: string | null;
  image_path?: string | null;
  file_id?: string | null;
  created_at?: string;
  [key: string]: unknown;
};

export type ShelfDiagnosticsIssue = {
  code?: string | null;
  message?: string | null;
  action_hint?: string | null;
};

export type ShelfDiagnosticsStage = {
  name?: string | null;
  status?: string | null;
  duration_ms?: number | null;
  code?: string | null;
};

export type ShelfDiagnosticsModels = {
  primary?: string | null;
  secondary?: string[];
  loaded_ok?: boolean;
  fallback_used?: boolean;
  loaded_models?: string[];
  failed_models?: string[];
  provider?: string | null;
};

export type ShelfDiagnostics = {
  request_id?: string | null;
  outcome_status?: "success" | "success_with_warnings" | "success_with_fallback" | "recoverable_error" | "failed" | string | null;
  summary_message?: string | null;
  stages?: ShelfDiagnosticsStage[];
  models?: ShelfDiagnosticsModels | null;
  warnings?: ShelfDiagnosticsIssue[];
  errors?: ShelfDiagnosticsIssue[];
  total_duration_ms?: number | null;
};

export type ShelfSkuImageResponse = ShelfSkuImage & {
  status?: string;
  account_name?: string;
  sku_id?: string | number | null;
  storage_path?: string | null;
  source_type?: string | null;
  content_hash?: string | null;
  embedding_ids?: string[];
  embedding_models?: string[];
  diagnostics?: ShelfDiagnostics | null;
};

export type ShelfDatasetRole = "reference_active" | "reference_extra" | "validation" | "reserve" | "rejected";

export type ShelfDatasetRolePatchResponse = {
  status?: string;
  account_name?: string;
  sku_id?: string | number | null;
  image_id?: number | string | null;
  dataset_role?: ShelfDatasetRole | string | null;
  dataset_split?: string | null;
  rebuild_index?: boolean;
  rebuild_result?: Record<string, unknown> | null;
  diagnostics?: ShelfDiagnostics | null;
  [key: string]: unknown;
};

export type ShelfHardNegative = {
  id?: number | string;
  sku_id?: string | number | null;
  negative_sku_id?: string | number | null;
  negative_sku_code?: string | null;
  negative_sku_name?: string | null;
  reason?: string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type ShelfDatasetSummaryResponse = {
  account_name?: string;
  sku_id?: string | null;
  totals?: {
    images?: number;
    indexable_images?: number;
    skus?: number;
    [key: string]: unknown;
  } | null;
  by_role?: Array<{
    dataset_role?: string | null;
    count?: number | null;
    indexable?: boolean | null;
    [key: string]: unknown;
  }>;
  by_split?: Array<{
    dataset_split?: string | null;
    count?: number | null;
    [key: string]: unknown;
  }>;
  by_sku?: Array<{
    sku_id?: string | null;
    sku_name?: string | null;
    count?: number | null;
    indexable_count?: number | null;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type ShelfAsset = {
  id?: number | string;
  asset_id?: number | string;
  account_name?: string;
  sku_id?: string | null;
  subcategoria?: string | null;
  asset_type?: string | null;
  original_name?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  public_url?: string | null;
  image_url?: string | null;
  storage_path?: string | null;
  size_bytes?: number | null;
  is_active?: boolean | number;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  preview_available?: boolean;
  preview_unavailable_reason?: string | null;
  [key: string]: unknown;
};

export type ShelfSkuTestJobResponse = {
  status?: string;
  module?: string;
  job_id: string;
  expected_sku_id?: string | null;
  test_mode?: string | null;
  recommended_next_steps?: string[];
  [key: string]: unknown;
};

export type ShelfEvaluateCropCandidate = {
  sku_id?: string | number | null;
  nombre?: string | null;
  categoria?: string | null;
  marca?: string | null;
  tamano?: string | null;
  score?: number | null;
  ranking_score?: number | null;
  visual_score?: number | null;
  score_breakdown?: Record<string, unknown> | null;
  per_model?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ShelfEvaluateCropResponse = {
  status?: string;
  module?: string;
  mode?: string;
  account_name?: string;
  suggested_sku_id?: string | null;
  final_sku?: string | Record<string, unknown> | null;
  confidence?: number | null;
  score_delta?: number | null;
  confidence_state?: string | null;
  models_used?: string[];
  missing_index_models?: string[];
  preview_url?: string | null;
  download_url?: string | null;
  public_url?: string | null;
  image_url?: string | null;
  preview_available?: boolean;
  preview_unavailable_reason?: string | null;
  top_candidates?: ShelfEvaluateCropCandidate[];
  embedding_diagnostics?: ShelfDiagnostics | null;
  duration_ms?: number | null;
  future_extensions?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ShelfOperationProgress = {
  percent?: number | null;
  current?: number | null;
  total?: number | null;
  step?: string | null;
};

export type ShelfOperationStatusResponse = {
  status?: string;
  operation_id?: string;
  operation_url?: string | null;
  progress?: ShelfOperationProgress | null;
  message?: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  [key: string]: unknown;
};

export type ShelfReliabilitySummaryResponse = {
  avg_reliability_score?: number | null;
  review_rate?: number | null;
  ambiguous_rate?: number | null;
  unknown_rate?: number | null;
  series?: Record<string, unknown> | null;
  tables?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ShelfReliabilityCompareResponse = {
  baseline_job_id?: string | null;
  candidate_job_id?: string | null;
  baseline?: Record<string, unknown> | null;
  candidate?: Record<string, unknown> | null;
  delta?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ShelfReviewQueueItem = {
  id?: number;
  item_id?: number;
  status?: string;
  decision?: string | null;
  confidence_state?: ShelfConfidenceState;
  predicted_sku_id?: number | null;
  predicted_sku_name?: string | null;
  crop_url?: string | null;
  image_id?: number | null;
  job_id?: string | null;
  reason?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};
