// combatManager.js
// Baseline, framework-agnostic combat module for Shardbound/ProjectMMO
// -------------------------------------------------------------------
// What this gives you out of the box:
// - Accuracy check: d100 vs (BaseHit + AttackerAccuracy - DefenderEvasion)
// - Physical and Magic damage tracks
// - Elemental modifiers layered on top (e.g., fire, frost)
// - Minimum 1 damage on successful hits (no brick walls)
// - Clean, serializable combat result objects for your UI (no noisy math spam)
// - Optional dev diagnostics flag to return granular math without console logging
//
// Integration notes:
// - BattleScene (or any system) should import and call CombatManager.resolveAttack(...)
// - You can pass plain actor objects (player, enemy) as long as they expose the expected fields
// - If your catalogs differ, provide a normalize function in options (see normalizeActor option)
// - No side effects: this module does NOT mutate HP —
//   Your caller should apply result.totalDamage to the defender's HP pool.

// -------------------------------------------------------------------
// Configuration defaults (tune here or override per-call)
// -------------------------------------------------------------------
export const CombatDefaults = {
  baseHitChance: 70, // percent
  rng: Math.random,  // injectable RNG for determinism in tests
  // Known elements; extend as needed (lightning, poison, holy, shadow, etc.)
  elements: ["fire", "frost", "lightning", "poison"],
};

// -------------------------------------------------------------------
// Utility: clamp helper
// -------------------------------------------------------------------
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// -------------------------------------------------------------------
// Utility: roll d100 using injectable RNG
// -------------------------------------------------------------------
function rollD100(rng = CombatDefaults.rng) {
  // Returns integer in [1..100]
  return Math.floor(rng() * 100) + 1;
}

