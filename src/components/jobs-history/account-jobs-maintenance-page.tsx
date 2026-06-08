"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCcw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobsMaintenanceAuditItem, JobsMaintenanceAuditResponse } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  if (health === "ok") return <Badge>OK</Badge>;
  if (health === "broken") return <Badge variant="destructive">Roto</Badge>;
  return <Badge variant="outline">{health || "-"}</Badge>;
}

function issueBadges(item: JobsMaintenanceAuditItem) {
  const issues = Array.isArray(item.issues) ? item.issues : [];
  if (!issues.length) return <span className="text-xs text-slate-400">Sin incidencias reportadas</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {issues.map((issue) => (
        <Badge key={`${item.job_id}-${issue}`} variant="outline">
          {issue}
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
  if (generated) parts.push(`${generated} generados`);
  if (sourceNotDeleted) parts.push(`${sourceNotDeleted} source`);
  return parts.length ? parts.join(" / ") : "-";
}

function renderJsonBlock(title: string, value: unknown) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
      <p className="mb-2 font-medium text-slate-100">{title}</p>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all text-slate-300">{JSON.stringify(value ?? {}, null, 2)}</pre>
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
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={id} className="text-sm text-slate-100">
            {label}
          </Label>
          <p className="text-xs leading-5 text-slate-400">{help}</p>
        </div>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
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

  const auditMutation = useMutation({
    mutationFn: async () => ocrApi.auditJobsMaintenance(baseAuditPayload()),
    onSuccess: (data) => {
      setAuditResult(data);
      setSelectedDetail(null);
      toast.success("Auditoria completada");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo auditar", { description: detail });
    },
  });

  const detailMutation = useMutation({
    mutationFn: async (jobId: string) => ocrApi.getJobMaintenance(jobId),
    onSuccess: (data) => {
      const item = Array.isArray(data.items) && data.items.length ? data.items[0] : null;
      setSelectedDetail(item ?? null);
      if (item?.job_id) setSelectedJobForDelete(item.job_id);
      toast.success("Diagnostico cargado");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo consultar el diagnostico", { description: detail });
    },
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
      toast.success(dryRun ? "Previsualizacion lista" : "Limpieza ejecutada");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo ejecutar la limpieza", { description: detail });
    },
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
      toast.success(dryRun ? "Dry run individual listo" : "Borrado individual ejecutado");
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo borrar el job", { description: detail });
    },
  });

  const items = auditResult?.items ?? [];
  const orphanDirs = auditResult?.orphan_output_dirs ?? [];
  const summary = auditResult?.summary ?? {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Administracion tecnica</p>
          <div>
            <h1 className="font-heading text-2xl text-white">{accountName} - Mantenimiento de jobs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Audita consistencia entre base de datos, archivos locales y blobs de origen. El flujo esta preparado para
              revisar primero y borrar despues, con confirmacion explicita.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/accounts/${encodeURIComponent(accountName)}/jobs`}>
            <Button variant="outline">Volver al historial</Button>
          </Link>
          <Button variant="outline" onClick={() => auditMutation.mutate()} disabled={auditMutation.isPending}>
            {auditMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Auditar ahora
          </Button>
        </div>
      </div>

      <Card className="border-amber-300/20 bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-950">
        <CardContent className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-100">Flujo seguro recomendado</p>
            <p className="text-sm leading-6 text-slate-300">
              1. Ejecuta auditoria o dry run. 2. Revisa jobs rotos y carpetas huerfanas. 3. Confirma solo cuando estes
              conforme con el alcance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Dry run primero</Badge>
            <Badge variant="outline">DELETE_JOBS para batch</Badge>
            <Badge variant="outline">DELETE_JOB para individual</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Filtro de auditoria</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="maintenance-account">account_name</Label>
              <Input id="maintenance-account" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-module">job_module</Label>
              <select
                id="maintenance-module"
                value={jobModule}
                onChange={(e) => setJobModule(e.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="promotions">promotions</option>
                <option value="shelf_recognition">shelf_recognition</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-status">status</Label>
              <select
                id="maintenance-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="queued">queued</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="partial_success">partial_success</option>
                <option value="failed">failed</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenance-limit">limit</Label>
              <Input id="maintenance-limit" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maintenance-jobids">job_ids opcionales</Label>
            <Textarea
              id="maintenance-jobids"
              value={jobIdsText}
              onChange={(e) => setJobIdsText(e.target.value)}
              className="min-h-28"
              placeholder={"2026-06-03_15-03-41\n2026-06-03_15-18-02"}
            />
            <p className="text-xs text-slate-400">Puedes pegar uno por linea o separados por coma si quieres revisar un grupo puntual.</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <SectionSwitch
              id="maintenance-include-ok"
              label="Incluir jobs sanos"
              help="Muestra tambien jobs consistentes para comparar y no solo los rotos."
              checked={includeOk}
              onCheckedChange={setIncludeOk}
            />
            <SectionSwitch
              id="maintenance-include-files"
              label="Revisar archivos fisicos"
              help="Cruza resultados de base de datos con paths generados y archivos presentes."
              checked={includeFiles}
              onCheckedChange={setIncludeFiles}
            />
            <SectionSwitch
              id="maintenance-delete-db"
              label="Borrar filas de base de datos"
              help="Incluye registros del job y entidades relacionadas en operaciones de limpieza."
              checked={deleteDbRows}
              onCheckedChange={setDeleteDbRows}
            />
            <SectionSwitch
              id="maintenance-delete-local"
              label="Borrar archivos locales"
              help="Incluye artefactos locales del job y directorios asociados."
              checked={deleteLocalFiles}
              onCheckedChange={setDeleteLocalFiles}
            />
            <SectionSwitch
              id="maintenance-delete-azure"
              label="Borrar originals en Azure"
              help="Solo afecta blobs de original_image_cloud cuando el backend los reporta para ese job."
              checked={deleteAzureOriginals}
              onCheckedChange={setDeleteAzureOriginals}
            />
            <SectionSwitch
              id="maintenance-running"
              label="Permitir running o queued"
              help="Usa esto solo cuando sepas que el job ya no debe seguir vivo."
              checked={includeRunningJobs}
              onCheckedChange={setIncludeRunningJobs}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Jobs auditados</p>
            <p className="mt-2 text-2xl font-semibold text-white">{numberValue(summary.jobs_scanned)}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Jobs retornados</p>
            <p className="mt-2 text-2xl font-semibold text-white">{numberValue(summary.jobs_returned)}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Jobs rotos</p>
            <p className="mt-2 text-2xl font-semibold text-white">{numberValue(summary.broken_jobs)}</p>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Directorios huerfanos</p>
            <p className="mt-2 text-2xl font-semibold text-white">{numberValue(summary.orphan_output_dirs)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader>
            <CardTitle>Resultado de auditoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>job_id</TableHead>
                    <TableHead>Modulo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Salud</TableHead>
                    <TableHead>Archivos</TableHead>
                    <TableHead>Incidencias</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={`maint-${item.job_id}`}>
                      <TableCell className="font-mono text-xs">{item.job_id}</TableCell>
                      <TableCell>{item.job_module ?? "-"}</TableCell>
                      <TableCell>{item.status ?? "-"}</TableCell>
                      <TableCell>{healthBadge(item.health)}</TableCell>
                      <TableCell className="text-xs text-slate-300">{filesSummary(item)}</TableCell>
                      <TableCell className="max-w-80">{issueBadges(item)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => detailMutation.mutate(item.job_id)} disabled={detailMutation.isPending}>
                            Diagnostico
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedJobForDelete(item.job_id);
                              deleteJobMutation.mutate(true);
                            }}
                            disabled={deleteJobMutation.isPending}
                          >
                            Dry run delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!items.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">
                        Ejecuta una auditoria para ver jobs rotos, archivos faltantes o directorios huerfanos.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-300" />
                <p className="text-sm font-medium text-white">Directorios huerfanos detectados</p>
              </div>
              {orphanDirs.length ? (
                <div className="space-y-2 text-xs text-slate-200">
                  {orphanDirs.map((orphan, idx) => (
                    <div key={`orphan-${idx}`} className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
                      <p className="font-mono text-slate-100">{orphan.path ?? orphan.name ?? "-"}</p>
                      <p className="mt-2 text-slate-400">
                        tipo: {orphan.orphan_type ?? "-"} | archivos: {orphan.files_count ?? "-"} | tamano: {formatBytes(orphan.size_bytes)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Todavia no hay directorios huerfanos en el resultado actual.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader>
              <CardTitle>Limpieza batch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-6 text-slate-300">
                Usa el dry run para validar el alcance. La limpieza real exige escribir exactamente <code>DELETE_JOBS</code>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => cleanupMutation.mutate(true)} disabled={cleanupMutation.isPending}>
                  {cleanupMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                  Dry run cleanup
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => cleanupMutation.mutate(false)}
                  disabled={cleanupMutation.isPending || cleanupConfirmText !== "DELETE_JOBS"}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Ejecutar cleanup real
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleanup-confirm">Confirmacion exacta para cleanup real</Label>
                <Input
                  id="cleanup-confirm"
                  value={cleanupConfirmText}
                  onChange={(e) => setCleanupConfirmText(e.target.value)}
                  placeholder="DELETE_JOBS"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader>
              <CardTitle>Borrado individual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-6 text-slate-300">
                Selecciona un job concreto para revisar y luego eliminar. El borrado real exige escribir exactamente <code>DELETE_JOB</code>.
              </p>
              <div className="space-y-2">
                <Label htmlFor="delete-job-id">job_id</Label>
                <Input
                  id="delete-job-id"
                  value={selectedJobForDelete}
                  onChange={(e) => setSelectedJobForDelete(e.target.value)}
                  placeholder="2026-06-03_15-03-41"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => deleteJobMutation.mutate(true)} disabled={deleteJobMutation.isPending}>
                  Dry run delete
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteJobMutation.mutate(false)}
                  disabled={deleteJobMutation.isPending || deleteConfirmText !== "DELETE_JOB"}
                >
                  Delete real
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delete-confirm">Confirmacion exacta para delete real</Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE_JOB"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader>
              <CardTitle>Detalle del job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedDetail ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {healthBadge(selectedDetail.health)}
                    <Badge variant="outline">{selectedDetail.job_module ?? "-"}</Badge>
                    <Badge variant="outline">{selectedDetail.status ?? "-"}</Badge>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-200">
                    <p className="font-mono">{selectedDetail.job_id}</p>
                    <div className="mt-3">{issueBadges(selectedDetail)}</div>
                  </div>
                  {Array.isArray(selectedDetail.azure_originals) && selectedDetail.azure_originals.length ? (
                    <div className="rounded-xl border border-amber-300/20 bg-amber-500/5 p-3 text-xs text-amber-100">
                      Este job reporta {selectedDetail.azure_originals.length} blob(s) de origen en Azure candidatos para limpieza si activas esa opcion.
                    </div>
                  ) : null}
                  {renderJsonBlock("counts", selectedDetail.counts ?? {})}
                  {renderJsonBlock("files", selectedDetail.files ?? {})}
                  {renderJsonBlock("azure_originals", selectedDetail.azure_originals ?? [])}
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Carga un diagnostico para revisar archivos faltantes, rutas generadas y blobs Azure detectados.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
