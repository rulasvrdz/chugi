import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeSdmMac, diversifyKey } from './sdm';
import { createCipheriv } from 'node:crypto';
import { handleTap, type TapDeps } from './tap';

const metaKey = Buffer.alloc(16, 0x01);
const fileMasterKey = Buffer.alloc(16, 0x02);
const uid = Buffer.from('04DE5F1EACC040', 'hex');

// Arma un link válido como lo emitiría el tag: PICCData cifrado + CMAC.
function makeParams(counter: number, v = '1') {
  const plain = Buffer.alloc(16);
  plain[0] = 0xc7;
  uid.copy(plain, 1);
  plain.writeUIntLE(counter, 8, 3);
  const cipher = createCipheriv('aes-128-cbc', metaKey, Buffer.alloc(16));
  cipher.setAutoPadding(false);
  const p = Buffer.concat([cipher.update(plain), cipher.final()]);
  const m = computeSdmMac(diversifyKey(fileMasterKey, uid), uid, counter);
  return { v, p: p.toString('hex'), m: m.toString('hex') };
}

let deps: TapDeps;
beforeEach(() => {
  deps = {
    getKeys: vi.fn(async () => ({ metaKey, fileMasterKey })),
    findTag: vi.fn(async () => ({
      id: 'tag-1',
      status: 'active',
      keyRef: '1',
    })),
    createClaim: vi.fn(async () => 'claim-1'),
  };
});

describe('handleTap', () => {
  it('tap válido: crea el claim con el contador del tag', async () => {
    const result = await handleTap(makeParams(7), deps);
    expect(result).toEqual({ kind: 'claim', claimId: 'claim-1' });
    expect(deps.findTag).toHaveBeenCalledWith('04DE5F1EACC040');
    expect(deps.createClaim).toHaveBeenCalledWith('tag-1', 7);
  });

  it('contador repetido: pide acercar el celular otra vez', async () => {
    deps.createClaim = vi.fn(async () => null);
    expect(await handleTap(makeParams(7), deps)).toEqual({ kind: 'retry' });
  });

  it('CMAC alterado: inválido y no toca el contador', async () => {
    const params = makeParams(7);
    params.m = params.m.replace(/^./, params.m.startsWith('0') ? '1' : '0');
    expect(await handleTap(params, deps)).toEqual({
      kind: 'invalid',
      reason: 'bad_mac',
    });
    expect(deps.createClaim).not.toHaveBeenCalled();
  });

  it('tag revocado: inválido', async () => {
    deps.findTag = vi.fn(async () => ({
      id: 'tag-1',
      status: 'revoked',
      keyRef: '1',
    }));
    expect(await handleTap(makeParams(7), deps)).toEqual({
      kind: 'invalid',
      reason: 'inactive_tag',
    });
    expect(deps.createClaim).not.toHaveBeenCalled();
  });

  it('tag de otra versión de llaves: inválido', async () => {
    deps.findTag = vi.fn(async () => ({
      id: 'tag-1',
      status: 'active',
      keyRef: '2',
    }));
    expect((await handleTap(makeParams(7), deps)).kind).toBe('invalid');
  });

  it('tag desconocido: inválido', async () => {
    deps.findTag = vi.fn(async () => null);
    expect(await handleTap(makeParams(7), deps)).toEqual({
      kind: 'invalid',
      reason: 'unknown_tag',
    });
  });

  it('versión de llaves inexistente: inválido', async () => {
    deps.getKeys = vi.fn(async () => null);
    expect(await handleTap(makeParams(7, '9'), deps)).toEqual({
      kind: 'invalid',
      reason: 'no_keys',
    });
  });

  it('PICCData cifrado con otra llave: inválido', async () => {
    deps.getKeys = vi.fn(async () => ({
      metaKey: Buffer.alloc(16, 0x09),
      fileMasterKey,
    }));
    expect((await handleTap(makeParams(7), deps)).kind).toBe('invalid');
  });

  it.each([
    {},
    { v: '1', p: 'zz', m: 'zz' },
    { v: '1', p: 'a'.repeat(32), m: 'b'.repeat(15) },
    { v: '../x', p: 'a'.repeat(32), m: 'b'.repeat(16) },
  ])('parámetros mal formados: inválido (%j)', async (params) => {
    expect(await handleTap(params, deps)).toEqual({
      kind: 'invalid',
      reason: 'bad_params',
    });
    expect(deps.getKeys).not.toHaveBeenCalled();
  });
});
