"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TrainingCountBadge,
  TrainingFooterNote,
  TrainingListShell,
  TrainingSectionHero,
} from "@/components/training/training-ui";

type Props = { account: string };

function getPrecisionColor(ratio: number) {
  if (ratio >= 0.85) return "text-emerald-300";
  if (ratio >= 0.7) return "text-amber-300";
  return "text-rose-300";
}

export function RagEffectivenessPage({ account }: Props) {
  const [accountName] = useState(account);
  const [periodDays, setPeriodDays] = useState("30");

  const metricsQuery = useQuery({
    queryKey: ["semantic-knowledge-metrics", accountName, periodDays],
    queryFn: () => {
      const days = Number(periodDays) || 30;
      const now = new Date();
      const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return ocrApi.getSemanticKnowledgeMetrics(accountName, {
        createdFrom: from.toISOString(),
        createdTo: now.toISOString(),
        limitJobs: 200,
      });
    },
  });

  const rules = metricsQuery.isError ? [] : (metricsQuery.data?.rules ?? []);
  const chains = metricsQuery.isError ? [] : (metricsQuery.data?.chains ?? []);
  const summary = metricsQuery.data?.summary;

  const avgPrecision = useMemo(() => {
    if (!rules.length) return 0;
    return rules.reduce((sum, row) => sum + row.precision_est, 0) / rules.length;
  }, [rules]);

  const loadErrorMessage =
    metricsQuery.error instanceof HttpError
      ? metricsQuery.error.message
      : metricsQuery.isError
        ? "No se pudieron cargar las metricas de efectividad RAG."
        : null;

  return (
    <div className="space-y-4">
      <TrainingSectionHero
        tone="violet"
        icon={<TrendingUp className="h-4 w-4" />}
        title="Efectividad RAG"
        description="Metricas agregadas desde GET /semantic-knowledge/metrics: precision estimada, aplicaciones y bloqueos por regla."
        badges={
          <>
            <Badge variant="outline" className="text-[10px]">
              ventana: {periodDays} dias
            </Badge>
            <TrainingCountBadge count={rules.length} label="regla" tone="violet" />
            <TrainingCountBadge count={chains.length} label="cadena" tone="violet" />
          </>
        }
        kpis={[
          { label: "Productos", value: summary?.total_products ?? "—" },
          { label: "Reglas observadas", value: summary?.rules_observed ?? rules.length },
          { label: "Cadenas", value: summary?.chains_observed ?? chains.length },
          { label: "Precision media", value: rules.length ? `${(avgPrecision * 100).toFixed(1)}%` : "—" },
        ]}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32 space-y-2">
          <Label htmlFor="period-days">Periodo (dias)</Label>
          <Input
            id="period-days"
            type="number"
            min="1"
            max="90"
            value={periodDays}
            onChange={(e) => setPeriodDays(e.target.value)}
            className="h-9 bg-white/5 border-white/10"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => metricsQuery.refetch()}
          disabled={metricsQuery.isFetching}
        >
          {metricsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {loadErrorMessage ? (
        <div className="rounded-xl border border-rose-400/30 bg-rose-950/20 px-4 py-3 text-sm text-rose-200">
          {loadErrorMessage}
        </div>
      ) : null}

      <TrainingListShell
        loading={metricsQuery.isLoading}
        empty={!metricsQuery.isError && !rules.length}
        emptyMessage={
          metricsQuery.isError
            ? "Corrige el error de carga para ver las metricas."
            : "No hay datos de efectividad en la ventana seleccionada."
        }
      >
        <div className="sticky top-0 z-10 grid min-w-[760px] grid-cols-[minmax(180px,1.4fr)_72px_72px_72px_88px] items-center gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
          <span>Regla</span>
          <span className="text-right">Considerada</span>
          <span className="text-right">Aplicada</span>
          <span className="text-right">Bloqueada</span>
          <span className="text-right">Precision</span>
        </div>
        <div className="min-w-[760px] divide-y divide-white/5">
          {rules.map((metric) => (
            <div
              key={metric.rule}
              className="grid grid-cols-[minmax(180px,1.4fr)_72px_72px_72px_88px] items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03]"
            >
              <p className="truncate font-mono text-xs text-white" title={metric.rule}>
                {metric.rule}
              </p>
              <p className="text-right text-xs text-slate-300">{metric.considered}</p>
              <p className="text-right text-xs text-slate-300">{metric.applied}</p>
              <p className="text-right text-xs text-slate-300">{metric.blocked}</p>
              <p className={`text-right text-xs font-semibold ${getPrecisionColor(metric.precision_est)}`}>
                {(metric.precision_est * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </TrainingListShell>

      {chains.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-medium text-white">Metricas por cadena</p>
            <p className="text-xs text-slate-400">Filas procesadas y tasa de needs_review por cadena.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead>Cadena</TableHead>
                <TableHead className="text-right">Filas</TableHead>
                <TableHead className="text-right">Needs review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chains.map((chainMetric) => (
                <TableRow key={chainMetric.chain} className="border-white/10 hover:bg-white/5">
                  <TableCell className="font-mono text-sm">{chainMetric.chain}</TableCell>
                  <TableCell className="text-right text-sm">{chainMetric.rows}</TableCell>
                  <TableCell className="text-right text-sm">
                    {(chainMetric.needs_review_rate * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : !metricsQuery.isLoading && !metricsQuery.isError ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-400">
          <AlertCircle className="h-4 w-4" />
          Sin metricas por cadena en esta ventana.
        </div>
      ) : null}

      <TrainingFooterNote>
        Fuente: GET /v1/accounts/&#123;account&#125;/semantic-knowledge/metrics. La edicion de reglas sigue siendo POST /semantic-knowledge con id.
      </TrainingFooterNote>
    </div>
  );
}