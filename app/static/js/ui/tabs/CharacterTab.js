// CharacterTab.js
// Shows basic character info (Name, HP/MP, Gold) and now Class + Level.
// On first render, defaults class/level if missing (warrior / 1) and
// loads the class catalog to apply a "starter" pack (gold + starter inventory).
//
// Expected catalog shape (per-class JSON):
// {
//   "class": { "id": "warrior", "name": "Warrior", ... },
//   "starter": {
//     "gold": 25,
//     "inventory": [
//       { "id": "potion", "name": "Health Potion", "qty": 2 },
//       { "id": "wood", "qty": 5 }
//     ]
//   },
//   "skills": { ... }
// }
//
// Notes:
// - Starter pack is applied once per session via flag: player._starterApplied.
// - Inventory merge is additive by item id (name optional in catalog).
// - Requires loader: /static/js/data/classLoader.js (loadClassCatalog)

import { loadClassCatalog } from "/static/js/data/classLoader.js";

export class CharacterTab {
  constructor(store) {
    this.store = store;
    this._root = null;
  }

  // Merge starter inventory into player's inventory (by id)
  _applyStarterInventory(player, starterInv = []) {
    if (!Array.isArray(starterInv) || starterInv.length === 0) return;
    player.inventory = player.inventory || [];

    for (const item of starterInv) {
      if (!item || !item.id) continue;
      const qty = Number(item.qty || 1);
      const existing = player.inventory.find((it) => it.id === item.id);
      if (existing) {
        existing.qty = (existing.qty || 0) + qty;
        // Keep existing name unless catalog provides one
        if (item.name && !existing.name) existing.name = item.name;
      } else {
        player.inventory.push({
          id: item.id,
          name: item.name || item.id, // fallback to id if name unspecified
          qty,
        });
      }
    }
  }

  async _ensureDefaultsAndStarter() {
    const s = this.store.get();
    const p = s.player;
    
    // Default class/level if missing
    if (!p.classId) p.classId = "warrior";
    if (!p.level) p.level = 1;

    try {
      const catalog = await loadClassCatalog(p.classId.toLowerCase());
      const starter = catalog.starter || {};
      const base = catalog.class?.baseStats;

      if (base) {
        //set current + max so refresh reflects the catalog
        const clamp = (n) => Math.max(0, Number(n || 0));
        const hp = clamp(base.hp), mp = clamp(base.mp)

        p.hpMax = hp; p.hp = hp;
        p.mpMax = mp; p.mp =mp;

        p.atk = clamp(base.atk);
        p.mag = clamp(base.mag);
        p.def = clamp(base.def);
        p.spd = clamp(base.spd);
      }


      // Gold: set to starter value (do not add/stack)
      if (typeof starter.gold === "number") {
        p.gold = starter.gold;
      }

      // Inventory: replace with starter inventory (normalize names/qty)
      const starterInv = Array.isArray(starter.inventory) ? starter.inventory : [];
      p.inventory = starterInv.map(it => ({
        id: it.id,
        name: it.name || it.id,
        qty: Number(it.qty || 1),
      }));
    } catch (err) {
      console.warn("[CharacterTab] Could not load class catalog:", p.classId, err);
      // If catalog fails, leave current gold/inventory as-is
    }
  }


  _renderContent(container) {
    const s = this.store.get();
    const p = s.player;

    const kv = (k, v) => {
      const row = document.createElement("div");
      row.className = "kv";
      row.innerHTML = `<span>${k}</span><strong>${v}</strong>`;
      return row;
    };

    container.innerHTML = ""; // clear previous

    const card = document.createElement("div");
    card.className = "panel-card";

    const className =
      (p.classId && (p.classId.charAt(0).toUpperCase() + p.classId.slice(1))) ||
      "Warrior";

    card.append(
      kv("Name", p.name || className),
      kv("Class", className),
      kv("Level", p.level || 1),
      kv("HP", `${p.hp}/${p.hpMax}`),
      kv("MP", `${p.mp}/${p.mpMax}`),
      kv("Gold", p.gold),

      kv("ATK", p.atk ?? 0),
      kv("MAG", p.mag ?? 0),
      kv("DEF", p.def ?? 0),
      kv("SPD", p.spd ?? 0)
        );

    container.append(card);
  }

  render() {
    // Build wrapper
    const wrap = document.createElement("div");
    this._root = wrap;

    // Initial (possibly pre-starter) paint
    this._renderContent(wrap);

    // Apply defaults + starter asynchronously, then refresh UI
    this._ensureDefaultsAndStarter().then(() => {
      // Repaint with updated gold/inventory/class if anything changed
      if (this._root) this._renderContent(this._root);
    });

    return wrap;
  }
}
