"use client";

import { useEffect, useState } from "react";
import type { AliasRow, SemanticAliasRequest } from "@/types/ocr-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TagsInput } from "@/components/semantic/tags-input";
const chainSuggestions = ["mi comisariato", "el rosado", "hypermarket", "hipermarket", "aki", "supermaxi", "megamaxi", "gran aki"];

type AliasEditorModalProps = {
  open: boolean;
  initial?: AliasRow | null;
  onClose: () => void;
  onSave: (payload: SemanticAliasRequest) => void;
};

export function AliasEditorModal({ open, initial, onClose, onSave }: AliasEditorModalProps) {
  const [form, setForm] = useState<SemanticAliasRequest>({
    alias: "",
    canonical: "",
    scope: "product",
    is_active: true,
    target_keywords: [],
    chain_whitelist: [],
  });

  useEffect(() => {
    if (initial) {
      setForm({
        alias: initial.alias,
        canonical: initial.canonical,
        scope: initial.scope,
        is_active: initial.is_active === 1 || initial.is_active === true,
        target_keywords: initial.target_keywords ?? [],
        chain_whitelist: initial.chain_whitelist ?? [],
      });
    } else {
      setForm({
        alias: "",
        canonical: "",
        scope: "product",
        is_active: true,
        target_keywords: [],
        chain_whitelist: [],
      });
    }
  }, [initial, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-slate-950 p-5">
        <h3 className="mb-4 text-lg font-semibold">{initial ? "Editar Alias" : "Nuevo Alias"}</h3>
        <div className="space-y-3">
          <div className="space-y-2"><Label>alias</Label><Input value={form.alias} onChange={(e) => setForm((p) => ({ ...p, alias: e.target.value }))} /></div>
          <div className="space-y-2"><Label>canonical</Label><Input value={form.canonical} onChange={(e) => setForm((p) => ({ ...p, canonical: e.target.value.toUpperCase() }))} /></div>
          <div className="space-y-2"><Label>scope</Label><Input value={form.scope ?? "product"} onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value }))} /></div>
          <div className="flex items-center justify-between rounded-md border border-white/10 p-3"><span>is_active</span><Switch checked={Boolean(form.is_active)} onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))} /></div>
          <TagsInput
            label="target_keywords"
            values={form.target_keywords ?? []}
            placeholder="Ej: DESODORANTE, DOVE, AER"
            onChange={(values) => setForm((p) => ({ ...p, target_keywords: values }))}
          />
          <TagsInput
            label="chain_whitelist"
            values={form.chain_whitelist ?? []}
            placeholder="Ej: mi comisariato"
            onChange={(values) => setForm((p) => ({ ...p, chain_whitelist: values }))}
          />
          <div className="space-y-2">
            <Label>Sugerencias de cadena</Label>
            <Input list="alias-chain-suggestions" placeholder="ej: el rosado" />
            <datalist id="alias-chain-suggestions">
              {chainSuggestions.map((item) => <option key={`alias-chain-${item}`} value={item} />)}
            </datalist>
          </div>
          <p className="rounded-md border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Use <span className="font-semibold">target_keywords</span> y <span className="font-semibold">chain_whitelist</span> para limitar el alias a contexto específico. Si quedan vacíos, el alias aplica globalmente.
          </p>
          <p className="rounded-md border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            No dupliques reglas por equivalencias: Mi Comisariato, El Rosado, Hypermarket e Hipermarket ya se tratan como grupo.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(form)} disabled={form.alias.trim().length < 2 || form.canonical.trim().length < 2}>Guardar</Button>
        </div>
      </div>
    </div>
  );
}
