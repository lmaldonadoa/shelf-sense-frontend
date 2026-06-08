"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { deepMerge, HttpError, ocrApi } from "@/lib/ocrApi";
import type { ChainCatalogItem } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    setAliasText("");
    setIgnoredPhraseText("");
    setChainForm({ chain_code: "", display_name: "", group_code: "", priority: 100, is_active: true });
  }

  function loadChain(chain: ChainCatalogItem) {
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

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Cadenas y filtros semanticos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3 text-sm text-slate-200">
            <p className="font-medium text-cyan-100">Una sola vista para cada cadena</p>
            <p className="mt-1 text-slate-300">
              Aqui administramos datos base de la cadena, aliases para resolverla mejor y frases no-producto para reducir ruido del OCR.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>account_name</Label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
            <div>
              <Label>chain_code</Label>
              <Input value={chainForm.chain_code} onChange={(e) => setChainForm((prev) => ({ ...prev, chain_code: normalizeChainCode(e.target.value) }))} />
            </div>
            <div>
              <Label>display_name</Label>
              <Input value={chainForm.display_name} onChange={(e) => setChainForm((prev) => ({ ...prev, display_name: e.target.value }))} />
            </div>
            <div>
              <Label>group_code</Label>
              <Input value={chainForm.group_code} onChange={(e) => setChainForm((prev) => ({ ...prev, group_code: e.target.value }))} />
            </div>
            <div>
              <Label>priority</Label>
              <Input type="number" value={String(chainForm.priority)} onChange={(e) => setChainForm((prev) => ({ ...prev, priority: Number(e.target.value) || 100 }))} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={chainForm.is_active} onChange={(e) => setChainForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
                Activa
              </label>
            </div>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button onClick={() => saveChainMutation.mutate()} disabled={saveChainMutation.isPending}>
                {selectedChainId ? "Actualizar cadena" : "Crear cadena"}
              </Button>
              <Button variant="outline" onClick={resetForm}>Nueva</Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-slate-400">Cadenas visibles</p>
              <p className="mt-1 text-2xl font-semibold text-white">{filteredChains.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-slate-400">Aliases</p>
              <p className="mt-1 text-2xl font-semibold text-white">{totalAliases}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-slate-400">Frases no-producto</p>
              <p className="mt-1 text-2xl font-semibold text-white">{totalIgnoredPhrases}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
              <p className="font-medium text-slate-100">Backend activo</p>
              <p className="mt-1 break-all font-mono">{ocrApi.backendUrl}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Catalogo de cadenas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {chainsErrorDetail ? (
            <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              <p className="font-semibold">No se pudo cargar el catalogo de cadenas.</p>
              {chainsErrorStatus === 404 ? (
                <p className="mt-1">El backend de este ambiente no expone aun el modulo de cadenas.</p>
              ) : null}
              <p className="mt-1">{chainsErrorDetail}</p>
              <p className="mt-1 text-xs text-rose-200/90">Revisa API key, scope de cuenta y entorno activo.</p>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <Label>Buscar cadena, alias o frase</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="supermaxi, coral, dia de utilidades..."
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => void chainsQuery.refetch()} disabled={chainsQuery.isFetching}>
                Refrescar
              </Button>
              <Button variant="outline" onClick={() => setSearch("")} disabled={!search.trim()}>
                Limpiar filtro
              </Button>
            </div>
          </div>

          {chainsQuery.isLoading ? <p className="text-sm text-slate-300">Cargando catalogo...</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>chain_code</TableHead>
                <TableHead>display_name</TableHead>
                <TableHead>group_code</TableHead>
                <TableHead>priority</TableHead>
                <TableHead>estado</TableHead>
                <TableHead>aliases</TableHead>
                <TableHead>frases no-producto</TableHead>
                <TableHead>accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChains.map((row) => {
                const selected = row.id === selectedChainId;
                return (
                  <TableRow key={row.id} className={selected ? "bg-cyan-500/10" : undefined}>
                    <TableCell className="font-mono text-xs">{row.chain_code}</TableCell>
                    <TableCell>{row.display_name ?? "-"}</TableCell>
                    <TableCell>{row.group_code ?? "-"}</TableCell>
                    <TableCell>{row.priority ?? "-"}</TableCell>
                    <TableCell>{Boolean(row.is_active) ? <Badge>activa</Badge> : <Badge variant="secondary">inactiva</Badge>}</TableCell>
                    <TableCell>{row.aliases?.length ?? 0}</TableCell>
                    <TableCell>{row.ignored_phrases?.length ?? 0}</TableCell>
                    <TableCell>
                      <Button size="sm" variant={selected ? "default" : "outline"} onClick={() => loadChain(row)}>
                        {selected ? "Seleccionada" : "Abrir"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {!chainsQuery.isLoading && !chainsErrorDetail && !filteredChains.length ? (
            <p className="text-sm text-amber-200">
              No hay cadenas para mostrar con el filtro actual. Limpia el filtro o revisa si esta cuenta tiene datos cargados.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>Aliases de cadena</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedChain ? <p className="text-sm text-muted-foreground">Selecciona una cadena para administrar sus aliases.</p> : null}
            {selectedChain ? (
              <>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
                  <p className="font-medium text-white">{selectedChain.display_name ?? selectedChain.chain_code}</p>
                  <p className="mt-1 font-mono text-xs text-slate-400">{selectedChain.chain_code}</p>
                </div>
                <div className="flex gap-2">
                  <Input value={aliasText} onChange={(e) => setAliasText(e.target.value)} placeholder="Alias de cadena" />
                  <Button onClick={() => saveAliasMutation.mutate()} disabled={saveAliasMutation.isPending}>Agregar</Button>
                </div>
                <p className="text-xs text-slate-400">
                  Usa aliases cuando la cadena pueda llegar escrita de varias maneras en POS, OCR o naming comercial.
                </p>
                <div className="space-y-2">
                  {(selectedChain.aliases ?? []).length ? (
                    (selectedChain.aliases ?? []).map((alias) => (
                      <div key={alias.id} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                        <div>
                          <p className="text-sm text-white">{alias.alias_text}</p>
                          <p className="text-xs text-slate-400">source: {alias.source ?? "-"}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (!window.confirm(`Eliminar alias "${alias.alias_text}"?`)) return;
                            deleteAliasMutation.mutate(alias.id);
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Todavia no hay aliases para esta cadena.</p>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>Frases no-producto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedChain ? <p className="text-sm text-muted-foreground">Selecciona una cadena para administrar frases ignoradas.</p> : null}
            {selectedChain ? (
              <>
                <div className="flex gap-2">
                  <Input value={ignoredPhraseText} onChange={(e) => setIgnoredPhraseText(e.target.value)} placeholder="Ej. DIA DE UTILIDADES" />
                  <Button onClick={() => saveIgnoredPhraseMutation.mutate()} disabled={saveIgnoredPhraseMutation.isPending}>Agregar</Button>
                </div>
                <p className="text-xs text-slate-400">
                  Estas frases ayudan a descartar ruido de OCR dentro de la cadena cuando no representan un producto real.
                </p>
                <div className="space-y-2">
                  {(selectedChain.ignored_phrases ?? []).length ? (
                    (selectedChain.ignored_phrases ?? []).map((item) => (
                      <div key={item.id} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-white">{item.phrase}</p>
                            <p className="text-xs text-slate-400">
                              scope: {item.scope || "product"} | actualizada: {formatDate(item.updated_at)}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (!window.confirm(`Eliminar frase "${item.phrase}"?`)) return;
                              deleteIgnoredPhraseMutation.mutate(item.id);
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Todavia no hay frases no-producto para esta cadena.</p>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle>Probar resolucion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={resolveText} onChange={(e) => setResolveText(e.target.value)} placeholder="canal moderno mi comisariato hypermarket guayaquil" />
            <Button onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending || !resolveText.trim()}>
              Probar
            </Button>
            {resolveMutation.data ? (
              <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
                <p>
                  Estado: {resolveMutation.data.resolved ? <Badge>resuelto</Badge> : <Badge variant="destructive">sin match</Badge>}
                </p>
                <p className="mt-2">Cadena: {resolveMutation.data.match?.chain_code ?? "-"}</p>
                <p>Display: {resolveMutation.data.match?.display_name ?? "-"}</p>
                <p>Alias match: {resolveMutation.data.match?.matched_alias ?? "-"}</p>
                <p>Source: {resolveMutation.data.match?.resolution_source ?? "-"}</p>
                {!resolveMutation.data.resolved ? (
                  <p className="mt-2 text-amber-200">Sin match. Revisa aliases, naming de cadena o datos POS.</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Usa este bloque para validar rapido si el texto que viene del OCR o del POS termina resolviendo la cadena correcta.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Prompts por cadena</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
