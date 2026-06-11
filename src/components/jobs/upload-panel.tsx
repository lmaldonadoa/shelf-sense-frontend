"use client";

import { FileUp, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type UploadPanelProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onUpload: () => void;
  isUploading: boolean;
};

export function UploadPanel({ files, onFilesChange, onUpload, isUploading }: UploadPanelProps) {
  return (
    <Card className="border-cyan-300/20 bg-gradient-to-br from-cyan-500/10 to-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/20 text-xs font-semibold text-cyan-100">1</span>
          Seleccionar y subir imágenes
        </CardTitle>
        <CardDescription className="text-slate-300">
          JPEG, PNG, WebP o TIFF · máx. 50 archivos · 10 MB c/u
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-cyan-400/30 bg-black/20 px-4 py-8 transition hover:border-cyan-400/50 hover:bg-black/30">
          <ImageIcon className="mb-2 h-8 w-8 text-cyan-300/80" />
          <p className="text-sm font-medium text-slate-200">Arrastra o haz clic para elegir imágenes</p>
          <p className="mt-1 text-xs text-slate-400">{files.length ? `${files.length} archivo(s) seleccionado(s)` : "Ningún archivo aún"}</p>
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/*"
            onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
            className="sr-only"
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            {files.length > 0 ? `Listo para subir ${files.length} imagen(es)` : "Selecciona al menos una imagen"}
          </p>
          <Button onClick={onUpload} disabled={isUploading || files.length === 0} className="border-cyan-300/30 bg-cyan-500/20 text-cyan-50 hover:bg-cyan-500/30">
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
            Subir imágenes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}