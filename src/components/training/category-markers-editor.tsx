"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Save, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

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
    <div className="space-y-6">
      {/* Form */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Agregar/Editar Marker de Categoría</CardTitle>
          <CardDescription>Detecta subcategorías desde texto OCR de soporte</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <div className="grid grid-cols-3 gap-2 mt-2">
              {PRIORITY_GUIDE.map(g => (
                <button
                  key={g.priority}
                  onClick={() => setFormData(prev => ({ ...prev, priority: g.priority }))}
                  className={`text-xs p-2 rounded border transition-all ${
                    formData.priority === g.priority
                      ? "bg-blue-900/50 border-blue-400"
                      : "border-white/10 bg-white/3 hover:bg-white/5"
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

          <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending} className="gap-2 w-full">
            {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Marker
          </Button>
        </CardContent>
      </Card>

      {/* Defaults */}
      {data.defaults?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpandedDefaults(!expandedDefaults)}
          >
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Markers por Defecto ({data.defaults.length})</span>
              {expandedDefaults ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
          {expandedDefaults && (
            <CardContent className="space-y-2">
              {data.defaults.map((m: any) => (
                <div key={m.marker} className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-2">
                  <div className="text-sm">
                    <p className="font-mono font-semibold">{m.marker}</p>
                    <p className="text-xs text-white/60">→ {m.canonical}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">P{m.priority}</Badge>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Custom */}
      {data.custom?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm">Markers Personalizados ({data.custom.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.custom.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-3">
                <div className="flex-1">
                  <p className="font-mono font-semibold">{m.marker}</p>
                  <p className="text-xs text-white/60">→ {m.canonical}</p>
                  {m.chain_whitelist?.length > 0 && (
                    <p className="text-xs text-white/60">Cadenas: {m.chain_whitelist.join(", ")}</p>
                  )}
                  {m.notes && <p className="text-xs text-blue-300">📝 {m.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">P{m.priority}</Badge>
                  <Button
                    onClick={() => m.id && deleteMutation.mutate(m.id)}
                    variant="destructive"
                    size="sm"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="rounded border border-blue-500/30 bg-blue-950/20 p-3 text-sm text-blue-200">
        <p className="font-semibold">ℹ️ Nota:</p>
        <p>Los cambios se aplican al próximo job creado. No afectan jobs en curso.</p>
      </div>
    </div>
  );
}
