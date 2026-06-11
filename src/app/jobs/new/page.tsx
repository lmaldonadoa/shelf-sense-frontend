"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  ImageIcon,
  Loader2,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { CreateJobRequest, UploadItem } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadPanel } from "@/components/jobs/upload-panel";
import { UploadedFilesTable } from "@/components/jobs/uploaded-files-table";
import { CreateJobForm } from "@/components/jobs/create-job-form";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff", "image/x-tiff"]);

function StepBadge({ step, label, active }: { step: number; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${active ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-black/20 text-slate-400"}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${active ? "bg-cyan-500/30 text-cyan-50" : "bg-slate-800 text-slate-400"}`}>
        {step}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedItems, setUploadedItems] = useState<UploadItem[]>([]);
  const [lastConnectionMsg, setLastConnectionMsg] = useState<string>("");
  const [compactMode, setCompactMode] = useState(false);
  const [currentOperationId, setCurrentOperationId] = useState<string | null>(null);
  const [operationToJob, setOperationToJob] = useState<Record<string, string>>({});
  const [lastCreatePayload, setLastCreatePayload] = useState<CreateJobRequest | null>(null);
  const [form, setForm] = useState({
    account_name: "colgate_ecuador",
    config_name: "default",
    id_pdv: "",
    subcategoria: "",
    usuario_relevo: "",
    db_excel: "",
    output_name: "",
    use_skip_qwen: false,
    skip_qwen: false,
    use_cadena: false,
    cadena: "rosado",
    use_export_excel: false,
    export_excel: true,
    showTechnical: false,
    imagePathsText: "",
  });

  const healthQuery = useQuery({ queryKey: ["health"], queryFn: ocrApi.getHealth, refetchInterval: 10000 });

  const testConnection = useMutation({
    mutationFn: () => ocrApi.getHealth(),
    onSuccess: () => {
      const msg = `OK - ${ocrApi.backendUrl}`;
      setLastConnectionMsg(msg);
      toast.success("Conexión backend OK", { description: msg });
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : "Error inesperado";
      const msg = `${detail} (URL: ${ocrApi.backendUrl})`;
      setLastConnectionMsg(msg);
      toast.error("Backend no alcanzable desde este entorno.", { description: "Revisa NEXT_PUBLIC_API_BASE_URL" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => ocrApi.uploadImages(form.account_name, files),
    onSuccess: (data) => {
      setUploadedItems(data.uploaded);
      toast.success("Imágenes subidas", { description: `${data.uploaded.length} archivo(s) cargados` });
    },
    onError: (error) => {
      const message = error instanceof HttpError ? error.message : "Error inesperado";
      toast.error("Error al subir imágenes", { description: message });
    },
  });

  const createJobMutation = useMutation({
    mutationFn: async (args: { payload: CreateJobRequest; operationId: string }) =>
      ocrApi.createJob(args.payload, { idempotencyKey: args.operationId }),
    onSuccess: (data, variables) => {
      setOperationToJob((prev) => ({ ...prev, [variables.operationId]: data.job_id }));
      const initialQueueDetail = (data.status ?? "").toLowerCase() === "queued" ? "Trabajo en cola" : null;
      const posLookupLabel =
        data.pos_lookup_status === "found"
          ? "PDV encontrado"
          : data.pos_lookup_status === "not_found"
            ? "PDV no encontrado"
            : data.pos_lookup_status === "missing_id_pdv"
              ? "PDV faltante"
              : data.pos_lookup_status === "error"
                ? "Error lookup PDV"
                : null;
      const extraDetail = [initialQueueDetail, posLookupLabel, data.cadena_resuelta ? `Cadena: ${data.cadena_resuelta}` : null].filter(Boolean).join(" · ");
      if (data.created_new === false) {
        toast.message("Se reutilizó un job existente para evitar duplicados.", {
          description: extraDetail ? `ID: ${data.job_id} · ${extraDetail}` : `ID: ${data.job_id}`,
        });
      } else {
        toast.success("Job creado", {
          description: extraDetail ? `ID: ${data.job_id} · ${extraDetail}` : `ID: ${data.job_id}`,
        });
      }
      router.push(`/jobs/${data.job_id}`);
    },
    onError: (error) => {
      if (
        error instanceof HttpError &&
        error.status === 409 &&
        error.detail.includes("idempotency_key_reused_with_different_payload")
      ) {
        const acceptRetry = window.confirm("Se reutilizo la misma clave de idempotencia con payload distinto. ¿Generar nueva operación y reintentar?");
        if (acceptRetry) {
          const newOperationId = crypto.randomUUID();
          setCurrentOperationId(newOperationId);
          if (lastCreatePayload) {
            createJobMutation.mutate({ payload: lastCreatePayload, operationId: newOperationId });
          }
        }
        toast.error("Conflicto de idempotencia", {
          description: "Se reintento con la misma clave de idempotencia pero payload distinto.",
        });
        return;
      }
      if (error instanceof HttpError && error.status === 422) {
        const lowDetail = error.detail.toLowerCase();
        if (lowDetail.includes("id_pdv")) {
          toast.error("No se pudo crear job", { description: "El punto de venta es obligatorio." });
          return;
        }
        if (lowDetail.includes("subcategoria")) {
          toast.error("No se pudo crear job", { description: "La subcategoría es obligatoria." });
          return;
        }
      }
      const message = error instanceof HttpError ? error.message : "Error inesperado";
      toast.error("No se pudo crear job", { description: message });
    },
  });

  useEffect(() => {
    try {
      const actor = window.localStorage.getItem("ocr_admin_actor")?.trim();
      if (actor) {
        setForm((prev) => (prev.usuario_relevo ? prev : { ...prev, usuario_relevo: actor }));
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  function validateFiles(files: File[]) {
    if (files.length === 0) return "Selecciona al menos un archivo";
    if (files.length > MAX_FILES) return `Máximo ${MAX_FILES} archivos`;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) return `${file.name} excede 10MB`;
      const mimeOk = ALLOWED_TYPES.has(file.type);
      const extOk = /\.(jpe?g|png|webp|tiff?)$/i.test(file.name);
      if (!mimeOk && !extOk) return `${file.name} tiene tipo no soportado`;
    }
    return null;
  }

  function onUpload() {
    const validation = validateFiles(selectedFiles);
    if (validation) {
      toast.error("Validación de archivos", { description: validation });
      return;
    }
    uploadMutation.mutate(selectedFiles);
  }

  function onCreateJob() {
    const image_paths = form.imagePathsText.split("\n").map((x) => x.trim()).filter(Boolean);

    const payload: CreateJobRequest = {
      account_name: form.account_name,
      config_name: form.config_name || undefined,
      id_pdv: form.id_pdv.trim(),
      subcategoria: form.subcategoria.trim(),
      usuario_relevo: form.usuario_relevo.trim() || null,
      image_file_ids: !form.showTechnical ? uploadedItems.map((x) => x.file_id) : undefined,
      image_paths: form.showTechnical ? image_paths : undefined,
      db_excel: form.db_excel || null,
      output_name: form.output_name || null,
      skip_qwen: form.use_skip_qwen ? form.skip_qwen : null,
      cadena: form.use_cadena ? form.cadena : null,
      export_excel: form.use_export_excel ? form.export_excel : null,
    };

    if (!form.showTechnical && !payload.image_file_ids?.length) {
      toast.error("Primero sube imágenes", { description: "No hay file_ids disponibles" });
      return;
    }
    if (form.showTechnical && !payload.image_paths?.length) {
      toast.error("Modo técnico vacío", { description: "Agrega image_paths" });
      return;
    }
    if (!payload.id_pdv) {
      toast.error("Validación", { description: "Ingresa el ID del punto de venta." });
      return;
    }
    if (!payload.subcategoria) {
      toast.error("Validación", { description: "Ingresa la subcategoría." });
      return;
    }

    const operationId = currentOperationId ?? crypto.randomUUID();
    setCurrentOperationId(operationId);
    setLastCreatePayload(payload);
    createJobMutation.mutate({ payload, operationId });
  }

  const healthLabel = healthQuery.isError ? "No disponible" : healthQuery.isLoading ? "Consultando" : "Operativa";
  const healthTone = healthQuery.isError
    ? "border-rose-400/40 bg-rose-500/15 text-rose-100"
    : healthQuery.isLoading
      ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
      : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";

  const uploadError = uploadMutation.error instanceof HttpError ? uploadMutation.error.message : null;

  const flowStep = useMemo(() => {
    const hasUpload = form.showTechnical
      ? form.imagePathsText.split("\n").map((x) => x.trim()).filter(Boolean).length > 0
      : uploadedItems.length > 0;
    if (!hasUpload) return 1;
    if (!form.id_pdv.trim() || !form.subcategoria.trim()) return 2;
    return 3;
  }, [form.showTechnical, form.imagePathsText, uploadedItems.length, form.id_pdv, form.subcategoria]);

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-cyan-950/50 shadow-xl shadow-cyan-950/20">
        <div className="border-b border-white/5 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-300" />
                <h1 className="font-heading text-xl font-semibold tracking-tight text-white sm:text-2xl">Nuevo Job OCR</h1>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Sube imágenes de góndola, configura PDV y lanza el pipeline OCR + Vision en cola.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={healthTone}>{healthLabel}</Badge>
              <Badge variant="outline" className="border-white/15 text-slate-300">{form.account_name}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <StepBadge step={1} label="Subir imágenes" active={flowStep === 1} />
            <ChevronRight className="hidden h-4 w-4 self-center text-slate-600 sm:block" />
            <StepBadge step={2} label="Configurar job" active={flowStep === 2} />
            <ChevronRight className="hidden h-4 w-4 self-center text-slate-600 sm:block" />
            <StepBadge step={3} label="Crear y encolar" active={flowStep === 3} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
              {testConnection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
              Probar backend
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCompactMode((v) => !v)}>
              {compactMode ? "Vista amplia" : "Vista compacta"}
            </Button>
          </div>
        </div>
        {lastConnectionMsg ? (
          <p className="border-t border-white/5 px-5 pb-4 text-xs text-slate-500 sm:px-6">{lastConnectionMsg}</p>
        ) : null}
      </section>

      <div className={`grid gap-6 ${compactMode ? "xl:grid-cols-[1fr_1fr]" : "xl:grid-cols-[1.05fr_0.95fr]"}`}>
        <div className="space-y-4">
          <UploadPanel files={selectedFiles} onFilesChange={setSelectedFiles} onUpload={onUpload} isUploading={uploadMutation.isPending} />

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4 text-cyan-300" />
                Resumen de carga
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-3 text-center">
                  <p className="text-[11px] text-cyan-200/80">Seleccionados</p>
                  <p className="font-heading text-2xl font-semibold text-cyan-50">{selectedFiles.length}</p>
                </div>
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-center">
                  <p className="text-[11px] text-emerald-200/80">Subidos OK</p>
                  <p className="font-heading text-2xl font-semibold text-emerald-50">{uploadedItems.length}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                  <p className="text-[11px] text-slate-400">Estado</p>
                  <p className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-200">
                    {uploadMutation.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…</>
                    ) : uploadedItems.length > 0 ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Listo</>
                    ) : (
                      "Pendiente"
                    )}
                  </p>
                </div>
              </div>
              {uploadError ? <p className="mt-3 text-sm text-rose-300">Error: {uploadError}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Archivos subidos ({uploadedItems.length})</CardTitle>
              <CardDescription>file_ids listos para el payload del job.</CardDescription>
            </CardHeader>
            <CardContent>
              {uploadedItems.length ? (
                <UploadedFilesTable uploaded={uploadedItems} />
              ) : (
                <p className="text-sm text-slate-400">Aún no hay archivos subidos. Completa el paso 1.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <CreateJobForm
            form={form}
            onChange={setForm}
            onSubmit={onCreateJob}
            isCreating={createJobMutation.isPending}
            uploadedFileIds={uploadedItems.map((x) => x.file_id)}
            compactMode={compactMode}
          />

          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-slate-300" />
                Conexión y sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-slate-400">
                Backend: <span className="font-mono text-xs text-slate-300">{ocrApi.backendUrl}</span>
              </p>
              <p className="flex items-center gap-2 text-slate-400">
                <Zap className="h-3.5 w-3.5" />
                Tras crear, redirige al detalle del job con estado de cola en vivo.
              </p>
            </CardContent>
          </Card>

          {currentOperationId ? (
            <Card className="border-white/10 bg-white/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Idempotencia</CardTitle>
                <CardDescription>Evita duplicar jobs si repites la misma operación.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-slate-300">
                <p>operationId: <span className="font-mono text-slate-100">{currentOperationId}</span></p>
                <p>job asociado: <span className="font-mono text-slate-100">{operationToJob[currentOperationId] ?? "—"}</span></p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}