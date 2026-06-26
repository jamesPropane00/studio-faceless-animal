// Game constants — references the globals defined in world.html (legacy)
// When migrating, these values move here from world.html.
// Currently they are defined at the top of the <script> in world.html.

// Legacy references (defined in world.html):
// CHUNK_SIZE = 16, TILE_W = 64, TILE_H = 32, WORLD_CHUNKS = 13, WORLD_SIZE = 208
// TERRAIN = { DEEP_WATER: 0, WATER: 1, SAND: 2, GRASS: 3, ... }
// TERRAIN_COLORS = { ... }

export const CHUNK_SIZE = 16
export const TILE_W = 64
export const TILE_H = 32
export const WORLD_CHUNKS = 13
export const WORLD_SIZE = CHUNK_SIZE * WORLD_CHUNKS

export const TERRAIN = {
  DEEP_WATER: 0, WATER: 1, SAND: 2, GRASS: 3,
  DARK_GRASS: 4, FOREST: 5, STONE: 6, DIRT: 7,
  ROAD: 8, BUILDING: 9
}

export const TERRAIN_COLORS = {
  [TERRAIN.DEEP_WATER]: ['#0c2d48','#0a2640'],
  [TERRAIN.WATER]:      ['#1a5276','#16466a'],
  [TERRAIN.SAND]:       ['#c9a84c','#b8973f'],
  [TERRAIN.GRASS]:      ['#2d6a4f','#267045'],
  [TERRAIN.DARK_GRASS]: ['#1b4332','#163d2b'],
  [TERRAIN.FOREST]:     ['#145a32','#0f4d2a'],
  [TERRAIN.STONE]:      ['#5d6d7e','#515e6e'],
  [TERRAIN.DIRT]:       ['#6d4c41','#5d3f36'],
  [TERRAIN.ROAD]:       ['#4a4a4a','#3e3e3e'],
  [TERRAIN.BUILDING]:   ['#2c2c3a','#24242f'],
}
