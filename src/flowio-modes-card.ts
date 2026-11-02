import { LitElement, html, css, nothing } from 'lit';
import './flowio-modes';
import { normalizePrefix } from './entities';
import type { Hass } from './model';
import { MODE_ITEMS, MODES, type Mode } from './modes-model';

interface ModesConfig {
  type: string;
  entity_prefix: string;
  modes: Mode[];
  grid_options?: Record<string, unknown>;
}

function normalizeModesConfig(input: unknown): ModesConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration objet attendue');
  const raw = input as Record<string, unknown>;
  const supplied = raw.modes === undefined ? [...MODE_ITEMS] : raw.modes;
  if (!Array.isArray(supplied) || supplied.some(value => typeof value !== 'string' || !(MODE_ITEMS as readonly string[]).includes(value))) {
    throw new Error('Choisir les modes proposés');
  }
  const grid_options = raw.grid_options === undefined ? undefined : raw.grid_options;
  if (grid_options !== undefined && (!grid_options || typeof grid_options !== 'object' || Array.isArray(grid_options))) {
    throw new Error('grid_options doit être un objet');
  }
  return {
    type: 'custom:flowio-modes-card',
    entity_prefix: normalizePrefix(raw.entity_prefix),
    modes: [...new Set(supplied)] as Mode[],
    ...(grid_options ? { grid_options: grid_options as Record<string, unknown> } : {})
  };
}

class FlowioModesCard extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true } };
  declare hass?: Hass;
  private config?: ModesConfig;

  static getConfigElement() { return document.createElement('flowio-modes-card-editor'); }
  static getStubConfig(): ModesConfig { return normalizeModesConfig({}); }
  setConfig(input: unknown) { this.config = normalizeModesConfig(input); }
  getCardSize() { return 4; }

  render() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return html`<ha-card><div class=body>En attente de Home Assistant…</div></ha-card>`;
    return html`<ha-card><div class=body>
      <flowio-modes .hass=${hass} .prefix=${config.entity_prefix} .items=${config.modes} .first=${true}></flowio-modes>
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit)}
    ha-card{overflow:hidden}
    .body{padding:16px}
  `;
}

class FlowioModesCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, error: { state: true } };
  declare hass?: Hass;
  private config?: ModesConfig;
  private error = '';

  setConfig(input: unknown) { this.config = normalizeModesConfig(input); this.error = ''; }

  private changed(event: CustomEvent) {
    event.stopPropagation();
    try {
      this.config = normalizeModesConfig(event.detail.value);
      this.error = '';
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this.config }, bubbles: true, composed: true }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Configuration invalide';
    }
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const schema = [
      { name: 'entity_prefix', selector: { text: {} } },
      { name: 'modes', selector: { select: { multiple: true, mode: 'list', options: MODE_ITEMS.map(mode => ({ value: mode, label: MODES[mode].label })) } } }
    ];
    const labels: Record<string, string> = { entity_prefix: 'Préfixe firmware', modes: 'Modes affichés' };
    return html`${this.error ? html`<p role=alert>${this.error}</p>` : nothing}<ha-form .hass=${this.hass} .data=${this.config} .schema=${schema} .computeLabel=${(field: { name: string }) => labels[field.name] ?? field.name} @value-changed=${this.changed}></ha-form>`;
  }

  static styles = css`:host{display:block}p[role=alert]{color:var(--error-color)}`;
}

if (!customElements.get('flowio-modes-card')) customElements.define('flowio-modes-card', FlowioModesCard);
if (!customElements.get('flowio-modes-card-editor')) customElements.define('flowio-modes-card-editor', FlowioModesCardEditor);
const registry = window as Window & { customCards?: Array<Record<string, unknown>> };
registry.customCards ??= [];
if (!registry.customCards.some(card => card.type === 'flowio-modes-card')) {
  registry.customCards.push({ type: 'flowio-modes-card', name: 'Flow.io Modes', description: 'Modes manuel, automatique et hivernage.', preview: true });
}
