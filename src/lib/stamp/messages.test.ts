import { describe, expect, it } from 'vitest';
import {
  describeStampError,
  describeStampOutcome,
  type StampOutcome,
} from './messages';

const base: StampOutcome = {
  claim_result: 'granted',
  stamps_count: 4,
  stamps_target: 8,
  reward: '1 café gratis',
};

describe('describeStampOutcome', () => {
  it('sello otorgado: muestra el avance', () => {
    const msg = describeStampOutcome(base);
    expect(msg.title).toBe('¡Sello 4 de 8!');
    expect(msg.detail).toContain('Te faltan 4');
    expect(msg.tone).toBe('success');
  });

  it('último sello: ya ganó el premio', () => {
    const msg = describeStampOutcome({ ...base, stamps_count: 8 });
    expect(msg.title).toBe('¡Ya ganaste tu premio!');
    expect(msg.detail).toContain('1 café gratis');
  });

  it('segundo tap del día', () => {
    const msg = describeStampOutcome({
      ...base,
      claim_result: 'already_today',
    });
    expect(msg.title).toBe('Ya sumaste tu sello de hoy');
    expect(msg.detail).toBe('Llevas 4 de 8.');
    expect(msg.tone).toBe('info');
  });

  it('segundo tap del día con premio ganado', () => {
    const msg = describeStampOutcome({
      ...base,
      claim_result: 'already_today',
      stamps_count: 8,
    });
    expect(msg.detail).toContain('Ya ganaste tu premio');
  });

  it('claim vencido no otorga sello', () => {
    const msg = describeStampOutcome({ ...base, claim_result: 'expired' });
    expect(msg.title).toBe('Este sello venció');
    expect(msg.tone).toBe('warning');
  });

  it('resultado desconocido: mensaje genérico, sin sello', () => {
    const msg = describeStampOutcome({ ...base, claim_result: 'otro' });
    expect(msg.title).toBe('No pudimos registrar tu sello');
  });
});

describe('describeStampError', () => {
  it('traduce los estados conocidos', () => {
    expect(describeStampError('reintentar')?.title).toBe(
      'Acerca tu celular al sello otra vez',
    );
    expect(describeStampError('qr-vencido')?.title).toBe('Este QR ya venció');
  });

  it('ignora estados desconocidos o ausentes', () => {
    expect(describeStampError('<script>')).toBeNull();
    expect(describeStampError(undefined)).toBeNull();
  });
});
