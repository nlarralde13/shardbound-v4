import { API } from '../api/client.js';

export class BattleScene {
  constructor(manager, store){
    this.m=manager; this.store=store; this.t=0;
    this.log=['A wild Slime appears!']; this.enemy={ name:'Slime', hp:20, hpMax:20 };
    this.buttons=null;
  }
  setup(data){
    if(data?.enemy) this.enemy.name=data.enemy;
    const row=document.createElement('div');
    row.className='button-row'; Object.assign(row.style,{position:'absolute',left:'12px',right:'12px',bottom:'12px',pointerEvents:'auto'});
    const mk=(label,action)=>{ const b=document.createElement('button'); b.className='btn primary'; b.textContent=label; b.onclick=()=>this.takeAction(action); return b; };
    row.append(mk('Attack','attack'), mk('Skill','skill'), mk('Item','item'), mk('Flee','flee'));
    this.buttons=row; this.m.overlayEl.appendChild(row);
    this.m.overlayEl.classList.add('interactive');
  }
  async takeAction(action){
    const res=await API.postBattleAction(action);
    if(res.ok){
      this.log.push(res.log);
      this.enemy.hp=Math.max(0,this.enemy.hp-Math.floor(Math.random()*6+3));
      if(this.enemy.hp===0){
        this.log.push('Enemy defeated! +5 gold');
        const s=this.store.get(); this.store.update('player.gold', s.player.gold+5);
        setTimeout(()=>this.m.switchTo('map'), 600);
      }
    }
  }
  update(t){ this.t=t; }
  render(ctx){
    const { width:w, height:h }=ctx.canvas; ctx.clearRect(0,0,w,h);
    const grd=ctx.createLinearGradient(0,0,0,h); grd.addColorStop(0,'#0d1016'); grd.addColorStop(1,'#121726');
    ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
    this.drawBar(ctx,24,24,220,14,'You',this.store.get().player.hp,this.store.get().player.hpMax);
    this.drawBar(ctx,w-244,24,220,14,this.enemy.name,this.enemy.hp,this.enemy.hpMax,true);
    ctx.fillStyle='#b392f0'; ctx.beginPath(); ctx.arc(120, Math.floor(h*0.55), 28, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#5cc8ff'; ctx.beginPath(); ctx.arc(w-120, Math.floor(h*0.55), 28, 0, Math.PI*2); ctx.fill();
    this.m.drawText('Battle Log:', 24, h-110, '#9aa3b2', 14);
    const startY=h-90; this.log.slice(-4).forEach((line,i)=>this.m.drawText(line,24,startY+i*18,'#e6e8ed',14));
  }
  drawBar(ctx,x,y,w,h,label,v,vmax,right=false){
    ctx.fillStyle='#0a0d12'; ctx.fillRect(x,y,w,h);
    const pct=Math.max(0,Math.min(1,v/vmax)); ctx.fillStyle='#5cc8ff'; ctx.fillRect(x,y,Math.floor(w*pct),h);
    const tx=right?x+w-2:x+2; this.m.drawText(`${label} ${v}/${vmax}`, tx, y-6, '#e6e8ed', 12);
  }
  teardown(){
    if(this.buttons?.parentElement) this.buttons.parentElement.removeChild(this.buttons);
    this.m.overlayEl.classList.remove('interactive');
  }
}
