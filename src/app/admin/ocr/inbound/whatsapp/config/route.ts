import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    verify_token_configured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    app_secret_configured: Boolean(process.env.WHATSAPP_WEBHOOK_APP_SECRET),
    access_token_configured: Boolean(process.env.WHATSAPP_META_ACCESS_TOKEN),
    default_inbound_account_name: process.env.DEFAULT_INBOUND_ACCOUNT_NAME ?? "colgate_ecuador",
    inbound_auto_process_enabled: String(process.env.INBOUND_AUTO_PROCESS_ENABLED ?? "false").toLowerCase() === "true",
  });
}
