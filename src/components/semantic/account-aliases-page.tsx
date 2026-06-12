"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { AliasRow, SemanticAliasRequest } from "@/types/ocr-api";
import { AliasesTable } from "@/components/semantic/aliases-table";
import { AliasEditorModal } from "@/components/semantic/alias-editor-modal";
import {
  TrainingCountBadge,
  TrainingFooterNote,
  TrainingListShell,
  TrainingSectionHero,
} from "@/components/training/training-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const chainGroupHint = "Mi Comisariato, El Rosado, Hypermarket e Hipermarket se agrupan automaticamente.";

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

function aliasPayloadFromRow(row: AliasRow, patch?: Partial<SemanticAliasRequest>): SemanticAliasRequest {
  return {
    alias: row.alias,
    canonical: row.canonical,
    scope: row.scope,
    is_active: row.is_active === 1 || row.is_active === true,
    target_keywords: normalizeAliasArray(row.target_keywords),
    chain_whitelist: normalizeAliasArray(row.chain_whitelist),
    ...patch,
  };
}

export function AccountAliasesPage({ account }: AccountAliasesPageProps) {
  const [accountName, setAccountName] = useState(account);
  const [scopeFilter, setScopeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [editing, setEditing] = useState<AliasRow | null>(null);
  const [open, setOpen] = useState(false);

  const aliasesQuery = useQuery({
    queryKey: ["semantic-aliases", accountName, scopeFilter || "all"],
    queryFn: () => ocrApi.listAliases(accountName, scopeFilter),
  });

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

  const rows = aliasesQuery.isError ? [] : (aliasesQuery.data?.aliases ?? []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const txt = `${r.alias} ${r.canonical} ${r.scope}`.toLowerCase();
      const okText = !search.trim() || txt.includes(search.toLowerCase());
      const active = r.is_active === 1 || r.is_active === true;
      const okStatus = statusFilter === "all" || (statusFilter === "active" ? active : !active);
      return okText && okStatus;
    });
  }, [rows, search, statusFilter]);

  const activeCount = useMemo(() => rows.filter((r) => r.is_active === 1 || r.is_active === true).length, [rows]);

  const duplicateSet = useMemo(() => {
    const map = new Set<string>();
    for (const r of rows) map.add(`${r.alias.toLowerCase()}::${(r.scope || "product").toLowerCase()}`);
    return map;
  }, [rows]);

  const loadErrorMessage =
    aliasesQuery.error instanceof HttpError
      ? aliasesQuery.error.message
      : aliasesQuery.isError
        ? "No se pudieron cargar los aliases."
        : null;

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: AliasRow) {
    setEditing(row);
    setOpen(true);
  }

  function handleSave(payload: SemanticAliasRequest) {
    const scope = payload.scope?.trim() || "product";
    const key = `${payload.alias.trim().toLowerCase()}::${scope.toLowerCase()}`;
    const editingKey = editing ? `${editing.alias.toLowerCase()}::${(editing.scope || "product").toLowerCase()}` : null;
    if (duplicateSet.has(key) && key !== editingKey) {
      toast.error("Alias duplicado", { description: "Ya existe ese alias con el mismo scope." });
      return;
    }
    upsertMutation.mutate({
      ...payload,
      alias: payload.alias.trim(),
      canonical: payload.canonical.trim().toUpperCase(),
      scope,
      is_active: payload.is_active !== false,
      target_keywords: normalizeAliasArray(payload.target_keywords),
      chain_whitelist: normalizeAliasArray(payload.chain_whitelist),
    });
  }

  function toggleAlias(row: AliasRow) {
    const active = row.is_active === 1 || row.is_active === true;
    upsertMutation.mutate(aliasPayloadFromRow(row, { is_active: !active }));
  }

  function deactivateAlias(row: AliasRow) {
    const active = row.is_active === 1 || row.is_active === true;
    if (!active) {
      toast.message("El alias ya esta desactivado");
      return;
    }
    if (!window.confirm(`¿Desactivar el alias "${row.alias}"? Dejara de aplicarse en jobs nuevos.`)) return;
    upsertMutation.mutate(aliasPayloadFromRow(row, { is_active: false }));
  }

  return (
    <div className="space-y-4 pb-6">
      <TrainingSectionHero
        tone="emerald"
        icon={<Link2 className="h-4 w-4" />}
        title="Aliases de resolucion"
        description="Mapeo directo OCR → canonico. Diferente de aliases de nombre de cadena en Catalogo y de reglas RAG en Conocimiento semantico."
        badges={
          <>
            <Badge variant="outline" className="border-emerald-400/30 text-[10px] text-emerald-100">
              {accountName}
            </Badge>
            <TrainingCountBadge count={rows.length} label="alias" tone="emerald" />
            <TrainingCountBadge count={activeCount} label="activo" tone="emerald" />
          </>
        }
        kpis={[
          { label: "Total", value: rows.length },
          { label: "Activos", value: activeCount },
          { label: "Inactivos", value: rows.length - activeCount },
          { label: "Visibles", value: filtered.length },
        ]}
        footer={
          <p className="text-[11px] text-emerald-100/80">
            Crear · editar canonico/keywords/cadenas · activar o desactivar. {chainGroupHint}
          </p>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar alias o canonico..."
            className="h-9 border-white/10 bg-black/25 pl-8"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="h-9 rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Solo activos</option>
          <option value="inactive">Solo inactivos</option>
        </select>
        <Button size="sm" variant="outline" className="h-9" onClick={() => setShowAdvancedFilters((v) => !v)}>
          Filtros
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={() => aliasesQuery.refetch()} disabled={aliasesQuery.isFetching}>
          {aliasesQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Nuevo alias
        </Button>
      </div>

      {showAdvancedFilters ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Cuenta</Label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="h-9 border-white/10 bg-black/25" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Scope (filtro API)</Label>
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white"
              >
                <option value="">Todos los scopes</option>
                <option value="product">product</option>
                <option value="name">name</option>
                <option value="all">all</option>
              </select>
            </div>
            <div className="flex items-end">
              <Link
                href={`/accounts/${encodeURIComponent(accountName)}/config`}
                className="inline-flex h-9 items-center rounded-md border border-white/15 px-3 text-xs text-slate-200 hover:bg-white/10"
              >
                Config OCR
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {loadErrorMessage ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{loadErrorMessage}</div>
      ) : null}

      <TrainingListShell
        loading={aliasesQuery.isLoading}
        empty={!aliasesQuery.isError && !filtered.length}
        emptyMessage={
          aliasesQuery.isError
            ? "Corrige el error de carga para ver los aliases."
            : "No hay aliases. Crea el primero con «Nuevo alias»."
        }
      >
        <div className="divide-y divide-white/5">
          {filtered.map((row) => {
            const active = row.is_active === 1 || row.is_active === true;
            return (
              <div key={row.id} className={`px-4 py-3 hover:bg-white/[0.02] ${!active ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-white">{row.alias}</p>
                      <span className="text-slate-500">→</span>
                      <p className="font-mono text-sm text-emerald-200">{row.canonical}</p>
                      <Badge variant="outline" className="h-5 text-[10px]">
                        {row.scope}
                      </Badge>
                      <Badge variant={active ? "default" : "secondary"} className="h-5 text-[10px]">
                        {active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      #{row.id}
                      {row.updated_at ? ` · ${row.updated_at}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(row)} disabled={upsertMutation.isPending}>
                      <Pencil className="mr-1 h-3 w-3" />
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleAlias(row)} disabled={upsertMutation.isPending}>
                      {active ? "Desactivar" : "Activar"}
                    </Button>
                    {active ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-rose-300 hover:text-rose-200"
                        onClick={() => deactivateAlias(row)}
                        disabled={upsertMutation.isPending}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Eliminar
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {(row.target_keywords ?? []).length > 0 ? (
                    row.target_keywords?.map((kw) => (
                      <Badge key={`${row.id}-kw-${kw}`} variant="outline" className="h-4 border-cyan-400/30 text-[9px] text-cyan-100">
                        {kw}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="h-4 text-[9px] text-slate-400">
                      keywords: global
                    </Badge>
                  )}
                  {(row.chain_whitelist ?? []).length > 0 ? (
                    row.chain_whitelist?.map((chain) => (
                      <Badge key={`${row.id}-ch-${chain}`} variant="outline" className="h-4 border-emerald-400/30 text-[9px] text-emerald-100">
                        {chain}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="h-4 text-[9px] text-slate-400">
                      cadenas: todas
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TrainingListShell>

      {filtered.length > 0 ? (
        <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-300">Tabla avanzada</summary>
          <div className="mt-3">
            <AliasesTable
              aliases={filtered}
              onEdit={openEdit}
              onToggle={toggleAlias}
              onDeactivate={deactivateAlias}
            />
          </div>
        </details>
      ) : null}

      <TrainingFooterNote>
        POST /aliases crea o actualiza por clave alias+scope. No hay DELETE en backend: «Eliminar» desactiva el alias (is_active=false).
      </TrainingFooterNote>

      <AliasEditorModal
        open={open}
        initial={editing}
        saving={upsertMutation.isPending}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}