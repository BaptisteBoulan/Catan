import type { GameViewProps } from '../../game/view-types'
import { GameStatus } from './GameStatus'
import { ConnectedPlayers } from './ConnectedPlayers'
import { PlayerCards } from './PlayerCards'

export function GameSidebar({ controller, location }: GameViewProps) {
  const { presenceError, actionError, isActing, navigate, gameAction, winner, showGameResult, isMyTurn } = controller
  return (
    <>
      <aside className="sidebar" inert={showGameResult}>
        <GameStatus controller={controller} location={location} />
        <ConnectedPlayers controller={controller} location={location} />
        <PlayerCards controller={controller} location={location} />
              {presenceError && <p role="alert">Connection lost: {presenceError}. Retrying...</p>}
              {actionError && !isMyTurn && <p role="alert">{actionError}</p>}
              <div className="game-navigation">
                <button onClick={() => navigate(null)}>Back to lobby</button>
                {winner && (
                  <button disabled={isActing} onClick={() => void gameAction('play-again')}>
                    {isActing ? 'Returning to lobby...' : 'Play again'}
                  </button>
                )}
              </div>
      </aside>
    </>
  )
}
