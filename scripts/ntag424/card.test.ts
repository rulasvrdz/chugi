import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aesCmac } from '../../src/lib/sdm/aes-cmac';
import {
  buildNdefSdmSettings,
  CardError,
  Ntag424Card,
  sdmAccessRights,
  SW,
  type Transport,
} from './card';
import { changeKeyCrc, deriveSessionKeys, truncateMac } from './ev2';

// Tag simulado: implementa el lado del tag de AuthenticateEV2First y de la mensajería
// segura en modo Full, escrito aparte del código bajo prueba. Detecta incoherencias de
// relleno, orden de campos y contadores; NO sustituye una prueba con un chip real.
const ZERO_IV = Buffer.alloc(16);
const aes = (mode: 'enc' | 'dec', key: Buffer, iv: Buffer, data: Buffer) => {
  const c =
    mode === 'enc'
      ? createCipheriv('aes-128-cbc', key, iv)
      : createDecipheriv('aes-128-cbc', key, iv);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(data), c.final()]);
};
const sw = (code: number) => Buffer.from([code >> 8, code & 0xff]);
const ctr2 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};

class FakeTag {
  keys: Record<number, Buffer>;
  received: { cmd: number; header: Buffer; data: Buffer }[] = [];
  private rndB = Buffer.alloc(0);
  private keyNo = 0;
  private enc: Buffer = Buffer.alloc(0);
  private mac: Buffer = Buffer.alloc(0);
  private ti = Buffer.alloc(0);
  private ctr = 0;
  corruptResponseMac = false;

  constructor(keys: Record<number, Buffer>) {
    this.keys = keys;
  }

  transport: Transport = {
    transmit: async (apdu) => this.handle(apdu),
  };

  private handle(apdu: Buffer): Buffer {
    const ins = apdu[1] ?? 0;
    const body = apdu.subarray(5, apdu.length - 1);
    if (ins === 0x71) {
      this.keyNo = body[0] ?? 0;
      this.rndB = randomBytes(16);
      return Buffer.concat([
        aes('enc', this.keys[this.keyNo] as Buffer, ZERO_IV, this.rndB),
        sw(SW.MORE),
      ]);
    }
    if (ins === 0xaf) {
      const key = this.keys[this.keyNo] as Buffer;
      const plain = aes('dec', key, ZERO_IV, body);
      const rndA = plain.subarray(0, 16);
      const rotatedB = Buffer.concat([
        this.rndB.subarray(1),
        this.rndB.subarray(0, 1),
      ]);
      if (!plain.subarray(16).equals(rotatedB)) return sw(SW.AUTH_ERROR);
      this.ti = randomBytes(4);
      const session = deriveSessionKeys(key, rndA, this.rndB);
      this.enc = session.enc;
      this.mac = session.mac;
      this.ctr = 0;
      const rotatedA = Buffer.concat([rndA.subarray(1), rndA.subarray(0, 1)]);
      return Buffer.concat([
        aes(
          'enc',
          key,
          ZERO_IV,
          Buffer.concat([this.ti, rotatedA, Buffer.alloc(12)]),
        ),
        sw(SW.NATIVE_OK),
      ]);
    }
    // Comandos nativos en modo Full: cabecera || datos cifrados || MAC.
    const headerLength = ins === 0x5f || ins === 0xc4 ? 1 : 0;
    const header = body.subarray(0, headerLength);
    const encrypted = body.subarray(headerLength, body.length - 8);
    const received = body.subarray(body.length - 8);
    const expected = truncateMac(
      aesCmac(
        this.mac,
        Buffer.concat([
          Buffer.from([ins]),
          ctr2(this.ctr),
          this.ti,
          header,
          encrypted,
        ]),
      ),
    );
    if (!received.equals(expected)) return sw(SW.INTEGRITY_ERROR);

    const iv = aes(
      'enc',
      this.enc,
      ZERO_IV,
      Buffer.concat([
        Buffer.from([0xa5, 0x5a]),
        this.ti,
        ctr2(this.ctr),
        Buffer.alloc(8),
      ]),
    );
    const padded = encrypted.length
      ? aes('dec', this.enc, iv, encrypted)
      : Buffer.alloc(0);
    const end = padded.lastIndexOf(0x80);
    this.received.push({
      cmd: ins,
      header,
      data: encrypted.length ? padded.subarray(0, end) : padded,
    });

    this.ctr += 1;
    // Cambiar la llave de la sesión la termina: respuesta sin MAC.
    if (ins === 0xc4 && header[0] === this.keyNo) return sw(SW.NATIVE_OK);

    const responseMac = truncateMac(
      aesCmac(
        this.mac,
        Buffer.concat([Buffer.from([0x00]), ctr2(this.ctr), this.ti]),
      ),
    );
    if (this.corruptResponseMac) responseMac[0] = (responseMac[0] ?? 0) ^ 0xff;
    return Buffer.concat([responseMac, sw(SW.NATIVE_OK)]);
  }
}

