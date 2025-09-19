// /static/js/scenes/BattleScene.js
// -----------------------------------------------------------------------------
// Battle Scene (vNext - wired to CombatManager)
// - Uses /static/js/systems/combatManager.js for ALL hit + damage math
// - Adapts class catalogs & enemies.json into CombatManager via a small mapper
// - Keeps your existing UI shell, removes noisy math dumps
// -----------------------------------------------------------------------------

import { loadClassCatalog, skillsAvailableAtLevel } from '/static/js/data/classLoader.js';
import { initFromClass, syncCanonical } from '../systems/resourceManager.js';
import { resolveAttack, fromCatalog as normalizeFromCatalog } from '/static/js/systems/combatManager.js';
import { GameLogger } from '/static/js/sys/gameLogger.js';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const PII_KEYS = new Set(['email', 'e-mail', 'ip', 'ip_address', 'ipaddress']);

export class BattleScene {
  constructor(sm, store) {
    this.sm = sm;
    this.store = store;

    // UI refs
    this.uiRoot = null;
    this.hudEl = null;
    this.actionBarEl = null;
    this.logEl = null;

    // State
    this.player = null;
    this.enemy = null;
    this.actionBar = [];
    this.turnLock = false;
    this._turn = 0;     // enemy turn counter

    // Tuning
    this.DEBUG = false; // silence math spam in UI
  }

  // ===========================================================================
  // Scene Lifecycle
  // ===========================================================================
  async onEnter() {
    const state = this.store.get();
    GameLogger.init({ sessionId: state?.session?.id ?? state?.sessionId ?? null });

    this.player = state.player;
    if (this.player?.id || this.player?.name) {
      GameLogger.setPlayer(this.player.id ?? this.player.name);
    }

    GameLogger.info('SCENE_ENTER', { scene: 'BattleScene' });
    if (this.player) {
      GameLogger.info('PLAYER_LOADED', { player: scrubPlayer(this.player) });
    }

    // hydrate resources from class
    initFromClass(this.player.classDef, this.player);
    syncCanonical(this.player);

    const payload = this.sm.getPayload?.() || {};
    this._applyBackground(payload.background || localStorage.getItem('battle_bg') || '');

    this.enemy = payload.encounter || {
      id: 'slime', name: 'Gloomslick Slime', level: 1,
      hp: 24, atk: 5, mag: 0, def: 2, spd: 3
    };

    // Ensure fixed max bars once per encounter
    if (typeof this.enemy.hpMax !== 'number') this.enemy.hpMax = this.enemy.hp ?? 0;
    if (typeof this.enemy.mpMax !== 'number') this.enemy.mpMax = this.enemy.mp ?? 0;
    if (typeof this.player.hpMax !== 'number') this.player.hpMax = this.player.hp ?? 0;
    if (typeof this.player.mpMax !== 'number') this.player.mpMax = this.player.mp ?? 0;

    GameLogger.info('ENEMY_SPAWNED', { enemy: scrubEnemy(this.enemy) });

    // Portraits
    const classId = (this.player.classId || 'warrior').toLowerCase();
    this.player.portrait = `/static/assets/art/classArt/${classId}.png`;
    if (!this.enemy.portrait && this.enemy._raw?.art?.portrait) {
      this.enemy.portrait = this.enemy._raw.art.portrait;
    }

    // UI
    this._mountUI();
    this._renderHeader();
    this._log(`⚔️ A wild ${this.enemy.name} (Lv.${this.enemy.level}) appears!`);

    // Build player action kit
    const level = Math.max(1, this.player.level || 1);
    try {
      const catalog = await loadClassCatalog(classId);
      const kit = skillsAvailableAtLevel(catalog, level);
      const basics = [
        { id:'basic_attack', name:'Attack', type:'attack', target:'enemy', effects:[{ kind:'damage', formula:'atk*0.8' }] }
      ];
      this.actionBar = [...basics, ...kit];
      this._renderActionBar();
      this._log(`Class loaded: ${(catalog.class?.name || classId)} (Lv.${level}). Actions ready.`);
    } catch (e) {
      console.error('[BattleScene] class load failed:', e);
      this._log('No class catalog found. Using basic actions.');
      this.actionBar = [
        { id:'basic_attack', name:'Attack', type:'attack', target:'enemy', effects:[{ kind:'damage', formula:'atk*0.8' }] }
      ];
      this._renderActionBar();
    }
  }

