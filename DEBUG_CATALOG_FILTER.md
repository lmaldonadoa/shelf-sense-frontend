# 🔍 DEBUG - Por qué solo ve JABONES en el Catálogo

## 📋 Pasos para Debugear

### 1. Abre Console (F12) en el navegador

### 2. En la pestaña "Catalogo", pega este código en la Console:

```javascript
// Ver qué categorías se encuentran
const categories = document.querySelector('select[value*=""]');
if (categories) {
  console.log("Categorías en el dropdown:");
  Array.from(categories.options).forEach(opt => {
    if (opt.value !== "") console.log(`- ${opt.value}`);
  });
}

// Ver qué está seleccionado en el filtro
const select = document.querySelectorAll('select');
console.log("Número de selects:", select.length);
select.forEach((s, i) => {
  console.log(`Select ${i}: value="${s.value}"`);
});
```

### 3. Verifica:
- ¿Cuántas categorías salen en el dropdown?
- ¿Es solo "JABONES" o hay más?

### 4. Si solo sale JABONES, significa que `skuCatalogOptions.categories` solo tiene una categoría

### 5. Verifica los SKUs en la BD:

Pega en la Console:

```javascript
// Ver el estado actual de los SKUs
const skiuStorage = localStorage.getItem("shelf-skus-cache");
if (skipStorage) {
  const skus = JSON.parse(skipStorage);
  console.log(`Total SKUs en cache: ${skus.length}`);
  
  // Agrupar por categoría
  const cats = new Map();
  skus.forEach(sku => {
    const cat = sku.familia || sku.category || sku.categoria || "sin categoria";
    if (!cats.has(cat)) cats.set(cat, 0);
    cats.set(cat, cats.get(cat) + 1);
  });
  
  console.log("SKUs por categoría:");
  cats.forEach((count, cat) => console.log(`- ${cat}: ${count}`));
}
```

---

## 🐛 Causas Probables

| Causa | Síntoma | Fix |
|-------|---------|-----|
| **Filtro "pegado" en JABONES** | Dropdown muestra 1 opción | Resetea los filtros (vacía los selects) |
| **Backend retorna solo última carga** | Todos los SKUs tienen la misma categoría | Refresca catálogo (botón "Refrescar catálogo") |
| **Cache localStorage viejo** | Los SKUs en cache son solo JABONES | Borra el cache: `localStorage.clear()` y recarga |
| **Mapeo de campos incorrecto** | Los SKUs llegan con `family` en lugar de `categoria` | Verifica qué campos retorna el backend |
| **Subcategoría filtrada** | No visible pero filtrada por subcategoría | Revisa el dropdown "Subcategorías" |

---

## ✅ Soluciones Rápidas

### A. Resetea los Filtros
En la UI, cambia el dropdown "Todas las categorías" a algo vacío y luego atrás a "Todas las categorías".

### B. Refresca el Catálogo
Haz click en el botón "Refrescar catálogo" (línea 4851 en account-shelf-page.tsx).

### C. Limpia el Cache
```javascript
localStorage.clear();
location.reload();
```

### D. Verifica que el Backend retorna correcto

En Network (F12):
1. Haz click en "Refrescar catálogo"
2. Busca GET a `/shelf/skus`
3. Ve al Response
4. Verifica qué campos trae cada SKU (¿`familia`? ¿`categoria`? ¿`family`?)

---

## 🔧 Si Sigue Fallando

1. **Comparte aquí:**
   - Output de la consola (categorías encontradas)
   - Un SKU de ejemplo del Response del GET /shelf/skus

2. **Voy a revisar:**
   - Si el mapeo de `getSkuFamilyValue` es correcto
   - Si hay un filtro oculto activo
   - Si el backend retorna con nombres de campos inesperados
