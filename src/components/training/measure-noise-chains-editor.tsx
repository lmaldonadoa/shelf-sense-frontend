"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Edit2, Info, Loader2, Plus, Ruler, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { MeasureNoiseChain } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrainingFooterNote,
  TrainingFormCard,
  TrainingListShell,
  TrainingSectionHero,
} from "@/components/training/training-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  account: string;
  onGoToChains?: () => void;
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("es", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function isChainActive(value: MeasureNoiseChain["is_active"]): boolean {
  return value === 1 || value === true;
}

function normalizeChainCode(raw: string): string {
  return raw.trim().toLowerCase();
}

function MeasureNoiseScopeTable({
  items,
  onEdit,
  onToggle,
  onRemove,
  isRemoving,
}: {
  items: MeasureNoiseChain[];
  onEdit: (item: MeasureNoiseChain) => void;
  onToggle: (chainCode: string, active: boolean) => void;
  onRemove: (chainCode: string) => void;
  isRemoving: boolean;
}) {
  return (
    <div>
      <div className="sticky top-0 z-10 grid min-w-[720px] grid-cols-[minmax(140px,1.1fr)_minmax(180px,1.4fr)_72px_minmax(120px,0.9fr)_88px] items-center gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
        <span>chain_code</span>
        <span>Notas</span>
        <span className="text-center">Regla activa</span>
        <span className="text-center">Actualizada</span>
        <span className="text-center">Acciones</span>
      </div>
      <div className="min-w-[720px] divide-y divide-white/5">
        {items.map((item) => {
          const active = isChainActive(item.is_active);
          return (
            <div
              key={`mnc-${item.id}-${item.chain_code}`}
              className={`grid grid-cols-[minmax(140px,1.1fr)_minmax(180px,1.4fr)_72px_minmax(120px,0.9fr)_88px] items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03] ${!active ? "opacity-55" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-white">{item.chain_code}</p>
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-[11px] text-slate-400">{item.notes?.trim() || "—"}</p>
              </div>
              <div className="flex justify-center">
                <Switch
                  checked={active}
                  onCheckedChange={(checked) => onToggle(item.chain_code, checked)}
                  className="scale-75"
                />
              </div>
              <div className="text-center">
                <span className="text-[10px] text-slate-500">{formatDate(item.updated_at ?? item.created_at)}</span>
              </div>
              <div className="flex justify-center gap-1">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onEdit(item)} title="Editar alcance">
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-rose-400 hover:text-rose-300"
                  onClick={() => {
                    if (
                      confirm(
                        `Quitar el alcance de "${item.chain_code}"? La correccion de medidas dejara de aplicarse en esa cadena.`,
                      )
                    ) {
                      onRemove(item.chain_code);
                    }
                  }}
                  disabled={isRemoving}
                  title="Quitar alcance"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MeasureNoiseChainsEditor({ account, onGoToChains }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingChainCode, setEditingChainCode] = useState<string | null>(null);
  const [chainCodeInput, setChainCodeInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [isActiveInput, setIsActiveInput] = useState(true);

  const queryKey = ["measure-noise-chains", account, showInactive];

  const chainsQuery = useQuery({
    queryKey,
    queryFn: () => ocrApi.listMeasureNoiseChains(account, { includeInactive: showInactive }),
    enabled: Boolean(account?.trim()),
    retry: 1,
    staleTime: 30_000,
  });

  const chains = chainsQuery.isError ? [] : (chainsQuery.data?.measure_noise_chains ?? []);

  const loadErrorMessage =
    chainsQuery.error instanceof HttpError
      ? chainsQuery.error.detail
      : chainsQuery.error instanceof Error
        ? chainsQuery.error.message
        : chainsQuery.isError
          ? "No se pudo cargar el alcance de la regla."
          : null;

  const filteredChains = useMemo(() => {
    if (!search.trim()) return chains;
    const q = search.trim().toLowerCase();
    return chains.filter(
      (item) =>
        item.chain_code.toLowerCase().includes(q) ||
        String(item.notes ?? "")
          .toLowerCase()
          .includes(q),
    );
  }, [chains, search]);

  const activeCount = useMemo(() => chains.filter((item) => isChainActive(item.is_active)).length, [chains]);

  function resetForm() {
    setEditingChainCode(null);
    setChainCodeInput("");
    setNotesInput("");
    setIsActiveInput(true);
    setShowForm(false);
  }

  function startActivate() {
    resetForm();
    setShowForm(true);
  }

  function startEditScope(item: MeasureNoiseChain) {
    setEditingChainCode(item.chain_code);
    setChainCodeInput(item.chain_code);
    setNotesInput(item.notes ?? "");
    setIsActiveInput(isChainActive(item.is_active));
    setShowForm(true);
  }

  function handleApiError(error: unknown, fallbackTitle: string) {
    if (error instanceof HttpError) {
      if (error.status === 404) {
        toast.error("No encontrado", { description: "El alcance ya no existe. Refrescando lista." });
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

  const activateMutation = useMutation({
    mutationFn: async () => {
      const chain_code = normalizeChainCode(chainCodeInput);
      if (!chain_code) throw new Error("El codigo de cadena no puede estar vacio.");
      return ocrApi.upsertMeasureNoiseChain(account, {
        chain_code,
        is_active: isActiveInput,
        notes: notesInput.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Regla activada para la cadena");
      queryClient.invalidateQueries({ queryKey: ["measure-noise-chains", account] });
      resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo activar la regla en esa cadena"),
  });

  const patchScopeMutation = useMutation({
    mutationFn: async () => {
      if (!editingChainCode) throw new Error("Sin cadena en el alcance.");
      return ocrApi.patchMeasureNoiseChain(account, editingChainCode, {
        notes: notesInput.trim() || undefined,
        is_active: isActiveInput,
      });
    },
    onSuccess: () => {
      toast.success("Alcance de la regla actualizado");
      queryClient.invalidateQueries({ queryKey: ["measure-noise-chains", account] });
      resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo actualizar el alcance"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ chainCode, active }: { chainCode: string; active: boolean }) =>
      ocrApi.patchMeasureNoiseChain(account, chainCode, { is_active: active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["measure-noise-chains", account] });
    },
    onError: (error) => handleApiError(error, "No se pudo cambiar el estado de la regla"),
  });

  const removeScopeMutation = useMutation({
    mutationFn: async (chainCode: string) => ocrApi.deleteMeasureNoiseChain(account, chainCode),
    onSuccess: () => {
      toast.success("Regla desactivada para la cadena");
      queryClient.invalidateQueries({ queryKey: ["measure-noise-chains", account] });
      if (editingChainCode) resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo quitar el alcance"),
  });

  const isSaving = activateMutation.isPending || patchScopeMutation.isPending;

  let listContent: ReactNode;
  if (chainsQuery.isError) {
    listContent = (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        Corrige el error de carga arriba para ver las cadenas activadas.
      </div>
    );
  } else {
    listContent = (
      <MeasureNoiseScopeTable
        items={filteredChains}
        onEdit={startEditScope}
        onToggle={(chainCode, active) => toggleActiveMutation.mutate({ chainCode, active })}
        onRemove={(chainCode) => removeScopeMutation.mutate(chainCode)}
        isRemoving={removeScopeMutation.isPending}
      />
    );
  }

  return (
    <div className="space-y-4">
      <TrainingSectionHero
        tone="violet"
        icon={<Ruler className="h-4 w-4" />}
        title="Correccion de medidas por cadena"
        description="Define en que cadenas se activa la regla de correccion de medidas y ruido OCR en el pipeline promocional."
        badges={
          <>
            <Badge variant="outline" className="text-[10px]">
              regla del pipeline
            </Badge>
            <Badge className="border-violet-400/30 bg-violet-500/10 text-[10px] text-violet-100">
              ambito: {activeCount} cadena{activeCount !== 1 ? "s" : ""} activa{activeCount !== 1 ? "s" : ""}
            </Badge>
          </>
        }
        kpis={[
          { label: "Regla tecnica", value: "Correccion OCR", hint: "tamanos y multipacks" },
          { label: "Ambito actual", value: activeCount, hint: "cadenas activadas" },
          { label: "En alcance", value: chains.length, hint: "total configurado" },
          { label: "Inactivas", value: chains.length - activeCount, hint: "sin aplicar regla" },
        ]}
        footer={
          <div className="space-y-2.5">
            <p className="text-xs leading-5 text-slate-300">
              Esta configuracion no administra el catalogo de cadenas. Solo define en que cadenas se aplica la
              correccion automatica de ruido OCR en tamanos y multipacks.
            </p>
            <p className="text-[11px] leading-5 text-slate-500">
              Ejemplos tipicos: &quot;7 75ML&quot; → &quot;75ML&quot;, &quot;90 900ML&quot; → &quot;900ML&quot;,
              &quot;85 X2&quot; → &quot;2X85G&quot; cuando hay suficiente evidencia.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/20 bg-sky-950/15 px-3 py-2.5">
              <p className="text-[11px] leading-5 text-sky-200/90">
                Las cadenas disponibles vienen del catalogo de cadenas. Aqui solo defines si esta regla se aplica o no a
                cada una.
              </p>
              {onGoToChains ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 border-sky-400/30 text-xs text-sky-100"
                  onClick={onGoToChains}
                >
                  Ir a Cadenas
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-5 text-amber-100/90">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
        <p>
          <span className="font-medium text-amber-100">Importante:</span> si una cadena no existe o esta mal resuelta
          en el sistema, corrigela en la pestana Cadenas. Esta pantalla no reemplaza esa configuracion.
          {onGoToChains ? (
            <>
              {" "}
              <button type="button" onClick={onGoToChains} className="underline hover:text-amber-50">
                ¿Necesitas crear o corregir una cadena? Hazlo en Cadenas.
              </button>
            </>
          ) : null}
        </p>
      </div>

      {chainsQuery.isError ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-950/20 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <div>
                <p className="text-sm font-medium text-rose-100">No se pudo cargar el alcance de la regla</p>
                <p className="mt-1 text-xs text-rose-200/80">{loadErrorMessage}</p>
                <p className="mt-2 font-mono text-[10px] text-rose-200/60">
                  GET /v1/accounts/{account}/measure-noise-chains
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-rose-400/30 text-xs text-rose-100"
              onClick={() => chainsQuery.refetch()}
              disabled={chainsQuery.isFetching}
            >
              {chainsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reintentar"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Cadenas activadas</h3>
            <p className="text-[11px] text-slate-500">Ambito por cadena — activacion de la regla, no catalogo</p>
          </div>
          <Button size="sm" className="h-9 gap-1.5" onClick={startActivate}>
            <Plus className="h-3.5 w-3.5" />
            Activar cadena
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Buscar chain_code o nota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
          <Label htmlFor="mnc-inactive" className="text-xs text-slate-300">
            Mostrar inactivas
          </Label>
          <Switch id="mnc-inactive" checked={showInactive} onCheckedChange={setShowInactive} className="scale-90" />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => chainsQuery.refetch()}
          disabled={chainsQuery.isFetching}
        >
          {chainsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refrescar"}
        </Button>
      </div>

      {showForm ? (
        <TrainingFormCard
          title={editingChainCode ? `Editar alcance: ${editingChainCode}` : "Activar regla en una cadena"}
          tone="violet"
        >
          <div className="space-y-1">
            <Label htmlFor="mnc-chain" className="text-xs">
              Codigo de cadena
            </Label>
            <Input
              id="mnc-chain"
              className="h-9 font-mono text-sm"
              value={chainCodeInput}
              onChange={(e) => setChainCodeInput(e.target.value)}
              placeholder="coral, mi comisariato, el rosado"
              disabled={editingChainCode != null}
              autoFocus={editingChainCode == null}
            />
            <p className="text-[10px] text-slate-500">
              Debe corresponder al chain_code usado por el sistema. Se normaliza en minusculas al guardar.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mnc-notes" className="text-xs">
              Notas
            </Label>
            <Textarea
              id="mnc-notes"
              className="min-h-20 text-sm"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Ej: OCR rompe multipacks en promociones de esta cadena"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <Label htmlFor="mnc-active" className="text-xs">
              Activa esta regla en esta cadena
            </Label>
            <Switch id="mnc-active" checked={isActiveInput} onCheckedChange={setIsActiveInput} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => (editingChainCode ? patchScopeMutation.mutate() : activateMutation.mutate())}
              disabled={isSaving || (!editingChainCode && !chainCodeInput.trim())}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {editingChainCode ? "Guardar alcance" : "Aplicar regla"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={resetForm}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </TrainingFormCard>
      ) : null}

      <TrainingListShell
        loading={chainsQuery.isLoading}
        empty={!chainsQuery.isError && filteredChains.length === 0}
        emptyMessage={
          search.trim()
            ? "Sin resultados para la busqueda."
            : "Esta regla todavia no esta activada para ninguna cadena."
        }
        emptySubtitle={
          search.trim() || chainsQuery.isError
            ? undefined
            : "Activa una cadena para aplicar la correccion automatica de ruido OCR en medidas."
        }
      >
        {listContent}
      </TrainingListShell>

      <TrainingFooterNote>
        Los cambios se aplican al proximo job de promociones creado. No afectan jobs en curso. No edita aliases,
        frases ignoradas ni el catalogo de cadenas.
      </TrainingFooterNote>
    </div>
  );
}