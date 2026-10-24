import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let createDemoScene
const originalFetch = globalThis.fetch
const originalBufferUsage = globalThis.GPUBufferUsage

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  ;({ createDemoScene } = await server.ssrLoadModule('/src/game/demo-scene.ts'))
  globalThis.GPUBufferUsage = { VERTEX: 1, INDEX: 2, COPY_DST: 4 }
})

after(async () => {
  globalThis.fetch = originalFetch
  globalThis.GPUBufferUsage = originalBufferUsage
  await server?.close()
})

function gameState() {
  return {
    players: [{ id: 0, name: 'Alice', color: 'red', points: 1, resources: [], devCards: [] }],
    turn: {
      started: true, currentPlayer: 0, turnNumber: 1, diceRoll: null,
      setup: null, thiefMovePending: false,
    },
    board: {
      boardSize: 1,
      tiles: [{
        i: 0, j: 0, landscape: 6, diceNumber: null, nodes: [0, 1], isOccupiedByThief: true,
      }],
      nodes: [
        { id: 0, x: 0, y: 0, building: 'settlement', owner: 0 },
        { id: 1, x: 1, y: 0, building: 'none', owner: null },
      ],
      edges: [{ node1: 0, node2: 1, owner: null }],
      ports: [],
    },
  }
}

function uploadGeometry(scene) {
  const buffers = []
  const device = {
    createBuffer() {
      const buffer = { destroyed: false, destroy() { this.destroyed = true } }
      buffers.push(buffer)
      return buffer
    },
    queue: { writeBuffer() {} },
  }
  scene.traverse((object) => object.mesh?.geometry.getBuffers(device))
  return buffers
}

function colorsOf(geometry) {
  const colors = new Set()
  for (let i = 0; i < geometry.colors.length; i += 3) {
    colors.add([...geometry.colors.slice(i, i + 3)].join(','))
  }
  return colors
}

const asKey = (rgb) => rgb.map(Math.fround).join(',')

test('ports use per-resource models facing the sea and recolor without replacing terrain', async () => {
  const scene = createDemoScene()
  const game = gameState()
  game.board.nodes = [
    { id: 0, x: 2, y: 1, building: 'none', owner: null },
    { id: 1, x: 2, y: 2, building: 'none', owner: null },
  ]
  game.board.ports = [{ node1: 0, node2: 1, resource: 'wood', owner: null }]
  await scene.sync(game)
  const port = scene.root.children.find((object) => object.name === 'Port wood')
  const terrain = scene.root.children.find((object) => object.name === 'Terrain')
  assert.ok(port)
  assert.equal(port.position[0], Math.fround(2.28))
  assert.equal(port.position[2], 1.5)
  // The model's +Z (open sea) points away from the board, towards +X here.
  assert.ok(Math.abs(Math.sin(port.rotation[1]) - 1) < 1e-6)
  const unowned = colorsOf(port.mesh.geometry)
  assert.ok(unowned.has(asKey([0.92, 0.9, 0.84])))
  assert.ok(!unowned.has(asKey([0.9, 0.15, 0.15])))
  const buffers = uploadGeometry(scene)
  await scene.sync(structuredClone(game))
  assert.ok(scene.root.children.includes(port))
  assert.equal(uploadGeometry(scene).length, 0)
  game.board.ports[0].owner = 0
  await scene.sync(game)
  const owned = scene.root.children.find((object) => object.name === 'Port wood')
  assert.notEqual(owned, port)
  assert.ok(scene.root.children.includes(terrain))
  assert.deepEqual([...owned.position], [...port.position])
  assert.equal(buffers.filter((buffer) => buffer.destroyed).length, 4)
  const ownedColors = colorsOf(owned.mesh.geometry)
  assert.ok(ownedColors.has(asKey([0.9, 0.15, 0.15])))
  assert.ok(!ownedColors.has(asKey([0.92, 0.9, 0.84])))
  game.board.ports = []
  await scene.sync(game)
  assert.ok(!scene.root.children.includes(owned))
  scene.destroy()
  assert.ok(buffers.every((buffer) => buffer.destroyed))
})

