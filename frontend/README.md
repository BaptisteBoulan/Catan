# Catan WebGPU + React

The engine, game objects, primitives and WGSL shader are copied from the vanilla
`webgpu` project. React owns the canvas lifecycle; the engine still updates and
renders the scene outside React.

## Run

```sh
npm install
npm run dev
```

Run the backend from the repository root in a separate terminal (Windows):

```powershell
backend\.venv\Scripts\python.exe -m uvicorn backend.src.main:app
```

The Vite development server proxies `/api` to `127.0.0.1:8000`.

## Game sessions

Enter a display name, then create a game with 2-5 player slots or join using an
existing four-digit game ID. The creator claims the first slot; each join claims
the next slot and uses its existing board pieces and color. Names must be unique
within a game, ignoring case and surrounding whitespace. Full games reject joins.

The game page URL is `/games/{gameId}/players/{playerId}`. Refreshing or reopening
that URL resumes the same player without creating another one. The sidebar shows
the game ID, creation time, your name, and connected players with their colors.
Presence is refreshed every 3 seconds; a player disappears from the connected
list after 15 seconds without a heartbeat. Player slots remain reserved when
disconnected, so the same URL can reconnect. Open separate tabs with different
names to test joining; create another game to verify isolation.
The sidebar also shows each player's resource cards, development cards, and
victory points. Development cards currently use colored name tiles as placeholders.

Sessions live only in the backend's `games` dictionary and disappear on restart.
Run one backend worker: this in-memory store is not shared across processes.
There are no accounts or authentication; anyone with a player URL can use that
identity. These URLs are identifiers for local development, not secure credentials.
Production hosting must serve the frontend entry point for nested game URLs and
proxy `/api` to the backend.

Backend routes (under `/api` through Vite):

- `POST /games` with `{ "name": "Alice", "playerCount": 4 }`
- `POST /games/{gameId}/players` with `{ "name": "Bob" }`
- `GET /games/{gameId}?playerId={playerId}` for the board and session metadata
- `POST /games/{gameId}/players/{playerId}/heartbeat` for live player presence
- `POST /games/{gameId}/new-board?playerId={playerId}` with `{ "playerCount": 4 }`
- `POST /games/{gameId}/demo-game?playerId={playerId}` with
  `{ "playerCount": 4, "roundCount": 5 }`

The former global board routes are replaced by game-scoped routes. Board resets
retain claimed names and cannot reduce capacity below the number of joined players.

Run the backend HTTP tests from the repository root:

```powershell
backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

Use a WebGPU-capable browser on localhost or HTTPS. Initialization failures are
shown over the canvas and logged to the console.

```sh
npm run build
npm run lint
```

## Canvas component

```tsx
import { WebGpuCanvas } from './components/WebGpuCanvas'
import { createDemoScene } from './game/demo-scene'
import type { GameDto } from './game/api-types'
import { useCallback } from 'react'

export function Board({ game }: { game: GameDto }) {
  const createScene = useCallback((signal?: AbortSignal) => createDemoScene(game, signal), [game])
  return <WebGpuCanvas createScene={createScene} style={{ width: '100%', height: 600 }} />
}
```

Give the component an explicit height (or a parent-relative height via CSS).
It resizes the drawing buffer to its displayed size and device pixel ratio.
The app loads the game-scoped board and supplies a stable scene factory with the fly camera.
Each player starts with a settlement and a city, each connected to one
player-colored road along a tile edge. A light-blue circular water surface sits
just beneath the board and scales with its size.
Each non-desert tile displays the OBJ token matching its `diceNumber` from the
board response; the desert has no token. Token assets are bundled directly from
`../blender/objs`, centered and scaled to sit on the tile surface. Repeated
numbers share geometry within a scene. Missing or unsupported dice numbers and
asset-loading failures are shown as initialization errors.
To use another scene, pass a stable factory:

```tsx
import { WebGpuCanvas } from './components/WebGpuCanvas'
import { Scene } from './engine/scene'

const createScene = () => new Scene()

export function CustomBoard() {
  return <WebGpuCanvas createScene={createScene} style={{ height: 600 }} />
}
```

Define the factory outside the component or memoize it with `useCallback`;
changing it destroys the previous engine and starts a new scene.
Unmounting cancels initialization and releases the frame loop, input listeners,
resize observer, pointer lock and GPU device, including under React Strict Mode.

## OBJ meshes

`loadOBJ` parses raw OBJ text synchronously. To load files by URL instead, use
`loadOBJFromPath`, which returns a `Promise<Geometry>`:

```ts
import objPath from './assets/meshes/suzzy.obj?url'
import mtlPath from './assets/meshes/suzzy.mtl?url'
import { loadOBJFromPath } from './engine/mesh/primitives/objLoader'

const geometry = await loadOBJFromPath(objPath, mtlPath)
```

The MTL URL is optional. The third argument sets the fallback color and the
fourth accepts an `AbortSignal`. HTTP and network failures reject the promise.
Concave OBJ faces are triangulated with Earcut while preserving face winding,
so the number tokens' digit cutouts remain open.
Use Vite `?url` imports for bundled assets, or browser-accessible URLs for files
in `public`; filesystem paths are not supported. `Suzzy.create(options, signal)`
uses this loader to create the scene object asynchronously.

## Controls

- Click the canvas to focus it and lock the pointer; move the mouse to look.
- WASD (ZQSD on AZERTY) moves horizontally.
- Space moves up; Shift moves down.
- Escape releases pointer lock.

Keyboard input only affects a focused or pointer-locked canvas, so other React
controls can coexist with the scene.
