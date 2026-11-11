import { expect, it } from 'vitest';
import { normalizeProbeConfig, probeLabel, probeMode, probeScale, probeValue, resolveProbeColor } from '../src/probe-model';

const state = (value: string, attributes: Record<string, unknown> = {}) => ({ state: value, attributes });

it('configure la carte sonde unique', () => {
  const config = normalizeProbeConfig({});
  expect(config.title).toBe('Sonde');
  expect(config.entity).toBe('');
  expect(config.item).toEqual({});
  const custom = normalizeProbeConfig({ title: 'Redox', entity_prefix: 'fio', entity: 'sensor.fio_io_orp', name_prefix: 'Flow.io ', item: { name: 'Redox', mode: 'gauge', color: '#8e24aa', min: 400, max: 1000 } });
  expect(custom.entity).toBe('sensor.fio_io_orp');
  expect(custom.item).toEqual({ name: 'Redox', mode: 'gauge', color: '#8e24aa', min: 400, max: 1000 });
  for (const input of [{ title: '' }, { entity: 3 }, { name_prefix: 3 }, { item: { mode: 'pie' } }, { item: { min: 10, max: 5 } }, { item: { name: 3 } }, { grid_options: [] }]) {
    expect(() => normalizeProbeConfig(input)).toThrow();
  }
});

it('lit nom, mode, échelle et couleur de la sonde unique', () => {
  const config = normalizeProbeConfig({ entity: 'sensor.fio_io_ph', item: { name: 'pH', mode: 'gauge', color: '#8e24aa', min: 6, max: 8 } });
  expect(probeLabel(config, state('7.2', { friendly_name: 'Flow.io Waveshare pH' }), 'Flow.io Waveshare ')).toBe('pH');
  expect(probeMode(config)).toBe('gauge');
  expect(probeScale(config, state('7.2', { min: '6.5', max: 8.2 }))).toEqual({ min: 6, max: 8 });
  expect(resolveProbeColor(config, state('7.2', {}))).toEqual({ tone: 'ph', custom: '#8e24aa' });
  const auto = normalizeProbeConfig({ entity: 'sensor.fio_io_ph' });
  expect(probeLabel(auto, state('7.2', { friendly_name: 'Flow.io Waveshare pH' }), 'Flow.io Waveshare ')).toBe('pH');
  expect(probeMode(auto)).toBe('line');
  expect(probeScale(auto, state('7.2', { min: 6.5, max: 8.2 }))).toEqual({ min: 6.5, max: 8.2 });
  expect(probeScale(auto, state('7.2', {}))).toBeUndefined();
  expect(resolveProbeColor(auto, state('7.2', {}))).toEqual({ tone: 'ph', custom: '' });
  expect(probeValue(state('7.2', {}))).toBe(7.2);
  expect(probeValue(state('unavailable', {}))).toBeUndefined();
});
