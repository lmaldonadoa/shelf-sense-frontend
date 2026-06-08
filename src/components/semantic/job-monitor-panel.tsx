"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { HttpError, isFinalJobStatus, ocrApi } from "@/lib/ocrApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type JobMonitorPanelProps = {
  jobId: string;
};

export function JobMonitorPanel({ jobId }: JobMonitorPanelProps) {
  const jobQuery = useQuery({
    queryKey: ["playground-job", jobId],
    queryFn: () => ocrApi.getJob(jobId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status && isFinalJobStatus(status) ? false : 3000;
    },
  });

  const eventsQuery = useQuery({ queryKey: ["playground-events", jobId], queryFn: () => ocrApi.getJobEvents(jobId), refetchInterval: 3000 });
  const resultsQuery = useQuery({ queryKey: ["playground-results", jobId], queryFn: () => ocrApi.getJobResults(jobId), enabled: false, retry: false });

  const supportDetections = useMemo(() => resultsQuery.data?.support_detections ?? [], [resultsQuery.data?.support_detections]);

  async function loadResults() {
    const res = await resultsQuery.refetch();
    if (res.error instanceof HttpError && res.error.status === 404) return;
  }

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Monitoreo Job: {jobId}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div><p className="text-xs text-muted-foreground">status</p><p>{jobQuery.data?.status ?? "-"}</p></div>
          <div><p className="text-xs text-muted-foreground">total</p><p>{jobQuery.data?.total_images ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">processed</p><p>{jobQuery.data?.processed_images ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">failed</p><p>{jobQuery.data?.failed_images ?? 0}</p></div>
          <div><Button size="sm" onClick={loadResults} disabled={resultsQuery.isFetching}>{resultsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Cargar results</Button></div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Eventos</CardTitle></CardHeader>
        <CardContent>
          <pre className="max-h-48 overflow-auto text-xs">{JSON.stringify(eventsQuery.data ?? [], null, 2)}</pre>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Resultados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {resultsQuery.data?.master_html_url ? <a className="underline" href={resultsQuery.data.master_html_url} target="_blank" rel="noreferrer">master_html_url</a> : <span>master_html_url: No disponible</span>}
            {resultsQuery.data?.master_json_url ? <a className="underline" href={resultsQuery.data.master_json_url} target="_blank" rel="noreferrer">master_json_url</a> : <span>master_json_url: No disponible</span>}
            {resultsQuery.data?.excel_url ? <a className="underline" href={resultsQuery.data.excel_url} target="_blank" rel="noreferrer">excel_url</a> : <span>excel_url: No disponible</span>}
          </div>
          {(resultsQuery.data?.products?.length ?? 0) > 0 ? <pre className="max-h-48 overflow-auto text-xs">{JSON.stringify(resultsQuery.data?.products, null, 2)}</pre> : <p className="text-sm text-muted-foreground">Sin productos aún.</p>}

          {supportDetections.length > 0 ? <pre className="max-h-40 overflow-auto text-xs">{JSON.stringify(supportDetections, null, 2)}</pre> : <p className="text-sm text-muted-foreground">Sin support_detections.</p>}

          {(resultsQuery.data?.images ?? []).length > 0 ? (
            <Table>
              <TableHeader><TableRow><TableHead>image</TableHead><TableHead>annotated</TableHead></TableRow></TableHeader>
              <TableBody>
                {(resultsQuery.data?.images ?? []).map((img) => (
                  <TableRow key={`${img.id}-${img.file_id ?? img.image_name ?? "img"}`}>
                    <TableCell>{img.original_name ?? img.image_name}</TableCell>
                    <TableCell>{img.annotated_image_url ? <a className="underline" href={img.annotated_image_url} target="_blank" rel="noreferrer">ver anotada</a> : "No disponible"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
