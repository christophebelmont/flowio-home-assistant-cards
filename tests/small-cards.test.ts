import { expect, it } from 'vitest';
import type { Hass } from '../src/model';
import {
  canToggleEquipment,
  equipmentEntityId,
  equipmentLabel,
  normalizeEquipmentConfig
} from '../src/equipment-model';
import { commonNamePrefix, discoveredProbeIds, normalizeProbesConfig, probeDisplayName, probeIds, probeScale, probeTone, probeValue, resolveProbeColor } from '../src/probes-model';
import { formatUptime, normalizeStatusConfig, statusBindings, statusValue } from '../src/status-model';
import { normalizeOverrideConfig, overrideAvailable, overrideForced, overrideRemainingMinutes } from '../src/override-model';
import { alarmEntries, alarmSummary, normalizeAlarmsConfig } from '../src/alarms-model';

const state = (value: string, attributes: Record<string, unknown> = {}) => ({ state: value, attributes });
const hass = (states: Record<string, ReturnType<typeof state>>): Hass => ({ states, callService: async () => undefined });

it('configure la carte équipements', () => {
  const config = normalizeEquipmentConfig({});
  expect(config.title).toBe('Équipements');
  expect(config.entities).toContain('filtration');
  expect(normalizeEquipmentConfig({ entities: ['lighting', 'lighting'] }).entities).toEqual(['lighting']);
  expect(() => normalizeEquipmentConfig({ entities: ['ph'] })).toThrow();
});

it('route la pompe désinfectant vers l’électrolyseur', () => {
  expect(equipmentEntityId('fio', 'disinfection_pump', 'electrolyzer')).toBe('switch.fio_io_chl_gen');
  expect(equipmentEntityId('fio', 'disinfection_pump', 'chlorine_bromine')).toBe('switch.fio_io_chl_pmp');
  expect(equipmentLabel('disinfection_pump', 'electrolyzer')).toBe('Électrolyseur');
  const h = hass({ 'switch.fio_io_chl_gen': state('off'), 'switch.fio_io_flt_pmp': state('on') });
  expect(canToggleEquipment(h, 'fio', 'disinfection_pump', 'electrolyzer')).toBe(true);
  expect(canToggleEquipment(h, 'fio', 'disinfection_pump', 'disabled')).toBe(false);
  expect(canToggleEquipment(h, 'fio', 'filtration')).toBe(true);
  expect(canToggleEquipment(h, 'fio', 'robot')).toBe(false);
});

it('configure la carte sondes', () => {
  const config = normalizeProbesConfig({});
  expect(config.title).toBe('Sondes');
  expect(config.auto).toBe(true);
  expect(() => normalizeProbesConfig({ auto: 'oui' })).toThrow();
  expect(() => normalizeProbesConfig({ scales: { 'sensor.x': { min: 5, max: 5 } } })).toThrow();
});

it('découvre dynamiquement les sondes data_ et respecte la sélection', () => {
  const h = hass({
    'sensor.fio_data_112': state('12.6', { unit_of_measurement: 'L' }),
    'sensor.fio_data_130': state('82.2', { unit_of_measurement: '%' }),
    'sensor.fio_io_ph': state('7.2')
  });
  expect(discoveredProbeIds(h, 'fio')).toEqual(['sensor.fio_data_112', 'sensor.fio_data_130']);
  const auto = normalizeProbesConfig({ entity_prefix: 'fio' });
  expect(probeIds(auto, h)).toEqual(['sensor.fio_data_112', 'sensor.fio_data_130']);
  const manual = normalizeProbesConfig({ entity_prefix: 'fio', auto: false, entities: ['sensor.fio_io_ph'] });
  expect(probeIds(manual, h)).toEqual(['sensor.fio_io_ph']);
  const mixed = normalizeProbesConfig({ entity_prefix: 'fio', entities: ['sensor.fio_io_ph'] });
  expect(probeIds(mixed, h)).toEqual(['sensor.fio_io_ph', 'sensor.fio_data_112', 'sensor.fio_data_130']);
});

