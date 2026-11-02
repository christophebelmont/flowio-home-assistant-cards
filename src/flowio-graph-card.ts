import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import './flowio-graph-chart';
import { ensureHaElements } from './ha-controls';
import { available, type Hass } from './model';
import { numericValue } from './gauge-model';
import { historyPoints, historySummary, type HistoryPoint } from './history-data';
import { commonNamePrefix, probeDisplayName, rawProbeName } from './probes-model';
import { GRAPH_PALETTE, normalizeGraphConfig, seriesColor, type GraphConfig } from './graph-model';

type GraphHass = Hass & { callApi?: (method: string, path: string) => Promise<unknown> };
interface LoadedSeries { id: string; name: string; color: string; unit: string; points: HistoryPoint[]; }

class FlowioGraphCard extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, loaded: { state: true }, hours: { state: true }, loading: { state: true }, error: { state: true }, controlsError: { state: true }, start: { state: true }, end: { state: true } };
  declare hass?: GraphHass;
  private config?: GraphConfig;
  private loaded: LoadedSeries[] = [];
  private hours = 12;
  private loading = false;
  private error = '';
  private controlsError = '';
  private start = 0;
  private end = 0;
  private generation = 0;
  private done = false;
  private timer?: number;

  static getConfigElement() { return document.createElement('flowio-graph-card-editor'); }
  static getStubConfig(): GraphConfig { return normalizeGraphConfig({}); }
  getCardSize() { return 6; }

  setConfig(input: unknown) {
    this.config = normalizeGraphConfig(input);
    this.hours = this.config.hours_to_show;
    this.loaded = [];
    this.error = '';
    this.done = false;
    ++this.generation;
    if (this.isConnected && this.hass) void this.load();
  }

  connectedCallback() {
    super.connectedCallback();
    void ensureHaElements(['ha-button']).catch(error => {
      console.error('[flowio] Boutons Home Assistant indisponibles', error);
      this.controlsError = 'Boutons natifs Home Assistant indisponibles. Recharger le tableau de bord.';
    });
    this.timer = window.setInterval(() => { if (!this.loading && this.config?.entities.length && this.hass) void this.load(); }, 60000);
    if (this.config && this.hass) void this.load();
  }

  disconnectedCallback() {
    ++this.generation;
    window.clearInterval(this.timer);
    super.disconnectedCallback();
  }

  protected updated(_changed: PropertyValues) {
    if (!this.done && !this.loading && !this.error && this.config && this.hass) void this.load();
  }

  private namePrefix(): string {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return '';
    return commonNamePrefix(config.entities.map(id => rawProbeName(id, hass.states[id])));
  }

  private async load() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return;
    const token = ++this.generation;
    this.error = '';
    this.loading = true;
    this.done = true;
    const ids = config.entities;
    if (!ids.length) { this.loaded = []; this.loading = false; return; }
    if (!hass.callApi) {
      this.loaded = [];
      this.error = 'Impossible de charger les historiques : API Home Assistant indisponible.';
      this.loading = false;
      return;
    }
    const api = hass.callApi.bind(hass);
    this.end = Date.now();
    this.start = this.end - this.hours * 3600000;
    const start = this.start, end = this.end, prefix = this.namePrefix();
    const results = await Promise.all(ids.map(async (id, index): Promise<LoadedSeries> => {
      const sourceUnit = hass.states[id]?.attributes.unit_of_measurement;
      const unit = typeof sourceUnit === 'string' ? sourceUnit : '';
      const name = probeDisplayName(rawProbeName(id, hass.states[id]), prefix);
      const color = seriesColor(config, id, index);
      try {
        const query = new URLSearchParams({ filter_entity_id: id, end_time: new Date(end).toISOString() });
        const response = await api('GET', `history/period/${new Date(start).toISOString()}?${query}`);
        return { id, name, color, unit, points: historyPoints(response, 'ph', sourceUnit, start, end) };
      } catch {
        return { id, name, color, unit, points: [] };
      }
    }));
    if (token !== this.generation || !this.isConnected) return;
    this.loaded = results;
    this.loading = false;
  }

  private format(value: number | undefined, unit: string): string {
    if (value === undefined) return '—';
    const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
    return unit ? `${formatted} ${unit}` : formatted;
  }

  private more(entityId: string) {
    if (this.hass?.states[entityId]) {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
    }
  }

  render() {
    const config = this.config, hass = this.hass;
    if (!config || !hass) return nothing;
    const single = config.entities.length === 1 ? this.loaded[0] : undefined;
    const singleState = single ? hass.states[single.id] : undefined;
    const title = config.title !== 'Graphique' ? config.title : (single ? single.name : 'Graphique');
    const icon = typeof singleState?.attributes.icon === 'string' && singleState.attributes.icon ? singleState.attributes.icon : 'mdi:chart-line';
    const current = singleState && available(singleState) ? numericValue(singleState.state) : undefined;
    const summary = single ? historySummary(single.points) : undefined;
    return html`<ha-card><div class=body>
      <div class=head>
        <span class=icon-plate><ha-icon .icon=${icon} aria-hidden=true></ha-icon></span>
        <div class=head-copy>
          <span class=name>${title}</span>
          ${single ? html`<span class=unit>${single.unit || 'Sans unité'}</span>` : nothing}
        </div>
        ${single ? html`<button type=button class=current ?disabled=${!singleState} @click=${() => this.more(single.id)}><strong>${this.format(current, '')}</strong><small>${!singleState ? 'Entité absente' : !available(singleState) ? 'Indisponible' : 'Actuel'}</small></button>` : nothing}
      </div>
      ${this.controlsError ? html`<p class=warning role=alert>${this.controlsError}</p>` : nothing}
      ${!config.entities.length ? html`<p class=message>Choisir les entités dans l’éditeur.</p>` : nothing}
      ${this.error ? html`<p class=warning role=alert>${this.error}</p>` : nothing}
      <flowio-graph-chart .series=${this.loaded.map(item => ({ name: item.name, color: item.color, points: item.points }))} .chartType=${config.chart_type} .label=${title} .unit=${single?.unit ?? ''} .start=${this.start} .end=${this.end}></flowio-graph-chart>
      ${single && summary ? html`<div class=stats aria-label="Statistiques des échantillons disponibles"><span><small>Minimum</small><strong>${this.format(summary.min, '')}</strong></span><span><small>Moy. échant.</small><strong>${this.format(summary.mean, '')}</strong></span><span><small>Maximum</small><strong>${this.format(summary.max, '')}</strong></span></div>` : nothing}
    </div></ha-card>`;
  }

  static styles = css`
    :host{display:block;container-type:inline-size;color:var(--primary-text-color);font-family:var(--ha-font-family-body,inherit)}
    ha-card{overflow:hidden}
    .body{padding:0}
    .head{display:flex;align-items:center;gap:12px;padding:16px 16px 0}
    .icon-plate{display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;border-radius:12px;color:var(--secondary-text-color);background:color-mix(in srgb,var(--secondary-text-color) 12%,transparent)}
    .icon-plate ha-icon{--mdc-icon-size:24px}
    .head-copy{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 0}
    .name{font-size:.95rem;font-weight:600;line-height:1.25;overflow-wrap:anywhere}
    .unit{font-size:.78rem;color:var(--secondary-text-color)}
    .current{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:0;max-width:45%;padding:0;border:0;background:none;font:inherit;color:inherit;cursor:pointer}
    .current:disabled{cursor:default}
    .current strong{font-size:1.5rem;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums}
    .current small{font-size:.68rem;color:var(--secondary-text-color)}
    .warning{margin:8px 16px 0;font-size:.78rem;color:var(--error-color)}
    .message{margin:8px 16px 0;font-size:.82rem;color:var(--secondary-text-color)}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:14px 16px;border-top:1px solid var(--divider-color)}
    .stats span{display:flex;flex-direction:column;gap:5px;min-width:0}
    .stats small{font-size:.62rem;color:var(--secondary-text-color)}
    .stats strong{font-size:1rem;font-variant-numeric:tabular-nums}
  `;
}

class FlowioGraphCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, error: { state: true } };
  declare hass?: Hass;
  private config?: GraphConfig;
  private error = '';

  setConfig(input: unknown) { this.config = normalizeGraphConfig(input); this.error = ''; }

  private commit(config: GraphConfig) {
    this.config = config;
    this.error = '';
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  private changed(event: CustomEvent) {
    event.stopPropagation();
    if (!this.config) return;
    try {
      const value = (event.detail?.value ?? {}) as Record<string, unknown>;
      this.commit(normalizeGraphConfig({ ...value, colors: this.config.colors }));
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Configuration invalide';
    }
  }

  private setColor(id: string, value: string) {
    if (!this.config) return;
    const colors = { ...this.config.colors };
    if (value) colors[id] = value;
    else delete colors[id];
    this.commit(normalizeGraphConfig({ ...this.config, colors }));
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

  private colorRow(id: string) {
    const selected = this.config!.colors[id] ?? '';
    const name = rawProbeName(id, this.hass!.states[id]);
    return html`<div class=color-row>
      <span class=color-name>${name}</span>
      <div class=swatches role=group aria-label=${`Couleur de ${name}`}>
        <button type=button class="swatch auto" data-selected=${selected ? 'false' : 'true'} title="Automatique" aria-label=${`Couleur automatique pour ${name}`} @click=${() => this.setColor(id, '')}>Auto</button>
        ${GRAPH_PALETTE.map(hex => html`<button type=button class=swatch style=${`--swatch:${hex}`} data-selected=${selected === hex ? 'true' : 'false'} title=${hex} aria-label=${`Couleur ${hex} pour ${name}`} @click=${() => this.setColor(id, hex)}></button>`)}
      </div>
    </div>`;
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const labels: Record<string, string> = {
      title: 'Titre',
      entity_prefix: 'Préfixe firmware',
      hours_to_show: 'Période affichée (heures)',
      chart_type: 'Type de graphique',
      entities: 'Entités affichées'
    };
    const schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'entity_prefix', selector: { text: {} } },
      { name: 'hours_to_show', selector: { number: { min: 1, max: 168, step: 1, mode: 'box', unit_of_measurement: 'h' } } },
      { name: 'chart_type', selector: { select: { mode: 'dropdown', options: [{ value: 'line', label: 'Courbe' }, { value: 'bar', label: 'Barres' }] } } },
      { name: 'entities', selector: { select: { multiple: true, mode: 'list', options: this.options() } } }
    ];
    const entities = this.config.entities;
    return html`<p>La couleur n’est portée que par le graphique. Choisir une pastille par entité ; « Auto » répartit une palette.</p>${this.error ? html`<p role=alert>${this.error}</p>` : nothing}<ha-form .hass=${this.hass} .data=${this.config} .schema=${schema} .computeLabel=${(field: { name: string }) => labels[field.name] ?? field.name} @value-changed=${this.changed}></ha-form>${entities.length ? html`<div class=colors><h4>Couleurs des entités</h4>${entities.map(id => this.colorRow(id))}</div>` : nothing}`;
  }

  static styles = css`
    :host{display:block}
    p{color:var(--secondary-text-color);line-height:1.5}
    p[role=alert]{color:var(--error-color)}
    .colors{margin-top:16px}
    .colors h4{margin:0 0 10px;font-size:.9rem}
    .color-row{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
    .color-name{font-size:.8rem;font-weight:600}
    .swatches{display:flex;flex-wrap:wrap;gap:6px}
    .swatch{width:26px;height:26px;padding:0;border-radius:50%;border:1px solid var(--divider-color);background:var(--swatch);cursor:pointer}
    .swatch.auto{width:auto;padding:0 10px;border-radius:999px;background:var(--secondary-background-color);font:inherit;font-size:.72rem;color:var(--secondary-text-color)}
    .swatch[data-selected=true]{outline:2px solid var(--primary-color);outline-offset:2px}
  `;
}

if (!customElements.get('flowio-graph-card')) customElements.define('flowio-graph-card', FlowioGraphCard);
if (!customElements.get('flowio-graph-card-editor')) customElements.define('flowio-graph-card-editor', FlowioGraphCardEditor);
const registry = window as Window & { customCards?: Array<Record<string, unknown>> };
registry.customCards ??= [];
if (!registry.customCards.some(card => card.type === 'flowio-graph-card')) {
  registry.customCards.push({ type: 'flowio-graph-card', name: 'Flow.io Graphique', description: 'Un graphique ApexCharts, courbe ou barres, entités et couleurs au choix.', preview: true });
}
