"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Props = { account: string };

type SKUInfo = {
  sku_id: string;
  nombre: string;
  categoria?: string;
};

type ConfusionPair = {
  sku_a: SKUInfo;
  sku_b: SKUInfo;
  confusion_count: number;
  misclassification_rate: number;
};

type ReliabilitySummary = {
  total_skus: number;
  total_crops: number;
  pairs_with_confusion: ConfusionPair[];
  hardnegative_pairs: Array<{ sku_a: string; sku_b: string; created_at: string }>;
};

export function ShelfConfusionStudio({ account }: Props) {
  const [accountName] = useState(account);
  const [dateRange, setDateRange] = useState({ days: 30 });
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string } | null>(null);
  const [newHardnegA, setNewHardnegA] = useState("");
  const [newHardnegB, setNewHardnegB] = useState("");

  const reliabilityQuery = useQuery({
    queryKey: ["shelf-confusion", accountName, dateRange.days],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/reliability/summary?days=${dateRange.days}`
        );
        if (!response.ok) throw new Error("Failed to fetch reliability data");
        return response.json() as Promise<ReliabilitySummary>;
      } catch {
        return { total_skus: 0, total_crops: 0, pairs_with_confusion: [], hardnegative_pairs: [] };
      }
    },
  });

  const createHardnegMutation = useMutation({
    mutationFn: async () => {
      if (!newHardnegA.trim() || !newHardnegB.trim()) {
        throw new Error("Ambos SKU IDs son obligatorios");
      }

      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/hardnegatives`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku_a: newHardnegA.toUpperCase().trim(),
            sku_b: newHardnegB.toUpperCase().trim(),
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to create hard negative pair");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Hard negative creado");
      setNewHardnegA("");
      setNewHardnegB("");
      reliabilityQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const deleteHardnegMutation = useMutation({
    mutationFn: async (skuA: string, skuB: string) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/hardnegatives/${encodeURIComponent(skuA)}/${encodeURIComponent(skuB)}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete hard negative pair");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Hard negative eliminado");
      reliabilityQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const data = reliabilityQuery.data || { total_skus: 0, total_crops: 0, pairs_with_confusion: [], hardnegative_pairs: [] };

  const sortedPairs = [...data.pairs_with_confusion].sort((a, b) => b.confusion_count - a.confusion_count);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>🔬 Confusion Studio</CardTitle>
          <CardDescription>Matriz de confusiones SKU×SKU — detecta y marca hard negatives</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div>
              <label className="text-sm text-white/60">Período (días)</label>
              <Input
                type="number"
                min="7"
                max="365"
                value={dateRange.days}
                onChange={(e) => setDateRange({ days: parseInt(e.target.value) || 30 })}
                className="w-24 bg-white/5 border-white/10"
              />
            </div>
            {reliabilityQuery.isLoading && (
              <div className="flex items-center gap-2 text-white/60 flex-1">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando...
              </div>
            )}
          </div>

          {data.total_skus > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-white/10 bg-white/3 p-2">
                <p className="text-xs text-white/60">SKUs Totales</p>
                <p className="text-lg font-semibold">{data.total_skus}</p>
              </div>
              <div className="rounded border border-white/10 bg-white/3 p-2">
                <p className="text-xs text-white/60">Crops Analizados</p>
                <p className="text-lg font-semibold">{data.total_crops}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {/* Left: Pairs with Confusion */}
        <div className="col-span-2 space-y-3">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">
                Pares con Confusión ({sortedPairs.length})
              </CardTitle>
              <CardDescription>Ordenados por frecuencia de confusión</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {sortedPairs.length === 0 ? (
                <div className="text-center text-white/60 py-6">
                  {reliabilityQuery.isLoading ? "Cargando..." : "Sin confusiones detectadas"}
                </div>
              ) : (
                sortedPairs.map((pair, idx) => (
                  <button
                    key={`${pair.sku_a.sku_id}-${pair.sku_b.sku_id}`}
                    onClick={() => setSelectedPair({ a: pair.sku_a.sku_id, b: pair.sku_b.sku_id })}
                    className={`w-full rounded border p-3 text-left transition-colors ${
                      selectedPair?.a === pair.sku_a.sku_id && selectedPair?.b === pair.sku_b.sku_id
                        ? "border-blue-500 bg-blue-950/30"
                        : "border-white/10 bg-white/3 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">
                          {idx + 1}. {pair.sku_a.sku_id} ↔ {pair.sku_b.sku_id}
                        </p>
                        <p className="text-xs text-white/60 truncate">
                          {pair.sku_a.nombre}
                        </p>
                        <p className="text-xs text-white/60 truncate">
                          {pair.sku_b.nombre}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <Badge className="text-xs bg-red-900 text-red-100">
                          {pair.confusion_count} confusiones
                        </Badge>
                        <Badge
                          className={`text-xs ${
                            pair.misclassification_rate > 0.2
                              ? "bg-red-900 text-red-100"
                              : pair.misclassification_rate > 0.1
                                ? "bg-yellow-900 text-yellow-100"
                                : "bg-green-900 text-green-100"
                          }`}
                        >
                          {(pair.misclassification_rate * 100).toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Detail + Hard Negative Form */}
        <div className="space-y-3">
          {/* Detail Card */}
          {selectedPair && (
            <Card className="border-blue-500/30 bg-blue-950/20">
              <CardHeader>
                <CardTitle className="text-sm">Detalle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="text-white/60">SKU A</p>
                  <p className="font-mono font-semibold text-blue-300">{selectedPair.a}</p>
                </div>
                <div>
                  <p className="text-white/60">SKU B</p>
                  <p className="font-mono font-semibold text-blue-300">{selectedPair.b}</p>
                </div>

                {data.pairs_with_confusion.find(
                  (p) => p.sku_a.sku_id === selectedPair.a && p.sku_b.sku_id === selectedPair.b
                ) && (
                  <div className="rounded border border-white/10 bg-white/3 p-2 mt-3">
                    <p className="text-xs text-white/60">Estadísticas</p>
                    <p className="text-xs mt-1">
                      Confusiones:{" "}
                      {
                        data.pairs_with_confusion.find(
                          (p) => p.sku_a.sku_id === selectedPair.a && p.sku_b.sku_id === selectedPair.b
                        )?.confusion_count
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Hard Negative Form */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Crear Hard Negative</CardTitle>
              <CardDescription>Marcar par como "nunca igual"</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs text-white/60">SKU A</label>
                <Input
                  placeholder="ej: SKU123"
                  value={newHardnegA}
                  onChange={(e) => setNewHardnegA(e.target.value)}
                  className="bg-white/5 border-white/10 text-xs mt-1"
                />
              </div>

              <div>
                <label className="text-xs text-white/60">SKU B</label>
                <Input
                  placeholder="ej: SKU456"
                  value={newHardnegB}
                  onChange={(e) => setNewHardnegB(e.target.value)}
                  className="bg-white/5 border-white/10 text-xs mt-1"
                />
              </div>

              <Button
                onClick={() => createHardnegMutation.mutate()}
                disabled={createHardnegMutation.isPending || !newHardnegA.trim() || !newHardnegB.trim()}
                size="sm"
                className="w-full gap-2"
              >
                <Plus className="h-3 w-3" />
                Crear
              </Button>
            </CardContent>
          </Card>

          {/* Hard Negatives List */}
          {data.hardnegative_pairs.length > 0 && (
            <Card className="border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-sm">Hard Negatives ({data.hardnegative_pairs.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                {data.hardnegative_pairs.map((pair, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono">
                        {pair.sku_a} ↔ {pair.sku_b}
                      </p>
                      <p className="text-xs text-white/60">
                        {new Date(pair.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      onClick={() => deleteHardnegMutation.mutate(pair.sku_a, pair.sku_b)}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
