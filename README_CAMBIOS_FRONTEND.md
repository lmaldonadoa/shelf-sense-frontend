# 📋 CAMBIOS DE FRONTEND - ÍNDICE COMPLETO

## 📌 Resumen Ejecutivo

Se han implementado **dos mejoras críticas de producción**:

1. **✅ Configuraciones de modelos independientes por modo** - Promociones, Shelf Promotions, y Shelf SKU tienen configuraciones separadas que NO se sincronizan
2. **✅ Protección contra pérdida de datos en Shelf SKU** - Validación pre/post carga para evitar destrucción accidental de base de SKUs

**Archivos de referencia:**
- 📄 `CAMBIOS_FRONTEND_V2.md` - Detalles técnicos completos
- 📄 `PROMPT_BACKEND.md` - Preguntas para resolver con backend
- 📄 `PASOS_POST_BACKEND.md` - Qué hacer después de respuestas del backend

---

## 📁 Archivos Nuevos Agregados

### Librerías
```
src/lib/modelModeConfig.ts
├─ Gestión de configuraciones por modo
├─ localStorage aislado por {account}_{mode}
└─ Funciones: get/set/clear/ensureIsolation
```

### Componentes UI
```
src/components/settings/mode-model-config-page.tsx
├─ Interfaz de usuario para 3 modos
├─ Configuración de OCR, Vision, Semantic models
├─ Protección contra cambios accidentales
└─ Panel de estado

src/components/shelf/shelf-sku-upload-safeguard.tsx
├─ Validador de carga masiva de SKUs
├─ Verifica integridad pre/post
├─ 2 checkboxes de confirmación obligatoria
└─ Alerta si disminuyen SKUs
```

### Documentación
```
CAMBIOS_FRONTEND_V2.md          → Detalles técnicos
PROMPT_BACKEND.md               → Preguntas al backend
PASOS_POST_BACKEND.md           → Pasos posteriores
README_CAMBIOS_FRONTEND.md      → Este archivo
```

---

## 🔧 Archivos Modificados

### `src/components/shelf/account-shelf-page.tsx`
**Cambios:**
- Agregado import: `ShelfSkuUploadSafeguard`
- Agregados states: `bulkDataForUpload`, `showBulkUploadSafeguard`
- Botón "Crear lote" ahora abre protección primero (cambió a "Crear lote (Protegido)")
- Integración visual de safeguard en sección de carga masiva

### `src/lib/ocrApi.ts`
**Cambios:**
- Agregado import: `PipelineConfig` (estaba faltando)
- Nuevo método: `updatePipelineConfig()` con versioning inteligente
- Nuevo método: `getRagEffectiveness()` para métricas de RAG
- Versioning mejorado: intenta incrementar versión actual, fallback a "next"

### `src/types/ocr-api.ts`
**Cambios:**
- Extendido `TextEnrichmentConfig` con nuevas propiedades:
  - `semantic_scope_guardrails`
  - `structured_shadow`
  - `measure_noise_rules`
  - `size_plausibility_guardrail`

---

## 🚀 Cómo Usar

### Para Usuarios Finales

#### 1. Configurar Modelos Independientes
```
Settings → Configuración Avanzada → Modelos por Modo
  ├─ Tab "Promociones" → Establecer modelos para Promociones
  ├─ Tab "Shelf Promotions" → Establecer modelos para Shelf Promo
  └─ Tab "Shelf SKU" → Establecer modelos para Shelf SKU
```

✅ Cambios en un modo NO afectan otros modos

#### 2. Cargar Base de SKUs (Protegido)
```
Shelf → Cargas Masivas
  → Ingresar JSON/CSV
  → Click "Crear lote (Protegido)"
  → Confirmar checkboxes
  → Sistema verifica integridad
  → ✅ Carga completada sin pérdida
```

✅ Si ocurre error destructivo, se detecta y alerta

### Para Desarrolladores

#### Acceder a Configuración de Modo
```typescript
import { getModeModelConfig, setModeModelConfig } from "@/lib/modelModeConfig";

// Obtener
const config = getModeModelConfig("colgate_ecuador", "shelf_sku");

// Actualizar
setModeModelConfig("colgate_ecuador", "shelf_sku", {
  ocr_model: "glm-ocr",
  vision_model: "gemma4:12b-it-qat",
  semantic_model: "qwen3:8b"
});
```

#### Usar Safeguard Programáticamente
```typescript
<ShelfSkuUploadSafeguard
  account={account}
  bulkData={skuArray}
  onUploadSuccess={() => refetch()}
/>
```

---

## ⚠️ Errores Encontrados y Corregidos

### Error 1: Versión Inválida en updatePipelineConfig
**Problema:** Backend rechazaba `version: "1.0"`

