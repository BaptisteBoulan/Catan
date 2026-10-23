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
the next slot and color. Names must be unique
within a game, ignoring case and surrounding whitespace. Full games reject joins.

The game page URL is `/games/{gameId}/players/{playerId}`. Refreshing or reopening
that URL resumes the same player without creating another one. The sidebar shows
the game ID, creation time, your name, and connected players with their colors.
Presence is refreshed every 3 seconds; a player disappears from the connected
list after 15 seconds without a heartbeat. Player slots remain reserved when
disconnected, so the same URL can reconnect. Open separate tabs with different
names to test joining; create another game to verify isolation.
The sidebar shows your resource and development cards as overlapping portrait
cards, alongside your victory points. Hover a card to bring it to the front.
Development cards are gray when unavailable, green when playable, and red once
used; used cards stay in your hand for future mechanics. Hover for the reason
a card is unavailable. Click a green card to play it.

Sessions live only in the backend's `games` dictionary and disappear on restart.
The first player to reach **7 points** wins immediately, through buildings or
playing Victory Point cards. Finished games reject further gameplay actions and
show a Victory or Defeat screen to each player, including after a refresh.
**Play again** returns everyone to a fresh lobby with the exact same game ID,
names, colors and player slots. Any player can click it; simultaneous clicks
reuse the same fresh lobby without resetting it twice. The host starts the next
game. The board, hands, points, chat and turn state are reset.
Both individual dice faces and their total are shown to every player.
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
- `POST /games/{gameId}/start?playerId=0` to begin setup once all slots are claimed
- `POST /games/{gameId}/play-again?playerId={playerId}` to reset a finished game
  to the same lobby (repeated requests in that lobby are idempotent)
- `GET /games/{gameId}/build/{kind}/targets?playerId={playerId}` for valid placement slots
- `POST /games/{gameId}/build/{kind}?playerId={playerId}` with `{ "target": 12 }`
  to place a piece (`kind` is `settlement`, `road`, or `city`)
- `POST /games/{gameId}/trade?playerId={playerId}` with
  `{ "give": "wood", "receive": "ore" }` to exchange 4 matching resources for 1
  different resource during your normal turn (wood, brick, sheep, wheat, or ore)
- `POST /games/{gameId}/dev-card?playerId={playerId}` to buy a development card
- `POST /games/{gameId}/dev-card/{cardIndex}/play?playerId={playerId}` with
  `{ "resources": [] }` to play a card at its index in your hand. Monopoly
  requires one resource choice, Year of Plenty requires two, and other cards
  require none.
- `GET /games/{gameId}/thief/targets?playerId={playerId}` for valid destination tile indices
- `POST /games/{gameId}/thief?playerId={playerId}` with `{ "target": 12 }`
  to move the thief to that index in `board.tiles`
- `POST /games/{gameId}/end-turn?playerId={playerId}` to advance to the next player
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
npm test
```

## Canvas component

```tsx
import { WebGpuCanvas } from './components/WebGpuCanvas'
import { createDemoScene, type GameScene } from './game/demo-scene'
import type { GameDto } from './game/api-types'
import { useCallback } from 'react'

