"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, FlaskConical, Loader2, Minus, Move, Play, Plus, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { HttpError, isFinalJobStatus, ocrApi } from "@/lib/ocrApi";
import type {
  CreateSemanticReviewRequest,
  SemanticKnowledgeEntry,
  SemanticPreviewOcrResponse,
  SemanticPreviewPipelineResponse,
  SemanticPreviewInsightResponse,
  SemanticRegressionSmokeResponse,
  SemanticDuplicateCheckResponse,
  SemanticRuleDraftAssistResponse,
  SemanticKnowledgeTestResponse,
  SemanticKnowledgeUpsertRequest,
  UploadItem,
} from "@/types/ocr-api";
import { UploadPanel } from "@/components/jobs/upload-panel";
import { UploadedFilesTable } from "@/components/jobs/uploaded-files-table";
import { TagsInput } from "@/components/semantic/tags-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_FILES = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff", "image/x-tiff"]);
const ENTRY_TYPES = ["note", "abbreviation_rule", "chain_rule", "category_rule", "product_context", "correction_hint"];
const OCR_PROXY_BASE = process.env.NEXT_PUBLIC_OCR_PROXY_BASE ?? "/admin/ocr/proxy";

function toProxyStaticUrl(inputUrl?: string | null): string | null {
  if (!inputUrl) return null;
  if (inputUrl.startsWith("/static/")) return `${OCR_PROXY_BASE}${inputUrl}`;
  if (inputUrl.startsWith("/")) return inputUrl;
  try {
    const parsed = new URL(inputUrl);
    if (parsed.pathname.startsWith("/static/")) {
      return `${OCR_PROXY_BASE}${parsed.pathname}${parsed.search}`;
    }
    return inputUrl;
  } catch {
    return inputUrl;
  }
}

type Props = { account: string };
type DraftMap = Record<number, SemanticKnowledgeUpsertRequest>;

function initialDraft(chain: string, category: string, imageName: string): SemanticKnowledgeUpsertRequest {
  return {
    title: `Regla semántica - ${imageName}`,
    content: "",
    entry_type: "abbreviation_rule",
    chain: chain || "",
    category: category || "",
    tags: [],
    priority: 7,
    is_active: true,
  };
}

