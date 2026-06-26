/**
 * Config
 *
 * Central configuration constants for the Faceless Animal engine.
 * All magic numbers that govern simulation behaviour should be defined here.
 *
 * Integration:
 *   Runtime overrides can be loaded from localStorage or server config.
 *   The engine reads from this module; systems import individual constants.
 *
 * TODO:
 *   - Load region-specific overrides from server
 *   - Add runtime validation for config values
 *   - Add support for environment-based config profiles (dev/staging/prod)
 */

// ── World ──
export const WORLD_SIZE = 100
export const CHUNK_SIZE = 10
export const TILE_W = 16
export const TILE_H = 8
export const MAX_PARTICLES = 500
export const MAX_NPCS = 200

// ── Time ──
export const DAY_LENGTH = 60 * 60 // seconds of real time for one full day
export const TIME_SPEED_DEFAULT = 0.0003
export const TIME_SPEED_FAST = 0.001

// ── Player ──
export const PLAYER_BASE_SPEED = 3.5
export const PLAYER_SPRINT_MULTIPLIER = 1.8
export const PLAYER_INVENTORY_SLOTS = 24
export const PLAYER_MAX_HEALTH = 100
export const PLAYER_MAX_STAMINA = 100

// ── Economy ──
export const STARTING_COINS = 100
export const STARTING_REP = 0
export const INCOME_COLLECT_INTERVAL = 60 // seconds
export const TAX_RATE_BASE = 0.05

// ── Districts ──
export const DISTRICT_MIN_BUILDINGS = 3
export const DISTRICT_MAX_RADIUS = 15
export const DISTRICT_INFLUENCE_RADIUS = 20

// ── NPCs ──
export const NPC_SPAWN_INTERVAL = 30
export const NPC_BUILD_COOLDOWN = 270 // 4.5 minutes
export const NPC_WANDER_RADIUS = 8
export const NPC_MAX_PER_DISTRICT = 15

// ── Farming ──
export const FARM_BLOCK_COST = 100
export const FARM_BLOCK_SIZE = 10
export const CROP_GROWTH_CORN = 45
export const CROP_GROWTH_WHEAT = 30
export const CROP_GROWTH_VEGGIES = 60
export const FOOD_CONVERSION_RATE = 3 // raw crops → food units
export const FARM_ANIMAL_CAP = 14
export const FARM_WORKER_CAP = 4

// ── Travel ──
export const TRAVEL_DURATION_MS = 8000
export const TRAVEL_OVERLAY_FADE = 300

// ── Rendering ──
export const CAMERA_ZOOM_MIN = 0.15
export const CAMERA_ZOOM_MAX = 2.0
export const CAMERA_ZOOM_SPEED = 0.1
export const CAMERA_ZOOM_STEP = 0.15

// ── Weather ──
export const WEATHER_CHANGE_INTERVAL = 30
export const FOG_MAX_DENSITY = 1.0

// ── Combat (future) ──
export const COMBAT_TICK_INTERVAL = 0.5
export const DAMAGE_FALLBACK = 1

// ── UI ──
export const TOAST_DURATION = 4000
export const NOTIFICATION_MAX = 20

// ── Terrain types ──
export const TERRAIN = Object.freeze({
  GRASS: 0,
  WATER: 1,
  DEEP_WATER: 2,
  SAND: 3,
  FOREST: 4,
  ROCK: 5,
  ROAD: 6,
  BUILDING: 7,
  TUNDRA: 8,
  SNOW: 9,
  LAVA: 10,
  SWAMP: 11,
  DIRT: 12
})

// ── Weather types ──
export const WEATHER_TYPES = Object.freeze({
  CLEAR: 'clear',
  RAIN: 'rain',
  STORM: 'storm',
  SNOW: 'snow',
  FOG: 'fog'
})

// ── Region IDs ──
export const REGION_IDS = Object.freeze({
  CITY: 'city',
  FARMLANDS: 'farmlands',
  WHISPER_WOODS: 'whisperwoods',
  MOUNTAINS: 'mountains',
  COAST: 'coast',
  PURPLE_PULSE: 'purplepulse',
  FACELESS_CITY: 'facelesscity'
})

/**
 * Get a config value with optional runtime override.
 * TODO: Load overrides from server/localStorage.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
export function getConfig(key, defaultValue) {
  return defaultValue
}
