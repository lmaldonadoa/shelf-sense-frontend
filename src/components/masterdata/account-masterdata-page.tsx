"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type {
  CanonicalField,
  FieldMapping,
  MasterdataAiMapResponse,
  MasterdataConfirmMapResponse,
  MasterdataImportBatch,
  MasterdataPreviewMappedRow,
  MasterdataUploadResponse,
} from "@/types/ocr-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CANONICAL_FIELDS: CanonicalField[] = [
  "company_name",
  "brand_name",
  "brand_aliases",
  "product_family",
  "variant",
  "size_text",
  "size_value",
  "size_unit",
  "barcode",
  "category",
  "country",
  "notes",
];

type Props = { account: string };

function batchBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "imported") return <Badge>imported</Badge>;
  if (s === "importing") return <Badge variant="secondary">importing</Badge>;
  if (s === "validated") return <Badge variant="secondary">validated</Badge>;
  if (s === "mapped") return <Badge variant="secondary">mapped</Badge>;
  if (s === "uploaded") return <Badge variant="outline">uploaded</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function defaultMapping(): FieldMapping {
  return {
    company_name: null,
    brand_name: null,
    brand_aliases: null,
    product_family: null,
    variant: null,
    size_text: null,
    size_value: null,
    size_unit: null,
    barcode: null,
    category: null,
    country: null,
    notes: null,
  };
}

function getBatchPreview(resp: unknown): Record<string, unknown> {
  if (!resp || typeof resp !== "object") return {};
  const row = resp as Record<string, unknown>;
  const nested = row.batch && typeof row.batch === "object" ? (row.batch as Record<string, unknown>) : null;
  return (nested?.preview && typeof nested.preview === "object" ? (nested.preview as Record<string, unknown>) : null) ??
    (row.preview && typeof row.preview === "object" ? (row.preview as Record<string, unknown>) : null) ??
    {};
}

function getBatchMapping(resp: unknown): Record<string, unknown> {
  if (!resp || typeof resp !== "object") return {};
  const row = resp as Record<string, unknown>;
  const nested = row.batch && typeof row.batch === "object" ? (row.batch as Record<string, unknown>) : null;
  return (nested?.mapping && typeof nested.mapping === "object" ? (nested.mapping as Record<string, unknown>) : null) ??
    (row.mapping && typeof row.mapping === "object" ? (row.mapping as Record<string, unknown>) : null) ??
    {};
}

function getBatchSummary(resp: unknown): Record<string, unknown> {
  if (!resp || typeof resp !== "object") return {};
  const row = resp as Record<string, unknown>;
  const nested = row.batch && typeof row.batch === "object" ? (row.batch as Record<string, unknown>) : null;
  return (nested?.summary && typeof nested.summary === "object" ? (nested.summary as Record<string, unknown>) : null) ??
    (row.summary && typeof row.summary === "object" ? (row.summary as Record<string, unknown>) : null) ??
    {};
}

