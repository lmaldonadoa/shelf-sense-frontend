"use client";

import { useMemo } from "react";
import { CheckCircle2, Loader2, Play, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

function ReadyPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${ok ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/15 bg-black/20 text-slate-400"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />}
      {label}
    </span>
  );
}

export function CreateJobForm({ form, uploadedFileIds, onChange, onSubmit, isCreating, compactMode = false }: CreateJobFormProps) {
  const technicalImagePathsCount = useMemo(
    () => form.imagePathsText.split("\n").map((x) => x.trim()).filter(Boolean).length,
    [form.imagePathsText],
  );

  const hasImages = form.showTechnical ? technicalImagePathsCount > 0 : uploadedFileIds.length > 0;
  const hasPdv = Boolean(form.id_pdv.trim());
  const hasSubcat = Boolean(form.subcategoria.trim());
  const canSubmit = hasImages && hasPdv && hasSubcat && !isCreating;

  return (
    <Card className="border-white/10 bg-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-lime-400/40 bg-lime-500/20 text-xs font-semibold text-lime-100">2</span>
          Configurar y crear job
        </CardTitle>
        <CardDescription className="text-slate-300">
          Completa PDV y subcategoría. Por defecto usa los file_ids subidos en el paso 1.
        </CardDescription>
      </CardHeader>
      <CardContent className={compactMode ? "space-y-3" : "space-y-4"}>
        <div className="flex flex-wrap gap-2">
          <ReadyPill ok={hasImages} label={form.showTechnical ? `${technicalImagePathsCount} paths` : `${uploadedFileIds.length} imágenes`} />
          <ReadyPill ok={hasPdv} label="PDV" />
          <ReadyPill ok={hasSubcat} label="Subcategoría" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Cuenta</Label>
            <Input value={form.account_name} onChange={(e) => onChange({ ...form, account_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Config OCR</Label>
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
          <div className="space-y-2 md:col-span-2">
            <Label>output_name (opcional)</Label>
            <Input value={form.output_name} onChange={(e) => onChange({ ...form, output_name: e.target.value })} />
          </div>
        </div>

        <details className={`rounded-lg border border-white/10 bg-black/20 ${compactMode ? "p-2.5" : "p-3"}`}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-200">
            <Settings2 className="h-4 w-4 text-slate-400" />
            Opciones avanzadas
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between text-sm"><span>skip_qwen</span><Switch checked={form.use_skip_qwen} onCheckedChange={(v) => onChange({ ...form, use_skip_qwen: v })} /></div>
              <Switch checked={form.skip_qwen} disabled={!form.use_skip_qwen} onCheckedChange={(v) => onChange({ ...form, skip_qwen: v })} />
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between text-sm"><span>cadena</span><Switch checked={form.use_cadena} onCheckedChange={(v) => onChange({ ...form, use_cadena: v })} /></div>
              <Input value={form.cadena} disabled={!form.use_cadena} onChange={(e) => onChange({ ...form, cadena: e.target.value })} />
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between text-sm"><span>export_excel</span><Switch checked={form.use_export_excel} onCheckedChange={(v) => onChange({ ...form, use_export_excel: v })} /></div>
              <Switch checked={form.export_excel} disabled={!form.use_export_excel} onCheckedChange={(v) => onChange({ ...form, export_excel: v })} />
            </div>
          </div>
        </details>

        <div className={`rounded-lg border border-white/10 bg-black/20 ${compactMode ? "p-2.5" : "p-3"}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-200">Modo técnico (legacy image_paths)</p>
              <p className="text-xs text-slate-400">Solo para rutas directas en servidor, sin upload previo.</p>
            </div>
            <Switch checked={form.showTechnical} onCheckedChange={(v) => onChange({ ...form, showTechnical: v })} />
          </div>
          {form.showTechnical ? (
            <div className="space-y-2">
              <Textarea
                value={form.imagePathsText}
                onChange={(e) => onChange({ ...form, imagePathsText: e.target.value })}
                placeholder="Una ruta por línea"
                className="min-h-28 border-white/10 bg-slate-950"
              />
              <p className="text-xs text-muted-foreground">image_paths detectadas: {technicalImagePathsCount}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Usando image_file_ids del upload: <Badge variant="outline" className="ml-1">{uploadedFileIds.length}</Badge></p>
          )}
        </div>

        <div className="rounded-xl border border-lime-300/25 bg-lime-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-lime-100">Paso 3 · Lanzar OCR</p>
              <p className="mt-1 text-xs text-lime-200/80">
                {canSubmit ? "Todo listo. El job se encolará y te redirigiremos al detalle." : "Completa imágenes, PDV y subcategoría para continuar."}
              </p>
            </div>
            <Button onClick={onSubmit} disabled={!canSubmit} size="lg" className="border-lime-300/30 bg-lime-500/25 text-lime-50 hover:bg-lime-500/35">
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Crear Job OCR
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}