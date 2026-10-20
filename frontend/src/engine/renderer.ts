import shader from "../shaders/shader.wgsl?raw";
import type { GpuContext } from "./gpu";
import type { Scene } from "./scene";

const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";

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

export class Renderer {
    private readonly device: GPUDevice;
    private readonly context: GPUCanvasContext;
    private readonly pipeline: GPURenderPipeline;
    private readonly bindGroupLayout: GPUBindGroupLayout;
    private depthTexture?: GPUTexture;

    constructor({ device, context, format }: GpuContext) {
        this.device = device;
        this.context = context;
        this.pipeline = createPipeline(device, format);
        this.bindGroupLayout = this.pipeline.getBindGroupLayout(0);
    }

    render(scene: Scene): void {
        const { device, context, pipeline, bindGroupLayout } = this;
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

        renderPass.setPipeline(pipeline);
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
        this.depthTexture?.destroy();
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
