"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, X, Maximize2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ocrApi } from "@/lib/ocrApi";

type Props = { account: string };

type CurationItem = {
  item_id: string;
  source: "recognition" | "crop_extraction" | "review_queue";
  job_id: string;
  image_id: number;
  crop_id: string;
  thumb_url: string;
  top_candidates: Array<{
    sku_id: string;
    score: number;
    nombre: string;
  }>;
  confidence_state: "confident" | "ambiguous_top2" | "low_confidence" | "unknown";
  suggested_sku_id?: string;
  categoria?: string;
  cluster_id?: string;
  campaign_id?: string;
  assigned_to?: string;
  created_at: string;
};

type InboxResponse = {
  items: CurationItem[];
  next_cursor?: string;
  totals: {
    pending: number;
    ambiguous: number;
    unknown: number;
  };
};

const CONFIDENCE_COLORS = {
  confident: "bg-green-900 text-green-100",
  ambiguous_top2: "bg-yellow-900 text-yellow-100",
  low_confidence: "bg-gray-700 text-gray-100",
  unknown: "bg-red-900 text-red-100",
};

function skuCodesEqual(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return Boolean(left) && left === right;
}

function skuConfusionKey(anchorSku: string, negativeSku: string): string {
  return `${anchorSku.trim().toUpperCase()}::${negativeSku.trim().toUpperCase()}`;
}

