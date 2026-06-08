import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, ocrAccountRequest } from "@/lib/admin-ocr-api";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountName: string }> },
) {
  try {
    const { accountName } = await context.params;
    const body = await request.json().catch(() => ({}));
    const accountApiKey = typeof body?.account_api_key === "string" ? body.account_api_key.trim() : "";
    if (!accountApiKey) {
      return NextResponse.json({ detail: "account_api_key es requerido." }, { status: 400 });
    }

    const healthRes = await fetch(`${process.env.OCR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080"}/health`, {
      method: "GET",
      cache: "no-store",
    });
    const health = await healthRes.json().catch(() => ({}));

    const authProbe = await ocrAccountRequest(
      accountApiKey,
      `/v1/accounts/${encodeURIComponent(accountName)}/configs/active?name=default`,
      { method: "GET" },
    );

    return NextResponse.json({
      status: "ok",
      health,
      authenticated_probe: authProbe,
    });
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
