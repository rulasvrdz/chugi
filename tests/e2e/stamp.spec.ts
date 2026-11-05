import { randomBytes, randomUUID } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '../../src/lib/supabase/database.types';

// Flujo de humo de CHUG-16: claim validado -> /sello -> grant_stamp. Corre contra un
// proyecto real de Supabase (sellos-app / sellos-app-dev) y solo crea y borra datos
// sintéticos propios. Sin estas variables se saltan las pruebas que usan la base.
const url = process.env.E2E_SUPABASE_URL;
const secretKey = process.env.E2E_SUPABASE_SECRET_KEY;
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(url && secretKey && publishableKey);

const SKIP_REASON =
  'Faltan E2E_SUPABASE_URL, E2E_SUPABASE_SECRET_KEY y E2E_SUPABASE_PUBLISHABLE_KEY';
test.describe.configure({ mode: 'serial' });

const BASE_URL = 'http://localhost:3000';
const CLAIM_COOKIE = 'chugi_claim';

const admin = enabled
  ? createClient<Database>(url!, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const suffix = randomBytes(4).toString('hex');
const email = `e2e-${suffix}@example.com`;
const password = randomBytes(18).toString('base64url');

let businessId = '';
let userId = '';
let tagId = '';
let counter = 0;
let sessionCookies: { name: string; value: string }[] = [];

function must<T>(
  label: string,
  result: { data: T; error: unknown },
): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`E2E: falló ${label}`);
  }
  return result.data;
}

async function newClaim(): Promise<string> {
  counter += 1;
  const { data, error } = await admin!.rpc('create_tap_claim', {
    p_tag_id: tagId,
    p_counter: counter,
  });
  if (error || !data) throw new Error('E2E: falló create_tap_claim');
  return data;
}

test.beforeAll(async () => {
  if (!enabled) return;
  const business = must(
    'negocio',
    await admin!
      .from('businesses')
      .insert({ name: `E2E ${suffix}`, slug: `e2e-${suffix}` })
      .select('id')
      .single(),
  );
  businessId = business.id;

  const location = must(
    'sucursal',
    await admin!
      .from('locations')
      .insert({ business_id: businessId, name: 'E2E' })
      .select('id')
      .single(),
  );
  must(
    'programa',
    await admin!
      .from('stamp_programs')
      .insert({
        business_id: businessId,
        stamps_required: 3,
        stamp_ttl_days: 30,
        reward_description: 'Café gratis',
      })
      .select('id')
      .single(),
  );
  const tag = must(
    'tag',
    await admin!
      .from('nfc_tags')
      .insert({
        uid: randomBytes(7).toString('hex').toUpperCase(),
        business_id: businessId,
        location_id: location.id,
        key_ref: 'e2e',
      })
      .select('id')
      .single(),
  );
  tagId = tag.id;

  const created = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  userId = must('cliente', {
    data: created.data.user?.id ?? null,
    error: created.error,
  });

  // Inicia sesión como lo haría el navegador y guarda las cookies que escribe @supabase/ssr.
  const jar = new Map<string, string>();
  const browserLike = createServerClient(url!, publishableKey!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const { error } = await browserLike.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error('E2E: falló el inicio de sesión del cliente');
  sessionCookies = [...jar].map(([name, value]) => ({ name, value }));
});

test.afterAll(async () => {
  if (!admin) return;
  if (businessId) await admin.from('businesses').delete().eq('id', businessId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

test('con sesión: el tap suma un sello y recargar no lo duplica', async ({
  context,
  page,
}) => {
  test.skip(!enabled, SKIP_REASON);
  await context.addCookies(
    [...sessionCookies, { name: CLAIM_COOKIE, value: await newClaim() }].map(
      (c) => ({ ...c, url: BASE_URL }),
    ),
  );

  await page.goto('/sello');
  await expect(
    page.getByRole('heading', { name: '¡Sello 1 de 3!' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: '¡Sello 1 de 3!' }),
  ).toBeVisible();
});

test('el segundo tap del mismo día devuelve already_today', async ({
  context,
  page,
}) => {
  test.skip(!enabled, SKIP_REASON);
  await context.addCookies(
    [...sessionCookies, { name: CLAIM_COOKIE, value: await newClaim() }].map(
      (c) => ({ ...c, url: BASE_URL }),
    ),
  );

  await page.goto('/sello');
  await expect(
    page.getByRole('heading', { name: 'Ya sumaste tu sello de hoy' }),
  ).toBeVisible();
});

test('sin sesión: manda a /registro y conserva el claim', async ({
  context,
  page,
}) => {
  test.skip(!enabled, SKIP_REASON);
  await context.addCookies([
    { name: CLAIM_COOKIE, value: await newClaim(), url: BASE_URL },
  ]);

  await page.goto('/sello');
  await expect(page).toHaveURL(/\/registro$/);
  const cookies = await context.cookies(BASE_URL);
  expect(cookies.some((c) => c.name === CLAIM_COOKIE)).toBe(true);
});

test('un claim inexistente no otorga sello', async ({ context, page }) => {
  test.skip(!enabled, SKIP_REASON);
  await context.addCookies(
    [...sessionCookies, { name: CLAIM_COOKIE, value: randomUUID() }].map(
      (c) => ({ ...c, url: BASE_URL }),
    ),
  );

  await page.goto('/sello');
  await expect(
    page.getByRole('heading', { name: 'No pudimos registrar tu sello' }),
  ).toBeVisible();
});

test('sin cookie ni estado: pide acercar el celular', async ({ page }) => {
  await page.goto('/sello');
  await expect(
    page.getByRole('heading', { name: 'Acerca tu celular al sello' }),
  ).toBeVisible();
});

test('estado de rechazo desde /t', async ({ page }) => {
  await page.goto('/sello?estado=reintentar');
  await expect(
    page.getByRole('heading', { name: 'Acerca tu celular al sello otra vez' }),
  ).toBeVisible();
});
