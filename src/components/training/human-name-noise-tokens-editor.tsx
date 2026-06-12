"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Eraser, Loader2, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { HumanNameNoiseToken } from "@/types/ocr-api";
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

type Props = { account: string };

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

function isTokenActive(value: HumanNameNoiseToken["is_active"]): boolean {
  return value === 1 || value === true;
}

function normalizeToken(raw: string): string {
  return raw.trim().toUpperCase();
}

export function HumanNameNoiseTokensEditor({ account }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [isActiveInput, setIsActiveInput] = useState(true);

  const queryKey = ["human-name-noise-tokens", account, showInactive];

  const tokensQuery = useQuery({
    queryKey,
    queryFn: () => ocrApi.listHumanNameNoiseTokens(account, { includeInactive: showInactive }),
    enabled: Boolean(account?.trim()),
    retry: 1,
    staleTime: 30_000,
  });

  const tokens = tokensQuery.isError ? [] : (tokensQuery.data?.tokens ?? []);
  const seedInfo = tokensQuery.data?.seed_info;

  const filteredTokens = useMemo(() => {
    if (!search.trim()) return tokens;
    const q = search.trim().toLowerCase();
    return tokens.filter((item) => item.token.toLowerCase().includes(q));
  }, [tokens, search]);

  const activeCount = useMemo(() => tokens.filter((item) => isTokenActive(item.is_active)).length, [tokens]);

  function resetForm() {
    setEditingId(null);
    setTokenInput("");
    setIsActiveInput(true);
    setShowForm(false);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(item: HumanNameNoiseToken) {
    setEditingId(item.id);
    setTokenInput(item.token);
    setIsActiveInput(isTokenActive(item.is_active));
    setShowForm(true);
  }

  function handleApiError(error: unknown, fallbackTitle: string) {
    if (error instanceof HttpError) {
      if (error.status === 409) {
        toast.error("Conflicto", { description: "Ya existe otro token con el mismo texto." });
        return;
      }
      if (error.status === 404) {
        toast.error("No encontrado", { description: "El token ya no existe. Refrescando lista." });
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
      const token = normalizeToken(tokenInput);
      if (!token) throw new Error("El token no puede estar vacio.");
      return ocrApi.upsertHumanNameNoiseToken(account, { token, is_active: isActiveInput });
    },
    onSuccess: () => {
      toast.success("Token agregado");
      queryClient.invalidateQueries({ queryKey: ["human-name-noise-tokens", account] });
      resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo agregar el token"),
  });

  const patchMutation = useMutation({
    mutationFn: async () => {
      if (editingId == null) throw new Error("Sin ID para editar.");
      const token = normalizeToken(tokenInput);
      if (!token) throw new Error("El token no puede estar vacio.");
      return ocrApi.patchHumanNameNoiseToken(account, editingId, { token, is_active: isActiveInput });
    },
    onSuccess: () => {
      toast.success("Token actualizado");
      queryClient.invalidateQueries({ queryKey: ["human-name-noise-tokens", account] });
      resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo actualizar el token"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (tokenId: number) => ocrApi.deleteHumanNameNoiseToken(account, tokenId),
    onSuccess: () => {
      toast.success("Token eliminado");
      queryClient.invalidateQueries({ queryKey: ["human-name-noise-tokens", account] });
      if (editingId !== null) resetForm();
    },
    onError: (error) => handleApiError(error, "No se pudo eliminar el token"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) =>
      ocrApi.patchHumanNameNoiseToken(account, id, { is_active: active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["human-name-noise-tokens", account] });
    },
    onError: (error) => handleApiError(error, "No se pudo cambiar el estado"),
  });

  const isSaving = createMutation.isPending || patchMutation.isPending;

  const loadErrorMessage =
    tokensQuery.error instanceof HttpError
      ? tokensQuery.error.detail
      : tokensQuery.error instanceof Error
        ? tokensQuery.error.message
        : tokensQuery.isError
          ? "No se pudo cargar el catalogo de tokens."
          : null;

  return (
    <div className="space-y-4">
      <TrainingSectionHero
        tone="violet"
        icon={<Eraser className="h-4 w-4" />}
        title="Tokens universales de ruido de nombre"
        description="Tokens sueltos que el sistema elimina al reconstruir el nombre humano del producto. Ej: PROMOCION, OFERTA, VIGENTE, PRECIO."
        badges={
          <>
            <Badge variant="outline" className="text-[10px]">
              global por cuenta
            </Badge>
            <Badge className="border-violet-400/30 bg-violet-500/10 text-[10px] text-violet-100">
              {tokens.length} token{tokens.length !== 1 ? "s" : ""}
            </Badge>
          </>
        }
        kpis={[
          { label: "Total", value: tokens.length },
          { label: "Activos", value: activeCount },
          { label: "Inactivos", value: tokens.length - activeCount },
          { label: "Uso", value: "human_name_rewrite", hint: "limpieza OCR/promo" },
        ]}
        footer={
          <p className="text-xs leading-5 text-slate-300">
            Catalogo universal: no usa chain_code ni whitelist por cadena. No confundir con frases ignoradas de nombre
            (slogans o banners, potencialmente por cadena).
          </p>
        }
      />

      {loadErrorMessage ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          {loadErrorMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Buscar token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
          <Switch id="hnn-show-inactive" checked={showInactive} onCheckedChange={setShowInactive} className="scale-75" />
          <Label htmlFor="hnn-show-inactive" className="cursor-pointer text-xs text-slate-400">
            Mostrar inactivos
          </Label>
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={startCreate}>
          <Plus className="h-3.5 w-3.5" />
          Agregar token
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => tokensQuery.refetch()}
          disabled={tokensQuery.isFetching}
        >
          {tokensQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refrescar"}
        </Button>
      </div>

      {showForm ? (
        <TrainingFormCard
          title={editingId != null ? `Editar token #${editingId}` : "Nuevo token de ruido"}
          tone="violet"
        >
          <div className="space-y-1">
            <Label htmlFor="hnn-token" className="text-xs">
              Token
            </Label>
            <Input
              id="hnn-token"
              className="h-9 font-mono text-sm uppercase"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="PROMOCION"
              autoFocus
            />
            <p className="text-[10px] text-slate-500">Una sola palabra o token unitario. Se normaliza a mayusculas.</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <Label htmlFor="hnn-active" className="text-xs">
              Activo
            </Label>
            <Switch id="hnn-active" checked={isActiveInput} onCheckedChange={setIsActiveInput} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => (editingId != null ? patchMutation.mutate() : createMutation.mutate())}
              disabled={isSaving || !tokenInput.trim()}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {editingId != null ? "Guardar cambios" : "Crear token"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={resetForm}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </TrainingFormCard>
      ) : null}

      <TrainingListShell
        loading={tokensQuery.isLoading}
        empty={filteredTokens.length === 0}
        emptyMessage={
          tokensQuery.isError
            ? "Corrige el error de carga para ver los tokens."
            : search.trim()
              ? "Sin resultados para la busqueda."
              : "No hay tokens configurados. Agrega uno para comenzar."
        }
      >
        <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
          <span>Token</span>
          <span className="w-16 text-center">Activo</span>
          <span className="w-28 text-center">Actualizado</span>
          <span className="w-20 text-center">Acciones</span>
        </div>
        <div className="divide-y divide-white/5">
          {filteredTokens.map((item) => {
            const active = isTokenActive(item.is_active);
            return (
              <div
                key={`hnn-${item.id}`}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-4 py-2 hover:bg-white/[0.03] ${!active ? "opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-white">{item.token}</p>
                </div>
                <div className="flex w-16 justify-center">
                  <Switch
                    checked={active}
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
                      if (
                        confirm(
                          `Eliminar el token "${item.token}"? Esta accion es permanente y afecta la humanizacion de nombres.`,
                        )
                      ) {
                        deleteMutation.mutate(item.id);
                      }
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
      </TrainingListShell>

      {seedInfo ? (
        <details className="rounded-lg border border-white/10 bg-black/20 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-400">Info tecnica de seed</summary>
          <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-slate-500">
            {JSON.stringify(seedInfo, null, 2)}
          </pre>
        </details>
      ) : null}

      <TrainingFooterNote>
        Los cambios se aplican al proximo job creado. Estos tokens son universales para toda la cuenta: no dependen de
        cadena. Para frases o slogans (con alcance opcional por cadena), usa Frases ignoradas de nombre.
      </TrainingFooterNote>
    </div>
  );
}