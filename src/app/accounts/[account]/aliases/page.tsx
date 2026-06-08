import { AccountAliasesPage } from "@/components/semantic/account-aliases-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountAliasesPage account={account} />;
}
