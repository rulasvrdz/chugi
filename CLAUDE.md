# CLAUDE.md: Chugi

## Qué es Chugi

Plataforma de lealtad para negocios físicos: el cliente acerca su celular a un sello NFC en caja y suma una visita **sin descargar nada**.
La tarjeta vive en Apple/Google Wallet y el premio se canjea con un código que valida el staff.
El piloto corre con **1 restaurante**, solo web + Wallet, sobre una base multi-negocio.

**Docs clave (léelos antes de proponer cambios):**

- [`docs/BRIEF.md`](docs/BRIEF.md): producto, alcance v1, MoSCoW, reglas del piloto y métricas.
- [`docs/PLAN.md`](docs/PLAN.md): arquitectura, flujos, delta del esquema, seguridad, privacidad y orden de construcción.
- [`docs/configuracion-base-datos.md`](docs/configuracion-base-datos.md): esquema de Supabase aplicado (`sellos-app`), RLS, RPC y lecciones de seguridad. Su sección 13 queda reemplazada por `PLAN.md`.

## Stack

Next.js (App Router, TypeScript strict) en Vercel · Supabase (`sellos-app`: Postgres + RLS + Auth + Vault) · código de registro por **correo en desarrollo** (Supabase email OTP + SMTP de Resend) y por **WhatsApp en campo** (Twilio Verify), aislado en `src/lib/auth/otp.ts` con `AUTH_OTP_CHANNEL` · `passkit-generator` (Apple Wallet) · API de Google Wallet · Tailwind · Zod · Vitest · pgTAP · Playwright · pnpm.

**Planes:** Vercel Hobby + Supabase Free hasta que Raúl indique el cambio a Pro. No propongas funciones que requieran plan de pago sin avisarlo.

## Comandos

| Para qué | Comando |
| --- | --- |
| Instalar dependencias | `pnpm install` |
| Supabase local (requiere Docker) | `pnpm supabase start` (CLI como devDependency) |
| Reaplicar migraciones + seed local | `pnpm supabase db reset` |
| App en local | `pnpm dev` |
| Lint / formato / tipos | `pnpm lint` · `pnpm format` (`format:check` en CI) · `pnpm typecheck` |
| Pruebas unitarias | `pnpm test` |
| Pruebas de base (RLS, RPC) | `pnpm supabase test db` |
| Pruebas e2e de humo | `pnpm test:e2e` |
| Nueva migración | `pnpm supabase migration new <descripcion>` |
| Tipos de la base | `pnpm db:types` (`supabase gen types typescript`) |

**Despliegue:**

- Cada PR genera un preview en Vercel, conectado a `sellos-app-dev`.
- La rama `dev` se publica en **`chugi.rulasvrdz.com`** (DNS en Cloudflare, modo "DNS only"), también con `sellos-app-dev`.
- Un merge a `main` despliega a producción (`sellos-app`, dominio por definir).
- Las migraciones a producción (`sellos-app`) **solo las aplica Raúl**, después del merge a `main`. Claude nunca aplica migraciones ni ejecuta SQL de escritura contra producción, ni por CLI ni por MCP.

## Estructura de carpetas

```
src/
  app/
    (cliente)/        t/ (validación del tap), q/ (QR de respaldo), sello/, registro/, tarjeta/, privacidad/
    (panel)/          panel/ (dueño/gerente), caja/ (cuenta compartida de caja)
    api/wallet/       apple/ (pase + web service PassKit), google/
  lib/
    auth/             otp.ts (único lugar que sabe si el código va por correo o WhatsApp)
    supabase/         server.ts, browser.ts, admin.ts (service_role: solo servidor)
    sdm/              descifrado PICC, CMAC, diversificación de llaves
    wallet/           apple/, google/, update.ts
  components/
supabase/
  migrations/         una migración por cambio, nunca editar una ya aplicada
  tests/              pgTAP
  seed.sql            solo datos sintéticos para local
scripts/              programar tags, alta de negocio, borrado ARCO
tests/e2e/            Playwright
docs/
```

## Convenciones de código

