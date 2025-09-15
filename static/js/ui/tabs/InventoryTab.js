export class InventoryTab {
  constructor(store, sceneManager){ this.store=store; this.sm=sceneManager; }
  render(){
    const wrap=document.createElement('div');
    const card=(title, body)=>{ const c=document.createElement('div'); c.className='panel-card';
      const h=document.createElement('div'); h.className='kv'; h.innerHTML=`<strong>${title}</strong>`; c.append(h, body); return c; };

    const invList=document.createElement('div');
    const inv=this.store.get().player.inventory;
    if(!inv.length){ invList.textContent='Inventory empty.'; }
    else{ for(const item of inv){ const row=document.createElement('div'); row.className='kv';
      row.innerHTML=`<span>${item.name}</span><span>x${item.qty}</span>`; invList.appendChild(row); } }

    const actions=document.createElement('div'); actions.className='button-row';
    const toBattle=document.createElement('button'); toBattle.className='btn primary'; toBattle.textContent='Start Test Battle';
    toBattle.onclick=()=>this.sm.switchTo('battle',{enemy:'Slime'}); actions.appendChild(toBattle);

    wrap.append(card('Inventory', invList), card('Actions', actions));
    return wrap;
  }
}
