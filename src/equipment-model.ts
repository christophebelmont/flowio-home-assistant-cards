import { entityId, normalizePrefix, roleLabel, type Role } from './entities';
import { available, type EntityState, type Hass } from './model';
import type { Treatment } from './modes-model';

export const EQUIPMENT_ROLES = ['filtration', 'ph_pump', 'disinfection_pump', 'heater', 'robot', 'lighting', 'filling'] as const;
export type EquipmentRole = typeof EQUIPMENT_ROLES[number];

export interface EquipmentConfig {
  type: string;
  title: string;
  entity_prefix: string;
  entities: EquipmentRole[];
  grid_options?: Record<string, unknown>;
}

export function normalizeEquipmentConfig(input: unknown): EquipmentConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration objet attendue');
  const raw = input as Record<string, unknown>;
  const title = raw.title ?? 'Équipements';
  if (typeof title !== 'string' || !title.trim()) throw new Error('Titre invalide');
  const supplied = raw.entities === undefined ? [...EQUIPMENT_ROLES] : raw.entities;
  if (!Array.isArray(supplied) || supplied.some(value => typeof value !== 'string' || !(EQUIPMENT_ROLES as readonly string[]).includes(value))) {
    throw new Error('Choisir les équipements proposés');
  }
  const grid_options = raw.grid_options === undefined ? undefined : raw.grid_options;
  if (grid_options !== undefined && (!grid_options || typeof grid_options !== 'object' || Array.isArray(grid_options))) {
    throw new Error('grid_options doit être un objet');
  }
  return {
    type: 'custom:flowio-equipment-card',
    title,
    entity_prefix: normalizePrefix(raw.entity_prefix),
    entities: [...new Set(supplied)] as EquipmentRole[],
    ...(grid_options ? { grid_options: grid_options as Record<string, unknown> } : {})
  };
}

export function equipmentTarget(role: EquipmentRole, treatment?: Treatment): Role {
  return role === 'disinfection_pump' && treatment === 'electrolyzer' ? 'electrolyzer' : role;
}

export function equipmentEntityId(prefix: string, role: EquipmentRole, treatment?: Treatment): string {
  return entityId(prefix, equipmentTarget(role, treatment));
}

export function equipmentLabel(role: EquipmentRole, treatment?: Treatment): string {
  return role === 'disinfection_pump' && treatment === 'electrolyzer' ? 'Électrolyseur' : roleLabel(role);
}

export function equipmentState(hass: Hass | undefined, prefix: string, role: EquipmentRole, treatment?: Treatment): EntityState | undefined {
  return hass?.states[equipmentEntityId(prefix, role, treatment)];
}

export function canToggleEquipment(hass: Hass | undefined, prefix: string, role: EquipmentRole, treatment?: Treatment): boolean {
  if (role === 'disinfection_pump' && (!treatment || treatment === 'disabled')) return false;
  const state = equipmentState(hass, prefix, role, treatment);
  return !!state && available(state) && ['on', 'off'].includes(state.state);
}
