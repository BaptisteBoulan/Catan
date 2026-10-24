import type { GameViewProps } from '../../game/view-types'
import { ChatMessages } from './ChatMessages'
import { TradeOfferFields } from './TradeOfferFields'

export function ChatPanel({ controller, location }: GameViewProps) {
  const { canOfferTrade, chat } = controller
  const {
    chatText, setChatText, chatMode, setChatMode, offerRecipient, offerGive,
    offerReceive, isChatActing, chatError, submitChat,
  } = chat
  return (
    <>
      <section className="chat-panel" aria-label="Game chat">
        <h2>Chat</h2>
        <ChatMessages controller={controller} location={location} />
        <form className="chat-form" onSubmit={(event) => void submitChat(event)}>
          <div className="chat-mode">
            <button type="button" className={chatMode === 'message' ? 'selected' : 'secondary-button'}
              aria-pressed={chatMode === 'message'} onClick={() => setChatMode('message')}>Message</button>
            <button type="button" className={chatMode === 'offer' ? 'selected' : 'secondary-button'}
              aria-pressed={chatMode === 'offer'} onClick={() => setChatMode('offer')}>Trade offer</button>
          </div>
          {chatMode === 'message' ? (
            <label className="chat-message-input">
              <span className="visually-hidden">Message</span>
              <input value={chatText} maxLength={500} placeholder="Write a message..."
                onChange={(event) => setChatText(event.target.value)} />
            </label>
          ) : (
            <TradeOfferFields controller={controller} location={location} />
          )}
          <button disabled={isChatActing || (chatMode === 'message'
            ? !chatText.trim()
            : !canOfferTrade || !offerRecipient || offerGive === offerReceive)}>Send {chatMode}</button>
        </form>
        {chatError && <p role="alert">{chatError}</p>}
      </section>
    </>
  )
}