// -------------------------------------------------------------------
// Type guards / safe getters with tolerant fallbacks
// -------------------------------------------------------------------
function getNumber(obj, path, fallback = 0) {
  try {
    const parts = Array.isArray(path) ? path : String(path).split(".");
    let v = obj;
    for (const p of parts) v = v?.[p];
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function getPercent(obj, path, fallback = 0) {
  // expects 0..100; clamps to that
  return clamp(getNumber(obj, path, fallback), 0, 100);
}

// -------------------------------------------------------------------
// Normalizers: adapt arbitrary catalog actors to the fields we need
// -------------------------------------------------------------------
// You can pass a custom normalizeActor in options to override this.
function defaultNormalizeActor(actor) {
  // Expected fields (after normalization):
  // accuracy, evasion, atk, def, magAtk, magRes, resources.mp (optional),
  // elementalRes: { fire, frost, lightning, poison } each 0..100 (percent)
  return {
    name: actor?.name ?? "Unknown",
    // Accuracy/Evasion can come from DEX/AGI or weapon skill; use sensible fallbacks
    accuracy: getNumber(actor, ["stats", "ACC"], getNumber(actor, ["stats", "DEX"], 0)),
    evasion: getNumber(actor, ["stats", "EVA"], getNumber(actor, ["stats", "DEX"], 0)),
    atk: getNumber(actor, ["stats", "ATK"], getNumber(actor, ["stats", "STR"], 0)),
    def: getNumber(actor, ["stats", "DEF"], getNumber(actor, ["stats", "ARMOR"], 0)),
    magAtk: getNumber(actor, ["stats", "MAG"], getNumber(actor, ["stats", "INT"], 0)),
    magRes: getNumber(actor, ["stats", "MRES"], getNumber(actor, ["stats", "WIS"], 0)),
    resources: {
      mp: getNumber(actor, ["resources", "mp"], getNumber(actor, ["stats", "MP"], 0)),
    },
    elementalRes: {
      fire: getPercent(actor, ["resist", "fire"], 0),
      frost: getPercent(actor, ["resist", "frost"], 0),
      lightning: getPercent(actor, ["resist", "lightning"], 0),
      poison: getPercent(actor, ["resist", "poison"], 0),
    },
    // Carry raw for logging/reference
    _raw: actor,
  };
}

// -------------------------------------------------------------------
// Ability / attack payload shape
// -------------------------------------------------------------------
// A basic weapon swing or spell can be represented as an Ability:
// {
//   name: "Slash" | "Fire Bolt",
//   type: "physical" | "magic",
//   base: number,               // weapon base or spell base power
//   variance?: number,          // optional ±variance% to base before stats (e.g., 10 => ±10%)
//   accuracyBonus?: number,     // flat addition to hit chance calc
//   powerBonus?: number,        // flat addition to raw damage before defenses
//   element?: "fire" | "frost" | ... (optional; applies elemental resistance layer)
//   mpCost?: number,            // optional resource cost for spells/skills
// }

// -------------------------------------------------------------------
// Core: compute hit chance and roll
// -------------------------------------------------------------------
function computeHit(attacker, defender, ability, config) {
  const base = getNumber(config, "baseHitChance", CombatDefaults.baseHitChance);
  const acc = getNumber(attacker, "accuracy", 0);
  const eva = getNumber(defender, "evasion", 0);
  const accBonus = getNumber(ability, "accuracyBonus", 0);
  const chance = clamp(base + acc + accBonus - eva, 5, 95); // hard floors/ceilings
  const roll = rollD100(config?.rng ?? CombatDefaults.rng);
  const hit = roll <= chance;
  return { hit, roll, chance };
}

// -------------------------------------------------------------------
// Core: compute damage (no HP mutation here)
// -------------------------------------------------------------------
function computeDamage(attacker, defender, ability) {
  const type = ability.type === "magic" ? "magic" : "physical";
  const base = getNumber(ability, "base", 0);
  const variancePct = clamp(getNumber(ability, "variance", 0), 0, 100);
  const powerBonus = getNumber(ability, "powerBonus", 0);

  // Apply variance to base first, if any
  let variedBase = base;
  if (variancePct > 0) {
    const span = (variancePct / 100) * base;
    // random in [-span, +span]
    const r = (CombatDefaults.rng() * 2 - 1) * span;
    variedBase = base + r;
  }

  let raw;
  if (type === "physical") {
    const atk = getNumber(attacker, "atk", 0);
    const def = getNumber(defender, "def", 0);
    raw = variedBase + atk + powerBonus - def;
  } else {
    const magAtk = getNumber(attacker, "magAtk", 0);
    const magRes = getNumber(defender, "magRes", 0);
    raw = variedBase + magAtk + powerBonus - magRes;
  }

  // Elemental layer (percentage reduction per matching element)
  const element = ability.element;
  let afterElement = raw;
  if (element) {
    const resistPct = getPercent(defender, ["elementalRes", element], 0);
    const multiplier = 1 - resistPct / 100;
    afterElement = raw * multiplier;
  }

  const finalDamage = Math.max(1, Math.round(afterElement));
  return {
    type,
    base,
    variedBase: Math.round(variedBase),
    powerBonus,
    raw: Math.round(raw),
    element: element || null,
    elementalReduced: element ? Math.round(afterElement) : null,
    total: finalDamage,
  };
}

// -------------------------------------------------------------------
// Public API: resolveAttack
// -------------------------------------------------------------------
// Returns a serializable combat result object for UI rendering & logs.
export function resolveAttack({
  attacker,
  defender,
  ability,  // see shape above
  options = {},
}) {
  const cfg = {
    baseHitChance: options.baseHitChance ?? CombatDefaults.baseHitChance,
    rng: options.rng ?? CombatDefaults.rng,
    normalizeActor: options.normalizeActor || defaultNormalizeActor,
    devDiagnostics: options.devDiagnostics === true,
  };

  const atk = cfg.normalizeActor(attacker);
  const def = cfg.normalizeActor(defender);

  // Check resources (e.g., MP) but do not mutate
  const mpCost = getNumber(ability, "mpCost", 0);
  const hasMP = getNumber(atk, ["resources", "mp"], 0) >= mpCost;
  if (!hasMP) {
    return {
      ok: false,
      reason: "INSUFFICIENT_RESOURCE",
      detail: { resource: "mp", required: mpCost },
    };
  }

  const hitInfo = computeHit(atk, def, ability, cfg);
  if (!hitInfo.hit) {
    return {
      ok: true,
      hit: false,
      totals: { damage: 0 },
      attacker: { name: atk.name },
      defender: { name: def.name },
      ability: { name: ability.name, type: ability.type, element: ability.element || null },
      diagnostics: cfg.devDiagnostics ? { hitInfo } : undefined,
      events: [
        { type: "attack", result: "miss", roll: hitInfo.roll, chance: hitInfo.chance },
      ],
    };
  }

  const dmgInfo = computeDamage(atk, def, ability);

  return {
    ok: true,
    hit: true,
    totals: { damage: dmgInfo.total },
    attacker: { name: atk.name },
    defender: { name: def.name },
    ability: { name: ability.name, type: ability.type, element: ability.element || null },
    diagnostics: cfg.devDiagnostics ? { hitInfo, dmgInfo, atk, def, ability } : undefined,
    events: [
      { type: "attack", result: "hit", roll: hitInfo.roll, chance: hitInfo.chance },
      { type: "damage", amount: dmgInfo.total, track: dmgInfo.type, element: dmgInfo.element },
    ],
  };
}

// -------------------------------------------------------------------
// Convenience: high-level helpers you can use in BattleScene
// -------------------------------------------------------------------
export const CombatManager = {
  resolveAttack,
  // Create a basic physical swing from a weapon template
  basicSwing(weaponName = "Basic Swing", base = 3, variance = 10) {
    return { name: weaponName, type: "physical", base, variance };
  },
  // Create a basic magic bolt
  magicBolt(spellName = "Magic Bolt", base = 5, variance = 5, element = null, mpCost = 2) {
    return { name: spellName, type: "magic", base, variance, element, mpCost };
  },
};

// -------------------------------------------------------------------
// Example adapter: plug in your class/enemy catalogs if their shapes differ
// -------------------------------------------------------------------
// Usage:
//   resolveAttack({ attacker: player, defender: enemy, ability, options: { normalizeActor: fromCatalog } })
export function fromCatalog(actor) {
  // Try several common layouts found in prior project branches
  const name = actor?.name || actor?.className || actor?.id || "Unknown";
  const stats = actor?.stats || actor?.baseStats || actor?.attributes || {};
  const resist = actor?.resist || actor?.resistances || {};
  const resources = actor?.resources || actor?.pools || {};
  return {
    name,
    accuracy: stats.ACC ?? stats.DEX ?? 0,
    evasion: stats.EVA ?? stats.DEX ?? 0,
    atk: stats.ATK ?? stats.STR ?? 0,
    def: stats.DEF ?? stats.ARMOR ?? 0,
    magAtk: stats.MAG ?? stats.INT ?? 0,
    magRes: stats.MRES ?? stats.WIS ?? 0,
    resources: { mp: resources.mp ?? stats.MP ?? 0 },
    elementalRes: {
      fire: resist.fire ?? 0,
      frost: resist.frost ?? 0,
      lightning: resist.lightning ?? 0,
      poison: resist.poison ?? 0,
    },
    _raw: actor,
  };
}

// -------------------------------------------------------------------
// Optional: tiny deterministic RNG for tests (seeded)
// -------------------------------------------------------------------
export function seededRng(seed = 123456789) {
  // Mulberry32
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// -------------------------------------------------------------------
// Lightweight self-test (can be removed in production)
// -------------------------------------------------------------------
export function _selfTest() {
  const rng = seededRng(42);
  const player = {
    name: "Warrior",
    stats: { ACC: 10, ATK: 8, DEF: 3, MAG: 0, MRES: 1, DEX: 6 },
    resist: { fire: 10 },
    resources: { mp: 5 },
  };
  const goblin = {
    name: "Goblin Thug",
    stats: { EVA: 5, DEF: 2, ATK: 5, MRES: 0, MAG: 0, DEX: 4 },
    resist: { fire: 0 },
    resources: { mp: 0 },
  };

  const swing = CombatManager.basicSwing("Rusty Blade", 4, 10);
  const bolt = CombatManager.magicBolt("Fire Bolt", 6, 0, "fire", 2);

  const r1 = resolveAttack({ attacker: player, defender: goblin, ability: swing, options: { rng, normalizeActor: fromCatalog, devDiagnostics: true } });
  const r2 = resolveAttack({ attacker: player, defender: goblin, ability: bolt, options: { rng, normalizeActor: fromCatalog, devDiagnostics: true } });
  return { r1, r2 };
}
