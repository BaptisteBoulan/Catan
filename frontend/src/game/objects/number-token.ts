import { vec3 } from "wgpu-matrix";
import type { Geometry } from "../../engine/mesh/geometry";
import { loadOBJFromPath } from "../../engine/mesh/primitives/objLoader";

const tokenUrls = import.meta.glob<string>("../../../../blender/objs/*.obj", {
    eager: true,
    query: "?url",
    import: "default",
});
const TOKEN_DIAMETER = 0.4;

export async function loadNumberTokenGeometry(diceNumber: number, signal?: AbortSignal): Promise<Geometry> {
    const url = tokenUrls[`../../../../blender/objs/${diceNumber}.obj`];
    if (!Number.isInteger(diceNumber) || !url) {
        throw new Error(`Unsupported tile dice number: ${diceNumber}`);
    }
    const geometry = await loadOBJFromPath(url, undefined, vec3.fromValues(0.95, 0.88, 0.7), signal);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < geometry.positions.length; i += 3) {
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], geometry.positions[i + axis]);
            max[axis] = Math.max(max[axis], geometry.positions[i + axis]);
        }
    }
    const diameter = Math.max(max[0] - min[0], max[2] - min[2]);
    if (!Number.isFinite(diameter) || diameter <= 0) {
        throw new Error(`Invalid number token mesh: ${diceNumber}`);
    }

    // Blender exports retain their layout offsets; center XZ and put the base at Y = 0.
    const centerX = (min[0] + max[0]) / 2;
    const centerZ = (min[2] + max[2]) / 2;
    const scale = TOKEN_DIAMETER / diameter;
    for (let i = 0; i < geometry.positions.length; i += 3) {
        geometry.positions[i] = (geometry.positions[i] - centerX) * scale;
        geometry.positions[i + 1] = (geometry.positions[i + 1] - min[1]) * scale;
        geometry.positions[i + 2] = (geometry.positions[i + 2] - centerZ) * scale;
    }
    return geometry;
}
