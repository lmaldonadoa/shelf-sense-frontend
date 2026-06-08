"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = { account: string };

type InboundEventRow = {
  id?: string | number;
  external_event_id?: string;
  event_type?: string;
  source_ref?: string;
  account_name?: string;
  process_status?: string;
  error_message?: string | null;
  received_at?: string;
  processed_at?: string | null;
  payload?: unknown;
};

function parseRows(payload: unknown): InboundEventRow[] {
  if (Array.isArray(payload)) return payload as InboundEventRow[];
  if (payload && typeof payload === "object") {
    const x = payload as Record<string, unknown>;
    if (Array.isArray(x.events)) return x.events as InboundEventRow[];
    if (Array.isArray(x.items)) return x.items as InboundEventRow[];
    if (Array.isArray(x.data)) return x.data as InboundEventRow[];
  }
  return [];
}

function errDetail(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: string }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

export function AccountInboundWhatsappPage({ account }: Props) {
  const [tab, setTab] = useState<"config" | "events" | "processing" | "audit">("config");
  const [accountName, setAccountName] = useState(account);
  const [statusFilter, setStatusFilter] = useState("");
  const [limit, setLimit] = useState("50");
  const [selectedPayload, setSelectedPayload] = useState<unknown>(null);

  const configQuery = useQuery({
    queryKey: ["inbound-whatsapp-config"],
    queryFn: async () => {
      const res = await fetch("/admin/ocr/inbound/whatsapp/config", { method: "GET", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "No se pudo leer configuración");
      return body as Record<string, unknown>;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["inbound-whatsapp-events", accountName, statusFilter, limit],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("account_name", accountName);
      if (statusFilter.trim()) qs.set("status", statusFilter.trim());
      qs.set("limit", limit || "50");
      const res = await fetch(`/admin/ocr/inbound/whatsapp/events?${qs.toString()}`, { method: "GET", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "No se pudo listar eventos");
      return body;
    },
    enabled: tab === "events" || tab === "audit" || tab === "processing",
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/admin/ocr/inbound/whatsapp/config/test-verify", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "Verify falló");
      return body as Record<string, unknown>;
    },
    onSuccess: (data) => {
      toast.success("Verify handshake ejecutado", { description: `verified=${String(data.verified)}` });
    },
    onError: (error) => toast.error("Error en verify", { description: errDetail(error, "Error desconocido") }),
  });

  const processPendingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/admin/ocr/inbound/whatsapp/process-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: accountName, limit: Number(limit || 20) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : "No se pudo procesar pendientes");
      return body as Record<string, unknown>;
    },
    onSuccess: () => {
      toast.success("Pendientes procesados");
      void eventsQuery.refetch();
    },
    onError: (error) => toast.error("Error procesando pendientes", { description: errDetail(error, "Error desconocido") }),
  });

  const rows = parseRows(eventsQuery.data);
  const todayIso = new Date().toISOString().slice(0, 10);
  const audit = useMemo(() => {
    const todayRows = rows.filter((row) => typeof row.received_at === "string" && row.received_at.startsWith(todayIso));
    const jobsCreated = rows.filter((row) => row.process_status === "job_created").length;
    const errors = rows.filter((row) => row.process_status === "error").length;
    const duplicated = rows.filter((row) => String(row.error_message ?? "").toLowerCase().includes("duplicate")).length;
    return { today: todayRows.length, jobsCreated, errors, duplicated };
  }, [rows, todayIso]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-slate-400">
          <Link href={`/accounts/${encodeURIComponent(accountName)}/config`} className="hover:text-slate-200">Cuenta {accountName}</Link>
          {" > "}Inbound WhatsApp
        </p>
        <h1 className="font-heading text-2xl text-white">Inbound WhatsApp</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={tab === "config" ? "default" : "outline"} onClick={() => setTab("config")}>Configuración</Button>
        <Button variant={tab === "events" ? "default" : "outline"} onClick={() => setTab("events")}>Eventos</Button>
        <Button variant={tab === "processing" ? "default" : "outline"} onClick={() => setTab("processing")}>Procesamiento</Button>
        <Button variant={tab === "audit" ? "default" : "outline"} onClick={() => setTab("audit")}>Auditoría</Button>
      </div>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>account_name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>status</Label>
            <Input value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="received|job_created|error" />
          </div>
          <div className="space-y-2">
            <Label>limit</Label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => void eventsQuery.refetch()} disabled={eventsQuery.isFetching}>
              {eventsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Recargar
            </Button>
          </div>
        </CardContent>
      </Card>

      {tab === "config" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Configuración</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={configQuery.data?.verify_token_configured ? "default" : "secondary"}>Verify token {configQuery.data?.verify_token_configured ? "OK" : "Falta"}</Badge>
              <Badge variant={configQuery.data?.app_secret_configured ? "default" : "secondary"}>App secret {configQuery.data?.app_secret_configured ? "OK" : "Falta"}</Badge>
              <Badge variant={configQuery.data?.access_token_configured ? "default" : "secondary"}>Access token {configQuery.data?.access_token_configured ? "OK" : "Falta"}</Badge>
              <Badge variant="outline">default_account: {String(configQuery.data?.default_inbound_account_name ?? "-")}</Badge>
              <Badge variant="outline">auto_process: {String(configQuery.data?.inbound_auto_process_enabled ?? false)}</Badge>
            </div>
            <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Probar verify handshake
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {tab === "events" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Eventos</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>id</TableHead>
                    <TableHead>external_event_id</TableHead>
                    <TableHead>event_type</TableHead>
                    <TableHead>source_ref</TableHead>
                    <TableHead>account_name</TableHead>
                    <TableHead>process_status</TableHead>
                    <TableHead>error_message</TableHead>
                    <TableHead>received_at</TableHead>
                    <TableHead>processed_at</TableHead>
                    <TableHead>payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`inbound-row-${String(row.id ?? row.external_event_id ?? Math.random())}`}>
                      <TableCell>{String(row.id ?? "-")}</TableCell>
                      <TableCell>{row.external_event_id ?? "-"}</TableCell>
                      <TableCell>{row.event_type ?? "-"}</TableCell>
                      <TableCell>{row.source_ref ?? "-"}</TableCell>
                      <TableCell>{row.account_name ?? "-"}</TableCell>
                      <TableCell>{row.process_status ?? "-"}</TableCell>
                      <TableCell className="max-w-64 truncate" title={row.error_message ?? ""}>{row.error_message ?? "-"}</TableCell>
                      <TableCell>{row.received_at ?? "-"}</TableCell>
                      <TableCell>{row.processed_at ?? "-"}</TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => setSelectedPayload(row.payload ?? row)}>Ver</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {selectedPayload ? (
              <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(selectedPayload, null, 2)}</pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "processing" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Procesamiento manual</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => processPendingMutation.mutate()} disabled={processPendingMutation.isPending}>
              {processPendingMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Procesar pendientes
            </Button>
            {processPendingMutation.data ? (
              <pre className="max-h-64 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">
                {JSON.stringify(processPendingMutation.data, null, 2)}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "audit" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Auditoría</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Eventos hoy</p><p className="text-lg font-semibold">{audit.today}</p></div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Duplicados detectados</p><p className="text-lg font-semibold">{audit.duplicated}</p></div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Jobs creados</p><p className="text-lg font-semibold">{audit.jobsCreated}</p></div>
            <div className="rounded-md border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">Errores</p><p className="text-lg font-semibold">{audit.errors}</p></div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
