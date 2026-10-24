import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server
const components = {}
let apiRequest
let placementPath
let readLocation
const location = { gameId: '1234', playerId: 0 }
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  })
  for (const name of [
    'GameScreen', 'GameBoard', 'GameStatus', 'TurnActions', 'ObservationControls',
    'PlayerCards', 'DevelopmentCardChoice', 'BankTradeForm', 'ChatMessages',
    'ChatPanel', 'GameResult', 'Dice',
  ]) {
    const module = await server.ssrLoadModule(`/src/components/game/${name}.tsx`)
    components[name] = module[name]
  }
  ;({ Lobby: components.Lobby } = await server.ssrLoadModule('/src/components/lobby/Lobby.tsx'))
  ;({ apiRequest, placementPath } = await server.ssrLoadModule('/src/game/api.ts'))
  ;({ readLocation } = await server.ssrLoadModule('/src/game/location.ts'))
})

after(async () => {
  await server?.close()
})

function controller(overrides = {}) {
  const resources = ['wood', 'wood', 'wood', 'wood', 'brick']
  const player = {
    id: 0, name: 'Alice', color: 'blue', isAi: false, points: 2,
    resources, devCards: [], hasLongestRoad: false, hasLargestArmy: false,
    knightsPlayed: 0, settlementObjective: null,
    tradeRates: { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 },
  }
  const opponent = { ...player, id: 1, name: 'Bob', color: 'red', resources: [] }
  const turn = {
    started: true, observationMode: false, currentPlayer: 0, turnNumber: 1,
    diceRoll: 6, diceValues: [3, 3], winner: null, winningPoints: 7,
    thiefMovePending: false, freeRoadsRemaining: 0, setup: null,
  }
  return {
    game: { gameId: '1234', createdAt: '2026-10-24T10:00:00Z', players: [player, opponent], turn },
    players: [player], currentPlayer: player, connectedPlayers: [player],
    turn, turnPlayer: player, winner: undefined,
    isMyTurn: true, isHost: true, emptySlots: 1, canOfferTrade: true,
    isActing: false, isPlacing: false, isTrading: false, observationMode: true,
    showGameResult: false, showKnightProgress: true,
    cardChoice: null, selectedCard: undefined, cardResource: 'wood', secondCardResource: 'wood',
    tradeGive: 'wood', tradeReceive: 'brick', generalTradeRate: 4,
    resourceCount: (kind) => resources.filter((resource) => resource === kind).length,
    tradeRate: () => 4,
    gameAction: noop, choosePlacement: noop, chooseDevelopmentCard: noop,
    setTradeContext: noop, setTradeGive: noop, setTradeReceive: noop,
    setCardChoice: noop, setCardResource: noop, setSecondCardResource: noop,
    setObservationMode: noop, setIsViewingFinalBoard: noop, openTrade: noop, navigate: noop,
    chat: {
      chatMessages: [], chatMode: 'message', chatText: '', isChatActing: false,
      offerRecipient: '', offerGive: 'wood', offerReceive: 'brick',
      offerGiveCount: 1, offerReceiveCount: 1,
      setChatText: noop, setChatMode: noop, setOfferRecipient: noop, setOfferGive: noop,
      setOfferReceive: noop, setOfferGiveCount: noop, setOfferReceiveCount: noop,
      submitChat: noop, decideOffer: noop,
    },
    ...overrides,
  }
}

function render(name, state = controller(), extra = {}) {
  return renderToStaticMarkup(createElement(components[name], { controller: state, location, ...extra }))
}

test('lobby retains create/join constraints, pending state and errors', () => {
  const html = render('Lobby', undefined, {
    lobby: {
      name: 'Alice', joinId: '1234', playerCount: 4, isSubmitting: true,
      error: 'Game full', setName: noop, setJoinId: noop, setPlayerCount: noop, enterGame: noop,
    },
  })
  assert.match(html, /min="1" max="5"/)
  assert.match(html, /pattern="\[1-9\]\[0-9\]\{3\}"/)
  assert.match(html, /disabled="">New game/)
  assert.match(html, /disabled="">Join game/)
  assert.match(html, /role="status">Joining game/)
  assert.match(html, /role="alert">Game full/)
})

