import { Geometry } from "../geometry";

/** Sphere (diameter = `size`) centered on the origin. */
export function createSphere(size = 1, res = 36): Geometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const r = size / 2;

    const getIndex = (i: number, j: number) => j * res + i;

    for (let i = 0; i < res; i++) {
        const theta = Math.PI * (0.5 - i / (res - 1));
        for (let j = 0; j < res; j++) {
            const idx = getIndex(i, j);
            const phi = 2 * Math.PI * j / (res - 1);
            const x = r * Math.cos(theta) * Math.cos(phi);
            const y = r * Math.sin(theta);
            const z = r * Math.cos(theta) * Math.sin(phi);

            positions.push(x, y, z);
            normals.push(x, y, z);
            colors.push(Math.abs(x), Math.abs(y), Math.abs(z));

            if (i < res - 1 && j < res - 1) {
                indices.push(idx, idx + 1, idx + 1 + res);
                indices.push(idx, idx + 1 + res, idx + res);
            }
        }
    }

    return Geometry.fromArrays(positions, colors, indices, normals);
}
