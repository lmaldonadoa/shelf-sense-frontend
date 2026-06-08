import { z } from "zod";
import type {
  AccountConfig,
  CreateAccountConfigRequest,
  CreateJobRequest,
  CreateJobResponse,
  JobEventsResponse,
  JobImage,
  JobResponse,
  JobResultsResponse,
  UploadResponse,
} from "@/types/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

const uploadItemSchema = z.object({
  file_id: z.string(),
  original_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number(),
  storage_path: z.string(),
  public_url: z.string().nullable(),
});

const uploadResponseSchema = z.object({ uploaded: z.array(uploadItemSchema) });

const createJobSchema = z
  .object({
    account_name: z.string().min(1),
    config_name: z.string().optional(),
    image_file_ids: z.array(z.string().min(1)).optional(),
    image_paths: z.array(z.string().min(1)).optional(),
    id_pdv: z.string().min(1),
    subcategoria: z.string().min(1),
    usuario_relevo: z.string().nullable().optional(),
    db_excel: z.string().nullable().optional(),
    output_name: z.string().nullable().optional(),
    skip_qwen: z.boolean().nullable().optional(),
    cadena: z.string().nullable().optional(),
    export_excel: z.boolean().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const hasFileIds = !!value.image_file_ids?.length;
    const hasPaths = !!value.image_paths?.length;
    if (!hasFileIds && !hasPaths) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes enviar image_file_ids o image_paths" });
    }
  });

const createJobResponseSchema = z.object({
  job_id: z.string(),
  message: z.string().optional(),
});

const detectionSchema = z
  .object({
    label: z.string().optional(),
    conf: z.number().optional(),
    confidence: z.number().optional(),
    box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  })
  .passthrough();

const jobImageSchema = z
  .object({
    image_name: z.string().optional(),
    status: z.string().optional(),
    file_id: z.string().nullable().optional(),
    original_name: z.string().nullable().optional(),
    annotated_image_path: z.string().nullable().optional(),
    detections: z.array(detectionSchema).optional(),
    detections_count: z.number().optional(),
    error: z.string().nullable().optional(),
  })
  .passthrough();

const jobResponseSchema = z
  .object({
    job_id: z.string(),
    status: z.string(),
    total_images: z.number().optional(),
    processed_images: z.number().optional(),
    failed_images: z.number().optional(),
    progress: z.number().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    error: z.string().optional(),
    images: z.array(jobImageSchema).optional(),
  })
  .passthrough();

const jobEventSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    timestamp: z.string().optional(),
    type: z.string().optional(),
    level: z.string().optional(),
    message: z.string().optional(),
    details: z.unknown().optional(),
  })
  .passthrough();

const jobEventsSchema = z.array(jobEventSchema);

const jobResultsSchema = z
  .object({
    job_id: z.string().optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    products: z.array(z.record(z.string(), z.unknown())).optional(),
    extracted_products: z.array(z.record(z.string(), z.unknown())).optional(),
    user_response: z.record(z.string(), z.unknown()).optional(),
    result_json: z.record(z.string(), z.unknown()).optional(),
    images: z.array(jobImageSchema).optional(),
    results: z.array(jobImageSchema).optional(),
  })
  .passthrough();

const accountConfigSchema = z.object({
  id: z.union([z.string(), z.number()]),
  account_name: z.string(),
  name: z.string(),
  version: z.string(),
  is_active: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const createAccountConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  is_active: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});

const healthSchema = z.object({ status: z.string().optional() }).passthrough();

type HealthResponse = z.infer<typeof healthSchema>;

function normalizeDetection(d: z.infer<typeof detectionSchema>) {
  const label = d.label ?? "-";
  const conf = d.conf ?? d.confidence ?? 0;
  const box = d.box ?? [0, 0, 0, 0];
  return { label, conf, box } as const;
}

function normalizeImage(raw: z.infer<typeof jobImageSchema>): JobImage {
  return {
    image_name: raw.image_name ?? raw.original_name ?? "image",
    status: raw.status ?? "unknown",
    file_id: raw.file_id ?? null,
    original_name: raw.original_name ?? raw.image_name ?? null,
    annotated_image_path: raw.annotated_image_path ?? null,
    detections: (raw.detections ?? []).map(normalizeDetection),
    detections_count: raw.detections_count ?? raw.detections?.length ?? 0,
    error: raw.error ?? null,
  };
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response.text();
  return response.json().catch(() => undefined);
}

function mapHttpError(status: number, fallbackError: string): string {
  if (status === 400) return "Solicitud inválida. Revisa datos o file_id.";
  if (status === 404) return "Recurso no encontrado o aún no disponible.";
  if (status === 413) return "Se excedió el tamaño o cantidad permitida de archivos.";
  if (status === 415) return "Tipo de archivo no soportado.";
  return fallbackError;
}

