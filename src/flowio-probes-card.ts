import { LitElement, html, css, nothing } from 'lit';
import { available, type Hass } from './model';
import {
  commonNamePrefix,
  normalizeProbesConfig,
  probeDisplayName,
  probeIds,
  probeScale,
  probeValue,
  rawProbeName,
  resolveProbeColor,
  type ProbesConfig
} from './probes-model';

const PALETTE = ['#0288d1', '#00acc1', '#26a69a', '#43a047', '#7cb342', '#fbc02d', '#ffa000', '#f4511e', '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#546e7a', '#9e9e9e'];

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

  private probe(id: string, namePrefix: string) {
    const config = this.config!, state = this.hass!.states[id];
    const label = probeDisplayName(rawProbeName(id, state), namePrefix);
    const unit = typeof state?.attributes.unit_of_measurement === 'string' ? state.attributes.unit_of_measurement : '';
    const value = probeValue(state);
    const scale = probeScale(config, id, state);
    const ratio = value !== undefined ? Math.min(100, Math.max(0, (value - scale.min) / (scale.max - scale.min) * 100)) : 0;
    const text = !state ? 'Entité absente' : !available(state) ? 'Indisponible' : value === undefined ? state.state : `${state.state}${unit ? ` ${unit}` : ''}`;
    const { tone, custom } = resolveProbeColor(config, id, state);
    return html`<div class=probe data-entity=${id} data-tone=${tone} data-available=${available(state) ? 'true' : 'false'} style=${custom ? `--fio-accent:${custom}` : ''}>
      <button type=button class=probe-head ?disabled=${!state} @click=${() => this.more(id)}>
        <span class=probe-name>${label}</span>
        <strong class=probe-value>${text}</strong>
      </button>
      <div class=bar aria-hidden=true><span class=fill style=${`width:${ratio}%`}></span></div>
      <div class=limits aria-hidden=true><span>${scale.min}</span><span>${scale.max}</span></div>
    </div>`;
  }

  render() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return html`<ha-card><div class=body>En attente de Home Assistant…</div></ha-card>`;
    const ids = probeIds(config);
    const namePrefix = config.name_prefix || commonNamePrefix(ids.map(id => rawProbeName(id, hass.states[id])));
    return html`<ha-card><div class=body>
      <h3 class=title>${config.title}</h3>
      ${ids.length ? html`<div class=probes>${ids.map(id => this.probe(id, namePrefix))}</div>`
        : html`<p class=empty>Aucune entité sélectionnée.</p>`}
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit);--fio-accent:var(--primary-color);--fio-water:var(--flowio-water-color,var(--blue-color,var(--primary-color)));--fio-air:var(--flowio-air-color,var(--amber-color,var(--accent-color,var(--primary-color))));--fio-ph:var(--flowio-ph-color,var(--purple-color,var(--accent-color,var(--primary-color))));--fio-orp:var(--flowio-orp-color,var(--cyan-color,var(--info-color,var(--primary-color))));--fio-pressure:var(--flowio-pressure-color,var(--orange-color,var(--accent-color,var(--primary-color))))}
    ha-card{overflow:hidden}
    .body{padding:16px}
    .title{margin:0 0 8px;font-size:calc(1.05rem * var(--fio-font-scale, 1.1));font-weight:650;line-height:1.25}
    .empty{margin:0;font-size:calc(.82rem * var(--fio-font-scale, 1.1));color:var(--secondary-text-color)}
    .probes{display:flex;flex-direction:column;gap:16px}
    .probe{min-width:0}
    .probe[data-tone=water]{--fio-accent:var(--fio-water)}
    .probe[data-tone=air]{--fio-accent:var(--fio-air)}
    .probe[data-tone=ph]{--fio-accent:var(--fio-ph)}
    .probe[data-tone=orp]{--fio-accent:var(--fio-orp)}
    .probe[data-tone=pressure]{--fio-accent:var(--fio-pressure)}
    .probe-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;width:100%;min-width:0;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;overflow-wrap:anywhere}
    .probe-head:disabled{cursor:default}
    .probe-name{font-size:calc(.86rem * var(--fio-font-scale, 1.1));font-weight:600;line-height:1.3}
    .probe-value{font-size:calc(.9rem * var(--fio-font-scale, 1.1));font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
    .bar{position:relative;height:12px;margin-top:8px;border-radius:999px;background:var(--secondary-background-color);overflow:hidden}
    .fill{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--fio-accent),color-mix(in srgb,var(--fio-accent) 45%,var(--ha-card-background,var(--card-background-color))));transition:width .2s ease}
    .limits{display:flex;justify-content:space-between;margin-top:5px;font-size:calc(.62rem * var(--fio-font-scale, 1.1));color:var(--secondary-text-color);font-variant-numeric:tabular-nums}
    @media (prefers-reduced-motion: reduce){.fill{transition:none}}
  `;
}

class FlowioProbesCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, error: { state: true } };
  declare hass?: Hass;
  private config?: ProbesConfig;
  private error = '';

  setConfig(input: unknown) { this.config = normalizeProbesConfig(input); this.error = ''; }

  private ids(): string[] {
    return this.config ? probeIds(this.config) : [];
  }

  private commit(config: ProbesConfig) {
    this.config = config;
    this.error = '';
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  private changed(event: CustomEvent) {
    event.stopPropagation();
    if (!this.config) return;
    try {
      const value = (event.detail?.value ?? {}) as Record<string, unknown>;
      this.commit(normalizeProbesConfig({ ...value, colors: this.config.colors }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Configuration invalide';
    }
  }

  private setColor(id: string, value: string) {
    if (!this.config) return;
    const colors = { ...this.config.colors };
    if (value) colors[id] = value;
    else delete colors[id];
    this.commit(normalizeProbesConfig({ ...this.config, colors }));
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

  private colorRow(id: string, namePrefix: string) {
    const current = this.config!.colors[id] ?? '';
    const label = probeDisplayName(rawProbeName(id, this.hass!.states[id]), namePrefix);
    return html`<div class=color-row>
      <span class=color-name>${label}</span>
      <div class=swatches role=group aria-label=${`Couleur de ${label}`}>
        <button type=button class="swatch auto" data-selected=${current ? 'false' : 'true'} title="Automatique" aria-label=${`Couleur automatique pour ${label}`} @click=${() => this.setColor(id, '')}>Auto</button>
        ${PALETTE.map(hex => html`<button type=button class=swatch style=${`--swatch:${hex}`} data-selected=${current === hex ? 'true' : 'false'} title=${hex} aria-label=${`Couleur ${hex} pour ${label}`} @click=${() => this.setColor(id, hex)}></button>`)}
      </div>
    </div>`;
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const ids = this.ids();
    const namePrefix = this.config.name_prefix || commonNamePrefix(ids.map(id => rawProbeName(id, this.hass!.states[id])));
    const labels: Record<string, string> = {
      title: 'Titre',
      entity_prefix: 'Préfixe firmware',
      name_prefix: 'Texte à retirer devant les noms (vide = automatique)',
      entities: 'Entités'
    };
    const schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'entity_prefix', selector: { text: {} } },
      { name: 'name_prefix', selector: { text: {} } },
      { name: 'entities', selector: { select: { multiple: true, mode: 'list', options: this.options() } } }
    ];
    return html`<p>La couleur « Auto » suit le modèle Flow.io et le thème. Choisir une pastille fixe une couleur propre à la sonde.</p>${this.error ? html`<p role=alert>${this.error}</p>` : nothing}<ha-form .hass=${this.hass} .data=${this.config} .schema=${schema} .computeLabel=${(field: { name: string }) => labels[field.name] ?? field.name} @value-changed=${this.changed}></ha-form>${ids.length ? html`<div class=colors><h4>Couleurs des sondes</h4>${ids.map(id => this.colorRow(id, namePrefix))}</div>` : nothing}`;
  }

  static styles = css`
    :host{display:block}
    p{color:var(--secondary-text-color);line-height:1.5}
    p[role=alert]{color:var(--error-color)}
    .colors{margin-top:16px}
    .colors h4{margin:0 0 10px;font-size:calc(.9rem * var(--fio-font-scale, 1.1))}
    .color-row{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
    .color-name{font-size:calc(.8rem * var(--fio-font-scale, 1.1));font-weight:600}
    .swatches{display:flex;flex-wrap:wrap;gap:6px}
    .swatch{width:26px;height:26px;padding:0;border-radius:50%;border:1px solid var(--divider-color);background:var(--swatch);cursor:pointer}
    .swatch.auto{width:auto;padding:0 10px;border-radius:999px;background:var(--secondary-background-color);font:inherit;font-size:calc(.72rem * var(--fio-font-scale, 1.1));color:var(--secondary-text-color)}
    .swatch[data-selected=true]{outline:2px solid var(--primary-color);outline-offset:2px}
  `;
}

if (!customElements.get('flowio-probes-card')) customElements.define('flowio-probes-card', FlowioProbesCard);
if (!customElements.get('flowio-probes-card-editor')) customElements.define('flowio-probes-card-editor', FlowioProbesCardEditor);
const registry = window as Window & { customCards?: Array<Record<string, unknown>> };
registry.customCards ??= [];
if (!registry.customCards.some(card => card.type === 'flowio-probes-card')) {
  registry.customCards.push({ type: 'flowio-probes-card', name: 'Flow.io Sondes', description: 'Sondes dynamiques avec barres de valeur et couleurs personnalisables.', preview: true });
}
