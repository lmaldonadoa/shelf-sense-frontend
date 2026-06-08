"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TagsInputProps = {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  description?: string;
  suggestions?: string[];
};

function normalize(values: string[]): string[] {
  const out: string[] = [];
  const set = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (set.has(key)) continue;
    set.add(key);
    out.push(value);
  }
  return out;
}

function splitDraft(input: string): string[] {
  return input
    .split(/[\n,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function TagsInput({ label, values, onChange, placeholder, description, suggestions }: TagsInputProps) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const next = normalize([...values, ...splitDraft(draft)]);
    onChange(next);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(values.filter((x) => x !== tag));
  }

  function addSuggestion(value: string) {
    onChange(normalize([...values, value]));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (draft.trim()) addTag();
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} />
        <Button type="button" variant="outline" onClick={addTag} disabled={!draft.trim()}><Plus className="h-4 w-4" /></Button>
      </div>
      {Array.isArray(suggestions) && suggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions
            .filter((item) => !values.some((existing) => existing.toLowerCase() === item.toLowerCase()))
            .slice(0, 10)
            .map((item) => (
              <button
                key={`${label}-suggestion-${item}`}
                type="button"
                onClick={() => addSuggestion(item)}
                className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
              >
                + {item}
              </button>
            ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {values.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="rounded p-0.5 hover:bg-cyan-300/20"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
