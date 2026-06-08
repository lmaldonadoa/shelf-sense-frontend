"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { SemanticKnowledgeEntry, SemanticKnowledgeUpsertRequest } from "@/types/ocr-api";
import { TagsInput } from "@/components/semantic/tags-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const entryTypes = ["note", "abbreviation_rule", "chain_rule", "category_rule", "product_context", "correction_hint"];
const ruleStatuses = ["draft", "canary", "active", "paused", "deprecated"];
const chainSuggestions = ["mi comisariato", "el rosado", "hypermarket", "hipermarket", "aki", "supermaxi", "megamaxi", "gran aki"];

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

export function AccountSemanticKnowledgePage({ account }: AccountSemanticKnowledgePageProps) {
  const [accountName, setAccountName] = useState(account);
  const [entryType, setEntryType] = useState("");
  const [chainFilter, setChainFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [rolloutMode, setRolloutMode] = useState<"apply" | "shadow">("apply");
  const [metricsDays, setMetricsDays] = useState("7");
  const [searchText, setSearchText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
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
      toast.success(editingId ? "Entrada actualizada" : "Entrada creada");
      listQuery.refetch();
      setEditingId(null);
      setEditModalOpen(false);
      setForm(emptyForm());
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

  function editRow(row: SemanticKnowledgeEntry) {
    if (!Number.isFinite(row.id) || row.id <= 0) {
      toast.error("No se puede editar esta entrada", { description: "ID inválido en respuesta backend." });
      return;
    }
    setEditingId(row.id);
    setEditModalOpen(true);
    setForm({
      id: row.id,
      title: row.title,
      content: row.content,
      entry_type: row.entry_type || "note",
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
    });
  }

  function submitForm() {
    if (form.title.trim().length < 3) {
      toast.error("Title requerido (mínimo 3 caracteres)");
      return;
    }
    if (form.content.trim().length < 10) {
      toast.error("Content requerido (mínimo 10 caracteres)");
      return;
    }
    const forceId = editingId ?? (typeof form.id === "number" ? form.id : undefined);
    if (editingId && (!Number.isFinite(forceId) || (forceId ?? 0) <= 0)) {
      toast.error("No se puede guardar edición", { description: "Falta ID válido para update." });
      return;
    }
    if (!ruleStatuses.includes(String(form.status ?? ""))) {
      toast.error("status inválido");
      return;
    }
    if ((Number(form.confidence_target ?? 0)) < 0 || (Number(form.confidence_target ?? 0)) > 1) {
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
    saveMutation.mutate({
      ...form,
      ...(forceId ? { id: forceId } : {}),
      tags: normalizeTags(form.tags),
      priority: Number(form.priority ?? 0),
      confidence_target: Number(form.confidence_target ?? 0),
      rule_version: Number(form.rule_version ?? 1),
      negative_examples: normalizeTags(form.negative_examples),
    });
  }

  function resetEditor() {
    setEditingId(null);
    setEditModalOpen(false);
    setForm(emptyForm());
  }

  function toggleActive(row: SemanticKnowledgeEntry) {
    saveMutation.mutate({
      id: row.id,
      title: row.title,
      content: row.content,
      entry_type: row.entry_type,
      chain: row.chain ?? "",
      category: row.category ?? "",
      tags: row.tags ?? [],
      priority: typeof row.priority === "number" ? row.priority : 5,
      is_active: !(row.is_active === 1 || row.is_active === true),
      status: row.status ?? "draft",
      owner: row.owner ?? "",
      confidence_target: typeof row.confidence_target === "number" ? row.confidence_target : 0.9,
      created_from_case: row.created_from_case ?? "",
      negative_examples: row.negative_examples ?? [],
      rollout_scope: row.rollout_scope ?? { chains: [] },
      success_metrics: row.success_metrics ?? { min_precision_est: 0.85, max_needs_review_rate: 0.2 },
      rule_version: typeof row.rule_version === "number" ? row.rule_version : 1,
    });
  }

  function quickChangeStatus(row: SemanticKnowledgeEntry, nextStatus: string) {
    saveMutation.mutate({
      id: row.id,
      title: row.title,
      content: row.content,
      entry_type: row.entry_type,
      chain: row.chain ?? "",
      category: row.category ?? "",
      tags: row.tags ?? [],
      priority: typeof row.priority === "number" ? row.priority : 5,
      is_active: row.is_active === 1 || row.is_active === true,
      status: nextStatus,
      owner: row.owner ?? "",
      confidence_target: typeof row.confidence_target === "number" ? row.confidence_target : 0.9,
      created_from_case: row.created_from_case ?? "",
      negative_examples: row.negative_examples ?? [],
      rollout_scope: row.rollout_scope ?? { chains: [] },
      success_metrics: row.success_metrics ?? { min_precision_est: 0.85, max_needs_review_rate: 0.2 },
      rule_version: typeof row.rule_version === "number" ? row.rule_version : 1,
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Base de conocimiento OCR (Contexto RAG)</CardTitle>
          <CardDescription>
            Aliases corrigen texto directamente. Conocimiento semántico aporta contexto para interpretar casos borrosos o ambiguos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-6 rounded-md border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Flujo recomendado: <span className="font-semibold">Filtrar</span> -&gt; <span className="font-semibold">Crear/Editar regla</span> -&gt; <span className="font-semibold">Probar búsqueda</span> -&gt; <span className="font-semibold">Promover/Pausar</span>
          </div>
          <div className="space-y-2"><Label>account_name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></div>
          <div className="space-y-2"><Label>entry_type</Label><Input value={entryType} onChange={(e) => setEntryType(e.target.value)} placeholder="abbreviation_rule" /></div>
          <div className="space-y-2"><Label>status</Label><Input value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="canary" /></div>
          <div className="space-y-2"><Label>chain</Label><Input list="chain-suggestions" value={chainFilter} onChange={(e) => setChainFilter(e.target.value)} placeholder="mi comisariato" /></div>
          <div className="space-y-2"><Label>category</Label><Input value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} placeholder="cuidado personal" /></div>
          <div className="space-y-2"><Label>buscar</Label><Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="texto libre" /></div>
          <div className="space-y-2">
            <Label>rollout_mode</Label>
            <select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm outline-none ring-cyan-400/40 focus:ring-2" value={rolloutMode} onChange={(e) => setRolloutMode(e.target.value as "apply" | "shadow")}>
              <option value="apply">apply</option>
              <option value="shadow">shadow</option>
            </select>
          </div>
          <div className="md:col-span-5 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
            <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
            <span>Solo activos</span>
            <span>Equivalencias automáticas: Mi Comisariato, El Rosado, Hypermarket e Hipermarket se agrupan.</span>
            <Link href={`/accounts/${encodeURIComponent(accountName)}/aliases`} className="rounded-full border border-white/15 px-2 py-1 font-medium hover:bg-white/10">Gestionar aliases</Link>
            <Link href={`/accounts/${encodeURIComponent(accountName)}/config`} className="rounded-full border border-white/15 px-2 py-1 font-medium hover:bg-white/10">Configurar semantic_rag</Link>
            <Button size="sm" variant="outline" onClick={() => { void listQuery.refetch(); void metricsQuery.refetch(); }}>Refrescar</Button>
          </div>
          <div className="md:col-span-6 grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">total reglas</p><p className="text-sm font-semibold">{rows.length}</p></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">activas</p><p className="text-sm font-semibold">{activeCount}</p></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">canary</p><p className="text-sm font-semibold">{canaryCount}</p></div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">visibles por filtro</p><p className="text-sm font-semibold">{textFiltered.length}</p></div>
          </div>
          <datalist id="chain-suggestions">
            {chainSuggestions.map((item) => <option key={`chain-filter-${item}`} value={item} />)}
          </datalist>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Canary Console y Métricas</CardTitle>
          <CardDescription>Seguimiento por regla y por cadena para rollout controlado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {metricsQuery.isFetching ? <p className="text-sm text-muted-foreground">Cargando métricas...</p> : null}
          {metricsQuery.error instanceof HttpError ? <p className="text-sm text-rose-300">Error métricas: {metricsQuery.error.detail}</p> : null}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Ventana (días)</Label>
              <Input type="number" min={1} max={60} value={metricsDays} onChange={(e) => setMetricsDays(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => metricsQuery.refetch()}>Actualizar métricas</Button>
          </div>
          {metricsQuery.data?.summary ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">total_products</p><p className="text-lg font-semibold">{metricsQuery.data.summary.total_products ?? 0}</p></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">rules_observed</p><p className="text-lg font-semibold">{metricsQuery.data.summary.rules_observed ?? 0}</p></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">chains_observed</p><p className="text-lg font-semibold">{metricsQuery.data.summary.chains_observed ?? 0}</p></div>
            </div>
          ) : null}
          {!!(metricsQuery.data?.rules.length) ? (
            <div className="max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
              {metricsQuery.data?.rules.slice(0, 8).map((r) => (
                <div key={`metric-rule-${r.rule}`} className="flex items-center justify-between gap-2 border-b border-white/5 px-1 py-1 last:border-b-0">
                  <span className="truncate text-slate-200">{r.rule}</span>
                  <span className="text-slate-300">precision_est: {r.precision_est.toFixed(2)} | {r.applied}/{r.considered}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>{editingId ? "Editar entrada semántica" : "Nueva entrada semántica"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {editingId ? (
              <div className="space-y-2">
                <Label>id (edición)</Label>
                <Input value={String(editingId)} readOnly />
              </div>
            ) : null}
            <div className="space-y-2"><Label>title</Label><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>entry_type</Label>
              <select
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm outline-none ring-cyan-400/40 focus:ring-2"
                value={form.entry_type}
                onChange={(e) => setForm((p) => ({ ...p, entry_type: e.target.value }))}
              >
                {entryTypes.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2"><Label>chain</Label><Input list="chain-suggestions-create" value={form.chain ?? ""} onChange={(e) => setForm((p) => ({ ...p, chain: e.target.value }))} /></div>
            <div className="space-y-2"><Label>category</Label><Input value={form.category ?? ""} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></div>
            <div className="space-y-2"><Label>priority (0-10)</Label><Input type="number" min={0} max={10} value={form.priority ?? 5} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value || 0) }))} /></div>
            <div className="space-y-2">
              <Label>status</Label>
              <select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm outline-none ring-cyan-400/40 focus:ring-2" value={form.status ?? "draft"} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                {ruleStatuses.map((item) => <option key={`status-${item}`} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>owner</Label><Input value={form.owner ?? ""} onChange={(e) => setForm((p) => ({ ...p, owner: e.target.value }))} /></div>
            <div className="space-y-2"><Label>confidence_target</Label><Input type="number" step="0.01" min={0} max={1} value={form.confidence_target ?? 0.9} onChange={(e) => setForm((p) => ({ ...p, confidence_target: Number(e.target.value || 0) }))} /></div>
            <div className="space-y-2"><Label>rule_version</Label><Input type="number" min={1} value={form.rule_version ?? 1} onChange={(e) => setForm((p) => ({ ...p, rule_version: Number(e.target.value || 1) }))} /></div>
            <div className="space-y-2 md:col-span-2"><Label>created_from_case</Label><Input value={form.created_from_case ?? ""} onChange={(e) => setForm((p) => ({ ...p, created_from_case: e.target.value }))} /></div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-md border border-white/10 p-3">
                <span className="text-sm">is_active</span>
                <Switch checked={Boolean(form.is_active)} onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>content</Label>
            <Textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} className="min-h-36" />
            <p className="text-xs text-muted-foreground">Para abreviaturas usa formato explícito: <span className="font-semibold">FRESC -&gt; FRESCURA</span> o <span className="font-semibold">FRESC significa FRESCURA</span>.</p>
          </div>
          <TagsInput label="tags" values={form.tags ?? []} onChange={(values) => setForm((p) => ({ ...p, tags: values }))} placeholder="jabon, tocador, barra..." />
          <TagsInput label="negative_examples" values={form.negative_examples ?? []} onChange={(values) => setForm((p) => ({ ...p, negative_examples: values }))} placeholder="ej: ANTIVIRAL OLIMPIA" />
          <details className="rounded-lg border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Opciones avanzadas (rollout y métricas)</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>rollout_scope (JSON)</Label>
              <Textarea
                className="min-h-24"
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
            </div>
            <div className="space-y-2">
              <Label>success_metrics (JSON)</Label>
              <Textarea
                className="min-h-24"
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
          </details>
          <datalist id="chain-suggestions-create">
            {chainSuggestions.map((item) => <option key={`chain-create-${item}`} value={item} />)}
          </datalist>
          <div className="flex flex-wrap gap-2">
            <Button onClick={submitForm} disabled={saveMutation.isPending}>
              {editingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {editingId ? "Actualizar" : "Crear"}
            </Button>
            {editingId ? (
              <Button variant="outline" onClick={resetEditor}>
                Cancelar edición
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {editModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-slate-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Editar entrada de conocimiento</h3>
              <Button variant="ghost" onClick={resetEditor}>Cerrar</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>id</Label>
                <Input value={String(editingId ?? "")} readOnly />
              </div>
              <div className="space-y-2">
                <Label>entry_type</Label>
                <select
                  className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm outline-none ring-cyan-400/40 focus:ring-2"
                  value={form.entry_type}
                  onChange={(e) => setForm((p) => ({ ...p, entry_type: e.target.value }))}
                >
                  {entryTypes.map((item) => (
                    <option key={`edit-${item}`} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>title</Label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="space-y-2"><Label>chain</Label><Input list="chain-suggestions-create" value={form.chain ?? ""} onChange={(e) => setForm((p) => ({ ...p, chain: e.target.value }))} /></div>
              <div className="space-y-2"><Label>category</Label><Input value={form.category ?? ""} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></div>
              <div className="space-y-2 md:col-span-2">
                <Label>content</Label>
                <Textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} className="min-h-32" />
              </div>
              <div className="space-y-2"><Label>priority</Label><Input type="number" min={0} max={10} value={form.priority ?? 5} onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value || 0) }))} /></div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-md border border-white/10 p-3">
                  <span className="text-sm">is_active</span>
                  <Switch checked={Boolean(form.is_active)} onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))} />
                </div>
              </div>
              <div className="md:col-span-2">
                <TagsInput label="tags" values={form.tags ?? []} onChange={(values) => setForm((p) => ({ ...p, tags: values }))} placeholder="jabon, tocador, barra..." />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={resetEditor}>Cancelar</Button>
              <Button onClick={submitForm} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Probar búsqueda de contexto</CardTitle>
          <CardDescription>Consulta rápida para validar qué contexto RAG devolvería el backend para un texto OCR.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2"><Label>q</Label><Input value={probeText} onChange={(e) => setProbeText(e.target.value)} placeholder="JAB TOCADOR FRUTOS ROJOS 3X100G" /></div>
            <div className="space-y-2"><Label>chain</Label><Input value={probeChain} onChange={(e) => setProbeChain(e.target.value)} placeholder="mi comisariato" /></div>
            <div className="space-y-2"><Label>category</Label><Input value={probeCategory} onChange={(e) => setProbeCategory(e.target.value)} placeholder="cuidado personal" /></div>
          </div>
          <Button onClick={() => searchQuery.refetch()} disabled={!probeText.trim() || searchQuery.isFetching}>
            <Search className="mr-2 h-4 w-4" />
            Probar búsqueda
          </Button>
          {searchQuery.error instanceof HttpError ? <p className="text-sm text-amber-300">Error: {searchQuery.error.detail}</p> : null}
          <div className="space-y-2">
            {(searchQuery.data?.items ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin resultados aún.</p>
            ) : (
              <div className="space-y-2">
                {searchQuery.data?.items.map((item) => (
                  <div key={`search-${item.id}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-100">{item.title}</p>
                      <Badge variant="outline">{item.entry_type}</Badge>
                      <Badge variant="secondary">score: {typeof item.score === "number" ? item.score.toFixed(2) : "-"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Entradas de conocimiento</CardTitle>
          <CardDescription>
            Vista operativa por tarjetas para editar rápido. La tabla completa queda disponible como vista avanzada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQuery.error instanceof HttpError ? <p className="mb-3 text-sm text-rose-300">Error cargando reglas: {listQuery.error.detail}</p> : null}
          {!textFiltered.length ? (
            <p className="text-sm text-muted-foreground">{listQuery.isLoading ? "Cargando..." : "No hay entradas para los filtros actuales."}</p>
          ) : (
            <>
            <div className="space-y-3">
              {textFiltered.map((row) => {
                const active = row.is_active === 1 || row.is_active === true;
                return (
                  <div key={`card-row-${row.id}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{row.title}</p>
                        <p className="text-[11px] text-slate-400">id: {row.id} {row.updated_at ? `• actualizado: ${row.updated_at}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={active ? "default" : "secondary"}>{active ? "Activa" : "Inactiva"}</Badge>
                        <Badge variant="outline">{row.status ?? "-"}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline">{row.entry_type}</Badge>
                      {row.chain ? <Badge variant="secondary">{row.chain}</Badge> : null}
                      {row.category ? <Badge variant="secondary">{row.category}</Badge> : null}
                      {typeof row.priority === "number" ? <Badge variant="outline">prioridad: {row.priority}</Badge> : null}
                      {typeof row.rule_version === "number" ? <Badge variant="outline">v{row.rule_version}</Badge> : null}
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs text-slate-300">{row.content}</p>
                    {(row.tags ?? []).length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(row.tags ?? []).slice(0, 8).map((tag) => <Badge key={`tag-${row.id}-${tag}`} variant="outline">{tag}</Badge>)}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => editRow(row)}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(row)}>{active ? "Desactivar" : "Activar"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => quickChangeStatus(row, "active")}>Promover</Button>
                      <Button size="sm" variant="ghost" onClick={() => quickChangeStatus(row, "paused")}>Pausar</Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <details className="rounded-lg border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">Ver tabla avanzada</summary>
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>title</TableHead>
                      <TableHead>entry_type</TableHead>
                      <TableHead>status</TableHead>
                      <TableHead>chain</TableHead>
                      <TableHead>category</TableHead>
                      <TableHead>owner</TableHead>
                      <TableHead>tags</TableHead>
                      <TableHead>priority</TableHead>
                      <TableHead>version</TableHead>
                      <TableHead>estado</TableHead>
                      <TableHead>updated</TableHead>
                      <TableHead className="sticky right-0 z-20 bg-slate-950/95 backdrop-blur whitespace-nowrap">acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {textFiltered.map((row) => {
                      const active = row.is_active === 1 || row.is_active === true;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="max-w-72 truncate">{row.title}</TableCell>
                          <TableCell>{row.entry_type}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">{row.status ?? "-"}</Badge>
                              {row.canary_flag ? <Badge variant="secondary">canary</Badge> : null}
                              {row.shadow_only ? <Badge variant="secondary">shadow</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{row.chain ?? "-"}</TableCell>
                          <TableCell>{row.category ?? "-"}</TableCell>
                          <TableCell>{row.owner ?? "-"}</TableCell>
                          <TableCell>
                            <div className="flex max-w-56 flex-wrap gap-1">
                              {(row.tags ?? []).map((tag) => <Badge key={`${row.id}-${tag}`} variant="outline">{tag}</Badge>)}
                            </div>
                          </TableCell>
                          <TableCell>{row.priority ?? 0}</TableCell>
                          <TableCell>{row.rule_version ?? "-"}</TableCell>
                          <TableCell><Badge variant={active ? "default" : "secondary"}>{active ? "Activo" : "Inactivo"}</Badge></TableCell>
                          <TableCell>{row.updated_at ?? "-"}</TableCell>
                          <TableCell className="sticky right-0 z-10 bg-slate-950/95 backdrop-blur whitespace-nowrap">
                            <div className="flex flex-nowrap items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => editRow(row)}>Editar</Button>
                              <Button size="sm" variant="ghost" onClick={() => toggleActive(row)}>{active ? "Desactivar" : "Activar"}</Button>
                              <Button size="sm" variant="ghost" onClick={() => quickChangeStatus(row, "active")}>Promover</Button>
                              <Button size="sm" variant="ghost" onClick={() => quickChangeStatus(row, "paused")}>Pausar</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
