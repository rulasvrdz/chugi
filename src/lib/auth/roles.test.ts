import { describe, expect, it } from 'vitest';
import { canAccessPanel, landingPath } from './roles';

describe('canAccessPanel', () => {
  it('permite al dueño y al gerente', () => {
    expect(canAccessPanel('owner')).toBe(true);
    expect(canAccessPanel('manager')).toBe(true);
  });

  it('niega a la cuenta de caja (staff)', () => {
    expect(canAccessPanel('staff')).toBe(false);
  });
});

describe('landingPath', () => {
  it('manda al dueño y al gerente a /panel y a la caja a /caja', () => {
    expect(landingPath('owner')).toBe('/panel');
    expect(landingPath('manager')).toBe('/panel');
    expect(landingPath('staff')).toBe('/caja');
  });
});
