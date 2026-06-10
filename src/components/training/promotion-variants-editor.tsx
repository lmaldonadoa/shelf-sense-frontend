"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Save, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

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
    <div className="space-y-6">
      {/* Form */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Agregar/Editar Variante</CardTitle>
          <CardDescription>Fragancias, sabores o variantes de producto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <p className="text-xs text-white/60">Para "ORQUIDEAS & ACAI": usa [RQUID, ACA]</p>
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

          <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending} className="gap-2 w-full">
            {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Variante
          </Button>
        </CardContent>
      </Card>

      {/* Defaults */}
      {data.defaults?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpandedDefaults(!expandedDefaults)}
          >
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Variantes por Defecto ({data.defaults.length})</span>
              {expandedDefaults ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
          {expandedDefaults && (
            <CardContent className="space-y-2">
              {data.defaults.map((v: any) => (
                <div key={v.canonical} className="rounded border border-white/10 bg-white/3 p-2 text-sm">
                  <p className="font-mono font-semibold">{v.canonical}</p>
                  {v.terms?.length > 0 && <p className="text-xs text-white/60">Terms: {v.terms.join(", ")}</p>}
                  {v.fallback_prefixes?.length > 0 && <p className="text-xs text-white/60">Prefixes: {v.fallback_prefixes.join(", ")}</p>}
                  {v.compound_terms?.length > 0 && <p className="text-xs text-white/60">Compound: {v.compound_terms.join(", ")}</p>}
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Custom */}
      {data.custom?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm">Variantes Personalizadas ({data.custom.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.custom.map((v: any) => (
              <div key={v.id} className="flex items-start justify-between rounded border border-white/10 bg-white/3 p-3">
                <div className="flex-1">
                  <p className="font-mono font-semibold">{v.canonical}</p>
                  {v.terms?.length > 0 && <p className="text-xs text-white/60">Terms: {v.terms.join(", ")}</p>}
                  {v.fallback_prefixes?.length > 0 && <p className="text-xs text-white/60">Prefixes: {v.fallback_prefixes.join(", ")}</p>}
                  {v.compound_terms?.length > 0 && <p className="text-xs text-white/60">Compound: {v.compound_terms.join(", ")}</p>}
                  {v.chain_whitelist?.length > 0 && <p className="text-xs text-white/60">Cadenas: {v.chain_whitelist.join(", ")}</p>}
                  {v.notes && <p className="text-xs text-blue-300 mt-1">📝 {v.notes}</p>}
                </div>
                <Button
                  onClick={() => v.id && deleteMutation.mutate(v.id)}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="rounded border border-blue-500/30 bg-blue-950/20 p-3 text-sm text-blue-200">
        <p className="font-semibold">ℹ️ Nota:</p>
        <p>Los cambios se aplican al próximo job creado. No afectan jobs en curso.</p>
      </div>
    </div>
  );
}