  onExit() {
    this._unmountUI();
    this.player = null;
    this.enemy = null;
    this.actionBar = [];
    this.turnLock = false;
    this._turn = 0;
  }

  // ===========================================================================
  // UI
  // ===========================================================================
  // Mount the HUD *inside* the viewer so it overlays the scene.
_mountUI() {
  // Prefer the viewer root; fall back to SM overlay; then body.
  const host =
    document.getElementById('sceneMount') ||
    (this.sm && this.sm.overlay) ||
    document.body;

  // Ensure the viewer is a positioned container
  if (host && getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  const root = document.createElement('div');
  root.id = 'battle-ui';
  root.style.position = 'absolute';
  root.style.left = '16px';
  root.style.right = '16px';
  root.style.bottom = '16px';
  root.style.zIndex = '20';
  root.style.padding = '12px';
  root.style.background = 'rgba(12,16,24,0.72)'; // translucent overlay
  root.style.border = '1px solid rgba(255,255,255,0.08)';
  root.style.borderRadius = '12px';
  root.style.backdropFilter = 'blur(6px)';       // frosted glass
  root.style.color = '#dbe3f0';
  root.style.font = '14px/1.4 system-ui, sans-serif';

  const hud = document.createElement('div');
  hud.id = 'battle-hud';
  hud.style.display = 'flex';
  hud.style.justifyContent = 'space-between';
  hud.style.gap = '12px';
  hud.style.marginBottom = '8px';

  const bar = document.createElement('div');
  bar.id = 'battle-actions';
  bar.style.display = 'flex';
  bar.style.flexWrap = 'wrap';
  bar.style.gap = '8px';
  bar.style.marginTop = '8px';
  bar.style.marginBottom = '8px';

  const log = document.createElement('div');
  log.id = 'battle-log';
  log.style.maxHeight = '200px';
  log.style.overflow = 'auto';
  log.style.padding = '8px';
  log.style.background = 'rgba(0,0,0,0.25)';     // slightly more transparent console
  log.style.borderRadius = '8px';
  log.style.border = '1px solid rgba(255,255,255,0.06)';

  root.append(hud, bar, log);
  host.appendChild(root);

  this.uiRoot = root;
  this.hudEl = hud;
  this.actionBarEl = bar;
  this.logEl = log;
}


  _unmountUI() {
    if (this.uiRoot && this.uiRoot.parentNode) this.uiRoot.parentNode.removeChild(this.uiRoot);
    this.uiRoot = this.hudEl = this.actionBarEl = this.logEl = null;
  }

  _mkPortrait(src) {
    const box = document.createElement('div');
    box.style.width = '40px';
    box.style.height = '40px';
    box.style.flex = '0 0 40px';
    box.style.borderRadius = '8px';
    box.style.overflow = 'hidden';
    box.style.border = '1px solid rgba(255,255,255,0.10)';
    box.style.background = 'rgba(255,255,255,0.06)';
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      box.appendChild(img);
    }
    return box;
  }

