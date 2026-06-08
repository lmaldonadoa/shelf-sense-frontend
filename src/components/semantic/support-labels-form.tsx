"use client";

import type { SupportLabelsConfig } from "@/types/ocr-api";
import { TagsInput } from "@/components/semantic/tags-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type SupportLabelsFormProps = {
  value: SupportLabelsConfig;
  onChange: (next: SupportLabelsConfig) => void;
};

export function SupportLabelsForm({ value, onChange }: SupportLabelsFormProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Soporte de Etiquetas</CardTitle>
        <p className="text-sm text-muted-foreground">Promociones es la fuente principal. Etiquetas/Productos se usan como soporte y trazabilidad.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
          <div>
            <p className="text-sm font-medium">support_labels.enabled</p>
            <p className="text-xs text-muted-foreground">Activa soporte secundario de etiquetas/productos.</p>
          </div>
          <Switch checked={value.enabled} onCheckedChange={(checked) => onChange({ ...value, enabled: checked })} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>label</Label>
            <Input value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>max_support_crops</Label>
            <Input type="number" value={value.max_support_crops} onChange={(e) => onChange({ ...value, max_support_crops: Number(e.target.value || 0) })} />
          </div>
          <div className="space-y-2">
            <Label>min_primary_products</Label>
            <Input type="number" value={value.min_primary_products} onChange={(e) => onChange({ ...value, min_primary_products: Number(e.target.value || 0) })} />
          </div>
          <div className="space-y-2">
            <Label>min_low_confidence_ratio</Label>
            <Input type="number" min={0} max={1} step="0.05" value={value.min_low_confidence_ratio} onChange={(e) => onChange({ ...value, min_low_confidence_ratio: Number(e.target.value || 0) })} />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-3 space-y-4">
          <p className="text-sm font-medium">Memoria de soporte (debug/contraste)</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-white/10 p-3"><span className="text-sm">memory_enabled</span><Switch checked={Boolean(value.memory_enabled)} onCheckedChange={(checked) => onChange({ ...value, memory_enabled: checked })} /></div>
            <div className="flex items-center justify-between rounded-md border border-white/10 p-3"><span className="text-sm">memory_ocr_enabled</span><Switch checked={Boolean(value.memory_ocr_enabled)} onCheckedChange={(checked) => onChange({ ...value, memory_ocr_enabled: checked })} /></div>
            <div className="space-y-2">
              <Label>max_memory_crops</Label>
              <Input type="number" value={value.max_memory_crops ?? 3} onChange={(e) => onChange({ ...value, max_memory_crops: Number(e.target.value || 0) })} />
            </div>
            <div className="space-y-2">
              <Label>debug_text_limit</Label>
              <Input type="number" value={value.debug_text_limit ?? 280} onChange={(e) => onChange({ ...value, debug_text_limit: Number(e.target.value || 0) })} />
            </div>
          </div>

          <TagsInput
            label="memory_labels"
            values={value.memory_labels ?? []}
            placeholder="etiquetas, productos"
            onChange={(values) => onChange({ ...value, memory_labels: values })}
          />

          <div className="space-y-2">
            <Label>memory_ocr_prompt</Label>
            <Input value={value.memory_ocr_prompt ?? ""} onChange={(e) => onChange({ ...value, memory_ocr_prompt: e.target.value })} placeholder="Extrae todo el texto de la imagen." />
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-3 space-y-4">
          <p className="text-sm font-medium">Asistencia semantica por soporte</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
              <div>
                <p className="text-sm">Correccion semantica con soporte (RAG + etiquetas/productos)</p>
                <p className="text-xs text-muted-foreground">Corrige abreviaciones o texto recortado usando evidencia OCR de soporte.</p>
              </div>
              <Switch
                checked={Boolean(value.assist_semantic_repair_enabled)}
                onCheckedChange={(checked) => onChange({ ...value, assist_semantic_repair_enabled: checked })}
              />
            </div>
            <div
              className={`flex items-center justify-between rounded-md border border-white/10 p-3 ${
                value.assist_semantic_repair_enabled ? "" : "opacity-60"
              }`}
            >
              <div>
                <p className="text-sm">Modo conservador (solo correccion token-a-token)</p>
                <p className="text-xs text-muted-foreground">Evita reemplazos agresivos de nombre completo. Reduce invenciones.</p>
              </div>
              <Switch
                checked={Boolean(value.assist_semantic_repair_only)}
                disabled={!value.assist_semantic_repair_enabled}
                onCheckedChange={(checked) => onChange({ ...value, assist_semantic_repair_only: checked })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-3 space-y-4">
          <p className="text-sm font-medium">Asistencia de nombre para productos</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-white/10 p-3"><span className="text-sm">assist_primary_name_enabled</span><Switch checked={Boolean(value.assist_primary_name_enabled)} onCheckedChange={(checked) => onChange({ ...value, assist_primary_name_enabled: checked })} /></div>
            <div className="flex items-center justify-between rounded-md border border-white/10 p-3"><span className="text-sm">assist_only_when_low_confidence</span><Switch checked={Boolean(value.assist_only_when_low_confidence)} onCheckedChange={(checked) => onChange({ ...value, assist_only_when_low_confidence: checked })} /></div>
            <div className="space-y-2 md:col-span-2">
              <Label>assist_min_similarity</Label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={value.assist_min_similarity ?? 0.5}
                  onChange={(e) => onChange({ ...value, assist_min_similarity: Number(e.target.value) })}
                  className="w-full"
                />
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  value={value.assist_min_similarity ?? 0.5}
                  onChange={(e) => onChange({ ...value, assist_min_similarity: Number(e.target.value || 0) })}
                  className="w-24"
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
