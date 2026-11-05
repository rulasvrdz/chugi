import { randomBytes } from 'node:crypto';
import {
  buildAuthPart2,
  changeKeyCrc,
  createSession,
  decryptRndB,
  readAuthPart2Response,
  type Ev2Session,
} from './ev2';

// Comandos del NTAG 424 DNA sobre un transporte APDU. NO probado contra un chip real:
// los detalles de bytes siguen NT4H2421Gx y AN12196, y los puntos dudosos están marcados.

export type Transport = {
  // Devuelve la respuesta completa: datos || SW1 SW2.
  transmit(apdu: Buffer): Promise<Buffer>;
};

export class CardError extends Error {
  constructor(
    readonly step: string,
    readonly sw: number,
  ) {
    super(`${step}: la tarjeta respondió ${sw.toString(16).padStart(4, '0')}`);
  }
}

export const SW = {
  OK: 0x9000,
  NATIVE_OK: 0x9100,
  MORE: 0x91af,
  AUTH_ERROR: 0x91ae,
  INTEGRITY_ERROR: 0x911e,
  LENGTH_ERROR: 0x917e,
} as const;

const NDEF_APP = Buffer.from('D2760000850101', 'hex');
export const NDEF_FILE_NO = 0x02;
const NDEF_SFI = 0x82; // 0x80 | número de archivo, para ISOReadBinary / ISOUpdateBinary

const CMD = {
  AUTH_EV2_FIRST: 0x71,
  CHANGE_FILE_SETTINGS: 0x5f,
  CHANGE_KEY: 0xc4,
} as const;

// Dónde van los nibbles de SDMAccessRights es ambiguo entre el datasheet y AN12196. El
// script prueba A y, si la verificación falla, B (ver program-tag.ts).
//   A: [RFU|CtrRet, MetaRead|FileRead]    B: [MetaRead|FileRead, RFU|CtrRet]
export type SdmRightsLayout = 'A' | 'B';

export function sdmAccessRights(layout: SdmRightsLayout): Buffer {
  const ctrRet = 0x0f; // sin acceso al contador por comando
  const metaFile = (1 << 4) | 2; // MetaRead = key 1 (K_meta), FileRead = key 2 (K_file)
  const rfuCtr = 0xf0 | ctrRet;
  return layout === 'A'
    ? Buffer.from([rfuCtr, metaFile])
    : Buffer.from([metaFile, rfuCtr]);
}

const le3 = (n: number) => {
  const b = Buffer.alloc(3);
  b.writeUIntLE(n, 0, 3);
  return b;
};

// Datos de ChangeFileSettings para el archivo NDEF con SDM (UID y contador cifrados con
// key 1, CMAC con key 2, MAC sobre entrada vacía). Escritura y cambios solo con key 0.
export function buildNdefSdmSettings(
  layout: SdmRightsLayout,
  piccDataOffset: number,
  macOffset: number,
): Buffer {
  return Buffer.concat([
    Buffer.from([0x40]), // FileOption: SDM activo, CommMode plano
    Buffer.from([0x00, 0xe0]), // RW=0, Chg=0 | R=E (libre), W=0
    Buffer.from([0xc1]), // SDMOptions: UID + contador espejados, ASCII
    sdmAccessRights(layout),
    le3(piccDataOffset),
    le3(macOffset), // SDMMACInputOffset = SDMMACOffset: el MAC se calcula sobre nada
    le3(macOffset),
  ]);
}

export class Ntag424Card {
  private session: Ev2Session | null = null;
  private authKeyNo = -1;

  constructor(private readonly transport: Transport) {}

  private async send(step: string, apdu: Buffer) {
    const res = await this.transport.transmit(apdu);
    if (res.length < 2) throw new CardError(step, 0);
    return {
      data: res.subarray(0, res.length - 2),
      sw: res.readUInt16BE(res.length - 2),
    };
  }

  // UID por el comando del lector (ACR1252U), sin autenticar.
  async getUid(): Promise<Buffer> {
    const { data, sw } = await this.send(
      'UID',
      Buffer.from([0xff, 0xca, 0x00, 0x00, 0x00]),
    );
    if (sw !== SW.OK || data.length !== 7) throw new CardError('UID', sw);
    return Buffer.from(data);
  }

  async selectApplication(): Promise<void> {
    const { sw } = await this.send(
      'Select',
      Buffer.concat([
        Buffer.from([0x00, 0xa4, 0x04, 0x00, NDEF_APP.length]),
        NDEF_APP,
        Buffer.from([0x00]),
      ]),
    );
    if (sw !== SW.OK) throw new CardError('Select', sw);
  }

