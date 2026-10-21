import { vec3, type Vec3 } from "wgpu-matrix";
import { Geometry } from "../geometry";

/** Cylinder (diameter = `size`) centered on the origin. */
export function createCylinder(diameter = 1, height = 1, res = 36, color: Vec3 = vec3.fromValues(0.2, 0.2, 0.2)): Geometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const r = diameter/2;

    for (let i = 0; i < res; i++) {
        const j = (i + 1) % res;
        const theta = 2 * Math.PI * (0.5 - i / (res - 1));
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);

        positions.push(x, -height/2, z);
        positions.push(x, height/2, z);

        normals.push(x, 0, z);
        normals.push(x, 0, z);
        colors.push(...color);
        colors.push(...color);

        indices.push(i*2+1, i*2, j*2+1);
        indices.push(j*2+1, i*2, j*2);
    }

    positions.push(0, -height/2, 0);
    positions.push(0, height/2, 0);
    normals.push(0, -1, 0);
    normals.push(0, 1, 0);
    colors.push(...color);
    colors.push(...color);

    const offset = positions.length / 3;

    for (let i = 0; i < res; i++) {
        const j = (i + 1) % res;
        const theta = 2 * Math.PI * (0.5 - i / (res - 1));
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);

        positions.push(x, -height/2, z);
        positions.push(x, height/2, z);

        normals.push(0, -1, 0);
        normals.push(0, 1, 0);
        colors.push(...color);
        colors.push(...color);

        indices.push(offset - 2, offset + i*2, offset + j*2);
        indices.push(offset - 1, offset + i*2 + 1, offset + j*2 + 1);
    }



    return Geometry.fromArrays(positions, colors, indices, normals);
}
