import { expect, it } from 'vitest';
import { defaultSeriesColor, GRAPH_PALETTE, normalizeGraphConfig, seriesColor } from '../src/graph-model';

it('applique les valeurs par défaut de la carte graphique', () => {
  const config = normalizeGraphConfig({});
  expect(config.title).toBe('Graphique');
  expect(config.entity_prefix).toBe('fio');
  expect(config.hours_to_show).toBe(12);
  expect(config.chart_type).toBe('line');
  expect(config.entities).toEqual([]);
  expect(config.colors).toEqual({});
});

it('accepte les entités, couleurs et le type de graphique', () => {
  const config = normalizeGraphConfig({ chart_type: 'bar', hours_to_show: 24, entities: ['sensor.a', 'sensor.a', 'sensor.b'], colors: { 'sensor.a': '#ff0000' } });
  expect(config.chart_type).toBe('bar');
  expect(config.hours_to_show).toBe(24);
  expect(config.entities).toEqual(['sensor.a', 'sensor.b']);
  expect(config.colors).toEqual({ 'sensor.a': '#ff0000' });
});

it('rejette les configurations invalides', () => {
  for (const input of [{ hours_to_show: 0 }, { hours_to_show: 200 }, { chart_type: 'pie' }, { entities: 'sensor.a' }, { entities: [''] }, { colors: { a: 3 } }, { colors: [] }, { grid_options: [] }]) {
    expect(() => normalizeGraphConfig(input)).toThrow();
  }
});

it('répartit la palette par défaut et respecte les couleurs choisies', () => {
  expect(defaultSeriesColor(0)).toBe(GRAPH_PALETTE[0]);
  expect(defaultSeriesColor(GRAPH_PALETTE.length)).toBe(GRAPH_PALETTE[0]);
  const config = normalizeGraphConfig({ colors: { 'sensor.a': '#123456' } });
  expect(seriesColor(config, 'sensor.a', 1)).toBe('#123456');
  expect(seriesColor(config, 'sensor.b', 1)).toBe(GRAPH_PALETTE[1]);
});
