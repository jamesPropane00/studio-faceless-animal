// Centralized Veil tier definitions for Signal earning
// Used by all backend logic (import this file only)

const VEIL_TIERS = [
  { level: 1, label: 'Veil I', multiplier: 1.5, cap: 150 },
  { level: 2, label: 'Veil II', multiplier: 2, cap: 400 },
  { level: 3, label: 'Veil III', multiplier: 3, cap: 1000 },
  { level: 4, label: 'Veil IV', multiplier: 5, cap: null }, // null = unlimited/high cap
];

function getVeilTier(level) {
  return VEIL_TIERS.find(t => t.level === Number(level)) || VEIL_TIERS[0];
}

module.exports = {
  VEIL_TIERS,
  getVeilTier,
};
