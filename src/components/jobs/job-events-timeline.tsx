import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";
import type { JobEventsResponse } from "@/types/ocr-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type JobEventsTimelineProps = {
  events: JobEventsResponse;
};

export function JobEventsTimeline({ events }: JobEventsTimelineProps) {
  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle>Timeline de eventos</CardTitle>
      </CardHeader>
      <CardContent>
        {!events.length ? (
          <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event, idx) => {
              const isError = (event.level ?? "").toLowerCase().includes("error");
              const isDone = (event.event_type ?? "").toLowerCase().includes("done");
              const Icon = isError ? AlertCircle : isDone ? CheckCircle2 : Clock3;
              return (
                <div key={`${event.id ?? idx}-${idx}`} className="flex gap-3 rounded-md border border-white/10 p-3">
                  <Icon className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="text-sm font-medium">{event.event_type ?? event.level ?? "evento"}</p>
                    <p className="text-xs text-muted-foreground">{event.created_at ?? "sin timestamp"}</p>
                    <p className="text-sm text-muted-foreground">{event.message ?? "sin detalle"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
