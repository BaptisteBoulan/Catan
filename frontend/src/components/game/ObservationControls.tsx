import type { GameViewProps } from '../../game/view-types'


export function ObservationControls({ controller }: GameViewProps) {
  const { actionError, isActing, gameAction, turn, turnPlayer, winner } = controller
  return (
    <>
      {turn?.observationMode && turn.started && !winner && (
        <section className="turn-actions">
          <h2>Observing {turnPlayer?.name}</h2>
          <p>All players use the AI strategy. Advance one complete turn at a time.</p>
          {turnPlayer?.settlementObjective && (
            <p>Target: node {turnPlayer.settlementObjective.nodeId}
              {' '}({turnPlayer.settlementObjective.expectedResourcesPerTurn.toFixed(3)} resources/turn)</p>
          )}
          <button className="end-turn" disabled={isActing}
            onClick={() => void gameAction('next-turn')}>Next turn</button>
          {actionError && <p role="alert">{actionError}</p>}
        </section>
      )}
    </>
  )
}
