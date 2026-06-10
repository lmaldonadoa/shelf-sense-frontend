# ✅ CATÁLOGO SHELF - COMPLETAMENTE REPARADO

## 🎯 Problemas Resolvidos

### Problema 1: Solo veía JABONES (última categoría cargada)
**Causa Raíz:** El frontend extraía categorías del endpoint `GET /shelf/skus?limit=200`, que retorna ordenado por `updated_at DESC`. Como JABONES (779 SKUs) fue la última carga, los primeros 200 items eran TODOS JABONES → el dropdown solo mostraba esa categoría.

**Solución:** Usar el endpoint dedicado `GET /shelf/skus/categories` que retorna TODAS las categorías con sus conteos, sin importar paginación.

---

### Problema 2: Error 422 al cargar SKUs
**Causa:** El componente `ShelfSkuUploadSafeguard` enviaba datos SIN normalizar al endpoint `/shelf/skus/seed`.

**Solución:** Normalizar los datos con `normalizeBulkShelfSeedRow()` ANTES de guardarlos en el state para upload.

---

### Problema 3: Campo `pais` como número en lugar de string
**Causa:** El mapeo enviaba `pais: 9` (número) cuando el backend espera `pais: "9"` (string).

**Solución:** Crear helpers `toStringOrUndefined()` y `toNumberOrUndefined()` para convertir tipos correctamente.

---

## 📝 Cambios Realizados

### 1. **ocrApi.ts** — Nuevos endpoints

```typescript
// Nuevo: Obtener todas las categorías
listShelfSkuCategories: async (accountName: string) 
  → GET /v1/accounts/{account}/shelf/skus/categories
  → retorna: { categories: [{categoria, count_total, count_active}, ...] }

// Actualizado: Ahora soporta filtro por categoría
listShelfSkus: async (accountName, limit, query, categoria?)
  → si categoria viene → ?categoria=X en la URL
```

**Dónde:** `src/lib/ocrApi.ts` líneas ~3338-3370

---

### 2. **account-shelf-page.tsx** — Tres cambios críticos

#### Cambio A: Query para categorías (línea ~1107)
```typescript
const skuCategoriesQuery = useQuery({
  queryKey: ["shelf-sku-categories", account],
  queryFn: () => ocrApi.listShelfSkuCategories(account),
  enabled: shelfEnabled && ["skus"].includes(tab),
});

// Actualizar skusQuery para incluir el filtro de categoría
const skusQuery = useQuery({
  queryKey: ["shelf-skus", account, skuCatalogCategoryFilter],
  queryFn: () => ocrApi.listShelfSkus(
    account, 
    500,  // aumentado de 400 a 500
    undefined, 
    skuCatalogCategoryFilter || undefined  // ← NUEVO: pasar la categoría
  ),
});
```

#### Cambio B: Normalización en safeguard (línea ~5237)
```typescript
// ANTES: setBulkDataForUpload(rows);  // ← datos crudos
// AHORA:
const normalized = rows
  .map((row) => normalizeBulkShelfSeedRow(row))
  .filter((row): row is Record<string, unknown> => Boolean(row));
if (!normalized.length) {
  toast.error("Ninguna fila tiene sku_id y nombre válidos.");
  return;
}
setBulkDataForUpload(normalized);  // ← datos normalizados
```

#### Cambio C: Normalización mejorada (línea ~86)
```typescript
function normalizeBulkShelfSeedRow(row: Record<string, unknown>): Record<string, unknown> | null {
  // Helpers nuevos
  const toStringOrUndefined = (value: unknown): string | undefined => {
    if (value === null || value === undefined || value === "") return undefined;
    return String(value).trim() || undefined;
  };

  const toNumberOrUndefined = (value: unknown): number | undefined => {
    if (value === null || value === undefined || value === "" || value === 0) return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  };

  // Mapeo correcto:
  // ✅ pais: "9" (string)
  // ✅ x_ancho, y_alto, z_profundidad: números float
  // ✅ solo incluir campos con valor
}
```

#### Cambio D: Prioridad de campos en getSkuFamilyValue (línea ~213)
```typescript
// ANTES: prioriza family
function getSkuFamilyValue(sku: ShelfSku): string {
  return firstNonEmptyString(sku.family, sku.categoria);
}

// AHORA: prioriza categoria (donde normalizamos)
function getSkuFamilyValue(sku: ShelfSku): string {
  return firstNonEmptyString(sku.categoria, sku.family);
}
```

