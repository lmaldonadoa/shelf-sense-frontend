# 📚 Integración Completa Frontend-Backend - Semantic Enrichment

> Este documento integra la documentación del backend (`frontend-prompt-enrichment-and-semantic-config.md`) con los cambios de frontend que creamos.

---

## 📊 Tabla de Recursos Disponibles

El backend expone **7 familias de configuración** en `text_enrichment`:

| # | Recurso | Tabla DB | Base Endpoint | Estado |
|---|---------|----------|---------------|--------|
| 1 | **Aliases Semánticos** | `semantic_aliases` | `/v1/accounts/{account}/aliases` | ✅ Vivo |
| 2 | **Frases Ignoradas** | `chain_ignored_phrases` | `/v1/accounts/{account}/chains/{chain_id}/ignored-phrases` | ✅ Vivo |
| 3 | **Conocimiento RAG** | `semantic_knowledge` | `/v1/accounts/{account}/semantic-knowledge` | ✅ Vivo |
| 4 | **Tokens del Nombre** | `enrichment_token_lists` | `/v1/accounts/{account}/enrichment-tokens` | ✅ Nuevo |
| 5 | **Variantes/Fragancias** | `promotion_variant_ontology` | `/v1/accounts/{account}/promotion-variants` | ✅ Nuevo (Batch 2) |
| 6 | **Markers de Categoría** | `promotion_category_markers` | `/v1/accounts/{account}/promotion-category-markers` | ✅ Nuevo (Batch 3) |
| 7 | **Measure-Noise Cadenas** | `promotion_measure_noise_chains` | `/v1/accounts/{account}/promotion-measure-noise-chains` | ✅ Nuevo (Batch 4) |

---

## 🔗 Cómo se Inyectan en el Pipeline

Cuando se crea un job, **`_run_job_async` inyecta todos estos recursos** en `pipeline_config["text_enrichment"]`:

```python
# En app/api/main.py

text_enrichment = {
    "aliases": await get_aliases(account),
    "ignored_phrases": await get_ignored_phrases(account, chain),
    "semantic_knowledge": await get_semantic_knowledge(account),
    "enrichment_tokens": await get_enrichment_tokens(account),
    "variant_ontology": await get_variant_ontology(account),
    "category_markers": await get_category_markers(account),
    "measure_noise_chains": await get_measure_noise_chains(account),
    # ... más config
}
```

**⚠️ Importante:** Los cambios surten efecto **EN EL PRÓXIMO JOB CREADO**, no afectan jobs en curso.

---

## 🎛️ Integración con Frontend

### Ubicación en UI Recomendada

```
Settings / Configuración
├── Cadenas
│   ├── CRUD Cadenas
│   ├── Aliases por Cadena
│   └── Frases Ignoradas (scoped)
│
├── Enriquecimiento Semántico
│   ├── Aliases Semánticos                    [NEW - crear]
│   ├── Frases Ignoradas (account-level)      [NEW - crear]
│   ├── Conocimiento RAG                      [YA EXISTE]
│   ├── Tokens del Nombre Humano              [NEW - crear]
│   ├── Variantes de Promociones              [NEW - crear]
│   ├── Markers de Subcategoría               [NEW - crear]
│   └── Cadenas Measure-Noise                 [NEW - crear]
│
├── Modelos por Modo [NUEVO - Ya creado]
│   ├── Promociones
│   ├── Shelf Promotions
│   └── Shelf SKU
│
└── Protección de Datos Shelf SKU [NUEVO - Ya creado]
```

---

## 📋 Nuevos Componentes UI Requeridos

### 1. Aliases Semánticos (`semantic-aliases-editor.tsx`)

```typescript
// GET /v1/accounts/{account}/aliases
interface SemanticAlias {
  id: number;
  alias: string;           // "OLIM MASC"
  canonical: string;       // "OLIMPIA MASCOTAS"
  scope: "product" | "name" | "all";
  is_active: boolean;
  target_keywords?: string[]; // ["ANTIVIRAL", "DESINFECTANTE"]
  chain_whitelist?: string[]; // ["mi comisariato"]
}

// POST /v1/accounts/{account}/aliases - upsert (sin DELETE)
```

**UI Sugerida:**
- Tabla con columnas: alias, canonical, scope, target_keywords, chain_whitelist, is_active
- Editor modal para upsert
- ⚠️ No hay DELETE - usar toggle is_active para desactivar

---

### 2. Frases Ignoradas (`ignored-phrases-editor.tsx`)

