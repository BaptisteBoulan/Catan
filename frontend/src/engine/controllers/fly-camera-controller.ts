import { SceneObject, type UpdateContext } from "../scene-object";

/** Drives the scene camera with WASD + Space/Shift and mouse look (pointer lock). */
export class FlyCameraController extends SceneObject {
    update({ dt, input, scene }: UpdateContext): void {
        const camera = scene.camera;

        const [dx, dy] = input.mouseDelta;
        if (dx || dy) camera.look(dx, dy);

        const forward = input.axis(["KeyW"], ["KeyS"]);
        const right = input.axis(["KeyD"], ["KeyA"]);
        const up = input.axis(["Space"], ["ShiftLeft", "ShiftRight"]);
        if (forward || right || up) camera.move(forward, right, up, dt);
    }
}
