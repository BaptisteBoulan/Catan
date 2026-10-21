import { useState } from 'react'
import { WebGpuCanvas } from './components/WebGpuCanvas'
import './App.css'

const MIN_PLAYERS = 2
const MAX_PLAYERS = 5

function App() {
  const [gameId, setGameId] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [playerCount, setPlayerCount] = useState(4)

  async function startNewGame() {
    setIsCreating(true)
    try {
      const response = await fetch('/api/new-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerCount }),
      })
      if (!response.ok) {
        throw new Error(`Failed to create board: ${response.status} ${response.statusText}`)
      }
      // Remount the canvas so it loads the newly stored board
      setGameId((id) => id + 1)
    } catch (cause) {
      console.error(cause)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="app relative">
      <WebGpuCanvas key={gameId} className="game-canvas" />
      <div className="absolute top-8 right-8 flex items-center gap-3">
        <label className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 font-semibold text-white shadow-lg">
          Players
          <input
            type="number"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={playerCount}
            onChange={(e) => {
              const value = Number(e.target.value)
              if (Number.isNaN(value)) return
              setPlayerCount(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(value))))
            }}
            disabled={isCreating}
            className="w-14 rounded bg-white px-2 py-1 text-black"
          />
        </label>
        <button
          type="button"
          onClick={startNewGame}
          disabled={isCreating}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-lg transition hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
        >
          {isCreating ? 'Creating...' : 'New game'}
        </button>
      </div>
    </main>
  )
}

export default App
