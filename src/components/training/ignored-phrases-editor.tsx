"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type Props = { account: string; chainId?: string };

type IgnoredPhrase = {
  id?: number;
  phrase: string;
  scope: "product" | "name";
  is_active?: boolean;
  chain_whitelist?: string[];
};

export function IgnoredPhrasesEditor({ account, chainId }: Props) {
  const [accountName] = useState(account);
  const [formData, setFormData] = useState<IgnoredPhrase>({
    phrase: "",
    scope: "product",
    is_active: true,
    chain_whitelist: [],
  });
  const [chainInput, setChainInput] = useState("");

  const phrasesQuery = useQuery({
    queryKey: ["ignored-phrases", accountName, chainId],
    queryFn: async () => {
      try {
        const url = chainId
          ? `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(chainId)}/ignored-phrases`
          : `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/ignored-phrases`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch phrases");
        const data = await response.json();
        return data.phrases || [];
      } catch {
        return [];
      }
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const url = chainId
        ? `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(chainId)}/ignored-phrases`
        : `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/ignored-phrases`;

      const payload = {
        phrase: formData.phrase.trim(),
        scope: formData.scope,
        is_active: formData.is_active !== false,
        chain_whitelist: !chainId ? (formData.chain_whitelist?.filter(c => c.trim()) || []) : undefined,
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to upsert phrase");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Frase guardada");
      phrasesQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (phraseId: number) => {
      const url = chainId
        ? `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/chains/${encodeURIComponent(chainId)}/ignored-phrases/${phraseId}`
        : `/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/ignored-phrases/${phraseId}`;

      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete phrase");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Frase eliminada");
      phrasesQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const resetForm = () => {
    setFormData({
      phrase: "",
      scope: "product",
      is_active: true,
      chain_whitelist: [],
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

  return (
    <div className="space-y-6">
      {/* Form */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Agregar Frase Ignorada</CardTitle>
          <CardDescription>
            {chainId
              ? "Frases específicas de esta cadena"
              : "Frases a ignorar a nivel de cuenta"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phrase">Frase a Ignorar</Label>
            <Textarea
              id="phrase"
              placeholder="ej: DE TODO A MENOR PRECIO SIEMPRE"
              value={formData.phrase}
              onChange={(e) => setFormData(prev => ({ ...prev, phrase: e.target.value }))}
              className="bg-white/5 border-white/10"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <select
              id="scope"
              value={formData.scope}
              onChange={(e) => setFormData(prev => ({ ...prev, scope: e.target.value as "product" | "name" }))}
              className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-white"
            >
              <option value="product">Descartar Producto (producto invalido)</option>
              <option value="name">Limpiar Nombre (solo limpia texto)</option>
            </select>
            <p className="text-xs text-white/60 mt-1">
              {formData.scope === "product"
                ? "Si la frase aparece, todo el producto se descarta como inválido"
                : "Si la frase aparece, se limpia del nombre humano pero el producto sigue válido"}
            </p>
          </div>

          {!chainId && (
            <div className="space-y-2">
              <Label>Cadenas Whitelist (opcional - vacío = todas)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="ej: mi comisariato"
                  value={chainInput}
                  onChange={(e) => setChainInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddChain()}
                  className="bg-white/5 border-white/10"
                />
                <Button onClick={handleAddChain} variant="outline" size="sm">
                  Agregar
                </Button>
              </div>
              {formData.chain_whitelist && formData.chain_whitelist.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.chain_whitelist.map((chain) => (
                    <Badge key={chain} variant="secondary" className="gap-2">
                      {chain}
                      <button onClick={() => handleRemoveChain(chain)} className="text-xs">✕</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending} className="gap-2">
            {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Crear Frase
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Frases Ignoradas ({phrasesQuery.data?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {phrasesQuery.isLoading ? (
            <div className="text-center text-white/60">Cargando...</div>
          ) : !phrasesQuery.data?.length ? (
            <div className="text-center text-white/60">No hay frases configuradas</div>
          ) : (
            <div className="space-y-2">
              {phrasesQuery.data?.map((phrase: any) => (
                <div key={phrase.id} className="flex items-center justify-between rounded border border-white/10 bg-white/3 p-3">
                  <div className="flex-1">
                    <p className="font-mono text-sm">{phrase.phrase}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {phrase.scope === "product" ? "Descarta Producto" : "Limpia Nombre"}
                      </Badge>
                      {phrase.chain_whitelist?.length > 0 && (
                        <span className="text-xs text-white/60">
                          Cadenas: {phrase.chain_whitelist.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {chainId && (
                    <Button
                      onClick={() => phrase.id && deleteMutation.mutate(phrase.id)}
                      variant="destructive"
                      size="sm"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded border border-blue-500/30 bg-blue-950/20 p-3 text-sm text-blue-200">
        <p className="font-semibold">ℹ️ Nota:</p>
        <p>Los cambios se aplican al próximo job creado. No afectan jobs en curso.</p>
      </div>
    </div>
  );
}
