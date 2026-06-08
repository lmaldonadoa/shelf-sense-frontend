import { NextRequest, NextResponse } from "next/server";
import {
  OcrApiRequestError,
  ocrAccountRequest,
  ocrAdminRequest,
  readAdminActor,
} from "@/lib/admin-ocr-api";

const DEFAULT_BOOTSTRAP_CONFIG = {
  detection_config: {
    mode: "roboflow_api",
    local_model_path: "models/best.pt",
    filters: {
      allowed_labels: ["promociones"],
      ignored_labels: [
        "etiquetas",
        "persona",
        "carrito",
        "percha",
        "producto",
        "productos",
      ],
      min_confidence: 0.4,
    },
    fallback_to_local_on_error: true,
  },
  qwen_vl: {
    model: "qwen3-vl:8b",
    prompt_file: "qwen3vl_prompt.txt",
    enabled_sources: ["primary"],
    timeout_sec: 90,
    max_retries: 1,
    retry_delay_sec: 3,
  },
  ocr_preprocess: {
    enabled: true,
    variants: ["original", "enhanced", "adaptive_threshold"],
    select_best: true,
    store_artifacts: true,
    contrast_alpha: 1.32,
    contrast_beta: 8,
    sharpen_strength: 1.0,
    adaptive_block_size: 29,
    adaptive_c: 6,
    jpeg_quality: 100,
  },
  text_enrichment: {
    enabled: true,
    semantic_rag: { enabled: true, limit: 8, rollout_mode: "apply" },
    semantic_scope_guardrails: { enabled: true },
    normalization_map: {},
  },
  support_labels: {
    enabled: true,
    label: "etiquetas",
    max_support_crops: 2,
    min_primary_products: 1,
    min_low_confidence_ratio: 0.6,
    memory_enabled: true,
    memory_ocr_enabled: true,
    memory_labels: ["etiquetas", "productos"],
    max_memory_crops: 2,
    memory_ocr_prompt: "Extrae todo el texto de la imagen.",
    debug_text_limit: 280,
    assist_primary_name_enabled: true,
    assist_only_when_low_confidence: false,
    assist_min_similarity: 0.45,
    assist_semantic_repair_enabled: true,
    assist_semantic_repair_only: false,
  },
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountName: string }> },
) {
  try {
    const { accountName } = await context.params;
    const actor = readAdminActor(request.headers);
    const body = await request.json().catch(() => ({}));

    const keyName =
      typeof body?.key_name === "string" && body.key_name.trim()
        ? body.key_name.trim()
        : "bootstrap-admin";
    const configName =
      typeof body?.config_name === "string" && body.config_name.trim()
        ? body.config_name.trim()
        : "default";
    const version =
      typeof body?.version === "string" || typeof body?.version === "number"
        ? body.version
        : "vX";
    const payloadConfig =
      body?.config && typeof body.config === "object"
        ? body.config
        : DEFAULT_BOOTSTRAP_CONFIG;

    const keyResp = (await ocrAdminRequest(
      `/v1/accounts/${encodeURIComponent(accountName)}/api-keys`,
      {
        method: "POST",
        body: JSON.stringify({ key_name: keyName, is_active: true }),
      },
    )) as Record<string, unknown>;

    const accountApiKey =
      typeof keyResp.secret_api_key === "string" ? keyResp.secret_api_key : "";
    if (!accountApiKey) {
      return NextResponse.json(
        { detail: "No se recibió secret_api_key en bootstrap." },
        { status: 500 },
      );
    }

    const configResp = await ocrAccountRequest(
      accountApiKey,
      `/v1/accounts/${encodeURIComponent(accountName)}/configs`,
      {
        method: "POST",
        body: JSON.stringify({
          name: configName,
          version,
          is_active: true,
          config: payloadConfig,
        }),
      },
    );

    console.info(
      `[OCR-BFF][ACCOUNT_BOOTSTRAP] account=${accountName} actor=${actor} config=${configName}`,
    );
    return NextResponse.json({
      status: "ok",
      account_name: accountName,
      api_key: keyResp,
      config: configResp,
      secret_api_key: accountApiKey,
      warning: "La secret_api_key solo se muestra una vez. Guárdala en vault.",
    });
  } catch (error) {
    if (error instanceof OcrApiRequestError) {
      return NextResponse.json(
        error.payload ?? {
          detail: error.message,
          code: error.code,
          status: error.status,
        },
        { status: error.status },
      );
    }
    const detail = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
