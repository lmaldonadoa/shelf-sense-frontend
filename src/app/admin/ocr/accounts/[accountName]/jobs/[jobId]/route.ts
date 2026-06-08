import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, ocrAccountRequest } from "@/lib/admin-ocr-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ accountName: string; jobId: string }> },
) {
  try {
    const { jobId } = await context.params;
    const accountApiKey = request.headers.get("x-account-api-key")?.trim() ?? "";
    if (!accountApiKey) return NextResponse.json({ detail: "x-account-api-key es requerido." }, { status: 400 });
    const data = await ocrAccountRequest(accountApiKey, `/v1/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
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
