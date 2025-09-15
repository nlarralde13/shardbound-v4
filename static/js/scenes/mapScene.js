export class MapScene {
  constructor(manager, store){ this.m=manager; this.store=store; this.t=0; this.cam={x:0,y:0,zoom:1}; }
  setup(){} update(t){ this.t=t; }
  render(ctx){
    const { width:w, height:h } = ctx.canvas;
    ctx.clearRect(0,0,w,h); ctx.fillStyle='#0a0d12'; ctx.fillRect(0,0,w,h);
    const tile = Math.floor(24 * (window.devicePixelRatio||1) * this.cam.zoom);
    ctx.strokeStyle='rgba(92,200,255,0.15)'; ctx.lineWidth=1;
    for(let x=0; x<w; x+=tile){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for(let y=0; y<h; y+=tile){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    const cx=Math.floor(w/2), cy=Math.floor(h/2); const pulse=6+Math.sin(this.t/400)*3;
    ctx.fillStyle='#5cc8ff'; ctx.beginPath(); ctx.arc(cx,cy,pulse,0,Math.PI*2); ctx.fill();
    this.m.drawText('MapScene — run sb.toBattle() to test combat', 12, 28, '#9aa3b2', 14);
  }
  teardown(){}
}
