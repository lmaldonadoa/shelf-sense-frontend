"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, FileUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createAccountConfigSchema, HttpError, maskSensitiveConfig, ocrApi } from "@/lib/ocrApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export default function ConfigsPage() {
  const [accountName, setAccountName] = useState("colgate_ecuador");
  const [configNameFilter, setConfigNameFilter] = useState("default");
  const [showActiveJson, setShowActiveJson] = useState(false);
  const [showFormJson, setShowFormJson] = useState(false);
  const [form, setForm] = useState({ name: "default", version: "v1", is_active: true, config: '{\n  "threshold": 0.8\n}' });

  const configsQuery = useQuery({
    queryKey: ["account-configs", accountName, configNameFilter],
    queryFn: () => ocrApi.getConfigs(accountName, configNameFilter || undefined),
    enabled: Boolean(accountName.trim()),
  });

  const activeConfigQuery = useQuery({
    queryKey: ["active-account-config", accountName, configNameFilter],
    queryFn: () => ocrApi.getActiveConfig(accountName, configNameFilter || undefined),
    enabled: Boolean(accountName.trim()),
    retry: false,
  });

  const createConfig = useMutation({
    mutationFn: (payload: { accountName: string; body: Parameters<typeof ocrApi.createAccountConfig>[1] }) =>
      ocrApi.createAccountConfig(payload.accountName, payload.body),
    onSuccess: () => {
      toast.success("Versión creada");
      configsQuery.refetch();
      activeConfigQuery.refetch();
    },
    onError: (error) => {
      const message = error instanceof HttpError ? error.detail : "Error inesperado";
      toast.error("No se pudo crear la configuración", { description: message });
    },
  });

  const activateConfig = useMutation({
    mutationFn: (configId: string | number) => ocrApi.activateAccountConfig(accountName, configId),
    onSuccess: () => {
      toast.success("Configuración activada");
      configsQuery.refetch();
      activeConfigQuery.refetch();
    },
    onError: (error) => {
      const message = error instanceof HttpError ? error.detail : "Error inesperado";
      toast.error("No se pudo activar", { description: message });
    },
  });

  const activeConfigPreview = useMemo(() => {
    if (!activeConfigQuery.data) return null;
    return maskSensitiveConfig(activeConfigQuery.data.config);
  }, [activeConfigQuery.data]);

  async function loadJsonFile(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      setForm((prev) => ({ ...prev, config: text }));
      setShowFormJson(true);
      toast.success("JSON cargado");
    } catch {
      toast.error("El archivo no contiene JSON válido");
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let configJson: Record<string, unknown>;
    try {
      configJson = JSON.parse(form.config) as Record<string, unknown>;
    } catch {
      toast.error("El campo config debe ser JSON válido");
      return;
    }

    const parsed = createAccountConfigSchema.safeParse({ name: form.name, version: form.version, is_active: form.is_active, config: configJson });
    if (!parsed.success) {
      toast.error("Formulario inválido", { description: parsed.error.issues[0]?.message ?? "Revisa campos" });
      return;
    }

    createConfig.mutate({ accountName, body: parsed.data });
  }

  const activeNotFound = activeConfigQuery.error instanceof HttpError && activeConfigQuery.error.status === 404;
  const activeError = activeConfigQuery.error instanceof HttpError ? activeConfigQuery.error.detail : null;
  const configsError = configsQuery.error instanceof HttpError ? configsQuery.error.detail : null;

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Configuración por cuenta</CardTitle>
          <CardDescription className="text-slate-300">Contrato backend: `GET /accounts/{'{account_name}'}/configs` retorna `configs: []`.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>account_name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></div>
          <div className="space-y-2"><Label>name (opcional)</Label><Input value={configNameFilter} onChange={(e) => setConfigNameFilter(e.target.value)} placeholder="vacío = todas" /></div>
          <div className="md:col-span-2 flex gap-2">
            <Button type="button" variant="outline" onClick={() => { configsQuery.refetch(); activeConfigQuery.refetch(); }}>Consultar</Button>
            <Button type="button" variant="ghost" onClick={() => setConfigNameFilter("")}>Ver todas</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Config activa</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {activeConfigQuery.isLoading ? <div className="space-y-2"><Skeleton className="h-5 w-44" /><Skeleton className="h-20 w-full" /></div> : null}
          {activeNotFound ? <p className="text-sm text-muted-foreground">Sin configuración activa.</p> : null}
          {activeError && !activeNotFound ? <p className="text-sm text-destructive">{activeError}</p> : null}
          {activeConfigQuery.data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{activeConfigQuery.data.name}</Badge><Badge variant="secondary">{activeConfigQuery.data.version}</Badge><Badge variant="outline">Activa</Badge>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowActiveJson((v) => !v)}>{showActiveJson ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}{showActiveJson ? "Ocultar JSON" : "Ver JSON"}</Button>
              </div>
              {showActiveJson ? <pre className="max-h-56 overflow-auto rounded-md border border-white/10 bg-black/35 p-3 text-xs">{JSON.stringify(activeConfigPreview, null, 2)}</pre> : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Versiones</CardTitle></CardHeader>
        <CardContent>
          {configsQuery.isLoading ? <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div> : null}
          {configsError ? <p className="text-sm text-destructive">{configsError}</p> : null}
          {!configsQuery.isLoading && !configsError && configsQuery.data && configsQuery.data.configs.length === 0 ? <p className="text-sm text-muted-foreground">No hay configuraciones para esta cuenta.</p> : null}
          {configsQuery.data && configsQuery.data.configs.length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Estado</TableHead><TableHead>Creado</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader>
              <TableBody>
                {configsQuery.data.configs.map((cfg) => (
                  <TableRow key={String(cfg.id)}>
                    <TableCell>{cfg.version}</TableCell>
                    <TableCell><Badge variant={cfg.is_active ? "default" : "secondary"}>{cfg.is_active ? "Activa" : "Inactiva"}</Badge></TableCell>
                    <TableCell>{cfg.created_at ?? "-"}</TableCell>
                    <TableCell><Button size="sm" variant="outline" disabled={cfg.is_active || activateConfig.isPending} onClick={() => activateConfig.mutate(cfg.id)}>{activateConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Activar</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle className="font-heading text-2xl">Crear versión</CardTitle><CardDescription className="text-slate-300">Carga por archivo o editor JSON.</CardDescription></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><Label>name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>version</Label><Input value={form.version} onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))} /></div>
              <div className="flex items-end"><div className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/20 p-3"><span className="text-sm">is_active</span><Switch checked={form.is_active} onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))} /></div></div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="config_file" className="inline-flex cursor-pointer items-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"><FileUp className="mr-2 h-4 w-4" /> Subir JSON</Label>
              <Input id="config_file" type="file" accept="application/json,.json" className="hidden" onChange={(e) => loadJsonFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowFormJson((v) => !v)}>{showFormJson ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}{showFormJson ? "Ocultar editor" : "Mostrar editor JSON"}</Button>
            </div>
            {showFormJson ? <div className="space-y-2"><Label>config JSON</Label><Textarea className="min-h-56 font-mono" value={form.config} onChange={(e) => setForm((p) => ({ ...p, config: e.target.value }))} /></div> : null}
            <Button type="submit" disabled={createConfig.isPending}>{createConfig.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Crear versión</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
