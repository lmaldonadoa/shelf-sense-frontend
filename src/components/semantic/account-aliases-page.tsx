"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { AliasRow, SemanticAliasRequest } from "@/types/ocr-api";
import { AliasesTable } from "@/components/semantic/aliases-table";
import { AliasEditorModal } from "@/components/semantic/alias-editor-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
const chainGroupHint = "Las cadenas equivalentes se agrupan automáticamente: Mi Comisariato, El Rosado, Hypermarket e Hipermarket.";

type AccountAliasesPageProps = {
  account: string;
};

function normalizeAliasArray(values?: string[]): string[] {
  if (!values?.length) return [];
  const map = new Map<string, string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!map.has(key)) map.set(key, value);
  }
  return Array.from(map.values());
}

export function AccountAliasesPage({ account }: AccountAliasesPageProps) {
  const [accountName, setAccountName] = useState(account);
  const [scope, setScope] = useState("product");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<AliasRow | null>(null);
  const [open, setOpen] = useState(false);

  const aliasesQuery = useQuery({ queryKey: ["semantic-aliases", accountName, scope], queryFn: () => ocrApi.listAliases(accountName, scope) });

  const upsertMutation = useMutation({
    mutationFn: (payload: SemanticAliasRequest) => ocrApi.upsertAlias(accountName, payload),
    onSuccess: () => {
      toast.success("Alias guardado");
      aliasesQuery.refetch();
      setOpen(false);
      setEditing(null);
    },
    onError: (error) => {
      toast.error("No se pudo guardar alias", { description: error instanceof HttpError ? error.message : "Error inesperado" });
    },
  });

  const filtered = useMemo(() => {
    const rows = aliasesQuery.data?.aliases ?? [];
    return rows.filter((r) => {
      const txt = `${r.alias} ${r.canonical}`.toLowerCase();
      const okText = !search.trim() || txt.includes(search.toLowerCase());
      const active = r.is_active === 1 || r.is_active === true;
      const okStatus = statusFilter === "all" || (statusFilter === "active" ? active : !active);
      return okText && okStatus;
    });
  }, [aliasesQuery.data?.aliases, search, statusFilter]);

  const duplicateSet = useMemo(() => {
    const map = new Set<string>();
    for (const r of aliasesQuery.data?.aliases ?? []) map.add(r.alias.toLowerCase());
    return map;
  }, [aliasesQuery.data?.aliases]);

  function handleSave(payload: SemanticAliasRequest) {
    const key = payload.alias.trim().toLowerCase();
    const editingKey = editing?.alias.toLowerCase();
    if (duplicateSet.has(key) && key !== editingKey) {
      toast.error("Alias duplicado", { description: "Ya existe ese alias (case-insensitive)." });
      return;
    }
    upsertMutation.mutate({
      ...payload,
      alias: payload.alias.trim(),
      canonical: payload.canonical.trim().toUpperCase(),
      scope: payload.scope?.trim() || "product",
      target_keywords: normalizeAliasArray(payload.target_keywords),
      chain_whitelist: normalizeAliasArray(payload.chain_whitelist),
    });
  }

  function toggleAlias(row: AliasRow) {
    upsertMutation.mutate({
      alias: row.alias,
      canonical: row.canonical,
      scope: row.scope,
      is_active: !(row.is_active === 1 || row.is_active === true),
      target_keywords: normalizeAliasArray(row.target_keywords),
      chain_whitelist: normalizeAliasArray(row.chain_whitelist),
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Diccionario Semántico</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2"><Label>account_name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></div>
          <div className="space-y-2"><Label>scope</Label><Input value={scope} onChange={(e) => setScope(e.target.value)} /></div>
          <div className="space-y-2"><Label>buscar</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="alias/canonical" /></div>
          <div className="space-y-2">
            <Label>estado</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm outline-none ring-cyan-400/40 focus:ring-2"
            >
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              <span>`Global`: sin target keywords/chain whitelist.</span>
              <span>`Condicional`: con restricciones por producto/cadena.</span>
              <span>{chainGroupHint}</span>
              <Link href={`/accounts/${encodeURIComponent(accountName)}/config`} className="rounded-full border border-white/15 px-2 py-1 text-[11px] font-medium hover:bg-white/10">
                Ir a configuración OCR
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Aliases</CardTitle><Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Nuevo alias</Button></CardHeader>
        <CardContent>
          {aliasesQuery.isLoading ? <p className="text-sm text-muted-foreground">Cargando aliases...</p> : null}
          <AliasesTable aliases={filtered} onEdit={(row) => { setEditing(row); setOpen(true); }} onToggle={toggleAlias} />
        </CardContent>
      </Card>

      <AliasEditorModal open={open} initial={editing} onClose={() => { setOpen(false); setEditing(null); }} onSave={handleSave} />
    </div>
  );
}
