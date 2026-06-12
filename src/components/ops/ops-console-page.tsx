"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  History,
  Layers3,
  Loader2,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { getJobId, HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobRow, QueueJobRow, RecentUpload } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrainingFooterNote, TrainingListShell, TrainingPanelCard } from "@/components/training/training-ui";

const QUEUE_POLL_MS = 4000;

type OpsSection = "connectivity" | "queue" | "jobs" | "uploads";

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });
}

function jobProgressRatio(job: { processed_images?: number; total_images?: number }): number {
  const total = Number(job.total_images ?? 0);
  const processed = Number(job.processed_images ?? 0);
  if (!total) return 0;
  return Math.min(1, Math.max(0, processed / total));
}

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "partial_success") {
    return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  }
  if (normalized === "failed") return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  if (normalized === "running" || normalized === "queued" || normalized === "processing") {
    return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  }
  return "border-white/15 bg-white/5 text-slate-200";
}

function getJobTypeMeta(row: JobRow): { label: string; detail: string } {
  const moduleName = (row.job_module ?? row.job_type ?? "").trim().toLowerCase();
  if (moduleName === "shelf_recognition") return { label: "Shelf", detail: "shelf_recognition" };
  if (moduleName === "promotions") return { label: "Promociones", detail: "promotions" };
  if (moduleName === "crop_extraction") return { label: "Crops", detail: "crop_extraction" };
  if (moduleName === "benchmark") return { label: "Benchmark", detail: "benchmark" };
  return { label: moduleName ? moduleName.replaceAll("_", " ") : "General", detail: moduleName || "-" };
}

function resolveJobHref(row: JobRow): string | null {
  const jobId = getJobId(row);
  const account = row.account_name?.trim();
  if (!jobId || !account) return null;
  const typeMeta = getJobTypeMeta(row);
  if (typeMeta.detail === "shelf_recognition") {
    return `/accounts/${encodeURIComponent(account)}/shelf`;
  }
  return `/accounts/${encodeURIComponent(account)}/jobs/${encodeURIComponent(jobId)}`;
}

