/**
 * Phase 5A — Resource Simulation Config
 * Constants for the simulation tick engine
 */

// Income per 30s tick for each building type
// Approximately half the old per-minute rate (since 2 ticks = 1 minute)
export const TICK_INCOME = {
  house: 0.25,
  shop: 0.5,
  club: 1.0,
  warehouse: 0.5,
  hide: 0,
  camp: 0
}

// Maximum pending income (capped at 24 hours of max potential income)
// 2 ticks/min × 60 min × 24 hours × max tick income
export const MAX_PENDING_INCOME = {
  house: 0.25 * 2 * 60 * 24,
  shop: 0.5 * 2 * 60 * 24,
  club: 1.0 * 2 * 60 * 24,
  warehouse: 0.5 * 2 * 60 * 24,
  hide: 0,
  camp: 0
}

// Building inputs and outputs for district resource scoring
export const BUILDING_IO = {
  house: {
    needs: ['safety'],
    produces: ['population', 'workers']
  },
  shop: {
    needs: ['customers', 'supplies'],
    produces: ['happiness']
  },
  club: {
    needs: ['customers', 'supplies', 'workers'],
    produces: ['entertainment', 'happiness']
  },
  warehouse: {
    needs: ['workers', 'safety'],
    produces: ['supplies']
  },
  hide: {
    needs: [],
    produces: ['crime']
  },
  camp: {
    needs: ['safety'],
    produces: ['population']
  }
}

// Status thresholds (health ranges)
// Hysteresis: building must cross both thresholds to change status
export const STATUS_THRESHOLDS = {
  closed: 10,
  closing: 25,
  struggling: 40,
  active: 60
}

// Fulfillment weight for each need per building type (sum = 1.0)
export const FULFILLMENT_WEIGHTS = {
  house: { safety: 1.0 },
  shop: { customers: 0.6, supplies: 0.4 },
  club: { customers: 0.4, supplies: 0.3, workers: 0.3 },
  warehouse: { workers: 0.6, safety: 0.4 },
  hide: {},
  camp: { safety: 1.0 }
}

// Residential types that never close
export const RESIDENTIAL_TYPES = ['house', 'camp']
