"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { deepMerge, HttpError, ocrApi } from "@/lib/ocrApi";
import type { ChainCatalogItem } from "@/types/ocr-api";
import {
  TrainingCountBadge,
  TrainingFooterNote,
  TrainingFormCard,
  TrainingListShell,
  TrainingPanelCard,
  TrainingSectionHero,
} from "@/components/training/training-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Props = { account: string };

function normalizeChainCode(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-EC");
}

export function AccountChainsPage({ account }: Props) {
  const [accountName, setAccountName] = useState(account);
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [showNewChainForm, setShowNewChainForm] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [chainForm, setChainForm] = useState({ chain_code: "", display_name: "", group_code: "", priority: 100, is_active: true });
  const [resolveText, setResolveText] = useState("");
  const [aliasText, setAliasText] = useState("");
  const [ignoredPhraseText, setIgnoredPhraseText] = useState("");
  const [selectedPromptSlot, setSelectedPromptSlot] = useState<"ocr" | "vision">("ocr");
  const [promptDraft, setPromptDraft] = useState("");
  const [bootstrapDryRun, setBootstrapDryRun] = useState(false);

  const chainsQuery = useQuery({
    queryKey: ["chains-catalog", accountName],
    queryFn: () => ocrApi.listChains(accountName, { includeAliases: true, includeInactive: false, seedIfEmpty: true }),
  });
  const ocrPromptsQuery = useQuery({
    queryKey: ["account-prompts", accountName, "ocr"],
    queryFn: () => ocrApi.listAccountPrompts(accountName, "ocr"),
  });
  const visionPromptsQuery = useQuery({
    queryKey: ["account-prompts", accountName, "vision"],
    queryFn: () => ocrApi.listAccountPrompts(accountName, "vision"),
  });
  const activeConfigQuery = useQuery({
    queryKey: ["chains-active-config", accountName],
    queryFn: () => ocrApi.getActiveConfig(accountName, "default"),
    retry: false,
  });

  const chainsErrorDetail =
    chainsQuery.error instanceof HttpError
      ? chainsQuery.error.detail
      : chainsQuery.error instanceof Error
        ? chainsQuery.error.message
        : null;
  const chainsErrorStatus = chainsQuery.error instanceof HttpError ? chainsQuery.error.status : null;

  const filteredChains = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = chainsQuery.data?.chains ?? [];
    if (!term) return rows;
    return rows.filter((chain) => {
      const haystack = [
        chain.chain_code,
        chain.display_name ?? "",
        chain.group_code ?? "",
        ...(chain.aliases ?? []).map((alias) => alias.alias_text),
        ...(chain.ignored_phrases ?? []).map((item) => item.phrase),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [chainsQuery.data?.chains, search]);

  const selectedChain = useMemo(
    () => (chainsQuery.data?.chains ?? []).find((chain) => chain.id === selectedChainId) ?? null,
    [chainsQuery.data?.chains, selectedChainId],
  );
  const promptOptions = selectedPromptSlot === "ocr" ? (ocrPromptsQuery.data?.prompts ?? []) : (visionPromptsQuery.data?.prompts ?? []);
  const currentPromptFile = selectedChain?.prompt_files?.[selectedPromptSlot] ?? null;
  const basePromptFile =
    selectedPromptSlot === "ocr"
      ? typeof ((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).glm_ocr === "object"
        ? String((((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).glm_ocr as Record<string, unknown>).prompt_file ?? "glm_ocr_prompt.txt")
        : "glm_ocr_prompt.txt"
      : typeof ((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).qwen_vl === "object"
        ? String((((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).qwen_vl as Record<string, unknown>).prompt_file ?? "qwen3vl_prompt.txt")
        : "qwen3vl_prompt.txt";
  const suggestedTargetPromptFile = useMemo(() => {
    if (!selectedChain) return "";
    const suffix = selectedChain.chain_code;
    return selectedPromptSlot === "ocr" ? `glm_ocr_prompt_${suffix}.txt` : `qwen3vl_prompt_${suffix}.txt`;
  }, [selectedChain, selectedPromptSlot]);

  const saveChainMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        chain_code: normalizeChainCode(chainForm.chain_code),
        display_name: chainForm.display_name.trim() || null,
        group_code: chainForm.group_code.trim() || null,
        priority: Number(chainForm.priority) || 100,
        is_active: chainForm.is_active,
      };
      if (!payload.chain_code) throw new Error("chain_code es obligatorio.");
      if (selectedChainId) return ocrApi.updateChain(accountName, selectedChainId, payload);
      return ocrApi.createChain(accountName, payload);
    },
    onSuccess: (row) => {
      void chainsQuery.refetch();
      setSelectedChainId(row.id);
      toast.success("Cadena guardada", { description: row.chain_code });
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar la cadena", { description: detail });
    },
  });

  const saveAliasMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChainId) throw new Error("Selecciona una cadena.");
      const text = aliasText.trim();
      if (!text) throw new Error("Alias vacio.");
      const existing = (selectedChain?.aliases ?? []).some((item) => item.alias_text.trim().toLowerCase() === text.toLowerCase());
      if (existing) throw new Error("Ese alias ya existe en esta cadena.");
      return ocrApi.upsertChainAlias(accountName, selectedChainId, { alias_text: text, source: "manual", is_active: true });
    },
    onSuccess: () => {
      setAliasText("");
      void chainsQuery.refetch();
      toast.success("Alias agregado");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar el alias", { description: detail });
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: async (aliasId: number) => {
      if (!selectedChainId) throw new Error("Selecciona una cadena.");
      return ocrApi.deleteChainAlias(accountName, selectedChainId, aliasId);
    },
    onSuccess: () => {
      void chainsQuery.refetch();
      toast.success("Alias eliminado");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo eliminar el alias", { description: detail });
    },
  });

  const saveIgnoredPhraseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChainId) throw new Error("Selecciona una cadena.");
      const phrase = ignoredPhraseText.trim();
      if (!phrase) throw new Error("La frase no puede estar vacia.");
      const existing = (selectedChain?.ignored_phrases ?? []).some((item) => item.phrase.trim().toLowerCase() === phrase.toLowerCase());
      if (existing) throw new Error("Esa frase ya existe en esta cadena.");
      return ocrApi.upsertChainIgnoredPhrase(accountName, selectedChainId, { phrase, scope: "product", is_active: true });
    },
    onSuccess: () => {
      setIgnoredPhraseText("");
      void chainsQuery.refetch();
      toast.success("Frase no-producto guardada");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar la frase", { description: detail });
    },
  });

  const deleteIgnoredPhraseMutation = useMutation({
    mutationFn: async (ignoredId: number) => {
      if (!selectedChainId) throw new Error("Selecciona una cadena.");
      return ocrApi.deleteChainIgnoredPhrase(accountName, selectedChainId, ignoredId);
    },
    onSuccess: () => {
      void chainsQuery.refetch();
      toast.success("Frase no-producto eliminada");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo eliminar la frase", { description: detail });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => ocrApi.resolveChainPreview(accountName, resolveText),
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo probar la resolucion", { description: detail });
    },
  });

  const loadPromptMutation = useMutation({
    mutationFn: async (promptFile: string) => ocrApi.getAccountPrompt(accountName, promptFile),
    onSuccess: (data) => {
      setPromptDraft(data.content);
      toast.success("Prompt cargado");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo leer el prompt", { description: detail });
    },
  });

  const savePromptMutation = useMutation({
    mutationFn: async () => {
      const promptFile = currentPromptFile;
      if (!promptFile) throw new Error("La cadena no tiene un prompt asignado en este slot.");
      return ocrApi.updateAccountPrompt(accountName, promptFile, { content: promptDraft, slot: selectedPromptSlot });
    },
    onSuccess: () => {
      toast.success("Prompt guardado");
      void ocrPromptsQuery.refetch();
      void visionPromptsQuery.refetch();
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar el prompt", { description: detail });
    },
  });

  const ensureChainPromptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChainId || !selectedChain) throw new Error("Selecciona una cadena.");
      const targetPromptFile = suggestedTargetPromptFile;
      const ensure = await ocrApi.ensureChainPrompt(accountName, selectedChainId, {
        slot: selectedPromptSlot,
        base_prompt_file: basePromptFile,
        target_prompt_file: targetPromptFile,
        overwrite: false,
      });
      const configPatch = ensure.config_patch;
      if (!configPatch || typeof configPatch !== "object") {
        throw new Error("Backend no devolvió config_patch para activar el prompt en runtime.");
      }

      let baseConfig: Record<string, unknown> = {};
      try {
        const active = await ocrApi.getActiveConfig(accountName, "default");
        baseConfig = (active.config ?? {}) as Record<string, unknown>;
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 404) throw error;
      }

      const merged = deepMerge(baseConfig, configPatch as Record<string, unknown>);
      await ocrApi.createOrUpdateConfig(accountName, {
        name: "default",
        version: "next",
        is_active: true,
        config: merged,
      });
      const latest = await ocrApi.getActiveConfig(accountName, "default");
      if (latest?.id !== undefined && latest?.id !== null) {
        await ocrApi.activateConfig(accountName, latest.id);
      }
      return { targetPromptFile };
    },
    onSuccess: async ({ targetPromptFile }) => {
      toast.success("Prompt por cadena creado y activado");
      await Promise.all([chainsQuery.refetch(), ocrPromptsQuery.refetch(), visionPromptsQuery.refetch(), activeConfigQuery.refetch()]);
      loadPromptMutation.mutate(targetPromptFile);
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo asegurar el prompt por cadena", { description: detail });
    },
  });

  const bootstrapPromptsMutation = useMutation({
    mutationFn: async () =>
      ocrApi.bootstrapChainPrompts(accountName, {
        slots: ["ocr", "vision"],
        base_prompt_files: {
          ocr:
            typeof ((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).glm_ocr === "object"
              ? String((((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).glm_ocr as Record<string, unknown>).prompt_file ?? "glm_ocr_prompt.txt")
              : "glm_ocr_prompt.txt",
          vision:
            typeof ((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).qwen_vl === "object"
              ? String((((activeConfigQuery.data?.config ?? {}) as Record<string, unknown>).qwen_vl as Record<string, unknown>).prompt_file ?? "qwen3vl_prompt.txt")
              : "qwen3vl_prompt.txt",
        },
        overwrite: false,
        only_active_chains: true,
        apply_config_patch: true,
        config_name: "default",
        dry_run: bootstrapDryRun,
      }),
    onSuccess: async (data) => {
      const processed = Array.isArray(data.chains_processed) ? data.chains_processed.length : 0;
      toast.success(bootstrapDryRun ? "Dry run completado" : "Bootstrap de prompts completado", {
        description: processed ? `${processed} cadenas procesadas.` : "Sin detalle de cadenas procesadas.",
      });
      await Promise.all([chainsQuery.refetch(), ocrPromptsQuery.refetch(), visionPromptsQuery.refetch(), activeConfigQuery.refetch()]);
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo ejecutar el bootstrap de prompts", { description: detail });
    },
  });

  function resetForm() {
    setSelectedChainId(null);
    setShowNewChainForm(true);
    setAliasText("");
    setIgnoredPhraseText("");
    setChainForm({ chain_code: "", display_name: "", group_code: "", priority: 100, is_active: true });
    setPromptDraft("");
  }

  function loadChain(chain: ChainCatalogItem) {
    setShowNewChainForm(false);
    setSelectedChainId(chain.id);
    setAliasText("");
    setIgnoredPhraseText("");
    setChainForm({
      chain_code: chain.chain_code,
      display_name: chain.display_name ?? "",
      group_code: chain.group_code ?? "",
      priority: Number(chain.priority ?? 100),
      is_active: Boolean(chain.is_active),
    });
    setPromptDraft("");
  }

  const totalAliases = useMemo(
    () => (chainsQuery.data?.chains ?? []).reduce((acc, chain) => acc + (chain.aliases?.length ?? 0), 0),
    [chainsQuery.data?.chains],
  );
  const totalIgnoredPhrases = useMemo(
    () => (chainsQuery.data?.chains ?? []).reduce((acc, chain) => acc + (chain.ignored_phrases?.length ?? 0), 0),
    [chainsQuery.data?.chains],
  );

  const activeChainsCount = useMemo(
    () => (chainsQuery.data?.chains ?? []).filter((c) => Boolean(c.is_active)).length,
    [chainsQuery.data?.chains],
  );
  const showChainEditor = Boolean(selectedChain) || showNewChainForm;

  return (
    <div className="space-y-4 pb-6">
      <TrainingSectionHero
        tone="sky"
        icon={<Layers3 className="h-4 w-4" />}
        title="Catalogo de cadenas"
        description="Datos base por cadena, aliases de nombre de cadena, frases no-producto y prompts OCR/Vision. Distinto de Aliases resolucion (producto OCR)."
        badges={
          <>
            <Badge variant="outline" className="border-sky-400/30 text-[10px] text-sky-100">
              {accountName}
            </Badge>
            <TrainingCountBadge count={filteredChains.length} label="cadena" tone="sky" />
          </>
        }
        kpis={[
          { label: "Visibles", value: filteredChains.length },
          { label: "Activas", value: activeChainsCount },
          { label: "Aliases cadena", value: totalAliases },
          { label: "Frases no-producto", value: totalIgnoredPhrases },
        ]}
        footer={
          <p className="text-[11px] text-sky-100/80">
            Flujo: <span className="font-medium text-sky-50">elegir cadena</span> →{" "}
            <span className="font-medium text-sky-50">editar datos</span> →{" "}
            <span className="font-medium text-sky-50">aliases y frases</span> →{" "}
            <span className="font-medium text-sky-50">probar resolucion</span>
          </p>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cadena, alias o frase..."
            className="h-9 border-white/10 bg-black/25 pl-8"
          />
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => setShowAdvancedFilters((v) => !v)}>
          Filtros
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={() => void chainsQuery.refetch()} disabled={chainsQuery.isFetching}>
          {chainsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" className="h-9 gap-1.5" onClick={resetForm}>
          <Plus className="h-3.5 w-3.5" />
          Nueva cadena
        </Button>
      </div>

      {showAdvancedFilters ? (
        <div className="rounded-xl border border-sky-300/20 bg-sky-500/5 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Cuenta</Label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="h-9 border-white/10 bg-black/25" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Backend</Label>
              <Input value={ocrApi.backendUrl} readOnly className="h-9 border-white/10 bg-black/25 font-mono text-xs" />
            </div>
          </div>
        </div>
      ) : null}

      {chainsErrorDetail ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          <p className="font-semibold">No se pudo cargar el catalogo.</p>
          {chainsErrorStatus === 404 ? <p className="mt-1 text-xs">Este backend aun no expone el modulo de cadenas.</p> : null}
          <p className="mt-1">{chainsErrorDetail}</p>
        </div>
      ) : null}

      <TrainingListShell
        loading={chainsQuery.isLoading}
        empty={!chainsErrorDetail && !filteredChains.length}
        emptyMessage={
          chainsErrorDetail
            ? "Corrige el error de carga para ver las cadenas."
            : search.trim()
              ? "Sin resultados para la busqueda."
              : "No hay cadenas cargadas. Crea una con «Nueva cadena»."
        }
      >
        <div className="divide-y divide-white/5">
          {filteredChains.map((row) => {
            const selected = row.id === selectedChainId;
            const active = Boolean(row.is_active);
            return (
              <div
                key={row.id}
                className={`px-4 py-3 transition-colors hover:bg-white/[0.02] ${selected ? "bg-sky-500/10 ring-1 ring-inset ring-sky-400/25" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-white">{row.chain_code}</p>
                      {row.display_name ? <p className="truncate text-sm text-slate-300">{row.display_name}</p> : null}
                      <Badge variant={active ? "default" : "secondary"} className="h-5 text-[10px]">
                        {active ? "Activa" : "Inactiva"}
                      </Badge>
                      {selected ? (
                        <Badge variant="outline" className="h-5 border-sky-400/40 text-[10px] text-sky-100">
                          Seleccionada
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {row.group_code ? (
                        <Badge variant="outline" className="h-4 text-[9px]">
                          grupo: {row.group_code}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="h-4 text-[9px]">
                        prio {row.priority ?? 100}
                      </Badge>
                      <Badge variant="outline" className="h-4 text-[9px]">
                        {row.aliases?.length ?? 0} alias
                      </Badge>
                      <Badge variant="outline" className="h-4 text-[9px]">
                        {row.ignored_phrases?.length ?? 0} frases
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" variant={selected ? "default" : "outline"} className="h-8 text-xs" onClick={() => loadChain(row)}>
                    {selected ? "Abierta" : "Abrir"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </TrainingListShell>

      {filteredChains.length > 0 ? (
        <details className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-300">Tabla avanzada</summary>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>chain_code</TableHead>
                  <TableHead>display_name</TableHead>
                  <TableHead>group_code</TableHead>
                  <TableHead>priority</TableHead>
                  <TableHead>estado</TableHead>
                  <TableHead>aliases</TableHead>
                  <TableHead>frases</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChains.map((row) => (
                  <TableRow key={`table-${row.id}`} className={row.id === selectedChainId ? "bg-sky-500/10" : undefined}>
                    <TableCell className="font-mono text-xs">{row.chain_code}</TableCell>
                    <TableCell>{row.display_name ?? "-"}</TableCell>
                    <TableCell>{row.group_code ?? "-"}</TableCell>
                    <TableCell>{row.priority ?? "-"}</TableCell>
                    <TableCell>{Boolean(row.is_active) ? "activa" : "inactiva"}</TableCell>
                    <TableCell>{row.aliases?.length ?? 0}</TableCell>
                    <TableCell>{row.ignored_phrases?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>
      ) : null}

      {showChainEditor ? (
        <TrainingFormCard title={selectedChainId ? `Editar cadena: ${chainForm.chain_code || selectedChain?.chain_code}` : "Nueva cadena"} tone="sky">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Codigo (chain_code)</Label>
              <Input
                value={chainForm.chain_code}
                onChange={(e) => setChainForm((prev) => ({ ...prev, chain_code: normalizeChainCode(e.target.value) }))}
                placeholder="mi_comisariato"
                className="h-9 border-white/10 bg-black/25 font-mono"
                readOnly={Boolean(selectedChainId)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Nombre visible</Label>
              <Input
                value={chainForm.display_name}
                onChange={(e) => setChainForm((prev) => ({ ...prev, display_name: e.target.value }))}
                className="h-9 border-white/10 bg-black/25"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Grupo</Label>
              <Input
                value={chainForm.group_code}
                onChange={(e) => setChainForm((prev) => ({ ...prev, group_code: e.target.value }))}
                className="h-9 border-white/10 bg-black/25"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Prioridad</Label>
              <Input
                type="number"
                value={String(chainForm.priority)}
                onChange={(e) => setChainForm((prev) => ({ ...prev, priority: Number(e.target.value) || 100 }))}
                className="h-9 border-white/10 bg-black/25"
              />
            </div>
            <label className="flex h-9 items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 text-sm sm:col-span-2">
              <span className="text-slate-300">Cadena activa</span>
              <Switch checked={chainForm.is_active} onCheckedChange={(checked) => setChainForm((prev) => ({ ...prev, is_active: checked }))} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" className="h-8" onClick={() => saveChainMutation.mutate()} disabled={saveChainMutation.isPending}>
              {saveChainMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {selectedChainId ? "Guardar cambios" : "Crear cadena"}
            </Button>
            {selectedChainId ? (
              <Button size="sm" variant="ghost" className="h-8" onClick={resetForm}>
                Nueva cadena
              </Button>
            ) : null}
          </div>
        </TrainingFormCard>
      ) : (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-400">
          Selecciona una cadena del listado o pulsa «Nueva cadena» para editar.
        </div>
      )}

      {selectedChain ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <TrainingPanelCard
            title="Aliases de nombre de cadena"
            description="Variantes de escritura para resolver esta cadena en POS/OCR."
          >
            <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-sm font-medium text-white">{selectedChain.display_name ?? selectedChain.chain_code}</p>
              <p className="font-mono text-[10px] text-slate-500">{selectedChain.chain_code}</p>
            </div>
            <div className="flex gap-2">
              <Input
                value={aliasText}
                onChange={(e) => setAliasText(e.target.value)}
                placeholder="hypermarket, hipermarket..."
                className="h-9 border-white/10 bg-black/25"
              />
              <Button size="sm" className="h-9" onClick={() => saveAliasMutation.mutate()} disabled={saveAliasMutation.isPending}>
                Agregar
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {(selectedChain.aliases ?? []).length ? (
                (selectedChain.aliases ?? []).map((alias) => (
                  <div key={alias.id} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                    <div>
                      <p className="text-sm text-white">{alias.alias_text}</p>
                      <p className="text-[10px] text-slate-500">source: {alias.source ?? "-"}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-rose-300 hover:text-rose-200"
                      onClick={() => {
                        if (!window.confirm(`Eliminar alias "${alias.alias_text}"?`)) return;
                        deleteAliasMutation.mutate(alias.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">Sin aliases para esta cadena.</p>
              )}
            </div>
          </TrainingPanelCard>

          <TrainingPanelCard title="Frases no-producto" description="Ruido OCR especifico de esta cadena (scope product).">
            <div className="flex gap-2">
              <Input
                value={ignoredPhraseText}
                onChange={(e) => setIgnoredPhraseText(e.target.value)}
                placeholder="DIA DE UTILIDADES"
                className="h-9 border-white/10 bg-black/25"
              />
              <Button size="sm" className="h-9" onClick={() => saveIgnoredPhraseMutation.mutate()} disabled={saveIgnoredPhraseMutation.isPending}>
                Agregar
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {(selectedChain.ignored_phrases ?? []).length ? (
                (selectedChain.ignored_phrases ?? []).map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                    <div>
                      <p className="text-sm text-white">{item.phrase}</p>
                      <p className="text-[10px] text-slate-500">
                        {item.scope || "product"} · {formatDate(item.updated_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-rose-300"
                      onClick={() => {
                        if (!window.confirm(`Eliminar frase "${item.phrase}"?`)) return;
                        deleteIgnoredPhraseMutation.mutate(item.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">Sin frases para esta cadena.</p>
              )}
            </div>
          </TrainingPanelCard>

          <TrainingPanelCard
            title="Probar resolucion"
            description="Valida si un texto OCR/POS resuelve a la cadena correcta."
            action={
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending || !resolveText.trim()}>
                <Wand2 className="h-3.5 w-3.5" />
                Probar
              </Button>
            }
          >
            <Textarea
              value={resolveText}
              onChange={(e) => setResolveText(e.target.value)}
              placeholder="canal moderno mi comisariato hypermarket guayaquil"
              className="min-h-24 border-white/10 bg-black/25"
            />
            {resolveMutation.data ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Estado:</span>
                  {resolveMutation.data.resolved ? (
                    <Badge className="h-5">resuelto</Badge>
                  ) : (
                    <Badge variant="destructive" className="h-5">
                      sin match
                    </Badge>
                  )}
                </div>
                <p className="mt-2">Cadena: {resolveMutation.data.match?.chain_code ?? "-"}</p>
                <p>Display: {resolveMutation.data.match?.display_name ?? "-"}</p>
                <p>Alias: {resolveMutation.data.match?.matched_alias ?? "-"}</p>
                <p>Source: {resolveMutation.data.match?.resolution_source ?? "-"}</p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-500">Escribe texto mixto de POS u OCR y ejecuta la prueba.</p>
            )}
          </TrainingPanelCard>
        </div>
      ) : null}

      <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-slate-200">
          <span>Prompts por cadena (OCR / Vision)</span>
          <ChevronDown className="h-4 w-4 text-slate-500 group-open:hidden" />
          <ChevronUp className="hidden h-4 w-4 text-slate-500 group-open:block" />
        </summary>
        <div className="space-y-4 border-t border-white/10 px-4 py-4">
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3 text-sm text-slate-200">
            <p className="font-medium text-emerald-100">Bootstrap masivo por cadenas canonicas</p>
            <p className="mt-1 text-slate-300">
              Crea 1 prompt OCR y 1 prompt Vision por cada cadena activa, usando los prompts base globales. No crea prompts por alias.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-200">
                <input type="checkbox" checked={bootstrapDryRun} onChange={(e) => setBootstrapDryRun(e.target.checked)} />
                Ejecutar como dry run
              </label>
              <Button onClick={() => bootstrapPromptsMutation.mutate()} disabled={bootstrapPromptsMutation.isPending}>
                {bootstrapDryRun ? "Probar bootstrap" : "Crear prompts faltantes para todas las cadenas"}
              </Button>
            </div>
          </div>

          {!selectedChain ? <p className="text-sm text-muted-foreground">Selecciona una cadena para ver o preparar sus prompts OCR y Vision.</p> : null}
          {selectedChain ? (
            <>
              <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3 text-sm text-slate-200">
                <p className="font-medium text-cyan-100">Prompt base y override por cadena</p>
                <p className="mt-1 text-slate-300">
                  Puedes dejar la cadena usando el prompt base o crear una copia propia por cadena para OCR o Vision/Qwen y activarla en runtime.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>slot</Label>
                  <select
                    className="h-10 w-full rounded-md border border-white/15 bg-black/30 px-3 text-sm"
                    value={selectedPromptSlot}
                    onChange={(e) => {
                      setSelectedPromptSlot(e.target.value === "vision" ? "vision" : "ocr");
                      setPromptDraft("");
                    }}
                  >
                    <option value="ocr">ocr</option>
                    <option value="vision">vision</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>prompt base activo</Label>
                  <Input value={basePromptFile} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>prompt asignado a la cadena</Label>
                  <Input value={currentPromptFile ?? "-"} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>archivo sugerido</Label>
                  <Input value={suggestedTargetPromptFile} readOnly />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => ensureChainPromptMutation.mutate()} disabled={ensureChainPromptMutation.isPending}>
                  Crear prompt por cadena desde base
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const promptFile = currentPromptFile ?? basePromptFile;
                    if (!promptFile) return;
                    loadPromptMutation.mutate(promptFile);
                  }}
                  disabled={loadPromptMutation.isPending}
                >
                  Cargar contenido
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void ocrPromptsQuery.refetch();
                    void visionPromptsQuery.refetch();
                    void activeConfigQuery.refetch();
                  }}
                >
                  Refrescar prompts
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Contenido del prompt</Label>
                    <Textarea
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      className="min-h-72 font-mono text-xs"
                      placeholder="Carga primero el prompt base o el prompt asignado a la cadena."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => savePromptMutation.mutate()} disabled={savePromptMutation.isPending || !currentPromptFile || !promptDraft.trim()}>
                      Guardar prompt actual
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const promptFile = currentPromptFile ?? basePromptFile;
                        if (!promptFile) return;
                        loadPromptMutation.mutate(promptFile);
                      }}
                    >
                      Releer desde backend
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <div>
                    <p className="text-sm font-medium text-white">Archivos disponibles para {selectedPromptSlot}</p>
                    <p className="text-xs text-slate-400">Esto te ayuda a validar rápido qué prompt base existe y cuál quedó ya creado por cadena.</p>
                  </div>
                  <div className="space-y-2">
                    {promptOptions.length ? (
                      promptOptions.map((item) => (
                        <button
                          key={`${selectedPromptSlot}-${item.prompt_file}`}
                          type="button"
                          className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                            (currentPromptFile ?? basePromptFile) === item.prompt_file
                              ? "border-cyan-300/40 bg-cyan-500/10 text-cyan-100"
                              : "border-white/10 bg-black/20 text-slate-200 hover:bg-white/5"
                          }`}
                          onClick={() => loadPromptMutation.mutate(item.prompt_file)}
                        >
                          <p className="font-mono text-xs">{item.prompt_file}</p>
                          <p className="mt-1 text-[11px] text-slate-400">updated_at: {formatDate(item.updated_at)}</p>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">Todavia no hay prompts listados para este slot.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </details>

      <TrainingFooterNote>
        Los aliases aqui resuelven el nombre de la cadena. Para mapeo OCR producto → canonico usa la pestaña Aliases resolucion.
      </TrainingFooterNote>
    </div>
  );
}
