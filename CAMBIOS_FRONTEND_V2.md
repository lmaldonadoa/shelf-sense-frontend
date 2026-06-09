# Cambios de Frontend - Configuración de Modelos y Protección de Datos

## Resumen General

Se han implementado **dos mejoras críticas**:

1. **Configuraciones independientes por modo** - Cada modo (Promociones, Shelf Promotions, Shelf SKU) tiene su propia configuración de modelos sin que se crucen entre sí
2. **Protección contra pérdida de datos en Shelf SKU** - Sistema de safeguard que verifica integridad antes/después de carga masiva

---

## 1. Sistema de Configuración Independiente por Modo

### Problema Resuelto
- Cambiar modelo en "Promociones" ya no afectaba "Shelf SKU"
- Las configuraciones se sincronizaban entre modos (comportamiento no deseado)
- Sin forma clara de tener "best" en promociones pero "best-seg" en shelf

### Archivos Nuevos

#### `src/lib/modelModeConfig.ts`
Librería de utilidades para gestionar configuraciones por modo:

```typescript
export type OperationMode = "promociones" | "shelf_promotions" | "shelf_sku";

export type ModeModelConfig = {
  ocr_model?: string;
  vision_model?: string;
  semantic_model?: string;
  custom_settings?: Record<string, unknown>;
};

// Funciones principales:
- getModeModelConfig(accountName, mode) → obtiene config guardada
- setModeModelConfig(accountName, mode, config) → guarda config
- clearModeModelConfig(accountName, mode) → borra config
- getAllModeConfigs(accountName) → todas las configs de la cuenta
- ensureModeConfigIsolation(accountName) → inicializa si es necesario
```

**Almacenamiento:** `localStorage` con clave: `ocr_mode_config_{accountName}_{mode}`

---

#### `src/components/settings/mode-model-config-page.tsx`
Componente UI para gestionar configuraciones por modo:

**Características:**
- Selector visual de 3 modos (tabs dinámicos)
- Para cada modo: campos para OCR, Vision, y Semantic model
- Protección contra cambios accidentales (pide confirmación si hay cambios sin guardar)
- Panel de estado mostrando qué modos tienen configuración
- Notas informativas específicas por modo

**Props:**
```typescript
type Props = { account: string };
```

**Ubicación recomendada:** 
Agregar en la página de Settings/Configuration con un tab nuevo llamado "Modelos por Modo"

---

### Integración

1. **Importar el componente en settings:**
```tsx
import { ModeModelConfigPage } from "@/components/settings/mode-model-config-page";
```

2. **Agregarlo a las tabs de settings:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Configuración Avanzada</CardTitle>
  </CardHeader>
  <CardContent>
    <ModeModelConfigPage account={account} />
  </CardContent>
</Card>
```

3. **Usar la configuración en el componente deseado:**
```tsx
import { getModeModelConfig } from "@/lib/modelModeConfig";

