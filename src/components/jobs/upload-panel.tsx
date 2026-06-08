"use client";

import { FileUp } from "lucide-react";
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
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>1. Seleccionar y subir imágenes</CardTitle>
        <CardDescription className="text-slate-300">Máximo 50 archivos, 10MB por archivo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/*"
          onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
        />
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Seleccionados: {files.length}</p>
          <Button onClick={onUpload} disabled={isUploading || files.length === 0}>
            <FileUp className="mr-2 h-4 w-4" /> Subir imágenes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
