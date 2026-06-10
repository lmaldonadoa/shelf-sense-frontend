"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Props = { account: string };

type ListType =
  | "name_guard_brands"
  | "name_guard_descriptors"
  | "name_anchors"
  | "prompt_leak_signature_tokens"
  | "human_name_noise_tokens"
  | "variant_functional_noise";

const LIST_TYPE_LABELS: Record<ListType, { label: string; description: string }> = {
  name_guard_brands: {
    label: "Marcas Protegidas",
    description: "Marcas que protegen el nombre de ser reescrito (AXION, COLGATE, DOVE, etc.)",
  },
  name_guard_descriptors: {
    label: "Descriptores Protegidos",
    description: "Descriptores de categoría que protegen el nombre (ACEITE, CREMA, GEL, etc.)",
  },
  name_anchors: {
    label: "Anclas de Búsqueda",
    description: "Anclas combinadas para escaneo de descripción (unión de marcas + descriptores)",
  },
  prompt_leak_signature_tokens: {
    label: "Tokens Fuga de Prompt",
    description: "Tokens que indican leak del system prompt (DEJES, OPAQUEN, INSTRUCCIONES, etc.)",
  },
  human_name_noise_tokens: {
    label: "Ruido OCR/Promo",
    description: "Ruido genérico que se elimina del nombre humano (APLICA, MENOR, PRECIO, etc.)",
  },
  variant_functional_noise: {
    label: "Ruido Funcional de Variantes",
    description: "Tokens que NO son variantes (LAVAPLATOS, DESOD, PRODUCTO, etc.)",
  },
};

export function EnrichmentTokensEditor({ account }: Props) {
  const [accountName] = useState(account);
  const [selectedListType, setSelectedListType] = useState<ListType>("name_guard_brands");
  const [tokenInput, setTokenInput] = useState("");

  const tokensQuery = useQuery({
    queryKey: ["enrichment-tokens", accountName, selectedListType],
    queryFn: async () => {
      try {
        const response = await fetch(
          `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/enrichment-tokens/${selectedListType}`
        );
        if (!response.ok) throw new Error("Failed to fetch tokens");
        return response.json();
      } catch {
        return { defaults: [], custom: [], effective: [] };
      }
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/enrichment-tokens/${selectedListType}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim().toUpperCase(), is_active: true }),
        }
      );
      if (!response.ok) throw new Error("Failed to upsert token");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Token agregado");
      tokensQuery.refetch();
      setTokenInput("");
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/enrichment-tokens/${selectedListType}/${tokenId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Failed to delete token");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Token eliminado");
      tokensQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (tokenId: number, isActive: boolean) => {
      const response = await fetch(
        `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/enrichment-tokens/${selectedListType}/${tokenId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: !isActive }),
        }
      );
      if (!response.ok) throw new Error("Failed to toggle token");
      return response.json();
    },
    onSuccess: () => {
      tokensQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const data = tokensQuery.data || { defaults: [], custom: [], effective: [] };

  return (
    <div className="space-y-6">
      {/* List Type Selector */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm">Seleccionar Tipo de Token</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {(Object.keys(LIST_TYPE_LABELS) as ListType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedListType(type)}
                className={`rounded border-2 p-3 text-left text-sm transition-all ${
                  selectedListType === type
                    ? "border-blue-400 bg-blue-950/30 text-white"
                    : "border-white/10 bg-white/3 text-white/70 hover:bg-white/5"
                }`}
              >
                <p className="font-semibold">{LIST_TYPE_LABELS[type].label}</p>
                <p className="text-xs text-white/60 mt-1">{LIST_TYPE_LABELS[type].description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Token Form */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm">Agregar Token</CardTitle>
          <CardDescription>{LIST_TYPE_LABELS[selectedListType].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="ej: DEJA, ANTIBACTERIAL, PROMO"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && upsertMutation.mutate(tokenInput)}
              className="bg-white/5 border-white/10"
            />
            <Button
              onClick={() => upsertMutation.mutate(tokenInput)}
              disabled={upsertMutation.isPending || !tokenInput.trim()}
              className="gap-2"
            >
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Defaults Section */}
      {data.defaults?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Tokens por Defecto ({data.defaults.length})
              <Badge variant="outline">Sistema</Badge>
            </CardTitle>
            <CardDescription>Solo lectura - vienen del código</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.defaults.map((token: string) => (
                <Badge key={token} variant="outline" className="text-xs">
                  {token}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Tokens */}
      {data.custom?.length > 0 && (
        <Card className="border-white/10 bg-white/5">
          <CardHeader>
            <CardTitle className="text-sm">Tokens Personalizados ({data.custom.length})</CardTitle>
            <CardDescription>Puedes editar o eliminar estos tokens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.custom.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-3">
                <div className="flex items-center gap-3 flex-1">
                  <Badge className={item.is_active ? "bg-green-900" : "bg-gray-700"}>
                    {item.token}
                  </Badge>
                  <span className="text-xs text-white/60">{item.created_at?.split("T")[0]}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => toggleMutation.mutate(item.id, item.is_active)}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    {item.is_active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    onClick={() => deleteMutation.mutate(item.id)}
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

      {/* Effective Tokens */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="h-4 w-4" />
            Tokens Efectivos (Totales: {data.effective?.length || 0})
          </CardTitle>
          <CardDescription>Esto es lo que realmente usa el pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.effective?.map((token: string) => (
              <Badge key={token} variant="secondary" className="text-xs">
                {token}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="rounded border border-blue-500/30 bg-blue-950/20 p-3 text-sm text-blue-200">
        <p className="font-semibold">ℹ️ Nota:</p>
        <p>Los cambios se aplican al próximo job creado. No afectan jobs en curso.</p>
      </div>
    </div>
  );
}
