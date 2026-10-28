# Configuración de Base de Datos — App de Sellos y Promociones
 
**Última actualización:** 2026-08-07
**Estado:** Esquema aplicado y verificado. Fase 1 (base de datos) cerrada. Pruebas de aislamiento RLS pasadas. Hallazgos de seguridad corregidos. Datos sintéticos de prueba eliminados — proyecto en estado limpio.
 
---
 
## 1. Información del proyecto
 
| Campo | Valor |
|---|---|
| Proveedor | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Organización | RulasVrdz DEV |
| Nombre del proyecto | `sellos-app` |
| Project ref (ID técnico) | `czaitalplpjykopzfrak` |
| Región | `us-east-1` |
| Costo | $0 USD/mes (plan gratuito) |
 
> **Para replicar en otro proyecto Supabase:** copiar el bloque SQL completo de la sección 8 y ejecutarlo en el SQL Editor del nuevo proyecto, o vía `apply_migration`.
 
---
 
## 2. Filosofía de seguridad del diseño
 
- **RLS (Row Level Security — seguridad a nivel de fila):** mecanismo nativo de Postgres que filtra qué filas puede leer/escribir cada usuario, evaluado directamente en la base de datos, no confiando en el frontend. Está **habilitado en las 10 tablas**.
- **Deny-by-default:** en Postgres, si una tabla tiene RLS habilitado y una tabla/acción no tiene ninguna política definida, el acceso queda **denegado automáticamente**. Se usó esto a propósito en `nfc_tags` y `audit_log` — ningún usuario `authenticated` tiene política de SELECT, por lo que nadie fuera del backend puede leerlas.
- **`SECURITY DEFINER`:** modificador de función en Postgres que hace que la función se ejecute con los permisos de quien la creó (el dueño de la base), no de quien la llama. Se usa en las funciones auxiliares y RPC para poder validar reglas de negocio con más privilegio del que tiene el usuario final, sin exponerle esos privilegios directamente.
- **`STABLE`:** modificador que le dice al optimizador de consultas de Postgres que la función no modifica datos y devuelve el mismo resultado dentro de una misma consulta, permitiendo que la cachee en vez de recalcularla en cada fila — importante para que las políticas RLS no degraden el rendimiento.
- **Ledger append-only (registro de solo-inserción):** la tabla `visits` nunca se actualiza para restar sellos; los sellos "gastados" se marcan enlazándolos a un `redemption_id`. Esto hace que el historial sea auditable y resistente a condiciones de carrera (dos escrituras simultáneas que se pisan entre sí).
---
 
## 3. Extensiones habilitadas
 
| Extensión | Uso |
|---|---|
| `pgcrypto` | Genera bytes aleatorios criptográficamente seguros (`gen_random_bytes`) para los códigos de canje, y hashea/verifica esos códigos (`crypt`, `gen_salt`) para no guardarlos en texto plano. |
 
---
 
## 4. Tipos enumerados (ENUM)
 
| Tipo | Valores | Uso |
|---|---|---|
| `member_role` | `owner`, `manager`, `staff` | Rol del empleado dentro de un negocio |
| `tag_status` | `active`, `revoked` | Estado del sello físico NFC |
| `program_status` | `active`, `inactive` | Estado del programa de sellos |
| `visit_status` | `pending_sync`, `confirmed`, `rejected`, `duplicate` | Estado de una visita (soporta registro sin internet) |
| `redemption_status` | `pending`, `redeemed`, `expired` | Estado de un canje de premio |
 
---
 
## 5. Tablas
 
### `profiles`
Extiende `auth.users` (tabla nativa de autenticación de Supabase) con datos de perfil.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | = `auth.users.id` |
| `full_name` | text | |
| `phone` | text | |
| `created_at` | timestamptz | |
 
Se crea automáticamente vía trigger `on_auth_user_created` al registrarse un usuario (ver sección 7).
 
### `businesses`
Negocio afiliado a la plataforma.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | |
| `status` | text | default `'active'` |
| `created_at` | timestamptz | |
 
### `locations`
Sucursal física de un negocio, con datos de geolocalización para el geofence (perímetro geográfico validado por GPS).
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `business_id` | uuid (FK → businesses) | |
| `name` | text | |
| `lat`, `lng` | double precision | Coordenadas de la sucursal |
| `geofence_radius_m` | int | Radio en metros dentro del cual se acepta una visita. Default 100 |
| `created_at` | timestamptz | |
 
