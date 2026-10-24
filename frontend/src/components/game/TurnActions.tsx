import type { GameViewProps } from '../../game/view-types'
import { BUILD_ACTIONS, RESOURCES } from '../../game/constants'
import { BankTradeForm } from './BankTradeForm'

export function TurnActions({ controller, location }: GameViewProps) {
  const {
    actionError, isActing, placement, setTradeContext, isPlacing, choosePlacement,
    gameAction, turn, isMyTurn, resourceCount, tradeRate, generalTradeRate, openTrade, isTrading,
  } = controller
  return (
    <>
      {isMyTurn && turn && !turn.observationMode && (
        <section className="turn-actions">
        <h2>{turn.setup ? `Starting placements: round ${turn.setup.round}` : 'Your turn'}</h2>
        <p className="dice-result">
          {turn.setup
            ? turn.setup.kind === 'settlement'
              ? 'Place your starting settlement.'
              : 'Place a road connected to the settlement you just placed.'
            : turn.diceRoll === null ? 'Waiting for the automatic dice roll...' : `You rolled ${turn.diceRoll}.`}
        </p>
        <div className="action-buttons">
          {turn.setup ? (
            <button disabled={isActing}
              title="Free starting placement"
              className={isPlacing ? 'placing' : undefined}
              onClick={() => { if (turn.setup) void choosePlacement(turn.setup.kind) }}>
              {isPlacing ? 'Cancel' : `Place ${turn.setup.kind}`}
            </button>
          ) : turn.thiefMovePending ? (
            <button disabled={isActing}
              className={isPlacing ? 'placing' : undefined}
              onClick={() => void choosePlacement('thief')}>
              {isPlacing ? 'Cancel' : 'Move thief'}
            </button>
          ) : turn.freeRoadsRemaining > 0 ? (
            <button disabled={isActing}
              className={isPlacing ? 'placing' : undefined}
              onClick={() => void choosePlacement('road')}>
              {isPlacing ? 'Cancel' : 'Place free road'} ({turn.freeRoadsRemaining} remaining)
            </button>
          ) : <>
          {BUILD_ACTIONS.map(({ kind, label, cost }) => (
            <span className="cost-action" key={kind}>
              <button disabled={isActing || turn.diceRoll === null}
                className={isPlacing && placement?.kind === kind ? 'placing' : undefined}
                aria-describedby={`cost-${kind}`}
                onClick={() => void choosePlacement(kind)}>
                {isPlacing && placement?.kind === kind ? 'Cancel' : label}
              </button>
              <span className="cost-tooltip" role="tooltip" id={`cost-${kind}`}>
                <strong>Building cost</strong>{cost}
              </span>
            </span>
          ))}
          <span className="cost-action">
            <button disabled={isActing || turn.diceRoll === null}
              aria-describedby="cost-dev-card"
              onClick={() => void gameAction('dev-card')}>Buy development card</button>
            <span className="cost-tooltip" role="tooltip" id="cost-dev-card">
              <strong>Card cost</strong>🐑 1 sheep + 🌾 1 wheat + 🪨 1 ore
            </span>
          </span>
          <button disabled={isActing || turn.diceRoll === null}
            aria-expanded={isTrading} aria-controls="bank-trade"
            onClick={() => {
              if (isTrading) setTradeContext(null)
              else openTrade(RESOURCES.find(
                ({ kind }) => resourceCount(kind) >= tradeRate(kind),
              )?.kind ?? 'wood')
            }}>Trade ({generalTradeRate} for 1)</button>
          {RESOURCES.filter(({ kind }) => tradeRate(kind) === 2).map(({ kind, label }) => (
            <button key={kind} disabled={isActing || turn.diceRoll === null}
              aria-controls="bank-trade" onClick={() => openTrade(kind)}>
              Trade {label} (2 for 1)
            </button>
          ))}
          <button className="end-turn" disabled={isActing || turn.diceRoll === null}
            onClick={() => void gameAction('end-turn')}>Next turn</button>
          </>}
        </div>
        {turn.thiefMovePending && (
          <p>Move the thief to another tile. Each player with a settlement or city there
            loses half their resource cards (rounded down) if they have more than seven.</p>
        )}
        {turn.freeRoadsRemaining > 0 && <p>Place up to two connected roads for free.
          Click a highlighted road slot. The second road can extend the first.</p>}
        <BankTradeForm controller={controller} location={location} />
        {isPlacing && <p className="placement-hint">Click a highlighted slot on the board.</p>}
        {actionError && <p role="alert">{actionError}</p>}
        </section>
      )}
    </>
  )
}
