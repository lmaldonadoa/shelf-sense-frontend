"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Wifi, WifiOff } from "lucide-react";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { JobEvent } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TimelineConnection = "connected" | "retrying";

type JobLiveTimelineProps = {
  jobId: string;
  isTerminal: boolean;
  onTerminalEventsSynced?: () => void;
};

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function prettyTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function JobLiveTimeline({ jobId, isTerminal, onTerminalEventsSynced }: JobLiveTimelineProps) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [connection, setConnection] = useState<TimelineConnection>("connected");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [retryDelayMs, setRetryDelayMs] = useState(2000);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const lastEventIdRef = useRef(-1);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const isMountedRef = useRef(true);
  const terminalSyncedRef = useRef(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const appendEvents = useCallback((incoming: JobEvent[]) => {
    const ordered = [...incoming].sort((a, b) => a.id - b.id);
    const nextRows: JobEvent[] = [];
    let maxId = lastEventIdRef.current;
    for (const row of ordered) {
      if (row.id <= lastEventIdRef.current) continue;
      if (seenIdsRef.current.has(row.id)) continue;
      seenIdsRef.current.add(row.id);
      nextRows.push(row);
      if (row.id > maxId) maxId = row.id;
    }
    if (!nextRows.length) return;
    lastEventIdRef.current = maxId;
    setEvents((prev) => [...prev, ...nextRows]);
  }, []);

  const schedule = useCallback(
    (ms: number, fn: () => void) => {
      clearTimer();
      timeoutRef.current = setTimeout(fn, ms);
    },
    [clearTimer],
  );

  const pullEvents = useCallback(async () => {
    try {
      const rows = await ocrApi.getJobEvents(jobId);
      if (!isMountedRef.current) return;
      appendEvents(rows);
      setConnection("connected");
      retryCountRef.current = 0;
      setRetryDelayMs(2000);
      setLastUpdatedAt(new Date().toISOString());

      if (isTerminal) {
        terminalSyncedRef.current = true;
        onTerminalEventsSynced?.();
        clearTimer();
        return;
      }

      schedule(2000, () => void pullEvents());
    } catch (error) {
      if (!isMountedRef.current) return;
      if (error instanceof HttpError && error.status === 404 && isTerminal) {
        terminalSyncedRef.current = true;
        onTerminalEventsSynced?.();
        clearTimer();
        return;
      }

      setConnection("retrying");
      retryCountRef.current += 1;
      const nextDelay = Math.min(retryCountRef.current * 2000, 10000);
      setRetryDelayMs(nextDelay);
      schedule(nextDelay, () => void pullEvents());
    }
  }, [appendEvents, clearTimer, isTerminal, jobId, onTerminalEventsSynced, schedule]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    retryCountRef.current = 0;
    lastEventIdRef.current = -1;
    seenIdsRef.current = new Set<number>();
    terminalSyncedRef.current = false;
    setEvents([]);
    setConnection("connected");
    setRetryDelayMs(2000);
    setLastUpdatedAt(null);
    void pullEvents();
  }, [clearTimer, jobId, pullEvents]);

  useEffect(() => {
    if (!isTerminal || terminalSyncedRef.current) return;
    void pullEvents();
  }, [isTerminal, pullEvents]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [events]);

  const connectionLabel = useMemo(() => {
    if (connection === "connected") return "Conectado";
    return `Sin conexión (reintentando en ${Math.round(retryDelayMs / 1000)}s)`;
  }, [connection, retryDelayMs]);

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Timeline de eventos en vivo</span>
          <span className="inline-flex items-center gap-2 text-xs font-normal text-slate-300">
            {connection === "connected" ? <Wifi className="h-3.5 w-3.5 text-emerald-300" /> : <WifiOff className="h-3.5 w-3.5 text-amber-300" />}
            {connectionLabel}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">Última actualización: {lastUpdatedAt ? prettyTime(lastUpdatedAt) : "-"}</p>
      </CardHeader>
      <CardContent>
        {!events.length ? (
          <p className="text-sm text-muted-foreground">Sin eventos todavía.</p>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              const threshold = 24;
              shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
            }}
            className="max-h-[28rem] space-y-2 overflow-y-auto pr-1"
          >
            {events.map((event) => {
              const level = (event.level ?? "INFO").toUpperCase();
              const isError = level === "ERROR";
              const isWarn = level === "WARNING";
              const iconClass = isError ? "text-rose-300" : isWarn ? "text-amber-300" : "text-cyan-200";
              const Icon = isError ? AlertCircle : isWarn ? AlertCircle : event.event_type.includes("completed") ? CheckCircle2 : Clock3;
              const payloadObj = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
              const metricsCount = payloadObj && typeof payloadObj.metrics_count === "number" ? payloadObj.metrics_count : null;
              const imageTotalMs = payloadObj && typeof payloadObj.image_total_ms === "number" ? payloadObj.image_total_ms : null;
              const supportMemoryCrops = payloadObj && typeof payloadObj.support_memory_crops === "number" ? payloadObj.support_memory_crops : null;
              const supportNameCandidates = payloadObj && typeof payloadObj.support_name_candidates === "number" ? payloadObj.support_name_candidates : null;
              const nameAssistedCount = payloadObj && typeof payloadObj.name_assisted_count === "number" ? payloadObj.name_assisted_count : null;

              return (
                <div key={event.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 ${iconClass}`} />
                    <div className="w-full space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isError ? "destructive" : "secondary"}>{level}</Badge>
                        <span className="text-sm font-medium">{event.event_type}</span>
                      </div>
                      <p className="text-sm text-slate-100">{event.message || "Sin detalle"}</p>
                      <p className="text-xs text-muted-foreground">{prettyTime(event.created_at)}</p>
                      {(metricsCount !== null || imageTotalMs !== null || supportMemoryCrops !== null || supportNameCandidates !== null || nameAssistedCount !== null) ? (
                        <div className="flex flex-wrap gap-2 pt-1 text-xs">
                          {metricsCount !== null ? <Badge variant="outline">metrics_count: {metricsCount}</Badge> : null}
                          {imageTotalMs !== null ? <Badge variant="outline">image_total_ms: {imageTotalMs} ms</Badge> : null}
                          {supportMemoryCrops !== null ? <Badge variant="outline">Memoria soporte: {supportMemoryCrops} crops</Badge> : null}
                          {supportNameCandidates !== null ? <Badge variant="outline">Candidatos nombre: {supportNameCandidates}</Badge> : null}
                          {nameAssistedCount !== null ? <Badge variant="outline">Productos asistidos: {nameAssistedCount}</Badge> : null}
                        </div>
                      ) : null}
                      {event.payload !== undefined ? (
                        <details className="pt-1 text-xs">
                          <summary className="cursor-pointer text-cyan-200">Ver payload</summary>
                          <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-white/10 bg-black/40 p-2">{asJson(event.payload)}</pre>
                        </details>
                      ) : null}
                    </div>
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
