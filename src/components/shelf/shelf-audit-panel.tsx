"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock, Eye, ShieldAlert, Sparkles, Zap } from "lucide-react";
import {
  buildOcrSkuAssistShortLine,
  parseOcrSkuAssistCrop,
  parseOcrSkuAssistSummary,
  shelfAssistEngineLabel,
  shelfShadowEngineLabel,
} from "@/lib/shelf-ocr-sku-assist";
import type {
  ShelfAssistEngineUsedEvent,
  ShelfOcrSkuAssistCandidateSignal,
  ShelfOcrSkuAssistCrop,
  ShelfOcrSkuAssistMotor,
  ShelfOcrSkuAssistSummary,
} from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";

type CounterCardProps = {
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "cyan" | "red" | "emerald" | "violet";
  hint?: string;
};

function CounterCard({ label, value, tone = "default", hint }: CounterCardProps) {
  const border =
    tone === "amber" ? "border-amber-300/20" :
    tone === "red" ? "border-red-400/20" :
    tone === "cyan" ? "border-cyan-300/20" :
    tone === "emerald" ? "border-emerald-300/20" :
    tone === "violet" ? "border-violet-300/20" :
    "border-white/10";
  const bg =
    tone === "amber" ? "bg-amber-500/5" :
    tone === "red" ? "bg-red-500/5" :
    tone === "cyan" ? "bg-cyan-500/5" :
    tone === "emerald" ? "bg-emerald-500/5" :
    tone === "violet" ? "bg-violet-500/5" :
    "bg-black/20";
  return (
    <div className={`rounded-lg border ${border} ${bg} p-3`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function safe(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in obj) return (obj as Record<string, unknown>)[key];
  return undefined;
}

function safeNum(obj: unknown, key: string, fallback = 0): number {
  const v = safe(obj, key);
  return typeof v === "number" ? v : fallback;
}

function safeStr(obj: unknown, key: string, fallback = "-"): string {
  const v = safe(obj, key);
  return typeof v === "string" && v ? v : fallback;
}

function safeObj(obj: unknown, key: string): Record<string, unknown> {
  const v = safe(obj, key);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function safeArr(obj: unknown, key: string): unknown[] {
  const v = safe(obj, key);
  return Array.isArray(v) ? v : [];
}

function AssistMotorBlock({ title, motor }: { title: string; motor?: ShelfOcrSkuAssistMotor }) {
  if (!motor) return null;
  const attrs = motor.attributes_preview;
  return (
    <div className="rounded-md border border-cyan-300/20 bg-cyan-500/5 p-2">
      <p className="text-[11px] text-slate-400">{title}</p>
      {motor.text_preview ? <p className="mt-1 text-xs">{motor.text_preview}</p> : null}
      {attrs && Object.keys(attrs).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(attrs).map(([key, value]) => (
            <Badge key={key} variant="outline" className="text-[10px]">
              {key}: {String(value)}
            </Badge>
          ))}
        </div>
      ) : null}
      <p className="mt-1 text-[11px] text-slate-500">
        {motor.model || "-"} · {motor.duration_ms ?? 0}ms · {motor.status || "-"}
      </p>
    </div>
  );
}

function CandidateSignals({ candidates }: { candidates?: ShelfOcrSkuAssistCandidateSignal[] }) {
  if (!candidates?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
      <p className="mb-1 text-[11px] text-slate-400">Per-candidate signals</p>
      <div className="space-y-1">
        {candidates.map((cand, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1 text-xs">
            <span className="font-mono text-slate-300">#{cand.rank_before}</span>
            <span>{cand.sku_id}</span>
            <span className={cand.delta > 0 ? "text-emerald-300" : cand.delta < 0 ? "text-red-300" : "text-slate-400"}>
              {cand.delta > 0 ? "+" : ""}{cand.delta.toFixed(2)}
            </span>
            {cand.signals.map((signal, j) => (
              <Badge key={j} variant={signal.includes("conflict") ? "destructive" : "outline"} className="px-1 py-0 text-[10px]">
                {signal}
              </Badge>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderCompare({
  title,
  before,
  after,
  tone = "emerald",
}: {
  title: string;
  before?: string[];
  after?: string[];
  tone?: "emerald" | "violet";
}) {
  if (!before?.length && !after?.length) return null;
  const border = tone === "violet" ? "border-violet-300/20 bg-violet-500/5" : "border-emerald-300/20 bg-emerald-500/5";
  return (
    <div className={`rounded-md border ${border} p-2`}>
      <p className="text-[11px] text-slate-400">{title}</p>
      <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-[10px] text-slate-500">Antes</p>
          {(before ?? []).slice(0, 5).map((sku, i) => (
            <p key={i} className="font-mono text-slate-300">{i + 1}. {sku}</p>
          ))}
        </div>
        <div>
          <p className="text-[10px] text-slate-500">{tone === "violet" ? "Hipotético" : "Después"}</p>
          {(after ?? []).slice(0, 5).map((sku, i) => (
            <p key={i} className="font-mono text-slate-100">{i + 1}. {sku}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssistBadges({ assist }: { assist: ShelfOcrSkuAssistCrop }) {
  const badges: ReactNode[] = [];
  if (assist.engine) {
    badges.push(
      <Badge key="engine" variant="outline" className="border-cyan-300/30 text-cyan-200">
        {shelfAssistEngineLabel(assist.engine)}
      </Badge>,
    );
  }
  if (assist.ran) {
    badges.push(<Badge key="ran" variant="secondary">Assist ran</Badge>);
  }
  if (assist.reordered) {
    badges.push(<Badge key="reordered" className="bg-emerald-600">Reordenado</Badge>);
  }
  if (assist.shadow?.ran) {
    badges.push(
      <Badge key="shadow" variant="outline" className="border-violet-300/30 text-violet-200">
        {shelfShadowEngineLabel(assist.shadow.engine ?? assist.shadow_engine)}
      </Badge>,
    );
  }
  if (assist.shadow?.would_reorder) {
    badges.push(
      <Badge key="shadow-would" variant="outline" className="border-amber-300/30 text-amber-200">
        Shadow habría reordenado
      </Badge>,
    );
  }
  return <>{badges}</>;
}

export function ShelfAuditSummary({ data }: { data: Record<string, unknown> }) {
  const summary = safeObj(data, "summary");
  if (!Object.keys(summary).length) return null;

  const totalResults = safeNum(summary, "total_results");
  const totalLowQuality = safeNum(summary, "total_low_quality_crops");
  const totalPenaltyApplied = safeNum(summary, "total_low_quality_penalty_applied");
  const totalReviewRequired = safeNum(summary, "total_review_required");
  const assistSummary = parseOcrSkuAssistSummary(summary);

  const confidenceStates = safeObj(summary, "confidence_states");

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-100">Resumen de auditoría</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <CounterCard label="Total crops" value={totalResults} />
        <CounterCard label="Low quality" value={totalLowQuality} tone={totalLowQuality > 0 ? "amber" : "default"} />
        <CounterCard label="Penalty aplicado" value={totalPenaltyApplied} tone={totalPenaltyApplied > 0 ? "amber" : "default"} />
        <CounterCard label="Review requerido" value={totalReviewRequired} tone={totalReviewRequired > 0 ? "red" : "default"} />
      </div>

      {assistSummary ? (
        <div className="space-y-3 rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <p className="text-sm font-semibold text-slate-100">OCR SKU Assist</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <CounterCard label="Assist ran" value={assistSummary.total_ocr_assist_ran} tone={assistSummary.total_ocr_assist_ran > 0 ? "cyan" : "default"} />
            <CounterCard label="Reordenados" value={assistSummary.total_ocr_assist_reordered} tone={assistSummary.total_ocr_assist_reordered > 0 ? "emerald" : "default"} />
            {Object.entries(assistSummary.assist_engine_breakdown).map(([engine, count]) => (
              <CounterCard key={engine} label={`Motor ${shelfAssistEngineLabel(engine)}`} value={count} tone="cyan" />
            ))}
          </div>

          {Object.keys(assistSummary.ocr_assist_gate_reasons).length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Gate reasons (diagnóstico)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(assistSummary.ocr_assist_gate_reasons).map(([reason, count]) => (
                  <CounterCard key={reason} label={reason.replace(/_/g, " ")} value={count} tone="cyan" />
                ))}
              </div>
            </div>
          ) : null}

          {(assistSummary.total_shadow_assist_ran > 0 || Object.keys(assistSummary.shadow_engine_breakdown).length > 0) ? (
            <div className="space-y-2 rounded-md border border-violet-300/20 bg-violet-500/5 p-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-violet-300" />
                <p className="text-xs font-semibold text-slate-200">Auditoría paralela</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <CounterCard
                  label="Shadow ran"
                  value={assistSummary.total_shadow_assist_ran}
                  tone={assistSummary.total_shadow_assist_ran > 0 ? "violet" : "default"}
                  hint="No altera el resultado final"
                />
                <CounterCard
                  label="Habría reordenado"
                  value={assistSummary.total_shadow_would_reorder}
                  tone={assistSummary.total_shadow_would_reorder > 0 ? "amber" : "default"}
                  hint="Solo contrafactual"
                />
                {Object.entries(assistSummary.shadow_engine_breakdown).map(([engine, count]) => (
                  <CounterCard key={engine} label={`Shadow ${shelfAssistEngineLabel(engine)}`} value={count} tone="violet" />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {Object.keys(confidenceStates).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-400">Distribución de confianza</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(confidenceStates).map(([state, count]) => {
              const tone: CounterCardProps["tone"] =
                state === "high_confidence" ? "emerald" :
                state === "medium_confidence" ? "amber" :
                state === "unknown_sku" ? "red" : "default";
              return <CounterCard key={state} label={state.replace(/_/g, " ")} value={typeof count === "number" ? count : 0} tone={tone} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ShelfCropAuditDetail({ result, defaultOpen = false }: { result: Record<string, unknown>; defaultOpen?: boolean }) {
  const quality = safeObj(result, "quality");
  const assist = parseOcrSkuAssistCrop(result.ocr_sku_assist);
  const hasQuality = Object.keys(quality).length > 0;
  const hasAssist = Boolean(assist);

  if (!hasQuality && !hasAssist) return null;

  const cropId = safeStr(result, "crop_id", "crop");
  const isLowQuality = safe(quality, "is_low_quality") === true;

  return (
    <details className="rounded-lg border border-white/10 bg-black/20 p-3" open={defaultOpen}>
      <summary className="cursor-pointer">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-100">{cropId} — Audit</span>
          {isLowQuality && <Badge variant="secondary">Low quality</Badge>}
          {assist ? <AssistBadges assist={assist} /> : null}
        </div>
      </summary>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {hasQuality && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">Calidad del crop</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                <p className="text-[11px] text-slate-400">area_ratio</p>
                <p className="text-sm">{safeNum(quality, "area_ratio").toFixed(4)}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                <p className="text-[11px] text-slate-400">laplacian_var</p>
                <p className="text-sm">{safeNum(quality, "laplacian_var").toFixed(1)}</p>
              </div>
            </div>
            {safeArr(quality, "reasons").length > 0 && (
              <div className="flex flex-wrap gap-1">
                {safeArr(quality, "reasons").map((r, i) => (
                  <Badge key={i} variant="secondary">{String(r)}</Badge>
                ))}
              </div>
            )}
            {(() => {
              const topCandidates = safeArr(result, "top_candidates");
              const top = topCandidates[0] as Record<string, unknown> | undefined;
              if (!top) return null;
              const breakdown = safeObj(top, "score_breakdown");
              const rawScore = safeNum(breakdown, "visual_score_raw");
              const penaltyApplied = safeNum(breakdown, "low_quality_penalty_applied");
              const visual = safeNum(breakdown, "visual");
              if (!rawScore && !penaltyApplied) return null;
              return (
                <div className="rounded-md border border-amber-300/20 bg-amber-500/5 p-2">
                  <p className="text-[11px] text-slate-400">Score breakdown (top1)</p>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <span>Raw: {rawScore.toFixed(3)}</span>
                    {penaltyApplied > 0 && (
                      <>
                        <span className="text-red-300">−{penaltyApplied.toFixed(3)}</span>
                        <span>=</span>
                        <span className="font-semibold">{visual.toFixed(3)}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {assist ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">OCR SKU Assist</p>
            <p className="rounded-md border border-white/10 bg-slate-950/40 px-2 py-1 font-mono text-[10px] text-slate-400">
              {buildOcrSkuAssistShortLine(assist)}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                <p className="text-[11px] text-slate-400">gate_reason</p>
                <p className="text-sm">{assist.gate_reason || "-"}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                <p className="text-[11px] text-slate-400">ran / reordered</p>
                <p className="text-sm">{assist.ran ? "Sí" : "No"} / {assist.reordered ? "Sí" : "No"}</p>
              </div>
            </div>

            <AssistMotorBlock title="OCR result" motor={assist.ocr} />
            <AssistMotorBlock title="Vision result" motor={assist.vision} />

            {assist.catalog_prefetch && Object.keys(assist.catalog_prefetch).length > 0 ? (
              <div className={`rounded-md border p-2 ${
                ["no_match", "disabled", "no_categoria_hint"].includes(safeStr(assist.catalog_prefetch, "status", ""))
                  ? "border-amber-300/20 bg-amber-500/5"
                  : "border-white/10 bg-slate-950/40"
              }`}>
                <p className="text-[11px] text-slate-400">Catalog prefetch</p>
                <p className="text-xs">
                  {safeStr(assist.catalog_prefetch, "status")} · {safeStr(assist.catalog_prefetch, "strategy", "n/a")} · {safeNum(assist.catalog_prefetch, "row_count")} rows
                </p>
                {safeStr(assist.catalog_prefetch, "categoria_hint", "") ? (
                  <p className="text-[11px] text-slate-500">hint: {safeStr(assist.catalog_prefetch, "categoria_hint")}</p>
                ) : null}
                {safeStr(assist.catalog_prefetch, "status") === "no_match" ? (
                  <p className="mt-1 text-[11px] text-amber-200">
                    Sin match fuzzy: el backend cae a lookup puntual por SKU. Revisa normalización de categorías.
                  </p>
                ) : null}
              </div>
            ) : null}

            <CandidateSignals candidates={assist.per_candidate} />
            <OrderCompare title="Reorden real" before={assist.order_before} after={assist.order_after} />

            {assist.shadow ? (
              <div className="space-y-2 rounded-md border border-violet-300/20 bg-violet-500/5 p-2">
                <p className="text-[11px] font-semibold text-violet-200">Auditoría paralela</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                    <p className="text-[11px] text-slate-400">shadow gate</p>
                    <p className="text-sm">{assist.shadow.gate_reason || "-"}</p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                    <p className="text-[11px] text-slate-400">ran / would_reorder</p>
                    <p className="text-sm">{assist.shadow.ran ? "Sí" : "No"} / {assist.shadow.would_reorder ? "Sí" : "No"}</p>
                  </div>
                </div>
                <AssistMotorBlock title="Shadow vision" motor={assist.shadow.vision} />
                <AssistMotorBlock title="Shadow OCR" motor={assist.shadow.ocr} />
                <CandidateSignals candidates={assist.shadow.per_candidate} />
                <OrderCompare
                  title="Shadow contrafactual"
                  before={assist.shadow.order_before}
                  after={assist.shadow.order_hypothetical}
                  tone="violet"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function ObservedAssistSummary({ observed }: { observed: ShelfOcrSkuAssistSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <CounterCard label="Assist ran" value={observed.total_ocr_assist_ran} tone={observed.total_ocr_assist_ran > 0 ? "cyan" : "default"} />
        <CounterCard label="Reordenados" value={observed.total_ocr_assist_reordered} tone={observed.total_ocr_assist_reordered > 0 ? "emerald" : "default"} />
      </div>

      {Object.keys(observed.assist_engine_breakdown).length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(observed.assist_engine_breakdown).map(([engine, count]) => (
            <CounterCard key={engine} label={`Motor ${shelfAssistEngineLabel(engine)}`} value={count} tone="cyan" />
          ))}
        </div>
      ) : null}

      {Object.keys(observed.ocr_assist_gate_reasons).length > 0 ? (
        <div>
          <p className="mb-1 text-[11px] font-medium text-slate-400">Gate reasons</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(observed.ocr_assist_gate_reasons).map(([reason, count]) => (
              <CounterCard key={reason} label={reason.replace(/_/g, " ")} value={count} tone="cyan" />
            ))}
          </div>
        </div>
      ) : null}

      {(observed.total_shadow_assist_ran > 0 || Object.keys(observed.shadow_engine_breakdown).length > 0) ? (
        <div className="space-y-2 rounded-md border border-violet-300/20 bg-violet-500/5 p-2">
          <p className="text-[11px] font-semibold text-violet-200">Auditoría paralela</p>
          <div className="grid grid-cols-2 gap-2">
            <CounterCard label="Shadow ran" value={observed.total_shadow_assist_ran} tone="violet" hint="No altera resultado" />
            <CounterCard label="Habría reordenado" value={observed.total_shadow_would_reorder} tone="amber" hint="Contrafactual" />
            {Object.entries(observed.shadow_engine_breakdown).map(([engine, count]) => (
              <CounterCard key={engine} label={`Shadow ${shelfAssistEngineLabel(engine)}`} value={count} tone="violet" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ShelfAssistEngineUsedCard({ snapshot }: { snapshot: ShelfAssistEngineUsedEvent | null | undefined }) {
  if (!snapshot) return null;

  const configured = snapshot.configured;
  const observed = snapshot.observed;

  return (
    <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            <p className="text-sm font-semibold text-slate-100">Motor de asistencia SKU</p>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Evento <span className="font-mono text-cyan-200">shelf.assist_engine_used</span>
            {snapshot.processing_mode ? ` · modo ${snapshot.processing_mode}` : ""}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {snapshot.source === "job_event" ? "job event" : snapshot.source === "result_summary" ? "summary fallback" : "assist snapshot"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Configurado</p>
          {configured ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant={configured.enabled ? "default" : "secondary"}>
                  {configured.enabled ? "Assist activo" : "Assist apagado"}
                </Badge>
                {configured.engine ? (
                  <Badge variant="outline" className="border-cyan-300/30 text-cyan-200">
                    {shelfAssistEngineLabel(configured.engine)}
                  </Badge>
                ) : null}
                {configured.shadow_engine ? (
                  <Badge variant="outline" className="border-violet-300/30 text-violet-200">
                    {shelfShadowEngineLabel(configured.shadow_engine)}
                  </Badge>
                ) : (
                  <Badge variant="outline">Sin auditoría paralela</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                  <p className="text-[11px] text-slate-500">only_when_ambiguous</p>
                  <p>{configured.only_when_ambiguous === undefined ? "-" : configured.only_when_ambiguous ? "Sí" : "No"}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                  <p className="text-[11px] text-slate-500">apply_to_top_k</p>
                  <p>{configured.apply_to_top_k ?? "-"}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">Sin bloque configured en el evento.</p>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Observado en la corrida</p>
          {observed ? (
            <ObservedAssistSummary observed={observed} />
          ) : (
            <p className="text-xs text-slate-500">Sin bloque observed en el evento.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ShelfConfigSnapshot({ data }: { data: Record<string, unknown> }) {
  const imageArtifacts = safeObj(data, "image_artifacts");
  const auditContext = safeObj(imageArtifacts, "audit_context");
  if (!Object.keys(auditContext).length) return null;

  const qualityConfig = safeObj(auditContext, "quality_config");
  const ocrConfig = safeObj(auditContext, "ocr_sku_assist_config");
  const hasQuality = Object.keys(qualityConfig).length > 0;
  const hasOcr = Object.keys(ocrConfig).length > 0;

  if (!hasQuality && !hasOcr) return null;

  const engine = safeStr(ocrConfig, "engine", "");
  const shadowEngine = ocrConfig.shadow_engine === null ? null : safeStr(ocrConfig, "shadow_engine", "");

  return (
    <details className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-100">
        Config snapshot (audit_context)
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {hasQuality && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">Quality config</p>
            <div className="space-y-1">
              {Object.entries(qualityConfig).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs">
                  <span className="text-slate-400">{k}</span>
                  <span className="font-mono">{typeof v === "number" ? v.toFixed(3) : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasOcr && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">OCR SKU Assist config</p>
            <div className="flex flex-wrap gap-2">
              {engine ? <Badge variant="outline">{shelfAssistEngineLabel(engine)}</Badge> : null}
              {shadowEngine ? (
                <Badge variant="outline" className="border-violet-300/30 text-violet-200">
                  {shelfShadowEngineLabel(shadowEngine)}
                </Badge>
              ) : null}
            </div>
            <div className="space-y-1">
              {Object.entries(ocrConfig).map(([k, v]) => {
                if (k === "score_boost" && v && typeof v === "object") {
                  return (
                    <div key={k} className="space-y-1">
                      <p className="text-[11px] text-slate-500">score_boost</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(v as Record<string, unknown>).map(([bk, bv]) => (
                          <Badge key={bk} variant="outline" className="text-[10px]">
                            {bk}: {typeof bv === "number" ? bv.toFixed(2) : String(bv)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (k === "vision" && v && typeof v === "object") {
                  return (
                    <details key={k} className="rounded-md border border-white/10 bg-black/20 p-2">
                      <summary className="cursor-pointer text-[11px] text-slate-400">vision</summary>
                      <div className="mt-2 space-y-1">
                        {Object.entries(v as Record<string, unknown>).map(([vk, vv]) => (
                          <div key={vk} className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">{vk}</span>
                            <span className="font-mono">{typeof vv === "number" ? vv : Array.isArray(vv) ? vv.join(", ") : String(vv ?? "-")}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                }
                return (
                  <div key={k} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-mono">{typeof v === "number" ? v : Array.isArray(v) ? v.join(", ") : String(v ?? "-")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

type JobEvent = {
  id: number | string;
  event_type: string;
  level: string;
  message: string;
  created_at?: string;
  payload?: unknown;
};
type JobMetric = { id: number | string; step: string; duration_ms: number };
type StepSummary = { count: number; total_ms: number; avg_ms: number; max_ms: number };

function eventIcon(level: string) {
  const l = level.toLowerCase();
  if (l === "error") return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
  if (l === "warning") return <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
}

function eventTypeTone(eventType: string): string {
  if (eventType.includes("assist_engine_used")) return "text-cyan-300";
  if (eventType.includes("unknown_sku")) return "text-red-300";
  if (eventType.includes("ambiguous")) return "text-amber-300";
  if (eventType.includes("low_crop_quality") || eventType.includes("low_quality")) return "text-amber-300";
  if (eventType.includes("missing") || eventType.includes("error") || eventType.includes("fail")) return "text-red-300";
  if (eventType.includes("done") || eventType.includes("completed")) return "text-emerald-300";
  return "text-slate-300";
}

export function ShelfEventsTimeline({
  events,
  metrics,
  summaryByStep,
}: {
  events: JobEvent[];
  metrics?: JobMetric[];
  summaryByStep?: Record<string, StepSummary>;
}) {
  const stepSummary = summaryByStep ?? (() => {
    if (!metrics?.length) return {};
    const map: Record<string, { count: number; total_ms: number; max_ms: number }> = {};
    for (const m of metrics) {
      const entry = map[m.step] ?? { count: 0, total_ms: 0, max_ms: 0 };
      entry.count += 1;
      entry.total_ms += m.duration_ms;
      entry.max_ms = Math.max(entry.max_ms, m.duration_ms);
      map[m.step] = entry;
    }
    const out: Record<string, StepSummary> = {};
    for (const [step, v] of Object.entries(map)) {
      out[step] = { ...v, avg_ms: v.count > 0 ? v.total_ms / v.count : 0 };
    }
    return out;
  })();

  const sortedSteps = Object.entries(stepSummary)
    .sort(([, a], [, b]) => b.total_ms - a.total_ms);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-semibold">Eventos clave</p>
        <div className="max-h-72 space-y-1 overflow-auto rounded border border-white/10 bg-black/20 p-2">
          {events.length === 0 && <p className="text-xs text-slate-400">Sin eventos.</p>}
          {events.map((ev) => {
            const isAssistEvent = ev.event_type === "shelf.assist_engine_used";
            return (
              <div key={`ev-${ev.id}`} className="border-b border-white/5 pb-2">
                <div className="flex items-start gap-2">
                  {eventIcon(ev.level)}
                  <div className="min-w-0 flex-1">
                    <span className={`font-mono text-xs ${eventTypeTone(ev.event_type)}`}>{ev.event_type}</span>
                    <p className="text-[11px] text-slate-400">{ev.message}</p>
                    {isAssistEvent ? (
                      <p className="mt-1 text-[10px] text-cyan-300/80">Ver card “Motor de asistencia SKU” arriba para configured / observed.</p>
                    ) : null}
                  </div>
                  <Badge
                    variant={ev.level.toLowerCase() === "error" ? "destructive" : ev.level.toLowerCase() === "warning" ? "secondary" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {ev.level}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Métricas por paso</p>
        <div className="max-h-72 overflow-auto rounded border border-white/10 bg-black/20 p-2">
          {sortedSteps.length === 0 && <p className="text-xs text-slate-400">Sin métricas.</p>}
          {sortedSteps.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-slate-400">
                  <th className="pb-1 pr-2">Paso</th>
                  <th className="pb-1 pr-2 text-right">Count</th>
                  <th className="pb-1 pr-2 text-right">Total</th>
                  <th className="pb-1 pr-2 text-right">Avg</th>
                  <th className="pb-1 text-right">Max</th>
                </tr>
              </thead>
              <tbody>
                {sortedSteps.map(([step, s]) => (
                  <tr key={step} className="border-t border-white/5">
                    <td className="py-1 pr-2 font-mono text-slate-300">
                      <div className="flex items-center gap-1">
                        {s.total_ms > 5000 ? <Clock className="h-3 w-3 text-amber-400" /> : <Zap className="h-3 w-3 text-emerald-400" />}
                        {step}
                      </div>
                    </td>
                    <td className="py-1 pr-2 text-right">{s.count}</td>
                    <td className="py-1 pr-2 text-right">{s.total_ms.toFixed(0)}ms</td>
                    <td className="py-1 pr-2 text-right">{s.avg_ms.toFixed(0)}ms</td>
                    <td className="py-1 text-right">{s.max_ms.toFixed(0)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}