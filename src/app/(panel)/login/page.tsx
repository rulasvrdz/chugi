import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { landingPath } from '@/lib/auth/roles';
import { getPanelContext } from '@/lib/auth/session';
import { signIn } from '../actions';

export const metadata = { title: 'Iniciar sesión · Chugi' };

// Con Cache Components, leer searchParams y cookies exige un <Suspense>: el esqueleto es
// estático y el contenido se resuelve por petición.
export default function LoginPage(props: PageProps<'/login'>) {
  return (
    <Suspense fallback={<PageFallback />}>
      <LoginContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: PageProps<'/login'>['searchParams'];
}) {
  const { error } = await searchParams;

  // Quien ya tiene sesión y negocio no necesita ver el formulario.
  const ctx = await getPanelContext();
  const first = ctx?.memberships[0];
  if (first) redirect(landingPath(first.role));

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <form action={signIn} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Iniciar sesión
        </h1>

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            Correo o contraseña incorrectos.
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Correo
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
