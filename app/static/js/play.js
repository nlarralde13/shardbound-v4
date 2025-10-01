// Bootstraps the Play page:
// - fetches /api/me
// - populates top/bottom chips
// - mounts the BattleViewer in tutorial mode for first-time users
// - simple guards + log helper
// - wires account chip dropdown + logout

import { mount as mountBattleViewer } from '/static/js/viewers/battleViewerEmbed.js';

// Small DOM helpers
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

// Bridge to the shell’s globals from play.html
const PLAY = window.__PLAY_APP__ || {};
const battleRoot = PLAY.battleRoot || $('#battleviewer-root');
const log = (msg) => (PLAY.log ? PLAY.log(msg) : console.log('[play]', msg));
const setStatus = (k,v) => (PLAY.setStatus ? PLAY.setStatus(k,v) : void 0);

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

// --- API ----
async function apiMe() {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (res.status === 401) {
    window.location.assign('/login');
    return null;
  }
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  const data = await res.json();
  if (!data.authenticated) {
    window.location.assign('/login');
    return null;
  }
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch (err) {
    json = null;
  }
  if (!res.ok) {
    const message = json?.error || Object.values(json?.errors || {})[0] || 'Could not create character.';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return json;
}

// Optional: light debounce for FPS display if you wire one later
function rafFPS(update) {
  let last = performance.now(), frames = 0;
  function tick(now) {
    frames++;
    if (now - last >= 1000) {
      update(frames);
      frames = 0; last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// --- User menu / logout wiring (moved from play.html) ---
function wireAccountMenu() {
  const chip = $('#userChip');
  const menu = $('#userMenu');
  const logoutBtn = $('#logoutBtn');

  if (!chip || !menu) return;

  const open = () => { menu.classList.add('open'); chip.setAttribute('aria-expanded', 'true'); };
  const close = () => { menu.classList.remove('open'); chip.setAttribute('aria-expanded', 'false'); };

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.contains('open') ? close() : open();
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !chip.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  logoutBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      const res = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Logout failed: ${res.status}`);
      }
    } catch (err) {
      console.error('[auth] logout failed', err);
    } finally {
      window.location.assign('/login');
    }
  });
}

function updatePortraitPreview(el, className, baseClass) {
  if (!el) return;
  const cls = CLASS_PORTRAITS[className] || CLASS_PORTRAITS.Warrior;
  PORTRAIT_CLASSES.forEach((c) => el.classList.remove(c));
  if (baseClass) {
    el.className = baseClass;
  }
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

  let lastFocused = null;
  let focusables = [];

  const refreshFocusables = () => {
    focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
      .filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
  };

  const setError = (message) => {
    if (errorEl) {
      errorEl.textContent = message || '';
    }
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const open = () => {
    lastFocused = document.activeElement;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    setError('');
    refreshFocusables();
    updatePortraitPreview(portrait, classSelect.value, 'portrait-frame');
    setTimeout(() => nameInput.focus(), 0);
    document.addEventListener('keydown', handleKeydown);
  };

  const close = () => {
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', handleKeydown);
    setError('');
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  };

  classSelect.addEventListener('change', () => {
    updatePortraitPreview(portrait, classSelect.value, 'portrait-frame');
  });

  modal.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.dataset && target.dataset.close === 'cc') {
      close();
    }
  });

  closeBtn?.addEventListener('click', () => close());
  cancelBtn?.addEventListener('click', () => close());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const payload = {
      name: nameInput.value.trim(),
      title: titleInput?.value.trim() || '',
      class: classSelect.value,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';

    try {
      await postCharacter(payload);
      close();
      if (onCreated) {
        await onCreated();
      }
    } catch (err) {
      console.error('[character] creation failed', err);
      setError(err.message || 'Could not create character.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Character';
    }
  });

  return { open, close };
}

// --- UI wiring for the Actions panel (placeholder; introLoop will own later) ---
function wireActions(me) {
  $('#actionPrimary')?.addEventListener('click', async () => {
    log('[tutorial] Starting tutorial encounter…');
    await startTutorialBattle(me);
  });
  $('#actionSecondary')?.addEventListener('click', () => log('[explore] You look around the outskirts of town…'));
  $('#actionBoard')?.addEventListener('click', () => log('[board] The job board creaks with fresh postings…'));
}

function hydrateCharacterCard(character) {
  if (!character) return;
  $('#charName') && ($('#charName').textContent = character.name || 'Unknown Adventurer');
  $('#charTitle') && ($('#charTitle').textContent = character.title || 'Ready for adventure');
  $('#charClass') && ($('#charClass').textContent = character.class);
  const portrait = $('#charPortrait');
  updatePortraitPreview(portrait, character.class, 'char-portrait');
}

// --- Battle bootstrap for first-time users or when the CTA is pressed ---
async function startTutorialBattle(me) {
  try {
    if (currentViewer) { currentViewer.unmount?.(); currentViewer = null; }
    currentViewer = await mountBattleViewer(battleRoot, { mode: 'tutorial' });
    log('[battle] Tutorial battle loaded.');
  } catch (err) {
    console.error(err);
    log('[error] Failed to start battle. See console for details.');
  }
}

async function refreshMeAndHydrate() {
  const data = await apiMe();
  if (!data) return;
  meState = data;

  if (!data.has_character) {
    modalControls?.open();
    return;
  }

  hydrateCharacterCard(data.character);
  setStatus('user', `User: ${data.user?.username || 'Unknown'}`);
  setStatus('net', 'Network: Online');
  setStatus('shard', `Shard: ${data.shard || '—'}`);
  setStatus('coords', 'Coords: —');
  setStatus('biome', 'Biome: —');

  await startTutorialBattle(data);
  wireActions(data);
}

// --- Main bootstrap ---
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
