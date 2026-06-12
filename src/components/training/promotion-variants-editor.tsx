"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2, Palette, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  TrainingFooterNote,
  TrainingFormCard,
  TrainingPanelCard,
  TrainingSectionHero,
} from "@/components/training/training-ui";
import { LoadingPanel } from "@/components/ui/async-content";

type Props = { account: string };

type PromotionVariant = {
  canonical: string;
  terms: string[];
  fallback_prefixes: string[];
  compound_terms: string[];
  category_scope?: string[];
  chain_whitelist?: string[];
  is_active?: boolean;
  notes?: string;
};

export function PromotionVariantsEditor({ account }: Props) {
  const [accountName] = useState(account);
  const [expandedDefaults, setExpandedDefaults] = useState(false);
  const [formData, setFormData] = useState<PromotionVariant>({
    canonical: "",
    terms: [],
    fallback_prefixes: [],
    compound_terms: [],
    category_scope: [],
    chain_whitelist: [],
    is_active: true,
    notes: "",
  });
  const [currentInputType, setCurrentInputType] = useState<"terms" | "fallback" | "compound">("terms");
  const [currentInput, setCurrentInput] = useState("");
  const [chainInput, setChainInput] = useState("");

  const variantsQuery = useQuery({
    queryKey: ["promotion-variants", accountName],
    queryFn: async () => {
      try {
        const response = await fetch(`/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-variants`);
        if (!response.ok) throw new Error("Failed to fetch variants");
        return response.json();
      } catch {
        return { defaults: [], custom: [], effective: [] };
      }
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!formData.canonical.trim()) throw new Error("Canonical es obligatorio");
      if (!formData.terms.length && !formData.fallback_prefixes.length && !formData.compound_terms.length) {
        throw new Error("Debes proporcionar al menos uno: terms, fallback_prefixes, o compound_terms");
      }

      const payload = {
        canonical: formData.canonical.trim().toUpperCase(),
        terms: formData.terms,
        fallback_prefixes: formData.fallback_prefixes,
        compound_terms: formData.compound_terms,
        category_scope: formData.category_scope?.filter(c => c.trim()) || [],
        chain_whitelist: formData.chain_whitelist?.filter(c => c.trim()) || [],
        is_active: formData.is_active !== false,
        notes: formData.notes?.trim(),
      };

      const response = await fetch(`/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to upsert variant");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Variante guardada");
      variantsQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (variantId: number) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-variants/${variantId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete variant");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Variante eliminada");
      variantsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const resetForm = () => {
    setFormData({
      canonical: "",
      terms: [],
      fallback_prefixes: [],
      compound_terms: [],
      category_scope: [],
      chain_whitelist: [],
      is_active: true,
      notes: "",
    });
    setCurrentInput("");
    setChainInput("");
  };

  const addToken = () => {
    if (!currentInput.trim()) return;
    const normalized = currentInput.trim().toUpperCase();
    setFormData(prev => ({
      ...prev,
      [currentInputType === "terms" ? "terms" : currentInputType === "fallback" ? "fallback_prefixes" : "compound_terms"]: [
        ...(currentInputType === "terms" ? prev.terms : currentInputType === "fallback" ? prev.fallback_prefixes : prev.compound_terms),
        normalized,
      ],
    }));
    setCurrentInput("");
  };

  const removeToken = (type: "terms" | "fallback" | "compound", token: string) => {
    setFormData(prev => ({
      ...prev,
      [type === "terms" ? "terms" : type === "fallback" ? "fallback_prefixes" : "compound_terms"]: (
        type === "terms" ? prev.terms : type === "fallback" ? prev.fallback_prefixes : prev.compound_terms
      ).filter(t => t !== token),
    }));
  };

  const data = variantsQuery.data || { defaults: [], custom: [], effective: [] };

  return (
    <div className="space-y-4">
      <TrainingSectionHero
        tone="violet"
        icon={<Palette className="h-4 w-4" />}
        title="Variantes de promocion"
        description="Fragancias, sabores y variantes de producto detectadas desde texto OCR de soporte."
        badges={
          <Badge variant="outline" className="border-violet-400/30 text-[10px] text-violet-100">
            promotions
          </Badge>
        }
        kpis={[
          { label: "Defaults", value: data.defaults?.length ?? 0 },
          { label: "Custom", value: data.custom?.length ?? 0 },
          { label: "Efectivas", value: data.effective?.length ?? 0 },
          { label: "Con terms", value: data.custom?.filter((v: { terms?: string[] }) => (v.terms?.length ?? 0) > 0).length ?? 0 },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => variantsQuery.refetch()}
          disabled={variantsQuery.isFetching}
        >
          {variantsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {variantsQuery.isLoading ? (
        <LoadingPanel message="Cargando variantes de promoción…" variant="cards" />
      ) : null}

      <TrainingFormCard title="Nueva variante" tone="violet">
          <div className="space-y-2">
            <Label htmlFor="canonical">Canonical (OBLIGATORIO)</Label>
            <Input
              id="canonical"
              placeholder="ej: TROPICAL, MARACUYA, ORQUIDEAS & ACAI"
              value={formData.canonical}
              onChange={(e) => setFormData(prev => ({ ...prev, canonical: e.target.value }))}
              className="bg-white/5 border-white/10"
            />
          </div>

          {/* Matching Types */}
          <div className="space-y-3 border-t border-white/10 pt-4">
            <p className="font-semibold text-sm">Tipos de Matching (al menos uno obligatorio)</p>

            {/* Terms */}
            <div className="space-y-2">
              <Label className="text-sm">Terms (Match Exacto)</Label>
              <p className="text-xs text-white/60">Palabras que deben coincidir exactamente</p>
              <div className="flex gap-2">
                {currentInputType === "terms" && (
                  <>
                    <Input
                      placeholder="ej: TROPICAL, MENTA"
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addToken()}
                      className="bg-white/5 border-white/10"
                    />
                    <Button onClick={addToken} variant="outline" size="sm">
                      +
                    </Button>
                  </>
                )}
              </div>
              {formData.terms.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.terms.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-2 cursor-pointer">
                      {t}
                      <button onClick={() => removeToken("terms", t)} className="text-xs">✕</button>
                    </Badge>
                  ))}
                </div>
              )}
              {currentInputType !== "terms" && (
                <Button onClick={() => setCurrentInputType("terms")} variant="ghost" size="sm" className="text-xs">
                  Agregar term
                </Button>
              )}
            </div>

            {/* Fallback Prefixes */}
            <div className="space-y-2">
              <Label className="text-sm">Fallback Prefixes (Cubre Variaciones)</Label>
              <p className="text-xs text-white/60">Ej. MARACUY cubre MARACUYA, MARACUYAS, MARACUY1</p>
              <div className="flex gap-2">
                {currentInputType === "fallback" && (
                  <>
                    <Input
                      placeholder="ej: MARACUY, MENT"
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addToken()}
                      className="bg-white/5 border-white/10"
                    />
                    <Button onClick={addToken} variant="outline" size="sm">
                      +
                    </Button>
                  </>
                )}
              </div>
              {formData.fallback_prefixes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.fallback_prefixes.map((p) => (
                    <Badge key={p} variant="secondary" className="gap-2 cursor-pointer">
                      {p}
                      <button onClick={() => removeToken("fallback", p)} className="text-xs">✕</button>
                    </Badge>
                  ))}
                </div>
              )}
              {currentInputType !== "fallback" && (
                <Button onClick={() => setCurrentInputType("fallback")} variant="ghost" size="sm" className="text-xs">
                  Agregar prefix
                </Button>
              )}
            </div>

            {/* Compound Terms */}
            <div className="space-y-2">
              <Label className="text-sm">Compound Terms (Frases de 2+ Palabras)</Label>
              <p className="text-xs text-white/60">Para &ldquo;ORQUIDEAS &amp; ACAI&rdquo;: usa [RQUID, ACA]</p>
              <div className="flex gap-2">
                {currentInputType === "compound" && (
                  <>
                    <Input
                      placeholder="ej: TE VERDE, RQUID"
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addToken()}
                      className="bg-white/5 border-white/10"
                    />
                    <Button onClick={addToken} variant="outline" size="sm">
                      +
                    </Button>
                  </>
                )}
              </div>
              {formData.compound_terms.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.compound_terms.map((c) => (
                    <Badge key={c} variant="secondary" className="gap-2 cursor-pointer">
                      {c}
                      <button onClick={() => removeToken("compound", c)} className="text-xs">✕</button>
                    </Badge>
                  ))}
                </div>
              )}
              {currentInputType !== "compound" && (
                <Button onClick={() => setCurrentInputType("compound")} variant="ghost" size="sm" className="text-xs">
                  Agregar compound
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 border-t border-white/10 pt-4">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="ej: agregada para campaña Q2"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="bg-white/5 border-white/10"
              rows={2}
            />
          </div>

        <Button size="sm" className="h-8 w-full gap-1.5" onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
          {upsertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar variante
        </Button>
      </TrainingFormCard>

      {data.defaults?.length > 0 ? (
        <TrainingPanelCard
          title={`Defaults del sistema (${data.defaults.length})`}
          action={
            <button type="button" onClick={() => setExpandedDefaults(!expandedDefaults)} className="text-slate-400">
              {expandedDefaults ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          }
        >
          {expandedDefaults ? (
            <div className="max-h-[min(40vh,360px)] space-y-2 overflow-y-auto">
              {data.defaults.map((v: PromotionVariant) => (
                <div key={v.canonical} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <p className="font-mono text-xs font-semibold text-violet-100">{v.canonical}</p>
                  {v.terms?.length ? <p className="mt-1 text-[10px] text-slate-500">Terms: {v.terms.join(", ")}</p> : null}
                  {v.fallback_prefixes?.length ? (
                    <p className="text-[10px] text-slate-500">Prefixes: {v.fallback_prefixes.join(", ")}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Click para expandir {data.defaults.length} variantes de sistema.</p>
          )}
        </TrainingPanelCard>
      ) : null}

      {data.custom?.length > 0 ? (
        <TrainingPanelCard title={`Variantes personalizadas (${data.custom.length})`}>
          <div className="max-h-[min(50vh,480px)] space-y-2 overflow-y-auto">
            {data.custom.map((v: PromotionVariant & { id: number }) => (
              <div key={v.id} className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-white">{v.canonical}</p>
                  {v.terms?.length ? <p className="mt-1 text-[10px] text-slate-500">Terms: {v.terms.join(", ")}</p> : null}
                  {v.fallback_prefixes?.length ? (
                    <p className="text-[10px] text-slate-500">Prefixes: {v.fallback_prefixes.join(", ")}</p>
                  ) : null}
                  {v.compound_terms?.length ? (
                    <p className="text-[10px] text-slate-500">Compound: {v.compound_terms.join(", ")}</p>
                  ) : null}
                  {v.notes ? <p className="mt-1 text-[10px] text-violet-300">{v.notes}</p> : null}
                </div>
                <Button
                  onClick={() => v.id && deleteMutation.mutate(v.id)}
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0 text-rose-400 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </TrainingPanelCard>
      ) : null}

      <TrainingFooterNote>
        Los cambios se aplican al proximo job creado. No afectan jobs en curso.
      </TrainingFooterNote>
    </div>
  );
}
