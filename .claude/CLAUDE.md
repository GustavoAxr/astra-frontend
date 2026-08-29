# astra-frontend

Frontend de **Astra**: control de asistencia industrial con relojes checadores.
Vue 3 + TypeScript + Vite + Vue Router + Pinia + Nuxt UI.

Backend NestJS en `../Nest/api-astra` · API en `http://localhost:3002` · Swagger en `/docs`.
El contrato contestado está en `../Nest/api-astra/docs/README.md`. **Ante cualquier
duda gana `/docs` y la API corriendo, no este archivo.**

## Reglas del dominio que no se rompen

1. **`punchType` casi siempre es `UNKNOWN`.** Se pinta «sin clasificar», en neutro.
   Nunca se deduce entrada ni salida. Un solo helper traduce; prohibido el literal
   en un template.
2. **`verificationMethod` puede venir `"MULTI:cardOrPw"`** = no consta cuál método
   se usó. Se muestra la ambigüedad; no se elige una.
3. **La conciliación propone, una persona confirma.** «Aplicar todo» alcanza solo a
   los `confident: true`, y se enumeran antes de mandarlos.
4. **Un recurso de otra empresa responde 404, no 403** — a propósito, para no
   filtrar que existe. Se pinta «no encontrado», jamás «no tienes permiso». (403 sí
   existe, pero es privilegio por rol y trae su propio texto del servidor.)
5. **No hay datos biométricos en ninguna respuesta** y no debe haberlos. Solo el
   conteo de huellas.
6. **Los roles ocultan, no protegen.** El permiso lo aplican el servidor y RLS. Los
   guards no miran rol; nunca se envuelve una llamada en un `if (esAdmin)`.

## Hechos del contrato (verificados contra la API viva)

- **La empresa activa no viaja.** El alcance lo resuelve el servidor con RLS. El
  selector es un filtro de comodidad: `?legalEntityId=<uuid>`, como `search`. No es
  estado global.
- `/auth/me` → `legalEntities` e `installations` son **números, no arreglos**.
  El selector se muestra si `legalEntities > 1`; los ids salen de `GET /legal-entities`.
- **Error único**: `{ statusCode, message, error, timestamp, path, requestId, details? }`.
  `message` siempre string. `details` solo si hay más de un fallo. `requestId` siempre,
  y también en la cabecera `x-request-id` — píntalo.
- **`forbidNonWhitelisted` activo**: un campo de más = 400. Cada `api.ts` construye el
  cuerpo campo por campo con un `toXxxDto()`. Nunca se manda el objeto reactivo entero
  ni se reenvía en un POST lo que vino de un GET.
- **Refresco**: el backend guarda linaje de tokens; dos refrescos concurrentes revocan
  la familia entera de sesiones. Single-flight obligatorio, en
  [src/shared/api/session.ts](../src/shared/api/session.ts).
- **Paginación**: `page`/`limit` (page desde 1, limit 25 por omisión, tope 100) **solo en
  `/employees`**. El resto devuelve arreglo plano.
- `mustChangePassword` viene `true` en todos los usuarios sembrados y **no hay ruta para
  cambiarla**: es un aviso, no un bloqueo.
- `GET /agents` responde **403 al `DIRECTOR_HOLDING`**. El secreto HMAC solo aparece en la
  respuesta de `POST /agents`, una vez, y no se guarda en `localStorage` ni en consola.

## Quién puede qué (extraído de los `@Roles` del backend)

**`DIRECTOR_HOLDING` no escribe nada.** Aparece en un solo endpoint de toda la API
(`GET /employees/:id`). Es un rol de lectura sobre todo el grupo, no un superadmin.
Para cualquier alta —relojes, instalaciones, agentes, conciliación— hay que entrar
como `ADMIN_EMPRESA`.

| Acción | Roles |
|---|---|
| `POST /devices/discover`, `POST /devices` | `ADMIN_EMPRESA`, `SOPORTE` |
| `POST /installations`, `PATCH /installations/:id` | `ADMIN_EMPRESA` |
| `reconcile/preview` | `RRHH`, `ADMIN_EMPRESA`, `SOPORTE` |
| `reconcile/apply` | `RRHH`, `ADMIN_EMPRESA` |
| `GET /agents` | `ADMIN_EMPRESA`, `SOPORTE`, `SUPERVISOR` |
| `POST /agents` | `ADMIN_EMPRESA`, `SOPORTE` |
| `DELETE /employees/:id`, `POST /employees/:id/assignments` | `RRHH`, `ADMIN_EMPRESA` |

