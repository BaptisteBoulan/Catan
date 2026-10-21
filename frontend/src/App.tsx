import { useState } from 'react'
import { WebGpuCanvas } from './components/WebGpuCanvas'
import './App.css'

function App() {
  const [gameId, setGameId] = useState(0)
  const [isCreating, setIsCreating] = useState(false)

  async function startNewGame() {
    setIsCreating(true)
    try {
      const response = await fetch('/api/new-board', { method: 'POST' })
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
      <button
        type="button"
        onClick={startNewGame}
        disabled={isCreating}
        className="absolute top-8 right-8 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-lg transition hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
      >
        {isCreating ? 'Creating...' : 'New game'}
      </button>
    </main>
  )
}

export default App
