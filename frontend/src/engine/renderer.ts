import { mat4, vec3 } from "wgpu-matrix";
import shader from "../shaders/shader.wgsl?raw";
import skyShader from "../shaders/sky.wgsl?raw";
import { loadEnvironment, toHalfFloats, type HdrImage } from "./environment";
import type { GpuContext } from "./gpu";
import type { Scene } from "./scene";

const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";
const SUN_COLOR = [0.95 * 0.75, 0.9 * 0.75, 0.8 * 0.75];
const AMBIENT_STRENGTH = 0.6;
const SKY_EXPOSURE = 1;
const DEFAULT_SUN_DIRECTION = vec3.normalize(vec3.fromValues(0.4, 1, 0.3));

function createPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const module = device.createShaderModule({ code: shader });

    return device.createRenderPipeline({
        vertex: {
            module,
            entryPoint: "vsMain",
            buffers: [
                {
                    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
                    arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
                },
                {
                    attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }],
                    arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
                },
                {
                    attributes: [{ shaderLocation: 2, offset: 0, format: "float32x3" }],
                    arrayStride: Float32Array.BYTES_PER_ELEMENT * 3,
                },
            ],
        },
        fragment: {
            module,
            entryPoint: "fsMain",
            targets: [{ format }],
        },
        primitive: {
            topology: "triangle-list",
            cullMode: "back",
        },
        depthStencil: {
            format: DEPTH_FORMAT,
            depthWriteEnabled: true,
            depthCompare: "less",
        },
        layout: "auto",
    });
}

function createSkyPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const module = device.createShaderModule({ code: skyShader });
    return device.createRenderPipeline({
        vertex: { module, entryPoint: "vsMain" },
        fragment: { module, entryPoint: "fsMain", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
        // Drawn first, behind everything, without touching the depth buffer.
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "always" },
        layout: "auto",
    });
}

