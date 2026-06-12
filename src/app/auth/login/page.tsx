import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthState } from "@/lib/auth/server";

export default async function LoginPage() {
  const auth = await getAuthState();

  if (!auth.enabled) {
    redirect("/");
  }

  if (auth.session) {
    redirect("/");
  }

  return <LoginForm />;
}