async function parseApiResponse<T>(response: Response, schema: z.ZodType<T>, fallbackError: string): Promise<T> {
  const body = await parseBody(response);
  if (!response.ok) {
    const backendMessage =
      typeof body === "object" && body && "message" in body && typeof body.message === "string" ? body.message : undefined;
    throw new ApiError(backendMessage ?? mapHttpError(response.status, fallbackError), response.status, body);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("La API devolvió un formato inesperado", response.status, parsed.error.flatten());
  return parsed.data;
}

async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>, fallbackError: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  return parseApiResponse(response, schema, fallbackError);
}

async function requestMultipart<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  return parseApiResponse(response, schema, fallbackError);
}

export const api = {
  getHealth: (): Promise<HealthResponse> => request("/health", { method: "GET" }, healthSchema, "No fue posible consultar health"),

  uploadImages: async (accountName: string, files: File[]): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append("account_name", accountName);
    files.forEach((file) => formData.append("files", file));

    return requestMultipart("/v1/uploads/images", { method: "POST", body: formData }, uploadResponseSchema, "No se pudo subir imágenes");
  },

  createJob: async (payload: CreateJobRequest): Promise<CreateJobResponse> => {
    const validated = createJobSchema.parse(payload);
    return request("/v1/jobs", { method: "POST", body: JSON.stringify(validated) }, createJobResponseSchema, "No se pudo crear el job");
  },

  getJob: async (jobId: string): Promise<JobResponse> => {
    const raw = await request(`/v1/jobs/${jobId}`, { method: "GET" }, jobResponseSchema, "No se pudo consultar el job");
    return { ...raw, images: (raw.images ?? []).map(normalizeImage) };
  },

  getJobEvents: (jobId: string): Promise<JobEventsResponse> =>
    request(`/v1/jobs/${jobId}/events`, { method: "GET" }, jobEventsSchema, "No se pudieron consultar eventos"),

  getJobResults: async (jobId: string): Promise<JobResultsResponse> => {
    const raw = await request(`/v1/jobs/${jobId}/results`, { method: "GET" }, jobResultsSchema, "No se pudieron consultar resultados");
    const nested = (raw.result_json && typeof raw.result_json === "object" ? raw.result_json : {}) as Record<string, unknown>;
    const userResponse =
      ((raw.user_response && typeof raw.user_response === "object" ? raw.user_response : undefined) as Record<string, unknown> | undefined) ??
      ((nested.user_response && typeof nested.user_response === "object" ? nested.user_response : undefined) as Record<string, unknown> | undefined);
    const normalizedProducts = Array.isArray(userResponse?.productos) ? (userResponse.productos as Record<string, unknown>[]) : undefined;
    const nestedProducts = Array.isArray(nested.productos) ? (nested.productos as Record<string, unknown>[]) : undefined;
    const images = (raw.images ?? raw.results ?? []).map(normalizeImage);
    return {
      job_id: raw.job_id,
      summary: raw.summary,
      products: normalizedProducts ?? raw.products ?? nestedProducts,
      extracted_products: raw.extracted_products,
      user_response: userResponse
        ? {
            id_pdv: typeof userResponse.id_pdv === "string" ? userResponse.id_pdv : undefined,
            subcategoria: typeof userResponse.subcategoria === "string" ? userResponse.subcategoria : undefined,
            usuario_relevo: typeof userResponse.usuario_relevo === "string" ? userResponse.usuario_relevo : null,
            productos: normalizedProducts ?? [],
          }
        : undefined,
      images,
    };
  },

  getAccountConfigs: (accountName: string, name?: string): Promise<AccountConfig[]> => {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return request(
      `/v1/accounts/${encodeURIComponent(accountName)}/configs${query}`,
      { method: "GET" },
      z.array(accountConfigSchema),
      "No se pudieron consultar configuraciones",
    );
  },

  getActiveAccountConfig: (accountName: string, name?: string): Promise<AccountConfig> => {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    return request(
      `/v1/accounts/${encodeURIComponent(accountName)}/configs/active${query}`,
      { method: "GET" },
      accountConfigSchema,
      "No se pudo consultar configuración activa",
    );
  },

  createAccountConfig: (accountName: string, payload: CreateAccountConfigRequest): Promise<AccountConfig> => {
    const validated = createAccountConfigSchema.parse(payload);
    return request(
      `/v1/accounts/${encodeURIComponent(accountName)}/configs`,
      { method: "POST", body: JSON.stringify(validated) },
      accountConfigSchema,
      "No se pudo crear configuración",
    );
  },

  activateAccountConfig: (accountName: string, configId: string | number) =>
    request(
      `/v1/accounts/${encodeURIComponent(accountName)}/configs/${encodeURIComponent(String(configId))}/activate`,
      { method: "POST" },
      z.object({ message: z.string().optional() }).passthrough(),
      "No se pudo activar configuración",
    ),
};

export function isFinalJobStatus(status: string): boolean {
  return ["completed", "failed", "cancelled", "canceled", "done", "error", "success"].includes(status.toLowerCase());
}

export function isHttpUrl(value?: string | null): boolean {
  if (!value) return false;
  return value.startsWith("http://") || value.startsWith("https://");
}

export function maskSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => (typeof v === "string" && v.includes("***") ? [k, "***"] : [k, v])),
  );
}
