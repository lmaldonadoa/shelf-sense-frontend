"use client";

import type { ShelfAssistEngine, ShelfOcrSkuAssistConfigDraft, ShelfShadowEngine } from "@/types/ocr-api";
import {
  DEFAULT_CATEGORIA_MATCH_STRATEGIES,
  shelfAssistEngineLabel,
  shelfShadowEngineLabel,
  usesVisionAssist,
} from "@/lib/shelf-ocr-sku-assist";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = {
  draft: ShelfOcrSkuAssistConfigDraft;
  dirty: boolean;
  saving: boolean;
  onChange: (updater: (current: ShelfOcrSkuAssistConfigDraft) => ShelfOcrSkuAssistConfigDraft) => void;
  onSave: () => void;
};

const selectClassName = "h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm";

export function ShelfOcrSkuAssistConfig({ draft, dirty, saving, onChange, onSave }: Props) {
  const showVision = usesVisionAssist(draft.engine, draft.shadow_engine);

  const patch = (partial: Partial<ShelfOcrSkuAssistConfigDraft>) => {
    onChange((current) => ({ ...current, ...partial }));
  };

  const patchVision = (partial: Partial<ShelfOcrSkuAssistConfigDraft["vision"]>) => {
    onChange((current) => ({ ...current, vision: { ...current.vision, ...partial } }));
  };

  return (
    <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">OCR SKU Assist</p>
          <p className="text-xs text-slate-300">
            Asistencia multimotor para reforzar el matching visual. Corre solo en <span className="font-mono">recognition</span> y en evaluate-crop.
            Es independiente de <span className="font-mono">analysis.glm_ocr</span> (informativo post-decisión).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={draft.enabled ? "default" : "secondary"}>{draft.enabled ? "Activo" : "Desactivado"}</Badge>
          {dirty ? <Badge variant="destructive">Sin guardar</Badge> : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
        <div className="space-y-1 pr-4">
          <Label htmlFor="ocr-assist-enabled" className="cursor-pointer text-sm font-medium">Habilitar OCR Assist</Label>
          <p className="text-[11px] text-slate-400">Maestro. Apagado = no se ejecuta ningún motor de assist en crops.</p>
        </div>
        <Switch
          id="ocr-assist-enabled"
          checked={draft.enabled}
          onCheckedChange={(value) => patch({ enabled: value })}
        />
      </div>

      {draft.enabled ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 rounded border border-white/10 bg-white/5 p-3">
              <Label htmlFor="ocr-assist-engine">Motor primario</Label>
              <select
                id="ocr-assist-engine"
                className={selectClassName}
                value={draft.engine}
                onChange={(e) => patch({ engine: e.target.value as ShelfAssistEngine })}
              >
                <option value="ocr">{shelfAssistEngineLabel("ocr")}</option>
                <option value="vision_llm">{shelfAssistEngineLabel("vision_llm")}</option>
                <option value="both">{shelfAssistEngineLabel("both")} (avanzado)</option>
              </select>
              <p className="text-[11px] text-slate-400">Define el ranking real. `both` combina OCR + vision.</p>
            </div>

            <div className="space-y-1 rounded border border-white/10 bg-white/5 p-3">
              <Label htmlFor="ocr-assist-shadow">Auditoría paralela</Label>
              <select
                id="ocr-assist-shadow"
                className={selectClassName}
                value={draft.shadow_engine ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  patch({ shadow_engine: (value || null) as ShelfShadowEngine });
                }}
              >
                <option value="">{shelfShadowEngineLabel(null)}</option>
                <option value="ocr">{shelfAssistEngineLabel("ocr")}</option>
                <option value="vision_llm">{shelfAssistEngineLabel("vision_llm")}</option>
              </select>
              <p className="text-[11px] text-slate-400">Opcional. No cambia el resultado final.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
              <div className="space-y-1 pr-4">
                <Label htmlFor="ocr-assist-ambiguous" className="cursor-pointer text-sm">Solo cuando ambiguo</Label>
                <p className="text-[11px] text-slate-400">ON = salta assist si top1 ya tiene high_confidence.</p>
              </div>
              <Switch
                id="ocr-assist-ambiguous"
                checked={draft.only_when_ambiguous}
                onCheckedChange={(value) => patch({ only_when_ambiguous: value })}
              />
            </div>
            <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
              <div className="space-y-1 pr-4">
                <Label htmlFor="ocr-assist-reorder" className="cursor-pointer text-sm">Reordenar top candidates</Label>
                <p className="text-[11px] text-slate-400">OFF = solo audita sin afectar el resultado real.</p>
              </div>
              <Switch
                id="ocr-assist-reorder"
                checked={draft.reorder_top_candidates}
                onCheckedChange={(value) => patch({ reorder_top_candidates: value })}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-3">
              <div className="space-y-1 pr-4">
                <Label htmlFor="ocr-assist-prefetch" className="cursor-pointer text-sm">Prefetch catalogo por categoria</Label>
                <p className="text-[11px] text-slate-400">Precarga shelf_skus filtrado por categoría fuzzy.</p>
              </div>
              <Switch
                id="ocr-assist-prefetch"
                checked={draft.prefetch_catalog_by_category}
                onCheckedChange={(value) => patch({ prefetch_catalog_by_category: value })}
              />
            </div>
            <div className="space-y-1 rounded border border-white/10 bg-white/5 p-3">
              <Label htmlFor="ocr-assist-topk">Top-K candidatos</Label>
              <Input
                id="ocr-assist-topk"
                type="number"
                min={1}
                max={10}
                value={draft.apply_to_top_k}
                onChange={(e) => patch({ apply_to_top_k: Number(e.target.value) || 3 })}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>

          <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-200">Score boost por señal OCR</p>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-1">
                <Label className="text-[11px]">barcode_exact</Label>
                <Input type="number" step="0.01" min={0} max={1} value={draft.score_boost_barcode_exact} onChange={(e) => patch({ score_boost_barcode_exact: Number(e.target.value) })} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">marca</Label>
                <Input type="number" step="0.01" min={0} max={1} value={draft.score_boost_marca} onChange={(e) => patch({ score_boost_marca: Number(e.target.value) })} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">tamano</Label>
                <Input type="number" step="0.01" min={0} max={1} value={draft.score_boost_tamano} onChange={(e) => patch({ score_boost_tamano: Number(e.target.value) })} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">variante</Label>
                <Input type="number" step="0.01" min={0} max={1} value={draft.score_boost_variante} onChange={(e) => patch({ score_boost_variante: Number(e.target.value) })} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">penalty conflicto</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={draft.score_penalty_on_conflict}
                  onChange={(e) => patch({ score_penalty_on_conflict: Number(e.target.value) })}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
          </div>

          <details className="rounded-lg border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-200">Parametros de velocidad OCR</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-[11px]">num_predict</Label>
                <Input type="number" min={32} max={512} value={draft.num_predict} onChange={(e) => patch({ num_predict: Number(e.target.value) || 128 })} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">num_ctx</Label>
                <Input type="number" min={256} max={4096} value={draft.num_ctx} onChange={(e) => patch({ num_ctx: Number(e.target.value) || 1024 })} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">timeout_sec</Label>
                <Input type="number" min={3} max={60} value={draft.timeout_sec} onChange={(e) => patch({ timeout_sec: Number(e.target.value) || 12 })} className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">min_text_chars</Label>
                <Input type="number" min={1} max={20} value={draft.min_text_chars} onChange={(e) => patch({ min_text_chars: Number(e.target.value) || 4 })} className="bg-white/5 border-white/10" />
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <Label className="text-[11px]">prefetch_max_rows</Label>
              <Input type="number" min={50} max={20000} value={draft.prefetch_max_rows} onChange={(e) => patch({ prefetch_max_rows: Number(e.target.value) || 2000 })} className="bg-white/5 border-white/10 max-w-xs" />
            </div>
          </details>

          {draft.prefetch_catalog_by_category ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold text-slate-200">Estrategias de match de categoría</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Orden de intento para prefetch fuzzy. Quitar una estrategia la desactiva sin tocar código.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {DEFAULT_CATEGORIA_MATCH_STRATEGIES.map((strategy) => {
                  const checked = draft.categoria_match_strategies.includes(strategy);
                  return (
                    <label key={strategy} className="flex items-center gap-2 rounded-md border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          const enabled = value === true;
                          const next = enabled
                            ? [...draft.categoria_match_strategies, strategy].filter(
                                (item, idx, arr) => arr.indexOf(item) === idx,
                              )
                            : draft.categoria_match_strategies.filter((item) => item !== strategy);
                          patch({
                            categoria_match_strategies: next.length
                              ? next.sort(
                                  (a, b) =>
                                    DEFAULT_CATEGORIA_MATCH_STRATEGIES.indexOf(a) -
                                    DEFAULT_CATEGORIA_MATCH_STRATEGIES.indexOf(b),
                                )
                              : [...DEFAULT_CATEGORIA_MATCH_STRATEGIES],
                          });
                        }}
                      />
                      <span className="font-mono text-xs">{strategy}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showVision ? (
            <details className="rounded-lg border border-violet-300/20 bg-violet-500/5 p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-slate-200">Vision LLM</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[11px]">timeout_sec</Label>
                  <Input type="number" min={5} max={120} value={draft.vision.timeout_sec} onChange={(e) => patchVision({ timeout_sec: Number(e.target.value) || 30 })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">num_ctx</Label>
                  <Input type="number" min={512} max={8192} value={draft.vision.num_ctx} onChange={(e) => patchVision({ num_ctx: Number(e.target.value) || 2048 })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">num_predict</Label>
                  <Input type="number" min={32} max={1024} value={draft.vision.num_predict} onChange={(e) => patchVision({ num_predict: Number(e.target.value) || 256 })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">max_retries</Label>
                  <Input type="number" min={0} max={5} value={draft.vision.max_retries} onChange={(e) => patchVision({ max_retries: Number(e.target.value) || 2 })} className="bg-white/5 border-white/10" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <div className="space-y-1">
                  <Label className="text-[11px]">marca</Label>
                  <Input type="number" step="0.01" min={0} max={1} value={draft.vision.score_boost_marca} onChange={(e) => patchVision({ score_boost_marca: Number(e.target.value) })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">tamano</Label>
                  <Input type="number" step="0.01" min={0} max={1} value={draft.vision.score_boost_tamano} onChange={(e) => patchVision({ score_boost_tamano: Number(e.target.value) })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">variante</Label>
                  <Input type="number" step="0.01" min={0} max={1} value={draft.vision.score_boost_variante} onChange={(e) => patchVision({ score_boost_variante: Number(e.target.value) })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">color</Label>
                  <Input type="number" step="0.01" min={0} max={1} value={draft.vision.score_boost_color} onChange={(e) => patchVision({ score_boost_color: Number(e.target.value) })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">tipo_envase</Label>
                  <Input type="number" step="0.01" min={0} max={1} value={draft.vision.score_boost_tipo_envase} onChange={(e) => patchVision({ score_boost_tipo_envase: Number(e.target.value) })} className="bg-white/5 border-white/10" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">score_penalty_on_conflict</Label>
                  <Input type="number" step="0.01" min={0} max={1} value={draft.vision.score_penalty_on_conflict} onChange={(e) => patchVision({ score_penalty_on_conflict: Number(e.target.value) })} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">max_total_boost</Label>
                  <Input type="number" step="0.01" min={0} max={1} value={draft.vision.max_total_boost} onChange={(e) => patchVision({ max_total_boost: Number(e.target.value) })} className="bg-white/5 border-white/10" />
                </div>
              </div>
            </details>
          ) : null}

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={!dirty || saving}>
              {saving ? "Guardando..." : "Guardar OCR Assist"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}