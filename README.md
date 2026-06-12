# Supermarket OCR Web

Frontend Next.js 15 + TypeScript para OCR multi-cuenta.

## Instalación

```bash
npm install
```

## Entorno

Crear `web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

Escenarios:

- Local: `http://localhost:8080`
- Docker frontend: `http://host.docker.internal:8080`
- WSL: `http://127.0.0.1:8080` o IP del host

## Ejecutar

```bash
npm run dev
```

## Exponer con ngrok

Si ya tienes una sesion local de `ngrok` activa, puedes reutilizarla desde PowerShell:

```powershell
.\scripts\expose-ngrok.ps1 -Target frontend
```

Para exponer el backend OCR:

```powershell
.\scripts\expose-ngrok.ps1 -Target backend
```

Si `ngrok` ya esta ocupado con otro tunnel y quieres reemplazarlo en la sesion actual:

```powershell
.\scripts\expose-ngrok.ps1 -Target frontend -RestartExisting
```

Si aun no has abierto ngrok, inicia una sesion con:

```powershell
ngrok http 3000
```

## Rutas principales

- `/jobs/new`: upload -> file_ids -> create job
- `/jobs/[jobId]`: status, imágenes, eventos y resultados
- `/configs`: configuración básica por cuenta
- `/ops`: diagnóstico backend (`/health`, recent jobs/uploads)

## Módulo semántico

- `/accounts/[account]/config`
  - editar config activa por cuenta
  - soporte de etiquetas (`support_labels`)
  - detección, text enrichment y guardado con deep merge
- `/accounts/[account]/aliases`
  - listar, crear, editar y activar/desactivar aliases semánticos
- `/accounts/[account]/playground`
  - prueba rápida upload -> job -> monitoreo -> resultados

## Flujo recomendado (no técnico)

1. Ir a `/accounts/colgate_ecuador/config` y ajustar reglas.
2. Ir a `/accounts/colgate_ecuador/aliases` y mantener diccionario semántico.
3. Probar en `/accounts/colgate_ecuador/playground`.

## Troubleshooting

- `400`: request inválido o file_id inválido
- `404`: no existe o resultados aún no disponibles
- `413`: excede límites de tamaño/cantidad
- `415`: MIME/extensión no soportada
- `422`: payload inválido
- `500`: error interno backend
- `NETWORK - ...`: backend no alcanzable
- `NETWORK - Timeout conectando con backend.`: backend respondió fuera de 20s

Usa `/ops` y botón **Probar conexión backend** en `/jobs/new` para diagnóstico rápido.
