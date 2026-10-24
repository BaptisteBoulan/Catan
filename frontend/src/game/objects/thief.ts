import { Mesh } from "../../engine/mesh/mesh";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";
import { loadModel } from "../models";

export class Thief extends SceneObject {
    constructor(options: SceneObjectOptions = {}) {
        super({ mesh: new Mesh(loadModel("pieces/thief")), ...options });
    }
}