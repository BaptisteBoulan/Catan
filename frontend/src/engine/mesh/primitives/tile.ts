import type { Vec3 } from "wgpu-matrix";
import { vec3 } from "wgpu-matrix";
import { Geometry } from "../geometry";


/** Hexagonal tile (flat on the XZ plane) centered on the origin. */
export function createTile(radius = 1, height = 0.3, color: Vec3 = vec3.fromValues(1, 0.5, 0)): Geometry {

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    const halfH = height/2;

    const radHalfSqrt3 = radius * Math.sqrt(3) / 2;

    const coo2d = [
        [radius, 0],
        [radius / 2, radHalfSqrt3],
        [-radius / 2, radHalfSqrt3],
        [-radius, 0],
        [-radius / 2, -radHalfSqrt3],
        [radius / 2, -radHalfSqrt3],
    ];

    for (let i = 0; i < 6; i++) {
        const j = (i+1) % 6;

        const normal = [
            (coo2d[i][0] + coo2d[j][0]) * 2 / 3,
            0,
            (coo2d[i][1] + coo2d[j][1]) * 2 / 3
        ];

        positions.push(coo2d[i][0], halfH, coo2d[i][1]);
        positions.push(coo2d[i][0], -halfH, coo2d[i][1]);
        positions.push(coo2d[j][0], -halfH, coo2d[j][1]);
        positions.push(coo2d[j][0], halfH, coo2d[j][1]);

        colors.push(...color);
        colors.push(...color);
        colors.push(...color);
        colors.push(...color);

        normals.push(...normal);
        normals.push(...normal);
        normals.push(...normal);
        normals.push(...normal);

        indices.push(4*i, 4*i + 2, 4*i + 1);
        indices.push(4*i, 4*i + 3, 4*i + 2);
    }

    for (let i = 0; i < 6; i++) {

        positions.push(coo2d[i][0], halfH, coo2d[i][1]);
        positions.push(coo2d[i][0], -halfH, coo2d[i][1]);

        colors.push(...color);
        colors.push(...color);

        normals.push(0, 1, 0);
        normals.push(0, -1, 0);
    }
    indices.push(26, 24, 28);
    indices.push(28, 24, 30);
    indices.push(30, 24, 32);
    indices.push(32, 24, 34);
    indices.push(25, 27, 29);
    indices.push(25, 29, 31);
    indices.push(25, 31, 33);
    indices.push(25, 33, 35);

    return Geometry.fromArrays(positions, colors, indices, normals);
}