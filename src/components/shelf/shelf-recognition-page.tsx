"use client";

import { useState } from "react";
import { ShelfCurationInbox } from "@/components/shelf/shelf-curation-inbox";
import { ShelfClusterBoard } from "@/components/shelf/shelf-cluster-board";
import { ShelfConfusionStudio } from "@/components/shelf/shelf-confusion-studio";
import { ShelfTrainingCampaigns } from "@/components/shelf/shelf-training-campaigns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = { account: string };
type ShelfTab = "inbox" | "cluster-board" | "confusion" | "campaigns";

export function ShelfRecognitionPage({ account }: Props) {
  const [tab, setTab] = useState<ShelfTab>("inbox");

  const tabConfig: Array<{
    id: ShelfTab;
    label: string;
    icon: string;
    description: string;
  }> = [
    {
      id: "inbox",
      label: "Inbox",
      icon: "📥",
      description: "Triage rápido de crops",
    },
    {
      id: "cluster-board",
      label: "Cluster Board",
      icon: "📊",
      description: "Asignación masiva Kanban",
    },
    {
      id: "confusion",
      label: "Confusion Studio",
      icon: "🔬",
      description: "Matriz de confusiones",
    },
    {
      id: "campaigns",
      label: "Campañas",
      icon: "🎯",
      description: "Muestras de entrenamiento",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle>🛍️ Shelf Recognition</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {tabConfig.map((tabItem) => (
              <Button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                variant={tab === tabItem.id ? "default" : "outline"}
                className="flex-col h-auto py-3"
              >
                <div className="text-lg">{tabItem.icon}</div>
                <div className="font-semibold text-sm">{tabItem.label}</div>
                <div className="text-xs text-white/60">{tabItem.description}</div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {tab === "inbox" && <ShelfCurationInbox account={account} />}
      {tab === "cluster-board" && <ShelfClusterBoard account={account} />}
      {tab === "confusion" && <ShelfConfusionStudio account={account} />}
      {tab === "campaigns" && <ShelfTrainingCampaigns account={account} />}
    </div>
  );
}
