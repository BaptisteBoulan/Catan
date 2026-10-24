import type { Vec3 } from "wgpu-matrix";
import { Mesh } from "../../engine/mesh/mesh";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";
import { loadModel } from "../models";

export class Settlement extends SceneObject {
    constructor(options: SceneObjectOptions & { color?: Vec3 } = {}) {
        super({ mesh: new Mesh(loadModel("pieces/settlement", options.color)), ...options });
    }
}