**Dos niveles:**

**A) Account-level:**
```http
GET    /v1/accounts/{account}/ignored-phrases?scope=product|name&chain_code=...
POST   /v1/accounts/{account}/ignored-phrases
```

**B) Scoped por Cadena (RECOMENDADO):**
```http
GET    /v1/accounts/{account}/chains/{chain_id}/ignored-phrases?scope=product
POST   /v1/accounts/{account}/chains/{chain_id}/ignored-phrases
DELETE /v1/accounts/{account}/chains/{chain_id}/ignored-phrases/{ignored_id}
```

```typescript
interface IgnoredPhrase {
  phrase: string;           // "DE TODO A MENOR PRECIO"
  scope: "product" | "name"; // product=descarta, name=limpia nombre
  is_active: boolean;
  chain_whitelist?: string[];
}
```

**UI Sugerida:**
- Mostrar por cadena (usar scope por-cadena)
- Dos scopes: "Descartar producto" vs "Limpiar nombre"
- Switch is_active
- Botón borrar (disponible en chain-scoped)

---

### 3. Tokens del Nombre Humano (`enrichment-tokens-editor.tsx`)

```typescript
type ListType = 
  | "name_guard_brands"
  | "name_guard_descriptors"
  | "name_anchors"
  | "prompt_leak_signature_tokens"
  | "human_name_noise_tokens"
  | "variant_functional_noise"; // nuevo

interface EnrichmentTokensList {
  list_type: ListType;
  defaults: string[];        // solo lectura
  custom: EnrichmentToken[]; // editable
  effective: string[];       // defaults ∪ custom
}

interface EnrichmentToken {
  id: number;
  token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

**Endpoints:**
```http
GET    /v1/accounts/{account}/enrichment-tokens                    # lista todos
GET    /v1/accounts/{account}/enrichment-tokens/{list_type}        # uno en detalle
POST   /v1/accounts/{account}/enrichment-tokens/{list_type}        # upsert
PATCH  /v1/accounts/{account}/enrichment-tokens/{list_type}/{id}   # toggle/renombrar
DELETE /v1/accounts/{account}/enrichment-tokens/{list_type}/{id}   # hard delete
```

**UI Sugerida:**
- Selector de list_type (6 opciones)
- Dos columnas: Defaults (gris/readonly) y Custom (editable)
- Toggle is_active
- Badge "sistema" para defaults
- Mostrar total effective al pie

---

### 4. Variantes/Fragancias (`promotion-variants-editor.tsx`)

```typescript
interface PromotionVariant {
  canonical: string;           // "ORQUIDEAS & ACAI" (UPPERCASE)
  terms: string[];            // ["ORQUIDEA", "ACAI"] - match exacto
  fallback_prefixes: string[]; // ["ORQUID", "ACA"] - prefijo
  compound_terms: string[];   // ["RQUID", "ACA"] - substring compuesto
  category_scope?: string[];  // ["DESODORANTE"] - informativo
  chain_whitelist?: string[]; // ["el rosado"] - vacío = todas
  is_active?: boolean;
  notes?: string;
}
```

**Endpoints:**
```http
GET    /v1/accounts/{account}/promotion-variants           # con defaults
POST   /v1/accounts/{account}/promotion-variants           # upsert por canonical
PATCH  /v1/accounts/{account}/promotion-variants/{id}      # actualizar
DELETE /v1/accounts/{account}/promotion-variants/{id}      # borrar custom
```

**UI Sugerida:**
- Tabla con: canonical, términos, fallback, compound, cadenas, is_active
- Editor con hint: "2+ palabras juntas → compound_terms"
- Validación: al menos un tipo de matching no vacío
- Multi-select para chain_whitelist (vacío = todas)

---

### 5. Markers de Subcategoría (`category-markers-editor.tsx`)

```typescript
interface CategoryMarker {
  marker: string;           // "KIT ESCOLAR" (UPPERCASE)
  canonical: string;        // "KIT ESCOLAR" (canonical de categoría)
  priority: number;         // menor = se evalúa primero
  chain_whitelist?: string[]; // vacío = todas las cadenas
  is_active?: boolean;
  notes?: string;
}
```

**Endpoints:**
```http
GET    /v1/accounts/{account}/promotion-category-markers      # con defaults
POST   /v1/accounts/{account}/promotion-category-markers      # upsert
PATCH  /v1/accounts/{account}/promotion-category-markers/{id} # actualizar
DELETE /v1/accounts/{account}/promotion-category-markers/{id} # borrar
```

**Convención de Priority:**
- 10: Categoría macro (KIT ESCOLAR)
- 20: Compuesta (CEPILLO PASTA)
- 30: Específica con modificador (DENTAL CON FLUOR)
- 40: Estándar (PASTA DENTAL)
- 50: Genérica (CEPILLO)
- 60: Amplia (DESODORANTE)

**UI Sugerida:**
- Tabla ordenada por priority
- Editor con tooltip de convención
- Validación: marker y canonical no vacíos, priority ≥ 0

---

### 6. Measure-Noise Cadenas (`measure-noise-chains-editor.tsx`)

```typescript
interface MeasureNoiseChain {
  chain_code: string;  // "mi comisariato" (lowercase normalizado)
  is_active: boolean;
  notes?: string;
}

