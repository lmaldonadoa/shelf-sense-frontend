import { NextRequest, NextResponse } from "next/server";
import { getAccountApiKey } from "@/lib/admin-ocr-api";

const OCR_API_BASE_URL = process.env.OCR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

function accountFromPath(path: string[]) {
  const accountIdx = path.findIndex((part, idx) => part === "accounts" && Boolean(path[idx + 1]));
  return accountIdx >= 0 ? decodeURIComponent(path[accountIdx + 1]) : null;
}

async function accountFromRequest(request: NextRequest, path: string[]) {
  const fromPath = accountFromPath(path);
  if (fromPath) return fromPath;

  const fromHeader = request.headers.get("x-bff-account-name");
  if (fromHeader?.trim()) return fromHeader.trim();

  const fromQuery = request.nextUrl.searchParams.get("account_name");
  if (fromQuery) return fromQuery;

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.clone().json().catch(() => null);
      if (body && typeof body === "object" && typeof body.account_name === "string") return body.account_name;
    }
    // Do not parse multipart here to avoid consuming stream before forward().
    // For multipart requests we rely on x-bff-account-name/header/query.
  } catch {
    return null;
  }
  return null;
}

function authMessage(status: number, bodyText: string) {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const code = typeof parsed.code === "string" ? parsed.code : "";
    const detail = typeof parsed.detail === "string" ? parsed.detail : "";
    if (status === 401 && code === "auth_missing_api_key") return "API key faltante. Configura la key operativa de la cuenta.";
    if (status === 401 && code === "auth_invalid_api_key") return "API key invalida. Revisa la key operativa configurada.";
    if (status === 403 && code === "auth_account_inactive") return "La cuenta esta inactiva para esta API key.";
    if (status === 403 && code === "auth_account_scope_mismatch") return "La API key no tiene permisos para esta cuenta.";
    if (status === 403 && code === "auth_admin_key_forbidden") return "API_ADMIN_KEY no se puede usar en rutas operativas.";
    return detail || bodyText;
  } catch {
    return bodyText;
  }
}

function keyPrefix(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 8) return value;
  return `${value.slice(0, 8)}...`;
}

