import { AccountSemanticKnowledgePage } from "@/components/semantic/account-semantic-knowledge-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountSemanticKnowledgePage account={account} />;
}