interface MeasureNoiseChainsResponse {
  defaults: string[];     // ["mi comisariato", "hipermarket", ...]
  custom: MeasureNoiseChain[];
  effective: string[];    // lo que realmente usa el pipeline
  effective_source: "defaults" | "custom";
}
```

**Endpoints:**
```http
GET    /v1/accounts/{account}/promotion-measure-noise-chains              # con defaults
POST   /v1/accounts/{account}/promotion-measure-noise-chains              # upsert
PATCH  /v1/accounts/{account}/promotion-measure-noise-chains/{id}         # actualizar
DELETE /v1/accounts/{account}/promotion-measure-noise-chains/{id}         # borrar
POST   /v1/accounts/{account}/promotion-measure-noise-chains/seed-defaults # crear defaults
```

**UI Sugerida:**
- Si `effective_source="defaults"`: banner azul "Usa defaults. Pulsa Personalizar."
- Si `effective_source="custom"` y vacío: banner amarillo "Regla desactivada globalmente"
- Tabla con custom + toggle is_active + botón borrar
- Validación: chain_code no vacío

---

## 🔄 Cómo se Integran con Configuración de Modelos

**IMPORTANTE:** La nueva característica de **"Modelos por Modo"** (Promociones vs Shelf SKU) es **INDEPENDIENTE** de estos recursos.

```
pipeline_config
├── llm_routing (modelos - por modo)              [NUEVA - del frontend]
├── text_enrichment
│   ├── aliases                                    [BACKEND]
│   ├── ignored_phrases                            [BACKEND]
│   ├── semantic_knowledge                         [BACKEND]
│   ├── enrichment_tokens                          [BACKEND]
│   ├── variant_ontology                           [BACKEND]
│   ├── category_markers                           [BACKEND]
│   ├── measure_noise_chains                       [BACKEND]
│   ├── semantic_rag { enabled, limit, mode }     [NUEVA - del frontend]
│   ├── structured_shadow { ... }                 [NUEVA - del frontend]
│   └── ... más config
└── size_plausibility_guardrail                    [NUEVA - del frontend]
```

---

## 🚀 Pasos de Implementación

### Fase 1: Completar Componentes de Semantic Config (Frontend)

Ya creados:
- ✅ `semantic-config-page.tsx` - RAG, guardrails, shadow review
- ✅ `size-rules-page.tsx` - reglas de tamaño
- ✅ `mode-model-config-page.tsx` - configuración por modo

Faltantes (consumir endpoints del backend):
- ⏳ `semantic-aliases-editor.tsx`
- ⏳ `ignored-phrases-editor.tsx`
- ⏳ `enrichment-tokens-editor.tsx`
- ⏳ `promotion-variants-editor.tsx`
- ⏳ `category-markers-editor.tsx`
- ⏳ `measure-noise-chains-editor.tsx`

### Fase 2: Integrar en ocrApi.ts

Métodos a agregar:

```typescript
// Aliases
getAliases(account): Promise<SemanticAlias[]>
upsertAlias(account, alias): Promise<SemanticAlias>

// Ignored Phrases
getIgnoredPhrases(account, chain_id): Promise<IgnoredPhrase[]>
upsertIgnoredPhrase(account, chain_id, phrase): Promise<IgnoredPhrase>
deleteIgnoredPhrase(account, chain_id, id): Promise<void>

// Enrichment Tokens
getEnrichmentTokens(account, list_type): Promise<EnrichmentTokensList>
upsertEnrichmentToken(account, list_type, token): Promise<EnrichmentToken>
updateEnrichmentToken(account, list_type, id, data): Promise<EnrichmentToken>
deleteEnrichmentToken(account, list_type, id): Promise<void>

