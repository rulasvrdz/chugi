import { createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { aesCmac } from '../../src/lib/sdm/aes-cmac';

// Capa criptográfica de NTAG 424 DNA (NT4H2421Gx, secciones 9.1 y 11): AuthenticateEV2First
// y mensajería segura en modo Full. NO está probada contra un chip real (ver docs/PLAN.md §9).
// Código puro: no habla con el lector ni con la base.

const ZERO_IV = Buffer.alloc(16);

function cbc(
  mode: 'enc' | 'dec',
  key: Buffer,
  iv: Buffer,
  data: Buffer,
): Buffer {
  const cipher =
    mode === 'enc'
      ? createCipheriv('aes-128-cbc', key, iv)
      : createDecipheriv('aes-128-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export const encryptCbc = (key: Buffer, iv: Buffer, data: Buffer) =>
  cbc('enc', key, iv, data);
export const decryptCbc = (key: Buffer, iv: Buffer, data: Buffer) =>
  cbc('dec', key, iv, data);

// MAC truncado: los bytes de índice impar del CMAC de 16 bytes.
export function truncateMac(full: Buffer): Buffer {
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) out[i] = full[2 * i + 1] ?? 0;
  return out;
}

// Relleno ISO/IEC 9797-1 método 2: 0x80 y ceros hasta completar bloque (siempre agrega).
export function pad(data: Buffer): Buffer {
  const padded = Buffer.alloc(Math.floor(data.length / 16) * 16 + 16);
  data.copy(padded);
  padded[data.length] = 0x80;
  return padded;
}

export function unpad(data: Buffer): Buffer {
  const end = data.lastIndexOf(0x80);
  if (end < 0) throw new Error('relleno inválido');
  return data.subarray(0, end);
}

export const rotateLeft = (b: Buffer) =>
  Buffer.concat([b.subarray(1), b.subarray(0, 1)]);

// CRC32 de ChangeKey: el CRC-32 estándar con el resultado invertido (JAMCRC), en little-endian.
export function changeKeyCrc(newKey: Buffer): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(~crc32(newKey) >>> 0);
  return out;
}

export function deriveSessionKeys(
  key: Buffer,
  rndA: Buffer,
  rndB: Buffer,
): { enc: Buffer; mac: Buffer } {
  const mixed = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) mixed[i] = (rndA[2 + i] ?? 0) ^ (rndB[i] ?? 0);
  const tail = (prefix: number[]) =>
    Buffer.concat([
      Buffer.from(prefix),
      rndA.subarray(0, 2),
      mixed,
      rndB.subarray(6),
      rndA.subarray(8),
    ]);
  return {
    enc: aesCmac(key, tail([0xa5, 0x5a, 0x00, 0x01, 0x00, 0x80])),
    mac: aesCmac(key, tail([0x5a, 0xa5, 0x00, 0x01, 0x00, 0x80])),
  };
}

// Parte 2 de AuthenticateEV2First: E(K, RndA || RndB'), con RndB' = RndB rotado.
export function buildAuthPart2(key: Buffer, rndA: Buffer, rndB: Buffer) {
  return encryptCbc(key, ZERO_IV, Buffer.concat([rndA, rotateLeft(rndB)]));
}

export function decryptRndB(key: Buffer, encryptedRndB: Buffer): Buffer {
  return decryptCbc(key, ZERO_IV, encryptedRndB);
}

// Respuesta de la parte 2: TI(4) || RndA'(16) || capacidades(12). Verifica RndA'.
export function readAuthPart2Response(
  key: Buffer,
  rndA: Buffer,
  response: Buffer,
): Buffer {
  const plain = decryptCbc(key, ZERO_IV, response);
  const ti = plain.subarray(0, 4);
  const rndAPrime = plain.subarray(4, 20);
  if (!timingSafeEqual(rndAPrime, rotateLeft(rndA))) {
    throw new Error('El tag no demostró conocer la llave (RndA no coincide)');
  }
  return Buffer.from(ti);
}

// Sesión autenticada. CmdCtr arranca en 0 y avanza una vez por comando.
export class Ev2Session {
  cmdCtr = 0;

  constructor(
    readonly ti: Buffer,
    private readonly encKey: Buffer,
    private readonly macKey: Buffer,
  ) {}

  private counter(): Buffer {
    const c = Buffer.alloc(2);
    c.writeUInt16LE(this.cmdCtr);
    return c;
  }

  private iv(prefix: [number, number]): Buffer {
    const block = Buffer.concat([
      Buffer.from(prefix),
      this.ti,
      this.counter(),
      Buffer.alloc(8),
    ]);
    return encryptCbc(this.encKey, ZERO_IV, block);
  }

  // Campo de datos del comando en modo Full: cabecera || datos cifrados || MAC.
  wrapFull(cmd: number, header: Buffer, data: Buffer): Buffer {
    const encrypted = data.length
      ? encryptCbc(this.encKey, this.iv([0xa5, 0x5a]), pad(data))
      : Buffer.alloc(0);
    const macInput = Buffer.concat([
      Buffer.from([cmd]),
      this.counter(),
      this.ti,
      header,
      encrypted,
    ]);
    const mac = truncateMac(aesCmac(this.macKey, macInput));
    return Buffer.concat([header, encrypted, mac]);
  }

  // Respuesta OK en modo Full: datos cifrados opcionales || MAC. Avanza CmdCtr, verifica el
  // MAC y devuelve los datos descifrados.
  unwrapFull(response: Buffer): Buffer {
    this.cmdCtr += 1;
    if (response.length < 8) throw new Error('Respuesta sin MAC');
    const body = response.subarray(0, response.length - 8);
    const received = response.subarray(response.length - 8);
    const expected = truncateMac(
      aesCmac(
        this.macKey,
        Buffer.concat([Buffer.from([0x00]), this.counter(), this.ti, body]),
      ),
    );
    if (!timingSafeEqual(received, expected)) {
      throw new Error('MAC de la respuesta inválido');
    }
    if (body.length === 0) return Buffer.alloc(0);
    return unpad(decryptCbc(this.encKey, this.iv([0x5a, 0xa5]), body));
  }
}

export function createSession(
  key: Buffer,
  rndA: Buffer,
  rndB: Buffer,
  ti: Buffer,
): Ev2Session {
  const { enc, mac } = deriveSessionKeys(key, rndA, rndB);
  return new Ev2Session(ti, enc, mac);
}