const key0 = Buffer.alloc(16, 0x00);
const newKey = Buffer.alloc(16, 0x5a);

async function authenticated(tag: FakeTag, keyNo = 0, key = key0) {
  const card = new Ntag424Card(tag.transport);
  await card.authenticate(keyNo, key);
  return card;
}

describe('autenticación EV2', () => {
  it('autentica con la llave correcta', async () => {
    const tag = new FakeTag({ 0: key0 });
    await expect(authenticated(tag)).resolves.toBeDefined();
  });

  it('con una llave equivocada falla con 91AE', async () => {
    const tag = new FakeTag({ 0: key0 });
    const card = new Ntag424Card(tag.transport);
    await expect(
      card.authenticate(0, Buffer.alloc(16, 0x11)),
    ).rejects.toMatchObject({
      sw: SW.AUTH_ERROR,
    });
    await expect(
      card.authenticate(0, Buffer.alloc(16, 0x11)),
    ).rejects.toBeInstanceOf(CardError);
  });
});

describe('mensajería segura (modo Full)', () => {
  it('ChangeFileSettings llega íntegro, cifrado con relleno y con MAC válido', async () => {
    const tag = new FakeTag({ 0: key0 });
    const card = await authenticated(tag);
    const settings = buildNdefSdmSettings('A', 45, 83);
    await card.changeFileSettings(2, settings);

    expect(tag.received).toHaveLength(1);
    expect(tag.received[0]?.cmd).toBe(0x5f);
    expect(tag.received[0]?.header).toEqual(Buffer.from([0x02]));
    expect(tag.received[0]?.data).toEqual(settings);
  });

  it('varios comandos seguidos mantienen sincronizado CmdCtr', async () => {
    const tag = new FakeTag({ 0: key0 });
    const card = await authenticated(tag);
    await card.changeFileSettings(2, buildNdefSdmSettings('A', 45, 83));
    await card.changeKey(1, newKey, key0);
    await card.changeKey(2, newKey, key0);
    expect(tag.received.map((r) => r.cmd)).toEqual([0x5f, 0xc4, 0xc4]);
  });

  it('ChangeKey de otra llave: NuevaLlave XOR LlaveActual, versión y CRC32', async () => {
    const tag = new FakeTag({ 0: key0 });
    const card = await authenticated(tag);
    const current = Buffer.alloc(16, 0x33);
    await card.changeKey(2, newKey, current);

    const sent = tag.received[0];
    expect(sent?.header).toEqual(Buffer.from([2]));
    const xored = Buffer.from(newKey.map((b, i) => b ^ (current[i] ?? 0)));
    expect(sent?.data).toEqual(
      Buffer.concat([xored, Buffer.from([0x01]), changeKeyCrc(newKey)]),
    );
  });

  it('ChangeKey de la llave autenticada: solo la llave nueva y la versión', async () => {
    const tag = new FakeTag({ 0: key0 });
    const card = await authenticated(tag);
    await card.changeKey(0, newKey, key0);
    expect(tag.received[0]?.data).toEqual(
      Buffer.concat([newKey, Buffer.from([0x01])]),
    );
    // La sesión terminó: otro comando sin reautenticar no puede enviarse.
    await expect(
      card.changeFileSettings(2, Buffer.from([0x40])),
    ).rejects.toThrow(/sin sesión/);
  });

  it('un MAC de respuesta alterado se rechaza', async () => {
    const tag = new FakeTag({ 0: key0 });
    const card = await authenticated(tag);
    tag.corruptResponseMac = true;
    await expect(card.changeKey(1, newKey, key0)).rejects.toThrow(/MAC/);
  });
});

describe('ChangeFileSettings del archivo NDEF', () => {
  it('estructura: 15 bytes, SDM activo, escritura solo con key 0', () => {
    const data = buildNdefSdmSettings('A', 0x2d, 0x53);
    expect(data).toHaveLength(15);
    expect([...data.subarray(0, 4)]).toEqual([0x40, 0x00, 0xe0, 0xc1]);
    // Offsets de 3 bytes little-endian: PICCData, entrada del MAC (= MAC) y MAC.
    expect([...data.subarray(6, 9)]).toEqual([0x2d, 0x00, 0x00]);
    expect([...data.subarray(9, 12)]).toEqual([0x53, 0x00, 0x00]);
    expect([...data.subarray(12, 15)]).toEqual([0x53, 0x00, 0x00]);
  });

  it('las dos posiciones de SDMAccessRights ponen K_meta=1 y K_file=2', () => {
    expect([...sdmAccessRights('A')]).toEqual([0xff, 0x12]);
    expect([...sdmAccessRights('B')]).toEqual([0x12, 0xff]);
  });
});
