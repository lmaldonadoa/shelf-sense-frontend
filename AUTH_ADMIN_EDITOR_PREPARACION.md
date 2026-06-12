# Sistema de Usuarios Admin / Editor / Viewer

## Objetivo

Dejar preparado el frontend para que pueda tener acceso con usuarios y roles sin activarlo todavía en producción.

## Estado actual

La implementación quedó montada pero desactivada por defecto.

- Si `AUTH_ENABLED=false`, el sistema se comporta exactamente como hoy.
- Si `AUTH_ENABLED=true`, se habilitan:
  - login por formulario
  - cookie de sesión firmada
  - cierre de sesión
  - middleware de protección por rutas
  - control de visibilidad en la navegación
  - restricción por roles `admin`, `editor`, `viewer`

## Qué se implementó

### 1. Modelo de roles

Archivo base:

- [roles.ts](C:/GitHub/supermarket-ocr-web/web/src/lib/auth/roles.ts)

Roles definidos:

- `admin`: acceso total, incluyendo configuración sensible, API keys, ops y mantenimiento.
- `editor`: puede operar el sistema y editar configuración funcional, pero no entrar a zonas sensibles.
- `viewer`: acceso de consulta y monitoreo.

## 2. Configuración central

Archivo base:

- [config.ts](C:/GitHub/supermarket-ocr-web/web/src/lib/auth/config.ts)

Variables previstas:

```env
AUTH_ENABLED=false
AUTH_COOKIE_NAME=shelfsense_auth
AUTH_SECRET=change-me-before-enable
AUTH_SESSION_HOURS=12
AUTH_BOOTSTRAP_USERS_JSON=[{"email":"admin@empresa.com","password":"CAMBIAR_ESTO","role":"admin","displayName":"Admin Demo"},{"email":"editor@empresa.com","password":"CAMBIAR_ESTO","role":"editor","displayName":"Editor Demo"}]
```

Notas:

- `AUTH_BOOTSTRAP_USERS_JSON` es una capa temporal para pruebas internas.
- Sirve para prender el sistema sin base de datos todavía.
- No es el modelo final recomendado para producción.

## 3. Sesión firmada

Archivo base:

- [session.ts](C:/GitHub/supermarket-ocr-web/web/src/lib/auth/session.ts)

Se implementó una cookie firmada con `HMAC SHA-256`.

Qué sí hace:

- detecta manipulación del contenido
- valida expiración
- evita que el rol se cambie desde el navegador sin invalidar la firma

Qué no hace todavía:

- no cifra el contenido
- no revoca sesiones individualmente
- no rota secretos
- no guarda auditoría de logins

## 4. Middleware de protección

Archivo base:

- [middleware.ts](C:/GitHub/supermarket-ocr-web/web/src/middleware.ts)

Comportamiento cuando `AUTH_ENABLED=true`:

- si no hay sesión, redirige a `/auth/login`
- si hay sesión pero el rol no alcanza, redirige a `/auth/denied`
- si la ruta es pública de auth, la deja pasar

## 5. Rutas y permisos

Archivo base:

- [route-access.ts](C:/GitHub/supermarket-ocr-web/web/src/lib/auth/route-access.ts)

### Rutas `admin`

- `/ops`
- `/configs`
- `/admin/*`
- `/accounts/[account]/api-keys`
- `/accounts/[account]/inbound-whatsapp`
- `/accounts/[account]/settings/llm`
- `/accounts/[account]/jobs/maintenance`

### Rutas `editor` o superior

- `/jobs/new`
- `/accounts/[account]/training`
- `/accounts/[account]/aliases`
- `/accounts/[account]/config`
- `/accounts/[account]/chains`
- `/accounts/[account]/semantic-knowledge`
- `/accounts/[account]/semantic-review`
- `/accounts/[account]/semantic-lab`
- `/accounts/[account]/playground`
- `/accounts/[account]/masterdata`
- `/accounts/[account]/shelf`

### Rutas `viewer` o superior

- `/`
- `/analytics`
- `/jobs/[jobId]`
- `/accounts/[account]/jobs`
- `/accounts/[account]/quality`
- `/accounts/[account]/preview`

## 6. Login y logout

Archivos:

