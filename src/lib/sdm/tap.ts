import { z } from 'zod';
import { computeSdmMac, decryptPicc, diversifyKey, macMatches } from './sdm';

// Parámetros del link del tag: /t?v=<versión>&p=<PICCData, 32 hex>&m=<CMAC, 16 hex>.
export const tapParamsSchema = z.object({
  v: z.string().regex(/^[a-z0-9_-]{1,16}$/i),
  p: z.string().regex(/^[0-9a-f]{32}$/i),
  m: z.string().regex(/^[0-9a-f]{16}$/i),
});

export type TapKeys = { metaKey: Buffer; fileMasterKey: Buffer };
export type TapTag = { id: string; status: string; keyRef: string };

export type TapDeps = {
  getKeys(keyRef: string): Promise<TapKeys | null>;
  // El UID llega en hexadecimal con mayúsculas, que es como se guarda en nfc_tags.uid.
  findTag(uid: string): Promise<TapTag | null>;
  // null = la URL ya se usó (contador no mayor) o el tag no está activo.
  createClaim(tagId: string, counter: number): Promise<string | null>;
};

// `retry`: el contador no avanzó, el cliente debe volver a tocar el sello.
// `invalid`: cualquier otra razón (parámetros, llaves, tag, CMAC). Una sola respuesta para
// no darle pistas a quien prueba URLs. El `reason` es solo para logs: nunca lleva UID,
// llaves ni parámetros SDM.
export type TapResult =
  | { kind: 'claim'; claimId: string }
  | { kind: 'retry' }
  | { kind: 'invalid'; reason: TapInvalidReason };

export type TapInvalidReason =
  | 'bad_params'
  | 'no_keys'
  | 'bad_picc'
  | 'unknown_tag'
  | 'inactive_tag'
  | 'bad_mac';

export async function handleTap(
  rawParams: unknown,
  deps: TapDeps,
): Promise<TapResult> {
  const parsed = tapParamsSchema.safeParse(rawParams);
  if (!parsed.success) return { kind: 'invalid', reason: 'bad_params' };
  const { v, p, m } = parsed.data;

  const keys = await deps.getKeys(v);
  if (!keys) return { kind: 'invalid', reason: 'no_keys' };

  const picc = decryptPicc(keys.metaKey, Buffer.from(p, 'hex'));
  if (!picc) return { kind: 'invalid', reason: 'bad_picc' };

  const tag = await deps.findTag(picc.uid.toString('hex').toUpperCase());
  if (!tag) return { kind: 'invalid', reason: 'unknown_tag' };
  if (tag.status !== 'active' || tag.keyRef !== v) {
    return { kind: 'invalid', reason: 'inactive_tag' };
  }

  // El CMAC se verifica antes de tocar el contador: sin esto cualquiera podría adelantarlo.
  const fileKey = diversifyKey(keys.fileMasterKey, picc.uid);
  const expected = computeSdmMac(fileKey, picc.uid, picc.counter);
  if (!macMatches(expected, Buffer.from(m, 'hex'))) {
    return { kind: 'invalid', reason: 'bad_mac' };
  }

  const claimId = await deps.createClaim(tag.id, picc.counter);
  if (!claimId) return { kind: 'retry' };
  return { kind: 'claim', claimId };
}
