"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3, Loader2, RotateCcw, Save, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import {
  isOcrNoiseReviewConfigApiEnabled,
  OCR_NOISE_REVIEW_ACTIVE_ENDPOINTS,
  OCR_NOISE_REVIEW_CONFIG_ENDPOINTS,
  OCR_NOISE_REVIEW_CONFIG_PREVIEW,
} from "@/lib/ocr-noise-review-config";
import type { OcrNoiseReviewConfig, OcrNoiseReviewConfigPatchRequest } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TrainingFooterNote,
  TrainingFormCard,
  TrainingSectionHero,
} from "@/components/training/training-ui";

type Props = { account: string };

const CONFIG_KEYS = [
  "product_anchors",
  "function_word_tokens",
  "month_tokens",
  "leading_fragment_anchor_regexes",
  "leading_fragment_excluded_anchor_tokens",
  "phrase_useful_max_tokens",
  "phrase_useful_min_long_token_len",
  "phrase_useful_product_overlap_margin",
  "phrase_chunk_direct_max_tokens",
  "phrase_chunk_window_min_tokens",
  "phrase_chunk_window_max_tokens",
  "score_by_source_kind",
  "score_default",
  "score_occurrence_bonus_threshold",
  "score_occurrence_bonus",
  "score_token_bonus_min",
  "score_token_bonus_max",
  "score_token_bonus",
  "score_cap",
] as const satisfies ReadonlyArray<keyof OcrNoiseReviewConfig>;

const DEFAULT_SCORE_SOURCES = [
  "activity",
  "descripcion_header",
  "ocr_preview_header",
  "support_candidate",
] as const;

function tokensToText(values: string[]): string {
  return values.join("\n");
}

function textToTokens(raw: string, uppercase = true): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    for (const part of line.split(",")) {
      const token = (uppercase ? part.trim().toUpperCase() : part.trim());
      if (!token || seen.has(token)) continue;
      seen.add(token);
      items.push(token);
    }
  }
  return items;
}

function textToRegexList(raw: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const token = line.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    items.push(token);
  }
  return items;
}

function isEqualValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function computePatch(
  baseline: OcrNoiseReviewConfig,
  draft: OcrNoiseReviewConfig,
): OcrNoiseReviewConfigPatchRequest {
  const patch: OcrNoiseReviewConfigPatchRequest = {};
  for (const key of CONFIG_KEYS) {
    if (!isEqualValue(baseline[key], draft[key])) {
      patch[key] = draft[key] as never;
    }
  }
  return patch;
}

function ConfigBlock({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-xl border border-white/10 bg-black/20"
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">{title}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{description}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[9px] text-slate-400">
            Avanzado
          </Badge>
        </div>
      </summary>
      <div className="space-y-4 border-t border-white/5 px-4 py-4">{children}</div>
    </details>
  );
}

