import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, requestAccount } from "@/lib/admin-ocr-api";

export async function GET(request: NextRequest) {
  const accountName = request.nextUrl.searchParams.get("account_name") ?? "";
  const status = request.nextUrl.searchParams.get("status") ?? "";
  const limit = request.nextUrl.searchParams.get("limit") ?? "50";

  if (!accountName.trim()) {
    return NextResponse.json({ status: 400, detail: "account_name es requerido.", retryable: false }, { status: 400 });
  }

  try {
    const qs = new URLSearchParams();
    qs.set("account_name", accountName);
    if (status) qs.set("status", status);
    if (limit) qs.set("limit", limit);
    const data = await requestAccount(accountName, `/v1/inbound/whatsapp/meta/events?${qs.toString()}`, { method: "GET" });
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
