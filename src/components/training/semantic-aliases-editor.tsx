"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { ocrApi } from "@/lib/ocrApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Props = { account: string };

type SemanticAlias = {
  id?: number;
  alias: string;
  canonical: string;
  scope?: "product" | "name" | "all";
  is_active?: boolean;
  target_keywords?: string[];
  chain_whitelist?: string[];
};

export function SemanticAliasesEditor({ account }: Props) {
  const [accountName] = useState(account);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<SemanticAlias>({
    alias: "",
    canonical: "",
    scope: "product",
    is_active: true,
    target_keywords: [],
    chain_whitelist: [],
  });
  const [keywordInput, setKeywordInput] = useState("");
  const [chainInput, setChainInput] = useState("");

  const aliasesQuery = useQuery({
    queryKey: ["semantic-aliases", accountName],
    queryFn: async () => {
      try {
        const response = await fetch(`/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/aliases`);
        if (!response.ok) throw new Error("Failed to fetch aliases");
        const data = await response.json();
        return data.aliases || [];
      } catch {
        return [];
      }
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        alias: formData.alias.trim().toUpperCase(),
        canonical: formData.canonical.trim().toUpperCase(),
        scope: formData.scope || "product",
        is_active: formData.is_active !== false,
        target_keywords: formData.target_keywords?.filter(k => k.trim()) || [],
        chain_whitelist: formData.chain_whitelist?.filter(c => c.trim()) || [],
      };

      const response = await fetch(`/admin/ocr/proxy/v1/accounts/${encodeURIComponent(accountName)}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Failed to upsert alias");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Alias guardado");
      aliasesQuery.refetch();
      resetForm();
    },
    onError: (error) => {
      toast.error(`Error: ${error instanceof Error ? error.message : "Desconocido"}`);
    },
  });

  const resetForm = () => {
    setFormData({
      alias: "",
      canonical: "",
      scope: "product",
      is_active: true,
      target_keywords: [],
      chain_whitelist: [],
    });
    setEditingId(null);
    setKeywordInput("");
    setChainInput("");
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim()) {
      setFormData(prev => ({
        ...prev,
        target_keywords: [...(prev.target_keywords || []), keywordInput.trim().toUpperCase()],
      }));
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData(prev => ({
      ...prev,
      target_keywords: (prev.target_keywords || []).filter(k => k !== keyword),
    }));
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
          <CardTitle>Agregar/Editar Alias Semántico</CardTitle>
          <CardDescription>
            Mapea texto OCR a nombres canónicos con contexto de cadena y palabras clave
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="alias">Alias (OCR)</Label>
              <Input
                id="alias"
                placeholder="ej: OLIM MASC"
                value={formData.alias}
                onChange={(e) => setFormData(prev => ({ ...prev, alias: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="canonical">Canónico</Label>
              <Input
                id="canonical"
                placeholder="ej: OLIMPIA MASCOTAS"
                value={formData.canonical}
                onChange={(e) => setFormData(prev => ({ ...prev, canonical: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <select
              id="scope"
              value={formData.scope || "product"}
              onChange={(e) => setFormData(prev => ({ ...prev, scope: e.target.value as any }))}
              className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-white"
            >
              <option value="product">Producto (reemplaza todo el producto)</option>
              <option value="name">Nombre (solo limpia nombre)</option>
              <option value="all">Ambos</option>
            </select>
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label>Palabras Clave Objetivo (opcional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="ej: ANTIVIRAL"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                className="bg-white/5 border-white/10"
              />
              <Button onClick={handleAddKeyword} variant="outline" size="sm">
                Agregar
              </Button>
            </div>
            {formData.target_keywords && formData.target_keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.target_keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="gap-2">
                    {kw}
                    <button onClick={() => handleRemoveKeyword(kw)} className="text-xs">✕</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Chains */}
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

          <div className="flex gap-2 pt-4">
            <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending} className="gap-2">
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "Actualizar" : "Crear"} Alias
            </Button>
            {editingId && (
              <Button onClick={resetForm} variant="outline">
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Aliases Semánticos ({aliasesQuery.data?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {aliasesQuery.isLoading ? (
            <div className="text-center text-white/60">Cargando...</div>
          ) : !aliasesQuery.data?.length ? (
            <div className="text-center text-white/60">No hay aliases configurados</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead>Alias</TableHead>
                    <TableHead>Canónico</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Keywords</TableHead>
                    <TableHead>Cadenas</TableHead>
                    <TableHead>Activo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aliasesQuery.data?.map((alias: any) => (
                    <TableRow key={alias.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="font-mono text-sm">{alias.alias}</TableCell>
                      <TableCell className="font-mono text-sm">{alias.canonical}</TableCell>
                      <TableCell className="text-xs">{alias.scope || "product"}</TableCell>
                      <TableCell className="text-xs">
                        {alias.target_keywords?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {alias.target_keywords.slice(0, 2).map((kw: string) => (
                              <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
                            ))}
                            {alias.target_keywords.length > 2 && <Badge variant="outline" className="text-xs">+{alias.target_keywords.length - 2}</Badge>}
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {alias.chain_whitelist?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {alias.chain_whitelist.slice(0, 2).map((c: string) => (
                              <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                            ))}
                            {alias.chain_whitelist.length > 2 && <Badge variant="outline" className="text-xs">+{alias.chain_whitelist.length - 2}</Badge>}
                          </div>
                        ) : "Todas"}
                      </TableCell>
                      <TableCell>{alias.is_active ? "✅" : "❌"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
