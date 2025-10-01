import { loadClassCatalog } from '/static/js/data/classLoader.js';
import { adaptEnemy } from '/static/js/data/adapters.js';
import { BattleScene } from '/static/js/scenes/BattleScene.js';

async function loadEnemies() {
  const res = await fetch('/static/catalog/enemies.json');
  if (!res.ok) throw new Error('Missing /static/catalog/enemies.json');
  const json = await res.json();
  const out = {};
  for (const [id, enemyDef] of Object.entries(json.enemies || {})) {
    const adapted = adaptEnemy({ ...enemyDef, id });
    if (adapted) out[adapted.id] = adapted;
  }
  return out;
}

async function pickFirstEnemy(enemies) {
  const list = Object.values(enemies).sort((a,b) => (a.level||1) - (b.level||1));
  const gob = list.find(e => /goblin/i.test(e.name || e.id));
  return gob || list[0] || null;
}

function buildPlayerFromClass(catalog, overrides = {}) {
  const base = catalog.class?.baseStats || {};
  const starter = catalog.starter || {};
  return {
    name: catalog.class?.name || overrides.classId || 'Adventurer',
    classId: overrides.classId || 'warrior',
    level: overrides.level ?? 1,
    hp: base.hp ?? 30, hpMax: base.hp ?? 30,
    mp: base.mp ?? 0,  mpMax: base.mp ?? 0,
    atk: base.atk ?? 6, mag: base.mag ?? 6, def: base.def ?? 3, spd: base.spd ?? 4,
    gold: starter.gold ?? 0,
    inventory: Array.isArray(starter.inventory) ? starter.inventory.slice() : [],
    resources: {},
    classDef: catalog.class || null,
  };
}

export async function mount(containerEl, { mode = 'tutorial', seed } = {}) {
  if (!containerEl) throw new Error('[battleViewerEmbed] mount: missing containerEl');
  containerEl.innerHTML = '';

  // NEW: inner stage wrapper so we can clip/scale safely via CSS
  const stage = document.createElement('div');
  stage.className = 'viewer-stage';
  containerEl.appendChild(stage);

  // Minimal store
  const store = { _state: { scene: { name: 'battle', data: {} } }, get(){ return this._state; } };

  // Build/fallback player+enemy
  let player = seed?.player;
  if (!player) {
    const classId = seed?.classId || 'warrior';
    const catalog = await loadClassCatalog(classId);
    player = buildPlayerFromClass(catalog, { classId, level: 1 });
  }
  let enemy = seed?.enemy;
  if (!enemy) {
    const enemies = await loadEnemies();
    enemy = await pickFirstEnemy(enemies);
  }
  if (!enemy) throw new Error('[battleViewerEmbed] no enemy available to start');

  class SceneManager {
    constructor(mountEl) { this.mount = mountEl; this._payload = null; }
    getPayload(){ return this._payload; }
    switchTo() {}
  }
  const sm = new SceneManager(stage);
  sm._payload = { encounter: enemy };
  store._state.player = player;

  const scene = new BattleScene(sm, store);
  await scene.onEnter();

  window.__scene = scene;
  return {
    unmount() {
      try { containerEl.innerHTML = ''; } catch {}
    }
  };
}

export function unmount(containerEl) {
  if (containerEl) containerEl.innerHTML = '';
}
