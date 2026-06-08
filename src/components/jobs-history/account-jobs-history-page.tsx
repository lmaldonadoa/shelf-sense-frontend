"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, RefreshCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { getJobId, HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobRow, JobStatus } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AccountJobsHistoryPageProps = {
  account: string;
};

type RangeValue = "today" | "7d" | "30d" | "all";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function parseDate(value?: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDuration(start?: string | null, end?: string | null): string {
  const ts = parseDate(start);
  const te = parseDate(end);
  if (!ts || !te || te < ts) return "-";
  const seconds = Math.round((te - ts) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusBadgeVariant(status: JobStatus): "secondary" | "destructive" | "default" {
  if (status === "failed") return "destructive";
  if (status === "completed" || status === "partial_success") return "default";
  if (status === "queued") return "secondary";
  return "secondary";
}

function getJobTypeMeta(row: JobRow): { label: string; detail: string } {
  const moduleName = (row.job_module ?? row.job_type ?? "").trim().toLowerCase();
  const testMode = (row.test_mode ?? "").trim().toLowerCase();

  if (moduleName === "shelf_recognition") {
    if (testMode === "sku_specific" || testMode === "sku_test") {
      return { label: "Prueba de SKU", detail: "shelf_recognition" };
    }
    return { label: "Shelf Recognition", detail: "shelf_recognition" };
  }
  if (moduleName === "promotions") {
    return { label: "Promociones", detail: "promotions" };
  }
  if (moduleName === "crop_extraction") {
    return { label: "Extraccion de crops", detail: "crop_extraction" };
  }
  if (moduleName === "benchmark") {
    return { label: "Benchmark", detail: "benchmark" };
  }
  if (testMode === "sku_specific" || testMode === "sku_test") {
    return { label: "Prueba de SKU", detail: moduleName || "test_job" };
  }
  return { label: moduleName ? moduleName.replaceAll("_", " ") : "General", detail: moduleName || "-" };
}

function isInsideRange(row: JobRow, range: RangeValue): boolean {
  if (range === "all") return true;
  const rowTime = parseDate(row.created_at || row.updated_at);
  if (!rowTime) return false;
  const now = new Date();
  if (range === "today") {
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return rowTime >= startToday;
  }
  const days = range === "7d" ? 7 : 30;
  const min = now.getTime() - days * 24 * 60 * 60 * 1000;
  return rowTime >= min;
}

export function AccountJobsHistoryPage({ account }: AccountJobsHistoryPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openingJobId, setOpeningJobId] = useState<string | null>(null);
  const [accountFromParams] = useState(account);

  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [rangeFilter, setRangeFilter] = useState<RangeValue>((searchParams.get("range") as RangeValue | null) ?? "7d");

  const recentJobsQuery = useQuery({
    queryKey: ["account-jobs-recent", accountFromParams],
    queryFn: () => ocrApi.listRecentJobs({ accountName: accountFromParams, limit: 100 }),
  });

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (searchText) params.set("q", searchText);
    else params.delete("q");
    if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
    else params.delete("status");
    if (rangeFilter && rangeFilter !== "7d") params.set("range", rangeFilter);
    else params.delete("range");
    const next = params.toString();
    router.replace(`/accounts/${encodeURIComponent(accountFromParams)}/jobs${next ? `?${next}` : ""}`);
  }, [accountFromParams, rangeFilter, router, searchParams, searchText, statusFilter]);

  const rows = useMemo(() => {
    const list = recentJobsQuery.data ?? [];
    const q = searchText.trim().toLowerCase();
    return list
      .filter((row) => (row.account_name ? row.account_name === accountFromParams : true))
      .filter((row) => {
        if (!q) return true;
        const typeMeta = getJobTypeMeta(row);
        const haystack = [
          getJobId(row),
          row.id_pdv ?? "",
          row.subcategoria ?? "",
          row.job_module ?? "",
          row.job_type ?? "",
          row.test_mode ?? "",
          typeMeta.label,
          typeMeta.detail,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .filter((row) => (statusFilter === "all" ? true : row.status === statusFilter))
      .filter((row) => isInsideRange(row, rangeFilter))
      .sort((a, b) => parseDate(b.created_at || b.updated_at) - parseDate(a.created_at || a.updated_at));
  }, [accountFromParams, rangeFilter, recentJobsQuery.data, searchText, statusFilter]);

  async function openJob(row: JobRow) {
    const safeJobId = getJobId(row);
    if (!safeJobId) {
      toast.error("Job invalido", { description: "No fue posible resolver job_id." });
      return;
    }

    setOpeningJobId(safeJobId);
    try {
      const detail = await ocrApi.getJob(safeJobId);
      const detailAccount = detail.account_name;
      if (!detailAccount) {
        toast.error("No se pudo validar la cuenta del job", { description: "El backend no retorno account_name en detalle." });
        return;
      }
      if (detailAccount !== accountFromParams) {
        toast.error("Job de otra cuenta", { description: `Este job pertenece a ${detailAccount}` });
        return;
      }
      router.push(`/accounts/${encodeURIComponent(accountFromParams)}/jobs/${encodeURIComponent(safeJobId)}`);
    } catch (error) {
      toast.error("No se pudo abrir job", { description: error instanceof HttpError ? error.message : "Error inesperado" });
    } finally {
      setOpeningJobId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cuenta</p>
          <h1 className="font-heading text-2xl text-white">{accountFromParams} - Historial de Jobs</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void recentJobsQuery.refetch()} disabled={recentJobsQuery.isFetching}>
            {recentJobsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Actualizar
          </Button>
          <Link href={`/accounts/${encodeURIComponent(accountFromParams)}/jobs/maintenance`}>
            <Button variant="outline">
              <ShieldAlert className="mr-2 h-4 w-4" />
              Mantenimiento
            </Button>
          </Link>
          <Link href={`/accounts/${encodeURIComponent(accountFromParams)}/playground`}>
            <Button>Ir a Playground</Button>
          </Link>
        </div>
      </div>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Buscar por job_id, tipo, PDV o subcategoria..." />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
          >
            <option value="all">Todos los estados</option>
            <option value="running">running</option>
            <option value="queued">queued</option>
            <option value="completed">completed</option>
            <option value="partial_success">partial_success</option>
            <option value="failed">failed</option>
          </select>
          <select
            value={rangeFilter}
            onChange={(event) => setRangeFilter(event.target.value as RangeValue)}
            className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
          >
            <option value="today">Hoy</option>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
            <option value="all">Todo</option>
          </select>
          <p className="text-sm text-muted-foreground">Mostrando {rows.length} jobs para la cuenta.</p>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Jobs previos</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando historial...</p>
          ) : recentJobsQuery.error ? (
            <div className="space-y-3">
              <p className="text-sm text-rose-300">No se pudo cargar el historial.</p>
              <Button size="sm" variant="outline" onClick={() => void recentJobsQuery.refetch()}>Reintentar</Button>
            </div>
          ) : !rows.length ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-6 text-center">
              <p className="text-sm text-muted-foreground">No hay jobs que coincidan con los filtros en esta cuenta.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Subcategoria</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead>created_at</TableHead>
                    <TableHead>updated_at</TableHead>
                    <TableHead>total_images</TableHead>
                    <TableHead>processed_images</TableHead>
                    <TableHead>failed_images</TableHead>
                    <TableHead>duration</TableHead>
                    <TableHead>acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const safeJobId = getJobId(row);
                    const typeMeta = getJobTypeMeta(row);
                    return (
                      <TableRow key={safeJobId || `${row.created_at}-${row.updated_at}`}>
                        <TableCell className="min-w-[220px]">
                          <div className="space-y-1">
                            <p className="font-mono text-xs text-white">{safeJobId || "-"}</p>
                            <p className="text-xs text-slate-400">PDV: {row.id_pdv ?? "-"}</p>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="space-y-1">
                            <Badge variant="outline" className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100">
                              {typeMeta.label}
                            </Badge>
                            <p className="text-[11px] text-slate-500">{typeMeta.detail}</p>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[170px]">
                          {row.subcategoria ? (
                            <Badge variant="secondary" className="max-w-full truncate">
                              {row.subcategoria}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-500">Sin subcategoria</span>
                          )}
                        </TableCell>
                        <TableCell><Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge></TableCell>
                        <TableCell className="text-xs">{formatDate(row.created_at)}</TableCell>
                        <TableCell className="text-xs">{formatDate(row.updated_at)}</TableCell>
                        <TableCell>{row.total_images}</TableCell>
                        <TableCell>{row.processed_images}</TableCell>
                        <TableCell>{row.failed_images}</TableCell>
                        <TableCell>{formatDuration(row.started_at ?? row.created_at, row.finished_at)}</TableCell>
                        <TableCell className="space-x-2">
                          <Button size="sm" onClick={() => void openJob(row)} disabled={openingJobId === safeJobId || !safeJobId}>
                            {openingJobId === safeJobId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                            Abrir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              if (!safeJobId) return;
                              await navigator.clipboard.writeText(safeJobId);
                              toast.success("ID copiado");
                            }}
                            disabled={!safeJobId}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copiar ID
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
