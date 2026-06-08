"use client";

import { useState } from "react";
import { AccountAliasesPage } from "@/components/semantic/account-aliases-page";
import { AccountChainsPage } from "@/components/semantic/account-chains-page";
import { AccountSemanticKnowledgePage } from "@/components/semantic/account-semantic-knowledge-page";
import { AccountSemanticLabPage } from "@/components/semantic/account-semantic-lab-page";
import { AccountSemanticReviewPage } from "@/components/semantic/account-semantic-review-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = { account: string };
type TrainingTab = "chains" | "aliases" | "knowledge" | "lab" | "curaduria";

export function AccountTrainingPage({ account }: Props) {
  const [tab, setTab] = useState<TrainingTab>("chains");

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>Entrenamiento IA</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant={tab === "chains" ? "default" : "outline"} onClick={() => setTab("chains")}>Cadenas</Button>
          <Button variant={tab === "aliases" ? "default" : "outline"} onClick={() => setTab("aliases")}>Aliases</Button>
          <Button variant={tab === "knowledge" ? "default" : "outline"} onClick={() => setTab("knowledge")}>Knowledge RAG</Button>
          <Button variant={tab === "lab" ? "default" : "outline"} onClick={() => setTab("lab")}>Curaduría Lab</Button>
          <Button variant={tab === "curaduria" ? "default" : "outline"} onClick={() => setTab("curaduria")}>Curaduría</Button>
        </CardContent>
      </Card>

      {tab === "chains" ? <AccountChainsPage account={account} /> : null}
      {tab === "aliases" ? <AccountAliasesPage account={account} /> : null}
      {tab === "knowledge" ? <AccountSemanticKnowledgePage account={account} /> : null}
      {tab === "lab" ? <AccountSemanticLabPage account={account} /> : null}
      {tab === "curaduria" ? <AccountSemanticReviewPage account={account} /> : null}
    </div>
  );
}

