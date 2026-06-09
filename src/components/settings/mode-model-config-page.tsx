"use client";

import { useState, useEffect } from "react";
import { Save, Info } from "lucide-react";
import { toast } from "sonner";
import { getModeModelConfig, setModeModelConfig, OperationMode, ensureModeConfigIsolation } from "@/lib/modelModeConfig";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Props = { account: string };

const MODES: Array<{ id: OperationMode; label: string; description: string }> = [
  { id: "promociones", label: "Promociones", description: "Modo de detección de promociones" },
  {
    id: "shelf_promotions",
    label: "Shelf Promotions",
    description: "Modo de promociones en estantería (recorte + extracción)",
  },
  { id: "shelf_sku", label: "Shelf SKU", description: "Modo de catálogo Shelf (SKU training)" },
];

export function ModeModelConfigPage({ account }: Props) {
  const [activeMode, setActiveMode] = useState<OperationMode>("promociones");
  const [configs, setConfigs] = useState<Record<OperationMode, any>>({
    promociones: {},
    shelf_promotions: {},
    shelf_sku: {},
  });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    ensureModeConfigIsolation(account);
    const newConfigs = {
      promociones: getModeModelConfig(account, "promociones"),
      shelf_promotions: getModeModelConfig(account, "shelf_promotions"),
      shelf_sku: getModeModelConfig(account, "shelf_sku"),
    };
    setConfigs(newConfigs);
  }, [account]);

  const currentConfig = configs[activeMode] || {};

  const handleChange = (field: string, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [activeMode]: {
        ...prev[activeMode],
        [field]: value || undefined,
      },
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
    setModeModelConfig(account, activeMode, configs[activeMode]);
    setIsDirty(false);
    toast.success(`Configuración de ${MODES.find((m) => m.id === activeMode)?.label} guardada`);
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-500/20 bg-blue-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Configuración Independiente de Modelos por Modo
          </CardTitle>
          <CardDescription>
            Cada modo opera con su propia configuración de modelos. Los cambios en un modo NO afectan a los otros.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Mode Selector */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm">Seleccionar Modo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => {
                  if (isDirty) {
                    if (
                      confirm(
                        `Tienes cambios sin guardar en ${MODES.find((m) => m.id === activeMode)?.label}. ¿Continuar sin guardar?`,
                      )
                    ) {
                      setIsDirty(false);
                      setActiveMode(mode.id);
                    }
                  } else {
                    setActiveMode(mode.id);
                  }
                }}
                className={`rounded border-2 p-3 text-left transition-all ${
                  activeMode === mode.id
                    ? "border-blue-400 bg-blue-950/30 text-white"
                    : "border-white/10 bg-white/3 text-white/70 hover:bg-white/5"
                }`}
              >
                <p className="font-semibold">{mode.label}</p>
                <p className="text-xs text-white/60">{mode.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Model Configuration for Active Mode */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Configuración de {MODES.find((m) => m.id === activeMode)?.label}</span>
            {isDirty && <Badge variant="destructive">Sin guardar</Badge>}
          </CardTitle>
          <CardDescription>
            Configura los modelos específicos para este modo. No se sincroniza con otros modos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ocr-model">Modelo OCR</Label>
            <Input
              id="ocr-model"
              type="text"
              placeholder="ej: glm-ocr, gpt-4-vision"
              value={currentConfig.ocr_model ?? ""}
              onChange={(e) => handleChange("ocr_model", e.target.value)}
              className="bg-white/5 border-white/10"
            />
            <p className="text-xs text-white/50">Modelo usado para OCR en este modo</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vision-model">Modelo Vision/VQA</Label>
            <Input
              id="vision-model"
              type="text"
              placeholder="ej: gemma4:12b-it-qat, qwen-vl"
              value={currentConfig.vision_model ?? ""}
              onChange={(e) => handleChange("vision_model", e.target.value)}
              className="bg-white/5 border-white/10"
            />
            <p className="text-xs text-white/50">Modelo multimodal para extracción de datos visuales</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="semantic-model">Modelo Semántico</Label>
            <Input
              id="semantic-model"
              type="text"
              placeholder="ej: qwen3:8b, qwen3:1.7b"
              value={currentConfig.semantic_model ?? ""}
              onChange={(e) => handleChange("semantic_model", e.target.value)}
              className="bg-white/5 border-white/10"
            />
            <p className="text-xs text-white/50">Modelo para corrección y enriquecimiento semántico</p>
          </div>

          {/* Mode-specific notes */}
          {activeMode === "shelf_promotions" && (
            <div className="rounded border border-blue-500/30 bg-blue-950/20 p-3 text-sm text-blue-200">
              <p className="font-semibold">💡 Nota para Shelf Promotions:</p>
              <p>
                Se recomienda: OCR (glm-ocr) → recorte con "best" → Vision (gemma4) → Semántico (qwen3:8b con
                best_seg para fondo)
              </p>
            </div>
          )}

          {activeMode === "shelf_sku" && (
            <div className="rounded border border-green-500/30 bg-green-950/20 p-3 text-sm text-green-200">
              <p className="font-semibold">💡 Nota para Shelf SKU:</p>
              <p>Configuración independiente para entrenamiento de SKU. Los cambios aquí NO afectan "Promociones"</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      {isDirty && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setConfigs((prev) => ({
                ...prev,
                [activeMode]: getModeModelConfig(account, activeMode),
              }));
              setIsDirty(false);
            }}
          >
            Descartar cambios
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            Guardar Configuración
          </Button>
        </div>
      )}

      {/* Mode Isolation Status */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm">Estado de Aislamiento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {MODES.map((mode) => {
              const config = configs[mode.id] || {};
              const hasConfig = Object.values(config).some((v) => v);
              return (
                <div key={mode.id} className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-2">
                  <span>{mode.label}</span>
                  <Badge variant={hasConfig ? "default" : "outline"}>
                    {hasConfig ? "Configurado" : "Sin configurar"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
