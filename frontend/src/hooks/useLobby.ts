import { useState, type FormEvent } from 'react'
import { apiRequest } from '../game/api'
import type { GameIdentityDto } from '../game/api-types'
import type { GameLocation } from '../game/location'

export function useLobby(navigate: (location: GameLocation) => void) {
  const [name, setName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [playerCount, setPlayerCount] = useState(4)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enterGame(event: FormEvent<HTMLFormElement>, joining: boolean) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      const identity = await apiRequest<GameIdentityDto>(
        joining ? `/games/${joinId}/players` : '/games',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(joining ? { name } : { name, playerCount }),
        },
      )
      navigate(identity)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsSubmitting(false)
    }
  }


  return { name, setName, joinId, setJoinId, playerCount, setPlayerCount, isSubmitting, error, enterGame }
}
