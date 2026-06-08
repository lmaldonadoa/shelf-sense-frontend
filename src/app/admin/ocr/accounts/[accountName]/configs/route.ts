import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, ocrAccountRequest, readAdminActor } from "@/lib/admin-ocr-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountName: string }> },
) {
  try {
    const { accountName } = await context.params;
    const accountApiKey = request.nextUrl.searchParams.get("account_api_key")?.trim() ?? "";
    const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
    if (!accountApiKey) {
      return NextResponse.json({ detail: "account_api_key es requerido." }, { status: 400 });
    }
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    const data = await ocrAccountRequest(accountApiKey, `/v1/accounts/${encodeURIComponent(accountName)}/configs${query}`, {
      method: "GET",
    });
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
      name: typeof body?.name === "string" ? body.name : "default",
      version: typeof body?.version === "string" || typeof body?.version === "number" ? body.version : "vX",
      is_active: typeof body?.is_active === "boolean" ? body.is_active : true,
      config: body?.config && typeof body.config === "object" ? body.config : {},
    };

    const data = await ocrAccountRequest(accountApiKey, `/v1/accounts/${encodeURIComponent(accountName)}/configs`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.info(`[OCR-BFF][CONFIG_CREATE] account=${accountName} actor=${actor} name=${payload.name} version=${payload.version}`);
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
