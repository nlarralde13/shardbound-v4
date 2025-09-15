export class SceneManager {
  constructor(canvas, overlayEl, store){
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.overlayEl = overlayEl; this.store = store; this.registry = new Map(); this.current=null;

    const loop = (t) => { this.current?.update?.(t); this.current?.render?.(this.ctx); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
    };
    resize(); window.addEventListener('resize', resize);
  }
  register(name, factory){ this.registry.set(name, factory); }
  switchTo(name, data={}){
    if(!this.registry.has(name)) throw new Error(`Scene ${name} not registered`);
    this.current?.teardown?.();
    this.overlayEl.classList.remove('interactive');
    this.overlayEl.replaceChildren();
    this.current = this.registry.get(name)();
    this.current?.setup?.(data);
    this.store.update('scene', { name, data });
  }
  drawText(text, x, y, color='#e6e8ed', size=16){
    const dpr = window.devicePixelRatio || 1;
    this.ctx.save(); this.ctx.scale(dpr,dpr);
    this.ctx.fillStyle=color; this.ctx.font=`600 ${size}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    this.ctx.fillText(text, x, y); this.ctx.restore();
  }
}
