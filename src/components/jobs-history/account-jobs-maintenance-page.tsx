"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, FileCheck, Info, Loader2, RefreshCcw, Shield, ShieldAlert, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobsMaintenanceAuditItem, JobsMaintenanceAuditResponse, JobsMaintenanceInferredOutputSignature } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Props = { account: string };

function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function healthBadge(health?: string | null) {
  if (health === "ok") return <Badge className="h-5 border-emerald-400/40 bg-emerald-500/15 text-[10px] text-emerald-100">OK</Badge>;
  if (health === "recoverable")
    return (
      <Badge className="h-5 border-amber-400/40 bg-amber-500/15 text-[10px] text-amber-100" title="Faltan referencias en DB, pero backend detectó artifacts válidos en output. No se recomienda borrar este job.">
        Recuperable
      </Badge>
    );
  if (health === "broken")
    return (
      <Badge variant="destructive" className="h-5 text-[10px]" title="Backend no detectó evidencia suficiente para recuperar artifacts ni referencias válidas.">
        Roto
      </Badge>
    );
  return <Badge variant="outline" className="h-5 text-[10px]">{health || "-"}</Badge>;
}

function issueBadges(item: JobsMaintenanceAuditItem) {
  const issues = Array.isArray(item.issues) ? item.issues : [];
  if (!issues.length) return <span className="text-[11px] text-slate-500">Sin incidencias</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {issues.slice(0, 4).map((issue) => (
        <Badge key={`${item.job_id}-${issue}`} variant="outline" className="h-5 text-[10px]">
          {issue}
        </Badge>
      ))}
      {issues.length > 4 ? <span className="text-[10px] text-slate-500">+{issues.length - 4}</span> : null}
    </div>
  );
}

function recoverableReasonsList(item: JobsMaintenanceAuditItem) {
  const reasons = Array.isArray(item.recoverable_reasons) ? item.recoverable_reasons : [];
  if (!reasons.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reasons.map((reason, idx) => (
        <Badge key={`${item.job_id}-rec-${idx}`} className="h-5 border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-200">
          {reason}
        </Badge>
      ))}
    </div>
  );
}

function filesSummary(item: JobsMaintenanceAuditItem): string {
  const missing = Array.isArray(item.files?.missing) ? item.files.missing.length : 0;
  const generated = Array.isArray(item.files?.existing_generated) ? item.files.existing_generated.length : 0;
  const sourceNotDeleted = Array.isArray(item.files?.existing_source_not_deleted) ? item.files.existing_source_not_deleted.length : 0;
  const parts: string[] = [];
  if (missing) parts.push(`${missing} faltantes`);
  if (generated) parts.push(`${generated} gen.`);
  if (sourceNotDeleted) parts.push(`${sourceNotDeleted} src`);
  return parts.length ? parts.join(" · ") : "-";
}

function renderJsonBlock(title: string, value: unknown) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs">
      <p className="mb-1.5 font-medium text-slate-100">{title}</p>
      <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-300">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </div>
  );
}

function renderOutputSignature(sig: JobsMaintenanceInferredOutputSignature | null | undefined) {
  if (!sig) return null;
  const entries: [string, string | null | undefined][] = [
    ["Master JSON", sig.master_json],
    ["Master HTML", sig.master_html],
    ["Master MD", sig.master_md],
    ["Excel", sig.excel],
  ];
  const imageJsonPaths = Array.isArray(sig.image_json_paths) ? sig.image_json_paths : [];
  const annotatedPaths = Array.isArray(sig.annotated_paths) ? sig.annotated_paths : [];
  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-2.5 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5">
        <FileCheck className="h-3.5 w-3.5 text-amber-300" />
        <p className="font-medium text-amber-100">Evidencia inferida desde output</p>
      </div>
      <div className="space-y-0.5">
        {entries.map(([label, val]) =>
          val ? (
            <p key={label} className="text-[11px] text-slate-300">
              <span className="text-slate-500">{label}:</span> <span className="font-mono">{val}</span>
            </p>
          ) : null,
        )}
        {imageJsonPaths.length > 0 && (
          <p className="text-[11px] text-slate-300">
            <span className="text-slate-500">Image JSONs:</span> {imageJsonPaths.length} archivo(s)
          </p>
        )}
        {annotatedPaths.length > 0 && (
          <p className="text-[11px] text-slate-300">
            <span className="text-slate-500">Annotated:</span> {annotatedPaths.length} archivo(s)
          </p>
        )}
      </div>
    </div>
  );
}

