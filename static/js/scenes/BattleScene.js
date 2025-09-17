// /static/js/scenes/BattleScene.js
// -----------------------------------------------------------------------------
// V4 Battle Scene (self-contained)
// - Reads player class/level from Store (Store is created in app.js).
// - Loads /static/catalog/classes/<classId>.json (skills gated by level).
// - Renders an action bar from the unlocked skills + basic Attack/Defend.
// - Shows HP/MP bars for both units, updates live on damage/heal.
// - Provides a small, well-commented combat math section you can tune.
//
// Integration points:
//  • Class loader helpers come from /static/js/data/classLoader.js  (skills, kit)
//    (This matches the API you already use elsewhere.)  :contentReference[oaicite:2]{index=2}
//  • Enemy objects are provided by your sandbox adapter from enemies.json,
//    flattened into { hp, atk, mag, def, spd, level, name }.             :contentReference[oaicite:3]{index=3}
//
// Optional payload knobs (from the caller/sandbox):
//  • K_DEF: mitigation soft-cap constant (defaults to 12 if not provided)
//  • encounter: the enemy stat block to fight
//
// -----------------------------------------------------------------------------

import { loadClassCatalog, skillsAvailableAtLevel } from '/static/js/data/classLoader.js'; // :contentReference[oaicite:4]{index=4}

export class BattleScene {
  /**
   * @param {SceneManager} sm - provides .overlay and .getPayload()
   * @param {Store} store    - provides .get() -> { player, scene }
   */
  constructor(sm, store) {
    this.sm = sm;
    this.store = store;

    // --- UI element refs -----------------------------------------------------
    this.uiRoot = null;       // <div id="battle-ui"> ...
    this.hudEl = null;        // header cards region (player/enemy)
    this.actionBarEl = null;  // buttons for skills
    this.logEl = null;        // scrolling text log

    // --- Runtime state -------------------------------------------------------
    this.player = null;       // live reference to store.get().player
    this.enemy = null;        // current enemy object
    this.actionBar = [];      // list of skill objects for player
    this.turnLock = false;    // prevents double-activations during an action

    // --- Tunables (EDIT HERE or pass via payload) ----------------------------
    this.K_DEF = 12;          // mitigation soft-cap (higher => more mitigation)
    this.VARIANCE_MIN = 0.90; // ±10% variance by default
    this.VARIANCE_MAX = 1.10;
    this.CRIT_CHANCE = 0.10;  // 10% crit
    this.CRIT_MULT = 1.50;    // 1.5x damage on crit
  }

  // ===========================================================================
  // Scene Lifecycle
  // ===========================================================================

