import { InventoryTab } from './tabs/InventoryTab.js';
import { CharacterTab } from './tabs/CharacterTab.js';
import { MapTab } from '../MapTab.js';
import { QuestsTab } from './tabs/QuestsTab.js';
import { SettingsTab } from './tabs/SettingsTab.js';

export function initTabs(store, sceneManager){
  const tabbar = document.getElementById('tabbar');
  const content = document.getElementById('tab-content');
  const tabs = {
    
    character: new CharacterTab(store, sceneManager),
    inventory: new InventoryTab(store, sceneManager),
    map:       new MapTab(store, sceneManager),
    quests:    new QuestsTab(store, sceneManager),
    settings:  new SettingsTab(store, sceneManager),
  };
  function renderTab(name){
    content.innerHTML=''; const view = tabs[name]?.render() ?? document.createTextNode('Unknown tab');
    content.appendChild(view);
    tabbar.querySelectorAll('.tab').forEach(btn=>{
      const active = btn.dataset.tab===name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }
  tabbar.addEventListener('click', e=>{
    const btn=e.target.closest('button[data-tab]'); if(!btn) return;
    renderTab(btn.dataset.tab);
  });
  renderTab('map');
}
