// battleSandbox.js — class/enemy pickers + Fight
import { loadClassCatalog } from '/static/js/data/classLoader.js'; // fetches /static/catalog/classes/<id>.json :contentReference[oaicite:0]{index=0}
import { BattleScene } from '/static/js/scenes/BattleScene.js';

const ui = {
  classList:  document.getElementById('classList'),
  enemyList:  document.getElementById('enemyList'),
  levelInput: document.getElementById('levelInput'),
  fightBtn:   document.getElementById('fightBtn'),
  mount:      document.getElementById('sceneMount'),
  overlay:    document.getElementById('sceneOverlay'),
  kdefSlider: document.getElementById('kdefSlider'),
  kdefVal:    document.getElementById('kdefVal'),
};

let selectedClass = 'warrior';
let selectedEnemyId = null;
let enemies = {};
let classes = [];

function selectBtn(listEl, id) {
  [...listEl.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.id === id));
}

async function loadClassIndex() {
  const res = await fetch('/static/catalog/classes/index.json');
  if (!res.ok) throw new Error('Missing /static/catalog/classes/index.json');
  const json = await res.json();
  classes = json.classes || [];
}

async function loadEnemies() {
  const res = await fetch('/static/catalog/enemies.json');
  if (!res.ok) throw new Error('Missing /static/catalog/enemies.json');
  const json = await res.json();

  // Adapt your enemy schema => flat encounter payload BattleScene uses today
  // (Your file has enemies.{id}.baseStats + levelRange, aiHints, skills.) :contentReference[oaicite:1]{index=1}
  const out = {};
  for (const [id, e] of Object.entries(json.enemies || {})) {
    const bs = e.baseStats || {};
    const def = Number(bs.def ?? 0) + Number(bs.armor ?? 0);
    const lr = Array.isArray(e.levelRange) ? e.levelRange : [1, 1];
    out[id] = {
      id,
      name: e.name || id,
      level: Number(lr[0] ?? 1),
      hp: Number(bs.hp ?? 20),
      atk: Number(bs.atk ?? 5),
      mag: Number(bs.mag ?? 0),
      def,
      spd: Number(bs.spd ?? 3),
      _raw: e
    };
  }
  enemies = out;
}

function renderClassList() {
  ui.classList.innerHTML = '';
  classes.forEach(c => {
    const btn = document.createElement('button');
    btn.dataset.id = c.id;
    btn.textContent = c.name || c.id;
    btn.onclick = () => { selectedClass = c.id; selectBtn(ui.classList, c.id); };
    ui.classList.appendChild(btn);
  });
  // default select first or warrior
  const def = classes.find(c => c.id === 'warrior')?.id || (classes[0] && classes[0].id);
  selectedClass = def || 'warrior';
  selectBtn(ui.classList, selectedClass);
}

function renderEnemyList() {
  ui.enemyList.innerHTML = '';
  const list = Object.values(enemies);
  list.forEach(e => {
    const btn = document.createElement('button');
    btn.dataset.id = e.id;
    btn.innerHTML = `${e.name} <small style="opacity:.7">Lv.${e.level}</small>`;
    btn.onclick = () => { selectedEnemyId = e.id; selectBtn(ui.enemyList, e.id); };
    ui.enemyList.appendChild(btn);
  });
  // default to first enemy
  if (list.length) {
    selectedEnemyId = list[0].id;
    selectBtn(ui.enemyList, selectedEnemyId);
  }
}

// tiny fake scene manager to host the battle scene
class SandboxSceneManager {
  constructor(mountEl, overlayEl) {
    this.mount = mountEl;
    this.overlay = overlayEl;
    this._payload = null;
  }
  getPayload() { return this._payload; }
  switchTo() {}
}

let K_DEF = Number(ui.kdefSlider.value);
ui.kdefSlider.addEventListener('input', () => {
  K_DEF = Number(ui.kdefSlider.value);
  ui.kdefVal.textContent = String(K_DEF);
});

async function startFight() {
  if (!selectedEnemyId) return alert('Pick an enemy');

  const level = Math.max(1, parseInt(ui.levelInput.value || '1', 10));
  const catalog = await loadClassCatalog(selectedClass); // → full class JSON (baseStats, skills, starter) :contentReference[oaicite:2]{index=2}
  const base = catalog.class?.baseStats || {};
  const starter = catalog.starter || {};

  const player = {
    name: catalog.class?.name || selectedClass,
    classId: selectedClass,
    level,
    hp: base.hp ?? 30, hpMax: base.hp ?? 30,
    mp: base.mp ?? 0,  mpMax: base.mp ?? 0,
    atk: base.atk ?? 6, mag: base.mag ?? 6, def: base.def ?? 3, spd: base.spd ?? 4,
    gold: starter.gold ?? 0,
    inventory: Array.isArray(starter.inventory) ? starter.inventory.slice() : [],
    resources: {}
  };

  const enemy = JSON.parse(JSON.stringify(enemies[selectedEnemyId]));

  // store + scene manager facades
  const store = { _state: { player, scene: { name: 'battle', data: {} } }, get() { return this._state; } };
  ui.overlay.innerHTML = '';
  ui.mount.innerHTML = '';
  const sm = new SandboxSceneManager(ui.mount, ui.overlay);
  sm._payload = { encounter: enemy, K_DEF }; // if you later teach BattleScene to read K_DEF

  const scene = new BattleScene(sm, store);
  await scene.onEnter();
  window.__scene = scene; // for console poking
}

async function init() {
  try {
    await loadClassIndex();
    await loadEnemies();
    renderClassList();
    renderEnemyList();
  } catch (err) {
    console.error('[sandbox] init failed:', err);
    ui.classList.innerHTML = 'Failed to load class index.';
    ui.enemyList.innerHTML = 'Failed to load enemies.';
  }
  ui.fightBtn.addEventListener('click', startFight);
}

init();
