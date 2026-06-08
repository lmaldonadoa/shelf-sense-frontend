"use client";

import type { QwenVlConfig } from "@/types/ocr-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type QwenVlFormProps = {
  value: QwenVlConfig;
  onChange: (next: QwenVlConfig) => void;
};

const MODEL_OPTIONS = ["qwen3-vl:8b", "qwen3-vl:2b", "gemma3:12b"];

function hasSource(enabledSources: string[] | undefined, source: "primary" | "support"): boolean {
  return (enabledSources ?? []).includes(source);
}

function updateSource(enabledSources: string[] | undefined, source: "primary" | "support", checked: boolean): string[] {
  const set = new Set(enabledSources ?? []);
  if (checked) set.add(source);
  else set.delete(source);
  return Array.from(set);
}

export function QwenVlForm({ value, onChange }: QwenVlFormProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Vision LLM (Modelo visual)</CardTitle>
        <p className="text-xs text-amber-200">Solo seleccione modelos que soporten imagenes en Ollama. Modelos text-only no funcionaran como modelo visual.</p>
        <p className="text-xs text-slate-300">Este bloque controla el modelo visual de Ollama usado para estructurar promociones. El nombre tecnico `qwen_vl` se mantiene por compatibilidad.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>model</Label>
            <Input
              list="qwen-vl-model-options"
              value={value.model ?? ""}
              onChange={(event) => onChange({ ...value, model: event.target.value })}
              placeholder="qwen3-vl:8b"
            />
            <datalist id="qwen-vl-model-options">
              {MODEL_OPTIONS.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>prompt_file</Label>
            <Input
              value={value.prompt_file ?? "qwen3vl_prompt.txt"}
              onChange={(event) => onChange({ ...value, prompt_file: event.target.value })}
              placeholder="qwen3vl_prompt.txt"
            />
          </div>
          <div className="space-y-2">
            <Label>timeout_sec</Label>
            <Input
              type="number"
              value={value.timeout_sec ?? 90}
              onChange={(event) => onChange({ ...value, timeout_sec: Number(event.target.value || 0) })}
            />
            <p className="text-[11px] text-muted-foreground">Rango backend: 5-1800 (recomendado 90-120).</p>
          </div>
          <div className="space-y-2">
            <Label>max_retries</Label>
            <Input
              type="number"
              value={value.max_retries ?? 1}
              onChange={(event) => onChange({ ...value, max_retries: Number(event.target.value || 0) })}
            />
            <p className="text-[11px] text-muted-foreground">Rango backend: 1-5 (recomendado 1).</p>
          </div>
          <div className="space-y-2">
            <Label>retry_delay_sec</Label>
            <Input
              type="number"
              value={value.retry_delay_sec ?? 3}
              onChange={(event) => onChange({ ...value, retry_delay_sec: Number(event.target.value || 0) })}
            />
            <p className="text-[11px] text-muted-foreground">Rango backend: 0-120 (recomendado 3).</p>
          </div>
        </div>

        <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <p className="text-sm font-medium">enabled_sources</p>
          <p className="text-[11px] text-muted-foreground">Para rendimiento inicial recomendamos solo `primary`.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
              <span className="text-sm">primary</span>
              <Switch
                checked={hasSource(value.enabled_sources, "primary")}
                onCheckedChange={(checked) => onChange({ ...value, enabled_sources: updateSource(value.enabled_sources, "primary", checked) })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
              <span className="text-sm">support</span>
              <Switch
                checked={hasSource(value.enabled_sources, "support")}
                onCheckedChange={(checked) => onChange({ ...value, enabled_sources: updateSource(value.enabled_sources, "support", checked) })}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
