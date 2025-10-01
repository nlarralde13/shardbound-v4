// Bootstraps the Play page:
// - fetches /api/me
// - populates top/bottom chips
// - mounts the BattleViewer in tutorial mode for first-time users
// - simple guards + log helper
// - wires account chip dropdown + logout

import { mount as mountBattleViewer, unmount as unmountBattleViewer } from '/static/js/viewers/battleViewerEmbed.js';
import { CharacterCreation } from '/static/js/ui/characterCreation.js';

// Small DOM helpers
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

// Bridge to the shell’s globals from play.html
const PLAY = window.__PLAY_APP__ || {};
const battleRoot = PLAY.battleRoot || $('#battleviewer-root');
const log = (msg) => (PLAY.log ? PLAY.log(msg) : console.log('[play]', msg));
const setStatus = (k,v) => (PLAY.setStatus ? PLAY.setStatus(k,v) : void 0);

// --- API ----
async function apiMe() {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  const data = await res.json();
  if (!data.authenticated) {
    window.location.assign('/login');
    return null;
  }
  return data;
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

// --- UI wiring for the Actions panel (placeholder; introLoop will own later) ---
function wireActions(me) {
  $('#actionPrimary')?.addEventListener('click', async () => {
    log('[tutorial] Starting tutorial encounter…');
    await startTutorialBattle(me);
  });
  $('#actionSecondary')?.addEventListener('click', () => log('[explore] You look around the outskirts of town…'));
  $('#actionBoard')?.addEventListener('click', () => log('[board] The job board creaks with fresh postings…'));
}

// --- Battle bootstrap for first-time users or when the CTA is pressed ---
let currentViewer = null;

async function startTutorialBattle(me) {
  try {
    if (currentViewer) { currentViewer.unmount?.(); currentViewer = null; }
    // You can pass seed.player when you have a real player entity from DB.
    currentViewer = await mountBattleViewer(battleRoot, { mode: 'tutorial' });
    log('[battle] Tutorial battle loaded.');
  } catch (err) {
    console.error(err);
    log('[error] Failed to start battle. See console for details.');
  }
}

// --- Main bootstrap ---
async function boot() {
  wireAccountMenu(); // <— moved from inline

  setStatus('net', 'Online');
  setStatus('user', 'User: (checking…)');

  // Populate a “calculating” FPS until wired
  setStatus('fps', 'FPS: —');
  rafFPS(fps => setStatus('fps', `FPS: ${fps}`));

  // Fetch /api/me
  const me = await apiMe();
  if (!me) return;

  const player = me.player || { has_character: false };
  if (!player.has_character) {
    CharacterCreation.open({
      onCreate: () => window.location.reload()
    });
    return;
  }

  // Topbar stage & bottom chips
  $('#onboardingStage') && ($('#onboardingStage').textContent =
    player.onboarding_stage ? `Onboarding • ${player.onboarding_stage}` : 'Adventure');
  setStatus('user', `User: ${me.user?.username || 'Unknown'}`);
  setStatus('shard', `Shard: ${me.shard || '—'}`);

  // Mount a first encounter
  await startTutorialBattle(me);

  // Wire actions last so buttons are live
  wireActions(me);
}

boot().catch(err => {
  console.error('[play] boot failed', err);
  log('[error] Play boot failed. See console.');
});