it('retire le préfixe d’équipement et choisit une couleur par sonde', () => {
  expect(commonNamePrefix(['Flow.io Waveshare pH', 'Flow.io Waveshare ORP'])).toBe('Flow.io Waveshare ');
  expect(commonNamePrefix(['pH', 'ORP'])).toBe('');
  expect(commonNamePrefix(['Eau'])).toBe('');
  expect(probeDisplayName('Flow.io Waveshare pH', 'Flow.io Waveshare ')).toBe('pH');
  expect(probeDisplayName('Bidon chlore', 'Flow.io Waveshare ')).toBe('Bidon chlore');
  expect(probeTone('sensor.fio_io_ph')).toBe('ph');
  expect(probeTone('sensor.fio_io_orp')).toBe('orp');
  expect(probeTone('sensor.fio_io_psi')).toBe('pressure');
  expect(probeTone('sensor.fio_io_air_tmp')).toBe('air');
  expect(probeTone('sensor.fio_io_wat_tmp')).toBe('water');
  expect(probeTone('sensor.fio_data_112', state('12', { unit_of_measurement: 'L' }))).toBe('water');
  const config = normalizeProbesConfig({ colors: { 'sensor.fio_io_ph': 'pressure', 'sensor.fio_io_orp': '#ff00aa' } });
  expect(resolveProbeColor(config, 'sensor.fio_io_ph')).toEqual({ tone: 'pressure', custom: '' });
  expect(resolveProbeColor(config, 'sensor.fio_io_orp')).toEqual({ tone: 'orp', custom: '#ff00aa' });
  expect(resolveProbeColor(config, 'sensor.fio_io_psi')).toEqual({ tone: 'pressure', custom: '' });
  expect(() => normalizeProbesConfig({ colors: { 'sensor.x': 3 } })).toThrow();
});

it('calcule les échelles et valeurs des sondes', () => {
  const config = normalizeProbesConfig({ scales: { 'sensor.fio_data_112': { min: 0, max: 50 } } });
  expect(probeScale(config, 'sensor.fio_data_112', state('12', {}))).toEqual({ min: 0, max: 50 });
  expect(probeScale(config, 'sensor.fio_data_130', state('82', { unit_of_measurement: '%' }))).toEqual({ min: 0, max: 100 });
  expect(probeScale(config, 'sensor.fio_io_ph', state('7.2', {}))).toEqual({ min: 6, max: 8 });
  expect(probeScale(config, 'sensor.fio_io_psi', state('0.9', { unit_of_measurement: 'bar' }))).toEqual({ min: 0, max: 2 });
  expect(probeScale(config, 'sensor.fio_unknown', state('1', {}))).toEqual({ min: 0, max: 100 });
  expect(probeValue(state('12.6', {}))).toBe(12.6);
  expect(probeValue(state('unavailable', {}))).toBeUndefined();
});

it('configure et formate la carte état système', () => {
  const config = normalizeStatusConfig({});
  expect(config.items).toEqual(['wifi_ip', 'sys_hp_free', 'sys_upt_mn']);
  expect(() => normalizeStatusConfig({ items: ['inconnu'] })).toThrow();
  expect(formatUptime(30)).toBe('30 min');
  expect(formatUptime(120)).toBe('2.0 h');
  expect(formatUptime(2880)).toBe('2.0 j');
  expect(statusValue('sys_upt_mn', state('90', {}))).toBe('1.5 h');
  const bindings = statusBindings('fio', ['wifi_ip', 'voltage']);
  expect(bindings[0].id).toBe('sensor.fio_wifi_ip');
  expect(bindings[1].id).toBe('sensor.fio_io_voltage');
});

it('configure la carte forçage et lit l’état', () => {
  const config = normalizeOverrideConfig({ device: 'Pompe pH', durations: [15, 5, 5] });
  expect(config.durations).toEqual([5, 15]);
  expect(() => normalizeOverrideConfig({ durations: [0] })).toThrow();
  const status = (attributes: Record<string, unknown>) => ({ 'sensor.fio_pdm_ovr_state': state('idle', attributes) });
  expect(overrideAvailable(hass(status({ override_available: true })), 'fio')).toBe(true);
  expect(overrideForced(hass(status({ control_mode: 'forced' })), 'fio')).toBe(true);
  expect(overrideForced(hass(status({ control_mode: 'guided' })), 'fio')).toBe(false);
  expect(overrideRemainingMinutes(hass(status({ override_remaining_s: 90 })), 'fio')).toBe(2);
});

it('résume les alarmes', () => {
  expect(normalizeAlarmsConfig({}).title).toBe('Alarmes');
  const entries = alarmEntries(hass({
    'binary_sensor.fio_alm_3_active': state('off', { friendly_name: 'Pression haute' }),
    'binary_sensor.fio_alm_1_active': state('on', { friendly_name: 'Débit faible' }),
    'binary_sensor.fio_alm_any_active': state('on')
  }), 'fio');
  expect(entries.map(entry => entry.id)).toEqual(['1', '3']);
  expect(entries[0].resetEntity).toBe('button.fio_alm_1_reset');
  const summary = alarmSummary(hass({ 'binary_sensor.fio_alm_1_active': state('on') }), 'fio');
  expect(summary.tone).toBe('alert');
  expect(summary.active).toBe(1);
  expect(alarmSummary(hass({ 'binary_sensor.fio_alm_1_active': state('off') }), 'fio').tone).toBe('ok');
  expect(alarmSummary(hass({}), 'fio').tone).toBe('unknown');
});
