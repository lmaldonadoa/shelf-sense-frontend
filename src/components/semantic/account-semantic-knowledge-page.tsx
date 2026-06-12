"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { SemanticKnowledgeEntry, SemanticKnowledgeUpsertRequest } from "@/types/ocr-api";
import { TagsInput } from "@/components/semantic/tags-input";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const entryTypes = ["note", "abbreviation_rule", "chain_rule", "category_rule", "product_context", "correction_hint"];
const ruleStatuses = ["draft", "canary", "active", "paused", "deprecated"];
const chainSuggestions = ["mi comisariato", "el rosado", "hypermarket", "hipermarket", "aki", "supermaxi", "megamaxi", "gran aki"];

const ENTRY_TYPE_LABELS: Record<string, string> = {
  note: "Nota",
  abbreviation_rule: "Abreviatura",
  chain_rule: "Cadena",
  category_rule: "Categoria",
  product_context: "Contexto producto",
  correction_hint: "Pista correccion",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "border-slate-400/30 bg-slate-500/10 text-slate-200",
  canary: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  active: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  paused: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  deprecated: "border-zinc-400/30 bg-zinc-500/10 text-zinc-300",
};

type PageView = "rules" | "probe" | "metrics";

type AccountSemanticKnowledgePageProps = {
  account: string;
};

function emptyForm(): SemanticKnowledgeUpsertRequest {
  return {
    title: "",
    content: "",
    entry_type: "abbreviation_rule",
    chain: "",
    category: "",
    tags: [],
    priority: 5,
    is_active: true,
    status: "draft",
    owner: "",
    confidence_target: 0.9,
    created_from_case: "",
    negative_examples: [],
    rollout_scope: { chains: [] },
    success_metrics: { min_precision_est: 0.85, max_needs_review_rate: 0.2 },
    rule_version: 1,
  };
}

function normalizeTags(values?: string[]): string[] {
  if (!values?.length) return [];
  const set = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (set.has(key)) continue;
    set.add(key);
    out.push(v);
  }
  return out;
}

function rowToPayload(row: SemanticKnowledgeEntry, patch?: Partial<SemanticKnowledgeUpsertRequest>): SemanticKnowledgeUpsertRequest {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    entry_type: row.entry_type,
    chain: row.chain ?? "",
    category: row.category ?? "",
    tags: row.tags ?? [],
    priority: typeof row.priority === "number" ? row.priority : 5,
    is_active: row.is_active === 1 || row.is_active === true,
    status: row.status ?? "draft",
    owner: row.owner ?? "",
    confidence_target: typeof row.confidence_target === "number" ? row.confidence_target : 0.9,
    created_from_case: row.created_from_case ?? "",
    negative_examples: row.negative_examples ?? [],
    rollout_scope: row.rollout_scope ?? { chains: [] },
    success_metrics: row.success_metrics ?? { min_precision_est: 0.85, max_needs_review_rate: 0.2 },
    rule_version: typeof row.rule_version === "number" ? row.rule_version : 1,
    ...patch,
  };
}

function ViewPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const key = (status ?? "draft").toLowerCase();
  return (
    <Badge variant="outline" className={`h-5 text-[10px] capitalize ${STATUS_STYLES[key] ?? STATUS_STYLES.draft}`}>
      {key}
    </Badge>
  );
}

function SelectField({
  id,
  label,
  hint,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-slate-300">
        {label}
      </Label>
      {hint ? <p className="text-[10px] text-slate-500">{hint}</p> : null}
      <select
        id={id}
        className="h-9 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm outline-none ring-cyan-400/40 focus:ring-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditorSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-slate-100"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open ? <div className="space-y-3 border-t border-white/5 px-3 pb-3 pt-2">{children}</div> : null}
    </div>
  );
}

