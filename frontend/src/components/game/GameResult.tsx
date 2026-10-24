import type { GameViewProps } from '../../game/view-types'


export function GameResult({ controller, location }: GameViewProps) {
  const { actionError, isActing, setIsViewingFinalBoard, gameAction, winner } = controller
  if (!winner) return null
  return (
    <>
      <div className="game-result-backdrop">
        <section className="game-result" role="dialog" aria-modal="true"
          aria-labelledby="game-result-title" aria-describedby="game-result-description">
          <h1 id="game-result-title">{winner.id === location.playerId ? 'Victory!' : 'Defeat'}</h1>
          <p id="game-result-description">
            {winner.name} wins with {winner.points} points!
          </p>
          <p>Play again in the same lobby with the same players.</p>
          <div className="game-result-buttons">
            <button autoFocus disabled={isActing} onClick={() => void gameAction('play-again')}>
              {isActing ? 'Returning to lobby...' : 'Play again'}
            </button>
            <button className="secondary-button" disabled={isActing}
              onClick={() => setIsViewingFinalBoard(true)}>See board</button>
          </div>
          {actionError && <p role="alert">{actionError}</p>}
        </section>
      </div>
    </>
  )
}
