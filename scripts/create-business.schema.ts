import { randomBytes } from 'node:crypto';
import { z } from 'zod';

// Mismo formato que el CHECK businesses_slug_format de la base.
export const slugSchema = z
  .string()
  .max(60)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Solo minúsculas, números y guiones medios',
  );

// Postgres y Intl aceptan los mismos nombres IANA ("America/Mexico_City", "UTC", …).
export const timezoneSchema = z.string().refine((timezone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}, 'Zona horaria inválida (ejemplo: America/Mexico_City)');

export const createBusinessSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: slugSchema,
    timezone: timezoneSchema.default('America/Mexico_City'),
    location: z.string().trim().min(1).max(100),
    ownerEmail: z.email().max(254),
    cajaEmail: z.email().max(254),
  })
  .refine((input) => input.ownerEmail !== input.cajaEmail, {
    message: 'El correo del dueño y el de la caja deben ser distintos',
    path: ['cajaEmail'],
  });

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

// 24 caracteres (144 bits) en base64url. Se muestra una sola vez en la terminal.
export function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}
