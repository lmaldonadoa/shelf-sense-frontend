import { AccountJobsMaintenancePage } from "@/components/jobs-history/account-jobs-maintenance-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountJobsMaintenancePage account={account} />;
}
