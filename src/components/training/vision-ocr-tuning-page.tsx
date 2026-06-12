"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, Info, Loader2, Save, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { ocrApi } from "@/lib/ocrApi";
import type { GlmOcrConfig, QwenVlConfig } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = { account: string };

type Tooltip = { label: string; field: string; tip: string };

const TOOLTIPS: Tooltip[] = [
  { label: "Contexto", field: "num_ctx", tip: "Ventana de contexto en tokens. Mas grande = mas memoria GPU pero soporta textos mas largos." },
  { label: "Max tokens", field: "num_predict", tip: "Limite maximo de tokens que el modelo puede generar. Menor = mas rapido pero puede truncar respuestas largas." },
  { label: "Keep alive", field: "keep_alive", tip: "Tiempo que el modelo se mantiene cargado en GPU tras la ultima peticion. Formato: \"5m\", \"10m\", \"1h\"." },
  { label: "Temperatura", field: "temperature", tip: "0 = deterministico (recomendado para OCR). Valores mayores agregan variabilidad." },
  { label: "Timeout", field: "timeout_sec", tip: "Segundos maximos de espera por respuesta de Ollama." },
];

function tip(field: string): string | undefined {
  return TOOLTIPS.find((t) => t.field === field)?.tip;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  tooltip,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  tooltip?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        {tooltip && (
          <span className="cursor-help text-slate-500" title={tooltip}>
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          className="h-9 text-sm font-mono"
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
        />
        {suffix && <span className="text-[10px] text-slate-500 shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  readOnly,
  tooltip,
  mono,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  readOnly?: boolean;
  tooltip?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        {tooltip && (
          <span className="cursor-help text-slate-500" title={tooltip}>
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      <Input
        id={id}
        className={`h-9 text-sm ${mono ? "font-mono" : ""} ${readOnly ? "bg-white/[0.02] text-slate-400" : ""}`}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
    </div>
  );
}

const GLM_DEFAULTS: GlmOcrConfig = {
  model: "glm-ocr",
  num_ctx: 2048,
  num_predict: 600,
  temperature: 0,
  keep_alive: "10m",
  prompt_file: "glm_ocr_prompt.txt",
};

const QWEN_DEFAULTS: QwenVlConfig = {
  model: "qwen3-vl:2b",
  num_ctx: 4096,
  num_predict: 512,
  keep_alive: "10m",
  timeout_sec: 120,
  max_retries: 1,
  retry_delay_sec: 3,
  prompt_file: "qwen3vl_prompt.txt",
  enabled_sources: ["primary"],
};

export function VisionOcrTuningPage({ account }: Props) {
  const queryClient = useQueryClient();
  const [isDirty, setIsDirty] = useState(false);

  const [glm, setGlm] = useState<GlmOcrConfig>({ ...GLM_DEFAULTS });
  const [qwen, setQwen] = useState<QwenVlConfig>({ ...QWEN_DEFAULTS });

  const configQuery = useQuery({
    queryKey: ["pipeline-config-tuning", account],
    queryFn: () => ocrApi.getActiveConfig(account),
  });

  useEffect(() => {
    if (!configQuery.data?.config) return;
    const cfg = configQuery.data.config as Record<string, unknown>;

    const savedGlm = (cfg.glm_ocr && typeof cfg.glm_ocr === "object" ? cfg.glm_ocr : {}) as GlmOcrConfig;
    setGlm({ ...GLM_DEFAULTS, ...savedGlm });

    const savedQwen = (cfg.qwen_vl && typeof cfg.qwen_vl === "object" ? cfg.qwen_vl : {}) as QwenVlConfig;
    setQwen({ ...QWEN_DEFAULTS, ...savedQwen });

    setIsDirty(false);
  }, [configQuery.data]);

  function updateGlm<K extends keyof GlmOcrConfig>(field: K, value: GlmOcrConfig[K]) {
    setGlm((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }

  function updateQwen<K extends keyof QwenVlConfig>(field: K, value: QwenVlConfig[K]) {
    setQwen((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!configQuery.data?.config) throw new Error("No hay config cargada");
      const baseConfig = configQuery.data.config as Record<string, unknown>;
      const updated = { ...baseConfig, glm_ocr: glm, qwen_vl: qwen };
      await ocrApi.updatePipelineConfig(account, updated);
    },
    onSuccess: () => {
      setIsDirty(false);
      toast.success("Configuracion de tuning guardada y activada");
      queryClient.invalidateQueries({ queryKey: ["pipeline-config-tuning", account] });
      configQuery.refetch();
    },
    onError: (error) => {
      toast.error("Error al guardar", { description: error instanceof Error ? error.message : "Error inesperado" });
    },
  });

  if (configQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuracion...
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <Card className="border-rose-500/20 bg-rose-950/10">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4" /> No se pudo cargar la configuracion.
          <Button variant="link" className="h-auto p-0 text-rose-300 underline" onClick={() => configQuery.refetch()}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  const tempWarning = typeof glm.temperature === "number" && glm.temperature > 0;
  const primaryChecked = (qwen.enabled_sources ?? []).includes("primary");
  const supportChecked = (qwen.enabled_sources ?? []).includes("support");

  function toggleSource(source: "primary" | "support", checked: boolean) {
    const current = new Set(qwen.enabled_sources ?? ["primary"]);
    if (checked) current.add(source);
    else current.delete(source);
    if (current.size === 0) current.add("primary");
    updateQwen("enabled_sources", Array.from(current));
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-amber-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-amber-950/35 shadow-lg shadow-amber-950/15">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-amber-300" />
              <h2 className="font-heading text-base font-semibold text-white">Resumen Vision y OCR</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Parametros activos en config. Aplican al proximo job de promociones.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDirty ? (
              <Badge className="border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-200">Sin guardar</Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-400/30 text-[10px] text-emerald-200">
                Sincronizado
              </Badge>
            )}
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !isDirty}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar y activar
            </Button>
          </div>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5 sm:pb-4">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-cyan-200/80">OCR ctx</p>
            <p className="mt-1 font-heading text-xl font-semibold tabular-nums text-cyan-50">{glm.num_ctx ?? 2048}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-cyan-200/70">{glm.model ?? "glm-ocr"}</p>
          </div>
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-cyan-200/80">OCR predict</p>
            <p className="mt-1 font-heading text-xl font-semibold tabular-nums text-cyan-50">{glm.num_predict ?? 600}</p>
            <p className="mt-0.5 text-[10px] text-cyan-200/70">temp {glm.temperature ?? 0}</p>
          </div>
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-violet-200/80">Vision ctx</p>
            <p className="mt-1 font-heading text-xl font-semibold tabular-nums text-violet-50">{qwen.num_ctx ?? 4096}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-violet-200/70">{qwen.model ?? "qwen3-vl"}</p>
          </div>
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-violet-200/80">Vision predict</p>
            <p className="mt-1 font-heading text-xl font-semibold tabular-nums text-violet-50">{qwen.num_predict ?? 512}</p>
            <p className="mt-0.5 text-[10px] text-violet-200/70">{qwen.timeout_sec ?? 120}s timeout</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-cyan-300/15 bg-gradient-to-br from-cyan-950/20 via-white/5 to-slate-950/40">
          <CardHeader className="gap-1 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ScanLine className="h-4 w-4 text-cyan-300" />
                OCR (glm_ocr)
              </CardTitle>
              <Badge variant="outline" className="border-cyan-400/25 text-[10px] text-cyan-100">Extraccion de texto</Badge>
            </div>
            <CardDescription className="text-[11px]">
              Modelo de extraccion de texto puro de imagenes de etiquetas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5">
            <TextField
              id="glm-model"
              label="Modelo"
              value={glm.model}
              onChange={(v) => updateGlm("model", v)}
              mono
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                id="glm-num-ctx"
                label="Contexto (num_ctx)"
                value={glm.num_ctx}
                onChange={(v) => updateGlm("num_ctx", v)}
                min={512} max={32768} step={256}
                tooltip={tip("num_ctx")}
              />
              <NumberField
                id="glm-num-predict"
                label="Max tokens (num_predict)"
                value={glm.num_predict}
                onChange={(v) => updateGlm("num_predict", v)}
                min={64} max={8192} step={64}
                tooltip={tip("num_predict")}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <NumberField
                  id="glm-temperature"
                  label="Temperatura"
                  value={glm.temperature}
                  onChange={(v) => updateGlm("temperature", v)}
                  min={0} max={2} step={0.1}
                  tooltip={tip("temperature")}
                />
                {tempWarning && (
                  <p className="flex items-center gap-1 text-[10px] text-amber-400">
                    <AlertCircle className="h-2.5 w-2.5" /> Valor {">"}0 no recomendado para OCR
                  </p>
                )}
              </div>
              <TextField
                id="glm-keep-alive"
                label="Keep alive"
                value={glm.keep_alive}
                onChange={(v) => updateGlm("keep_alive", v)}
                mono
                tooltip={tip("keep_alive")}
              />
            </div>
            <TextField
              id="glm-prompt"
              label="Prompt file"
              value={glm.prompt_file}
              onChange={(v) => updateGlm("prompt_file", v)}
              mono
            />
            {glm.chain_prompt_files && Object.keys(glm.chain_prompt_files).length > 0 && (
              <details className="rounded border border-white/5 bg-black/20 px-3 py-2">
                <summary className="cursor-pointer text-[10px] text-slate-400">Prompts por cadena ({Object.keys(glm.chain_prompt_files).length})</summary>
                <pre className="mt-1 text-[10px] text-slate-500">{JSON.stringify(glm.chain_prompt_files, null, 2)}</pre>
              </details>
            )}
          </CardContent>
        </Card>

        {/* Vision (qwen_vl) Card */}
        <Card className="border-violet-300/15 bg-gradient-to-br from-violet-950/20 via-white/5 to-slate-950/40">
          <CardHeader className="gap-1 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Eye className="h-4 w-4 text-violet-300" />
                Vision (qwen_vl)
              </CardTitle>
              <Badge variant="outline" className="border-violet-400/25 text-[10px] text-violet-100">Clasificacion estructurada</Badge>
            </div>
            <CardDescription className="text-[11px]">
              Modelo de vision que recibe imagen + texto OCR y genera JSON de productos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 sm:px-5">
            <TextField
              id="qwen-model"
              label="Modelo"
              value={qwen.model}
              onChange={(v) => updateQwen("model", v)}
              mono
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                id="qwen-num-ctx"
                label="Contexto (num_ctx)"
                value={qwen.num_ctx}
                onChange={(v) => updateQwen("num_ctx", v)}
                min={512} max={32768} step={512}
                tooltip={tip("num_ctx")}
              />
              <NumberField
                id="qwen-num-predict"
                label="Max tokens (num_predict)"
                value={qwen.num_predict}
                onChange={(v) => updateQwen("num_predict", v)}
                min={64} max={8192} step={64}
                tooltip={tip("num_predict")}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id="qwen-keep-alive"
                label="Keep alive"
                value={qwen.keep_alive}
                onChange={(v) => updateQwen("keep_alive", v)}
                mono
                tooltip={tip("keep_alive")}
              />
              <NumberField
                id="qwen-timeout"
                label="Timeout"
                value={qwen.timeout_sec}
                onChange={(v) => updateQwen("timeout_sec", v)}
                min={5} max={1800} step={5}
                suffix="seg"
                tooltip={tip("timeout_sec")}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                id="qwen-retries"
                label="Max reintentos"
                value={qwen.max_retries}
                onChange={(v) => updateQwen("max_retries", v)}
                min={1} max={5} step={1}
              />
              <NumberField
                id="qwen-retry-delay"
                label="Delay reintento"
                value={qwen.retry_delay_sec}
                onChange={(v) => updateQwen("retry_delay_sec", v)}
                min={0} max={120} step={1}
                suffix="seg"
              />
            </div>
            <TextField
              id="qwen-prompt"
              label="Prompt file"
              value={qwen.prompt_file}
              onChange={(v) => updateQwen("prompt_file", v)}
              mono
            />
            <div className="space-y-1.5">
              <Label className="text-xs">Sources habilitadas</Label>
              <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={primaryChecked}
                    onCheckedChange={(c) => toggleSource("primary", c)}
                    className="scale-75"
                  />
                  primary
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={supportChecked}
                    onCheckedChange={(c) => toggleSource("support", c)}
                    className="scale-75"
                  />
                  support
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reference table */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader className="px-4 py-3 sm:px-5">
          <CardTitle className="text-xs text-slate-400">Referencia rapida de valores recomendados</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="border-b border-white/10 text-slate-500">
                <tr>
                  <th className="px-4 py-1.5">Escenario</th>
                  <th className="px-4 py-1.5">OCR ctx</th>
                  <th className="px-4 py-1.5">OCR predict</th>
                  <th className="px-4 py-1.5">Vision ctx</th>
                  <th className="px-4 py-1.5">Vision predict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                <tr><td className="px-4 py-1.5">Produccion conservador</td><td className="px-4 py-1.5 font-mono">1536</td><td className="px-4 py-1.5 font-mono">384</td><td className="px-4 py-1.5 font-mono">4096</td><td className="px-4 py-1.5 font-mono">512</td></tr>
                <tr><td className="px-4 py-1.5">Mas rapido (riesgo bajo)</td><td className="px-4 py-1.5 font-mono">1024</td><td className="px-4 py-1.5 font-mono">256</td><td className="px-4 py-1.5 font-mono">2048</td><td className="px-4 py-1.5 font-mono">384</td></tr>
                <tr><td className="px-4 py-1.5">Maximo calidad</td><td className="px-4 py-1.5 font-mono">2048</td><td className="px-4 py-1.5 font-mono">600</td><td className="px-4 py-1.5 font-mono">8192</td><td className="px-4 py-1.5 font-mono">1024</td></tr>
                <tr><td className="px-4 py-1.5">Default de clase</td><td className="px-4 py-1.5 font-mono">2048</td><td className="px-4 py-1.5 font-mono">600</td><td className="px-4 py-1.5 font-mono">4096</td><td className="px-4 py-1.5 font-mono">512</td></tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-sky-500/20 bg-sky-950/15 px-3 py-2.5 text-[11px] leading-5 text-sky-200/80">
        Los cambios se guardan como nueva version de config y se activan inmediatamente.
        Aplican al proximo job creado. No afectan jobs en curso.
      </div>
    </div>
  );
}
