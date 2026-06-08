"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, Loader2, Wifi } from "lucide-react";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { CreateJobRequest, UploadItem } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadPanel } from "@/components/jobs/upload-panel";
import { UploadedFilesTable } from "@/components/jobs/uploaded-files-table";
import { CreateJobForm } from "@/components/jobs/create-job-form";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff", "image/x-tiff"]);

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
  const healthVariant = healthQuery.isError ? "destructive" : healthQuery.isLoading ? "secondary" : "default";
  const uploadError = uploadMutation.error instanceof HttpError ? uploadMutation.error.message : null;

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><Activity className="h-5 w-5" /> API OCR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-3"><Badge variant={healthVariant}>{healthLabel}</Badge><p className="text-muted-foreground">Backend: {ocrApi.backendUrl}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
              {testConnection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
              Probar conexión backend
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCompactMode((v) => !v)}>
              {compactMode ? "Modo normal" : "Modo compacto"}
            </Button>
            {lastConnectionMsg ? <p className="text-xs text-muted-foreground">{lastConnectionMsg}</p> : null}
          </div>
        </CardContent>
      </Card>

      <div className={`grid gap-6 ${compactMode ? "xl:grid-cols-[1fr_1fr]" : "xl:grid-cols-[1.1fr_1fr]"}`}>
        <div className="space-y-4">
          <UploadPanel files={selectedFiles} onFilesChange={setSelectedFiles} onUpload={onUpload} isUploading={uploadMutation.isPending} />
          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle className="text-base">Resumen de carga</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Seleccionados</p><p className="text-lg font-semibold">{selectedFiles.length}</p></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Subidos OK</p><p className="text-lg font-semibold">{uploadedItems.length}</p></div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Estado</p><p className="text-sm">{uploadMutation.isPending ? "Subiendo..." : "Listo"}</p></div>
              {uploadError ? <p className="sm:col-span-3 text-destructive">Error: {uploadError}</p> : null}
            </CardContent>
          </Card>
          <details className={`rounded-lg border border-white/10 bg-white/5 ${compactMode ? "p-2.5" : "p-3"}`}>
            <summary className="cursor-pointer text-sm font-medium text-slate-100">Ver archivos subidos ({uploadedItems.length})</summary>
            <div className="mt-3">
              <UploadedFilesTable uploaded={uploadedItems} />
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <CreateJobForm form={form} onChange={setForm} onSubmit={onCreateJob} isCreating={createJobMutation.isPending} uploadedFileIds={uploadedItems.map((x) => x.file_id)} compactMode={compactMode} />
          {currentOperationId ? (
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardHeader><CardTitle className="text-base">Idempotencia</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs text-slate-300">
                <p>operationId actual: <span className="font-mono">{currentOperationId}</span></p>
                <p>job asociado: <span className="font-mono">{operationToJob[currentOperationId] ?? "-"}</span></p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
