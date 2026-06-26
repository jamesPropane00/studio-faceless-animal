// CombatEquipment — combat equipment definitions.
// Foundation: weapon/armor types with stats for combat encounters.

const EQUIPMENT_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary']

const EQUIPMENT_TEMPLATES = {
  rusty_sword: { name: 'Rusty Sword', type: 'weapon', tier: 'common', atk: 3, def: 0 },
  wooden_shield: { name: 'Wooden Shield', type: 'armor', tier: 'common', atk: 0, def: 2 },
  fine_blade: { name: 'Fine Blade', type: 'weapon', tier: 'uncommon', atk: 6, def: 0 },
  chainmail: { name: 'Chainmail', type: 'armor', tier: 'uncommon', atk: 0, def: 5 },
  shadow_dagger: { name: 'Shadow Dagger', type: 'weapon', tier: 'rare', atk: 10, def: 0 },
  crystal_shield: { name: 'Crystal Shield', type: 'armor', tier: 'rare', atk: 0, def: 8 },
  ember_blade: { name: 'Ember Blade', type: 'weapon', tier: 'epic', atk: 15, def: 2 },
  moon_armor: { name: 'Moon Armor', type: 'armor', tier: 'epic', atk: 3, def: 14 },
  starfall_sword: { name: 'Starfall Sword', type: 'weapon', tier: 'legendary', atk: 25, def: 5 },
  void_plate: { name: 'Void Plate', type: 'armor', tier: 'legendary', atk: 5, def: 22 }
}

class CombatEquipmentManager {
  get(id) { return EQUIPMENT_TEMPLATES[id] || null }
  getAll() { return Object.entries(EQUIPMENT_TEMPLATES).map(([id, e]) => ({ id, ...e })) }
  getByTier(tier) { return this.getAll().filter(e => e.tier === tier) }
  getByType(type) { return this.getAll().filter(e => e.type === type) }
}

const combatEquipment = new CombatEquipmentManager()
export { combatEquipment, CombatEquipmentManager, EQUIPMENT_TEMPLATES, EQUIPMENT_TIERS }
