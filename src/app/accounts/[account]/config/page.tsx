import { AccountConfigPage } from "@/components/semantic/account-config-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountConfigPage account={account} />;
}
