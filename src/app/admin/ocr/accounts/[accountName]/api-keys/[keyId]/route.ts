import { NextRequest, NextResponse } from "next/server";
import { OcrApiRequestError, ocrAdminRequest, readAdminActor } from "@/lib/admin-ocr-api";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ accountName: string; keyId: string }> },
) {
  try {
    const { accountName, keyId } = await context.params;
    const actor = readAdminActor(request.headers);
    const data = await ocrAdminRequest(
      `/v1/accounts/${encodeURIComponent(accountName)}/api-keys/${encodeURIComponent(keyId)}`,
      { method: "DELETE" },
    );
    console.info(`[API-KEYS][DEACTIVATE] account=${accountName} actor=${actor} key_id=${keyId}`);
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
