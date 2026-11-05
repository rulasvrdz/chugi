import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { NoAccess } from '@/components/no-access';
import { PageFallback } from '@/components/page-fallback';
import { SignOutButton } from '@/components/sign-out-button';
import { canAccessPanel, ROLE_LABELS } from '@/lib/auth/roles';
import { getBusinessLocations, getPanelContext } from '@/lib/auth/session';

export const metadata = { title: 'Panel · Chugi' };

export default function PanelPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <PanelContent />
    </Suspense>
  );
}

async function PanelContent() {
  const ctx = await getPanelContext();
  if (!ctx) redirect('/login');
  if (ctx.memberships.length === 0) return <NoAccess />;

  // Con un solo negocio en el piloto se toma la primera membresía con acceso al panel.
  const membership = ctx.memberships.find((m) => canAccessPanel(m.role));
  if (!membership) redirect('/caja');

  const locations = await getBusinessLocations(membership.business.id);

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {ROLE_LABELS[membership.role]}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {membership.business.name}
          </h1>
        </div>
        <SignOutButton />
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Sucursales
        </h2>
        <ul className="list-disc pl-5">
          {locations.map((location) => (
            <li key={location.id}>{location.name}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
