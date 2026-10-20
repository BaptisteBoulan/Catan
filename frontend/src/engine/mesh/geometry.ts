export type GeometryData = {
    positions: Float32Array;
    colors: Float32Array;
    indices: Uint32Array;
    /** Computed from the triangles when omitted. */
    normals?: Float32Array;
};

export type GeometryBuffers = {
    position: GPUBuffer;
    color: GPUBuffer;
    normal: GPUBuffer;
    index: GPUBuffer;
    indexCount: number;
};

export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
    if (positions.length % 3 !== 0 || indices.length % 3 !== 0) {
        throw new Error("Positions and triangle indices must contain complete triples");
    }
    for (const value of positions) {
        if (!Number.isFinite(value)) {
            throw new Error("Vertex positions must be finite");
        }
    }

    const vertexCount = positions.length / 3;
    const accumulated = new Float64Array(positions.length);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
            throw new Error("Triangle index is out of bounds");
        }

        const abx = positions[b * 3] - positions[a * 3];
        const aby = positions[b * 3 + 1] - positions[a * 3 + 1];
        const abz = positions[b * 3 + 2] - positions[a * 3 + 2];
        const acx = positions[c * 3] - positions[a * 3];
        const acy = positions[c * 3 + 1] - positions[a * 3 + 1];
        const acz = positions[c * 3 + 2] - positions[a * 3 + 2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;

        for (const vertex of [a, b, c]) {
            accumulated[vertex * 3] += nx;
            accumulated[vertex * 3 + 1] += ny;
            accumulated[vertex * 3 + 2] += nz;
        }
    }

    const normals = new Float32Array(positions.length);
    for (let i = 0; i < normals.length; i += 3) {
        const length = Math.hypot(accumulated[i], accumulated[i + 1], accumulated[i + 2]);
        if (length > 0) {
            normals[i] = accumulated[i] / length;
            normals[i + 1] = accumulated[i + 1] / length;
            normals[i + 2] = accumulated[i + 2] / length;
        }
    }
    return normals;
}

function createBuffer(device: GPUDevice, data: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buffer = device.createBuffer({
        size: data.byteLength,
        usage: usage | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
}

/**
 * CPU-side vertex data, uploaded to the GPU on first draw.
 * A geometry can be shared by several meshes.
 */
export class Geometry {
    readonly positions: Float32Array;
    readonly colors: Float32Array;
    readonly normals: Float32Array;
    readonly indices: Uint32Array;

    private buffers?: GeometryBuffers;

    constructor({ positions, colors, indices, normals }: GeometryData) {
        this.positions = positions;
        this.colors = colors;
        this.indices = indices;
        this.normals = normals ?? computeNormals(positions, indices);
    }

    /** Build a geometry from plain number arrays (handy for custom vertex sets). */
    static fromArrays(positions: number[], colors: number[], indices: number[], normals?: number[]): Geometry {
        return new Geometry({
            positions: new Float32Array(positions),
            colors: new Float32Array(colors),
            indices: new Uint32Array(indices),
            normals: normals && new Float32Array(normals),
        });
    }

    getBuffers(device: GPUDevice): GeometryBuffers {
        this.buffers ??= {
            position: createBuffer(device, this.positions, GPUBufferUsage.VERTEX),
            color: createBuffer(device, this.colors, GPUBufferUsage.VERTEX),
            normal: createBuffer(device, this.normals, GPUBufferUsage.VERTEX),
            index: createBuffer(device, this.indices, GPUBufferUsage.INDEX),
            indexCount: this.indices.length,
        };
        return this.buffers;
    }

    destroy(): void {
        if (!this.buffers) return;
        this.buffers.position.destroy();
        this.buffers.color.destroy();
        this.buffers.normal.destroy();
        this.buffers.index.destroy();
        this.buffers = undefined;
    }
}
