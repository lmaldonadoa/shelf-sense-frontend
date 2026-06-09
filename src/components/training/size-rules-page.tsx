"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { ocrApi } from "@/lib/ocrApi";
import type { PipelineConfig } from "@/types/ocr-api";
import type { TextEnrichmentConfig } from "@/types/ocr-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type SizeRule = {
  keywords: string[];
  unit: string;
  min: number;
  max: number;
  note?: string;
  source?: "default" | "custom";
};

type Props = { account: string };

const DEFAULT_RULES: SizeRule[] = [
  {
    keywords: ["CREMA DENTAL", "PASTA DENTAL", "GEL DENTAL"],
    unit: "G",
    min: 20,
    max: 250,
    note: "Cremas dentales: 20-250g. 766 → 76G",
    source: "default",
  },
  {
    keywords: ["ENJUAGUE BUCAL", "MOUTHWASH", "COLUTORIO"],
    unit: "ML",
    min: 50,
    max: 1000,
    note: "Enjuagues: 50-1000ml",
    source: "default",
  },
  {
    keywords: ["CEPILLO DENTAL", "CEPILLOS DENTALES"],
    unit: "G",
    min: 10,
    max: 100,
    source: "default",
  },
  {
    keywords: ["SHAMPOO", "ACONDICIONADOR"],
    unit: "ML",
    min: 100,
    max: 1000,
    source: "default",
  },
  {
    keywords: ["DESODORANTE"],
    unit: "ML",
    min: 40,
    max: 250,
    source: "default",
  },
  {
    keywords: ["JABON LIQUIDO", "JABON DE MANOS"],
    unit: "ML",
    min: 100,
    max: 1000,
    source: "default",
  },
  {
    keywords: ["JABON EN BARRA", "JABON BARRA"],
    unit: "G",
    min: 75,
    max: 400,
    source: "default",
  },
  {
    keywords: ["LAVAVAJILLAS", "LAVAPLATOS"],
    unit: "ML",
    min: 250,
    max: 2000,
    source: "default",
  },
];

function emptyCustomRule(): SizeRule {
  return {
    keywords: [],
    unit: "ML",
    min: 0,
    max: 1000,
    note: "",
    source: "custom",
  };
}

export function SizeRulesPage({ account }: Props) {
  const [accountName] = useState(account);
  const [customRules, setCustomRules] = useState<SizeRule[]>([]);
  const [expandedDefaults, setExpandedDefaults] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const configQuery = useQuery({
    queryKey: ["size-rules-config", accountName],
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
          size_plausibility_guardrail: {
            enabled: true,
            subcategory_rules_extra: customRules.filter((r) => r.source === "custom"),
          },
        },
      } as PipelineConfig;
      await ocrApi.updatePipelineConfig(accountName, updated);
    },
    onSuccess: () => {
      setIsDirty(false);
      toast.success("Reglas de tamaño guardadas");
      configQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error al guardar: ${error}`);
    },
  });

  const existingRules =
    (configQuery.data?.config?.text_enrichment?.size_plausibility_guardrail as Record<
      string,
      unknown
    >)?.subcategory_rules_extra ?? [];

  const handleAddRule = () => {
    const newRule = emptyCustomRule();
    setCustomRules([...customRules, newRule]);
    setEditingIndex(customRules.length);
    setIsDirty(true);
  };

  const handleRemoveRule = (index: number) => {
    setCustomRules(customRules.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleRuleChange = (index: number, field: keyof SizeRule, value: unknown) => {
    const updated = [...customRules];
    if (field === "keywords" && typeof value === "string") {
      updated[index].keywords = value
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (field === "unit" && typeof value === "string") {
      updated[index].unit = value;
    } else if (field === "note" && typeof value === "string") {
      updated[index].note = value;
    } else if ((field === "min" || field === "max") && typeof value === "number") {
      (updated[index] as Record<string, unknown>)[field] = value;
    }
    setCustomRules(updated);
    setIsDirty(true);
  };

  if (configQuery.isLoading) {
    return <div className="text-center text-white/60">Cargando configuración...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Add New Rule Button */}
      <div className="flex justify-end">
        <Button onClick={handleAddRule} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Agregar Regla Personalizada
        </Button>
      </div>

      {/* Custom Rules */}
      {customRules.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Reglas Personalizadas</span>
              <Badge variant="secondary">{customRules.length} reglas</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customRules.map((rule, index) => (
              <div
                key={index}
                className="rounded border border-white/10 bg-white/3 p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Regla {index + 1}</Label>
                  <Button
                    onClick={() => handleRemoveRule(index)}
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                  >
                    <Trash2 className="h-3 w-3" />
                    Eliminar
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor={`keywords-${index}`}>Palabras clave (separadas por coma)</Label>
                    <Input
                      id={`keywords-${index}`}
                      type="text"
                      placeholder="COLONIA, PERFUME, FRAGANCIA"
                      value={rule.keywords.join(", ")}
                      onChange={(e) => handleRuleChange(index, "keywords", e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`unit-${index}`}>Unidad</Label>
                    <select
                      id={`unit-${index}`}
                      value={rule.unit}
                      onChange={(e) => handleRuleChange(index, "unit", e.target.value)}
                      className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-white"
                    >
                      <option value="G">Gramos (G)</option>
                      <option value="ML">Mililitros (ML)</option>
                      <option value="L">Litros (L)</option>
                      <option value="KG">Kilogramos (KG)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor={`min-${index}`}>Mínimo</Label>
                      <Input
                        id={`min-${index}`}
                        type="number"
                        min="0"
                        value={rule.min}
                        onChange={(e) => handleRuleChange(index, "min", Number(e.target.value))}
                        className="bg-white/5 border-white/10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`max-${index}`}>Máximo</Label>
                      <Input
                        id={`max-${index}`}
                        type="number"
                        min="0"
                        value={rule.max}
                        onChange={(e) => handleRuleChange(index, "max", Number(e.target.value))}
                        className="bg-white/5 border-white/10"
                      />
                    </div>
                  </div>

                  <div className="col-span-2 space-y-2">
                    <Label htmlFor={`note-${index}`}>Nota (opcional)</Label>
                    <Input
                      id={`note-${index}`}
                      type="text"
                      placeholder="Colonias: 50-300ml"
                      value={rule.note}
                      onChange={(e) => handleRuleChange(index, "note", e.target.value)}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Default Rules (Read-only) */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader
          className="cursor-pointer"
          onClick={() => setExpandedDefaults(!expandedDefaults)}
        >
          <CardTitle className="flex items-center justify-between">
            <span>Reglas por Defecto (solo lectura)</span>
            {expandedDefaults ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </CardTitle>
          <CardDescription>
            Estas reglas son automáticas y siempre están activas
          </CardDescription>
        </CardHeader>

        {expandedDefaults && (
          <CardContent>
            <div className="space-y-3">
              {DEFAULT_RULES.map((rule, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-3"
                >
                  <div className="flex-1">
                    <p className="font-mono text-sm font-semibold">
                      {rule.keywords.join(" / ")}
                    </p>
                    <p className="text-xs text-white/60">
                      {rule.unit} {rule.min}–{rule.max}
                      {rule.note && ` • ${rule.note}`}
                    </p>
                  </div>
                  <Badge variant="outline">default</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Save Button */}
      {isDirty && (
        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
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
                Guardar Reglas
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
