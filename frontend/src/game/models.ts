import { vec3, type Vec3 } from "wgpu-matrix";
import type { Geometry } from "../engine/mesh/geometry";
import { loadOBJ } from "../engine/mesh/primitives/objLoader";

// Bundled as text so models are available synchronously, without extra requests.
const MODEL_ROOT = "../../../blender/models/";
const objFiles = import.meta.glob<string>("../../../blender/models/**/*.obj", {
    eager: true,
    query: "?raw",
    import: "default",
});
const mtlFiles = import.meta.glob<string>("../../../blender/models/**/*.mtl", {
    eager: true,
    query: "?raw",
    import: "default",
});

/** Materials named `tint` take the tint color, `tint_dark` a darker shade of it. */
const TINT_DARKEN = 0.6;

export const LANDSCAPE_MODELS: Readonly<Record<number, string>> = {
    1: "tiles/forest",
    2: "tiles/hills",
    3: "tiles/pasture",
    4: "tiles/fields",
    5: "tiles/mountains",
    6: "tiles/desert",
};

/** Parses `blender/models/<name>.obj` (and its `.mtl`) into a new, unshared geometry. */
export function loadModel(name: string, tint?: Vec3): Geometry {
    const obj = objFiles[`${MODEL_ROOT}${name}.obj`];
    if (obj === undefined) throw new Error(`Unknown model: ${name}`);
    const overrides = tint ? { tint, tint_dark: vec3.scale(tint, TINT_DARKEN) } : undefined;
    return loadOBJ(obj, mtlFiles[`${MODEL_ROOT}${name}.mtl`], undefined, overrides);
}
