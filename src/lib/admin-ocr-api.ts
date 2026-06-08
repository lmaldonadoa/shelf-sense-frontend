const OCR_API_BASE_URL = process.env.OCR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export class OcrApiRequestError extends Error {
  status: number;
  code?: string;
  payload?: unknown;
  constructor(status: number, message: string, code?: string, payload?: unknown) {
    super(message);
    this.name = "OcrApiRequestError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function envKeyNameForAccount(accountName: string) {
  return `OCR_ACCOUNT_API_KEY_${accountName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function parseAccountKeysJson(): Record<string, string> {
  const raw = process.env.OCR_ACCOUNT_KEYS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
    );
  } catch {
    console.warn("[OCR-BFF] OCR_ACCOUNT_KEYS_JSON invalido; usando variables individuales.");
    return {};
  }
}

function getAdminApiKey(): string {
  const key = process.env.API_ADMIN_KEY;
  if (!key) {
    throw new Error("API_ADMIN_KEY no esta configurado en el backend administrativo.");
  }
  return key;
}

export function getAccountApiKey(accountName?: string | null): string {
  const normalized = accountName?.trim();
  const jsonMap = parseAccountKeysJson();
  const key =
    (normalized ? jsonMap[normalized] : undefined) ??
    (normalized ? process.env[envKeyNameForAccount(normalized)] : undefined) ??
    process.env.OCR_ACCOUNT_API_KEY ??
    process.env.ACCOUNT_API_KEY;
  if (!key) {
    throw new Error("No hay ACCOUNT_API_KEY configurada para esta cuenta en el backend administrativo.");
  }
  return key;
}

function mapAuthError(status: number, code: string, detail: string): string {
  if (status === 401 && code === "auth_missing_api_key") return "API key faltante. Configura la key operativa de la cuenta.";
  if (status === 401 && code === "auth_invalid_api_key") return "API key invalida. Revisa la key operativa configurada.";
  if (status === 403 && code === "auth_account_inactive") return "La cuenta esta inactiva para esta API key.";
  if (status === 403 && code === "auth_account_scope_mismatch") return "La API key no tiene permisos para esta cuenta.";
  if (status === 403 && code === "auth_admin_key_forbidden") return "API_ADMIN_KEY no se puede usar en rutas operativas.";
  return detail;
}

function normalizeDetail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first && typeof first === "object") {
        const row = first as { loc?: unknown; msg?: unknown };
        const msg = typeof row.msg === "string" ? row.msg : fallback;
        const loc = Array.isArray(row.loc) ? row.loc.map((x) => String(x)).join(".") : "";
        return loc ? `${loc}: ${msg}` : msg;
      }
      return JSON.stringify(detail);
    }
    if (detail && typeof detail === "object") return JSON.stringify(detail);
  }
  return fallback;
}

function isFormDataBody(body: RequestInit["body"]): body is FormData {
  return Boolean(body) && typeof body === "object" && typeof (body as FormData).append === "function";
}

async function parseResponse(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  if (!response.ok) {
    const detail = normalizeDetail(body, typeof body === "string" ? body : fallback);
    const code =
      body && typeof body === "object" && "code" in body
        ? String((body as Record<string, unknown>).code)
        : "";
    throw new OcrApiRequestError(response.status, mapAuthError(response.status, code, detail || fallback), code, body);
  }

  return body;
}

export async function requestAdmin(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && !isFormDataBody(init.body)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-API-Key", getAdminApiKey());

  const response = await fetch(`${OCR_API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  return parseResponse(response, "Error en OCR API");
}

export async function requestAccount(accountName: string | undefined | null, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && !isFormDataBody(init.body)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-API-Key", getAccountApiKey(accountName));

  const response = await fetch(`${OCR_API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  return parseResponse(response, "Error en OCR API");
}

export const ocrAdminRequest = requestAdmin;
export async function ocrAccountRequest(accountApiKeyOrAccountName: string, path: string, init: RequestInit = {}) {
  const looksLikeSecret = accountApiKeyOrAccountName.startsWith("dm_") || accountApiKeyOrAccountName.startsWith("sk_");
  if (!looksLikeSecret) return requestAccount(accountApiKeyOrAccountName, path, init);
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && !isFormDataBody(init.body)) headers.set("Content-Type", "application/json");
  headers.set("X-API-Key", accountApiKeyOrAccountName);
  const response = await fetch(`${OCR_API_BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
  return parseResponse(response, "Error en OCR API");
}

export function readAdminActor(headers: Headers): string {
  const actor = headers.get("x-admin-actor");
  if (actor && actor.trim()) return actor.trim();
  return "frontend-admin";
}
