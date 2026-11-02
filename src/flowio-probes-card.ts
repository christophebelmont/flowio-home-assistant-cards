import { LitElement, html, css, nothing } from 'lit';
import { available, type Hass } from './model';
import {
  normalizeProbesConfig,
  probeIds,
  probeLabel,
  probeScale,
  probeValue,
  type ProbesConfig
} from './probes-model';

class FlowioProbesCard extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true } };
  declare hass?: Hass;
  private config?: ProbesConfig;

  static getConfigElement() { return document.createElement('flowio-probes-card-editor'); }
  static getStubConfig(): ProbesConfig { return normalizeProbesConfig({}); }
  setConfig(input: unknown) { this.config = normalizeProbesConfig(input); }
  getCardSize() { return 4; }

  private more(entityId: string) {
    if (this.hass?.states[entityId]) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
    }
  }

  private probe(id: string) {
    const config = this.config!, state = this.hass!.states[id];
    const label = probeLabel(id, state);
    const unit = typeof state?.attributes.unit_of_measurement === 'string' ? state.attributes.unit_of_measurement : '';
    const value = probeValue(state);
    const scale = probeScale(config, id, state);
    const ratio = scale && value !== undefined ? Math.min(100, Math.max(0, (value - scale.min) / (scale.max - scale.min) * 100)) : undefined;
    const text = !state ? 'Entité absente' : !available(state) ? 'Indisponible' : value === undefined ? state.state : `${state.state}${unit ? ` ${unit}` : ''}`;
    return html`<div class=probe data-entity=${id} data-available=${available(state) ? 'true' : 'false'}>
      <button type=button class=probe-head ?disabled=${!state} @click=${() => this.more(id)}>
        <span class=probe-name>${label}</span>
        <strong class=probe-value>${text}</strong>
      </button>
      ${scale ? html`<div class=bar aria-hidden=true><span class=fill style=${`width:${ratio ?? 0}%`}></span></div><div class=limits aria-hidden=true><span>${scale.min}</span><span>${scale.max}</span></div>` : nothing}
    </div>`;
  }

  render() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return html`<ha-card><div class=body>En attente de Home Assistant…</div></ha-card>`;
    const ids = probeIds(config, hass);
    return html`<ha-card><div class=body>
      <h3 class=title>${config.title}</h3>
      ${ids.length ? html`<div class=probes>${ids.map(id => this.probe(id))}</div>`
        : html`<p class=empty>${config.auto ? 'Aucune sonde découverte pour ce préfixe.' : 'Aucune entité sélectionnée.'}</p>`}
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit);--fio-accent:var(--primary-color)}
    ha-card{overflow:hidden}
    .body{padding:16px}
    .title{margin:0 0 8px;font-size:1.05rem;font-weight:650;line-height:1.25}
    .empty{margin:0;font-size:.82rem;color:var(--secondary-text-color)}
    .probes{display:flex;flex-direction:column;gap:16px}
    .probe{min-width:0}
    .probe-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;width:100%;min-width:0;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;overflow-wrap:anywhere}
    .probe-head:disabled{cursor:default}
    .probe-name{font-size:.86rem;font-weight:600;line-height:1.3}
    .probe-value{font-size:.9rem;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
    .bar{position:relative;height:9px;margin-top:8px;border-radius:999px;background:var(--secondary-background-color);box-shadow:inset 0 0 0 1px var(--divider-color);overflow:hidden}
    .fill{display:block;height:100%;border-radius:999px;background:var(--fio-accent);transition:width .2s ease}
    .limits{display:flex;justify-content:space-between;margin-top:5px;font-size:.62rem;color:var(--secondary-text-color);font-variant-numeric:tabular-nums}
    .probe[data-available=false] .bar{box-shadow:inset 0 0 0 1px var(--divider-color)}
    @media (prefers-reduced-motion: reduce){.fill{transition:none}}
  `;
}

class FlowioProbesCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, error: { state: true } };
  declare hass?: Hass;
  private config?: ProbesConfig;
  private error = '';

  setConfig(input: unknown) { this.config = normalizeProbesConfig(input); this.error = ''; }

  private changed(event: CustomEvent) {
    event.stopPropagation();
    try {
      this.config = normalizeProbesConfig(event.detail.value);
      this.error = '';
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this.config }, bubbles: true, composed: true }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Configuration invalide';
    }
  }

  private options(): { value: string; label: string }[] {
    if (!this.hass) return [];
    const stem = this.config?.entity_prefix ? `${this.config.entity_prefix}_` : '';
    return Object.keys(this.hass.states)
      .filter(id => id.startsWith(`sensor.${stem}`))
      .sort()
      .map(id => {
        const name = this.hass!.states[id].attributes.friendly_name;
        return { value: id, label: typeof name === 'string' && name ? `${name} · ${id}` : id };
      });
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'entity_prefix', selector: { text: {} } },
      { name: 'auto', selector: { boolean: {} } },
      { name: 'entities', selector: { select: { multiple: true, mode: 'list', options: this.options() } } }
    ];
    const labels: Record<string, string> = { title: 'Titre', entity_prefix: 'Préfixe firmware', auto: 'Ajouter automatiquement les sondes découvertes', entities: 'Entités ajoutées manuellement' };
    return html`<p>Avec l’ajout automatique, toute sonde <code>sensor.&lt;préfixe&gt;_data_*</code> découverte par Home Assistant apparaît sans reconfiguration.</p>${this.error ? html`<p role=alert>${this.error}</p>` : nothing}<ha-form .hass=${this.hass} .data=${this.config} .schema=${schema} .computeLabel=${(field: { name: string }) => labels[field.name] ?? field.name} @value-changed=${this.changed}></ha-form>`;
  }

  static styles = css`:host{display:block}p{color:var(--secondary-text-color);line-height:1.5}p[role=alert]{color:var(--error-color)}code{font-size:.85em}`;
}

if (!customElements.get('flowio-probes-card')) customElements.define('flowio-probes-card', FlowioProbesCard);
if (!customElements.get('flowio-probes-card-editor')) customElements.define('flowio-probes-card-editor', FlowioProbesCardEditor);
const registry = window as Window & { customCards?: Array<Record<string, unknown>> };
registry.customCards ??= [];
if (!registry.customCards.some(card => card.type === 'flowio-probes-card')) {
  registry.customCards.push({ type: 'flowio-probes-card', name: 'Flow.io Sondes', description: 'Sondes dynamiques avec barres de valeur.', preview: true });
}
