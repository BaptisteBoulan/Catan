import type { GameIdentityDto } from './api-types'

export type GameLocation = Pick<GameIdentityDto, 'gameId' | 'playerId'>

export function readLocation(pathname = window.location.pathname): GameLocation | null {
  const match = /^\/games\/([1-9]\d{3})\/players\/([0-4])\/?$/.exec(pathname)
  return match ? { gameId: match[1], playerId: Number(match[2]) } : null
}
