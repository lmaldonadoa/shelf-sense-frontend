import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, getAccountApiKey, readAdminActor } from "@/lib/admin-ocr-api";

const OCR_API_BASE_URL = process.env.OCR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

function normalizeErrorPayload(body: unknown, fallback: string) {
  if (body && typeof body === "object") return body;
  if (typeof body === "string" && body.trim()) return { detail: body };
  return { detail: fallback };
}

async function readUpstreamBody(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountName: string }> },
) {
  try {
    const { accountName } = await context.params;
    const actor = readAdminActor(request.headers);
    const formData = await request.formData();
    const accountApiKey = String(formData.get("account_api_key") ?? "").trim();

    const proxyForm = new FormData();
    const incomingAccountName = String(formData.get("account_name") ?? "").trim();
    proxyForm.append("account_name", incomingAccountName || accountName);

    let fileCount = 0;
    for (const [key, value] of formData.entries()) {
      if (key === "account_api_key" || key === "account_name") continue;
      if ((key === "files" || key === "files[]" || key === "file") && typeof value !== "string") {
        const bytes = await value.arrayBuffer();
        const file = new File([bytes], value.name || "upload", { type: value.type || "application/octet-stream" });
        proxyForm.append("files", file, file.name);
        fileCount += 1;
      }
    }

    if (fileCount === 0) {
      return NextResponse.json(
        { status: 422, detail: "Debe enviar al menos un archivo en el campo files.", retryable: false },
        { status: 422 },
      );
    }

    const uploadUrl = `${OCR_API_BASE_URL}/v1/uploads/images?account_name=${encodeURIComponent(accountName)}`;
    const upstream = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-API-Key": accountApiKey || getAccountApiKey(accountName),
      },
      body: proxyForm,
      cache: "no-store",
    });
    const data = await readUpstreamBody(upstream);
    console.info(`[OCR-BFF][UPLOAD] account=${accountName} actor=${actor} files=${fileCount} status=${upstream.status}`);
    if (!upstream.ok) {
      return NextResponse.json(normalizeErrorPayload(data, "OCR API upload error"), { status: upstream.status });
    }
    return NextResponse.json(data ?? { uploaded: [] }, { status: upstream.status });
  } catch (error) {
    if (error instanceof OcrApiRequestError) {
      return NextResponse.json(
        error.payload ?? { detail: error.message, code: error.code, status: error.status },
        { status: error.status },
      );
    }
    const detail = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
