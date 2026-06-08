import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, requestAccount } from "@/lib/admin-ocr-api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const accountName = typeof body.account_name === "string" ? body.account_name.trim() : "";
  const limit = typeof body.limit === "number" ? body.limit : Number(body.limit ?? 20);

  if (!accountName) {
    return NextResponse.json({ status: 400, detail: "account_name es requerido.", retryable: false }, { status: 400 });
  }

  try {
    const qs = new URLSearchParams();
    qs.set("account_name", accountName);
    qs.set("limit", String(Number.isFinite(limit) ? limit : 20));
    const data = await requestAccount(accountName, `/v1/inbound/whatsapp/meta/process-pending?${qs.toString()}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof OcrApiRequestError) {
      return NextResponse.json(
        error.payload ?? { status: error.status, detail: error.message, code: error.code, retryable: false },
        { status: error.status },
      );
    }
    const detail = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ status: 500, detail, retryable: false }, { status: 500 });
  }
}
