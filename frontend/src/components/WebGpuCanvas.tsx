import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Engine } from '../engine/engine'
import type { Scene } from '../engine/scene'
import './WebGpuCanvas.css'

type WebGpuCanvasProps<T extends Scene> = {
  createScene: () => T
  updateScene?: (scene: T, signal: AbortSignal) => void | Promise<void>
  className?: string
  style?: CSSProperties
}

export function WebGpuCanvas<T extends Scene>({
  createScene,
  updateScene,
  className,
  style,
}: WebGpuCanvasProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [runtime, setRuntime] = useState<{
    scene: T, signal: AbortSignal
  } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const abort = new AbortController()
    let engine: Engine | undefined

    async function start(canvas: HTMLCanvasElement) {
      try {
        const created = await Engine.create(canvas, abort.signal)
        if (abort.signal.aborted) {
          created.destroy()
          return
        }

        engine = created
        const scene = createScene()
        engine.scene = scene
        engine.start()
        setRuntime({ scene, signal: abort.signal })
        setError(null)
      } catch (cause) {
        engine?.destroy()
        engine = undefined
        if (abort.signal.aborted && cause instanceof DOMException && cause.name === 'AbortError') {
          return
        }

        console.error('Failed to initialize WebGPU canvas', cause)
        if (!abort.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    }

    void start(canvas)

    return () => {
      abort.abort()
      engine?.destroy()
    }
  }, [createScene])

  useEffect(() => {
    if (!runtime || runtime.signal.aborted || !updateScene) return
    const { scene } = runtime
    const applyUpdate = updateScene
    const abort = new AbortController()
    const signal = AbortSignal.any([abort.signal, runtime.signal])

    async function update() {
      try {
        await applyUpdate(scene, signal)
        if (!signal.aborted) setError(null)
      } catch (cause) {
        if (signal.aborted) return
        console.error('Failed to update WebGPU scene', cause)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }

    void update()
    return () => abort.abort()
  }, [runtime, updateScene])

  return (
    <div className={['webgpu-canvas', className].filter(Boolean).join(' ')} style={style}>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Catan 3D scene">
        Your browser does not support canvas.
      </canvas>
      {error && <p className="webgpu-canvas-error" role="alert">{error}</p>}
    </div>
  )
}
