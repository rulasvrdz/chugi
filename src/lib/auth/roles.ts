import type { Database } from '@/lib/supabase/database.types';

export type MemberRole = Database['public']['Enums']['member_role'];

// /panel es solo para quien administra el negocio. /caja es para cualquier miembro.
// Esto decide qué pantalla mostrar; lo que cada rol puede LEER lo decide RLS en la base.
export function canAccessPanel(role: MemberRole): boolean {
  return role === 'owner' || role === 'manager';
}

export function landingPath(role: MemberRole): '/panel' | '/caja' {
  return canAccessPanel(role) ? '/panel' : '/caja';
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Dueño',
  manager: 'Gerente',
  staff: 'Caja',
};
