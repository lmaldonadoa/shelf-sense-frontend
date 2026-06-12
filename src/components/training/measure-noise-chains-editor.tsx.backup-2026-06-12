"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type Props = { account: string };

type MeasureNoiseChain = {
  chain_code: string;
  is_active?: boolean;
  notes?: string;
};

export function MeasureNoiseChainsEditor({ account }: Props) {
  const [accountName] = useState(account);
  const [formData, setFormData] = useState<MeasureNoiseChain>({
    chain_code: "",
    is_active: true,
    notes: "",
  });

  const chainsQuery = useQuery({
    queryKey: ["measure-noise-chains", accountName],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-measure-noise-chains`
        );
        if (!response.ok) throw new Error("Failed to fetch chains");
        return response.json();
      } catch {
        return { defaults: [], custom: [], effective: [], effective_source: "defaults" };
      }
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!formData.chain_code.trim()) throw new Error("Chain code es obligatorio");

      const payload = {
        chain_code: formData.chain_code.trim().toLowerCase(),
        is_active: formData.is_active !== false,
        notes: formData.notes?.trim(),
      };

      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-measure-noise-chains`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) throw new Error("Failed to upsert chain");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Cadena guardada");
      chainsQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-measure-noise-chains/seed-defaults`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error("Failed to seed defaults");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Defaults sembrados");
      chainsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (chainId: number) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-measure-noise-chains/${chainId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete chain");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Cadena eliminada");
      chainsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (chainId: number, isActive: boolean) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/promotion-measure-noise-chains/${chainId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !isActive }),
        }
      );
      if (!response.ok) throw new Error("Failed to toggle chain");
      return response.json();
    },
    onSuccess: () => {
      chainsQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const resetForm = () => {
    setFormData({
      chain_code: "",
      is_active: true,
      notes: "",
    });
  };

  const data = chainsQuery.data || { defaults: [], custom: [], effective: [], effective_source: "defaults" };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {data.effective_source === "defaults" && (
        <Card className="border-blue-500/30 bg-blue-950/20">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-200">Usando Configuración por Defecto</p>
              <p className="text-sm text-blue-300 mt-1">
                Tu cuenta usa los defaults históricos de 4 cadenas. Pulsa "Personalizar" para empezar a editar.
              </p>
              <Button onClick={() => seedMutation.mutate()} className="mt-3" size="sm" variant="outline">
                Personalizar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {data.effective_source === "custom" && data.effective?.length === 0 && (
        <Card className="border-yellow-500/30 bg-yellow-950/20">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-200">Regla Desactivada Globalmente</p>
              <p className="text-sm text-yellow-300 mt-1">
                Has desactivado todas las cadenas — la regla de measure-noise está completamente apagada.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Agregar Cadena</CardTitle>
          <CardDescription>
            Cadenas donde se aplica la limpieza de fragmentos antes de medidas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chain">Chain Code</Label>
            <Input
              id="chain"
              placeholder="ej: santa maria, aki, supermaxi"
              value={formData.chain_code}
              onChange={(e) => setFormData(prev => ({ ...prev, chain_code: e.target.value }))}
              className="bg-white/5 border-white/10"
            />
            <p className="text-xs text-white/60">
              Ej: "ORAL B DETOX 7 75ML" → "75ML" (el 7 era fragmento del 75)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="ej: se observó el mismo patrón OCR que en Mi Comisariato"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              className="bg-white/5 border-white/10"
              rows={2}
            />
          </div>

          <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending} className="gap-2 w-full">
            {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Agregar Cadena
          </Button>
        </CardContent>
      </Card>

      {/* Effective List */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm">
            Cadenas Activas ({data.effective?.length || 0})
            {data.effective_source && (
              <Badge className="ml-2" variant={data.effective_source === "defaults" ? "outline" : "secondary"}>
                {data.effective_source === "defaults" ? "Defaults" : "Personalizadas"}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            La regla de measure-noise se aplica SOLO a estas cadenas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data.effective?.length ? (
            <div className="text-center text-white/60 py-6">
              {data.effective_source === "custom"
                ? "Todas las cadenas desactivadas"
                : "Se están usando los defaults"}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.effective.map((chain: string) => (
                <Badge key={chain} className="bg-green-900 text-green-100 text-xs">
                  {chain}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Chains */}
      {data.custom?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm">Cadenas Personalizadas ({data.custom.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.custom.map((chain: any) => (
              <div key={chain.id} className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-3">
                <div className="flex-1">
                  <p className="font-mono font-semibold text-sm">{chain.chain_code}</p>
                  {chain.notes && <p className="text-xs text-blue-300 mt-1">📝 {chain.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => toggleMutation.mutate(chain.id, chain.is_active)}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    {chain.is_active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    onClick={() => deleteMutation.mutate(chain.id)}
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

      {/* Defaults Reference */}
      {data.defaults?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm">Cadenas Históricas por Defecto</CardTitle>
            <CardDescription>Si estás personalizado, puedes usarlas como referencia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.defaults.map((chain: string) => (
                <Badge key={chain} variant="outline" className="text-xs">
                  {chain}
                </Badge>
              ))}
            </div>
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
