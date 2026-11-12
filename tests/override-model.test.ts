import { expect, it } from 'vitest';
import { equipmentForced } from '../src/override-model';
import type { Hass } from '../src/model';

const hass = (states: Record<string, { state: string; attributes: Record<string, unknown> }>) =>
  ({ states, callService: async () => undefined }) as unknown as Hass;

it('signale un équipement forcé via l’attribut booléen forced', () => {
  const h = hass({
    'switch.fio_io_flt_pmp': { state: 'on', attributes: { forced: true } },
    'switch.fio_io_ph_pmp': { state: 'off', attributes: { forced: false } },
    'switch.fio_io_lights': { state: 'on', attributes: {} }
  });
  expect(equipmentForced(h, 'switch.fio_io_flt_pmp')).toBe(true);
  expect(equipmentForced(h, 'switch.fio_io_ph_pmp')).toBe(false);
  expect(equipmentForced(h, 'switch.fio_io_lights')).toBe(false);
});

it('tolère la chaîne « true » et gère les entités absentes', () => {
  const h = hass({ 'switch.fio_io_flt_pmp': { state: 'on', attributes: { forced: 'true' } } });
  expect(equipmentForced(h, 'switch.fio_io_flt_pmp')).toBe(true);
  expect(equipmentForced(h, 'switch.fio_absent')).toBe(false);
  expect(equipmentForced(undefined, 'switch.fio_io_flt_pmp')).toBe(false);
});
