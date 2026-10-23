import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { WebGpuCanvas } from './components/WebGpuCanvas'
import type {
  BuildKind, BuildTargetsDto, GameIdentityDto, GameSessionDto, JoinedPlayerDto,
  PlacementKind, PlayDevCardRequestDto, ResourceCard, TradeRequestDto,
} from './game/api-types'
import { createDemoScene, type GameScene } from './game/demo-scene'
import './App.css'

const MIN_PLAYERS = 1
const MAX_PLAYERS = 5

const BUILD_ACTIONS: { kind: BuildKind, label: string, cost: string }[] = [
  { kind: 'road', label: 'Build road', cost: '🌲 1 wood + 🧱 1 brick' },
  { kind: 'settlement', label: 'Build settlement', cost: '🌲 1 wood + 🧱 1 brick + 🐑 1 sheep + 🌾 1 wheat' },
  { kind: 'city', label: 'Upgrade to city', cost: '🪨 3 ore + 🌾 2 wheat' },
]

const RESOURCES: { kind: ResourceCard, label: string }[] = [
  { kind: 'wood', label: '🌲 Wood' },
  { kind: 'brick', label: '🧱 Brick' },
  { kind: 'sheep', label: '🐑 Sheep' },
  { kind: 'wheat', label: '🌾 Wheat' },
  { kind: 'ore', label: '🪨 Ore' },
]

type PendingPlacement = { kind: PlacementKind, targets: number[], context: string }