function createHdrTexture(device: GPUDevice, image: HdrImage): GPUTexture {
    const texture = device.createTexture({
        size: [image.width, image.height],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
        { texture }, toHalfFloats(image.data), { bytesPerRow: image.width * 8 }, [image.width, image.height],
    );
    return texture;
}

export class Renderer {
    private readonly device: GPUDevice;
    private readonly context: GPUCanvasContext;
    private readonly pipeline: GPURenderPipeline;
    private readonly bindGroupLayout: GPUBindGroupLayout;
    private readonly skyPipeline: GPURenderPipeline;
    private readonly sampler: GPUSampler;
    private readonly lightingBuffer: GPUBuffer;
    private readonly skyUniformBuffer: GPUBuffer;
    private readonly skyUniforms = new Float32Array(20);
    private readonly skyView = mat4.identity();
    private depthTexture?: GPUTexture;

    private lightingBindGroup: GPUBindGroup;
    private skyBindGroup?: GPUBindGroup;
    private environmentTextures: GPUTexture[] = [];
    private environmentUrl?: string;
    private environmentAbort?: AbortController;
    private destroyed = false;

    constructor({ device, context, format }: GpuContext) {
        this.device = device;
        this.context = context;
        this.pipeline = createPipeline(device, format);
        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);
        this.skyPipeline = createSkyPipeline(device, format);
        this.sampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "repeat",
            addressModeV: "clamp-to-edge",
        });
        this.lightingBuffer = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.skyUniformBuffer = device.createBuffer({
            size: this.skyUniforms.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        // Flat ambient light until an environment is loaded.
        const fallback = createHdrTexture(device, { width: 1, height: 1, data: new Float32Array([1, 1, 1, 1]) });
        this.environmentTextures.push(fallback);
        this.lightingBindGroup = this.createLightingBindGroup(fallback);
        this.writeLighting(DEFAULT_SUN_DIRECTION);
    }

    render(scene: Scene): void {
        const { device, context, pipeline, bindGroupLayout } = this;
        if (scene.environmentUrl !== this.environmentUrl) this.setEnvironment(scene.environmentUrl);
        const colorTexture = context.getCurrentTexture();

        const camera = scene.camera;
        camera.setAspect(colorTexture.width, colorTexture.height);
        const viewProjection = camera.getViewProjectionMatrix();

        const encoder = device.createCommandEncoder();
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: colorTexture.createView(),
                    clearValue: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.getDepthView(colorTexture.width, colorTexture.height),
                depthClearValue: 1,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        if (this.skyBindGroup) {
            const view = mat4.copy(camera.getViewMatrix(), this.skyView);
            view[12] = view[13] = view[14] = 0;
            const skyMatrix = mat4.inverse(mat4.multiply(camera.getProjectionMatrix(), view, view), view);
            this.skyUniforms.set(skyMatrix, 0);
            this.skyUniforms[16] = SKY_EXPOSURE;
            device.queue.writeBuffer(this.skyUniformBuffer, 0, this.skyUniforms);
            renderPass.setPipeline(this.skyPipeline);
            renderPass.setBindGroup(0, this.skyBindGroup);
            renderPass.draw(3);
        }

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(1, this.lightingBindGroup);
        scene.traverse((object) => {
            const { mesh } = object;
            if (!mesh || !object.visible) return;

            const buffers = mesh.geometry.getBuffers(device);
            mesh.writeUniforms(device, viewProjection, object.worldMatrix);
            renderPass.setVertexBuffer(0, buffers.position);
            renderPass.setVertexBuffer(1, buffers.color);
            renderPass.setVertexBuffer(2, buffers.normal);
            renderPass.setIndexBuffer(buffers.index, "uint32");
            renderPass.setBindGroup(0, mesh.getBindGroup(device, bindGroupLayout));
            renderPass.drawIndexed(buffers.indexCount);
        });
        renderPass.end();

        device.queue.submit([encoder.finish()]);
    }

    destroy(): void {
        this.destroyed = true;
        this.environmentAbort?.abort();
        this.depthTexture?.destroy();
        for (const texture of this.environmentTextures) texture.destroy();
        this.lightingBuffer.destroy();
        this.skyUniformBuffer.destroy();
    }

    private setEnvironment(url: string | undefined): void {
        this.environmentUrl = url;
        this.environmentAbort?.abort();
        this.environmentAbort = undefined;
        if (!url) return;
        const abort = new AbortController();
        this.environmentAbort = abort;
        loadEnvironment(url, abort.signal).then((environment) => {
            if (abort.signal.aborted || this.destroyed) return;
            const sky = createHdrTexture(this.device, environment.sky);
            const irradiance = createHdrTexture(this.device, environment.irradiance);
            for (const texture of this.environmentTextures) texture.destroy();
            this.environmentTextures = [sky, irradiance];
            this.lightingBindGroup = this.createLightingBindGroup(irradiance);
            this.skyBindGroup = this.device.createBindGroup({
                layout: this.skyPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.skyUniformBuffer } },
                    { binding: 1, resource: this.sampler },
                    { binding: 2, resource: sky.createView() },
                ],
            });
            this.writeLighting(environment.sunDirection);
        }).catch((cause: unknown) => {
            if (!abort.signal.aborted) console.error("Failed to load environment", cause);
        });
    }

    private createLightingBindGroup(irradiance: GPUTexture): GPUBindGroup {
        return this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: { buffer: this.lightingBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: irradiance.createView() },
            ],
        });
    }

    private writeLighting(sunDirection: ArrayLike<number>): void {
        this.device.queue.writeBuffer(this.lightingBuffer, 0, new Float32Array([
            sunDirection[0], sunDirection[1], sunDirection[2], 0,
            ...SUN_COLOR, AMBIENT_STRENGTH,
        ]));
    }

    private getDepthView(width: number, height: number): GPUTextureView {
        const { depthTexture } = this;
        if (!depthTexture || depthTexture.width !== width || depthTexture.height !== height) {
            depthTexture?.destroy();
            this.depthTexture = this.device.createTexture({
                size: [width, height],
                format: DEPTH_FORMAT,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }
        return this.depthTexture!.createView();
    }
}
