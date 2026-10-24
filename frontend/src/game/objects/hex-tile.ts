import { Mesh } from "../../engine/mesh/mesh";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";
import { LANDSCAPE_MODELS, loadModel } from "../models";

/** Landscape tile whose base sits at its origin (see `blender/models/tiles`). */
export class HexTile extends SceneObject {
    constructor(options: SceneObjectOptions & { landscape: number }) {
        const model = LANDSCAPE_MODELS[options.landscape];
        if (!model) throw new Error(`Unknown landscape: ${options.landscape}`);
        super({ mesh: new Mesh(loadModel(model)), ...options });
    }
}