// static/js/systems/resourceManager.js

const RESOURCE_ALIASES = {
  hp: 'hp',
  mp: 'mana',
  mana: 'mana',
  sp: 'stamina',
  stamina: 'stamina',
  energy: 'energy',
  focus: 'focus',
  faith: 'faith',
  chi: 'ki',
  ki: 'ki',
  rage: 'rage',
  fury: 'rage',
};

const RESOURCE_LABEL_OVERRIDES = {
  hp: 'HP',
  mana: 'Mana',
  stamina: 'Stamina',
  energy: 'Energy',
  focus: 'Focus',
  faith: 'Faith',
  ki: 'Ki',
  rage: 'Rage',
};

const RESOURCE_DEFAULT_MAX = {
  mana: (player) => pickNumber(player?.mpMax, player?.mp, 0) ?? 0,
  stamina: 100,
  energy: 100,
  focus: 100,
  faith: 100,
  ki: 100,
  rage: 100,
};

export const RESOURCE_ORDER = ['mana', 'stamina', 'energy', 'focus', 'faith', 'ki', 'rage'];

export function normalizeResourceKey(name) {
  if (name == null) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return RESOURCE_ALIASES[lower] || lower;
}

export function formatResourceLabel(key) {
  const canonical = normalizeResourceKey(key) || key;
  if (!canonical) return '';
  if (RESOURCE_LABEL_OVERRIDES[canonical]) return RESOURCE_LABEL_OVERRIDES[canonical];
  return canonical.charAt(0).toUpperCase() + canonical.slice(1);
}

export function normalizeResourceMap(map, fallbackKey = null) {
  const out = new Map();
  if (map == null) return [];

  const add = (key, amount) => {
    if (!key || amount <= 0) return;
    out.set(key, (out.get(key) || 0) + amount);
  };

  if (typeof map === 'number') {
    const key = normalizeResourceKey(fallbackKey);
    const amount = safeAmount(map);
    if (key && amount > 0) add(key, amount);
  } else if (Array.isArray(map)) {
    for (const entry of map) {
      if (!entry) continue;
      if (Array.isArray(entry)) {
        const [rawKey, value] = entry;
        const key = normalizeResourceKey(rawKey ?? fallbackKey);
        const amount = safeAmount(value);
        if (key && amount > 0) add(key, amount);
      } else if (typeof entry === 'object') {
        const rawKey = entry.key ?? entry.resource ?? fallbackKey;
        const rawAmount = entry.amount ?? entry.value ?? entry.cost ?? entry.qty ?? entry.quantity ?? entry.current;
        const key = normalizeResourceKey(rawKey);
        const amount = safeAmount(rawAmount);
        if (key && amount > 0) add(key, amount);
      }
    }
  } else if (typeof map === 'object') {
    for (const [rawKey, value] of Object.entries(map)) {
      const key = normalizeResourceKey(rawKey);
      const amount = safeAmount(value);
      if (key && amount > 0) add(key, amount);
    }
  }

  return Array.from(out.entries()).map(([key, amount]) => ({ key, amount }));
}

export function initFromClass(classDef, player) {
  if (!player) return;

  const definitions = {};
  if (classDef?.resourceDefinitions && typeof classDef.resourceDefinitions === 'object') {
    for (const [rawKey, def] of Object.entries(classDef.resourceDefinitions)) {
      const key = normalizeResourceKey(rawKey);
      if (!key) continue;
      definitions[key] = { ...def };
    }
  }

  const keys = collectClassResourceKeys(classDef);
  for (const key of Object.keys(definitions)) keys.add(key);

  const mpCandidate = pickNumber(player?.mpMax, player?.mp);
  if (mpCandidate && mpCandidate > 0) keys.add('mana');

  const resources = {};
  for (const key of keys) {
    if (!key) continue;
    const def = definitions[key] || {};
    const max = computeResourceMax(key, def, player);
    const current = computeResourceStart(key, def, max, player);
    const regenPerTurn = safeAmount(def.regenPerTurn);
    const tiesToStat = typeof def.maxFromStat === 'string' ? def.maxFromStat : null;

    resources[key] = {
      label: def.label || formatResourceLabel(key),
      current,
      max,
      regenPerTurn,
      tiesToStat,
    };
  }

  player.resources = resources;
  syncCanonical(player);
}

export function syncCanonical(player) {
  if (!player?.resources) return;
  for (const [key, res] of Object.entries(player.resources)) {
    if (!res || typeof res !== 'object') continue;

    if (res.tiesToStat && typeof res.tiesToStat === 'string') {
      const statValue = pickNumber(player?.[res.tiesToStat]);
      if (statValue != null) {
        res.max = clampValue(statValue, 0);
      }
    }

    res.max = clampValue(res.max, 0);
    res.current = clampValue(res.current, 0, res.max);

    if (key === 'mana') {
      player.mpMax = res.max;
      player.mp = res.current;
    }
  }
}

export function validateResourceCost(player, costMap, fallbackKey = null) {
  const entries = normalizeResourceMap(costMap, fallbackKey);
  const missing = [];
  for (const { key, amount } of entries) {
    const pool = player?.resources?.[key];
    const available = pool ? pickNumber(pool.current, 0) ?? 0 : 0;
    if (!pool || available < amount) {
      missing.push({ key, required: amount, available });
    }
  }
  return { ok: missing.length === 0, missing, entries };
}

