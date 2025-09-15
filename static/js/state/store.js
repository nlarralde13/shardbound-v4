export class Store {
  constructor(initialState={}){ this.state=structuredClone(initialState); this.listeners=new Set(); }
  get(){ return this.state; }
  set(patch){ this.state={...this.state, ...patch}; this.emit(); }
  update(path, value){
    const segs = path.split('.'); let cur=this.state;
    for(let i=0;i<segs.length-1;i++){ const k=segs[i]; cur[k]=cur[k]??{}; cur=cur[k]; }
    cur[segs.at(-1)] = value; this.emit();
  }
  on(fn){ this.listeners.add(fn); return ()=>this.listeners.delete(fn); }
  emit(){ for(const fn of this.listeners) fn(this.state); }
}
