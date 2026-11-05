import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { NoAccess } from '@/components/no-access';
import { PageFallback } from '@/components/page-fallback';
import { SignOutButton } from '@/components/sign-out-button';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { getPanelContext } from '@/lib/auth/session';

export const metadata = { title: 'Caja · Chugi' };

// /caja es para cualquier miembro del negocio. La validación de canje llega en CHUG-21.
export default function CajaPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <CajaContent />
    </Suspense>
  );
}

async function CajaContent() {
  const ctx = await getPanelContext();
  if (!ctx) redirect('/login');

  const membership = ctx.memberships[0];
  if (!membership) return <NoAccess />;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {ROLE_LABELS[membership.role]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Caja: {membership.business.name}
          </h1>
        </div>
        <SignOutButton />
      </header>
      <p className="text-zinc-600 dark:text-zinc-400">
        Aquí se validarán los canjes y se mostrará el QR de respaldo.
      </p>
    </main>
  );
}