export function AccountSemanticReviewPage({ account }: Props) {
  const [accountName, setAccountName] = useState(account);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedItems, setUploadedItems] = useState<UploadItem[]>([]);
  const [reviewId, setReviewId] = useState("");
  const [mode, setMode] = useState<"ocr" | "ocr_vision">("ocr");
  const [chain, setChain] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [visionModel, setVisionModel] = useState("gemma3:12b");
  const [visionPromptFile, setVisionPromptFile] = useState("qwen3vl_prompt.txt");
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [dismissed, setDismissed] = useState<Record<number, boolean>>({});
  const [mdByImageId, setMdByImageId] = useState<Record<number, string>>({});
  const [loadingMdByImageId, setLoadingMdByImageId] = useState<Record<number, boolean>>({});
  const [mdErrorByImageId, setMdErrorByImageId] = useState<Record<number, string>>({});
  const [decisionNoteByImageId, setDecisionNoteByImageId] = useState<Record<number, string>>({});
  const [testModelByImageId, setTestModelByImageId] = useState<Record<number, string>>({});
  const [llmTestByImageId, setLlmTestByImageId] = useState<Record<number, SemanticKnowledgeTestResponse | null>>({});
  const [zoomByImageId, setZoomByImageId] = useState<Record<number, number>>({});
  const [offsetByImageId, setOffsetByImageId] = useState<Record<number, { x: number; y: number }>>({});
  const [draggingByImageId, setDraggingByImageId] = useState<Record<number, boolean>>({});
  const [dragStartByImageId, setDragStartByImageId] = useState<Record<number, { x: number; y: number }>>({});
  const [previewIndexByImageId, setPreviewIndexByImageId] = useState<Record<number, number>>({});
  const [localPreviewByFileId, setLocalPreviewByFileId] = useState<Record<string, string>>({});
  const [cardSearch, setCardSearch] = useState("");
  const [highlightTerm, setHighlightTerm] = useState("");
  const [queueReasonFilter, setQueueReasonFilter] = useState("");
  const [miniPreviewOcrByImageId, setMiniPreviewOcrByImageId] = useState<Record<number, SemanticPreviewOcrResponse | null>>({});
  const [miniPreviewPipelineByImageId, setMiniPreviewPipelineByImageId] = useState<Record<number, SemanticPreviewPipelineResponse | null>>({});
  const [insightByImageId, setInsightByImageId] = useState<Record<number, SemanticPreviewInsightResponse | null>>({});
  const [ideaTextByImageId, setIdeaTextByImageId] = useState<Record<number, string>>({});
  const [draftAssistByImageId, setDraftAssistByImageId] = useState<Record<number, SemanticRuleDraftAssistResponse | null>>({});
  const [duplicateCheckByImageId, setDuplicateCheckByImageId] = useState<Record<number, SemanticDuplicateCheckResponse | null>>({});
  const [caseIdByImageId, setCaseIdByImageId] = useState<Record<number, number>>({});
  const [regressionSmoke, setRegressionSmoke] = useState<SemanticRegressionSmokeResponse | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => ocrApi.uploadImages(accountName, files),
    onSuccess: (data) => {
      setUploadedItems(data.uploaded);
      setLocalPreviewByFileId((prev) => {
        const next = { ...prev };
        for (let i = 0; i < data.uploaded.length; i += 1) {
          const fileId = data.uploaded[i]?.file_id;
          const file = selectedFiles[i];
          if (fileId && file) next[fileId] = URL.createObjectURL(file);
        }
        return next;
      });
      toast.success("Upload listo", { description: `${data.uploaded.length} imágenes subidas` });
    },
    onError: (error) => toast.error("Upload falló", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  useEffect(() => {
    return () => {
      for (const url of Object.values(localPreviewByFileId)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [localPreviewByFileId]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateSemanticReviewRequest) => ocrApi.createSemanticReviewJob(accountName, payload),
    onSuccess: (data) => {
      setReviewId(data.review_id);
      setDrafts({});
      setDismissed({});
      setMdByImageId({});
      setMdErrorByImageId({});
      toast.success("Curaduría iniciada", { description: data.review_id });
    },
    onError: (error) => toast.error("No se pudo iniciar curaduría", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const saveKnowledgeMutation = useMutation({
    mutationFn: (payload: SemanticKnowledgeUpsertRequest) => ocrApi.upsertSemanticKnowledge(accountName, payload),
    onSuccess: () => toast.success("Regla guardada en memoria semántica"),
    onError: (error) => toast.error("No se pudo guardar regla", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const decisionMutation = useMutation({
    mutationFn: (args: { imageId: number; decision: "saved" | "discarded" | "pending" | "needs_review"; note?: string }) =>
      ocrApi.setSemanticReviewImageDecision(accountName, reviewId, args.imageId, {
        decision: args.decision,
        note: args.note,
        decision_by: "frontend",
      }),
    onError: (error) => toast.error("No se pudo guardar decisión", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const llmTestMutation = useMutation({
    mutationFn: async (args: { imageId: number; text: string; knowledge: SemanticKnowledgeUpsertRequest; chain?: string; category?: string; model?: string; mode?: "ocr" | "ocr_vision"; visionAnalysis?: Record<string, unknown> }) =>
      ocrApi.testSemanticKnowledge(accountName, {
        text: args.text,
        mode: args.mode,
        chain: args.chain,
        category: args.category,
        model: args.model,
        knowledge: args.knowledge,
        vision_analysis: args.visionAnalysis,
      }),
    onError: (error) => toast.error("Test LLM falló", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const miniPreviewOcrMutation = useMutation({
    mutationFn: async (args: {
      imageId: number;
      text: string;
      chain?: string;
      category?: string;
      candidateRule: SemanticKnowledgeUpsertRequest;
    }) =>
      ocrApi.runSemanticLearningTrialOcr(effectiveAccountName, {
        case_id: caseIdByImageId[args.imageId],
        review_id: reviewId,
        image_id: args.imageId,
        created_by: "frontend@local",
        ocr_text: args.text,
        chain: args.chain ?? null,
        category: args.category ?? null,
        candidate_rule: args.candidateRule,
      }),
    onError: (error) => toast.error("Mini Preview OCR falló", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const miniPreviewPipelineMutation = useMutation({
    mutationFn: async (args: {
      imageId: number;
      imageFileId?: string | null;
      imagePath?: string | null;
      chain?: string;
      category?: string;
      candidateRule: SemanticKnowledgeUpsertRequest;
    }) =>
      ocrApi.runSemanticLearningTrialPipeline(effectiveAccountName, {
        case_id: caseIdByImageId[args.imageId],
        review_id: reviewId,
        image_id: args.imageId,
        created_by: "frontend@local",
        image_file_id: args.imageFileId ?? undefined,
        image_path: undefined,
        chain: args.chain ?? null,
        category: args.category ?? null,
        account_name: effectiveAccountName,
        config_name: "default",
        export_excel: false,
        candidate_rule: args.candidateRule,
      }),
    onError: (error) => toast.error("Mini Preview Pipeline falló", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const createCaseMutation = useMutation({
    mutationFn: (args: { imageId: number; chain?: string; category?: string; riskType?: string; payload?: Record<string, unknown> }) =>
      ocrApi.createSemanticLearningCase(effectiveAccountName, {
        review_id: reviewId,
        image_id: args.imageId,
        chain: args.chain ?? null,
        category: args.category ?? null,
        risk_type: args.riskType ?? "name_conflict",
        status: "open",
        payload: args.payload ?? {},
        created_by: "frontend@local",
      }),
    onError: (error) => toast.error("No se pudo crear caso", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const setCaseStatusMutation = useMutation({
    mutationFn: (args: { imageId: number; status: "open" | "in_review" | "resolved" | "rejected" }) =>
      ocrApi.setSemanticLearningCaseStatus(effectiveAccountName, caseIdByImageId[args.imageId], args.status),
    onError: (error) => toast.error("No se pudo actualizar estado del caso", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const insightMutation = useMutation({
    mutationFn: (args: { imageId: number; previewJson: Record<string, unknown> }) =>
      ocrApi.getSemanticPreviewInsight(effectiveAccountName, {
        preview_json: args.previewJson,
        focus: "all",
        use_llm: true,
        model: null,
      }),
    onError: (error) => toast.error("Insight AI falló", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const draftAssistMutation = useMutation({
    mutationFn: (args: {
      imageId: number;
      ideaText: string;
      chain?: string;
      category?: string;
      targetProductName?: string;
      ocrText?: string;
      previewJson?: Record<string, unknown> | null;
    }) =>
      ocrApi.getSemanticRuleDraftAssist(effectiveAccountName, {
        idea_text: args.ideaText,
        chain: args.chain ?? null,
        category: args.category ?? null,
        target_product_name: args.targetProductName ?? null,
        ocr_text: args.ocrText ?? null,
        preview_json: args.previewJson ?? null,
        model: null,
      }),
    onError: (error) => toast.error("No se pudo mejorar texto con IA", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const regressionSmokeMutation = useMutation({
    mutationFn: () => ocrApi.runSemanticRegressionSmoke(effectiveAccountName, { include_legacy_check: true }),
    onSuccess: (data) => {
      setRegressionSmoke(data);
      const status = data.result?.status?.toLowerCase();
      if (status === "passed") {
        toast.success("Validación semántica completada", { description: "Sin regresiones detectadas." });
      } else {
        toast.warning("Validación semántica completada", { description: "Se detectaron checks para revisar." });
      }
    },
    onError: (error) => toast.error("Falló la validación semántica", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const reviewQuery = useQuery({
    queryKey: ["semantic-review-detail", accountName, reviewId],
    queryFn: () => ocrApi.getSemanticReviewJob(accountName, reviewId),
    enabled: Boolean(reviewId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status && isFinalJobStatus(status) ? false : 2500;
    },
  });
  const effectiveAccountName = reviewQuery.data?.account_name ?? accountName;

  const eventsQuery = useQuery({
    queryKey: ["semantic-review-events", accountName, reviewId],
    queryFn: () => ocrApi.getSemanticReviewEvents(accountName, reviewId),
    enabled: Boolean(reviewId),
    refetchInterval: reviewQuery.data?.status && isFinalJobStatus(reviewQuery.data.status) ? false : 2000,
  });

  const metricsQuery = useQuery({
    queryKey: ["semantic-review-metrics", accountName, reviewId],
    queryFn: () => ocrApi.getSemanticReviewMetrics(accountName, reviewId),
    enabled: Boolean(reviewId),
    refetchInterval: reviewQuery.data?.status && isFinalJobStatus(reviewQuery.data.status) ? false : 3500,
  });

  const knowledgeReferenceQuery = useQuery({
    queryKey: ["semantic-knowledge-reference", accountName, chain, category],
    queryFn: () =>
      ocrApi.listSemanticKnowledge(accountName, {
        activeOnly: true,
        chain: chain || undefined,
        category: category || undefined,
      }),
    enabled: Boolean(accountName),
  });

  const visibleImages = useMemo(() => {
    return (reviewQuery.data?.images ?? [])
      .filter((img) => {
      const resolvedByBackend = img.decision === "saved" || img.decision === "discarded";
      if (dismissed[img.id] || resolvedByBackend) return false;
      if (queueReasonFilter.trim() && (img.queue_reason ?? "").toLowerCase() !== queueReasonFilter.trim().toLowerCase()) return false;
      if (!cardSearch.trim()) return true;
      const query = cardSearch.toLowerCase();
      const name = `${img.original_name ?? ""} ${img.image_name ?? ""}`.toLowerCase();
      const mdText = (mdByImageId[img.id] ?? "").toLowerCase();
      return name.includes(query) || mdText.includes(query);
      })
      .sort((a, b) => (Number(b.risk_score ?? 0) || 0) - (Number(a.risk_score ?? 0) || 0));
  }, [reviewQuery.data?.images, dismissed, queueReasonFilter, cardSearch, mdByImageId]);

  const reviewLoadErrorDetail = useMemo(() => {
    if (reviewQuery.error instanceof HttpError) {
      if (reviewQuery.error.status === 404) return "Revisión semántica no encontrada para esta cuenta.";
      return reviewQuery.error.detail || "Error inesperado";
    }
    if (eventsQuery.error instanceof HttpError) return eventsQuery.error.detail || "Error inesperado";
    if (metricsQuery.error instanceof HttpError) return metricsQuery.error.detail || "Error inesperado";
    return "Error inesperado";
  }, [eventsQuery.error, metricsQuery.error, reviewQuery.error]);

  function validateFiles(files: File[]) {
    if (!files.length) return "Selecciona imágenes";
    if (files.length > MAX_FILES) return `Máximo ${MAX_FILES} archivos`;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) return `${file.name} excede 10MB`;
      const mimeOk = ALLOWED_TYPES.has(file.type);
      const extOk = /\.(jpe?g|png|webp|tiff?)$/i.test(file.name);
      if (!mimeOk && !extOk) return `${file.name} no es tipo permitido`;
    }
    return null;
  }

  function getDraft(imageId: number, imageName: string) {
    return drafts[imageId] ?? initialDraft(chain, category, imageName);
  }

  function setDraft(imageId: number, imageName: string, next: Partial<SemanticKnowledgeUpsertRequest>) {
    setDrafts((prev) => {
      const base = prev[imageId] ?? initialDraft(chain, category, imageName);
      return { ...prev, [imageId]: { ...base, ...next } };
    });
  }

  const loadMd = useCallback(
    async (imageId: number, mdUrl?: string | null): Promise<string | null> => {
      const resolvedMdUrl = toProxyStaticUrl(mdUrl);
      if (!resolvedMdUrl) return null;
      if (mdByImageId[imageId]) return mdByImageId[imageId] ?? null;
      if (mdErrorByImageId[imageId]) return null;
      if (loadingMdByImageId[imageId]) return null;
      let failureMeta: Record<string, unknown> | null = null;
      try {
        setLoadingMdByImageId((prev) => ({ ...prev, [imageId]: true }));
        const resp = await fetch(resolvedMdUrl, { cache: "no-store" });
        if (!resp.ok) {
          let responseText = "";
          try {
            responseText = (await resp.text()).slice(0, 500);
          } catch {
            responseText = "";
          }
          failureMeta = {
            source: "semantic_review_md_fetch",
            review_id: reviewId || null,
            image_id: imageId,
            md_url: mdUrl,
            md_url_resolved: resolvedMdUrl,
            status: resp.status,
            status_text: resp.statusText,
            response_excerpt: responseText || null,
          };
          throw new Error(`Error ${resp.status}`);
        }
        const text = await resp.text();
        setMdByImageId((prev) => ({ ...prev, [imageId]: text }));
        setMdErrorByImageId((prev) => {
          if (!(imageId in prev)) return prev;
          const next = { ...prev };
          delete next[imageId];
          return next;
        });
        return text;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Error de red";
        const fallbackMeta = {
          source: "semantic_review_md_fetch",
          review_id: reviewId || null,
          image_id: imageId,
          md_url: mdUrl,
          md_url_resolved: resolvedMdUrl,
          status: null,
          status_text: null,
          response_excerpt: null,
        };
        const fullMeta = { ...(failureMeta ?? fallbackMeta), error_detail: detail };
        console.error("[CURADURIA_MD_ERROR]", fullMeta);
        if (typeof window !== "undefined") {
          const w = window as unknown as { __curaduriaMdErrors?: Record<string, unknown>[] };
          w.__curaduriaMdErrors = [...(w.__curaduriaMdErrors ?? []), fullMeta];
        }
        setMdErrorByImageId((prev) => ({ ...prev, [imageId]: detail }));
        toast.error("No se pudo cargar el .md de esta imagen", { description: detail });
        return null;
      } finally {
        setLoadingMdByImageId((prev) => ({ ...prev, [imageId]: false }));
      }
    },
    [loadingMdByImageId, mdByImageId, mdErrorByImageId, reviewId],
  );

  useEffect(() => {
    const images = reviewQuery.data?.images ?? [];
    if (!images.length) return;
    for (const image of images) {
      if (!image.result_md_url) continue;
      if (mdByImageId[image.id]) continue;
      if (mdErrorByImageId[image.id]) continue;
      if (loadingMdByImageId[image.id]) continue;
      void loadMd(image.id, image.result_md_url);
    }
  }, [reviewQuery.data?.images, mdByImageId, mdErrorByImageId, loadingMdByImageId, loadMd]);

  function onUpload() {
    const err = validateFiles(selectedFiles);
    if (err) return toast.error("Validación", { description: err });
    uploadMutation.mutate(selectedFiles);
  }

  function onCreateReview() {
    if (!uploadedItems.length) return toast.error("Primero sube imágenes");
    createMutation.mutate({
      image_file_ids: uploadedItems.map((item) => item.file_id),
      mode,
      chain: chain || null,
      category: category || null,
      notes: notes || null,
      vision_model: mode === "ocr_vision" ? visionModel || null : null,
      vision_prompt_file: mode === "ocr_vision" ? visionPromptFile || null : null,
    });
  }

  async function saveCard(imageId: number, imageName: string, forceSave = false) {
    const draft = getDraft(imageId, imageName);
    if (!draft.title?.trim() || !draft.content?.trim()) {
      toast.error("Completa título y contenido antes de guardar");
      return;
    }
    const duplicateCheck = await ocrApi.checkSemanticKnowledgeDuplicates(effectiveAccountName, draft);
    setDuplicateCheckByImageId((prev) => ({ ...prev, [imageId]: duplicateCheck }));
    if (!forceSave && duplicateCheck?.has_duplicates) {
      toast.warning("Ya existe una regla equivalente", {
        description: "Revisa duplicados antes de crear una nueva. Puedes guardar de todos modos.",
      });
      return;
    }
    const result = await saveKnowledgeMutation.mutateAsync(draft);
    if (result.duplicate_check) {
      setDuplicateCheckByImageId((prev) => ({ ...prev, [imageId]: result.duplicate_check ?? null }));
    }
    await decisionMutation.mutateAsync({
      imageId,
      decision: "saved",
      note: `Semantic knowledge creado id=${result.id}`,
    });
    setDismissed((prev) => ({ ...prev, [imageId]: true }));
    void reviewQuery.refetch();
  }

  async function discardCard(imageId: number) {
    const note = decisionNoteByImageId[imageId]?.trim() || "No aporta conocimiento útil";
    await decisionMutation.mutateAsync({ imageId, decision: "discarded", note });
    setDismissed((prev) => ({ ...prev, [imageId]: true }));
    void reviewQuery.refetch();
  }

  async function runLlmTest(imageId: number, imageName: string) {
    const draft = getDraft(imageId, imageName);
    if (!draft.title?.trim() || !draft.content?.trim()) {
      toast.error("Completa título y contenido antes de probar");
      return;
    }
    const img = (reviewQuery.data?.images ?? []).find((x) => x.id === imageId);
    let text: string | undefined = img?.ocr_text ?? mdByImageId[imageId];
    if (!text) {
      if (img?.result_md_url) {
        const loaded = await loadMd(imageId, img.result_md_url);
        if (loaded) text = loaded;
      }
    }
    if (!text?.trim()) {
      toast.error("Primero carga evidencia .md para esta tarjeta");
      return;
    }
    const trimmed = text.slice(0, 10000);
    const model = testModelByImageId[imageId] || "qwen3:8b";
    const reviewMode = (reviewQuery.data?.mode ?? mode) as "ocr" | "ocr_vision";
    const result = await llmTestMutation.mutateAsync({
      imageId,
      text: trimmed,
      mode: reviewMode,
      chain: (draft.chain ?? chain) || undefined,
      category: (draft.category ?? category) || undefined,
      model,
      knowledge: draft,
      visionAnalysis: reviewMode === "ocr_vision" && img?.vision_analysis ? img.vision_analysis : undefined,
    });
    setLlmTestByImageId((prev) => ({ ...prev, [imageId]: result }));
  }

  async function runMiniPreviewOcr(imageId: number, imageName: string) {
    await ensureCaseForImage(imageId, imageName);
    const draft = getDraft(imageId, imageName);
    let text = (reviewQuery.data?.images ?? []).find((x) => x.id === imageId)?.ocr_text ?? mdByImageId[imageId];
    if (!text) {
      const img = (reviewQuery.data?.images ?? []).find((x) => x.id === imageId);
      if (img?.result_md_url) {
        const loaded = await loadMd(imageId, img.result_md_url);
        if (loaded) text = loaded;
      }
    }
    if (!text?.trim()) {
      toast.error("Sin OCR para preview", { description: "Carga evidencia .md u OCR de la tarjeta." });
      return;
    }
    const trial = await miniPreviewOcrMutation.mutateAsync({
      imageId,
      text: text.slice(0, 12000),
      chain: (draft.chain ?? chain) || undefined,
      category: (draft.category ?? category) || undefined,
      candidateRule: draft,
    });
    setMiniPreviewOcrByImageId((prev) => ({ ...prev, [imageId]: (trial.result ?? null) as SemanticPreviewOcrResponse | null }));
    toast.success("Mini Preview OCR listo", { description: "No se guardó ningún cambio (dry run)." });
  }

  async function runMiniPreviewPipeline(imageId: number, imageName: string) {
    await ensureCaseForImage(imageId, imageName);
    const draft = getDraft(imageId, imageName);
    const img = (reviewQuery.data?.images ?? []).find((x) => x.id === imageId);
    const fileId = img?.file_id?.trim();
    if (!fileId) {
      toast.error("Mini Preview Pipeline requiere file_id", { description: "Esta tarjeta no trae file_id válido para simular pipeline." });
      return;
    }
    const payload = {
      imageId,
      imageFileId: fileId,
      imagePath: null,
      chain: (draft.chain ?? chain) || undefined,
      category: (draft.category ?? category) || undefined,
      candidateRule: draft,
    };
    try {
      const trial = await miniPreviewPipelineMutation.mutateAsync(payload);
      setMiniPreviewPipelineByImageId((prev) => ({ ...prev, [imageId]: (trial.result ?? null) as SemanticPreviewPipelineResponse | null }));
      toast.success("Mini Preview Pipeline listo", { description: "Simulación completa ejecutada. No se persistieron datos." });
    } catch (error) {
      if (error instanceof HttpError) {
        console.error("[MiniPreviewPipeline] failed", {
          url: `/v1/accounts/${effectiveAccountName}/semantic-knowledge/preview-pipeline`,
          method: "POST",
          request_body: {
            account_name: effectiveAccountName,
            config_name: "default",
            image_file_id: fileId,
            dry_run: true,
            persist_artifacts: false,
            chain: payload.chain ?? null,
            category: payload.category ?? null,
            candidate_rule: payload.candidateRule,
            review_id: reviewId,
            image_id: imageId,
          },
          response_status: error.status,
          response_detail: error.detail,
          response_payload: error.payload,
        });
      }
      throw error;
    }
  }

  async function ensureCaseForImage(imageId: number, imageName: string) {
    if (caseIdByImageId[imageId]) return caseIdByImageId[imageId];
    const img = (reviewQuery.data?.images ?? []).find((x) => x.id === imageId);
    const created = await createCaseMutation.mutateAsync({
      imageId,
      chain: (getDraft(imageId, imageName).chain ?? chain) || undefined,
      category: (getDraft(imageId, imageName).category ?? category) || undefined,
      riskType: img?.queue_reason ?? "name_conflict",
      payload: { ocr_text: img?.ocr_text ?? mdByImageId[imageId] ?? "", notes: "Case created from review card" },
    });
    setCaseIdByImageId((prev) => ({ ...prev, [imageId]: created.case_id }));
    toast.success("Caso creado", { description: `case_id=${created.case_id}` });
    return created.case_id;
  }

  async function runInsightForImage(imageId: number) {
    const preview = (miniPreviewPipelineByImageId[imageId] ?? miniPreviewOcrByImageId[imageId]) as Record<string, unknown> | null;
    if (!preview || Object.keys(preview).length === 0) {
      toast.error("No hay preview para analizar", { description: "Primero ejecuta Mini Preview OCR o Mini Preview Pipeline." });
      return;
    }
    const insight = await insightMutation.mutateAsync({ imageId, previewJson: preview });
    setInsightByImageId((prev) => ({ ...prev, [imageId]: insight }));
    toast.success("Insight AI generado");
  }

  async function runDraftAssistForImage(imageId: number, imageName: string) {
    const idea = (ideaTextByImageId[imageId] ?? "").trim();
    if (!idea) {
      toast.error("Falta idea base", { description: "Escribe la idea de regla antes de usar IA." });
      return;
    }
    const draft = getDraft(imageId, imageName);
    const img = (reviewQuery.data?.images ?? []).find((x) => x.id === imageId);
    const previewJson = (miniPreviewPipelineByImageId[imageId] ?? miniPreviewOcrByImageId[imageId] ?? null) as Record<string, unknown> | null;
    const ocrText = (img?.ocr_text ?? mdByImageId[imageId] ?? "").trim();
    if (!ocrText && !previewJson) {
      toast.error("Falta contexto OCR", { description: "Debes tener ocr_text o preview_json para asistir el borrador." });
      return;
    }
    const result = await draftAssistMutation.mutateAsync({
      imageId,
      ideaText: idea,
      chain: (draft.chain ?? chain) || undefined,
      category: (draft.category ?? category) || undefined,
      targetProductName: draft.title || undefined,
      ocrText: ocrText || undefined,
      previewJson,
    });
    setDraftAssistByImageId((prev) => ({ ...prev, [imageId]: result }));
    if (result.suggestion?.duplicate_check) {
      setDuplicateCheckByImageId((prev) => ({ ...prev, [imageId]: result.suggestion?.duplicate_check ?? null }));
    }
    toast.success("Sugerencia IA lista");
  }

  function imageZoom(imageId: number): number {
    return zoomByImageId[imageId] ?? 1;
  }

  function imageOffset(imageId: number): { x: number; y: number } {
    return offsetByImageId[imageId] ?? { x: 0, y: 0 };
  }

  function normalizeAssetUrl(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.replace(/\\/g, "/").trim();
    if (!normalized) return null;
    return encodeURI(toProxyStaticUrl(normalized) ?? normalized);
  }

  function renderHighlighted(text: string): React.ReactNode {
    const needle = highlightTerm.trim();
    if (!needle) return text;
    const source = text ?? "";
    const lower = source.toLowerCase();
    const target = needle.toLowerCase();
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    while (cursor < source.length) {
      const idx = lower.indexOf(target, cursor);
      if (idx === -1) {
        parts.push(source.slice(cursor));
        break;
      }
      if (idx > cursor) parts.push(source.slice(cursor, idx));
      parts.push(
        <mark key={`hl-${idx}-${cursor}`} className="rounded bg-amber-300/80 px-0.5 text-black">
          {source.slice(idx, idx + target.length)}
        </mark>,
      );
      cursor = idx + target.length;
    }
    return parts;
  }

  function applyReferenceToDraft(imageId: number, imageName: string, ref: SemanticKnowledgeEntry) {
    setDraft(imageId, imageName, {
      title: ref.title,
      content: ref.content,
      entry_type: ref.entry_type,
      chain: ref.chain ?? chain,
      category: ref.category ?? category,
      tags: ref.tags ?? [],
      priority: ref.priority ?? 7,
      is_active: ref.is_active === 1 || ref.is_active === true,
    });
  }

  function formatCheckValue(value: unknown): string {
    if (value == null) return "-";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader>
          <CardTitle>Curaduría Semántica · {accountName}</CardTitle>
          <CardDescription>Tarjetas por imagen para revisar OCR, ajustar regla y guardar o descartar una por una.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            Flujo: <span className="font-semibold">Subir</span> -&gt; <span className="font-semibold">Iniciar</span> -&gt; <span className="font-semibold">Revisar tarjetas</span> -&gt; <span className="font-semibold">Guardar reglas</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>account_name</Label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>mode</Label>
              <select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "ocr" | "ocr_vision")}>
                <option value="ocr">ocr</option>
                <option value="ocr_vision">ocr_vision</option>
              </select>
            </div>
            <div className="space-y-2"><Label>chain</Label><Input value={chain} onChange={(e) => setChain(e.target.value)} /></div>
            <div className="space-y-2"><Label>category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {mode === "ocr_vision" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2"><Label>vision_model</Label><Input value={visionModel} onChange={(e) => setVisionModel(e.target.value)} /></div>
              <div className="space-y-2"><Label>vision_prompt_file</Label><Input value={visionPromptFile} onChange={(e) => setVisionPromptFile(e.target.value)} /></div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <UploadPanel files={selectedFiles} onFilesChange={setSelectedFiles} onUpload={onUpload} isUploading={uploadMutation.isPending} />
      <UploadedFilesTable uploaded={uploadedItems} />

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardContent className="py-4">
          <Button onClick={onCreateReview} disabled={createMutation.isPending || uploadedItems.length === 0}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Iniciar Curaduría Semántica
          </Button>
        </CardContent>
      </Card>

      {reviewId ? (
        <>
          <Card className="sticky top-2 z-20 border-cyan-300/20 bg-slate-950/90 backdrop-blur">
            <CardContent className="grid gap-3 py-3 md:grid-cols-6">
              <div><p className="text-xs text-muted-foreground">estado</p><p>{reviewQuery.data?.status ?? "-"}</p></div>
              <div><p className="text-xs text-muted-foreground">procesadas/total</p><p>{reviewQuery.data?.processed_images ?? 0}/{reviewQuery.data?.total_images ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">fallidas</p><p>{reviewQuery.data?.failed_images ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">filtros activos</p><p>{[cardSearch ? "búsqueda" : "", highlightTerm ? "resaltado" : "", queueReasonFilter ? "razón de cola" : ""].filter(Boolean).join(", ") || "-"}</p></div>
              <div><p className="text-xs text-muted-foreground">última actualización</p><p>{reviewQuery.data?.updated_at ?? "-"}</p></div>
              <div className="flex items-end justify-end">
                <Button size="sm" variant="outline" onClick={() => { void reviewQuery.refetch(); void eventsQuery.refetch(); void metricsQuery.refetch(); }}>
                  Refrescar
                </Button>
              </div>
            </CardContent>
          </Card>

          {(reviewQuery.isFetching || eventsQuery.isFetching || metricsQuery.isFetching || createCaseMutation.isPending || setCaseStatusMutation.isPending || saveKnowledgeMutation.isPending) ? (
            <Card className="border-white/10 bg-white/5 backdrop-blur">
              <CardContent className="py-3 text-sm text-slate-200">
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Actualizando datos de curaduría...</span>
              </CardContent>
            </Card>
          ) : null}

          {(reviewQuery.error instanceof HttpError || eventsQuery.error instanceof HttpError || metricsQuery.error instanceof HttpError) ? (
            <Card className="border-rose-300/30 bg-rose-500/10">
              <CardContent className="py-3 text-sm text-rose-200">
                Error de carga. Verifica autenticación de cuenta y vuelve a refrescar. Detalle:
                {" "}
                {reviewLoadErrorDetail}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader>
              <CardTitle>Validación / Regresión</CardTitle>
              <CardDescription>Smoke tests de guardrails semánticos (dry_run, no guarda cambios).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => regressionSmokeMutation.mutate()} disabled={regressionSmokeMutation.isPending}>
                  {regressionSmokeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Validar guardrails semánticos
                </Button>
                {regressionSmoke?.dry_run ? <Badge variant="outline">No guarda cambios</Badge> : null}
                {regressionSmoke?.result?.status ? (
                  <Badge variant={String(regressionSmoke.result.status).toLowerCase() === "passed" ? "secondary" : "destructive"}>
                    {regressionSmoke.result.status}
                  </Badge>
                ) : null}
              </div>

              {regressionSmoke?.result?.summary ? (
                <div className="grid gap-2 md:grid-cols-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">suite</p><p>{regressionSmoke.result.suite ?? "-"}</p></div>
                  <div><p className="text-xs text-muted-foreground">total</p><p>{regressionSmoke.result.summary.total ?? 0}</p></div>
                  <div><p className="text-xs text-muted-foreground">passed</p><p>{regressionSmoke.result.summary.passed ?? 0}</p></div>
                  <div><p className="text-xs text-muted-foreground">failed</p><p>{regressionSmoke.result.summary.failed ?? 0}</p></div>
                </div>
              ) : null}

              {regressionSmoke?.result?.checks && regressionSmoke.result.checks.length > 0 ? (
                <div className="overflow-auto rounded-lg border border-white/10">
                  <table className="min-w-full text-xs">
                    <thead className="bg-white/5 text-left">
                      <tr>
                        <th className="px-2 py-2">check</th>
                        <th className="px-2 py-2">resultado</th>
                        <th className="px-2 py-2">esperado</th>
                        <th className="px-2 py-2">actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regressionSmoke.result.checks.map((check, idx) => (
                        <tr key={`reg-check-${idx}`} className="border-t border-white/10">
                          <td className="px-2 py-2">{check.check ?? "-"}</td>
                          <td className="px-2 py-2">
                            <Badge variant={check.passed ? "secondary" : "destructive"}>{check.passed ? "passed" : "failed"}</Badge>
                          </td>
                          <td className="px-2 py-2 whitespace-pre-wrap">{formatCheckValue(check.expected)}</td>
                          <td className="px-2 py-2 whitespace-pre-wrap">{formatCheckValue(check.actual)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : regressionSmoke?.result?.status ? (
                <p className="text-sm text-muted-foreground">
                  {String(regressionSmoke.result.status).toLowerCase() === "passed" ? "Sin regresiones detectadas." : "No hay detalle de checks en la respuesta."}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardHeader><CardTitle>Estado del review: {reviewId}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-6">
              <div><p className="text-xs text-muted-foreground">estado</p><p>{reviewQuery.data?.status ?? "-"}</p></div>
              <div><p className="text-xs text-muted-foreground">total</p><p>{reviewQuery.data?.total_images ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">processed</p><p>{reviewQuery.data?.processed_images ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">failed</p><p>{reviewQuery.data?.failed_images ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">eventos</p><p>{eventsQuery.data?.length ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground">métricas</p><p>{metricsQuery.data?.metrics.length ?? 0}</p></div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur">
            <CardContent className="grid gap-3 py-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Buscar en tarjetas/evidencia</Label>
                <Input value={cardSearch} onChange={(e) => setCardSearch(e.target.value)} placeholder="ej: jab tocador 3x100g..." />
              </div>
              <div className="space-y-2">
                <Label>Resaltado</Label>
                <Input value={highlightTerm} onChange={(e) => setHighlightTerm(e.target.value)} placeholder="palabra a resaltar" />
              </div>
              <div className="space-y-2">
                <Label>Filtro razón de cola</Label>
                <Input value={queueReasonFilter} onChange={(e) => setQueueReasonFilter(e.target.value)} placeholder="barcode_conflict, name_conflict..." />
              </div>
              <div className="md:col-span-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    for (const image of visibleImages) void loadMd(image.id, image.result_md_url);
                  }}
                >
                  Cargar evidencias visibles
                </Button>
                <span className="text-xs text-muted-foreground">Tip: usa chain/category y luego &quot;Usar&quot; para reciclar reglas existentes.</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {visibleImages.length === 0 ? (
              <Card className="border-white/10 bg-white/5 backdrop-blur">
                <CardContent className="py-4 text-sm text-muted-foreground">
                  No quedan tarjetas pendientes en este review. Siguiente paso: ajusta filtros o inicia una nueva curaduría con otro lote.
                </CardContent>
              </Card>
            ) : null}
            {visibleImages.map((img) => {
              const name = img.original_name ?? img.image_name ?? `image-${img.id}`;
              const draft = getDraft(img.id, name);
              const mdText = mdByImageId[img.id];
              const localPreview = img.file_id ? localPreviewByFileId[img.file_id] ?? null : null;
              const previewCandidates = [
                normalizeAssetUrl(img.annotated_image_url),
                normalizeAssetUrl(img.annotated_download_url),
                normalizeAssetUrl(localPreview),
              ].filter(Boolean) as string[];
              const previewIndex = previewIndexByImageId[img.id] ?? 0;
              const previewUrl = previewCandidates[previewIndex] ?? null;
              return (
                <Card key={img.id} className="border-white/10 bg-white/5 backdrop-blur">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{img.status}</Badge>
                        <Badge variant="secondary">OCR chars: {img.ocr_chars ?? 0}</Badge>
                        <Badge variant={img.has_vision ? "default" : "secondary"}>{img.has_vision ? "Vision" : "OCR"}</Badge>
                        {typeof img.risk_score === "number" ? <Badge variant="destructive">risk: {img.risk_score.toFixed(2)}</Badge> : null}
                        {img.queue_reason ? <Badge variant="outline">{img.queue_reason}</Badge> : null}
                      </div>
                    </div>
                    {(img.risk_reasons ?? []).length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(img.risk_reasons ?? []).map((reason) => (
                          <Badge key={`${img.id}-risk-${reason}`} variant="secondary">{reason}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="mb-2 text-sm font-semibold">Resumen</p>
                      <div className="grid gap-2 text-xs md:grid-cols-4">
                        <div><p className="text-muted-foreground">fase</p><p>{img.decision === "saved" ? "guardada" : img.decision === "discarded" ? "descartada" : img.status}</p></div>
                        <div><p className="text-muted-foreground">riesgo</p><p>{typeof img.risk_score === "number" ? img.risk_score.toFixed(2) : "-"}</p></div>
                        <div><p className="text-muted-foreground">razón de cola</p><p>{img.queue_reason ?? "-"}</p></div>
                        <div><p className="text-muted-foreground">acción sugerida</p><p>{duplicateCheckByImageId[img.id]?.has_duplicates ? "Revisar duplicados" : "Probar + Guardar/Descartar"}</p></div>
                      </div>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {previewUrl ? (
                            <a className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:bg-white/10" href={previewUrl} target="_blank" rel="noreferrer">Abrir imagen</a>
                          ) : (
                            <span>Imagen no disponible</span>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setZoomByImageId((prev) => ({ ...prev, [img.id]: Math.max(0.5, imageZoom(img.id) - 0.2) }))}><Minus className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => setZoomByImageId((prev) => ({ ...prev, [img.id]: Math.min(4, imageZoom(img.id) + 0.2) }))}><Plus className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" onClick={() => { setZoomByImageId((prev) => ({ ...prev, [img.id]: 1 })); setOffsetByImageId((prev) => ({ ...prev, [img.id]: { x: 0, y: 0 } })); }}>
                            <Move className="mr-1 h-3.5 w-3.5" /> Reset
                          </Button>
                        </div>
                        <div
                          className="relative h-[380px] overflow-hidden rounded-lg border border-white/10 bg-black/30"
                          onMouseDown={(event) => {
                            setDraggingByImageId((prev) => ({ ...prev, [img.id]: true }));
                            setDragStartByImageId((prev) => ({ ...prev, [img.id]: { x: event.clientX, y: event.clientY } }));
                          }}
                          onMouseMove={(event) => {
                            if (!draggingByImageId[img.id]) return;
                            const start = dragStartByImageId[img.id];
                            if (!start) return;
                            const current = imageOffset(img.id);
                            const dx = event.clientX - start.x;
                            const dy = event.clientY - start.y;
                            setOffsetByImageId((prev) => ({ ...prev, [img.id]: { x: current.x + dx, y: current.y + dy } }));
                            setDragStartByImageId((prev) => ({ ...prev, [img.id]: { x: event.clientX, y: event.clientY } }));
                          }}
                          onMouseUp={() => setDraggingByImageId((prev) => ({ ...prev, [img.id]: false }))}
                          onMouseLeave={() => setDraggingByImageId((prev) => ({ ...prev, [img.id]: false }))}
                        >
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={name}
                              className="select-none"
                              draggable={false}
                              onError={() => {
                                if (previewIndex + 1 < previewCandidates.length) {
                                  setPreviewIndexByImageId((prev) => ({ ...prev, [img.id]: previewIndex + 1 }));
                                  return;
                                }
                                setPreviewIndexByImageId((prev) => ({ ...prev, [img.id]: Number.MAX_SAFE_INTEGER }));
                              }}
                              style={{
                                transform: `translate(${imageOffset(img.id).x}px, ${imageOffset(img.id).y}px) scale(${imageZoom(img.id)})`,
                                transformOrigin: "center center",
                                maxWidth: "100%",
                                maxHeight: "100%",
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                translate: "-50% -50%",
                                cursor: draggingByImageId[img.id] ? "grabbing" : "grab",
                              }}
                            />
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                              <p>Sin imagen renderizable disponible aún.</p>
                              {img.annotated_image_url || img.annotated_download_url ? (
                                <p className="max-w-full truncate text-xs text-slate-400">
                                  URL recibida: {img.annotated_image_url ?? img.annotated_download_url}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          {img.result_md_url ? <a className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:bg-white/10" href={img.result_md_url} target="_blank" rel="noreferrer">Abrir .md</a> : <span>No md</span>}
                          {img.result_json_url ? <a className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:bg-white/10" href={img.result_json_url} target="_blank" rel="noreferrer">Abrir .json</a> : <span>No json</span>}
                          <Button size="sm" variant="outline" onClick={() => void loadMd(img.id, img.result_md_url)} disabled={!img.result_md_url || Boolean(loadingMdByImageId[img.id])}>
                            {loadingMdByImageId[img.id] ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                            Cargar evidencia
                          </Button>
                        </div>
                        <div className="max-h-52 overflow-auto rounded-lg border border-white/10 bg-black/20 p-3 text-xs whitespace-pre-wrap">
                          {mdText ? renderHighlighted(mdText) : "Sin evidencia cargada aún para esta tarjeta."}
                        </div>
                        <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-2">
                          <p className="mb-2 text-xs text-emerald-100">Reglas existentes por cadena/categoría</p>
                          <div className="max-h-36 space-y-1 overflow-auto">
                            {(knowledgeReferenceQuery.data?.items ?? []).slice(0, 6).map((item) => (
                              <div key={`ref-${img.id}-${item.id}`} className="flex items-center justify-between gap-2 rounded border border-white/10 px-2 py-1 text-xs">
                                <span className="truncate text-slate-200">{item.title}</span>
                                <Button size="sm" variant="outline" onClick={() => applyReferenceToDraft(img.id, name, item)}>Usar</Button>
                              </div>
                            ))}
                            {!(knowledgeReferenceQuery.data?.items ?? []).length ? <p className="text-xs text-slate-300">Sin reglas activas para este filtro.</p> : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2"><Label>Título</Label><Input value={draft.title} onChange={(e) => setDraft(img.id, name, { title: e.target.value })} /></div>
                      <div className="space-y-2">
                        <Label>entry_type</Label>
                        <select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={draft.entry_type} onChange={(e) => setDraft(img.id, name, { entry_type: e.target.value })}>
                          {ENTRY_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2"><Label>chain</Label><Input value={draft.chain ?? ""} onChange={(e) => setDraft(img.id, name, { chain: e.target.value })} /></div>
                      <div className="space-y-2"><Label>category</Label><Input value={draft.category ?? ""} onChange={(e) => setDraft(img.id, name, { category: e.target.value })} /></div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>content</Label>
                        <Textarea value={draft.content} onChange={(e) => setDraft(img.id, name, { content: e.target.value })} className="min-h-24" />
                        <p className="text-xs text-muted-foreground">Para aplicar abreviaturas con mayor confiabilidad: usa <span className="font-semibold">A -&gt; B</span> (ej. <span className="font-semibold">FRESC -&gt; FRESCURA</span>).</p>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Idea base de regla (humano)</Label>
                        <Textarea
                          value={ideaTextByImageId[img.id] ?? ""}
                          onChange={(e) => setIdeaTextByImageId((prev) => ({ ...prev, [img.id]: e.target.value }))}
                          className="min-h-20"
                          placeholder="Ej: OLM MASC / OLIM MASC -> OLIMPIA MASCOTAS en contexto limpieza"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>priority</Label>
                        <Input type="number" min={0} max={10} value={Number(draft.priority ?? 7)} onChange={(e) => setDraft(img.id, name, { priority: Number(e.target.value || 0) })} />
                        <p className="text-xs text-muted-foreground">0-10: mayor valor significa más peso/prioridad de esa regla en recuperación semántica.</p>
                      </div>
                      <div className="space-y-2"><Label>activo</Label><select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={draft.is_active ? "1" : "0"} onChange={(e) => setDraft(img.id, name, { is_active: e.target.value === "1" })}><option value="1">Activo</option><option value="0">Inactivo</option></select></div>
                      <div className="md:col-span-2"><TagsInput label="tags" values={draft.tags ?? []} onChange={(values) => setDraft(img.id, name, { tags: values })} /></div>
                      <div className="space-y-2"><Label>modelo test LLM</Label><Input value={testModelByImageId[img.id] ?? "qwen3:8b"} onChange={(e) => setTestModelByImageId((prev) => ({ ...prev, [img.id]: e.target.value }))} /></div>
                      <div className="space-y-2 md:col-span-2"><Label>nota de decisión</Label><Input value={decisionNoteByImageId[img.id] ?? ""} onChange={(e) => setDecisionNoteByImageId((prev) => ({ ...prev, [img.id]: e.target.value }))} placeholder="Motivo de guardado/descartado" /></div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="mb-2 text-sm font-semibold">Acciones</p>
                      <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void ensureCaseForImage(img.id, name)} disabled={createCaseMutation.isPending}>
                        Crear caso
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const caseId = caseIdByImageId[img.id] ?? (await ensureCaseForImage(img.id, name));
                          if (!caseId) return;
                          await setCaseStatusMutation.mutateAsync({ imageId: img.id, status: "resolved" });
                          toast.success("Caso resuelto", { description: `case_id=${caseId}` });
                        }}
                        disabled={setCaseStatusMutation.isPending}
                      >
                        Marcar resuelto
                      </Button>
                      <Button variant="outline" onClick={() => runMiniPreviewOcr(img.id, name)} disabled={miniPreviewOcrMutation.isPending}>
                        {miniPreviewOcrMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Mini Preview OCR
                      </Button>
                      <Button onClick={() => runMiniPreviewPipeline(img.id, name)} disabled={miniPreviewPipelineMutation.isPending}>
                        {miniPreviewPipelineMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Mini Preview Pipeline
                      </Button>
                      <Button variant="outline" onClick={() => void runDraftAssistForImage(img.id, name)} disabled={draftAssistMutation.isPending}>
                        {draftAssistMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Mejorar texto con IA
                      </Button>
                      <Button variant="outline" onClick={() => void runInsightForImage(img.id)} disabled={insightMutation.isPending}>
                        {insightMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Insight AI
                      </Button>
                      <Button variant="secondary" onClick={() => runLlmTest(img.id, name)} disabled={llmTestMutation.isPending}>
                        {llmTestMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                        {(reviewQuery.data?.mode ?? mode) === "ocr_vision" ? "Probar regla con OCR + Vision" : "Probar con OCR"}
                      </Button>
                      <Button onClick={() => saveCard(img.id, name)} disabled={saveKnowledgeMutation.isPending} className="bg-emerald-600 hover:bg-emerald-500">
                        <Check className="mr-2 h-4 w-4" /> Guardar esta tarjeta en conocimiento
                      </Button>
                      <Button variant="ghost" onClick={() => discardCard(img.id)} disabled={decisionMutation.isPending}>
                        <X className="mr-2 h-4 w-4" /> Descartar tarjeta
                      </Button>
                      <Link className="rounded-md border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20" href={`/accounts/${encodeURIComponent(accountName)}/aliases`}>Crear alias manual</Link>
                      </div>
                    </div>

                    <details className="rounded-lg border border-white/10 bg-white/5 p-3" open>
                      <summary className="cursor-pointer text-sm font-semibold">Técnico (debug, previews, insight)</summary>
                      <div className="mt-3 space-y-3">
                    {llmTestByImageId[img.id]?.result ? (
                      <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm">
                        <p><span className="text-emerald-200">Entendió:</span> {llmTestByImageId[img.id]?.result?.understood ? "Sí" : "No"}</p>
                        <p><span className="text-emerald-200">Aplica:</span> {llmTestByImageId[img.id]?.result?.applies ? "Sí" : "No"}</p>
                        <p className="mt-1 text-slate-200">{llmTestByImageId[img.id]?.result?.explanation ?? "-"}</p>
                        {(llmTestByImageId[img.id]?.result?.possible_corrections ?? []).length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {(llmTestByImageId[img.id]?.result?.possible_corrections ?? []).map((c, idx) => (
                              <p key={`${img.id}-corr-${idx}`} className="text-xs text-slate-200">{c.from ?? "?"} → {c.to ?? "?"} ({c.reason ?? "sin razón"})</p>
                            ))}
                          </div>
                        ) : null}
                        {llmTestByImageId[img.id]?.result?.suggested_knowledge_improvement ? (
                          <p className="mt-2 text-xs text-emerald-100">Mejora sugerida: {llmTestByImageId[img.id]?.result?.suggested_knowledge_improvement}</p>
                        ) : null}
                        {typeof (llmTestByImageId[img.id] as Record<string, unknown>)?.retrieved_with_chain === "string" ? (
                          <p className="mt-2 text-xs text-cyan-100">
                            Recuperado usando cadena: {String((llmTestByImageId[img.id] as Record<string, unknown>).retrieved_with_chain)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {draftAssistByImageId[img.id]?.suggestion ? (
                      <div className="rounded-lg border border-indigo-300/20 bg-indigo-500/10 p-3 text-xs">
                        <p className="mb-2 font-semibold text-indigo-100">Sugerencia IA de texto</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="mb-1 text-slate-300">Idea original</p>
                            <pre className="max-h-40 overflow-auto rounded border border-white/10 bg-black/25 p-2 whitespace-pre-wrap">{ideaTextByImageId[img.id] ?? "-"}</pre>
                          </div>
                          <div>
                            <p className="mb-1 text-slate-300">Texto sugerido</p>
                            <pre className="max-h-40 overflow-auto rounded border border-white/10 bg-black/25 p-2 whitespace-pre-wrap">
                              {draftAssistByImageId[img.id]?.suggestion?.improved_content ?? "-"}
                            </pre>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            aplica_probablemente: {String(Boolean(draftAssistByImageId[img.id]?.suggestion?.dry_validation?.applies_likely))}
                          </Badge>
                          {draftAssistByImageId[img.id]?.suggestion?.dry_validation?.reason ? (
                            <span className="text-slate-200">{draftAssistByImageId[img.id]?.suggestion?.dry_validation?.reason}</span>
                          ) : null}
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="font-semibold text-emerald-100">Señales encontradas</p>
                            <ul className="list-disc pl-4 text-slate-200">
                              {(draftAssistByImageId[img.id]?.suggestion?.dry_validation?.matched_signals ?? []).map((x, idx) => <li key={`matched-${img.id}-${idx}`}>{x}</li>)}
                            </ul>
                          </div>
                          <div>
                            <p className="font-semibold text-amber-100">Señales faltantes</p>
                            <ul className="list-disc pl-4 text-slate-200">
                              {(draftAssistByImageId[img.id]?.suggestion?.dry_validation?.missing_signals ?? []).map((x, idx) => <li key={`missing-${img.id}-${idx}`}>{x}</li>)}
                            </ul>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              const suggested = draftAssistByImageId[img.id]?.suggestion;
                              setDraft(img.id, name, {
                                title: suggested?.title_suggestion || draft.title,
                                content: suggested?.improved_content || draft.content,
                              });
                              toast.success("Sugerencia aplicada al formulario");
                            }}
                          >
                            Usar sugerencia
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {duplicateCheckByImageId[img.id]?.has_duplicates ? (
                      <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-3 text-xs">
                        <p className="font-semibold text-amber-100">
                          Ya existe una regla con mapeos equivalentes. Revisa si conviene editar la regla existente en lugar de crear una nueva.
                        </p>
                        <div className="mt-2 overflow-x-auto rounded border border-white/10 bg-black/20 p-2">
                          <table className="min-w-full text-[11px]">
                            <thead>
                              <tr className="text-left text-slate-300">
                                <th className="pr-3">severity</th>
                                <th className="pr-3">regla existente</th>
                                <th className="pr-3">mapeos repetidos</th>
                                <th className="pr-3">estado</th>
                                <th className="pr-3">cadena</th>
                                <th className="pr-3">categoría</th>
                                <th className="pr-3">recomendación</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(duplicateCheckByImageId[img.id]?.duplicates ?? []).map((dup, idx) => (
                                <tr key={`dup-${img.id}-${idx}`} className="border-t border-white/10 text-slate-200">
                                  <td className="pr-3">{dup.severity ?? "-"}</td>
                                  <td className="pr-3">{dup.title ?? "-"}</td>
                                  <td className="pr-3">{(dup.overlap_mappings ?? []).join(" | ") || "-"}</td>
                                  <td className="pr-3">{dup.status ?? (dup.is_active ? "active" : "inactive")}</td>
                                  <td className="pr-3">{dup.chain ?? "-"}</td>
                                  <td className="pr-3">{dup.category ?? "-"}</td>
                                  <td className="pr-3">{dup.recommendation ?? "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link
                            href={`/accounts/${encodeURIComponent(accountName)}/semantic-knowledge`}
                            className="rounded-md border border-amber-300/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
                          >
                            Ver regla existente
                          </Link>
                          <Button size="sm" variant="secondary" onClick={() => saveCard(img.id, name, true)} disabled={saveKnowledgeMutation.isPending}>
                            Guardar de todos modos
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDuplicateCheckByImageId((prev) => ({ ...prev, [img.id]: null }))}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {miniPreviewOcrByImageId[img.id] ? (
                      <div className="rounded-lg border border-cyan-300/20 bg-cyan-500/10 p-3 text-xs">
                        <p className="mb-2 text-cyan-100">Mini Preview OCR (dry run)</p>
                        <details className="rounded border border-white/10 bg-black/20 p-2">
                          <summary className="cursor-pointer text-slate-100">Ver JSON técnico</summary>
                          <pre className="mt-2 max-h-52 overflow-auto rounded border border-white/10 bg-black/25 p-2">
                            {JSON.stringify(miniPreviewOcrByImageId[img.id], null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : null}

                    {miniPreviewPipelineByImageId[img.id] ? (
                      <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3 text-xs">
                        <p className="mb-2 text-emerald-100">Mini Preview Pipeline (dry run)</p>
                        {(() => {
                          const preview = miniPreviewPipelineByImageId[img.id] as Record<string, unknown>;
                          const products = Array.isArray(preview.products) ? (preview.products as Record<string, unknown>[]) : [];
                          if (!products.length) return null;
                          return (
                            <details className="mb-2 rounded border border-white/10 bg-black/20 p-2">
                              <summary className="cursor-pointer text-slate-100">Evidencia semántica local</summary>
                              <div className="mt-2 space-y-2">
                                {products.map((p, idx) => {
                                  const scopePreview = typeof p.semantic_scope_text_preview === "string" ? p.semantic_scope_text_preview : "-";
                                  const guardrails = typeof p.semantic_scope_guardrails_enabled === "boolean" ? p.semantic_scope_guardrails_enabled : null;
                                  const blockedRules = Array.isArray(p.text_semantic_rag_scope_blocked_rules)
                                    ? (p.text_semantic_rag_scope_blocked_rules as Array<Record<string, unknown>>)
                                    : [];
                                  return (
                                    <div key={`scope-prod-${img.id}-${idx}`} className="rounded border border-white/10 p-2">
                                      <p className="font-semibold text-slate-100">{typeof p.producto === "string" ? p.producto : `Producto ${idx + 1}`}</p>
                                      <p className="text-slate-300">guardrails_enabled: {guardrails === null ? "-" : String(guardrails)}</p>
                                      <p className="text-slate-300">scope_text_preview: {scopePreview}</p>
                                      {blockedRules.length > 0 ? (
                                        <div className="mt-1 overflow-x-auto">
                                          <table className="min-w-full text-[11px]">
                                            <thead>
                                              <tr className="text-left text-slate-300">
                                                <th className="pr-3">from</th>
                                                <th className="pr-3">to</th>
                                                <th className="pr-3">block_reason</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {blockedRules.map((r, rIdx) => (
                                                <tr key={`scope-block-${img.id}-${idx}-${rIdx}`} className="border-t border-white/10 text-slate-200">
                                                  <td className="pr-3">{typeof r.from === "string" ? r.from : "-"}</td>
                                                  <td className="pr-3">{typeof r.to === "string" ? r.to : "-"}</td>
                                                  <td className="pr-3">
                                                    {typeof r.block_reason === "string" ? r.block_reason : "-"}
                                                    {r.block_reason === "source_not_in_product_scope" ? (
                                                      <div className="mt-1 text-amber-200">
                                                        La regla fue bloqueada porque la abreviatura origen no aparece en el texto local de este producto. Revisar segmentación/scope antes de relajar la regla.
                                                      </div>
                                                    ) : null}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-slate-400">Sin reglas bloqueadas por scope en este producto.</p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          );
                        })()}
                        <details className="rounded border border-white/10 bg-black/20 p-2">
                          <summary className="cursor-pointer text-slate-100">Ver JSON técnico</summary>
                          <pre className="mt-2 max-h-64 overflow-auto rounded border border-white/10 bg-black/25 p-2">
                            {JSON.stringify(miniPreviewPipelineByImageId[img.id], null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : null}

                    {insightByImageId[img.id] ? (
                      <div className="rounded-lg border border-violet-300/20 bg-violet-500/10 p-3 text-xs">
                        <p className="mb-2 text-violet-100">Insight AI</p>
                        {(() => {
                          const insight = insightByImageId[img.id];
                          const narrative = (insight?.insight_narrative ?? {}) as Record<string, unknown>;
                          const struct = (insight?.insight_struct ?? {}) as Record<string, unknown>;
                          const summary =
                            (typeof narrative.executive_summary === "string" && narrative.executive_summary) ||
                            (typeof narrative.summary === "string" && narrative.summary) ||
                            "";
                          const worked = Array.isArray(narrative.what_worked)
                            ? (narrative.what_worked as string[])
                            : Array.isArray(narrative.strengths)
                              ? (narrative.strengths as string[])
                              : [];
                          const failed = Array.isArray(narrative.what_failed)
                            ? (narrative.what_failed as string[])
                            : Array.isArray(narrative.issues)
                              ? (narrative.issues as string[])
                              : [];
                          const blocked = Array.isArray(narrative.why_blocked)
                            ? (narrative.why_blocked as string[])
                            : Array.isArray(narrative.block_reasons)
                              ? (narrative.block_reasons as string[])
                              : [];
                          const actions = Array.isArray(narrative.recommended_actions)
                            ? (narrative.recommended_actions as string[])
                            : Array.isArray(narrative.actions)
                              ? (narrative.actions as string[])
                              : [];
                          const structProducts = Number(struct.products_count ?? 0) || 0;
                          const structApplied = Number(struct.rules_applied_total ?? 0) || 0;
                          const structBlocked = Number(struct.rules_blocked_total ?? 0) || 0;
                          const fallbackSummary =
                            summary ||
                            `Insight estructural disponible: productos=${structProducts}, reglas_aplicadas=${structApplied}, reglas_bloqueadas=${structBlocked}.`;
                          return (
                            <>
                              <p className="mb-2 text-slate-100">{fallbackSummary}</p>
                              <div className="grid gap-2 md:grid-cols-2">
                                <div>
                                  <p className="font-semibold text-emerald-100">Qué funcionó</p>
                                  <ul className="list-disc pl-4 text-slate-200">
                                    {(worked.length ? worked : ["Sin narrativa LLM; revisa tabla técnica abajo."]).map((x, idx) => <li key={`worked-${img.id}-${idx}`}>{x}</li>)}
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-semibold text-rose-100">Qué falló</p>
                                  <ul className="list-disc pl-4 text-slate-200">
                                    {(failed.length ? failed : ["Sin narrativa LLM; reglas bloqueadas detectadas en estructura."]).map((x, idx) => <li key={`failed-${img.id}-${idx}`}>{x}</li>)}
                                  </ul>
                                </div>
                              </div>
                              <div className="mt-2 grid gap-2 md:grid-cols-2">
                                <div>
                                  <p className="font-semibold text-amber-100">Por qué se bloqueó</p>
                                  <ul className="list-disc pl-4 text-slate-200">
                                    {(blocked.length ? blocked : [`rules_blocked_total=${structBlocked}`]).map((x, idx) => <li key={`blocked-${img.id}-${idx}`}>{x}</li>)}
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-semibold text-cyan-100">Acciones recomendadas</p>
                                  <ul className="list-disc pl-4 text-slate-200">
                                    {(actions.length ? actions : ["Iterar regla candidata y volver a ejecutar Mini Preview + Insight AI."]).map((x, idx) => <li key={`actions-${img.id}-${idx}`}>{x}</li>)}
                                  </ul>
                                </div>
                              </div>
                              {Array.isArray(narrative.mapping_insights) && narrative.mapping_insights.length > 0 ? (
                                <div className="mt-2">
                                  <p className="font-semibold text-sky-100">Insights de mapeo</p>
                                  <ul className="list-disc pl-4 text-slate-200">
                                    {(narrative.mapping_insights as unknown[]).map((x, idx) => {
                                      if (typeof x === "string") return <li key={`mapping-insight-${img.id}-${idx}`}>{x}</li>;
                                      if (x && typeof x === "object") {
                                        const row = x as Record<string, unknown>;
                                        const mapping = typeof row.mapping === "string" ? row.mapping : "";
                                        const applied = Number.isFinite(Number(row.applied_count)) ? `applied=${Number(row.applied_count)}` : "";
                                        const blocked = Number.isFinite(Number(row.blocked_count)) ? `blocked=${Number(row.blocked_count)}` : "";
                                        const rec = typeof row.recommendation === "string" ? row.recommendation : "";
                                        const parts = [mapping, applied, blocked, rec].filter(Boolean);
                                        return <li key={`mapping-insight-${img.id}-${idx}`}>{parts.length ? parts.join(" | ") : JSON.stringify(row)}</li>;
                                      }
                                      return <li key={`mapping-insight-${img.id}-${idx}`}>{String(x)}</li>;
                                    })}
                                  </ul>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}
                        {(insightByImageId[img.id]?.insight_narrative?.missed_rules_analysis ?? []).length > 0 ? (
                          <details className="mt-2 rounded border border-fuchsia-300/20 bg-fuchsia-500/5 p-2">
                            <summary className="cursor-pointer font-semibold text-fuchsia-100">Reglas no aplicadas (análisis)</summary>
                            <ul className="mt-2 list-disc pl-4 text-slate-200">
                              {(insightByImageId[img.id]?.insight_narrative?.missed_rules_analysis ?? []).map((x, idx) => {
                                if (typeof x === "string") return <li key={`missed-analysis-${img.id}-${idx}`}>{x}</li>;
                                if (x && typeof x === "object") {
                                  const row = x as Record<string, unknown>;
                                  const producto = typeof row.producto === "string" ? row.producto : "";
                                  const regla = typeof row.regla === "string" ? row.regla : "";
                                  const causes = Array.isArray(row.possible_causes)
                                    ? (row.possible_causes as unknown[]).map((v) => String(v)).filter(Boolean).join(" | ")
                                    : "";
                                  const fix = typeof row.suggested_fix === "string" ? row.suggested_fix : "";
                                  const mapping = typeof row.mapping === "string" ? row.mapping : "";
                                  const blockReason = typeof row.block_reason === "string" ? row.block_reason : "";
                                  const parts = [producto, regla, mapping, causes, blockReason, fix].filter(Boolean);
                                  return <li key={`missed-analysis-${img.id}-${idx}`}>{parts.length ? parts.join(" | ") : JSON.stringify(row)}</li>;
                                }
                                return <li key={`missed-analysis-${img.id}-${idx}`}>{String(x)}</li>;
                              })}
                            </ul>
                          </details>
                        ) : null}
                        {(() => {
                          const insight = insightByImageId[img.id];
                          const narrativeRowsRaw = Array.isArray(insight?.insight_narrative?.missed_rules_analysis)
                            ? (insight?.insight_narrative?.missed_rules_analysis as unknown[])
                            : [];
                              const narrativeRows = narrativeRowsRaw
                                .map((row) => {
                                  if (!row || typeof row !== "object") return null;
                                  const r = row as Record<string, unknown>;
                                  const posible = Array.isArray(r.possible_causes)
                                    ? (r.possible_causes as unknown[]).map((x) => String(x)).filter(Boolean).join(" | ")
                                    : "";
                                  return {
                                    regla: typeof r.regla === "string" ? r.regla : "-",
                                    blocked: typeof r.blocked === "boolean" ? r.blocked : null,
                                    causa: posible || (typeof r.cause === "string" ? r.cause : "-"),
                                    mapping: typeof r.mapping === "string" ? r.mapping : "-",
                                    block_reason: typeof r.block_reason === "string" ? r.block_reason : "-",
                                    producto_idx: Number.isFinite(Number(r.producto_idx)) ? Number(r.producto_idx) : "-",
                                  };
                                })
                                .filter((x): x is { regla: string; blocked: boolean | null; causa: string; mapping: string; block_reason: string; producto_idx: number | string } => Boolean(x));
                              const structRowsRaw = Array.isArray(insight?.insight_struct?.missed_rule_opportunities)
                                ? (insight?.insight_struct?.missed_rule_opportunities as Array<Record<string, unknown>>)
                                : [];
                              const structRows = structRowsRaw.map((m) => ({
                                regla: typeof m.rule === "string" ? m.rule : typeof m.rule_name === "string" ? m.rule_name : "-",
                                blocked: typeof m.blocked === "boolean" ? m.blocked : null,
                                causa: typeof m.cause === "string" ? m.cause : typeof m.reason === "string" ? m.reason : "-",
                                mapping: typeof m.mapping === "string" ? m.mapping : "-",
                                block_reason: typeof m.block_reason === "string" ? m.block_reason : "-",
                                producto_idx: Number.isFinite(Number(m.product_index)) ? Number(m.product_index) : Number.isFinite(Number(m.product_idx)) ? Number(m.product_idx) : "-",
                              }));
                              const rows = narrativeRows.length ? narrativeRows : structRows;
                              if (!rows.length) return null;
                              return (
                          <details className="mt-3 rounded-lg border border-fuchsia-300/20 bg-fuchsia-500/5 p-3" open>
                            <summary className="cursor-pointer font-semibold text-fuchsia-100">Reglas no aplicadas (oportunidades)</summary>
                            <div className="mt-2 grid gap-2">
                              {rows.map((m, idx) => (
                                <div key={`missed-op-${img.id}-${idx}`} className="rounded border border-white/10 bg-black/20 p-3 text-xs">
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <div>
                                      <p className="text-[11px] text-slate-400">mapping</p>
                                      <p className="whitespace-normal break-words text-slate-200">{m.mapping}</p>
                                    </div>
                                    <div>
                                      <p className="text-[11px] text-slate-400">regla</p>
                                      <p className="whitespace-normal break-words text-slate-200">{m.regla}</p>
                                    </div>
                                    <div>
                                      <p className="text-[11px] text-slate-400">bloqueada</p>
                                      <p className="text-slate-200">{m.blocked === null ? "-" : String(m.blocked)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[11px] text-slate-400">producto_idx</p>
                                      <p className="text-slate-200">{m.producto_idx}</p>
                                    </div>
                                  </div>
                                  <div className="mt-2">
                                    <p className="text-[11px] text-slate-400">block_reason</p>
                                    <p className="whitespace-normal break-words text-slate-200">{m.block_reason}</p>
                                    {m.block_reason === "source_not_in_product_scope" ? (
                                      <div className="mt-1 rounded border border-amber-300/20 bg-amber-500/10 p-2 text-amber-200">
                                        La regla fue bloqueada porque la abreviatura origen no aparece en el texto local de este producto. Revisar segmentación/scope antes de relajar la regla.
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="mt-2">
                                    <p className="text-[11px] text-slate-400">causa</p>
                                    <p className="whitespace-normal break-words text-slate-200">{m.causa}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                          );
                        })()}
                        {(() => {
                          const insight = insightByImageId[img.id];
                          const mappingStats = Array.isArray(insight?.insight_struct?.mapping_stats)
                            ? (insight?.insight_struct?.mapping_stats as Array<Record<string, unknown>>)
                            : [];
                          if (!mappingStats.length) return null;
                          return (
                            <details className="mt-3 overflow-x-auto rounded-lg border border-sky-300/20 bg-sky-500/5 p-3" open>
                              <summary className="mb-2 cursor-pointer font-semibold text-sky-100">Estadísticas de mapeo</summary>
                              <table className="min-w-full table-fixed text-xs">
                                <colgroup>
                                  <col className="w-[22%]" />
                                  <col className="w-[10%]" />
                                  <col className="w-[10%]" />
                                  <col className="w-[28%]" />
                                  <col className="w-[30%]" />
                                </colgroup>
                                <thead>
                                  <tr className="text-left text-slate-300">
                                    <th className="pr-3">mapping</th>
                                    <th className="pr-3">applied_count</th>
                                    <th className="pr-3">blocked_count</th>
                                    <th className="pr-3">blocked_reasons</th>
                                    <th className="pr-3">recommendation</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {mappingStats.map((row, idx) => {
                                    const reasons = Array.isArray(row.blocked_reasons)
                                      ? (row.blocked_reasons as unknown[]).map((x) => String(x)).join(" | ")
                                      : row.blocked_reasons && typeof row.blocked_reasons === "object"
                                        ? Object.entries(row.blocked_reasons as Record<string, unknown>).map(([k, v]) => `${k}:${String(v)}`).join(" | ")
                                        : "-";
                                    return (
                                      <tr key={`mapping-stats-${img.id}-${idx}`} className="border-t border-white/10 align-top text-slate-200">
                                        <td className="pr-3 align-top whitespace-normal break-words leading-relaxed">{typeof row.mapping === "string" ? row.mapping : "-"}</td>
                                        <td className="pr-3 align-top">{Number.isFinite(Number(row.applied_count)) ? Number(row.applied_count) : 0}</td>
                                        <td className="pr-3 align-top">{Number.isFinite(Number(row.blocked_count)) ? Number(row.blocked_count) : 0}</td>
                                        <td className="pr-3 align-top whitespace-normal break-words leading-relaxed">{reasons}</td>
                                        <td className="pr-3 align-top whitespace-normal break-words leading-relaxed">{typeof row.recommendation === "string" ? row.recommendation : "-"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </details>
                          );
                        })()}
                        {(insightByImageId[img.id]?.insight_struct?.per_product_findings ?? []).length > 0 ? (
                          <div className="mt-3 overflow-x-auto rounded border border-white/10 bg-black/20 p-2">
                            <table className="min-w-full text-[11px]">
                              <thead>
                                <tr className="text-left text-slate-300">
                                  <th className="pr-3">#</th>
                                  <th className="pr-3">producto</th>
                                  <th className="pr-3">barcode</th>
                                  <th className="pr-3">name_changed</th>
                                  <th className="pr-3">applied</th>
                                  <th className="pr-3">blocked</th>
                                  <th className="pr-3">confidence</th>
                                  <th className="pr-3">semantic_scope_text_preview</th>
                                  <th className="pr-3">rule_opportunities</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(insightByImageId[img.id]?.insight_struct?.per_product_findings ?? []).map((p, idx) => (
                                  <tr key={`insight-prod-${img.id}-${idx}`} className="border-t border-white/10 text-slate-200">
                                    <td className="pr-3">{p.index ?? idx + 1}</td>
                                    <td className="pr-3">{p.producto ?? "-"}</td>
                                    <td className="pr-3">{p.barcode ?? "-"}</td>
                                    <td className="pr-3">{String(Boolean(p.name_changed))}</td>
                                    <td className="pr-3">{p.rules_applied_count ?? 0}</td>
                                    <td className="pr-3">{p.rules_blocked_count ?? 0}</td>
                                    <td className="pr-3">{typeof p.product_confidence_score === "number" ? p.product_confidence_score.toFixed(2) : "-"}</td>
                                    <td className="pr-3">{typeof (p as Record<string, unknown>).semantic_scope_text_preview === "string" ? String((p as Record<string, unknown>).semantic_scope_text_preview) : "-"}</td>
                                    <td className="pr-3">{Array.isArray(p.rule_opportunities) ? p.rule_opportunities.length : 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                      </div>
                    </details>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
