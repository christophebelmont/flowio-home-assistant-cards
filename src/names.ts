import type { EntityState } from './model';

export function entityName(id: string, state?: EntityState): string {
  const name = state?.attributes.friendly_name;
  return typeof name === 'string' && name ? name : id;
}

export function commonNamePrefix(names: string[]): string {
  if (names.length < 2) return '';
  let prefix = names[0];
  for (const name of names) {
    while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  if (!prefix) return '';
  const boundary = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('·'), prefix.lastIndexOf('-'));
  return boundary >= 0 ? prefix.slice(0, boundary + 1) : '';
}

export function displayName(name: string, prefix: string): string {
  if (prefix && name.startsWith(prefix)) return name.slice(prefix.length).trim() || name;
  return name;
}
