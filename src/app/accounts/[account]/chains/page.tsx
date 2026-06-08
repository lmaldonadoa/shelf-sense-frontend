import { AccountChainsPage } from "@/components/semantic/account-chains-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountChainsPage account={account} />;
}

