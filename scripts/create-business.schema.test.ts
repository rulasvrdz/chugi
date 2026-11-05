import { describe, expect, it } from 'vitest';
import {
  createBusinessSchema,
  generatePassword,
} from './create-business.schema';

const valid = {
  name: 'Café Demo',
  slug: 'cafe-demo',
  location: 'Matriz',
  ownerEmail: 'dueno@ejemplo.com',
  cajaEmail: 'caja@ejemplo.com',
};

describe('createBusinessSchema', () => {
  it('acepta una entrada válida y usa CDMX por defecto', () => {
    const result = createBusinessSchema.parse(valid);
    expect(result.timezone).toBe('America/Mexico_City');
  });

  it('acepta una zona horaria válida', () => {
    const result = createBusinessSchema.parse({
      ...valid,
      timezone: 'America/Tijuana',
    });
    expect(result.timezone).toBe('America/Tijuana');
  });

  it.each(['Cafe Demo', 'cafe_demo', '-cafe', 'cafe-', 'cafe--demo', 'Café'])(
    'rechaza el slug %j',
    (slug) => {
      expect(createBusinessSchema.safeParse({ ...valid, slug }).success).toBe(
        false,
      );
    },
  );

  it('rechaza una zona horaria inexistente', () => {
    expect(
      createBusinessSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' })
        .success,
    ).toBe(false);
  });

  it('rechaza correos inválidos', () => {
    expect(
      createBusinessSchema.safeParse({ ...valid, ownerEmail: 'no-es-correo' })
        .success,
    ).toBe(false);
  });

  it('rechaza el mismo correo para dueño y caja', () => {
    expect(
      createBusinessSchema.safeParse({
        ...valid,
        cajaEmail: valid.ownerEmail,
      }).success,
    ).toBe(false);
  });

  it('rechaza nombre o sucursal vacíos', () => {
    expect(
      createBusinessSchema.safeParse({ ...valid, name: '  ' }).success,
    ).toBe(false);
    expect(
      createBusinessSchema.safeParse({ ...valid, location: '' }).success,
    ).toBe(false);
  });
});

describe('generatePassword', () => {
  it('genera 24 caracteres url-safe y distintos cada vez', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(a).not.toBe(b);
  });
});
