import type { GameController } from '../hooks/useGameController'
import type { GameLocation } from './location'

export type GameViewProps = {
  controller: GameController
  location: GameLocation
}
