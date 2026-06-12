"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  History,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getJobId, HttpError, isFinalJobStatus, ocrApi } from "@/lib/ocrApi";
import { buildShelfJobRerunOverrides } from "@/lib/shelf-job-payload";
import type { JobRow, JobStatus } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AccountJobsHistoryPageProps = {
  account: string;
};

type RangeValue = "today" | "7d" | "30d" | "all";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });
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
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusBadgeVariant(status: JobStatus): "secondary" | "destructive" | "default" {
  if (status === "failed") return "destructive";
  if (status === "completed" || status === "partial_success") return "default";
  return "secondary";
}

function statusBadgeClass(status: JobStatus): string {
  if (status === "completed" || status === "partial_success") {
    return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  }
  if (status === "failed") return "";
  if (status === "running" || status === "queued") {
    return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  }
  return "border-white/15 bg-white/5 text-slate-200";
}

function getJobTypeMeta(row: JobRow): { label: string; detail: string } {
  const moduleName = (row.job_module ?? row.job_type ?? "").trim().toLowerCase();
  const testMode = (row.test_mode ?? "").trim().toLowerCase();

  if (moduleName === "shelf_recognition") {
    if (testMode === "sku_specific" || testMode === "sku_test") {
      return { label: "Prueba SKU", detail: "shelf_recognition" };
    }
    return { label: "Shelf", detail: "shelf_recognition" };
  }
  if (moduleName === "promotions") return { label: "Promociones", detail: "promotions" };
  if (moduleName === "crop_extraction") return { label: "Crops", detail: "crop_extraction" };
  if (moduleName === "benchmark") return { label: "Benchmark", detail: "benchmark" };
  if (testMode === "sku_specific" || testMode === "sku_test") {
    return { label: "Prueba SKU", detail: moduleName || "test_job" };
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

function KpiCard({
  label,
  value,
  icon,
  tone = "text-white",
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <span className="text-slate-500">{icon}</span>
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function RangePill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

export function AccountJobsHistoryPage({ account }: AccountJobsHistoryPageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [openingJobId, setOpeningJobId] = useState<string | null>(null);
  const [accountFromParams] = useState(account);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

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

  const stats = useMemo(() => {
    const running = rows.filter((r) => r.status === "running" || r.status === "queued").length;
    const completed = rows.filter((r) => r.status === "completed" || r.status === "partial_success").length;
    const failed = rows.filter((r) => r.status === "failed").length;
    return { total: rows.length, running, completed, failed };
  }, [rows]);

  const rerunMutation = useMutation({
    mutationFn: async ({ jobId, module, subcategoria }: { jobId: string; module: string; subcategoria?: string | null }) => {
      if (module === "shelf_recognition") {
        return ocrApi.rerunShelfJob(jobId, buildShelfJobRerunOverrides({ subcategoria }));
      }
      return ocrApi.rerunPromotionsJob(accountFromParams, jobId, { mode: "new" });
    },
    onSuccess: (data, { module }) => {
      const newId = (data as Record<string, unknown>).new_job_id as string | undefined;
      toast.success("Job reencolado", {
        description: newId ? `Nuevo job: ${newId}` : "El job fue reiniciado.",
        action: newId
          ? {
              label: "Abrir",
              onClick: () => {
                const basePath =
                  module === "shelf_recognition"
                    ? `/accounts/${encodeURIComponent(accountFromParams)}/shelf`
                    : `/accounts/${encodeURIComponent(accountFromParams)}/jobs`;
                router.push(`${basePath}/${encodeURIComponent(newId)}`);
              },
            }
          : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["account-jobs-recent", accountFromParams] });
    },
    onError: (err) => {
      toast.error("No se pudo reejecutar", { description: err instanceof HttpError ? err.message : "Error inesperado" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ jobId, module }: { jobId: string; module: string }) => {
      const payload = { delete_local_files: true, delete_mysql: true, dry_run: false, confirm: "DELETE_JOB" };
      if (module === "shelf_recognition") {
        return ocrApi.deleteShelfJob(jobId, payload);
      }
      return ocrApi.deletePromotionsJob(accountFromParams, jobId, payload);
    },
    onSuccess: (_, { jobId }) => {
      toast.success("Job eliminado", { description: jobId });
      setConfirmingDeleteId(null);
      void queryClient.invalidateQueries({ queryKey: ["account-jobs-recent", accountFromParams] });
    },
    onError: (err) => {
      toast.error("No se pudo eliminar", { description: err instanceof HttpError ? err.message : "Error inesperado" });
      setConfirmingDeleteId(null);
    },
  });

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

  const selectClass =
    "h-9 w-full rounded-md border border-white/10 bg-slate-900/80 px-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-400/50";

  return (
    <div className="space-y-4 pb-10">
      <section className="overflow-hidden rounded-2xl border border-violet-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-violet-950/40 shadow-xl shadow-violet-950/20">
        <div className="border-b border-white/5 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-violet-300" />
                <h1 className="font-heading text-xl font-semibold tracking-tight text-white sm:text-2xl">Historial de jobs</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Consulta, filtra y opera jobs recientes de la cuenta. Abre detalle, reejecuta o elimina con confirmacion.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-violet-300/30 bg-violet-500/10 text-violet-100">{accountFromParams}</Badge>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void recentJobsQuery.refetch()}
                disabled={recentJobsQuery.isFetching}
              >
                {recentJobsQuery.isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
                Actualizar
              </Button>
              <Link href={`/accounts/${encodeURIComponent(accountFromParams)}/jobs/maintenance`}>
                <Button size="sm" variant="outline" className="h-8">
                  <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
                  Mantenimiento
                </Button>
              </Link>
              <Link href={`/accounts/${encodeURIComponent(accountFromParams)}/playground`}>
                <Button size="sm" className="h-8">Playground</Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5 sm:pb-4">
          <KpiCard label="Visibles" value={stats.total} icon={<History className="h-3.5 w-3.5" />} />
          <KpiCard label="En cola / activos" value={stats.running} icon={<Clock3 className="h-3.5 w-3.5" />} tone="text-amber-200" />
          <KpiCard label="Completados" value={stats.completed} icon={<CheckCircle2 className="h-3.5 w-3.5" />} tone="text-emerald-200" />
          <KpiCard label="Fallidos" value={stats.failed} icon={<XCircle className="h-3.5 w-3.5" />} tone="text-rose-200" />
        </div>
      </section>

      <Card className="border-white/10 bg-white/5">
        <CardHeader className="gap-1 px-4 py-3 sm:px-5">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription className="text-xs">Busqueda, estado y ventana temporal sincronizados con la URL.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 sm:px-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_140px_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="job_id, tipo, PDV, subcategoria..."
                className="h-9 pl-8 text-sm"
              />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClass}>
              <option value="all">Todos los estados</option>
              <option value="running">running</option>
              <option value="queued">queued</option>
              <option value="completed">completed</option>
              <option value="partial_success">partial_success</option>
              <option value="failed">failed</option>
            </select>
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
              <RangePill active={rangeFilter === "today"} label="Hoy" onClick={() => setRangeFilter("today")} />
              <RangePill active={rangeFilter === "7d"} label="7d" onClick={() => setRangeFilter("7d")} />
              <RangePill active={rangeFilter === "30d"} label="30d" onClick={() => setRangeFilter("30d")} />
              <RangePill active={rangeFilter === "all"} label="Todo" onClick={() => setRangeFilter("all")} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 px-4 py-3 sm:px-5">
          <div>
            <CardTitle className="text-base">Jobs</CardTitle>
            <CardDescription className="text-xs">{rows.length} resultados</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentJobsQuery.isLoading ? (
            <p className="px-4 py-8 text-sm text-muted-foreground sm:px-5">Cargando historial...</p>
          ) : recentJobsQuery.error ? (
            <div className="space-y-2 px-4 py-6 sm:px-5">
              <p className="text-sm text-rose-300">No se pudo cargar el historial.</p>
              <Button size="sm" variant="outline" onClick={() => void recentJobsQuery.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : !rows.length ? (
            <div className="mx-4 mb-4 rounded-lg border border-dashed border-white/15 bg-black/20 p-6 text-center sm:mx-5">
              <p className="text-sm text-muted-foreground">No hay jobs que coincidan con los filtros en esta cuenta.</p>
            </div>
          ) : (
            <div className="max-h-[min(70vh,720px)] overflow-y-auto overflow-x-hidden overscroll-contain">
              <div className="divide-y divide-white/5">
                {rows.map((row) => {
                  const safeJobId = getJobId(row);
                  const typeMeta = getJobTypeMeta(row);
                  const canRerun =
                    !!safeJobId &&
                    isFinalJobStatus(row.status) &&
                    (typeMeta.detail === "promotions" || typeMeta.detail === "shelf_recognition");
                  const canDelete = !!safeJobId && isFinalJobStatus(row.status);
                  const total = row.total_images ?? 0;
                  const processed = row.processed_images ?? 0;
                  const failed = row.failed_images ?? 0;

                  return (
                    <div
                      key={safeJobId || `${row.created_at}-${row.updated_at}`}
                      className="group flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-3 sm:px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="max-w-[220px] truncate font-mono text-xs text-white sm:max-w-[280px]">{safeJobId || "-"}</p>
                          <Badge variant={statusBadgeVariant(row.status)} className={`h-5 text-[10px] ${statusBadgeClass(row.status)}`}>
                            {row.status}
                          </Badge>
                          <Badge variant="outline" className="h-5 border-cyan-400/25 bg-cyan-500/10 text-[10px] text-cyan-100">
                            {typeMeta.label}
                          </Badge>
                          {row.subcategoria ? (
                            <Badge variant="secondary" className="h-5 max-w-[140px] truncate text-[10px]">
                              {row.subcategoria}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          <span>PDV {row.id_pdv ?? "-"}</span>
                          <span>{formatDate(row.created_at)}</span>
                          <span>{formatDuration(row.started_at ?? row.created_at, row.finished_at)}</span>
                          <span>
                            Img {processed}/{total}
                            {failed > 0 ? <span className="text-rose-300"> · {failed} fallidas</span> : null}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => void openJob(row)}
                          disabled={openingJobId === safeJobId || !safeJobId}
                        >
                          {openingJobId === safeJobId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1 hidden sm:inline">Abrir</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={async () => {
                            if (!safeJobId) return;
                            await navigator.clipboard.writeText(safeJobId);
                            toast.success("ID copiado");
                          }}
                          disabled={!safeJobId}
                          title="Copiar ID"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {canRerun ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 border-blue-500/30 p-0 text-blue-300 hover:bg-blue-500/10"
                            onClick={() => rerunMutation.mutate({ jobId: safeJobId, module: typeMeta.detail, subcategoria: row.subcategoria })}
                            disabled={rerunMutation.isPending && rerunMutation.variables?.jobId === safeJobId}
                            title="Reejecutar"
                          >
                            {rerunMutation.isPending && rerunMutation.variables?.jobId === safeJobId ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        ) : null}
                        {canDelete ? (
                          confirmingDeleteId === safeJobId ? (
                            <>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs"
                                onClick={() => deleteMutation.mutate({ jobId: safeJobId, module: typeMeta.detail })}
                                disabled={deleteMutation.isPending}
                              >
                                {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Si"}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setConfirmingDeleteId(null)}>
                                No
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 border-red-500/30 p-0 text-red-400 hover:bg-red-500/10"
                              onClick={() => setConfirmingDeleteId(safeJobId)}
                              title="Eliminar job"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}