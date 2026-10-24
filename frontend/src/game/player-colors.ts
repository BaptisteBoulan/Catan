import type { PlayerColor } from './api-types'

export const PLAYER_COLORS: Record<PlayerColor, [number, number, number]> = {
  blue: [0.48, 0.65, 0.88],
  red: [0.86, 0.49, 0.49],
  green: [0.48, 0.72, 0.55],
  orange: [0.92, 0.72, 0.4],
  indigo: [0.58, 0.53, 0.8],
}

export function playerColorCss(color: PlayerColor): string {
  return `rgb(${PLAYER_COLORS[color].map((channel) => Math.round(channel * 255)).join(', ')})`
}
