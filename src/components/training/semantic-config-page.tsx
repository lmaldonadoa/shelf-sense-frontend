"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ocrApi } from "@/lib/ocrApi";
import type { PipelineConfig } from "@/types/ocr-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Props = { account: string };

export function SemanticConfigPage({ account }: Props) {
  const [accountName] = useState(account);
  const [isDirty, setIsDirty] = useState(false);
  const [config, setConfig] = useState<Partial<Record<string, unknown>>>({});

  const configQuery = useQuery({
    queryKey: ["semantic-config", accountName],
    queryFn: () => ocrApi.getActiveConfig(accountName),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!configQuery.data?.config) throw new Error("No config loaded");
      const baseConfig = configQuery.data.config as Record<string, unknown>;
      const updated = {
        ...baseConfig,
        text_enrichment: {
          ...(baseConfig.text_enrichment as Record<string, unknown>),
          ...config,
        },
      } as PipelineConfig;
      await ocrApi.updatePipelineConfig(accountName, updated);
    },
    onSuccess: () => {
      setIsDirty(false);
      toast.success("Configuración semántica guardada");
      configQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error al guardar: ${error}`);
    },
  });

  const textEnrichment = (configQuery.data?.config as Record<string, unknown>)?.text_enrichment as Record<string, unknown> ?? {};

  const handleChange = (field: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsDirty(true);
  };

  const handleNestedChange = (parent: string, field: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      [parent]: {
        ...(prev[parent as keyof typeof prev] as Record<string, unknown>),
        [field]: value,
      },
    }));
    setIsDirty(true);
  };

  if (configQuery.isLoading) {
    return <div className="text-center text-white/60">Cargando configuración...</div>;
  }

  return (
    <div className="space-y-6">
      {/* RAG Configuration */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>RAG Semántico</span>
            <Badge variant="outline">enabled</Badge>
          </CardTitle>
          <CardDescription>Configuración de reglas RAG y rollout</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
              <Label htmlFor="rag-enabled" className="cursor-pointer">
                RAG Activo
              </Label>
              <Switch
                id="rag-enabled"
                checked={
                  (
                    (textEnrichment?.semantic_rag as Record<string, unknown>) ??
                    {}
                  ).enabled as boolean
                }
                onCheckedChange={(checked) =>
                  handleNestedChange("semantic_rag", "enabled", checked)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rag-limit">Límite de Reglas RAG</Label>
              <Input
                id="rag-limit"
                type="number"
                min="1"
                max="20"
                value={
                  (
                    (textEnrichment?.semantic_rag as Record<string, unknown>) ??
                    {}
                  ).limit as number
                }
                onChange={(e) =>
                  handleNestedChange("semantic_rag", "limit", Number(e.target.value))
                }
                className="bg-white/5 border-white/10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rollout-mode">Modo Rollout</Label>
              <select
                id="rollout-mode"
                value={
                  (
                    (textEnrichment?.semantic_rag as Record<string, unknown>) ??
                    {}
                  ).rollout_mode as string
                }
                onChange={(e) =>
                  handleNestedChange("semantic_rag", "rollout_mode", e.target.value)
                }
                className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-white"
              >
                <option value="apply">Aplicar (apply)</option>
                <option value="shadow">Auditar (shadow)</option>
                <option value="disabled">Deshabilitado</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Semantic Scope Guardrails */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Guardrails Semánticos</CardTitle>
          <CardDescription>Prevenir alucinaciones y desviaciones del contexto</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
            <Label htmlFor="scope-guardrails" className="cursor-pointer">
              Scope Guardrails Activos
            </Label>
            <Switch
              id="scope-guardrails"
              checked={
                (
                  (textEnrichment?.semantic_scope_guardrails as Record<
                    string,
                    unknown
                  >) ?? {}
                ).enabled as boolean
              }
              onCheckedChange={(checked) =>
                handleNestedChange("semantic_scope_guardrails", "enabled", checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Shadow Review */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Shadow Review Estructurado</CardTitle>
          <CardDescription>Auditar correcciones sin aplicarlas (+2-5s por imagen)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
            <Label htmlFor="shadow-enabled" className="cursor-pointer">
              Shadow Review Activo
            </Label>
            <Switch
              id="shadow-enabled"
              checked={
                (
                  (textEnrichment?.structured_shadow as Record<string, unknown>) ??
                  {}
                ).enabled as boolean
              }
              onCheckedChange={(checked) =>
                handleNestedChange("structured_shadow", "enabled", checked)
              }
            />
          </div>

          {(
            (textEnrichment?.structured_shadow as Record<string, unknown>) ??
            {}
          ).enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shadow-timeout">Timeout (segundos)</Label>
                <Input
                  id="shadow-timeout"
                  type="number"
                  min="10"
                  max="300"
                  value={
                    (
                      (textEnrichment?.structured_shadow as Record<
                        string,
                        unknown
                      >) ?? {}
                    ).timeout as number
                  }
                  onChange={(e) =>
                    handleNestedChange("structured_shadow", "timeout", Number(e.target.value))
                  }
                  className="bg-white/5 border-white/10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shadow-max-products">Máx Productos</Label>
                <Input
                  id="shadow-max-products"
                  type="number"
                  min="1"
                  max="50"
                  value={
                    (
                      (textEnrichment?.structured_shadow as Record<
                        string,
                        unknown
                      >) ?? {}
                    ).max_products as number
                  }
                  onChange={(e) =>
                    handleNestedChange("structured_shadow", "max_products", Number(e.target.value))
                  }
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Measure Noise Rules */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Corrección de Ruido de Medidas</CardTitle>
          <CardDescription>Limpiar fragmentos de dígitos antes de unidades</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
            <Label htmlFor="measure-noise-enabled" className="cursor-pointer">
              Ruido de Medidas Activo
            </Label>
            <Switch
              id="measure-noise-enabled"
              checked={
                (
                  (textEnrichment?.measure_noise_rules as Record<string, unknown>) ??
                  {}
                ).enabled as boolean
              }
              onCheckedChange={(checked) =>
                handleNestedChange("measure_noise_rules", "enabled", checked)
              }
            />
          </div>

          {(
            (textEnrichment?.measure_noise_rules as Record<string, unknown>) ??
            {}
          ).enabled && (
            <div className="space-y-2">
              <Label htmlFor="measure-chains">Cadenas (separadas por coma)</Label>
              <Input
                id="measure-chains"
                type="text"
                placeholder="mi comisariato, el rosado, hipermarket"
                value={
                  (
                    (textEnrichment?.measure_noise_rules as Record<
                      string,
                      unknown
                    >) ?? {}
                  ).chains?.join(", ") ?? ""
                }
                onChange={(e) =>
                  handleNestedChange(
                    "measure_noise_rules",
                    "chains",
                    e.target.value.split(",").map((s) => s.trim())
                  )
                }
                className="bg-white/5 border-white/10"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catalog Memory */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Memoria de Catálogo</CardTitle>
          <CardDescription>Usar catálogo de shelf como contexto adicional</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
            <Label htmlFor="catalog-enabled" className="cursor-pointer">
              Memoria Activa
            </Label>
            <Switch
              id="catalog-enabled"
              checked={
                (
                  (textEnrichment?.promotion_catalog_memory as Record<
                    string,
                    unknown
                  >) ?? {}
                ).enabled as boolean
              }
              onCheckedChange={(checked) =>
                handleNestedChange("promotion_catalog_memory", "enabled", checked)
              }
            />
          </div>

          {(
            (textEnrichment?.promotion_catalog_memory as Record<string, unknown>) ??
            {}
          ).enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="catalog-mode">Modo</Label>
                <select
                  id="catalog-mode"
                  value={
                    (
                      (textEnrichment?.promotion_catalog_memory as Record<
                        string,
                        unknown
                      >) ?? {}
                    ).mode as string
                  }
                  onChange={(e) =>
                    handleNestedChange("promotion_catalog_memory", "mode", e.target.value)
                  }
                  className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-white"
                >
                  <option value="assist">Asistencia (assist)</option>
                  <option value="validate">Validación (validate)</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
                <Label htmlFor="catalog-in-prompt" className="cursor-pointer">
                  Incluir en Prompt
                </Label>
                <Switch
                  id="catalog-in-prompt"
                  checked={
                    (
                      (textEnrichment?.promotion_catalog_memory as Record<
                        string,
                        unknown
                      >) ?? {}
                    ).include_in_enricher_prompt as boolean
                  }
                  onCheckedChange={(checked) =>
                    handleNestedChange(
                      "promotion_catalog_memory",
                      "include_in_enricher_prompt",
                      checked
                    )
                  }
                />
              </div>
            </div>
          )}

          {(
            (textEnrichment?.promotion_catalog_memory as Record<string, unknown>) ??
            {}
          ).enabled && (
            <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-100">Guardrails de enriquecimiento</p>
                <p className="text-xs text-slate-400">Flags reversibles que controlan cómo se rellenan marca y tamaño desde el catálogo. Todos default ON.</p>
              </div>

              <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
                <div className="space-y-1 pr-4">
                  <Label htmlFor="brand-prepend-token" className="cursor-pointer">
                    Marca: prepend token-aware
                  </Label>
                  <p className="text-[11px] text-slate-400">
                    Compara por tokens antes de anteponer marca al nombre. Evita duplicados como &quot;DOVE MEN+CARE DOVE CUIDADO&quot;.
                  </p>
                </div>
                <Switch
                  id="brand-prepend-token"
                  checked={
                    ((textEnrichment?.promotion_catalog_memory as Record<string, unknown>) ?? {}).brand_prepend_token_aware as boolean ?? true
                  }
                  onCheckedChange={(checked) =>
                    handleNestedChange("promotion_catalog_memory", "brand_prepend_token_aware", checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
                <div className="space-y-1 pr-4">
                  <Label htmlFor="skip-brand-support" className="cursor-pointer">
                    Marca: skip si soporte construyo nombre
                  </Label>
                  <p className="text-[11px] text-slate-400">
                    No antepone marca del catálogo si el nombre fue armado por soporte (name_assisted_from_support). Evita conflictos de marca.
                  </p>
                </div>
                <Switch
                  id="skip-brand-support"
                  checked={
                    ((textEnrichment?.promotion_catalog_memory as Record<string, unknown>) ?? {}).skip_brand_prepend_if_support_built as boolean ?? true
                  }
                  onCheckedChange={(checked) =>
                    handleNestedChange("promotion_catalog_memory", "skip_brand_prepend_if_support_built", checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
                <div className="space-y-1 pr-4">
                  <Label htmlFor="block-tamano-conflict" className="cursor-pointer">
                    Tamaño: bloquear si OCR primary contradice
                  </Label>
                  <p className="text-[11px] text-slate-400">
                    No rellena tamaño del catálogo si el OCR primary detectó una medida distinta (ej. OCR dice 330ML pero SKU dice 300ML).
                  </p>
                </div>
                <Switch
                  id="block-tamano-conflict"
                  checked={
                    ((textEnrichment?.promotion_catalog_memory as Record<string, unknown>) ?? {}).block_tamano_if_primary_conflicts as boolean ?? true
                  }
                  onCheckedChange={(checked) =>
                    handleNestedChange("promotion_catalog_memory", "block_tamano_if_primary_conflicts", checked)
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!isDirty || saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Guardar Configuración
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
