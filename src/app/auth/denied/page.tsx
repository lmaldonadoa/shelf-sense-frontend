import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAuthState } from "@/lib/auth/server";
import { normalizeRoleLabel } from "@/lib/auth/roles";

export default async function AccessDeniedPage() {
  const auth = await getAuthState();

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center">
      <Card className="w-full border-amber-400/20 bg-black/30 shadow-2xl backdrop-blur-xl">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-100">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl text-white">Acceso restringido</CardTitle>
          <CardDescription className="text-slate-400">
            Tu sesión existe, pero no tiene permisos para esta vista.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {auth.session ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
              <p>
                Usuario: <span className="font-medium text-white">{auth.session.displayName}</span>
              </p>
              <p>
                Rol actual: <span className="font-medium text-white">{normalizeRoleLabel(auth.session.role)}</span>
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/">Volver al inicio</Link>
            </Button>
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="outline" className="border-white/15">
                Cerrar sesión
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
