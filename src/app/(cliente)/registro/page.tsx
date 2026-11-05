export const metadata = { title: 'Registro · Chugi' };

// Marcador de posición: el registro con código llega en la rebanada 3 (PLAN.md §3.2). El
// claim del tap espera en su cookie (10 min) hasta entonces.
export default function RegistroPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        El registro llega pronto
      </h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        Para sumar tu sello necesitas una cuenta. Estamos terminando esta parte.
      </p>
    </main>
  );
}
