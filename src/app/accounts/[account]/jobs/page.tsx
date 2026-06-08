import { AccountJobsHistoryPage } from "@/components/jobs-history/account-jobs-history-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountJobsHistoryPage account={account} />;
}

