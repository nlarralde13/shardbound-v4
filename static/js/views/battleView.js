// static/js/views/battleView.js
export function buildBattleDOM({ root, state, handlers }) {
  if (!root) return;
  const {
    player = {},
    enemy = {},
    turn = 1,
    logs = [],
    abilities = [],
    isLocked = false,
  } = state || {};
  const {
    onAbility = () => {},
    onEndTurn = () => {},
    onSelectTarget = () => {}, // reserved for future targeting support
  } = handlers || {};

  root.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'battle-header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const title = document.createElement('strong');
  title.textContent = `Turn ${turn}`;
  header.appendChild(title);

  const targetInfo = document.createElement('span');
  targetInfo.style.fontSize = '12px';
  targetInfo.style.opacity = '0.75';
  targetInfo.textContent = 'Select a target to inspect';
  targetInfo.style.cursor = 'pointer';
  targetInfo.addEventListener('click', () => onSelectTarget());
  header.appendChild(targetInfo);

  root.appendChild(header);

  const frames = document.createElement('div');
  frames.className = 'battle-frames';
  frames.style.display = 'flex';
  frames.style.justifyContent = 'space-between';
  frames.style.gap = '12px';
  frames.style.marginBottom = '8px';

  frames.appendChild(
    createUnitCard({
      unit: player,
      title: playerTitle(player),
      subtitle: playerSubtitle(player),
      showResources: true,
    })
  );
  frames.appendChild(
    createUnitCard({
      unit: enemy,
      title: enemyTitle(enemy),
      subtitle: enemySubtitle(enemy),
      showResources: true,
    })
  );

  root.appendChild(frames);

  const actions = document.createElement('div');
  actions.className = 'battle-actions';
  actions.style.display = 'flex';
  actions.style.flexWrap = 'wrap';
  actions.style.gap = '8px';
  actions.style.margin = '8px 0';

  abilities.forEach((ability) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ability-btn';
    btn.style.minWidth = '120px';
    btn.textContent = ability.costLabel
      ? `${ability.name} (${ability.costLabel})`
      : ability.name;
    btn.disabled = !!ability.disabled;
    btn.addEventListener('click', () => onAbility(ability.id));
    actions.appendChild(btn);
  });

  const endTurnBtn = document.createElement('button');
  endTurnBtn.type = 'button';
  endTurnBtn.className = 'btn end-turn-btn';
  endTurnBtn.style.minWidth = '96px';
  endTurnBtn.textContent = 'End Turn';
  endTurnBtn.disabled = !!isLocked;
  endTurnBtn.addEventListener('click', () => onEndTurn());
  actions.appendChild(endTurnBtn);

  root.appendChild(actions);

  const logPanel = document.createElement('div');
  logPanel.className = 'battle-log';
  logPanel.style.maxHeight = '200px';
  logPanel.style.overflow = 'auto';
  logPanel.style.padding = '8px';
  logPanel.style.background = 'rgba(0,0,0,0.25)';
  logPanel.style.borderRadius = '8px';
  logPanel.style.border = '1px solid rgba(255,255,255,0.06)';

  logs.forEach((line) => {
    const entry = document.createElement('div');
    entry.textContent = line;
    logPanel.appendChild(entry);
  });
  logPanel.scrollTop = logPanel.scrollHeight;

  root.appendChild(logPanel);
}

