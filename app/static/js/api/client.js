export const API = {
  async getPlayerState(){ return { ok:true, data:{ name:'Adventurer', hp:30, hpMax:30, mp:10, mpMax:10, gold:25 } }; },
  async postBattleAction(action){
    const dmg = Math.floor(Math.random()*6)+3;
    return { ok:true, log:`You used ${action}. Dealt ${dmg} damage.` };
  }
};
