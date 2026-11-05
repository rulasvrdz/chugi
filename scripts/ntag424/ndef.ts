import { z } from 'zod';

// Plantilla NDEF del tag y offsets de SDM (PLAN.md §3.1 y §4.2):
//   https://<dominio>/t?v=<ver>&p=<32 hex>&m=<16 hex>
// El tag sustituye `p` (UID y contador cifrados) y `m` (CMAC) en cada lectura.

export const PICC_HEX_LENGTH = 32;
export const MAC_HEX_LENGTH = 16;

export const domainSchema = z
  .string()
  .regex(
    /^(?=.{1,100}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i,
    'Dominio inválido (sin https:// ni ruta)',
  );

export const keyRefSchema = z.string().regex(/^[a-z0-9_-]{1,16}$/i);

export type NdefTemplate = {
  // Contenido completo del archivo NDEF: NLEN (2 bytes) y el registro.
  file: Buffer;
  piccDataOffset: number;
  macOffset: number;
};

// Registro NDEF de tipo URI (TNF 1, tipo "U"), de un solo registro y payload corto.
export function buildNdefTemplate(
  domain: string,
  keyRef: string,
): NdefTemplate {
  const rest = `${domain.toLowerCase()}/t?v=${keyRef}&p=`;
  const uri = `${rest}${'0'.repeat(PICC_HEX_LENGTH)}&m=${'0'.repeat(MAC_HEX_LENGTH)}`;

  // 0x04 = prefijo "https://".
  const payload = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(uri, 'ascii'),
  ]);
  if (payload.length > 255) throw new Error('La URL es demasiado larga');

  const record = Buffer.concat([
    Buffer.from([0xd1, 0x01, payload.length, 0x55]),
    payload,
  ]);
  const file = Buffer.concat([
    Buffer.from([record.length >> 8, record.length & 0xff]),
    record,
  ]);

  // Los offsets cuentan desde el inicio del archivo: NLEN (2) + cabecera del registro (4)
  // + código de prefijo (1) = 7 bytes antes del primer carácter de la URL.
  const piccDataOffset = 7 + rest.length;
  const macOffset = piccDataOffset + PICC_HEX_LENGTH + '&m='.length;
  return { file, piccDataOffset, macOffset };
}

// Extrae la URL "https://…" del contenido leído del archivo NDEF. null si no es un solo
// registro URI con prefijo https://.
export function parseNdefUrl(file: Buffer): URL | null {
  if (file.length < 7) return null;
  const nlen = file.readUInt16BE(0);
  const record = file.subarray(2, 2 + nlen);
  if (record[0] !== 0xd1 || record[1] !== 0x01 || record[3] !== 0x55)
    return null;
  const payloadLength = record[2] ?? 0;
  const payload = record.subarray(4, 4 + payloadLength);
  if (payload[0] !== 0x04) return null;
  try {
    return new URL(`https://${payload.subarray(1).toString('ascii')}`);
  } catch {
    return null;
  }
}
