import { SimulationEngine } from './core/simulation.js'
import { GameConfig } from './core/config.js'
import { EventBus } from './core/events.js'
import { SaveManager } from './core/save.js'
import { WeatherSystem } from './core/weather.js'
import { TimeSystem } from './core/time.js'
import { RenderSystem } from './core/renderer.js'
import { CameraSystem } from './core/camera.js'
import { InputManager } from './core/input.js'

import { PlayerSystem } from './player/player.js'
import { WalletService } from './player/wallet.js'
import { SkillTreeEngine } from './player/skilltree.js'
import { ReputationSystem } from './player/reputation.js'

import { EconomySystem } from './city/economy.js'
import { buildingRegistry } from './city/buildings.js'
import { DistrictSystem } from './city/districts.js'
import { RoadSystem } from './city/roads.js'
import { InfrastructureSystem } from './city/infrastructure.js'

import { NPCSystem } from './npc/npc.js'
import { GangSystemWrapper } from './gangs/index.js'
import { gangWars } from './gangs/gangwars.js'

import { worldMap } from './regions/worldmap.js'
import { TravelSystem } from './regions/travel.js'

import { FarmSystem } from './farm/farm.js'

import { creatureEncounters } from './wildlife/creatures.js'
import { combatEncounters } from './combat/encounters.js'
import { combatEquipment } from './combat/equipment.js'

import { hud } from './ui/hud.js'
import { panels } from './ui/panels.js'
import { notifications } from './ui/notifications.js'
import { minimap } from './ui/minimap.js'
import { overlays } from './ui/overlays.js'
import { dialogs } from './ui/dialogs.js'

const engine = new SimulationEngine()
const eventBus = new EventBus()
const saveManager = new SaveManager()
const weather = new WeatherSystem()
const timeSystem = new TimeSystem()
const renderer = new RenderSystem()
const camera = new CameraSystem()
const input = new InputManager()
const playerSystem = new PlayerSystem()
const wallet = new WalletService()
const skillTree = new SkillTreeEngine()
const reputation = new ReputationSystem()
const economy = new EconomySystem()
const districts = new DistrictSystem()
const roads = new RoadSystem()
const infrastructure = new InfrastructureSystem()
const npcSystem = new NPCSystem()
const gangSystem = new GangSystemWrapper()
const travel = new TravelSystem()
const farmSystem = new FarmSystem()
const config = new GameConfig()

engine.registerSystem('config', config, -99)
engine.registerSystem('events', eventBus, -90)
engine.registerSystem('save', saveManager, -80)
engine.registerSystem('weather', weather, 10)
engine.registerSystem('time', timeSystem, 20)
engine.registerSystem('player', playerSystem, 30)
engine.registerSystem('wallet', wallet, 31)
engine.registerSystem('npc', npcSystem, 40)
engine.registerSystem('economy', economy, 50)
engine.registerSystem('gangs', gangSystem, 60)
engine.registerSystem('gangWars', gangWars, 61)
engine.registerSystem('travel', travel, 70)
engine.registerSystem('combat', combatEncounters, 80)
engine.registerSystem('creatures', creatureEncounters, 81)
engine.registerSystem('renderer', renderer, 100)
engine.registerSystem('camera', camera, 90)
engine.registerSystem('input', input, 5)
engine.registerSystem('hud', hud, 200)
engine.registerSystem('panels', panels, 210)
engine.registerSystem('notifications', notifications, 220)
engine.registerSystem('dialogs', dialogs, 230)
engine.registerSystem('minimap', minimap, 240)

function boot() {
  notifications.init()
  engine.start()
  window.__engine = engine
  window.__modules = {
    eventBus, saveManager, weather, timeSystem, renderer, camera, input,
    playerSystem, wallet, skillTree, reputation, economy, buildingRegistry,
    districts, roads, infrastructure, npcSystem, gangSystem, gangWars,
    worldMap, travel, farmSystem, creatureEncounters, combatEncounters,
    combatEquipment, hud, panels, notifications, minimap, overlays, dialogs
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
