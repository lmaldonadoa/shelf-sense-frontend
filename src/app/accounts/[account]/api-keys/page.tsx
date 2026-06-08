import { AccountApiKeysPage } from "@/components/admin/account-api-keys-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountApiKeysPage account={account} />;
}
