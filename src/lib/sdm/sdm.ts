import { createDecipheriv, timingSafeEqual } from 'node:crypto';
import { aesCmac } from './aes-cmac';

// Primitivas SDM del NTAG 424 DNA (NXP AN12196) y diversificación de llaves (AN10922).
// Código puro: no lee variables de entorno ni toca la base.

const UID_LENGTH = 7;
const PICC_TAG_UID_AND_COUNTER = 0xc7;

// AN10922: el material de diversificación es 0x01 || UID || identificador del sistema.
// El identificador es fijo y nuestro; cambiarlo invalida todos los tags programados.
const DIVERSIFICATION_SYSTEM_ID = Buffer.from('chugi', 'ascii');

export type PiccData = { uid: Buffer; counter: number };

// Descifra PICCData (AES-128-CBC, IV cero) con K_meta. Devuelve null si el formato no es
// el esperado: tag 0xC7 (UID y contador espejados, UID de 7 bytes).
export function decryptPicc(
  metaKey: Buffer,
  encrypted: Buffer,
): PiccData | null {
  if (encrypted.length !== 16) return null;
  const decipher = createDecipheriv('aes-128-cbc', metaKey, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  if (plain[0] !== PICC_TAG_UID_AND_COUNTER) return null;
  const uid = plain.subarray(1, 1 + UID_LENGTH);
  const counter = plain.readUIntLE(1 + UID_LENGTH, 3);
  return { uid: Buffer.from(uid), counter };
}

// CMAC de SDM: llave de sesión = CMAC(K_file, SV2); el MAC se calcula sobre una entrada
// vacía (el tag se programa con el offset de entrada igual al del MAC) y se trunca a los
// bytes de índice impar.
export function computeSdmMac(
  fileKey: Buffer,
  uid: Buffer,
  counter: number,
): Buffer {
  const ctr = Buffer.alloc(3);
  ctr.writeUIntLE(counter, 0, 3);
  const sv2 = Buffer.concat([
    Buffer.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80]),
    uid,
    ctr,
  ]);
  const sessionKey = aesCmac(fileKey, sv2);
  const full = aesCmac(sessionKey, Buffer.alloc(0));
  const truncated = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) truncated[i] = full[2 * i + 1] ?? 0;
  return truncated;
}

export function macMatches(expected: Buffer, received: Buffer): boolean {
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

// K_file = CMAC(K_master, 0x01 || UID || system id). Para AES-128 esto es el algoritmo de
// AN10922 (el relleno 0x80 y la subllave K2 son los de CMAC).
export function diversifyKey(masterKey: Buffer, uid: Buffer): Buffer {
  return aesCmac(
    masterKey,
    Buffer.concat([Buffer.from([0x01]), uid, DIVERSIFICATION_SYSTEM_ID]),
  );
}

// Variante con el material completo de AN10922, para validar contra el vector oficial.
export function diversifyKeyRaw(masterKey: Buffer, material: Buffer): Buffer {
  return aesCmac(masterKey, Buffer.concat([Buffer.from([0x01]), material]));
}
