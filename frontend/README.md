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
By default it creates the original randomized hex board with the fly camera.
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

## Controls

- Click the canvas to focus it and lock the pointer; move the mouse to look.
- WASD (ZQSD on AZERTY) moves horizontally.
- Space moves up; Shift moves down.
- Escape releases pointer lock.

Keyboard input only affects a focused or pointer-locked canvas, so other React
controls can coexist with the scene.
