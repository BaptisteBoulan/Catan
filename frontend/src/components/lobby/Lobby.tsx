import type { useLobby } from '../../hooks/useLobby'
import { LobbyBackdrop } from './LobbyBackdrop'

const MIN_PLAYERS = 1
const MAX_PLAYERS = 5

export function Lobby({ lobby }: { lobby: ReturnType<typeof useLobby> }) {
  const { name, setName, joinId, setJoinId, playerCount, setPlayerCount, isSubmitting, error, enterGame } = lobby
  return (
    <main className="lobby">
      <LobbyBackdrop />
      <section className="lobby-card">
        <h1>Catan</h1>
        <label htmlFor="player-name">Your name (optional)</label>
        <input id="player-name" value={name} maxLength={40}
          placeholder="Choose your name"
          onChange={(event) => setName(event.target.value)} disabled={isSubmitting} />
        <form onSubmit={(event) => void enterGame(event, false)}>
          <label htmlFor="player-count">Player slots</label>
          <input id="player-count" type="number" min={MIN_PLAYERS} max={MAX_PLAYERS}
            value={playerCount} required disabled={isSubmitting}
            onChange={(event) => setPlayerCount(Number(event.target.value))} />
          <button disabled={isSubmitting}>New game</button>
        </form>
        <form onSubmit={(event) => void enterGame(event, true)}>
          <label htmlFor="join-id">Game ID</label>
          <input id="join-id" inputMode="numeric" pattern="[1-9][0-9]{3}"
            minLength={4} maxLength={4} placeholder="1234" value={joinId} required
            onChange={(event) => setJoinId(event.target.value)} disabled={isSubmitting} />
          <button disabled={isSubmitting}>Join game</button>
        </form>
        {isSubmitting && <p role="status">Joining game...</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  )
}