// En tu componente:
const modeConfig = getModeModelConfig(accountName, "shelf_sku");
const ocrModel = modeConfig.ocr_model ?? "glm-ocr"; // con fallback
```

---

## 2. Protección contra Pérdida de Datos - Shelf SKU

### Problema Resuelto
- Al cargar nueva base de SKUs, se perdían los SKUs anteriores
- Sin validación de integridad pre/post carga
- Usuarios sin aviso de que la operación fue destructiva

### Archivos Nuevos

#### `src/components/shelf/shelf-sku-upload-safeguard.tsx`
Componente que implementa safeguard de carga:

**Características:**
- Verifica cantidad de SKUs ANTES de carga
- Ejecuta carga masiva
- Verifica cantidad de SKUs DESPUÉS
- **Si disminuyen:** alerta crítica y NO continúa
- **Si se mantienen o aumentan:** operación validada como segura

**Props:**
```typescript
type Props = {
  account: string;
  onUploadSuccess?: () => void;  // callback cuando se completa
  bulkData: Record<string, unknown>[]; // datos a cargar
};
```

**Flow de usuario:**
1. Usuario ingresa JSON/CSV con nuevos SKUs
2. Hace click en "Crear lote (Protegido)"
3. Sistema muestra:
   - Cantidad actual de SKUs
   - Cantidad de registros a cargar
   - Dos checkboxes obligatorios de confirmación
4. Al confirmar:
   - Contador de SKUs: antes
   - Ejecuta seedShelfSkus()
   - Contador de SKUs: después
   - Valida que no haya disminución
   - Muestra resultado (✅ OK o ⚠️ ERROR)

---

### Cambios en `src/components/shelf/account-shelf-page.tsx`

**Imports agregados:**
```typescript
import { ShelfSkuUploadSafeguard } from "@/components/shelf/shelf-sku-upload-safeguard";
```

**States agregados:**
```typescript
const [bulkDataForUpload, setBulkDataForUpload] = useState<Record<string, unknown>[]>([]);
const [showBulkUploadSafeguard, setShowBulkUploadSafeguard] = useState(false);
```

**Cambios en botón de carga:**
- Antes: clic directo ejecutaba `bulkCreateMutation.mutate(rows)`
- Ahora: clic abre componente de protección primero
- Texto del botón cambió a "Crear lote (Protegido)"

**Integración en JSX:**
El componente de protección se renderiza en la sección de carga masiva, mostrando:
1. Alerta visual sobre protección
2. Estados actuales de SKUs
3. Checkboxes de confirmación
4. Botón para proceder (deshabilitado hasta confirmar)

---

## 3. Actualización de Tipos - `src/types/ocr-api.ts`

Se extendió `TextEnrichmentConfig` con nuevas propiedades:

```typescript
export type TextEnrichmentConfig = {
  // ... propiedades existentes ...
  
  // Nuevas propiedades agregadas:
  semantic_scope_guardrails?: {
    enabled?: boolean;
  };
  
  structured_shadow?: {
    enabled?: boolean;
    use_json_schema?: boolean;
    temperature?: number;
    timeout?: number;
    max_products?: number;
    include_raw_response?: boolean;
  };
  
  measure_noise_rules?: {
    enabled?: boolean;
    chains?: string[];
  };
  
  size_plausibility_guardrail?: {
    enabled?: boolean;
    subcategory_rules_extra?: Array<{
      keywords: string[];
      unit: string;
      min: number;
      max: number;
      note?: string;
    }>;
  };
  
  // ... resto de propiedades existentes ...
};
```

---

## 4. Actualización de API - `src/lib/ocrApi.ts`

### Métodos Agregados

#### `updatePipelineConfig(accountName, config)`
```typescript
updatePipelineConfig: async (
  accountName: string, 
  config: PipelineConfig
): Promise<ActiveConfigResponse>
```

Actualiza la configuración completa del pipeline. 

⚠️ **NOTA IMPORTANTE - ERROR ENCONTRADO:**
Actualmente envía `version: "1.0"` pero el backend rechaza este formato.
**Necesario corregir con información del backend sobre formato correcto de versión.**

---

## 5. Documentación de Training View (Cambios Previos)

Los cambios anteriores de Training View siguen vigentes:

### Nuevos Componentes de Training
- `src/components/training/semantic-config-page.tsx` - Configuración de text_enrichment
- `src/components/training/size-rules-page.tsx` - Reglas de tamaño por subcategoría
- `src/components/training/rag-effectiveness-page.tsx` - Métricas de RAG
- `src/components/quality/semantic-quality-badge.tsx` - Panel de calidad semántica

### Tabs Nuevas en Training View
- "Efectividad RAG" - ver métricas de reglas RAG
- "Config Semántica" - RAG, guardrails, shadow review, etc.
- "Reglas de Tamaño" - gestor de reglas por subcategoría

---

## Checklist de Implementación

- [ ] Copiar `modelModeConfig.ts` a `src/lib/`
- [ ] Copiar `mode-model-config-page.tsx` a `src/components/settings/`
- [ ] Copiar `shelf-sku-upload-safeguard.tsx` a `src/components/shelf/`
- [ ] Actualizar `account-shelf-page.tsx` con imports y cambios indicados
- [ ] Actualizar tipos en `ocr-api.ts`
- [ ] Actualizar métodos en `ocrApi.ts` (con fix de versión)
- [ ] Agregar tab de "Modelos por Modo" en Settings
- [ ] Probar aislamiento de configuraciones por modo
- [ ] Probar safeguard de Shelf SKU

---

## Notas Técnicas

### localStorage vs Database
Actualmente usa `localStorage` para configuraciones por modo. Si se requiere persistencia en backend:
- Crear tabla: `account_mode_model_configs(account_id, mode, config_json)`
- Reemplazar `localStorage` con endpoints API

### Validación de Configuración
Se recomienda validar que los modelos existan en:
- OCR: `glm-ocr`, otros modelos Ollama disponibles
- Vision: `gemma4:12b-it-qat`, `qwen-vl`, etc.
- Semantic: `qwen3:8b`, `qwen3:1.7b`, etc.

### Shelf SKU - Safeguard Límites
- Verifica SOLO cantidad de SKUs, no contenido
- Para validación más estricta (checksums, campos críticos), extender `ShelfSkuUploadSafeguard`

---

## Próximos Pasos

1. **Resolver error de versión en updatePipelineConfig**
   - Backend rechaza `version: "1.0"`
   - Necesario consultar formato esperado

2. **Testing de aislamiento de modelos**
   - Cambiar modelo en "Promociones"
   - Verificar que "Shelf SKU" no se afecte

3. **Testing de safeguard**
   - Cargar pequeño batch de SKUs
   - Verificar contadores pre/post
   - Confirmar integridad

---

## Contacto para Dudas

En caso de preguntas sobre:
- Formato correcto de versión en updatePipelineConfig
- Endpoints de validación de modelos disponibles
- Detalles de seedShelfSkus y comportamiento esperado
