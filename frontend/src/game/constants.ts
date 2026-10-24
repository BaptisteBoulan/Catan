import type { BuildKind, ResourceCard } from './api-types'

export const BUILD_ACTIONS: { kind: BuildKind, label: string, cost: string }[] = [
  { kind: 'road', label: 'Build road', cost: '🌲 1 wood + 🧱 1 brick' },
  { kind: 'settlement', label: 'Build settlement', cost: '🌲 1 wood + 🧱 1 brick + 🐑 1 sheep + 🌾 1 wheat' },
  { kind: 'city', label: 'Upgrade to city', cost: '🪨 3 ore + 🌾 2 wheat' },
]

export const RESOURCES: { kind: ResourceCard, label: string }[] = [
  { kind: 'wood', label: '🌲 Wood' },
  { kind: 'brick', label: '🧱 Brick' },
  { kind: 'sheep', label: '🐑 Sheep' },
  { kind: 'wheat', label: '🌾 Wheat' },
  { kind: 'ore', label: '🪨 Ore' },
]
