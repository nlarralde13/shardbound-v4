export class QuestsTab {
  render(){
    const wrap=document.createElement('div');
    const p=document.createElement('div'); p.className='panel-card';
    p.innerHTML=`<strong>Quests</strong><p style="color:#9aa3b2">Quest log will list active and completed quests.</p>`;
    wrap.append(p); return wrap;
  }
}