export function AccountSemanticKnowledgePage({ account }: AccountSemanticKnowledgePageProps) {
  const [accountName, setAccountName] = useState(account);
  const [view, setView] = useState<PageView>("rules");
  const [showFilters, setShowFilters] = useState(false);

  const [entryType, setEntryType] = useState("");
  const [chainFilter, setChainFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [rolloutMode, setRolloutMode] = useState<"apply" | "shadow">("apply");
  const [metricsDays, setMetricsDays] = useState("7");
  const [searchText, setSearchText] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SemanticKnowledgeUpsertRequest>(emptyForm());

  const [probeText, setProbeText] = useState("");
  const [probeChain, setProbeChain] = useState("");
  const [probeCategory, setProbeCategory] = useState("");

  const listQuery = useQuery({
    queryKey: ["semantic-knowledge", accountName, entryType, chainFilter, categoryFilter, activeOnly, statusFilter, rolloutMode],
    queryFn: () =>
      ocrApi.listSemanticKnowledge(accountName, {
        entryType: entryType || undefined,
        chain: chainFilter || undefined,
        category: categoryFilter || undefined,
        activeOnly,
        status: statusFilter || undefined,
        rolloutMode,
      }),
  });

  const searchQuery = useQuery({
    queryKey: ["semantic-knowledge-search", accountName, probeText, probeChain, probeCategory, rolloutMode],
    queryFn: () =>
      ocrApi.searchSemanticKnowledge(accountName, {
        q: probeText,
        chain: probeChain || undefined,
        category: probeCategory || undefined,
        limit: 8,
        rolloutMode,
      }),
    enabled: false,
  });

  const metricsQuery = useQuery({
    queryKey: ["semantic-knowledge-metrics", accountName, metricsDays],
    queryFn: () => {
      const days = Number(metricsDays) || 7;
      const now = new Date();
      const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return ocrApi.getSemanticKnowledgeMetrics(accountName, {
        createdFrom: from.toISOString(),
        createdTo: now.toISOString(),
        limitJobs: 200,
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: SemanticKnowledgeUpsertRequest) => ocrApi.upsertSemanticKnowledge(accountName, payload),
    onSuccess: () => {
      toast.success(editingId ? "Regla actualizada" : "Regla creada");
      listQuery.refetch();
      metricsQuery.refetch();
      closeEditor();
    },
    onError: (error) => {
      toast.error("No se pudo guardar", { description: error instanceof HttpError ? error.message : "Error inesperado" });
    },
  });

  const rows = useMemo(() => listQuery.data?.items ?? [], [listQuery.data?.items]);
  const textFiltered = useMemo(() => {
    if (!searchText.trim()) return rows;
    const q = searchText.toLowerCase();
    return rows.filter((row) =>
      `${row.title} ${row.content} ${row.entry_type} ${row.chain ?? ""} ${row.category ?? ""} ${(row.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, searchText]);

  const activeCount = useMemo(() => rows.filter((r) => r.is_active === 1 || r.is_active === true).length, [rows]);
  const canaryCount = useMemo(() => rows.filter((r) => (r.status ?? "").toLowerCase() === "canary").length, [rows]);

  const loadErrorMessage =
    listQuery.error instanceof HttpError
      ? listQuery.error.message
      : listQuery.isError
        ? "No se pudieron cargar las reglas."
        : null;

  const activeFilterCount = [entryType, chainFilter, categoryFilter, statusFilter].filter(Boolean).length + (activeOnly ? 1 : 0);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpen(true);
  }

  function editRow(row: SemanticKnowledgeEntry) {
    if (!Number.isFinite(row.id) || row.id <= 0) {
      toast.error("No se puede editar esta entrada", { description: "ID invalido en respuesta backend." });
      return;
    }
    setEditingId(row.id);
    setForm(rowToPayload(row));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  async function submitForm() {
    if (form.title.trim().length < 3) {
      toast.error("Titulo requerido (minimo 3 caracteres)");
      return;
    }
    if (form.content.trim().length < 10) {
      toast.error("Contenido requerido (minimo 10 caracteres)");
      return;
    }
    const forceId = editingId ?? (typeof form.id === "number" ? form.id : undefined);
    if (editingId && (!Number.isFinite(forceId) || (forceId ?? 0) <= 0)) {
      toast.error("No se puede guardar edicion", { description: "Falta ID valido para update." });
      return;
    }
    if (!ruleStatuses.includes(String(form.status ?? ""))) {
      toast.error("Estado invalido");
      return;
    }
    if (Number(form.confidence_target ?? 0) < 0 || Number(form.confidence_target ?? 0) > 1) {
      toast.error("confidence_target debe estar entre 0 y 1");
      return;
    }
    if (Number(form.rule_version ?? 0) < 1) {
      toast.error("rule_version debe ser >= 1");
      return;
    }
    if ((form.status ?? "") === "canary") {
      const chains = Array.isArray((form.rollout_scope as Record<string, unknown> | undefined)?.chains)
        ? ((form.rollout_scope as Record<string, unknown>).chains as unknown[])
        : [];
      if (!chains.length) {
        toast.error("rollout_scope.chains es obligatorio cuando status=canary");
        return;
      }
    }
    if ((form.status ?? "") === "active" && !window.confirm("Vas a guardar una regla en estado ACTIVE. ¿Confirmas?")) {
      return;
    }

    const payload: SemanticKnowledgeUpsertRequest = {
      ...form,
      ...(forceId ? { id: forceId } : {}),
      tags: normalizeTags(form.tags),
      priority: Number(form.priority ?? 0),
      confidence_target: Number(form.confidence_target ?? 0),
      rule_version: Number(form.rule_version ?? 1),
      negative_examples: normalizeTags(form.negative_examples),
    };

    try {
      const duplicateCheck = await ocrApi.checkSemanticKnowledgeDuplicates(accountName, payload);
      if (duplicateCheck.has_duplicates) {
        const titles = (duplicateCheck.duplicates ?? [])
          .map((d) => d.title || `id:${d.id ?? "?"}`)
          .slice(0, 3)
          .join(", ");
        const proceed = window.confirm(
          `Se detectaron posibles duplicados (${titles || "sin titulo"}). ¿Guardar de todas formas?`,
        );
        if (!proceed) return;
      }
    } catch (error) {
      toast.error("No se pudo validar duplicados", {
        description: error instanceof HttpError ? error.message : "Error inesperado",
      });
      return;
    }

    saveMutation.mutate(payload);
  }

  function toggleActive(row: SemanticKnowledgeEntry) {
    saveMutation.mutate(rowToPayload(row, { is_active: !(row.is_active === 1 || row.is_active === true) }));
  }

  function quickChangeStatus(row: SemanticKnowledgeEntry, nextStatus: string) {
    saveMutation.mutate(rowToPayload(row, { status: nextStatus }));
  }

  function refreshAll() {
    void listQuery.refetch();
    void metricsQuery.refetch();
  }

  return (
    <div className="space-y-4 pb-6">
      <TrainingSectionHero
        tone="cyan"
        icon={<BookOpen className="h-4 w-4" />}
        title="Conocimiento RAG"
        description="Reglas de contexto para interpretar OCR ambiguo. Los aliases corrigen texto directo; estas reglas guian al motor cuando el caso es borroso."
        badges={
          <>
            <Badge variant="outline" className="border-cyan-400/30 text-[10px] text-cyan-100">
              {accountName}
            </Badge>
            <TrainingCountBadge count={rows.length} label="regla" tone="cyan" />
            <TrainingCountBadge count={activeCount} label="activa" tone="cyan" />
          </>
        }
        kpis={[
          { label: "Total", value: rows.length },
          { label: "Activas", value: activeCount },
          { label: "Canary", value: canaryCount },
          { label: "Visibles", value: textFiltered.length, hint: searchText.trim() ? "con busqueda local" : "con filtros API" },
        ]}
        footer={
          <p className="text-[11px] text-cyan-100/80">
            Flujo: <span className="font-medium text-cyan-50">filtrar</span> →{" "}
            <span className="font-medium text-cyan-50">crear o editar</span> →{" "}
            <span className="font-medium text-cyan-50">probar busqueda</span> →{" "}
            <span className="font-medium text-cyan-50">promover o pausar</span>
          </p>
        }
      />

      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">Vista</span>
          <ViewPill active={view === "rules"} label="Mis reglas" onClick={() => setView("rules")} />
          <ViewPill active={view === "probe"} label="Probar busqueda" onClick={() => setView("probe")} />
          <ViewPill active={view === "metrics"} label="Metricas" onClick={() => setView("metrics")} />
        </div>
      </div>

      {view === "rules" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar en titulo, contenido, tags..."
                className="h-9 border-white/10 bg-black/25 pl-8"
              />
            </div>
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-3.5 w-3.5" />
              Filtros
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  {activeFilterCount}
                </Badge>
              ) : null}
            </Button>
            <Button size="sm" variant="outline" className="h-9" onClick={refreshAll} disabled={listQuery.isFetching}>
              {listQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Nueva regla
            </Button>
          </div>

          {showFilters ? (
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-cyan-100">Filtros del listado (API)</p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/accounts/${encodeURIComponent(accountName)}/aliases`}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                  >
                    Aliases
                  </Link>
                  <Link
                    href={`/accounts/${encodeURIComponent(accountName)}/config`}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                  >
                    Config semantic_rag
                  </Link>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Cuenta</Label>
                  <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="h-9 border-white/10 bg-black/25" />
                </div>
                <SelectField
                  id="filter-entry-type"
                  label="Tipo de entrada"
                  hint="Vacío = todos"
                  value={entryType}
                  onChange={setEntryType}
                  options={[{ value: "", label: "Todos los tipos" }, ...entryTypes.map((t) => ({ value: t, label: ENTRY_TYPE_LABELS[t] ?? t }))]}
                />
                <SelectField
                  id="filter-status"
                  label="Estado"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[{ value: "", label: "Todos" }, ...ruleStatuses.map((s) => ({ value: s, label: s }))]}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Cadena</Label>
                  <Input
                    list="chain-suggestions"
                    value={chainFilter}
                    onChange={(e) => setChainFilter(e.target.value)}
                    placeholder="mi comisariato"
                    className="h-9 border-white/10 bg-black/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Categoria</Label>
                  <Input
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    placeholder="cuidado personal"
                    className="h-9 border-white/10 bg-black/25"
                  />
                </div>
                <SelectField
                  id="filter-rollout"
                  label="Modo rollout"
                  value={rolloutMode}
                  onChange={(v) => setRolloutMode(v as "apply" | "shadow")}
                  options={[
                    { value: "apply", label: "apply — aplica reglas" },
                    { value: "shadow", label: "shadow — solo observa" },
                  ]}
                />
                <div className="flex items-end">
                  <label className="flex h-9 w-full items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 text-sm">
                    <span className="text-slate-300">Solo activas</span>
                    <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
                  </label>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                Mi Comisariato, El Rosado, Hypermarket e Hipermarket se agrupan automaticamente.
              </p>
            </div>
          ) : null}

          {loadErrorMessage ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">{loadErrorMessage}</div>
          ) : null}

          <TrainingListShell
            loading={listQuery.isLoading}
            empty={!listQuery.isError && !textFiltered.length}
            emptyMessage={
              listQuery.isError
                ? "Corrige el error de carga para ver las reglas."
                : searchText.trim() || activeFilterCount > 0
                  ? "Sin reglas para los filtros actuales."
                  : "Aun no hay reglas. Crea la primera con «Nueva regla»."
            }
            emptySubtitle={!textFiltered.length && !listQuery.isLoading ? "Tip: usa abreviaturas con formato FRESC → FRESCURA" : undefined}
          >
            <div className="divide-y divide-white/5">
              {textFiltered.map((row) => {
                const active = row.is_active === 1 || row.is_active === true;
                return (
                  <div key={row.id} className="px-4 py-3 hover:bg-white/[0.02]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{row.title}</p>
                          <StatusBadge status={row.status} />
                          <Badge variant={active ? "default" : "secondary"} className="h-5 text-[10px]">
                            {active ? "Encendida" : "Apagada"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          #{row.id}
                          {row.updated_at ? ` · ${row.updated_at}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => editRow(row)}>
                          <Pencil className="mr-1 h-3 w-3" />
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleActive(row)}>
                          {active ? "Apagar" : "Encender"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => quickChangeStatus(row, "active")}>
                          Promover
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => quickChangeStatus(row, "paused")}>
                          Pausar
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className="h-4 text-[9px]">
                        {ENTRY_TYPE_LABELS[row.entry_type] ?? row.entry_type}
                      </Badge>
                      {row.chain ? (
                        <Badge variant="secondary" className="h-4 text-[9px]">
                          {row.chain}
                        </Badge>
                      ) : null}
                      {row.category ? (
                        <Badge variant="secondary" className="h-4 text-[9px]">
                          {row.category}
                        </Badge>
                      ) : null}
                      {typeof row.priority === "number" ? (
                        <Badge variant="outline" className="h-4 text-[9px]">
                          prio {row.priority}
                        </Badge>
                      ) : null}
                      {typeof row.rule_version === "number" ? (
                        <Badge variant="outline" className="h-4 text-[9px]">
                          v{row.rule_version}
                        </Badge>
                      ) : null}
                      {row.canary_flag ? (
                        <Badge variant="outline" className="h-4 border-amber-400/30 text-[9px] text-amber-200">
                          canary
                        </Badge>
                      ) : null}
                      {row.shadow_only ? (
                        <Badge variant="outline" className="h-4 text-[9px] text-slate-300">
                          shadow
                        </Badge>
                      ) : null}
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-300">{row.content}</p>

                    {(row.tags ?? []).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(row.tags ?? []).slice(0, 6).map((tag) => (
                          <Badge key={`${row.id}-${tag}`} variant="outline" className="h-4 text-[9px]">
                            {tag}
                          </Badge>
                        ))}
                        {(row.tags ?? []).length > 6 ? (
                          <Badge variant="outline" className="h-4 text-[9px]">
                            +{(row.tags ?? []).length - 6}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </TrainingListShell>

          {textFiltered.length > 0 ? (
            <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-300">Tabla avanzada (todas las columnas)</summary>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titulo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Cadena</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Prio</TableHead>
                      <TableHead>Ver</TableHead>
                      <TableHead>Activa</TableHead>
                      <TableHead>Actualizado</TableHead>
                      <TableHead className="sticky right-0 z-20 bg-slate-950/95 backdrop-blur">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {textFiltered.map((row) => {
                      const active = row.is_active === 1 || row.is_active === true;
                      return (
                        <TableRow key={`table-${row.id}`}>
                          <TableCell className="max-w-56 truncate">{row.title}</TableCell>
                          <TableCell>{row.entry_type}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <StatusBadge status={row.status} />
                              {row.canary_flag ? <Badge variant="secondary">canary</Badge> : null}
                              {row.shadow_only ? <Badge variant="secondary">shadow</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{row.chain ?? "-"}</TableCell>
                          <TableCell>{row.category ?? "-"}</TableCell>
                          <TableCell>{row.owner ?? "-"}</TableCell>
                          <TableCell>
                            <div className="flex max-w-48 flex-wrap gap-1">
                              {(row.tags ?? []).map((tag) => (
                                <Badge key={`${row.id}-t-${tag}`} variant="outline" className="text-[9px]">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>{row.priority ?? 0}</TableCell>
                          <TableCell>{row.rule_version ?? "-"}</TableCell>
                          <TableCell>{active ? "Si" : "No"}</TableCell>
                          <TableCell className="text-xs">{row.updated_at ?? "-"}</TableCell>
                          <TableCell className="sticky right-0 z-10 bg-slate-950/95 backdrop-blur">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => editRow(row)}>
                                Editar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </details>
          ) : null}
        </>
      ) : null}

      {view === "probe" ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-white">Probar busqueda de contexto</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Simula que texto OCR devolveria el motor RAG antes de guardar o promover una regla.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Texto OCR de prueba</Label>
              <Input
                value={probeText}
                onChange={(e) => setProbeText(e.target.value)}
                placeholder="JAB TOCADOR FRUTOS ROJOS 3X100G"
                className="h-9 border-white/10 bg-black/25"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cadena (opcional)</Label>
              <Input
                list="chain-suggestions"
                value={probeChain}
                onChange={(e) => setProbeChain(e.target.value)}
                placeholder="mi comisariato"
                className="h-9 border-white/10 bg-black/25"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria (opcional)</Label>
              <Input
                value={probeCategory}
                onChange={(e) => setProbeCategory(e.target.value)}
                placeholder="cuidado personal"
                className="h-9 border-white/10 bg-black/25"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => searchQuery.refetch()}
              disabled={!probeText.trim() || searchQuery.isFetching}
            >
              {searchQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Ejecutar busqueda
            </Button>
            <Badge variant="outline" className="text-[10px]">
              rollout: {rolloutMode}
            </Badge>
            <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setView("rules")}>
              Cambiar rollout en Filtros
            </Button>
          </div>

          {searchQuery.error instanceof HttpError ? (
            <p className="mt-3 text-sm text-rose-300">{searchQuery.error.detail}</p>
          ) : null}

          <div className="mt-4 space-y-2">
            {(searchQuery.data?.items ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                {searchQuery.isFetching ? "Buscando..." : "Sin resultados. Prueba otro texto o revisa que haya reglas activas."}
              </p>
            ) : (
              searchQuery.data?.items.map((item) => (
                <div key={`search-${item.id}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-100">{item.title}</p>
                    <Badge variant="outline">{ENTRY_TYPE_LABELS[item.entry_type] ?? item.entry_type}</Badge>
                    <Badge variant="secondary">score {typeof item.score === "number" ? item.score.toFixed(2) : "-"}</Badge>
                    <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => editRow(item)}>
                      Abrir regla
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{item.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {view === "metrics" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-300" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Metricas de efectividad</h3>
                  <p className="text-xs text-slate-400">Precision estimada y uso por regla en jobs recientes.</p>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-400">Ventana (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={metricsDays}
                    onChange={(e) => setMetricsDays(e.target.value)}
                    className="h-9 w-24 border-white/10 bg-black/25"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-9" onClick={() => metricsQuery.refetch()} disabled={metricsQuery.isFetching}>
                  {metricsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {metricsQuery.error instanceof HttpError ? (
              <p className="text-sm text-rose-300">{metricsQuery.error.detail}</p>
            ) : null}

            {metricsQuery.data?.summary ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                  <p className="text-[10px] uppercase text-slate-500">Productos</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{metricsQuery.data.summary.total_products ?? 0}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                  <p className="text-[10px] uppercase text-slate-500">Reglas observadas</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{metricsQuery.data.summary.rules_observed ?? 0}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                  <p className="text-[10px] uppercase text-slate-500">Cadenas</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{metricsQuery.data.summary.chains_observed ?? 0}</p>
                </div>
              </div>
            ) : metricsQuery.isLoading ? (
              <p className="text-sm text-slate-500">Cargando metricas...</p>
            ) : (
              <p className="text-sm text-slate-500">Sin resumen para la ventana seleccionada.</p>
            )}

            {(metricsQuery.data?.rules.length ?? 0) > 0 ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
                <div className="grid grid-cols-[1fr_72px_72px_72px_80px] gap-2 border-b border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase text-slate-500">
                  <span>Regla</span>
                  <span className="text-right">Consid.</span>
                  <span className="text-right">Aplic.</span>
                  <span className="text-right">Bloq.</span>
                  <span className="text-right">Precision</span>
                </div>
                <div className="max-h-56 divide-y divide-white/5 overflow-y-auto">
                  {metricsQuery.data?.rules.map((r) => (
                    <div
                      key={`metric-${r.rule}`}
                      className="grid grid-cols-[1fr_72px_72px_72px_80px] items-center gap-2 px-3 py-2 text-xs"
                    >
                      <span className="truncate text-slate-200">{r.rule}</span>
                      <span className="text-right text-slate-400">{r.considered}</span>
                      <span className="text-right text-slate-400">{r.applied}</span>
                      <span className="text-right text-slate-400">{r.blocked}</span>
                      <span className="text-right font-medium text-cyan-200">{(r.precision_est * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {(metricsQuery.data?.chains.length ?? 0) > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-300">Por cadena</p>
                <div className="space-y-1">
                  {metricsQuery.data?.chains.map((c) => (
                    <div key={c.chain} className="flex items-center justify-between rounded-md border border-white/5 bg-black/20 px-3 py-2 text-xs">
                      <span className="font-mono text-slate-200">{c.chain}</span>
                      <span className="text-slate-400">
                        {c.rows} filas · needs_review {(c.needs_review_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <TrainingFooterNote>
        Edicion y creacion usan POST /semantic-knowledge (con id para actualizar). La validacion de duplicados corre antes de cada guardado.
      </TrainingFooterNote>

      <datalist id="chain-suggestions">
        {chainSuggestions.map((item) => (
          <option key={`chain-${item}`} value={item} />
        ))}
      </datalist>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl border border-white/10 bg-slate-950 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-base font-semibold text-white">{editingId ? `Editar regla #${editingId}` : "Nueva regla RAG"}</h3>
                <p className="text-xs text-slate-400">Todos los campos del backend. Guardar valida duplicados automaticamente.</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeEditor}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              <EditorSection title="1. Que dice la regla">
                <div className="space-y-1.5">
                  <Label className="text-xs">Titulo</Label>
                  <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ej: FRESC → FRESCURA en jabones" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contenido de la regla</Label>
                  <Textarea
                    value={form.content}
                    onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                    className="min-h-32 border-white/10 bg-black/25"
                    placeholder="FRESC significa FRESCURA cuando aparece en jabon de tocador..."
                  />
                  <p className="text-[10px] text-slate-500">Formato sugerido: condicion + transformacion + cuando NO aplicar.</p>
                </div>
                <SelectField
                  id="form-entry-type"
                  label="Tipo de entrada"
                  value={form.entry_type}
                  onChange={(v) => setForm((p) => ({ ...p, entry_type: v }))}
                  options={entryTypes.map((t) => ({ value: t, label: ENTRY_TYPE_LABELS[t] ?? t }))}
                />
              </EditorSection>

              <EditorSection title="2. Donde aplica">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cadena (opcional)</Label>
                    <Input
                      list="chain-suggestions"
                      value={form.chain ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, chain: e.target.value }))}
                      placeholder="Vacío = global"
                      className="border-white/10 bg-black/25"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Categoria (opcional)</Label>
                    <Input
                      value={form.category ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                      placeholder="cuidado personal"
                      className="border-white/10 bg-black/25"
                    />
                  </div>
                </div>
                <TagsInput
                  label="Tags"
                  values={form.tags ?? []}
                  onChange={(values) => setForm((p) => ({ ...p, tags: values }))}
                  placeholder="jabon, tocador, barra..."
                />
                <TagsInput
                  label="Ejemplos negativos (no aplicar si...)"
                  values={form.negative_examples ?? []}
                  onChange={(values) => setForm((p) => ({ ...p, negative_examples: values }))}
                  placeholder="ANTIVIRAL OLIMPIA"
                />
              </EditorSection>

              <EditorSection title="3. Publicacion y control" defaultOpen={!!editingId}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    id="form-status"
                    label="Estado"
                    value={form.status ?? "draft"}
                    onChange={(v) => setForm((p) => ({ ...p, status: v }))}
                    options={ruleStatuses.map((s) => ({ value: s, label: s }))}
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prioridad (0-10)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={form.priority ?? 5}
                      onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value || 0) }))}
                      className="border-white/10 bg-black/25"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Owner</Label>
                    <Input value={form.owner ?? ""} onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))} className="border-white/10 bg-black/25" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Confidence target</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={1}
                      value={form.confidence_target ?? 0.9}
                      onChange={(e) => setForm((p) => ({ ...p, confidence_target: Number(e.target.value || 0) }))}
                      className="border-white/10 bg-black/25"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Version de regla</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.rule_version ?? 1}
                      onChange={(e) => setForm((p) => ({ ...p, rule_version: Number(e.target.value || 1) }))}
                      className="border-white/10 bg-black/25"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Caso origen (opcional)</Label>
                    <Input
                      value={form.created_from_case ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, created_from_case: e.target.value }))}
                      className="border-white/10 bg-black/25"
                    />
                  </div>
                </div>
                <label className="flex items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 py-2.5 text-sm">
                  <span className="text-slate-300">Regla encendida (is_active)</span>
                  <Switch checked={Boolean(form.is_active)} onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))} />
                </label>
              </EditorSection>

              <EditorSection title="4. Opciones avanzadas (rollout y metricas)" defaultOpen={false}>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">rollout_scope (JSON)</Label>
                    <Textarea
                      className="min-h-28 border-white/10 bg-black/25 font-mono text-xs"
                      value={JSON.stringify(form.rollout_scope ?? { chains: [] }, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setForm((p) => ({ ...p, rollout_scope: parsed as Record<string, unknown> }));
                        } catch {
                          // ignore while typing
                        }
                      }}
                    />
                    <p className="text-[10px] text-slate-500">Obligatorio si status=canary. Ej: {`{"chains":["mi comisariato"]}`}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">success_metrics (JSON)</Label>
                    <Textarea
                      className="min-h-28 border-white/10 bg-black/25 font-mono text-xs"
                      value={JSON.stringify(form.success_metrics ?? { min_precision_est: 0.85, max_needs_review_rate: 0.2 }, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setForm((p) => ({ ...p, success_metrics: parsed as Record<string, unknown> }));
                        } catch {
                          // ignore while typing
                        }
                      }}
                    />
                  </div>
                </div>
              </EditorSection>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
              <Button variant="ghost" onClick={closeEditor}>
                Cancelar
              </Button>
              <Button onClick={submitForm} disabled={saveMutation.isPending} className="gap-1.5">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {saveMutation.isPending ? "Guardando..." : editingId ? "Guardar cambios" : "Crear regla"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}