test('host lobby controls and connected player details remain visible', () => {
  const state = controller({ turnPlayer: undefined })
  state.game.turn.started = false
  const html = render('GameScreen', state)
  assert.match(html, /Game 1234/)
  assert.match(html, /Start with AI players/)
  assert.match(html, /Observation mode \(automate every player\)/)
  assert.match(html, /Connected players \(1\)/)
  assert.match(html, /Alice \(you\)/)
  assert.match(html, /aria-label="Game board"/)
  assert.match(html, /aria-label="Game chat"/)
})

test('manual turn controls distinguish setup, thief, free roads and normal building', () => {
  const state = controller()
  const normal = render('TurnActions', state)
  assert.match(normal, /Build road/)
  assert.match(normal, /Upgrade to city/)
  assert.match(normal, /Buy development card/)
  assert.match(normal, /Trade \(4 for 1\)/)
  for (const [turn, expected] of [
    [{ setup: { kind: 'settlement', round: 1 } }, 'Place settlement'],
    [{ setup: { kind: 'road', round: 2 } }, 'Place road'],
    [{ thiefMovePending: true }, 'Move thief'],
    [{ freeRoadsRemaining: 2 }, 'Place free road'],
  ]) {
    const html = render('TurnActions', { ...state, turn: { ...state.turn, ...turn } })
    assert.ok(html.includes(expected))
    assert.doesNotMatch(html, /Buy development card/)
  }
  assert.equal(render('TurnActions', { ...state, isMyTurn: false }), '')
  assert.equal(render('TurnActions', { ...state, turn: { ...state.turn, observationMode: true } }), '')
})

test('observation controls replace manual actions and show the planned settlement', () => {
  const state = controller()
  state.turn.observationMode = true
  state.turnPlayer.settlementObjective = { nodeId: 9, expectedResourcesPerTurn: 0.25 }
  const html = render('ObservationControls', state)
  assert.match(html, /Observing Alice/)
  assert.match(html, /Target: node 9 \(0.250 resources\/turn\)/)
  assert.match(html, /Next turn/)
  assert.equal(render('ObservationControls', { ...state, winner: state.currentPlayer }), '')
})

test('bank trading retains port rates and affordability constraints', () => {
  const state = controller({ isTrading: true, tradeRate: () => 2 })
  const html = render('BankTradeForm', state)
  assert.match(html, /Exchange 2 matching resources/)
  assert.match(html, /2 for 1; 4 available/)
  assert.match(html, /<button>Confirm trade<\/button>/)
  const unaffordable = render('BankTradeForm', { ...state, resourceCount: () => 0 })
  assert.match(unaffordable, /You need at least 2 wood/)
  assert.match(unaffordable, /disabled="">Confirm trade/)
  assert.equal(render('BankTradeForm', { ...state, turn: { ...state.turn, thiefMovePending: true } }), '')
})

test('development cards retain used, unavailable and playable states', () => {
  const state = controller()
  state.currentPlayer.devCards = [
    { name: 'Knight', used: true, unavailableReason: 'Already used.' },
    { name: 'Monopoly', used: false, unavailableReason: 'Wait until next turn.' },
    { name: 'Year of Plenty', used: false, unavailableReason: null },
  ]
  const html = render('PlayerCards', state)
  assert.match(html, /card-used/)
  assert.match(html, /card-unavailable/)
  assert.match(html, /card-playable/)
  assert.match(html, /Wait until next turn/)
  assert.doesNotMatch(html, /Bob development cards/)
  const selected = {
    ...state, cardChoice: { index: 2, context: 'turn' },
    selectedCard: state.currentPlayer.devCards[2],
  }
  assert.match(render('DevelopmentCardChoice', selected), /Second resource/)
  selected.selectedCard = { name: 'Monopoly', unavailableReason: null }
  assert.doesNotMatch(render('DevelopmentCardChoice', selected), /Second resource/)
})

