// /static/js/scenes/BattleScene.js
// -----------------------------------------------------------------------------
// Battle Scene (vNext)
// - Loads class kit (skills by level) from /static/catalog/classes/<classId>.json
// - Accepts enemy payload (flattened) from sandbox/main, with raw AI data attached
// - Renders portraits + HP/MP bars
// - Enemy AI uses aiHints.openers → priority → fallback attack, with cooldowns & hitChance
// - Damage math exposes a full debug breakdown (raw → mitigation → variance → crit → final)
//   Toggle DEBUG below to silence logs in the UI once tuning is done.
//
// External data loaders:
//   classLoader.js → loadClassCatalog, skillsAvailableAtLevel  :contentReference[oaicite:2]{index=2}
// Enemy data format provided by your /static/catalog/enemies.json (raw)         :contentReference[oaicite:3]{index=3}
//
// -----------------------------------------------------------------------------

import { loadClassCatalog, skillsAvailableAtLevel } from '/static/js/data/classLoader.js';
import { initFromClass, syncCanonical, canSpend, spend, regenTurn } from '../systems/resourceManager.js';
import { buildBattleDOM } from '../views/battleView.js';

export class BattleScene {
  constructor(sm, store) {
    this.sm = sm;
    this.store = store;

    // UI refs
    this.rootEl = null;

    // State
    this.player = null;
    this.enemy = null;
    this.actionBar = [];
    this.turnLock = false;
    this.turn = 1;
    this._turn = 0;     // enemy turn counter
    this._currentTarget = null;
    this.logs = [];

    // Tuning knobs (edit here or pass K_DEF in payload)
    this.K_DEF = 12;          // mitigation soft-cap constant
    this.VARIANCE_MIN = 0.90; // ±10% damage variance (lower bound)
    this.VARIANCE_MAX = 1.10; // (upper bound)
    this.CRIT_CHANCE = 0.10;  // 10% crit chance
    this.CRIT_MULT = 1.50;    // 1.5x crit multiplier

    // Debug logging to battle log (set to false when you’re done tuning)
    this.DEBUG = true;
  }

  // ===========================================================================
  // Scene Lifecycle
  // ===========================================================================
  async onEnter() {
    const state = this.store.get();
    this.player = state.player;
    this.turnLock = false;
    this.turn = 1;
    this.logs = [];
    this.actionBar = [];
    this._turn = 0;
    this._currentTarget = null;

    const payload = this.sm.getPayload?.() || {};
    if (typeof payload.K_DEF === 'number') this.K_DEF = payload.K_DEF;

    const encounter = payload.encounter || {
      id: 'slime', name: 'Gloomslick Slime', level: 1,
      hp: 24, atk: 5, mag: 0, def: 2, spd: 3
    };
    this.enemy = { ...encounter };

    if (typeof this.enemy.hpMax !== 'number') this.enemy.hpMax = this.enemy.hp ?? 0;
    if (typeof this.enemy.mpMax !== 'number') this.enemy.mpMax = this.enemy.mp ?? 0;
    if (typeof this.player.hpMax !== 'number') this.player.hpMax = this.player.hp ?? 0;
    if (typeof this.player.mpMax !== 'number') this.player.mpMax = this.player.mp ?? 0;

    const classId = (this.player.classId || 'warrior').toLowerCase();
    let catalog = null;
    try {
      catalog = await loadClassCatalog(classId);
      if (catalog?.class) {
        this.player.classDef = catalog.class;
      }
    } catch (e) {
      console.error('[BattleScene] class load failed:', e);
    }

    initFromClass(this.player.classDef, this.player);
    syncCanonical(this.player);

    this.player.portrait = `/static/assets/art/classArt/${classId}.png`;
    if (!this.enemy.portrait && this.enemy._raw?.art?.portrait) {
      this.enemy.portrait = this.enemy._raw.art.portrait;
    }

    this._mountUI();
    this.render();

    this._log(`⚔️ A wild ${this.enemy.name} (Lv.${this.enemy.level}) appears!`);
    this._dlog(`[init] K_DEF = ${this.K_DEF}`);

    const level = Math.max(1, this.player.level || 1);
    const basics = this._buildBasicActions();
    if (catalog) {
      const kit = skillsAvailableAtLevel(catalog, level).map((sk) => this._normalizeAbility(sk));
      this.actionBar = [...basics, ...kit];
      const className = catalog.class?.name || classId;
      this._log(`Class loaded: ${className} (Lv.${level}). Actions ready.`);
    } else {
      this.actionBar = basics;
      this._log('No class catalog found. Using basic actions.');
    }
    this.render();
  }

