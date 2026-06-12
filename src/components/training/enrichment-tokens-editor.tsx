"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Coins, Info, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  TrainingFooterNote,
  TrainingFormCard,
  TrainingPanelCard,
  TrainingSectionHero,
  TrainingTypePill,
} from "@/components/training/training-ui";

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
    mutationFn: async ({ tokenId, isActive }: { tokenId: number; isActive: boolean }) => {
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
    <div className="space-y-4">
      <TrainingSectionHero
        tone="emerald"
        icon={<Coins className="h-4 w-4" />}
        title="Tokens de enriquecimiento"
        description={LIST_TYPE_LABELS[selectedListType].description}
        badges={
          <Badge variant="outline" className="border-emerald-400/30 text-[10px] text-emerald-100">
            {LIST_TYPE_LABELS[selectedListType].label}
          </Badge>
        }
        kpis={[
          { label: "Defaults", value: data.defaults?.length ?? 0, hint: "sistema" },
          { label: "Custom", value: data.custom?.length ?? 0, hint: "editables" },
          { label: "Efectivos", value: data.effective?.length ?? 0, hint: "pipeline" },
          { label: "Activos custom", value: data.custom?.filter((i: { is_active?: boolean }) => i.is_active).length ?? 0 },
        ]}
        footer={
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {(Object.keys(LIST_TYPE_LABELS) as ListType[]).map((type) => (
              <TrainingTypePill
                key={type}
                active={selectedListType === type}
                label={LIST_TYPE_LABELS[type].label}
                description={LIST_TYPE_LABELS[type].description.split(".")[0]}
                onClick={() => setSelectedListType(type)}
                tone="emerald"
              />
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => tokensQuery.refetch()}
          disabled={tokensQuery.isFetching}
        >
          {tokensQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <TrainingFormCard title={`Agregar token — ${LIST_TYPE_LABELS[selectedListType].label}`} tone="emerald">
        <div className="flex gap-2">
          <Input
            placeholder="ej: DEJA, ANTIBACTERIAL, PROMO"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && upsertMutation.mutate(tokenInput)}
            className="h-9 font-mono text-sm"
          />
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => upsertMutation.mutate(tokenInput)}
            disabled={upsertMutation.isPending || !tokenInput.trim()}
          >
            {upsertMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Agregar
          </Button>
        </div>
      </TrainingFormCard>

      {data.defaults?.length > 0 ? (
        <TrainingPanelCard title={`Defaults del sistema (${data.defaults.length})`} description="Solo lectura — vienen del codigo">
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {data.defaults.map((token: string) => (
              <Badge key={token} variant="outline" className="h-5 text-[10px] font-mono">
                {token}
              </Badge>
            ))}
          </div>
        </TrainingPanelCard>
      ) : null}

      {data.custom?.length > 0 ? (
        <TrainingPanelCard title={`Tokens personalizados (${data.custom.length})`} description="Activa o elimina tokens custom">
          <div className="max-h-[min(40vh,360px)] space-y-1 divide-y divide-white/5 overflow-y-auto">
            {data.custom.map((item: { id: number; token: string; is_active?: boolean; created_at?: string }) => (
              <div key={item.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`h-5 font-mono text-[10px] ${item.is_active ? "border-emerald-400/30 text-emerald-100" : "opacity-50"}`}
                  >
                    {item.token}
                  </Badge>
                  <span className="text-[10px] text-slate-500">{item.created_at?.split("T")[0]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!item.is_active}
                    onCheckedChange={() => toggleMutation.mutate({ tokenId: item.id, isActive: !!item.is_active })}
                    className="scale-75"
                  />
                  <Button
                    onClick={() => deleteMutation.mutate(item.id)}
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

      <TrainingPanelCard
        title={`Tokens efectivos (${data.effective?.length ?? 0})`}
        description="Union de defaults + custom activos — lo que usa el pipeline"
        action={<Info className="h-4 w-4 text-slate-500" />}
      >
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {data.effective?.map((token: string) => (
            <Badge key={token} variant="secondary" className="h-5 text-[10px] font-mono">
              {token}
            </Badge>
          ))}
        </div>
      </TrainingPanelCard>

      <TrainingFooterNote>
        Los cambios se aplican al proximo job creado. No afectan jobs en curso.
      </TrainingFooterNote>
    </div>
  );
}