  async onEnter() {
    // 1) Bind player and read payload (enemy + optional K_DEF)
    const state = this.store.get();
    this.player = state.player;

    const payload = this.sm.getPayload?.() || {};
    if (typeof payload.K_DEF === 'number') this.K_DEF = payload.K_DEF;
    // Fallback enemy if none provided (handy when called directly)
    this.enemy = payload.encounter || {
      id: 'slime',
      name: 'Gloomslick Slime',
      level: 1,
      hp: 24, atk: 5, mag: 0, def: 2, spd: 3
    };

    

    if (typeof this.enemy.hpMax !== 'number') this.enemy.hpMax = this.enemy.hp ?? 0;
    if (typeof this.enemy.mpMax !== 'number') this.enemy.mpMax = this.enemy.mp ?? 0;

    // (optional) also ensure the player has maxes (if not already set)
    if (typeof this.player.hpMax !== 'number') this.player.hpMax = this.player.hp ?? 0;
    if (typeof this.player.mpMax !== 'number') this.player.mpMax = this.player.mp ?? 0;

    // 2) Mount the UI chrome and greet the fight
    this._mountUI();
    this._renderHeader();
    this._log(`⚔️ A wild ${this.enemy.name} (Lv.${this.enemy.level}) appears!`);

    // 3) Build player's action kit from class+level
    const classId = (this.player.classId || 'warrior').toLowerCase();
    const level   = Math.max(1, this.player.level || 1);

    try {
      const catalog = await loadClassCatalog(classId);
      const kit = skillsAvailableAtLevel(catalog, level); // [{ id, name, type, target, effects[], ...}]
      // Always-available basic actions (good safety net)
      const basics = [
        { id:'basic_attack', name:'Attack', type:'attack', target:'enemy', effects:[{ kind:'damage', formula:'atk*0.8' }] },
        { id:'defend',       name:'Defend', type:'buff',   target:'self',  effects:[{ kind:'buff', stat:'def', amount:2, duration:1 }] }
      ];
      this.actionBar = [...basics, ...kit];
      this._renderActionBar();
      this._log(`Class loaded: ${(catalog.class?.name || classId)} (Lv.${level}). Actions ready.`);
    } catch (err) {
      console.error('[BattleScene] class load failed:', err);
      this._log('No class catalog found. Using basic actions.');
      this.actionBar = [
        { id:'basic_attack', name:'Attack', type:'attack', target:'enemy', effects:[{ kind:'damage', formula:'atk*0.8' }] },
        { id:'defend',       name:'Defend', type:'buff',   target:'self',  effects:[{ kind:'buff', stat:'def', amount:2, duration:1 }] }
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

  // ===========================================================================
  // UI (HUD + Bars + Action Bar + Log)
  // ===========================================================================

  _mountUI() {
    const host = this.sm.overlay || document.body;

    const root = document.createElement('div');
    root.id = 'battle-ui';
    root.style.position = 'absolute';
    root.style.left = '16px';
    root.style.right = '16px';
    root.style.bottom = '16px';
    root.style.padding = '12px';
    root.style.background = 'rgba(12, 16, 24, 0.72)';
    root.style.border = '1px solid rgba(255,255,255,0.08)';
    root.style.borderRadius = '12px';
    root.style.backdropFilter = 'blur(4px)';
    root.style.color = '#dbe3f0';
    root.style.font = '14px/1.4 system-ui, sans-serif';
    root.style.pointerEvents = 'auto';

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
    log.style.maxHeight = '160px';
    log.style.overflow = 'auto';
    log.style.padding = '8px';
    log.style.background = 'rgba(0,0,0,0.25)';
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

  // --- Progress Bars ---------------------------------------------------------
  _mkBar(label, curr, max, opts = {}) {
    const pct = Math.max(0, Math.min(1, max > 0 ? curr / max : 0));
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
    fill.style.background = opts.color || 'linear-gradient(90deg, #ff4d6d, #ff936a)'; // HP default
    bar.appendChild(fill);

    // Optional shield overlay (temp HP beyond HP bar)
    if (opts.shield && opts.shield > 0) {
      const total = (max || 0) + opts.shield; // show as extension to the right
      const shieldPct = Math.max(0, Math.min(1, total > 0 ? (Math.max(curr,0) + opts.shield) / total : 0));
      const shieldBar = document.createElement('div');
      shieldBar.style.position = 'absolute';
      shieldBar.style.right = '0'; shieldBar.style.top = '0'; shieldBar.style.bottom = '0';
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

    const header = document.createElement('div');
    header.style.fontWeight = '600';
    header.style.marginBottom = '6px';
    header.textContent = `${title}${extra ? ` — ${extra}` : ''}`;
    card.appendChild(header);

    // HP (with optional shield)
    card.appendChild(this._mkBar('HP', unit.hp ?? 0, unit.hpMax ?? (unit.hp ?? 0), { shield: unit._shield || 0 }));

    // MP/Resource if present
    const mpMax = unit.mpMax ?? 0;
    if (mpMax > 0) {
      card.appendChild(this._mkBar('MP', unit.mp ?? 0, mpMax, { color: 'linear-gradient(90deg, #4d7cff, #80b3ff)' }));
    }

    return card;
  }

  _renderHeader() {
    const hud = this.hudEl;
    hud.innerHTML = '';

    const p = this.player;
    const e = this.enemy;

    const playerTitle = `🧙 ${p.name || (p.classId ? p.classId[0].toUpperCase()+p.classId.slice(1) : 'Adventurer')}`;
    const enemyTitle  = `👾 ${e.name}`;
    const pExtra = `Class: ${p.classId ?? 'warrior'}`;
    const eExtra = `Lv.${e.level}`;

    hud.append(
      this._mkUnitCard(playerTitle, p, pExtra),
      this._mkUnitCard(enemyTitle,  e, eExtra)
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

  _log(text) {
    if (!this.logEl) return console.log('[battle]', text);
    const p = document.createElement('div');
    p.textContent = text;
    this.logEl.appendChild(p);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  // ===========================================================================
  // Combat Core
  // ===========================================================================

  /**
   * Player uses a skill (button click).
   *  - Pays costs (if any)
   *  - Applies effects via a small interpreter
   *  - Triggers enemy turn (simple AI) if enemy still alive
   */
  async useSkill(skill) {
    if (this.turnLock) return;
    this.turnLock = true;

    const p = this.player;
    const e = this.enemy;

    // 1) Resource costs (if your class JSON includes 'cost': {...})
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

    // 2) Do the thing
    this._log(`${p.name} uses ${skill.name}!`);
    await this._applySkillEffects(p, e, skill);

    if (e.hp <= 0) {
      this._renderHeader();
      this._log(`🏆 ${e.name} is defeated!`);
      this.turnLock = false;
      return;
    }

    // 3) Enemy reacts after a short delay
    this._renderHeader();
    await this._sleep(400);
    await this._enemyTurn();
    this._renderHeader();
    this.turnLock = false;
  }

  /**
   * Enemy AI (MVP):
   *  - If enemy has a "primary" attack defined (via your adapter), use it.
   *  - Else do a default physical swing based on e.atk.
   * (You can evolve this to read e._raw.aiHints.priority and e._raw.skills.)
   */
  async _enemyTurn() {
    const e = this.enemy;
    const p = this.player;
    if (p.hp <= 0) return;

    // Use the first available attack from raw skills if present (very simple)
    let skill = null;
    const rawSkills = e._raw?.skills || null;
    if (rawSkills) {
      // pick first 'attack' skill defined
      for (const [id, def] of Object.entries(rawSkills)) {
        if (def?.type === 'attack') {
          skill = { id, name: def.name || id, type:'attack', target:'enemy',
                    effects: this._adaptEnemyEffects(def.effects || []) };
          break;
        }
      }
    }

    // Fallback: a basic enemy strike (atk-based)
    if (!skill) {
      skill = { id:'enemy_attack', name:'Enemy Attack', type:'attack', target:'enemy',
                effects:[{ kind:'damage', formula:'atk*0.9' }] };
    }

    this._log(`${e.name} uses ${skill.name}!`);
    await this._applySkillEffects(e, p, skill);

    if (p.hp <= 0) {
      this._renderHeader();
      this._log(`💀 ${p.name} has fallen...`);
    }
  }

  // --- Effects Interpreter ---------------------------------------------------
  /**
   * Applies a single skill's effects list from "source" to "target".
   * Supports the following kinds out of the box:
   *  • damage (formula-based, e.g., "atk*1.1", "mag*1.35")
   *  • heal   (flat amount)
   *  • buff   (additive stat change)
   *  • shield (temp HP pool)
   *  • taunt, slow, root, stun, dot  (stubs/logs; wire as needed)
   * You can add new kinds by extending the switch below.
   */
  async _applySkillEffects(source, target, skill) {
    const effects = skill.effects || [];
    for (const fx of effects) {
      switch (fx.kind) {
        // --- Core damage (formula string) -----------------------------------
        case 'damage': {
          const raw = this._evalFormula(fx.formula || 'atk*1', this._ctxFor(source));
          const dealt = this._applyMitigationAndRng(raw, target.def ?? 0);
          this._applyDamage(target, dealt, skill);
          break;
        }
        // --- Heal ------------------------------------------------------------
        case 'heal': {
          const amount = Math.max(1, Math.round(fx.amount ?? 5));
          this._healTarget(source === target ? source : target, amount, skill);
          break;
        }
        // --- Buff / Debuff ---------------------------------------------------
        case 'buff': {
          this._applyBuff(source === target ? source : (fx.target === 'self' ? source : target),
                          fx.stat, fx.amount ?? 1, fx.duration ?? 1);
          break;
        }
        // --- Shield ----------------------------------------------------------
        case 'shield': {
          this._applyShield(source === target ? source : (fx.target === 'self' ? source : target),
                            fx.amount ?? 5, fx.duration ?? 1);
          break;
        }
        // --- Misc stubs: extend these when you add systems ------------------
        case 'taunt': {
          this._log(`${source.name} taunts ${target.name}!`);
          break;
        }
        case 'slow': {
          this._log(`${target.name} is slowed.`);
          target.spd = Math.max(0, (target.spd ?? 0) - (fx.amount ?? 1));
          break;
        }
        case 'root': {
          this._log(`${target.name} is rooted.`);
          break;
        }
        case 'stun': {
          this._log(`${target.name} is stunned.`);
          break;
        }
        case 'dot': {
          this._log(`${target.name} suffers a lingering effect.`);
          break;
        }
        // --- Enemy-only convenience kinds (from your enemies.json) ----------
        // "damage_roll": { min, max, scaling:{ atk?:1, mag?:1 } }
        case 'damage_roll': {
          const base = this._randInt(fx.min ?? 1, fx.max ?? 3);
          const scale = (fx.scaling?.atk ? (source.atk ?? 0) * (fx.scaling.atk || 0) : 0)
                      + (fx.scaling?.mag ? (source.mag ?? 0) * (fx.scaling.mag || 0) : 0);
          const raw = base + scale; // simple sum; you can move this into formula if you prefer
          const dealt = this._applyMitigationAndRng(raw, target.def ?? 0);
          this._applyDamage(target, dealt, skill);
          break;
        }
        // "buff_pct": { stat:'damage', amountPct:20, stacks:5, consumeOnAttack:true }  (stub)
        case 'buff_pct': {
          this._log(`${source.name} powers up (${fx.amountPct ?? 0}% ${fx.stat || 'stat'}).`);
          break;
        }
        default: {
          this._log(`(effect ${fx.kind} not implemented)`);
        }
      }

      // Update bars immediately after each effect tick
      this._renderHeader();
      await this._sleep(10);
    }
  }

  // Convert enemy effect blocks into scene-native kinds when needed
  _adaptEnemyEffects(effects) {
    // Most of your enemy effects already match our kinds (damage_roll, buff, shield, heal)
    // Return shallow copy to be safe
    return effects.map(e => ({ ...e }));
  }

  // ===========================================================================
  // Math (Mitigation, Crit, Variance) — EDIT HERE to change "the feel"
  // ===========================================================================

  /**
   * Evaluate a small formula string using a limited context.
   * Designer-controlled (not user input), so Function(...) is acceptable here.
   * Example: 'atk*1.1' or 'mag*1.35'
   */
  _evalFormula(expr, ctx) {
    try {
      /* eslint no-new-func: "off" */
      return Function(...Object.keys(ctx), `return ${expr};`)(...Object.values(ctx));
    } catch {
      return 0;
    }
  }

  _ctxFor(unit) {
    return {
      atk: unit.atk ?? 6,
      mag: unit.mag ?? 6,
      def: unit.def ?? 0,
      spd: unit.spd ?? 0
    };
  }

  /**
   * Applies mitigation + variance + crit to a raw hit before rounding.
   * Mitigation model (soft cap):
   *    multiplier = K_DEF / (DEF + K_DEF)
   *    where K_DEF is a tunable constant (higher -> more reduction).
   * Then we apply ±10% variance and a 10% crit for 1.5x (defaults).
   */
  _applyMitigationAndRng(raw, targetDef) {
    // 1) Mitigation
    const mult = this.K_DEF / (Math.max(0, targetDef) + this.K_DEF);
    let dmg = Math.max(0, raw * mult);

    // 2) Variance
    const v = this._rand(this.VARIANCE_MIN, this.VARIANCE_MAX);
    dmg *= v;

    // 3) Crit
    if (Math.random() < this.CRIT_CHANCE) {
      dmg *= this.CRIT_MULT;
      this._log(' (critical!)');
    }

    return Math.max(1, Math.round(dmg));
  }

  // ===========================================================================
  // Stat Application Helpers
  // ===========================================================================

  _applyDamage(target, amount /*, sourceSkill */) {
    // Shields absorb first
    if (target._shield && target._shield > 0) {
      const absorbed = Math.min(target._shield, amount);
      target._shield -= absorbed;
      amount -= absorbed;
      this._log(`${target.name} absorbs ${absorbed} with a shield.`);
    }
    if (amount > 0) {
      target.hp = Math.max(0, (target.hp ?? 0) - amount);
      this._log(`${target.name} takes ${amount} damage.`);
    }
    this._renderHeader();
  }

  _healTarget(target, amount /*, sourceSkill */) {
    const max = (target.hpMax ?? target.hp ?? 0);
    target.hp = Math.min(max, (target.hp ?? 0) + amount);
    this._log(`${target.name} recovers ${amount} HP.`);
    this._renderHeader();
  }

  _applyBuff(target, stat, amount, /*duration*/) {
    target[stat] = (target[stat] ?? 0) + (amount ?? 0);
    this._log(`${target.name}'s ${stat} ${(amount >= 0 ? 'rises' : 'drops')} by ${Math.abs(amount)}.`);
  }

  _applyShield(target, amount, /*duration*/) {
    target._shield = (target._shield ?? 0) + (amount ?? 0);
    this._log(`${target.name} gains a shield (${amount}).`);
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  _sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
  _rand(min, max) { return min + Math.random() * (max - min); }
  _randInt(min, max) { return Math.floor(this._rand(min, max + 1)); }
}
