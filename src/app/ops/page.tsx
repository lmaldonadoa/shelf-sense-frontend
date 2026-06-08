"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function OpsPage() {
  const [accountName, setAccountName] = useState("colgate_ecuador");

  const testConnection = useMutation({
    mutationFn: () => ocrApi.health(),
    onSuccess: () => toast.success("Conexión OK", { description: ocrApi.backendUrl }),
    onError: (error) => toast.error("Error conexión", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const jobsQuery = useQuery({ queryKey: ["ops-jobs"], queryFn: () => ocrApi.getRecentJobs(20) });
  const uploadsQuery = useQuery({ queryKey: ["ops-uploads", accountName], queryFn: () => ocrApi.getRecentUploads(accountName, 20) });
  const queueQuery = useQuery({
    queryKey: ["ops-job-queue", accountName],
    queryFn: () => ocrApi.getJobQueueSnapshot({ accountName: accountName.trim() || undefined, nextLimit: 10 }),
    refetchInterval: 4000,
    retry: false,
  });

  const queueHeadline = queueQuery.data ? `Cola: ${queueQuery.data.queued_count} pendientes | ${queueQuery.data.running_count} ejecutando` : "Cola no disponible";

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Diagnóstico backend</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Backend activo: {ocrApi.backendUrl}</p>
          <Button onClick={() => testConnection.mutate()} disabled={testConnection.isPending}>
            {testConnection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
            Probar conexión backend
          </Button>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cola OCR
            {queueQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{queueHeadline}</p>
          {queueQuery.error ? (
            <p className="text-sm text-amber-300">Observabilidad de cola no disponible</p>
          ) : null}

          {queueQuery.data ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">queue_mode</p><p className="text-sm font-semibold">{queueQuery.data.queue_mode ?? "-"}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">queued_count</p><p className="text-lg font-semibold">{queueQuery.data.queued_count}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">running_count</p><p className="text-lg font-semibold">{queueQuery.data.running_count}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3"><p className="text-xs text-muted-foreground">poll_sec (backend)</p><p className="text-sm font-semibold">{queueQuery.data.poll_sec ?? "-"}</p></div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs text-muted-foreground">counts_by_status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(queueQuery.data.counts_by_status ?? {}).map(([status, count]) => (
                    <Badge key={status} variant="outline">{status}: {count}</Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs text-muted-foreground">running_job</p>
                {queueQuery.data.running_job ? (
                  <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <p><span className="text-muted-foreground">job_id:</span> {queueQuery.data.running_job.job_id}</p>
                    <p><span className="text-muted-foreground">account:</span> {queueQuery.data.running_job.account_name ?? "-"}</p>
                    <p><span className="text-muted-foreground">status:</span> {queueQuery.data.running_job.status}</p>
                    <p><span className="text-muted-foreground">processed:</span> {queueQuery.data.running_job.processed_images ?? 0}/{queueQuery.data.running_job.total_images ?? 0}</p>
                    <p><span className="text-muted-foreground">id_pdv:</span> {queueQuery.data.running_job.id_pdv ?? "-"}</p>
                    <p><span className="text-muted-foreground">subcategoria:</span> {queueQuery.data.running_job.subcategoria ?? "-"}</p>
                    <p><span className="text-muted-foreground">usuario_relevo:</span> {queueQuery.data.running_job.usuario_relevo ?? "-"}</p>
                    <p><span className="text-muted-foreground">started_at:</span> {queueQuery.data.running_job.started_at ?? "-"}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin job en ejecución</p>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="mb-2 text-xs text-muted-foreground">next_jobs</p>
                {!queueQuery.data.next_jobs.length ? (
                  <p className="text-sm text-muted-foreground">No hay jobs en cola.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>job_id</TableHead><TableHead>account</TableHead><TableHead>status</TableHead><TableHead>id_pdv</TableHead><TableHead>subcategoria</TableHead><TableHead>created_at</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {queueQuery.data.next_jobs.map((row) => (
                        <TableRow key={row.job_id}>
                          <TableCell className="font-mono text-xs">{row.job_id}</TableCell>
                          <TableCell>{row.account_name ?? "-"}</TableCell>
                          <TableCell>{row.status}</TableCell>
                          <TableCell>{row.id_pdv ?? "-"}</TableCell>
                          <TableCell>{row.subcategoria ?? "-"}</TableCell>
                          <TableCell>{row.created_at ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Jobs recientes</CardTitle></CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(jobsQuery.data ?? [], null, 2)}</pre>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Uploads recientes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" />
          <pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(uploadsQuery.data ?? [], null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
