import { vec3, type Vec3 } from "wgpu-matrix";
import { Mesh } from "../../engine/mesh/mesh";
import { SceneObject } from "../../engine/scene-object";
import { loadModel } from "../models";

/** The model is authored for a 1-unit edge along X and stretched to the actual edge length. */
export class Road extends SceneObject {
    constructor(start: Vec3, end: Vec3, color: Vec3) {
        const dx = end[0] - start[0];
        const dz = end[2] - start[2];
        super({
            mesh: new Mesh(loadModel("pieces/road", color)),
            position: vec3.lerp(start, end, 0.5),
            rotation: vec3.fromValues(0, -Math.atan2(dz, dx), 0),
            scale: vec3.fromValues(Math.hypot(dx, dz), 1, 1),
        });
    }
}