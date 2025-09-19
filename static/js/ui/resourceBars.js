// static/js/ui/resourceBars.js
import { formatResourceLabel } from '../systems/resourceManager.js';

export const RESOURCE_BAR_ORDER = ['hp', 'mana', 'stamina', 'energy', 'focus', 'faith', 'ki', 'rage'];

const RESOURCE_COLORS = {
  hp: 'linear-gradient(90deg, #ff4d6d, #ff936a)',
  mana: 'linear-gradient(90deg, #4d7cff, #80b3ff)',
  stamina: 'linear-gradient(90deg, #4fff7a, #7affb1)',
  energy: 'linear-gradient(90deg, #ffd24f, #ffe57a)',
  focus: 'linear-gradient(90deg, #c94fff, #e57aff)',
  faith: 'linear-gradient(90deg, #4ffff6, #7afff6)',
  ki: 'linear-gradient(90deg, #ff884f, #ffb37a)',
  rage: 'linear-gradient(90deg, #ff4f4f, #ff7a7a)',
  default: 'linear-gradient(90deg, #40c4ff, #7ff0ff)',
};

export function colorForResource(key) {
  if (!key) return RESOURCE_COLORS.default;
  return RESOURCE_COLORS[key] || RESOURCE_COLORS.default;
}

export function createResourceBar({ key, label, current, max, shield = 0 }) {
  const wrap = document.createElement('div');
  wrap.className = 'resource-bar';
  wrap.style.margin = '4px 0';
  if (key) wrap.dataset.bar = key;

  const head = document.createElement('div');
  head.className = 'resource-bar-head';
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  head.style.fontSize = '12px';
  head.style.opacity = '0.85';
  head.innerHTML = `<span>${label || formatResourceLabel(key)}</span><span>${formatAmount(current)} / ${formatAmount(max)}</span>`;

  const track = document.createElement('div');
  track.className = 'resource-bar-track';
  track.style.position = 'relative';
  track.style.height = '10px';
  track.style.borderRadius = '6px';
  track.style.background = 'rgba(255,255,255,0.07)';
  track.style.border = '1px solid rgba(255,255,255,0.08)';
  track.style.overflow = 'hidden';

  const fill = document.createElement('div');
  fill.className = 'resource-bar-fill';
  fill.style.height = '100%';
  fill.style.width = `${percentage(current, max).toFixed(1)}%`;
  fill.style.transition = 'width 200ms ease';
  fill.style.background = colorForResource(key);
  track.appendChild(fill);

  const shieldValue = clampValue(shield, 0);
  if (shieldValue > 0) {
    const maxValue = clampValue(max, 0);
    const currentValue = clampValue(current, 0, maxValue);
    const total = maxValue + shieldValue;
    const shieldPct = total > 0 ? ((currentValue + shieldValue) / total) : 0;
    const pct = percentage(currentValue, maxValue) / 100;
    const overlay = document.createElement('div');
    overlay.className = 'resource-bar-shield';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.bottom = '0';
    overlay.style.right = '0';
    overlay.style.width = `${Math.max(0, (shieldPct - pct) * 100).toFixed(1)}%`;
    overlay.style.background = 'linear-gradient(90deg, rgba(135,206,250,0.6), rgba(176,224,230,0.6))';
    track.appendChild(overlay);
  }

  wrap.append(head, track);
  return wrap;
}

function percentage(current, max) {
  const maxValue = clampValue(max, 0);
  if (maxValue <= 0) return 0;
  const currentValue = clampValue(current, 0, maxValue);
  return (currentValue / maxValue) * 100;
}

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.max(0, Math.round(n)));
}

function clampValue(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (!Number.isFinite(max)) return Math.max(min, n);
  return Math.max(min, Math.min(max, n));
}
