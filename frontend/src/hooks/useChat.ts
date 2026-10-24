import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../game/api'
import type { ChatMessageDto, ChatRequestDto, GameSessionDto, ResourceCard } from '../game/api-types'
import type { GameLocation } from '../game/location'

export function useChat(
  location: GameLocation | null,
  canOfferTrade: boolean,
  onState: (session: GameSessionDto) => void,
) {
  const [chatMessages, setChatMessages] = useState<ChatMessageDto[]>([])
  const [chatText, setChatText] = useState('')
  const [chatMode, setChatMode] = useState<'message' | 'offer'>('message')
  const [offerRecipient, setOfferRecipient] = useState('')
  const [offerGive, setOfferGive] = useState<ResourceCard>('wood')
  const [offerReceive, setOfferReceive] = useState<ResourceCard>('brick')
  const [offerGiveCount, setOfferGiveCount] = useState(1)
  const [offerReceiveCount, setOfferReceiveCount] = useState(1)
  const [isChatActing, setIsChatActing] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  useEffect(() => {
    if (!location) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const { gameId, playerId } = location

    async function updateChat() {
      try {
        const result = await apiRequest<{ messages: ChatMessageDto[] }>(
          `/games/${gameId}/chat?playerId=${playerId}`, { signal: abort.signal },
        )
        if (!abort.signal.aborted) {
          setChatMessages(result.messages)
          setChatError(null)
        }
      } catch (cause) {
        if (!abort.signal.aborted) {
          setChatError(cause instanceof Error ? cause.message : String(cause))
        }
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void updateChat(), 3000)
    }

    void updateChat()
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [location])

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!location || isChatActing) return
    if (chatMode === 'offer' && !canOfferTrade) return
    const request: ChatRequestDto = chatMode === 'message'
      ? { text: chatText.trim() }
      : {
        recipientId: Number(offerRecipient),
        give: offerGive,
        giveCount: offerGiveCount,
        receive: offerReceive,
        receiveCount: offerReceiveCount,
      }
    setIsChatActing(true)
    setChatError(null)
    try {
      const result = await apiRequest<{ messages: ChatMessageDto[] }>(
        `/games/${location.gameId}/chat?playerId=${location.playerId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
      )
      setChatMessages(result.messages)
      setChatText('')
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsChatActing(false)
    }
  }

  async function decideOffer(messageId: number, decision: 'accept' | 'decline') {
    if (!location || isChatActing) return
    setIsChatActing(true)
    setChatError(null)
    try {
      const result = await apiRequest<{
        messages: ChatMessageDto[];
        state: GameSessionDto;
      }>(`/games/${location.gameId}/chat/${messageId}/${decision}?playerId=${location.playerId}`, {
        method: 'POST',
      })
      setChatMessages(result.messages)
      onState(result.state)
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsChatActing(false)
    }
  }

  function reset(forReplay = false) {
    setChatMessages([])
    setChatError(null)
    if (forReplay) {
      setChatText('')
      setChatMode('message')
    }
  }

  return {
    chatMessages, chatText, setChatText, chatMode, setChatMode,
    offerRecipient, setOfferRecipient, offerGive, setOfferGive, offerReceive, setOfferReceive,
    offerGiveCount, setOfferGiveCount, offerReceiveCount, setOfferReceiveCount,
    isChatActing, chatError, submitChat, decideOffer, reset,
  }
}
