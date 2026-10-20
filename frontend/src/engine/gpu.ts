export type GpuContext = {
    adapter: GPUAdapter;
    device: GPUDevice;
    format: GPUTextureFormat;
    context: GPUCanvasContext;
}

export async function initGPU(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<GpuContext> {
    signal?.throwIfAborted();
    if (!navigator.gpu) {
        throw new Error("WebGPU is unavailable. Use a WebGPU-capable browser on HTTPS or localhost.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    signal?.throwIfAborted();
    if (!adapter) throw new Error("No WebGPU adapter found");

    const device = await adapter.requestDevice();
    try {
        // An effect may have unmounted while the adapter or device was being requested.
        signal?.throwIfAborted();
        const format = navigator.gpu.getPreferredCanvasFormat();
        const context = canvas.getContext("webgpu");
        if (!context) throw new Error("No WebGPU canvas context found");

        context.configure({ device, format, alphaMode: "premultiplied" });
        return { adapter, device, format, context };
    } catch (error) {
        device.destroy();
        throw error;
    }
}
