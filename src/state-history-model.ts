import { DEFINITIONS, normalizePrefix, type Role } from './entities';
import { MODES } from './modes-model';
import type { EntityState, Hass } from './model';
import { iconFor } from './visual';

export interface StateHistoryConfig {
  type: string;
  title: string;
  entity_prefix: string;
  name_prefix: string;
  entities: string[];
  grid_options?: Record<string, unknown>;
}

const ICON_BY_SUFFIX = new Map<string, string>();
for (const [role, [domain, suffix]] of Object.entries(DEFINITIONS)) {
  if (role === 'alarm_active') continue;
  if (domain === 'switch' || domain === 'binary_sensor') ICON_BY_SUFFIX.set(suffix, iconFor(role as Role));
}
for (const mode of Object.values(MODES)) {
  if (mode.domain === 'switch') ICON_BY_SUFFIX.set(mode.suffix, mode.icon);
}

export function normalizeStateHistoryConfig(input: unknown): StateHistoryConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration objet attendue');
  const raw = input as Record<string, unknown>;
  const title = raw.title ?? 'Historique des états';
  if (typeof title !== 'string' || !title.trim()) throw new Error('Titre invalide');
  const name_prefix = raw.name_prefix ?? '';
  if (typeof name_prefix !== 'string') throw new Error('name_prefix doit être un texte');
  const supplied = raw.entities === undefined ? [] : raw.entities;
  if (!Array.isArray(supplied) || supplied.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error('Liste d’entités invalide');
  }
  const grid_options = raw.grid_options === undefined ? undefined : raw.grid_options;
  if (grid_options !== undefined && (!grid_options || typeof grid_options !== 'object' || Array.isArray(grid_options))) {
    throw new Error('grid_options doit être un objet');
  }
  return {
    type: 'custom:flowio-state-history-card',
    title,
    entity_prefix: normalizePrefix(raw.entity_prefix),
    name_prefix,
    entities: [...new Set(supplied)] as string[],
    ...(grid_options ? { grid_options: grid_options as Record<string, unknown> } : {})
  };
}

export function stateHistoryIds(hass: Hass | undefined, prefix: string): string[] {
  if (!hass) return [];
  const stem = prefix ? `${prefix}_` : '';
  return Object.keys(hass.states)
    .filter(id => id.startsWith(`switch.${stem}`) || id.startsWith(`binary_sensor.${stem}`))
    .sort();
}

export function stateIcon(id: string, state?: EntityState): string {
  const custom = state?.attributes.icon;
  if (typeof custom === 'string' && custom) return custom;
  if (id.endsWith('_alm_any_active')) return 'mdi:shield-alert-outline';
  if (/_alm_\d+_active$/.test(id)) return 'mdi:alert-outline';
  for (const [suffix, icon] of ICON_BY_SUFFIX) {
    if (id.endsWith(`_${suffix}`) || id.endsWith(`.${suffix}`)) return icon;
  }
  return id.startsWith('binary_sensor.') ? 'mdi:checkbox-marked-circle-outline' : 'mdi:toggle-switch';
}

export function isActive(state?: EntityState): boolean {
  return state?.state === 'on' || state?.state === 'true';
}

export function todayBounds(now: number): { start: number; end: number } {
  const date = new Date(now);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return { start, end: start + 86400000 };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}

export function clockTime(now: number, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const hour = parts.find(part => part.type === 'hour')?.value ?? '00';
    const minute = parts.find(part => part.type === 'minute')?.value ?? '00';
    return `${hour}:${minute}`;
  } catch {
    const date = new Date(now);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}

export function totalDuration(intervals: readonly (readonly [number, number])[]): number {
  return intervals.reduce((sum, [from, to]) => sum + Math.max(0, to - from), 0);
}
