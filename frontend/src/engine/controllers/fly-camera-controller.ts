import { SceneObject, type UpdateContext } from "../scene-object";

/** Orbit with left drag, pan with right drag, zoom with the wheel, and fly with WASD. */
export class FlyCameraController extends SceneObject {
    update({ dt, input, scene }: UpdateContext): void {
        const camera = scene.camera;

        const [dx, dy] = input.mouseDelta;
        if (dx || dy) camera.orbit(dx, dy);
        const [panX, panY] = input.panDelta;
        if (panX || panY) camera.pan(panX, panY, input.viewportHeight);
        if (input.wheelDelta) camera.zoom(input.wheelDelta);

        const forward = input.axis(["KeyW"], ["KeyS"]);
        const right = input.axis(["KeyD"], ["KeyA"]);
        const up = input.axis(["Space"], ["ShiftLeft", "ShiftRight"]);
        if (forward || right || up) camera.move(forward, right, up, dt);
    }
}
