// BattleScene.js
// v4 prototype battle scene
// - Reads player class/level from the Store (set in app.js via ?class=...&lvl=...)
// - Loads /assets/catalog/classes/<classId>.json
// - Builds an action bar from unlocked skills + basic Attack/Defend
// - Executes simple effects (damage/heal/buff/shield/taunt/slow) and logs turns
// - Minimal enemy AI: basic attack back after the player acts

import { loadClassCatalog, skillsAvailableAtLevel } from '/static/js/data/classLoader.js';

export class BattleScene {
  /**
   * @param {SceneManager} sm
   * @param {Store} store
   */
  constructor(sm, store) {
    this.sm = sm;
    this.store = store;

    // UI roots attached to the SceneManager's overlay if present
    this.uiRoot = null;
    this.actionBarEl = null;
    this.logEl = null;

    // Runtime entities
    this.player = null;   // alias to store.get().player (snapshot + live)
    this.enemy  = null;   // simple demo enemy
    this.actionBar = [];  // list of skill objects
    this.turnLock = false;
  }

  // --- Scene lifecycle ------------------------------------------------------

  async onEnter() {
    // Resolve live player reference
    this.player = this.store.get().player;

    // Build UI container
    this._mountUI();

    // Spawn a demo enemy (replace with your encounter payload if provided)
    // If the scene was switched to with payload { encounter }, use it:
    const payload = this.sm.getPayload?.() || {};
    this.enemy = payload.encounter || { id: 'slime', name: 'Gloomslick Slime', level: 1, hp: 20, atk: 5, def: 2, spd: 3 };

    this._renderHeader();
    this._log(`⚔️ A wild ${this.enemy.name} (Lv.${this.enemy.level}) appears!`);

    // Load class kit
    const classId = (this.player.classId || 'warrior').toLowerCase();
    const level   = Math.max(1, this.player.level || 1);

    try {
      const catalog = await loadClassCatalog(classId);
      const kit = skillsAvailableAtLevel(catalog, level);

      // Always-available basics
      const basics = [
        { id: 'basic_attack', name: 'Attack', type: 'attack', target: 'enemy', effects: [{ kind: 'damage', formula: 'atk*0.8' }] },
        { id: 'defend', name: 'Defend', type: 'buff', target: 'self', effects: [{ kind: 'buff', stat: 'def', amount: 2, duration: 1 }] }
      ];

      this.actionBar = [...basics, ...kit];
      this._renderActionBar();
      this._log(`Class loaded: ${catalog.class?.name ?? classId} (Lv.${level}). Actions ready.`);
    } catch (err) {
      console.error('[BattleScene] class load failed:', err);
      this._log('No class catalog found. Using basic actions.');
      this.actionBar = [
        { id: 'basic_attack', name: 'Attack', type: 'attack', target: 'enemy', effects: [{ kind: 'damage', formula: 'atk*0.8' }] },
        { id: 'defend', name: 'Defend', type: 'buff', target: 'self', effects: [{ kind: 'buff', stat: 'def', amount: 2, duration: 1 }] }
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
  }

  // --- UI -------------------------------------------------------------------

  _mountUI() {
    // Attach to overlay if available; otherwise body
    const host = this.sm.overlay || document.body;

    // Root
    const root = document.createElement('div');
    root.id = 'battle-ui';
    root.style.position = 'absolute';
    root.style.left = '16px';
    root.style.right = '16px';
    root.style.bottom = '16px';
    root.style.padding = '12px';
    root.style.background = 'rgba(12, 16, 24, 0.7)';
    root.style.border = '1px solid rgba(255,255,255,0.08)';
    root.style.borderRadius = '12px';
    root.style.backdropFilter = 'blur(4px)';
    root.style.pointerEvents = 'auto';
    root.style.color = '#dbe3f0';
    root.style.font = '14px/1.4 system-ui, sans-serif';

    // Header (player/enemy HUD)
    const hud = document.createElement('div');
    hud.id = 'battle-hud';
    hud.style.display = 'flex';
    hud.style.justifyContent = 'space-between';
    hud.style.gap = '12px';
    hud.style.marginBottom = '8px';

    // Action bar
    const bar = document.createElement('div');
    bar.id = 'battle-actions';
    bar.style.display = 'flex';
    bar.style.flexWrap = 'wrap';
    bar.style.gap = '8px';
    bar.style.marginTop = '8px';
    bar.style.marginBottom = '8px';

    // Log
    const log = document.createElement('div');
    log.id = 'battle-log';
    log.style.maxHeight = '160px';
    log.style.overflow = 'auto';
    log.style.padding = '8px';
    log.style.background = 'rgba(0,0,0,0.25)';
    log.style.borderRadius = '8px';
    log.style.border = '1px solid rgba(255,255,255,0.06)';

    root.append(hud, bar, log);
    host.appendChild(root);

    this.uiRoot = root;
    this.actionBarEl = bar;
    this.logEl = log;
  }

  _unmountUI() {
    if (this.uiRoot && this.uiRoot.parentNode) {
      this.uiRoot.parentNode.removeChild(this.uiRoot);
    }
    this.uiRoot = this.actionBarEl = this.logEl = null;
  }

  _renderHeader() {
    const hud = this.uiRoot.querySelector('#battle-hud');
    hud.innerHTML = '';

    const p = this.player;
    const e = this.enemy;

    const mkCard = (title, hp, extra = '') => {
      const card = document.createElement('div');
      card.style.flex = '1';
      card.style.padding = '8px';
      card.style.background = 'rgba(255,255,255,0.04)';
      card.style.borderRadius = '8px';
      card.style.border = '1px solid rgba(255,255,255,0.06)';
      card.innerHTML = `
        <div style="font-weight:600;margin-bottom:6px">${title}</div>
        <div>HP: <strong>${hp}</strong>${extra ? ` • ${extra}` : ''}</div>
      `;
      return card;
    };

    const playerHP = `${p.hp}/${p.hpMax ?? p.hp}`;
    const enemyHP  = `${e.hp}`;

    hud.append(
      mkCard(`🧙 ${p.name}`, playerHP, `Class: ${p.classId ?? 'warrior'}`),
      mkCard(`👾 ${e.name}`, enemyHP, `Lv.${e.level}`)
    );
  }

  _renderActionBar() {
    const bar = this.actionBarEl;
    bar.innerHTML = '';

    for (const sk of this.actionBar) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = sk.name;
      btn.style.minWidth = '96px';
      btn.onclick = () => this.useSkill(sk);
      bar.appendChild(btn);
    }
  }

  _log(text) {
    if (!this.logEl) return console.log('[battle]', text);
    const p = document.createElement('div');
    p.textContent = text;
    this.logEl.appendChild(p);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  // --- Combat core ----------------------------------------------------------

  async useSkill(skill) {
    if (this.turnLock) return;
    this.turnLock = true;

    const p = this.player;
    const e = this.enemy;

    // Pay resource costs if defined
    if (skill.cost) {
      if (!p.resources) p.resources = {};
      for (const [res, amt] of Object.entries(skill.cost)) {
        const have = p.resources[res] ?? 0;
        if (have < amt) {
          this._log(`Not enough ${res} to use ${skill.name}.`);
          this.turnLock = false;
          return;
        }
      }
      for (const [res, amt] of Object.entries(skill.cost)) {
        p.resources[res] = (p.resources[res] ?? 0) - amt;
      }
    }

    // Execute simple effect interpreter
    this._log(`${p.name} uses ${skill.name}!`);
    for (const fx of (skill.effects || [])) {
      switch (fx.kind) {
        case 'damage': {
          const ctx = this._ctxFor(p);
          const amount = Math.max(0, Math.round(this._evalFormula(fx.formula || 'atk*1', ctx)));
          this._applyDamage(e, amount, skill);
          break;
        }
        case 'heal': {
          const amount = Math.max(1, fx.amount ?? 5);
          this._healTarget(p, amount, skill);
          break;
        }
        case 'buff': {
          this._applyBuff(p, fx.stat, fx.amount ?? 1, fx.duration ?? 1);
          break;
        }
        case 'shield': {
          this._applyShield(p, fx.amount ?? 5, fx.duration ?? 1);
          break;
        }
        case 'taunt': {
          // Stub: could set e.aiTarget = 'player' for N turns
          this._log(`${p.name} taunts ${e.name}!`);
          break;
        }
        case 'slow': {
          // Stub: reduce enemy spd for duration
          this._log(`${e.name} is slowed.`);
          break;
        }
        case 'dot': {
          // Stub: damage-over-time
          this._log(`${e.name} is afflicted.`);
          break;
        }
        case 'multi': {
          // Already encoded in damage skill above; could loop for extra hits
          break;
        }
        default:
          this._log(`(effect ${fx.kind} not implemented yet)`);
      }
    }

    // Check end of battle
    if (e.hp <= 0) {
      this._renderHeader();
      this._log(`🏆 ${e.name} is defeated!`);
      this.turnLock = false;
      return;
    }

    // Enemy acts after a small delay (prototype feel)
    this._renderHeader();
    await this._sleep(400);
    await this._enemyTurn();
    this._renderHeader();
    this.turnLock = false;
  }

  async _enemyTurn() {
    const e = this.enemy;
    const p = this.player;
    if (p.hp <= 0) return;

    const dmg = Math.max(1, Math.round((e.atk ?? 5) * 0.9) - (p.def ?? 0));
    this._log(`${e.name} strikes back!`);
    this._applyDamage(p, dmg, { id: 'enemy_attack', name: 'Enemy Attack' });

    if (p.hp <= 0) {
      this._renderHeader();
      this._log(`💀 ${p.name} has fallen...`);
    }
  }

  // --- Math & helpers -------------------------------------------------------

  _ctxFor(unit) {
    return {
      atk: unit.atk ?? 6,
      mag: unit.mag ?? 6,
      def: unit.def ?? 0,
      spd: unit.spd ?? 0
    };
  }

  _evalFormula(expr, ctx) {
    // Minimal safe-ish evaluator for formulas like 'atk*1.2' or 'mag*1.35'
    // DO NOT feed user input here; this is designer-controlled data.
    try {
      /* eslint no-new-func: "off" */
      return Function(...Object.keys(ctx), `return ${expr};`)(...Object.values(ctx));
    } catch {
      return 0;
    }
  }

  _applyDamage(target, amount, sourceSkill) {
    target.hp = Math.max(0, (target.hp ?? 0) - amount);
    const who = (target === this.player) ? this.player.name : this.enemy.name;
    this._log(`${who} takes ${amount} damage.`);
  }

  _healTarget(target, amount, sourceSkill) {
    const max = (target.hpMax ?? target.hp ?? 0);
    target.hp = Math.min(max, (target.hp ?? 0) + amount);
    const who = (target === this.player) ? this.player.name : this.enemy.name;
    this._log(`${who} recovers ${amount} HP.`);
  }

  _applyBuff(target, stat, amount, duration) {
    // Prototype: immediate additive buff that fades at end of battle (no timers)
    target[stat] = (target[stat] ?? 0) + amount;
    const who = (target === this.player) ? this.player.name : this.enemy.name;
    this._log(`${who}'s ${stat} rises by ${amount} for ${duration} turn(s).`);
  }

  _applyShield(target, amount, duration) {
    // Prototype: track as temp HP on target._shield (consumed before hp)
    target._shield = (target._shield ?? 0) + amount;
    const who = (target === this.player) ? this.player.name : this.enemy.name;
    this._log(`${who} gains a shield (${amount}) for ${duration} turn(s).`);
  }

  _sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }
}