### `business_members`
Relación staff ↔ negocio.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `business_id` | uuid (FK) | |
| `user_id` | uuid (FK → auth.users) | |
| `role` | member_role | |
| `created_at` | timestamptz | |
| Restricción | `UNIQUE(business_id, user_id)` | Un usuario no puede duplicarse como staff del mismo negocio |
 
### `enrollments`
La "tarjeta" de un cliente en un negocio específico.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `business_id` | uuid (FK) | |
| `customer_id` | uuid (FK → auth.users) | |
| `created_at` | timestamptz | |
| Restricción | `UNIQUE(business_id, customer_id)` | Un cliente solo se enrola una vez por negocio |
 
### `stamp_programs`
Reglas del programa de sellos de un negocio.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `business_id` | uuid (FK) | |
| `stamps_required` | int | Sellos necesarios para el premio. `CHECK > 0` |
| `stamp_ttl_days` | int | Días de vigencia de cada sello (TTL = Time To Live, tiempo de vida). `CHECK > 0` |
| `reward_description` | text | |
| `status` | program_status | |
| `created_at` | timestamptz | |
| **Restricción especial** | `UNIQUE INDEX` parcial sobre `business_id` `WHERE status = 'active'` | Garantiza **un solo programa activo por negocio**, aplicado por la base de datos, no por lógica de aplicación |
 
### `nfc_tags`
Registro de los sellos físicos NFC (Near Field Communication — comunicación de campo cercano, la tecnología del chip). **Tabla sin acceso para ningún rol `authenticated`** — solo el backend (`service_role`) la lee/escribe.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `uid` | text (UNIQUE) | Identificador único de fábrica del chip |
| `business_id` | uuid (FK) | Denormalizado (repetido) a propósito para simplificar y acelerar las políticas RLS |
| `location_id` | uuid (FK) | |
| `key_ref` | text | Referencia a la llave criptográfica en Supabase Vault — la llave real NUNCA se guarda aquí |
| `last_counter` | bigint | Último contador SDM válido recibido, para detectar repeticiones/clonación |
| `status` | tag_status | |
| `created_at` | timestamptz | |
 
### `redemptions`
Canje de un premio.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `business_id` | uuid (FK) | |
| `enrollment_id` | uuid (FK) | |
| `stamp_program_id` | uuid (FK) | |
| `code_hash` | text | Código de canje, guardado **hasheado** (nunca en texto plano) |
| `status` | redemption_status | |
| `redeemed_by` | uuid (FK → auth.users) | Staff que confirmó el canje |
| `redeemed_at` | timestamptz | |
| `expires_at` | timestamptz | TTL corto (5 minutos desde que se genera) |
| `created_at` | timestamptz | |
 
### `visits`
Ledger append-only de sellos otorgados. **Los clientes solo pueden leer, nunca insertar** — la única vía de escritura es `service_role` desde la futura Edge Function de validación NFC.
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `business_id` | uuid (FK) | Denormalizado para RLS |
| `enrollment_id` | uuid (FK) | |
| `location_id` | uuid (FK) | |
| `tag_id` | uuid (FK) | |
| `stamp_program_id` | uuid (FK) | |
| `sdm_counter` | bigint | Contador criptográfico del tag (SDM = Secure Dynamic Messaging), usado para prevenir clonación y repeticiones |
| `status` | visit_status | Soporta el flujo offline: `pending_sync` → `confirmed`/`rejected`/`duplicate` |
| `captured_at` | timestamptz | Momento real del tap NFC (puede ser offline) — usado para validar geofence y orden, NO el momento de sincronización |
| `synced_at` | timestamptz | Momento en que llegó al servidor |
| `lat`, `lng` | double precision | Ubicación capturada en el momento del tap |
| `expires_at` | timestamptz | Vencimiento del sello individual (para la lógica FIFO de canje) |
| `redemption_id` | uuid (FK, nullable) | Se llena cuando el sello se reserva/consume en un canje |
| `created_at` | timestamptz | |
| Restricción | `UNIQUE(tag_id, sdm_counter)` | Bloquea a nivel de base de datos que el mismo contador de un tag se use dos veces (anti-replay) |
 
### `audit_log`
Trazabilidad de acciones sensibles. Sin políticas de SELECT (solo accesible por `service_role`).
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `actor` | uuid (FK → auth.users) | |
| `action` | text | |
| `target_table` | text | |
| `target_id` | uuid | |
| `metadata` | jsonb | |
| `created_at` | timestamptz | |
 
