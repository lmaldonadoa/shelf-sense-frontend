"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { deepMerge, HttpError, ocrApi } from "@/lib/ocrApi";
import type {
  LLMProvidersResponse,
  LLMRoutingDraft,
  LLMSlotBindingDraft,
  LLMSlotId,
  PipelineConfig,
} from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = { account: string };

const SLOT_ORDER: LLMSlotId[] = ["ocr", "vision", "text_enrichment", "semantic_match", "benchmark_analyst"];

function emptyRouting(): LLMRoutingDraft {
  return { enabled: false, fallback_to_legacy: true, slots: {} };
}

function asNumberOrUndefined(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function providerLabel(providers: LLMProvidersResponse["providers"], id?: string) {
  if (!id) return "-";
  const hit = providers.find((p) => p.provider_id === id);
  return hit ? hit.display_name : id;
}

function syncLegacyConfig(config: PipelineConfig, routing: LLMRoutingDraft): PipelineConfig {
  const next = { ...config };
  const vision = routing.slots.vision;
  const enricher = routing.slots.text_enrichment;
  const benchmark = routing.slots.benchmark_analyst;

  if (vision) {
    next.qwen_vl = {
      ...(next.qwen_vl ?? {}),
      ...(vision.model ? { model: vision.model } : {}),
      ...(vision.prompt_file ? { prompt_file: vision.prompt_file } : {}),
      ...(typeof vision.timeout_sec === "number" ? { timeout_sec: vision.timeout_sec } : {}),
      ...(typeof vision.max_retries === "number" ? { max_retries: vision.max_retries } : {}),
      ...(typeof vision.retry_delay_sec === "number" ? { retry_delay_sec: vision.retry_delay_sec } : {}),
    };
  }

  if (enricher) {
    next.text_enrichment = {
      ...(next.text_enrichment ?? {}),
      ...(enricher.model ? { model: enricher.model } : {}),
    };
  }

  if (benchmark) {
    next.benchmark_analyst = {
      ...((next as Record<string, unknown>).benchmark_analyst as Record<string, unknown> ?? {}),
      ...(benchmark.model ? { model: benchmark.model } : {}),
    };
  }

  return next;
}

export function AccountLlmSettingsPage({ account }: Props) {
  const [accountName, setAccountName] = useState(account);
  const [configName, setConfigName] = useState("default");
  const [activeSlot, setActiveSlot] = useState<LLMSlotId>("ocr");
  const [routingDraft, setRoutingDraft] = useState<LLMRoutingDraft>(emptyRouting());
  const [fullConfigDraft, setFullConfigDraft] = useState<PipelineConfig>({});
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const providersQuery = useQuery({
    queryKey: ["llm-providers"],
    queryFn: () => ocrApi.getLlmProviders(),
    retry: false,
  });

  const activeConfigQuery = useQuery({
    queryKey: ["llm-config-active", accountName, configName],
    queryFn: () => ocrApi.getActiveConfig(accountName, configName),
    retry: false,
  });

  const configListQuery = useQuery({
    queryKey: ["llm-config-list", accountName, configName],
    queryFn: () => ocrApi.listConfigs(accountName, configName),
  });

  const routingQuery = useQuery({
    queryKey: ["llm-routing", accountName, configName],
    queryFn: () => ocrApi.getAccountLlmRouting(accountName, configName),
    retry: false,
  });

  const healthQuery = useQuery({
    queryKey: ["llm-health"],
    queryFn: () => ocrApi.getHealth(),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (activeConfigQuery.data?.config) {
      setFullConfigDraft(activeConfigQuery.data.config as PipelineConfig);
      const raw = (activeConfigQuery.data.config as Record<string, unknown>).llm_routing;
      if (raw && typeof raw === "object") {
        setRoutingDraft(raw as LLMRoutingDraft);
      } else if (providersQuery.data?.default_template) {
        setRoutingDraft(providersQuery.data.default_template);
      }
    }
  }, [activeConfigQuery.data, providersQuery.data?.default_template]);

  const slotMeta = providersQuery.data?.slots ?? {};
  const providerItems = providersQuery.data?.providers ?? [];
  const routingInfo = routingQuery.data?.routing;

  const effectiveExecution = routingInfo?.effective_execution ?? "legacy_ollama_modules";
  const routingEnabledInServer = Boolean(routingInfo?.routing_globally_enabled);
  const routingEnabledInConfig = Boolean(routingInfo?.routing_config_enabled);
  const ollamaUp = Boolean((healthQuery.data?.ollama as boolean | undefined) ?? false);

  const activeBinding = routingDraft.slots[activeSlot] ?? {};

  function setSlotBinding(slot: LLMSlotId, patch: Partial<LLMSlotBindingDraft>) {
    setRoutingDraft((prev) => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slot]: { ...(prev.slots[slot] ?? { provider_id: "ollama" }), ...patch },
      },
    }));
  }

  const validateMutation = useMutation({
    mutationFn: () => ocrApi.validateAccountLlmRouting(accountName, routingDraft),
    onSuccess: (result) => {
      setValidationWarnings(result.warnings ?? []);
      setRoutingDraft(result.normalized ?? routingDraft);
      toast.success("Validación OK");
    },
    onError: (error) => {
      const msg = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error validando llm_routing";
      toast.error("Error de validación", { description: msg });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const base = (activeConfigQuery.data?.config ?? {}) as Record<string, unknown>;
      const merged = deepMerge(base, fullConfigDraft as Record<string, unknown>) as PipelineConfig;
      const synced = syncLegacyConfig(merged, routingDraft);
      const payloadConfig: PipelineConfig = {
        ...synced,
        llm_routing: routingDraft,
      };
      return ocrApi.upsertConfig(accountName, {
        name: configName,
        version: "next",
        is_active: true,
        config: payloadConfig,
      });
    },
    onSuccess: (res) => {
      toast.success("Configuración guardada", { description: `Versión ${res.version}` });
      activeConfigQuery.refetch();
      configListQuery.refetch();
      routingQuery.refetch();
      validateMutation.reset();
    },
    onError: (error) => {
      const msg = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error guardando configuración";
      toast.error("No se pudo guardar", { description: msg });
    },
  });

  const providerOptions = useMemo(() => {
    return providerItems.map((p) => ({
      id: p.provider_id,
      label: p.display_name,
      planned: p.implementation_status === "planned" || p.implementation_status === "stub",
    }));
  }, [providerItems]);

  const shouldShowPromptFile = activeSlot === "vision";

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Modelos de IA por cuenta</CardTitle>
          <CardDescription>Configure qué motor usará cada etapa del OCR. La detección de etiquetas no se configura aquí.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>account_name</Label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>config_name</Label>
              <Input value={configName} onChange={(e) => setConfigName(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => { providersQuery.refetch(); activeConfigQuery.refetch(); routingQuery.refetch(); healthQuery.refetch(); }}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Recargar
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={ollamaUp ? "default" : "destructive"}>{ollamaUp ? "Ollama online" : "Ollama offline"}</Badge>
            <Badge variant={routingEnabledInServer ? "default" : "secondary"}>{routingEnabledInServer ? "Routing servidor: ON" : "Routing servidor: OFF"}</Badge>
            <Badge variant={routingEnabledInConfig ? "default" : "secondary"}>{routingEnabledInConfig ? "Routing config: ON" : "Routing config: OFF"}</Badge>
            <Badge variant="outline">Ejecución actual: {effectiveExecution}</Badge>
          </div>

          {effectiveExecution === "legacy_ollama_modules" ? (
            <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              Hoy todos los procesos usan Ollama en el servidor. Los cambios aquí quedan guardados para cuando se active el enrutamiento multi-proveedor.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Routing LLM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm font-medium">Activar enrutamiento (experimental)</p>
                <p className="text-xs text-muted-foreground">No tiene efecto hasta activar flag global en servidor.</p>
              </div>
              <Switch checked={Boolean(routingDraft.enabled)} onCheckedChange={(v) => setRoutingDraft((prev) => ({ ...prev, enabled: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm font-medium">Fallback a legacy</p>
                <p className="text-xs text-muted-foreground">Si un proveedor remoto falla, vuelve al flujo legacy actual.</p>
              </div>
              <Switch checked={Boolean(routingDraft.fallback_to_legacy)} onCheckedChange={(v) => setRoutingDraft((prev) => ({ ...prev, fallback_to_legacy: v }))} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {SLOT_ORDER.map((slot) => (
              <Button key={slot} variant={activeSlot === slot ? "default" : "outline"} size="sm" onClick={() => setActiveSlot(slot)}>
                {slot}
              </Button>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 p-4 space-y-3">
            <p className="text-xs text-muted-foreground">{String(slotMeta[activeSlot]?.label ?? activeSlot)}</p>
            <p className="text-xs text-muted-foreground">Módulo legacy: {String(slotMeta[activeSlot]?.legacy_module ?? "-")}</p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <select
                  className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-2 text-sm"
                  value={activeBinding.provider_id ?? "ollama"}
                  onChange={(e) => setSlotBinding(activeSlot, { provider_id: e.target.value })}
                >
                  {providerOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}{p.planned ? " (Próximamente)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Input value={activeBinding.model ?? ""} onChange={(e) => setSlotBinding(activeSlot, { model: e.target.value })} placeholder="qwen3-vl:2b" />
              </div>
              <div className="space-y-2">
                <Label>base_url (opcional)</Label>
                <Input value={activeBinding.base_url ?? ""} onChange={(e) => setSlotBinding(activeSlot, { base_url: e.target.value || null })} placeholder="http://localhost:11434" />
              </div>
              <div className="space-y-2">
                <Label>api_key_env (nombre de variable)</Label>
                <Input value={activeBinding.api_key_env ?? ""} onChange={(e) => setSlotBinding(activeSlot, { api_key_env: e.target.value || null })} placeholder="OPENROUTER_API_KEY" />
              </div>
              <div className="space-y-2">
                <Label>timeout_sec</Label>
                <Input type="number" value={activeBinding.timeout_sec ?? ""} onChange={(e) => setSlotBinding(activeSlot, { timeout_sec: asNumberOrUndefined(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>max_retries</Label>
                <Input type="number" value={activeBinding.max_retries ?? ""} onChange={(e) => setSlotBinding(activeSlot, { max_retries: asNumberOrUndefined(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>retry_delay_sec</Label>
                <Input type="number" value={activeBinding.retry_delay_sec ?? ""} onChange={(e) => setSlotBinding(activeSlot, { retry_delay_sec: asNumberOrUndefined(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>temperature</Label>
                <Input type="number" step="0.1" value={activeBinding.temperature ?? ""} onChange={(e) => setSlotBinding(activeSlot, { temperature: asNumberOrUndefined(e.target.value) })} />
              </div>
              {shouldShowPromptFile ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>prompt_file (vision)</Label>
                  <Input value={activeBinding.prompt_file ?? ""} onChange={(e) => setSlotBinding(activeSlot, { prompt_file: e.target.value })} placeholder="qwen3vl_prompt.txt" />
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-md border border-white/10 p-3">
              <p className="text-sm">Habilitar slot</p>
              <Switch checked={activeBinding.enabled ?? true} onCheckedChange={(v) => setSlotBinding(activeSlot, { enabled: v })} />
            </div>

            <p className="text-xs text-muted-foreground">
              Proveedor actual: {providerLabel(providerItems, activeBinding.provider_id)}
            </p>
          </div>

          {validationWarnings.length ? (
            <div className="space-y-2 rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Warnings de validación
              </div>
              {validationWarnings.map((w, idx) => <p key={`warn-${idx}`}>- {w}</p>)}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => validateMutation.mutate()} disabled={validateMutation.isPending}>
              {validateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Validar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar nueva versión
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Historial de versiones</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">
            {JSON.stringify(configListQuery.data?.configs ?? [], null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

