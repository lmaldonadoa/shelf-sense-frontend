import { AccountPreviewRealtimePage } from "@/components/preview/account-preview-realtime-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountPreviewRealtimePage account={account} />;
}

