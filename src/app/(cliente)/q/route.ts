import { NextResponse, type NextRequest } from 'next/server';
import { handleQr } from '@/lib/qr/claim';
import { getQrSecret } from '@/lib/qr/secret';
import { CLAIM_COOKIE, claimCookieOptions } from '@/lib/stamp/claim-cookie';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /q?t=… : QR de respaldo sin NFC (PLAN.md §3.5). Mismo camino que el tap: crea un
// claim de un solo uso (UNIQUE(qr_jti)), lo guarda en la cookie y sigue en /sello.
export async function GET(request: NextRequest) {
  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), { status: 303 });

  const supabase = createAdminClient();
  const result = await handleQr(
    Object.fromEntries(request.nextUrl.searchParams),
    {
      secret: getQrSecret(),
      now: () => new Date(),
      async createClaim(payload) {
        const { data, error } = await supabase.rpc('create_qr_claim', {
          p_business_id: payload.b,
          p_location_id: payload.l,
          p_jti: payload.j,
          p_issued_by: payload.i,
        });
        if (error) throw new Error('create_qr_claim failed');
        // La RPC devuelve null si el jti ya se usó; el tipo generado no lo refleja.
        return (data as string | null) ?? null;
      },
    },
  );

  if (result.kind === 'claim') {
    const response = redirect('/sello');
    response.cookies.set(CLAIM_COOKIE, result.claimId, claimCookieOptions);
    return response;
  }

  // Solo el motivo: nunca el token ni los ids que lleva.
  console.warn('qr rechazado', {
    reason: result.kind === 'expired' ? 'expired' : result.reason,
  });
  return redirect(
    result.kind === 'expired'
      ? '/sello?estado=qr-vencido'
      : '/sello?estado=qr-invalido',
  );
}