  private nativeApdu(cmd: number, data: Buffer): Buffer {
    return Buffer.concat([
      Buffer.from([0x90, cmd, 0x00, 0x00]),
      data.length ? Buffer.from([data.length]) : Buffer.alloc(0),
      data,
      Buffer.from([0x00]),
    ]);
  }

  // AuthenticateEV2First. Lanza CardError con SW 91AE si la llave no es la del tag.
  async authenticate(keyNo: number, key: Buffer): Promise<void> {
    this.session = null;
    const first = await this.send(
      'Auth1',
      this.nativeApdu(CMD.AUTH_EV2_FIRST, Buffer.from([keyNo, 0x00])),
    );
    if (first.sw !== SW.MORE) throw new CardError('Auth1', first.sw);

    const rndB = decryptRndB(key, first.data);
    const rndA = randomBytes(16);
    const second = await this.send(
      'Auth2',
      Buffer.concat([
        Buffer.from([0x90, 0xaf, 0x00, 0x00, 0x20]),
        buildAuthPart2(key, rndA, rndB),
        Buffer.from([0x00]),
      ]),
    );
    if (second.sw !== SW.NATIVE_OK) throw new CardError('Auth2', second.sw);

    const ti = readAuthPart2Response(key, rndA, second.data);
    this.session = createSession(key, rndA, rndB, ti);
    this.authKeyNo = keyNo;
  }

  private async fullCommand(
    step: string,
    cmd: number,
    header: Buffer,
    data: Buffer,
  ): Promise<Buffer> {
    if (!this.session) throw new Error(`${step}: sin sesión autenticada`);
    const { data: body, sw } = await this.send(
      step,
      this.nativeApdu(cmd, this.session.wrapFull(cmd, header, data)),
    );
    if (sw !== SW.NATIVE_OK) {
      this.session = null; // un error aborta la autenticación
      throw new CardError(step, sw);
    }
    return this.session.unwrapFull(body);
  }

  async changeFileSettings(fileNo: number, settings: Buffer): Promise<void> {
    await this.fullCommand(
      'ChangeFileSettings',
      CMD.CHANGE_FILE_SETTINGS,
      Buffer.from([fileNo]),
      settings,
    );
  }

  // ChangeKey. Para una llave distinta de la autenticada: NuevaLlave XOR LlaveActual,
  // versión y CRC32 de la nueva. Para la llave autenticada: NuevaLlave y versión. El CRC32
  // (JAMCRC, little-endian) es el detalle menos seguro: un error devuelve 911E y no cambia
  // nada.
  async changeKey(
    keyNo: number,
    newKey: Buffer,
    currentKey: Buffer,
    version = 0x01,
  ): Promise<void> {
    const own = keyNo === this.authKeyNo;
    const data = own
      ? Buffer.concat([newKey, Buffer.from([version])])
      : Buffer.concat([
          Buffer.from(newKey.map((byte, i) => byte ^ (currentKey[i] ?? 0))),
          Buffer.from([version]),
          changeKeyCrc(newKey),
        ]);
    const header = Buffer.from([keyNo]);

    if (!own) {
      await this.fullCommand('ChangeKey', CMD.CHANGE_KEY, header, data);
      return;
    }
    // Cambiar la llave de la sesión la termina: la respuesta no lleva MAC.
    if (!this.session) throw new Error('ChangeKey: sin sesión autenticada');
    const { sw } = await this.send(
      'ChangeKey',
      this.nativeApdu(
        CMD.CHANGE_KEY,
        this.session.wrapFull(CMD.CHANGE_KEY, header, data),
      ),
    );
    this.session = null;
    if (sw !== SW.NATIVE_OK) throw new CardError('ChangeKey', sw);
  }

  // ISOUpdateBinary en el archivo NDEF. Con permiso de escritura libre (tag de fábrica) no
  // pide autenticación; con la escritura protegida responde 6982/6985.
  async writeNdef(file: Buffer): Promise<void> {
    const { sw } = await this.send(
      'WriteNDEF',
      Buffer.concat([
        Buffer.from([0x00, 0xd6, NDEF_SFI, 0x00, file.length]),
        file,
      ]),
    );
    if (sw !== SW.OK) throw new CardError('WriteNDEF', sw);
  }

  // ISOReadBinary del archivo NDEF. Cada lectura incrementa el contador SDM del tag.
  async readNdef(): Promise<Buffer> {
    let le = 0x00;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, sw } = await this.send(
        'ReadNDEF',
        Buffer.from([0x00, 0xb0, NDEF_SFI, 0x00, le]),
      );
      if (sw === SW.OK) return Buffer.from(data);
      if (sw >> 8 === 0x6c)
        le = sw & 0xff; // el lector pide otra longitud
      else throw new CardError('ReadNDEF', sw);
    }
    throw new CardError('ReadNDEF', 0x6c00);
  }
}
