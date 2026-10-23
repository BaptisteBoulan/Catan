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

test('thief has a black cylinder and sphere, with clickable previews and isolated movement', async () => {
  const scene = createDemoScene()
  const game = gameState()
  game.board.tiles.push({
    i: 1, j: 0, landscape: 6, diceNumber: null, nodes: [1], isOccupiedByThief: false,
  })
  await scene.sync(game)
  const thief = scene.root.children.find((object) => object.name === 'Thief')
  const terrain = scene.root.children.find((object) => object.name === 'Terrain')
  assert.ok(thief)
  assert.equal(thief.children.length, 2)
  assert.equal(thief.children[0].name, 'Thief body')
  assert.equal(thief.children[1].name, 'Thief head')
  for (const child of thief.children) {
    assert.ok(child.mesh.geometry.colors.every((value) => value === 0))
  }
  assert.ok(thief.children[1].position[1] > thief.children[0].position[1])
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
  assert.ok(preview.children[0].mesh.geometry.colors.every((value) => value === 0.5))
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
  assert.equal(buffers.filter((buffer) => buffer.destroyed).length, 8)
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
