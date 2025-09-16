// exploration.js
// Lightweight exploration engine for early gameplay testing.
// Action: lookAround() -> one of {nothing, danger, resource} with weights.
// Includes detailed console.debug logs to trace selection and handlers.

import { loadEnemies, pickRandomEnemy } from "/static/js/data/enemyCatalog.js";

export function createExploration(sb) {
  const state = {
    cooldownMs: 2500,
    lastClickAt: 0,
    rig: null, // 'nothing' | 'danger' | 'resource' | null
  };

  const flavorNothing = [
    "You scan the terrain; only wind answers your curiosity.",
    "No tracks. No rustle. The shard holds its breath.",
    "You listen a while—quiet and honest: nothing here for now.",
    "A few leaves tumble past and fade into stillness.",
  ];

  const resourceDrops = [
    { id: "wood",  min: 1, max: 3, note: "fallen branches near the path" },
    { id: "ore",   min: 1, max: 2, note: "a shallow vein glinting in rock" },
    { id: "herbs", min: 2, max: 4, note: "aromatic sprigs underfoot" },
  ];

  function rollEncounter() {
    const enc = { id: "slime", level: 1, name: "Gloomslick Slime" };
    console.debug("[exploration] rollEncounter ->", enc);
    return enc;
  }

  const outcomes = [
    { key: "nothing",  weight: 55, run: doNothing },
    { key: "danger",   weight: 25, run: doDanger },
    { key: "resource", weight: 20, run: doResource },
  ];

  function weightedPick(list) {
    const sum = list.reduce((a, o) => a + o.weight, 0);
    let r = Math.random() * sum;
    console.debug("[exploration] weightedPick total:", sum, "roll:", r.toFixed(3));
    for (const o of list) {
      r -= o.weight;
      if (r <= 0) {
        console.debug("[exploration] weightedPick ->", o.key);
        return o;
      }
    }
    console.warn("[exploration] weightedPick fell through; returning last");
    return list[list.length - 1];
  }

  const rngInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

  function doNothing() {
    const line = flavorNothing[rngInt(0, flavorNothing.length - 1)];
    console.debug("[exploration] outcome: nothing ->", line);
    sb.ui?.say?.(`You look around… ${line}`);
  }


  //DANGER
  async function doDanger() {
    const catalog = await loadEnemies();
    const enemy = pickRandomEnemy(catalog);   // <-- random goblin mob
    console.log(enemy)
    sb.ui?.say?.(`Danger finds you! A wild ${enemy.name} appears!`);
    sb.toBattle?.(enemy);                      // hand it off to your battle scene
  }

  function doResource() {
    const drop = resourceDrops[rngInt(0, resourceDrops.length - 1)];
    const qty = rngInt(drop.min, drop.max);
    console.debug("[exploration] outcome: resource ->", { drop, qty });
    sb.inventory?.add?.(drop.id, qty, { source: "look_around" });
    const pretty = drop.id.charAt(0).toUpperCase() + drop.id.slice(1);
    sb.ui?.say?.(`You gather ${qty} × ${pretty} — ${drop.note}.`);
  }

  function lookAround() {
    const now = performance.now();
    const delta = now - state.lastClickAt;
    console.debug("[exploration] lookAround clicked; delta:", Math.round(delta), "ms");

    if (delta < state.cooldownMs) {
      const remaining = Math.ceil((state.cooldownMs - delta) / 1000);
      console.debug("[exploration] cooldown; remaining:", remaining, "s");
      sb.ui?.say?.(`You pause to catch your breath… (${remaining}s)`);
      return;
    }
    state.lastClickAt = now;

    const forced = state.rig && outcomes.find(o => o.key === state.rig);
    console.debug("[exploration] rig:", state.rig, "forced:", forced?.key);
    const pick = forced || weightedPick(outcomes);
    pick.run();
  }

  function rig(keyOrNull) {
    if (keyOrNull && !["nothing", "danger", "resource"].includes(keyOrNull)) {
      console.warn("[exploration] rig invalid:", keyOrNull);
      return;
    }
    state.rig = keyOrNull || null;
    console.debug("[exploration] rig set ->", state.rig);
  }

  return { lookAround, rig };
}
