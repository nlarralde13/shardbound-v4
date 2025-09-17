# Shardbound V4 – Developer Overview

## High-level architecture
- **Backend shell (`app.py`)** – Minimal Flask application that serves the base SPA shell (`/index`) and the combat sandbox (`/battlebox`). There are no API routes today, just template rendering for the front-end bundles. 【F:app.py†L1-L18】
- **Templates (`/templates`)** – HTML entry points. `index.html` hosts the main map/town/battle client, while `battlebox.html` hosts a self-contained combat sandbox for rapid iteration. 【F:templates/index.html†L1-L31】【F:templates/battlebox.html†L1-L60】
- **Static assets (`/static`)** – Front-end source. JavaScript is written as ES modules that the templates import directly; CSS lives under `static/css/app.css`; JSON data catalogs live under `static/catalog`. 【F:tree.txt†L1-L32】

## Front-end runtime modules
### Application bootstrap
- **`static/js/app.js`** – Entry point that instantiates the global `Store`, wires the `SceneManager`, registers the three primary scenes (map, battle, town), and activates the lower tab strip. It also exposes helper functions on `window.sb` for manual scene switching. 【F:static/js/app.js†L3-L48】
- **`static/js/state/store.js`** – A tiny observable store implementation that supports whole-object updates (`set`), deep key updates (`update`), and listener subscription. All scenes and tabs read/write through this. 【F:static/js/state/store.js†L1-L12】

### Scene system
- **`static/js/sceneManager.js`** – Maintains the current scene instance, handles canvas resizing, runs the animation loop, and owns the overlay layer used by scenes for HUD/UI injections. 【F:static/js/sceneManager.js†L1-L31】
- **Scenes (`static/js/scenes/`)**
  - `MapScene.js` renders a simple grid background and pulsating waypoint for overworld navigation. 【F:static/js/scenes/MapScene.js†L1-L16】
  - `BattleScene.js` contains the full prototype combat implementation, including UI construction, kit loading from class catalogs, combat math, and effect resolution. 【F:static/js/scenes/BattleScene.js†L1-L571】
  - `TownScene.js` is a placeholder for future social/economy interactions (simple render stub today). 【F:static/js/scenes/TownScene.js†L1-L12】

### UI tabs & exploration
- **`static/js/ui/tabs.js`** – Bootstraps the lower tab strip, instantiating each tab module and swapping their rendered content into the shared pane. 【F:static/js/ui/tabs.js†L1-L31】
- **`static/js/ui/tabs/*`** – Individual tab implementations. `CharacterTab`, `InventoryTab`, `QuestsTab`, and `SettingsTab` each expose a `render()` returning DOM nodes. `exploration.js` exports a mini exploration state machine consumed by `MapTab`. 【F:static/js/ui/tabs/CharacterTab.js†L1-L155】
- **`static/js/MapTab.js`** – Bridges tab interactions with scene transitions and the exploration helper. It publishes `sb.explore` for quick console-driven testing. 【F:static/js/MapTab.js†L1-L63】

### Data access helpers
- **`static/js/data/classLoader.js`** – Fetches per-class JSON catalogs and exposes `skillsAvailableAtLevel` to filter unlocks based on player level. 【F:static/js/data/classLoader.js†L1-L12】
- **`static/js/data/enemyCatalog.js`** – Utilities for working with `static/catalog/enemies.json` (enemy definitions, AI hints). 【F:static/js/data/enemyCatalog.js†L1-L17】

### Combat sandbox
- **Template (`templates/battlebox.html`)** wires picker panels for classes and enemies, hosts the scene canvas, and exposes a K_DEF tuning slider. 【F:templates/battlebox.html†L1-L60】
- **`static/js/sandbox/battleSandbox.js`** drives the sandbox UI: loads class/enemy indices, captures user selections, spins up a `BattleScene` instance with a minimal scene manager, and seeds a temporary store containing the generated player/enemy state. 【F:static/js/sandbox/battleSandbox.js†L1-L140】

### Data catalogs
- **Class catalogs (`static/catalog/classes/*.json`)** define class metadata, base stats, progression, resource names, and skill definitions (including costs/effects). Mage skills consume `mana`; rogue skills consume `energy`. 【F:static/catalog/classes/mage.json†L1-L43】【F:static/catalog/classes/rogue.json†L1-L40】
- **Enemy catalog (`static/catalog/enemies.json`)** supplies raw enemy data consumed by the sandbox adapter. 【F:static/catalog/enemies.json†L1-L200】

## Combat system observations
1. **BattleScene cost resolution expects per-resource pools on the player record.** When a skill declares `cost`, `useSkill` checks `player.resources[resourceName]` before allowing activation. 【F:static/js/scenes/BattleScene.js†L292-L319】
2. **Neither the main client nor the sandbox seeds those resource pools.** `app.js` constructs the default player without a `resources` object, and the sandbox explicitly initialises `resources: {}`. Consequently, mage `mana` and rogue `energy` costs always read as zero available, blocking their class skills. 【F:static/js/app.js†L18-L28】【F:static/js/sandbox/battleSandbox.js†L116-L126】
3. **Class catalogs advertise the intended resources, but there is no mapping layer from `class.class.resources` to runtime values (`mp`, `energy`, etc.).** 【F:static/catalog/classes/mage.json†L3-L38】【F:static/catalog/classes/rogue.json†L3-L38】

### Recommendation to restore resource-based abilities
- When loading a class catalog, derive starting resource pools from the catalog (e.g., `player.resources.mana = player.mpMax` or a configurable default) and keep them in sync with any canonical stats like `mp`. A simple fix could live in `BattleScene.onEnter` after `this.player` is bound, ensuring `player.resources` mirrors known stat pools before rendering the action bar.
- Consider introducing a canonical resource schema (e.g., `resourceDefinitions` in the class JSON) and a helper that projects those definitions onto the player state in both the main app bootstrap and sandbox generator. That avoids duplicating manual wiring and keeps future classes consistent.

## Refactor opportunities
1. **Centralise resource handling.** Move the resource initialisation/check/spend logic into a dedicated module (e.g., `resourceManager.js`) that scenes and sandboxes can share. This prevents missing wiring and clarifies how `mp`, `mana`, `energy`, or future gauges stay in sync. 【F:static/js/scenes/BattleScene.js†L292-L319】【F:static/js/sandbox/battleSandbox.js†L116-L126】
2. **Split BattleScene UI construction from combat logic.** The current class owns both DOM building and core combat math. Extracting UI helpers into a view component (or templated functions) would make it easier to test combat math independently and reuse UI in other contexts (e.g., multiplayer spectating). 【F:static/js/scenes/BattleScene.js†L120-L399】
3. **Normalise data adapters.** `battleSandbox.js` rebuilds enemy payloads manually. Consider formal adapter utilities inside `static/js/data/` (e.g., `adaptClassCatalog`, `adaptEnemy`) to keep the sandbox and eventual game client aligned. 【F:static/js/sandbox/battleSandbox.js†L32-L136】
4. **Adopt consistent module boundaries for tabs and scenes.** Some UI modules live in `static/js/` (e.g., `MapTab`) while others are nested (`static/js/ui/tabs/*`). Consolidating tab modules under a single directory or exporting them via an index can simplify imports and clarify ownership. 【F:static/js/app.js†L3-L8】【F:static/js/ui/tabs.js†L1-L17】

By wiring resource pools during class load and tightening these module boundaries, mage and rogue specials will function, and future combat iterations will have clearer extension points.
