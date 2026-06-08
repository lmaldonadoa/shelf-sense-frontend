import { AccountJobDetailPage } from "@/components/jobs-history/account-job-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <AccountJobDetailPage jobId={jobId} />;
}
