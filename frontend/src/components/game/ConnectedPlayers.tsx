import type { GameViewProps } from '../../game/view-types'
import { playerColorCss } from '../../game/player-colors'
import { PlayerAwards } from './PlayerAwards'

export function ConnectedPlayers({ controller, location }: GameViewProps) {
  const { connectedPlayers, showKnightProgress } = controller
  return (
    <>
      <h2>Connected players ({connectedPlayers.length})</h2>
      <ul aria-label="Connected players">
        {connectedPlayers.map((player) => (
          <li key={player.id}>
            <span className="player-color" style={{ backgroundColor: playerColorCss(player.color) }} />
            {player.name}{player.isAi ? ' (AI)' : player.id === location.playerId ? ' (you)' : ''}
            <span className="player-score">{player.points} points</span>
            <PlayerAwards player={player} showKnights={showKnightProgress} />
          </li>
        ))}
      </ul>
    </>
  )
}
