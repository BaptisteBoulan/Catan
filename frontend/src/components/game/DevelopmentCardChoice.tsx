import type { GameViewProps } from '../../game/view-types'
import { RESOURCES } from '../../game/constants'

export function DevelopmentCardChoice({ controller }: GameViewProps) {
  const {
    isActing, cardChoice, setCardChoice, cardResource, setCardResource,
    secondCardResource, setSecondCardResource, gameAction, selectedCard,
  } = controller
  return (
    <>
      {selectedCard && cardChoice && (
        <form className="trade-form" onSubmit={(event) => {
          event.preventDefault()
          void gameAction(`dev-card/${cardChoice.index}/play`, {
            resources: selectedCard.name === 'Monopoly'
              ? [cardResource] : [cardResource, secondCardResource],
          })
        }}>
          <p>{selectedCard.name === 'Monopoly'
            ? 'Take every card of this resource from all opponents.'
            : 'Choose two resources to receive. You may choose the same one twice.'}</p>
          <label htmlFor="card-resource">Resource</label>
          <select id="card-resource" value={cardResource} disabled={isActing}
            onChange={(event) => {
              const resource = RESOURCES.find(({ kind }) => kind === event.target.value)
              if (resource) setCardResource(resource.kind)
            }}>
            {RESOURCES.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
          </select>
          {selectedCard.name === 'Year of Plenty' && <>
            <label htmlFor="second-card-resource">Second resource</label>
            <select id="second-card-resource" value={secondCardResource} disabled={isActing}
              onChange={(event) => {
                const resource = RESOURCES.find(({ kind }) => kind === event.target.value)
                if (resource) setSecondCardResource(resource.kind)
              }}>
              {RESOURCES.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
            </select>
          </>}
          <button disabled={isActing || selectedCard.unavailableReason !== null}>
            Play {selectedCard.name}
          </button>
          <button type="button" disabled={isActing} onClick={() => setCardChoice(null)}>Cancel</button>
        </form>
      )}
    </>
  )
}
