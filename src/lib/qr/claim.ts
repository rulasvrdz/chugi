import { z } from 'zod';
import { verifyQrToken, type QrPayload } from './token';

export type QrClaimDeps = {
  secret: string;
  now(): Date;
  // null = el jti ya se usó (UNIQUE(qr_jti)). Lanza si el emisor no es miembro del
  // negocio o la sucursal no le pertenece.
  createClaim(payload: QrPayload): Promise<string | null>;
};

// `expired` y `invalid` (firma mala, token ajeno, jti reutilizado) llevan mensajes distintos
// para el cliente, pero ninguno revela por qué falló la firma.
export type QrClaimResult =
  | { kind: 'claim'; claimId: string }
  | { kind: 'expired' }
  | {
      kind: 'invalid';
      reason: 'malformed' | 'bad_signature' | 'used' | 'error';
    };

const paramsSchema = z.object({ t: z.string().min(1).max(1024) });

export async function handleQr(
  rawParams: unknown,
  deps: QrClaimDeps,
): Promise<QrClaimResult> {
  const parsed = paramsSchema.safeParse(rawParams);
  if (!parsed.success) return { kind: 'invalid', reason: 'malformed' };

  const verified = verifyQrToken(deps.secret, parsed.data.t, deps.now());
  if (!verified.ok) {
    if (verified.reason === 'expired') return { kind: 'expired' };
    return { kind: 'invalid', reason: verified.reason };
  }

  try {
    const claimId = await deps.createClaim(verified.payload);
    if (!claimId) return { kind: 'invalid', reason: 'used' };
    return { kind: 'claim', claimId };
  } catch {
    return { kind: 'invalid', reason: 'error' };
  }
}
