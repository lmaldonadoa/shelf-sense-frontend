"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Eye,
  History,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { IgnoredPhraseSuggestion } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Props = {
  jobId: string;
  account: string;
  onRerunStarted?: (newJobId: string) => void;
};

type SuggestionStatus = "new" | "exists" | "exists_inactive" | "saved_pending_reprocess";

function confidenceBadge(c: number) {
  if (c >= 0.8) {
    return (
      <Badge className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200">
        Alta ({(c * 100).toFixed(0)}%)
      </Badge>
    );
  }
  if (c >= 0.5) {
    return (
      <Badge className="border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-200">
        Media ({(c * 100).toFixed(0)}%)
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      Baja ({(c * 100).toFixed(0)}%)
    </Badge>
  );
}

function resolveStatus(item: IgnoredPhraseSuggestion, savedLocally: boolean): SuggestionStatus {
  if (savedLocally) return "saved_pending_reprocess";
  if (item.already_exists && item.existing_is_active === false) return "exists_inactive";
  if (item.already_exists) return "exists";
  return "new";
}

function statusBadge(status: SuggestionStatus) {
  if (status === "new") {
    return <Badge className="border-sky-400/30 bg-sky-500/10 text-[10px] text-sky-100">Nuevo candidato</Badge>;
  }
  if (status === "exists") {
    return <Badge className="border-violet-400/30 bg-violet-500/10 text-[10px] text-violet-100">Ya existe en base</Badge>;
  }
  if (status === "exists_inactive") {
    return (
      <Badge className="border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-100">Ya existe pero inactivo</Badge>
    );
  }
  return (
    <Badge className="border-cyan-400/30 bg-cyan-500/10 text-[10px] text-cyan-100">
      Aplicado a futuro · requiere reproceso
    </Badge>
  );
}

function SnippetList({ item, fallbackJobId }: { item: IgnoredPhraseSuggestion; fallbackJobId: string }) {
  const examples = item.examples ?? [];
  const legacySnippet = item.snippet;

  if (examples.length === 0 && !legacySnippet) return null;

  if (examples.length > 0) {
    return (
      <div className="mt-1.5 space-y-1 rounded border border-white/5 bg-black/20 px-3 py-2">
        <p className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
          <Eye className="h-2.5 w-2.5" /> Evidencia OCR (artifacts historicos)
        </p>
        {examples.map((ex, idx) => (
          <div key={`ex-${idx}`} className="text-[11px] leading-relaxed text-slate-300">
            <span className="font-mono text-white/80">&ldquo;{ex.snippet}&rdquo;</span>
            <span className="ml-1.5 text-[10px] text-slate-500">
              {ex.image_process_code != null && `img:${ex.image_process_code}`}
              {ex.image_process_code != null && (ex.source_kind || ex.job_id) && " · "}
              {ex.source_kind}
              {(ex.job_id || fallbackJobId) && ` · job:${ex.job_id ?? fallbackJobId}`}
            </span>
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
  jobId,
  onSaved,
  onRerunStarted,
  groupLabel,
}: {
  item: IgnoredPhraseSuggestion;
  account: string;
  jobId: string;
  onSaved: () => void;
  onRerunStarted?: (newJobId: string) => void;
  groupLabel: "phrase" | "support";
}) {
  const [discarded, setDiscarded] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);

  const status = resolveStatus(item, savedLocally);
  const isResolved = status !== "new";

  const rerunMutation = useMutation({
    mutationFn: () => ocrApi.rerunPromotionsJob(account, jobId, { mode: "new" }),
    onSuccess: (data) => {
      const newJobId = data.new_job_id ?? data.job_id;
      if (newJobId) {
        onRerunStarted?.(newJobId);
        toast.success("Job reencolado para reproceso", {
          description: `Nuevo job: ${newJobId}. Ahi veras el efecto de la frase guardada.`,
        });
      } else {
        toast.success("Reproceso iniciado", { description: "El job fue reencolado." });
      }
    },
    onError: (error) => {
      const detail = error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo reprocesar el job", { description: detail });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      ocrApi.createAccountIgnoredPhrase(account, {
        phrase: item.phrase,
        scope: "name",
        is_active: true,
        chain_whitelist: [],
      }),
    onSuccess: () => {
      setSavedLocally(true);
      toast.success("Guardado en base correctamente", {
        description:
          "Se aplicara en proximos jobs y en reprocesos. Los resultados ya generados no cambian hasta reprocesar.",
        action: {
          label: "Reprocesar job",
          onClick: () => rerunMutation.mutate(),
        },
      });
      onSaved();
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 409) {
        setSavedLocally(false);
        toast.info("Ya existe en base", {
          description: `"${item.phrase}" ya estaba registrada. Reprocesa el job para ver el efecto en el resultado final.`,
        });
        onSaved();
        return;
      }
      const detail = error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar", { description: detail });
    },
  });

  const saveAndRerunMutation = useMutation({
    mutationFn: async () => {
      await ocrApi.createAccountIgnoredPhrase(account, {
        phrase: item.phrase,
        scope: "name",
        is_active: true,
        chain_whitelist: [],
      });
      return ocrApi.rerunPromotionsJob(account, jobId, { mode: "new" });
    },
    onSuccess: (data) => {
      setSavedLocally(true);
      const newJobId = data.new_job_id ?? data.job_id;
      if (newJobId) onRerunStarted?.(newJobId);
      toast.success("Frase guardada. Reprocesa este job para reflejar el cambio en el resultado final.", {
        description: newJobId ? `Nuevo job: ${newJobId}` : undefined,
      });
      onSaved();
    },
    onError: (error) => {
      if (error instanceof HttpError && error.status === 409) {
        rerunMutation.mutate();
        return;
      }
      const detail = error instanceof Error ? error.message : "Error inesperado";
      toast.error("No se pudo guardar y reprocesar", { description: detail });
    },
  });

  if (discarded) return null;

  const primaryImageCode = item.image_process_codes[0];
  const primarySourceKind = item.source_kinds[0];

  return (
    <div className={`px-4 py-3 hover:bg-white/[0.03] ${isResolved && status !== "saved_pending_reprocess" ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-mono text-sm font-medium text-white">{item.phrase}</p>
            {statusBadge(status)}
            {groupLabel === "support" && (
              <Badge variant="outline" className="text-[9px] text-slate-500">
                soporte
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {confidenceBadge(item.confidence)}
            <span className="text-[10px] text-slate-500">
              {item.occurrences} ocurrencia{item.occurrences !== 1 ? "s" : ""}
            </span>
            {primarySourceKind ? <span className="text-[10px] text-slate-500">· {primarySourceKind}</span> : null}
            {primaryImageCode ? <span className="text-[10px] text-slate-500">· img:{primaryImageCode}</span> : null}
            <span className="text-[10px] text-slate-500">· job:{jobId}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {status === "new" ? (
            <>
              <Button
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || saveAndRerunMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3 w-3" />
                )}
                Guardar en base
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-[11px]"
                onClick={() => saveAndRerunMutation.mutate()}
                disabled={saveMutation.isPending || saveAndRerunMutation.isPending || rerunMutation.isPending}
              >
                {saveAndRerunMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Guardar y reprocesar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-slate-500 hover:text-rose-400"
                onClick={() => setDiscarded(true)}
                title="Descartar sugerencia"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : status === "saved_pending_reprocess" ? (
            <>
              <Badge className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200">
                <Check className="mr-0.5 h-2.5 w-2.5" /> Guardada
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-[11px]"
                onClick={() => rerunMutation.mutate()}
                disabled={rerunMutation.isPending}
              >
                {rerunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Reprocesar job
              </Button>
            </>
          ) : (
            <div className="text-right">
              <Badge variant="outline" className="text-[10px] text-slate-300">
                Ya configurada
              </Badge>
              <p className="mt-1 max-w-[180px] text-[10px] leading-4 text-slate-500">
                Detectada en artifacts historicos. Reprocesa para corregir el resultado final de este job.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 h-7 gap-1 text-[11px]"
                onClick={() => rerunMutation.mutate()}
                disabled={rerunMutation.isPending}
              >
                {rerunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Reprocesar job
              </Button>
            </div>
          )}
        </div>
      </div>
      <SnippetList item={item} fallbackJobId={jobId} />
    </div>
  );
}

function SuggestionSection({
  title,
  description,
  items,
  emptyMessage,
  account,
  jobId,
  onSaved,
  onRerunStarted,
  groupLabel,
}: {
  title: string;
  description: string;
  items: IgnoredPhraseSuggestion[];
  emptyMessage?: string;
  account: string;
  jobId: string;
  onSaved: () => void;
  onRerunStarted?: (newJobId: string) => void;
  groupLabel: "phrase" | "support";
}) {
  if (items.length === 0) {
    if (!emptyMessage) return null;
    return (
      <div className="px-4 py-6 text-center text-xs text-slate-500">{emptyMessage}</div>
    );
  }

  return (
    <div>
      <div className="mb-1 px-4">
        <p className="text-xs font-semibold tracking-wide text-slate-300">
          {title}
          <span className="ml-1.5 text-[10px] font-normal text-slate-500">
            ({items.length}) — {description}
          </span>
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {items.map((item) => (
          <SuggestionRow
            key={`${groupLabel}-${item.phrase}`}
            item={item}
            account={account}
            jobId={jobId}
            onSaved={onSaved}
            onRerunStarted={onRerunStarted}
            groupLabel={groupLabel}
          />
        ))}
      </div>
    </div>
  );
}

export function JobNoiseReviewPanel({ jobId, account, onRerunStarted }: Props) {
  const queryClient = useQueryClient();
  const [showExistingInBase, setShowExistingInBase] = useState(false);

  const suggestionsQuery = useQuery({
    queryKey: ["job-noise-suggestions", jobId, showExistingInBase],
    queryFn: () =>
      ocrApi.getJobIgnoredPhraseSuggestions(jobId, {
        includeExistingPhrases: showExistingInBase,
        includeSupportCandidates: true,
      }),
    retry: false,
    staleTime: 60_000,
  });

  const phraseList = suggestionsQuery.data?.phrase_suggestions ?? [];
  const supportList = suggestionsQuery.data?.support_noise_candidates ?? [];
  const summary = suggestionsQuery.data?.summary;
  const jobContext = suggestionsQuery.data?.job_context;

  const newPhraseCandidates = useMemo(
    () => phraseList.filter((item) => !item.already_exists),
    [phraseList],
  );
  const existingPhraseCandidates = useMemo(
    () => phraseList.filter((item) => item.already_exists),
    [phraseList],
  );

  const totalVisible = phraseList.length + supportList.length;

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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <History className="h-4 w-4 text-amber-300" />
            <CardTitle className="text-base">Revision de ruido OCR</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              revision historica
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              scope: name
            </Badge>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 px-3 py-2.5 text-xs leading-5 text-amber-100/90">
            <p>Esta revision analiza artifacts guardados del job seleccionado.</p>
            <p className="mt-1">
              Agregar una frase a la base mejora futuros procesamientos y reprocesos; no modifica automaticamente el
              resultado final ya generado de este job.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary ? (
            <span className="text-[10px] text-slate-500">
              {summary.images_with_candidates ?? 0} imagen
              {(summary.images_with_candidates ?? 0) !== 1 ? "es" : ""} con candidatos
              {typeof summary.existing_name_noise_phrases === "number"
                ? ` · ${summary.existing_name_noise_phrases} frases en base`
                : ""}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => suggestionsQuery.refetch()}
            disabled={suggestionsQuery.isFetching}
          >
            {suggestionsQuery.isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Refrescar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-0 pb-0">
        <div className="space-y-3 px-4">
          <div className="rounded-lg border border-sky-500/20 bg-sky-950/15 px-3 py-2.5 text-[11px] leading-5 text-sky-100/90">
            <p className="flex items-start gap-1.5 font-medium">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La revision OCR trabaja sobre jobs historicos. Sirve para descubrir frases de ruido y guardarlas en base.
            </p>
            <p className="mt-1 pl-5">Para corregir el resultado final de este job, debes reprocesarlo.</p>
          </div>

          <div className="rounded-lg border border-violet-500/20 bg-violet-950/15 px-3 py-2.5 text-[11px] leading-5 text-violet-100/90">
            <p>
              Slogans o banners como <span className="font-mono">MAS BELLO</span>,{" "}
              <span className="font-mono">TRENZ Y MAS BELLO</span> van en{" "}
              <span className="font-mono">ignored-phrases</span> con <span className="font-mono">scope=name</span>.
            </p>
            <p className="mt-1">
              No uses <span className="font-mono">human-name-noise-tokens</span> para frases largas: eso es para tokens
              universales agresivos y podria limpiar palabras validas en otros contextos.
            </p>
            <Link
              href={`/accounts/${encodeURIComponent(account)}/training`}
              className="mt-1 inline-block text-violet-200 underline underline-offset-2 hover:text-violet-100"
            >
              Ir a Training IA → Promociones
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Switch
                id="noise-show-existing"
                checked={showExistingInBase}
                onCheckedChange={setShowExistingInBase}
                className="scale-90"
              />
              <Label htmlFor="noise-show-existing" className="cursor-pointer text-xs text-slate-300">
                Mostrar tambien existentes en base
              </Label>
            </div>
            <p className="text-[10px] text-slate-500">
              {showExistingInBase
                ? "Incluye frases ya guardadas (include_existing_phrases=true)"
                : "Solo nuevos candidatos (include_existing_phrases=false)"}
            </p>
          </div>

          {jobContext?.status ? (
            <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <AlertCircle className="h-3 w-3" />
              Job {jobContext.job_id ?? jobId} · estado: {String(jobContext.status)}
              {jobContext.finished_at ? ` · finalizado: ${String(jobContext.finished_at)}` : ""}
            </p>
          ) : null}
        </div>

        {suggestionsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizando artifacts historicos del job...
          </div>
        ) : totalVisible === 0 ? (
          <div className="space-y-1.5 py-10 text-center">
            <p className="text-sm text-slate-400">
              {showExistingInBase
                ? "No se detectaron candidatos en los artifacts de este job."
                : "No hay candidatos nuevos. Activa el filtro para ver frases que ya existen en base."}
            </p>
            <p className="text-xs text-slate-500">
              Si el job es antiguo y la frase ya esta en base, el resultado final no cambia hasta reprocesar.
            </p>
          </div>
        ) : (
          <>
            <SuggestionSection
              title="Nuevos candidatos detectados"
              description="candidatas a ignored-phrases scope=name"
              items={newPhraseCandidates}
              emptyMessage={
                showExistingInBase
                  ? "No hay candidatos nuevos en este job."
                  : undefined
              }
              account={account}
              jobId={jobId}
              onSaved={handleSaved}
              onRerunStarted={onRerunStarted}
              groupLabel="phrase"
            />

            {showExistingInBase ? (
              <SuggestionSection
                title="Frases detectadas que ya existen en base"
                description="aparecen en artifacts historicos pero ya estan configuradas"
                items={existingPhraseCandidates}
                emptyMessage="Ninguna frase detectada coincide con registros existentes."
                account={account}
                jobId={jobId}
                onSaved={handleSaved}
                onRerunStarted={onRerunStarted}
                groupLabel="phrase"
              />
            ) : existingPhraseCandidates.length > 0 || (summary?.existing_name_noise_phrases ?? 0) > 0 ? (
              <div className="border-t border-white/5 px-4 py-4 text-center text-xs text-slate-500">
                Puede haber frases ya guardadas en base dentro de los artifacts.
                Activa &quot;Mostrar tambien existentes en base&quot; para verlas marcadas como &quot;Ya existe en base&quot;.
              </div>
            ) : null}

            {supportList.length > 0 ? (
              <div className="border-t border-white/5 pt-3">
                <SuggestionSection
                  title="Candidatos de ruido (soporte)"
                  description="OCR basura o candidatos de soporte — no todos deben ir a base"
                  items={supportList}
                  account={account}
                  jobId={jobId}
                  onSaved={handleSaved}
                  onRerunStarted={onRerunStarted}
                  groupLabel="support"
                />
              </div>
            ) : null}
          </>
        )}

        <div className="border-t border-white/5 px-4 py-3">
          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-500">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
            Revision historica = descubrimiento · Base actualizada = mejora futura · Reproceso = correccion efectiva del
            resultado final de este job.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}