function uploadField(upload: RecentUpload, key: string): string {
  const value = upload[key];
  if (value == null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function OpsKpi({
  label,
  value,
  hint,
  tone = "text-white",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 font-heading text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SectionPill({
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
          ? "bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/40"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function QueueJobRowView({ row, showAccount = true }: { row: QueueJobRow; showAccount?: boolean }) {
  const href =
    row.account_name && row.job_id
      ? `/accounts/${encodeURIComponent(row.account_name)}/jobs/${encodeURIComponent(row.job_id)}`
      : null;

  return (
    <div className="grid grid-cols-[minmax(160px,1.2fr)_auto_auto_auto] items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03] sm:grid-cols-[minmax(180px,1.4fr)_minmax(100px,0.8fr)_auto_auto_auto]">
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="truncate font-mono text-xs text-cyan-100 hover:underline">
            {row.job_id}
          </Link>
        ) : (
          <p className="truncate font-mono text-xs text-white">{row.job_id}</p>
        )}
        <p className="mt-0.5 text-[10px] text-slate-500">{formatDate(row.created_at)}</p>
      </div>
      {showAccount ? (
        <div className="truncate text-xs text-slate-300">{row.account_name ?? "-"}</div>
      ) : null}
      <div>
        <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(String(row.status))}`}>
          {row.status}
        </Badge>
      </div>
      <div className="text-center text-[10px] text-slate-400">{row.id_pdv ?? "-"}</div>
      <div className="truncate text-[10px] text-slate-400">{row.subcategoria ?? "-"}</div>
    </div>
  );
}

function RawJsonPanel({ title, data }: { title: string; data: unknown }) {
  return (
    <details className="rounded-lg border border-white/10 bg-black/20">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-400">{title}</summary>
      <pre className="max-h-56 overflow-auto border-t border-white/5 px-3 py-2 text-[11px] text-slate-500">
        {JSON.stringify(data ?? null, null, 2)}
      </pre>
    </details>
  );
}

export function OpsConsolePage() {
  const queryClient = useQueryClient();
  const [accountName, setAccountName] = useState("colgate_ecuador");
  const [activeSection, setActiveSection] = useState<OpsSection>("connectivity");
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);

  const testConnection = useMutation({
    mutationFn: () => ocrApi.health(),
    onSuccess: () => {
      setConnectionOk(true);
      toast.success("Conexion OK", { description: ocrApi.backendUrl });
    },
    onError: (error) => {
      setConnectionOk(false);
      toast.error("Error conexion", {
        description: error instanceof HttpError ? error.message : "Error inesperado",
      });
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["ops-jobs"],
    queryFn: () => ocrApi.getRecentJobs(20),
    refetchInterval: 15000,
  });

  const uploadsQuery = useQuery({
    queryKey: ["ops-uploads", accountName],
    queryFn: () => ocrApi.getRecentUploads(accountName, 20),
    enabled: Boolean(accountName.trim()),
  });

  const queueQuery = useQuery({
    queryKey: ["ops-job-queue", accountName],
    queryFn: () => ocrApi.getJobQueueSnapshot({ accountName: accountName.trim() || undefined, nextLimit: 10 }),
    refetchInterval: QUEUE_POLL_MS,
    retry: false,
  });

  const jobs = jobsQuery.data ?? [];
  const uploads = uploadsQuery.data ?? [];
  const queue = queueQuery.data;

  const queueLive = (queue?.running_count ?? 0) > 0 || (queue?.queued_count ?? 0) > 0;

  const jobStats = useMemo(() => {
    let running = 0;
    let failed = 0;
    let completed = 0;
    for (const row of jobs) {
      const status = String(row.status).toLowerCase();
      if (status === "running" || status === "queued") running += 1;
      else if (status === "failed") failed += 1;
      else if (status === "completed" || status === "partial_success") completed += 1;
    }
    return { total: jobs.length, running, failed, completed };
  }, [jobs]);

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["ops-jobs"] });
    void queryClient.invalidateQueries({ queryKey: ["ops-uploads", accountName] });
    void queryClient.invalidateQueries({ queryKey: ["ops-job-queue", accountName] });
  }

  const isRefreshing = jobsQuery.isFetching || uploadsQuery.isFetching || queueQuery.isFetching;

  return (
    <div className="space-y-4 pb-10">
      <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-cyan-950/40 shadow-xl shadow-cyan-950/20">
        <div className="border-b border-white/5 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-cyan-300" />
                <h1 className="font-heading text-xl font-semibold tracking-tight text-white sm:text-2xl">Ops Console</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Diagnostico de backend, cola OCR, jobs recientes y uploads. Vista operativa alineada con el resto del
                panel.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-white/15 text-[10px] text-slate-300">
                poll cola {QUEUE_POLL_MS / 1000}s
              </Badge>
              {connectionOk === true ? (
                <Badge className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-100">
                  Backend OK
                </Badge>
              ) : connectionOk === false ? (
                <Badge className="border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-100">
                  Backend caido
                </Badge>
              ) : null}
              <Button size="sm" variant="outline" className="h-8 border-white/15 bg-black/25 text-xs" onClick={refreshAll} disabled={isRefreshing}>
                {isRefreshing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                Refrescar todo
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5 sm:pb-4">
          <OpsKpi
            label="Cola pendiente"
            value={queue?.queued_count ?? "—"}
            hint={queueLive ? "cola activa" : "idle"}
            tone="text-amber-100"
          />
          <OpsKpi label="Ejecutando" value={queue?.running_count ?? "—"} hint="jobs en curso" tone="text-cyan-100" />
          <OpsKpi label="Jobs recientes" value={jobStats.total} hint={`${jobStats.completed} ok · ${jobStats.failed} fail`} />
          <OpsKpi label="Uploads" value={uploads.length} hint={accountName} tone="text-emerald-100" />
        </div>
      </section>

      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">Seccion</span>
          <SectionPill active={activeSection === "connectivity"} label="Conectividad" onClick={() => setActiveSection("connectivity")} />
          <SectionPill active={activeSection === "queue"} label="Cola OCR" onClick={() => setActiveSection("queue")} />
          <SectionPill active={activeSection === "jobs"} label="Jobs recientes" onClick={() => setActiveSection("jobs")} />
          <SectionPill active={activeSection === "uploads"} label="Uploads" onClick={() => setActiveSection("uploads")} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 sm:px-4">
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label htmlFor="ops-account" className="text-xs text-slate-400">
            Cuenta para cola y uploads
          </Label>
          <Input
            id="ops-account"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="colgate_ecuador"
            className="h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/accounts/${encodeURIComponent(accountName.trim() || "colgate_ecuador")}/jobs`}>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" />
              Historial jobs
            </Button>
          </Link>
          <Link href={`/accounts/${encodeURIComponent(accountName.trim() || "colgate_ecuador")}/training`}>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
              <Layers3 className="h-3.5 w-3.5" />
              Training IA
            </Button>
          </Link>
        </div>
      </div>

      {activeSection === "connectivity" ? (
        <TrainingPanelCard
          title="Diagnostico backend"
          description="Verifica que el proxy BFF llegue al backend OCR activo."
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Backend activo</p>
              <p className="mt-1 font-mono text-sm text-cyan-100">{ocrApi.backendUrl}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
                {testConnection.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : connectionOk ? (
                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-300" />
                ) : (
                  <Wifi className="mr-2 h-4 w-4" />
                )}
                Probar conexion backend
              </Button>
              {connectionOk === false ? (
                <span className="flex items-center gap-1 text-xs text-rose-300">
                  <WifiOff className="h-3.5 w-3.5" />
                  Sin respuesta del backend
                </span>
              ) : null}
            </div>
            <RawJsonPanel title="Respuesta health (ultima prueba manual)" data={testConnection.isSuccess ? { ok: true } : null} />
          </div>
        </TrainingPanelCard>
      ) : null}

      {activeSection === "queue" ? (
        <TrainingPanelCard
          title="Cola OCR"
          description={
            queue
              ? `${queue.queued_count} pendientes · ${queue.running_count} ejecutando`
              : "Observabilidad de cola en tiempo real"
          }
          action={
            queueQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
            ) : (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => queueQuery.refetch()}>
                Refrescar cola
              </Button>
            )
          }
        >
          {queueQuery.error ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
              Observabilidad de cola no disponible para esta cuenta.
            </div>
          ) : null}

          {queue ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={queueLive ? "border-amber-400/40 text-amber-100" : "border-emerald-400/30 text-emerald-100"}>
                  {queueLive ? "Cola activa" : "Cola idle"}
                </Badge>
                {queue.queue_mode ? (
                  <Badge variant="outline" className="border-white/15 text-slate-300">
                    {queue.queue_mode}
                  </Badge>
                ) : null}
                {queue.poll_sec ? (
                  <Badge variant="outline" className="border-white/15 text-[10px] text-slate-400">
                    backend poll {queue.poll_sec}s
                  </Badge>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <OpsKpi label="queued_count" value={queue.queued_count} tone="text-amber-100" />
                <OpsKpi label="running_count" value={queue.running_count} tone="text-cyan-100" />
                <OpsKpi label="queue_mode" value={queue.queue_mode ?? "-"} />
                <OpsKpi label="poll_sec" value={queue.poll_sec ?? "-"} />
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs font-medium text-slate-400">counts_by_status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(queue.counts_by_status ?? {}).map(([status, count]) => (
                    <Badge key={status} variant="outline" className={`text-[10px] ${statusBadgeClass(status)}`}>
                      {status}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-200">running_job</p>
                {queue.running_job ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <p>
                        <span className="text-slate-500">job_id:</span>{" "}
                        <span className="font-mono text-white">{queue.running_job.job_id}</span>
                      </p>
                      <p>
                        <span className="text-slate-500">account:</span> {queue.running_job.account_name ?? "-"}
                      </p>
                      <p>
                        <span className="text-slate-500">status:</span> {queue.running_job.status}
                      </p>
                      <p>
                        <span className="text-slate-500">processed:</span> {queue.running_job.processed_images ?? 0}/
                        {queue.running_job.total_images ?? 0}
                      </p>
                      <p>
                        <span className="text-slate-500">id_pdv:</span> {queue.running_job.id_pdv ?? "-"}
                      </p>
                      <p>
                        <span className="text-slate-500">subcategoria:</span> {queue.running_job.subcategoria ?? "-"}
                      </p>
                      <p>
                        <span className="text-slate-500">usuario:</span> {queue.running_job.usuario_relevo ?? "-"}
                      </p>
                      <p>
                        <span className="text-slate-500">started_at:</span> {formatDate(queue.running_job.started_at)}
                      </p>
                    </div>
                    {queue.running_job.total_images ? (
                      <div>
                        <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                          <span>Progreso</span>
                          <span>
                            {queue.running_job.processed_images ?? 0}/{queue.running_job.total_images}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-cyan-400 transition-all"
                            style={{ width: `${Math.round(jobProgressRatio(queue.running_job) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {queue.running_job.account_name ? (
                      <Link
                        href={`/accounts/${encodeURIComponent(queue.running_job.account_name)}/jobs/${encodeURIComponent(queue.running_job.job_id)}`}
                        className="inline-flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100"
                      >
                        Abrir job en ejecucion <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Sin job en ejecucion</p>
                )}
              </div>

              <TrainingListShell
                loading={false}
                empty={!queue.next_jobs.length}
                emptyMessage="No hay jobs en cola."
              >
                <div className="sticky top-0 z-10 grid grid-cols-[minmax(160px,1.2fr)_minmax(100px,0.8fr)_auto_auto_auto] items-center gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
                  <span>job_id</span>
                  <span>account</span>
                  <span>status</span>
                  <span className="text-center">id_pdv</span>
                  <span>subcategoria</span>
                </div>
                <div className="divide-y divide-white/5">
                  {queue.next_jobs.map((row) => (
                    <QueueJobRowView key={row.job_id} row={row} />
                  ))}
                </div>
              </TrainingListShell>

              <RawJsonPanel title="JSON completo de cola (debug)" data={queue} />
            </div>
          ) : queueQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando cola...
            </div>
          ) : null}
        </TrainingPanelCard>
      ) : null}

      {activeSection === "jobs" ? (
        <TrainingPanelCard
          title="Jobs recientes"
          description="Ultimos 20 jobs globales del backend (todas las cuentas)."
          action={
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => jobsQuery.refetch()} disabled={jobsQuery.isFetching}>
              {jobsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refrescar"}
            </Button>
          }
        >
          <TrainingListShell loading={jobsQuery.isLoading} empty={jobs.length === 0} emptyMessage="Sin jobs recientes.">
            <div className="divide-y divide-white/5">
              {jobs.map((row) => {
                const safeJobId = getJobId(row);
                const typeMeta = getJobTypeMeta(row);
                const href = resolveJobHref(row);
                return (
                  <div
                    key={safeJobId || `${row.created_at}-${row.updated_at}`}
                    className="flex flex-col gap-2 px-4 py-3 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="max-w-[260px] truncate font-mono text-xs text-white">{safeJobId || "-"}</p>
                        <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(String(row.status))}`}>
                          {row.status}
                        </Badge>
                        <Badge variant="outline" className="border-violet-400/25 bg-violet-500/10 text-[10px] text-violet-100">
                          {typeMeta.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                        <span>{row.account_name ?? "-"}</span>
                        <span>{formatDate(row.created_at)}</span>
                        <span>
                          Img {row.processed_images ?? 0}/{row.total_images ?? 0}
                        </span>
                        <span>PDV {row.id_pdv ?? "-"}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {href ? (
                        <Link href={href}>
                          <Button size="sm" className="h-7 gap-1 text-[11px]">
                            <ExternalLink className="h-3 w-3" />
                            Abrir
                          </Button>
                        </Link>
                      ) : null}
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
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TrainingListShell>
          <div className="mt-3">
            <RawJsonPanel title="JSON jobs recientes (debug)" data={jobs} />
          </div>
        </TrainingPanelCard>
      ) : null}

      {activeSection === "uploads" ? (
        <TrainingPanelCard
          title="Uploads recientes"
          description={`Archivos subidos para la cuenta ${accountName || "(sin cuenta)"}.`}
          action={
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => uploadsQuery.refetch()} disabled={uploadsQuery.isFetching}>
              {uploadsQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refrescar"}
            </Button>
          }
        >
          <TrainingListShell
            loading={uploadsQuery.isLoading}
            empty={uploads.length === 0}
            emptyMessage="Sin uploads recientes para esta cuenta."
          >
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(120px,0.9fr)_minmax(160px,1.4fr)_auto_auto] items-center gap-2 border-b border-white/10 bg-slate-950/90 px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500 backdrop-blur">
              <span>file_id</span>
              <span>nombre</span>
              <span>estado</span>
              <span>fecha</span>
            </div>
            <div className="divide-y divide-white/5">
              {uploads.map((upload, idx) => (
                <div
                  key={String(upload.file_id ?? upload.id ?? idx)}
                  className="grid grid-cols-[minmax(120px,0.9fr)_minmax(160px,1.4fr)_auto_auto] items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03]"
                >
                  <p className="truncate font-mono text-[11px] text-slate-300">
                    {uploadField(upload, "file_id")}
                  </p>
                  <p className="truncate text-xs text-white">
                    {uploadField(upload, "original_name") !== "-"
                      ? uploadField(upload, "original_name")
                      : uploadField(upload, "original_filename")}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {uploadField(upload, "status")}
                  </Badge>
                  <span className="text-[10px] text-slate-500">
                    {formatDate(
                      (upload.created_at as string | undefined) ??
                        (upload.uploaded_at as string | undefined) ??
                        null,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </TrainingListShell>
          <div className="mt-3">
            <RawJsonPanel title="JSON uploads recientes (debug)" data={uploads} />
          </div>
        </TrainingPanelCard>
      ) : null}

      <TrainingFooterNote>
        Ops conserva el JSON crudo en paneles colapsables para diagnostico. La cola hace poll cada {QUEUE_POLL_MS / 1000}s.
        Cambia la cuenta arriba para filtrar cola y uploads sin perder el listado global de jobs.
      </TrainingFooterNote>
    </div>
  );
}