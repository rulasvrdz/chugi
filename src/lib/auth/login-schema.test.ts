import { describe, expect, it } from 'vitest';
import { loginSchema } from './login-schema';

describe('loginSchema', () => {
  it('acepta correo y contraseña', () => {
    const result = loginSchema.safeParse({
      email: 'caja@ejemplo.com',
      password: 'una contraseña larga',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un correo inválido', () => {
    expect(
      loginSchema.safeParse({ email: 'no-es-correo', password: 'x' }).success,
    ).toBe(false);
  });

  it('rechaza contraseña vacía o ausente', () => {
    expect(
      loginSchema.safeParse({ email: 'caja@ejemplo.com', password: '' })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'caja@ejemplo.com', password: null })
        .success,
    ).toBe(false);
  });
});