test('every landscape and port type has its own model', async () => {
  const scene = createDemoScene()
  const game = gameState()
  game.board.tiles = [1, 2, 3, 4, 5, 6].map((landscape, i) => ({
    i, j: 0, landscape, diceNumber: landscape === 6 ? null : 6, nodes: [], isOccupiedByThief: false,
  }))
  const resources = ['wood', 'brick', 'sheep', 'wheat', 'ore', null]
  game.board.nodes = resources.flatMap((_, i) => [
    { id: i * 2, x: 10 + i, y: 0, building: 'none', owner: null },
    { id: i * 2 + 1, x: 10 + i, y: 1, building: 'none', owner: null },
  ])
  game.board.edges = []
  game.board.ports = resources.map((resource, i) => ({
    node1: i * 2, node2: i * 2 + 1, resource, owner: null,
  }))
  globalThis.fetch = async () => new Response('v 0 0 0\nv 1 0 0\nv 0 0 1\nf 1 2 3\n')
  try {
    await scene.sync(game)
  } finally {
    globalThis.fetch = originalFetch
  }
  const terrain = scene.root.children.find((object) => object.name === 'Terrain')
  const tiles = terrain.children.filter((object) => object.name === 'HexTile')
  assert.equal(tiles.length, 6)
  const tileSignatures = new Set(tiles.map((tile) => [...tile.mesh.geometry.colors].join()))
  assert.equal(tileSignatures.size, 6)
  for (const tile of tiles) {
    const ys = tile.mesh.geometry.positions.filter((_, index) => index % 3 === 1)
    assert.equal(Math.min(...ys), 0)
    assert.equal(tile.position[1], Math.fround(-0.075))
  }
  const ports = scene.root.children.filter((object) => object.name.startsWith('Port '))
  assert.deepEqual(ports.map((port) => port.name).sort(),
    ['Port brick', 'Port general', 'Port ore', 'Port sheep', 'Port wheat', 'Port wood'])
  const portSignatures = ports.map(({ mesh }) => [...mesh.geometry.positions, ...mesh.geometry.colors].join())
  assert.equal(new Set(portSignatures).size, 6)
  scene.destroy()
})

test('the camera stays above y = 0.5 and within 20 units of the board', () => {
  const scene = createDemoScene()
  const camera = scene.camera
  camera.yaw = 0
  camera.move(0, 0, -1, 60_000)
  assert.equal(camera.position[1], 0.5)
  camera.move(1, 0, 0, 60_000)
  assert.ok(Math.hypot(...camera.position) <= 20 + 1e-4)
  assert.equal(camera.position[1], 0.5)
  camera.move(0, 0, 1, 60_000)
  assert.ok(Math.hypot(...camera.position) <= 20 + 1e-4)
  assert.ok(camera.position[1] > 19)
  camera.move(0, 0, -1, 60_000)
  assert.equal(camera.position[1], 0.5)
  scene.destroy()
})

test('thief is a black model, with clickable gray previews and isolated movement', async () => {
  const scene = createDemoScene()
  const game = gameState()
  game.board.tiles.push({
    i: 1, j: 0, landscape: 6, diceNumber: null, nodes: [1], isOccupiedByThief: false,
  })
  await scene.sync(game)
  const thief = scene.root.children.find((object) => object.name === 'Thief')
  const terrain = scene.root.children.find((object) => object.name === 'Terrain')
  assert.ok(thief)
  assert.ok(thief.mesh.geometry.colors.every((value) => value === 0))
  const ys = thief.mesh.geometry.positions.filter((_, index) => index % 3 === 1)
  assert.equal(Math.min(...ys), 0)
  assert.ok(Math.max(...ys) > 0.4)
  const buffers = uploadGeometry(scene)
  let picked
  const placement = {
    kind: 'thief', targets: [1], playerId: 0,
    onPick: (target) => { picked = target },
  }
  await scene.sync(game, undefined, placement)
  const preview = scene.root.children.find((object) => object.onPick)
  assert.ok(preview)
  assert.equal(preview.position[0], 1.5)
  assert.equal(preview.pickRadius, 0.45)
  assert.deepEqual(colorsOf(preview.mesh.geometry), new Set([asKey([0.5, 0.5, 0.5]), asKey([0.3, 0.3, 0.3])]))
  preview.onPick()
  assert.equal(picked, 1)
  const previewBuffers = uploadGeometry(scene)
  await scene.sync(game, undefined, { ...placement, onPick: () => { picked = 'updated' } })
  assert.ok(scene.root.children.includes(preview))
  preview.onPick()
  assert.equal(picked, 'updated')
  assert.equal(uploadGeometry(scene).length, 0)

  game.board.tiles[0].isOccupiedByThief = false
  game.board.tiles[1].isOccupiedByThief = true
  await scene.sync(game)
  assert.ok(!scene.root.children.includes(thief))
  assert.ok(!scene.root.children.includes(preview))
  assert.ok(scene.root.children.includes(terrain))
  const moved = scene.root.children.find((object) => object.name === 'Thief')
  assert.equal(moved.position[0], 1.5)
  assert.equal(moved.position[2], Math.fround(Math.sqrt(3) / 2))
  assert.equal(buffers.filter((buffer) => buffer.destroyed).length, 4)
  assert.ok(previewBuffers.every((buffer) => buffer.destroyed))
  scene.destroy()
  assert.ok(buffers.every((buffer) => buffer.destroyed))
})

