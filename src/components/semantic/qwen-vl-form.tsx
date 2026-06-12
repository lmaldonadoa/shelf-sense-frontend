"use client";

import { AlertCircle, Info } from "lucide-react";
import type { QwenVlConfig } from "@/types/ocr-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type QwenVlFormProps = {
  value: QwenVlConfig;
  onChange: (next: QwenVlConfig) => void;
};

const MODEL_OPTIONS = ["qwen3-vl:8b", "qwen3-vl:2b", "gemma4:12b-it-qat", "gemma3:12b"];

function hasSource(enabledSources: string[] | undefined, source: "primary" | "support"): boolean {
  return (enabledSources ?? []).includes(source);
}

function updateSource(enabledSources: string[] | undefined, source: "primary" | "support", checked: boolean): string[] {
  const set = new Set(enabledSources ?? []);
  if (checked) set.add(source);
  else set.delete(source);
  if (set.size === 0) set.add("primary");
  return Array.from(set);
}

function Tip({ text }: { text: string }) {
  return (
    <span className="cursor-help text-slate-500" title={text}>
      <Info className="h-3 w-3" />
    </span>
  );
}

export function QwenVlForm({ value, onChange }: QwenVlFormProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Vision LLM (qwen_vl)</CardTitle>
        <CardDescription className="space-y-1 text-xs">
          <span className="text-amber-200">Solo seleccione modelos que soporten imagenes en Ollama. Modelos text-only no funcionaran como modelo visual.</span>
          <br />
          <span className="text-slate-400">
            Vision LLM de promociones: imagen + texto OCR → JSON estructurado. En runtime legacy, <code className="text-violet-200">num_ctx</code> y{" "}
            <code className="text-violet-200">num_predict</code> de este bloque son los que usa el pipeline (no los de glm_ocr).
          </span>
        </CardDescription>
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
              className="font-mono"
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
              className="font-mono"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>num_ctx</Label>
              <Tip text="Ventana de contexto en tokens. Incluye prompt + texto OCR + imagen tokenizada. Impacta VRAM — 4096 es conservador." />
            </div>
            <Input
              type="number"
              min={512} max={32768} step={512}
              value={value.num_ctx ?? 4096}
              onChange={(event) => onChange({ ...value, num_ctx: Number(event.target.value || 4096) })}
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">512–32768 (recomendado 4096)</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>num_predict</Label>
              <Tip text="Limite maximo de tokens a generar. Campo mas importante para latencia — sin limite, promedio 66.8s. Con limite, corta mas rapido." />
            </div>
            <Input
              type="number"
              min={64} max={8192} step={64}
              value={value.num_predict ?? 512}
              onChange={(event) => onChange({ ...value, num_predict: Number(event.target.value || 512) })}
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">64–8192 (recomendado 512)</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>keep_alive</Label>
              <Tip text="Tiempo que el modelo se mantiene cargado en GPU. Critico para modelos grandes — cold-load toma ~10-15s. Formato: &quot;5m&quot;, &quot;10m&quot;, &quot;1h&quot;." />
            </div>
            <Input
              value={value.keep_alive ?? "10m"}
              onChange={(event) => onChange({ ...value, keep_alive: event.target.value })}
              placeholder="10m"
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">Formato Ollama: &quot;5m&quot;, &quot;10m&quot;, &quot;1h&quot;, &quot;0&quot;</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>timeout_sec</Label>
              <Tip text="Segundos maximos de espera por respuesta de Ollama." />
            </div>
            <Input
              type="number"
              min={5} max={1800} step={5}
              value={value.timeout_sec ?? 120}
              onChange={(event) => onChange({ ...value, timeout_sec: Number(event.target.value || 0) })}
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">5–1800 seg (recomendado 90-120)</p>
          </div>
          <div className="space-y-2">
            <Label>max_retries</Label>
            <Input
              type="number"
              min={1} max={5} step={1}
              value={value.max_retries ?? 1}
              onChange={(event) => onChange({ ...value, max_retries: Number(event.target.value || 0) })}
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">1–5 (recomendado 1)</p>
          </div>
          <div className="space-y-2">
            <Label>retry_delay_sec</Label>
            <Input
              type="number"
              min={0} max={120} step={1}
              value={value.retry_delay_sec ?? 3}
              onChange={(event) => onChange({ ...value, retry_delay_sec: Number(event.target.value || 0) })}
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">0–120 seg (recomendado 3)</p>
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
