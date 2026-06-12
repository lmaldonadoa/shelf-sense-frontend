import type { OcrNoiseReviewConfig } from "@/types/ocr-api";

/**
 * Backend REST routes for ocr-noise-review-config are not exposed in all environments yet.
 * Enable only when GET/PATCH/reset-defaults are deployed.
 */
export function isOcrNoiseReviewConfigApiEnabled(): boolean {
  return (
    String(process.env.NEXT_PUBLIC_ENABLE_OCR_NOISE_REVIEW_CONFIG_API ?? "false").toLowerCase() ===
    "true"
  );
}

/** Reference seed for read-only preview while API is pending. Mirrors backend default v1. */
export const OCR_NOISE_REVIEW_CONFIG_PREVIEW: OcrNoiseReviewConfig = {
  product_anchors: [
    "ACEITE",
    "ANTIBACTERIAL",
    "AXION",
    "BARRA",
    "COLGATE",
    "CREMA",
    "DESINFECTANTE",
    "DESODORANTE",
    "DETERGENTE",
    "DOVE",
    "ENJUAGUE",
    "GEL",
    "JABON",
    "KALIPTO",
    "LADY",
    "LAVAPLATOS",
    "LIMPIADOR",
    "LUX",
    "NIVEA",
    "PALMOLIVE",
    "PASTA",
    "PROTEX",
    "SHAMPOO",
    "SPEED",
    "SPRAY",
    "SUAVITEL",
  ],
  function_word_tokens: ["DE", "DEL", "LA", "EL", "Y", "MAS", "MÁS", "AL", "UN", "UNA"],
  month_tokens: [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ],
  leading_fragment_anchor_regexes: ["\\bPRODUCTO\\b", "\\bCOD(?:IGO)?\\b"],
  leading_fragment_excluded_anchor_tokens: [
    "CORAL",
    "INTERMERCADOS",
    "HIPERMERCADOS",
    "MINIMERCADOS",
    "MISMERCADOS",
  ],
  phrase_useful_max_tokens: 6,
  phrase_useful_min_long_token_len: 4,
  phrase_useful_product_overlap_margin: 1,
  phrase_chunk_direct_max_tokens: 6,
  phrase_chunk_window_min_tokens: 2,
  phrase_chunk_window_max_tokens: 5,
  score_by_source_kind: {
    activity: 0.92,
    descripcion_header: 0.8,
    ocr_preview_header: 0.78,
    support_candidate: 0.5,
  },
  score_default: 0.55,
  score_occurrence_bonus_threshold: 2,
  score_occurrence_bonus: 0.06,
  score_token_bonus_min: 2,
  score_token_bonus_max: 4,
  score_token_bonus: 0.04,
  score_cap: 0.99,
};

export const OCR_NOISE_REVIEW_CONFIG_ENDPOINTS = {
  get: "/v1/accounts/{account_name}/ocr-noise-review-config",
  patch: "/v1/accounts/{account_name}/ocr-noise-review-config",
  reset: "/v1/accounts/{account_name}/ocr-noise-review-config/reset-defaults",
} as const;

export const OCR_NOISE_REVIEW_ACTIVE_ENDPOINTS = [
  "GET /v1/jobs/{job_id}/ignored-phrases/suggestions",
  "POST /v1/accounts/{account_name}/ignored-phrases/suggestions",
  "POST /v1/accounts/{account_name}/ignored-phrases",
] as const;