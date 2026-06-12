"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BookOpen,
  Eye,
  FlaskConical,
  GraduationCap,
  Layers3,
  Sparkles,
  Tag,
  Wrench,
} from "lucide-react";
import { AccountAliasesPage } from "@/components/semantic/account-aliases-page";
import { AccountChainsPage } from "@/components/semantic/account-chains-page";
import { AccountSemanticKnowledgePage } from "@/components/semantic/account-semantic-knowledge-page";
import { AccountSemanticLabPage } from "@/components/semantic/account-semantic-lab-page";
import { AccountSemanticReviewPage } from "@/components/semantic/account-semantic-review-page";
import { SemanticConfigPage } from "@/components/training/semantic-config-page";
import { SizeRulesPage } from "@/components/training/size-rules-page";
import { RagEffectivenessPage } from "@/components/training/rag-effectiveness-page";
import { IgnoredPhrasesEditor } from "@/components/training/ignored-phrases-editor";
import { EnrichmentTokensEditor } from "@/components/training/enrichment-tokens-editor";
import { PromotionVariantsEditor } from "@/components/training/promotion-variants-editor";
import { CategoryMarkersEditor } from "@/components/training/category-markers-editor";
import { MeasureNoiseChainsEditor } from "@/components/training/measure-noise-chains-editor";
import { PromotionProductDedupeEditor } from "@/components/training/promotion-product-dedupe-editor";
import { HumanNameNoiseTokensEditor } from "@/components/training/human-name-noise-tokens-editor";
import { NameNoisePage } from "@/components/training/name-noise-page";
import { VisionOcrTuningPage } from "@/components/training/vision-ocr-tuning-page";
import { OcrNoiseReviewConfigEditor } from "@/components/training/ocr-noise-review-config-editor";
import { isOcrNoiseReviewConfigApiEnabled } from "@/lib/ocr-noise-review-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = { account: string };

type TrainingTab =
  | "chains"
  | "aliases"
  | "knowledge"
  | "lab"
  | "curaduria"
  | "semantic-config"
  | "size-rules"
  | "rag-effectiveness"
  | "vision-ocr"
  | "ignored-phrases"
  | "enrichment-tokens"
  | "variants"
  | "markers"
  | "measure-noise-chains"
  | "human-name-noise-tokens"
  | "name-noise"
  | "product-dedupe"
  | "ocr-noise-review-config";

type TrainingModule = "chains" | "promotions" | "enrichment" | "config" | "curaduria";

const chainsTabs: TrainingTab[] = ["chains", "aliases", "knowledge"];
const promotionsTabs: TrainingTab[] = [
  "product-dedupe",
  "measure-noise-chains",
  "human-name-noise-tokens",
  "name-noise",
  "variants",
  "markers",
];
const semanticEnrichmentTabs: TrainingTab[] = ["ignored-phrases", "enrichment-tokens"];
const semanticConfigTabs: TrainingTab[] = ["semantic-config", "rag-effectiveness", "size-rules", "vision-ocr"];
const curaduriaTabs: TrainingTab[] = ["lab", "curaduria", "ocr-noise-review-config"];

function moduleForTab(tab: TrainingTab): TrainingModule {
  if (chainsTabs.includes(tab)) return "chains";
  if (promotionsTabs.includes(tab)) return "promotions";
  if (semanticEnrichmentTabs.includes(tab)) return "enrichment";
  if (semanticConfigTabs.includes(tab)) return "config";
  return "curaduria";
}

function defaultTabForModule(module: TrainingModule): TrainingTab {
  if (module === "chains") return "chains";
  if (module === "promotions") return "product-dedupe";
  if (module === "enrichment") return "ignored-phrases";
  if (module === "config") return "semantic-config";
  return "lab";
}

const TAB_LABELS: Partial<Record<TrainingTab, string>> = {
  chains: "Catalogo de cadenas",
  aliases: "Aliases de resolucion",
  knowledge: "Conocimiento semantico",
  variants: "Variantes de promocion",
  markers: "Markers de categoria",
  "product-dedupe": "Cardinalidad promociones",
  "measure-noise-chains": "Correccion de medidas por cadena",
  "human-name-noise-tokens": "Tokens universales de ruido de nombre",
  "ignored-phrases": "Frases ignoradas",
  "name-noise": "Frases ignoradas de nombre",
  "enrichment-tokens": "Tokens de enriquecimiento",
  "vision-ocr": "Vision y OCR",
  "semantic-config": "Configuracion semantica",
  "size-rules": "Reglas de tamano",
  "rag-effectiveness": "Efectividad RAG",
  lab: "Laboratorio semantico",
  curaduria: "Curaduria de reglas",
  "ocr-noise-review-config": "Heuristicas revision OCR",
};

