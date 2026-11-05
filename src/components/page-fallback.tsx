// Esqueleto estático mientras una pantalla con sesión lee sus datos (cookies, RLS).
export function PageFallback() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <p role="status" className="text-zinc-600 dark:text-zinc-400">
        Cargando…
      </p>
    </main>
  );
}
