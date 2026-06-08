import { NextResponse } from "next/server";

const OCR_API_BASE_URL = process.env.OCR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export async function POST() {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json(
      { status: 500, code: "whatsapp_verify_token_not_configured", detail: "WHATSAPP_WEBHOOK_VERIFY_TOKEN no configurado.", retryable: false },
      { status: 500 },
    );
  }

  try {
    const challenge = "123";
    const url = `${OCR_API_BASE_URL}/v1/inbound/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${encodeURIComponent(challenge)}`;
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ status: res.status, detail: text || "Handshake falló", retryable: false }, { status: res.status });
    }
    return NextResponse.json({ status: "ok", challenge_sent: challenge, challenge_received: text, verified: text === challenge });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ status: 500, code: "bff_verify_test_failed", detail, retryable: true }, { status: 500 });
  }
}
