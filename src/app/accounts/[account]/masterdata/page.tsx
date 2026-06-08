import { AccountMasterdataPage } from "@/components/masterdata/account-masterdata-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountMasterdataPage account={account} />;
}

