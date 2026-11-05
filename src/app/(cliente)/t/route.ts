import { NextResponse, type NextRequest } from 'next/server';
import { CLAIM_COOKIE, claimCookieOptions } from '@/lib/stamp/claim-cookie';
import { handleTap } from '@/lib/sdm/tap';
import { createTapDeps } from '@/lib/sdm/tap-deps';

// GET /t?v=…&p=…&m=… : validación del tap NFC (PLAN.md §3.1). Lee `request`, así que es
// dinámico y nunca se cachea. Los parámetros SDM no se registran en logs.
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const result = await handleTap(params, createTapDeps());

  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, request.url), { status: 303 });

  if (result.kind === 'claim') {
    // La redirección deja p y m fuera de la URL visible.
    const response = redirect('/sello');
    response.cookies.set(CLAIM_COOKIE, result.claimId, claimCookieOptions);
    return response;
  }

  if (result.kind === 'retry') return redirect('/sello?estado=reintentar');

  console.warn('tap rechazado', { reason: result.reason });
  return redirect('/sello?estado=invalido');
}
