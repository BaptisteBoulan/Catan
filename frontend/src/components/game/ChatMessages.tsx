import type { GameViewProps } from '../../game/view-types'
import { playerColorCss } from '../../game/player-colors'

export function ChatMessages({ controller, location }: GameViewProps) {
  const { game, winner, chat } = controller
  const { chatMessages, isChatActing, decideOffer } = chat
  return (
    <>
      <div className="chat-messages" aria-live="polite">
        {chatMessages.length === 0
          ? <p className="empty-cards">No messages yet. Start the conversation!</p>
          : chatMessages.map((message) => {
            const sender = game?.players.find((player) => player.id === message.senderId)
            const recipient = game?.players.find((player) => player.id === message.recipientId)
            const isOffer = message.recipientId !== null
            return (
              <article className={`chat-message${isOffer ? ' trade-offer' : ''}${message.kind === 'action' ? ' action-log' : ''}`} key={message.id}
                style={message.kind === 'action' && sender ? { color: playerColorCss(sender.color) } : undefined}>
                {message.kind !== 'action' && <p className="chat-message-author">
                  {sender?.name ?? `Player ${message.senderId + 1}`}
                  {isOffer && <> offers {recipient?.name ?? `Player ${Number(message.recipientId) + 1}`}</>}
                </p>}
                {isOffer ? (
                  <>
                    <p className="offer-details">
                      {message.giveCount} {message.give} for {message.receiveCount} {message.receive}
                    </p>
                    <p className="offer-status">
                      {message.status === 'pending' ? 'Offer pending' : `Offer ${message.status}`}
                    </p>
                    {message.status === 'pending' && message.recipientId === location.playerId && (
                      <div className="offer-actions">
                        <button disabled={isChatActing || !!winner}
                          onClick={() => void decideOffer(message.id, 'accept')}>Accept</button>
                        <button className="secondary-button" disabled={isChatActing || !!winner}
                          onClick={() => void decideOffer(message.id, 'decline')}>Decline</button>
                      </div>
                    )}
                  </>
                ) : <p className="chat-message-text">{message.text}</p>}
              </article>
            )
          })}
      </div>
    </>
  )
}
