import { AccountInboundWhatsappPage } from "@/components/admin/account-inbound-whatsapp-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountInboundWhatsappPage account={account} />;
}
