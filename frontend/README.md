# Catan WebGPU + React

The engine, game objects, primitives and WGSL shader are copied from the vanilla
`webgpu` project. React owns the canvas lifecycle; the engine still updates and
renders the scene outside React.

## Run

```sh
npm install
npm run dev
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

export function Board() {
  return <WebGpuCanvas style={{ width: '100%', height: 600 }} />
}
```

Give the component an explicit height (or a parent-relative height via CSS).
It resizes the drawing buffer to its displayed size and device pixel ratio.
By default it loads the randomized board from `/api/board` with the fly camera.
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
