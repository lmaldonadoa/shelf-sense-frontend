"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { ProductDedupeConfig } from "@/types/ocr-api";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  TrainingFooterNote,
  TrainingFormCard,
  TrainingSectionHero,
} from "@/components/training/training-ui";

type Props = {
  account: string;
};

function readProductDedupe(config: Record<string, unknown> | undefined): ProductDedupeConfig {
  const textEnrichment =
    config?.text_enrichment && typeof config.text_enrichment === "object"
      ? (config.text_enrichment as Record<string, unknown>)
      : {};
  const productDedupe =
    textEnrichment.product_dedupe && typeof textEnrichment.product_dedupe === "object"
      ? (textEnrichment.product_dedupe as ProductDedupeConfig)
      : {};
  return productDedupe;
}

export function PromotionProductDedupeEditor({ account }: Props) {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["promotions-config", account],
    queryFn: () => ocrApi.getPromotionsConfig(account),
  });

  const productDedupe = useMemo(() => readProductDedupe(configQuery.data), [configQuery.data]);

  const patchMutation = useMutation({
    mutationFn: async (patch: ProductDedupeConfig) =>
      ocrApi.patchPromotionsConfig(account, {
        text_enrichment: {
          product_dedupe: patch,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promotions-config", account] });
      toast.success("Guardrails de cardinalidad actualizados");
    },
    onError: (error) => {
      toast.error("No se pudo guardar la configuración", {
        description: error instanceof HttpError ? error.message : "Error inesperado",
      });
    },
  });

  function patchFlag(field: keyof ProductDedupeConfig, value: boolean) {
    patchMutation.mutate({ [field]: value });
  }

  const blockCrossMerge = productDedupe.block_cross_primary_promotion_crop_merge ?? true;
  const oneProductEnabled = productDedupe.one_product_per_primary_promotion_enabled ?? true;
  const strategy = productDedupe.one_product_per_primary_promotion_strategy ?? "best_evidence";

  return (
    <div className="space-y-4">
      <TrainingSectionHero
        tone="violet"
        icon={<Scale className="h-5 w-5" />}
        title="Deduplicación y cardinalidad"
        description="Guardrails operacionales que garantizan una etiqueta promocional → un producto. No mezclar con frases ignoradas, aliases ni ruido OCR."
        badges={
          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-violet-100">
            text_enrichment.product_dedupe
          </span>
        }
      />

      {configQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando configuración de promociones…
        </div>
      ) : configQuery.error ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          No se pudo cargar promotions/config.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <TrainingFormCard tone="violet" title="Bloquear fusión entre etiquetas distintas">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm text-slate-300">
                  Dos crops promocionales representan dos promociones independientes, aunque lean el mismo producto.
                </p>
                <p className="font-mono text-[11px] text-slate-500">block_cross_primary_promotion_crop_merge</p>
              </div>
              <Switch
                checked={blockCrossMerge}
                disabled={patchMutation.isPending}
                onCheckedChange={(checked) => patchFlag("block_cross_primary_promotion_crop_merge", checked)}
              />
            </div>
          </TrainingFormCard>

          <TrainingFormCard tone="violet" title="Un producto por etiqueta promocional">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm text-slate-300">
                  Si una etiqueta genera varias filas, conserva la de mejor evidencia y audita las descartadas.
                </p>
                <p className="font-mono text-[11px] text-slate-500">one_product_per_primary_promotion_enabled</p>
              </div>
              <Switch
                checked={oneProductEnabled}
                disabled={patchMutation.isPending}
                onCheckedChange={(checked) => patchFlag("one_product_per_primary_promotion_enabled", checked)}
              />
            </div>
          </TrainingFormCard>

          <TrainingFormCard tone="violet" title="Estrategia de selección" className="lg:col-span-2">
            <div className="space-y-2">
              <Label htmlFor="promotion-dedupe-strategy" className="text-slate-400">
                one_product_per_primary_promotion_strategy
              </Label>
              <Input
                id="promotion-dedupe-strategy"
                value={strategy}
                readOnly
                className="max-w-xs border-white/10 bg-black/25 font-mono text-sm"
              />
              <p className="text-xs text-slate-500">Solo lectura mientras el backend no exponga otras estrategias.</p>
            </div>
          </TrainingFormCard>
        </div>
      )}

      <TrainingFooterNote>
        Cada cambio envía un PATCH parcial con deep merge. El resto de <code className="text-cyan-200">text_enrichment</code> se conserva.
      </TrainingFooterNote>
    </div>
  );
}