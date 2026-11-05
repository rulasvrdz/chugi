import { z } from 'zod';

// Entrada del formulario de login. No se valida el largo mínimo de la contraseña:
// eso lo decide Supabase al crear la cuenta, aquí solo se rechaza lo vacío o absurdo.
export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
