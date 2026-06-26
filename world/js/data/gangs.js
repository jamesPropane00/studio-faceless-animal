// GangData — static gang definitions.

const gangs = [
  { id: 'shadow_claw', name: 'Shadow Claw', icon: '🐾', color: '#6b21a8', desc: 'Silent operators in the dark.' },
  { id: 'neon_viper', name: 'Neon Viper', icon: '🐍', color: '#ec4899', desc: 'Street-level dealers and enforcers.' },
  { id: 'iron_fang', name: 'Iron Fang', icon: '🦷', color: '#4b5563', desc: 'Industrial district muscle.' },
  { id: 'crimson_moth', name: 'Crimson Moth', icon: '🦋', color: '#dc2626', desc: 'Purple Pulse nightlife cartel.' },
  { id: 'ghost_walker', name: 'Ghost Walker', icon: '👻', color: '#d1d5db', desc: 'Information brokers and hackers.' }
]

function getGang(id) { return gangs.find(g => g.id === id) || null }

export { gangs, getGang }
