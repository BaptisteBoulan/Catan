import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../../game/api'
import type { GameDto } from '../../game/api-types'
import { createPreviewScene, type GameScene } from '../../game/demo-scene'
import { WebGpuCanvas } from '../WebGpuCanvas'

const SETUP_STEP_MS = 700
const TURN_STEP_MS = 1500
const RESTART_AFTER_WIN_MS = 20000
const RETRY_MS = 5000

type PreviewDto = { previewId: string, game: GameDto }

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(signal.reason)
    }, { once: true })
  })
}

/** Lets AIs play live, one placement or turn at a time, on a slowly turning board behind the lobby. */
export function LobbyBackdrop() {
  const [game, setGame] = useState<GameDto | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    const { signal } = abort
    const post = (path: string) => apiRequest<PreviewDto>(path, { method: 'POST', signal })

    async function play() {
      while (!signal.aborted) {
        try {
          let preview = await post('/previews')
          setGame(preview.game)
          while (preview.game.turn.winner === null) {
            await wait(preview.game.turn.setup ? SETUP_STEP_MS : TURN_STEP_MS, signal)
            preview = await post(`/previews/${preview.previewId}/step`)
            setGame(preview.game)
          }
          await wait(RESTART_AFTER_WIN_MS, signal)
        } catch (cause) {
          if (signal.aborted) return
          console.warn('Lobby preview game failed', cause)
          await wait(RETRY_MS, signal).catch(() => undefined)
        }
      }
    }

    void play()
    return () => abort.abort()
  }, [])

  const updateScene = useCallback(
    (scene: GameScene, signal: AbortSignal) => game ? scene.sync(game, signal) : undefined,
    [game],
  )

  if (!game) return null
  return (
    <div className="lobby-backdrop" aria-hidden="true" inert>
      <WebGpuCanvas createScene={createPreviewScene} updateScene={updateScene} />
    </div>
  )
}
