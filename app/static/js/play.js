// Bootstraps the Play page:
// - fetches /api/me
// - populates top/bottom chips
// - mounts the BattleViewer in tutorial mode for first-time users
// - simple guards + log helper

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
  if (res.status === 401) {
    // Not logged in
    window.location.assign('/login');
    return null;
  }
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  return res.json();
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
  setStatus('net', 'Online');
  setStatus('user', 'User: (checking…)');

  // Populate a “calculating” FPS until wired
  setStatus('fps', 'FPS: —');
  rafFPS(fps => setStatus('fps', `FPS: ${fps}`));

  // Fetch /api/me
  const me = await apiMe();
  if (!me.has_character) {
    CharacterCreation.open({
        onCreate: () => {
        // Refresh /api/me and continue intro
        window.location.reload();
        }
    });
    return; // stop here; battle viewer mounts after creation
    }


  // Topbar stage & bottom chips
  $('#onboardingStage').textContent =
    me.onboarding_stage ? `Onboarding • ${me.onboarding_stage}` : 'Adventure';
  setStatus('user', `User: ${me.user?.username || 'Unknown'}`);
  setStatus('shard', `Shard: ${me.shard || '—'}`);

  // First-time players: show character creation overlay (next milestone)
  // For now, we’ll mount the tutorial viewer so the center isn’t empty.
  if (!me.has_character) {
    log('[onboarding] No character found. Character creation will appear next. Loading tutorial viewer in the meantime…');
    await startTutorialBattle(me);
  } else {
    // If onboarding not complete, you can choose to show a prompt instead.
    await startTutorialBattle(me);
  }

  // Wire actions last so buttons are live
  wireActions(me);
}

boot().catch(err => {
  console.error('[play] boot failed', err);
  log('[error] Play boot failed. See console.');
});
