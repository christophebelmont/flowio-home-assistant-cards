import { LitElement, html, css, nothing } from 'lit';
import { normalizePrefix } from './entities';
import { ensureHaElements } from './ha-controls';
import { available, type Hass } from './model';
import { MODES, MODE_ITEMS, canSetMode, modeId, type Mode } from './modes-model';

const SWITCH_MODES = MODE_ITEMS.filter(mode => MODES[mode].domain === 'switch');

interface ModesConfig {
  type: string;
  title: string;
  entity_prefix: string;
  modes: Mode[];
  grid_options?: Record<string, unknown>;
}

function normalizeModesConfig(input: unknown): ModesConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration objet attendue');
  const raw = input as Record<string, unknown>;
  const title = raw.title ?? 'Modes';
  if (typeof title !== 'string' || !title.trim()) throw new Error('Titre invalide');
  const supplied = raw.modes === undefined ? [...SWITCH_MODES] : raw.modes;
  if (!Array.isArray(supplied) || supplied.some(value => typeof value !== 'string' || !(SWITCH_MODES as readonly string[]).includes(value))) {
    throw new Error('Choisir les modes proposés');
  }
  const grid_options = raw.grid_options === undefined ? undefined : raw.grid_options;
  if (grid_options !== undefined && (!grid_options || typeof grid_options !== 'object' || Array.isArray(grid_options))) {
    throw new Error('grid_options doit être un objet');
  }
  return {
    type: 'custom:flowio-modes-card',
    title,
    entity_prefix: normalizePrefix(raw.entity_prefix),
    modes: [...new Set(supplied)] as Mode[],
    ...(grid_options ? { grid_options: grid_options as Record<string, unknown> } : {})
  };
}

class FlowioModesCard extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, pending: { state: true }, error: { state: true } };
  declare hass?: Hass;
  private config?: ModesConfig;
  private pending = '';
  private error = '';

  static getConfigElement() { return document.createElement('flowio-modes-card-editor'); }
  static getStubConfig(): ModesConfig { return normalizeModesConfig({}); }
  setConfig(input: unknown) { this.config = normalizeModesConfig(input); this.error = ''; }
  getCardSize() { return 4; }

  connectedCallback() {
    super.connectedCallback();
    void ensureHaElements(['ha-switch']).catch(error => {
      console.error('[flowio] Contrôles Home Assistant indisponibles', error);
      this.error = 'Contrôles Home Assistant indisponibles. Recharger le tableau de bord.';
    });
  }

  private more(mode: Mode) {
    const config = this.config;
    if (!config) return;
    const id = modeId(config.entity_prefix, mode);
    if (this.hass?.states[id]) this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true }));
  }

  private async change(mode: Mode, value: 'on' | 'off') {
    const config = this.config, hass = this.hass;
    if (!config || !hass || this.pending || !canSetMode(hass, config.entity_prefix, mode, value)) return;
    if (hass.states[modeId(config.entity_prefix, mode)]?.state === value) return;
    const definition = MODES[mode];
    const confirm = mode === 'ph_dose_plus' || (value === 'on' && ['filtration_auto', 'ph_auto', 'disinfection_auto'].includes(mode));
    if (confirm && !window.confirm(`Modifier « ${definition.label} » : ${value === 'on' ? 'activé' : 'désactivé'} ? Cette modification peut changer le pilotage automatique. Les sécurités restent dans Flow.io.`)) return;
    if (this.pending || !canSetMode(hass, config.entity_prefix, mode, value)) return;
    this.pending = mode;
    this.error = '';
    try {
      await hass.callService('switch', value === 'on' ? 'turn_on' : 'turn_off', { entity_id: modeId(config.entity_prefix, mode) });
    } catch {
      this.error = 'Commande refusée ou échouée. Vérifier les droits et la disponibilité.';
    } finally {
      this.pending = '';
    }
  }

  private row(mode: Mode) {
    const config = this.config!, hass = this.hass!;
    const state = hass.states[modeId(config.entity_prefix, mode)];
    const on = state?.state === 'on';
    const definition = MODES[mode];
    const enabled = canSetMode(hass, config.entity_prefix, mode, on ? 'off' : 'on');
    const status = !state ? 'Entité absente' : !available(state) ? 'Indisponible'
      : mode === 'filtration_auto' ? (on ? 'Automatique' : 'Manuel')
      : on ? 'Activé' : ['ph_auto', 'disinfection_auto', 'heater_auto'].includes(mode) ? 'Auto désactivé' : 'Désactivé';
    const action = `${on ? 'Désactiver' : 'Activer'} ${definition.label}`;
    return html`<div class=row data-mode=${mode} data-on=${on ? 'true' : 'false'}>
      <button type=button class=info ?disabled=${!state} @click=${() => this.more(mode)}>
        <span class=icon-plate><ha-icon .icon=${definition.icon} aria-hidden=true></ha-icon></span>
        <span class=copy><span class=name>${definition.label}</span><span class=state>${this.pending === mode ? 'En attente…' : status}</span></span>
      </button>
      <ha-switch .checked=${on} .disabled=${!enabled || !!this.pending} .accessibleLabel=${action} aria-label=${action}
        @change=${(event: Event) => { event.stopPropagation(); const control = event.currentTarget as HTMLElement & { checked: boolean }; const wanted = control.checked; control.checked = on; if (wanted !== on) void this.change(mode, wanted ? 'on' : 'off'); }}></ha-switch>
    </div>`;
  }

  render() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return html`<ha-card><div class=body>En attente de Home Assistant…</div></ha-card>`;
    return html`<ha-card><div class=body>
      <h3 class=title>${config.title}</h3>
      ${this.error ? html`<p class=error role=alert>${this.error}</p>` : nothing}
      <div class=grid>${config.modes.map(mode => this.row(mode))}</div>
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit)}
    ha-card{overflow:hidden}
    .body{padding:16px}
    .title{margin:0 0 12px;font-size:1.05rem;font-weight:650;line-height:1.25}
    .error{margin:0 0 10px;color:var(--error-color);font-size:.78rem}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .row{display:flex;align-items:center;gap:10px;min-width:0;padding:8px 12px;border:1px solid var(--divider-color);border-radius:14px;background:transparent}
    .row[data-on=true]{border-color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 10%,transparent)}
    .info{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:10px;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;min-height:44px}
    .info:disabled{cursor:default}
    .icon-plate{display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:36px;border-radius:10px;color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 14%,var(--ha-card-background,var(--card-background-color)))}
    .icon-plate ha-icon{--mdc-icon-size:20px}
    .copy{display:flex;flex-direction:column;gap:2px;min-width:0}
    .name{font-size:.86rem;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
    .state{font-size:.72rem;color:var(--secondary-text-color)}
    @container(max-width:420px){.grid{grid-template-columns:minmax(0,1fr)}}
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
      { name: 'title', selector: { text: {} } },
      { name: 'entity_prefix', selector: { text: {} } },
      { name: 'modes', selector: { select: { multiple: true, mode: 'list', options: SWITCH_MODES.map(mode => ({ value: mode, label: MODES[mode].label })) } } }
    ];
    const labels: Record<string, string> = { title: 'Titre', entity_prefix: 'Préfixe firmware', modes: 'Modes affichés' };
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
