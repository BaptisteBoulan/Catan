import { GameScreen } from './components/game/GameScreen'
import { Lobby } from './components/lobby/Lobby'
import { useGameController } from './hooks/useGameController'
import './App.css'

function App() {
  const controller = useGameController()
  return controller.location
    ? <GameScreen controller={controller} location={controller.location} />
    : <Lobby lobby={controller.lobby} />
}

export default App
