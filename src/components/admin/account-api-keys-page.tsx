"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Copy, KeyRound, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Props = { account: string };

type ApiKeyRow = {
  id: string | number;
  key_name?: string | null;
  key_prefix?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  last_used_at?: string | null;
};

type AccountConfigRow = {
  id: string | number;
  name?: string;
  version?: string | number;
  is_active?: boolean | number;
  created_at?: string | null;
  updated_at?: string | null;
};

function toRows(payload: unknown): ApiKeyRow[] {
  if (Array.isArray(payload)) return payload as ApiKeyRow[];
  if (payload && typeof payload === "object") {
    const x = payload as Record<string, unknown>;
    if (Array.isArray(x.items)) return x.items as ApiKeyRow[];
    if (Array.isArray(x.api_keys)) return x.api_keys as ApiKeyRow[];
    if (Array.isArray(x.data)) return x.data as ApiKeyRow[];
  }
  return [];
}

function toConfigRows(payload: unknown): AccountConfigRow[] {
  if (Array.isArray(payload)) return payload as AccountConfigRow[];
  if (payload && typeof payload === "object") {
    const x = payload as Record<string, unknown>;
    if (Array.isArray(x.configs)) return x.configs as AccountConfigRow[];
    if (Array.isArray(x.items)) return x.items as AccountConfigRow[];
  }
  return [];
}

function toDetail(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const message = (error as { message?: string }).message;
  return message || fallback;
}

