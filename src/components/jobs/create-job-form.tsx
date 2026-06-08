"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type JobFormState = {
  account_name: string;
  config_name: string;
  id_pdv: string;
  subcategoria: string;
  usuario_relevo: string;
  db_excel: string;
  output_name: string;
  use_skip_qwen: boolean;
  skip_qwen: boolean;
  use_cadena: boolean;
  cadena: string;
  use_export_excel: boolean;
  export_excel: boolean;
  showTechnical: boolean;
  imagePathsText: string;
};

type CreateJobFormProps = {
  form: JobFormState;
  uploadedFileIds: string[];
  onChange: (next: JobFormState) => void;
  onSubmit: () => void;
  isCreating: boolean;
  compactMode?: boolean;
};

export function CreateJobForm({ form, uploadedFileIds, onChange, onSubmit, isCreating, compactMode = false }: CreateJobFormProps) {
  const technicalImagePathsCount = useMemo(
    () => form.imagePathsText.split("\n").map((x) => x.trim()).filter(Boolean).length,
    [form.imagePathsText],
  );

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Crear Job OCR</CardTitle>
        <CardDescription className="text-slate-300">Flujo principal: `image_file_ids` subidos.</CardDescription>
      </CardHeader>
      <CardContent className={compactMode ? "space-y-3" : "space-y-4"}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>account_name</Label>
            <Input value={form.account_name} onChange={(e) => onChange({ ...form, account_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>config_name</Label>
            <Input value={form.config_name} onChange={(e) => onChange({ ...form, config_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>ID PDV / Punto de venta *</Label>
            <Input value={form.id_pdv} onChange={(e) => onChange({ ...form, id_pdv: e.target.value })} placeholder="PDV-001" />
          </div>
          <div className="space-y-2">
            <Label>Subcategoría *</Label>
            <Input value={form.subcategoria} onChange={(e) => onChange({ ...form, subcategoria: e.target.value })} placeholder="LIMPIAPISOS" />
          </div>
          <div className="space-y-2">
            <Label>Usuario relevo</Label>
            <Input value={form.usuario_relevo} onChange={(e) => onChange({ ...form, usuario_relevo: e.target.value })} placeholder="Usuario logueado" />
          </div>
          <div className="space-y-2">
            <Label>db_excel (opcional)</Label>
            <Input value={form.db_excel} onChange={(e) => onChange({ ...form, db_excel: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>output_name (opcional)</Label>
            <Input value={form.output_name} onChange={(e) => onChange({ ...form, output_name: e.target.value })} />
          </div>
        </div>

        <details className={`rounded-lg border border-white/10 bg-black/20 ${compactMode ? "p-2.5" : "p-3"}`}>
          <summary className="cursor-pointer text-sm font-medium">Opciones avanzadas</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 p-3">
              <div className="mb-2 flex items-center justify-between text-sm"><span>skip_qwen</span><Switch checked={form.use_skip_qwen} onCheckedChange={(v) => onChange({ ...form, use_skip_qwen: v })} /></div>
              <Switch checked={form.skip_qwen} disabled={!form.use_skip_qwen} onCheckedChange={(v) => onChange({ ...form, skip_qwen: v })} />
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <div className="mb-2 flex items-center justify-between text-sm"><span>cadena</span><Switch checked={form.use_cadena} onCheckedChange={(v) => onChange({ ...form, use_cadena: v })} /></div>
              <Input value={form.cadena} disabled={!form.use_cadena} onChange={(e) => onChange({ ...form, cadena: e.target.value })} />
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <div className="mb-2 flex items-center justify-between text-sm"><span>export_excel</span><Switch checked={form.use_export_excel} onCheckedChange={(v) => onChange({ ...form, use_export_excel: v })} /></div>
              <Switch checked={form.export_excel} disabled={!form.use_export_excel} onCheckedChange={(v) => onChange({ ...form, export_excel: v })} />
            </div>
          </div>
        </details>

        <div className={`rounded-lg border border-white/10 ${compactMode ? "p-2.5" : "p-3"}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Modo técnico (legacy image_paths)</p>
            <Switch checked={form.showTechnical} onCheckedChange={(v) => onChange({ ...form, showTechnical: v })} />
          </div>
          {form.showTechnical ? (
            <div className="space-y-2">
              <Textarea
                value={form.imagePathsText}
                onChange={(e) => onChange({ ...form, imagePathsText: e.target.value })}
                placeholder="Una ruta por línea"
                className="min-h-28"
              />
              <p className="text-xs text-muted-foreground">image_paths detectadas: {technicalImagePathsCount}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Usando `image_file_ids`: {uploadedFileIds.length}</p>
          )}
        </div>

        <Button onClick={onSubmit} disabled={isCreating}>
          {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Crear Job OCR
        </Button>
      </CardContent>
    </Card>
  );
}
