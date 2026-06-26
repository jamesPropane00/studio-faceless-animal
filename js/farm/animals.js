/**
 * FarmAnimalSystem
 *
 * Manages decorative and productive farm animals (chickens, cows, sheep).
 * Animals wander, produce goods, and have health and mood states.
 *
 * Integration:
 *   engine.registerSystem('farmAnimals', farmAnimalSystem, 84)
 *   Active when in Farmlands region with Farm Ambience enabled.
 *
 * TODO:
 *   - Add animal feeding and care mechanics
 *   - Add animal breeding
 *   - Add animal product collection (eggs, milk, wool)
 *   - Add animal health and disease
 *   - Add animal happiness and bonding
 *   - Add animal naming and customization
 *   - Add animal trading between players
 *
 * Event hooks:
 *   'farmAnimalSpawned'   — { id, type }
 *   'farmAnimalDied'      — { id, reason }
 *   'farmAnimalProduced'  — { id, product, amount }
 *   'farmAnimalBred'      — { parent1, parent2, offspring }
 */

const FARM_ANIMAL_TYPES = ['chicken', 'cow', 'sheep']

class FarmAnimal {
  /**
   * @param {string} id
   * @param {string} type
   * @param {number} x
   * @param {number} y
   */
  constructor(id, type, x, y) {
    this.id = id
    this.type = type
    this.x = x
    this.y = y
    this.tx = x
    this.ty = y
    this.speed = type === 'chicken' ? 0.15 + Math.random() * 0.1 : 0.08 + Math.random() * 0.1
    this.animTimer = Math.random() * 10
    this.moveTimer = Math.random() * 10
    this.phase = Math.random() * Math.PI * 2
    this.size = type === 'cow' ? 1 : type === 'sheep' ? 0.9 : 0.5
    this.health = 100
    this.hunger = 100
    this.productTimer = 0
    this.productionInterval = type === 'chicken' ? 60 : type === 'cow' ? 120 : 180
  }
}

class FarmAnimalSystem {
  constructor() {
    /** @type {Map<string, FarmAnimal>} */
    this.animals = new Map()
    this._enabled = true
    this._maxAnimals = 14
  }

  /**
   * Spawn a farm animal.
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @returns {FarmAnimal|null}
   */
  spawn(type, x, y) {
    if (this.animals.size >= this._maxAnimals) return null
    if (!FARM_ANIMAL_TYPES.includes(type)) return null
    const id = `farmanimal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const animal = new FarmAnimal(id, type, x, y)
    this.animals.set(id, animal)
    return animal
  }

  /**
   * Remove an animal.
   * @param {string} id
   * @returns {boolean}
   */
  despawn(id) {
    return this.animals.delete(id)
  }

  /**
   * Update all animals. Called each tick.
   * @param {number} dt
   */
  update(dt) {
    for (const animal of this.animals.values()) {
      animal.animTimer += dt
      const dx = animal.tx - animal.x
      const dy = animal.ty - animal.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 0.3) {
        animal.moveTimer -= dt
        if (animal.moveTimer <= 0) {
          animal.moveTimer = 3 + Math.random() * 6
          animal.tx = animal.x + (Math.random() - 0.5) * 4
          animal.ty = animal.y + (Math.random() - 0.5) * 4
        }
      } else {
        const speed = animal.speed * dt
        animal.x += (dx / dist) * speed
        animal.y += (dy / dist) * speed
      }
    }
  }

  /** @returns {FarmAnimal[]} */
  getAll() { return [...this.animals.values()] }

  /** @param {number} max */
  setMaxAnimals(max) { this._maxAnimals = max }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { FarmAnimalSystem, FarmAnimal, FARM_ANIMAL_TYPES }
