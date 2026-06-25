# Phase A: District Demographics - Sim City Foundation

## What This Is

Phase A is the **data foundation** for the Sim City cascade. No behavioral changes yet — just real data flowing into districts so the cascade has something to operate on later.

## What Was Added

### 1. Database (SQL migration required)
- `world_districts.wealth` — sum of building values
- `world_districts.population` — estimated NPC count (per building type)
- `world_districts.level` — every 3 buildings = 1 level
- `world_districts.building_breakdown` — JSON: `{house: 5, shop: 2, club: 1}`

### 2. Backend (`functions/api/world/districts/refresh.js`)
- Calculates `wealth`, `population`, `level`, `building_breakdown` per district
- Stores them in DB so all clients see consistent values

### 3. Client (`world.html`)
- `drawDistrict()` now uses wealth for visual feedback:
  - High wealth = brighter fill (thriving)
  - Low wealth = dimmer fill (struggling)
- District tooltip already shows Level / Population / Wealth (from 83eec8d)
- The progression hooks (`district.level`, `district.population`, `district.wealth`) now use real server data

## SQL to Run in Supabase

```sql
ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS wealth INTEGER NOT NULL DEFAULT 0;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS building_breakdown JSONB DEFAULT '{}'::jsonb;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS population INTEGER NOT NULL DEFAULT 0;

ALTER TABLE world_districts
ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
```

## What This Enables (Future Phases)

- **Phase B** (Business Health): wealth + population → business health calculation
- **Phase C** (Crime): gang presence + district wealth → crime rate
- **Phase D** (Protection Racket): high crime + gang presence → tribute collection
- **Phase E** (NPC Loyalty): population shifts to dominant gang over time
- **Phase F** (Property Value): all the above → property value → new building cost

## Visual Effect

- Open the world
- Districts with more buildings = brighter color
- Districts with few buildings = dimmer color
- Hover any district to see Level / Population / Wealth in the tooltip

## Test Steps

1. Run the SQL migration (above)
2. Wait ~1 min for Cloudflare deploy
3. Hard refresh browser
4. Place 3+ buildings close together → district forms
5. District color brightens based on building value
6. Hover → see Level / Pop / Wealth in tooltip
