import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { WebGpuCanvas } from './components/WebGpuCanvas'
import type {
  BuildKind, BuildTargetsDto, ChatMessageDto, ChatRequestDto, GameIdentityDto,
  GameSessionDto, JoinedPlayerDto, PlacementKind, PlayDevCardRequestDto,
  ResourceCard, TradeRequestDto,
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

const DIE_PIPS = [
  [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8],
]

function Dice({ values, total }: { values: [number, number], total: number }) {
  return (
    <div className="dice-result" role="img"
      aria-label={`Dice: ${values[0]} and ${values[1]}, total ${total}`}>
      {values.map((value, index) => (
        <svg key={index} className="die-face" viewBox="0 0 30 30" aria-hidden="true">
          <rect x="1" y="1" width="28" height="28" rx="5" />
          {DIE_PIPS[value - 1].map((pip) => (
            <circle key={pip} cx={7 + (pip % 3) * 8} cy={7 + Math.floor(pip / 3) * 8} r="2.2" />
          ))}
        </svg>
      ))}
      <strong aria-hidden="true">= {total}</strong>
    </div>
  )
}

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
  const [cardChoice, setCardChoice] = useState<{ index: number, context: string } | null>(null)
  const [cardResource, setCardResource] = useState<ResourceCard>('wood')
  const [secondCardResource, setSecondCardResource] = useState<ResourceCard>('wood')
  const gameRevision = useRef(0)
  const placementContext = JSON.stringify(game?.turn)
  const setupKind = game?.turn.started && game.turn.winner === null && game.turn.currentPlayer === location?.playerId
    ? game.turn.setup?.kind : undefined
  const setupRound = game?.turn.setup?.round
  const requiredKind = setupKind ?? (
    game && game.turn.winner === null && game.turn.currentPlayer === location?.playerId
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
    && game.turn.winner === null
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
    setChatError(null)
    setChatMessages([])
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
    action: 'start' | 'play-again' | 'dev-card' | 'end-turn' | 'trade' | `dev-card/${number}/play`,
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
      if (action === 'play-again') {
        setChatMessages([])
        setChatText('')
        setChatMode('message')
        setChatError(null)
      }
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
      setGame(result.state)
      setPlayers(result.state.joinedPlayers)
    } catch (cause) {
      setChatError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setIsChatActing(false)
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
  const winner = turn?.winner != null ? game?.players[turn.winner] : undefined
  const isMyTurn = !!turn?.started && !winner && turn.currentPlayer === location.playerId
  const canOfferTrade = isMyTurn && turn?.diceRoll !== null && !turn.setup
    && !turn.thiefMovePending && turn.freeRoadsRemaining === 0
  const isFull = !!game && players.length >= game.players.length
  const isHost = location.playerId === 0
  const resourceCount = (kind: ResourceCard) =>
    currentPlayer?.resources.filter((resource) => resource === kind).length ?? 0
  const isTrading = tradeContext === placementContext
  const selectedCard = cardChoice?.context === placementContext
    ? currentPlayer?.devCards[cardChoice.index] : undefined

  return (
    <main className="app">
      {winner && (
        <div className="game-result-backdrop">
          <section className="game-result" role="dialog" aria-modal="true"
            aria-labelledby="game-result-title" aria-describedby="game-result-description">
            <h1 id="game-result-title">{winner.id === location.playerId ? 'Victory!' : 'Defeat'}</h1>
            <p id="game-result-description">
              {winner.name} wins with {winner.points} points!
            </p>
            <p>Play again in the same lobby with the same players.</p>
            <button autoFocus disabled={isActing} onClick={() => void gameAction('play-again')}>
              {isActing ? 'Returning to lobby...' : 'Play again'}
            </button>
            {actionError && <p role="alert">{actionError}</p>}
          </section>
        </div>
      )}
      <aside className="sidebar" inert={!!winner}>
        <h1>Game {location.gameId}</h1>
        {currentPlayer && <p>Playing as <strong>{currentPlayer.name}</strong></p>}
        {game && <p className="created-at">Created {new Date(game.createdAt).toLocaleString()}</p>}
        {game && <p className="victory-points">First to {game.turn.winningPoints} points wins</p>}
        {game && (winner ? <p className="turn-status">{winner.name} wins!</p> : turnPlayer ? (
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
        {turn?.diceValues && turn.diceRoll !== null && (
          <Dice values={turn.diceValues} total={turn.diceRoll} />
        )}
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
      <section className="board-area" aria-label="Game board" inert={!!winner}>
        {game ? <WebGpuCanvas createScene={createDemoScene} updateScene={updateScene} className="game-canvas" />
          : <p role={error ? 'alert' : 'status'}>{error ?? 'Loading game...'}</p>}
      </section>
      <aside className="action-panel" aria-label="Turn actions and chat" inert={!!winner}>
        {isMyTurn && turn && (
          <section className="turn-actions">
          <h2>{turn.setup ? `Starting placements: round ${turn.setup.round}` : 'Your turn'}</h2>
          <p className="dice-result">
            {turn.setup
              ? turn.setup.kind === 'settlement'
                ? 'Place your starting settlement.'
                : 'Place a road connected to the settlement you just placed.'
              : turn.diceRoll === null ? 'Waiting for the automatic dice roll...' : `You rolled ${turn.diceRoll}.`}
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
          </section>
        )}
        <section className="chat-panel" aria-label="Game chat">
          <h2>Chat</h2>
          <div className="chat-messages" aria-live="polite">
            {chatMessages.length === 0
              ? <p className="empty-cards">No messages yet. Start the conversation!</p>
              : chatMessages.map((message) => {
                const sender = game?.players.find((player) => player.id === message.senderId)
                const recipient = game?.players.find((player) => player.id === message.recipientId)
                const isOffer = message.recipientId !== null
                return (
                  <article className={`chat-message${isOffer ? ' trade-offer' : ''}`} key={message.id}>
                    <p className="chat-message-author">
                      {sender?.name ?? `Player ${message.senderId + 1}`}
                      {isOffer && <> offers {recipient?.name ?? `Player ${Number(message.recipientId) + 1}`}</>}
                    </p>
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
              <div className="chat-offer-form">
                <label htmlFor="offer-recipient">Offer to</label>
                <select id="offer-recipient" value={offerRecipient}
                  onChange={(event) => setOfferRecipient(event.target.value)} required>
                  <option value="" disabled>Select a player</option>
                  {game?.players.filter((player) => player.id !== location.playerId).map((player) => (
                    <option key={player.id} value={player.id}>{player.name}</option>
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
            )}
            <button disabled={isChatActing || (chatMode === 'message'
              ? !chatText.trim()
              : !canOfferTrade || !offerRecipient || offerGive === offerReceive)}>Send {chatMode}</button>
          </form>
          {chatError && <p role="alert">{chatError}</p>}
        </section>
      </aside>
    </main>
  )
}

export default App
