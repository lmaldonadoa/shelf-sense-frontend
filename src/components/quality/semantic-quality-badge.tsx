"use client";

import { AlertTriangle, CheckCircle2, AlertCircle, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type QualityMetrics = {
  cross_product_errors?: {
    summary?: {
      high_severity: number;
      medium_severity: number;
      low_severity: number;
    };
  };
  llm_drift?: {
    drift_detected: boolean;
    drift_ratio: number;
    severity: "low" | "medium" | "high";
  };
  rag_feedback?: {
    rules_applied: number;
    effectiveness_ratio: number;
  };
};

type Props = {
  metrics?: QualityMetrics;
  expanded?: boolean;
};

export function SemanticQualityBadge({ metrics, expanded = false }: Props) {
  if (!metrics) {
    return null;
  }

  const hasHighSeverityErrors =
    (metrics.cross_product_errors?.summary?.high_severity ?? 0) > 0;
  const hasLlmDrift = metrics.llm_drift?.drift_detected ?? false;
  const lowRagEffectiveness =
    (metrics.rag_feedback?.effectiveness_ratio ?? 1) < 0.4;

  const allOk = !hasHighSeverityErrors && !hasLlmDrift && !lowRagEffectiveness;

  if (allOk && !expanded) {
    return (
      <Badge className="gap-2 bg-green-900 text-green-100">
        <CheckCircle2 className="h-3 w-3" />
        Calidad OK
      </Badge>
    );
  }

  if (!expanded) {
    if (hasHighSeverityErrors) {
      return (
        <Badge variant="destructive" className="gap-2">
          <AlertTriangle className="h-3 w-3" />
          Revisar datos
        </Badge>
      );
    }
    if (hasLlmDrift) {
      return (
        <Badge className="gap-2 bg-orange-900 text-orange-100">
          <AlertCircle className="h-3 w-3" />
          OCR comprometido
        </Badge>
      );
    }
  }

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Calidad Semántica</span>
          {allOk ? (
            <Badge className="gap-2 bg-green-900 text-green-100">
              <CheckCircle2 className="h-3 w-3" />
              OK
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-2">
              <AlertTriangle className="h-3 w-3" />
              Revisar
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Cross-product errors */}
        <div className="flex items-start justify-between rounded border border-white/10 bg-white/3 p-2">
          <div>
            <p className="font-semibold">Errores Cross-Product</p>
            <p className="text-xs text-white/60">
              {hasHighSeverityErrors
                ? `⚠️ ${metrics.cross_product_errors?.summary?.high_severity ?? 0} críticos detectados`
                : "✅ Sin errores"}
            </p>
          </div>
        </div>

        {/* LLM Drift */}
        <div className="flex items-start justify-between rounded border border-white/10 bg-white/3 p-2">
          <div>
            <p className="font-semibold">Alineación LLM</p>
            {hasLlmDrift ? (
              <p className="text-xs text-white/60">
                <TrendingDown className="inline h-3 w-3 text-orange-400" /> Ratio:{" "}
                {(metrics.llm_drift?.drift_ratio ?? 0 * 100).toFixed(1)}%
              </p>
            ) : (
              <p className="text-xs text-white/60">✅ Alineado</p>
            )}
          </div>
        </div>

        {/* RAG Feedback */}
        {metrics.rag_feedback && (
          <div className="flex items-start justify-between rounded border border-white/10 bg-white/3 p-2">
            <div>
              <p className="font-semibold">Reglas RAG</p>
              <p className="text-xs text-white/60">
                {metrics.rag_feedback.rules_applied}x aplicadas (efectividad:{" "}
                {(metrics.rag_feedback.effectiveness_ratio * 100).toFixed(1)}%)
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
