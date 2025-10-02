// app/static/js/play.js
// Bootstraps the Play page UI and game flow

// ---- Imports ---------------------------------------------------------------
import { mount as mountBattleViewer } from '/static/js/viewers/battleViewerEmbed.js';

// ---- Small DOM helpers -----------------------------------------------------
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};

// ---- Bridge from template --------------------------------------------------
const PLAY = window.__PLAY_APP__ || {};
const battleRoot = PLAY.battleRoot || $('#battleviewer-root');
const log = (msg) => (PLAY.log ? PLAY.log(msg) : console.log('[play]', msg));
const setStatus = (k,v) => (PLAY.setStatus ? PLAY.setStatus(k,v) : void 0);

// ---- Mount target for the board (overlays sit above this) ------------------
const battleCanvas = $('#battleviewer-canvas');

// ---- Network helpers -------------------------------------------------------
async function fetchJSON(path, opts = {}) {
  const res = await fetch(path, { credentials: 'include', ...opts });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    let msg = `HTTP ${res.status}`;
    try { const j = txt ? JSON.parse(txt) : null; msg = j?.error || msg; } catch {}
    const err = new Error(`${opts.method || 'GET'} ${path} failed: ${msg}`);
    err.status = res.status;
    throw err;
  }
  // 204 no content
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// ---- API wrappers ----------------------------------------------------------
async function apiMe() {
  try {
    const data = await fetchJSON('/api/me');
    // expected: { authenticated, user, character|null, flags:{} }
    return data;
  } catch (err) {
    if (err.status === 401) {
      window.location.assign('/login');
      return null;
    }
    throw err;
  }
}

async function postCharacter(body) {
  return fetchJSON('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function postIntroComplete() {
  return fetchJSON('/api/quests/intro/complete', { method: 'POST' });
}

// ---- Center ticker (mid overlay) ------------------------------------------
function pushBattleLog(text, cls = '') {
  const logEl = $('#battleLog');
  if (!logEl) return;
  const line = el('div', `entry ${cls}`.trim(), text);
  logEl.appendChild(line);
  while (logEl.childElementCount > 8) logEl.removeChild(logEl.firstChild);
}

// ---- Bars / Portraits ------------------------------------------------------
function setBar(fillEl, textEl, num, den, label='') {
  let d = den <= 0 ? 1 : den;
  const pct = Math.max(0, Math.min(100, Math.round((num/d)*100)));
  if (fillEl) fillEl.style.width = pct + '%';
  if (textEl) textEl.textContent = `${label} ${num} / ${den}`;
}

const CLASS_PORTRAITS = {
  Warrior: 'portrait-warrior',
  Mage: 'portrait-mage',
  Cleric: 'portrait-cleric',
  Ranger: 'portrait-ranger',
  Rogue: 'portrait-rogue',
  Monk: 'portrait-monk',
};
const PORTRAIT_CLASSES = Object.values(CLASS_PORTRAITS);

function updatePortraitPreview(elm, className, baseClass) {
  if (!elm) return;
  const cls = CLASS_PORTRAITS[className] || CLASS_PORTRAITS.Warrior;
  if (baseClass) elm.className = baseClass;
  PORTRAIT_CLASSES.forEach(c => elm.classList.remove(c));
  elm.classList.add(cls);
}

// ---- Account menu + logout -------------------------------------------------
function wireAccountMenu() {
  const chip = $('#userChip');
  const menu = $('#userMenu');
  const logoutBtn = $('#logoutBtn');

  if (!chip || !menu) return;

  const open = () => { menu.classList.add('open'); chip.setAttribute('aria-expanded','true'); };
  const close = () => { menu.classList.remove('open'); chip.setAttribute('aria-expanded','false'); };

  chip.addEventListener('click', (e)=>{ e.stopPropagation(); menu.classList.contains('open') ? close() : open(); });
  document.addEventListener('click', (e)=>{ if (!menu.contains(e.target) && !chip.contains(e.target)) close(); });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });

  // AJAX logout (ensure server exempts CSRF for /api/logout)
  logoutBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      await fetchJSON('/api/logout', { method:'POST', headers:{'Content-Type':'application/json'} });
    } catch (err) {
      // some backends return 204; ignore errors here
      console.warn('[auth] logout err (ignored)', err);
    } finally {
      window.location.assign('/login');
    }
  });
}

