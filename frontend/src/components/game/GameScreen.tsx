import type { GameViewProps } from '../../game/view-types'
import { GameResult } from './GameResult'
import { GameSidebar } from './GameSidebar'
import { GameBoard } from './GameBoard'
import { ObservationControls } from './ObservationControls'
import { TurnActions } from './TurnActions'
import { ChatPanel } from './ChatPanel'

export function GameScreen({ controller, location }: GameViewProps) {
  const { showGameResult } = controller
  return (
    <>
      <main className="app">
        {showGameResult && <GameResult controller={controller} location={location} />}
        <GameSidebar controller={controller} location={location} />
        <GameBoard controller={controller} location={location} />
        <aside className="action-panel" aria-label="Turn actions and chat" inert={showGameResult}>
          <ObservationControls controller={controller} location={location} />
          <TurnActions controller={controller} location={location} />
          <ChatPanel controller={controller} location={location} />
        </aside>
      </main>
    </>
  )
}