function renderResultPaths(result: JobsMaintenanceAuditItem["result"]) {
  if (!result) return null;
  const paths: [string, string | null | undefined][] = [
    ["Output dir", result.output_dir],
    ["Master JSON", result.master_json_path],
    ["Master HTML", result.master_html_path],
    ["Master MD", result.master_md_path],
    ["Excel", result.excel_path],
  ];
  const hasAny = paths.some(([, val]) => val);
  if (!hasAny) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs">
      <p className="mb-1.5 font-medium text-slate-100">Paths principales</p>
      <div className="space-y-0.5">
        {paths.map(([label, val]) =>
          val ? (
            <p key={label} className="text-[11px] text-slate-300">
              <span className="text-slate-500">{label}:</span> <span className="font-mono break-all">{val}</span>
            </p>
          ) : null,
        )}
      </div>
    </div>
  );
}

function SectionSwitch({
  id,
  label,
  help,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={id} className="text-xs text-slate-100">
            {label}
          </Label>
          <p className="text-[11px] leading-4 text-slate-500">{help}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}

function KpiCard({ label, value, variant }: { label: string; value: number; variant?: "default" | "amber" | "destructive" }) {
  const borderClass =
    variant === "amber"
      ? "border-amber-400/20"
      : variant === "destructive"
        ? "border-rose-400/20"
        : "border-white/10";
  return (
    <div className={`rounded-xl ${borderClass} bg-black/25 px-3 py-2`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

export function AccountJobsMaintenancePage({ account }: Props) {
  const [accountName, setAccountName] = useState(account);
  const [jobModule, setJobModule] = useState("all");
  const [status, setStatus] = useState("all");
  const [jobIdsText, setJobIdsText] = useState("");
  const [includeOk, setIncludeOk] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [limit, setLimit] = useState("200");
  const [deleteDbRows, setDeleteDbRows] = useState(true);
  const [deleteLocalFiles, setDeleteLocalFiles] = useState(true);
  const [deleteAzureOriginals, setDeleteAzureOriginals] = useState(false);
  const [includeRunningJobs, setIncludeRunningJobs] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [selectedJobForDelete, setSelectedJobForDelete] = useState("");
  const [auditResult, setAuditResult] = useState<JobsMaintenanceAuditResponse | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<JobsMaintenanceAuditItem | null>(null);
  const [recoverableBlockMessage, setRecoverableBlockMessage] = useState<string | null>(null);

  const parsedJobIds = useMemo(
    () =>
      jobIdsText
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    [jobIdsText],
  );

  function baseAuditPayload() {
    return {
      account_name: accountName.trim() || undefined,
      job_module: jobModule === "all" ? null : jobModule,
      status: status === "all" ? null : status,
      job_ids: parsedJobIds.length ? parsedJobIds : undefined,
      include_ok: includeOk,
      include_files: includeFiles,
      limit: Math.max(1, Number(limit) || 200),
    };
  }

  function handleHttpError(error: unknown, fallbackTitle: string) {
    if (error instanceof HttpError) {
      if (error.status === 409) {
        const msg = error.detail || "Job recuperable detectado. Borrado bloqueado por seguridad.";
        setRecoverableBlockMessage(msg);
        toast.warning("Borrado bloqueado por seguridad", { description: msg });
        return;
      }
      toast.error(fallbackTitle, { description: error.detail });
      return;
    }
    const detail = error instanceof Error ? error.message : "Error inesperado";
    toast.error(fallbackTitle, { description: detail });
  }

  const auditMutation = useMutation({
    mutationFn: async () => ocrApi.auditJobsMaintenance(baseAuditPayload()),
    onSuccess: (data) => {
      setAuditResult(data);
      setSelectedDetail(null);
      setRecoverableBlockMessage(null);
      toast.success("Auditoria completada");
    },
    onError: (error) => handleHttpError(error, "No se pudo auditar"),
  });

  const detailMutation = useMutation({
    mutationFn: async (jobId: string) => ocrApi.getJobMaintenance(jobId),
    onSuccess: (data) => {
      const item = Array.isArray(data.items) && data.items.length ? data.items[0] : null;
      setSelectedDetail(item ?? null);
      setRecoverableBlockMessage(null);
      if (item?.job_id) setSelectedJobForDelete(item.job_id);
      toast.success("Diagnostico cargado");
    },
    onError: (error) => handleHttpError(error, "No se pudo consultar el diagnostico"),
  });

  const cleanupMutation = useMutation({
    mutationFn: async (dryRun: boolean) =>
      ocrApi.cleanupJobsMaintenance({
        ...baseAuditPayload(),
        dry_run: dryRun,
        delete_db_rows: deleteDbRows,
        delete_local_files: deleteLocalFiles,
        delete_azure_originals: deleteAzureOriginals,
        include_running_jobs: includeRunningJobs,
        confirm: dryRun ? "" : cleanupConfirmText,
      }),
    onSuccess: (data, dryRun) => {
      setAuditResult(data);
      setRecoverableBlockMessage(null);
      const skippedCount = numberValue(data.summary?.jobs_skipped_recoverable);
      const skippedMsg = skippedCount > 0 ? ` (${skippedCount} recuperables omitidos)` : "";
      toast.success(dryRun ? `Previsualizacion lista${skippedMsg}` : `Limpieza ejecutada${skippedMsg}`);
    },
    onError: (error) => handleHttpError(error, "No se pudo ejecutar la limpieza"),
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!selectedJobForDelete.trim()) throw new Error("Selecciona o escribe un job_id.");
      return ocrApi.deleteJobMaintenance(selectedJobForDelete.trim(), {
        dry_run: dryRun,
        delete_db_rows: deleteDbRows,
        delete_local_files: deleteLocalFiles,
        delete_azure_originals: deleteAzureOriginals,
        include_running_jobs: includeRunningJobs,
        confirm: dryRun ? "" : deleteConfirmText,
      });
    },
    onSuccess: (data, dryRun) => {
      const item = Array.isArray(data.items) && data.items.length ? data.items[0] : null;
      setSelectedDetail(item ?? null);
      setRecoverableBlockMessage(null);
      toast.success(dryRun ? "Dry run individual listo" : "Borrado individual ejecutado");
    },
    onError: (error) => handleHttpError(error, "No se pudo borrar el job"),
  });

  const items = auditResult?.items ?? [];
  const orphanDirs = auditResult?.orphan_output_dirs ?? [];
  const skippedRecoverable = auditResult?.skipped_recoverable_jobs ?? [];
  const summary = auditResult?.summary ?? {};

  const selectClass =
    "h-9 w-full rounded-md border border-white/10 bg-slate-900/80 px-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-400/50";

  return (
    <div className="space-y-4 pb-10">
      <section className="overflow-hidden rounded-2xl border border-amber-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-amber-950/35 shadow-xl shadow-amber-950/20">
        <div className="border-b border-white/5 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-amber-300" />
                <h1 className="font-heading text-xl font-semibold tracking-tight text-white sm:text-2xl">Mantenimiento de jobs</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Audita consistencia entre BD, archivos locales y blobs. Revisa primero, confirma despues.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-amber-300/30 bg-amber-500/10 text-amber-100">{accountName}</Badge>
              <Link href={`/accounts/${encodeURIComponent(accountName)}/jobs`}>
                <Button size="sm" variant="outline" className="h-8">
                  Historial
                </Button>
              </Link>
              <Button size="sm" variant="outline" className="h-8" onClick={() => auditMutation.mutate()} disabled={auditMutation.isPending}>
                {auditMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />}
                Auditar
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pb-4 sm:px-5">
          <Badge variant="outline" className="text-[10px]">Dry run primero</Badge>
          <Badge variant="outline" className="text-[10px]">DELETE_JOBS batch</Badge>
          <Badge variant="outline" className="text-[10px]">DELETE_JOB individual</Badge>
        </div>
      </section>

      <Card className="border-white/10 bg-white/5">
        <CardHeader className="gap-1 px-4 py-3 sm:px-5">
          <CardTitle className="text-base">Parametros de auditoria</CardTitle>
          <CardDescription className="text-xs">Filtros principales y opciones avanzadas colapsables.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4 sm:px-5">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="maintenance-account" className="text-xs">Cuenta</Label>
              <Input id="maintenance-account" className="h-9 text-sm" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="maintenance-module" className="text-xs">Modulo</Label>
              <select id="maintenance-module" value={jobModule} onChange={(e) => setJobModule(e.target.value)} className={selectClass}>
                <option value="all">Todos</option>
                <option value="promotions">promotions</option>
                <option value="shelf_recognition">shelf_recognition</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="maintenance-status" className="text-xs">Estado</Label>
              <select id="maintenance-status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
                <option value="all">Todos</option>
                <option value="queued">queued</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="partial_success">partial_success</option>
                <option value="failed">failed</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="maintenance-limit" className="text-xs">Limite</Label>
              <Input id="maintenance-limit" className="h-9 text-sm" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
          </div>

          <details className="rounded-lg border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-200">Opciones avanzadas</summary>
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="maintenance-jobids" className="text-xs">job_ids opcionales</Label>
                <Textarea
                  id="maintenance-jobids"
                  value={jobIdsText}
                  onChange={(e) => setJobIdsText(e.target.value)}
                  className="min-h-20 text-sm"
                  placeholder={"2026-06-03_15-03-41\n2026-06-03_15-18-02"}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <SectionSwitch id="maintenance-include-ok" label="Incluir jobs sanos" help="Muestra tambien jobs consistentes." checked={includeOk} onCheckedChange={setIncludeOk} />
                <SectionSwitch id="maintenance-include-files" label="Revisar archivos fisicos" help="Cruza BD con paths y archivos." checked={includeFiles} onCheckedChange={setIncludeFiles} />
                <SectionSwitch id="maintenance-delete-db" label="Borrar filas BD" help="Registros del job y relacionados." checked={deleteDbRows} onCheckedChange={setDeleteDbRows} />
                <SectionSwitch id="maintenance-delete-local" label="Borrar archivos locales" help="Artefactos y directorios del job." checked={deleteLocalFiles} onCheckedChange={setDeleteLocalFiles} />
                <SectionSwitch id="maintenance-delete-azure" label="Borrar originals Azure" help="Blobs original_image_cloud." checked={deleteAzureOriginals} onCheckedChange={setDeleteAzureOriginals} />
                <SectionSwitch id="maintenance-running" label="Permitir running/queued" help="Solo si el job ya no debe seguir vivo." checked={includeRunningJobs} onCheckedChange={setIncludeRunningJobs} />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Jobs auditados" value={numberValue(summary.jobs_scanned)} />
        <KpiCard label="Jobs retornados" value={numberValue(summary.jobs_returned)} />
        <KpiCard label="Recuperables" value={numberValue(summary.recoverable_jobs)} variant="amber" />
        <KpiCard label="Rotos" value={numberValue(summary.broken_jobs)} variant="destructive" />
        <KpiCard label="Dirs huerfanos" value={numberValue(summary.orphan_output_dirs)} />
      </div>

      {/* Recoverable block message banner */}
      {recoverableBlockMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-100">Borrado bloqueado por seguridad</p>
            <p className="mt-0.5 text-xs leading-5 text-amber-200/80">{recoverableBlockMessage}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Este job fue clasificado como recuperable por el backend porque aun existen artifacts validos. Revisa el detalle antes de forzar un borrado.
            </p>
          </div>
          <Button size="sm" variant="ghost" className="ml-auto h-7 shrink-0 text-xs text-amber-200" onClick={() => setRecoverableBlockMessage(null)}>
            Cerrar
          </Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card className="border-white/10 bg-white/5">
          <CardHeader className="gap-1 px-4 py-3 sm:px-5">
            <CardTitle className="text-base">Resultado de auditoria</CardTitle>
            <CardDescription className="text-xs">{items.length} jobs en el resultado actual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-0 pb-0 sm:px-0">
            <div className="max-h-[min(55vh,520px)] overflow-y-auto overscroll-contain">
              <div className="divide-y divide-white/5">
                {items.map((item) => {
                  const isRecoverable = item.health === "recoverable";
                  return (
                    <div key={`maint-${item.job_id}`} className={`flex flex-col gap-2 px-3 py-2.5 hover:bg-white/[0.03] sm:flex-row sm:items-start sm:gap-3 sm:px-4 ${isRecoverable ? "border-l-2 border-l-amber-400/40" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="max-w-[200px] truncate font-mono text-xs text-white sm:max-w-[260px]">{item.job_id}</p>
                          {healthBadge(item.health)}
                          <Badge variant="outline" className="h-5 text-[10px]">{item.job_module ?? "-"}</Badge>
                          <Badge variant="outline" className="h-5 text-[10px]">{item.status ?? "-"}</Badge>
                          {item.result?.inferred_from_output_dir && (
                            <Badge className="h-5 border-sky-400/30 bg-sky-500/10 text-[10px] text-sky-200">Inferido desde output</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[11px] text-slate-500">{filesSummary(item)}</span>
                          <div className="min-w-0 flex-1">{issueBadges(item)}</div>
                        </div>
                        {isRecoverable && recoverableReasonsList(item)}
                        {isRecoverable && item.result?.output_dir && (
                          <p className="mt-1 truncate font-mono text-[10px] text-slate-500" title={item.result.output_dir}>
                            output: {item.result.output_dir}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => detailMutation.mutate(item.job_id)}
                          disabled={detailMutation.isPending}
                        >
                          Diagnostico
                        </Button>
                        {!isRecoverable && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setSelectedJobForDelete(item.job_id);
                              deleteJobMutation.mutate(true);
                            }}
                            disabled={deleteJobMutation.isPending}
                          >
                            Dry run
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!items.length ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-400">
                    Ejecuta una auditoria para ver el estado de jobs, archivos y directorios.
                  </div>
                ) : null}
              </div>
            </div>

            {/* Skipped recoverable jobs section */}
            {skippedRecoverable.length > 0 && (
              <div className="mx-4 mb-3 rounded-lg border border-amber-300/20 bg-amber-500/5 p-3 sm:mx-5">
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-amber-300" />
                  <p className="text-sm font-medium text-amber-100">Jobs recuperables omitidos</p>
                  <Badge className="h-5 border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-200">{skippedRecoverable.length}</Badge>
                </div>
                <p className="mb-2 text-[11px] leading-4 text-amber-200/70">
                  Estos jobs fueron omitidos del cleanup porque backend detecto artifacts validos en output. No se recomienda borrarlos.
                </p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {skippedRecoverable.map((item) => (
                    <div key={`skip-${item.job_id}`} className="flex items-center gap-2 rounded-md border border-amber-300/10 bg-black/20 px-2.5 py-1.5">
                      <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-100">{item.job_id}</p>
                      {healthBadge(item.health)}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px] text-amber-200"
                        onClick={() => detailMutation.mutate(item.job_id)}
                        disabled={detailMutation.isPending}
                      >
                        Ver detalle
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skipped recoverable count from summary */}
            {numberValue(summary.jobs_skipped_recoverable) > 0 && skippedRecoverable.length === 0 && (
              <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-500/5 px-3 py-2.5 sm:mx-5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <p className="text-[11px] leading-4 text-amber-200/80">
                  {numberValue(summary.jobs_skipped_recoverable)} job(s) recuperable(s) fueron omitidos del cleanup.
                  Data recuperable detectada — artifacts validos encontrados en output.
                </p>
              </div>
            )}

            {/* Orphan dirs */}
            <div className="mx-4 mb-4 rounded-lg border border-white/10 bg-black/20 p-3 sm:mx-5">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                <p className="text-sm font-medium text-white">Directorios huerfanos</p>
                <Badge variant="outline" className="h-5 text-[10px]">{orphanDirs.length}</Badge>
              </div>
              <p className="mb-2 text-[11px] leading-4 text-slate-500">
                Solo se muestran directorios que backend clasifico como huerfanos. La clasificacion depende exclusivamente del backend.
              </p>
              {orphanDirs.length ? (
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {orphanDirs.map((orphan, idx) => (
                    <div key={`orphan-${idx}`} className="rounded-md border border-white/10 bg-slate-950/60 px-2.5 py-2 text-[11px]">
                      <p className="truncate font-mono text-slate-100">{orphan.path ?? orphan.name ?? "-"}</p>
                      <p className="mt-0.5 text-slate-500">
                        {orphan.orphan_type ?? "-"} · {orphan.files_count ?? "-"} arch · {formatBytes(orphan.size_bytes)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Sin directorios huerfanos en el resultado actual.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="gap-1 px-4 py-3 sm:px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-amber-300" />
                Limpieza batch
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-4 pb-4 sm:px-5">
              <p className="text-xs leading-5 text-slate-400">
                Dry run valida alcance. Limpieza real exige escribir <code className="text-amber-200">DELETE_JOBS</code>.
                Jobs recuperables seran omitidos automaticamente.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-8" onClick={() => cleanupMutation.mutate(true)} disabled={cleanupMutation.isPending}>
                  {cleanupMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />}
                  Dry run
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8"
                  onClick={() => cleanupMutation.mutate(false)}
                  disabled={cleanupMutation.isPending || cleanupConfirmText !== "DELETE_JOBS"}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Cleanup real
                </Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cleanup-confirm" className="text-xs">Confirmacion cleanup</Label>
                <Input id="cleanup-confirm" className="h-9 text-sm" value={cleanupConfirmText} onChange={(e) => setCleanupConfirmText(e.target.value)} placeholder="DELETE_JOBS" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="gap-1 px-4 py-3 sm:px-5">
              <CardTitle className="text-base">Borrado individual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-4 pb-4 sm:px-5">
              <p className="text-xs leading-5 text-slate-400">
                Borrado real exige escribir <code className="text-amber-200">DELETE_JOB</code>.
                {selectedDetail?.health === "recoverable" && (
                  <span className="mt-1 block text-amber-200/80">
                    Este job fue marcado como recuperable. El borrado sera bloqueado por backend salvo que se fuerce.
                  </span>
                )}
              </p>
              <div className="space-y-1">
                <Label htmlFor="delete-job-id" className="text-xs">job_id</Label>
                <Input
                  id="delete-job-id"
                  className="h-9 font-mono text-sm"
                  value={selectedJobForDelete}
                  onChange={(e) => setSelectedJobForDelete(e.target.value)}
                  placeholder="2026-06-03_15-03-41"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-8" onClick={() => deleteJobMutation.mutate(true)} disabled={deleteJobMutation.isPending}>
                  Dry run
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8"
                  onClick={() => deleteJobMutation.mutate(false)}
                  disabled={deleteJobMutation.isPending || deleteConfirmText !== "DELETE_JOB"}
                >
                  Delete real
                </Button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="delete-confirm" className="text-xs">Confirmacion delete</Label>
                <Input id="delete-confirm" className="h-9 text-sm" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE_JOB" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="gap-1 px-4 py-3 sm:px-5">
              <CardTitle className="text-base">Detalle del job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-4 pb-4 sm:px-5">
              {selectedDetail ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {healthBadge(selectedDetail.health)}
                    <Badge variant="outline" className="h-5 text-[10px]">{selectedDetail.job_module ?? "-"}</Badge>
                    <Badge variant="outline" className="h-5 text-[10px]">{selectedDetail.status ?? "-"}</Badge>
                    {selectedDetail.result?.inferred_from_output_dir && (
                      <Badge className="h-5 border-sky-400/30 bg-sky-500/10 text-[10px] text-sky-200">Inferido desde output</Badge>
                    )}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs">
                    <p className="font-mono text-[11px] text-slate-100">{selectedDetail.job_id}</p>
                    <div className="mt-2">{issueBadges(selectedDetail)}</div>
                  </div>

                  {/* Recoverable reasons */}
                  {selectedDetail.health === "recoverable" && (
                    <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-2.5 text-xs">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-amber-300" />
                        <p className="font-medium text-amber-100">Data recuperable detectada</p>
                      </div>
                      <p className="text-[11px] leading-4 text-amber-200/70">
                        Faltan referencias en DB, pero backend detecto artifacts validos en output. No se recomienda borrar este job.
                      </p>
                      {recoverableReasonsList(selectedDetail)}
                    </div>
                  )}

                  {/* Broken explanation */}
                  {selectedDetail.health === "broken" && (
                    <div className="rounded-lg border border-rose-300/20 bg-rose-500/5 p-2.5 text-xs">
                      <p className="font-medium text-rose-100">Job roto</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-rose-200/70">
                        Backend no detecto evidencia suficiente para recuperar artifacts ni referencias validas.
                      </p>
                    </div>
                  )}

                  {/* Result paths */}
                  {renderResultPaths(selectedDetail.result)}

                  {/* Inferred output signature */}
                  {renderOutputSignature(selectedDetail.inferred_output_signature)}

                  {Array.isArray(selectedDetail.azure_originals) && selectedDetail.azure_originals.length ? (
                    <div className="rounded-lg border border-amber-300/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-100">
                      {selectedDetail.azure_originals.length} blob(s) Azure candidatos si activas esa opcion.
                    </div>
                  ) : null}
                  <div className="max-h-[min(40vh,320px)] space-y-2 overflow-y-auto">
                    {renderJsonBlock("counts", selectedDetail.counts ?? {})}
                    {renderJsonBlock("result", selectedDetail.result ?? {})}
                    {renderJsonBlock("files", selectedDetail.files ?? {})}
                    {renderJsonBlock("azure_originals", selectedDetail.azure_originals ?? [])}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">Carga un diagnostico para revisar archivos, rutas y blobs Azure.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
