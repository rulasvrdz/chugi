import 'server-only';
import { z } from 'zod';

// Cookie con el claim ya validado (tap NFC o QR). La comparten /t, /q y /sello.
// Guarda solo el uuid del claim: no lleva UID, contador ni datos del cliente.
export const CLAIM_COOKIE = 'chugi_claim';

export const claimCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 10 * 60,
} as const;

const claimIdSchema = z.uuid();

export function parseClaimId(value: string | undefined): string | null {
  const parsed = claimIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// Por qué /sello no puede sumar un sello. Va en la query (?estado=…), sin datos personales.
export const STAMP_ERRORS = [
  'reintentar',
  'invalido',
  'qr-vencido',
  'qr-invalido',
] as const;
export type StampError = (typeof STAMP_ERRORS)[number];
