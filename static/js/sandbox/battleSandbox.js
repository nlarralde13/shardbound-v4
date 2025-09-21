// /static/js/sandbox/battleSandbox.js
// - Lists classes from a small manifest: /static/catalog/classes/index.json
// - Loads enemies from /static/catalog/enemies.json (your schema) and ADAPTS them
// - Starts BattleScene with chosen class/enemy + optional K_DEF slider
//
// Requires: BattleScene.js, classLoader.js

import { loadClassCatalog } from '/static/js/data/classLoader.js';
import { adaptClassCatalog, adaptEnemy } from '/static/js/data/adapters.js';
import { BattleScene } from '/static/js/scenes/BattleScene.js';

const ui = {
  classList:  document.getElementById('classList'),
  enemyList:  document.getElementById('enemyList'),
  levelInput: document.getElementById('levelInput'),
  fightBtn:   document.getElementById('fightBtn'),
  mount:      document.getElementById('sceneMount'),
  overlay:    document.getElementById('sceneOverlay'), // may be null (optional)
  kdefSlider: document.getElementById('kdefSlider'),   // may be null (optional)
  kdefVal:    document.getElementById('kdefVal'),      // may be null (optional)
};

let selectedClass = 'warrior';
let selectedEnemyId = null;
let enemies = {};
let classes = [];

/* ---------- helpers ---------- */
function selectBtn(listEl, id) {
  if (!listEl) return;
  [...listEl.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b.dataset.id === id));
}

/* ---------- data loads ---------- */
async function loadClassIndex() {
  const res = await fetch('/static/catalog/classes/index.json');
  if (!res.ok) throw new Error('Missing /static/catalog/classes/index.json');
  const json = await res.json();
  classes = adaptClassCatalog(json.classes || []);
}

// Prefer API (fresh), fallback to static file if unavailable.
const MOB_MANIFEST_URL = '/api/mobs/manifest';
const MOB_MANIFEST_FALLBACK = '/static/catalog/mob_manifest.json';

async function loadEnemies() {
  let manifest;
  try {
    const r = await fetch(MOB_MANIFEST_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('api not ok');
    manifest = await r.json();
  } catch (_) {
    const r = await fetch(MOB_MANIFEST_FALLBACK, { cache: 'no-store' });
    if (!r.ok) throw new Error('no manifest available');
    manifest = await r.json();
  }

  const base = (manifest.basePath || '/static/catalog/mobs/').replace(/\/+$/,'/') ;
  const out = {};
  for (const entry of (manifest.mobs || [])) {
    const url = base + (entry.path || '').replace(/^\/+/, '');
    const res  = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { console.warn('[mobs] missing', url); continue; }
    const def  = await res.json();
    const id   = def.id || entry.id || url.split('/').pop().replace(/\.json$/,'');
    const full = { id, ...entry, ...def };
    const adapted = (typeof adaptEnemy === 'function') ? adaptEnemy(full) : full;
    if (adapted) out[id] = adapted;
  }
  enemies = out;
}


  // Fallback: legacy enemies.json (back-compat)
  const res = await fetch('/static/catalog/enemies.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Missing /static/catalog/enemies.json');
  const json = await res.json();
  const out = {};
  for (const [id, enemyDef] of Object.entries(json.enemies || {})) {
    const adapted = (typeof adaptEnemy === 'function') ? adaptEnemy({ ...enemyDef, id }) : { id, ...enemyDef };
    if (adapted) out[adapted.id] = adapted;
  }
  enemies = out;


/* ---------- renderers ---------- */
function renderClassList() {
  if (!ui.classList) return;
  ui.classList.innerHTML = '';
  classes.forEach(c => {
    const btn = document.createElement('button');
    btn.dataset.id = c.id;
    btn.textContent = c.name || c.id;
    btn.onclick = () => { selectedClass = c.id; selectBtn(ui.classList, c.id); };
    ui.classList.appendChild(btn);
  });
  const def = classes.find(c => c.id === 'warrior')?.id || (classes[0] && classes[0].id) || 'warrior';
  selectedClass = def;
  selectBtn(ui.classList, selectedClass);
}

function renderEnemyList() {
  if (!ui.enemyList) return;
  ui.enemyList.innerHTML = '';
  const list = Object.values(enemies);
  list.forEach(e => {
    const btn = document.createElement('button');
    btn.dataset.id = e.id;
    btn.innerHTML = `${e.name} <small style="opacity:.7">Lv.${e.level}</small>`;
    btn.onclick = () => { selectedEnemyId = e.id; selectBtn(ui.enemyList, e.id); };
    ui.enemyList.appendChild(btn);
  });
  if (list.length) { selectedEnemyId = list[0].id; selectBtn(ui.enemyList, selectedEnemyId); }
}

/* ---------- tiny scene manager ---------- */
class SandboxSceneManager {
  constructor(mountEl, overlayEl) { this.mount = mountEl; this.overlay = overlayEl; this._payload = null; }
  getPayload(){ return this._payload; }
  switchTo() {}
}

/* ---------- optional K_DEF slider ---------- */
let K_DEF = 0;
if (ui.kdefSlider) {
  K_DEF = Number(ui.kdefSlider.value || 0);
  ui.kdefSlider.addEventListener('input', () => {
    K_DEF = Number(ui.kdefSlider.value || 0);
    if (ui.kdefVal) ui.kdefVal.textContent = String(K_DEF);
  });
}

/* ---------- start fight ---------- */
async function startFight() {
  if (!selectedEnemyId) return alert('Pick an enemy');

  const level = Math.max(1, parseInt((ui.levelInput && ui.levelInput.value) || '1', 10));
  const catalog = await loadClassCatalog(selectedClass);
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
    resources: {},
    classDef: catalog.class || null,
  };

  const enemy = JSON.parse(JSON.stringify(enemies[selectedEnemyId]));
  const store = { _state: { player, scene: { name: 'battle', data: {} } }, get(){ return this._state; } };

  if (ui.overlay) ui.overlay.innerHTML = '';
  if (ui.mount)   ui.mount.innerHTML = '';

  const sm = new SandboxSceneManager(ui.mount, ui.overlay);
  sm._payload = { encounter: enemy, K_DEF }; // manager & scene will ignore K_DEF if unused

  const scene = new BattleScene(sm, store);
  await scene.onEnter();
  window.__scene = scene;
}

/* ---------- init ---------- */
async function init() {
  try {
    await loadClassIndex();
    await loadEnemies();
    renderClassList();
    renderEnemyList();
  } catch (err) {
    console.error('[sandbox] init failed:', err);
    if (ui.classList) ui.classList.textContent = 'Failed to load class index.';
    if (ui.enemyList) ui.enemyList.textContent = 'Failed to load enemies.';
  }
  if (ui.fightBtn) ui.fightBtn.addEventListener('click', startFight);
}
init();
