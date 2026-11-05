'use server';

import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getBusinessLocations, getPanelContext } from '@/lib/auth/session';
import { issueQrPayload, signQrToken } from '@/lib/qr/token';
import { getQrSecret } from '@/lib/qr/secret';
import { createAdminClient } from '@/lib/supabase/admin';

const locationIdSchema = z.uuid();

export type IssuedQr =
  { ok: true; url: string; issuedAt: string } | { ok: false };

// Emite un QR de 30 s para una sucursal del negocio de quien lo pide. La sesión y la
// pertenencia de la sucursal se revalidan aquí: la UI no es una frontera de seguridad.
export async function issueQrToken(locationId: string): Promise<IssuedQr> {
  const parsed = locationIdSchema.safeParse(locationId);
  if (!parsed.success) return { ok: false };

  const ctx = await getPanelContext();
  const membership = ctx?.memberships[0];
  if (!ctx || !membership) return { ok: false };

  // Lectura bajo RLS: solo devuelve sucursales del negocio del usuario.
  const locations = await getBusinessLocations(membership.business.id);
  if (!locations.some((l) => l.id === parsed.data)) return { ok: false };

  const now = new Date();
  const token = signQrToken(
    getQrSecret(),
    issueQrPayload(
      {
        b: membership.business.id,
        l: parsed.data,
        j: randomUUID(),
        i: ctx.userId,
      },
      now,
    ),
  );

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return { ok: false };
  const proto = h.get('x-forwarded-proto') ?? 'https';

  return {
    ok: true,
    url: `${proto}://${host}/q?t=${token}`,
    issuedAt: now.toISOString(),
  };
}

const sinceSchema = z.iso.datetime();

// ¿Alguien escaneó un QR emitido por esta cuenta desde `sinceIso`? La caja lo consulta
// cada pocos segundos para cerrar el QR al registrarse un escaneo.
export async function qrWasScanned(sinceIso: string): Promise<boolean> {
  const since = sinceSchema.safeParse(sinceIso);
  if (!since.success) return false;

  const ctx = await getPanelContext();
  if (!ctx || ctx.memberships.length === 0) return false;

  const { count } = await createAdminClient()
    .from('tap_claims')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'qr')
    .eq('issued_by', ctx.userId)
    .gte('created_at', since.data);
  return (count ?? 0) > 0;
}
