// Alta de un negocio: negocio + sucursal + cuenta del dueño (owner) + cuenta compartida
// de "Caja" (staff). No hay registro por autoservicio; las cuentas del panel salen de aquí.
//
//   pnpm business:create --name "Café Demo" --slug cafe-demo --location Matriz \
//     --owner-email dueno@ejemplo.com --caja-email caja@ejemplo.com [--timezone America/Mexico_City]
//
// Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY de .env.local o del entorno, así que
// el proyecto destino es el de esas variables. Usa service_role: solo se corre en una
// terminal de confianza. Las contraseñas se imprimen una sola vez; no se guardan.
//
// No importa src/lib/supabase/admin.ts porque 'server-only' falla fuera de Next.
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import type { Database } from '../src/lib/supabase/database.types';
import { serverEnvSchema } from '../src/lib/supabase/env';
import {
  createBusinessSchema,
  generatePassword,
} from './create-business.schema';

class StepError extends Error {
  constructor(step: string, detail: string) {
    super(`${step}: ${detail}`);
  }
}

function must<T>(
  step: string,
  result: { data: T; error: { message: string } | null },
): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new StepError(step, result.error?.message ?? 'sin respuesta');
  }
  return result.data;
}

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Sin .env.local se usan las variables que ya estén en el entorno.
  }

  const env = serverEnvSchema.safeParse(process.env);
  if (!env.success) {
    const missing = env.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(
      `Faltan o son inválidas estas variables: ${missing.join(', ')}`,
    );
  }

  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      timezone: { type: 'string' },
      location: { type: 'string' },
      'owner-email': { type: 'string' },
      'caja-email': { type: 'string' },
    },
  });

  const parsed = createBusinessSchema.safeParse({
    name: values.name,
    slug: values.slug,
    timezone: values.timezone,
    location: values.location,
    ownerEmail: values['owner-email'],
    cajaEmail: values['caja-email'],
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || 'entrada'}: ${issue.message}`,
    );
    throw new Error(`Argumentos inválidos:\n${problems.join('\n')}`);
  }
  const input = parsed.data;

  const supabase = createClient<Database>(
    env.data.NEXT_PUBLIC_SUPABASE_URL,
    env.data.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let businessId: string | undefined;
  const userIds: string[] = [];

  try {
    const business = must(
      'negocio',
      await supabase
        .from('businesses')
        .insert({
          name: input.name,
          slug: input.slug,
          timezone: input.timezone,
        })
        .select('id')
        .single(),
    );
    businessId = business.id;

    must(
      'sucursal',
      await supabase
        .from('locations')
        .insert({ business_id: business.id, name: input.location })
        .select('id')
        .single(),
    );

    const accounts = [
      { label: 'Dueño', email: input.ownerEmail, role: 'owner' as const },
      { label: 'Caja', email: input.cajaEmail, role: 'staff' as const },
    ].map((account) => ({ ...account, password: generatePassword() }));

    const members: {
      business_id: string;
      user_id: string;
      role: 'owner' | 'staff';
    }[] = [];
    for (const account of accounts) {
      const created = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
      });
      const user = must(`cuenta ${account.label}`, {
        data: created.data.user,
        error: created.error,
      });
      userIds.push(user.id);
      members.push({
        business_id: business.id,
        user_id: user.id,
        role: account.role,
      });
    }

    must(
      'membresías',
      await supabase.from('business_members').insert(members).select('id'),
    );

    console.log(`Negocio creado: ${input.slug} (${business.id})`);
    for (const account of accounts) {
      console.log(
        `  ${account.label}: ${account.email}  contraseña: ${account.password}`,
      );
    }
    console.log('Guarda las contraseñas ahora: no se vuelven a mostrar.');
  } catch (error) {
    // Compensación: deja la base como estaba antes de correr el script.
    for (const id of userIds) await supabase.auth.admin.deleteUser(id);
    if (businessId)
      await supabase.from('businesses').delete().eq('id', businessId);
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error desconocido');
  process.exit(1);
});
