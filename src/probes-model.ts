import { normalizePrefix } from './entities';
import { numericValue } from './gauge-model';
import { available, type EntityState, type Hass } from './model';

export interface ProbeScale {
  min: number;
  max: number;
}

export interface ProbesConfig {
  type: string;
  title: string;
  entity_prefix: string;
  entities: string[];
  auto: boolean;
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

export function normalizeProbesConfig(input: unknown): ProbesConfig {
  const raw = objectValue(input);
  const title = raw.title ?? 'Sondes';
  if (typeof title !== 'string' || !title.trim()) throw new Error('Titre invalide');
  const auto = raw.auto ?? true;
  if (typeof auto !== 'boolean') throw new Error('auto doit être un booléen');
  const supplied = raw.entities === undefined ? [] : raw.entities;
  if (!Array.isArray(supplied) || supplied.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Liste d’entités invalide');
  }
  const scales: Record<string, ProbeScale> = {};
  if (raw.scales !== undefined) {
    for (const [id, value] of Object.entries(objectValue(raw.scales))) scales[id] = scaleValue(value);
  }
  const grid_options = raw.grid_options === undefined ? undefined : raw.grid_options;
  if (grid_options !== undefined && (!grid_options || typeof grid_options !== 'object' || Array.isArray(grid_options))) {
    throw new Error('grid_options doit être un objet');
  }
  return {
    type: 'custom:flowio-probes-card',
    title,
    entity_prefix: normalizePrefix(raw.entity_prefix),
    entities: [...new Set(supplied)] as string[],
    auto,
    scales,
    ...(grid_options ? { grid_options: grid_options as Record<string, unknown> } : {})
  };
}

export function discoveredProbeIds(hass: Hass | undefined, prefix: string): string[] {
  const stem = prefix ? `${prefix}_` : '';
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^sensor\\.${escaped}data_\\d+$`);
  return Object.keys(hass?.states ?? {}).filter(id => pattern.test(id)).sort();
}

export function probeIds(config: ProbesConfig, hass: Hass | undefined): string[] {
  const explicit = config.entities;
  if (!config.auto) return explicit;
  const extra = discoveredProbeIds(hass, config.entity_prefix).filter(id => !explicit.includes(id));
  return [...explicit, ...extra];
}

export function probeScale(config: ProbesConfig, id: string, state?: EntityState): ProbeScale | undefined {
  const configured = config.scales[id];
  if (configured) return configured;
  const min = state?.attributes.min;
  const max = state?.attributes.max;
  if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && max > min) {
    return { min, max };
  }
  const unit = typeof state?.attributes.unit_of_measurement === 'string' ? state.attributes.unit_of_measurement : '';
  return UNIT_SCALES[unit];
}

export function probeLabel(id: string, state?: EntityState): string {
  const name = state?.attributes.friendly_name;
  return typeof name === 'string' && name ? name : id;
}

export function probeValue(state?: EntityState): number | undefined {
  return numericValue(available(state) ? state.state : undefined);
}
