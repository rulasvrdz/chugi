import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { MemberRole } from './roles';

export type Membership = {
  role: MemberRole;
  business: { id: string; name: string; slug: string };
};

export type PanelContext = {
  userId: string;
  memberships: Membership[];
};

// Quién es el usuario y de qué negocios es miembro. Todo se lee con la sesión del
// usuario, bajo RLS: sin membresía la base devuelve 0 filas, no importa lo que haga la UI.
// getUser() valida el token contra Supabase; nunca se confía en la cookie sin validar.
export async function getPanelContext(): Promise<PanelContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('business_members')
    .select('role, businesses(id, name, slug)')
    .eq('user_id', user.id);

  const memberships: Membership[] = [];
  for (const row of data ?? []) {
    if (row.businesses) {
      memberships.push({ role: row.role, business: row.businesses });
    }
  }
  return { userId: user.id, memberships };
}

export async function getBusinessLocations(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('locations')
    .select('id, name')
    .eq('business_id', businessId)
    .order('name');
  return data ?? [];
}
