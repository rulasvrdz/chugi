// Programación de tags NTAG 424 DNA con SDM (CHUG-14, PLAN.md §3.1 y §4.2).
//
//   pnpm tag:program inspect
//   pnpm tag:program program --domain chugi.rulasvrdz.com --location <uuid> --key-ref 1 [--resume]
//   pnpm tag:program revoke --uid 04A1B2C3D4E5F6
//
// Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY de .env.local o del entorno. Las llaves
// maestras se leen de Vault (RPC solo para service_role) y viven solo en memoria: no se
// imprimen, no se escriben a disco ni van a logs. Con el lector ACR1252U (PC/SC).
//
// ⚠ NO está probado contra un chip real. Empieza con `inspect` en un tag de práctica y
// lee scripts/ntag424/LEEME.md antes del primer `program`.
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import type { Database } from '../src/lib/supabase/database.types';
import { serverEnvSchema } from '../src/lib/supabase/env';
import { computeSdmMac, decryptPicc, macMatches } from '../src/lib/sdm/sdm';
import {
  buildNdefSdmSettings,
  CardError,
  NDEF_FILE_NO,
  Ntag424Card,
  SW,
  type SdmRightsLayout,
} from './ntag424/card';
import { DEFAULT_KEY, deriveTagKeys, type MasterKeys } from './ntag424/keys';
import {
  buildNdefTemplate,
  domainSchema,
  keyRefSchema,
  parseNdefUrl,
} from './ntag424/ndef';
import { connectToTag } from './ntag424/pcsc';

const hexKey = z.string().regex(/^[0-9a-f]{32}$/i);
const uidSchema = z.string().regex(/^[0-9A-F]{14}$/i);

function must<T>(
  step: string,
  result: { data: T; error: { message: string } | null },
): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    // Solo el paso: el mensaje de la base podría incluir nombres de secretos o valores.
    throw new Error(`${step}: falló la consulta`);
  }
  return result.data;
}

type Db = ReturnType<typeof createDb>;