  onExit() {
    this._unmountUI();
    this.player = null;
    this.enemy = null;
    this.actionBar = [];
    this.turnLock = false;
    this.turn = 1;
    this.logs = [];
    this._turn = 0;
  }

  // ===========================================================================
  // UI
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
    root.style.background = 'rgba(12,16,24,0.72)';
    root.style.border = '1px solid rgba(255,255,255,0.08)';
    root.style.borderRadius = '12px';
    root.style.backdropFilter = 'blur(4px)';
    root.style.color = '#dbe3f0';
    root.style.font = '14px/1.4 system-ui, sans-serif';
    root.style.pointerEvents = 'auto';
    root.dataset.scene = 'battle';

    host.appendChild(root);
    this.rootEl = root;
  }

  _unmountUI() {
    if (this.rootEl && this.rootEl.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl);
    }
    this.rootEl = null;
  }

  render() {
    if (!this.rootEl) return;
    syncCanonical(this.player);
    syncCanonical(this.enemy);
    const logs = this.logs.slice(-60);
    const locked = this.turnLock;
    const abilities = this.actionBar.map((ability) => ({
      id: ability.id,
      name: ability.name,
      disabled: locked || !this.canUseAbility(ability),
      resource: ability.resource,
      cost: ability.cost ?? 0,
      costLabel: this._formatAbilityCost(ability),
    }));

    buildBattleDOM({
      root: this.rootEl,
      state: {
        player: this.player,
        enemy: this.enemy,
        turn: this.turn,
        logs,
        abilities,
        isLocked: locked,
      },
      handlers: {
        onAbility: (abilityId) => this.useAbility(abilityId),
        onEndTurn: () => this.endTurn(),
        onSelectTarget: () => {},
      }
    });
  }

  _buildBasicActions() {
    const basics = [
      { id:'basic_attack', name:'Attack', type:'attack', target:'enemy', effects:[{ kind:'damage', formula:'atk*0.8' }] },
      { id:'defend',       name:'Defend', type:'buff',   target:'self',  effects:[{ kind:'buff', stat:'def', amount:2, duration:1 }] }
    ];
    return basics.map((skill) => this._normalizeAbility(skill));
  }

  _normalizeAbility(raw) {
    const clone = { ...raw };
    const cost = clone.cost;
    let resource = clone.resource || null;
    let amount = 0;
    let costMap = null;

    if (typeof cost === 'number') {
      amount = Number(cost) || 0;
    } else if (cost && typeof cost === 'object') {
      costMap = {};
      for (const [key, val] of Object.entries(cost)) {
        costMap[key] = Number(val) || 0;
      }
      const entries = Object.entries(costMap);
      if (entries.length) {
        if (!resource) resource = entries[0][0];
        const found = entries.find(([key]) => key === resource) || entries[0];
        amount = found[1];
      }
    }

    clone.cost = amount;
    clone.resource = resource || clone.resource || 'mana';
    if (costMap) clone.costMap = costMap;
    return clone;
  }

  _getAbilityCosts(ability) {
    if (!ability) return [];
    if (ability.costMap && typeof ability.costMap === 'object') {
      return Object.entries(ability.costMap)
        .filter(([, amt]) => (Number(amt) || 0) > 0)
        .map(([resource, amt]) => ({ resource, amount: Number(amt) || 0 }));
    }
    const amt = Number(ability.cost ?? 0);
    if (amt <= 0) return [];
    return [{ resource: ability.resource || 'mana', amount: amt }];
  }

  _formatAbilityCost(ability) {
    const parts = this._getAbilityCosts(ability).map(({ resource, amount }) => {
      const label = this._resourceLabel(resource);
      return `${amount} ${label}`;
    });
    return parts.join(' / ');
  }

  _resourceLabel(resource) {
    const res = this.player?.resources?.[resource];
    if (res && typeof res === 'object' && res.label) return res.label;
    return resource;
  }

  canUseAbility(ability) {
    const costs = this._getAbilityCosts(ability);
    if (!costs.length) return true;
    return costs.every(({ resource, amount }) => canSpend(this.player, resource, amount));
  }

  _spendAbilityCost(ability) {
    const costs = this._getAbilityCosts(ability);
    for (const { resource, amount } of costs) {
      if (amount > 0) spend(this.player, resource, amount);
    }
  }

  _log(t) {
    const line = String(t);
    if (!this.rootEl) console.log('[battle]', line);
    this.logs.push(line);
    if (this.logs.length > 200) this.logs.splice(0, this.logs.length - 200);
    if (this.rootEl) this.render();
  }
  _dlog(line){ if (this.DEBUG){ this._log(line); console.debug(line); } }
  _dlogBlock(title, obj){
    if (!this.DEBUG) return;
    const pretty = JSON.stringify(obj, null, 2);
    this._log(`[math] ${title}`);
    for (const ln of pretty.split('\n')) this._log('  ' + ln);
    console.debug(`[math] ${title}`, obj);
  }

  // ===========================================================================
  // Player turn
  // ===========================================================================
  async useAbility(abilityId) {
    if (this.turnLock) return;
    const ability = this.actionBar.find((a) => a.id === abilityId);
    if (!ability) return;
    if (!this.canUseAbility(ability)) {
      const firstCost = this._getAbilityCosts(ability)[0];
      const label = firstCost
        ? `${firstCost.amount} ${this._resourceLabel(firstCost.resource)}`
        : 'resources';
      this._log(`Not enough ${label} to use ${ability.name}.`);
      return;
    }

    this.turnLock = true;

    const p = this.player;
    const e = this.enemy;

    this._spendAbilityCost(ability);
    this.render();

    this._log(`${p.name} uses ${ability.name}!`);
    await this._applySkillEffects(p, e, ability);

    if (e.hp <= 0) {
      this.render();
      this._log(`🏆 ${e.name} is defeated!`);
      this.turnLock = false;
      return;
    }

    this.render();
    await this._sleep(400);
    await this._enemyTurn();

    if (this.player?.hp > 0) {
      regenTurn(this.player);
      this.turn += 1;
    }
    this.turnLock = false;
    this.render();
  }

  async endTurn() {
    if (this.turnLock) return;
    this.turnLock = true;
    this._log(`${this.player.name} ends their turn.`);
    this.render();
    await this._enemyTurn();
    if (this.player?.hp > 0) {
      regenTurn(this.player);
      this.turn += 1;
    }
    this.turnLock = false;
    this.render();
  }

  // ===========================================================================
  // Enemy AI (openers → priority → any attack → fallback)
  // ===========================================================================
  async _enemyTurn() {
    const e = this.enemy, p = this.player;
    if (p.hp <= 0) return;

    if (!this._turn) this._turn = 1;
    if (!e._cds) e._cds = {};
    // tick cooldowns
    for (const k of Object.keys(e._cds)) e._cds[k] = Math.max(0, (e._cds[k] || 0) - 1);

    const raw = e._raw;
    const skills = raw?.skills || {};
    const hints = raw?.aiHints || {};

    const isUsable = (id) => {
      const def = skills[id]; if (!def) return false;
      const cdLeft = e._cds[id] || 0; return cdLeft <= 0;
    };

    let skill = null;

    // 1) openers on first turn
    if (this._turn === 1 && Array.isArray(hints.openers)) {
      const first = hints.openers.find(isUsable);
      if (first) skill = this._mkEnemySkill(first, skills[first]);
    }
    // 2) priority thereafter
    if (!skill && Array.isArray(hints.priority)) {
      const prio = hints.priority.find(isUsable);
      if (prio) skill = this._mkEnemySkill(prio, skills[prio]);
    }
    // 3) any usable attack
    if (!skill) {
      const anyAtk = Object.entries(skills).find(([id, def]) => def?.type === 'attack' && isUsable(id));
      if (anyAtk) skill = this._mkEnemySkill(anyAtk[0], anyAtk[1]);
    }
    // 4) fallback swing
    if (!skill) {
      skill = { id:'enemy_attack', name:'Enemy Attack', type:'attack', target:'enemy', hitChance:1,
                effects:[{ kind:'damage', formula:'atk*0.9' }] };
    }

    // Hit roll
    const evasionPct = p._evasionPct || 0;
    const baseHit = (typeof skill.hitChance === 'number' ? skill.hitChance : 1);
    const finalHit = Math.max(0, Math.min(1, baseHit * (1 - evasionPct/100)));
    this._dlogBlock(`${e.name} hit roll`, { baseHit, evasionPct, finalHit });
    if (Math.random() > finalHit) { this._log(`${e.name} uses ${skill.name}! (miss)`); this._turn++; return; }

    this._log(`${e.name} uses ${skill.name}!`);
    await this._applySkillEffects(e, p, skill);

    // start cooldown if defined
    const rawDef = skills[skill.id];
    if (rawDef && typeof rawDef.cooldown === 'number') e._cds[skill.id] = rawDef.cooldown;

    if (p.hp <= 0) { this.render(); this._log(`💀 ${p.name} has fallen...`); }
    this._turn++;
  }

  _mkEnemySkill(id, def) {
    return {
      id,
      name: def?.name || id,
      type: def?.type || 'attack',
      target: def?.target || 'enemy',
      hitChance: (typeof def?.hitChance === 'number' ? def.hitChance : 1),
      effects: this._adaptEnemyEffects(def?.effects || [])
    };
  }

  _adaptEnemyEffects(effects) {
    // Enemy effect kinds already line up with our interpreter (damage_roll, buff, shield, heal, root, evasion, vuln).
    return effects.map(e => ({ ...e }));
  }

  // ===========================================================================
  // Effects Interpreter
  // ===========================================================================
  async _applySkillEffects(source, target, skill) {
    const effects = skill.effects || [];
    for (const fx of effects) {
      switch (fx.kind) {
        case 'damage': {
          const raw = this._evalFormula(fx.formula || 'atk*1', this._ctxFor(source));
          this._currentTarget = target;
          const math = this._calcDamage(raw, target);
          this._currentTarget = null;
          this._dlogBlock(`${source.name} → ${target.name} | ${skill.name}`, {
            raw: math.inputs.raw, def: math.inputs.targetDef, vuln: math.inputs.vuln, K_DEF: math.inputs.K_DEF,
            mult: math.mitigation.mult, afterMit: math.mitigation.afterMit,
            varianceFactor: math.variance.varFactor, afterVariance: math.variance.afterVar,
            crit: math.crit.didCrit, final: math.result.final
          });
          this._applyDamage(target, math.result.final, skill);
          break;
        }
        case 'damage_roll': {
          const base = this._randInt(fx.min ?? 1, fx.max ?? 3);
          const scale = (fx.scaling?.atk ? (source.atk ?? 0) * (fx.scaling.atk || 0) : 0)
                      + (fx.scaling?.mag ? (source.mag ?? 0) * (fx.scaling.mag || 0) : 0);
          const raw = base + scale;
          this._currentTarget = target;
          const math = this._calcDamage(raw, target);
          this._currentTarget = null;
          this._dlogBlock(`${source.name} → ${target.name} | ${skill.name}`, {
            baseRoll: base, scale, raw,
            def: math.inputs.targetDef, vuln: math.inputs.vuln, K_DEF: math.inputs.K_DEF,
            mult: math.mitigation.mult, afterMit: math.mitigation.afterMit,
            varianceFactor: math.variance.varFactor, afterVariance: math.variance.afterVar,
            crit: math.crit.didCrit, final: math.result.final
          });
          this._applyDamage(target, math.result.final, skill);
          break;
        }
        case 'heal': {
          const amount = Math.max(1, Math.round(fx.amount ?? 5));
          this._healTarget(source === target ? source : target, amount, skill);
          break;
        }
        case 'buff': {
          this._applyBuff(source === target ? source : (fx.target === 'self' ? source : target),
                          fx.stat, fx.amount ?? 1, fx.duration ?? 1);
          break;
        }
        case 'shield': {
          this._applyShield(source === target ? source : (fx.target === 'self' ? source : target),
                            fx.amount ?? 5, fx.duration ?? 1);
          break;
        }
        case 'evasion': { // { amountPct, duration }
          const add = Number(fx.amountPct || 0);
          source._evasionPct = Math.max(0, (source._evasionPct || 0) + add);
          this._log(`${source.name} becomes evasive (+${add}% evasion).`);
          break;
        }
        case 'vuln': { // { amount, duration } → reduce DEF for mitigation
          const amt = Number(fx.amount || 0);
          target._vuln = Math.max(0, (target._vuln || 0) + amt);
          this._log(`${target.name} is exposed (-${amt} DEF).`);
          break;
        }
        case 'root': { this._log(`${target.name} is rooted in place.`); break; }
        case 'slow': { target.spd = Math.max(0, (target.spd ?? 0) - (fx.amount ?? 1)); this._log(`${target.name} is slowed.`); break; }
        case 'taunt': { this._log(`${source.name} taunts ${target.name}!`); break; }
        case 'dot': { this._log(`${target.name} suffers a lingering effect.`); break; }
        default: {
          this._log(`(effect ${fx.kind} not implemented)`);
        }
      }
      this.render();
      await this._sleep(10);
    }
  }

  // ===========================================================================
  // Math
  // ===========================================================================
  _evalFormula(expr, ctx) {
    try { return Function(...Object.keys(ctx), `return ${expr};`)(...Object.values(ctx)); }
    catch { return 0; }
  }

  _ctxFor(u) { return { atk: u.atk ?? 6, mag: u.mag ?? 6, def: u.def ?? 0, spd: u.spd ?? 0, level: u.level ?? 1 }; }

  _calcDamage(raw, target) {
    const baseDef = Number(target.def || 0);
    const vuln    = Number(target._vuln || 0);
    const defEff  = Math.max(0, baseDef - vuln);

    const k = this.K_DEF;
    const mult = k / (defEff + k);
    const afterMit = Math.max(0, raw * mult);

    const varFactor = this._rand(this.VARIANCE_MIN, this.VARIANCE_MAX);
    let afterVar = afterMit * varFactor;

    let didCrit = false;
    if (Math.random() < this.CRIT_CHANCE) { afterVar *= this.CRIT_MULT; didCrit = true; }

    const final = Math.max(1, Math.round(afterVar));

    return {
      inputs: { raw, targetDef: baseDef, vuln, K_DEF: k },
      mitigation: { mult, afterMit: Number(afterMit.toFixed(3)) },
      variance: { varFactor: Number(varFactor.toFixed(3)), afterVar: Number(afterVar.toFixed(3)) },
      crit: { didCrit, critMult: this.CRIT_MULT },
      result: { final }
    };
  }

  // ===========================================================================
  // Stat application
  // ===========================================================================
  _applyDamage(target, amount) {
    if (target._shield && target._shield > 0) {
      const absorbed = Math.min(target._shield, amount);
      target._shield -= absorbed;
      amount -= absorbed;
      if (absorbed > 0) this._log(`${target.name} absorbs ${absorbed} with a shield.`);
    }
    if (amount > 0) {
      const before = target.hp ?? 0;
      target.hp = Math.max(0, before - amount);
      const after = target.hp;
      this._log(`${target.name} takes ${amount} damage.`);
      this._dlogBlock(`HP change (${target.name})`, { before, amount, after, hpMax: target.hpMax ?? before });
    }
    this.render();
  }

  _healTarget(target, amount) {
    const before = target.hp ?? 0;
    const max = (target.hpMax ?? before);
    target.hp = Math.min(max, before + amount);
    const after = target.hp;
    this._log(`${target.name} recovers ${amount} HP.`);
    this._dlogBlock(`HP change (${target.name})`, { before, amount:-amount, after, hpMax: target.hpMax ?? before });
    this.render();
  }

  _applyBuff(target, stat, amount) {
    target[stat] = (target[stat] ?? 0) + (amount ?? 0);
    this._log(`${target.name}'s ${stat} ${(amount >= 0 ? 'rises' : 'drops')} by ${Math.abs(amount)}.`);
  }

  _applyShield(target, amount) {
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
