"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Props = { account: string };

type Cluster = {
  cluster_id: string;
  size: number;
  avg_similarity: number;
  representative_crop: {
    job_id: string;
    image_id: number;
    crop_id: string;
    download_url: string;
  };
  suggested_sku?: {
    sku_id: string;
    nombre: string;
    categoria?: string;
    confidence: number;
  };
  crop_refs: Array<{ job_id: string; image_id: number; crop_id: string }>;
};

type ClusterResponse = {
  clusters_count: number;
  crops_total: number;
  clusters: Cluster[];
};

type Column = {
  id: string;
  label: string;
  skuId?: string;
  color: string;
};

const COLUMNS: Column[] = [
  { id: "unassigned", label: "Sin asignar", color: "border-gray-500 bg-gray-950/30" },
  { id: "discard", label: "Descartar", color: "border-red-500 bg-red-950/30" },
];

export function ShelfClusterBoard({ account }: Props) {
  const [accountName] = useState(account);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [jobInput, setJobInput] = useState("");
  const [columns, setColumns] = useState<Column[]>(COLUMNS);
  const [draggedCluster, setDraggedCluster] = useState<Cluster | null>(null);
  const [showNewSkuForm, setShowNewSkuForm] = useState(false);
  const [newSkuId, setNewSkuId] = useState("");

  const clustersQuery = useQuery({
    queryKey: ["cluster-crops", accountName, jobIds],
    queryFn: async () => {
      if (!jobIds.length) return { clusters: [], clusters_count: 0, crops_total: 0 };

      try {
        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/cluster-crops`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_ids: jobIds,
              async_mode: false,
            }),
          }
        );

        if (!response.ok) throw new Error("Failed to cluster");
        return response.json() as Promise<ClusterResponse>;
      } catch {
        return { clusters: [], clusters_count: 0, crops_total: 0 };
      }
    },
    enabled: jobIds.length > 0,
  });

  const bulkActionMutation = useMutation({
    mutationFn: async (data: { cluster: Cluster; action: string; skuId?: string }) => {
      const { cluster, action, skuId } = data;

      if (action === "discard") {
        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/curation/bulk-action`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "discard",
              crop_refs: cluster.crop_refs,
              async_mode: false,
            }),
          }
        );
        if (!response.ok) throw new Error("Failed to discard cluster");
        return response.json();
      } else if (action === "assign" && skuId) {
        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/curation/bulk-action`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "assign_sku",
              sku_id: skuId,
              dataset_role: "reference_active",
              is_indexable: true,
              attach_as_reference: true,
              crop_refs: cluster.crop_refs,
              async_mode: false,
            }),
          }
        );
        if (!response.ok) throw new Error("Failed to assign cluster");
        return response.json();
      }
    },
    onSuccess: () => {
      toast.success("Cluster procesado");
      clustersQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const handleAddJob = () => {
    if (jobInput.trim() && !jobIds.includes(jobInput.trim())) {
      setJobIds([...jobIds, jobInput.trim()]);
      setJobInput("");
    }
  };

  const handleAddSkuColumn = () => {
    if (newSkuId.trim()) {
      const newColumn: Column = {
        id: newSkuId.toUpperCase(),
        label: newSkuId.toUpperCase(),
        skuId: newSkuId.toUpperCase(),
        color: "border-blue-500 bg-blue-950/30",
      };
      setColumns([...columns, newColumn]);
      setNewSkuId("");
      setShowNewSkuForm(false);
    }
  };

  const handleDragStart = (cluster: Cluster) => {
    setDraggedCluster(cluster);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (columnId: string) => {
    if (!draggedCluster) return;

    if (columnId === "discard") {
      bulkActionMutation.mutate({ cluster: draggedCluster, action: "discard" });
    } else if (columnId !== "unassigned") {
      const column = columns.find(c => c.id === columnId);
      if (column?.skuId) {
        bulkActionMutation.mutate({
          cluster: draggedCluster,
          action: "assign",
          skuId: column.skuId,
        });
      }
    }

    setDraggedCluster(null);
  };

  const clusters = clustersQuery.data?.clusters || [];
  const unassignedClusters = clusters.filter(c => !c.suggested_sku);

  return (
    <div className="space-y-4">
      {/* Input de Jobs */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>📊 Cluster Board</CardTitle>
          <CardDescription>Arrastra clusters a columnas para asignar masivamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="ID de job (ej: job_a)"
              value={jobInput}
              onChange={(e) => setJobInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddJob()}
              className="bg-white/5 border-white/10"
            />
            <Button onClick={handleAddJob} variant="outline">
              + Job
            </Button>
          </div>

          {jobIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {jobIds.map((jobId) => (
                <Badge key={jobId} variant="secondary">
                  {jobId}
                  <button onClick={() => setJobIds(jobIds.filter(j => j !== jobId))} className="ml-2 text-xs">
                    ✕
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {clustersQuery.isLoading && (
            <div className="flex items-center gap-2 text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Clustering {clustersQuery.data?.crops_total || 0} crops...
            </div>
          )}

          {clusters.length > 0 && (
            <p className="text-xs text-white/60">
              {clusters.length} clusters • {clustersQuery.data?.crops_total} crops totales
            </p>
          )}
        </CardContent>
      </Card>

      {/* Kanban Board */}
      <div className="grid grid-cols-auto gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.id}
            className={`flex-shrink-0 w-80 rounded border-2 ${column.color} p-4 min-h-96`}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.id)}
          >
            <h3 className="font-semibold mb-3">{column.label}</h3>

            <div className="space-y-2">
              {column.id === "unassigned" &&
                unassignedClusters.map((cluster) => (
                  <ClusterCard
                    key={cluster.cluster_id}
                    cluster={cluster}
                    onDragStart={handleDragStart}
                  />
                ))}

              {column.id !== "unassigned" &&
                column.id !== "discard" &&
                clusters
                  .filter(c => c.suggested_sku?.sku_id === column.skuId)
                  .map((cluster) => (
                    <ClusterCard
                      key={cluster.cluster_id}
                      cluster={cluster}
                      onDragStart={handleDragStart}
                    />
                  ))}
            </div>
          </div>
        ))}

        {/* Add SKU Column Button */}
        {!showNewSkuForm && (
          <Button
            onClick={() => setShowNewSkuForm(true)}
            variant="outline"
            className="h-fit self-start"
          >
            + Agregar SKU
          </Button>
        )}

        {showNewSkuForm && (
          <div className="flex-shrink-0 w-80 rounded border border-white/10 bg-white/5 p-4">
            <Input
              placeholder="SKU ID"
              value={newSkuId}
              onChange={(e) => setNewSkuId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSkuColumn()}
              className="bg-white/5 border-white/10 mb-2"
              autoFocus
            />
            <div className="flex gap-2">
              <Button onClick={handleAddSkuColumn} size="sm" className="flex-1">
                Crear
              </Button>
              <Button
                onClick={() => {
                  setShowNewSkuForm(false);
                  setNewSkuId("");
                }}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClusterCard({
  cluster,
  onDragStart,
}: {
  cluster: Cluster;
  onDragStart: (cluster: Cluster) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(cluster)}
      className="rounded border border-white/10 bg-white/3 p-3 cursor-move hover:bg-white/5 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-mono text-xs font-semibold">{cluster.cluster_id}</p>
          <p className="text-xs text-white/60">{cluster.size} crops</p>
        </div>
      </div>

      {cluster.suggested_sku && (
        <div className="text-xs space-y-1 mb-2">
          <p className="font-mono text-xs text-blue-300">{cluster.suggested_sku.sku_id}</p>
          <p className="text-white/60 truncate">{cluster.suggested_sku.nombre}</p>
          <Badge
            className={
              cluster.suggested_sku.confidence > 0.8
                ? "bg-green-900 text-green-100"
                : cluster.suggested_sku.confidence > 0.6
                  ? "bg-yellow-900 text-yellow-100"
                  : "bg-gray-700 text-gray-100"
            }
          >
            {(cluster.suggested_sku.confidence * 100).toFixed(0)}%
          </Badge>
        </div>
      )}

      <img
        src={cluster.representative_crop.download_url}
        alt="cluster"
        className="w-full h-32 rounded object-cover"
      />
    </div>
  );
}
