import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { vec3 } from 'wgpu-matrix'

let server
let Camera
let FlyCameraController

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  })
  ;({ Camera } = await server.ssrLoadModule('/src/engine/camera.ts'))
  ;({ FlyCameraController } = await server.ssrLoadModule('/src/engine/controllers/fly-camera-controller.ts'))
})

after(async () => { await server?.close() })

function close(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
}

function vectorClose(actual, expected) {
  actual.forEach((value, index) => close(value, expected[index]))
}

function aimedAtTarget(camera) {
  vectorClose(camera.forward, vec3.normalize(vec3.subtract(camera.target, camera.position)))
}

test('left-drag orbit keeps its pivot centered and preserves its radius', () => {
  const camera = new Camera()
  const radius = vec3.distance(camera.position, camera.target)
  const initial = vec3.clone(camera.position)
  aimedAtTarget(camera)
  camera.orbit(100, 50)
  assert.notDeepEqual(camera.position, initial)
  vectorClose(camera.target, [0, 0, 0])
  close(vec3.distance(camera.position, camera.target), radius)
  aimedAtTarget(camera)
  camera.orbit(-100, -50)
  vectorClose(camera.position, initial)
})

test('panning translates camera and pivot together in the view plane', () => {
  const camera = new Camera()
  const initial = vec3.clone(camera.position)
  const forward = vec3.clone(camera.forward)
  const radius = vec3.distance(camera.position, camera.target)
  camera.pan(100, 50, 600)
  const displacement = vec3.subtract(camera.position, initial)
  vectorClose(camera.target, displacement)
  close(vec3.dot(displacement, forward), 0)
  close(vec3.distance(camera.position, camera.target), radius)
  aimedAtTarget(camera)
  camera.orbit(50, 20)
  vectorClose(camera.target, displacement)
  aimedAtTarget(camera)
})

test('wheel zoom changes distance in both directions and cannot cross the pivot', () => {
  const camera = new Camera()
  const initial = vec3.clone(camera.position)
  const distance = vec3.distance(camera.position, camera.target)
  camera.zoom(-120)
  assert.ok(vec3.distance(camera.position, camera.target) < distance)
  camera.zoom(120)
  vectorClose(camera.position, initial)
  camera.zoom(-100000)
  close(vec3.distance(camera.position, camera.target), 0.1)
  aimedAtTarget(camera)
})

test('all navigation respects board bounds, including orbit and zoom after pan', () => {
  const camera = new Camera({ bounds: { minHeight: 0.5, maxDistance: 20 } })
  const bounded = () => {
    assert.ok(camera.position[1] >= 0.5 - 1e-5)
    assert.ok(vec3.length(camera.position) <= 20 + 1e-5)
    aimedAtTarget(camera)
  }
  camera.orbit(10000, -10000)
  bounded()
  camera.zoom(100000)
  bounded()
  camera.zoom(-100000)
  bounded()
  camera.pan(10000, 10000, 600)
  bounded()
  camera.orbit(500, 200)
  bounded()
  camera.zoom(100000)
  bounded()
  camera.move(1, 1, -1, 100000)
  bounded()
})

test('controller wires orbit, pan, zoom and physical WASD (ZQSD on AZERTY)', () => {
  const calls = []
  const camera = Object.fromEntries(['orbit', 'pan', 'zoom', 'move'].map(
    (name) => [name, (...args) => calls.push([name, ...args])],
  ))
  const keys = new Set(['KeyW', 'KeyA', 'Space'])
  const input = {
    mouseDelta: [10, 20], panDelta: [30, 40], wheelDelta: -120, viewportHeight: 600,
    axis: (positive, negative) => Number(positive.some((key) => keys.has(key)))
      - Number(negative.some((key) => keys.has(key))),
  }
  new FlyCameraController().update({ dt: 16, input, scene: { camera } })
  assert.deepEqual(calls, [
    ['orbit', 10, 20], ['pan', 30, 40, 600], ['zoom', -120], ['move', 1, -1, 1, 16],
  ])
  calls.length = 0
  keys.clear()
  input.mouseDelta = input.panDelta = [0, 0]
  input.wheelDelta = 0
  new FlyCameraController().update({ dt: 16, input, scene: { camera } })
  assert.deepEqual(calls, [])
})