// ---- Character creation modal ---------------------------------------------
function initCharacterModal(onCreated) {
  const modal = $('#charCreateModal');
  const form = $('#charCreateForm');
  const nameInput = $('#ccName');
  const classSelect = $('#ccClass');
  const titleInput = $('#ccTitleInput');
  const submitBtn = $('#ccSubmit');
  const cancelBtn = $('#ccCancel');
  const closeBtn = $('#ccCloseBtn');
  const portrait = $('#ccPortrait');
  const errorEl = $('#ccError');

  if (!modal || !form || !nameInput || !classSelect || !submitBtn || !portrait) {
    return { open() {}, close() {} };
  }

  let lastFocused = null; let focusables = [];
  const refreshFocusables = () => {
    focusables = $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', modal)
      .filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
  };
  const setError = (m='') => { if (errorEl) errorEl.textContent = m; };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab' || !focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length-1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
  };

  const open = () => {
    lastFocused = document.activeElement;
    modal.classList.remove('hidden'); document.body.classList.add('modal-open');
    setError(''); refreshFocusables();
    updatePortraitPreview(portrait, classSelect.value, 'portrait-frame');
    setTimeout(()=>nameInput.focus(), 0);
    document.addEventListener('keydown', handleKeydown);
  };
  const close = () => {
    modal.classList.add('hidden'); document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', handleKeydown); setError('');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  };

  classSelect.addEventListener('change', ()=> updatePortraitPreview(portrait, classSelect.value, 'portrait-frame'));
  modal.addEventListener('click', (e)=>{ if (e.target && e.target.dataset && e.target.dataset.close === 'cc') close(); });
  closeBtn?.addEventListener('click', ()=> close());
  cancelBtn?.addEventListener('click', ()=> close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); setError(''); submitBtn.disabled = true; submitBtn.textContent = 'Creating…';
    const payload = { name: nameInput.value.trim(), title: (titleInput?.value || '').trim(), class: classSelect.value };
    try {
      await postCharacter(payload);
      close();
      if (typeof onCreated === 'function') await onCreated();
    } catch (err) {
      console.error('[character] creation failed', err);
      setError(err.message || 'Could not create character.');
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Create Character';
    }
  });

  return { open, close };
}

// ---- Character card hydrate -----------------------------------------------
function hydrateCharacterCard(character) {
  if (!character) return;
  const { name, title, class: klass } = character;
  const portrait = $('#charPortrait');

  const n = $('#charName');        if (n) n.textContent = name || 'Unknown Adventurer';
  const t = $('#charTitle');       if (t) t.textContent = title || 'Ready for adventure';
  const c = $('#charClass');       if (c) c.textContent = klass || '—';
  updatePortraitPreview(portrait, klass, 'char-portrait');
}

// ---- Battle boot (viewer into inner canvas) --------------------------------
let currentViewer = null;

async function startTutorialBattle(me) {
  try {
    if (currentViewer && typeof currentViewer.unmount === 'function') {
      currentViewer.unmount();
      currentViewer = null;
    }

    const mountNode = battleCanvas || battleRoot;
    currentViewer = await mountBattleViewer(mountNode, { mode: 'tutorial' });

    // Seed HUD with sample values (replace with real stats)
    const mchar = me && me.character ? me.character : null;

    const pn = $('#playerName');   if (pn) pn.textContent = mchar?.name || '—';
    const pc = $('#playerClass');  if (pc) pc.textContent = mchar?.class || '—';

    setBar($('#playerHPFill'),    $('#playerHPText'),    38, 50, 'HP');
    setBar($('#playerMPFill'),    $('#playerMPText'),    12, 20, 'MP');

    const xpPct = 40;
    const xf = $('#playerXPFill'); if (xf) xf.style.width = `${xpPct}%`;
    const xt = $('#playerXPText'); if (xt) xt.textContent = `XP ${xpPct}%`;

    const en = $('#enemyName');    if (en) en.textContent = 'Training Dummy';
    setBar($('#enemyHPFill'),     $('#enemyHPText'),     25, 40, 'HP');
    setBar($('#enemyShieldFill'), $('#enemyShieldText'),  5, 10, 'Shield');

    pushBattleLog('You engage the Training Dummy.', 'heal');
    pushBattleLog('Dummy takes 6 damage.', 'dmg');

    log('[battle] Tutorial battle loaded.');
  } catch (err) {
    console.error(err);
    log('[error] Failed to start battle. See console for details.');
  }
}

// ---- Action bar quick binds (examples) -------------------------------------
$('#actEndTurn')?.addEventListener('click', () => {
  // currentViewer?.dispatch?.('endTurn');
  pushBattleLog('You end your turn.', '');
});
$('#act1')?.addEventListener('click', () => pushBattleLog('You strike for 5 damage.', 'dmg'));

