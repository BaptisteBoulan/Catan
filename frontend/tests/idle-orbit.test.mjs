import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let IdleOrbitController

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  })
  ;({ IdleOrbitController } = await server.ssrLoadModule('/src/engine/controllers/idle-orbit-controller.ts'))
})

after(async () => { await server?.close() })

function fixture(options) {
  const orbits = []
  const camera = { sensitivity: 0.002, orbit: (dx, dy) => orbits.push([dx * 0.002, dy]) }
  const input = { active: false }
  const controller = new IdleOrbitController(options)
  const step = (dt = 100) => controller.update({ dt, input, scene: { camera } })
  return { orbits, input, step }
}

test('waits for the idle delay, then eases into a horizontal orbit', () => {
  const { orbits, step } = fixture({ idleDelay: 1000, speed: 1, rampDuration: 500 })
  for (let i = 0; i < 10; i++) step()
  assert.equal(orbits.length, 0)
  for (let i = 0; i < 10; i++) step()
  assert.ok(orbits.every(([, dy]) => dy === 0))
  const angles = orbits.map(([angle]) => angle)
  assert.ok(angles[0] > 0 && angles[0] < angles[4])
  assert.ok(Math.abs(angles.at(-1) - 0.1) < 1e-9)
})

test('user activity stops the orbit and restarts the idle countdown', () => {
  const { orbits, input, step } = fixture({ idleDelay: 1000, rampDuration: 0 })
  for (let i = 0; i < 12; i++) step()
  assert.ok(orbits.length > 0)
  orbits.length = 0
  input.active = true
  step()
  input.active = false
  for (let i = 0; i < 10; i++) step()
  assert.equal(orbits.length, 0)
  step()
  assert.equal(orbits.length, 1)
})

test('without an idle delay the camera keeps turning despite activity', () => {
  const { orbits, input, step } = fixture({ idleDelay: null, rampDuration: 0 })
  input.active = true
  step()
  step()
  assert.equal(orbits.length, 2)
})
