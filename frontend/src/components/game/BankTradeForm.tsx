import type { GameViewProps } from '../../game/view-types'
import { RESOURCES } from '../../game/constants'

export function BankTradeForm({ controller }: GameViewProps) {
  const {
    isActing, tradeGive, setTradeGive, tradeReceive, setTradeReceive,
    gameAction, turn, resourceCount, tradeRate, isTrading,
  } = controller
  if (!turn) return null
  return (
    <>
      {isTrading && !turn.setup && !turn.thiefMovePending && !turn.freeRoadsRemaining && (
        <form id="bank-trade" className="trade-form" onSubmit={(event) => {
          event.preventDefault()
          void gameAction('trade', { give: tradeGive, receive: tradeReceive })
        }}>
          <p>Exchange {tradeRate(tradeGive)} matching resources for 1 of your choice.
            Your ports automatically apply the best rate.</p>
          <label htmlFor="trade-give">Give {tradeRate(tradeGive)}</label>
          <select id="trade-give" value={tradeGive} disabled={isActing}
            onChange={(event) => {
              const resource = RESOURCES.find(({ kind }) => kind === event.target.value)
              if (resource) {
                setTradeGive(resource.kind)
                if (tradeReceive === resource.kind) {
                  setTradeReceive(resource.kind === 'wood' ? 'brick' : 'wood')
                }
              }
            }}>
            {RESOURCES.map(({ kind, label }) => (
              <option key={kind} value={kind} disabled={resourceCount(kind) < tradeRate(kind)}>
                {label} ({tradeRate(kind)} for 1; {resourceCount(kind)} available)
              </option>
            ))}
          </select>
          <label htmlFor="trade-receive">Receive 1</label>
          <select id="trade-receive" value={tradeReceive} disabled={isActing}
            onChange={(event) => {
              const resource = RESOURCES.find(({ kind }) => kind === event.target.value)
              if (resource) setTradeReceive(resource.kind)
            }}>
            {RESOURCES.map(({ kind, label }) => (
              <option key={kind} value={kind} disabled={kind === tradeGive}>{label}</option>
            ))}
          </select>
          {resourceCount(tradeGive) < tradeRate(tradeGive) && (
            <p>You need at least {tradeRate(tradeGive)} {tradeGive} to trade.</p>
          )}
          <button disabled={isActing || turn.diceRoll === null
            || resourceCount(tradeGive) < tradeRate(tradeGive) || tradeGive === tradeReceive}>Confirm trade</button>
        </form>
      )}
    </>
  )
}
