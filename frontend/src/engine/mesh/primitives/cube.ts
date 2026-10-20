import { Geometry } from "../geometry";

/** Cube (side = `size`) centered on the origin, with one color per face. */
export function createCube(size = 1): Geometry {
    const h = size / 2;
    const faces: { n: number[]; u: number[]; v: number[]; color: number[] }[] = [
        { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], color: [1, 0, 0] },
        { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], color: [0, 1, 1] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], color: [0, 1, 0] },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], color: [1, 0.5, 0] },
        { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], color: [0, 0, 1] },
        { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], color: [1, 1, 0] },
    ];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    faces.forEach(({ n, u, v, color }, face) => {
        for (const [a, b] of corners) {
            for (let i = 0; i < 3; i++) {
                positions.push(h * (n[i] + a * u[i] + b * v[i]));
                normals.push(h * n[i]);
            }
            colors.push(...color);
        }
        const base = face * 4;
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });

    return Geometry.fromArrays(positions, colors, indices, normals);
}
