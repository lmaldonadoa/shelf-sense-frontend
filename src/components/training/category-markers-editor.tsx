"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bookmark, ChevronDown, ChevronUp, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  TrainingFooterNote,
  TrainingFormCard,
  TrainingPanelCard,
  TrainingSectionHero,
} from "@/components/training/training-ui";
import { LoadingPanel } from "@/components/ui/async-content";

type Props = { account: string };

type CategoryMarker = {
  marker: string;
  canonical: string;
  priority: number;
  chain_whitelist?: string[];
  is_active?: boolean;
  notes?: string;
};

const PRIORITY_GUIDE = [
  { priority: 10, name: "Categoría Macro", example: "KIT ESCOLAR" },
  { priority: 20, name: "Compuesta Específica", example: "CEPILLO PASTA" },
  { priority: 30, name: "Específica con Modificador", example: "DENTAL CON FLUOR" },
  { priority: 40, name: "Subcategoría Estándar", example: "PASTA DENTAL" },
  { priority: 50, name: "Genérica", example: "CEPILLO" },
  { priority: 60, name: "Categoría Amplia", example: "DESODORANTE" },
];

export function CategoryMarkersEditor({ account }: Props) {
  const [accountName] = useState(account);
  const [expandedDefaults, setExpandedDefaults] = useState(false);
  const [formData, setFormData] = useState<CategoryMarker>({
    marker: "",
    canonical: "",
    priority: 40,
    chain_whitelist: [],
    is_active: true,
    notes: "",
  });
  const [chainInput, setChainInput] = useState("");

  const markersQuery = useQuery({
    queryKey: ["category-markers", accountName],
    queryFn: async () => {
      try {
        const response = await fetch(`/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-category-markers`);
        if (!response.ok) throw new Error("Failed to fetch markers");
        return response.json();
      } catch {
        return { defaults: [], custom: [], effective: [] };
      }
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!formData.marker.trim()) throw new Error("Marker es obligatorio");
      if (!formData.canonical.trim()) throw new Error("Canonical es obligatorio");

      const payload = {
        marker: formData.marker.trim().toUpperCase(),
        canonical: formData.canonical.trim().toUpperCase(),
        priority: Number(formData.priority) || 100,
        chain_whitelist: formData.chain_whitelist?.filter(c => c.trim()) || [],
        is_active: formData.is_active !== false,
        notes: formData.notes?.trim(),
      };

      const response = await fetch(`/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-category-markers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to upsert marker");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Marker guardado");
      markersQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (markerId: number) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-category-markers/${markerId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete marker");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Marker eliminado");
      markersQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const resetForm = () => {
    setFormData({
      marker: "",
      canonical: "",
      priority: 40,
      chain_whitelist: [],
      is_active: true,
      notes: "",
    });
    setChainInput("");
  };

  const handleAddChain = () => {
    if (chainInput.trim()) {
      setFormData(prev => ({
        ...prev,
        chain_whitelist: [...(prev.chain_whitelist || []), chainInput.trim().toLowerCase()],
      }));
      setChainInput("");
    }
  };

  const handleRemoveChain = (chain: string) => {
    setFormData(prev => ({
      ...prev,
      chain_whitelist: (prev.chain_whitelist || []).filter(c => c !== chain),
    }));
  };

  const data = markersQuery.data || { defaults: [], custom: [], effective: [] };

  return (
    <div className="space-y-4">
      <TrainingSectionHero
        tone="violet"
        icon={<Bookmark className="h-4 w-4" />}
        title="Markers de categoria"
        description="Detecta subcategorias desde texto OCR de soporte. Menor prioridad = se evalua primero."
        badges={
          <Badge variant="outline" className="border-violet-400/30 text-[10px] text-violet-100">
            promotions
          </Badge>
        }
        kpis={[
          { label: "Defaults", value: data.defaults?.length ?? 0 },
          { label: "Custom", value: data.custom?.length ?? 0 },
          { label: "Efectivos", value: data.effective?.length ?? 0 },
          { label: "Prioridad media", value: data.custom?.length ? Math.round(data.custom.reduce((s: number, m: { priority?: number }) => s + (m.priority ?? 100), 0) / data.custom.length) : "—" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => markersQuery.refetch()}
          disabled={markersQuery.isFetching}
        >
          {markersQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {markersQuery.isLoading ? (
        <LoadingPanel message="Cargando markers de categoría…" variant="cards" />
      ) : null}

      <TrainingFormCard title="Nuevo marker de categoria" tone="violet">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="marker">Marker (texto a buscar)</Label>
              <Input
                id="marker"
                placeholder="ej: TOALLA HUMEDA"
                value={formData.marker}
                onChange={(e) => setFormData(prev => ({ ...prev, marker: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canonical">Canonical (categoría)</Label>
              <Input
                id="canonical"
                placeholder="ej: TOALLAS HUMEDAS"
                value={formData.canonical}
                onChange={(e) => setFormData(prev => ({ ...prev, canonical: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority (menor = se evalúa primero)</Label>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  id="priority"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: Number(e.target.value) || 100 }))}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="text-xs text-white/60 pb-2">
                {PRIORITY_GUIDE.find(g => g.priority === formData.priority)?.name || "Custom"}
              </div>
            </div>

            {/* Priority Quick Select */}
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PRIORITY_GUIDE.map(g => (
                <button
                  key={g.priority}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, priority: g.priority }))}
                  className={`rounded-lg border p-2 text-xs transition-all ${
                    formData.priority === g.priority
                      ? "border-violet-400/40 bg-violet-500/15 text-violet-100"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <p className="font-semibold">{g.priority}</p>
                  <p className="text-white/60">{g.name.split(" ")[0]}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cadenas Whitelist (opcional - vacío = todas)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="ej: el rosado"
                value={chainInput}
                onChange={(e) => setChainInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddChain()}
                className="bg-white/5 border-white/10"
              />
              <Button onClick={handleAddChain} variant="outline" size="sm">
                +
              </Button>
            </div>
            {formData.chain_whitelist && formData.chain_whitelist.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.chain_whitelist.map((c) => (
                  <Badge key={c} variant="secondary" className="gap-2">
                    {c}
                    <button onClick={() => handleRemoveChain(c)} className="text-xs">✕</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="ej: agregado para campaña Q2"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="bg-white/5 border-white/10"
              rows={2}
            />
          </div>

        <Button size="sm" className="h-8 w-full gap-1.5" onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
          {upsertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar marker
        </Button>
      </TrainingFormCard>

      {data.defaults?.length > 0 ? (
        <TrainingPanelCard
          title={`Defaults del sistema (${data.defaults.length})`}
          action={
            <button type="button" onClick={() => setExpandedDefaults(!expandedDefaults)} className="text-slate-400">
              {expandedDefaults ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          }
        >
          {expandedDefaults ? (
            <div className="max-h-[min(40vh,360px)] space-y-2 overflow-y-auto">
              {data.defaults.map((m: CategoryMarker) => (
                <div key={m.marker} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-violet-100">{m.marker}</p>
                    <p className="text-[10px] text-slate-500">→ {m.canonical}</p>
                  </div>
                  <Badge variant="outline" className="h-4 text-[9px]">
                    P{m.priority}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Click para expandir {data.defaults.length} markers de sistema.</p>
          )}
        </TrainingPanelCard>
      ) : null}

      {data.custom?.length > 0 ? (
        <TrainingPanelCard title={`Markers personalizados (${data.custom.length})`}>
          <div className="max-h-[min(50vh,480px)] space-y-2 overflow-y-auto">
            {data.custom.map((m: CategoryMarker & { id: number }) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-white">{m.marker}</p>
                  <p className="text-[10px] text-slate-500">→ {m.canonical}</p>
                  {m.notes ? <p className="mt-1 text-[10px] text-violet-300">{m.notes}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="h-4 text-[9px]">
                    P{m.priority}
                  </Badge>
                  <Button
                    onClick={() => m.id && deleteMutation.mutate(m.id)}
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TrainingPanelCard>
      ) : null}

      <TrainingFooterNote>
        Los cambios se aplican al proximo job creado. No afectan jobs en curso.
      </TrainingFooterNote>
    </div>
  );
}