test('chat retains messages, action logs and recipient-only trade decisions', () => {
  const state = controller()
  state.chat.chatMessages = [
    { id: 0, kind: 'message', senderId: 1, recipientId: null, text: 'Hello!' },
    { id: 1, kind: 'action', senderId: 1, recipientId: null, text: 'Bob built a road.' },
    {
      id: 2, kind: 'message', senderId: 1, recipientId: 0,
      give: 'wood', giveCount: 2, receive: 'ore', receiveCount: 1, status: 'pending',
    },
  ]
  const html = render('ChatMessages', state)
  assert.match(html, /Hello!/)
  assert.match(html, /action-log/)
  assert.match(html, /Bob built a road/)
  assert.match(html, /2 wood for 1 ore/)
  assert.match(html, /Accept/)
  assert.match(html, /Decline/)
  assert.doesNotMatch(render('ChatMessages', state, { location: { ...location, playerId: 2 } }), /Accept/)
  state.chat.chatMode = 'offer'
  state.canOfferTrade = false
  const offer = render('ChatPanel', state)
  assert.match(offer, /Trade offers can be sent on your turn/)
  assert.match(offer, /disabled="">Send offer/)
})

test('result dialog keeps victory, defeat, replay and inert background behavior', () => {
  const state = controller({ showGameResult: true })
  state.winner = { ...state.currentPlayer, points: 7 }
  const html = render('GameScreen', state)
  assert.match(html, /role="dialog" aria-modal="true"/)
  assert.match(html, /Victory!/)
  assert.match(html, /Alice wins with 7 points!/)
  assert.match(html, /See board/)
  assert.match(html, /inert=""/)
  assert.match(render('GameResult', state, { location: { ...location, playerId: 1 } }), /Defeat/)
})

test('board loading and dice preserve accessible status text', () => {
  assert.match(render('GameBoard', controller({ game: null })), /role="status">Loading game/)
  assert.match(render('GameBoard', controller({ game: null, error: 'Game not found' })), /role="alert">Game not found/)
  assert.match(render('Dice', undefined, { values: [2, 5], total: 7 }), /aria-label="Dice: 2 and 5, total 7"/)
})

test('player URLs and placement endpoints keep their existing formats', () => {
  assert.deepEqual(readLocation('/games/1234/players/0'), location)
  assert.deepEqual(readLocation('/games/9999/players/4/'), { gameId: '9999', playerId: 4 })
  for (const pathname of ['/', '/games/123/players/0', '/games/0123/players/0', '/games/1234/players/5']) {
    assert.equal(readLocation(pathname), null)
  }
  assert.equal(placementPath('thief'), 'thief')
  for (const kind of ['road', 'settlement', 'city']) assert.equal(placementPath(kind), `build/${kind}`)
})

test('shared API requests preserve payloads and surface server errors', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const options = { method: 'POST', body: '{"target":3}' }
  globalThis.fetch = async (url, requestOptions) => {
    assert.equal(url, '/api/games/1234/build/road')
    assert.equal(requestOptions, options)
    return { ok: true, json: async () => ({ target: 3 }) }
  }
  assert.deepEqual(await apiRequest('/games/1234/build/road', options), { target: 3 })
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ detail: 'Not enough resources.' }) })
  await assert.rejects(apiRequest('/games/1234/trade'), /Not enough resources/)
  globalThis.fetch = async () => ({
    ok: false, status: 422, statusText: 'Unprocessable Entity', json: async () => ({ detail: [] }),
  })
  await assert.rejects(apiRequest('/games'), /Request failed: 422 Unprocessable Entity/)
})
