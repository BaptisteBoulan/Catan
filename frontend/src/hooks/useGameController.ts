import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BuildTargetsDto, GameSessionDto, JoinedPlayerDto, PlacementKind,
  PlayDevCardRequestDto, ResourceCard, TradeRequestDto,
} from '../game/api-types'
import type { GameScene } from '../game/demo-scene'
import { apiRequest, placementPath } from '../game/api'
import { readLocation, type GameLocation } from '../game/location'
import { useChat } from './useChat'
import { useLobby } from './useLobby'

/** Presence and game-state refresh period (2.5 times per second). */
const HEARTBEAT_INTERVAL_MS = 400
type PendingPlacement = { kind: PlacementKind, targets: number[], context: string }

export function useGameController() {
  const [location, setLocation] = useState(readLocation)
  const [game, setGame] = useState<GameSessionDto | null>(null)
  const [players, setPlayers] = useState<JoinedPlayerDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [presenceError, setPresenceError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isActing, setIsActing] = useState(false)
  const [observationMode, setObservationMode] = useState(true)
  const [isViewingFinalBoard, setIsViewingFinalBoard] = useState(false)
  const [placement, setPlacement] = useState<PendingPlacement | null>(null)
  const [tradeContext, setTradeContext] = useState<string | null>(null)
  const [tradeGive, setTradeGive] = useState<ResourceCard>('wood')
  const [tradeReceive, setTradeReceive] = useState<ResourceCard>('brick')
  const [cardChoice, setCardChoice] = useState<{ index: number, context: string } | null>(null)
  const [cardResource, setCardResource] = useState<ResourceCard>('wood')
  const [secondCardResource, setSecondCardResource] = useState<ResourceCard>('wood')
  const gameRevision = useRef(0)
  const placementContext = JSON.stringify(game?.turn)
  const setupKind = game?.turn.started && game.turn.winner === null && game.turn.currentPlayer === location?.playerId
    ? game.turn.setup?.kind : undefined
  const setupRound = game?.turn.setup?.round
  const requiredKind = game?.turn.observationMode ? undefined : setupKind ?? (
    game && game.turn.winner === null && game.turn.currentPlayer === location?.playerId
      ? game.turn.thiefMovePending ? 'thief' : game.turn.freeRoadsRemaining ? 'road' : undefined
      : undefined
  )

  useEffect(() => {
    const onPopState = () => {
      setIsViewingFinalBoard(false)
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
        if (revision === gameRevision.current && revision % 2 === 0) {
          setGame(result.state)
          if (result.state.turn.winner === null) setIsViewingFinalBoard(false)
        }
        setPresenceError(null)
      } catch (cause) {
        if (abort.signal.aborted) return
        setPlayers([])
        setPresenceError(cause instanceof Error ? cause.message : String(cause))
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void updatePresence(), HEARTBEAT_INTERVAL_MS)
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
    setIsViewingFinalBoard(false)
    window.history.pushState(null, '', next ? `/games/${next.gameId}/players/${next.playerId}` : '/')
    setGame(null)
    setPlayers([])
    setError(null)
    setPresenceError(null)
    setActionError(null)
    chat.reset()
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
    action: 'start' | 'play-again' | 'dev-card' | 'end-turn' | 'next-turn' | 'trade' | `dev-card/${number}/play`,
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
        `/games/${location.gameId}/${action}?playerId=${location.playerId}${action === 'start' ? `&observationMode=${observationMode}` : ''}`, {
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
        setIsViewingFinalBoard(false)
        chat.reset(true)
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      gameRevision.current++
      setIsActing(false)
    }
  }

  const currentPlayer = game?.players.find((player) => player.id === location?.playerId)
  const connectedPlayers = players.filter((player) => player.connected)
  const showKnightProgress = !game?.players.some((player) => player.hasLargestArmy)
  const turn = game?.turn
  const turnPlayer = turn?.started ? game?.players[turn.currentPlayer] : undefined
  const winner = turn?.winner != null ? game?.players[turn.winner] : undefined
  const showGameResult = !!winner && !isViewingFinalBoard
  const isMyTurn = !!turn?.started && !winner && turn.currentPlayer === location?.playerId
  const canOfferTrade = isMyTurn && turn?.diceRoll !== null && !turn.setup
    && !turn.thiefMovePending && turn.freeRoadsRemaining === 0
  const emptySlots = game ? game.players.length - players.length : 0
  const isHost = location?.playerId === 0
  const resourceCount = (kind: ResourceCard) =>
    currentPlayer?.resources.filter((resource) => resource === kind).length ?? 0
  const tradeRate = (kind: ResourceCard) => currentPlayer?.tradeRates[kind] ?? 4
  const generalTradeRate = game?.board.ports.some(
    (port) => port.owner === location?.playerId && port.resource === null,
  ) ? 3 : 4
  const openTrade = (give: ResourceCard) => {
    setPlacement(null)
    setCardChoice(null)
    setActionError(null)
    setTradeGive(give)
    setTradeReceive(give === 'wood' ? 'brick' : 'wood')
    setTradeContext(placementContext)
  }
  const isTrading = tradeContext === placementContext
  const selectedCard = cardChoice?.context === placementContext
    ? currentPlayer?.devCards[cardChoice.index] : undefined

  function chooseDevelopmentCard(index: number) {
    const card = currentPlayer?.devCards[index]
    if (!card) throw new Error('Development card not found.')
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
  }

  const chat = useChat(location, canOfferTrade, (session) => {
    setGame(session)
    setPlayers(session.joinedPlayers)
  })
  const lobby = useLobby(navigate)

  return {
    location,
    game,
    players,
    error,
    presenceError,
    actionError,
    isActing,
    observationMode,
    setObservationMode,
    setIsViewingFinalBoard,
    placement,
    setTradeContext,
    tradeGive,
    setTradeGive,
    tradeReceive,
    setTradeReceive,
    cardChoice,
    setCardChoice,
    cardResource,
    setCardResource,
    secondCardResource,
    setSecondCardResource,
    isPlacing,
    updateScene,
    navigate,
    choosePlacement,
    chooseDevelopmentCard,
    gameAction,
    currentPlayer,
    connectedPlayers,
    showKnightProgress,
    turn,
    turnPlayer,
    winner,
    showGameResult,
    isMyTurn,
    canOfferTrade,
    emptySlots,
    isHost,
    resourceCount,
    tradeRate,
    generalTradeRate,
    openTrade,
    isTrading,
    selectedCard,
    chat,
    lobby,
  }
}

export type GameController = ReturnType<typeof useGameController>
