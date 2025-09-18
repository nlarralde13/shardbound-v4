// static/js/data/adapters.js
export function adaptClassCatalog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((cls) => ({
    id: cls.id || cls.name?.toLowerCase?.().replace(/\s+/g, '-') || cryptoRandomId(),
    name: cls.name || cls.id,
    baseStats: cls.baseStats || {},
    abilities: Array.isArray(cls.abilities)
      ? cls.abilities.map((a) => ({
          id: a.id || a.name?.toLowerCase?.().replace(/\s+/g, '-') || cryptoRandomId(),
          name: a.name,
          cost: a.cost ?? 0,
          resource: a.resource || 'mana',
          type: a.type,
          power: a.power,
        }))
      : [],
    resourceDefinitions: cls.resourceDefinitions || {},
  }));
}

export function adaptEnemy(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = raw.baseStats || {};
  const levelRange = Array.isArray(raw.levelRange) ? raw.levelRange : [];
  const level = Number(
    raw.level ?? levelRange[0] ?? 1
  );
  const hp = Number(raw.hp ?? base.hp ?? 20);
  const atk = Number(raw.atk ?? base.atk ?? 5);
  const mag = Number(raw.mag ?? base.mag ?? 0);
  const defStat = Number(base.def ?? raw.def ?? 0);
  const armor = Number(base.armor ?? raw.armor ?? 0);
  const spd = Number(raw.spd ?? base.spd ?? 3);

  const id = raw.id || raw.name?.toLowerCase?.().replace(/\s+/g, '-') || cryptoRandomId();
  return {
    id,
    name: raw.name || id,
    level,
    hp,
    hpMax: Number(raw.hpMax ?? base.hpMax ?? hp),
    atk,
    mag,
    def: defStat + armor,
    spd,
    armor,
    tags: Array.isArray(raw.tags) ? raw.tags.slice() : [],
    abilities: Array.isArray(raw.abilities)
      ? raw.abilities.map((a) => ({
          id: a.id || a.name?.toLowerCase?.().replace(/\s+/g, '-') || cryptoRandomId(),
          name: a.name,
          type: a.type,
          power: a.power,
          cost: a.cost ?? 0,
          resource: a.resource || null,
        }))
      : [],
    _raw: raw,
  };
}

function cryptoRandomId() {
  return 'id_' + Math.random().toString(36).slice(2, 10);
}
