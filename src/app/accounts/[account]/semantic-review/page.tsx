import { AccountSemanticReviewPage } from "@/components/semantic/account-semantic-review-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountSemanticReviewPage account={account} />;
}
