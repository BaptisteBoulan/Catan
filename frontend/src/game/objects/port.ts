import type { Vec3 } from "wgpu-matrix";
import { Mesh } from "../../engine/mesh/mesh";
import { SceneObject, type SceneObjectOptions } from "../../engine/scene-object";
import type { ResourceCard } from "../api-types";
import { loadModel } from "../models";

/**
 * Harbor model per resource (`general` for 3:1). Its origin is at water level, its X axis
 * runs along the coast and +Z points to the open sea. `owner` tints the `tint` materials.
 */
export class Port extends SceneObject {
    constructor(resource: ResourceCard | null, options: SceneObjectOptions & { owner?: Vec3 } = {}) {
        const kind = resource ?? "general";
        super({ name: `Port ${kind}`, mesh: new Mesh(loadModel(`ports/${kind}`, options.owner)), ...options });
    }
}