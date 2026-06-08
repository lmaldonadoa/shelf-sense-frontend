import { AccountPlaygroundPage } from "@/components/semantic/account-playground-page";

export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <AccountPlaygroundPage account={account} />;
}
