import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, ocrAdminRequest, readAdminActor } from "@/lib/admin-ocr-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountName: string }> },
) {
  try {
    const { accountName } = await context.params;
    const data = await ocrAdminRequest(`/v1/accounts/${encodeURIComponent(accountName)}/api-keys`, {
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
    const body = await request.json().catch(() => ({}));
    const actor = readAdminActor(request.headers);
    const payload = {
      key_name: typeof body?.key_name === "string" ? body.key_name : "",
      is_active: typeof body?.is_active === "boolean" ? body.is_active : true,
    };
    const data = await ocrAdminRequest(`/v1/accounts/${encodeURIComponent(accountName)}/api-keys`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.info(`[API-KEYS][CREATE] account=${accountName} actor=${actor} key_name=${payload.key_name}`);
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
