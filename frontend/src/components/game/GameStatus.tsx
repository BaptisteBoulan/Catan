import type { GameViewProps } from '../../game/view-types'
import { playerColorCss } from '../../game/player-colors'
import { Dice } from './Dice'

export function GameStatus({ controller, location }: GameViewProps) {
  const {
    game, players, isActing, observationMode, setObservationMode, gameAction,
    currentPlayer, turn, turnPlayer, winner, isMyTurn, emptySlots, isHost,
  } = controller
  return (
    <>
      <h1>Game {location.gameId}</h1>
      {currentPlayer && <p>Playing as <strong>{currentPlayer.name}</strong></p>}
      {game && <p className="created-at">Created {new Date(game.createdAt).toLocaleString()}</p>}
      {game && <p className="victory-points">First to {game.turn.winningPoints} points wins</p>}
      {game && (winner ? <p className="turn-status">{winner.name} wins!</p> : turnPlayer ? (
        <p className="turn-status">
          {turn?.setup ? `Setup round ${turn.setup.round}` : `Turn ${turn?.turnNumber}`}:{' '}
          <span className="player-color" style={{ backgroundColor: playerColorCss(turnPlayer.color) }} />
          <strong>{isMyTurn ? 'your turn' : turnPlayer.name}</strong>
        </p>
      ) : (
        <div className="turn-status">
          <p>Players ({players.length}/{game.players.length})</p>
          {isHost ? (
            <>
            <label>
              <input type="checkbox" checked={observationMode} disabled={isActing}
                onChange={(event) => setObservationMode(event.target.checked)} />
              Observation mode (automate every player)
            </label>
            <button disabled={isActing} onClick={() => void gameAction('start')}>
              {emptySlots > 0 ? 'Start with AI players' : 'Start game'}
            </button>
            </>
          ) : <p>Waiting for the host to start the game...</p>}
        </div>
      ))}
      {turn?.diceValues && turn.diceRoll !== null && (
        <Dice values={turn.diceValues} total={turn.diceRoll} />
      )}
    </>
  )
}