test('heartbeat-only updates preserve camera, controller, objects and GPU buffers', async () => {
  const scene = createDemoScene()
  const camera = scene.camera
  const controller = scene.root.children[0]
  const game = gameState()
  await scene.sync(game)
  const objects = [...scene.root.children]
  const buffers = uploadGeometry(scene)
  camera.position[0] = 42
  const heartbeat = structuredClone(game)
  heartbeat.players[0].name = 'Updated name'
  heartbeat.players[0].resources = ['wood']
  heartbeat.turn.turnNumber++
  await scene.sync(heartbeat)

  assert.equal(scene.camera, camera)
  assert.equal(scene.camera.position[0], 42)
  assert.equal(scene.root.children[0], controller)
  assert.deepEqual(scene.root.children, objects)
  assert.equal(uploadGeometry(scene).length, 0)
  assert.ok(buffers.every((buffer) => !buffer.destroyed))
  scene.destroy()
  assert.ok(buffers.every((buffer) => buffer.destroyed))
})

test('building a road and upgrading a city leave unrelated objects untouched', async () => {
  const scene = createDemoScene()
  const game = gameState()
  await scene.sync(game)
  const terrain = scene.root.children.find((object) => object.name === 'Terrain')
  const settlement = scene.root.children.find((object) => object.name === 'Settlement')
  const initialBuffers = uploadGeometry(scene)
  game.board.edges[0].owner = 0
  await scene.sync(game)
  const road = scene.root.children.find((object) => object.name === 'Road')
  assert.ok(road)
  assert.ok(scene.root.children.includes(settlement))
  assert.equal(uploadGeometry(scene).length, 4)

  game.board.nodes[0].building = 'city'
  await scene.sync(game)
  assert.ok(scene.root.children.some((object) => object.name === 'City'))
  assert.ok(!scene.root.children.includes(settlement))
  assert.ok(scene.root.children.includes(road))
  assert.ok(scene.root.children.includes(terrain))
  assert.equal(initialBuffers.filter((buffer) => buffer.destroyed).length, 4)
  assert.equal(uploadGeometry(scene).length, 4)

  game.board.edges[0].owner = null
  await scene.sync(game)
  assert.ok(!scene.root.children.includes(road))
  scene.destroy()
})

test('placement previews retain buffers, refresh callbacks and disappear on cancellation', async () => {
  const scene = createDemoScene()
  const game = gameState()
  await scene.sync(game)
  let picked = ''
  const placement = {
    kind: 'settlement', targets: [1], playerId: 0,
    onPick: (target) => { picked = `old:${target}` },
  }
  await scene.sync(game, undefined, placement)
  const preview = scene.root.children.find((object) => object.onPick)
  const objects = [...scene.root.children]
  uploadGeometry(scene)
  await scene.sync(structuredClone(game), undefined, {
    ...placement, onPick: (target) => { picked = `new:${target}` },
  })
  assert.deepEqual(scene.root.children, objects)
  assert.equal(uploadGeometry(scene).length, 0)
  preview.onPick()
  assert.equal(picked, 'new:1')
  await scene.sync(game)
  assert.ok(!scene.root.children.includes(preview))
  assert.ok(scene.root.children.some((object) => object.name === 'Terrain'))
  scene.destroy()
})

