"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Loader2, ShieldCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { IgnoredPhraseSuggestion } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  jobId: string;
  account: string;
};

function confidenceBadge(c: number) {
  if (c >= 0.8) return <Badge className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200">Alta ({(c * 100).toFixed(0)}%)</Badge>;
  if (c >= 0.5) return <Badge className="border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-200">Media ({(c * 100).toFixed(0)}%)</Badge>;
  return <Badge variant="outline" className="text-[10px]">Baja ({(c * 100).toFixed(0)}%)</Badge>;
}

function SnippetList({ item }: { item: IgnoredPhraseSuggestion }) {
  const examples = item.examples ?? [];
  const legacySnippet = item.snippet;

  if (examples.length === 0 && !legacySnippet) return null;

  if (examples.length > 0) {
    return (
      <div className="mt-1.5 space-y-1 rounded border border-white/5 bg-black/20 px-3 py-2">
        <p className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
          <Eye className="h-2.5 w-2.5" /> Evidencia OCR
        </p>
        {examples.map((ex, idx) => (
          <div key={`ex-${idx}`} className="text-[11px] leading-relaxed text-slate-300">
            <span className="font-mono text-white/80">&ldquo;{ex.snippet}&rdquo;</span>
            {(ex.image_process_code || ex.source_kind) && (
              <span className="ml-1.5 text-[10px] text-slate-500">
                {ex.image_process_code && `img:${ex.image_process_code}`}
                {ex.image_process_code && ex.source_kind && " · "}
                {ex.source_kind}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-1.5 rounded border border-white/5 bg-black/20 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
        <Eye className="h-2.5 w-2.5" /> Evidencia OCR
      </p>
      <p className="font-mono text-[11px] text-white/80">&ldquo;{legacySnippet}&rdquo;</p>
    </div>
  );
}

function SuggestionRow({
  item,
  account,
  onSaved,
  groupLabel,
}: {
  item: IgnoredPhraseSuggestion;
  account: string;
  onSaved: () => void;
  groupLabel: "phrase" | "support";
}) {
  const [discarded, setDiscarded] = useState(false);
  const [saved, setSaved] = useState(item.already_exists);

  const saveMutation = useMutation({
    mutationFn: () =>
      ocrApi.createAccountIgnoredPhrase(account, {
        phrase: item.phrase,
        scope: "name",
        is_active: true,
        chain_whitelist: [],
      }),
    onSuccess: () => {
      setSaved(true);
      toast.success("Frase guardada como ruido", { description: item.phrase });
      onSaved();
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 409) {
        setSaved(true);
        toast.info("Ya existe", { description: `"${item.phrase}" ya estaba registrada.` });
        return;
      }
      const detail = error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar", { description: detail });
    },
  });

  if (discarded) return null;

  const isResolved = saved || item.already_exists;

  return (
    <div className={`px-4 py-3 hover:bg-white/[0.03] ${isResolved ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-mono text-sm font-medium text-white">{item.phrase}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {confidenceBadge(item.confidence)}
            <span className="text-[10px] text-slate-500">{item.occurrences} ocurrencia{item.occurrences !== 1 ? "s" : ""}</span>
            {item.source_kinds.length > 0 && (
              <span className="text-[10px] text-slate-500">· {item.source_kinds.join(", ")}</span>
            )}
            {item.image_process_codes.length > 0 && (
              <span className="text-[10px] text-slate-500" title={item.image_process_codes.join(", ")}>
                · {item.image_process_codes.length} imagen{item.image_process_codes.length !== 1 ? "es" : ""}
              </span>
            )}
            {groupLabel === "support" && (
              <Badge variant="outline" className="text-[9px] text-slate-500">soporte</Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isResolved ? (
            <Badge className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200">
              <Check className="mr-0.5 h-2.5 w-2.5" /> Guardada
            </Badge>
          ) : (
            <>
              <Button
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                Agregar como ruido
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400"
                onClick={() => setDiscarded(true)}
                title="Descartar sugerencia"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
      <SnippetList item={item} />
    </div>
  );
}

export function JobNoiseReviewPanel({ jobId, account }: Props) {
  const queryClient = useQueryClient();

  const suggestionsQuery = useQuery({
    queryKey: ["job-noise-suggestions", jobId],
    queryFn: () => ocrApi.getJobIgnoredPhraseSuggestions(jobId),
    retry: false,
    staleTime: 60_000,
  });

  const phraseList = suggestionsQuery.data?.phrase_suggestions ?? [];
  const supportList = suggestionsQuery.data?.support_noise_candidates ?? [];
  const summary = suggestionsQuery.data?.summary;

  const totalSuggestions = phraseList.length + supportList.length;

  const savedCount = useMemo(
    () => phraseList.filter((p) => p.already_exists).length + supportList.filter((p) => p.already_exists).length,
    [phraseList, supportList],
  );

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: ["job-noise-suggestions", jobId] });
    queryClient.invalidateQueries({ queryKey: ["account-ignored-phrases", account, "name"] });
  }

  if (suggestionsQuery.isError) {
    const err = suggestionsQuery.error;
    if (err instanceof HttpError && err.status === 404) return null;
    return (
      <Card className="border-rose-500/20 bg-rose-950/10">
        <CardContent className="py-4 text-sm text-rose-300">
          No se pudieron cargar sugerencias de ruido.{" "}
          <Button variant="link" className="h-auto p-0 text-rose-300 underline" onClick={() => suggestionsQuery.refetch()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-white/5 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-300" />
          <CardTitle className="text-base">Revisión de ruido OCR</CardTitle>
          <Badge variant="outline" className="text-[10px]">scope: name</Badge>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <span className="text-[10px] text-slate-500">
              {summary.total_suggestions ?? totalSuggestions} candidata{(summary.total_suggestions ?? totalSuggestions) !== 1 ? "s" : ""}
              {savedCount > 0 && ` · ${savedCount} ya guardada${savedCount !== 1 ? "s" : ""}`}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => suggestionsQuery.refetch()}
            disabled={suggestionsQuery.isFetching}
          >
            {suggestionsQuery.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refrescar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-0 pb-0">
        {suggestionsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizando frases del job...
          </div>
        ) : totalSuggestions === 0 ? (
          <div className="space-y-1.5 py-10 text-center">
            <p className="text-sm text-slate-400">
              No se detectaron sugerencias automáticas para este job.
            </p>
            <p className="text-xs text-slate-500">
              Puedes revisar manualmente los artifacts si lo consideras necesario.
            </p>
          </div>
        ) : (
          <>
            {phraseList.length > 0 && (
              <div>
                <div className="mb-1 px-4">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">
                    Frases sugeridas
                    <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                      ({phraseList.length}) — candidatas a <span className="font-mono">ignored-phrases</span> con scope=name
                    </span>
                  </p>
                </div>
                <div className="divide-y divide-white/5">
                  {phraseList.map((item) => (
                    <SuggestionRow
                      key={`phrase-${item.phrase}`}
                      item={item}
                      account={account}
                      onSaved={handleSaved}
                      groupLabel="phrase"
                    />
                  ))}
                </div>
              </div>
            )}

            {supportList.length > 0 && (
              <div className="border-t border-white/5 pt-3">
                <div className="mb-1 px-4">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">
                    Candidatos de ruido (soporte)
                    <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                      ({supportList.length}) — OCR basura o candidatos de soporte, no todos deben ir a base
                    </span>
                  </p>
                </div>
                <div className="divide-y divide-white/5">
                  {supportList.map((item) => (
                    <SuggestionRow
                      key={`support-${item.phrase}`}
                      item={item}
                      account={account}
                      onSaved={handleSaved}
                      groupLabel="support"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="border-t border-white/5 px-4 py-3">
          <p className="text-[11px] leading-5 text-slate-500">
            Estas son sugerencias automáticas — el humano decide cuáles guardar.
            Aceptar una frase la guarda con <span className="font-mono">scope: name</span> en la cuenta.
            No se guarda nada automáticamente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
