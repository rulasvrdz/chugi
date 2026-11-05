import { createCipheriv } from 'node:crypto';

// AES-128-CMAC (RFC 4493) sobre node:crypto, sin dependencias.
const BLOCK = 16;
const RB = 0x87;

function encryptBlock(key: Buffer, block: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function shiftLeft(block: Buffer): Buffer {
  const out = Buffer.alloc(BLOCK);
  let carry = 0;
  for (let i = BLOCK - 1; i >= 0; i--) {
    const byte = block[i] ?? 0;
    out[i] = ((byte << 1) | carry) & 0xff;
    carry = byte >> 7;
  }
  return out;
}

function subkeys(key: Buffer): { k1: Buffer; k2: Buffer } {
  const l = encryptBlock(key, Buffer.alloc(BLOCK));
  const k1 = shiftLeft(l);
  if (((l[0] ?? 0) & 0x80) !== 0) k1[BLOCK - 1] = (k1[BLOCK - 1] ?? 0) ^ RB;
  const k2 = shiftLeft(k1);
  if (((k1[0] ?? 0) & 0x80) !== 0) k2[BLOCK - 1] = (k2[BLOCK - 1] ?? 0) ^ RB;
  return { k1, k2 };
}

export function aesCmac(key: Buffer, message: Buffer): Buffer {
  if (key.length !== BLOCK) throw new Error('AES-128 key must be 16 bytes');
  const { k1, k2 } = subkeys(key);

  const blocks = Math.max(1, Math.ceil(message.length / BLOCK));
  const complete = message.length > 0 && message.length % BLOCK === 0;

  const last = Buffer.alloc(BLOCK);
  const lastStart = (blocks - 1) * BLOCK;
  if (complete) {
    const tail = message.subarray(lastStart);
    for (let i = 0; i < BLOCK; i++) last[i] = (tail[i] ?? 0) ^ (k1[i] ?? 0);
  } else {
    const tail = message.subarray(lastStart);
    tail.copy(last);
    last[tail.length] = 0x80;
    for (let i = 0; i < BLOCK; i++) last[i] = (last[i] ?? 0) ^ (k2[i] ?? 0);
  }

  let x: Buffer = Buffer.alloc(BLOCK);
  for (let b = 0; b < blocks - 1; b++) {
    const chunk = message.subarray(b * BLOCK, (b + 1) * BLOCK);
    const mixed = Buffer.alloc(BLOCK);
    for (let i = 0; i < BLOCK; i++) mixed[i] = (x[i] ?? 0) ^ (chunk[i] ?? 0);
    x = encryptBlock(key, mixed);
  }
  const finalBlock = Buffer.alloc(BLOCK);
  for (let i = 0; i < BLOCK; i++) finalBlock[i] = (x[i] ?? 0) ^ (last[i] ?? 0);
  return encryptBlock(key, finalBlock);
}