export function AccountApiKeysPage({ account }: Props) {
  const [accountName, setAccountName] = useState(account);
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [lastSecret, setLastSecret] = useState<string | null>(null);
  const [accountApiKey, setAccountApiKey] = useState("");
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [e2eJobId, setE2eJobId] = useState<string | null>(null);
  const [e2eResults, setE2eResults] = useState<unknown>(null);
  const [e2eIdPdv, setE2eIdPdv] = useState("PDV-001");
  const [e2eSubcategoria, setE2eSubcategoria] = useState("LIMPIAPISOS");
  const [e2eUsuarioRelevo, setE2eUsuarioRelevo] = useState("");
  const [bootstrapKeyName, setBootstrapKeyName] = useState("bootstrap-admin");
  const [bootstrapConfigName, setBootstrapConfigName] = useState("default");
  const [bootstrapVersion, setBootstrapVersion] = useState("vX");
  const [showConfigCreate, setShowConfigCreate] = useState(false);
  const [newConfigName, setNewConfigName] = useState("default");
  const [newConfigVersion, setNewConfigVersion] = useState("vX");
  const [newConfigJson, setNewConfigJson] = useState("{\n  \"text_enrichment\": {\n    \"enabled\": true,\n    \"semantic_rag\": { \"enabled\": true, \"limit\": 8, \"rollout_mode\": \"apply\" },\n    \"semantic_scope_guardrails\": { \"enabled\": true }\n  }\n}");

  const headers = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (typeof window === "undefined") return out;
    const actor = (window.localStorage.getItem("ocr_admin_actor") ?? "frontend-admin").trim();
    if (actor) out["x-admin-actor"] = actor;
    return out;
  }, []);

  const listQuery = useQuery({
    queryKey: ["admin-api-keys", accountName],
    queryFn: async () => {
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/api-keys`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.detail ? String(body.detail) : "No se pudo listar API keys";
        throw new Error(detail);
      }
      return body;
    },
    enabled: Boolean(accountName.trim()),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ key_name: keyName.trim(), is_active: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.detail ? String(body.detail) : "No se pudo crear API key";
        throw new Error(detail);
      }
      return body as Record<string, unknown>;
    },
    onSuccess: (data) => {
      const secret =
        typeof data.secret_api_key === "string"
          ? data.secret_api_key
          : typeof data.api_key === "string"
            ? data.api_key
            : null;
      setLastSecret(secret);
      if (secret && !accountApiKey) setAccountApiKey(secret);
      setKeyName("");
      setShowCreate(false);
      toast.success("API key creada");
      void listQuery.refetch();
    },
    onError: (error) => toast.error("Error creando API key", { description: toDetail(error, "Error desconocido") }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (keyId: string | number) => {
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/api-keys/${encodeURIComponent(String(keyId))}`, {
        method: "DELETE",
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.detail ? String(body.detail) : "No se pudo desactivar API key";
        throw new Error(detail);
      }
      return body;
    },
    onSuccess: () => {
      toast.success("API key desactivada");
      void listQuery.refetch();
    },
    onError: (error) => toast.error("Error desactivando API key", { description: toDetail(error, "Error desconocido") }),
  });

  const rows = toRows(listQuery.data);

  const configsQuery = useQuery({
    queryKey: ["admin-account-configs", accountName, accountApiKey],
    queryFn: async () => {
      const query = new URLSearchParams();
      query.set("account_api_key", accountApiKey);
      query.set("name", "default");
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/configs?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "No se pudo listar configuraciones");
      return body;
    },
    enabled: Boolean(accountName.trim() && accountApiKey.trim()),
  });

  const bootstrapMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          key_name: bootstrapKeyName.trim() || "bootstrap-admin",
          config_name: bootstrapConfigName.trim() || "default",
          version: bootstrapVersion.trim() || "vX",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "No se pudo ejecutar bootstrap");
      return body as Record<string, unknown>;
    },
    onSuccess: (data) => {
      const secret = typeof data.secret_api_key === "string" ? data.secret_api_key : null;
      if (secret) {
        setLastSecret(secret);
        setAccountApiKey(secret);
      }
      toast.success("Cuenta bootstrap creada", { description: "API key + config inicial activa" });
      void listQuery.refetch();
      void configsQuery.refetch();
    },
    onError: (error) => toast.error("Error en bootstrap", { description: toDetail(error, "Error desconocido") }),
  });

  const createConfigMutation = useMutation({
    mutationFn: async () => {
      let parsedConfig: Record<string, unknown>;
      try {
        parsedConfig = JSON.parse(newConfigJson) as Record<string, unknown>;
      } catch {
        throw new Error("JSON de config inválido.");
      }
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          account_api_key: accountApiKey,
          name: newConfigName.trim() || "default",
          version: newConfigVersion.trim() || "vX",
          is_active: true,
          config: parsedConfig,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "No se pudo crear configuración");
      return body;
    },
    onSuccess: () => {
      toast.success("Configuración creada y activada");
      setShowConfigCreate(false);
      void configsQuery.refetch();
    },
    onError: (error) => toast.error("Error creando configuración", { description: toDetail(error, "Error desconocido") }),
  });

  const activateConfigMutation = useMutation({
    mutationFn: async (configId: string | number) => {
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/configs/${encodeURIComponent(String(configId))}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ account_api_key: accountApiKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "No se pudo activar configuración");
      return body;
    },
    onSuccess: () => {
      toast.success("Configuración activada");
      void configsQuery.refetch();
    },
    onError: (error) => toast.error("Error activando configuración", { description: toDetail(error, "Error desconocido") }),
  });

  const configRows = toConfigRows(configsQuery.data);

  const connectionTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/connection/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_api_key: accountApiKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "Error probando conexion");
      return body;
    },
    onSuccess: () => toast.success("Conexion OCR validada"),
    onError: (error) => toast.error("Fallo de autenticacion/conexion", { description: toDetail(error, "Error desconocido") }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("account_api_key", accountApiKey);
      formData.append("files", file);
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/uploads/images`, {
        method: "POST",
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "Error subiendo imagen");
      return body as Record<string, unknown>;
    },
    onSuccess: (data) => {
      const uploaded = Array.isArray(data.uploaded) ? data.uploaded : [];
      const ids = uploaded
        .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>).file_id : null))
        .filter((x): x is string => typeof x === "string");
      setUploadedFileIds(ids);
      toast.success(`Imagen subida (${ids.length} file_id)`);
    },
    onError: (error) => toast.error("Error en upload", { description: toDetail(error, "Error desconocido") }),
  });

  const createJobMutation = useMutation({
    mutationFn: async () => {
      if (!e2eIdPdv.trim()) throw new Error("Ingresa el ID del punto de venta.");
      if (!e2eSubcategoria.trim()) throw new Error("Ingresa la subcategoría.");
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          account_api_key: accountApiKey,
          image_file_ids: uploadedFileIds,
          account_name: accountName,
          id_pdv: e2eIdPdv.trim(),
          subcategoria: e2eSubcategoria.trim(),
          usuario_relevo: e2eUsuarioRelevo.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "Error creando job");
      return body as Record<string, unknown>;
    },
    onSuccess: (data) => {
      const jobId = typeof data.job_id === "string" ? data.job_id : null;
      setE2eJobId(jobId);
      toast.success(jobId ? `Job creado: ${jobId}` : "Job creado");
    },
    onError: (error) => toast.error("Error creando job", { description: toDetail(error, "Error desconocido") }),
  });

  const fetchResultsMutation = useMutation({
    mutationFn: async () => {
      if (!e2eJobId) throw new Error("No hay job_id");
      const res = await fetch(`/admin/ocr/accounts/${encodeURIComponent(accountName)}/jobs/${encodeURIComponent(e2eJobId)}/results`, {
        method: "GET",
        headers: { "x-account-api-key": accountApiKey },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "Error leyendo results");
      return body;
    },
    onSuccess: (data) => {
      setE2eResults(data);
      toast.success("Results leidos");
    },
    onError: (error) => toast.error("Error leyendo results", { description: toDetail(error, "Error desconocido") }),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-slate-400">
          <Link href={`/accounts/${encodeURIComponent(accountName)}/config`} className="hover:text-slate-200">Cuenta {accountName}</Link>
          {" > "}API Keys
        </p>
        <h1 className="font-heading text-2xl text-white">Administracion de API Keys</h1>
        <p className="text-xs text-slate-300">Gestion interna de keys por cuenta. La clave admin vive solo en backend.</p>
      </div>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Filtros y acciones</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div className="space-y-2">
              <Label>account_name</Label>
              <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => void listQuery.refetch()} className="self-end" disabled={listQuery.isFetching}>
              {listQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Actualizar
            </Button>
            <Button onClick={() => setShowCreate((p) => !p)} className="self-end">
              <KeyRound className="mr-2 h-4 w-4" />
              Crear key
            </Button>
          </div>

          {showCreate ? (
            <div className="rounded-md border border-white/10 bg-black/20 p-3 space-y-3">
              <div className="space-y-2">
                <Label>key_name</Label>
                <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="integracion_mobile_ecuador" />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!keyName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirmar creacion
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              </div>
            </div>
          ) : null}

          {lastSecret ? (
            <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-100">secret_api_key (solo se muestra una vez)</p>
              <pre className="mt-2 max-h-24 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{lastSecret}</pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  void navigator.clipboard.writeText(lastSecret);
                  toast.success("Secret copiado");
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-cyan-300/20 bg-cyan-500/10 backdrop-blur">
        <CardHeader><CardTitle>Onboarding de cuenta (1 clic)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-200">
            Crea la cuenta operativa de forma rápida: genera una <code>ACCOUNT_API_KEY</code> y una configuración inicial activa.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>key_name</Label>
              <Input value={bootstrapKeyName} onChange={(e) => setBootstrapKeyName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>config_name</Label>
              <Input value={bootstrapConfigName} onChange={(e) => setBootstrapConfigName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>version</Label>
              <Input value={bootstrapVersion} onChange={(e) => setBootstrapVersion(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => bootstrapMutation.mutate()} disabled={!accountName.trim() || bootstrapMutation.isPending}>
              {bootstrapMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear cuenta + key + config inicial
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Listado de API keys</CardTitle></CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : listQuery.error ? (
            <p className="text-sm text-rose-300">{toDetail(listQuery.error, "No se pudo cargar listado")}</p>
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground">No hay API keys para esta cuenta.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>id</TableHead>
                    <TableHead>key_name</TableHead>
                    <TableHead>key_prefix</TableHead>
                    <TableHead>is_active</TableHead>
                    <TableHead>created_at</TableHead>
                    <TableHead>last_used_at</TableHead>
                    <TableHead>accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`api-key-${String(row.id)}`}>
                      <TableCell>{String(row.id)}</TableCell>
                      <TableCell>{row.key_name ?? "-"}</TableCell>
                      <TableCell>{row.key_prefix ?? "-"}</TableCell>
                      <TableCell>{row.is_active ? <Badge>activa</Badge> : <Badge variant="secondary">inactiva</Badge>}</TableCell>
                      <TableCell>{row.created_at ?? "-"}</TableCell>
                      <TableCell>{row.last_used_at ?? "-"}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!row.is_active || deactivateMutation.isPending}
                          onClick={() => {
                            const ok = window.confirm(`Desactivar key "${row.key_name ?? row.id}"?`);
                            if (!ok) return;
                            deactivateMutation.mutate(row.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Desactivar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Conexion OCR y prueba E2E</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>ACCOUNT_API_KEY (cuenta)</Label>
            <Input
              type="password"
              value={accountApiKey}
              onChange={(e) => setAccountApiKey(e.target.value)}
              placeholder="Pegar key de cuenta (no se guarda en localStorage)"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>ID PDV / Punto de venta *</Label>
              <Input value={e2eIdPdv} onChange={(e) => setE2eIdPdv(e.target.value)} placeholder="PDV-001" />
            </div>
            <div className="space-y-2">
              <Label>Subcategoría *</Label>
              <Input value={e2eSubcategoria} onChange={(e) => setE2eSubcategoria(e.target.value)} placeholder="LIMPIAPISOS" />
            </div>
            <div className="space-y-2">
              <Label>Usuario relevo</Label>
              <Input value={e2eUsuarioRelevo} onChange={(e) => setE2eUsuarioRelevo(e.target.value)} placeholder="usuario@empresa.com" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => connectionTestMutation.mutate()} disabled={!accountApiKey || connectionTestMutation.isPending}>
              {connectionTestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test /health + autenticado
            </Button>
            <label className="inline-flex items-center">
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  uploadMutation.mutate(file);
                  e.currentTarget.value = "";
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center rounded-md border border-white/15 bg-white/5 px-3 text-sm hover:bg-white/10">
                Subir imagen (E2E)
              </span>
            </label>
            <Button
              variant="outline"
              onClick={() => createJobMutation.mutate()}
              disabled={!accountApiKey || !uploadedFileIds.length || createJobMutation.isPending}
            >
              {createJobMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear job (E2E)
            </Button>
            <Button
              variant="outline"
              onClick={() => fetchResultsMutation.mutate()}
              disabled={!accountApiKey || !e2eJobId || fetchResultsMutation.isPending}
            >
              {fetchResultsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Leer results (E2E)
            </Button>
          </div>

          <div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs space-y-1">
            <p>file_ids cargados: {uploadedFileIds.length ? uploadedFileIds.join(", ") : "-"}</p>
            <p>job_id E2E: {e2eJobId ?? "-"}</p>
          </div>

          {e2eResults ? (
            <details>
              <summary className="cursor-pointer text-cyan-200 text-xs">Ver JSON de results</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(e2eResults, null, 2)}</pre>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Configuraciones de la cuenta</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void configsQuery.refetch()} disabled={!accountApiKey || configsQuery.isFetching}>
              {configsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refrescar configs
            </Button>
            <Button variant="outline" onClick={() => setShowConfigCreate((p) => !p)} disabled={!accountApiKey}>
              {showConfigCreate ? "Cerrar editor" : "Nueva configuración"}
            </Button>
          </div>

          {showConfigCreate ? (
            <div className="space-y-3 rounded-md border border-white/10 bg-black/20 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>name</Label>
                  <Input value={newConfigName} onChange={(e) => setNewConfigName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>version</Label>
                  <Input value={newConfigVersion} onChange={(e) => setNewConfigVersion(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>config JSON</Label>
                <textarea
                  className="min-h-44 w-full rounded-md border border-white/15 bg-black/30 p-2 font-mono text-xs text-slate-100"
                  value={newConfigJson}
                  onChange={(e) => setNewConfigJson(e.target.value)}
                />
              </div>
              <Button onClick={() => createConfigMutation.mutate()} disabled={!accountApiKey || createConfigMutation.isPending}>
                {createConfigMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar configuración (activa)
              </Button>
            </div>
          ) : null}

          {!accountApiKey ? (
            <p className="text-xs text-amber-200">Para gestionar configuraciones, primero pega una ACCOUNT_API_KEY o ejecuta el onboarding.</p>
          ) : null}

          {configsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando configuraciones...</p>
          ) : configsQuery.error ? (
            <p className="text-sm text-rose-300">{toDetail(configsQuery.error, "No se pudieron cargar configuraciones")}</p>
          ) : !configRows.length ? (
            <p className="text-sm text-muted-foreground">No hay configuraciones para esta cuenta.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>id</TableHead>
                    <TableHead>name</TableHead>
                    <TableHead>version</TableHead>
                    <TableHead>activa</TableHead>
                    <TableHead>updated_at</TableHead>
                    <TableHead>accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configRows.map((row) => (
                    <TableRow key={`cfg-${String(row.id)}`}>
                      <TableCell>{String(row.id)}</TableCell>
                      <TableCell>{row.name ?? "-"}</TableCell>
                      <TableCell>{String(row.version ?? "-")}</TableCell>
                      <TableCell>{row.is_active ? <Badge>sí</Badge> : <Badge variant="secondary">no</Badge>}</TableCell>
                      <TableCell>{row.updated_at ?? row.created_at ?? "-"}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={Boolean(row.is_active) || activateConfigMutation.isPending || !accountApiKey}
                          onClick={() => activateConfigMutation.mutate(row.id)}
                        >
                          Activar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
