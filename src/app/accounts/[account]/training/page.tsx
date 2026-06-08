import { AccountTrainingPage } from "@/components/training/account-training-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountTrainingPage account={account} />;
}

