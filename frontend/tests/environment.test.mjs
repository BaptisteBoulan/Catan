import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let env

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  env = await server.ssrLoadModule('/src/engine/environment.ts')
})

after(async () => {
  await server?.close()
})

function header(width, height) {
  return [...Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`)]
}

test('parses flat and run-length encoded Radiance files', () => {
  // 1.0 is mantissa 128 with exponent 129; 0.5 uses exponent 128.
  const flat = Uint8Array.from([...header(2, 1), 128, 64, 0, 129, 128, 128, 128, 128])
  const image = env.parseHdr(flat.buffer)
  assert.equal(image.width, 2)
  assert.equal(image.height, 1)
  assert.deepEqual([...image.data], [1, 0.5, 0, 1, 0.5, 0.5, 0.5, 1])

  const width = 8
  const channel = (value) => [128 + width, value]
  const rle = Uint8Array.from([
    ...header(width, 2),
    2, 2, 0, width, ...channel(128), ...channel(0), ...channel(0), ...channel(129),
    2, 2, 0, width, width, 1, 2, 3, 4, 5, 6, 7, 8, ...channel(0), ...channel(0), ...channel(136),
  ])
  const encoded = env.parseHdr(rle.buffer)
  assert.equal(encoded.height, 2)
  assert.deepEqual([...encoded.data.slice(0, 4)], [1, 0, 0, 1])
  assert.deepEqual([...encoded.data.slice(32, 40)], [1, 0, 0, 1, 2, 0, 0, 1])
  assert.throws(() => env.parseHdr(Uint8Array.from(Buffer.from('P6\n')).buffer), /Not a Radiance/)
})

test('derives a raised sun and normalized ambient light from the sky', () => {
  const width = 64
  const height = 32
  const data = new Float32Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sky = y < height / 2 ? 1 : 0.2
      data.set([sky * 0.6, sky * 0.8, sky, 1], (y * width + x) * 4)
    }
  }
  // A sun just above the horizon.
  data.set([5000, 5000, 5000, 1], ((height / 2 - 1) * width + width / 4) * 4)
  const environment = env.createEnvironment({ width, height, data })
  const [sx, sy, sz] = environment.sunDirection
  assert.ok(Math.abs(Math.hypot(sx, sy, sz) - 1) < 1e-6)
  assert.ok(sy >= Math.sin(Math.PI / 5) - 1e-6)
  const { irradiance } = environment
  const up = irradiance.data.slice(0, 3)
  const down = irradiance.data.slice(irradiance.data.length - 4, irradiance.data.length - 1)
  assert.ok(up[1] > down[1] * 2)
  assert.ok(up[2] > up[0])
  assert.ok(Math.max(...irradiance.data) < 10)
})

test('converts floats to half floats', () => {
  const halves = env.toHalfFloats(new Float32Array([0, 1, -2, 0.5, 65504, 1e9, 1e-8, 6.1035156e-5 / 2]))
  assert.deepEqual([...halves], [0, 0x3c00, 0xc000, 0x3800, 0x7bff, 0x7bff, 0, 0x0200])
})
