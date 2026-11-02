import { LitElement, html, css, nothing } from 'lit';
import { roleLabel } from './entities';
import { ensureHaElements } from './ha-controls';
import { available, type Hass } from './model';
import { treatmentFromFirmware, type Treatment } from './modes-model';
import { iconFor, toneFor } from './visual';
import {
  EQUIPMENT_ROLES,
  canToggleEquipment,
  equipmentEntityId,
  equipmentLabel,
  normalizeEquipmentConfig,
  type EquipmentConfig,
  type EquipmentRole
} from './equipment-model';

class FlowioEquipmentCard extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, busy: { state: true }, error: { state: true } };
  declare hass?: Hass;
  private config?: EquipmentConfig;
  private busy = '';
  private error = '';

  static getConfigElement() { return document.createElement('flowio-equipment-card-editor'); }
  static getStubConfig(): EquipmentConfig { return normalizeEquipmentConfig({}); }
  setConfig(input: unknown) { this.config = normalizeEquipmentConfig(input); this.error = ''; }
  getCardSize() { return 4; }

  connectedCallback() {
    super.connectedCallback();
    void ensureHaElements(['ha-switch']).catch(error => {
      console.error('[flowio] Contrôles Home Assistant indisponibles', error);
      this.error = 'Contrôles Home Assistant indisponibles. Recharger le tableau de bord.';
    });
  }

  private more(entityId: string) {
    if (this.hass?.states[entityId]) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
    }
  }

  private async command(role: EquipmentRole, treatment?: Treatment) {
    const config = this.config, hass = this.hass;
    if (!config || !hass || this.busy || !canToggleEquipment(hass, config.entity_prefix, role, treatment)) return;
    const id = equipmentEntityId(config.entity_prefix, role, treatment);
    const on = hass.states[id].state === 'on';
    if (!on && ['ph_pump', 'disinfection_pump', 'filtration'].includes(role) &&
        !window.confirm(`Démarrer ${equipmentLabel(role, treatment)} ? Cette commande peut modifier les modes automatiques. Flow.io reste responsable des sécurités.`)) return;
    this.busy = role;
    this.error = '';
    try {
      await hass.callService('switch', on ? 'turn_off' : 'turn_on', { entity_id: id });
    } catch {
      this.error = 'Commande refusée ou échouée. Vérifier les droits, la disponibilité et les sécurités Flow.io.';
    } finally {
      this.busy = '';
    }
  }

  private row(role: EquipmentRole, treatment?: Treatment) {
    const config = this.config!, hass = this.hass!;
    const id = equipmentEntityId(config.entity_prefix, role, treatment);
    const state = hass.states[id];
    const on = state?.state === 'on';
    const label = equipmentLabel(role, treatment);
    const enabled = canToggleEquipment(hass, config.entity_prefix, role, treatment);
    const status = !state ? 'Entité absente' : !available(state) ? 'Indisponible' : on ? 'En marche' : state.state === 'off' ? 'Arrêté' : 'État non commandable';
    const action = `${on ? 'Arrêter' : 'Démarrer'} ${label}`;
    return html`<div class=row data-equipment=${role} data-tone=${toneFor(role)} data-on=${on ? 'true' : 'false'} data-available=${available(state) ? 'true' : 'false'}>
      <button type=button class=info ?disabled=${!state} @click=${() => this.more(id)}>
        <span class=icon-plate><ha-icon .icon=${iconFor(role)} aria-hidden=true></ha-icon></span>
        <span class=copy><span class=name>${label}</span><span class=state>${status}</span></span>
      </button>
      <ha-switch .checked=${on} .disabled=${!enabled || !!this.busy} .accessibleLabel=${action} aria-label=${action}
        @change=${(event: Event) => { event.stopPropagation(); const control = event.currentTarget as HTMLElement & { checked: boolean }; const wanted = control.checked; control.checked = on; if (wanted !== on) void this.command(role, treatment); }}></ha-switch>
    </div>`;
  }

  render() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return html`<ha-card><div class=body>En attente de Home Assistant…</div></ha-card>`;
    const treatment = treatmentFromFirmware(hass, config.entity_prefix);
    return html`<ha-card><div class=body>
      <h3 class=title>${config.title}</h3>
      ${this.error ? html`<p class=error role=alert>${this.error}</p>` : nothing}
      <div class=grid>${config.entities.map(role => this.row(role, treatment))}</div>
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit);--fio-accent:var(--primary-color);--fio-water:var(--flowio-water-color,var(--blue-color,var(--primary-color)));--fio-air:var(--flowio-air-color,var(--amber-color,var(--accent-color,var(--primary-color))));--fio-ph:var(--flowio-ph-color,var(--purple-color,var(--accent-color,var(--primary-color))));--fio-orp:var(--flowio-orp-color,var(--cyan-color,var(--info-color,var(--primary-color))));--fio-pressure:var(--flowio-pressure-color,var(--orange-color,var(--accent-color,var(--primary-color))))}
    ha-card{overflow:hidden}
    .body{padding:16px}
    .title{margin:0 0 12px;font-size:1.05rem;font-weight:650;line-height:1.25}
    .error{margin:0 0 10px;color:var(--error-color);font-size:.78rem}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .row{display:flex;align-items:center;gap:10px;min-width:0;padding:8px 12px;border:1px solid var(--divider-color);border-radius:14px;background:transparent}
    .row[data-on=true]{border-color:var(--fio-accent);background:color-mix(in srgb,var(--fio-accent) 8%,transparent)}
    .info{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:10px;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;min-height:44px}
    .info:disabled{cursor:default}
    .icon-plate{display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:36px;border-radius:10px;color:var(--fio-accent);background:color-mix(in srgb,var(--fio-accent) 18%,var(--ha-card-background,var(--card-background-color)))}
    .icon-plate ha-icon{--mdc-icon-size:20px}
    .copy{display:flex;flex-direction:column;gap:2px;min-width:0}
    .name{font-size:.86rem;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
    .state{font-size:.72rem;color:var(--secondary-text-color)}
    .row[data-tone=water]{--fio-accent:var(--fio-water)}
    .row[data-tone=air]{--fio-accent:var(--fio-air)}
    .row[data-tone=ph]{--fio-accent:var(--fio-ph)}
    .row[data-tone=orp]{--fio-accent:var(--fio-orp)}
    .row[data-tone=pressure]{--fio-accent:var(--fio-pressure)}
    @container(max-width:420px){.grid{grid-template-columns:minmax(0,1fr)}}
  `;
}

class FlowioEquipmentCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, error: { state: true } };
  declare hass?: Hass;
  private config?: EquipmentConfig;
  private error = '';

  setConfig(input: unknown) { this.config = normalizeEquipmentConfig(input); this.error = ''; }

  private changed(event: CustomEvent) {
    event.stopPropagation();
    try {
      this.config = normalizeEquipmentConfig(event.detail.value);
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
      { name: 'entities', selector: { select: { multiple: true, mode: 'list', options: EQUIPMENT_ROLES.map(role => ({ value: role, label: roleLabel(role) })) } } }
    ];
    const labels: Record<string, string> = { title: 'Titre', entity_prefix: 'Préfixe firmware', entities: 'Équipements affichés' };
    return html`${this.error ? html`<p role=alert>${this.error}</p>` : nothing}<ha-form .hass=${this.hass} .data=${this.config} .schema=${schema} .computeLabel=${(field: { name: string }) => labels[field.name] ?? field.name} @value-changed=${this.changed}></ha-form>`;
  }

  static styles = css`:host{display:block}p[role=alert]{color:var(--error-color)}`;
}

if (!customElements.get('flowio-equipment-card')) customElements.define('flowio-equipment-card', FlowioEquipmentCard);
if (!customElements.get('flowio-equipment-card-editor')) customElements.define('flowio-equipment-card-editor', FlowioEquipmentCardEditor);
const registry = window as Window & { customCards?: Array<Record<string, unknown>> };
registry.customCards ??= [];
if (!registry.customCards.some(card => card.type === 'flowio-equipment-card')) {
  registry.customCards.push({ type: 'flowio-equipment-card', name: 'Flow.io Équipements', description: 'Marche/arrêt des équipements.', preview: true });
}
