import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, ocrAccountRequest, readAdminActor } from "@/lib/admin-ocr-api";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountName: string }> },
) {
  try {
    const { accountName } = await context.params;
    const actor = readAdminActor(request.headers);
    const body = await request.json().catch(() => ({}));
    const accountApiKey = typeof body?.account_api_key === "string" ? body.account_api_key.trim() : "";
    if (!accountApiKey) return NextResponse.json({ detail: "account_api_key es requerido." }, { status: 400 });

    const payload = {
      ...body,
      account_name: accountName,
    };
    delete (payload as Record<string, unknown>).account_api_key;

    const data = await ocrAccountRequest(accountApiKey, "/v1/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.info(`[OCR-BFF][JOB_CREATE] account=${accountName} actor=${actor}`);
    return NextResponse.json(data);
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