function shouldLogProxyRoute(path: string[], status: number) {
  if (status >= 400) return true;
  return path.at(-1) !== "metrics";
}

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const targetSearch = new URLSearchParams(request.nextUrl.searchParams);
  const accountName = await accountFromRequest(request, path);
  const isUploadsImagesRoute = path.length >= 3 && path[0] === "v1" && path[1] === "uploads" && path[2] === "images";
  const isPreviewVideoUploadRoute = path.length >= 4 && path[0] === "v1" && path[1] === "preview" && path[2] === "uploads" && path[3] === "video";
  if (accountName && (isUploadsImagesRoute || isPreviewVideoUploadRoute)) {
    targetSearch.set("account_name", accountName);
  }
  const targetQuery = targetSearch.toString();
  const targetPath = `/${path.join("/")}${targetQuery ? `?${targetQuery}` : ""}`;
  const targetUrl = `${OCR_API_BASE_URL}${targetPath}`;

  try {
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    const accept = request.headers.get("accept");
    const idempotencyKey = request.headers.get("idempotency-key");
    const requestId = request.headers.get("x-request-id");
    if (contentType) headers.set("content-type", contentType);
    if (accept) headers.set("accept", accept);
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
    if (requestId) headers.set("x-request-id", requestId);
    const accountApiKey = getAccountApiKey(accountName);
    headers.set("X-API-Key", accountApiKey);
    const isCreateJob = request.method.toUpperCase() === "POST" && path.length === 2 && path[0] === "v1" && path[1] === "jobs";
    if (isCreateJob && !headers.get("Idempotency-Key")) {
      headers.set("Idempotency-Key", crypto.randomUUID());
    }

    const method = request.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const isMultipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
    let body: BodyInit | undefined = undefined;
    let debugRequestBody: unknown = undefined;
    if (hasBody) {
      if (isMultipart) {
        const inputForm = await request.clone().formData();
        const outForm = new FormData();
        let hasAccountName = false;
        for (const [k, v] of inputForm.entries()) {
          if (k === "account_name" && typeof v === "string" && v.trim()) hasAccountName = true;
          outForm.append(k, v);
        }
        if (!hasAccountName && accountName && (isUploadsImagesRoute || isPreviewVideoUploadRoute)) {
          outForm.append("account_name", accountName);
        }
        // Let fetch set proper multipart boundary for upstream request.
        headers.delete("content-type");
        body = outForm;
        debugRequestBody = {
          multipart: true,
          fields: Array.from(inputForm.entries()).map(([k, v]) => [k, typeof v === "string" ? v : `[blob:${(v as File).name ?? "file"}]`]),
        };
      } else {
        const raw = await request.text();
        body = raw;
        try {
          debugRequestBody = JSON.parse(raw);
        } catch {
          debugRequestBody = raw;
        }
      }
    }

    if (isCreateJob) {
      console.info(
        `[OCR-BFF][CREATE_JOB][REQ] target_url=${targetUrl} account_name=${accountName ?? "-"} key_prefix=${keyPrefix(accountApiKey)} idempotency_key=${headers.get("Idempotency-Key") ?? "-"} body=${JSON.stringify(debugRequestBody ?? {})}`,
      );
    }

    const upstream = await fetch(targetUrl, { method, headers, body, cache: "no-store", redirect: "manual" });
    const upstreamContentType = upstream.headers.get("content-type") ?? "";
    const contentDisposition = upstream.headers.get("content-disposition");
    const upstreamRequestId = upstream.headers.get("x-request-id") ?? upstream.headers.get("x-correlation-id") ?? "";
    const responseHeaders = new Headers();
    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
    if (contentDisposition) responseHeaders.set("content-disposition", contentDisposition);
    if (upstreamRequestId) responseHeaders.set("x-request-id", upstreamRequestId);

    if (upstreamContentType.includes("application/json") || upstreamContentType.startsWith("text/")) {
      const bodyText = await upstream.text();
      let responseBody = bodyText;
      if ((upstream.status === 401 || upstream.status === 403) && upstreamContentType.includes("application/json")) {
        try {
          responseBody = JSON.stringify({ ...(JSON.parse(bodyText) as Record<string, unknown>), detail: authMessage(upstream.status, bodyText) });
        } catch {
          responseBody = JSON.stringify({ status: upstream.status, code: "auth_error", detail: authMessage(upstream.status, bodyText), retryable: false });
        }
      }
      if (isCreateJob) {
        console.info(
          `[OCR-BFF][CREATE_JOB][RES] status=${upstream.status} request_id=${upstreamRequestId || "-"} body=${bodyText}`,
        );
      }
      if (shouldLogProxyRoute(path, upstream.status)) {
        console.info(`[OCR-BFF] account=${accountName ?? "-"} route=${targetPath} status=${upstream.status} request_id=${upstreamRequestId || "-"}`);
      }
      return new NextResponse(responseBody, { status: upstream.status, headers: responseHeaders });
    }

    const bytes = await upstream.arrayBuffer();
    if (shouldLogProxyRoute(path, upstream.status)) {
      console.info(`[OCR-BFF] account=${accountName ?? "-"} route=${targetPath} status=${upstream.status} request_id=${upstreamRequestId || "-"} idempotency_key=${headers.get("Idempotency-Key") ?? "-"}`);
    }
    return new NextResponse(bytes, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error interno proxy OCR";
    console.warn(`[OCR-BFF] account=${accountName ?? "-"} route=${targetPath} status=500 detail=${detail}`);
    return NextResponse.json({ status: 500, code: "bff_proxy_error", detail, retryable: false }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context);
}
export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context);
}
export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context);
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context);
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forward(request, context);
}
