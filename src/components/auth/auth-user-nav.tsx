"use client";

import Link from "next/link";
import { Shield, ShieldCheck, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { normalizeRoleLabel } from "@/lib/auth/roles";

export function AuthUserNav() {
  const { enabled, session } = useAuth();

  if (!enabled) {
    return (
      <div className="hidden items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 xl:flex">
        <ShieldCheck className="h-4 w-4" />
        Auth preparada, aun desactivada
      </div>
    );
  }

  if (!session) {
    return (
      <Button asChild size="sm" variant="outline" className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
        <Link href="/auth/login">
          <Shield className="mr-1.5 h-4 w-4" />
          Ingresar
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left xl:flex">
        <UserCircle2 className="h-4 w-4 text-cyan-200" />
        <div className="leading-tight">
          <p className="text-xs font-medium text-slate-100">{session.displayName}</p>
          <p className="text-[11px] text-slate-400">
            {normalizeRoleLabel(session.role)} · {session.email}
          </p>
        </div>
      </div>
      <form action="/api/auth/logout" method="post">
        <Button type="submit" size="sm" variant="outline" className="border-white/15">
          Salir
        </Button>
      </form>
    </div>
  );
}