// Variants
getPromotionVariants(account): Promise<VariantsResponse>
upsertVariant(account, variant): Promise<PromotionVariant>
updateVariant(account, id, data): Promise<PromotionVariant>
deleteVariant(account, id): Promise<void>

// Category Markers
getCategoryMarkers(account): Promise<MarkersResponse>
upsertMarker(account, marker): Promise<CategoryMarker>
updateMarker(account, id, data): Promise<CategoryMarker>
deleteMarker(account, id): Promise<void>

// Measure-Noise
getMeasureNoiseCha ins(account): Promise<MeasureNoiseChainsResponse>
upsertMeasureNoiseChain(account, chain): Promise<MeasureNoiseChain>
updateMeasureNoiseChain(account, id, data): Promise<MeasureNoiseChain>
deleteMeasureNoiseChain(account, id): Promise<void>
seedMeasureNoiseDefaults(account): Promise<void>
```

### Fase 3: Agregar a UI de Settings

```
Settings
├── Configuración Semántica [EXISTENTE - mejorar]
│   ├── RAG ✅
│   ├── Guardrails ✅
│   ├── Shadow Review ✅
│   ├── Measure-Noise (config) ✅
│   └── Catalog Memory ✅
│
├── Modelos por Modo ✅
│   ├── Promociones ✅
│   ├── Shelf Promotions ✅
│   └── Shelf SKU ✅
│
├── Enriquecimiento Semántico [NUEVA]
│   ├── Aliases Semánticos 🟠 Crear
│   ├── Frases Ignoradas 🟠 Crear
│   ├── Tokens del Nombre 🟠 Crear
│   ├── Variantes/Fragancias 🟠 Crear
│   ├── Markers de Categoría 🟠 Crear
│   └── Cadenas Measure-Noise 🟠 Crear
│
└── Reglas de Tamaño ✅
```

---

## ⚠️ Casos Especiales y Gaps

### Gap 1: No hay DELETE para Aliases Account-Level
**Solución:** No exponer botón "Borrar", usar toggle `is_active=false` en POST.

### Gap 2: No hay DELETE para Frases Ignoradas Account-Level
**Solución:** Usar versión chain-scoped (tiene DELETE) en lugar de account-level.

### Gap 3: No hay PATCH para Frases Ignoradas Chain-Scoped
**Solución:** Borrar y recrear (no es grave, frases son simples).

### Gap 4: Size-Rules no expuesto en API
**Solución:** Se actualiza vía PATCH `text_enrichment` (como implementamos).

---

## 📌 Convenciones Globales

- **Auth:** misma cabecera que otros endpoints `/v1/accounts/...`
- **Mayúsculas:** backend normaliza a UPPERCASE - conviene mostrar así en UI
- **`is_active`:** backend devuelve `0/1` (SQLite), frontend trata como booleano
- **Errores:** detalle en `{"detail": "..."}`
- **Latencia:** GET rápidos (SQLite local), POST con LLM pueden tardar segundos (usar spinner)
- **Cambios:** afectan PRÓXIMO JOB, no los en curso

---

## 🔍 Testing Recomendado

### Testing Manual por Recurso

```
1. Aliases
   - Crear alias con target_keywords
   - Crear con chain_whitelist
   - Desactivar (toggle is_active)
   
2. Frases Ignoradas
   - Por cadena (scope)
   - scope="product" descarta
   - scope="name" limpia nombre
   
3. Tokens
   - Agregar a list_type="name_guard_brands"
   - Verificar en "effective"
   - Desactivar token
   
4. Variantes
   - Agregar con terms + fallback
   - Agregar con compound_terms
   - Verificar priority en markers
   
5. Markers
   - Crear con priority < 40 (gana sobre defaults)
   - Crear con chain_whitelist
   - Verificar orden por priority
   
6. Measure-Noise
   - Seed defaults
   - Activar/desactivar cadenas
   - Verificar effective_source
```

---

## 📦 Próximos Pasos

1. **Semana 1:** Crear 6 nuevos componentes UI
2. **Semana 2:** Implementar métodos en ocrApi.ts
3. **Semana 3:** Integrar en Settings, testing manual
4. **Semana 4:** Deploy a staging, validación con backend

---

**Ref:** `frontend-prompt-enrichment-and-semantic-config.md` (backend)  
**Versión:** 2.0  
**Estado:** Ready for implementation  
**Última actualización:** 2026-06-10