export function Board({ game }: { game: GameDto }) {
  const updateScene = useCallback(
    (scene: GameScene, signal: AbortSignal) => scene.sync(game, signal),
    [game],
  )
  return <WebGpuCanvas createScene={createDemoScene} updateScene={updateScene}
    style={{ width: '100%', height: 600 }} />
}
```

Give the component an explicit height (or a parent-relative height via CSS).
It resizes the drawing buffer to its displayed size and device pixel ratio.
The scene factory creates a persistent scene with its camera and fly controller.
Game updates go through `updateScene`, without restarting the engine, frame loop,
input listeners or camera. The game scene retains unchanged objects and GPU buffers;
presence and turn-only updates do not rebuild board geometry. Roads, buildings and
placement previews are added, replaced or removed individually.
Terrain changes are prepared off-scene, including asynchronous token loading, and
applied together so the previous board stays visible until the update is ready.
Superseded updates are cancelled; failed updates keep the previous board visible
and show an error over the canvas.
The lobby board starts empty. Starting a game highlights valid settlement slots
for player 1. Each player places a free settlement, then a free road touching that
settlement, in order from player 1 to player N. The second round runs from player
N back to player 1, again placing a settlement followed by its connected road.
Settlement spacing applies in both rounds; no existing road is required for a
starting settlement. Each player finishes with two settlements and two roads.
Setup targets use the same clickable previews as normal building actions and
resume after refreshing. Heartbeats include the full session state so other
players see placed pieces. Dice, paid builds, development cards and ending turns
are unavailable during setup. Normal turn 1 begins with player 1 after the final
road. Dice roll automatically once when normal turn 1 begins and each time the
turn advances, immediately distributing resources; there is no roll button.
The legacy roll endpoint rejects attempts to roll again.
The thief starts on the desert as a thin black cylinder with a spherical head.
Rolling seven sets `turn.thiefMovePending`: the current player must click a
highlighted thief preview on a different tile before building, trading, buying
cards or ending the turn. Use **Move thief** to show the previews again after
cancelling or a failed request; refreshing also resumes the required placement.
Each player with a settlement or city bordering the destination loses a random
half of their resource cards, rounded down, only if they hold more than seven.
This includes the moving player if affected, counts each player once regardless
of buildings, and does not affect development cards or non-bordering players.
The occupied tile produces no resources until the thief moves elsewhere.
During your turn, use **Trade (4 for 1)** to choose a resource to give and one to
receive. Trading requires four cards of the same resource and cannot be used in
setup or another player's turn. Hover over or keyboard-focus a building or
development-card button to see its resource cost with emojis.
Action development cards cannot be played on the turn they were purchased,
and only one can be played per turn. A Victory Point card may be played
immediately, grants exactly one point, and does not count toward that limit.
All cards require your normal turn and cannot interrupt a pending thief move
or free-road placement.

- **Knight** requires moving the thief using the existing highlighted tile
  previews and applies the same destination effects as a seven.
- **Monopoly** lets you choose a resource, then takes every matching resource
  card from every opponent.
- **Road Building** places two free roads using the normal connection rules;
  the second may extend the first. It ends early if no legal slots remain and
  cannot be played if none exist initially. `turn.freeRoadsRemaining` preserves
  progress across refreshes; other actions are blocked until placement finishes.
- **Year of Plenty** gives two resources of your choice, including two matching
  resources. There is no finite resource bank in this implementation.

Card state includes `used`, `acquiredTurn`, and `unavailableReason` (null when
playable). `turn.devCardPlayed` records the action-card limit. These fields and
pending placements are included in game reads and heartbeats.
The demo route completes setup with random legal placements before running
its simulated rounds.
A light-blue circular water surface sits
just beneath the board and scales with its size.
Each non-desert tile displays the OBJ token matching its `diceNumber` from the
board response; the desert has no token. Token assets are bundled directly from
`../blender/objs`, centered and scaled to sit on the tile surface. Repeated
numbers share geometry within a scene. Missing or unsupported dice numbers and
asset-loading failures are shown as scene update errors.
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
The factory is synchronous; perform asynchronous asset loading in `updateScene`.
Changing `updateScene` cancels the previous update, but does not recreate the engine.
Unmounting cancels initialization and releases the frame loop, input listeners,
resize observer and GPU device, including under React Strict Mode.

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

- Hold the left mouse button and drag on the canvas to look. The cursor stays
  visible and is never locked; releasing the button stops mouse look.
- Click without dragging to select a highlighted placement target.
- WASD (ZQSD on AZERTY) moves horizontally.
- Space moves up; Shift moves down.

Keyboard input only affects a focused canvas, so other React controls can coexist
with the scene. Clicking or dragging the canvas focuses it for keyboard movement.
The game stays within the viewport; the player and action panels scroll independently.
