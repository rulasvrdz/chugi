import { SignOutButton } from '@/components/sign-out-button';

// Sesión válida pero sin membresía en ningún negocio. No se redirige (evita bucles) y
// no se muestra ningún dato: la base ya devolvió 0 filas por RLS.
export function NoAccess() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Sin acceso</h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        Tu cuenta no tiene acceso a ningún negocio. Pide a quien administra
        Chugi que la agregue.
      </p>
      <SignOutButton />
    </main>
  );
}
