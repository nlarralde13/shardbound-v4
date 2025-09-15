export class MapTab {
  constructor(store, sm){ this.store=store; this.sm=sm; }
  render(){
    const wrap=document.createElement('div');
    const p=document.createElement('div'); p.className='panel-card';
    p.innerHTML=`<div class="kv"><span>Current Scene</span><strong>${this.store.get().scene.name}</strong></div>
      <p style="color:#9aa3b2;margin-top:8px;">Upper viewer shows MapScene. Later: fast travel, markers, shard info.</p>`;
    const row=document.createElement('div'); row.className='button-row';
    const toMap=document.createElement('button'); toMap.className='btn'; toMap.textContent='Show Map'; toMap.onclick=()=>this.sm.switchTo('map');
    const toTown=document.createElement('button'); toTown.className='btn'; toTown.textContent='Enter Town'; toTown.onclick=()=>this.sm.switchTo('town',{name:'Oakford'});
    row.append(toMap,toTown); p.append(row); wrap.append(p); return wrap;
  }
}
