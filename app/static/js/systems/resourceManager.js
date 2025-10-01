// static/js/systems/resourceManager.js
export function initFromClass(classDef, player) {
  // classDef.resourceDefinitions is canonical place to declare pools
  // Example shape shown below in the schema section
  if (!classDef?.resourceDefinitions) return;

  player.resources = player.resources || {};
  for (const [key, def] of Object.entries(classDef.resourceDefinitions)) {
    // where does max come from?
    // priority: explicit def.max -> player stat key -> 0
    const maxFromStat = def.maxFromStat && player[def.maxFromStat] != null
      ? player[def.maxFromStat]
      : null;
    const max = def.max ?? maxFromStat ?? 0;

    // starting value
    let startVal = 0;
    if (def.start === 'full') startVal = max;
    else if (typeof def.start === 'number') startVal = Math.min(def.start, max);

    player.resources[key] = {
      label: def.label ?? key,
      current: startVal,
      max,
      regenPerTurn: def.regenPerTurn ?? 0,
      tiesToStat: def.maxFromStat || null,
    };
  }
}

export function syncCanonical(player) {
  // keep resources in sync with tied stats (e.g., mpMax)
  if (!player?.resources) return;
  for (const res of Object.values(player.resources)) {
    if (res.tiesToStat && player[res.tiesToStat] != null) {
      res.max = player[res.tiesToStat];
      res.current = Math.min(res.current, res.max);
    }
  }
}

export function canSpend(player, key, amount) {
  const r = player?.resources?.[key];
  return !!r && r.current >= amount;
}

export function spend(player, key, amount) {
  if (!canSpend(player, key, amount)) return false;
  player.resources[key].current -= amount;
  return true;
}

export function regenTurn(player) {
  if (!player?.resources) return;
  for (const r of Object.values(player.resources)) {
    if (r.regenPerTurn) {
      r.current = Math.min(r.max, r.current + r.regenPerTurn);
    }
  }
}
