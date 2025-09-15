export class TownScene {
  constructor(manager, store){ this.m=manager; this.store=store; this.t=0; this.name='Town'; }
  setup(data){ this.name = data?.name || 'Town'; }
  update(t){ this.t=t; }
  render(ctx){
    const { width:w, height:h }=ctx.canvas;
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#101520'; ctx.fillRect(0,0,w,h);
    this.m.drawText(`${this.name} — WIP`, 18, 28, '#9aa3b2', 14);
    this.m.drawText('Shops, NPCs, crafting, social hub…', 18, 48, '#e6e8ed', 14);
  }
  teardown(){}
}
