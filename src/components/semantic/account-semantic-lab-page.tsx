"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type {
  SemanticKnowledgeUpsertRequest,
  SemanticPreviewOcrResponse,
  SemanticPreviewPipelineResponse,
} from "@/types/ocr-api";
import { TagsInput } from "@/components/semantic/tags-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = { account: string };
type LabTab = "preview_ocr" | "preview_pipeline" | "diff_trace" | "save_rule";

const ruleStatuses = ["draft", "canary", "active", "paused", "deprecated"];

function defaultRule(): SemanticKnowledgeUpsertRequest {
  return {
    title: "",
    content: "",
    entry_type: "abbreviation_rule",
    chain: "",
    category: "",
    tags: [],
    priority: 7,
    is_active: true,
    status: "draft",
    owner: "",
    confidence_target: 0.9,
    created_from_case: "",
    negative_examples: [],
    rollout_scope: { chains: [] },
    success_metrics: { min_precision_est: 0.85, max_needs_review_rate: 0.2 },
    rule_version: 1,
  };
}

export function AccountSemanticLabPage({ account }: Props) {
  const [tab, setTab] = useState<LabTab>("preview_ocr");
  const [accountName, setAccountName] = useState(account);
  const [ocrText, setOcrText] = useState("");
  const [imageFileId, setImageFileId] = useState("");
  const [imagePath, setImagePath] = useState("");
  const [chain, setChain] = useState("");
  const [category, setCategory] = useState("");
  const [rule, setRule] = useState<SemanticKnowledgeUpsertRequest>(defaultRule());
  const [ocrPreview, setOcrPreview] = useState<SemanticPreviewOcrResponse | null>(null);
  const [pipelinePreview, setPipelinePreview] = useState<SemanticPreviewPipelineResponse | null>(null);

  const previewOcrMutation = useMutation({
    mutationFn: () =>
      ocrApi.previewSemanticOcr(accountName, {
        text: ocrText,
        chain: chain || null,
        category: category || null,
        candidate_rule: rule,
        dry_run: true,
      }),
    onSuccess: (data) => {
      setOcrPreview(data);
      toast.success("Preview OCR listo", { description: "No se guardó ningún cambio (dry run)." });
    },
    onError: (error) => toast.error("Falló preview OCR", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const previewPipelineMutation = useMutation({
    mutationFn: () =>
      ocrApi.previewSemanticPipeline(accountName, {
        image_file_id: imageFileId || undefined,
        image_path: imagePath || undefined,
        chain: chain || null,
        category: category || null,
        candidate_rule: rule,
        dry_run: true,
        persist_artifacts: false,
      }),
    onSuccess: (data) => {
      setPipelinePreview(data);
      toast.success("Preview pipeline listo", { description: "Simulación completa ejecutada. No se persistieron datos." });
    },
    onError: (error) => toast.error("Falló preview pipeline", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const saveRuleMutation = useMutation({
    mutationFn: () => ocrApi.upsertSemanticKnowledge(accountName, rule),
    onSuccess: () => toast.success("Regla guardada"),
    onError: (error) => toast.error("No se pudo guardar regla", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  function validateRuleForSave(): string | null {
    if (!rule.title?.trim()) return "title es obligatorio";
    if (!rule.content?.trim()) return "content es obligatorio";
    if (!ruleStatuses.includes(String(rule.status ?? ""))) return "status inválido";
    if ((rule.confidence_target ?? 0) < 0 || (rule.confidence_target ?? 0) > 1) return "confidence_target debe estar entre 0 y 1";
    if ((rule.rule_version ?? 0) < 1) return "rule_version debe ser >= 1";
    if (rule.status === "canary") {
      const chains = Array.isArray((rule.rollout_scope as Record<string, unknown> | undefined)?.chains)
        ? ((rule.rollout_scope as Record<string, unknown>).chains as unknown[])
        : [];
      if (!chains.length) return "rollout_scope.chains es obligatorio cuando status=canary";
    }
    return null;
  }

  const diffSummary = useMemo(() => {
    const fromOcr = ocrPreview?.diff;
    return {
      name_changed: Boolean(fromOcr?.name_changed),
      applied_rules_count: Number(fromOcr?.applied_rules_count ?? 0) || 0,
    };
  }, [ocrPreview?.diff]);

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Curaduría Lab</CardTitle>
          <CardDescription>Loop rápido: probar sin guardar, ver impacto real, ajustar y recién guardar/promover.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2"><Label>account_name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></div>
            <div className="space-y-2"><Label>chain</Label><Input value={chain} onChange={(e) => setChain(e.target.value)} /></div>
            <div className="space-y-2"><Label>category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "preview_ocr" ? "default" : "outline"} onClick={() => setTab("preview_ocr")}>Preview OCR</Button>
            <Button variant={tab === "preview_pipeline" ? "default" : "outline"} onClick={() => setTab("preview_pipeline")}>Preview Pipeline</Button>
            <Button variant={tab === "diff_trace" ? "default" : "outline"} onClick={() => setTab("diff_trace")}>Diff y Trazabilidad</Button>
            <Button variant={tab === "save_rule" ? "default" : "outline"} onClick={() => setTab("save_rule")}>Guardar Regla</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Rule Editor</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2"><Label>title</Label><Input value={rule.title ?? ""} onChange={(e) => setRule((p) => ({ ...p, title: e.target.value }))} /></div>
            <div className="space-y-2"><Label>entry_type</Label><Input value={rule.entry_type ?? "abbreviation_rule"} onChange={(e) => setRule((p) => ({ ...p, entry_type: e.target.value }))} /></div>
            <div className="space-y-2"><Label>status</Label><select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={rule.status ?? "draft"} onChange={(e) => setRule((p) => ({ ...p, status: e.target.value }))}>{ruleStatuses.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="space-y-2"><Label>owner</Label><Input value={rule.owner ?? ""} onChange={(e) => setRule((p) => ({ ...p, owner: e.target.value }))} /></div>
            <div className="space-y-2"><Label>confidence_target</Label><Input type="number" min={0} max={1} step="0.01" value={rule.confidence_target ?? 0.9} onChange={(e) => setRule((p) => ({ ...p, confidence_target: Number(e.target.value || 0) }))} /></div>
            <div className="space-y-2"><Label>rule_version</Label><Input type="number" min={1} value={rule.rule_version ?? 1} onChange={(e) => setRule((p) => ({ ...p, rule_version: Number(e.target.value || 1) }))} /></div>
          </div>
          <div className="space-y-2"><Label>content</Label><Textarea className="min-h-24" value={rule.content ?? ""} onChange={(e) => setRule((p) => ({ ...p, content: e.target.value }))} /></div>
          <TagsInput label="tags" values={rule.tags ?? []} onChange={(values) => setRule((p) => ({ ...p, tags: values }))} />
          <TagsInput label="negative_examples" values={rule.negative_examples ?? []} onChange={(values) => setRule((p) => ({ ...p, negative_examples: values }))} />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>rollout_scope JSON</Label>
              <Textarea
                className="min-h-20"
                value={JSON.stringify(rule.rollout_scope ?? { chains: [] }, null, 2)}
                onChange={(e) => {
                  try { setRule((p) => ({ ...p, rollout_scope: JSON.parse(e.target.value) as Record<string, unknown> })); } catch {}
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>success_metrics JSON</Label>
              <Textarea
                className="min-h-20"
                value={JSON.stringify(rule.success_metrics ?? { min_precision_est: 0.85, max_needs_review_rate: 0.2 }, null, 2)}
                onChange={(e) => {
                  try { setRule((p) => ({ ...p, success_metrics: JSON.parse(e.target.value) as Record<string, unknown> })); } catch {}
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {tab === "preview_ocr" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Preview OCR</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-cyan-100">No se guardó ningún cambio. Este resultado es temporal (dry run).</p>
            <div className="space-y-2"><Label>OCR text</Label><Textarea className="min-h-40" value={ocrText} onChange={(e) => setOcrText(e.target.value)} /></div>
            <Button onClick={() => previewOcrMutation.mutate()} disabled={previewOcrMutation.isPending || !ocrText.trim()}>Probar regla</Button>
            {ocrPreview ? <pre className="max-h-64 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">{JSON.stringify(ocrPreview, null, 2)}</pre> : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "preview_pipeline" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Preview Pipeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-cyan-100">Simulación completa ejecutada. No se persistieron datos.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2"><Label>image_file_id</Label><Input value={imageFileId} onChange={(e) => setImageFileId(e.target.value)} /></div>
              <div className="space-y-2"><Label>image_path</Label><Input value={imagePath} onChange={(e) => setImagePath(e.target.value)} /></div>
            </div>
            <Button onClick={() => previewPipelineMutation.mutate()} disabled={previewPipelineMutation.isPending || (!imageFileId.trim() && !imagePath.trim())}>Probar en pipeline</Button>
            {pipelinePreview ? <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/25 p-3 text-xs">{JSON.stringify(pipelinePreview, null, 2)}</pre> : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === "diff_trace" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Diff y Trazabilidad</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant={diffSummary.name_changed ? "destructive" : "secondary"}>name_changed: {String(diffSummary.name_changed)}</Badge>
              <Badge variant="outline">applied_rules_count: {diffSummary.applied_rules_count}</Badge>
              {pipelinePreview?.dedupe_summary?.removed ? <Badge variant="outline">dedupe_removed: {pipelinePreview.dedupe_summary.removed}</Badge> : null}
            </div>
            {pipelinePreview?.products?.length ? (
              <div className="space-y-2">
                {pipelinePreview.products.slice(0, 6).map((p, idx) => (
                  <div key={`prod-${idx}`} className="rounded-md border border-white/10 bg-black/20 p-3 text-xs">
                    <p className="font-medium text-slate-100">{String((p.producto ?? p.product_name ?? p.name ?? "-"))}</p>
                    <pre className="mt-2 max-h-40 overflow-auto text-[11px]">{JSON.stringify(p, null, 2)}</pre>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ejecuta preview para ver diff real.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "save_rule" ? (
        <Card className="border-white/10 bg-white/5 backdrop-blur">
          <CardHeader><CardTitle>Guardar Regla</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rule.status === "active" ? (
              <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                Guardar en estado <strong>active</strong> impacta producción. Revisa métricas y confirma.
              </div>
            ) : null}
            <Button
              onClick={() => {
                const err = validateRuleForSave();
                if (err) return toast.error("Validación", { description: err });
                saveRuleMutation.mutate();
              }}
              disabled={saveRuleMutation.isPending}
            >
              Guardar regla
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

