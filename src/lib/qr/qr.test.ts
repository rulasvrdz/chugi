import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleQr, type QrClaimDeps } from './claim';
import { issueQrPayload, signQrToken, verifyQrToken } from './token';

const secret = 'a'.repeat(40);
const now = new Date('2026-11-05T12:00:00Z');
const ids = {
  b: '11111111-1111-4111-8111-111111111111',
  l: '22222222-2222-4222-8222-222222222222',
  j: '33333333-3333-4333-8333-333333333333',
  i: '44444444-4444-4444-8444-444444444444',
};

const freshToken = () => signQrToken(secret, issueQrPayload(ids, now));
const secondsLater = (s: number) => new Date(now.getTime() + s * 1000);

describe('token del QR', () => {
  it('firma válida y vigente', () => {
    const result = verifyQrToken(secret, freshToken(), secondsLater(10));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toMatchObject(ids);
  });

  it('vence a los 30 s', () => {
    const token = freshToken();
    expect(verifyQrToken(secret, token, secondsLater(29)).ok).toBe(true);
    expect(verifyQrToken(secret, token, secondsLater(30))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rechaza un payload alterado aunque conserve la firma', () => {
    const [, signature] = freshToken().split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...issueQrPayload(ids, now), l: ids.b }),
    ).toString('base64url');
    expect(verifyQrToken(secret, `${forged}.${signature}`, now)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rechaza otra firma o otro secreto', () => {
    const token = freshToken();
    expect(verifyQrToken('b'.repeat(40), token, now)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
    const [body] = token.split('.');
    expect(verifyQrToken(secret, `${body}.AAAA`, now).ok).toBe(false);
  });

  it.each(['', 'sin-punto', 'a.b.c', '.', 'a.'])(
    'rechaza tokens mal formados (%j)',
    (token) => {
      expect(verifyQrToken(secret, token, now).ok).toBe(false);
    },
  );

  it('rechaza un payload firmado pero con campos inválidos', () => {
    const body = Buffer.from(JSON.stringify({ b: 'x' })).toString('base64url');
    const sig = createHmac('sha256', secret).update(body).digest('base64url');
    expect(verifyQrToken(secret, `${body}.${sig}`, now)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('handleQr', () => {
  let deps: QrClaimDeps;
  beforeEach(() => {
    deps = {
      secret,
      now: () => secondsLater(5),
      createClaim: vi.fn(async () => 'claim-1'),
    };
  });

  it('QR válido: crea el claim con los datos del token', async () => {
    expect(await handleQr({ t: freshToken() }, deps)).toEqual({
      kind: 'claim',
      claimId: 'claim-1',
    });
    expect(deps.createClaim).toHaveBeenCalledWith(
      expect.objectContaining({ b: ids.b, l: ids.l, j: ids.j, i: ids.i }),
    );
  });

  it('QR vencido: no crea claim', async () => {
    deps.now = () => secondsLater(31);
    expect(await handleQr({ t: freshToken() }, deps)).toEqual({
      kind: 'expired',
    });
    expect(deps.createClaim).not.toHaveBeenCalled();
  });

  it('QR reutilizado (jti repetido): rechazado', async () => {
    deps.createClaim = vi.fn(async () => null);
    expect(await handleQr({ t: freshToken() }, deps)).toEqual({
      kind: 'invalid',
      reason: 'used',
    });
  });

  it('emisor sin membresía (la RPC lanza): rechazado', async () => {
    deps.createClaim = vi.fn(async () => {
      throw new Error('issuer is not a member of the business');
    });
    expect(await handleQr({ t: freshToken() }, deps)).toEqual({
      kind: 'invalid',
      reason: 'error',
    });
  });

  it('firma alterada o parámetro ausente: rechazado sin tocar la base', async () => {
    expect((await handleQr({ t: 'x.y' }, deps)).kind).toBe('invalid');
    expect((await handleQr({}, deps)).kind).toBe('invalid');
    expect(deps.createClaim).not.toHaveBeenCalled();
  });
});
