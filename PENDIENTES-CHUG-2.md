# Pendientes de Raúl: épica CHUG-2 (Stamp)

Estado al 2026-11-05. Todo el código está en `dev`; esto es lo que no pude hacer desde la sesión.

## 1. Rápidos (hoy o mañana)

- [ ] **Definir `QR_SECRET`** (CHUG-22). Mínimo 32 caracteres; sin esta variable `/q` y el QR de la caja responden error.
  ```bash
  openssl rand -base64 48
  ```
  Ponerlo en Vercel (dev y producción) y en `.env.local`.
- [ ] **Correr el e2e de `/sello`** (CHUG-16). Hoy 4 pruebas se saltan. Crea y borra datos sintéticos propios.
  ```bash
  E2E_SUPABASE_URL=… E2E_SUPABASE_PUBLISHABLE_KEY=… E2E_SUPABASE_SECRET_KEY=… pnpm test:e2e
  ```
  Si prefieres que lo corra yo, pásame esas tres variables en el entorno de la sesión.
- [ ] **Prueba manual del QR** en `chugi.rulasvrdz.com`: entrar como Caja → "Mostrar QR de sello" → escanear con el celular. Comprobar que el mismo QR escaneado dos veces se rechaza y que se cierra solo.
- [ ] **Mover estados en Jira.** No cambié ninguno. Sugerencia: CHUG-15, 16 y 22 con código terminado; CHUG-14 en curso (falta hardware); CHUG-30 y CHUG-42 sin empezar.

## 2. Vault (CHUG-14)

- [ ] Crear los tres secretos de la versión de llaves (`<ref>` = por ejemplo `1`), 32 hex cada uno. En el SQL editor de `sellos-app`:
  ```sql
  select vault.create_secret('<32 hex>', 'sdm_meta_<ref>');
  select vault.create_secret('<32 hex>', 'sdm_file_master_<ref>');
  select vault.create_secret('<32 hex>', 'sdm_app_master_<ref>');
  ```
  Genera cada valor con `openssl rand -hex 16`.
- [ ] **Respaldar las tres llaves** en un gestor de contraseñas. Sin ellas los tags de esa versión no se pueden volver a configurar.

## 3. Hardware (CHUG-42, bloquea CHUG-14 y CHUG-30)

- [ ] Comprar 5–10 tags NTAG 424 DNA, un lector ACR1252U y el sello 3D (envío a México: 1–3 semanas).
- [ ] Instalar el módulo nativo del lector en tu máquina (Linux: antes `libpcsclite-dev` y `pcscd`):
  ```bash
  pnpm approve-builds
  pnpm rebuild @pokusew/pcsclite
  ```

## 4. Primer tag de práctica (CHUG-14)

Leer antes `scripts/ntag424/LEEME.md`. **El script no está probado con un chip real.**

- [ ] `pnpm tag:program inspect` (solo lectura). Si falla la autenticación, el problema está en la capa de protocolo y todavía no se escribió nada.
- [ ] `pnpm tag:program program --domain chugi.rulasvrdz.com --location <uuid de la sucursal> --key-ref <ref>`
- [ ] Acercar un celular: debe abrir `/t` y terminar en `/sello`.
- [ ] Si algo falla, revisar los puntos dudosos de `LEEME.md`: nibbles de `SDMAccessRights` (el script prueba A y B), CRC32 de `ChangeKey` (si está mal, el tag responde 911E y no cambia nada) y offsets del NDEF. Si un intento a medias deja llaves cambiadas, repetir con `--resume`.

## 5. Antes de los tags definitivos (CHUG-30)

- [ ] Decidir el **dominio de producción** (PLAN.md §9.2, pregunta abierta 1). Los tags se programan después de fijarlo.
- [ ] Versión nueva de llaves en Vault para producción (paso 2 con otro `<ref>`).
- [ ] Programar 1–2 tags, meterlos en el sello 3D, probar con iPhone XS+ y un Android, y registrar ubicación física y fecha de instalación.
- [ ] `pnpm tag:program revoke --uid <UID>` para los tags de prueba que existan en producción.
- [ ] Las migraciones a producción las aplicas tú (`get_sdm_app_key` hoy solo está en `sellos-app`, que hace de dev).

## 6. Producto

- [ ] `/registro` es un marcador de posición hasta la rebanada 3: un cliente sin sesión termina ahí y el sello no se suma. Priorizar esa story para probar el flujo completo con celular.

## Referencias

- Jira: comentario consolidado en CHUG-2 y uno por tarea.
- Migración aplicada: `get_sdm_app_key` en `sellos-app`, versión `20261105073132` (en el repo: `20261105065324`).
- Docs: `docs/configuracion-base-datos.md` §16 y `scripts/ntag424/LEEME.md`.
