import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnv } from '@/lib/supabase/env';

// Refresca la sesión de Supabase en cada visita a las pantallas con login. Un Server
// Component no puede escribir cookies, por eso el refresco vive aquí. Así la sesión de
// la caja se mantiene abierta en el dispositivo.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Valida el JWT y renueva los tokens si hace falta. Sin sesión no hace ninguna llamada.
  const { data } = await supabase.auth.getClaims();

  // Sin sesión, /panel y /caja responden 307 a /login. Es solo comodidad: quién puede ver
  // qué lo deciden las páginas y, sobre todo, RLS en la base.
  const { pathname } = request.nextUrl;
  const needsSession =
    pathname.startsWith('/panel') || pathname.startsWith('/caja');
  if (needsSession && !data?.claims) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

// Solo las rutas con login. Se amplía cuando existan las pantallas del cliente
// (/registro, /tarjeta, /sello).
export const config = {
  matcher: ['/login', '/panel/:path*', '/caja/:path*'],
};