function TrainingModuleCard({
  active,
  onClick,
  icon,
  label,
  description,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  description: string;
  tone: "sky" | "violet" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    sky: {
      active: "border-sky-300/40 bg-sky-500/15 shadow-lg shadow-sky-950/25",
      icon: "text-sky-300",
      title: "text-sky-50",
    },
    violet: {
      active: "border-violet-300/40 bg-violet-500/15 shadow-lg shadow-violet-950/25",
      icon: "text-violet-300",
      title: "text-violet-50",
    },
    emerald: {
      active: "border-emerald-300/40 bg-emerald-500/15 shadow-lg shadow-emerald-950/25",
      icon: "text-emerald-300",
      title: "text-emerald-50",
    },
    amber: {
      active: "border-amber-300/40 bg-amber-500/15 shadow-lg shadow-amber-950/25",
      icon: "text-amber-300",
      title: "text-amber-50",
    },
    rose: {
      active: "border-rose-300/40 bg-rose-500/15 shadow-lg shadow-rose-950/25",
      icon: "text-rose-300",
      title: "text-rose-50",
    },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left transition hover:-translate-y-0.5 sm:px-4 ${
        active ? tones.active : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded-md border border-white/10 bg-black/25 p-1.5 ${active ? tones.icon : "text-slate-400"}`}>
          {icon}
        </span>
        <span className={`text-sm font-semibold ${active ? tones.title : "text-slate-200"}`}>{label}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-slate-400">{description}</p>
    </button>
  );
}

function TrainingSubPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/40"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

export function AccountTrainingPage({ account }: Props) {
  const [tab, setTab] = useState<TrainingTab>("chains");
  const activeModule = useMemo(() => moduleForTab(tab), [tab]);
  const activeTabLabel = TAB_LABELS[tab] ?? tab;

  function selectModule(module: TrainingModule) {
    setTab(defaultTabForModule(module));
  }

  const subTabs =
    activeModule === "chains"
      ? chainsTabs
      : activeModule === "promotions"
        ? promotionsTabs
        : activeModule === "enrichment"
          ? semanticEnrichmentTabs
          : activeModule === "config"
            ? semanticConfigTabs
            : activeModule === "curaduria"
              ? curaduriaTabs
              : [];

  return (
    <div className="space-y-4 pb-10">
      <section className="overflow-hidden rounded-2xl border border-sky-300/20 bg-gradient-to-br from-slate-950 via-[#0b1220] to-sky-950/45 shadow-xl shadow-sky-950/20">
        <div className="border-b border-white/5 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-sky-300" />
                <h1 className="font-heading text-xl font-semibold tracking-tight text-white sm:text-2xl">Training IA</h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Reglas de promociones, enriquecimiento semantico, tuning Vision/OCR y curaduria. Todo lo que entrena el pipeline sin tocar codigo.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-sky-300/30 bg-sky-500/10 text-sky-100">{account}</Badge>
              <Badge variant="outline" className="border-white/15 text-[10px] text-slate-300">
                {activeTabLabel}
              </Badge>
              <Link href={`/accounts/${encodeURIComponent(account)}/config`}>
                <Button size="sm" variant="outline" className="h-8 border-white/15 bg-black/25 text-xs">
                  <Wrench className="mr-1.5 h-3.5 w-3.5" />
                  Config global
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 sm:px-5 sm:pb-4">
          <TrainingModuleCard
            active={activeModule === "chains"}
            onClick={() => selectModule("chains")}
            icon={<Layers3 className="h-4 w-4" />}
            label="Cadenas"
            description="Catalogo, aliases de resolucion y conocimiento RAG"
            tone="sky"
          />
          <TrainingModuleCard
            active={activeModule === "promotions"}
            onClick={() => selectModule("promotions")}
            icon={<Tag className="h-4 w-4" />}
            label="Promociones"
            description="Medidas por cadena, tokens de nombre, frases y variantes"
            tone="violet"
          />
          <TrainingModuleCard
            active={activeModule === "enrichment"}
            onClick={() => selectModule("enrichment")}
            icon={<Sparkles className="h-4 w-4" />}
            label="Enriquecimiento"
            description="Frases ignoradas de producto y tokens de enriquecimiento"
            tone="emerald"
          />
          <TrainingModuleCard
            active={activeModule === "config"}
            onClick={() => selectModule("config")}
            icon={<BookOpen className="h-4 w-4" />}
            label="Reglas semanticas"
            description="Config semantica, RAG, tamano y Vision/OCR"
            tone="amber"
          />
          <TrainingModuleCard
            active={activeModule === "curaduria"}
            onClick={() => selectModule("curaduria")}
            icon={<Eye className="h-4 w-4" />}
            label="Curaduria"
            description="Lab, revision de reglas y heuristicas OCR"
            tone="rose"
          />
        </div>
      </section>

      {subTabs.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] uppercase tracking-wide text-slate-500">Seccion</span>
            {subTabs.map((subTab) => (
              <TrainingSubPill
                key={subTab}
                active={tab === subTab}
                label={
                  subTab === "chains"
                    ? "Catalogo"
                    : subTab === "aliases"
                      ? "Aliases resolucion"
                      : subTab === "knowledge"
                        ? "Conocimiento RAG"
                        : subTab === "vision-ocr"
                          ? "Vision / OCR"
                          : subTab === "product-dedupe"
                            ? "Cardinalidad"
                            : subTab === "measure-noise-chains"
                              ? "Medidas por cadena"
                              : subTab === "human-name-noise-tokens"
                                ? "Tokens de nombre"
                              : subTab === "ignored-phrases"
                                ? "Frases ignoradas"
                                : subTab === "name-noise"
                                  ? "Frases de nombre"
                                  : subTab === "enrichment-tokens"
                                    ? "Tokens"
                                    : subTab === "semantic-config"
                                      ? "Config semantica"
                                      : subTab === "size-rules"
                                        ? "Reglas tamano"
                                        : subTab === "rag-effectiveness"
                                          ? "Efectividad RAG"
                                          : subTab === "curaduria"
                                            ? "Revision"
                                            : subTab === "ocr-noise-review-config"
                                              ? isOcrNoiseReviewConfigApiEnabled()
                                                ? "Heuristicas OCR"
                                                : "Heuristicas OCR (prox.)"
                                              : subTab.charAt(0).toUpperCase() + subTab.slice(1).replace(/-/g, " ")
                }
                onClick={() => setTab(subTab)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-w-0">
        {tab === "chains" && <AccountChainsPage account={account} />}
        {tab === "aliases" && <AccountAliasesPage account={account} />}
        {tab === "knowledge" && <AccountSemanticKnowledgePage account={account} />}

        {tab === "ignored-phrases" && <IgnoredPhrasesEditor account={account} />}
        {tab === "enrichment-tokens" && <EnrichmentTokensEditor account={account} />}
        {tab === "product-dedupe" && <PromotionProductDedupeEditor account={account} />}
        {tab === "measure-noise-chains" && (
          <MeasureNoiseChainsEditor account={account} onGoToChains={() => setTab("chains")} />
        )}
        {tab === "human-name-noise-tokens" && <HumanNameNoiseTokensEditor account={account} />}
        {tab === "name-noise" && <NameNoisePage account={account} />}
        {tab === "variants" && <PromotionVariantsEditor account={account} />}
        {tab === "markers" && <CategoryMarkersEditor account={account} />}

        {tab === "vision-ocr" && <VisionOcrTuningPage account={account} />}
        {tab === "semantic-config" && <SemanticConfigPage account={account} />}
        {tab === "size-rules" && <SizeRulesPage account={account} />}
        {tab === "rag-effectiveness" && <RagEffectivenessPage account={account} />}

        {tab === "lab" && <AccountSemanticLabPage account={account} />}
        {tab === "curaduria" && <AccountSemanticReviewPage account={account} />}
        {tab === "ocr-noise-review-config" && <OcrNoiseReviewConfigEditor account={account} />}
      </div>
    </div>
  );
}