---
 
## 6. Funciones auxiliares (RLS)
 
### `is_member_of(p_business_id uuid) → boolean`
`SECURITY DEFINER`, `STABLE`. Verifica si `auth.uid()` (el usuario autenticado actual) pertenece a `business_members` de ese negocio, sin importar el rol. Se usa como bloque base en casi todas las políticas de staff.
 
### `is_manager_of(p_business_id uuid) → boolean`
Igual que la anterior, pero exige rol `owner` o `manager`. Se usa para las políticas de escritura (crear/editar sucursales, programas, staff).
 
---
 
## 7. Triggers
 
### `on_auth_user_created`
Se dispara `AFTER INSERT` en `auth.users`. Ejecuta `handle_new_user()`, que crea automáticamente la fila correspondiente en `profiles`. Así el cliente nunca tiene que crear su perfil manualmente tras registrarse.
 
---
 
## 8. Funciones RPC (lógica de negocio expuesta a la app)
 
### `request_redemption(p_enrollment_id uuid) → (redemption_id, code, expires_at)`
Llamada por el **cliente** desde la app cuando quiere canjear su premio.
 
Lógica:
1. Verifica que el `enrollment_id` pertenezca al usuario que llama (`auth.uid()`).
2. Libera reservas propias previas que hayan expirado sin usarse (devuelve esos sellos al pool disponible).
3. Cuenta sellos válidos: `status = 'confirmed' AND redemption_id IS NULL AND expires_at > now()`.
4. Si no alcanza el mínimo del programa activo, lanza error.
5. Genera un código aleatorio, lo guarda **hasheado** con TTL de 5 minutos.
6. Bloquea (`FOR UPDATE`) y reserva los **N sellos más antiguos** (orden FIFO — First In, First Out) asignándoles el `redemption_id`.
7. Devuelve el código en texto plano **solo esta vez**, para mostrarlo como QR/código en la app.
Esto corre en una sola transacción, por lo que dos solicitudes simultáneas del mismo cliente no pueden reservar los mismos sellos dos veces.
 
### `confirm_redemption(p_redemption_id uuid, p_code text) → boolean`
Llamada por el **staff** al escanear el código en mostrador.
 
Lógica:
1. Verifica que quien llama sea `is_member_of` del negocio dueño del canje.
2. Verifica que el canje siga `pending` y no haya expirado.
3. Compara el código recibido contra el hash guardado.
4. Si todo es válido, marca `status = 'redeemed'`, guarda quién y cuándo.
---
 
## 9. Matriz de políticas RLS (resumen)
 
| Tabla | Cliente (dueño) | Staff del negocio | `service_role` (backend) |
|---|---|---|---|
| `profiles` | SELECT/UPDATE/INSERT propio | — | acceso total |
| `businesses` | SELECT si enrolado | SELECT si miembro, UPDATE si manager/owner | acceso total |
| `locations` | SELECT si enrolado | CRUD si manager/owner | acceso total |
| `business_members` | — | SELECT si miembro, CRUD si manager/owner | acceso total |
| `enrollments` | SELECT/INSERT propio | SELECT si miembro | acceso total |
| `stamp_programs` | SELECT solo si `active` | SELECT si miembro, CRUD si manager/owner | acceso total |
| `nfc_tags` | **sin acceso** | **sin acceso** | acceso total (única vía de lectura/escritura) |
| `visits` | SELECT propio, **sin INSERT/UPDATE** | SELECT si miembro | INSERT (único escritor real) |
| `redemptions` | SELECT propio, sin INSERT/UPDATE directo (usa RPC) | SELECT si miembro | acceso total |
| `audit_log` | — | — | acceso total |
 
---
 
## 10. Resultados de las pruebas de aislamiento RLS
 
Se simuló cada rol asignando manualmente `request.jwt.claim.sub` (el identificador de usuario que Postgres usa para resolver `auth.uid()`) dentro de transacciones que se revirtieron (`ROLLBACK`) al final, para no dejar rastro en la base real.
 