function createDb() {
  const env = serverEnvSchema.safeParse(process.env);
  if (!env.success) {
    const missing = env.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(
      `Faltan o son inválidas estas variables: ${missing.join(', ')}`,
    );
  }
  return createClient<Database>(
    env.data.NEXT_PUBLIC_SUPABASE_URL,
    env.data.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function loadMasterKeys(db: Db, keyRef: string): Promise<MasterKeys> {
  const sdm = must(
    'llaves SDM',
    await db.rpc('get_sdm_keys', { p_key_ref: keyRef }),
  )[0];
  const app = must(
    'llave de aplicación',
    await db.rpc('get_sdm_app_key', { p_key_ref: keyRef }),
  );
  if (!sdm) throw new Error('llaves SDM: sin datos');
  const parse = (value: string, label: string) => {
    const parsed = hexKey.safeParse(value);
    if (!parsed.success)
      throw new Error(`${label}: debe ser de 32 caracteres hexadecimales`);
    return Buffer.from(parsed.data, 'hex');
  };
  return {
    metaKey: parse(sdm.meta_key, 'sdm_meta'),
    fileMasterKey: parse(sdm.file_master_key, 'sdm_file_master'),
    appMasterKey: parse(app, 'sdm_app_master'),
  };
}

const last4 = (uid: Buffer) => uid.toString('hex').slice(-4).toUpperCase();

// Lee la URL del tag y la valida con las mismas funciones que usa /t (sin crear claims).
// Cada lectura incrementa el contador SDM del tag.
async function verifyReadBack(
  card: Ntag424Card,
  uid: Buffer,
  keys: { metaKey: Buffer; fileKey: Buffer },
  domain: string,
  keyRef: string,
): Promise<string | null> {
  const url = parseNdefUrl(await card.readNdef());
  if (!url) return 'el archivo NDEF no es una URL https';
  if (url.hostname !== domain.toLowerCase())
    return 'el dominio de la URL no coincide';
  if (url.pathname !== '/t' || url.searchParams.get('v') !== keyRef) {
    return 'la ruta o la versión de la URL no coinciden';
  }
  const p = url.searchParams.get('p') ?? '';
  const m = url.searchParams.get('m') ?? '';
  if (!/^[0-9a-f]{32}$/i.test(p) || !/^[0-9a-f]{16}$/i.test(m)) {
    return 'el tag no está sustituyendo p y m (SDM inactivo)';
  }
  const picc = decryptPicc(keys.metaKey, Buffer.from(p, 'hex'));
  if (!picc) return 'p no se puede descifrar con K_meta';
  if (!picc.uid.equals(uid))
    return 'el UID descifrado no coincide con el del tag';
  const expected = computeSdmMac(keys.fileKey, picc.uid, picc.counter);
  if (!macMatches(expected, Buffer.from(m, 'hex')))
    return 'el CMAC no coincide';
  return null;
}

async function inspect() {
  const connection = await connectToTag();
  try {
    const card = new Ntag424Card(connection.transport);
    const uid = await card.getUid();
    await card.selectApplication();

    let defaultKey0 = false;
    try {
      await card.authenticate(0, DEFAULT_KEY);
      defaultKey0 = true;
    } catch (error) {
      if (!(error instanceof CardError && error.sw === SW.AUTH_ERROR))
        throw error;
    }

    const url = parseNdefUrl(await card.readNdef());
    console.log(`UID termina en ${last4(uid)}`);
    console.log(
      `Llave 0 por defecto: ${defaultKey0 ? 'sí (tag virgen o sin cambiar)' : 'no'}`,
    );
    console.log(
      url
        ? `NDEF: https://${url.hostname}${url.pathname}?v=${url.searchParams.get('v') ?? '?'}&p…&m…`
        : 'NDEF: sin URL https',
    );
  } finally {
    connection.close();
  }
}

async function program(options: {
  domain: string;
  location: string;
  keyRef: string;
  resume: boolean;
}) {
  const db = createDb();
  const location = must(
    'sucursal',
    await db
      .from('locations')
      .select('id, business_id')
      .eq('id', options.location)
      .maybeSingle(),
  );
  const masters = await loadMasterKeys(db, options.keyRef);
  const template = buildNdefTemplate(options.domain, options.keyRef);

  const connection = await connectToTag();
  try {
    const card = new Ntag424Card(connection.transport);
    const uid = await card.getUid();
    const [key0, key1, key2, key3, key4] = deriveTagKeys(masters, uid);
    const newKeys = [key0, key1, key2, key3, key4];
    const fileKey = key2;

    // 1. NDEF con los marcadores de posición. Con la escritura ya protegida (tag
    //    configurado antes) se conserva el contenido: la verificación final lo comprueba.
    await card.selectApplication();
    try {
      await card.writeNdef(template.file);
    } catch (error) {
      if (!(
        error instanceof CardError &&
        (error.sw === 0x6982 || error.sw === 0x6985)
      )) {
        throw error;
      }
      console.log('NDEF ya protegido: se conserva el contenido actual.');
    }

    // 2. Autenticación con la llave 0: de fábrica, o la nuestra si el tag ya se programó.
    let currentKey0: Buffer = DEFAULT_KEY;
    try {
      await card.authenticate(0, DEFAULT_KEY);
    } catch (error) {
      if (!(error instanceof CardError && error.sw === SW.AUTH_ERROR))
        throw error;
      await card.selectApplication();
      await card.authenticate(0, key0);
      currentKey0 = key0;
      options.resume = true; // ya está en manos de nuestras llaves: no se vuelven a cambiar
    }

    // 3. Llaves 1 a 4. La llave 0 se cambia al final, después de verificar la URL.
    if (!options.resume) {
      for (let keyNo = 1; keyNo <= 4; keyNo++) {
        try {
          await card.changeKey(keyNo, newKeys[keyNo] as Buffer, DEFAULT_KEY);
        } catch (error) {
          if (error instanceof CardError && error.sw === SW.INTEGRITY_ERROR) {
            throw new Error(
              `Llave ${keyNo}: el tag rechazó el cambio (911E). Si una ejecución anterior ya las cambió, repite con --resume.`,
            );
          }
          throw error;
        }
      }
    }

    // 4. SDM en el archivo NDEF. La posición de los nibbles de SDMAccessRights es ambigua
    //    entre el datasheet y AN12196: se prueba A y, si la lectura no verifica, B.
    const layouts: SdmRightsLayout[] = ['A', 'B'];
    let applied: SdmRightsLayout | null = null;
    let lastProblem = 'sin intentos';
    for (const layout of layouts) {
      try {
        await card.changeFileSettings(
          NDEF_FILE_NO,
          buildNdefSdmSettings(
            layout,
            template.piccDataOffset,
            template.macOffset,
          ),
        );
      } catch (error) {
        lastProblem =
          error instanceof Error ? error.message : 'error desconocido';
        await card.selectApplication();
        await card.authenticate(0, currentKey0);
        continue;
      }
      const problem = await verifyReadBack(
        card,
        uid,
        { metaKey: masters.metaKey, fileKey },
        options.domain,
        options.keyRef,
      );
      if (!problem) {
        applied = layout;
        break;
      }
      lastProblem = problem;
    }
    if (!applied) {
      throw new Error(
        `No se pudo verificar la URL del tag (${lastProblem}). La llave 0 sigue como estaba; corrige y repite con --resume.`,
      );
    }

    // 5. Llave 0 al final, y se confirma autenticando con ella.
    if (currentKey0.equals(DEFAULT_KEY)) {
      await card.changeKey(0, key0, DEFAULT_KEY);
      await card.selectApplication();
      await card.authenticate(0, key0);
    }

    // 6. Registro en la base solo cuando todo salió bien. No se toca last_counter.
    const tag = must(
      'registro del tag',
      await db
        .from('nfc_tags')
        .upsert(
          {
            uid: uid.toString('hex').toUpperCase(),
            business_id: location.business_id,
            location_id: location.id,
            key_ref: options.keyRef,
            status: 'active',
          },
          { onConflict: 'uid' },
        )
        .select('id')
        .single(),
    );
    console.log(
      `Tag programado y verificado. id=${tag.id}, UID …${last4(uid)}, SDMAccessRights=${applied}.`,
    );
    console.log('Acércale un celular: debe abrir /t y llegar a /sello.');
  } finally {
    connection.close();
  }
}

async function revoke(uidInput: string) {
  const uid = uidSchema.parse(uidInput).toUpperCase();
  const db = createDb();
  const rows = must(
    'revocación',
    await db
      .from('nfc_tags')
      .update({ status: 'revoked' })
      .eq('uid', uid)
      .select('id'),
  );
  if (rows.length === 0)
    throw new Error('No hay un tag registrado con ese UID');
  console.log(`Tag revocado (id=${rows[0]?.id}).`);
}

async function main() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Sin .env.local se usan las variables que ya estén en el entorno.
  }

  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      domain: { type: 'string' },
      location: { type: 'string' },
      'key-ref': { type: 'string' },
      uid: { type: 'string' },
      resume: { type: 'boolean', default: false },
    },
  });

  switch (positionals[0]) {
    case 'inspect':
      return inspect();
    case 'program':
      return program({
        domain: domainSchema.parse(values.domain),
        location: z.uuid().parse(values.location),
        keyRef: keyRefSchema.parse(values['key-ref']),
        resume: values.resume,
      });
    case 'revoke':
      return revoke(z.string().parse(values.uid));
    default:
      throw new Error(
        'Uso: pnpm tag:program <inspect | program | revoke> [opciones]',
      );
  }
}

main().catch((error: unknown) => {
  // Solo el mensaje: los errores de ZodError y de la tarjeta no llevan llaves.
  console.error(error instanceof Error ? error.message : 'Error desconocido');
  process.exit(1);
});
