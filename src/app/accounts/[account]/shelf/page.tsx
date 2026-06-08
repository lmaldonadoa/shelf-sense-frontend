import { AccountShelfPage } from "@/components/shelf/account-shelf-page";

type Props = {
  params: Promise<{ account: string }>;
};

export default async function Page({ params }: Props) {
  const { account } = await params;
  return <AccountShelfPage account={decodeURIComponent(account)} />;
}

