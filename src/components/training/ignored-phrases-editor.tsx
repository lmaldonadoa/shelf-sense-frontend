"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ban, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { AccountIgnoredPhrase, ChainIgnoredPhrase } from "@/types/ocr-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  TrainingCountBadge,
  TrainingFooterNote,
  TrainingFormCard,
  TrainingListShell,
  TrainingSectionHero,
} from "@/components/training/training-ui";

type Props = { account: string; chainId?: string };

type IgnoredPhraseForm = {
  phrase: string;
  scope: "product" | "name";
  is_active?: boolean;
  chain_whitelist?: string[];
};

type IgnoredPhraseRow = {
  id: number;
  phrase: string;
  scope: string;
  is_active?: boolean | number;
  chain_whitelist?: string[];
};

function normalizePhraseRow(row: AccountIgnoredPhrase | ChainIgnoredPhrase): IgnoredPhraseRow {
  return {
    id: row.id,
    phrase: row.phrase,
    scope: row.scope,
    is_active: row.is_active,
    chain_whitelist: "chain_whitelist" in row ? row.chain_whitelist : undefined,
  };
}

export function IgnoredPhrasesEditor({ account, chainId }: Props) {
  const [accountName] = useState(account);
  const parsedChainId = chainId ? Number(chainId) : NaN;
  const hasChainScope = Number.isFinite(parsedChainId) && parsedChainId > 0;

  const [formData, setFormData] = useState<IgnoredPhraseForm>({
    phrase: "",
    scope: "product",
    is_active: true,
    chain_whitelist: [],
  });
  const [chainInput, setChainInput] = useState("");

  const phrasesQuery = useQuery({
    queryKey: ["ignored-phrases", accountName, hasChainScope ? parsedChainId : "account"],
    queryFn: async () => {
      if (hasChainScope) {
        const rows = await ocrApi.listChainIgnoredPhrases(accountName, parsedChainId);
        return rows.map(normalizePhraseRow);
      }
      const response = await ocrApi.listAccountIgnoredPhrases(accountName);
      return response.ignored_phrases.map(normalizePhraseRow);
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const phrase = formData.phrase.trim();
      if (!phrase) throw new HttpError(400, "La frase es obligatoria");

      if (hasChainScope) {
        return ocrApi.upsertChainIgnoredPhrase(accountName, parsedChainId, {
          phrase,
          scope: formData.scope,
          is_active: formData.is_active !== false,
        });
      }

      return ocrApi.createAccountIgnoredPhrase(accountName, {
        phrase,
        scope: formData.scope,
        is_active: formData.is_active !== false,
        chain_whitelist: formData.chain_whitelist?.filter((c) => c.trim()) ?? [],
      });
    },
    onSuccess: () => {
      toast.success("Frase guardada");
      phrasesQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error("No se pudo guardar frase", {
        description: error instanceof HttpError ? error.message : "Error inesperado",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (phraseId: number) => {
      if (hasChainScope) {
        return ocrApi.deleteChainIgnoredPhrase(accountName, parsedChainId, phraseId);
      }
      return ocrApi.deleteAccountIgnoredPhrase(accountName, phraseId);
    },
    onSuccess: () => {
      toast.success("Frase eliminada");
      phrasesQuery.refetch();
    },
    onError: (error) => {
      toast.error("No se pudo eliminar frase", {
        description: error instanceof HttpError ? error.message : "Error inesperado",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      phrase: "",
      scope: "product",
      is_active: true,
      chain_whitelist: [],
    });
    setChainInput("");
  };

  const handleAddChain = () => {
    if (chainInput.trim()) {
      setFormData((prev) => ({
        ...prev,
        chain_whitelist: [...(prev.chain_whitelist || []), chainInput.trim().toLowerCase()],
      }));
      setChainInput("");
    }
  };

  const handleRemoveChain = (chain: string) => {
    setFormData((prev) => ({
      ...prev,
      chain_whitelist: (prev.chain_whitelist || []).filter((c) => c !== chain),
    }));
  };

  const phrases = phrasesQuery.isError ? [] : (phrasesQuery.data ?? []);
  const productScopeCount = useMemo(
    () => phrases.filter((p) => p.scope === "product").length,
    [phrases],
  );
  const loadErrorMessage =
    phrasesQuery.error instanceof HttpError
      ? phrasesQuery.error.message
      : phrasesQuery.isError
        ? "No se pudieron cargar las frases ignoradas."
        : null;

  return (
    <div className="space-y-4">
      <TrainingSectionHero
        tone="emerald"
        icon={<Ban className="h-4 w-4" />}
        title="Frases ignoradas"
        description={
          hasChainScope
            ? "Frases especificas de esta cadena que descartan productos o limpian nombres."
            : "Frases a nivel de cuenta que descartan productos invalidos o limpian ruido del nombre."
        }
        badges={
          <>
            <Badge variant="outline" className="text-[10px]">
              scope: product | name
            </Badge>
            <TrainingCountBadge count={phrases.length} label="frase" tone="emerald" />
          </>
        }
        kpis={[
          { label: "Total", value: phrases.length },
          { label: "Descarta producto", value: productScopeCount },
          { label: "Limpia nombre", value: phrases.length - productScopeCount },
          { label: "Con cadena", value: phrases.filter((p) => (p.chain_whitelist?.length ?? 0) > 0).length },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => phrasesQuery.refetch()}
          disabled={phrasesQuery.isFetching}
        >
          {phrasesQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {loadErrorMessage ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          {loadErrorMessage}
        </div>
      ) : null}

      <TrainingFormCard title="Nueva frase ignorada" tone="emerald">
        <div className="space-y-2">
          <Label htmlFor="phrase">Frase a Ignorar</Label>
          <Textarea
            id="phrase"
            placeholder="ej: DE TODO A MENOR PRECIO SIEMPRE"
            value={formData.phrase}
            onChange={(e) => setFormData((prev) => ({ ...prev, phrase: e.target.value }))}
            className="bg-white/5 border-white/10"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scope">Scope</Label>
          <select
            id="scope"
            value={formData.scope}
            onChange={(e) => setFormData((prev) => ({ ...prev, scope: e.target.value as "product" | "name" }))}
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-white"
          >
            <option value="product">Descartar Producto (producto invalido)</option>
            <option value="name">Limpiar Nombre (solo limpia texto)</option>
          </select>
          <p className="text-xs text-white/60 mt-1">
            {formData.scope === "product"
              ? "Si la frase aparece, todo el producto se descarta como inválido"
              : "Si la frase aparece, se limpia del nombre humano pero el producto sigue válido"}
          </p>
        </div>

        {!hasChainScope ? (
          <div className="space-y-2">
            <Label>Cadenas Whitelist (opcional - vacío = todas)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="ej: mi comisariato"
                value={chainInput}
                onChange={(e) => setChainInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddChain()}
                className="bg-white/5 border-white/10"
              />
              <Button onClick={handleAddChain} variant="outline" size="sm">
                Agregar
              </Button>
            </div>
            {formData.chain_whitelist && formData.chain_whitelist.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.chain_whitelist.map((chain) => (
                  <Badge key={chain} variant="secondary" className="gap-2">
                    {chain}
                    <button type="button" onClick={() => handleRemoveChain(chain)} className="text-xs">
                      ✕
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <Button size="sm" className="h-8 gap-1.5" onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
          {upsertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Crear frase
        </Button>
      </TrainingFormCard>

      <TrainingListShell
        loading={phrasesQuery.isLoading}
        empty={!phrasesQuery.isError && !phrases.length}
        emptyMessage={
          phrasesQuery.isError ? "Corrige el error de carga para ver las frases." : "No hay frases configuradas."
        }
        scrollable={false}
      >
        <div className="divide-y divide-white/5 px-4">
          {phrases.map((phrase) => (
            <div key={phrase.id} className="flex items-start justify-between gap-3 py-3 hover:bg-white/[0.02]">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-white">{phrase.phrase}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`h-4 text-[9px] ${phrase.scope === "product" ? "border-rose-400/30 text-rose-200" : "border-sky-400/30 text-sky-200"}`}
                  >
                    {phrase.scope === "product" ? "Descarta producto" : "Limpia nombre"}
                  </Badge>
                  {phrase.chain_whitelist?.length ? (
                    <span className="text-[10px] text-slate-500" title={phrase.chain_whitelist.join(", ")}>
                      {phrase.chain_whitelist.length} cadena{phrase.chain_whitelist.length !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <Badge variant="outline" className="h-4 text-[9px]">
                      Global
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                onClick={() => phrase.id && deleteMutation.mutate(phrase.id)}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </TrainingListShell>

      <TrainingFooterNote>
        Los cambios se aplican al proximo job creado. No afectan jobs en curso.
      </TrainingFooterNote>
    </div>
  );
}