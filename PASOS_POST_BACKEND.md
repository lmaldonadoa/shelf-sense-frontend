# Pasos Posteriores - Después de Respuestas del Backend

## 📋 Checklist Post-Respuestas

Una vez que el backend responda al `PROMPT_BACKEND.md`, ejecutar estos pasos:

---

## Paso 1: Corrección de Formato de Versión

### Si el backend responde: "USA solo enteros"
```typescript
// En src/lib/ocrApi.ts - updatePipelineConfig
nextVersion = String(Number(version) + 1); // Convertir a número entero
```

### Si responde: "USA formato vX"
```typescript
nextVersion = `v${parseInt(...) + 1}`; // Mantener formato v1, v2, v3...
```

### Si responde: "USA 'next' para autoincrement"
```typescript
nextVersion = "next"; // Mantener simplemente
```

**Estado actual:** Código ya es flexible con `nextVersion = "next"` como fallback ✅

---

## Paso 2: Validar Comportamiento de seedShelfSkus

Si backend responde que **ES destructivo** (reemplaza todo):

### Opción A: Agregar flag al endpoint
```typescript
// En ocrApi.ts
seedShelfSkus: async (
  accountName: string, 
  items: Record<string, unknown>[],
  options?: { merge?: boolean; mode?: "upsert" | "replace" }
): Promise<Record<string, unknown>>
```

### Opción B: Usar endpoint alternativo
```typescript
// Si existe otro endpoint que sea no-destructivo:
mergeShelfSkus: async (...)  // Buscar en documentación del backend
```

### Opción C: Implementar safeguard en frontend (YA HECHO) ✅
`ShelfSkuUploadSafeguard` ya verifica integridad pre/post carga.

---

## Paso 3: Implementar Validación de Modelos

### Si existe endpoint de modelos disponibles:

```typescript
// Agregar a src/lib/ocrApi.ts
getAvailableModels: async (
  accountName: string
): Promise<{
  ocr_models: string[];
  vision_models: string[];
  semantic_models: string[];
}> => {
  const body = await request(
    `/v1/accounts/${encodeURIComponent(accountName)}/models/available`,
    { method: "GET" },
    "No se pudieron obtener modelos disponibles"
  );
  return body as Record<string, string[]>;
}
```

### Luego, actualizar `mode-model-config-page.tsx`:

```typescript
const modelsQuery = useQuery({
  queryKey: ["available-models", account],
  queryFn: () => ocrApi.getAvailableModels(account),
});

// Cambiar inputs de texto a selects:
<select value={currentConfig.ocr_model ?? ""}>
  <option value="">-- Seleccionar --</option>
  {modelsQuery.data?.ocr_models?.map(model => (
    <option key={model} value={model}>{model}</option>
  ))}
</select>
```

---

## Paso 4: Actualizar Endpoint de Configuración Semántica

Si el endpoint correcto es diferente:

### Caso A: PATCH funciona en backend
```typescript
// Mantener código actual en semantic-config-page.tsx
// Ya usa updatePipelineConfig internamente ✅
```

### Caso B: PATCH necesita endpoint específico
```typescript
// Agregar nuevo método a ocrApi.ts
updateConfigSection: async (
  accountName: string,
  section: string,
  data: Record<string, unknown>
): Promise<ActiveConfigResponse> => {
  const body = await request(
    `/v1/accounts/${encodeURIComponent(accountName)}/configs/active/section/${section}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    `No se pudo actualizar sección ${section}`
  );
  return body as ActiveConfigResponse;
}
```

Luego actualizar `semantic-config-page.tsx`:
```typescript
saveMutation: useMutation({
  mutationFn: async () => {
    return ocrApi.updateConfigSection(
      accountName, 
      "text_enrichment", 
      config
    );
  },
  // ... resto
})
```

---

## Paso 5: Testing de Aislamiento de Modelos

Crear archivo de test: `__tests__/modelModeConfig.test.ts`

```typescript
import { getModeModelConfig, setModeModelConfig, clearModeModelConfig } from '@/lib/modelModeConfig';

describe('Mode Model Config Isolation', () => {
  const account = "test_account";

  beforeEach(() => {
    localStorage.clear();
  });

  it('should not share config between modes', () => {
    setModeModelConfig(account, "promociones", { ocr_model: "glm-ocr" });
    setModeModelConfig(account, "shelf_sku", { ocr_model: "gpt-4-vision" });

    const promoConfig = getModeModelConfig(account, "promociones");
    const shelfConfig = getModeModelConfig(account, "shelf_sku");

    expect(promoConfig.ocr_model).toBe("glm-ocr");
    expect(shelfConfig.ocr_model).toBe("gpt-4-vision");
  });

  it('should clear config without affecting other modes', () => {
    setModeModelConfig(account, "promociones", { ocr_model: "model1" });
    setModeModelConfig(account, "shelf_sku", { ocr_model: "model2" });

    clearModeModelConfig(account, "promociones");

    expect(getModeModelConfig(account, "promociones")).toEqual({});
    expect(getModeModelConfig(account, "shelf_sku").ocr_model).toBe("model2");
  });
});
```

**Ejecutar:**
```bash
npm test -- __tests__/modelModeConfig.test.ts
```

---

## Paso 6: Testing de Safeguard de Shelf SKU

Crear archivo de test: `__tests__/shelfSkuUploadSafeguard.test.ts`

```typescript
import { render, screen } from '@testing-library/react';
import { ShelfSkuUploadSafeguard } from '@/components/shelf/shelf-sku-upload-safeguard';

