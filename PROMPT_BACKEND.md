# Prompt para Backend - Resolución de Errores de API

## 1. Error de Validación de Versión

### Error Actual
```
400 - version invalida '1.0'. Usa un entero, 'v2' o 'next'/'vX' para autoincrementar
Endpoint: POST /v1/accounts/{account}/pipeline-configs
```

### Pregunta al Backend

**¿Cuál es el formato correcto para el campo `version` en `POST /v1/accounts/{account}/pipeline-configs`?**

Opciones esperadas:
- ¿Aceptar versiones numéricas como entero? (ej: `version: 1`)
- ¿Aceptar cadenas con prefijo `v`? (ej: `version: "v1"` o `"v2"`)
- ¿Aceptar `"next"` para autoincrementar? (ej: `version: "next"`)
- ¿Hay un rango válido? (ej: solo positivos, máximo, etc.)

**Contexto:** El frontend necesita actualizar configuraciones dinámicamente. Cuando se actualiza, ¿debería:
1. Incrementar automáticamente la versión existente?
2. Usar `"next"` para que el backend autoincremente?
3. Mantener la misma versión?

---

## 2. Comportamiento de `seedShelfSkus`

### Pregunta
**Cuando se llama a `POST /v1/accounts/{account}/shelf/skus/seed` con un lote de SKUs:**

¿El comportamiento actual es...?
- A) Reemplaza TODOS los SKUs con el nuevo lote (destructivo)
- B) Actualiza SKUs existentes e inserta nuevos (merge)
- C) Insertar-o-actualizar por `sku_id` (upsert)

**Esperado:** El sistema debe ser **no-destructivo** (opción B o C).

Si actualmente es A (destructivo), ¿hay un flag o parámetro para cambiar comportamiento a B/C?

---

## 3. Endpoint de Listado de Modelos

### Pregunta
**¿Existe un endpoint para listar modelos disponibles en Ollama?**

Necesarios para validar:
```
GET /v1/accounts/{account}/models/available
GET /v1/models/ollama/available
GET /v1/health/models
```

**Respuesta esperada:**
```json
{
  "ocr_models": ["glm-ocr", ...],
  "vision_models": ["gemma4:12b-it-qat", "qwen-vl", ...],
  "semantic_models": ["qwen3:8b", "qwen3:1.7b", ...]
}
```

---

## 4. Validación de Integridad - Shelf SKU

### Pregunta
Cuando cargamos SKUs vía `seedShelfSkus`, ¿el endpoint devuelve...?

```json
{
  "status": "ok",
  "processed": 10,
  "created": 5,
  "updated": 5,
  "failed": 0,
  "errors": []
}
```

¿Es seguro asumir que si `status: "ok"`, la operación fue completamente exitosa?

¿Hay casos donde algunos registros fallan pero devuelve `status: "ok"`?

---

## 5. Configuración de Texto Enriquecido

### Pregunta
El endpoint `PATCH /v1/accounts/{account}/configs/active/section/text_enrichment` ¿existe?

Si no, ¿cuál es el endpoint correcto para actualizar SOLO la sección `text_enrichment` sin sobrescribir toda la config?

Opciones:
- A) `PATCH /v1/accounts/{account}/configs/active` con body parcial
- B) `POST /v1/accounts/{account}/configs/active/text_enrichment`
- C) `PUT /v1/accounts/{account}/pipeline-configs/{id}` con merge
- D) Otro endpoint específico

---

## Resumen para Implementación

Una vez respondidas estas preguntas, el frontend puede:

1. ✅ Usar versión correcta al actualizar configs
2. ✅ Confiar en que seedShelfSkus no es destructivo (o tomar precauciones)
3. ✅ Validar modelos disponibles antes de asignar
4. ✅ Implementar safeguard más robusto para Shelf SKU
5. ✅ Actualizar secciones específicas de config sin conflictos

---

## Detalles Técnicos Adicionales

Si es útil, el frontend también necesita saber:

1. **Rate limiting:** ¿Hay límite de requests/segundo en endpoints de config?
2. **Concurrencia:** ¿Qué pasa si dos clientes actualizan config simultáneamente?
3. **Rollback:** ¿Hay forma de revertir a versión anterior de config?
4. **Auditoría:** ¿Se registra quién hizo cambios de config?
