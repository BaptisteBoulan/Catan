import type { GameViewProps } from '../../game/view-types'
import { WebGpuCanvas } from '../WebGpuCanvas'
import { createDemoScene } from '../../game/demo-scene'

export function GameBoard({ controller }: GameViewProps) {
  const { game, error, updateScene, showGameResult } = controller
  return (
    <>
      <section className="board-area" aria-label="Game board" inert={showGameResult}>
        {game ? <WebGpuCanvas createScene={createDemoScene} updateScene={updateScene} className="game-canvas" />
          : <p role={error ? 'alert' : 'status'}>{error ?? 'Loading game...'}</p>}
      </section>
    </>
  )
}
