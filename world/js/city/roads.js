// RoadSystem — road management and rendering.
// Legacy: generateRoads(), drawRoads() in world.html
// Road sprite: /assets/images/road-tile.png (fallback to procedural)

class RoadSystem {
  constructor() {
    this._roadSprite = new Image()
    this._roadSprite.src = '/assets/images/road-tile.png'
    this._spriteLoaded = false
    this._roadSprite.onload = () => { this._spriteLoaded = true }
    this._roadSprite.onerror = () => { this._spriteLoaded = false }
  }

  isSpriteAvailable() { return this._spriteLoaded }

  // Legacy: all road logic lives in world.html drawRoads() and generateRoads()
}

export { RoadSystem }
