import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { normalizePrefix } from './entities';
import type { Hass } from './model';
import { commonEntityPrefix, displayName, entityName } from './names';

export interface TileGridConfig {
  type: string;
  title: string;
  columns: number;
  entity_prefix: string;
  name_prefix: string;
  entities: string[];
  grid_options?: Record<string, unknown>;
}

export function normalizeTileGridConfig(input: unknown, type: string, defaultTitle: string): TileGridConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration objet attendue');
  const raw = input as Record<string, unknown>;
  const title = raw.title ?? defaultTitle;
  if (typeof title !== 'string' || !title.trim()) throw new Error('Titre invalide');
  const columns = raw.columns ?? 2;
  if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > 6) {
    throw new Error('Nombre de colonnes attendu entre 1 et 6');
  }
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
    type,
    title,
    columns,
    entity_prefix: normalizePrefix(raw.entity_prefix),
    name_prefix,
    entities: [...new Set(supplied)] as string[],
    ...(grid_options ? { grid_options: grid_options as Record<string, unknown> } : {})
  };
}

type NativeCard = HTMLElement & { hass?: Hass; setConfig: (config: Record<string, unknown>) => void };
type CardHelpers = { createCardElement: (config: Record<string, unknown>) => NativeCard };

export abstract class FlowioTileGridCard extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, error: { state: true } };
  declare hass?: Hass;
  protected config?: TileGridConfig;
  protected error = '';
  private tiles: NativeCard[] = [];
  private key = '';
  private synced = false;
  private loading = false;
  private generation = 0;

  protected abstract normalizeConfig(input: unknown): TileGridConfig;

  setConfig(input: unknown) {
    this.config = this.normalizeConfig(input);
    this.error = '';
    void this.syncTiles();
  }

  getCardSize() { return 2 + Math.ceil((this.config?.entities.length ?? 0) / (this.config?.columns ?? 2)); }

  connectedCallback() { super.connectedCallback(); void this.syncTiles(); }
  disconnectedCallback() { super.disconnectedCallback(); this.generation++; }

  protected updated(_changed: PropertyValues) { void this.syncTiles(); this.mount(); }

  private mount() {
    const grid = this.renderRoot.querySelector<HTMLElement>('.grid');
    if (!grid) return;
    if (grid.children.length !== this.tiles.length || this.tiles.some((tile, index) => grid.children[index] !== tile)) {
      grid.replaceChildren(...this.tiles);
    }
    for (const tile of this.tiles) tile.hass = this.hass;
  }

  private async syncTiles() {
    const config = this.config;
    if (!config) return;
    const key = JSON.stringify({ columns: config.columns, entities: config.entities, name_prefix: config.name_prefix });
    if (key === this.key && this.synced) { this.mount(); return; }
    if (this.loading) return;
    this.loading = true;
    const token = ++this.generation;
    try {
      const load = (window as Window & { loadCardHelpers?: () => Promise<CardHelpers> }).loadCardHelpers;
      if (!load) throw new Error('Helpers Home Assistant indisponibles');
      const helpers = await load();
      if (token !== this.generation || !this.isConnected) return;
      const prefix = config.name_prefix || commonEntityPrefix(config.entities, this.hass?.states);
      this.tiles = config.entities.map(entity => {
        const raw = entityName(entity, this.hass?.states[entity]);
        const tileConfig: Record<string, unknown> = { type: 'tile', entity, hide_state: false, icon_tap_action: { action: 'toggle' }, tap_action: { action: 'more-info' } };
        const stripped = displayName(raw, prefix);
        if (stripped !== raw) tileConfig.name = stripped;
        const card = helpers.createCardElement(tileConfig);
        card.hass = this.hass;
        return card;
      });
      this.key = key;
      this.synced = true;
      this.error = '';
      this.requestUpdate();
    } catch (error) {
      console.error('[flowio] Tuiles natives Home Assistant indisponibles', error);
      if (token === this.generation) { this.synced = false; this.error = 'Tuiles Home Assistant indisponibles. Recharger le tableau de bord.'; }
    } finally {
      if (token === this.generation) this.loading = false;
    }
  }

  render() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return html`<ha-card><div class=body>En attente de Home Assistant…</div></ha-card>`;
    return html`<ha-card><div class=body>
      ${config.title ? html`<h3 class=title>${config.title}</h3>` : nothing}
      ${this.error ? html`<p class=error role=alert>${this.error}</p>` : nothing}
      ${!config.entities.length ? html`<p class=message>Choisir les entités dans l’éditeur.</p>` : nothing}
      <div class=grid style=${`--columns:${config.columns}`}></div>
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit)}
    ha-card{overflow:hidden}
    .body{padding:16px}
    .title{margin:0 0 12px;font-size:calc(1.05rem * var(--fio-font-scale, 1.32));font-weight:650;line-height:1.25}
    .error{margin:0 0 10px;color:var(--error-color);font-size:calc(.78rem * var(--fio-font-scale, 1.32))}
    .message{margin:0;font-size:calc(.82rem * var(--fio-font-scale, 1.32));color:var(--secondary-text-color)}
    .grid{display:grid;grid-template-columns:repeat(var(--columns,2),minmax(0,1fr));gap:10px}
    .grid>*{display:block;min-width:0}
    @container(max-width:420px){.grid{grid-template-columns:minmax(0,1fr)}}
  `;
}

export abstract class FlowioTileGridEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, error: { state: true } };
  declare hass?: Hass;
  protected config?: TileGridConfig;
  protected error = '';

  protected abstract normalizeConfig(input: unknown): TileGridConfig;

  setConfig(input: unknown) { this.config = this.normalizeConfig(input); this.error = ''; }

  private changed(event: CustomEvent) {
    event.stopPropagation();
    try {
      this.config = this.normalizeConfig(event.detail.value);
      this.error = '';
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this.config }, bubbles: true, composed: true }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Configuration invalide';
    }
  }

  private options(): { value: string; label: string }[] {
    if (!this.hass) return [];
    const stem = this.config?.entity_prefix ? `${this.config.entity_prefix}_` : '';
    const ids = Object.keys(this.hass.states).filter(id => id.startsWith(`switch.${stem}`)).sort();
    const prefix = this.config?.name_prefix || commonEntityPrefix(ids, this.hass.states);
    return ids.map(id => ({ value: id, label: `${displayName(entityName(id, this.hass!.states[id]), prefix)} · ${id}` }));
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'columns', selector: { number: { min: 1, max: 6, step: 1, mode: 'box' } } },
      { name: 'entity_prefix', selector: { text: {} } },
      { name: 'name_prefix', selector: { text: {} } },
      { name: 'entities', selector: { select: { multiple: true, mode: 'list', options: this.options() } } }
    ];
    const labels: Record<string, string> = { title: 'Nom', columns: 'Colonnes', entity_prefix: 'Préfixe firmware', name_prefix: 'Texte à retirer devant les noms (vide = automatique)', entities: 'Entités' };
    return html`<p>Tuiles standard Home Assistant : cliquer sur l’icône bascule l’entité, cliquer ailleurs ouvre l’entité.</p>${this.error ? html`<p role=alert>${this.error}</p>` : nothing}<ha-form .hass=${this.hass} .data=${this.config} .schema=${schema} .computeLabel=${(field: { name: string }) => labels[field.name] ?? field.name} @value-changed=${this.changed}></ha-form>`;
  }

  static styles = css`:host{display:block}p{color:var(--secondary-text-color);line-height:1.5}p[role=alert]{color:var(--error-color)}`;
}
