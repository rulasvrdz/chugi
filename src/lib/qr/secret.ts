import 'server-only';
import { z } from 'zod';

// QR_SECRET no está en serverEnvSchema a propósito: solo lo necesitan /q y la caja, y así
// el resto de la app (y el CI, con valores ficticios) no depende de él.
const secretSchema = z.string().min(32);

export function getQrSecret(): string {
  return secretSchema.parse(process.env.QR_SECRET);
}
