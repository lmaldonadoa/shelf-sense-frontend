import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, ocrAccountRequest, readAdminActor } from "@/lib/admin-ocr-api";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountName: string; configId: string }> },
) {
  try {
    const { accountName, configId } = await context.params;
    const actor = readAdminActor(request.headers);
    const body = await request.json().catch(() => ({}));
    const accountApiKey = typeof body?.account_api_key === "string" ? body.account_api_key.trim() : "";
    if (!accountApiKey) return NextResponse.json({ detail: "account_api_key es requerido." }, { status: 400 });

    const data = await ocrAccountRequest(
      accountApiKey,
      `/v1/accounts/${encodeURIComponent(accountName)}/configs/${encodeURIComponent(configId)}/activate`,
      { method: "POST", body: JSON.stringify({}) },
    );
    console.info(`[OCR-BFF][CONFIG_ACTIVATE] account=${accountName} actor=${actor} config_id=${configId}`);
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
