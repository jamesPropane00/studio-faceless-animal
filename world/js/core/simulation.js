// SimulationEngine — wraps the game loop from world.html (legacy)
// The main game loop (update/render/requestAnimationFrame) lives in world.html.
// This module provides hooks for registering systems and a tick pipeline.
// When Migration Phase 1 begins, the game loop moves here.

class SimulationEngine {
  constructor() {
    this._systems = []
    this._running = false
    this._lastTime = 0
  }

  registerSystem(name, system, priority = 100) {
    this._systems.push({ name, system, priority })
    this._systems.sort((a, b) => a.priority - b.priority)
  }

  tick(dt) {
    for (const { system } of this._systems) {
      if (system.update) system.update(dt)
    }
  }

  start() { this._running = true; this._lastTime = performance.now() }
  stop() { this._running = false }

  isRunning() { return this._running }
}

// Legacy: all game logic lives in world.html's update() and render() functions.
// These globals are defined in world.html and accessed here for documentation.
// gameLoop, update, render, state, ctx, canvas, etc.

const engine = new SimulationEngine()
export { engine, SimulationEngine }
