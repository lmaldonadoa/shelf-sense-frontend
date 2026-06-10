# ⚡ Quick Start - Shelf Recognition Integration

## 🎯 En 5 Minutos

### **1. Importar el Componente**

```tsx
import { ShelfRecognitionPage } from "@/components/shelf/shelf-recognition-page";
```

### **2. Usar en tu Página**

```tsx
export function MyPage() {
  const accountId = "acme-corp"; // Tu account ID
  
  return <ShelfRecognitionPage account={accountId} />;
}
```

**¡Listo!** El componente maneja todo internamente (queries, mutations, UI).

---

## 📍 Ubicación de Archivos

```
src/components/shelf/
├── shelf-recognition-page.tsx     ← Usa este
├── shelf-curation-inbox.tsx       ← Auto-importado
├── shelf-cluster-board.tsx        ← Auto-importado
├── shelf-confusion-studio.tsx     ← Auto-importado
└── shelf-training-campaigns.tsx   ← Auto-importado
```

---

## 🎮 Cómo Funciona

### **📥 Inbox Tab**
```
User:   Presiona A → Crop aceptado
        Presiona D → Crop descartado
        Presiona → → Siguiente
        Presiona ← → Anterior
System: Refetch automático post-acción
```

### **📊 Cluster Board Tab**
```
User:   Escribe job ID + Enter
        Sistema clusteriza automáticamente
        Arrastra cluster → columna SKU
        Drop automáticamente asigna
System: POST /bulk-action con parámetros
```

### **🔬 Confusion Studio Tab**
```
User:   Ve matriz de confusiones
        Click par para seleccionar
        Input SKU A + SKU B
        Click "Crear" → hard negative
System: POST /hardnegatives
        DELETE /hardnegatives en cleanup
```

### **🎯 Campaigns Tab**
```
User:   Completa form (nombre + desc)
        Click "Crear Campaña"
        Input job ID + "Adjuntar"
        Click "Iniciar" → start campaign
System: CRUD completo automático
```

---

## 🔑 API Keys Requeridas

El componente usa los mismos auth headers que ya tienes configurado.

✅ No necesitas agregar nada  
✅ Usa el proxy existente  
✅ URL base: `/admin/ocr/proxy/v1/`

---

## 📊 Estados y Validaciones

### **Inbox**
- ✅ Validates: status filter (pending/ambiguous/unknown)
- ✅ Validates: A/D/→/← keys
- ✅ Auto-refetch después de accept/discard

### **Cluster Board**
- ✅ Validates: job_id no duplicados
- ✅ Validates: cluster_id en drop
- ✅ Auto-refetch después de assign/discard

### **Confusion Studio**
- ✅ Validates: dateRange (7-365 days)
- ✅ Validates: sku_a != sku_b
- ✅ Auto-refetch después de crear/eliminar

### **Campaigns**
- ✅ Validates: campaign name obligatorio
- ✅ Validates: job_id formato
- ✅ Auto-refetch después de cualquier CRUD

---

## 🎨 Customización (Opcional)

### **Cambiar Atajos en Inbox**

Edita `shelf-curation-inbox.tsx` línea ~142:

```tsx
const handleKeyPress = (e: React.KeyboardEvent) => {
  if (e.key === "a" || e.key === "A") {
    // Cambiar "A" a "Enter", etc.
  }
  // ...
};
```

### **Agregar más columnas Cluster Board**

Automático — se crea columna nueva cuando haces "Agregar SKU"

### **Filtrar Confusion Studio por período**

Input disponible — slider de 7 a 365 días

---

## 🐛 Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| "No hay items en inbox" | Endpoint retorna 200 pero array vacío | Verifica que existan crops pending |
| Drag-drop no funciona | Browser no soporta HTML5 drag | Update browser o usa Cluster Board alternativo |
| Hard negative no se crea | SKU A = SKU B | Verifica que sean diferentes |
| Campaña no inicia | Status no es "draft" | Crea campaña nueva |
| Atajos no funcionan | Focus no está en div | Click en área Inbox primero |

---

## 📋 Endpoints Requeridos en Backend

El backend debe implementar estos 15 endpoints:

```
✅ GET    /shelf/curation/inbox
✅ POST   /shelf/jobs/{job}/images/{img}/results/{crop}/decision
✅ POST   /shelf/review-queue/{item}/decision
✅ POST   /shelf/training/cluster-crops
✅ POST   /shelf/curation/bulk-action
✅ GET    /shelf/reliability/summary
✅ POST   /shelf/training/hardnegatives
✅ DELETE /shelf/training/hardnegatives/{a}/{b}
✅ GET    /shelf/training/campaigns
✅ POST   /shelf/training/campaigns
✅ POST   /shelf/training/campaigns/{id}/jobs
✅ DELETE /shelf/training/campaigns/{id}/jobs/{job}
✅ POST   /shelf/training/campaigns/{id}/start
✅ POST   /shelf/training/campaigns/{id}/pause
✅ DELETE /shelf/training/campaigns/{id}
```

---

## 🔗 Integración con Otras Secciones

### **Con Training IA**

Si quieres agregar Shelf Recognition como tab en Training IA:

```tsx
// En account-training-page.tsx

import { ShelfRecognitionPage } from "@/components/shelf/shelf-recognition-page";

export function AccountTrainingPage({ account }) {
  const [tab, setTab] = useState("training");
  
  return (
    <>
      <Button onClick={() => setTab("shelf-recognition")}>
        🛍️ Shelf Recognition
      </Button>
      
      {tab === "shelf-recognition" && <ShelfRecognitionPage account={account} />}
    </>
  );
}
```

---

## ✅ Checklist Pre-Deploy

- [ ] Backend implementó los 15 endpoints
- [ ] Auth headers funcionan correctamente
- [ ] Accounts tienen datos en /inbox
- [ ] Campaigns pueden crear correctamente
- [ ] Hard negatives POST/DELETE funcionan
- [ ] Manual testing completado
- [ ] No hay errores TypeScript
- [ ] Build `npm run build` es exitoso

---

## 📞 Soporte

**Documentación completa:**
- `IMPLEMENTACION_SHELF_RECOGNITION_COMPLETA.md` — Detalles técnicos
- `RESUMEN_IMPLEMENTACION_FINAL.md` — Visión general
- `SHELF_RECOGNITION_SESSION_COMPLETED.md` — Qué se hizo hoy

**Código:**
- Todos los archivos están en `src/components/shelf/`
- Bien documentados con comentarios
- TypeScript strict

---

## 🚀 Próximos Pasos

1. **Verificar backend** — Implementar 15 endpoints
2. **Deploy a staging** — Test con datos reales
3. **Ajustar UX** — Si es necesario
4. **Deploy a prod** — Cuando esté validado

---

**¡Listo para usar!** ✅

Solo import + pass account y el componente hace todo.
