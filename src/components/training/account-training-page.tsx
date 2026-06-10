"use client";

import { useState } from "react";
import { AccountAliasesPage } from "@/components/semantic/account-aliases-page";
import { AccountChainsPage } from "@/components/semantic/account-chains-page";
import { AccountSemanticKnowledgePage } from "@/components/semantic/account-semantic-knowledge-page";
import { AccountSemanticLabPage } from "@/components/semantic/account-semantic-lab-page";
import { AccountSemanticReviewPage } from "@/components/semantic/account-semantic-review-page";
import { SemanticConfigPage } from "@/components/training/semantic-config-page";
import { SizeRulesPage } from "@/components/training/size-rules-page";
import { RagEffectivenessPage } from "@/components/training/rag-effectiveness-page";
import { SemanticAliasesEditor } from "@/components/training/semantic-aliases-editor";
import { IgnoredPhrasesEditor } from "@/components/training/ignored-phrases-editor";
import { EnrichmentTokensEditor } from "@/components/training/enrichment-tokens-editor";
import { PromotionVariantsEditor } from "@/components/training/promotion-variants-editor";
import { CategoryMarkersEditor } from "@/components/training/category-markers-editor";
import { MeasureNoiseChainsEditor } from "@/components/training/measure-noise-chains-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  | "semantic-aliases"
  | "ignored-phrases"
  | "enrichment-tokens"
  | "variants"
  | "markers"
  | "measure-noise";

export function AccountTrainingPage({ account }: Props) {
  const [tab, setTab] = useState<TrainingTab>("chains");

  const semanticEnrichmentTabs: TrainingTab[] = ["semantic-aliases", "ignored-phrases", "enrichment-tokens", "variants", "markers", "measure-noise"];
  const semanticConfigTabs: TrainingTab[] = ["semantic-config", "size-rules", "rag-effectiveness"];
  const curduriaTabs: TrainingTab[] = ["lab", "curaduria"];

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Entrenamiento IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Principal Tabs */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={tab === "chains" ? "default" : "outline"}
              onClick={() => setTab("chains")}
            >
              Cadenas
            </Button>
            <Button
              variant={semanticEnrichmentTabs.includes(tab) ? "default" : "outline"}
              onClick={() => setTab("semantic-aliases")}
              className="text-sm"
            >
              🧬 Enriquecimiento Semántico
            </Button>
            <Button
              variant={semanticConfigTabs.includes(tab) ? "default" : "outline"}
              onClick={() => setTab("semantic-config")}
              className="text-sm"
            >
              ⚙️ Configuración Semántica
            </Button>
            <Button
              variant={curduriaTabs.includes(tab) ? "default" : "outline"}
              onClick={() => setTab("lab")}
            >
              Curaduría
            </Button>
          </div>

          {/* Sub-tabs for Semantic Enrichment */}
          {semanticEnrichmentTabs.includes(tab) && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <Button variant={tab === "semantic-aliases" ? "default" : "outline"} size="sm" onClick={() => setTab("semantic-aliases")}>
                Aliases
              </Button>
              <Button variant={tab === "ignored-phrases" ? "default" : "outline"} size="sm" onClick={() => setTab("ignored-phrases")}>
                Frases Ignoradas
              </Button>
              <Button variant={tab === "enrichment-tokens" ? "default" : "outline"} size="sm" onClick={() => setTab("enrichment-tokens")}>
                Tokens
              </Button>
              <Button variant={tab === "variants" ? "default" : "outline"} size="sm" onClick={() => setTab("variants")}>
                Variantes
              </Button>
              <Button variant={tab === "markers" ? "default" : "outline"} size="sm" onClick={() => setTab("markers")}>
                Markers
              </Button>
              <Button variant={tab === "measure-noise" ? "default" : "outline"} size="sm" onClick={() => setTab("measure-noise")}>
                Medida/Ruido
              </Button>
            </div>
          )}

          {/* Sub-tabs for Semantic Config */}
          {semanticConfigTabs.includes(tab) && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <Button variant={tab === "semantic-config" ? "default" : "outline"} size="sm" onClick={() => setTab("semantic-config")}>
                Configuración
              </Button>
              <Button variant={tab === "size-rules" ? "default" : "outline"} size="sm" onClick={() => setTab("size-rules")}>
                Reglas Tamaño
              </Button>
              <Button variant={tab === "rag-effectiveness" ? "default" : "outline"} size="sm" onClick={() => setTab("rag-effectiveness")}>
                Efectividad RAG
              </Button>
            </div>
          )}

          {/* Sub-tabs for Curaduría */}
          {curduriaTabs.includes(tab) && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              <Button variant={tab === "lab" ? "default" : "outline"} size="sm" onClick={() => setTab("lab")}>
                Lab
              </Button>
              <Button variant={tab === "curaduria" ? "default" : "outline"} size="sm" onClick={() => setTab("curaduria")}>
                Curaduría
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      {tab === "chains" && <AccountChainsPage account={account} />}

      {/* Semantic Enrichment */}
      {tab === "semantic-aliases" && <SemanticAliasesEditor account={account} />}
      {tab === "ignored-phrases" && <IgnoredPhrasesEditor account={account} />}
      {tab === "enrichment-tokens" && <EnrichmentTokensEditor account={account} />}
      {tab === "variants" && <PromotionVariantsEditor account={account} />}
      {tab === "markers" && <CategoryMarkersEditor account={account} />}
      {tab === "measure-noise" && <MeasureNoiseChainsEditor account={account} />}

      {/* Semantic Config */}
      {tab === "semantic-config" && <SemanticConfigPage account={account} />}
      {tab === "size-rules" && <SizeRulesPage account={account} />}
      {tab === "rag-effectiveness" && <RagEffectivenessPage account={account} />}

      {/* Curaduría */}
      {tab === "lab" && <AccountSemanticLabPage account={account} />}
      {tab === "curaduria" && <AccountSemanticReviewPage account={account} />}
    </div>
  );
}

