import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let Input
const originalDocument = globalThis.document
const originalWindow = globalThis.window

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  })
  ;({ Input } = await server.ssrLoadModule('/src/engine/input.ts'))
})

after(async () => {
  globalThis.document = originalDocument
  globalThis.window = originalWindow
  await server?.close()
})

function fixture(t) {
  const document = new EventTarget()
  const window = new EventTarget()
  const canvas = new EventTarget()
  canvas.focus = () => { document.activeElement = canvas }
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 })
  canvas.requestPointerLock = () => assert.fail('The cursor must never be locked')
  globalThis.document = document
  globalThis.window = window
  const input = new Input(canvas)
  t.after(() => input.dispose())
  const emit = (target, type, values = {}) => {
    const event = new Event(type, { cancelable: true })
    Object.assign(event, { button: 0, buttons: 1, clientX: 60, clientY: 45 }, values)
    target.dispatchEvent(event)
    return event
  }
  return { document, window, canvas, input, emit }
}

test('ordinary clicks select at cursor coordinates without locking the cursor', (t) => {
  const { canvas, document, input, emit } = fixture(t)
  const picks = []
  input.onClick = (...point) => picks.push(point)
  emit(document, 'mousemove', { clientX: 90 })
  assert.deepEqual(input.mouseDelta, [0, 0])
  emit(canvas, 'mousedown')
  emit(document, 'mousemove', { clientX: 61 })
  emit(document, 'mouseup')
  emit(canvas, 'click', { clientX: 61 })
  assert.deepEqual(picks, [[-0.49, 0.5]])
  assert.deepEqual(input.mouseDelta, [0, 0])
  assert.equal(document.activeElement, canvas)
})

test('left drags rotate, right drags pan, and dragging does not select a target', (t) => {
  const { canvas, document, input, emit } = fixture(t)
  const picks = []
  input.onClick = (...point) => picks.push(point)
  emit(canvas, 'mousedown')
  emit(document, 'mousemove', { clientX: 80, clientY: 55 })
  emit(document, 'mousemove', { clientX: 90, clientY: 65 })
  assert.deepEqual(input.mouseDelta, [30, 20])
  emit(document, 'mouseup')
  emit(canvas, 'click')
  assert.deepEqual(picks, [])
  input.endFrame()
  emit(document, 'mousemove', { clientX: 100 })
  assert.deepEqual(input.mouseDelta, [0, 0])
  emit(canvas, 'mousedown', { button: 2 })
  emit(document, 'mousemove', { buttons: 2, clientX: 120 })
  assert.deepEqual(input.mouseDelta, [0, 0])
  assert.deepEqual(input.panDelta, [60, 0])
  emit(document, 'mouseup', { button: 2 })
  input.endFrame()
  emit(canvas, 'mousedown')
  emit(document, 'mouseup')
  emit(canvas, 'click')
  assert.equal(picks.length, 1)
})

test('wheel zoom is canvas scoped, normalizes delta modes and resets each frame', (t) => {
  const { canvas, document, window, input, emit } = fixture(t)
  assert.equal(emit(document, 'wheel', { deltaY: 120, deltaMode: 0 }).defaultPrevented, false)
  assert.equal(input.wheelDelta, 0)
  assert.equal(emit(canvas, 'wheel', { deltaY: 40, deltaMode: 0 }).defaultPrevented, true)
  emit(canvas, 'wheel', { deltaY: 2, deltaMode: 1 })
  emit(canvas, 'wheel', { deltaY: -1, deltaMode: 2 })
  assert.equal(input.wheelDelta, -28)
  assert.equal(emit(canvas, 'contextmenu').defaultPrevented, true)
  input.endFrame()
  assert.equal(input.wheelDelta, 0)
  emit(canvas, 'wheel', { deltaY: 20, deltaMode: 0 })
  emit(window, 'blur')
  assert.equal(input.wheelDelta, 0)
  input.dispose()
  assert.equal(emit(canvas, 'wheel', { deltaY: 20, deltaMode: 0 }).defaultPrevented, false)
  assert.equal(emit(canvas, 'contextmenu').defaultPrevented, false)
})

test('right drags end on release, missed release and blur without selecting', (t) => {
  const { canvas, document, input, emit } = fixture(t)
  input.onClick = () => assert.fail('Panning must not select')
  emit(canvas, 'mousedown', { button: 2 })
  emit(document, 'mousemove', { buttons: 2, clientX: 100, clientY: 65 })
  assert.deepEqual(input.panDelta, [40, 20])
  emit(document, 'mouseup', { button: 2 })
  emit(canvas, 'click', { button: 2 })
  input.endFrame()
  emit(document, 'mousemove', { buttons: 2, clientX: 120 })
  assert.deepEqual(input.panDelta, [0, 0])
  emit(canvas, 'mousedown', { button: 2 })
  emit(document, 'mousemove', { buttons: 0, clientX: 120 })
  emit(document, 'mousemove', { buttons: 2, clientX: 140 })
  assert.deepEqual(input.panDelta, [0, 0])
  emit(canvas, 'mousedown', { button: 2 })
  emit(document, 'mousemove', { buttons: 2, clientX: 100 })
  emit(canvas, 'blur')
  assert.deepEqual(input.panDelta, [0, 0])
})

test('release outside the canvas, missed releases and blur stop camera look', (t) => {
  const { canvas, document, window, input, emit } = fixture(t)
  emit(canvas, 'mousedown')
  emit(document, 'mousemove', { clientX: 300 })
  emit(document, 'mouseup', { clientX: 300 })
  input.endFrame()
  emit(document, 'mousemove')
  assert.deepEqual(input.mouseDelta, [0, 0])
  emit(canvas, 'mousedown')
  emit(document, 'mousemove', { buttons: 0, clientX: 100 })
  emit(document, 'mousemove', { clientX: 120 })
  assert.deepEqual(input.mouseDelta, [0, 0])
  emit(canvas, 'mousedown')
  emit(document, 'mousemove', { clientX: 100 })
  emit(window, 'keydown', { code: 'KeyW' })
  emit(window, 'blur')
  assert.equal(input.isDown('KeyW'), false)
  assert.deepEqual(input.mouseDelta, [0, 0])
  emit(document, 'mousemove', { clientX: 120 })
  assert.deepEqual(input.mouseDelta, [0, 0])
})

test('keyboard remains scoped to the canvas and disposing removes listeners', (t) => {
  const { canvas, document, window, input, emit } = fixture(t)
  emit(window, 'keydown', { code: 'KeyW' })
  assert.equal(input.isDown('KeyW'), false)
  emit(canvas, 'mousedown')
  emit(window, 'keydown', { code: 'KeyW' })
  assert.equal(input.isDown('KeyW'), true)
  assert.equal(emit(window, 'keydown', { code: 'Space' }).defaultPrevented, true)
  emit(canvas, 'blur')
  assert.equal(input.isDown('KeyW'), false)
  input.dispose()
  emit(canvas, 'mousedown')
  emit(window, 'keydown', { code: 'KeyW' })
  emit(document, 'mousemove', { clientX: 100 })
  assert.equal(input.isDown('KeyW'), false)
  assert.deepEqual(input.mouseDelta, [0, 0])
})
