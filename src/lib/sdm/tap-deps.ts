import 'server-only';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TapDeps } from './tap';

// En Vault las llaves se guardan como 32 caracteres hexadecimales (AES-128).
const keyHexSchema = z.string().regex(/^[0-9a-f]{32}$/i);

// Dependencias reales de handleTap: service_role contra la base. Los errores de la base
// se tratan como "no hay llaves / no hay tag" y nunca se registra su contenido.
export function createTapDeps(): TapDeps {
  const supabase = createAdminClient();

  return {
    async getKeys(keyRef) {
      const { data, error } = await supabase.rpc('get_sdm_keys', {
        p_key_ref: keyRef,
      });
      const row = data?.[0];
      if (error || !row) return null;
      const meta = keyHexSchema.safeParse(row.meta_key);
      const master = keyHexSchema.safeParse(row.file_master_key);
      if (!meta.success || !master.success) return null;
      return {
        metaKey: Buffer.from(meta.data, 'hex'),
        fileMasterKey: Buffer.from(master.data, 'hex'),
      };
    },

    async findTag(uid) {
      const { data } = await supabase
        .from('nfc_tags')
        .select('id, status, key_ref')
        .eq('uid', uid)
        .maybeSingle();
      return data
        ? { id: data.id, status: data.status, keyRef: data.key_ref }
        : null;
    },

    async createClaim(tagId, counter) {
      const { data, error } = await supabase.rpc('create_tap_claim', {
        p_tag_id: tagId,
        p_counter: counter,
      });
      // La RPC devuelve null cuando la URL ya se usó; el tipo generado no lo refleja.
      if (error) return null;
      return (data as string | null) ?? null;
    },
  };
}
