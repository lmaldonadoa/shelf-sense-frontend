"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Save, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

type Props = { account: string };

type Campaign = {
  campaign_id: string;
  name: string;
  description?: string;
  objective?: string;
  status: "draft" | "active" | "completed" | "paused";
  created_at: string;
  updated_at: string;
  attached_jobs: Array<{
    job_id: string;
    status: "pending" | "running" | "completed" | "failed";
    crops_count: number;
    created_at: string;
  }>;
  stats?: {
    total_crops_labeled: number;
    training_samples: number;
    effectiveness_gain: number;
  };
};

type CampaignListResponse = {
  campaigns: Campaign[];
  total_count: number;
};

const STATUS_COLORS = {
  draft: "bg-gray-700 text-gray-100",
  active: "bg-green-900 text-green-100",
  completed: "bg-blue-900 text-blue-100",
  paused: "bg-yellow-900 text-yellow-100",
};

const JOB_STATUS_COLORS = {
  pending: "bg-gray-700 text-gray-100",
  running: "bg-blue-700 text-blue-100",
  completed: "bg-green-900 text-green-100",
  failed: "bg-red-900 text-red-100",
};

export function ShelfTrainingCampaigns({ account }: Props) {
  const [accountName] = useState(account);
  const [formData, setFormData] = useState({ name: "", description: "", objective: "" });
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [newJobId, setNewJobId] = useState("");

  const campaignsQuery = useQuery({
    queryKey: ["shelf-campaigns", accountName],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/campaigns`
        );
        if (!response.ok) throw new Error("Failed to fetch campaigns");
        return response.json() as Promise<CampaignListResponse>;
      } catch {
        return { campaigns: [], total_count: 0 };
      }
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) throw new Error("Nombre es obligatorio");

      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/campaigns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            description: formData.description?.trim(),
            objective: formData.objective?.trim(),
            status: "draft",
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to create campaign");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Campaña creada");
      setFormData({ name: "", description: "", objective: "" });
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const attachJobMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      if (!newJobId.trim()) throw new Error("Job ID es obligatorio");

      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/campaigns/${campaignId}/jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: newJobId.trim() }),
        }
      );

      if (!response.ok) throw new Error("Failed to attach job");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Job adjunto a campaña");
      setNewJobId("");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const detachJobMutation = useMutation({
    mutationFn: async (campaignId: string, jobId: string) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/campaigns/${campaignId}/jobs/${jobId}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to detach job");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Job desadjunto");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const startCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/campaigns/${campaignId}/start`,
        { method: "POST" }
      );

      if (!response.ok) throw new Error("Failed to start campaign");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Campaña iniciada");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/campaigns/${campaignId}/pause`,
        { method: "POST" }
      );

      if (!response.ok) throw new Error("Failed to pause campaign");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Campaña pausada");
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/shelf/training/campaigns/${campaignId}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to delete campaign");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Campaña eliminada");
      setSelectedCampaignId(null);
      campaignsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const campaigns = campaignsQuery.data?.campaigns || [];
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>🎯 Campañas de Entrenamiento</CardTitle>
          <CardDescription>Agrupa jobs para generar muestras de entrenamiento etiquetadas</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {/* Left: Campaign List */}
        <div className="col-span-2 space-y-4">
          {/* Create Form */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Nueva Campaña</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input
                  placeholder="ej: Mejora de Confusiones Q2"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-white/5 border-white/10 text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Descripción</Label>
                <Textarea
                  placeholder="ej: Enfoque en pares que confunde el modelo actual"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="bg-white/5 border-white/10 text-sm mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label className="text-xs">Objetivo (opcional)</Label>
                <Input
                  placeholder="ej: Aumentar recall en Bebidas>Juices"
                  value={formData.objective}
                  onChange={(e) => setFormData(prev => ({ ...prev, objective: e.target.value }))}
                  className="bg-white/5 border-white/10 text-sm mt-1"
                />
              </div>

              <Button
                onClick={() => createCampaignMutation.mutate()}
                disabled={createCampaignMutation.isPending || !formData.name.trim()}
                size="sm"
                className="w-full gap-2"
              >
                <Plus className="h-3 w-3" />
                Crear Campaña
              </Button>
            </CardContent>
          </Card>

          {/* Campaigns List */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Campañas ({campaigns.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {campaigns.length === 0 ? (
                <div className="text-center text-white/60 py-6">
                  {campaignsQuery.isLoading ? "Cargando..." : "Sin campañas aún"}
                </div>
              ) : (
                campaigns.map((campaign) => (
                  <button
                    key={campaign.campaign_id}
                    onClick={() => setSelectedCampaignId(campaign.campaign_id)}
                    className={`w-full rounded border p-3 text-left transition-colors ${
                      selectedCampaignId === campaign.campaign_id
                        ? "border-blue-500 bg-blue-950/30"
                        : "border-white/10 bg-white/3 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{campaign.name}</p>
                        {campaign.description && (
                          <p className="text-xs text-white/60 truncate">{campaign.description}</p>
                        )}
                        <div className="flex gap-2 mt-1">
                          <Badge className={`text-xs ${STATUS_COLORS[campaign.status]}`}>
                            {campaign.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {campaign.attached_jobs.length} jobs
                          </Badge>
                        </div>
                      </div>

                      {campaign.stats && (
                        <div className="text-right text-xs text-white/60 flex-shrink-0">
                          <p>{campaign.stats.total_crops_labeled} crops</p>
                          <p className="text-green-300">+{(campaign.stats.effectiveness_gain * 100).toFixed(1)}%</p>
                        </div>
                      )}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Campaign Detail */}
        <div className="space-y-3">
          {selectedCampaign ? (
            <>
              {/* Detail Card */}
              <Card className="border-blue-500/30 bg-blue-950/20">
                <CardHeader>
                  <CardTitle className="text-sm">{selectedCampaign.name}</CardTitle>
                  <Badge className={`text-xs w-fit mt-1 ${STATUS_COLORS[selectedCampaign.status]}`}>
                    {selectedCampaign.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedCampaign.description && (
                    <div>
                      <p className="text-xs text-white/60">Descripción</p>
                      <p className="text-sm mt-1">{selectedCampaign.description}</p>
                    </div>
                  )}

                  {selectedCampaign.objective && (
                    <div>
                      <p className="text-xs text-white/60">Objetivo</p>
                      <p className="text-sm mt-1">{selectedCampaign.objective}</p>
                    </div>
                  )}

                  {selectedCampaign.stats && (
                    <div className="rounded border border-white/10 bg-white/3 p-2 space-y-1">
                      <p className="text-xs text-white/60">Estadísticas</p>
                      <p className="text-xs">Crops: {selectedCampaign.stats.total_crops_labeled}</p>
                      <p className="text-xs">Muestras: {selectedCampaign.stats.training_samples}</p>
                      <p className="text-xs text-green-300">
                        Ganancia: +{(selectedCampaign.stats.effectiveness_gain * 100).toFixed(1)}%
                      </p>
                    </div>
                  )}

                  {/* Control Buttons */}
                  <div className="flex gap-1 pt-2">
                    {selectedCampaign.status === "draft" && (
                      <Button
                        onClick={() => startCampaignMutation.mutate(selectedCampaign.campaign_id)}
                        disabled={startCampaignMutation.isPending}
                        size="sm"
                        className="flex-1 gap-1"
                      >
                        <Play className="h-3 w-3" />
                        Iniciar
                      </Button>
                    )}

                    {selectedCampaign.status === "active" && (
                      <Button
                        onClick={() => pauseCampaignMutation.mutate(selectedCampaign.campaign_id)}
                        disabled={pauseCampaignMutation.isPending}
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1"
                      >
                        <Square className="h-3 w-3" />
                        Pausar
                      </Button>
                    )}

                    <Button
                      onClick={() => deleteCampaignMutation.mutate(selectedCampaign.campaign_id)}
                      disabled={deleteCampaignMutation.isPending}
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Attach Job Form */}
              <Card className="border-white/10 bg-white/5">
                <CardHeader>
                  <CardTitle className="text-sm">Adjuntar Job</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    placeholder="Job ID"
                    value={newJobId}
                    onChange={(e) => setNewJobId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && attachJobMutation.mutate(selectedCampaign.campaign_id)}
                    className="bg-white/5 border-white/10 text-xs"
                  />
                  <Button
                    onClick={() => attachJobMutation.mutate(selectedCampaign.campaign_id)}
                    disabled={attachJobMutation.isPending || !newJobId.trim()}
                    size="sm"
                    className="w-full gap-2"
                  >
                    <Plus className="h-3 w-3" />
                    Adjuntar
                  </Button>
                </CardContent>
              </Card>

              {/* Attached Jobs */}
              {selectedCampaign.attached_jobs.length > 0 && (
                <Card className="border-white/10 bg-white/5">
                  <CardHeader>
                    <CardTitle className="text-sm">Jobs ({selectedCampaign.attached_jobs.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-48 overflow-y-auto">
                    {selectedCampaign.attached_jobs.map((job) => (
                      <div
                        key={job.job_id}
                        className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono font-semibold">{job.job_id}</p>
                          <div className="flex gap-2 items-center mt-1">
                            <Badge className={`text-xs ${JOB_STATUS_COLORS[job.status]}`}>
                              {job.status}
                            </Badge>
                            <span className="text-xs text-white/60">{job.crops_count} crops</span>
                          </div>
                        </div>
                        <Button
                          onClick={() => detachJobMutation.mutate(selectedCampaign.campaign_id, job.job_id)}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-white/10 bg-white/5">
              <CardContent className="py-8 text-center text-white/60">
                Selecciona una campaña para ver detalles
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