- [login page](C:/GitHub/supermarket-ocr-web/web/src/app/auth/login/page.tsx)
- [login form](C:/GitHub/supermarket-ocr-web/web/src/components/auth/login-form.tsx)
- [login route](C:/GitHub/supermarket-ocr-web/web/src/app/api/auth/login/route.ts)
- [logout route](C:/GitHub/supermarket-ocr-web/web/src/app/api/auth/logout/route.ts)
- [access denied](C:/GitHub/supermarket-ocr-web/web/src/app/auth/denied/page.tsx)

Esto ya deja resuelto:

- entrar al sistema
- salir del sistema
- redirigir a la vista solicitada después del login
- mostrar bloqueo por permisos insuficientes

## 7. Navegación consciente del rol

Archivos:

- [auth-provider.tsx](C:/GitHub/supermarket-ocr-web/web/src/components/auth/auth-provider.tsx)
- [auth-user-nav.tsx](C:/GitHub/supermarket-ocr-web/web/src/components/auth/auth-user-nav.tsx)
- [app-shell-nav.tsx](C:/GitHub/supermarket-ocr-web/web/src/components/app-shell-nav.tsx)
- [layout.tsx](C:/GitHub/supermarket-ocr-web/web/src/app/layout.tsx)
- [providers.tsx](C:/GitHub/supermarket-ocr-web/web/src/components/providers.tsx)

Cuando auth está activa:

- se muestra el usuario actual
- se muestra el rol actual
- aparece botón de salir
- los links sensibles desaparecen si el rol no corresponde

Cuando auth está desactivada:

- se muestra una cápsula visual diciendo que la auth está preparada pero apagada
- no se bloquea nada

## Cómo activarlo luego

## Paso 1

Agregar variables al entorno del frontend:

```env
AUTH_ENABLED=true
AUTH_SECRET=pon-aqui-un-secreto-largo-y-unico
AUTH_SESSION_HOURS=12
AUTH_BOOTSTRAP_USERS_JSON=[{"email":"admin@empresa.com","password":"CAMBIAR_ESTO","role":"admin","displayName":"Admin Demo"},{"email":"editor@empresa.com","password":"CAMBIAR_ESTO","role":"editor","displayName":"Editor Demo"}]
```

## Paso 2

Reiniciar la app.

## Paso 3

Entrar por:

- `/auth/login`

## Recomendación importante

Antes de activarlo para usuarios reales, cambiar la fuente de identidad.

## Qué recomiendo como siguiente etapa

### Opción A. Rápida e interna

Mantener `AUTH_BOOTSTRAP_USERS_JSON` solo para pilotos o demos privadas.

Ventajas:

- simple
- sin backend nuevo
- útil para probar el flujo de roles

Riesgos:

- manejo manual de contraseñas
- no hay recuperación de acceso
- no hay alta/baja de usuarios
- no escala bien

### Opción B. Recomendada para producción

Mover usuarios a backend o proveedor de identidad.

Alternativas razonables:

- backend propio con tabla `users`, `roles`, `password_hash`
- proveedor externo tipo Auth0, Clerk o Cognito
- SSO corporativo si el cliente ya usa Microsoft Entra / Google Workspace / Okta

## Huecos que todavía faltan si se quiere nivel producción

- hash real de contraseñas con `bcrypt` o `argon2`
- almacenamiento persistente de usuarios
- reset de contraseña
- invitaciones y alta/baja de usuarios
- auditoría de accesos
- expiración y revocación de sesión por usuario
- rotación de secreto
- rate limit de login
- CSRF más estricto para formularios sensibles
- separación más fina de permisos por acción

## Recomendación de negocio

Como primer corte, esta base ya es útil porque nos permite:

- diseñar el mapa de permisos desde ya
- preparar el frontend sin bloquear trabajo funcional
- validar la experiencia admin/editor antes de conectar identidad real

Mi recomendación es:

1. Dejarlo apagado en producción por ahora.
2. Probarlo primero con usuarios bootstrap en un entorno interno.
3. Confirmar exactamente qué puede hacer `editor` y qué debe quedar solo para `admin`.
4. Luego sustituir el origen de usuarios por backend o SSO.

## Resumen ejecutivo

Sí, ya podemos ir levantando el sistema desde ahora sin activarlo todavía.

Lo que quedó listo es el esqueleto completo del acceso:

- login
- logout
- sesión firmada
- middleware
- control de roles
- ocultamiento de menús por permiso

Lo que no quedó encendido es la política de acceso real, porque depende del flag `AUTH_ENABLED`.
