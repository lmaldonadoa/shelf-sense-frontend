"use client";

import { ReactNode } from "react";
import type { OcrPreprocessVariant } from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type VariantRow = OcrPreprocessVariant | Record<string, unknown>;

export type OcrVariantRowsProps = {
  variants: VariantRow[];
  displayedWinner?: string | null;
  preprocessMode: "active" | "shadow";
  cropLabel: string;
  formatQualityMetrics: (metrics: unknown) => string;
  getArtifactUrl: (variant: VariantRow | null | undefined) => string | null;
  onPreview: (variant: string, preview: string) => void;
  showArtifactColumn?: boolean;
};

function variantName(row: VariantRow): string {
  return typeof row.variant === "string" ? row.variant : "-";
}

function OcrVariantMobileCard({
  row,
  isWinner,
  preprocessMode,
  cropLabel,
  formatQualityMetrics,
  artifactUrl,
  onPreview,
  showArtifactColumn,
}: {
  row: VariantRow;
  isWinner: boolean;
  preprocessMode: "active" | "shadow";
  cropLabel: string;
  formatQualityMetrics: (metrics: unknown) => string;
  artifactUrl: string | null;
  onPreview: () => void;
  showArtifactColumn: boolean;
}) {
  const name = variantName(row);
  const preview = typeof row.raw_text_preview === "string" ? row.raw_text_preview : "-";

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-white">{name}</span>
        {isWinner ? (
          <Badge>{preprocessMode === "shadow" ? "mejor shadow" : "usada por pipeline"}</Badge>
        ) : null}
        {row.shadow_only ? <Badge variant="outline">shadow_only</Badge> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
        <p>mode: {String(row.mode ?? (preprocessMode === "shadow" ? "shadow" : "active"))}</p>
        <p>score: {typeof row.score === "number" ? row.score.toFixed(4) : "-"}</p>
        <p>chars: {typeof row.chars === "number" ? row.chars : "-"}</p>
        <p>elapsed: {typeof row.elapsed_ms === "number" ? `${row.elapsed_ms}ms` : "-"}</p>
      </div>
      <p className="mt-2 line-clamp-3 text-xs text-slate-200" title={preview}>
        {preview}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onPreview}>
          Ver texto completo
        </Button>
        {showArtifactColumn && artifactUrl ? (
          <a href={artifactUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs text-cyan-200 underline">
            Ver artefacto
          </a>
        ) : null}
      </div>
      <p className="mt-2 truncate text-[11px] text-slate-500" title={formatQualityMetrics(row.quality_metrics)}>
        quality: {formatQualityMetrics(row.quality_metrics)}
      </p>
      {typeof row.ocr_skipped_reason === "string" && row.ocr_skipped_reason ? (
        <p className="mt-1 text-[11px] text-amber-200">skip: {row.ocr_skipped_reason}</p>
      ) : null}
      <p className="sr-only">{cropLabel}</p>
    </div>
  );
}

export function OcrVariantRows({
  variants,
  displayedWinner,
  preprocessMode,
  cropLabel,
  formatQualityMetrics,
  getArtifactUrl,
  onPreview,
  showArtifactColumn = true,
}: OcrVariantRowsProps) {
  if (!variants.length) return null;

  return (
    <>
      <div className="space-y-2 md:hidden">
        {variants.map((row, idx) => {
          const name = variantName(row);
          const artifactUrl = getArtifactUrl(row);
          return (
            <OcrVariantMobileCard
              key={`variant-mobile-${cropLabel}-${idx}`}
              row={row}
              isWinner={name === displayedWinner}
              preprocessMode={preprocessMode}
              cropLabel={cropLabel}
              formatQualityMetrics={formatQualityMetrics}
              artifactUrl={artifactUrl}
              showArtifactColumn={showArtifactColumn}
              onPreview={() =>
                onPreview(
                  name,
                  typeof row.raw_text_preview === "string" ? row.raw_text_preview : "",
                )
              }
            />
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>variant</TableHead>
              <TableHead>mode</TableHead>
              <TableHead>score</TableHead>
              <TableHead>chars</TableHead>
              <TableHead>elapsed_ms</TableHead>
              <TableHead>quality</TableHead>
              <TableHead>skip</TableHead>
              <TableHead>preview</TableHead>
              {showArtifactColumn ? <TableHead>artefacto</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((row, idx) => {
              const artifact = getArtifactUrl(row);
              const name = variantName(row);
              const isWinner = name === displayedWinner;
              return (
                <TableRow key={`variant-table-${cropLabel}-${idx}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{name}</span>
                      {isWinner ? (
                        <Badge>{preprocessMode === "shadow" ? "mejor shadow" : "usada por pipeline"}</Badge>
                      ) : null}
                      {row.shadow_only ? <Badge variant="outline">shadow_only</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>{String(row.mode ?? (preprocessMode === "shadow" ? "shadow" : "active"))}</TableCell>
                  <TableCell>{typeof row.score === "number" ? row.score.toFixed(4) : "-"}</TableCell>
                  <TableCell>{typeof row.chars === "number" ? row.chars : "-"}</TableCell>
                  <TableCell>{typeof row.elapsed_ms === "number" ? row.elapsed_ms : "-"}</TableCell>
                  <TableCell className="max-w-72 truncate" title={formatQualityMetrics(row.quality_metrics)}>
                    {formatQualityMetrics(row.quality_metrics)}
                  </TableCell>
                  <TableCell className="max-w-72 truncate" title={typeof row.ocr_skipped_reason === "string" ? row.ocr_skipped_reason : ""}>
                    {typeof row.ocr_skipped_reason === "string" ? row.ocr_skipped_reason : "-"}
                  </TableCell>
                  <TableCell className="max-w-80">
                    <div className="space-y-2">
                      <p className="truncate" title={typeof row.raw_text_preview === "string" ? row.raw_text_preview : ""}>
                        {typeof row.raw_text_preview === "string" ? row.raw_text_preview : "-"}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onPreview(
                            name,
                            typeof row.raw_text_preview === "string" ? row.raw_text_preview : "",
                          )
                        }
                      >
                        Ver texto completo
                      </Button>
                    </div>
                  </TableCell>
                  {showArtifactColumn ? (
                    <TableCell>
                      {artifact ? (
                        <a href={artifact} target="_blank" rel="noreferrer" className="text-cyan-200 underline">
                          Ver
                        </a>
                      ) : (
                        <span className="text-muted-foreground">sin artefacto</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function SupportMemorySummaryRows({
  rows,
}: {
  rows: Array<{
    key: string;
    crop: ReactNode;
    memoryLabel: ReactNode;
    labelConf: ReactNode;
    rawText: ReactNode;
  }>;
}) {
  if (!rows.length) return null;

  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <div key={`memory-summary-mobile-${row.key}`} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
            <p className="font-semibold text-white">{row.crop}</p>
            <p className="mt-1 text-xs text-slate-300">memory: {row.memoryLabel}</p>
            <p className="mt-1 text-xs text-slate-300">{row.labelConf}</p>
            <div className="mt-2">{row.rawText}</div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>crop</TableHead>
              <TableHead>memory_label</TableHead>
              <TableHead>label/conf</TableHead>
              <TableHead>raw_text</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`memory-summary-table-${row.key}`}>
                <TableCell className="max-w-52 truncate">{row.crop}</TableCell>
                <TableCell>{row.memoryLabel}</TableCell>
                <TableCell>{row.labelConf}</TableCell>
                <TableCell className="max-w-96">{row.rawText}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}