function createUnitCard({ unit = {}, title = 'Unit', subtitle = '', showResources = false }) {
  const card = document.createElement('div');
  card.className = 'battle-unit';
  card.style.flex = '1';
  card.style.padding = '8px';
  card.style.background = 'rgba(255,255,255,0.04)';
  card.style.borderRadius = '8px';
  card.style.border = '1px solid rgba(255,255,255,0.06)';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '8px';
  header.style.marginBottom = '6px';

  header.appendChild(createPortrait(unit.portrait));

  const textWrap = document.createElement('div');
  const titleEl = document.createElement('div');
  titleEl.style.fontWeight = '600';
  titleEl.textContent = title;
  textWrap.appendChild(titleEl);
  if (subtitle) {
    const subEl = document.createElement('div');
    subEl.style.fontSize = '12px';
    subEl.style.opacity = '0.75';
    subEl.textContent = subtitle;
    textWrap.appendChild(subEl);
  }
  header.appendChild(textWrap);

  card.appendChild(header);

  const hpMax = numberOr(unit.hpMax, unit.hp, 0);
  card.appendChild(
    createBar({
      label: 'HP',
      current: numberOr(unit.hp, 0),
      max: hpMax,
      color: 'linear-gradient(90deg, #ff4d6d, #ff936a)',
      shield: numberOr(unit._shield, 0),
    })
  );

  const resources = showResources ? extractResources(unit.resources) : [];
  const mpMax = numberOr(unit.mpMax, unit.mp, 0);
  const hasManaResource = resources.some((res) => res.key === 'mana');
  if (mpMax > 0 && !hasManaResource) {
    card.appendChild(
      createBar({
        label: 'MP',
        current: numberOr(unit.mp, 0),
        max: mpMax,
        color: 'linear-gradient(90deg, #4d7cff, #80b3ff)',
      })
    );
  }

  if (showResources) {
    resources.forEach((res) => {
      card.appendChild(
        createBar({
          label: res.label,
          current: res.current,
          max: res.max,
          color: 'linear-gradient(90deg, #40c4ff, #7ff0ff)',
        })
      );
    });
  }

  return card;
}

function createPortrait(src) {
  const box = document.createElement('div');
  box.style.width = '40px';
  box.style.height = '40px';
  box.style.flex = '0 0 40px';
  box.style.borderRadius = '8px';
  box.style.overflow = 'hidden';
  box.style.border = '1px solid rgba(255,255,255,0.1)';
  box.style.background = 'rgba(255,255,255,0.08)';
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    box.appendChild(img);
  }
  return box;
}

function createBar({ label, current, max, color, shield = 0 }) {
  const wrap = document.createElement('div');
  wrap.style.margin = '4px 0';

  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  head.style.fontSize = '12px';
  head.style.opacity = '0.85';
  head.innerHTML = `<span>${label}</span><span>${Math.max(0, Math.round(current))} / ${Math.round(max)}</span>`;

  const bar = document.createElement('div');
  bar.style.position = 'relative';
  bar.style.height = '10px';
  bar.style.borderRadius = '6px';
  bar.style.background = 'rgba(255,255,255,0.07)';
  bar.style.border = '1px solid rgba(255,255,255,0.08)';
  bar.style.overflow = 'hidden';

  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const fill = document.createElement('div');
  fill.style.height = '100%';
  fill.style.width = `${pct * 100}%`;
  fill.style.transition = 'width 200ms ease';
  fill.style.background = color || 'linear-gradient(90deg, #ff4d6d, #ff936a)';
  bar.appendChild(fill);

  const shieldValue = Math.max(0, shield);
  if (shieldValue > 0) {
    const total = (max || 0) + shieldValue;
    const shieldPct = total > 0 ? Math.max(0, Math.min(1, (Math.max(current, 0) + shieldValue) / total)) : 0;
    const shieldBar = document.createElement('div');
    shieldBar.style.position = 'absolute';
    shieldBar.style.right = '0';
    shieldBar.style.top = '0';
    shieldBar.style.bottom = '0';
    shieldBar.style.width = `${Math.max(0, (shieldPct - pct) * 100)}%`;
    shieldBar.style.background = 'linear-gradient(90deg, rgba(135,206,250,0.6), rgba(176,224,230,0.6))';
    bar.appendChild(shieldBar);
  }

  wrap.append(head, bar);
  return wrap;
}

function extractResources(resources) {
  if (!resources) return [];
  const entries = [];
  for (const [key, value] of Object.entries(resources)) {
    if (value && typeof value === 'object') {
      const current = numberOr(value.current, 0);
      const max = numberOr(value.max, current);
      entries.push({ key, label: value.label || key, current, max });
    } else {
      const amount = numberOr(value, 0);
      entries.push({ key, label: key, current: amount, max: amount });
    }
  }
  return entries.filter((res) => res.max > 0 || res.current > 0);
}

function numberOr(...values) {
  for (const v of values) {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    const parsed = Number(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function playerTitle(player) {
  return `🧙 ${player?.name || 'Adventurer'}`;
}

function playerSubtitle(player) {
  const classId = player?.classId;
  return classId ? `Class: ${classId}` : '';
}

function enemyTitle(enemy) {
  return `👾 ${enemy?.name || 'Enemy'}`;
}

function enemySubtitle(enemy) {
  const level = enemy?.level;
  return typeof level === 'number' ? `Lv.${level}` : '';
}
