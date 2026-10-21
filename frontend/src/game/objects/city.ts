import type { Vec3 } from "wgpu-matrix";
import { Mesh } from "../../engine/mesh/mesh";
import { createCylinder } from "../../engine/mesh/primitives/cylinder";
import { SceneObject, type SceneObjectOptions} from "../../engine/scene-object";

export class City extends SceneObject {
    constructor(options: SceneObjectOptions & {color?: Vec3} = {}) {
        super({ mesh: new Mesh(createCylinder(0.3, 0.3, 24, options.color)), ...options });
    }
}
