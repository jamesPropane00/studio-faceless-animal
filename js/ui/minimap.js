/**
 * MinimapSystem
 *
 * Renders a small overview map in the corner showing the current region,
 * player position, points of interest, and nearby entities.
 *
 * Integration:
 *   engine.registerSystem('minimap', minimapSystem, 215)
 *   Reads data from WorldMapSystem and Camera for positioning.
 *
 * TODO:
 *   - Add minimap rendering (canvas overlay)
 *   - Add player position dot
 *   - Add region boundary display
 *   - Add POI markers (buildings, NPCs, creatures, resources)
 *   - Add zoom levels (region, neighborhood)
 *   - Add fog of war for unexplored areas
 *   - Add click-to-navigate on minimap
 *   - Add minimap resize and reposition
 *   - Add compass / north indicator
 *   - Add minimap legend
 *
 * Event hooks:
 *   'minimapUpdated' — { region, playerX, playerY }
 *   'minimapClicked' — { x, y, worldX, worldY }
 *   'minimapToggle'  — { visible }
 */

class MinimapSystem {
  constructor() {
    this._visible = true
    this._size = 150  // px
    this._scale = 0.5
    this._enabled = true
  }

  /**
   * Update minimap data. Called each frame.
   * @param {number} playerX
   * @param {number} playerY
   * @param {string} regionId
   * @param {Array} [pois=[]]
   */
  update(playerX, playerY, regionId, pois = []) {
    this._playerX = playerX
    this._playerY = playerY
    this._regionId = regionId
    this._pois = pois
  }

  /**
   * Render the minimap.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasW
   * @param {number} canvasH
   */
  render(ctx, canvasW, canvasH) {
    if (!this._visible) return
    const x = canvasW - this._size - 10
    const y = canvasH - this._size - 10
    // TODO: draw region terrain, player dot, POIs
  }

  show() { this._visible = true }
  hide() { this._visible = false }
  toggle() { this._visible = !this._visible }

  setEnabled(enabled) { this._enabled = enabled }
  isEnabled() { return this._enabled }
}

export { MinimapSystem }
