export class SettingsTab {
  render(){
    const wrap=document.createElement('div');
    const p=document.createElement('div'); p.className='panel-card';
    p.innerHTML=`<strong>Settings</strong>
      <div class="kv"><span>Theme</span><button class="btn ghost" disabled>Dark</button></div>
      <div class="kv"><span>Text Speed</span><button class="btn ghost" disabled>Normal</button></div>`;
    wrap.append(p); return wrap;
  }
}
