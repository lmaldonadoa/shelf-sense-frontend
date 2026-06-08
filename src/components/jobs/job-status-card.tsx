import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type JobStatusCardProps = {
  status: string;
  total: number;
  processed: number;
  failed: number;
  progress: number;
  error?: string;
};

export function JobStatusCard({ status, total, processed, failed, progress, error }: JobStatusCardProps) {
  const normalized = status.toLowerCase();
  const statusVariant =
    normalized === "failed" || normalized.includes("error")
      ? "destructive"
      : normalized === "completed"
        ? "default"
        : normalized === "running"
          ? "secondary"
          : normalized === "queued" || normalized === "partial_success"
            ? "outline"
            : "secondary";

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Estado del Job</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-muted-foreground">Status</p><Badge variant={statusVariant}>{status}</Badge></div>
          <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-semibold">{total}</p></div>
          <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-muted-foreground">Processed</p><p className="text-xl font-semibold">{processed}</p></div>
          <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-muted-foreground">Failed</p><p className="text-xl font-semibold">{failed}</p></div>
          <div className="rounded-lg border border-white/10 p-3"><p className="text-xs text-muted-foreground">Progreso</p><p className="text-xl font-semibold">{progress}%</p></div>
        </div>
        {error ? <p className="text-sm text-destructive">Error: {error}</p> : null}
      </CardContent>
    </Card>
  );
}
