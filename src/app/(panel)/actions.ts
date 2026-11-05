'use server';

import { redirect } from 'next/navigation';
import { loginSchema } from '@/lib/auth/login-schema';
import { createClient } from '@/lib/supabase/server';

// Login con correo y contraseña. No hay registro por autoservicio: las cuentas las crea
// scripts/create-business.ts. El error es siempre el mismo, para no revelar si la cuenta
// existe, y no se registra el correo.
export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) redirect('/login?error=1');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect('/login?error=1');

  // /panel manda a la caja a /caja si su rol no alcanza.
  redirect('/panel');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
