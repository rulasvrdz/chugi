import { diversifyKey, diversifyKeyRaw } from '../../src/lib/sdm/sdm';

// Las 5 llaves de aplicación del NTAG 424 DNA para un UID (PLAN.md §4.2):
//   key 0  llave maestra de la aplicación (reconfigura el tag), diversificada por UID
//          desde sdm_app_master_<ref>
//   key 1  K_meta: cifra PICCData; común a la plataforma (/t la necesita antes de saber
//          qué tag es)
//   key 2  K_file: CMAC de SDM; diversificada por UID desde sdm_file_master_<ref>
//   key 3  sin uso; diversificada desde la maestra de aplicación
//   key 4  sin uso; diversificada desde la maestra de aplicación
// Nada de esto se imprime ni se guarda en disco.

export const DEFAULT_KEY = Buffer.alloc(16);

export type MasterKeys = {
  metaKey: Buffer;
  fileMasterKey: Buffer;
  appMasterKey: Buffer;
};

export function deriveTagKeys(
  master: MasterKeys,
  uid: Buffer,
): [Buffer, Buffer, Buffer, Buffer, Buffer] {
  // Material de las llaves sin uso: UID || "chugi" || número de llave (AN10922).
  const unused = (keyNo: number) =>
    diversifyKeyRaw(
      master.appMasterKey,
      Buffer.concat([uid, Buffer.from('chugi', 'ascii'), Buffer.from([keyNo])]),
    );
  return [
    diversifyKey(master.appMasterKey, uid),
    master.metaKey,
    diversifyKey(master.fileMasterKey, uid),
    unused(3),
    unused(4),
  ];
}
