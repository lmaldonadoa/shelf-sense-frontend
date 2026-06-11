"use client";

import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ShieldAlert, Clock, Zap } from "lucide-react";

type CounterCardProps = {
  label: string;
  value: string | number;
  tone?: "default" | "amber" | "cyan" | "red" | "emerald";
};

function CounterCard({ label, value, tone = "default" }: CounterCardProps) {
  const border =
    tone === "amber" ? "border-amber-300/20" :
    tone === "red" ? "border-red-400/20" :
    tone === "cyan" ? "border-cyan-300/20" :
    tone === "emerald" ? "border-emerald-300/20" :
    "border-white/10";
  const bg =
    tone === "amber" ? "bg-amber-500/5" :
    tone === "red" ? "bg-red-500/5" :
    tone === "cyan" ? "bg-cyan-500/5" :
    tone === "emerald" ? "bg-emerald-500/5" :
    "bg-black/20";
  return (
    <div className={`rounded-lg border ${border} ${bg} p-3`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
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

// ---------- ShelfAuditSummary ----------

export function ShelfAuditSummary({ data }: { data: Record<string, unknown> }) {
  const summary = safeObj(data, "summary");
  if (!Object.keys(summary).length) return null;

  const totalResults = safeNum(summary, "total_results");
  const totalLowQuality = safeNum(summary, "total_low_quality_crops");
  const totalPenaltyApplied = safeNum(summary, "total_low_quality_penalty_applied");
  const totalReviewRequired = safeNum(summary, "total_review_required");
  const totalOcrRan = safeNum(summary, "total_ocr_assist_ran");
  const totalOcrReordered = safeNum(summary, "total_ocr_assist_reordered");

  const confidenceStates = safeObj(summary, "confidence_states");
  const ocrGateReasons = safeObj(summary, "ocr_assist_gate_reasons");

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-100">Resumen de auditoría</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <CounterCard label="Total crops" value={totalResults} />
        <CounterCard label="Low quality" value={totalLowQuality} tone={totalLowQuality > 0 ? "amber" : "default"} />
        <CounterCard label="Penalty aplicado" value={totalPenaltyApplied} tone={totalPenaltyApplied > 0 ? "amber" : "default"} />
        <CounterCard label="Review requerido" value={totalReviewRequired} tone={totalReviewRequired > 0 ? "red" : "default"} />
        <CounterCard label="OCR assist ran" value={totalOcrRan} tone={totalOcrRan > 0 ? "cyan" : "default"} />
        <CounterCard label="OCR reordenados" value={totalOcrReordered} tone={totalOcrReordered > 0 ? "emerald" : "default"} />
      </div>

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

      {Object.keys(ocrGateReasons).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-400">OCR gate reasons</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(ocrGateReasons).map(([reason, count]) => (
              <CounterCard key={reason} label={reason.replace(/_/g, " ")} value={typeof count === "number" ? count : 0} tone="cyan" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- ShelfCropAuditDetail ----------

export function ShelfCropAuditDetail({ result, defaultOpen = false }: { result: Record<string, unknown>; defaultOpen?: boolean }) {
  const quality = safeObj(result, "quality");
  const ocrAssist = safeObj(result, "ocr_sku_assist");
  const hasQuality = Object.keys(quality).length > 0;
  const hasOcr = Object.keys(ocrAssist).length > 0;

  if (!hasQuality && !hasOcr) return null;

  const cropId = safeStr(result, "crop_id", "crop");
  const isLowQuality = safe(quality, "is_low_quality") === true;
  const ocrRan = safe(ocrAssist, "ran") === true;
  const ocrReordered = safe(ocrAssist, "reordered") === true;

  return (
    <details className="rounded-lg border border-white/10 bg-black/20 p-3" open={defaultOpen}>
      <summary className="cursor-pointer">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-100">{cropId} — Audit</span>
          {isLowQuality && <Badge variant="secondary">Low quality</Badge>}
          {ocrRan && <Badge variant="outline" className="border-cyan-300/30 text-cyan-200">OCR ran</Badge>}
          {ocrReordered && <Badge className="bg-emerald-600">Reordenado</Badge>}
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

        {hasOcr && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-400">OCR SKU Assist</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                <p className="text-[11px] text-slate-400">gate_reason</p>
                <p className="text-sm">{safeStr(ocrAssist, "gate_reason")}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                <p className="text-[11px] text-slate-400">ran / reordered</p>
                <p className="text-sm">{ocrRan ? "Sí" : "No"} / {ocrReordered ? "Sí" : "No"}</p>
              </div>
            </div>

            {ocrRan && (() => {
              const ocr = safeObj(ocrAssist, "ocr");
              return (
                <div className="rounded-md border border-cyan-300/20 bg-cyan-500/5 p-2">
                  <p className="text-[11px] text-slate-400">OCR result</p>
                  <p className="mt-1 text-xs">{safeStr(ocr, "text_preview", "(sin texto)")}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {safeStr(ocr, "model")} · {safeNum(ocr, "duration_ms")}ms · {safeStr(ocr, "status")}
                  </p>
                </div>
              );
            })()}

            {(() => {
              const prefetch = safeObj(ocrAssist, "catalog_prefetch");
              if (!Object.keys(prefetch).length) return null;
              return (
                <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                  <p className="text-[11px] text-slate-400">Catalog prefetch</p>
                  <p className="text-xs">
                    {safeStr(prefetch, "status")} · {safeStr(prefetch, "strategy", "n/a")} · {safeNum(prefetch, "row_count")} rows
                  </p>
                  {safeStr(prefetch, "categoria_hint", "") && (
                    <p className="text-[11px] text-slate-500">hint: {safeStr(prefetch, "categoria_hint")}</p>
                  )}
                </div>
              );
            })()}

            {safeArr(ocrAssist, "per_candidate").length > 0 && (
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-2">
                <p className="mb-1 text-[11px] text-slate-400">Per-candidate signals</p>
                <div className="space-y-1">
                  {safeArr(ocrAssist, "per_candidate").map((c, i) => {
                    const cand = c as Record<string, unknown>;
                    const delta = safeNum(cand, "delta");
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="font-mono text-slate-300">#{safeNum(cand, "rank_before")}</span>
                        <span>{safeStr(cand, "sku_id")}</span>
                        <span className={delta > 0 ? "text-emerald-300" : delta < 0 ? "text-red-300" : "text-slate-400"}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                        </span>
                        {safeArr(cand, "signals").map((s, j) => (
                          <Badge key={j} variant={String(s).includes("conflict") ? "destructive" : "outline"} className="text-[10px] px-1 py-0">
                            {String(s)}
                          </Badge>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ocrReordered && safeArr(ocrAssist, "order_before").length > 0 && (
              <div className="rounded-md border border-emerald-300/20 bg-emerald-500/5 p-2">
                <p className="text-[11px] text-slate-400">Reorden</p>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-slate-500">Antes</p>
                    {safeArr(ocrAssist, "order_before").slice(0, 5).map((s, i) => (
                      <p key={i} className="font-mono text-slate-300">{i + 1}. {String(s)}</p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Después</p>
                    {safeArr(ocrAssist, "order_after").slice(0, 5).map((s, i) => (
                      <p key={i} className="font-mono text-slate-100">{i + 1}. {String(s)}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

// ---------- ShelfConfigSnapshot ----------

export function ShelfConfigSnapshot({ data }: { data: Record<string, unknown> }) {
  const imageArtifacts = safeObj(data, "image_artifacts");
  const auditContext = safeObj(imageArtifacts, "audit_context");
  if (!Object.keys(auditContext).length) return null;

  const qualityConfig = safeObj(auditContext, "quality_config");
  const ocrConfig = safeObj(auditContext, "ocr_sku_assist_config");
  const hasQuality = Object.keys(qualityConfig).length > 0;
  const hasOcr = Object.keys(ocrConfig).length > 0;

  if (!hasQuality && !hasOcr) return null;

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

// ---------- ShelfEventsTimeline ----------

type JobEvent = { id: number | string; event_type: string; level: string; message: string; created_at?: string };
type JobMetric = { id: number | string; step: string; duration_ms: number };
type StepSummary = { count: number; total_ms: number; avg_ms: number; max_ms: number };

function eventIcon(level: string) {
  const l = level.toLowerCase();
  if (l === "error") return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
  if (l === "warning") return <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
}

function eventTypeTone(eventType: string): string {
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
          {events.map((ev) => (
            <div key={`ev-${ev.id}`} className="flex items-start gap-2 border-b border-white/5 pb-1">
              {eventIcon(ev.level)}
              <div className="min-w-0 flex-1">
                <span className={`font-mono text-xs ${eventTypeTone(ev.event_type)}`}>{ev.event_type}</span>
                <p className="text-[11px] text-slate-400">{ev.message}</p>
              </div>
              <Badge
                variant={ev.level.toLowerCase() === "error" ? "destructive" : ev.level.toLowerCase() === "warning" ? "secondary" : "outline"}
                className="shrink-0 text-[10px]"
              >
                {ev.level}
              </Badge>
            </div>
          ))}
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
