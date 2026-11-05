# Programar tags NTAG 424 DNA (CHUG-14)

> **Estado: sin probar contra un chip real.** El código sigue el datasheet NT4H2421Gx y la nota AN12196, y está probado con un tag simulado y con los vectores de NXP donde se pudo (CMAC, descifrado de PICCData, diversificación). Los puntos dudosos están marcados abajo. Empieza siempre con un **tag de práctica**.

## Requisitos

- Lector USB ACR1252U y tags NTAG 424 DNA (CHUG-42).
- Linux: `sudo apt install pcscd libpcsclite-dev` y el servicio `pcscd` activo. macOS: viene incluido. Windows: el servicio "Smart Card" ya está.
- Módulo nativo opcional: `pnpm approve-builds` (aprueba `@pokusew/pcsclite`) y después `pnpm rebuild @pokusew/pcsclite`.
- `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` del proyecto destino.
- Los tres secretos de la versión de llaves en Vault (`docs/configuracion-base-datos.md` §16).

## Uso

```bash
pnpm tag:program inspect
pnpm tag:program program --domain chugi.rulasvrdz.com --location <uuid de la sucursal> --key-ref 1
pnpm tag:program revoke --uid 04A1B2C3D4E5F6
```

1. **`inspect`** solo lee: UID (últimos 4 dígitos), si la llave 0 sigue por defecto y la URL del NDEF. Úsalo primero en el tag de práctica; si falla la autenticación, el problema está en la capa de protocolo y todavía no se escribió nada.
2. **`program`**: escribe la plantilla `https://<dominio>/t?v=<ver>&p=<32 ceros>&m=<16 ceros>`, cambia las llaves 1 a 4, activa SDM, **lee la URL de vuelta y la valida con las mismas funciones que `/t`**, cambia la llave 0 al final y solo entonces registra el tag en `nfc_tags`. Si algo falla antes de cambiar la llave 0, el tag sigue configurable.
3. **`revoke`** marca el tag como `revoked` en la base (los tags de prueba, antes de los definitivos).

Llaves: key 0 y key 2 se diversifican por UID (AN10922) desde `sdm_app_master_<ref>` y `sdm_file_master_<ref>`; key 1 es `sdm_meta_<ref>`, común; keys 3 y 4 no se usan. Ninguna se imprime ni se escribe a disco. La escritura del NDEF y los cambios de configuración exigen la llave 0; no se usa el bloqueo irreversible del chip.

## Puntos dudosos (si algo falla, empieza aquí)

| Punto                                                                   | Qué hace el script                                                                   | Cómo se detecta                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Posición de los nibbles de `SDMAccessRights` (datasheet contra AN12196) | Prueba la disposición A y, si la lectura no verifica, la B. El resultado se imprime. | `program` imprime `SDMAccessRights=A                                              | B`. Si ninguna verifica, aborta antes de tocar la llave 0. |
| CRC32 de `ChangeKey`                                                    | CRC-32 estándar invertido (JAMCRC), little-endian.                                   | El tag responde `911E` y no cambia nada.                                          |
| Re-ejecutar tras un fallo a medias                                      | Si las llaves 1 a 4 ya cambiaron, el tag rechaza el cambio con `911E`.               | Repite con `--resume`. Si la llave 0 ya es la nuestra, `--resume` se aplica solo. |
| El contador SDM sube con cada lectura                                   | La verificación final lee el NDEF una vez por intento.                               | Normal: `last_counter` en la base no se toca.                                     |

## Después de programar

Acerca un celular al tag: debe abrir `/t` y terminar en `/sello`. Para tags de campo (CHUG-30) usa el dominio de producción y una versión nueva de llaves.
