"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, HelpCircle, RefreshCcw, Scale } from "lucide-react";
import type { PrimaryCrop, PromotionCardinality } from "@/types/ocr-api";
import {
  findPrimaryCropByName,
  formatPromotionMetric,
  resolvePromotionCardinalityVisualState,
} from "@/lib/promotion-cardinality";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CropLink = {
  crop: string;
  href?: string | null;
  label?: string;
};

type Props = {
  cardinality: PromotionCardinality | null | undefined;
  primaryCrops?: PrimaryCrop[];
  showReviewBadge?: boolean;
  compact?: boolean;
  onReprocessSuggested?: () => void;
  reprocessPending?: boolean;
  className?: string;
};

function MetricTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function buildCropLinks(cardinality: PromotionCardinality, primaryCrops?: PrimaryCrop[]): CropLink[] {
  const crops = cardinality.missing_promotion_crops ?? [];
  return crops.map((crop) => {
    const match = findPrimaryCropByName(primaryCrops, crop);
    return {
      crop,
      href: match?.crop_url ?? match?.download_url ?? null,
      label: match?.crop_id ?? crop,
    };
  });
}

export function PromotionCardinalityCard({
  cardinality,
  primaryCrops,
  showReviewBadge = false,
  compact = false,
  onReprocessSuggested,
  reprocessPending = false,
  className,
}: Props) {
  const visualState = resolvePromotionCardinalityVisualState(cardinality);

  if (visualState === "unavailable") {
    return (
      <Card className={cn("border-white/10 bg-white/5 backdrop-blur", className)}>
        <CardHeader className={compact ? "pb-2" : undefined}>
          <CardTitle className={cn("flex items-center gap-2", compact ? "text-sm" : "text-base")}>
            <Scale className="h-4 w-4 text-slate-400" />
            Consistencia promociones / productos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-300">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div>
              <p className="font-medium text-slate-200">Consistencia no disponible para este job</p>
              <p className="mt-1 text-xs text-slate-500">
                Este resultado es histórico o aún no incluye el contrato de cardinalidad. El conteo legacy se mantiene abajo.
              </p>
            </div>
          </div>
          {onReprocessSuggested ? (
            <Button size="sm" variant="outline" onClick={onReprocessSuggested} disabled={reprocessPending}>
              {reprocessPending ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Reprocesar con regla nueva
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const cropLinks = buildCropLinks(cardinality!, primaryCrops);
  const detected = cardinality?.detected_promotions;
  const promotionsWithProduct = cardinality?.promotions_with_product;
  const hasPromotionWithoutProduct = cardinality?.review_reasons?.includes("promotion_without_product");

  const statusBanner = (() => {
    if (visualState === "one_to_one") {
      return {
        tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
        icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
        title: "Consistencia correcta",
        body: "Cada etiqueta promocional detectada tiene un producto final.",
      };
    }
    if (visualState === "corrected_to_one_to_one") {
      return {
        tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
        icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
        title: "Duplicados corregidos automáticamente",
        body: "El backend encontró más de una fila en una misma etiqueta y conservó el producto con mejor evidencia.",
      };
    }
    if (visualState === "mismatch") {
      return {
        tone: "border-amber-400/35 bg-amber-500/10 text-amber-100",
        icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
        title: hasPromotionWithoutProduct ? "Faltan productos por reconocer" : "Inconsistencia detectada",
        body: hasPromotionWithoutProduct
          ? `Se detectaron ${formatPromotionMetric(detected)} etiquetas promocionales, pero solo ${formatPromotionMetric(promotionsWithProduct)} tienen un producto confiable. El backend no creó productos ficticios.`
          : "El resultado requiere revisión humana antes de confiar en la cardinalidad promoción → producto.",
      };
    }
    if (visualState === "unverifiable_no_primary_promotions") {
      return {
        tone: "border-white/10 bg-black/20 text-slate-300",
        icon: <HelpCircle className="h-4 w-4 shrink-0 text-slate-500" />,
        title: "Consistencia no verificable",
        body: "El detector no generó crops primarios de promociones. El resultado puede provenir del análisis de imagen completa o de evidencia de soporte.",
      };
    }
    return {
      tone: "border-white/10 bg-black/20 text-slate-300",
      icon: <HelpCircle className="h-4 w-4 shrink-0 text-slate-500" />,
      title: "Estado de consistencia",
      body: `Estado reportado: ${String(cardinality?.status ?? "desconocido")}`,
    };
  })();

  return (
    <Card className={cn("border-white/10 bg-white/5 backdrop-blur", className)}>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className={cn("flex items-center gap-2", compact ? "text-sm" : "text-base")}>
            <Scale className="h-4 w-4 text-cyan-300" />
            Consistencia promociones / productos
          </CardTitle>
          {showReviewBadge ? <Badge variant="secondary" className="border-amber-400/35 bg-amber-500/15 text-amber-100">Requiere revisión</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm", statusBanner.tone)}>
          {statusBanner.icon}
          <div>
            <p className="font-medium">{statusBanner.title}</p>
            <p className="mt-1 text-xs opacity-90">{statusBanner.body}</p>
          </div>
        </div>

        {visualState === "unverifiable_no_primary_promotions" ? (
          <p className="text-sm text-slate-400">No verificable</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricTile label="Promociones detectadas" value={formatPromotionMetric(detected)} />
            <MetricTile label="Productos esperados" value={formatPromotionMetric(cardinality?.expected_products)} />
            <MetricTile label="Productos finales" value={formatPromotionMetric(cardinality?.products_after)} />
            <MetricTile label="Promociones con producto" value={formatPromotionMetric(promotionsWithProduct)} />
            <MetricTile label="Filas consolidadas" value={formatPromotionMetric(cardinality?.removed)} />
          </div>
        )}

        {visualState === "corrected_to_one_to_one" && (cardinality?.decisions?.length ?? 0) > 0 ? (
          <details className="rounded-lg border border-white/10 bg-black/20 p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-200">
              <ChevronDown className="h-4 w-4" />
              Auditoría de filas descartadas ({cardinality?.decisions?.length ?? 0})
            </summary>
            <div className="mt-3 space-y-3">
              {cardinality?.decisions?.map((decision) => (
                <div key={`${decision.crop}-${decision.winner}`} className="rounded-md border border-white/8 bg-black/25 p-3 text-xs text-slate-300">
                  <p><span className="text-slate-500">Etiqueta:</span> {decision.crop}</p>
                  <p className="mt-1"><span className="text-slate-500">Producto conservado:</span> {decision.winner}</p>
                  <p className="mt-1">
                    <span className="text-slate-500">Filas descartadas:</span>{" "}
                    {decision.removed_products.length ? decision.removed_products.join(", ") : "-"}
                  </p>
                  <p className="mt-1 text-slate-500">Motivo: una etiqueta promocional debe producir un solo producto</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        {visualState === "mismatch" && cropLinks.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-400/25 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Etiquetas sin producto confiable</p>
            <ul className="space-y-1.5 text-sm">
              {cropLinks.map((link) => (
                <li key={link.crop} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-amber-50">{link.crop}</span>
                  {link.href ? (
                    <a href={link.href} target="_blank" rel="noreferrer" className="text-xs text-cyan-200 underline">
                      Ver crop ({link.label})
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500">Sin preview de crop en artifacts</span>
                  )}
                </li>
              ))}
            </ul>
            {onReprocessSuggested ? (
              <div className="pt-2">
                <p className="mb-2 text-xs text-amber-100/90">Acción recomendada: revisar OCR o reprocesar imagen.</p>
                <Button size="sm" variant="outline" className="border-amber-400/30" onClick={onReprocessSuggested} disabled={reprocessPending}>
                  {reprocessPending ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                  Revisar OCR o reprocesar imagen
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {cardinality?.review_reasons?.length ? (
          <div className="text-xs text-slate-500">
            <span className="font-medium text-slate-400">review_reasons:</span> {cardinality.review_reasons.join(", ")}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}