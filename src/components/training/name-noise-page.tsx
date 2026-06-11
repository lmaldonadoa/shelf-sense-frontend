"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Loader2, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { AccountIgnoredPhrase } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = { account: string };

const SCOPE = "name";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

export function NameNoisePage({ account }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [phraseInput, setPhraseInput] = useState("");
  const [isActiveInput, setIsActiveInput] = useState(true);
  const [chainWhitelistInput, setChainWhitelistInput] = useState("");

  const queryKey = ["account-ignored-phrases", account, SCOPE];

  const phrasesQuery = useQuery({
    queryKey,
    queryFn: () => ocrApi.listAccountIgnoredPhrases(account, SCOPE),
  });

  const phrases = phrasesQuery.data?.ignored_phrases ?? [];
  const seedInfo = phrasesQuery.data?.name_noise_seed_info;

  const filteredPhrases = useMemo(() => {
    if (!search.trim()) return phrases;
    const q = search.trim().toLowerCase();
    return phrases.filter(
      (p) =>
        p.phrase.toLowerCase().includes(q) ||
        p.chain_whitelist.some((c) => c.toLowerCase().includes(q)),
    );
  }, [phrases, search]);

  function resetForm() {
    setEditingId(null);
    setPhraseInput("");
    setIsActiveInput(true);
    setChainWhitelistInput("");
    setShowForm(false);
  }

  function startEdit(item: AccountIgnoredPhrase) {
    setEditingId(item.id);
    setPhraseInput(item.phrase);
    setIsActiveInput(item.is_active === 1 || item.is_active === true);
    setChainWhitelistInput(item.chain_whitelist.join(", "));
    setShowForm(true);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function parseChainWhitelist(raw: string): string[] {
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  function handleApiError(error: unknown, fallbackTitle: string) {
    if (error instanceof HttpError) {
      if (error.status === 409) {
        toast.error("Conflicto", { description: "Ya existe otra frase con el mismo texto y scope." });
        return;
      }
      if (error.status === 404) {
        toast.error("No encontrado", { description: "El registro ya no existe. Refrescando lista." });
        queryClient.invalidateQueries({ queryKey });
        resetForm();
        return;
      }
      toast.error(fallbackTitle, { description: error.detail });
      return;
    }
    const detail = error instanceof Error ? error.message : "Error inesperado";
    toast.error(fallbackTitle, { description: detail });
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const phrase = phraseInput.trim();
      if (!phrase) throw new Error("La frase no puede estar vacia.");
      return ocrApi.createAccountIgnoredPhrase(account, {
        phrase,
        scope: SCOPE,
        is_active: isActiveInput,
        chain_whitelist: parseChainWhitelist(chainWhitelistInput),
      });
    },
    onSuccess: () => {
      toast.success("Frase creada");
      queryClient.invalidateQueries({ queryKey });
      resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo crear la frase"),
  });

  const patchMutation = useMutation({
    mutationFn: async () => {
      if (editingId == null) throw new Error("Sin ID para editar.");
      const phrase = phraseInput.trim();
      if (!phrase) throw new Error("La frase no puede estar vacia.");
      return ocrApi.patchAccountIgnoredPhrase(account, editingId, {
        phrase,
        is_active: isActiveInput,
        chain_whitelist: parseChainWhitelist(chainWhitelistInput),
      });
    },
    onSuccess: () => {
      toast.success("Frase actualizada");
      queryClient.invalidateQueries({ queryKey });
      resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo actualizar la frase"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ignoredId: number) => ocrApi.deleteAccountIgnoredPhrase(account, ignoredId),
    onSuccess: () => {
      toast.success("Frase eliminada");
      queryClient.invalidateQueries({ queryKey });
      if (editingId !== null) resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo eliminar la frase"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) =>
      ocrApi.patchAccountIgnoredPhrase(account, id, { is_active: active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => handleApiError(error, "No se pudo cambiar el estado"),
  });

  const isSaving = createMutation.isPending || patchMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader className="gap-1 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Ruido de nombres</CardTitle>
              <CardDescription className="mt-1 text-xs leading-5">
                Gestiona frases de banner, cadena o promocion que no deben contaminar el nombre humanizado del producto en promociones.
                <br />
                <span className="text-slate-500">Ejemplos: CORAL, INTERMERCADOS, TARJETA Y MAS BELLO, MINIMERCADOS.</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">scope: name</Badge>
              <Badge className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200">
                {phrases.length} frase{phrases.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Toolbar: search + create */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Buscar frase..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={startCreate}>
          <Plus className="h-3.5 w-3.5" />
          Agregar frase
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={() => phrasesQuery.refetch()} disabled={phrasesQuery.isFetching}>
          {phrasesQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refrescar"}
        </Button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <Card className="border-amber-300/20 bg-amber-500/5">
          <CardHeader className="gap-1 px-4 py-3 sm:px-5">
            <CardTitle className="text-sm">
              {editingId != null ? `Editar frase #${editingId}` : "Nueva frase de ruido"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5">
            <div className="space-y-1">
              <Label htmlFor="nn-phrase" className="text-xs">Frase</Label>
              <Input
                id="nn-phrase"
                className="h-9 font-mono text-sm uppercase"
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
                placeholder="CORAL"
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <Label htmlFor="nn-active" className="text-xs">Activa</Label>
                <Switch id="nn-active" checked={isActiveInput} onCheckedChange={setIsActiveInput} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nn-chains" className="text-xs">Cadenas whitelist (opcional)</Label>
                <Input
                  id="nn-chains"
                  className="h-9 text-sm"
                  value={chainWhitelistInput}
                  onChange={(e) => setChainWhitelistInput(e.target.value)}
                  placeholder="vacio = aplica global"
                />
                <p className="text-[10px] text-slate-500">Separadas por coma. Vacio = aplica a toda la cuenta.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => (editingId != null ? patchMutation.mutate() : createMutation.mutate())}
                disabled={isSaving || !phraseInput.trim()}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {editingId != null ? "Guardar cambios" : "Crear frase"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={resetForm}>
                <X className="mr-1 h-3.5 w-3.5" />
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card className="border-white/10 bg-white/5">
        <CardContent className="px-0 pb-0">
          {phrasesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando frases de ruido...
            </div>
          ) : filteredPhrases.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              {search.trim()
                ? "Sin resultados para la busqueda."
                : "No hay frases de ruido configuradas. Agrega una para comenzar."}
            </div>
          ) : (
            <div className="max-h-[min(60vh,600px)] overflow-y-auto">
              {/* Table header */}
              <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
                <span>Frase</span>
                <span className="w-24 text-center">Cadenas</span>
                <span className="w-16 text-center">Activa</span>
                <span className="w-28 text-center">Actualizado</span>
                <span className="w-20 text-center">Acciones</span>
              </div>
              <div className="divide-y divide-white/5">
                {filteredPhrases.map((item) => {
                  const isActive = item.is_active === 1 || item.is_active === true;
                  return (
                    <div
                      key={`nn-${item.id}`}
                      className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-4 py-2 hover:bg-white/[0.03] ${!isActive ? "opacity-50" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-white">{item.phrase}</p>
                      </div>
                      <div className="w-24 text-center">
                        {item.chain_whitelist.length > 0 ? (
                          <span className="text-[10px] text-slate-400" title={item.chain_whitelist.join(", ")}>
                            {item.chain_whitelist.length} cadena{item.chain_whitelist.length !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <Badge variant="outline" className="h-4 text-[9px]">Global</Badge>
                        )}
                      </div>
                      <div className="flex w-16 justify-center">
                        <Switch
                          checked={isActive}
                          onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: item.id, active: checked })}
                          className="scale-75"
                        />
                      </div>
                      <div className="w-28 text-center">
                        <span className="text-[10px] text-slate-500">{formatDate(item.updated_at ?? item.created_at)}</span>
                      </div>
                      <div className="flex w-20 justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => startEdit(item)}
                          title="Editar"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-rose-400 hover:text-rose-300"
                          onClick={() => {
                            if (confirm(`Eliminar "${item.phrase}"? Esta accion es permanente y afecta el pipeline.`))
                              deleteMutation.mutate(item.id);
                          }}
                          disabled={deleteMutation.isPending}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seed info (debug) */}
      {seedInfo && (
        <details className="rounded-lg border border-white/10 bg-black/20 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">Info tecnica de seed</summary>
          <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-slate-500">
            {JSON.stringify(seedInfo, null, 2)}
          </pre>
        </details>
      )}

      <div className="rounded-lg border border-sky-500/20 bg-sky-950/15 px-3 py-2.5 text-[11px] leading-5 text-sky-200/80">
        Los cambios se aplican al proximo job creado. No afectan jobs en curso.
        Estas frases se usan para limpiar ruido del nombre final del producto en el pipeline de promociones.
      </div>
    </div>
  );
}
