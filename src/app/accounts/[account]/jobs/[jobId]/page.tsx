import { AccountJobDetailPage } from "@/components/jobs-history/account-job-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ account: string; jobId: string }>;
}) {
  const { account, jobId } = await params;
  return <AccountJobDetailPage account={account} jobId={jobId} />;
}