export function applyResourceCost(player, costMap, fallbackKey = null) {
  const check = validateResourceCost(player, costMap, fallbackKey);
  if (!check.ok) return { ...check, deltas: [] };
  const deltas = [];
  for (const { key, amount } of check.entries) {
    const delta = adjustResource(player, key, -amount);
    if (delta) deltas.push(delta);
  }
  return { ...check, deltas };
}

export function applyResourceGain(player, map, fallbackKey = null) {
  const entries = normalizeResourceMap(map, fallbackKey);
  const deltas = [];
  for (const { key, amount } of entries) {
    const delta = adjustResource(player, key, amount);
    if (delta) deltas.push(delta);
  }
  return { entries, deltas };
}

export function adjustResource(player, key, delta) {
  const canonical = normalizeResourceKey(key);
  if (!canonical) return null;
  const pool = player?.resources?.[canonical];
  if (!pool) return null;

  const before = pickNumber(pool.current, 0) ?? 0;
  const max = clampValue(pool.max, 0);
  const amount = Number(delta) || 0;
  const after = clampValue(before + amount, 0, max);

  pool.current = after;
  if (canonical === 'mana') {
    player.mp = after;
    player.mpMax = max;
  }

  return { key: canonical, previous: before, current: after, delta: after - before, max };
}

export function canSpend(player, key, amount) {
  const canonical = normalizeResourceKey(key);
  if (!canonical) return false;
  const pool = player?.resources?.[canonical];
  if (!pool) return false;
  const cost = safeAmount(amount);
  return pool.current >= cost;
}

export function spend(player, key, amount) {
  const canonical = normalizeResourceKey(key);
  if (!canonical) return false;
  if (!canSpend(player, canonical, amount)) return false;
  adjustResource(player, canonical, -safeAmount(amount));
  return true;
}

export function regenTurn(player) {
  if (!player?.resources) return;
  for (const [key, res] of Object.entries(player.resources)) {
    if (!res || typeof res !== 'object') continue;
    if (res.regenPerTurn) {
      adjustResource(player, key, res.regenPerTurn);
    }
  }
}

function collectClassResourceKeys(classDef) {
  const keys = new Set();
  if (!classDef) return keys;

  if (Array.isArray(classDef.resources)) {
    for (const raw of classDef.resources) {
      const key = normalizeResourceKey(raw);
      if (key) keys.add(key);
    }
  }

  const skills = collectSkills(classDef);
  for (const skill of skills) {
    if (!skill || typeof skill !== 'object') continue;
    const costEntries = normalizeResourceMap(skill.cost, skill.resource);
    const refundEntries = normalizeResourceMap(skill.refund, skill.resource);
    const restoreEntries = normalizeResourceMap(skill.restore, skill.resource);
    for (const entry of [...costEntries, ...refundEntries, ...restoreEntries]) {
      if (entry.key) keys.add(entry.key);
    }
    if (!skill.cost && typeof skill.resource === 'string') {
      const key = normalizeResourceKey(skill.resource);
      if (key) keys.add(key);
    }
    if (typeof skill.resourceType === 'string') {
      const key = normalizeResourceKey(skill.resourceType);
      if (key) keys.add(key);
    }
  }

  return keys;
}

function collectSkills(classDef) {
  const raw = classDef?.skills;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.slice();
  if (typeof raw === 'object') return Object.values(raw);
  return [];
}

function computeResourceMax(key, def, player) {
  const explicit = pickNumber(def?.max);
  if (explicit != null) return clampValue(explicit, 0);

  if (def?.maxFromStat) {
    const fromStat = pickNumber(player?.[def.maxFromStat]);
    if (fromStat != null) return clampValue(fromStat, 0);
  }

  const fromPlayerKey = pickNumber(player?.[`${key}Max`]);
  if (fromPlayerKey != null) return clampValue(fromPlayerKey, 0);

  if (key === 'mana') {
    const mp = pickNumber(player?.mpMax, player?.mp);
    if (mp != null) return clampValue(mp, 0);
  }

  const fallback = computeDefaultMax(key, player);
  return clampValue(fallback ?? 0, 0);
}

function computeResourceStart(key, def, max, player) {
  const start = def?.start;
  if (typeof start === 'string') {
    if (start.toLowerCase() === 'full') return max;
    const parsed = pickNumber(Number(start));
    if (parsed != null) return clampValue(parsed, 0, max);
  } else if (typeof start === 'number') {
    return clampValue(start, 0, max);
  }

  const explicit = pickNumber(def?.current);
  if (explicit != null) return clampValue(explicit, 0, max);

  if (key === 'mana') {
    const mp = pickNumber(player?.mp);
    if (mp != null) return clampValue(mp, 0, max);
  }

  const fromPlayer = pickNumber(player?.[key]);
  if (fromPlayer != null) return clampValue(fromPlayer, 0, max);

  return max > 0 ? max : 0;
}

function computeDefaultMax(key, player) {
  const def = RESOURCE_DEFAULT_MAX[key];
  if (typeof def === 'function') return def(player, key);
  if (def != null) return def;
  return 0;
}

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function safeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function clampValue(value, min = 0, max = Number.POSITIVE_INFINITY) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (!Number.isFinite(max)) return Math.max(min, n);
  return Math.max(min, Math.min(max, n));
}
