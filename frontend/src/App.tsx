import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { WebGpuCanvas } from './components/WebGpuCanvas'
import type {
  BuildKind, BuildTargetsDto, GameIdentityDto, GameSessionDto, JoinedPlayerDto, TurnDto,
} from './game/api-types'
import { createDemoScene, type GameScene } from './game/demo-scene'
import './App.css'

const MIN_PLAYERS = 1
const MAX_PLAYERS = 5

const BUILD_ACTIONS: { kind: BuildKind, label: string, cost: string }[] = [
  { kind: 'road', label: 'Build road', cost: '1 wood and 1 brick' },
  { kind: 'settlement', label: 'Build settlement', cost: '1 wood, 1 brick, 1 sheep and 1 wheat' },
  { kind: 'city', label: 'Upgrade to city', cost: '3 ore and 2 wheat' },
]

type PendingPlacement = { kind: BuildKind, targets: number[] }

type GameLocation = Pick<GameIdentityDto, 'gameId' | 'playerId'>

function readLocation(): GameLocation | null {
  const match = /^\/games\/([1-9]\d{3})\/players\/([0-4])\/?$/.exec(window.location.pathname)
  return match ? { gameId: match[1], playerId: Number(match[2]) } : null
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options)
  if (!response.ok) {
    const body: { detail?: unknown } = await response.json()
    throw new Error(typeof body.detail === 'string'
      ? body.detail
      : `Request failed: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

function App() {
  const [location, setLocation] = useState(readLocation)
  const [game, setGame] = useState<GameSessionDto | null>(null)
  const [players, setPlayers] = useState<JoinedPlayerDto[]>([])
  const [name, setName] = useState('')
  const [joinId, setJoinId] = useState('')
  const [playerCount, setPlayerCount] = useState(4)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [presenceError, setPresenceError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isActing, setIsActing] = useState(false)
  const [placement, setPlacement] = useState<PendingPlacement | null>(null)

  useEffect(() => {
    const onPopState = () => {
      setGame(null)
      setPlayers([])
      setError(null)
      setPresenceError(null)
      setLocation(readLocation())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!location) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const { gameId, playerId } = location

    async function updatePresence() {
      try {
        const result = await apiRequest<{ players: JoinedPlayerDto[], turn: TurnDto }>(
          `/games/${gameId}/players/${playerId}/heartbeat`,
          { method: 'POST', signal: abort.signal },
        )
        if (abort.signal.aborted) return
        setPlayers(result.players)
        setGame((current) => current && ({
          ...current,
          turn: result.turn,
          players: current.players.map((player) =>
            result.players.find((joinedPlayer) => joinedPlayer.id === player.id) ?? player),
        }))
        setPresenceError(null)
      } catch (cause) {
        if (abort.signal.aborted) return
        setPlayers([])
        setPresenceError(cause instanceof Error ? cause.message : String(cause))
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void updatePresence(), 3000)
    }

    async function loadGame() {
      try {
        const session = await apiRequest<GameSessionDto>(
          `/games/${gameId}?playerId=${playerId}`, { signal: abort.signal },
        )
        if (abort.signal.aborted) return
        setGame(session)
        setError(null)
        await updatePresence()
      } catch (cause) {
        if (!abort.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    }

    void loadGame()
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [location])

  const placeBuilding = useCallback(async (kind: BuildKind, target: number) => {
    if (!location) return
    setPlacement(null)
    setIsActing(true)
    setActionError(null)
    try {
      const session = await apiRequest<GameSessionDto>(
        `/games/${location.gameId}/build/${kind}?playerId=${location.playerId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target }),
        },
      )
      setGame(session)
      setPlayers(session.joinedPlayers)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsActing(false)
    }
  }, [location])

  const isPlacing = !!placement && !!game?.turn.started
    && game.turn.currentPlayer === location?.playerId

  const updateScene = useCallback((scene: GameScene, signal: AbortSignal) => {
    if (!game) throw new Error('No game loaded.')
    if (!isPlacing || !placement || !location) return scene.sync(game, signal)
    const { kind, targets } = placement
    return scene.sync(game, signal, {
      kind,
      targets,
      playerId: location.playerId,
      onPick: (target) => void placeBuilding(kind, target),
    })
  }, [game, isPlacing, placement, location, placeBuilding])

  function navigate(next: GameLocation | null) {
    window.history.pushState(null, '', next ? `/games/${next.gameId}/players/${next.playerId}` : '/')
    setGame(null)
    setPlayers([])
    setError(null)
    setPresenceError(null)
    setActionError(null)
    setPlacement(null)
    setLocation(next)
  }

  async function choosePlacement(kind: BuildKind) {
    if (!location) return
    if (placement?.kind === kind) {
      setPlacement(null)
      return
    }
    setIsActing(true)
    setActionError(null)
    setPlacement(null)
    try {
      const { targets } = await apiRequest<BuildTargetsDto>(
        `/games/${location.gameId}/build/${kind}/targets?playerId=${location.playerId}`,
      )
      setPlacement({ kind, targets })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsActing(false)
    }
  }

  async function gameAction(action: 'start' | 'roll' | 'dev-card' | 'end-turn') {
    if (!location) return
    setIsActing(true)
    setActionError(null)
    setPlacement(null)
    try {
      const session = await apiRequest<GameSessionDto>(
        `/games/${location.gameId}/${action}?playerId=${location.playerId}`, { method: 'POST' },
      )
      setGame(session)
      setPlayers(session.joinedPlayers)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsActing(false)
    }
  }

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

  if (!location) {
    return (
      <main className="lobby">
        <section className="lobby-card">
          <h1>Catan</h1>
          <label htmlFor="player-name">Your name</label>
          <input id="player-name" value={name} maxLength={40} required
            onChange={(event) => setName(event.target.value)} disabled={isSubmitting} />
          <form onSubmit={(event) => void enterGame(event, false)}>
            <label htmlFor="player-count">Player slots</label>
            <input id="player-count" type="number" min={MIN_PLAYERS} max={MAX_PLAYERS}
              value={playerCount} required disabled={isSubmitting}
              onChange={(event) => setPlayerCount(Number(event.target.value))} />
            <button disabled={isSubmitting || !name.trim()}>New game</button>
          </form>
          <form onSubmit={(event) => void enterGame(event, true)}>
            <label htmlFor="join-id">Game ID</label>
            <input id="join-id" inputMode="numeric" pattern="[1-9][0-9]{3}"
              minLength={4} maxLength={4} placeholder="1234" value={joinId} required
              onChange={(event) => setJoinId(event.target.value)} disabled={isSubmitting} />
            <button disabled={isSubmitting || !name.trim()}>Join game</button>
          </form>
          {isSubmitting && <p role="status">Joining game...</p>}
          {error && <p role="alert">{error}</p>}
        </section>
      </main>
    )
  }

  const currentPlayer = game?.players.find((player) => player.id === location.playerId)
  const connectedPlayers = players.filter((player) => player.connected)
  const turn = game?.turn
  const turnPlayer = turn?.started ? game?.players[turn.currentPlayer] : undefined
  const isMyTurn = !!turn?.started && turn.currentPlayer === location.playerId
  const isFull = !!game && players.length >= game.players.length
  const isHost = location.playerId === 0

  return (
    <main className="app">
      <aside className="sidebar">
        <h1>Game {location.gameId}</h1>
        {currentPlayer && <p>Playing as <strong>{currentPlayer.name}</strong></p>}
        {game && <p className="created-at">Created {new Date(game.createdAt).toLocaleString()}</p>}
        {game && (turnPlayer ? (
          <p className="turn-status">
            Turn {turn?.turnNumber}:{' '}
            <span className="player-color" style={{ backgroundColor: turnPlayer.color }} />
            <strong>{isMyTurn ? 'your turn' : turnPlayer.name}</strong>
          </p>
        ) : (
          <div className="turn-status">
            {!isFull ? <p>Waiting for players ({players.length}/{game.players.length})...</p>
              : isHost ? (
                <button disabled={isActing} onClick={() => void gameAction('start')}>Start game</button>
              ) : <p>Waiting for the host to start the game...</p>}
          </div>
        ))}
        <h2>Connected players ({connectedPlayers.length})</h2>
        <ul aria-label="Connected players">
          {connectedPlayers.map((player) => (
            <li key={player.id}>
              <span className="player-color" style={{ backgroundColor: player.color }} />
              {player.name}{player.id === location.playerId ? ' (you)' : ''}
            </li>
          ))}
        </ul>
        <h2>Player cards</h2>
        <div className="player-card-list">
          {game?.players.map((player) => player.id === location.playerId ? (
            <section className="player-card-panel" key={player.id}>
              <h3>
                <span className="player-color" style={{ backgroundColor: player.color }} />
                {player.name} (you)
              </h3>
              <p className="victory-points">{player.points} victory points</p>
              <h4>Resources</h4>
              {player.resources.length > 0 ? (
                <ul className="resource-card-list" aria-label={`${player.name} resource cards`}>
                  {player.resources.map((resource, index) => (
                    <li className={`resource-card resource-${resource}`} key={`${resource}-${index}`}>
                      {resource}
                    </li>
                  ))}
                </ul>
              ) : <p className="empty-cards">No resource cards</p>}
              <h4>Development cards</h4>
              {player.devCards.length > 0 ? (
                <ul className="dev-card-list" aria-label={`${player.name} development cards`}>
                  {player.devCards.map((card, index) => (
                    <li className="dev-card" style={{ backgroundColor: card.color }}
                      key={`${card.name}-${index}`}>
                      {card.name}
                    </li>
                  ))}
                </ul>
              ) : <p className="empty-cards">No development cards</p>}
            </section>
          ) : (
            <p className="player-list-name" key={player.id}>
              <span className="player-color" style={{ backgroundColor: player.color }} />
              {player.name}
            </p>
          ))}
        </div>
        {presenceError && <p role="alert">Connection lost: {presenceError}. Retrying...</p>}
        {actionError && !isMyTurn && <p role="alert">{actionError}</p>}
        <button onClick={() => navigate(null)}>Back to lobby</button>
      </aside>
      <section className="board-area" aria-label="Game board">
        {game ? <WebGpuCanvas createScene={createDemoScene} updateScene={updateScene} className="game-canvas" />
          : <p role={error ? 'alert' : 'status'}>{error ?? 'Loading game...'}</p>}
      </section>
      {isMyTurn && turn && (
        <aside className="action-panel" aria-label="Turn actions">
          <h2>Your turn</h2>
          <p className="dice-result">
            {turn.diceRoll === null ? 'Roll the dice to start your turn.' : `You rolled ${turn.diceRoll}.`}
          </p>
          <div className="action-buttons">
            <button disabled={isActing || turn.diceRoll !== null}
              onClick={() => void gameAction('roll')}>Roll dice</button>
            {BUILD_ACTIONS.map(({ kind, label, cost }) => (
              <button key={kind} disabled={isActing || turn.diceRoll === null}
                className={isPlacing && placement?.kind === kind ? 'placing' : undefined}
                title={`Costs ${cost}`}
                onClick={() => void choosePlacement(kind)}>
                {isPlacing && placement?.kind === kind ? 'Cancel' : label}
              </button>
            ))}
            <button disabled={isActing || turn.diceRoll === null}
              title="Costs 1 sheep, 1 wheat and 1 ore"
              onClick={() => void gameAction('dev-card')}>Buy development card</button>
            <button className="end-turn" disabled={isActing || turn.diceRoll === null}
              onClick={() => void gameAction('end-turn')}>Next turn</button>
          </div>
          {isPlacing && <p className="placement-hint">Click a highlighted slot on the board.</p>}
          {actionError && <p role="alert">{actionError}</p>}
        </aside>
      )}
    </main>
  )
}

export default App
