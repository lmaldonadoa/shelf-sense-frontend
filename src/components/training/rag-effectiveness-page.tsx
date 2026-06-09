"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, AlertCircle } from "lucide-react";
import { ocrApi } from "@/lib/ocrApi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { account: string };

type RagEffectivenessMetric = {
  rule_id: string;
  rule_title: string;
  times_applied: number;
  times_matched_shadow: number;
  effectiveness_ratio: number;
  cadenas: string[];
  status: "active" | "paused" | "deprecated";
};

export function RagEffectivenessPage({ account }: Props) {
  const [accountName] = useState(account);
  const [periodDays, setPeriodDays] = useState("30");

  const metricsQuery = useQuery({
    queryKey: ["rag-effectiveness", accountName, periodDays],
    queryFn: async () => {
      try {
        return await (ocrApi.getRagEffectiveness as any)?.(accountName, { period_days: parseInt(periodDays) }) ?? { rules: [] };
      } catch {
        return { rules: [] };
      }
    },
    retry: false,
  });

  const metrics = (metricsQuery.data as { rules?: RagEffectivenessMetric[] })?.rules ?? [];

  const getEffectivenessColor = (ratio: number) => {
    if (ratio >= 0.85) return "text-green-400";
    if (ratio >= 0.7) return "text-yellow-400";
    return "text-red-400";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-900 text-green-100">Activa</Badge>;
      case "paused":
        return <Badge className="bg-yellow-900 text-yellow-100">Pausada</Badge>;
      case "deprecated":
        return <Badge className="bg-red-900 text-red-100">Deprecada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Efectividad de Reglas RAG
          </CardTitle>
          <CardDescription>
            Análisis de cómo funcionan las reglas RAG en los últimos días
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-32 space-y-2">
            <Label htmlFor="period-days">Período (días)</Label>
            <Input
              id="period-days"
              type="number"
              min="1"
              max="90"
              value={periodDays}
              onChange={(e) => setPeriodDays(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Metrics Table */}
      {metricsQuery.isLoading ? (
        <div className="text-center text-white/60">Cargando métricas...</div>
      ) : metrics.length === 0 ? (
        <Card className="border-white/10 bg-white/5">
          <CardContent className="flex items-center justify-center gap-2 py-8 text-white/60">
            <AlertCircle className="h-4 w-4" />
            No hay datos de efectividad disponibles
          </CardContent>
        </Card>
      ) : (
        <Card className="border-white/10 bg-white/5">
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead>Regla</TableHead>
                  <TableHead>Cadenas</TableHead>
                  <TableHead className="text-right">Aplicadas</TableHead>
                  <TableHead className="text-right">Verificadas</TableHead>
                  <TableHead className="text-right">Efectividad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((metric) => (
                  <TableRow key={metric.rule_id} className="border-white/10 hover:bg-white/5">
                    <TableCell className="font-mono text-sm">{metric.rule_title}</TableCell>
                    <TableCell className="text-xs">
                      {metric.cadenas.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {metric.cadenas.map((c) => (
                            <Badge key={c} variant="outline" className="text-xs">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-white/40">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{metric.times_applied}x</TableCell>
                    <TableCell className="text-right text-sm">
                      {metric.times_matched_shadow}x
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${getEffectivenessColor(metric.effectiveness_ratio)}`}
                    >
                      {(metric.effectiveness_ratio * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell>{getStatusBadge(metric.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      {metrics.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm">Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded border border-white/10 bg-white/3 p-3">
                <p className="text-xs text-white/60">Total de Reglas</p>
                <p className="text-2xl font-bold">{metrics.length}</p>
              </div>
              <div className="rounded border border-white/10 bg-white/3 p-3">
                <p className="text-xs text-white/60">Aplicaciones Totales</p>
                <p className="text-2xl font-bold">
                  {metrics.reduce((sum, m) => sum + m.times_applied, 0)}
                </p>
              </div>
              <div className="rounded border border-white/10 bg-white/3 p-3">
                <p className="text-xs text-white/60">Efectividad Promedio</p>
                <p className="text-2xl font-bold">
                  {(
                    metrics.reduce((sum, m) => sum + m.effectiveness_ratio, 0) / metrics.length *
                    100
                  ).toFixed(1)}
                  %
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
