import { Store } from '/static/js/state/store.js';
import { SceneManager } from '/static/js/sceneManager.js';
import { MapScene } from '/static/js/scenes/MapScene.js';
import { BattleScene } from '/static/js/scenes/BattleScene.js';
import { TownScene } from '/static/js/scenes/TownScene.js';
import { initTabs } from '/static/js/ui/tabs.js';


const store = new Store({
  player: { name:'Adventurer', hp:30, hpMax:30, mp:10, mpMax:10, gold:25,
            inventory:[{ id:'potion', name:'Health Potion', qty:2 }], equipment:{ head:null, chest:null, hands:null, legs:null, weapon:null } },
  scene: { name:'map', data:{} },
});

const canvas = document.getElementById('scene-canvas');
const overlay = document.getElementById('scene-overlay');

const sceneManager = new SceneManager(canvas, overlay, store);
sceneManager.register('map',    () => new MapScene(sceneManager, store));
sceneManager.register('battle', () => new BattleScene(sceneManager, store));
sceneManager.register('town',   () => new TownScene(sceneManager, store));
sceneManager.switchTo('map');

initTabs(store, sceneManager);

// Dev helpers: merge onto any existing helpers so other modules (like MapTab)
// can attach their own utilities without getting overwritten here.
window.sb = window.sb || {};
Object.assign(window.sb, {
  toMap:    () => sceneManager.switchTo('map'),
  toBattle: () => sceneManager.switchTo('battle', { enemy:'Slime' }),
  toTown:   () => sceneManager.switchTo('town', { name:'Oakford' }),
});
