import { describe, expect, it } from 'vitest';
import { aesCmac } from './aes-cmac';
import {
  computeSdmMac,
  decryptPicc,
  diversifyKey,
  diversifyKeyRaw,
  macMatches,
} from './sdm';

const hex = (s: string) => Buffer.from(s.replace(/\s/g, ''), 'hex');

describe('AES-CMAC (RFC 4493)', () => {
  const key = hex('2b7e151628aed2a6abf7158809cf4f3c');
  it('mensaje vacío', () => {
    expect(aesCmac(key, Buffer.alloc(0)).toString('hex')).toBe(
      'bb1d6929e95937287fa37d129b756746',
    );
  });
  it('un bloque completo', () => {
    expect(
      aesCmac(key, hex('6bc1bee22e409f96e93d7e117393172a')).toString('hex'),
    ).toBe('070a16b46b4d4144f79bdd9dd04a287c');
  });
  it('40 bytes (último bloque incompleto)', () => {
    const msg = hex(
      '6bc1bee22e409f96e93d7e117393172a ae2d8a571e03ac9c9eb76fac45af8e51 30c81c46a35ce411',
    );
    expect(aesCmac(key, msg).toString('hex')).toBe(
      'dfa66747de9ae63030ca32611497c827',
    );
  });
});

// Vectores oficiales de NXP AN12196 (NTAG 424 DNA, SDM con llaves en ceros).
describe('SDM (AN12196)', () => {
  const zeroKey = Buffer.alloc(16);
  const piccData = hex('EF963FF7828658A599F3041510671E88');

  it('descifra PICCData: UID y contador', () => {
    const picc = decryptPicc(zeroKey, piccData);
    expect(picc?.uid.toString('hex').toUpperCase()).toBe('04DE5F1EACC040');
    expect(picc?.counter).toBe(61);
  });

  it('calcula el CMAC esperado', () => {
    const uid = hex('04DE5F1EACC040');
    expect(computeSdmMac(zeroKey, uid, 61).toString('hex').toUpperCase()).toBe(
      '94EED9EE65337086',
    );
  });

  it('rechaza un CMAC alterado o un contador distinto', () => {
    const uid = hex('04DE5F1EACC040');
    const good = computeSdmMac(zeroKey, uid, 61);
    const tampered = Buffer.from(good);
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;
    expect(macMatches(good, tampered)).toBe(false);
    expect(macMatches(good, computeSdmMac(zeroKey, uid, 62))).toBe(false);
    expect(macMatches(good, good.subarray(0, 7))).toBe(false);
  });

  it('rechaza PICCData con otra llave o con formato inválido', () => {
    const otherKey = Buffer.alloc(16, 0x11);
    expect(decryptPicc(otherKey, piccData)).toBeNull();
    expect(decryptPicc(zeroKey, piccData.subarray(0, 15))).toBeNull();
  });
});

// Vector oficial de NXP AN10922 (diversificación AES-128).
describe('diversificación (AN10922)', () => {
  it('reproduce la llave diversificada del documento', () => {
    const master = hex('00112233445566778899AABBCCDDEEFF');
    const material = hex('04782E21801D80 3042F5 4E585020416275');
    expect(
      diversifyKeyRaw(master, material).toString('hex').toUpperCase(),
    ).toBe('A8DD63A3B89D54B37CA802473FDA9175');
  });

  it('cada UID obtiene una llave distinta y estable', () => {
    const master = hex('00112233445566778899AABBCCDDEEFF');
    const a = diversifyKey(master, hex('04DE5F1EACC040'));
    const b = diversifyKey(master, hex('04DE5F1EACC041'));
    expect(a.equals(b)).toBe(false);
    expect(a.equals(diversifyKey(master, hex('04DE5F1EACC040')))).toBe(true);
  });
});
