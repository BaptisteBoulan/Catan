import { Mesh } from "../../engine/mesh/mesh";
import { createCylinder } from "../../engine/mesh/primitives/cylinder";
import { SceneObject, type SceneObjectOptions} from "../../engine/scene-object";

export class Settlement extends SceneObject {
    constructor(options: SceneObjectOptions & { diameter?: number, height?: number } = {}) {
        super({ mesh: new Mesh(createCylinder(
            options.diameter ?? 1,
            options.height ?? 1
        )), ...options });
    }
}
