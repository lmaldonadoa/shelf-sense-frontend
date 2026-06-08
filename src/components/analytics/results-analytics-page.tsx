"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { HttpError, ocrApi } from "@/lib/ocrApi";
import type { AnalyticsExportRequest, AnalyticsResultsQueryRequest } from "@/types/ocr-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function csvToList(value: string): string[] {
  return value.split(",").map((x) => x.trim()).filter(Boolean);
}

const extraOptions = [
  "descripcion_etiqueta",
  "tipo_contenedor",
  "text_semantic_rag_titles",
  "measure_noise_corrections",
  "barcode_candidates",
];

const defaultColumns = [
  "account_name",
  "cadena_detectada",
  "producto",
  "precio_base",
  "precio_promocion",
  "tamano",
  "periodo_vigencia",
  "codigo_interno",
  "barcode",
];

export function ResultsAnalyticsPage() {
  const [filters, setFilters] = useState({
    account_name: "colgate_ecuador",
    country: "",
    chains: "",
    categories: "",
    activities: "",
    promotion_types: "",
    products: "",
    barcodes: "",
    query: "",
    created_from: "",
    created_to: "",
    limit_jobs: "500",
    limit: "100",
    offset: "0",
  });
  const [extraFields, setExtraFields] = useState<string[]>(["text_semantic_rag_titles", "measure_noise_corrections"]);
  const [includeCodeColumns, setIncludeCodeColumns] = useState(true);
  const [filename, setFilename] = useState("reporte_analytics.xlsx");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(defaultColumns);
  const [runKey, setRunKey] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showFacetsRaw, setShowFacetsRaw] = useState(false);

  const payload = useMemo<AnalyticsResultsQueryRequest>(() => ({
    account_name: filters.account_name || null,
    country: filters.country || null,
    chains: csvToList(filters.chains),
    categories: csvToList(filters.categories),
    activities: csvToList(filters.activities),
    promotion_types: csvToList(filters.promotion_types),
    products: csvToList(filters.products),
    barcodes: csvToList(filters.barcodes),
    query: filters.query || null,
    created_from: filters.created_from || null,
    created_to: filters.created_to || null,
    limit_jobs: Number(filters.limit_jobs || 500),
    limit: Number(filters.limit || 100),
    offset: Number(filters.offset || 0),
    job_ids: [],
    include_raw_product: false,
  }), [filters]);

  const query = useQuery({
    queryKey: ["analytics-results", runKey, payload],
    queryFn: () => ocrApi.queryAnalyticsResults(payload),
    enabled: runKey > 0,
  });

  const facets = useQuery({
    queryKey: ["analytics-facets", payload.account_name, payload.country, payload.query],
    queryFn: () => ocrApi.getAnalyticsFacets(payload),
    enabled: runKey > 0,
  });

  const exportMutation = useMutation({
    mutationFn: (exportPayload: AnalyticsExportRequest) => ocrApi.exportAnalyticsResults(exportPayload),
    onSuccess: (data) => {
      toast.success("Excel generado", { description: `${data.rows} filas` });
      if (data.excel_url) window.open(data.excel_url, "_blank", "noopener,noreferrer");
    },
    onError: (error) => toast.error("Error exportando", { description: error instanceof HttpError ? error.message : "Error inesperado" }),
  });

  const items = query.data?.items ?? [];
  const columns = useMemo(() => {
    const first = items[0] ?? {};
    return Object.keys(first);
  }, [items]);

  function toggleListValue(setter: React.Dispatch<React.SetStateAction<string[]>>, current: string[], value: string) {
    if (current.includes(value)) setter(current.filter((x) => x !== value));
    else setter([...current, value]);
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Analytics de Resultados IA</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2"><Label>account_name</Label><Input value={filters.account_name} onChange={(e) => setFilters((p) => ({ ...p, account_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>query libre</Label><Input value={filters.query} onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))} placeholder="ej: blendax, fortident..." /></div>
            <div className="space-y-2"><Label>chains (csv)</Label><Input value={filters.chains} onChange={(e) => setFilters((p) => ({ ...p, chains: e.target.value }))} placeholder="Mi Comisariato, AKI" /></div>
            <div className="space-y-2"><Label>categories (csv)</Label><Input value={filters.categories} onChange={(e) => setFilters((p) => ({ ...p, categories: e.target.value }))} /></div>
            <div className="space-y-2"><Label>created_from</Label><Input type="date" value={filters.created_from} onChange={(e) => setFilters((p) => ({ ...p, created_from: e.target.value }))} /></div>
            <div className="space-y-2"><Label>created_to</Label><Input type="date" value={filters.created_to} onChange={(e) => setFilters((p) => ({ ...p, created_to: e.target.value }))} /></div>
            <div className="space-y-2"><Label>limit</Label><Input value={filters.limit} onChange={(e) => setFilters((p) => ({ ...p, limit: e.target.value }))} /></div>
            <div className="flex items-end gap-2">
              <Button onClick={() => setRunKey((x) => x + 1)} className="w-full"><Search className="mr-2 h-4 w-4" />Consultar</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowAdvancedFilters((v) => !v)}>
              {showAdvancedFilters ? "Ocultar filtros avanzados" : "Mostrar filtros avanzados"}
            </Button>
          </div>
          {showAdvancedFilters ? (
            <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-3 md:grid-cols-4">
              <div className="space-y-2"><Label>country</Label><Input value={filters.country} onChange={(e) => setFilters((p) => ({ ...p, country: e.target.value }))} /></div>
              <div className="space-y-2"><Label>activities (csv)</Label><Input value={filters.activities} onChange={(e) => setFilters((p) => ({ ...p, activities: e.target.value }))} /></div>
              <div className="space-y-2"><Label>promotion_types (csv)</Label><Input value={filters.promotion_types} onChange={(e) => setFilters((p) => ({ ...p, promotion_types: e.target.value }))} /></div>
              <div className="space-y-2"><Label>products (csv)</Label><Input value={filters.products} onChange={(e) => setFilters((p) => ({ ...p, products: e.target.value }))} /></div>
              <div className="space-y-2"><Label>barcodes (csv)</Label><Input value={filters.barcodes} onChange={(e) => setFilters((p) => ({ ...p, barcodes: e.target.value }))} /></div>
              <div className="space-y-2"><Label>limit_jobs</Label><Input value={filters.limit_jobs} onChange={(e) => setFilters((p) => ({ ...p, limit_jobs: e.target.value }))} /></div>
              <div className="space-y-2"><Label>offset</Label><Input value={filters.offset} onChange={(e) => setFilters((p) => ({ ...p, offset: e.target.value }))} /></div>
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            {query.isFetching ? "Consultando resultados..." : query.data ? `Mostrando ${query.data.pagination.returned} de ${query.data.pagination.total}` : "Aún no hay consulta."}
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Resumen</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">rows</p><p>{query.data?.summary.total_rows ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">jobs</p><p>{query.data?.summary.total_jobs ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">barcodes</p><p>{query.data?.summary.total_barcodes ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">chains</p><p>{query.data?.summary.total_chains ?? 0}</p></div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Facets rápidos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowFacetsRaw((v) => !v)}>
            {showFacetsRaw ? "Ocultar JSON" : "Ver JSON"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-slate-300">
          <p>chains: {(facets.data?.facets.chains ?? []).slice(0, 8).join(", ") || "-"}</p>
          <p>categories: {(facets.data?.facets.categories ?? []).slice(0, 8).join(", ") || "-"}</p>
          <p>promotion_types: {(facets.data?.facets.promotion_types ?? []).slice(0, 8).join(", ") || "-"}</p>
          {showFacetsRaw ? (
            <pre className="max-h-44 overflow-auto rounded-md border border-white/10 bg-black/20 p-3">{JSON.stringify(facets.data?.facets ?? {}, null, 2)}</pre>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Exportar Excel</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2"><Label>filename</Label><Input value={filename} onChange={(e) => setFilename(e.target.value)} /></div>
            <div className="space-y-2">
              <Label>include_code_columns</Label>
              <select className="h-10 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm" value={includeCodeColumns ? "1" : "0"} onChange={(e) => setIncludeCodeColumns(e.target.value === "1")}>
                <option value="1">true</option>
                <option value="0">false</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Presets</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedColumns(defaultColumns)}>Base</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedColumns(Array.from(new Set([...defaultColumns, ...extraOptions])))}>Base + extras</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setExtraFields([])}>Limpiar extras</Button>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <Label>Columnas base (activas por defecto)</Label>
            <div className="flex flex-wrap gap-2">
              {defaultColumns.map((col) => {
                const active = selectedColumns.includes(col);
                return (
                  <button
                    key={`base-col-${col}`}
                    type="button"
                    onClick={() => toggleListValue(setSelectedColumns, selectedColumns, col)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                      active
                        ? "border-cyan-300/40 bg-cyan-500/20 text-cyan-100"
                        : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                    {col}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
            <Label>Campos extra opcionales</Label>
            <div className="flex flex-wrap gap-2">
              {extraOptions.map((field) => {
                const active = extraFields.includes(field);
                return (
                  <button
                    key={`extra-field-${field}`}
                    type="button"
                    onClick={() => toggleListValue(setExtraFields, extraFields, field)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                      active
                        ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
                        : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                    {field}
                  </button>
                );
              })}
            </div>
          </div>
          <Button
            onClick={() => exportMutation.mutate({ ...payload, columns: selectedColumns, extra_fields: extraFields, include_code_columns: includeCodeColumns, filename })}
            disabled={exportMutation.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur">
        <CardHeader><CardTitle>Tabla</CardTitle></CardHeader>
        <CardContent>
          {query.error instanceof HttpError ? <p className="text-sm text-rose-300">Error: {query.error.detail}</p> : null}
          {!items.length ? (
            <p className="text-sm text-muted-foreground">{query.isFetching ? "Consultando..." : "Sin resultados."}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => <TableHead key={col}>{col}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row, idx) => (
                    <TableRow key={`r-${idx}`}>
                      {columns.map((col) => (
                        <TableCell key={`${idx}-${col}`} className="max-w-72 truncate">
                          {typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col] ?? "-")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