- **Idioma:** identificadores, tablas y columnas en inglés (como el esquema existente). UI, docs, commits y PRs en español.
- TypeScript `strict`, sin `any`. Toda entrada externa (query params, formularios, webhooks) se valida con Zod.
- Server Components por defecto. `"use client"` solo cuando haga falta interacción.
- Las reglas de negocio críticas (1 sello por día, anti-replay, canje) viven **en la base** (constraints y RPC). La UI solo traduce resultados.
- Los módulos que usan `service_role` empiezan con `import 'server-only'`.
- Los tipos de la base se generan (`pnpm db:types`), no se escriben a mano.
- Commits: `tipo(CHUG-XX): descripción` (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`).

## Flujo de Git

- **Una story de Jira = una rama `feature/CHUG-XX-descripcion-corta` = un PR hacia `dev`.**
- Las ramas salen de `dev` actualizado. Para bugs: `fix/CHUG-XX-…`. Para documentación sin story: `docs/…`.
- **Nunca hacer push directo a `main` ni a `dev`.** `dev → main` es un PR que aprueba Raúl.
- No se hace commit, push ni PR sin aprobación explícita de Raúl en la sesión.

## Seguridad (no negociable)

1. **RLS habilitado en todas las tablas**, incluidas las nuevas. Una tabla sin políticas queda en deny-by-default, a propósito y documentado.
2. **`service_role` solo en el servidor** (Route Handlers, Server Actions, scripts). Nunca en el cliente, en `NEXT_PUBLIC_*` ni en logs.
3. **Secretos fuera del repo:** variables de entorno de Vercel o `.env.local` (en `.gitignore`). Las llaves de los tags van en Supabase Vault. Se commitea `.env.example` sin valores.
4. **Al revocar permisos de una función, revocar también de `PUBLIC`.** Toda función nueva hereda `EXECUTE` para `PUBLIC`, y `revoke … from anon` solo no tiene efecto. Secuencia obligatoria:
   ```sql
   revoke execute on function public.fn(...) from public;
   grant execute on function public.fn(...) to authenticated; -- o service_role, solo si corresponde
   ```
5. Las funciones `SECURITY DEFINER` fijan `search_path` y validan al llamador (`auth.uid()`, `is_member_of`, `is_manager_of`).
6. Después de cada migración: `get_advisors` sin WARN nuevos y pruebas pgTAP de aislamiento, incluidos los casos negativos.

## Datos personales (LFPDPPP)

- **Chugi es el responsable** de los datos (hoy, Raúl Verduzco como persona física). El restaurante recibe una transferencia limitada a sus propios clientes.
- **Mínimo necesario:** celular y nombre de pila opcional. **Nunca** ubicación del cliente, correo, fecha de nacimiento ni datos sensibles sin pasar por `PLAN.md` y el aviso de privacidad.
- **El correo solo existe en desarrollo**, para cuentas de prueba. Todas se borran antes de abrir el registro a clientes reales.
- **Nada de datos personales en logs**, errores ni analítica: se registran uuids internos, nunca el teléfono, el nombre ni los códigos de canje u OTP.
- La caja y el dueño ven los teléfonos enmascarados (`•••• 1234`).
- Las cuentas se borran tras 12 meses sin visitas, con aviso previo (`PLAN.md` §6.1).
- Un dato nuevo, una finalidad nueva o un proveedor nuevo que reciba datos obliga a actualizar el inventario de `PLAN.md` §6 y el aviso.
- No se usan datos reales de clientes en local ni en preview.

## Forma de trabajo

- **Proponer antes de implementar:** al tomar una story, primero resume el enfoque (archivos, migraciones, riesgos) y espera el visto bueno.
- **Explicar antes de editar:** di qué vas a cambiar y por qué antes de tocar archivos.
- **Preguntar lo ambiguo, todo junto,** en un solo bloque.
- **Sin overengineering:** es un piloto con 1 restaurante. Nada de colas, microservicios, caches ni abstracciones "para cuando tengamos 1,000 negocios".
- **Resumir al terminar cada story:** qué cambió, cómo se probó, qué quedó pendiente o en riesgo.

## Definición de terminado (story)

- [ ] Se cumplen los criterios de aceptación de la story en Jira.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` y `supabase test db` pasan en local y en CI.
- [ ] Si tocó la base: migración nueva en `supabase/migrations`, RLS en tablas nuevas, `revoke … from public` en funciones nuevas, pgTAP con casos positivos y negativos, `get_advisors` sin WARN nuevos y tipos regenerados.
- [ ] Sin secretos en el diff y sin datos personales en logs.
- [ ] Probado en el preview de Vercel (flujo afectado de punta a punta).
- [ ] Docs actualizados si cambió el esquema, un flujo o un dato personal (`PLAN.md`, `configuracion-base-datos.md`).
- [ ] PR hacia `dev` con el resumen de la story, revisado y aprobado por Raúl.
