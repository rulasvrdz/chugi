import type { StampMessage } from '@/lib/stamp/messages';

const TONE_STYLES: Record<StampMessage['tone'], string> = {
  success: 'text-emerald-700 dark:text-emerald-300',
  info: 'text-zinc-900 dark:text-zinc-100',
  warning: 'text-amber-700 dark:text-amber-300',
};

// Pantalla de resultado del tap. El rol "status" anuncia el cambio a lectores de pantalla.
export function StampCard({ message }: { message: StampMessage }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div role="status" className="flex max-w-sm flex-col gap-3">
        <h1
          className={`text-3xl font-semibold tracking-tight ${TONE_STYLES[message.tone]}`}
        >
          {message.title}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">{message.detail}</p>
      </div>
    </main>
  );
}
