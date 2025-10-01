// MapTab.js
// Renders the Map tab and its action buttons.
// Wires "Look Around" to a tiny exploration engine and exposes sb.explore for rigging.
// Logs each step so you can trace flow easily.

import { createExploration } from './ui/tabs/exploration.js';

export class MapTab {
  constructor(store, sm) {
    this.store = store;
    this.sm = sm;

    // Minimal adapters for exploration. Swap these with your real systems later.
    this.sb = {
      ui: {
        say: (text) => console.log("[scene]", text),
      },
      toBattle: (encounter) => {
        console.debug("[maptab] toBattle:", encounter);
        this.sm.switchTo("battle", { encounter });
      },
      inventory: {
        add: (itemId, qty, opts) =>
          console.debug("[maptab] inventory.add", { itemId, qty, opts }),
      },
    };

    // Create exploration and publish to window for rigging in console.
    this.explore = createExploration(this.sb);
    window.sb = window.sb || {};
    window.sb.explore = this.explore;
    console.debug("[maptab] exploration ready; try: sb.explore.rig('danger')");
  }

  render() {
    const wrap = document.createElement("div");

    const p = document.createElement("div");
    p.className = "panel-card";
    p.innerHTML = `
      <div class="kv">
        <span>Current Scene</span>
        <strong>${this.store.get().scene.name}</strong>
      </div>
      <p style="color:#9aa3b2;margin-top:8px;">
        Upper viewer shows MapScene. Later: fast travel, markers, shard info.
      </p>
    `;

    const row = document.createElement("div");
    row.className = "button-row";

    // Show Map
    const toMap = document.createElement("button");
    toMap.className = "btn";
    toMap.textContent = "Show Map";
    toMap.onclick = () => {
      console.debug("[maptab] Show Map clicked");
      this.sm.switchTo("map");
    };

    // Enter Town
    const toTown = document.createElement("button");
    toTown.className = "btn";
    toTown.textContent = "Enter Town";
    toTown.onclick = () => {
      console.debug("[maptab] Enter Town clicked");
      this.sm.switchTo("town", { name: "Oakford" });
    };

    // Look Around — NEW
    const lookAround = document.createElement("button");
    lookAround.className = "btn"; // (fixes 'classname' typo)
    lookAround.textContent = "Look Around";
    lookAround.onclick = () => {
      console.debug("[maptab] Look Around clicked");
      this.explore.lookAround();
    };

    row.append(toMap, toTown, lookAround);
    p.append(row);
    wrap.append(p);
    return wrap;
  }
}