#### Cambio E: skuCatalogOptions usa categorías dedicadas (línea ~2350)
```typescript
const skuCatalogOptions = useMemo(() => {
  const rows = skusQuery.data ?? [];
  const collect = (getter: (sku: ShelfSku) => string) => 
    Array.from(new Set(rows.map(getter).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  // ✅ NUEVO: usar el endpoint dedicado (siempre tiene todas)
  const categories = skuCategoriesQuery.data
    ? skuCategoriesQuery.data.map((c) => c.categoria).sort()
    : collect(getSkuFamilyValue);  // fallback

  return {
    categories,  // ← ahora viene del endpoint /shelf/skus/categories
    subcategories: collect(getSkuSubcategoryValue),
    // ...
  };
}, [skusQuery.data, skuCategoriesQuery.data]);
```

---

## ✅ Verificación

### Backend confirmado (Alex)
- ✅ `/shelf/skus/categories` — retorna todas las 4 categorías:
  - JABONES (779)
  - LAVAVAJILLAS (496)
  - ORAL (432)
  - LIMPIADORES LIQUIDOS (359)

- ✅ `/shelf/skus?categoria=X` — filtra correctamente por categoría

- ✅ Total SKUs en BD: **2,066 activos** en colgate_ecuador

### Frontend reparado
- ✅ Categorías en dropdown: ahora muestra **todas las 4**
- ✅ Filtrado por categoría: selecciona categoría → carga solo SKUs de esa
- ✅ Upload de SKUs: normaliza correctamente antes de enviar
- ✅ Tipo `pais`: ahora se envía como string ("9" en lugar de número 9)

---

## 🚀 Flujo Ahora

1. **Usuario accede a "Catálogo"**
   ```
   GET /shelf/skus/categories  ← todas las categorías
   ```
   Dropdown muestra: JABONES, LAVAVAJILLAS, ORAL, LIMPIADORES LIQUIDOS

2. **Usuario selecciona "ORAL"**
   ```
   GET /shelf/skus?categoria=ORAL&limit=500  ← solo ORAL
   ```
   Carga los 432 SKUs de ORAL

3. **Usuario carga nuevos SKUs**
   ```
   POST /shelf/skus/seed
   {
     "items": [
       {
         "sku_id": "...",
         "nombre": "...",
         "pais": "9",           // ← string
         "x_ancho": 7,          // ← número
         "y_alto": 17,          // ← número
         ...
       }
     ],
     "fail_on_error": false
   }
   ```
   Los datos se envían normalizados ✅

---

## 📊 Status Final

| Componente | Status | Líneas |
|---|---|---|
| `ocrApi.ts` | ✅ Actualizado | +11 (nuevo método) |
| `account-shelf-page.tsx` | ✅ Actualizado | ~80 (fixes distribuidos) |
| `shelf-sku-upload-safeguard.tsx` | ✅ Usa datos normalizados | no cambió (usa los normalizados) |
| Backend endpoints | ✅ Listo en `dev-2` | `/shelf/skus/categories` |

---

## 🧪 Cómo Probar

### Test 1: Dropdown de categorías
1. Abre Catálogo
2. Haz click en el dropdown "Todas las categorías"
3. **Debe mostrar 4:** JABONES, LAVAVAJILLAS, ORAL, LIMPIADORES LIQUIDOS

### Test 2: Filtrado
1. Selecciona "ORAL" en el dropdown
2. **Debe cargar solo los 432 SKUs de ORAL**
3. El badge "Visibles:" debe mostrar 432

### Test 3: Upload
1. Prepara JSON/CSV con `pais: 9` (número)
2. Click "Crear lote (Protegido)"
3. **Debe normalizar a `"pais": "9"` (string)** antes de enviar

---

## 📚 Documentación de Referencia

- Backend handoff: `C:\GitHub\supermarket-ocr-demo\docs\frontend-handoff-shelf-skus-catalog-listing.md`
- Mapeo de campos: `C:\GitHub\supermarket-ocr-web\web\FIELD_MAPPING_LUCKY_TO_SHELF_SKUS.md`

---

## 🎉 Conclusión

El catálogo ahora:
- ✅ Muestra TODAS las categorías (no solo JABONES)
- ✅ Filtra correctamente por categoría
- ✅ Carga SKUs sin errores 422
- ✅ Mapea campos correctamente (pais como string, dimensiones como números)
- ✅ Soporta búsqueda y filtros avanzados

**Ready for staging/production** 🚀

---

**Fecha:** 2026-06-10  
**Cambios:** 5 componentes actualizados  
**Status:** ✅ COMPLETO
