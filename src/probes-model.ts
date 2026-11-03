import { normalizePrefix } from './entities';
import { numericValue } from './gauge-model';
import { available, type EntityState } from './model';

export interface ProbeScale {
  min: number;
  max: number;
}

export const PROBE_TONES = ['water', 'air', 'ph', 'orp', 'pressure'] as const;
export type ProbeTone = typeof PROBE_TONES[number];

export interface ProbesConfig {
  type: string;
  title: string;
  entity_prefix: string;
  entities: string[];
  name_prefix: string;
  colors: Record<string, string>;
  scales: Record<string, ProbeScale>;
  grid_options?: Record<string, unknown>;
}

const UNIT_SCALES: Record<string, ProbeScale> = {
  '%': { min: 0, max: 100 },
  '°C': { min: -10, max: 50 },
  'mV': { min: 350, max: 900 },
  'bar': { min: 0, max: 2 },
  'psi': { min: 0, max: 30 },
  'L': { min: 0, max: 200 }
};

const ID_SCALES: { suffix: string; scale: ProbeScale }[] = [
  { suffix: '_io_ph', scale: { min: 6, max: 8 } },
  { suffix: '_io_orp', scale: { min: 350, max: 900 } },
  { suffix: '_io_psi', scale: { min: 0, max: 2 } },
  { suffix: '_io_wat_tmp', scale: { min: 0, max: 40 } },
  { suffix: '_io_air_tmp', scale: { min: -10, max: 50 } }
];

const FALLBACK_SCALE: ProbeScale = { min: 0, max: 100 };

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration objet attendue');
  return value as Record<string, unknown>;
}

function scaleValue(value: unknown): ProbeScale {
  const raw = objectValue(value);
  const { min, max } = raw;
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    throw new Error('Échelle attendue avec max supérieur à min');
  }
  return { min, max };
}

function stringMap(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {};
  const raw = objectValue(value);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(raw)) {
    if (typeof item !== 'string') throw new Error(`${label} : valeur texte attendue`);
    result[key] = item;
  }
  return result;
}

export function normalizeProbesConfig(input: unknown): ProbesConfig {
  const raw = objectValue(input);
  const title = raw.title ?? 'Sondes';
  if (typeof title !== 'string' || !title.trim()) throw new Error('Titre invalide');
  const name_prefix = raw.name_prefix ?? '';
  if (typeof name_prefix !== 'string') throw new Error('name_prefix doit être un texte');
  const supplied = raw.entities === undefined ? [] : raw.entities;
  if (!Array.isArray(supplied) || supplied.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Liste d’entités invalide');
  }
  const scales: Record<string, ProbeScale> = {};
  if (raw.scales !== undefined) {
    for (const [id, value] of Object.entries(objectValue(raw.scales))) scales[id] = scaleValue(value);
  }
  const colors = stringMap(raw.colors, 'colors');
  const grid_options = raw.grid_options === undefined ? undefined : raw.grid_options;
  if (grid_options !== undefined && (!grid_options || typeof grid_options !== 'object' || Array.isArray(grid_options))) {
    throw new Error('grid_options doit être un objet');
  }
  return {
    type: 'custom:flowio-probes-card',
    title,
    entity_prefix: normalizePrefix(raw.entity_prefix),
    entities: [...new Set(supplied)] as string[],
    name_prefix,
    colors,
    scales,
    ...(grid_options ? { grid_options: grid_options as Record<string, unknown> } : {})
  };
}

export function probeIds(config: ProbesConfig): string[] {
  return config.entities;
}

export function probeScale(config: ProbesConfig, id: string, state?: EntityState): ProbeScale {
  const configured = config.scales[id];
  if (configured) return configured;
  const min = state?.attributes.min;
  const max = state?.attributes.max;
  if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    return { min, max };
  }
  const byId = ID_SCALES.find(item => id.endsWith(item.suffix));
  if (byId) return byId.scale;
  const unit = typeof state?.attributes.unit_of_measurement === 'string' ? state.attributes.unit_of_measurement : '';
  return UNIT_SCALES[unit] ?? FALLBACK_SCALE;
}

export function probeValue(state?: EntityState): number | undefined {
  return numericValue(available(state) ? state.state : undefined);
}

export { commonNamePrefix, displayName as probeDisplayName, entityName as rawProbeName } from './names';

export function probeTone(id: string, state?: EntityState): ProbeTone {
  if (id.endsWith('_io_ph')) return 'ph';
  if (id.endsWith('_io_orp') || id.endsWith('_pl_dis_setpoint')) return 'orp';
  if (id.endsWith('_io_psi')) return 'pressure';
  if (id.endsWith('_io_air_tmp') || id.endsWith('_io_wat_htr')) return 'air';
  if (id.endsWith('_io_wat_tmp')) return 'water';
  const unit = typeof state?.attributes.unit_of_measurement === 'string' ? state.attributes.unit_of_measurement : '';
  if (unit === 'mV') return 'orp';
  if (unit === 'bar' || unit === 'psi') return 'pressure';
  return 'water';
}

export function resolveProbeColor(config: ProbesConfig, id: string, state?: EntityState): { tone: ProbeTone; custom: string } {
  const override = config.colors[id];
  if (override && (PROBE_TONES as readonly string[]).includes(override)) return { tone: override as ProbeTone, custom: '' };
  if (override) return { tone: probeTone(id, state), custom: override };
  return { tone: probeTone(id, state), custom: '' };
}
