import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Engine } from '../engine/engine'
import type { Scene } from '../engine/scene'
import { createDemoScene } from '../game/demo-scene'
import './WebGpuCanvas.css'

type WebGpuCanvasProps = {
  createScene?: (signal?: AbortSignal) => Scene | Promise<Scene>
  className?: string
  style?: CSSProperties
}

export function WebGpuCanvas({
  createScene = createDemoScene,
  className,
  style,
}: WebGpuCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

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
        const scene = await createScene(abort.signal)
        if (abort.signal.aborted) return
        engine.scene = scene
        engine.start()
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

  return (
    <div className={['webgpu-canvas', className].filter(Boolean).join(' ')} style={style}>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Catan 3D scene">
        Your browser does not support canvas.
      </canvas>
      {error && <p className="webgpu-canvas-error" role="alert">{error}</p>}
    </div>
  )
}
