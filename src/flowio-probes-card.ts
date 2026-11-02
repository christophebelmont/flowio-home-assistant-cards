import { LitElement, html, css, nothing } from 'lit';
import { available, type Hass } from './model';
import {
  PROBE_TONES,
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

const COLOR_OPTIONS = [
  { value: '', label: 'Automatique' },
  { value: 'water', label: 'Eau · bleu' },
  { value: 'air', label: 'Air · ambre' },
  { value: 'ph', label: 'pH · violet' },
  { value: 'orp', label: 'ORP · cyan' },
  { value: 'pressure', label: 'Pression · orange' },
  { value: '__custom', label: 'Personnalisée (YAML)' }
];

function colorChoice(value?: string): string {
  if (value === undefined) return '';
  return (PROBE_TONES as readonly string[]).includes(value) ? value : '__custom';
}

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
    const ratio = scale && value !== undefined ? Math.min(100, Math.max(0, (value - scale.min) / (scale.max - scale.min) * 100)) : undefined;
    const text = !state ? 'Entité absente' : !available(state) ? 'Indisponible' : value === undefined ? state.state : `${state.state}${unit ? ` ${unit}` : ''}`;
    const { tone, custom } = resolveProbeColor(config, id, state);
    return html`<div class=probe data-entity=${id} data-tone=${tone} data-available=${available(state) ? 'true' : 'false'} style=${custom ? `--fio-accent:${custom}` : ''}>
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
    const namePrefix = config.name_prefix || commonNamePrefix(ids.map(id => rawProbeName(id, hass.states[id])));
    return html`<ha-card><div class=body>
      <h3 class=title>${config.title}</h3>
      ${ids.length ? html`<div class=probes>${ids.map(id => this.probe(id, namePrefix))}</div>`
        : html`<p class=empty>${config.auto ? 'Aucune sonde découverte pour ce préfixe.' : 'Aucune entité sélectionnée.'}</p>`}
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit);--fio-accent:var(--primary-color);--fio-water:var(--flowio-water-color,var(--blue-color,var(--primary-color)));--fio-air:var(--flowio-air-color,var(--amber-color,var(--accent-color,var(--primary-color))));--fio-ph:var(--flowio-ph-color,var(--purple-color,var(--accent-color,var(--primary-color))));--fio-orp:var(--flowio-orp-color,var(--cyan-color,var(--info-color,var(--primary-color))));--fio-pressure:var(--flowio-pressure-color,var(--orange-color,var(--accent-color,var(--primary-color))))}
    ha-card{overflow:hidden}
    .body{padding:16px}
    .title{margin:0 0 8px;font-size:1.05rem;font-weight:650;line-height:1.25}
    .empty{margin:0;font-size:.82rem;color:var(--secondary-text-color)}
    .probes{display:flex;flex-direction:column;gap:16px}
    .probe{min-width:0}
    .probe[data-tone=water]{--fio-accent:var(--fio-water)}
    .probe[data-tone=air]{--fio-accent:var(--fio-air)}
    .probe[data-tone=ph]{--fio-accent:var(--fio-ph)}
    .probe[data-tone=orp]{--fio-accent:var(--fio-orp)}
    .probe[data-tone=pressure]{--fio-accent:var(--fio-pressure)}
    .probe-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;width:100%;min-width:0;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;overflow-wrap:anywhere}
    .probe-head:disabled{cursor:default}
    .probe-name{font-size:.86rem;font-weight:600;line-height:1.3}
    .probe-value{font-size:.9rem;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}
    .bar{position:relative;height:9px;margin-top:8px;border-radius:999px;background:var(--secondary-background-color);box-shadow:inset 0 0 0 1px var(--divider-color);overflow:hidden}
    .fill{display:block;height:100%;border-radius:999px;background:var(--fio-accent);transition:width .2s ease}
    .limits{display:flex;justify-content:space-between;margin-top:5px;font-size:.62rem;color:var(--secondary-text-color);font-variant-numeric:tabular-nums}
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
    return this.config && this.hass ? probeIds(this.config, this.hass) : [];
  }

  private changed(event: CustomEvent) {
    event.stopPropagation();
    if (!this.config || !this.hass) return;
    try {
      const value = (event.detail?.value ?? {}) as Record<string, unknown>;
      const ids = this.ids();
      const colors = { ...this.config.colors };
      ids.forEach((id, index) => {
        const choice = value[`probe_${index}`];
        if (choice === '__custom') return;
        if (typeof choice === 'string' && choice) colors[id] = choice;
        else delete colors[id];
      });
      const next: Record<string, unknown> = { ...value, colors };
      for (const key of Object.keys(next)) if (key.startsWith('probe_')) delete next[key];
      this.config = normalizeProbesConfig(next);
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
    const ids = this.ids();
    const namePrefix = this.config.name_prefix || commonNamePrefix(ids.map(id => rawProbeName(id, this.hass!.states[id])));
    const labels: Record<string, string> = {
      title: 'Titre',
      entity_prefix: 'Préfixe firmware',
      auto: 'Ajouter automatiquement les sondes découvertes',
      entities: 'Entités ajoutées manuellement',
      name_prefix: 'Préfixe de nom à retirer (vide = automatique)'
    };
    ids.forEach((id, index) => { labels[`probe_${index}`] = probeDisplayName(rawProbeName(id, this.hass!.states[id]), namePrefix); });
    const colorFields = ids.map((id, index) => ({ name: `probe_${index}`, selector: { select: { mode: 'dropdown', options: COLOR_OPTIONS } } }));
    const data = { ...this.config, ...Object.fromEntries(ids.map((id, index) => [`probe_${index}`, colorChoice(this.config!.colors[id])])) };
    const schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'entity_prefix', selector: { text: {} } },
      { name: 'auto', selector: { boolean: {} } },
      { name: 'entities', selector: { select: { multiple: true, mode: 'list', options: this.options() } } },
      { name: 'name_prefix', selector: { text: {} } },
      ...colorFields
    ];
    return html`<p>Les couleurs suivent le modèle Flow.io (Eau, Air, pH, ORP, Pression) et restent modifiables par sonde. Une valeur hexadécimale personnalisée se règle dans <code>colors</code> en YAML.</p>${this.error ? html`<p role=alert>${this.error}</p>` : nothing}<ha-form .hass=${this.hass} .data=${data} .schema=${schema} .computeLabel=${(field: { name: string }) => labels[field.name] ?? field.name} @value-changed=${this.changed}></ha-form>`;
  }

  static styles = css`:host{display:block}p{color:var(--secondary-text-color);line-height:1.5}p[role=alert]{color:var(--error-color)}code{font-size:.85em}`;
}

if (!customElements.get('flowio-probes-card')) customElements.define('flowio-probes-card', FlowioProbesCard);
if (!customElements.get('flowio-probes-card-editor')) customElements.define('flowio-probes-card-editor', FlowioProbesCardEditor);
const registry = window as Window & { customCards?: Array<Record<string, unknown>> };
registry.customCards ??= [];
if (!registry.customCards.some(card => card.type === 'flowio-probes-card')) {
  registry.customCards.push({ type: 'flowio-probes-card', name: 'Flow.io Sondes', description: 'Sondes dynamiques avec barres de valeur et couleurs Flow.io.', preview: true });
}
