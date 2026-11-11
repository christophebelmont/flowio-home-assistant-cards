import { LitElement, html, css, nothing } from 'lit';
import type { EntityState } from './model';
import { displayName, entityName } from './names';

export interface OrderItem {
  value: string;
  label: string;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function mergeOrder(previous: readonly string[], selected: readonly string[]): string[] {
  const chosen = new Set(selected);
  const kept = previous.filter(value => chosen.has(value));
  const added = selected.filter(value => !previous.includes(value));
  return [...kept, ...added];
}

export function orderItems(ids: readonly string[], states: Record<string, EntityState> | undefined, prefix: string): OrderItem[] {
  return ids.map(id => ({ value: id, label: displayName(entityName(id, states?.[id]), prefix) }));
}

class FlowioOrderList extends LitElement {
  static properties = { items: { attribute: false }, heading: { type: String } };
  declare items: OrderItem[];
  heading = 'Ordre d’affichage';

  constructor() {
    super();
    this.items = [];
  }

  private move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= this.items.length) return;
    const order = moveItem(this.items.map(item => item.value), index, to);
    this.dispatchEvent(new CustomEvent('order-changed', { detail: { order }, bubbles: true, composed: true }));
  }

  render() {
    if (this.items.length < 2) return nothing;
    return html`<div class=order>
      <div class=order-heading>${this.heading}</div>
      ${this.items.map((item, index) => html`<div class=order-row>
        <span class=order-label>${item.label}</span>
        <div class=order-actions>
          <button type=button class=order-button ?disabled=${index === 0} aria-label=${`Monter ${item.label}`} title="Monter" @click=${() => this.move(index, -1)}>▲</button>
          <button type=button class=order-button ?disabled=${index === this.items.length - 1} aria-label=${`Descendre ${item.label}`} title="Descendre" @click=${() => this.move(index, 1)}>▼</button>
        </div>
      </div>`)}
    </div>`;
  }

  static styles = css`
    :host{display:block}
    .order{margin:12px 0}
    .order-heading{font-size:calc(.8rem * var(--fio-font-scale, 1.32));font-weight:600;color:var(--secondary-text-color);margin:0 0 6px}
    .order-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--divider-color);border-radius:8px;margin-bottom:6px;background:var(--card-background-color)}
    .order-label{flex:1;min-width:0;overflow-wrap:anywhere;font-size:calc(.82rem * var(--fio-font-scale, 1.32))}
    .order-actions{display:flex;gap:4px;flex-shrink:0}
    .order-button{width:32px;height:32px;padding:0;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:.75rem;cursor:pointer}
    .order-button:disabled{opacity:.4;cursor:default}
    .order-button:not(:disabled):hover{border-color:var(--primary-color);color:var(--primary-color)}
  `;
}

if (!customElements.get('flowio-order-list')) customElements.define('flowio-order-list', FlowioOrderList);