function placementPath(kind: PlacementKind): string {
  return kind === 'thief' ? 'thief' : `build/${kind}`
}

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
  const [tradeContext, setTradeContext] = useState<string | null>(null)
  const [tradeGive, setTradeGive] = useState<ResourceCard>('wood')
  const [tradeReceive, setTradeReceive] = useState<ResourceCard>('brick')
  const [cardChoice, setCardChoice] = useState<{ index: number, context: string } | null>(null)
  const [cardResource, setCardResource] = useState<ResourceCard>('wood')
  const [secondCardResource, setSecondCardResource] = useState<ResourceCard>('wood')
  const gameRevision = useRef(0)
  const placementContext = JSON.stringify(game?.turn)
  const setupKind = game?.turn.started && game.turn.currentPlayer === location?.playerId
    ? game.turn.setup?.kind : undefined
  const setupRound = game?.turn.setup?.round
  const requiredKind = setupKind ?? (
    game && game.turn.currentPlayer === location?.playerId
      ? game.turn.thiefMovePending ? 'thief' : game.turn.freeRoadsRemaining ? 'road' : undefined
      : undefined
  )

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
      const revision = gameRevision.current
      try {
        const result = await apiRequest<{ players: JoinedPlayerDto[], state: GameSessionDto }>(
          `/games/${gameId}/players/${playerId}/heartbeat`,
          { method: 'POST', signal: abort.signal },
        )
        if (abort.signal.aborted) return
        setPlayers(result.players)
        if (revision === gameRevision.current && revision % 2 === 0) setGame(result.state)
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

  useEffect(() => {
    if (!location || !requiredKind) return
    const abort = new AbortController()
    const { gameId, playerId } = location
    const kind = requiredKind
    async function loadSetupTargets() {
      try {
        const { targets } = await apiRequest<BuildTargetsDto>(
          `/games/${gameId}/${placementPath(kind)}/targets?playerId=${playerId}`,
          { signal: abort.signal },
        )
        if (!abort.signal.aborted) {
          setPlacement({ kind, targets, context: placementContext })
        }
      } catch (cause) {
        if (!abort.signal.aborted) {
          setActionError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    }
    void loadSetupTargets()
    return () => abort.abort()
  }, [location, requiredKind, setupRound, placementContext])

  const placeBuilding = useCallback(async (kind: PlacementKind, target: number) => {
    if (!location || gameRevision.current % 2 !== 0) return
    setPlacement(null)
    setIsActing(true)
    setActionError(null)
    gameRevision.current++
    try {
      const session = await apiRequest<GameSessionDto>(
        `/games/${location.gameId}/${placementPath(kind)}?playerId=${location.playerId}`,
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
      gameRevision.current++
      setIsActing(false)
    }
  }, [location])

  const isPlacing = !!placement && !!game?.turn.started
    && placement.context === placementContext
    && game.turn.currentPlayer === location?.playerId
    && (!game.turn.setup || placement.kind === game.turn.setup.kind)
    && (game.turn.thiefMovePending ? placement.kind === 'thief' : placement.kind !== 'thief')

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
    setTradeContext(null)
    setCardChoice(null)
    setLocation(next)
  }

  async function choosePlacement(kind: PlacementKind) {
    if (!location) return
    setTradeContext(null)
    setCardChoice(null)
    if (isPlacing && placement?.kind === kind) {
      setPlacement(null)
      return
    }
    setIsActing(true)
    setActionError(null)
    setPlacement(null)
    try {
      const { targets } = await apiRequest<BuildTargetsDto>(
        `/games/${location.gameId}/${placementPath(kind)}/targets?playerId=${location.playerId}`,
      )
      setPlacement({ kind, targets, context: placementContext })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsActing(false)
    }
  }

  async function gameAction(
    action: 'start' | 'dev-card' | 'end-turn' | 'trade' | `dev-card/${number}/play`,
    request?: TradeRequestDto | PlayDevCardRequestDto,
  ) {
    if (!location || gameRevision.current % 2 !== 0) return
    setIsActing(true)
    setActionError(null)
    setPlacement(null)
    setTradeContext(null)
    setCardChoice(null)
    gameRevision.current++
    try {
      const session = await apiRequest<GameSessionDto>(
        `/games/${location.gameId}/${action}?playerId=${location.playerId}`, {
          method: 'POST',
          ...(request && {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          }),
        },
      )
      setGame(session)
      setPlayers(session.joinedPlayers)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      gameRevision.current++
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
  const resourceCount = (kind: ResourceCard) =>
    currentPlayer?.resources.filter((resource) => resource === kind).length ?? 0
  const isTrading = tradeContext === placementContext
  const selectedCard = cardChoice?.context === placementContext
    ? currentPlayer?.devCards[cardChoice.index] : undefined

  return (
    <main className="app">
      <aside className="sidebar">
        <h1>Game {location.gameId}</h1>
        {currentPlayer && <p>Playing as <strong>{currentPlayer.name}</strong></p>}
        {game && <p className="created-at">Created {new Date(game.createdAt).toLocaleString()}</p>}
        {game && (turnPlayer ? (
          <p className="turn-status">
            {turn?.setup ? `Setup round ${turn.setup.round}` : `Turn ${turn?.turnNumber}`}:{' '}
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
                        disabled={isActing || card.used || card.unavailableReason !== null}
                        title={card.unavailableReason ?? `Click to play ${card.name}`}
                        onClick={() => {
                          if (card.name === 'Monopoly' || card.name === 'Year of Plenty') {
                            setPlacement(null)
                            setTradeContext(null)
                            setActionError(null)
                            setCardResource('wood')
                            setSecondCardResource('wood')
                            setCardChoice({ index, context: placementContext })
                          } else {
                            void gameAction(`dev-card/${index}/play`, { resources: [] })
                          }
                        }}>
                        <span>{card.name}</span>
                        <small>{card.used ? 'Used' : card.unavailableReason ? 'Unavailable' : 'Play'}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="empty-cards">No development cards</p>}
              <p className="card-legend">Gray: unavailable · Green: playable · Red: used</p>
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
          <h2>{turn.setup ? `Starting placements: round ${turn.setup.round}` : 'Your turn'}</h2>
          <p className="dice-result">
            {turn.setup
              ? turn.setup.kind === 'settlement'
                ? 'Place your starting settlement.'
                : 'Place a road connected to the settlement you just placed.'
              : turn.diceRoll === null ? 'Waiting for the automatic dice roll...' : `🎲 You rolled ${turn.diceRoll}.`}
          </p>
          <div className="action-buttons">
            {turn.setup ? (
              <button disabled={isActing}
                title="Free starting placement"
                className={isPlacing ? 'placing' : undefined}
                onClick={() => { if (turn.setup) void choosePlacement(turn.setup.kind) }}>
                {isPlacing ? 'Cancel' : `Place ${turn.setup.kind}`}
              </button>
            ) : turn.thiefMovePending ? (
              <button disabled={isActing}
                className={isPlacing ? 'placing' : undefined}
                onClick={() => void choosePlacement('thief')}>
                {isPlacing ? 'Cancel' : 'Move thief'}
              </button>
            ) : turn.freeRoadsRemaining > 0 ? (
              <button disabled={isActing}
                className={isPlacing ? 'placing' : undefined}
                onClick={() => void choosePlacement('road')}>
                {isPlacing ? 'Cancel' : 'Place free road'} ({turn.freeRoadsRemaining} remaining)
              </button>
            ) : <>
            {BUILD_ACTIONS.map(({ kind, label, cost }) => (
              <span className="cost-action" key={kind}>
                <button disabled={isActing || turn.diceRoll === null}
                  className={isPlacing && placement?.kind === kind ? 'placing' : undefined}
                  aria-describedby={`cost-${kind}`}
                  onClick={() => void choosePlacement(kind)}>
                  {isPlacing && placement?.kind === kind ? 'Cancel' : label}
                </button>
                <span className="cost-tooltip" role="tooltip" id={`cost-${kind}`}>
                  <strong>Building cost</strong>{cost}
                </span>
              </span>
            ))}
            <span className="cost-action">
              <button disabled={isActing || turn.diceRoll === null}
                aria-describedby="cost-dev-card"
                onClick={() => void gameAction('dev-card')}>Buy development card</button>
              <span className="cost-tooltip" role="tooltip" id="cost-dev-card">
                <strong>Card cost</strong>🐑 1 sheep + 🌾 1 wheat + 🪨 1 ore
              </span>
            </span>
            <button disabled={isActing || turn.diceRoll === null}
              aria-expanded={isTrading} aria-controls="bank-trade"
              onClick={() => {
                setPlacement(null)
                setCardChoice(null)
                setActionError(null)
                const give = RESOURCES.find(({ kind }) => resourceCount(kind) >= 4)?.kind ?? 'wood'
                setTradeGive(give)
                setTradeReceive(give === 'wood' ? 'brick' : 'wood')
                setTradeContext(isTrading ? null : placementContext)
              }}>Trade (4 for 1)</button>
            <button className="end-turn" disabled={isActing || turn.diceRoll === null}
              onClick={() => void gameAction('end-turn')}>Next turn</button>
            </>}
          </div>
          {turn.thiefMovePending && (
            <p>Move the thief to another tile. Each player with a settlement or city there
              loses half their resource cards (rounded down) if they have more than seven.</p>
          )}
          {turn.freeRoadsRemaining > 0 && <p>Place up to two connected roads for free.
            Click a highlighted road slot. The second road can extend the first.</p>}
          {isTrading && !turn.setup && !turn.thiefMovePending && !turn.freeRoadsRemaining && (
            <form id="bank-trade" className="trade-form" onSubmit={(event) => {
              event.preventDefault()
              void gameAction('trade', { give: tradeGive, receive: tradeReceive })
            }}>
              <p>Exchange 4 matching resources for 1 of your choice.</p>
              <label htmlFor="trade-give">Give 4</label>
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
                  <option key={kind} value={kind} disabled={resourceCount(kind) < 4}>
                    {label} ({resourceCount(kind)} available)
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
              {resourceCount(tradeGive) < 4 && <p>You need at least 4 of one resource to trade.</p>}
              <button disabled={isActing || turn.diceRoll === null
                || resourceCount(tradeGive) < 4 || tradeGive === tradeReceive}>Confirm trade</button>
            </form>
          )}
          {isPlacing && <p className="placement-hint">Click a highlighted slot on the board.</p>}
          {actionError && <p role="alert">{actionError}</p>}
        </aside>
      )}
    </main>
  )
}

export default App
