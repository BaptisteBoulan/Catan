import { vec3 } from "wgpu-matrix";
import { Mesh } from "../../engine/mesh/mesh";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";
import { loadModel } from "../models";

export class Thief extends SceneObject {
    constructor(options: SceneObjectOptions = {}) {
        const color = options.color ?? vec3.fromValues(0, 0, 0);
        super({ mesh: new Mesh(loadModel("pieces/thief", color)), ...options });
    }
}