  _mkBar(label, curr, max, opts = {}) {
    const pct = Math.max(0, Math.min(1, max > 0 ? (curr / max) : 0));
    const wrap = document.createElement('div');
    wrap.style.margin = '4px 0';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.fontSize = '12px';
    head.style.opacity = '0.85';
    head.innerHTML = `<span>${label}</span><span>${Math.max(0,Math.round(curr))} / ${Math.round(max || 0)}</span>`;

    const bar = document.createElement('div');
    bar.style.position = 'relative';
    bar.style.height = '10px';
    bar.style.borderRadius = '6px';
    bar.style.background = 'rgba(255,255,255,0.07)';
    bar.style.overflow = 'hidden';
    bar.style.border = '1px solid rgba(255,255,255,0.08)';

    const fill = document.createElement('div');
    fill.style.height = '100%';
    fill.style.width = `${pct * 100}%`;
    fill.style.transition = 'width 200ms ease';
    fill.style.background = opts.color || 'linear-gradient(90deg, #ff4d6d, #ff936a)';
    bar.appendChild(fill);

    if (opts.shield && opts.shield > 0) {
      const total = (max || 0) + opts.shield;
      const shieldPct = Math.max(0, Math.min(1, total > 0 ? (Math.max(curr,0) + opts.shield) / total : 0));
      const shieldBar = document.createElement('div');
      shieldBar.style.position = 'absolute';
      shieldBar.style.right = '0';
      shieldBar.style.top = '0';
      shieldBar.style.bottom = '0';
      shieldBar.style.width = `${Math.max(0, (shieldPct - pct) * 100)}%`;
      shieldBar.style.background = 'linear-gradient(90deg, rgba(135,206,250,0.6), rgba(176,224,230,0.6))';
      bar.appendChild(shieldBar);
    }

    wrap.append(head, bar);
    return wrap;
  }

  _mkUnitCard(title, unit, extra = '') {
    const card = document.createElement('div');
    card.style.flex = '1';
    card.style.padding = '8px';
    card.style.background = 'rgba(255,255,255,0.04)';
    card.style.borderRadius = '8px';
    card.style.border = '1px solid rgba(255,255,255,0.06)';

    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.alignItems = 'center';
    headerRow.style.gap = '8px';
    headerRow.style.marginBottom = '6px';
    const head = document.createElement('div');
    head.style.fontWeight = '600';
    head.textContent = `${title}${extra ? ` — ${extra}` : ''}`;
    headerRow.append(this._mkPortrait(unit.portrait), head);
    card.appendChild(headerRow);

    card.appendChild(this._mkBar('HP', unit.hp ?? 0, unit.hpMax ?? (unit.hp ?? 0), { shield: unit._shield || 0 }));
    const mpMax = unit.mpMax ?? 0;
    if (mpMax > 0) {
      card.appendChild(this._mkBar('MP', unit.mp ?? 0, mpMax, { color: 'linear-gradient(90deg, #4d7cff, #80b3ff)' }));
    }
    return card;
  }

  _renderHeader() {
    const hud = this.hudEl;
    hud.innerHTML = '';

    const p = this.player, e = this.enemy;
    const pTitle = `🧙 ${p.name || (p.classId ? p.classId[0].toUpperCase()+p.classId.slice(1) : 'Adventurer')}`;
    const eTitle = `👾 ${e.name}`;
    const pExtra = `Class: ${p.classId ?? 'warrior'}`;
    const eExtra = `Lv.${e.level}`;

    hud.append(
      this._mkUnitCard(pTitle, p, pExtra),
      this._mkUnitCard(eTitle,  e, eExtra)
    );
  }

