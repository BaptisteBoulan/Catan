import { mat3, mat4, type Mat4 } from "wgpu-matrix";
import type { Geometry } from "./geometry";

const UNIFORM_SIZE = 64 + 64 + 48;

/**
 * The drawable part of a SceneObject: a (possibly shared) geometry
 * plus the per-object uniforms used to draw it.
 */
export class Mesh {
    geometry: Geometry;

    private readonly mvp = mat4.identity();
    private readonly normalMatrix = mat3.identity();
    private uniformBuffer?: GPUBuffer;
    private bindGroup?: GPUBindGroup;
    private bindGroupLayout?: GPUBindGroupLayout;

    constructor(geometry: Geometry) {
        this.geometry = geometry;
    }

    writeUniforms(device: GPUDevice, viewProjection: Mat4, model: Mat4): void {
        const buffer = this.getUniformBuffer(device);
        mat4.multiply(viewProjection, model, this.mvp);
        mat3.fromMat4(model, this.normalMatrix);
        mat3.inverse(this.normalMatrix, this.normalMatrix);
        mat3.transpose(this.normalMatrix, this.normalMatrix);

        device.queue.writeBuffer(buffer, 0, this.mvp);
        device.queue.writeBuffer(buffer, 64, model);
        // wgpu-matrix pads each mat3 column to 16 bytes, matching WGSL.
        device.queue.writeBuffer(buffer, 128, this.normalMatrix);
    }

    getBindGroup(device: GPUDevice, layout: GPUBindGroupLayout): GPUBindGroup {
        if (!this.bindGroup || this.bindGroupLayout !== layout) {
            this.bindGroupLayout = layout;
            this.bindGroup = device.createBindGroup({
                layout,
                entries: [{ binding: 0, resource: { buffer: this.getUniformBuffer(device) } }],
            });
        }
        return this.bindGroup;
    }

    /** Releases the per-object uniforms. The geometry is left alone since it may be shared. */
    destroy(): void {
        this.uniformBuffer?.destroy();
        this.uniformBuffer = undefined;
        this.bindGroup = undefined;
    }

    private getUniformBuffer(device: GPUDevice): GPUBuffer {
        this.uniformBuffer ??= device.createBuffer({
            size: UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        return this.uniformBuffer;
    }
}
