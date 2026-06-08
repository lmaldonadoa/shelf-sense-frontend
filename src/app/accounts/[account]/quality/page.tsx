import { AccountQualityPage } from "@/components/quality/account-quality-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountQualityPage account={account} />;
}

