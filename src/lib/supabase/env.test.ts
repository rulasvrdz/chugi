import { describe, expect, it } from 'vitest';
import { publicEnvSchema, serverEnvSchema } from './env';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SUPABASE_SECRET_KEY: 'secret',
};

describe('env de Supabase', () => {
  it('acepta variables válidas', () => {
    expect(serverEnvSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza una URL mal formada', () => {
    const r = publicEnvSchema.safeParse({
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: 'no-es-url',
    });
    expect(r.success).toBe(false);
  });

  it('exige la llave secreta solo en el esquema de servidor', () => {
    const publicOnly = {
      NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    };
    expect(publicEnvSchema.safeParse(publicOnly).success).toBe(true);
    expect(serverEnvSchema.safeParse(publicOnly).success).toBe(false);
  });
});