| # | Prueba | Esperado | Obtenido | Resultado |
|---|---|---|---|---|
| 1 | Cliente ajeno a Negocio X (`cliente_b`) intenta leer `visits`, `enrollments`, `nfc_tags`, `businesses` | 0 filas en todo | 0 filas en todo | ✅ |
| 2 | Dueño real de la visita (`cliente_a`) lee sus propios datos | 1 visita, 1 enrollment visibles; `nfc_tags` en 0 | Igual | ✅ |
| 3 | Staff de Negocio X lee datos de su negocio | 1 visita, 1 enrollment visibles; `nfc_tags` en 0 | Igual | ✅ |
| 4 | Cliente intenta `INSERT` directo en `visits` (bypaseando el backend) | Rechazado por RLS, 0 filas insertadas | Rechazado, 0 filas | ✅ |
 
**Conclusión:** ni el dueño de una visita ni el staff del negocio pueden leer `nfc_tags` bajo ninguna circunstancia — solo `service_role` (el backend) tiene acceso, confirmando que el diseño "deny-by-default" funciona como se esperaba. Ningún cliente puede escribir directamente en `visits`; la única vía de escritura es la futura Edge Function con `service_role`.
 
## 11. Hallazgos de seguridad (`get_advisors`) y corrección aplicada
 
Se corrió el linter (analizador automático de reglas de seguridad) de Supabase después del esquema inicial. Resultado y acción tomada:
 
| Hallazgo | Nivel | Diagnóstico | Acción |
|---|---|---|---|
| `nfc_tags` / `audit_log` sin políticas | INFO | Intencional — deny-by-default | Ninguna, es el diseño correcto |
| `handle_new_user` ejecutable por `anon`/`authenticated` vía RPC | WARN | Es un trigger, nunca debería llamarse manualmente | **Corregido:** `REVOKE EXECUTE ... FROM anon, authenticated, public` |
| `is_member_of` / `is_manager_of` ejecutable por `anon` | WARN | No deberían ser invocables sin sesión | **Corregido:** revocado de `anon` y `public`; se conserva en `authenticated` porque las políticas RLS lo necesitan para evaluarse |
| `request_redemption` / `confirm_redemption` ejecutable por `anon` | WARN | Nadie sin sesión debería poder solicitar o confirmar un canje | **Corregido:** revocado de `anon` y de `public` |
| `auth_leaked_password_protection` deshabilitada | WARN | Supabase puede rechazar contraseñas ya filtradas en brechas públicas (validado contra HaveIBeenPwned) | **Pendiente — acción manual:** activar en el dashboard, Authentication → Policies. No es un cambio de SQL |
 
### Nota técnica importante para el futuro (lección aprendida)
 
Al revocar permisos de ejecución de una función en Postgres, **no basta con `REVOKE EXECUTE ... FROM anon`**. Toda función nueva otorga automáticamente permiso de ejecución a `PUBLIC` (el rol implícito al que pertenecen todos los roles, incluido `anon`). Si no se revoca también de `PUBLIC`, el rol `anon` conserva el acceso heredado y el `REVOKE` específico no tiene efecto real, aunque no arroje ningún error. La secuencia correcta y ya aplicada en este proyecto es:
 
```sql
revoke execute on function public.mi_funcion(...) from public;
grant execute on function public.mi_funcion(...) to authenticated; -- solo si corresponde
```
 
## 12. Estado final del proyecto
 
- Todos los datos sintéticos de prueba (3 usuarios, 2 negocios, 1 sucursal, 1 tag, 1 programa, 1 enrollment, 1 visita) **fueron eliminados**. El proyecto quedó en estado limpio, listo para datos reales.
- Verificación posterior a la limpieza: `visits: 0, businesses: 0, auth.users: 0`.
## 13. Próximas fases (no ejecutado aún)
 
- 🔜 **Fase 2:** Edge Function de validación de tap NFC — verifica firma CMAC contra la llave en Vault, valida contador (`sdm_counter` > `last_counter`), geofence y rate limit; es la única que puede insertar en `visits` con `service_role`.
- 🔜 **Fase 2:** Herramienta de aprovisionamiento (provisioning) de tags NTAG 424 DNA — programa la plantilla NDEF con SDM, diversifica llaves AES por UID, bloquea configuración.
- 🔜 **Fase 3:** App React Native (Expo dev build) — enrolamiento, lectura NFC, cola offline cifrada (SQLite/MMKV) con sincronización en background.
- 🔜 **Fase 4:** App de staff (escáner de código de canje) + panel web Next.js para gestión desde PC.
- 🔜 **Fase 5:** Notificaciones push (sellos por vencer) + métricas para negocios.