export function ShelfCurationInbox({ account }: Props) {
  const [accountName] = useState(account);
  const [statusFilter, setStatusFilter] = useState<"pending" | "ambiguous" | "unknown" | "all">("pending");
  const [sourceFilter, setSourceFilter] = useState<"recognition" | "crop_extraction" | "review_queue" | "all">("all");
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [anchorSkuId, setAnchorSkuId] = useState("");
  const [savedConfusionKeys, setSavedConfusionKeys] = useState<Set<string>>(() => new Set());

  const inboxQuery = useQuery({
    queryKey: ["shelf-inbox", accountName, statusFilter, sourceFilter],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (sourceFilter !== "all") params.set("source", sourceFilter);
        params.set("limit", "50");

        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/curation/inbox?${params.toString()}`
        );
        if (!response.ok) throw new Error("Failed to fetch inbox");
        return response.json() as Promise<InboxResponse>;
      } catch {
        return { items: [], totals: { pending: 0, ambiguous: 0, unknown: 0 } };
      }
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // Encontrar el item
      const item = inboxQuery.data?.items.find(i => i.item_id === itemId);
      if (!item) throw new Error("Item not found");

      const url = item.source === "review_queue"
        ? `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/review-queue/${itemId}/decision`
        : `/admin/ocr/proxy/v1/shelf/jobs/${item.job_id}/images/${item.image_id}/results/${item.crop_id}/decision`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "confirm" }),
      });

      if (!response.ok) throw new Error("Failed to accept");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Crop aceptado");
      inboxQuery.refetch();
      setCurrentItemIndex(Math.min(currentItemIndex, (inboxQuery.data?.items.length || 1) - 2));
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const markConfusionMutation = useMutation({
    mutationFn: async (args: { anchorSku: string; negativeSku: string }) => {
      const anchor = args.anchorSku.trim();
      const negative = args.negativeSku.trim();
      if (!anchor) throw new Error("Selecciona primero el SKU correcto.");
      if (!negative) throw new Error("Selecciona el SKU confundido.");
      if (skuCodesEqual(anchor, negative)) throw new Error("El SKU confundido no puede ser el mismo que el correcto.");
      return ocrApi.createShelfHardNegative(accountName, anchor, {
        negative_sku_id: negative,
        reason: "similar_packaging",
        note: "Creado desde curaduría frontend",
        user: "frontend",
      });
    },
    onSuccess: (_data, variables) => {
      const anchor = variables.anchorSku.trim();
      const negative = variables.negativeSku.trim();
      setSavedConfusionKeys((prev) => {
        const next = new Set(prev);
        next.add(skuConfusionKey(anchor, negative));
        return next;
      });
      toast.success(`Confusión guardada: ${negative} se marcó como similar pero incorrecto para ${anchor}.`);
    },
    onError: () => {
      toast.error("No se pudo guardar la confusión frecuente. Inténtalo de nuevo.");
    },
  });

  const discardMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const item = inboxQuery.data?.items.find(i => i.item_id === itemId);
      if (!item) throw new Error("Item not found");

      const url = item.source === "review_queue"
        ? `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/review-queue/${itemId}/decision`
        : `/admin/ocr/proxy/v1/shelf/jobs/${item.job_id}/images/${item.image_id}/results/${item.crop_id}/decision`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "discard" }),
      });

      if (!response.ok) throw new Error("Failed to discard");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Crop descartado");
      inboxQuery.refetch();
      setCurrentItemIndex(Math.min(currentItemIndex, (inboxQuery.data?.items.length || 1) - 2));
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const items = inboxQuery.data?.items || [];
  const currentItem = items[currentItemIndex];
  const totals = inboxQuery.data?.totals || { pending: 0, ambiguous: 0, unknown: 0 };

  useEffect(() => {
    if (!currentItem) {
      setAnchorSkuId("");
      return;
    }
    setAnchorSkuId(currentItem.suggested_sku_id || currentItem.top_candidates[0]?.sku_id || "");
  }, [currentItem?.item_id, currentItem?.suggested_sku_id, currentItem?.top_candidates]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "a" || e.key === "A") {
      if (currentItem) acceptMutation.mutate(currentItem.item_id);
    } else if (e.key === "d" || e.key === "D") {
      if (currentItem) discardMutation.mutate(currentItem.item_id);
    } else if (e.key === "ArrowRight") {
      setCurrentItemIndex(Math.min(currentItemIndex + 1, items.length - 1));
    } else if (e.key === "ArrowLeft") {
      setCurrentItemIndex(Math.max(currentItemIndex - 1, 0));
    }
  };

  return (
    <div className="space-y-4" onKeyDown={handleKeyPress} tabIndex={0}>
      {/* Header */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>🎯 Inbox de Curaduría</CardTitle>
          <CardDescription>Triage rápido de crops — usa A (aceptar), D (descartar), → (siguiente)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={statusFilter === "pending" ? "default" : "outline"}
                onClick={() => setStatusFilter("pending")}
              >
                Pendientes ({totals.pending})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "ambiguous" ? "default" : "outline"}
                onClick={() => setStatusFilter("ambiguous")}
              >
                Ambiguos ({totals.ambiguous})
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "unknown" ? "default" : "outline"}
                onClick={() => setStatusFilter("unknown")}
              >
                Desconocidos ({totals.unknown})
              </Button>
            </div>

            {/* Progress Bar */}
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600"
                  style={{ width: `${items.length > 0 ? ((currentItemIndex + 1) / items.length) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm text-white/60">
                {currentItemIndex + 1} / {items.length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Triage Layout - 4 columnas */}
      {currentItem && (
        <div className="grid grid-cols-4 gap-4 h-[600px]">
          {/* Col 1: Crop grande */}
          <div className="col-span-2 space-y-2">
            <Card className="border-white/10 bg-white/5 h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Crop ({currentItem.crop_id})</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-2">
                <div className="flex-1 rounded border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center relative group">
                  <img
                    src={currentItem.thumb_url}
                    alt="crop"
                    className="max-w-full max-h-full object-contain"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                    onClick={() => setFullscreenId(currentItem.item_id)}
                  >
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Atajos */}
                <div className="grid grid-cols-2 gap-2 text-xs text-white/60 bg-white/5 p-2 rounded">
                  <div>
                    <kbd className="px-2 py-1 bg-white/10 rounded">A</kbd> Aceptar
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-white/10 rounded">D</kbd> Descartar
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-white/10 rounded">→</kbd> Siguiente
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-white/10 rounded">←</kbd> Anterior
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Col 2: Candidatos similares */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Candidatos similares</CardTitle>
              <CardDescription className="text-xs">
                Confirma el SKU correcto y, si aplica, marca confusiones. No reasigna la imagen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-[11px] text-white/50">SKU correcto (ancla)</p>
                <Input
                  value={anchorSkuId}
                  onChange={(e) => setAnchorSkuId(e.target.value)}
                  placeholder="Ej. JAB0011"
                  className="mt-1 h-8 text-xs font-mono"
                />
              </div>
              <p className="text-[11px] text-white/50">
                Si alguno se confunde con frecuencia con el correcto, márcalo como similar pero incorrecto.
              </p>
              {currentItem.top_candidates.map((cand, idx) => {
                const isAnchor = Boolean(anchorSkuId.trim()) && skuCodesEqual(cand.sku_id, anchorSkuId);
                const canMarkConfusion = Boolean(anchorSkuId.trim()) && !isAnchor;
                const confusionKey = skuConfusionKey(anchorSkuId, cand.sku_id);
                const alreadySaved = savedConfusionKeys.has(confusionKey);
                return (
                  <div
                    key={cand.sku_id}
                    className={`rounded border p-2 ${
                      isAnchor ? "border-cyan-500 bg-cyan-950/20" : idx === 0 ? "border-green-500/60 bg-green-950/10" : "border-white/10 bg-white/3"
                    }`}
                  >
                    <p className="truncate font-mono text-xs font-semibold">{cand.sku_id}</p>
                    <p className="truncate text-xs text-white/60">{cand.nombre}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {(cand.score * 100).toFixed(0)}%
                      </Badge>
                      {isAnchor ? <Badge className="text-[10px]">SKU correcto</Badge> : null}
                      {!isAnchor ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => setAnchorSkuId(cand.sku_id)}
                        >
                          Usar como correcto
                        </Button>
                      ) : null}
                      {canMarkConfusion ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-amber-100 hover:text-amber-50"
                          disabled={markConfusionMutation.isPending || alreadySaved}
                          title="No reasigna la imagen. Solo guarda que este SKU suele confundirse con el correcto."
                          onClick={() => markConfusionMutation.mutate({ anchorSku: anchorSkuId.trim(), negativeSku: cand.sku_id })}
                        >
                          {alreadySaved ? "Confusión guardada" : "Similar pero incorrecto"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Col 3: Información */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-white/60">Confianza</p>
                <Badge className={CONFIDENCE_COLORS[currentItem.confidence_state]}>
                  {currentItem.confidence_state}
                </Badge>
              </div>

              {currentItem.categoria && (
                <div>
                  <p className="text-white/60">Categoría</p>
                  <p className="font-mono text-xs">{currentItem.categoria}</p>
                </div>
              )}

              {currentItem.cluster_id && (
                <div>
                  <p className="text-white/60">Cluster</p>
                  <p className="font-mono text-xs">{currentItem.cluster_id}</p>
                </div>
              )}

              {currentItem.campaign_id && (
                <div>
                  <p className="text-white/60">Campaña</p>
                  <p className="font-mono text-xs">{currentItem.campaign_id}</p>
                </div>
              )}

              <div>
                <p className="text-white/60">Fuente</p>
                <Badge variant="outline" className="text-xs">
                  {currentItem.source}
                </Badge>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => acceptMutation.mutate(currentItem.item_id)}
                  disabled={acceptMutation.isPending}
                  size="sm"
                  className="flex-1 gap-1"
                >
                  <Check className="h-3 w-3" />
                  Aceptar
                </Button>
                <Button
                  onClick={() => discardMutation.mutate(currentItem.item_id)}
                  disabled={discardMutation.isPending}
                  variant="destructive"
                  size="sm"
                  className="flex-1 gap-1"
                >
                  <X className="h-3 w-3" />
                  Descartar
                </Button>
              </div>

              {currentItemIndex < items.length - 1 && (
                <Button
                  onClick={() => setCurrentItemIndex(currentItemIndex + 1)}
                  variant="outline"
                  size="sm"
                  className="w-full gap-1"
                >
                  Siguiente <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!currentItem && (
        <Card className="border-white/10 bg-white/5">
          <CardContent className="py-8 text-center text-white/60">
            {inboxQuery.isLoading ? "Cargando..." : "No hay items en el inbox"}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