function TokenTextarea({
  id,
  label,
  hint,
  value,
  onChange,
  rows = 6,
  monospace = true,
  readOnly = false,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  monospace?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-slate-300">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={`text-xs ${monospace ? "font-mono" : ""} ${readOnly ? "cursor-default opacity-80" : ""}`}
      />
      {hint ? <p className="text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-slate-300">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 text-sm"
      />
      {hint ? <p className="text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function OcrNoiseReviewConfigHero({
  account,
  dirtyCount = 0,
  previewConfig,
  seedVersion,
  pending = false,
}: {
  account: string;
  dirtyCount?: number;
  previewConfig?: OcrNoiseReviewConfig | null;
  seedVersion?: string;
  pending?: boolean;
}) {
  return (
    <TrainingSectionHero
      tone="rose"
      icon={<ScanSearch className="h-4 w-4" />}
      title="Heuristicas de revision OCR"
      description="Configuracion tecnica que controla como el backend genera sugerencias automaticas de ruido para revision humana. No son frases finales ni tokens de limpieza."
      badges={
        <>
          <Badge variant="outline" className="text-[10px]">
            config tecnica
          </Badge>
          <Badge className="border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-100">
            ocr_noise_review
          </Badge>
          {pending ? (
            <Badge className="border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-100">
              Backend pendiente
            </Badge>
          ) : null}
          {!pending && dirtyCount > 0 ? (
            <Badge className="border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-100">
              {dirtyCount} cambio{dirtyCount !== 1 ? "s" : ""} pendiente{dirtyCount !== 1 ? "s" : ""}
            </Badge>
          ) : null}
        </>
      }
      kpis={[
        { label: "Anchors producto", value: previewConfig?.product_anchors.length ?? "—" },
        { label: "Regex corte", value: previewConfig?.leading_fragment_anchor_regexes.length ?? "—" },
        {
          label: "Fuentes score",
          value: Object.keys(previewConfig?.score_by_source_kind ?? {}).length || "—",
        },
        { label: "Seed", value: seedVersion ?? "ocr-noise-review-config-v1", hint: "version semilla" },
      ]}
      footer={
        <div className="space-y-2 text-xs leading-5 text-slate-300">
          <p className="flex items-start gap-1.5 text-amber-100/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Cambios aqui alteran que frases sugiere el sistema para revision humana. No modifican resultados ya
            procesados ni reemplazan ignored-phrases confirmadas.
          </p>
          <p>
            Cuenta: <span className="font-mono text-slate-200">{account}</span> · Salida:{" "}
            <span className="font-mono text-slate-200">ignored-phrases/suggestions</span> · Validado:{" "}
            <span className="font-mono text-slate-200">ignored-phrases</span> · Reglas:{" "}
            <span className="font-mono text-slate-200">ocr-noise-review-config</span>
          </p>
        </div>
      }
    />
  );
}

function OcrNoiseReviewConfigPendingView({ account }: Props) {
  const preview = OCR_NOISE_REVIEW_CONFIG_PREVIEW;

  return (
    <div className="space-y-4">
      <OcrNoiseReviewConfigHero account={account} previewConfig={preview} pending />

      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-slate-950/40 to-rose-950/20 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start gap-3">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold text-amber-50">Proximamente · API REST pendiente</p>
            <p className="text-xs leading-5 text-amber-100/85">
              El backend ya tiene seed, tabla SQLite y metodos DB, pero aun no expone rutas HTTP publicas para este
              recurso. Esta vista no hace fetch automatico para evitar errores de red en este ambiente.
            </p>
            <p className="text-[11px] text-amber-200/70">
              Cuando backend despliegue los endpoints, activa{" "}
              <span className="font-mono">NEXT_PUBLIC_ENABLE_OCR_NOISE_REVIEW_CONFIG_API=true</span> y reinicia el dev
              server.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
          <p className="text-xs font-semibold text-slate-300">Endpoints pendientes (no llamar aun)</p>
          <ul className="mt-2 space-y-1.5 text-[11px] font-mono text-slate-500">
            <li>GET {OCR_NOISE_REVIEW_CONFIG_ENDPOINTS.get}</li>
            <li>PATCH {OCR_NOISE_REVIEW_CONFIG_ENDPOINTS.patch}</li>
            <li>POST {OCR_NOISE_REVIEW_CONFIG_ENDPOINTS.reset}</li>
          </ul>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/15 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-100">Revision OCR disponible hoy</p>
          <ul className="mt-2 space-y-1.5 text-[11px] font-mono text-emerald-200/80">
            {OCR_NOISE_REVIEW_ACTIVE_ENDPOINTS.map((route) => (
              <li key={route}>{route}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-5 text-emerald-100/70">
            Usa la tarjeta &quot;Revision de ruido OCR&quot; en el detalle de cada job para ver candidatos y guardar
            frases confirmadas.
          </p>
        </div>
      </div>

      <div className="space-y-3 opacity-80">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Vista previa del contrato (solo lectura)</p>
        <ConfigBlock
          title="Bloque A · Anchors y exclusiones"
          description="Referencia del seed v1 — no editable hasta que la API este activa."
        >
          <TokenTextarea
            id="onrc-preview-anchors"
            label="product_anchors"
            value={tokensToText(preview.product_anchors)}
            onChange={() => undefined}
            rows={6}
            readOnly
          />
          <TokenTextarea
            id="onrc-preview-regex"
            label="leading_fragment_anchor_regexes"
            value={tokensToText(preview.leading_fragment_anchor_regexes)}
            onChange={() => undefined}
            rows={3}
            readOnly
          />
        </ConfigBlock>
        <details className="rounded-xl border border-white/10 bg-black/20">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-slate-400">
            Ver JSON completo del contrato esperado (GET)
          </summary>
          <pre className="max-h-72 overflow-auto border-t border-white/5 px-4 py-3 text-[11px] text-slate-500">
            {JSON.stringify(
              {
                account_name: account,
                config_key: "ocr_noise_review",
                config: preview,
                seed_info: { version: "ocr-noise-review-config-v1" },
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-9" disabled title="Disponible cuando backend exponga la API">
          Guardar cambios
        </Button>
        <Button size="sm" variant="outline" className="h-9" disabled title="Disponible cuando backend exponga la API">
          Restaurar defaults
        </Button>
      </div>

      <TrainingFooterNote>
        No es un error de tu entorno: la UI esta preparada con el contrato, pero el fetch real queda deshabilitado hasta
        que backend publique las rutas REST. La revision de candidatos en jobs sigue operativa con ignored-phrases.
      </TrainingFooterNote>
    </div>
  );
}

function OcrNoiseReviewConfigEditorActive({ account }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["ocr-noise-review-config", account];

  const [draft, setDraft] = useState<OcrNoiseReviewConfig | null>(null);
  const [baseline, setBaseline] = useState<OcrNoiseReviewConfig | null>(null);

  const [productAnchorsText, setProductAnchorsText] = useState("");
  const [functionWordsText, setFunctionWordsText] = useState("");
  const [monthTokensText, setMonthTokensText] = useState("");
  const [regexesText, setRegexesText] = useState("");
  const [excludedAnchorsText, setExcludedAnchorsText] = useState("");

  const configQuery = useQuery({
    queryKey,
    queryFn: () => ocrApi.getOcrNoiseReviewConfig(account),
    enabled: Boolean(account?.trim()) && isOcrNoiseReviewConfigApiEnabled(),
    retry: (failureCount, error) => {
      if (error instanceof HttpError && error.status === 404) return false;
      return failureCount < 1;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!configQuery.data?.config) return;
    const cfg = configQuery.data.config;
    setBaseline(cfg);
    setDraft(cfg);
    setProductAnchorsText(tokensToText(cfg.product_anchors));
    setFunctionWordsText(tokensToText(cfg.function_word_tokens));
    setMonthTokensText(tokensToText(cfg.month_tokens));
    setRegexesText(tokensToText(cfg.leading_fragment_anchor_regexes));
    setExcludedAnchorsText(tokensToText(cfg.leading_fragment_excluded_anchor_tokens));
  }, [configQuery.data]);

  const draftFromText = useMemo((): OcrNoiseReviewConfig | null => {
    if (!draft) return null;
    return {
      ...draft,
      product_anchors: textToTokens(productAnchorsText),
      function_word_tokens: textToTokens(functionWordsText),
      month_tokens: textToTokens(monthTokensText),
      leading_fragment_anchor_regexes: textToRegexList(regexesText),
      leading_fragment_excluded_anchor_tokens: textToTokens(excludedAnchorsText),
    };
  }, [draft, productAnchorsText, functionWordsText, monthTokensText, regexesText, excludedAnchorsText]);

  const dirtyPatch = useMemo(() => {
    if (!baseline || !draftFromText) return {};
    return computePatch(baseline, draftFromText);
  }, [baseline, draftFromText]);

  const dirtyCount = Object.keys(dirtyPatch).length;

  function updateDraft<K extends keyof OcrNoiseReviewConfig>(key: K, value: OcrNoiseReviewConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateScoreSource(source: string, value: number) {
    if (!draft) return;
    updateDraft("score_by_source_kind", {
      ...draft.score_by_source_kind,
      [source]: value,
    });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draftFromText || !baseline) throw new Error("Config no cargada.");
      const patch = computePatch(baseline, draftFromText);
      if (Object.keys(patch).length === 0) throw new Error("No hay cambios para guardar.");
      return ocrApi.patchOcrNoiseReviewConfig(account, patch);
    },
    onSuccess: (data) => {
      toast.success("Configuracion guardada", {
        description: "Los cambios alteran que frases sugiere la revision OCR.",
      });
      setBaseline(data.config);
      setDraft(data.config);
      queryClient.setQueryData(queryKey, data);
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 404) {
        toast.error("Endpoint no disponible", {
          description: "ocr-noise-review-config aun no esta desplegado en este ambiente.",
        });
        return;
      }
      const detail = error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar", { description: detail });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => ocrApi.resetOcrNoiseReviewConfigDefaults(account),
    onSuccess: (data) => {
      toast.success("Defaults restaurados");
      setBaseline(data.config);
      setDraft(data.config);
      setProductAnchorsText(tokensToText(data.config.product_anchors));
      setFunctionWordsText(tokensToText(data.config.function_word_tokens));
      setMonthTokensText(tokensToText(data.config.month_tokens));
      setRegexesText(tokensToText(data.config.leading_fragment_anchor_regexes));
      setExcludedAnchorsText(tokensToText(data.config.leading_fragment_excluded_anchor_tokens));
      queryClient.setQueryData(queryKey, data);
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 404) {
        toast.error("Endpoint no disponible", {
          description: "reset-defaults aun no esta desplegado en este ambiente.",
        });
        return;
      }
      const detail = error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo restaurar", { description: detail });
    },
  });

  const loadErrorMessage =
    configQuery.error instanceof HttpError
      ? configQuery.error.detail
      : configQuery.error instanceof Error
        ? configQuery.error.message
        : null;

  return (
    <div className="space-y-4">
      <OcrNoiseReviewConfigHero
        account={account}
        dirtyCount={dirtyCount}
        previewConfig={draftFromText}
        seedVersion={configQuery.data?.seed_info?.version}
      />

      {loadErrorMessage ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          {loadErrorMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || dirtyCount === 0 || !draftFromText}
        >
          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar cambios ({dirtyCount})
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1.5"
          onClick={() => {
            if (
              confirm(
                "Restaurar la configuracion a los defaults semilla? Se perderan ajustes personalizados de esta cuenta.",
              )
            ) {
              resetMutation.mutate();
            }
          }}
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Restaurar defaults
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-9"
          onClick={() => configQuery.refetch()}
          disabled={configQuery.isFetching}
        >
          {configQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refrescar"}
        </Button>
      </div>

      {configQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando configuracion...
        </div>
      ) : draftFromText ? (
        <div className="space-y-3">
          <ConfigBlock
            title="Bloque A · Anchors y exclusiones"
            description="Donde termina banner/ruido y empieza contenido comercial. Regex de corte y tokens excluidos de cadena."
            defaultOpen
          >
            <TokenTextarea
              id="onrc-product-anchors"
              label="product_anchors"
              hint="Un token por linea o separados por coma. Mayusculas recomendadas."
              value={productAnchorsText}
              onChange={setProductAnchorsText}
              rows={8}
            />
            <TokenTextarea
              id="onrc-regexes"
              label="leading_fragment_anchor_regexes"
              hint="Una regex por linea. Ej: \\bPRODUCTO\\b"
              value={regexesText}
              onChange={setRegexesText}
              rows={4}
            />
            <TokenTextarea
              id="onrc-excluded"
              label="leading_fragment_excluded_anchor_tokens"
              hint="Nombres de cadena/banner que no deben usarse como anchor de corte."
              value={excludedAnchorsText}
              onChange={setExcludedAnchorsText}
              rows={5}
            />
          </ConfigBlock>

          <ConfigBlock
            title="Bloque B · Filtros de utilidad"
            description="Palabras que no deben sugerirse solas y reglas numericas de frase util."
          >
            <TokenTextarea
              id="onrc-function-words"
              label="function_word_tokens"
              value={functionWordsText}
              onChange={setFunctionWordsText}
              rows={5}
            />
            <TokenTextarea
              id="onrc-months"
              label="month_tokens"
              value={monthTokensText}
              onChange={setMonthTokensText}
              rows={5}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                id="onrc-useful-max"
                label="phrase_useful_max_tokens"
                value={draftFromText.phrase_useful_max_tokens}
                onChange={(v) => updateDraft("phrase_useful_max_tokens", v)}
                min={1}
                max={20}
              />
              <NumberField
                id="onrc-useful-min-len"
                label="phrase_useful_min_long_token_len"
                value={draftFromText.phrase_useful_min_long_token_len}
                onChange={(v) => updateDraft("phrase_useful_min_long_token_len", v)}
                min={1}
                max={20}
              />
              <NumberField
                id="onrc-useful-margin"
                label="phrase_useful_product_overlap_margin"
                value={draftFromText.phrase_useful_product_overlap_margin}
                onChange={(v) => updateDraft("phrase_useful_product_overlap_margin", v)}
                min={0}
                max={10}
              />
            </div>
          </ConfigBlock>

          <ConfigBlock
            title="Bloque C · Chunking / extraccion"
            description="Reglas para extraer subfrases candidatas desde fragmentos OCR."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                id="onrc-chunk-direct"
                label="phrase_chunk_direct_max_tokens"
                value={draftFromText.phrase_chunk_direct_max_tokens}
                onChange={(v) => updateDraft("phrase_chunk_direct_max_tokens", v)}
                min={1}
                max={20}
              />
              <NumberField
                id="onrc-chunk-min"
                label="phrase_chunk_window_min_tokens"
                value={draftFromText.phrase_chunk_window_min_tokens}
                onChange={(v) => updateDraft("phrase_chunk_window_min_tokens", v)}
                min={1}
                max={10}
              />
              <NumberField
                id="onrc-chunk-max"
                label="phrase_chunk_window_max_tokens"
                value={draftFromText.phrase_chunk_window_max_tokens}
                onChange={(v) => updateDraft("phrase_chunk_window_max_tokens", v)}
                min={1}
                max={12}
              />
            </div>
          </ConfigBlock>

          <ConfigBlock
            title="Bloque D · Scoring de confianza"
            description="Pesos por source_kind y bonificaciones para ordenar sugerencias."
          >
            <TrainingFormCard title="score_by_source_kind" tone="rose">
              <div className="space-y-2">
                {DEFAULT_SCORE_SOURCES.map((source) => (
                  <div key={source} className="grid grid-cols-[minmax(140px,1fr)_120px] items-center gap-2">
                    <Label className="font-mono text-[11px] text-slate-300">{source}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={draftFromText.score_by_source_kind[source] ?? 0}
                      onChange={(e) => updateScoreSource(source, Number(e.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
                {Object.entries(draftFromText.score_by_source_kind)
                  .filter(([key]) => !DEFAULT_SCORE_SOURCES.includes(key as (typeof DEFAULT_SCORE_SOURCES)[number]))
                  .map(([source, score]) => (
                    <div key={source} className="grid grid-cols-[minmax(140px,1fr)_120px] items-center gap-2">
                      <Label className="font-mono text-[11px] text-slate-300">{source}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={score}
                        onChange={(e) => updateScoreSource(source, Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
              </div>
            </TrainingFormCard>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField
                id="onrc-score-default"
                label="score_default"
                value={draftFromText.score_default}
                onChange={(v) => updateDraft("score_default", v)}
                min={0}
                max={1}
                step={0.01}
              />
              <NumberField
                id="onrc-score-cap"
                label="score_cap"
                value={draftFromText.score_cap}
                onChange={(v) => updateDraft("score_cap", v)}
                min={0}
                max={1}
                step={0.01}
              />
              <NumberField
                id="onrc-occ-threshold"
                label="score_occurrence_bonus_threshold"
                value={draftFromText.score_occurrence_bonus_threshold}
                onChange={(v) => updateDraft("score_occurrence_bonus_threshold", v)}
                min={1}
                max={50}
              />
              <NumberField
                id="onrc-occ-bonus"
                label="score_occurrence_bonus"
                value={draftFromText.score_occurrence_bonus}
                onChange={(v) => updateDraft("score_occurrence_bonus", v)}
                min={0}
                max={1}
                step={0.01}
              />
              <NumberField
                id="onrc-token-min"
                label="score_token_bonus_min"
                value={draftFromText.score_token_bonus_min}
                onChange={(v) => updateDraft("score_token_bonus_min", v)}
                min={1}
                max={20}
              />
              <NumberField
                id="onrc-token-max"
                label="score_token_bonus_max"
                value={draftFromText.score_token_bonus_max}
                onChange={(v) => updateDraft("score_token_bonus_max", v)}
                min={1}
                max={20}
              />
              <NumberField
                id="onrc-token-bonus"
                label="score_token_bonus"
                value={draftFromText.score_token_bonus}
                onChange={(v) => updateDraft("score_token_bonus", v)}
                min={0}
                max={1}
                step={0.01}
              />
            </div>
          </ConfigBlock>

          {dirtyCount > 0 ? (
            <details className="rounded-lg border border-white/10 bg-black/20">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400">
                Vista previa PATCH ({dirtyCount} claves)
              </summary>
              <pre className="max-h-48 overflow-auto border-t border-white/5 px-3 py-2 text-[11px] text-slate-500">
                {JSON.stringify(dirtyPatch, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <TrainingFooterNote>
        Esta configuracion no reemplaza ignored-phrases, human-name-noise-tokens ni measure-noise-chains. El guardado
        envia solo claves modificadas (PATCH parcial). La revision de candidatos detectados vive en el detalle de cada
        job, no aqui.
      </TrainingFooterNote>
    </div>
  );
}

export function OcrNoiseReviewConfigEditor({ account }: Props) {
  if (!isOcrNoiseReviewConfigApiEnabled()) {
    return <OcrNoiseReviewConfigPendingView account={account} />;
  }
  return <OcrNoiseReviewConfigEditorActive account={account} />;
}