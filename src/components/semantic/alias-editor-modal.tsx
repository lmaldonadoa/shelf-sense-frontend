"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import type { AliasRow, SemanticAliasRequest } from "@/types/ocr-api";
import { TagsInput } from "@/components/semantic/tags-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const chainSuggestions = ["mi comisariato", "el rosado", "hypermarket", "hipermarket", "aki", "supermaxi", "megamaxi", "gran aki"];
const SCOPE_OPTIONS = [
  { value: "product", label: "Producto — reemplaza todo el producto" },
  { value: "name", label: "Nombre — solo limpia el nombre" },
  { value: "all", label: "Ambos" },
];

type AliasEditorModalProps = {
  open: boolean;
  initial?: AliasRow | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: SemanticAliasRequest) => void;
};

export function AliasEditorModal({ open, initial, saving = false, onClose, onSave }: AliasEditorModalProps) {
  const isEditing = Boolean(initial?.id);
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-white/10 bg-slate-950 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-base font-semibold text-white">{isEditing ? `Editar alias #${initial?.id}` : "Nuevo alias"}</h3>
            <p className="text-xs text-slate-400">
              {isEditing ? "El texto alias y scope no se pueden cambiar (clave unica)." : "Mapea texto OCR a nombre canonico."}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Alias (texto OCR)</Label>
              <Input
                value={form.alias}
                readOnly={isEditing}
                onChange={(e) => setForm((p) => ({ ...p, alias: e.target.value }))}
                placeholder="ej: OLIM MASC"
                className={`border-white/10 bg-black/25 ${isEditing ? "opacity-70" : ""}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">Canonico (destino)</Label>
              <Input
                value={form.canonical}
                onChange={(e) => setForm((p) => ({ ...p, canonical: e.target.value.toUpperCase() }))}
                placeholder="ej: OLIMPIA MASCOTAS"
                className="border-white/10 bg-black/25"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-300">Scope</Label>
            {isEditing ? (
              <Input value={form.scope ?? "product"} readOnly className="border-white/10 bg-black/25 opacity-70" />
            ) : (
              <select
                className="h-9 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm outline-none ring-cyan-400/40 focus:ring-2"
                value={form.scope ?? "product"}
                onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value }))}
              >
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <label className="flex items-center justify-between rounded-md border border-white/10 bg-black/25 px-3 py-2.5 text-sm">
            <span className="text-slate-300">Alias activo</span>
            <Switch checked={Boolean(form.is_active)} onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked }))} />
          </label>

          <TagsInput
            label="Palabras clave objetivo (opcional)"
            values={form.target_keywords ?? []}
            placeholder="DESODORANTE, DOVE, AER"
            onChange={(values) => setForm((p) => ({ ...p, target_keywords: values }))}
          />
          <TagsInput
            label="Cadenas permitidas (opcional)"
            values={form.chain_whitelist ?? []}
            placeholder="mi comisariato"
            onChange={(values) => setForm((p) => ({ ...p, chain_whitelist: values }))}
          />

          <datalist id="alias-chain-suggestions">
            {chainSuggestions.map((item) => (
              <option key={`alias-chain-${item}`} value={item} />
            ))}
          </datalist>

          <p className="rounded-md border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-[11px] leading-5 text-cyan-100">
            Sin keywords ni cadenas = alias <span className="font-semibold">global</span>. Con restricciones = alias{" "}
            <span className="font-semibold">condicional</span>.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            className="gap-1.5"
            onClick={() => onSave(form)}
            disabled={saving || form.alias.trim().length < 2 || form.canonical.trim().length < 2}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear alias"}
          </Button>
        </div>
      </div>
    </div>
  );
}