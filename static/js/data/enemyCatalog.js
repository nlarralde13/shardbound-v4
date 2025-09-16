let _enemies = null;

export async function loadEnemies(url = '/static/catalog/enemies.json') {
  if (_enemies) return _enemies;
  const res = await fetch(url);
  _enemies = await res.json();
  return _enemies;
}

// Simple random picker, optionally filtered by classArchetype (e.g., "warrior").
export function pickRandomEnemy(catalog, { classArchetype = null } = {}) {
  const list = Object.entries(catalog.enemies)
    .map(([id, e]) => ({ id, ...e }))
    .filter(e => !classArchetype || e.classArchetype === classArchetype);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}
