import { describe, expect, it } from 'vitest';
import { diversifyKey } from '../../src/lib/sdm/sdm';
import { deriveTagKeys } from './keys';
import { buildNdefTemplate, domainSchema, parseNdefUrl } from './ndef';

describe('plantilla NDEF', () => {
  const template = buildNdefTemplate('chugi.rulasvrdz.com', '1');
  const text = template.file.toString('latin1');

  it('NLEN coincide con el registro y es un registro URI https', () => {
    expect(template.file.readUInt16BE(0)).toBe(template.file.length - 2);
    expect([...template.file.subarray(2, 6)].slice(0, 2)).toEqual([0xd1, 0x01]);
    expect(template.file[5]).toBe(0x55);
    expect(template.file[6]).toBe(0x04);
  });

  it('los offsets apuntan a los marcadores de p y m', () => {
    const p = template.piccDataOffset;
    const m = template.macOffset;
    expect(text.slice(p - 3, p)).toBe('&p=');
    expect(text.slice(p, p + 32)).toBe('0'.repeat(32));
    expect(text.slice(m - 3, m)).toBe('&m=');
    expect(text.slice(m, m + 16)).toBe('0'.repeat(16));
    expect(m + 16).toBe(template.file.length);
  });

  it('se puede leer de vuelta como URL con v, p y m', () => {
    const url = parseNdefUrl(template.file);
    expect(url?.hostname).toBe('chugi.rulasvrdz.com');
    expect(url?.pathname).toBe('/t');
    expect(url?.searchParams.get('v')).toBe('1');
    expect(url?.searchParams.get('p')).toBe('0'.repeat(32));
    expect(url?.searchParams.get('m')).toBe('0'.repeat(16));
  });

  it('rechaza contenido que no es una URL https', () => {
    expect(parseNdefUrl(Buffer.alloc(3))).toBeNull();
    expect(
      parseNdefUrl(Buffer.from([0, 7, 0xd1, 1, 3, 0x54, 0x02, 0x65, 0x6e])),
    ).toBeNull();
  });

  it('valida el dominio', () => {
    expect(domainSchema.safeParse('chugi.rulasvrdz.com').success).toBe(true);
    expect(domainSchema.safeParse('https://chugi.com').success).toBe(false);
    expect(domainSchema.safeParse('chugi.com/ruta').success).toBe(false);
    expect(domainSchema.safeParse('localhost').success).toBe(false);
  });
});

describe('llaves del tag', () => {
  const masters = {
    metaKey: Buffer.alloc(16, 0x01),
    fileMasterKey: Buffer.alloc(16, 0x02),
    appMasterKey: Buffer.alloc(16, 0x03),
  };
  const uid = Buffer.from('04DE5F1EACC040', 'hex');

  it('devuelve 5 llaves distintas y estables', () => {
    const keys = deriveTagKeys(masters, uid);
    expect(keys).toHaveLength(5);
    expect(new Set(keys.map((k) => k.toString('hex'))).size).toBe(5);
    expect(deriveTagKeys(masters, uid).map((k) => k.toString('hex'))).toEqual(
      keys.map((k) => k.toString('hex')),
    );
  });

  it('K_meta es común; K_file es la diversificación de /t', () => {
    const [, key1, key2] = deriveTagKeys(masters, uid);
    expect(key1).toEqual(masters.metaKey);
    expect(key2).toEqual(diversifyKey(masters.fileMasterKey, uid));
  });

  it('otro UID obtiene llaves distintas, salvo K_meta', () => {
    const other = deriveTagKeys(masters, Buffer.from('04DE5F1EACC041', 'hex'));
    const mine = deriveTagKeys(masters, uid);
    expect(other[0]).not.toEqual(mine[0]);
    expect(other[2]).not.toEqual(mine[2]);
    expect(other[1]).toEqual(mine[1]);
  });
});
