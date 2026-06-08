import { AccountLlmSettingsPage } from "@/components/settings/account-llm-settings-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountLlmSettingsPage account={account} />;
}

