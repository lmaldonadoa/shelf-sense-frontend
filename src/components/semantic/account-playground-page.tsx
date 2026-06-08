"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { CreateJobRequest, UploadItem } from "@/types/ocr-api";
import { JobMonitorPanel } from "@/components/semantic/job-monitor-panel";
import { UploadPanel } from "@/components/jobs/upload-panel";
import { UploadedFilesTable } from "@/components/jobs/uploaded-files-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff", "image/x-tiff"]);

type AccountPlaygroundPageProps = {
  account: string;
};

export function AccountPlaygroundPage({ account }: AccountPlaygroundPageProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedItems, setUploadedItems] = useState<UploadItem[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [form, setForm] = useState({
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
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => ocrApi.uploadImages(account, files),
    onSuccess: (data) => {
      setUploadedItems(data.uploaded);
      toast.success("Upload OK", { description: `${data.uploaded.length} archivo(s)` });
    },
    onError: (error) => toast.error("Upload falló", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const createJobMutation = useMutation({
    mutationFn: (payload: CreateJobRequest) => ocrApi.createJob(payload),
    onSuccess: (data) => {
      setJobId(data.job_id);
      toast.success("Job creado", { description: data.job_id });
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 422) {
        const lowDetail = error.detail.toLowerCase();
        if (lowDetail.includes("id_pdv")) {
          toast.error("Create job falló", { description: "El punto de venta es obligatorio." });
          return;
        }
        if (lowDetail.includes("subcategoria")) {
          toast.error("Create job falló", { description: "La subcategoría es obligatoria." });
          return;
        }
      }
      toast.error("Create job falló", { description: error instanceof HttpError ? error.message : "Error inesperado" });
    },
  });

  function validateFiles(files: File[]) {
    if (files.length === 0) return "Selecciona archivos";
    if (files.length > MAX_FILES) return `Máximo ${MAX_FILES} archivos`;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) return `${file.name} excede 10MB`;
      const mimeOk = ALLOWED_TYPES.has(file.type);
      const extOk = /\.(jpe?g|png|webp|tiff?)$/i.test(file.name);
      if (!mimeOk && !extOk) return `${file.name} no soportado`;
    }
    return null;
  }

  function onUpload() {
    const err = validateFiles(selectedFiles);
    if (err) {
      toast.error("Validación", { description: err });
      return;
    }
    uploadMutation.mutate(selectedFiles);
  }

  function onCreateJob() {
    if (!uploadedItems.length) {
      toast.error("Sube imágenes primero");
      return;
    }
    if (!form.id_pdv.trim()) {
      toast.error("Validación", { description: "Ingresa el ID del punto de venta." });
      return;
    }
    if (!form.subcategoria.trim()) {
      toast.error("Validación", { description: "Ingresa la subcategoría." });
      return;
    }

    createJobMutation.mutate({
      account_name: account,
      config_name: form.config_name,
      id_pdv: form.id_pdv.trim(),
      subcategoria: form.subcategoria.trim(),
      usuario_relevo: form.usuario_relevo.trim() || null,
      image_file_ids: uploadedItems.map((x) => x.file_id),
      db_excel: form.db_excel || null,
      output_name: form.output_name || null,
      skip_qwen: form.use_skip_qwen ? form.skip_qwen : null,
      cadena: form.use_cadena ? form.cadena : null,
      export_excel: form.use_export_excel ? form.export_excel : null,
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Playground OCR · {account}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <UploadPanel files={selectedFiles} onFilesChange={setSelectedFiles} onUpload={onUpload} isUploading={uploadMutation.isPending} />
          <UploadedFilesTable uploaded={uploadedItems} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>config_name</Label><Input value={form.config_name} onChange={(e) => setForm((p) => ({ ...p, config_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>ID PDV / Punto de venta *</Label><Input value={form.id_pdv} onChange={(e) => setForm((p) => ({ ...p, id_pdv: e.target.value }))} placeholder="PDV-001" /></div>
            <div className="space-y-2"><Label>Subcategoría *</Label><Input value={form.subcategoria} onChange={(e) => setForm((p) => ({ ...p, subcategoria: e.target.value }))} placeholder="LIMPIAPISOS" /></div>
            <div className="space-y-2"><Label>Usuario relevo</Label><Input value={form.usuario_relevo} onChange={(e) => setForm((p) => ({ ...p, usuario_relevo: e.target.value }))} placeholder="Usuario logueado" /></div>
            <div className="space-y-2"><Label>output_name</Label><Input value={form.output_name} onChange={(e) => setForm((p) => ({ ...p, output_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>db_excel</Label><Input value={form.db_excel} onChange={(e) => setForm((p) => ({ ...p, db_excel: e.target.value }))} /></div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-sm">skip_qwen</span><Switch checked={form.use_skip_qwen} onCheckedChange={(v) => setForm((p) => ({ ...p, use_skip_qwen: v }))} /></div><Switch checked={form.skip_qwen} disabled={!form.use_skip_qwen} onCheckedChange={(v) => setForm((p) => ({ ...p, skip_qwen: v }))} /></div>
            <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-sm">cadena</span><Switch checked={form.use_cadena} onCheckedChange={(v) => setForm((p) => ({ ...p, use_cadena: v }))} /></div><Input value={form.cadena} disabled={!form.use_cadena} onChange={(e) => setForm((p) => ({ ...p, cadena: e.target.value }))} /></div>
            <div className="rounded-lg border border-white/10 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-sm">export_excel</span><Switch checked={form.use_export_excel} onCheckedChange={(v) => setForm((p) => ({ ...p, use_export_excel: v }))} /></div><Switch checked={form.export_excel} disabled={!form.use_export_excel} onCheckedChange={(v) => setForm((p) => ({ ...p, export_excel: v }))} /></div>
          </div>

          <Button onClick={onCreateJob} disabled={createJobMutation.isPending}>Crear Job OCR</Button>
        </CardContent>
      </Card>

      {jobId ? <JobMonitorPanel jobId={jobId} /> : null}
    </div>
  );
}
