import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// Token del QR de respaldo (PLAN.md §3.5): base64url(payload) "." base64url(HMAC-SHA256).
// Código puro: el secreto y la hora se reciben por parámetro para poder probarlo.

export const QR_TTL_SECONDS = 30;

const payloadSchema = z.object({
  b: z.uuid(), // business_id
  l: z.uuid(), // location_id
  j: z.uuid(), // jti: un solo uso, UNIQUE(qr_jti) en la base
  i: z.uuid(), // issued_by: la cuenta de caja que lo emitió
  e: z.number().int(), // expira, en segundos desde epoch
});

export type QrPayload = z.infer<typeof payloadSchema>;

export type QrVerification =
  | { ok: true; payload: QrPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

function sign(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function signQrToken(secret: string, payload: QrPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body).toString('base64url')}`;
}

// Emite un token que vence QR_TTL_SECONDS después de `now`.
export function issueQrPayload(
  input: Omit<QrPayload, 'e'>,
  now: Date,
): QrPayload {
  return { ...input, e: Math.floor(now.getTime() / 1000) + QR_TTL_SECONDS };
}

export function verifyQrToken(
  secret: string,
  token: string,
  now: Date,
): QrVerification {
  const parts = token.split('.');
  const [body, signature] = parts;
  if (parts.length !== 2 || !body || !signature) {
    return { ok: false, reason: 'malformed' };
  }

  // La firma se comprueba antes de leer el contenido: nada de un token sin firmar se usa.
  const received = Buffer.from(signature, 'base64url');
  const expected = sign(secret, body);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return { ok: false, reason: 'bad_signature' };
  }

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'malformed' };

  if (parsed.data.e * 1000 <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload: parsed.data };
}
