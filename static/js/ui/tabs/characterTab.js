export class CharacterTab {
  constructor(store){ this.store=store; }
  render(){
    const wrap=document.createElement('div'), s=this.store.get();
    const kv=(k,v)=>{ const row=document.createElement('div'); row.className='kv';
      row.innerHTML=`<span>${k}</span><strong>${v}</strong>`; return row; };
    const card=document.createElement('div'); card.className='panel-card';
    card.append(kv('Name', s.player.name), kv('HP', `${s.player.hp}/${s.player.hpMax}`),
                kv('MP', `${s.player.mp}/${s.player.mpMax}`), kv('Gold', s.player.gold));
    wrap.append(card); return wrap;
  }
}