La tabla vive en [src/modules/auth/permissions.ts](../src/modules/auth/permissions.ts) y se
usa **solo para ocultar** lo que no aplica (regla 6). No es control de acceso: si alguien
llega por URL, la llamada sale igual y el servidor responde 403. Si el backend cambia sus
`@Roles`, el peor síntoma posible es un botón de más o de menos.

## Usuarios sembrados (desarrollo)

`director@grupolarissa.mx` (DIRECTOR_HOLDING, alcanza 4 razones sociales) ·
`admin.bio@grupolarissa.mx` (ADMIN_EMPRESA, el que sí ve agentes). Contraseña común
para todos los sembrados.

## Regla de UI: `ghost` por defecto, `soft` en formularios

Los defaults están centralizados en el bloque `ui()` de [vite.config.ts](../vite.config.ts)
mediante `defaultVariants`, así que **NO se escribe `variant` en los templates**: se hereda.

- **`ghost`** — botones, botones de icono y contenedores. Fondo transparente que se pinta
  al hover.
- **`soft`** — todos los campos de formulario. Fondo `bg-elevated/50` fijo, para que el
  campo se distinga del fondo sin llegar a tener borde; al hover/focus sube a `bg-elevated`.

Reglas:

- Nunca pongas `variant="ghost"` ni `variant="soft"` de forma explícita — es ruido, ya es
  el default de cada componente.
- Solo se escribe `variant` en el template para **salirse** de la regla, y cuando eso pase
  debe haber una razón concreta y acordada. «Es el botón principal de la pantalla» **no**
  es razón suficiente: el botón de Entrar es ghost como todo lo demás. Si un botón se lee
  demasiado flojo, se ajusta el default en `vite.config.ts` —color, peso— no se le pone
  `variant` encima.
- Los botones de icono (`<UButton icon="i-lucide-x" square />`) son el mismo `UButton`, así
  que heredan `ghost` igual.
- Si se añade un componente nuevo, se registra su default en `vite.config.ts`, no en el
  template.

### Componentes configurados (verificado contra @nuxt/ui 4.11)

| Variante | Componentes |
|---|---|
| `ghost` | `button` (incluye `activeVariant: soft` para el enlace activo), `pageCard`, `blogPost` |
| `soft` | `input`, `inputDate`, `inputMenu`, `inputNumber`, `inputTags`, `inputTime`, `pinInput`, `select`, `selectMenu`, `textarea` |

`pagination` reenvía `variant` a sus botones: queda en `ghost`, con la página activa en
`soft` para que siga siendo distinguible.

### Componentes sin `ghost`

`badge`, `alert`, `card`, `kbd`, `tabs`, `checkbox`, `radioGroup`, `chatMessage`, etc. no
declaran `ghost` en su tema. Ahí se usa la variante más plana disponible —`subtle`, y si no
existe `soft`— **también declarada en `vite.config.ts`**, no en la plantilla. `alert` ya está. No inventes `variant="ghost"` en estos:
Nuxt UI lo ignora y rompe el tipado.

## Iconos

- Colección por defecto: **lucide** (`i-lucide-*`), instalada en local vía
  `@iconify-json/lucide` — no depende de la API de Iconify en runtime.
- Un botón de icono siempre lleva `aria-label` o `label` accesible.

## Entorno

- `.env` está gitignoreado; `.env.example` es el que se commitea y es la
  documentación de qué variables hacen falta.
- **Nada de `import.meta.env` suelto por el código.** Solo lo lee
  [src/shared/config/env.ts](../src/shared/config/env.ts), que además falla al
  arrancar si falta una variable.
- `VITE_API_URL` apunta a `http://localhost:3002` con **localhost, no 127.0.0.1**:
  para el navegador son sitios distintos y la cookie de sesión (`SameSite=Lax`)
  no cruzaría. El front tiene que abrirse igualmente en `http://localhost:5173`.

## Convenciones Vue

- Composition API con `<script setup lang="ts">` siempre.
- Orden en el SFC: `<script>` → `<template>` → `<style>`.
- Alias `@/` apunta a `src/`.
- Estado en Pinia (`src/stores`), lógica reutilizable en composables.

## Comandos

```bash
npm run dev          # Vite dev server (puerto 5173)
npm run build        # type-check + build
npm run type-check   # vue-tsc --build
npm run lint         # oxlint + eslint --fix
npm run format       # prettier
```
