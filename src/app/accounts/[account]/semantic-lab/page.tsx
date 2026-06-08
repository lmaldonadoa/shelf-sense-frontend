import { AccountSemanticLabPage } from "@/components/semantic/account-semantic-lab-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountSemanticLabPage account={account} />;
}

