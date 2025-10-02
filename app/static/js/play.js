// Bootstraps the Play page
import { mount as mountBattleViewer } from '/static/js/viewers/battleViewerEmbed.js';

// DOM helpers
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

// Bridge from template
const PLAY = window.__PLAY_APP__ || {};
const battleRoot = PLAY.battleRoot || $('#battleviewer-root');
const log = (msg) => (PLAY.log ? PLAY.log(msg) : console.log('[play]', msg));
const setStatus = (k,v) => (PLAY.setStatus ? PLAY.setStatus(k,v) : void 0);

// Mount target for the board (overlays sit above this)
const battleCanvas = $('#battleviewer-canvas');

// Center ticker
function pushBattleLog(text, cls = '') {
  const logEl = $('#battleLog');
  if (!logEl) return;
  const line = document.createElement('div');
  line.className = `entry ${cls}`.trim();
  line.textContent = text;
  logEl.appendChild(line);
  while (logEl.childElementCount > 8) logEl.removeChild(logEl.firstChild);
}

// Bar utility
function setBar(fillEl, textEl, num, den, label='') {
  if (den <= 0) den = 1;
  const pct = Math.max(0, Math.min(100, Math.round((num/den)*100)));
  if (fillEl) fillEl.style.width = pct + '%';
  if (textEl) textEl.textContent = `${label} ${num} / ${den}`;
}

// Portrait classes
const CLASS_PORTRAITS = {
  Warrior: 'portrait-warrior',
  Mage: 'portrait-mage',
  Cleric: 'portrait-cleric',
  Ranger: 'portrait-ranger',
  Rogue: 'portrait-rogue',
  Monk: 'portrait-monk',
};
const PORTRAIT_CLASSES = Object.values(CLASS_PORTRAITS);

let currentViewer = null;
let meState = null;
let modalControls = null;

/* ---------- API ---------- */
async function apiMe() {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (res.status === 401) { window.location.assign('/login'); return null; }
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  const data = await res.json();
  if (!data.authenticated) { window.location.assign('/login'); return null; }
  return data;
}

async function postCharacter(body) {
  const res = await fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const message = json?.error || Object.values(json?.errors || {})[0] || 'Could not create character.';
    const error = new Error(message); error.status = res.status; throw error;
  }
  return json;
}

/* ---------- Misc ---------- */
function rafFPS(update) {
  let last = performance.now(), frames = 0;
  function tick(now) {
    frames++;
    if (now - last >= 1000) { update(frames); frames = 0; last = now; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function wireAccountMenu() {
  const chip = $('#userChip'), menu = $('#userMenu'), logoutBtn = $('#logoutBtn');
  if (!chip || !menu) return;
  const open = () => { menu.classList.add('open'); chip.setAttribute('aria-expanded','true'); };
  const close = () => { menu.classList.remove('open'); chip.setAttribute('aria-expanded','false'); };
  chip.addEventListener('click', (e)=>{ e.stopPropagation(); menu.classList.contains('open')?close():open(); });
  document.addEventListener('click', (e)=>{ if (!menu.contains(e.target) && !chip.contains(e.target)) close(); });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });
  logoutBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      const res = await fetch('/api/logout', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'} });
      if (!res.ok && res.status !== 204) throw new Error(`Logout failed: ${res.status}`);
    } catch (err) { console.error('[auth] logout failed', err); }
    finally { window.location.assign('/login'); }
  });
}

function updatePortraitPreview(el, className, base) {
  if (!el) return;
  const cls = CLASS_PORTRAITS[className] || CLASS_PORTRAITS.Warrior;
  PORTRAIT_CLASSES.forEach(c => el.classList.remove(c));
  if (base) el.className = base;
  el.classList.add(cls);
}

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
    if (lastFocused?.focus) lastFocused.focus();
  };

  classSelect.addEventListener('change', ()=> updatePortraitPreview(portrait, classSelect.value, 'portrait-frame'));
  modal.addEventListener('click', (e)=>{ if (e.target?.dataset?.close === 'cc') close(); });
  closeBtn?.addEventListener('click', ()=> close());
  cancelBtn?.addEventListener('click', ()=> close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); setError(''); submitBtn.disabled = true; submitBtn.textContent = 'Creating…';
    const payload = { name: nameInput.value.trim(), title: titleInput?.value.trim() || '', class: classSelect.value };
    try { await postCharacter(payload); close(); if (onCreated) await onCreated(); }
    catch (err) { console.error('[character] creation failed', err); setError(err.message || 'Could not create character.'); }
    finally { submitBtn.disabled = false; submitBtn.textContent = 'Create Character'; }
  });

  return { open, close };
}