// ---- FPS chip --------------------------------------------------------------
function rafFPS(update) {
  let last = performance.now(), frames = 0;
  function tick(now) {
    frames++;
    if (now - last >= 1000) { update(frames); frames = 0; last = now; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---- Story engine (intro) --------------------------------------------------
let storyState = { data: null, scene: null };

function setStoryBackground(layer, bg) {
  if (!layer) return;
  if (bg && bg.endsWith('.png')) {
    layer.style.backgroundImage = `url(${bg})`;
  } else {
    layer.style.backgroundImage = '';
    if (bg) layer.classList.add(bg);
  }
}

function renderStoryScene(container, scene) {
  container.innerHTML = '';
  const scrim = el('div', 'story-scrim');
  const consoleBox = el('div', 'story-console');
  (scene.text || []).forEach(t => consoleBox.appendChild(el('p', '', t)));
  scrim.appendChild(consoleBox);
  container.appendChild(scrim);

  const actions = el('div', 'story-actions');
  (scene.actions || []).forEach(a => {
    const b = el('button', 'btn' + (a.primary ? ' btn-primary' : ''), a.label || 'Continue');
    b.addEventListener('click', () => handleStoryAction(a));
    actions.appendChild(b);
  });
  container.appendChild(actions);
}

async function handleStoryAction(action) {
  if (action.next) {
    const next = storyState.data.scenes.find(s => s.id === action.next);
    if (!next) return;
    storyState.scene = next;
    const layer = $('#introStoryLayer');
    setStoryBackground(layer, next.bg);
    renderStoryScene(layer, next);
    return;
  }
  if (action.event === 'enter_town') {
    try { await postIntroComplete(); }
    catch (e) { console.warn('complete intro failed', e); }
    unloadIntroStory();
    await loadTownBoard();
  }
}

function unloadIntroStory() {
  const node = $('#introStoryLayer');
  if (node && node.parentNode) node.parentNode.removeChild(node);
}

async function loadIntroStory(className = 'Warrior') {
  const slug = (className || 'Warrior').toLowerCase();
  let data = null;
  try {
    data = await fetchJSON(`/static/data/intros/${slug}.json`);
  } catch (err) {
    console.error('[intro] failed to load intro json', err);
    return;
  }

  storyState.data = data;
  storyState.scene = data.scenes && data.scenes.length ? data.scenes[0] : null;
  if (!storyState.scene) return;

  const shell = $('#battleviewer-root');
  let layer = $('#introStoryLayer');
  if (!layer) {
    layer = el('div', 'story-layer');
    layer.id = 'introStoryLayer';
    shell.appendChild(layer);
  }

  setStoryBackground(layer, storyState.scene.bg);
  renderStoryScene(layer, storyState.scene);
}

// ---- Town Board placeholder ------------------------------------------------
async function loadTownBoard() {
  unloadIntroStory();

  const logBox = $('#battleLog'); if (logBox) logBox.innerHTML = '';

  const mountNode = battleCanvas || battleRoot;
  if (currentViewer && typeof currentViewer.unmount === 'function') { currentViewer.unmount(); currentViewer = null; }

  mountNode.innerHTML = `
    <div style="position:absolute; inset:0; display:grid; place-items:center; background:rgba(10,12,16,.7)">
      <div style="background:#141821; border:1px solid var(--sb-border); border-radius:12px; padding:18px; width:min(720px, 92vw); box-shadow:var(--sb-shadow);">
        <h2 style="margin-top:0">Greymoor Town Board</h2>
        <p>Select a destination:</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-primary" id="tbJobBoard">Job Board</button>
          <button class="btn" id="tbInn">Inn</button>
          <button class="btn" id="tbCrafting">Crafting Hall</button>
          <button class="btn" id="tbMarket">Market</button>
        </div>
      </div>
    </div>
  `;

  $('#tbJobBoard')?.addEventListener('click', async ()=>{
    pushBattleLog('You scan the job board for contracts.', '');
    // TODO: mount actual Job Board UI / fetch quests
  });
  $('#tbInn')?.addEventListener('click', ()=> pushBattleLog('You rest at the inn. (WIP)', 'heal'));
  $('#tbCrafting')?.addEventListener('click', ()=> pushBattleLog('You visit the crafting hall. (WIP)', ''));
  $('#tbMarket')?.addEventListener('click', ()=> pushBattleLog('You browse the market stalls. (WIP)', ''));
}

// ---- Flow control ----------------------------------------------------------
let meState = null;
let modalControls = null;

async function refreshMeAndHydrate() {
  const data = await apiMe();
  if (!data) return;
  meState = data;

  // ✅ Correct existence check: server returns "character" (object or null)
  if (!data.character) {
    modalControls && modalControls.open();
    return;
  }

  // Hydrate character panel
  hydrateCharacterCard(data.character);

  // Status chips
  setStatus('user', `User: ${data.user?.username || 'Unknown'}`);
  setStatus('net', 'Network: Online');
  setStatus('shard', `Shard: ${data.shard || '—'}`);
  setStatus('coords', 'Coords: —');
  setStatus('biome', 'Biome: —');

  // Intro gating
  const completedIntro = !!(data.flags && data.flags.completed_intro);
  if (!completedIntro) {
    unloadIntroStory();
    await loadIntroStory(data.character.class);
    return;
  }

  // After intro: either go to town board, or load battle
  // await loadTownBoard();
  await startTutorialBattle(data);
}

function bootStatus() {
  setStatus('net', 'Network: Connecting…');
  setStatus('user', 'User: (checking…)');
  setStatus('shard', 'Shard: —');
  setStatus('coords', 'Coords: —');
  setStatus('biome', 'Biome: —');
  setStatus('fps', 'FPS: —');
  rafFPS(fps => setStatus('fps', `FPS: ${fps}`));
}

async function boot() {
  wireAccountMenu();
  modalControls = initCharacterModal(refreshMeAndHydrate);
  bootStatus();
  await refreshMeAndHydrate();
}

boot().catch(err => {
  console.error('[play] boot failed', err);
  log('[error] Play boot failed. See console.');
});
