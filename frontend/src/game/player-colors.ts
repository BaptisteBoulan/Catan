import type { PlayerColor } from './api-types'

export const PLAYER_COLORS: Record<PlayerColor, [number, number, number]> = {
  blue: [0.48, 0.65, 0.88],
  red: [0.96, 0.39, 0.39],
  green: [0.18, 0.62, 0.25],
  orange: [0.92, 0.62, 0.2],
  indigo: [0.58, 0.43, 0.9],
}

export function playerColorCss(color: PlayerColor): string {
  return `rgb(${PLAYER_COLORS[color].map((channel) => Math.round(channel * 255)).join(', ')})`
}
