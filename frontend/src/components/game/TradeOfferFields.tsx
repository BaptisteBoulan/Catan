import type { GameViewProps } from '../../game/view-types'
import { RESOURCES } from '../../game/constants'

export function TradeOfferFields({ controller, location }: GameViewProps) {
  const { game, canOfferTrade, chat } = controller
  const {
    offerRecipient, setOfferRecipient, offerGive, setOfferGive, offerReceive, setOfferReceive,
    offerGiveCount, setOfferGiveCount, offerReceiveCount, setOfferReceiveCount,
  } = chat
  return (
    <>
      <div className="chat-offer-form">
        <label htmlFor="offer-recipient">Offer to</label>
        <select id="offer-recipient" value={offerRecipient}
          onChange={(event) => setOfferRecipient(event.target.value)} required>
          <option value="" disabled>Select a player</option>
          {game?.players.filter((player) => player.id !== location.playerId).map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}{player.isAi ? ' (AI)' : ''}
            </option>
          ))}
        </select>
        <label htmlFor="offer-give">You give</label>
        <div className="offer-resource-row">
          <input id="offer-give-count" aria-label="Amount you give" type="number"
            min={1} max={19} value={offerGiveCount}
            onChange={(event) => setOfferGiveCount(Number(event.target.value))} />
          <select id="offer-give" value={offerGive}
            onChange={(event) => {
              const resource = RESOURCES.find(({ kind }) => kind === event.target.value)
              if (resource) {
                setOfferGive(resource.kind)
                if (offerReceive === resource.kind) {
                  setOfferReceive(resource.kind === 'wood' ? 'brick' : 'wood')
                }
              }
            }}>
            {RESOURCES.map(({ kind, label }) => (
              <option value={kind} key={kind}>{label}</option>
            ))}
          </select>
        </div>
        <label htmlFor="offer-receive">You receive</label>
        <div className="offer-resource-row">
          <input id="offer-receive-count" aria-label="Amount you receive" type="number"
            min={1} max={19} value={offerReceiveCount}
            onChange={(event) => setOfferReceiveCount(Number(event.target.value))} />
          <select id="offer-receive" value={offerReceive}
            onChange={(event) => {
              const resource = RESOURCES.find(({ kind }) => kind === event.target.value)
              if (resource) setOfferReceive(resource.kind)
            }}>
            {RESOURCES.map(({ kind, label }) => (
              <option value={kind} key={kind} disabled={kind === offerGive}>{label}</option>
            ))}
          </select>
        </div>
        {!canOfferTrade && (
          <p className="offer-status">Trade offers can be sent on your turn after rolling the dice.</p>
        )}
      </div>
    </>
  )
}