export function AccountMasterdataPage({ account }: Props) {
  const [activeTab, setActiveTab] = useState<"imports" | "new" | "mapping" | "result" | "catalog">("imports");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [sampleRows, setSampleRows] = useState("25");
  const [createdBy, setCreatedBy] = useState("");
  const [maxRows, setMaxRows] = useState("50000");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [mapping, setMapping] = useState<FieldMapping>(defaultMapping());
  const [mappingTouched, setMappingTouched] = useState(false);
  const [mappingHydratedBatchId, setMappingHydratedBatchId] = useState<number | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<MasterdataAiMapResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<MasterdataConfirmMapResponse | null>(null);
  const [rowStatusFilter, setRowStatusFilter] = useState<"all" | "valid" | "invalid">("all");
  const [rowErrorFilter, setRowErrorFilter] = useState("");
  const [catalogBrand, setCatalogBrand] = useState("");
  const [catalogFamily, setCatalogFamily] = useState("");
  const [catalogLimit, setCatalogLimit] = useState("300");

  const importsQuery = useQuery({
    queryKey: ["masterdata-imports", account],
    queryFn: () => ocrApi.listMasterdataImports(account, 50),
  });

  const selectedBatchQuery = useQuery({
    queryKey: ["masterdata-import-detail", account, selectedBatchId],
    enabled: Boolean(selectedBatchId),
    queryFn: () => ocrApi.getMasterdataImportDetail(account, Number(selectedBatchId)),
  });

  const rowsQuery = useQuery({
    queryKey: ["masterdata-import-rows", account, selectedBatchId],
    enabled: Boolean(selectedBatchId) && activeTab === "result",
    queryFn: () => ocrApi.listMasterdataImportRows(account, Number(selectedBatchId), 200),
  });

  const brandsQuery = useQuery({
    queryKey: ["masterdata-brands", account],
    queryFn: () => ocrApi.listMasterdataBrands(account, 300),
    enabled: activeTab === "catalog" || activeTab === "mapping",
  });

  const familiesQuery = useQuery({
    queryKey: ["masterdata-families", account, catalogBrand],
    queryFn: () => ocrApi.listMasterdataFamilies(account, { brand: catalogBrand || undefined, limit: 500 }),
    enabled: activeTab === "catalog",
  });

  const variantsQuery = useQuery({
    queryKey: ["masterdata-variants", account, catalogBrand, catalogFamily],
    queryFn: () => ocrApi.listMasterdataVariants(account, { brand: catalogBrand || undefined, family: catalogFamily || undefined, limit: 500 }),
    enabled: activeTab === "catalog",
  });

  const catalogQuery = useQuery({
    queryKey: ["masterdata-catalog", account, catalogBrand, catalogFamily, catalogLimit],
    queryFn: () => ocrApi.listMasterdataCatalog(account, { brand: catalogBrand || undefined, family: catalogFamily || undefined, limit: Number(catalogLimit) || 300 }),
    enabled: activeTab === "catalog",
  });

  const uploadMutation = useMutation({
    mutationFn: () =>
      ocrApi.uploadMasterdataImport(account, {
        file: uploadFile as File,
        createdBy: createdBy || undefined,
        sheetName: sheetName || undefined,
        sampleRows: Number(sampleRows) || 25,
      }),
    onSuccess: (data: MasterdataUploadResponse) => {
      setSelectedBatchId(data.batch_id);
      setActiveTab("mapping");
      setConfirmResult(null);
      setAiSuggestion(null);
      setMapping(defaultMapping());
      setMappingTouched(false);
      setMappingHydratedBatchId(null);
      importsQuery.refetch();
      selectedBatchQuery.refetch();
      toast.success("Archivo cargado", { description: `Batch #${data.batch_id}` });
    },
    onError: (error) => {
      toast.error("Error cargando archivo", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
    },
  });

  const aiMapMutation = useMutation({
    mutationFn: () => {
      const payload = {
        sheet_name: sheetName || undefined,
        target_schema: "catalog_v1",
        model: "qwen3:8b",
      };
      console.debug("[masterdata] POST ai-map payload", { account, batchId: selectedBatchId, payload });
      return ocrApi.getMasterdataAiMapSuggestion(account, Number(selectedBatchId), payload);
    },
    onSuccess: (data) => {
      console.debug("[masterdata] POST ai-map response", data);
      setAiSuggestion(data);
      const next = { ...defaultMapping(), ...mapping };
      for (const key of CANONICAL_FIELDS) {
        const v = data.suggested_mapping.mapping[key];
        if (typeof v === "string" && v.trim()) next[key] = v;
      }
      setMapping(next);
      setMappingTouched(true);
      selectedBatchQuery.refetch();
      importsQuery.refetch();
      const nonEmptyKeys = Object.entries(data.suggested_mapping.mapping ?? {})
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key]) => key);
      console.debug("[masterdata] mapping keys with value", nonEmptyKeys);
      toast.success("Sugerencia IA aplicada", { description: `Confianza: ${(Number(data.suggested_mapping.confidence ?? 0) * 100).toFixed(1)}%` });
    },
    onError: (error) => {
      toast.error("No se pudo generar AI map", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      ocrApi.confirmMasterdataMapping(account, Number(selectedBatchId), {
        mapping,
        sheet_name: sheetName || undefined,
        dry_run: dryRun,
        created_by: createdBy || undefined,
        max_rows: Math.min(100000, Math.max(1, Number(maxRows) || 50000)),
      }),
    onSuccess: (data) => {
      setConfirmResult(data);
      setActiveTab("result");
      selectedBatchQuery.refetch();
      importsQuery.refetch();
      const invalidRows = Number(data.summary.invalid_rows ?? 0);
      const msg = data.summary.dry_run ? "Dry-run completado" : "Import definitivo completado";
      toast.success(msg, { description: invalidRows > 0 ? `Filas inválidas: ${invalidRows}` : "Sin errores de validación." });
    },
    onError: (error) => {
      toast.error("No se pudo confirmar mapeo", { description: error instanceof HttpError ? error.detail : "Error inesperado" });
    },
  });

  const currentHeaders = useMemo(() => {
    const preview = getBatchPreview(selectedBatchQuery.data);
    const h = preview.headers;
    return Array.isArray(h) ? h.map((x) => String(x)) : [];
  }, [selectedBatchQuery.data]);

  const previewRows = useMemo(() => {
    const preview = getBatchPreview(selectedBatchQuery.data);
    const rows = preview.sample_rows;
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }, [selectedBatchQuery.data]);

  const mergedRows = useMemo(() => {
    const source = confirmResult?.preview_mapped_rows?.length ? confirmResult.preview_mapped_rows : rowsQuery.data ?? [];
    return source.filter((row) => {
      if (rowStatusFilter !== "all" && row.status !== rowStatusFilter) return false;
      if (rowErrorFilter.trim()) {
        const text = row.errors.join(" ").toLowerCase();
        return text.includes(rowErrorFilter.trim().toLowerCase());
      }
      return true;
    });
  }, [confirmResult?.preview_mapped_rows, rowErrorFilter, rowStatusFilter, rowsQuery.data]);

  const invalidRows = Number(confirmResult?.summary.invalid_rows ?? 0);
  const maxRowsValue = Number(maxRows) || 0;
  const canImport = Boolean(mapping.brand_name && mapping.product_family && maxRowsValue > 0 && maxRowsValue <= 100000);

  useEffect(() => {
    const currentBatchId = Number(selectedBatchQuery.data?.batch_id ?? selectedBatchQuery.data?.id ?? selectedBatchId ?? 0) || null;
    if (!currentBatchId) return;
    if (mappingTouched && mappingHydratedBatchId === currentBatchId) return;
    if (mappingHydratedBatchId === currentBatchId) return;
    const persisted = getBatchMapping(selectedBatchQuery.data);
    if (!persisted || typeof persisted !== "object") return;
    const next = defaultMapping();
    for (const field of CANONICAL_FIELDS) {
      const v = (persisted as Record<string, unknown>)[field];
      next[field] = typeof v === "string" && v.trim() ? v : null;
    }
    setMapping(next);
    setMappingHydratedBatchId(currentBatchId);
  }, [mappingHydratedBatchId, mappingTouched, selectedBatchId, selectedBatchQuery.data]);

  useEffect(() => {
    if (!selectedBatchQuery.data) return;
    const headers = currentHeaders;
    console.debug("[masterdata] GET detail payload", selectedBatchQuery.data);
    console.debug("[masterdata] headers detected", { count: headers.length, first5: headers.slice(0, 5) });
    console.debug("[masterdata] batch summary", getBatchSummary(selectedBatchQuery.data));
  }, [currentHeaders, selectedBatchQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant={activeTab === "imports" ? "default" : "outline"} onClick={() => setActiveTab("imports")}>Masterdata Imports</Button>
        <Button variant={activeTab === "new" ? "default" : "outline"} onClick={() => setActiveTab("new")}>Nuevo Import</Button>
        <Button variant={activeTab === "mapping" ? "default" : "outline"} onClick={() => setActiveTab("mapping")} disabled={!selectedBatchId}>Asistente de Mapeo</Button>
        <Button variant={activeTab === "result" ? "default" : "outline"} onClick={() => setActiveTab("result")} disabled={!selectedBatchId}>Resultado</Button>
        <Button variant={activeTab === "catalog" ? "default" : "outline"} onClick={() => setActiveTab("catalog")}>Masterdata Catalog</Button>
      </div>

      {activeTab === "imports" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Masterdata Imports</CardTitle>
            <Button variant="outline" onClick={() => importsQuery.refetch()}><RefreshCcw className="mr-2 h-4 w-4" />Refrescar</Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>batch_id</TableHead>
                    <TableHead>source_filename</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead>created_at</TableHead>
                    <TableHead>updated_at</TableHead>
                    <TableHead>created_by</TableHead>
                    <TableHead>summary</TableHead>
                    <TableHead>acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(importsQuery.data ?? []).map((row: MasterdataImportBatch) => (
                    <TableRow key={`import-${row.id}`}>
                      <TableCell>{row.batch_id ?? row.id}</TableCell>
                      <TableCell>{row.source_filename ?? "-"}</TableCell>
                      <TableCell>{batchBadge(row.status)}</TableCell>
                      <TableCell>{row.created_at ?? "-"}</TableCell>
                      <TableCell>{row.updated_at ?? "-"}</TableCell>
                      <TableCell>{row.created_by ?? "-"}</TableCell>
                      <TableCell className="max-w-72 truncate">{row.summary ? JSON.stringify(row.summary) : "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedBatchId(row.batch_id ?? row.id); setActiveTab("mapping"); }}>Ver detalle</Button>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedBatchId(row.batch_id ?? row.id); aiMapMutation.mutate(); }}>Reintentar AI Map</Button>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedBatchId(row.batch_id ?? row.id); setActiveTab("mapping"); }}>Continuar mapeo</Button>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedBatchId(row.batch_id ?? row.id); setActiveTab("result"); }}>Ver filas</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "new" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Nuevo Import</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Archivo (.csv, .xlsx, .xlsm)</Label>
                <Input type="file" accept=".csv,.xlsx,.xlsm" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                {uploadFile && uploadFile.size > 30 * 1024 * 1024 ? <p className="text-sm text-amber-300">Advertencia: archivo mayor a 30MB (límite backend).</p> : null}
              </div>
              <div className="space-y-2">
                <Label>Sheet name (opcional)</Label>
                <Input value={sheetName} onChange={(e) => setSheetName(e.target.value)} placeholder="Hoja1" />
              </div>
              <div className="space-y-2">
                <Label>Sample rows</Label>
                <Input value={sampleRows} onChange={(e) => setSampleRows(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Created by</Label>
                <Input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
              </div>
            </div>
            <Button disabled={!uploadFile || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
              {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Subir y previsualizar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "mapping" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Asistente de Mapeo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!selectedBatchId ? <p className="text-sm text-muted-foreground">Selecciona un batch desde Imports o sube uno nuevo.</p> : null}
            {selectedBatchId ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => selectedBatchQuery.refetch()}><RefreshCcw className="mr-2 h-4 w-4" />Refrescar lote</Button>
                  <Button onClick={() => aiMapMutation.mutate()} disabled={aiMapMutation.isPending}>
                    {aiMapMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sugerir con IA
                  </Button>
                </div>
                {aiSuggestion ? (
                  <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm">
                    <p>strategy: {aiSuggestion.suggested_mapping.strategy ?? "-"}</p>
                    <p>confidence: {((Number(aiSuggestion.suggested_mapping.confidence ?? 0) || 0) * 100).toFixed(1)}%</p>
                    <p>model: {aiSuggestion.suggested_mapping.model ?? "-"}</p>
                    <p>notes: {(aiSuggestion.suggested_mapping.notes ?? []).join(" | ") || "-"}</p>
                  </div>
                ) : null}

                <div className="grid gap-2 md:grid-cols-2">
                  {CANONICAL_FIELDS.map((field) => (
                    <div key={field} className="space-y-1">
                      <Label>{field}</Label>
                      <select
                        className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm"
                        value={mapping[field] ?? ""}
                        onChange={(e) => {
                          setMappingTouched(true);
                          setMapping((prev) => ({ ...prev, [field]: e.target.value || null }));
                        }}
                      >
                        <option value="">(vacío)</option>
                        {currentHeaders.map((h) => <option key={`${field}-${h}`} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm">
                  <p className="font-semibold">Reglas de validación UI</p>
                  <p>- `brand_name` y `product_family` son obligatorios para continuar.</p>
                  <p>- `max_rows` limitado a 100000.</p>
                  <div className="mt-2 max-w-xs space-y-1">
                    <Label>max_rows</Label>
                    <Input value={maxRows} onChange={(e) => setMaxRows(e.target.value)} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => confirmMutation.mutate(true)}
                    disabled={!canImport || confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Validar (Dry Run)
                  </Button>
                  <Button
                    onClick={() => {
                      if (!window.confirm("¿Confirmas importación definitiva?")) return;
                      confirmMutation.mutate(false);
                    }}
                    disabled={!canImport || confirmMutation.isPending}
                  >
                    Importar definitivo
                  </Button>
                  {!canImport ? <p className="text-sm text-amber-300">Asigna brand_name y product_family para continuar.</p> : null}
                  {maxRowsValue > 100000 ? <p className="text-sm text-amber-300">max_rows debe ser menor o igual a 100000.</p> : null}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Preview del archivo</p>
                  <p className="text-xs text-muted-foreground">Headers detectados: {currentHeaders.join(", ") || "-"}</p>
                  {!currentHeaders.length ? <p className="text-sm text-amber-300">Este lote no tiene cabecera detectable. Revisa archivo o delimitador.</p> : null}
                  <div className="max-h-64 overflow-auto rounded-md border border-white/10">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {currentHeaders.map((h) => <TableHead key={`h-${h}`}>{h}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.slice(0, 10).map((row, idx) => (
                          <TableRow key={`sample-row-${idx}`}>
                            {currentHeaders.map((h) => <TableCell key={`sample-${idx}-${h}`}>{asText(row[h])}</TableCell>)}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "result" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Resultado Validación / Import</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {confirmResult?.summary ? (
              <div className="grid gap-3 sm:grid-cols-5">
                <div className="rounded-md border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">total_rows_read</p><p>{confirmResult.summary.total_rows_read ?? 0}</p></div>
                <div className="rounded-md border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">valid_rows</p><p>{confirmResult.summary.valid_rows ?? 0}</p></div>
                <div className="rounded-md border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">invalid_rows</p><p>{confirmResult.summary.invalid_rows ?? 0}</p></div>
                <div className="rounded-md border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">imported_rows</p><p>{confirmResult.summary.imported_rows ?? 0}</p></div>
                <div className="rounded-md border border-white/10 bg-black/20 p-2"><p className="text-xs text-muted-foreground">dry_run</p><p>{String(confirmResult.summary.dry_run ?? false)}</p></div>
              </div>
            ) : null}
            {invalidRows > 0 ? (
              <div className="rounded-md border border-amber-300/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                Hay {invalidRows} filas inválidas. Revisa errores antes de import definitivo.
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Filtro status</Label>
                <select className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm" value={rowStatusFilter} onChange={(e) => setRowStatusFilter(e.target.value as "all" | "valid" | "invalid")}>
                  <option value="all">all</option>
                  <option value="valid">valid</option>
                  <option value="invalid">invalid</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Filtro por texto de error</Label>
                <Input value={rowErrorFilter} onChange={(e) => setRowErrorFilter(e.target.value)} placeholder="ej: brand_name" />
              </div>
            </div>

            <div className="max-h-[600px] overflow-auto rounded-md border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>row_index</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead>errors</TableHead>
                    <TableHead>raw</TableHead>
                    <TableHead>mapped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mergedRows.map((row: MasterdataPreviewMappedRow) => (
                    <TableRow key={`mapped-row-${row.row_index}-${row.status}`}>
                      <TableCell>{row.row_index}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell className="max-w-96">{row.errors.join(" | ") || "-"}</TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer text-cyan-200">raw JSON</summary>
                          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(row.raw, null, 2)}</pre>
                        </details>
                      </TableCell>
                      <TableCell>
                        <details>
                          <summary className="cursor-pointer text-cyan-200">mapped JSON</summary>
                          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs">{JSON.stringify(row.mapped, null, 2)}</pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "catalog" ? (
        <Card className="border-white/10 bg-white/5">
          <CardHeader><CardTitle>Masterdata Catalog</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>brand</Label>
                <select className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm" value={catalogBrand} onChange={(e) => setCatalogBrand(e.target.value)}>
                  <option value="">(todos)</option>
                  {(brandsQuery.data ?? []).map((x) => <option key={`brand-${x}`} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>family</Label>
                <select className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm" value={catalogFamily} onChange={(e) => setCatalogFamily(e.target.value)}>
                  <option value="">(todas)</option>
                  {(familiesQuery.data ?? []).map((x) => <option key={`family-${x}`} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>limit</Label>
                <Input value={catalogLimit} onChange={(e) => setCatalogLimit(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>variants (referencia)</Label>
                <div className="h-9 overflow-hidden rounded-md border border-white/15 bg-black/20 px-2 text-xs leading-9 text-slate-300">
                  {(variantsQuery.data ?? []).slice(0, 6).join(", ") || "-"}
                </div>
              </div>
            </div>
            <div className="max-h-[640px] overflow-auto rounded-md border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>sku_name</TableHead>
                    <TableHead>company_name</TableHead>
                    <TableHead>brand_name</TableHead>
                    <TableHead>family_name</TableHead>
                    <TableHead>variant_name</TableHead>
                    <TableHead>size_text</TableHead>
                    <TableHead>size_value</TableHead>
                    <TableHead>size_unit</TableHead>
                    <TableHead>barcode</TableHead>
                    <TableHead>category</TableHead>
                    <TableHead>country</TableHead>
                    <TableHead>created_at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(catalogQuery.data ?? []).map((row, idx) => (
                    <TableRow key={`catalog-row-${idx}`}>
                      <TableCell>{asText(row.sku_name)}</TableCell>
                      <TableCell>{asText(row.company_name)}</TableCell>
                      <TableCell>{asText(row.brand_name)}</TableCell>
                      <TableCell>{asText(row.family_name)}</TableCell>
                      <TableCell>{asText(row.variant_name)}</TableCell>
                      <TableCell>{asText(row.size_text)}</TableCell>
                      <TableCell>{asText(row.size_value)}</TableCell>
                      <TableCell>{asText(row.size_unit)}</TableCell>
                      <TableCell>{asText(row.barcode)}</TableCell>
                      <TableCell>{asText(row.category)}</TableCell>
                      <TableCell>{asText(row.country)}</TableCell>
                      <TableCell>{asText(row.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
