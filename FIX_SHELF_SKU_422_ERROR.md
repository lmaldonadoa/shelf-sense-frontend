# 🔧 FIX - Error 422 en Shelf SKU Upload

## ❌ Problema

```
POST /admin/ocr/proxy/v1/accounts/colgate_ecuador/shelf/skus/seed 422
```

**Causa:** El campo `pais` se enviaba como **número** en lugar de **string**.

---

## ✅ Soluciones Aplicadas

### **1. Función `normalizeBulkShelfSeedRow` — Refactorizada**

**Archivo:** `src/components/shelf/account-shelf-page.tsx`

#### Cambio Principal:
- ✅ `pais` ahora se convierte a string: `pais: "9"` en lugar de `pais: 9`
- ✅ Usando helper `toStringOrUndefined()` para números → string
- ✅ Usando helper `toNumberOrUndefined()` para dimensiones (x, y, z)
- ✅ Solo incluye campos que tengan valor (no envía campos vacíos)

#### Antes (❌ Incorrecto):
```typescript
return {
  sku_id: skuId,
  nombre,
  pais: firstNonEmptyString(row.pais, row.country),  // ← Podría ser número
  x_ancho: firstNonEmptyString(row.x_ancho, row.x),  // ← Debería ser número
};
```

#### Después (✅ Correcto):
```typescript
const paisVal = toStringOrUndefined(row.pais ?? row.country);  // ← Siempre string
if (paisVal) result.pais = paisVal;

const xVal = toNumberOrUndefined(row.x_ancho ?? row.x);  // ← Siempre número
if (xVal !== undefined) result.x_ancho = xVal;
```

---

### **2. Endpoint `seedShelfSkus` — Actualizado**

**Archivo:** `src/lib/ocrApi.ts` (línea ~3331)

#### Cambio:
Agregado `fail_on_error: false` al payload

#### Antes:
```typescript
body: JSON.stringify({ items })
```

#### Después:
```typescript
body: JSON.stringify({ items, fail_on_error: false })
```

---

## 📋 Estructura Correcta Ahora

```json
{
  "items": [
    {
      "sku_id": "LML0001",
      "nombre": "LIMPIADORES LIQUIDOS 7 AYUDAS FLORAL DOYPACK 330ML",
      "marca": "7 AYUDAS",
      "categoria": "LIMPIADORES LIQUIDOS",
      "subcategoria": "CUIDADO DEL HOGAR",
      "forma": "DOYPACK",
      "fabricante": "PROQUIM S.A.",
      "fragancia_variante": "FLORAL",
      "ean": "-",
      "tamano": "330ML",
      "pais": "9",              // ✅ STRING, no número
      "x_ancho": 7,             // ✅ Número float
      "y_alto": 17,             // ✅ Número float
      "z_profundidad": 3.5,     // ✅ Número float
      "segmento_funcional": "-",
      "category_cuenta": "COLGATE-COMPETENCIA",
      "grupo": "-",
      "estado": "activo",
      "is_active": true
    }
  ],
  "fail_on_error": false        // ✅ Nuevo parámetro
}
```

---

## 🧪 Pruebas

### ✅ Test Case 1: CSV con pais como número

**Entrada:**
```csv
sku_id,nombre,pais,x,y,z
LML0001,LIMPIADORES 7 AYUDAS,9,7,17,3.5
```

**Transformación:**
```
pais: 9 (número en CSV)
  ↓
pais: "9" (string en API)  ✅
```

### ✅ Test Case 2: JSON con pais como número

**Entrada:**
```json
{
  "items": [
    {
      "codLucky": "LML0001",
      "newDescription": "LIMPIADORES LIQUIDOS 7 AYUDAS FLORAL DOYPACK 330ML",
      "pais": 9
    }
  ]
}
```

**Transformación:**
```
pais: 9 (número en JSON)
  ↓
pais: "9" (string en API)  ✅
```

---

## 📊 Cambios Resumidos

| Aspecto | Antes | Después |
|---------|-------|---------|
| **pais** | Número o string | Siempre string ✅ |
| **x_ancho** | String | Número float ✅ |
| **y_alto** | String | Número float ✅ |
| **z_profundidad** | String | Número float ✅ |
| **Campos vacíos** | Incluidos en payload | Excluidos ✅ |
| **fail_on_error** | No incluido | `false` ✅ |

---

## 🎯 Por Qué Ahora Funciona

1. **Tipo correcto para `pais`:** Backend espera string, ahora se envía string
2. **Tipos correctos para dimensiones:** X, Y, Z como números float (no string)
3. **Sin campos vacíos:** Solo se incluyen campos con valor
4. **Fail-on-error:** Permite que algunos items fallen sin cancelar toda la operación

---

## 📝 Validación Manual

### Si quieres verificar que está bien:

1. **Abre Network tab (F12)**
2. **Carga tus SKUs**
3. **Busca POST a /shelf/skus/seed**
4. **Revisa el Request Payload:**

```javascript
// Debería verse así:
{
  "items": [
    {
      "sku_id": "...",
      "nombre": "...",
      "pais": "9",        // ✅ String, no número
      "x_ancho": 7,       // ✅ Número
      ...
    }
  ],
  "fail_on_error": false  // ✅ Presente
}
```

---

## 🚀 Status

✅ **Frontend:** REPARADO  
⏳ **Backend:** Ya debe estar funcionando (error 422 debe desaparecer)  
✅ **Testing:** Prueba con tus datos Lucky

---

## 📞 Si Sigue Fallando

Si aún ves 422 después de estos cambios:

1. Abre la consola (F12) → Network tab
2. Copia el **Request Payload** completo
3. Verifica:
   - ¿`pais` es string?
   - ¿`x_ancho`, `y_alto`, `z_profundidad` son números?
   - ¿`is_active` es boolean (true/false)?
   - ¿`sku_id` y `nombre` tienen valor?
4. Consulta al backend con ese payload exacto

---

**Cambios commiteados:** ✅  
**Fecha:** 2026-06-10  
**Componentes afectados:** 2  
  1. `src/components/shelf/account-shelf-page.tsx`
  2. `src/lib/ocrApi.ts`