  _renderActionBar() {
    this.actionBarEl.innerHTML = '';
    for (const sk of this.actionBar) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = sk.name;
      btn.style.minWidth = '96px';
      btn.onclick = () => this.useSkill(sk);
      this.actionBarEl.appendChild(btn);
    }
  }

  _log(t) {
    if (!this.logEl) return console.log('[battle]', t);
    const d = document.createElement('div');
    d.textContent = t;
    this.logEl.appendChild(d);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  // ===========================================================================
  // Player turn
  // ===========================================================================
  async useSkill(skill) {
    if (this.turnLock) return;
    this.turnLock = true;

    const p = this.player, e = this.enemy;

    // Pay non-MP costs (handled here; CombatManager only reads MP)
    if (skill.cost) {
      if (!p.resources) p.resources = {};
      for (const [res, amt] of Object.entries(skill.cost)) {
        const have = p.resources[res] ?? 0;
        if (have < amt) { this._log(`Not enough ${res} to use ${skill.name}.`); this.turnLock = false; return; }
      }
      for (const [res, amt] of Object.entries(skill.cost)) {
        p.resources[res] = (p.resources[res] ?? 0) - amt;
      }
    }

    const abilityInfo = pickSkillFields(skill) || undefined;
    const attackerBefore = snapshotUnit(p);
    const defenderBefore = snapshotUnit(e);
    const actionPayload = dropUndefined({
      skill: abilityInfo,
      actor: summarizeUnit(p),
      target: summarizeUnit(e),
      resources: skill.cost ? scrubForLog(skill.cost) : undefined,
    });
    GameLogger.info('ACTION_USED', actionPayload);

    this._log(`${p.name} uses ${skill.name}!`);

    // Build a CombatManager ability from this skill
    const ability = this._abilityFromSkill(p, skill);

    // Resolve attack (hit + damage); healing/shields handled inline without manager
    if (ability) {
      const result = resolveAttack({
        attacker: p,
        defender: e,
        ability,
        options: { normalizeActor: normalizeFromCatalog, devDiagnostics: this.DEBUG }
      });
      if (result.ok && result.hit) {
        e.hp = Math.max(0, (e.hp ?? 0) - result.totals.damage);
        this._log(`${e.name} takes ${result.totals.damage} damage.`);
      } else if (result.ok && !result.hit) {
        this._log(`${p.name}'s attack misses!`);
      } else if (!result.ok) {
        this._log(`Cannot use ${skill.name}: ${result.reason}`);
      }

      const attackerAfter = snapshotUnit(p);
      const defenderAfter = snapshotUnit(e);
      GameLogger.info('COMBAT_RESOLVE', dropUndefined({
        ability: abilityInfo,
        attacker: summarizeUnitDelta(attackerBefore, attackerAfter),
        defender: summarizeUnitDelta(defenderBefore, defenderAfter),
        result: scrubForLog(result),
      }));
    } else {
      // Non-damaging effect resolution (heal/shield/buff)
      await this._applyNonDamageEffect(p, e, skill);
    }

    if (e.hp <= 0) {
      GameLogger.info('ENCOUNTER_END', dropUndefined({
        outcome: 'victory',
        turns: this._turn,
        player: scrubPlayer(this.player),
        enemy: scrubEnemy(this.enemy),
      }));
      this._renderHeader();
      this._log(`🏆 ${e.name} is defeated!`);
      this.turnLock = false;
      return;
    }

    this._renderHeader();
    await this._sleep(400);
    await this._enemyTurn();
    this._renderHeader();
    this.turnLock = false;
  }

  // Convert our skill JSON into a CombatManager ability (or null if non-damaging)
  _abilityFromSkill(attacker, skill) {
    const effects = skill.effects || [];
    const dmg = effects.find(fx => fx.kind === 'damage');
    const dmgRoll = effects.find(fx => fx.kind === 'damage_roll');

    if (!dmg && !dmgRoll) return null;

    // Determine damage track (physical vs magic) + scaled value
    let scaled = 0;
    let track = 'physical';
    if (dmg && typeof dmg.formula === 'string') {
      const ctx = this._ctxFor(attacker);
      scaled = this._evalFormula(dmg.formula, ctx);
      track = dmg.formula.includes('mag') ? 'magic' : 'physical';
    } else if (dmgRoll) {
      const base = this._randInt(dmgRoll.min ?? 1, dmgRoll.max ?? 3);
      const atkScale = (dmgRoll.scaling?.atk ? (attacker.atk ?? 0) * (dmgRoll.scaling.atk || 0) : 0);
      const magScale = (dmgRoll.scaling?.mag ? (attacker.mag ?? 0) * (dmgRoll.scaling.mag || 0) : 0);
      scaled = base + atkScale + magScale;
      track = (magScale > atkScale) ? 'magic' : 'physical';
    }

    // Map to manager model: raw = base(0) + stat + powerBonus - defense = scaled - defense
    const base = 0;
    const stat = (track === 'magic') ? (attacker.mag ?? 0) : (attacker.atk ?? 0);
    const powerBonus = scaled - stat;

    // Element from tags (e.g., ['elemental','fire'])
    let element = null;
    if (Array.isArray(skill.tags)) {
      if (skill.tags.includes('fire')) element = 'fire';
      else if (skill.tags.includes('frost')) element = 'frost';
      else if (skill.tags.includes('lightning')) element = 'lightning';
      else if (skill.tags.includes('poison')) element = 'poison';
    }

    return {
      name: skill.name,
      type: (track === 'magic') ? 'magic' : 'physical',
      base,
      variance: 0,
      powerBonus,
      element
    };
  }

  async _applyNonDamageEffect(source, target, skill) {
    const abilityInfo = pickSkillFields(skill) || undefined;
    for (const fx of (skill.effects || [])) {
      switch (fx.kind) {
        case 'heal': {
          const beforeState = snapshotUnit(source);
          const amount = Math.max(1, Math.round(fx.amount ?? 5));
          const before = source.hp ?? 0;
          const max = (source.hpMax ?? before);
          source.hp = Math.min(max, before + amount);
          this._log(`${source.name} recovers ${amount} HP.`);
          const afterState = snapshotUnit(source);
          GameLogger.info('HEAL_APPLIED', dropUndefined({
            amount,
            target: summarizeUnitDelta(beforeState, afterState),
            actor: summarizeUnit(source),
            ability: abilityInfo,
          }));
          break;
        }
        case 'shield': {
          const beforeState = snapshotUnit(source);
          const shieldAmount = fx.amount ?? 5;
          source._shield = (source._shield ?? 0) + shieldAmount;
          this._log(`${source.name} gains a shield (${shieldAmount}).`);
          const afterState = snapshotUnit(source);
          GameLogger.info('SHIELD_APPLIED', dropUndefined({
            amount: shieldAmount,
            duration: fx.duration ?? 0,
            target: summarizeUnitDelta(beforeState, afterState),
            actor: summarizeUnit(source),
            ability: abilityInfo,
          }));
          break;
        }
        case 'buff': {
          const stat = fx.stat; const amt = Number(fx.amount || 0);
          const beforeValue = stat ? source[stat] : undefined;
          source[stat] = (source[stat] ?? 0) + amt;
          this._log(`${source.name}'s ${stat} ${(amt >= 0 ? 'rises' : 'drops')} by ${Math.abs(amt)}.`);
          const afterValue = stat ? source[stat] : undefined;
          GameLogger.info('BUFF_APPLIED', dropUndefined({
            stat,
            amount: amt,
            duration: fx.duration ?? 0,
            target: summarizeUnit(source),
            value_before: beforeValue,
            value_after: afterValue,
            actor: summarizeUnit(source),
            ability: abilityInfo,
          }));
          break;
        }
        case 'root': {
          this._log(`${target.name} is rooted in place.`);
          GameLogger.info('ROOT_APPLIED', dropUndefined({
            target: summarizeUnit(target),
            actor: summarizeUnit(source),
            duration: fx.duration ?? 0,
            ability: abilityInfo,
          }));
          break;
        }
        case 'vuln': {
          const previous = target._vuln || 0;
          const applied = fx.amount ?? 0;
          target._vuln = Math.max(0, previous + applied);
          this._log(`${target.name} is exposed.`);
          GameLogger.info('VULN_APPLIED', dropUndefined({
            amount: applied,
            total: target._vuln,
            target: summarizeUnit(target),
            actor: summarizeUnit(source),
            ability: abilityInfo,
          }));
          break;
        }
        default: break;
      }
    }
  }

  // ===========================================================================
  // Enemy AI (kept simple; all attacks go through CombatManager)
  // ===========================================================================
  async _enemyTurn() {
    const e = this.enemy, p = this.player;
    if (p.hp <= 0) return;

    if (!this._turn) this._turn = 1;
    if (!e._cds) e._cds = {};
    for (const k of Object.keys(e._cds)) e._cds[k] = Math.max(0, (e._cds[k] || 0) - 1);

    const raw = e._raw;
    const skills = raw?.skills || {};
    const hints = raw?.aiHints || {};

    const isUsable = (id) => {
      const def = skills[id]; if (!def) return false;
      const cdLeft = e._cds[id] || 0; return cdLeft <= 0;
    };

    let skill = null;

    if (this._turn === 1 && Array.isArray(hints.openers)) {
      const first = hints.openers.find(isUsable);
      if (first) skill = this._mkEnemySkill(first, skills[first]);
    }
    if (!skill && Array.isArray(hints.priority)) {
      const prio = hints.priority.find(isUsable);
      if (prio) skill = this._mkEnemySkill(prio, skills[prio]);
    }
    if (!skill) {
      const anyAtk = Object.entries(skills).find(([id, def]) => def?.type === 'attack' && isUsable(id));
      if (anyAtk) skill = this._mkEnemySkill(anyAtk[0], anyAtk[1]);
    }
    if (!skill) {
      skill = { id:'enemy_attack', name:'Enemy Attack', type:'attack', target:'enemy',
                effects:[{ kind:'damage_roll', min:1, max:3, scaling:{ atk:1 } }] };
    }

    this._log(`${e.name} uses ${skill.name}!`);

    // Build ability from enemy skill and resolve via manager
    const ability = this._abilityFromEnemySkill(e, skill);
    if (ability) {
      const result = resolveAttack({
        attacker: e,
        defender: p,
        ability,
        options: { normalizeActor: normalizeFromCatalog, devDiagnostics: this.DEBUG }
      });
      if (result.ok && result.hit) {
        p.hp = Math.max(0, (p.hp ?? 0) - result.totals.damage);
        this._log(`${p.name} takes ${result.totals.damage} damage.`);
      } else if (result.ok && !result.hit) {
        this._log(`${e.name}'s attack misses!`);
      }
    } else {
      // non-damage (buffs, shields, heals)
      await this._applyNonDamageEffect(e, p, skill);
    }

    // start cooldown if defined
    const rawDef = skills[skill.id];
    if (rawDef && typeof rawDef.cooldown === 'number') e._cds[skill.id] = rawDef.cooldown;

    if (p.hp <= 0) {
      GameLogger.info('ENCOUNTER_END', dropUndefined({
        outcome: 'defeat',
        turns: this._turn,
        player: scrubPlayer(p),
        enemy: scrubEnemy(e),
      }));
      this._renderHeader();
      this._log(`💀 ${p.name} has fallen...`);
    }
    this._turn++;
  }

  _mkEnemySkill(id, def) {
    return {
      id,
      name: def?.name || id,
      type: def?.type || 'attack',
      target: def?.target || 'enemy',
      effects: (def?.effects || []).map(e => ({ ...e }))
    };
  }

  _abilityFromEnemySkill(attacker, skill) {
    const effects = skill.effects || [];
    const dmg = effects.find(fx => fx.kind === 'damage');
    const dmgRoll = effects.find(fx => fx.kind === 'damage_roll');
    if (!dmg && !dmgRoll) return null;

    let scaled = 0;
    let track = 'physical';
    if (dmg && typeof dmg.formula === 'string') {
      const ctx = this._ctxFor(attacker);
      scaled = this._evalFormula(dmg.formula, ctx);
      track = dmg.formula.includes('mag') ? 'magic' : 'physical';
    } else if (dmgRoll) {
      const base = this._randInt(dmgRoll.min ?? 1, dmgRoll.max ?? 3);
      const atkScale = (dmgRoll.scaling?.atk ? (attacker.atk ?? 0) * (dmgRoll.scaling.atk || 0) : 0);
      const magScale = (dmgRoll.scaling?.mag ? (attacker.mag ?? 0) * (dmgRoll.scaling.mag || 0) : 0);
      scaled = base + atkScale + magScale;
      track = (magScale > atkScale) ? 'magic' : 'physical';
    }

    const base = 0;
    const stat = (track === 'magic') ? (attacker.mag ?? 0) : (attacker.atk ?? 0);
    const powerBonus = scaled - stat;

    return {
      name: skill.name,
      type: (track === 'magic') ? 'magic' : 'physical',
      base,
      variance: 0,
      powerBonus
    };
  }

  // ===========================================================================
  // Math helpers (safe eval; small sandbox)
  // ===========================================================================
  _evalFormula(expr, ctx) {
    try { return Function(...Object.keys(ctx), `return ${expr};`)(...Object.values(ctx)); }
    catch { return 0; }
  }
  _ctxFor(u) { return { atk: u.atk ?? 6, mag: u.mag ?? 6, def: u.def ?? 0, spd: u.spd ?? 0, level: u.level ?? 1 }; }

  // ===========================================================================
  // Utilities
  // ===========================================================================
  _sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
  _rand(min, max) { return min + Math.random() * (max - min); }
  _randInt(min, max) { return Math.floor(this._rand(min, max + 1)); }
  _applyBackground(bgUrl) {
    const mount = document.getElementById('sceneMount');
    if (!mount) return;
    if (bgUrl) {
      mount.style.backgroundImage = `url(${bgUrl})`;
      mount.style.backgroundSize = 'cover';
      mount.style.backgroundPosition = 'center';
      mount.style.backgroundRepeat = 'no-repeat';
      // Keep a dark base in case image has transparency
      mount.style.backgroundColor = '#0b111b';
    } else {
      mount.style.backgroundImage = 'none';
    }
  }
}

function dropUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function scrubForLog(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubForLog(entry));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (PII_KEYS.has(key.toLowerCase())) {
        result[key] = '[redacted]';
      } else {
        const cleaned = scrubForLog(val);
        if (cleaned !== undefined) result[key] = cleaned;
      }
    }
    return result;
  }
  if (typeof value === 'string') {
    return value.replace(EMAIL_RE, '[redacted]').replace(IP_RE, '[redacted]');
  }
  return value;
}

function snapshotUnit(unit) {
  if (!unit) return null;
  return {
    id: unit.id ?? null,
    name: unit.name ?? null,
    classId: unit.classId ?? null,
    level: unit.level ?? null,
    hp: unit.hp ?? null,
    hpMax: unit.hpMax ?? null,
    mp: unit.mp ?? null,
    mpMax: unit.mpMax ?? null,
    atk: unit.atk ?? null,
    mag: unit.mag ?? null,
    def: unit.def ?? null,
    spd: unit.spd ?? null,
    shield: unit._shield ?? 0,
  };
}

function summarizeUnit(unit) {
  const snapshot = snapshotUnit(unit);
  return snapshot ? scrubForLog(dropUndefined(snapshot)) : null;
}

function summarizeUnitDelta(before, after) {
  if (!before && !after) return null;
  const base = before || after || {};
  return scrubForLog(dropUndefined({
    id: base.id ?? null,
    name: base.name ?? null,
    classId: base.classId ?? null,
    level: base.level ?? null,
    hpMax: base.hpMax ?? null,
    mpMax: base.mpMax ?? null,
    atk: base.atk ?? null,
    mag: base.mag ?? null,
    def: base.def ?? null,
    spd: base.spd ?? null,
    hp_before: before?.hp ?? null,
    hp_after: after?.hp ?? (before?.hp ?? null),
    mp_before: before?.mp ?? null,
    mp_after: after?.mp ?? (before?.mp ?? null),
    shield_before: before?.shield ?? 0,
    shield_after: after?.shield ?? (before?.shield ?? 0),
  }));
}

function pickSkillFields(skill) {
  if (!skill) return null;
  const tags = Array.isArray(skill.tags) && skill.tags.length ? [...skill.tags] : undefined;
  return scrubForLog(dropUndefined({
    id: skill.id ?? null,
    name: skill.name ?? null,
    type: skill.type ?? null,
    target: skill.target ?? null,
    tags,
  }));
}

function scrubPlayer(player) {
  return summarizeUnit(player);
}

function scrubEnemy(enemy) {
  return summarizeUnit(enemy);
}


