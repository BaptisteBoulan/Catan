import { Mesh } from "../../engine/mesh/mesh";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";
import { LANDSCAPE_MODELS, loadModel } from "../models";

/** Landscape tile whose base sits at its origin (see `blender/models/tiles`). */
export class HexTile extends SceneObject {
    constructor(options: SceneObjectOptions & { landscape: number }) {
        const model = LANDSCAPE_MODELS[options.landscape];
        if (!model) throw new Error(`Unknown landscape: ${options.landscape}`);
        const geometry = loadModel(model);
        for (let index = 0; index < geometry.colors.length; index += 3) {
            const gray = (geometry.colors[index] + geometry.colors[index + 1] + geometry.colors[index + 2]) / 3;
            for (let channel = 0; channel < 3; channel++) {
                geometry.colors[index + channel] = geometry.colors[index + channel] * 0.82 + gray * 0.1 + 0.08;
            }
        }
        super({ mesh: new Mesh(geometry), ...options });
    }
}