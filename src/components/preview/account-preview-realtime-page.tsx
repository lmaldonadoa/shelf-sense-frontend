"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Pause, Play, RefreshCcw, Square, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { PreviewCreateSessionRequest, PreviewDiagnosticsResponse, PreviewEvent, PreviewSession, PreviewVideoUploadItem } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = { account: string };

type TrackRow = {
  track_id: string;
  label?: string;
  conf?: number;
  box?: number[];
  producto?: string;
  tamano?: string;
  variante?: string;
  precio?: string;
  barcode?: string;
  last_seen_ts?: string;
  ocr_text_preview?: string;
  llm_confidence?: number;
  field_audit?: Record<string, unknown>;
  rag_titles?: string[];
  llm_used?: boolean;
  semantic_llm_used?: boolean;
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "running") return <Badge>running</Badge>;
  if (s === "paused") return <Badge variant="secondary">paused</Badge>;
  if (s === "error") return <Badge variant="destructive">error</Badge>;
  if (s === "completed") return <Badge variant="secondary">completed</Badge>;
  if (s === "stopped") return <Badge variant="outline">stopped</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function wsUrlForSession(sessionId: string): string {
  const api = ocrApi.backendUrl;
  try {
    const base = new URL(api);
    const protocol = base.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${base.host}/v1/preview/sessions/${encodeURIComponent(sessionId)}/ws`;
  } catch {
    return "";
  }
}

function resolvePreviewAssetUrl(raw: string | null | undefined, accountName: string): string | null {
  if (!raw) return null;
  const proxyBase = process.env.NEXT_PUBLIC_OCR_PROXY_BASE ?? "/admin/ocr/proxy";
  const withAccount = (p: string) => `${proxyBase}${p}${p.includes("?") ? "&" : "?"}account_name=${encodeURIComponent(accountName)}`;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      return withAccount(parsed.pathname + parsed.search);
    } catch {
      return raw;
    }
  }
  if (raw.startsWith("/")) return withAccount(raw);
  return withAccount(raw.startsWith("v1/") ? `/${raw}` : `/v1/preview/${raw.replace(/^\/+/, "")}`);
}

export function AccountPreviewRealtimePage({ account }: Props) {
  const [form, setForm] = useState<PreviewCreateSessionRequest>({
    account_name: account,
    config_name: "default",
    id_pdv: "",
    subcategoria: "",
    usuario_relevo: "",
    source: { type: "video_file", path: "" },
    runtime: {
      target_fps: 20,
      detector_mode: "local",
      detector_model_path: "models/best.pt",
      yolo_confidence: 0.4,
      detector_every_n_frames: 2,
      detector_max_width: 960,
      use_vision_llm: false,
      stream_mode: "buffered",
      stream_buffer_seconds: 4.0,
      stream_output_fps: 8,
      stream_min_frames: 24,
    },
    sampling: { ocr_interval_ms: 1500, llm_interval_ms: 3000, min_crop_area: 12000, retrigger_iou_delta: 0.2, ocr_prompt: "Extrae todo el texto de la imagen." },
    enrichment: { use_aliases: true, use_rag: true, use_semantic_llm: false, use_text_enricher: false, semantic_model: "qwen3:8b", rag_limit: 5 },
  });
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [selectedVideoFileId, setSelectedVideoFileId] = useState("");
  const [cursor, setCursor] = useState(0);
  const [events, setEvents] = useState<PreviewEvent[]>([]);
  const [tracksById, setTracksById] = useState<Record<string, TrackRow>>({});
  const [wsConnected, setWsConnected] = useState(false);
  const [wsEnabled, setWsEnabled] = useState(true);
  const [wsReconnectAttempt, setWsReconnectAttempt] = useState(0);
  const [videoMode, setVideoMode] = useState<"stream" | "latest">("stream");
  const [latestFrameUrl, setLatestFrameUrl] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [latestFrameErrorCount, setLatestFrameErrorCount] = useState(0);
  const [diagAfter, setDiagAfter] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["preview-sessions"],
    queryFn: () => ocrApi.listPreviewSessions(50),
    refetchInterval: 5000,
  });

  const videosQuery = useQuery({
    queryKey: ["preview-videos", form.account_name],
    queryFn: () => ocrApi.listPreviewVideos({ accountName: form.account_name, limit: 50 }),
    refetchInterval: 10000,
  });

  const detailQuery = useQuery({
    queryKey: ["preview-session-detail", selectedSessionId],
    enabled: Boolean(selectedSessionId),
    queryFn: () => ocrApi.getPreviewSession(selectedSessionId),
    refetchInterval: (q) => {
      const st = String(q.state.data?.status ?? "");
      return st === "running" || st === "paused" ? 2000 : 5000;
    },
  });

  const snapshotQuery = useQuery({
    queryKey: ["preview-session-snapshot", selectedSessionId],
    enabled: Boolean(selectedSessionId),
    queryFn: () => ocrApi.getPreviewSnapshot(selectedSessionId),
    refetchInterval: (q) => {
      const status = String((q.state.data as Record<string, unknown> | undefined)?.status ?? detailQuery.data?.status ?? "");
      return status === "running" || status === "paused" ? 1500 : 4000;
    },
  });

  const metricsQuery = useQuery({
    queryKey: ["preview-session-metrics", selectedSessionId],
    enabled: Boolean(selectedSessionId),
    queryFn: () => ocrApi.getPreviewMetrics(selectedSessionId),
    refetchInterval: 2000,
  });
  const diagnosticsQuery = useQuery({
    queryKey: ["preview-session-diagnostics", selectedSessionId, diagAfter],
    enabled: Boolean(selectedSessionId),
    queryFn: () => ocrApi.getPreviewDiagnostics(selectedSessionId, { after: diagAfter, limit: 120 }),
    refetchInterval: (q) => {
      const status = String((q.state.data as Record<string, unknown> | undefined)?.status ?? detailQuery.data?.status ?? "");
      return status === "running" || status === "paused" ? 2000 : 5000;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      ocrApi.createPreviewSession({
        ...form,
        source:
          form.source.type === "video_file"
            ? {
                ...form.source,
                video_file_id: selectedVideoFileId || undefined,
              }
            : form.source,
      }),
    onSuccess: (session) => {
      setSelectedSessionId(session.session_id);
      setCursor(0);
      setEvents([]);
      setTracksById({});
      sessionsQuery.refetch();
      toast.success("Sesión creada", { description: session.session_id });
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 404) {
        toast.error("Video no encontrado/expirado", { description: error.detail });
        return;
      }
      toast.error("No se pudo crear sesión", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
    },
  });

  const controlMutation = useMutation({
    mutationFn: ({ action }: { action: "start" | "pause" | "resume" | "stop" }) => ocrApi.controlPreviewSession(selectedSessionId, action),
    onSuccess: (session) => {
      detailQuery.refetch();
      sessionsQuery.refetch();
      toast.success(`Sesión ${session.status}`);
    },
    onError: (error) => toast.error("Error controlando sesión", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });

  const createAndStartMutation = useMutation({
    mutationFn: async () => {
      const created = await ocrApi.createPreviewSession({
        ...form,
        source:
          form.source.type === "video_file"
            ? {
                ...form.source,
                video_file_id: selectedVideoFileId || undefined,
              }
            : form.source,
      });
      await ocrApi.controlPreviewSession(created.session_id, "start");
      return created;
    },
    onSuccess: (session) => {
      setSelectedSessionId(session.session_id);
      setCursor(0);
      setEvents([]);
      setTracksById({});
      sessionsQuery.refetch();
      detailQuery.refetch();
      toast.success("Sesión creada e iniciada", { description: session.session_id });
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : "Error inesperado";
      toast.error("No se pudo crear/iniciar sesión", { description: detail });
    },
  });

  const uploadVideoMutation = useMutation({
    mutationFn: () =>
      ocrApi.uploadPreviewVideo({
        file: selectedVideoFile as File,
        accountName: form.account_name,
        createdBy: form.usuario_relevo || undefined,
      }),
    onSuccess: (res) => {
      setSelectedVideoFileId(res.video_file_id);
      setForm((prev) => ({ ...prev, source: { ...prev.source, video_file_id: res.video_file_id } }));
      videosQuery.refetch();
      toast.success("Video subido", { description: `video_file_id: ${res.video_file_id}` });
    },
    onError: (error) => {
      const detail = error instanceof HttpError ? error.detail : "Error inesperado";
      if (error instanceof HttpError && error.status === 413) toast.error("Archivo demasiado grande", { description: detail });
      else if (error instanceof HttpError && error.status === 415) toast.error("Formato no soportado", { description: detail });
      else toast.error("No se pudo subir video", { description: detail });
    },
  });

  const deleteVideoMutation = useMutation({
    mutationFn: (videoFileId: string) => ocrApi.deletePreviewVideo(videoFileId, form.account_name),
    onSuccess: () => {
      videosQuery.refetch();
      toast.success("Video eliminado");
    },
    onError: (error) => toast.error("No se pudo eliminar video", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });
  const diagnosticsMdMutation = useMutation({
    mutationFn: () => ocrApi.getPreviewDiagnosticsMarkdown(selectedSessionId, { after: 0, limit: 80 }),
    onSuccess: async (md) => {
      await navigator.clipboard.writeText(md);
      toast.success("Diagnóstico Markdown copiado");
    },
    onError: (error) => toast.error("No se pudo obtener diagnostics.md", { description: error instanceof HttpError ? error.detail : "Error inesperado" }),
  });

  const pollMutation = useMutation({
    mutationFn: (after: number) => ocrApi.getPreviewEvents(selectedSessionId, { after, limit: 100 }),
    onSuccess: (data) => {
      ingestEvents(data.items);
      setCursor(data.next_cursor);
    },
  });

  function ingestEvents(incoming: PreviewEvent[]) {
    if (!incoming.length) return;
    setEvents((prev) => [...prev, ...incoming].slice(-300));
    setTracksById((prev) => {
      const next = { ...prev };
      for (const e of incoming) {
        if (e.type === "frame_detection") {
          const tracksUpdated = Array.isArray(e.tracks_updated) ? e.tracks_updated.map((x) => String(x)) : [];
          const detections = Array.isArray(e.detections) ? e.detections : [];
          tracksUpdated.forEach((trackId, idx) => {
            const det = detections[idx] && typeof detections[idx] === "object" ? (detections[idx] as Record<string, unknown>) : null;
            next[trackId] = {
              ...(next[trackId] ?? { track_id: trackId }),
              label: typeof det?.label === "string" ? det.label : next[trackId]?.label,
              conf: Number.isFinite(Number(det?.conf)) ? Number(det?.conf) : next[trackId]?.conf,
              box: Array.isArray(det?.box) ? (det?.box as number[]) : next[trackId]?.box,
              last_seen_ts: typeof e.ts === "string" ? e.ts : next[trackId]?.last_seen_ts,
            };
          });
        } else if (e.type === "track_hypothesis_update") {
          const trackId = String(e.track_id ?? "");
          if (!trackId) continue;
          const product = e.product && typeof e.product === "object" ? (e.product as Record<string, unknown>) : {};
          const ragTitles = Array.isArray(e.rag_titles) ? e.rag_titles.map((x) => String(x)) : undefined;
          next[trackId] = {
            ...(next[trackId] ?? { track_id: trackId }),
            producto: typeof product.producto === "string" ? product.producto : next[trackId]?.producto,
            tamano: typeof product.tamano === "string" ? product.tamano : next[trackId]?.tamano,
            variante: typeof product.variante === "string" ? product.variante : next[trackId]?.variante,
            precio: product.precio_en_gondola !== undefined ? String(product.precio_en_gondola) : next[trackId]?.precio,
            barcode: typeof product.barcode === "string" ? product.barcode : next[trackId]?.barcode,
            last_seen_ts: typeof e.ts === "string" ? e.ts : next[trackId]?.last_seen_ts,
            ocr_text_preview: typeof e.ocr_text_preview === "string" ? e.ocr_text_preview : next[trackId]?.ocr_text_preview,
            llm_confidence: Number.isFinite(Number(e.llm_confidence)) ? Number(e.llm_confidence) : Number.isFinite(Number((e.confidence as Record<string, unknown> | undefined)?.overall)) ? Number((e.confidence as Record<string, unknown>).overall) : next[trackId]?.llm_confidence,
            llm_used: typeof (e.confidence as Record<string, unknown> | undefined)?.llm_used === "boolean"
              ? Boolean((e.confidence as Record<string, unknown>).llm_used)
              : next[trackId]?.llm_used,
            semantic_llm_used: typeof (e.confidence as Record<string, unknown> | undefined)?.semantic_llm_used === "boolean"
              ? Boolean((e.confidence as Record<string, unknown>).semantic_llm_used)
              : next[trackId]?.semantic_llm_used,
            field_audit: e.product && typeof e.product === "object" && (e.product as Record<string, unknown>).field_audit && typeof (e.product as Record<string, unknown>).field_audit === "object"
              ? ((e.product as Record<string, unknown>).field_audit as Record<string, unknown>)
              : next[trackId]?.field_audit,
            rag_titles: ragTitles ?? next[trackId]?.rag_titles,
          };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (!selectedSessionId || !wsEnabled) return;
    const url = wsUrlForSession(selectedSessionId);
    if (!url) return;
    let alive = true;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!alive) return;
        setWsConnected(true);
        setWsReconnectAttempt(0);
      };
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as PreviewEvent;
          if (parsed.cursor && parsed.cursor > cursor) setCursor(parsed.cursor);
          ingestEvents([parsed]);
        } catch {
          // ignore frame
        }
      };
      ws.onclose = () => {
        if (!alive) return;
        setWsConnected(false);
        const attempt = wsReconnectAttempt + 1;
        setWsReconnectAttempt(attempt);
        const backoff = Math.min(10000, 1000 * Math.pow(2, Math.min(4, attempt)));
        reconnectTimerRef.current = window.setTimeout(() => {
          detailQuery.refetch();
          pollMutation.mutate(cursor);
          setWsEnabled((v) => !v);
          setWsEnabled((v) => !v);
        }, backoff);
      };
      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }
    return () => {
      alive = false;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, wsEnabled]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const status = String(detailQuery.data?.status ?? "");
    const runningLike = status === "running" || status === "paused";
    if (!runningLike) return;
    if (wsConnected) return;
    const id = window.setInterval(() => {
      pollMutation.mutate(cursor);
    }, 400);
    return () => window.clearInterval(id);
  }, [cursor, detailQuery.data?.status, pollMutation, selectedSessionId, wsConnected]);

  const snapshotTracks = useMemo(() => {
    const snap = snapshotQuery.data as Record<string, unknown> | undefined;
    const rows = Array.isArray(snap?.tracks) ? (snap?.tracks as Record<string, unknown>[]) : [];
    return rows.map((row) => ({
      track_id: String(row.track_id ?? "-"),
      box: Array.isArray(row.bbox) ? (row.bbox as number[]) : Array.isArray(row.box) ? (row.box as number[]) : undefined,
      label: typeof row.label === "string" ? row.label : undefined,
      conf: Number.isFinite(Number(row.conf)) ? Number(row.conf) : undefined,
      producto: row.product && typeof row.product === "object" ? String((row.product as Record<string, unknown>).producto ?? "-") : undefined,
      tamano: row.product && typeof row.product === "object" ? String((row.product as Record<string, unknown>).tamano ?? "-") : undefined,
      variante: row.product && typeof row.product === "object" ? String((row.product as Record<string, unknown>).variante ?? "-") : undefined,
      precio: row.product && typeof row.product === "object" ? String((row.product as Record<string, unknown>).precio_en_gondola ?? "-") : undefined,
      barcode: row.product && typeof row.product === "object" ? String((row.product as Record<string, unknown>).barcode ?? "-") : undefined,
      last_seen_ts: typeof row.last_seen_ts === "string" ? row.last_seen_ts : undefined,
    } satisfies TrackRow));
  }, [snapshotQuery.data]);
  const tracks = useMemo(() => (snapshotTracks.length ? snapshotTracks : Object.values(tracksById)), [snapshotTracks, tracksById]);
  const latestInterpretedTrack = useMemo(() => {
    const rows = tracks.filter((t) => Boolean(t.producto || t.tamano || t.variante || t.precio || t.barcode));
    if (!rows.length) return null;
    const sorted = [...rows].sort((a, b) => {
      const ta = a.last_seen_ts ? new Date(a.last_seen_ts).getTime() : 0;
      const tb = b.last_seen_ts ? new Date(b.last_seen_ts).getTime() : 0;
      return tb - ta;
    });
    return sorted[0] ?? null;
  }, [tracks]);

  const streamUrl = useMemo(() => {
    if (!selectedSessionId) return null;
    const snap = snapshotQuery.data as Record<string, unknown> | undefined;
    const fromSnap = typeof snap?.annotated_stream_url === "string" ? snap.annotated_stream_url : null;
    return resolvePreviewAssetUrl(fromSnap ?? `/v1/preview/sessions/${encodeURIComponent(selectedSessionId)}/stream.mjpeg`, form.account_name);
  }, [form.account_name, selectedSessionId, snapshotQuery.data]);

  useEffect(() => {
    if (!selectedSessionId || videoMode !== "latest") return;
    const status = String(detailQuery.data?.status ?? "");
    const runningLike = status === "running" || status === "paused";
    if (!runningLike) return;
    if (latestFrameErrorCount >= 6) return;
    const tick = window.setInterval(() => {
      const snap = snapshotQuery.data as Record<string, unknown> | undefined;
      const snapLatest = typeof snap?.latest_frame_url === "string" ? snap.latest_frame_url.trim() : "";
      const latestBase = snapLatest || `/v1/preview/sessions/${encodeURIComponent(selectedSessionId)}/frame/latest.jpg`;
      const resolved = resolvePreviewAssetUrl(latestBase, form.account_name);
      if (!resolved) return;
      setLatestFrameUrl(`${resolved}${resolved.includes("?") ? "&" : "?"}t=${Date.now()}`);
    }, 500);
    return () => window.clearInterval(tick);
  }, [detailQuery.data?.status, form.account_name, latestFrameErrorCount, selectedSessionId, snapshotQuery.data, videoMode]);

  useEffect(() => {
    const status = String(detailQuery.data?.status ?? "");
    const stoppedLike = status === "stopping" || status === "stopped" || status === "completed" || status === "error";
    if (!stoppedLike) return;
    setStreamError(null);
    // Freeze visual updates when session is no longer active.
    setVideoMode("latest");
  }, [detailQuery.data?.status]);

  useEffect(() => {
    setLatestFrameErrorCount(0);
  }, [selectedSessionId]);

  useEffect(() => {
    setVideoMode("stream");
    setStreamError(null);
  }, [selectedSessionId]);

  const kpi = {
    fps: Number((snapshotQuery.data as Record<string, unknown> | undefined)?.metrics && typeof (snapshotQuery.data as Record<string, unknown>).metrics === "object" ? ((snapshotQuery.data as Record<string, unknown>).metrics as Record<string, unknown>).fps : metricsQuery.data?.fps ?? detailQuery.data?.metrics?.fps ?? 0),
    frames_processed: Number(metricsQuery.data?.frames_processed ?? detailQuery.data?.metrics?.frames_processed ?? 0),
    ocr_inferences: Number(metricsQuery.data?.ocr_inferences ?? detailQuery.data?.metrics?.ocr_inferences ?? 0),
    llm_inferences: Number(metricsQuery.data?.llm_inferences ?? detailQuery.data?.metrics?.llm_inferences ?? 0),
    semantic_llm_inferences: Number(metricsQuery.data?.semantic_llm_inferences ?? 0),
    drop_frames: Number(metricsQuery.data?.drop_frames ?? detailQuery.data?.metrics?.drop_frames ?? 0),
    stream_clients: Number((snapshotQuery.data as Record<string, unknown> | undefined)?.metrics && typeof (snapshotQuery.data as Record<string, unknown>).metrics === "object" ? ((snapshotQuery.data as Record<string, unknown>).metrics as Record<string, unknown>).stream_clients ?? 0 : 0),
    annotated_encode_ms: Number((snapshotQuery.data as Record<string, unknown> | undefined)?.metrics && typeof (snapshotQuery.data as Record<string, unknown>).metrics === "object" ? ((snapshotQuery.data as Record<string, unknown>).metrics as Record<string, unknown>).annotated_encode_ms ?? 0 : 0),
    frame_publish_fps: Number((snapshotQuery.data as Record<string, unknown> | undefined)?.metrics && typeof (snapshotQuery.data as Record<string, unknown>).metrics === "object" ? ((snapshotQuery.data as Record<string, unknown>).metrics as Record<string, unknown>).frame_publish_fps ?? 0 : 0),
    capture_read_ms: Number(metricsQuery.data?.capture_read_ms ?? 0),
    yolo_ms: Number(metricsQuery.data?.yolo_ms ?? 0),
    track_assign_ms: Number(metricsQuery.data?.track_assign_ms ?? 0),
    futures_collect_ms: Number(metricsQuery.data?.futures_collect_ms ?? 0),
    annotate_ms: Number(metricsQuery.data?.annotate_ms ?? 0),
    inference_pending: Number(metricsQuery.data?.inference_pending ?? 0),
    active_tracks: Number(metricsQuery.data?.active_tracks ?? 0),
  };

  const bottleneck = useMemo(() => {
    const fromDiag = (diagnosticsQuery.data?.bottleneck_hint ?? {}) as Record<string, unknown>;
    const fromMetrics = (metricsQuery.data?.bottleneck_hint ?? {}) as Record<string, unknown>;
    const stage = String(fromDiag.stage ?? fromMetrics.stage ?? "");
    const reason = String(fromDiag.reason ?? fromMetrics.reason ?? "");
    let recommendation = "Sin recomendación específica.";
    if (stage === "yolo") recommendation = "Sube detector_every_n_frames y/o baja detector_max_width.";
    else if (stage === "capture_io") recommendation = "Revisa fuente de video/cámara y E/S.";
    else if (stage === "annotate_encode") recommendation = "Reduce frecuencia de render visual en UI.";
    else if (stage === "ocr_queue") recommendation = "Sube ocr_interval_ms para aliviar cola OCR.";
    else if (stage === "detector_throttled") recommendation = "Estado esperado al priorizar FPS.";
    return { stage: stage || "-", reason: reason || "-", recommendation };
  }, [diagnosticsQuery.data?.bottleneck_hint, metricsQuery.data?.bottleneck_hint]);
  const runtimeUseVisionLlm = useMemo(() => {
    const fromDiag = (diagnosticsQuery.data?.runtime_profile ?? {}) as Record<string, unknown>;
    if (typeof fromDiag.use_vision_llm === "boolean") return fromDiag.use_vision_llm;
    const fromSession = (detailQuery.data?.runtime ?? {}) as Record<string, unknown>;
    if (typeof fromSession.use_vision_llm === "boolean") return fromSession.use_vision_llm;
    return Boolean((form.runtime as Record<string, unknown>)?.use_vision_llm);
  }, [detailQuery.data?.runtime, diagnosticsQuery.data?.runtime_profile, form.runtime]);
  const resolvedToggles = useMemo(() => {
    const fromDiag = (diagnosticsQuery.data?.resolved_toggles ?? {}) as Record<string, unknown>;
    const fromMetrics = (metricsQuery.data?.resolved_toggles ?? {}) as Record<string, unknown>;
    const useSemanticFromDiag = fromDiag.use_semantic_llm;
    const useSemanticFromMetrics = fromMetrics.use_semantic_llm;
    const fallbackSemantic = Boolean(form.enrichment?.use_semantic_llm || form.enrichment?.use_text_enricher);
    return {
      use_vision_llm:
        typeof fromDiag.use_vision_llm === "boolean"
          ? Boolean(fromDiag.use_vision_llm)
          : typeof fromMetrics.use_vision_llm === "boolean"
            ? Boolean(fromMetrics.use_vision_llm)
            : runtimeUseVisionLlm,
      use_semantic_llm:
        typeof useSemanticFromDiag === "boolean"
          ? Boolean(useSemanticFromDiag)
          : typeof useSemanticFromMetrics === "boolean"
            ? Boolean(useSemanticFromMetrics)
            : fallbackSemantic,
    };
  }, [diagnosticsQuery.data?.resolved_toggles, form.enrichment?.use_semantic_llm, form.enrichment?.use_text_enricher, metricsQuery.data?.resolved_toggles, runtimeUseVisionLlm]);

  function downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function applyRuntimePreset(mode: "fast" | "accurate" | "smooth_stream" | "smooth_latest") {
    if (mode === "fast") {
      setForm((p) => ({
        ...p,
        runtime: {
          ...p.runtime,
          target_fps: 20,
          yolo_confidence: 0.4,
          detector_every_n_frames: 2,
          detector_max_width: 960,
          use_vision_llm: false,
          stream_mode: "live",
          stream_buffer_seconds: 0,
          stream_output_fps: 8,
          stream_min_frames: 0,
        },
        sampling: {
          ...p.sampling,
          ocr_interval_ms: 1500,
          llm_interval_ms: 3000,
        },
      }));
      toast.success("Preset aplicado: Modo Rapido");
      return;
    }
    if (mode === "smooth_stream") {
      setForm((p) => ({
        ...p,
        runtime: {
          ...p.runtime,
          target_fps: 20,
          yolo_confidence: 0.4,
          detector_every_n_frames: 2,
          detector_max_width: 960,
          use_vision_llm: false,
          stream_mode: "buffered",
          stream_buffer_seconds: 3.5,
          stream_output_fps: 10,
          stream_min_frames: 24,
        },
        sampling: {
          ...p.sampling,
          ocr_interval_ms: 1200,
          llm_interval_ms: 3000,
        },
      }));
      setVideoMode("stream");
      setLatestFrameErrorCount(0);
      toast.success("Preset aplicado: Stream Suave");
      return;
    }
    if (mode === "smooth_latest") {
      setForm((p) => ({
        ...p,
        runtime: {
          ...p.runtime,
          target_fps: 20,
          yolo_confidence: 0.4,
          detector_every_n_frames: 2,
          detector_max_width: 960,
          use_vision_llm: false,
          stream_mode: "buffered",
          stream_buffer_seconds: 4.0,
          stream_output_fps: 8,
          stream_min_frames: 24,
        },
        sampling: {
          ...p.sampling,
          ocr_interval_ms: 1200,
          llm_interval_ms: 3000,
        },
      }));
      setVideoMode("latest");
      setLatestFrameErrorCount(0);
      toast.success("Preset aplicado: Latest JPG Suave");
      return;
    }
    setForm((p) => ({
      ...p,
      runtime: {
        ...p.runtime,
        target_fps: 20,
        yolo_confidence: 0.4,
        detector_every_n_frames: 1,
        detector_max_width: 1280,
        use_vision_llm: true,
        stream_mode: "buffered",
        stream_buffer_seconds: 2.5,
        stream_output_fps: 8,
        stream_min_frames: 16,
      },
      sampling: {
        ...p.sampling,
        ocr_interval_ms: 1200,
        llm_interval_ms: 2500,
      },
    }));
    toast.success("Preset aplicado: Modo Preciso");
  }

  function setSourceType(type: "video_file" | "rtsp" | "webcam") {
    setForm((prev) => ({
      ...prev,
      source: type === "video_file" ? { type, path: "", video_file_id: selectedVideoFileId || undefined } : type === "rtsp" ? { type, url: "" } : { type, device_index: 0 },
    }));
  }

  const formErrors: string[] = [];
  const fps = Number(form.runtime?.target_fps ?? 20);
  const yoloConf = Number(form.runtime?.yolo_confidence ?? 0.4);
  const streamBufferSeconds = Number((form.runtime as Record<string, unknown>)?.stream_buffer_seconds ?? 0);
  const streamOutputFps = Number((form.runtime as Record<string, unknown>)?.stream_output_fps ?? 8);
  const ocrInterval = Number(form.sampling?.ocr_interval_ms ?? 1500);
  const llmInterval = Number(form.sampling?.llm_interval_ms ?? 3000);
  const minArea = Number(form.sampling?.min_crop_area ?? 12000);
  if (!form.source?.type) formErrors.push("source.type es obligatorio.");
  if (form.source?.type === "video_file" && !selectedVideoFileId && !form.source.path?.trim()) formErrors.push("Para video_file debes cargar un video (video_file_id) o indicar source.path.");
  if (form.source?.type === "rtsp" && !form.source.url?.trim()) formErrors.push("source.url es requerido para rtsp.");
  if (!(fps >= 1 && fps <= 60)) formErrors.push("target_fps debe estar entre 1 y 60.");
  if (!(yoloConf >= 0 && yoloConf <= 1)) formErrors.push("yolo_confidence debe estar entre 0 y 1.");
  if (streamBufferSeconds < 0) formErrors.push("stream_buffer_seconds debe ser >= 0.");
  if (!(streamOutputFps >= 1 && streamOutputFps <= 60)) formErrors.push("stream_output_fps debe estar entre 1 y 60.");
  if (ocrInterval < 300) formErrors.push("ocr_interval_ms debe ser >= 300.");
  if (llmInterval < 500) formErrors.push("llm_interval_ms debe ser >= 500.");
  if (minArea <= 0) formErrors.push("min_crop_area debe ser > 0.");

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5">
        <CardHeader><CardTitle>Preview Realtime - Configuración</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>account_name</Label><Input value={form.account_name} onChange={(e) => setForm((p) => ({ ...p, account_name: e.target.value }))} /></div>
            <div><Label>config_name</Label><Input value={form.config_name ?? "default"} onChange={(e) => setForm((p) => ({ ...p, config_name: e.target.value }))} /></div>
            <div><Label>id_pdv</Label><Input value={form.id_pdv ?? ""} onChange={(e) => setForm((p) => ({ ...p, id_pdv: e.target.value }))} /></div>
            <div><Label>subcategoria</Label><Input value={form.subcategoria ?? ""} onChange={(e) => setForm((p) => ({ ...p, subcategoria: e.target.value }))} /></div>
            <div><Label>usuario_relevo</Label><Input value={form.usuario_relevo ?? ""} onChange={(e) => setForm((p) => ({ ...p, usuario_relevo: e.target.value }))} /></div>
            <div>
              <Label>source.type</Label>
              <select className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm" value={form.source.type} onChange={(e) => setSourceType(e.target.value as "video_file" | "rtsp" | "webcam")}>
                <option value="video_file">video_file</option>
                <option value="rtsp">rtsp</option>
                <option value="webcam">webcam</option>
              </select>
            </div>
            {form.source.type === "video_file" ? <div><Label>source.path</Label><Input value={form.source.path ?? ""} onChange={(e) => setForm((p) => ({ ...p, source: { ...p.source, path: e.target.value } }))} /></div> : null}
            {form.source.type === "video_file" ? (
              <div className="space-y-1">
                <Label>video_file_id</Label>
                <Input value={selectedVideoFileId} onChange={(e) => setSelectedVideoFileId(e.target.value)} placeholder="pvf_..." />
              </div>
            ) : null}
            {form.source.type === "rtsp" ? <div><Label>source.url</Label><Input value={form.source.url ?? ""} onChange={(e) => setForm((p) => ({ ...p, source: { ...p.source, url: e.target.value } }))} /></div> : null}
            {form.source.type === "webcam" ? <div><Label>source.device_index</Label><Input value={String(form.source.device_index ?? 0)} onChange={(e) => setForm((p) => ({ ...p, source: { ...p.source, device_index: Number(e.target.value) || 0 } }))} /></div> : null}
          </div>

          {form.source.type === "video_file" ? (
            <div className="rounded-md border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-sm font-semibold">Upload video desde web</p>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input type="file" accept=".mp4,.mov,.avi,.mkv,.webm,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm" onChange={(e) => setSelectedVideoFile(e.target.files?.[0] ?? null)} />
                <Button onClick={() => uploadVideoMutation.mutate()} disabled={!selectedVideoFile || uploadVideoMutation.isPending}>
                  {uploadVideoMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Subir video
                </Button>
              </div>
              <div className="mt-3 max-h-52 overflow-auto rounded-md border border-white/10">
                <Table>
                  <TableHeader><TableRow><TableHead>video_file_id</TableHead><TableHead>name</TableHead><TableHead>size</TableHead><TableHead>expires_at</TableHead><TableHead>acciones</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(videosQuery.data ?? []).map((v: PreviewVideoUploadItem) => (
                      <TableRow key={`vid-${v.video_file_id}`}>
                        <TableCell className="font-mono text-xs">{v.video_file_id}</TableCell>
                        <TableCell>{v.original_name ?? "-"}</TableCell>
                        <TableCell>{v.size_bytes ?? "-"}</TableCell>
                        <TableCell>{v.expires_at ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedVideoFileId(v.video_file_id)}>Usar</Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteVideoMutation.mutate(v.video_file_id)}>Eliminar</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div><Label>target_fps</Label><Input value={String(form.runtime?.target_fps ?? 20)} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, target_fps: Number(e.target.value) || 20 } }))} /></div>
            <div><Label>detector_mode</Label><Input value={form.runtime?.detector_mode ?? "local"} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, detector_mode: e.target.value } }))} /></div>
            <div><Label>detector_model_path</Label><Input value={form.runtime?.detector_model_path ?? ""} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, detector_model_path: e.target.value } }))} /></div>
            <div><Label>yolo_confidence</Label><Input value={String(form.runtime?.yolo_confidence ?? 0.4)} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, yolo_confidence: Number(e.target.value) } }))} /></div>
            <div><Label>detector_every_n_frames</Label><Input value={String((form.runtime as Record<string, unknown>)?.detector_every_n_frames ?? 2)} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, detector_every_n_frames: Number(e.target.value) || 1 } }))} /></div>
            <div><Label>detector_max_width</Label><Input value={String((form.runtime as Record<string, unknown>)?.detector_max_width ?? 960)} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, detector_max_width: Number(e.target.value) || 960 } }))} /></div>
            <div>
              <Label>stream_mode</Label>
              <select className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm" value={String((form.runtime as Record<string, unknown>)?.stream_mode ?? "buffered")} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, stream_mode: e.target.value } }))}>
                <option value="live">live</option>
                <option value="buffered">buffered</option>
              </select>
            </div>
            <div><Label>stream_buffer_seconds</Label><Input value={String((form.runtime as Record<string, unknown>)?.stream_buffer_seconds ?? 4)} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, stream_buffer_seconds: Number(e.target.value) || 0 } }))} /></div>
            <div><Label>stream_output_fps</Label><Input value={String((form.runtime as Record<string, unknown>)?.stream_output_fps ?? 8)} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, stream_output_fps: Number(e.target.value) || 8 } }))} /></div>
            <div><Label>stream_min_frames</Label><Input value={String((form.runtime as Record<string, unknown>)?.stream_min_frames ?? 24)} onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, stream_min_frames: Number(e.target.value) || 0 } }))} /></div>
            <div><Label>ocr_interval_ms</Label><Input value={String(form.sampling?.ocr_interval_ms ?? 1500)} onChange={(e) => setForm((p) => ({ ...p, sampling: { ...p.sampling, ocr_interval_ms: Number(e.target.value) } }))} /></div>
            <div><Label>llm_interval_ms</Label><Input value={String(form.sampling?.llm_interval_ms ?? 3000)} onChange={(e) => setForm((p) => ({ ...p, sampling: { ...p.sampling, llm_interval_ms: Number(e.target.value) } }))} /></div>
            <div><Label>min_crop_area</Label><Input value={String(form.sampling?.min_crop_area ?? 12000)} onChange={(e) => setForm((p) => ({ ...p, sampling: { ...p.sampling, min_crop_area: Number(e.target.value) } }))} /></div>
            <div><Label>retrigger_iou_delta</Label><Input value={String(form.sampling?.retrigger_iou_delta ?? 0.2)} onChange={(e) => setForm((p) => ({ ...p, sampling: { ...p.sampling, retrigger_iou_delta: Number(e.target.value) } }))} /></div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean((form.runtime as Record<string, unknown>)?.use_vision_llm)}
                onChange={(e) => setForm((p) => ({ ...p, runtime: { ...p.runtime, use_vision_llm: e.target.checked } }))}
              />
              use_vision_llm (runtime)
            </label>
            <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-200">
              {Boolean((form.runtime as Record<string, unknown>)?.use_vision_llm)
                ? "ON: Mejor interpretación semántica, menor FPS."
                : "OFF: Máximo rendimiento (YOLO + OCR)."}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => applyRuntimePreset("fast")}>Modo Rápido</Button>
              <Button size="sm" variant="outline" onClick={() => applyRuntimePreset("smooth_stream")}>Stream Suave</Button>
              <Button size="sm" variant="outline" onClick={() => applyRuntimePreset("smooth_latest")}>Latest JPG Suave</Button>
              <Button size="sm" variant="outline" onClick={() => applyRuntimePreset("accurate")}>Modo Preciso</Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.enrichment?.use_aliases)} onChange={(e) => setForm((p) => ({ ...p, enrichment: { ...p.enrichment, use_aliases: e.target.checked } }))} />use_aliases</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.enrichment?.use_rag)} onChange={(e) => setForm((p) => ({ ...p, enrichment: { ...p.enrichment, use_rag: e.target.checked } }))} />use_rag</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.enrichment?.use_semantic_llm)} onChange={(e) => setForm((p) => ({ ...p, enrichment: { ...p.enrichment, use_semantic_llm: e.target.checked } }))} />use_semantic_llm</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.enrichment?.use_text_enricher)} onChange={(e) => setForm((p) => ({ ...p, enrichment: { ...p.enrichment, use_text_enricher: e.target.checked } }))} />use_text_enricher (legacy)</label>
            <div><Label>semantic_model</Label><Input value={String(form.enrichment?.semantic_model ?? "")} onChange={(e) => setForm((p) => ({ ...p, enrichment: { ...p.enrichment, semantic_model: e.target.value || null } }))} placeholder="qwen3:8b" /></div>
            <div><Label>rag_limit</Label><Input value={String(form.enrichment?.rag_limit ?? 5)} onChange={(e) => setForm((p) => ({ ...p, enrichment: { ...p.enrichment, rag_limit: Number(e.target.value) || 5 } }))} /></div>
          </div>

          {formErrors.length ? <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-2 text-sm text-amber-100">{formErrors.join(" ")}</div> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => createMutation.mutate()} disabled={Boolean(formErrors.length) || createMutation.isPending || createAndStartMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear sesión
            </Button>
            <Button variant="secondary" onClick={() => createAndStartMutation.mutate()} disabled={Boolean(formErrors.length) || createMutation.isPending || createAndStartMutation.isPending}>
              {createAndStartMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Crear y arrancar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5">
        <CardHeader><CardTitle>Control de sesión</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <select className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm" value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)}>
              <option value="">Selecciona sesión...</option>
              {(sessionsQuery.data ?? []).map((s: PreviewSession) => <option key={s.session_id} value={s.session_id}>{s.session_id} ({s.status})</option>)}
            </select>
            <Button variant="outline" onClick={() => sessionsQuery.refetch()}><RefreshCcw className="mr-2 h-4 w-4" />Refrescar</Button>
          </div>
          {selectedSessionId ? (
            <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm">
              <p>session_id: <span className="font-mono">{selectedSessionId}</span></p>
              <p>status: {statusBadge(String(detailQuery.data?.status ?? "created"))}</p>
              {detailQuery.data?.status === "error" ? <p className="text-rose-300">error: {detailQuery.data?.error_message ?? "-"}</p> : null}
              <p className="flex items-center gap-2">canal eventos: {wsConnected ? <><Wifi className="h-4 w-4 text-emerald-300" />WS</> : <><WifiOff className="h-4 w-4 text-amber-300" />Polling</>}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => controlMutation.mutate({ action: "start" })}><Play className="mr-2 h-4 w-4" />Start</Button>
                <Button size="sm" variant="outline" onClick={() => controlMutation.mutate({ action: "pause" })}><Pause className="mr-2 h-4 w-4" />Pause</Button>
                <Button size="sm" variant="outline" onClick={() => controlMutation.mutate({ action: "resume" })}><Play className="mr-2 h-4 w-4" />Resume</Button>
                <Button size="sm" variant="destructive" onClick={() => controlMutation.mutate({ action: "stop" })}><Square className="mr-2 h-4 w-4" />Stop</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5">
        <CardHeader><CardTitle>Monitor en vivo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-md border border-white/10 bg-black/20 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Video anotado en vivo</p>
                <div className="flex gap-2">
                  <Button size="sm" variant={videoMode === "stream" ? "default" : "outline"} onClick={() => { setVideoMode("stream"); setStreamError(null); }}>MJPEG</Button>
                  <Button size="sm" variant={videoMode === "latest" ? "default" : "outline"} onClick={() => setVideoMode("latest")}>Latest JPG</Button>
                </div>
              </div>
              {selectedSessionId ? (
                videoMode === "stream" ? (
                  streamUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={streamUrl}
                      alt="preview-stream"
                      className="h-[360px] w-full rounded-md border border-white/10 bg-black object-contain"
                      onError={() => {
                        setStreamError("No se pudo abrir stream MJPEG. Activando fallback latest.jpg.");
                        setVideoMode("latest");
                      }}
                    />
                  ) : (
                    <div className="flex h-[360px] items-center justify-center rounded-md border border-dashed border-white/20 text-sm text-muted-foreground">
                      Esperando URL de stream...
                    </div>
                  )
                ) : (
                  latestFrameUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={latestFrameUrl}
                      alt="preview-latest-frame"
                      className="h-[360px] w-full rounded-md border border-white/10 bg-black object-contain"
                      onError={() => {
                        setLatestFrameErrorCount((prev) => {
                          const next = prev + 1;
                          if (next >= 6) {
                            setStreamError("latest.jpg respondió error repetido (posible 404). Se detuvo el refresco automático.");
                          }
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <div className="flex h-[360px] items-center justify-center rounded-md border border-dashed border-white/20 text-sm text-muted-foreground">
                      Esperando primer frame...
                    </div>
                  )
                )
              ) : (
                <div className="flex h-[360px] items-center justify-center rounded-md border border-dashed border-white/20 text-sm text-muted-foreground">Selecciona o crea una sesión para ver video.</div>
              )}
              {streamError ? <p className="mt-2 text-xs text-amber-300">{streamError}</p> : null}
              {streamUrl ? <p className="mt-1 break-all text-[11px] text-slate-400">stream_url: {streamUrl}</p> : null}
              {videoMode === "latest" && latestFrameUrl ? <p className="mt-1 break-all text-[11px] text-slate-400">latest_url: {latestFrameUrl}</p> : null}
              <div className="mt-3 rounded-md border border-emerald-300/30 bg-emerald-500/10 p-2 text-xs">
                <p className="mb-1 font-semibold text-emerald-100">Producto interpretado (último update)</p>
                {!latestInterpretedTrack ? (
                  <p className="text-slate-300">Aún no hay hipótesis de producto (esperando track_hypothesis_update / OCR).</p>
                ) : (
                  <div className="space-y-1 text-slate-100">
                    <p><span className="text-slate-300">track_id:</span> {latestInterpretedTrack.track_id}</p>
                    <p><span className="text-slate-300">producto:</span> {latestInterpretedTrack.producto ?? "-"}</p>
                    <p><span className="text-slate-300">tamano:</span> {latestInterpretedTrack.tamano ?? "-"}</p>
                    <p><span className="text-slate-300">variante:</span> {latestInterpretedTrack.variante ?? "-"}</p>
                    <p><span className="text-slate-300">precio:</span> {latestInterpretedTrack.precio ?? "-"}</p>
                    <p><span className="text-slate-300">barcode:</span> {latestInterpretedTrack.barcode ?? "-"}</p>
                    <p><span className="text-slate-300">last_seen:</span> {latestInterpretedTrack.last_seen_ts ?? "-"}</p>
                    <p><span className="text-slate-300">llm_confidence:</span> {latestInterpretedTrack.llm_confidence !== undefined ? latestInterpretedTrack.llm_confidence.toFixed(3) : "-"}</p>
                    <p><span className="text-slate-300">llm_used (vision):</span> {latestInterpretedTrack.llm_used === undefined ? "-" : String(latestInterpretedTrack.llm_used)}</p>
                    <p><span className="text-slate-300">semantic_llm_used:</span> {latestInterpretedTrack.semantic_llm_used === undefined ? "-" : String(latestInterpretedTrack.semantic_llm_used)}</p>
                    <p><span className="text-slate-300">Funciones activas:</span> aliases={String(Boolean(form.enrichment?.use_aliases))} | rag={String(Boolean(form.enrichment?.use_rag))} | semantic_llm={String(Boolean(form.enrichment?.use_semantic_llm || form.enrichment?.use_text_enricher))}</p>
                    <p><span className="text-slate-300">Stream:</span> mode={String((form.runtime as Record<string, unknown>)?.stream_mode ?? "-")} | buffer={String((form.runtime as Record<string, unknown>)?.stream_buffer_seconds ?? 0)}s</p>
                    <details>
                      <summary className="cursor-pointer text-cyan-200">Ver evidencia técnica</summary>
                      <pre className="mt-2 max-h-32 overflow-auto rounded border border-white/10 bg-black/30 p-2 text-[11px]">{JSON.stringify({ ocr_text_preview: latestInterpretedTrack.ocr_text_preview, rag_titles: latestInterpretedTrack.rag_titles ?? [], field_audit: latestInterpretedTrack.field_audit ?? {} }, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-2">
              <p className="mb-2 text-sm font-semibold">Métricas live</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">FPS</p><p>{kpi.fps.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">Frames</p><p>{kpi.frames_processed}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">OCR inf</p><p>{kpi.ocr_inferences}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">Vision LLM inf</p><p>{kpi.llm_inferences}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">Semantic LLM inf</p><p>{kpi.semantic_llm_inferences}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">runtime.use_vision_llm</p><p>{String(runtimeUseVisionLlm)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">resolved.use_semantic_llm</p><p>{String(resolvedToggles.use_semantic_llm)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">Drop frames</p><p>{kpi.drop_frames}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">stream_clients</p><p>{kpi.stream_clients}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">annotated_encode_ms</p><p>{kpi.annotated_encode_ms.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">frame_publish_fps</p><p>{kpi.frame_publish_fps.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">capture_read_ms</p><p>{kpi.capture_read_ms.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">yolo_ms</p><p>{kpi.yolo_ms.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">track_assign_ms</p><p>{kpi.track_assign_ms.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">futures_collect_ms</p><p>{kpi.futures_collect_ms.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">annotate_ms</p><p>{kpi.annotate_ms.toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">inference_pending</p><p>{kpi.inference_pending}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">active_tracks</p><p>{kpi.active_tracks}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">stream_output_fps_real</p><p>{Number(metricsQuery.data?.stream_output_fps_real ?? 0).toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">buffer_fill_frames</p><p>{Number(metricsQuery.data?.buffer_fill_frames ?? 0)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">buffer_fill_seconds</p><p>{Number(metricsQuery.data?.buffer_fill_seconds ?? 0).toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">stream_lag_seconds</p><p>{Number(metricsQuery.data?.stream_lag_seconds ?? 0).toFixed(2)}</p></div>
                <div className="rounded border border-white/10 bg-black/30 p-2"><p className="text-xs text-muted-foreground">stream_underflows</p><p>{Number(metricsQuery.data?.stream_underflows ?? 0)}</p></div>
              </div>
              <div className="mt-2 rounded border border-amber-300/30 bg-amber-500/10 p-2 text-xs text-amber-100">
                <p><span className="font-semibold">bottleneck.stage:</span> {bottleneck.stage}</p>
                <p><span className="font-semibold">reason:</span> {bottleneck.reason}</p>
                <p><span className="font-semibold">recomendación:</span> {bottleneck.recommendation}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Detecciones por frame (últimos eventos)</p>
              <div className="max-h-80 overflow-auto rounded-md border border-white/10">
                <Table>
                  <TableHeader><TableRow><TableHead>cursor</TableHead><TableHead>type</TableHead><TableHead>frame</TableHead><TableHead>fps</TableHead><TableHead>tracks</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {events.slice(-80).reverse().map((e, idx) => (
                      <TableRow key={`ev-short-${idx}-${String(e.cursor ?? idx)}`}>
                        <TableCell>{String(e.cursor ?? "-")}</TableCell>
                        <TableCell>{e.type}</TableCell>
                        <TableCell>{String((e.frame_index as number | undefined) ?? "-")}</TableCell>
                        <TableCell>{Number.isFinite(Number(e.fps)) ? Number(e.fps).toFixed(2) : "-"}</TableCell>
                        <TableCell>{Array.isArray(e.tracks_updated) ? e.tracks_updated.join(", ") : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Tracks activos</p>
              <div className="max-h-80 overflow-auto rounded-md border border-white/10">
                <Table>
                  <TableHeader><TableRow><TableHead>track_id</TableHead><TableHead>bbox</TableHead><TableHead>label/conf</TableHead><TableHead>producto</TableHead><TableHead>tamano</TableHead><TableHead>variante</TableHead><TableHead>precio</TableHead><TableHead>barcode</TableHead><TableHead>last_seen</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {tracks.map((t) => (
                      <TableRow key={`track-${t.track_id}`}>
                        <TableCell>{t.track_id}</TableCell>
                        <TableCell>{Array.isArray(t.box) ? `[${t.box.join(", ")}]` : "-"}</TableCell>
                        <TableCell>{t.label ?? "-"} / {t.conf !== undefined ? t.conf.toFixed(3) : "-"}</TableCell>
                        <TableCell>{t.producto ?? "-"}</TableCell>
                        <TableCell>{t.tamano ?? "-"}</TableCell>
                        <TableCell>{t.variante ?? "-"}</TableCell>
                        <TableCell>{t.precio ?? "-"}</TableCell>
                        <TableCell>{t.barcode ?? "-"}</TableCell>
                        <TableCell>{t.last_seen_ts ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <details>
            <summary className="cursor-pointer text-cyan-200">Panel JSON técnico (eventos)</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs">{JSON.stringify(events.slice(-30), null, 2)}</pre>
          </details>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Diagnóstico</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => diagnosticsQuery.refetch()} disabled={!selectedSessionId}><RefreshCcw className="mr-2 h-4 w-4" />Refrescar</Button>
            <Button size="sm" variant="outline" onClick={() => selectedSessionId && diagnosticsMdMutation.mutate()} disabled={!selectedSessionId || diagnosticsMdMutation.isPending}>
              {diagnosticsMdMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Copiar diagnóstico (MD)
            </Button>
            <Button
              size="sm"
              onClick={() => selectedSessionId && downloadJson(`preview_diagnostics_${selectedSessionId}.json`, diagnosticsQuery.data ?? {})}
              disabled={!selectedSessionId}
            >
              Descargar diagnóstico (JSON)
            </Button>
          </div>
        </CardHeader>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Snapshot</CardTitle>
          <Button variant="outline" onClick={() => snapshotQuery.refetch()} disabled={!selectedSessionId}>Refrescar Snapshot</Button>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <div>
              <Label>diagnostics.after</Label>
              <Input value={String(diagAfter)} onChange={(e) => setDiagAfter(Number(e.target.value) || 0)} />
            </div>
            <div className="rounded-md border border-white/10 bg-black/20 p-2 text-xs">
              diagnostics events_cursor: {String((diagnosticsQuery.data as PreviewDiagnosticsResponse | undefined)?.events_cursor ?? "-")}
            </div>
          </div>
          {!selectedSessionId ? <p className="text-sm text-muted-foreground">Selecciona sesión para ver snapshot.</p> : null}
          {selectedSessionId ? <pre className="max-h-80 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs">{JSON.stringify(snapshotQuery.data ?? {}, null, 2)}</pre> : null}
          {selectedSessionId ? <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs">{JSON.stringify(diagnosticsQuery.data ?? {}, null, 2)}</pre> : null}
        </CardContent>
      </Card>
    </div>
  );
}