describe('Shelf SKU Upload Safeguard', () => {
  it('should prevent upload without confirmations', () => {
    const mockOnSuccess = jest.fn();
    
    render(
      <ShelfSkuUploadSafeguard
        account="test"
        bulkData={[{ sku_id: "TEST1", sku_name: "Product 1" }]}
        onUploadSuccess={mockOnSuccess}
      />
    );

    // Botón debe estar deshabilitado inicialmente
    const uploadButton = screen.getByRole('button', { name: /proceder/i });
    expect(uploadButton).toBeDisabled();
  });

  it('should verify SKU count before and after', async () => {
    // Mock ocrApi.listShelfSkus
    jest.mock('@/lib/ocrApi', () => ({
      listShelfSkus: jest.fn()
        .mockResolvedValueOnce([...Array(10)]) // 10 SKUs antes
        .mockResolvedValueOnce([...Array(15)]), // 15 SKUs después (OK)
    }));

    // Verificar que no hay error si aumentan
  });
});
```

---

## Paso 7: Documentación de Configuración por Modo

Crear archivo: `docs/MODO_CONFIGURACION.md`

```markdown
# Configuración de Modelos por Modo

## Cómo Funcionan

Cada "modo" de operación tiene su **propia** configuración de modelos:

### Modos Disponibles
- **Promociones**: Detección de promociones en imágenes
- **Shelf Promotions**: Promociones en estanterías (con recorte)
- **Shelf SKU**: Catalogación y training de SKUs

### Ejemplo: Cambiar Modelo en Un Modo

```typescript
import { getModeModelConfig, setModeModelConfig } from '@/lib/modelModeConfig';

// Leer configuración actual
const currentConfig = getModeModelConfig("colgate_ecuador", "promociones");
console.log(currentConfig.ocr_model); // "glm-ocr"

// Actualizar solo OCR para Promociones
setModeModelConfig("colgate_ecuador", "promociones", {
  ...currentConfig,
  ocr_model: "gpt-4-vision"
});

// Shelf SKU sigue usando su propia configuración
const shelfConfig = getModeModelConfig("colgate_ecuador", "shelf_sku");
console.log(shelfConfig.ocr_model); // sigue siendo el anterior, no cambió
```

### Interfaz de Usuario

En **Settings → Modelos por Modo**:
1. Seleccionar modo (tabs)
2. Establecer modelos OCR, Vision, Semantic
3. Guardar (solo afecta ese modo)

## Casos de Uso

- ✅ Promo usa "best", Shelf usa "best-seg"
- ✅ Cambios en Promociones no afectan training de Shelf
- ✅ Cada equipo configura su modo independientemente
```

---

## Paso 8: Desplegar en Staging

```bash
# 1. Verificar cambios
git status

# 2. Hacer commit
git add -A
git commit -m "feat: modo configuración independiente + safeguard Shelf SKU"

# 3. Push a rama de feature
git push origin feature/mode-config-safeguard

# 4. Crear Pull Request
# - Título: "Configuración independiente por modo + Protección Shelf SKU"
# - Descripción: Incluir CAMBIOS_FRONTEND_V2.md

# 5. Testing en staging
# - Probar aislamiento de configuraciones
# - Probar safeguard de carga de SKUs
# - Verificar que Training View sigue funcionando
```

---

## Paso 9: Actualizar Documentación de Usuario

Crear guía: `docs/GUIA_USUARIO_MODOS.md`

```markdown
# Guía de Usuario - Configuración por Modo

## Para QA / Testing

### Verificar Aislamiento
1. Ir a Settings → Modelos por Modo
2. En tab "Promociones": establecer OCR = "glm-ocr"
3. En tab "Shelf SKU": establecer OCR = "gpt-4-vision"
4. Recargar página
5. Verificar que cada modo mantiene su modelo

### Verificar Safeguard
1. Ir a Shelf → Cargas
2. Ingresar JSON con 5 SKUs
3. Click "Crear lote (Protegido)"
4. Sistema debe mostrar: "5 SKUs en la base"
5. Confirmar ambos checkboxes
6. Esperar a que complete
7. Verificar mensaje: "✅ Carga completada sin pérdida de datos"

## Para Desarrolladores

Ver `src/lib/modelModeConfig.ts` para implementación interna.
```

---

## Resumen de Estado Actual

| Item | Estado | Próximo Paso |
|------|--------|------------|
| Aislamiento de modelos | ✅ Implementado | Agregar validación de modelos (Paso 3) |
| Safeguard Shelf SKU | ✅ Implementado | Testing (Paso 6) |
| Formato de versión | ✅ Flexible | Confirmar con backend |
| Tipos actualizados | ✅ Hecho | N/A |
| Documentación | ✅ Básica | Expandir (Paso 7-9) |

---

## Contacto y Soporte

Si durante la implementación encuentras:
- Errores de versión diferentes → revisar respuesta del backend
- Problemas de sincronización → verificar localStorage
- Safeguard no funciona → revisar que seedShelfSkus devuelva respuesta correcta

Contactar al equipo de backend con screenshot del error.
