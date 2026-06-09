"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ocrApi } from "@/lib/ocrApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  account: string;
  onUploadSuccess?: () => void;
  bulkData: Record<string, unknown>[];
};

/**
 * Safety component to prevent accidental SKU database deletion
 * Verifies existing SKU count before and after upload
 */
export function ShelfSkuUploadSafeguard({ account, onUploadSuccess, bulkData }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [agreedToNoDelete, setAgreedToNoDelete] = useState(false);

  const skusBeforeQuery = useQuery({
    queryKey: ["shelf-skus-count-before", account],
    queryFn: async () => {
      const skus = await ocrApi.listShelfSkus(account, 1000);
      return skus.length;
    },
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!bulkData.length) throw new Error("No hay datos para cargar");

      const skusBefore = skusBeforeQuery.data ?? 0;
      const result = await ocrApi.seedShelfSkus(account, bulkData);

      // Safety check: verify that SKUs weren't deleted
      const skusAfter = await ocrApi.listShelfSkus(account, 1000);
      const skusAfterCount = skusAfter.length;

      if (skusAfterCount < skusBefore) {
        const deleted = skusBefore - skusAfterCount;
        throw new Error(
          `⚠️ ALERTA: Se perdieron ${deleted} SKUs durante la carga. La operación NO fue completada correctamente. Contacta al soporte.`,
        );
      }

      return { result, skusBefore, skusAfter: skusAfterCount };
    },
    onSuccess: (data) => {
      toast.success("✅ Carga completada sin pérdida de datos", {
        description: `SKUs antes: ${data.skusBefore} → después: ${data.skusAfter}`,
      });
      onUploadSuccess?.();
      setConfirmed(false);
      setAgreedToNoDelete(false);
    },
    onError: (error) => {
      toast.error("Error en la carga de SKUs", {
        description: error instanceof Error ? error.message : "Error inesperado",
      });
    },
  });

  const skuCountBefore = skusBeforeQuery.data ?? 0;

  if (skusBeforeQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="text-center text-white/60">Verificando SKUs existentes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-yellow-500/30 bg-yellow-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-200">
            <AlertTriangle className="h-5 w-5" />
            Protección contra pérdida de datos
          </CardTitle>
          <CardDescription className="text-yellow-300/80">
            Este sistema verifica que los SKUs existentes NO se borren durante la carga
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded border border-yellow-500/50 bg-yellow-950/30 p-3">
            <p className="text-sm font-semibold text-yellow-200">Estado Actual:</p>
            <p className="text-2xl font-bold text-yellow-100">{skuCountBefore} SKUs en la base</p>
            <p className="text-xs text-yellow-300/60 mt-2">
              Tras cargar {bulkData.length} nuevos registros, esta cantidad NO debería disminuir
            </p>
          </div>

          {/* Safeguard Checkboxes */}
          <div className="space-y-3 rounded border border-white/10 bg-white/3 p-4">
            <div className="flex items-start gap-3">
              <input
                id="agree-no-delete"
                type="checkbox"
                checked={agreedToNoDelete}
                onChange={(e) => setAgreedToNoDelete(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/30 bg-white/5 accent-blue-500"
              />
              <label htmlFor="agree-no-delete" className="text-sm cursor-pointer flex-1">
                <span className="font-semibold">Confirmo que esta carga DEBE actualizar y NUNCA borrar</span>
                <p className="text-xs text-white/60 mt-1">
                  Si los {skuCountBefore} SKUs actuales se pierden, considera que fue un fallo crítico
                </p>
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input
                id="confirm-upload"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/30 bg-white/5 accent-blue-500"
              />
              <label htmlFor="confirm-upload" className="text-sm cursor-pointer flex-1">
                <span className="font-semibold">Confirmo que deseo proceder con la carga</span>
              </label>
            </div>
          </div>

          {/* Upload Button */}
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!confirmed || !agreedToNoDelete || uploadMutation.isPending}
            className="w-full gap-2"
            size="lg"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando y verificando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Proceder con Carga Segura
              </>
            )}
          </Button>

          {/* Info Box */}
          <div className="rounded border border-blue-500/30 bg-blue-950/20 p-3 text-sm text-blue-200">
            <p className="font-semibold">ℹ️ Cómo funciona:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-xs">
              <li>Se verifica el count de SKUs actual: {skuCountBefore}</li>
              <li>Se cargan {bulkData.length} registros nuevos/actualizados</li>
              <li>Se verifica nuevamente el count de SKUs</li>
              <li>Si el count disminuye, la operación se considera fallida (alerta crítica)</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