test('empty setup board supports settlement then connected road previews', async () => {
  const scene = createDemoScene()
  const game = gameState()
  game.board.nodes[0].owner = null
  game.board.nodes[0].building = 'none'
  game.turn.setup = { round: 1, kind: 'settlement' }
  game.turn.turnNumber = 0
  await scene.sync(game)
  assert.ok(!scene.root.children.some((object) => object.name === 'Settlement'))
  let picked
  await scene.sync(game, undefined, {
    kind: 'settlement', targets: [0], playerId: 0,
    onPick: (target) => { picked = target },
  })
  const settlementPreview = scene.root.children.find((object) => object.onPick)
  assert.ok(settlementPreview)
  settlementPreview.onPick()
  assert.equal(picked, 0)

  game.board.nodes[0].owner = 0
  game.board.nodes[0].building = 'settlement'
  game.turn.setup.kind = 'road'
  await scene.sync(game, undefined, {
    kind: 'road', targets: [0], playerId: 0,
    onPick: (target) => { picked = `road:${target}` },
  })
  assert.ok(!scene.root.children.includes(settlementPreview))
  assert.ok(scene.root.children.some((object) => object.name === 'Settlement' && !object.onPick))
  const roadPreview = scene.root.children.find((object) => object.onPick)
  assert.ok(roadPreview)
  roadPreview.onPick()
  assert.equal(picked, 'road:0')
  game.board.edges[0].owner = 0
  await scene.sync(game)
  assert.ok(scene.root.children.some((object) => object.name === 'Road' && !object.onPick))
  assert.ok(!scene.root.children.some((object) => object.onPick))
  scene.destroy()
})

test('failed updates leave the complete previous board visible', async () => {
  const scene = createDemoScene()
  const game = gameState()
  await scene.sync(game)
  const objects = [...scene.root.children]
  game.board.tiles[0].landscape = 1
  await assert.rejects(scene.sync(game), /Missing dice number/)
  assert.deepEqual(scene.root.children, objects)
  scene.destroy()
})

test('aborted updates do not commit staged objects', async () => {
  const scene = createDemoScene()
  const game = gameState()
  await scene.sync(game)
  const objects = [...scene.root.children]
  const abort = new AbortController()
  game.board.edges[0].owner = 0
  const update = scene.sync(game, abort.signal)
  abort.abort()
  await assert.rejects(update, { name: 'AbortError' })
  assert.deepEqual(scene.root.children, objects)
  scene.destroy()
})

test('slow terrain loads keep the old board visible and cannot overwrite newer updates', async () => {
  const scene = createDemoScene()
  const game = gameState()
  await scene.sync(game)
  const objects = [...scene.root.children]
  let finishFetch
  globalThis.fetch = () => new Promise((resolve) => { finishFetch = resolve })
  try {
    const changed = structuredClone(game)
    changed.board.tiles[0].landscape = 1
    changed.board.tiles[0].diceNumber = 6
    const pending = scene.sync(changed)
    assert.deepEqual(scene.root.children, objects)
    await scene.sync(game)
    finishFetch(new Response('v 0 0 0\nv 1 0 0\nv 0 0 1\nf 1 2 3\n'))
    await pending
    assert.deepEqual(scene.root.children, objects)
  } finally {
    globalThis.fetch = originalFetch
    scene.destroy()
  }
})

test('terrain replacement is atomic and preserves camera and existing buildings', async () => {
  const scene = createDemoScene()
  const camera = scene.camera
  camera.position[0] = 42
  const game = gameState()
  await scene.sync(game)
  const terrain = scene.root.children.find((object) => object.name === 'Terrain')
  const settlement = scene.root.children.find((object) => object.name === 'Settlement')
  let finishFetch
  globalThis.fetch = () => new Promise((resolve) => { finishFetch = resolve })
  try {
    game.board.tiles[0].landscape = 1
    game.board.tiles[0].diceNumber = 6
    const pending = scene.sync(game)
    assert.ok(scene.root.children.includes(terrain))
    finishFetch(new Response('v 0 0 0\nv 1 0 0\nv 0 0 1\nf 1 2 3\n'))
    await pending
    assert.ok(!scene.root.children.includes(terrain))
    assert.ok(scene.root.children.includes(settlement))
    assert.equal(scene.root.children.filter((object) => object.name === 'Terrain').length, 1)
    assert.equal(scene.camera, camera)
    assert.equal(scene.camera.position[0], 42)
  } finally {
    globalThis.fetch = originalFetch
    scene.destroy()
  }
})

test('destroying a scene prevents pending asset loads from reattaching objects', async () => {
  const scene = createDemoScene()
  const game = gameState()
  game.board.tiles[0].landscape = 1
  game.board.tiles[0].diceNumber = 6
  let finishFetch
  globalThis.fetch = () => new Promise((resolve) => { finishFetch = resolve })
  try {
    const pending = scene.sync(game)
    scene.destroy()
    finishFetch(new Response('v 0 0 0\nv 1 0 0\nv 0 0 1\nf 1 2 3\n'))
    await pending
    assert.equal(scene.root.children.length, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
