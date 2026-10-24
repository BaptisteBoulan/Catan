import type { GameViewProps } from '../../game/view-types'
import { RESOURCES } from '../../game/constants'
import { DevelopmentCardChoice } from './DevelopmentCardChoice'

export function PlayerCards({ controller, location }: GameViewProps) {
  const { game, isActing, chooseDevelopmentCard, turn, winner } = controller
  return (
    <>
      <h2>Your cards</h2>
      <div className="player-card-list">
        {game?.players.filter((player) => player.id === location.playerId).map((player) => (
          <section className="player-card-panel" key={player.id}>
            <p className="victory-points">{player.points} victory points</p>
            <h4>Resources</h4>
            {player.resources.length > 0 ? (
              <ul className="resource-card-list" aria-label={`${player.name} resource cards`}>
                {player.resources.map((resource, index) => (
                  <li className={`resource-card resource-${resource}`} key={`${resource}-${index}`}>
                    <span className="card-icon" aria-hidden="true">
                      {RESOURCES.find(({ kind }) => kind === resource)?.label.split(' ')[0]}
                    </span>
                    <span>{resource}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="empty-cards">No resource cards</p>}
            <h4>Development cards</h4>
            {player.devCards.length > 0 ? (
              <ul className="dev-card-list" aria-label={`${player.name} development cards`}>
                {player.devCards.map((card, index) => (
                  <li className="dev-card-slot" key={`${card.name}-${index}`}>
                    <button
                      className={`dev-card ${card.used ? 'card-used'
                        : card.unavailableReason ? 'card-unavailable' : 'card-playable'}`}
                      disabled={!!winner || !!turn?.observationMode || isActing || card.used || card.unavailableReason !== null}
                      title={card.unavailableReason ?? `Click to play ${card.name}`}
                      onClick={() => chooseDevelopmentCard(index)}>
                      <span>{card.name}</span>
                      <small>{card.used ? 'Used' : card.unavailableReason ? 'Unavailable' : 'Play'}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="empty-cards">No development cards</p>}
            <p className="card-legend">Gray: unavailable · Green: playable · Red: used</p>
            <DevelopmentCardChoice controller={controller} location={location} />
          </section>
        ))}
      </div>
    </>
  )
}
