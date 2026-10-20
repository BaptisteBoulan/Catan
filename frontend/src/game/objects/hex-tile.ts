import type { Vec3 } from "wgpu-matrix";
import { Mesh } from "../../engine/mesh/mesh";
import { createTile } from "../../engine/mesh/primitives/tile";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";

export class HexTile extends SceneObject {
    /** Radians per millisecond around X and Y. */

    constructor(options: SceneObjectOptions & { radius?: number; height?: number; color?: Vec3 } = {}) {
        super({ mesh: new Mesh(createTile(options.radius, options.height, options.color)), ...options });
    }

    // update({ dt }: UpdateContext): void {
    //     this.rotation[0] += dt * this.spinSpeed.x;
    //     this.rotation[1] += dt * this.spinSpeed.y;
    // }
}