/* ---------- Character panel ---------- */
function hydrateCharacterCard(character) {
  if (!character) return;
  $('#charName')?.textContent = character.name || 'Unknown Adventurer';
  $('#charTitle')?.textContent = character.title || 'Ready for adventure';
  $('#charClass')?.textContent = character.class || '—';
  updatePortraitPreview($('#charPortrait'), character.class, 'char-portrait');
}

/* ---------- Battle boot ---------- */
async function startTutorialBattle(me) {
  try {
    if (currentViewer) { currentViewer.unmount?.(); currentViewer = null; }

    const mountNode = battleCanvas || battleRoot;
    currentViewer = await mountBattleViewer(mountNode, { mode: 'tutorial' });

    // Player identity/bars
    $('#playerName') && ($('#playerName').textContent = me?.character?.name || '—');
    $('#playerClass') && ($('#playerClass').textContent = me?.character?.class || '—');
    setBar($('#playerHPFill'), $('#playerHPText'), 38, 50, 'HP');
    setBar($('#playerMPFill'), $('#playerMPText'), 12, 20, 'MP');
    const xpPct = 40; $('#playerXPFill') && ($('#playerXPFill').style.width = `${xpPct}%`);
    $('#playerXPText') && ($('#playerXPText').textContent = `XP ${xpPct}%`);

    // Enemy sample
    $('#enemyName') && ($('#enemyName').textContent = 'Training Dummy');
    setBar($('#enemyHPFill'), $('#enemyHPText'), 25, 40, 'HP');
    setBar($('#enemyShieldFill'), $('#enemyShieldText'), 5, 10, 'Shield');

    // Ticker
    pushBattleLog('You engage the Training Dummy.', 'heal');
    pushBattleLog('Dummy takes 6 damage.', 'dmg');

    log('[battle] Tutorial battle loaded.');
  } catch (err) {
    console.error(err);
    log('[error] Failed to start battle. See console for details.');
  }
}

/* ---------- Actions (examples) ---------- */
$('#actEndTurn')?.addEventListener('click', () => {
  // currentViewer?.dispatch?.('endTurn');
  pushBattleLog('You end your turn.', '');
});
$('#act1')?.addEventListener('click', () => pushBattleLog('You strike for 5 damage.', 'dmg'));

/* ---------- Flow ---------- */
async function refreshMeAndHydrate() {
  const data = await apiMe();
  if (!data) return;
  meState = data;

  if (!data.has_character) { modalControls?.open(); return; }

  hydrateCharacterCard(data.character);
  setStatus('user', `User: ${data.user?.username || 'Unknown'}`);
  setStatus('net', 'Network: Online');
  setStatus('shard', `Shard: ${data.shard || '—'}`);
  setStatus('coords', 'Coords: —');
  setStatus('biome', 'Biome: —');

  await startTutorialBattle(data);
}

async function boot() {
  wireAccountMenu();
  modalControls = initCharacterModal(refreshMeAndHydrate);

  setStatus('net', 'Network: Connecting…');
  setStatus('user', 'User: (checking…)');
  setStatus('shard', 'Shard: —');
  setStatus('coords', 'Coords: —');
  setStatus('biome', 'Biome: —');
  setStatus('fps', 'FPS: —');
  rafFPS(fps => setStatus('fps', `FPS: ${fps}`));

  await refreshMeAndHydrate();
}

boot().catch(err => {
  console.error('[play] boot failed', err);
  log('[error] Play boot failed. See console.');
});
