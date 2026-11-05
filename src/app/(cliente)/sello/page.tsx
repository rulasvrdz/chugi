import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { StampCard } from '@/components/stamp-card';
import {
  describeStampError,
  describeStampOutcome,
  NO_CLAIM_MESSAGE,
  unavailable,
  type StampMessage,
} from '@/lib/stamp/messages';
import { CLAIM_COOKIE, parseClaimId } from '@/lib/stamp/claim-cookie';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Tu sello · Chugi' };

export default function SelloPage(props: PageProps<'/sello'>) {
  return (
    <Suspense fallback={<PageFallback />}>
      <SelloContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SelloContent({
  searchParams,
}: {
  searchParams: PageProps<'/sello'>['searchParams'];
}) {
  const { estado } = await searchParams;

  // /t y /q ya rechazaron el toque: no hay claim que cobrar.
  const rejected = describeStampError(
    typeof estado === 'string' ? estado : undefined,
  );
  if (rejected) return <StampCard message={rejected} />;

  const cookieStore = await cookies();
  const claimId = parseClaimId(cookieStore.get(CLAIM_COOKIE)?.value);
  if (!claimId) return <StampCard message={NO_CLAIM_MESSAGE} />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Sin sesión: la cookie del claim se conserva y el registro lo cobra después.
  if (!user) redirect('/registro');

  return <StampCard message={await collectStamp(claimId, user.id)} />;
}

// grant_stamp es idempotente: recargar la página devuelve el mismo resultado sin duplicar
// el sello. Un claim vencido o ya consumido nunca otorga uno nuevo. Los errores de la base
// (por ejemplo, negocio sin programa activo) se muestran sin detalle y no se registran.
async function collectStamp(
  claimId: string,
  userId: string,
): Promise<StampMessage> {
  const { data, error } = await createAdminClient().rpc('grant_stamp', {
    p_claim_id: claimId,
    p_user_id: userId,
  });
  const outcome = data?.[0];
  if (error || !outcome) return unavailable();
  return describeStampOutcome(outcome);
}
