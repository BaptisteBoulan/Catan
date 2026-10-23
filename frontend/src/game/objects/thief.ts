import { vec3 } from "wgpu-matrix";
import { Mesh } from "../../engine/mesh/mesh";
import { createCylinder } from "../../engine/mesh/primitives/cylinder";
import { createSphere } from "../../engine/mesh/primitives/sphere";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";

export class Thief extends SceneObject {
    constructor(options: SceneObjectOptions = {}) {
        super(options);
        const color = options.color ?? vec3.fromValues(0, 0, 0);
        this.add(new SceneObject({
            name: "Thief body",
            mesh: new Mesh(createCylinder(0.16, 0.5, 24, color)),
            position: vec3.fromValues(0, 0.25, 0),
        }));
        const head = createSphere(0.23, 24);
        for (let index = 0; index < head.colors.length; index += 3) {
            head.colors.set(color, index);
        }
        this.add(new SceneObject({
            name: "Thief head",
            mesh: new Mesh(head),
            position: vec3.fromValues(0, 0.58, 0),
        }));
    }
}