**Solución Implementada:** 
- Código obtiene versión actual
- Intenta incrementarla inteligentemente (número, vX, string numérico)
- Fallback a `"next"` para auto-incrementar

**Estado:** ✅ Corregido - flexible con múltiples formatos

### Error 2: Checkbox Component No Existe
**Problema:** Importaba `@/components/ui/checkbox` que no existe

**Solución Implementada:**
- Reemplazado con `<input type="checkbox" />`
- Estilos CSS nativos

**Estado:** ✅ Corregido

---

## 🧪 Testing Recomendado

### Testing Manual
```
1. Aislamiento de Modelos
   ✓ Cambiar OCR en "Promociones"
   ✓ Verificar "Shelf SKU" no se afecta
   ✓ Recargar página
   ✓ Confirmar configuraciones persisten

2. Safeguard de Shelf SKU
   ✓ Cargar 5 SKUs nuevos
   ✓ Verificar contadores pre/post
   ✓ Confirmar integridad
```

### Testing Automatizado (Pendiente)
Ver `PASOS_POST_BACKEND.md` → Paso 5 y 6 para test files

---

## 📊 Dependencias y Compatibilidad

### Librerías Usadas
- `lucide-react` (iconos) ✅ Ya existe
- `sonner` (toasts) ✅ Ya existe
- `@tanstack/react-query` (data fetching) ✅ Ya existe
- `localStorage` (nativo) ✅ No requiere instalación

### Navegadores Soportados
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### Next.js Versión
- Mínima: 13.0+ (usa "use client")
- Recomendada: 14.0+ o superior

---

## 📋 Checklist de Implementación

Para el equipo de frontend:

- [ ] Revisar `CAMBIOS_FRONTEND_V2.md` en detalle
- [ ] Copiar archivos nuevos:
  - [ ] `src/lib/modelModeConfig.ts`
  - [ ] `src/components/settings/mode-model-config-page.tsx`
  - [ ] `src/components/shelf/shelf-sku-upload-safeguard.tsx`
- [ ] Actualizar archivos existentes:
  - [ ] `src/components/shelf/account-shelf-page.tsx` (imports + states + JSX)
  - [ ] `src/lib/ocrApi.ts` (imports + nuevos métodos)
  - [ ] `src/types/ocr-api.ts` (extender TextEnrichmentConfig)
- [ ] Agregar tab en Settings para "Modelos por Modo"
- [ ] Testing manual de aislamiento
- [ ] Testing manual de safeguard
- [ ] Desplegar a staging
- [ ] Desplegar a producción

---

## ❓ Preguntas Pendientes

El backend debe responder:

1. **Formato de versión:** ¿Entero, vX, o "next"?
2. **Comportamiento de seedShelfSkus:** ¿Es destructivo o upsert?
3. **Endpoint de modelos disponibles:** ¿Existe lista de modelos Ollama?
4. **Endpoint de config:** ¿PATCH funciona o necesita ruta específica?

Ver `PROMPT_BACKEND.md` para detalles

---

## 📞 Contacto y Soporte

En caso de dudas sobre implementación:

1. Revisar `CAMBIOS_FRONTEND_V2.md` - Documentación técnica
2. Revisar `PASOS_POST_BACKEND.md` - Guía post-respuestas
3. Contactar al equipo de arquitectura

---

## 📈 Impacto de los Cambios

### Antes
- ❌ Cambiar modelo en Promociones afectaba Shelf SKU
- ❌ Carga de SKUs podía borrar base anterior sin aviso
- ❌ Sin protección de integridad de datos

### Después
- ✅ Configuraciones totalmente independientes por modo
- ✅ Carga de SKUs validada pre/post
- ✅ Sistema alerta si se detecta pérdida de datos
- ✅ UX mejorada con confirmaciones explícitas

---

## 🎯 Siguientes Pasos

1. **Inmediato:** Enviar `PROMPT_BACKEND.md` al backend
2. **Mientras se espera:** Revisar y preparar cambios para merge
3. **Post-respuesta:** Ejecutar pasos en `PASOS_POST_BACKEND.md`
4. **Testing:** Validar aislamiento y safeguard
5. **Deploy:** Llegar a staging y producción

---

## 📄 Documentos Incluidos

| Documento | Propósito |
|-----------|----------|
| `CAMBIOS_FRONTEND_V2.md` | Detalles técnicos de cada cambio |
| `PROMPT_BACKEND.md` | Preguntas para resolver con backend |
| `PASOS_POST_BACKEND.md` | Pasos posteriores post-respuestas |
| `README_CAMBIOS_FRONTEND.md` | Este archivo (índice general) |

---

**Versión:** 1.0  
**Fecha:** 2026-06-09  
**Estado:** Listo para implementación  
**Bloqueador:** Respuestas del backend sobre versioning y seedShelfSkus
