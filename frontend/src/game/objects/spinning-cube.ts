import { Mesh } from "../../engine/mesh/mesh";
import { createCube } from "../../engine/mesh/primitives/cube";
import { SceneObject, type SceneObjectOptions, type UpdateContext } from "../../engine/scene-object";

export class SpinningCube extends SceneObject {
    /** Radians per millisecond around X and Y. */
    spinSpeed = { x: 0.0005, y: 0.001 };

    constructor(options: SceneObjectOptions & { size?: number } = {}) {
        super({ mesh: new Mesh(createCube(options.size)), ...options });
    }

    update({ dt }: UpdateContext): void {
        this.rotation[0] += dt * this.spinSpeed.x;
        this.rotation[1] += dt * this.spinSpeed.y;
    }
}
