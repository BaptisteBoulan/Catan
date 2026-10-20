import { initGPU, type GpuContext } from "./gpu";
import { Input } from "./input";
import { Renderer } from "./renderer";
import { Scene } from "./scene";

function resizeCanvas(canvas: HTMLCanvasElement): void {
    const pixelRatio = window.devicePixelRatio;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
}

/** Owns the canvas, GPU, input and frame loop. Each frame it updates then renders the current scene. */
export class Engine {
    readonly canvas: HTMLCanvasElement;
    readonly gpu: GpuContext;
    readonly renderer: Renderer;
    readonly input: Input;
    scene = new Scene();

    private readonly resizeObserver: ResizeObserver;
    private frameHandle?: number;
    private lastTime?: number;
    private destroyed = false;

    private constructor(canvas: HTMLCanvasElement, gpu: GpuContext) {
        this.canvas = canvas;
        this.gpu = gpu;
        this.renderer = new Renderer(gpu);
        this.input = new Input(canvas);

        this.resizeObserver = new ResizeObserver(() => resizeCanvas(canvas));
        this.resizeObserver.observe(canvas);
    }

    static async create(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Engine> {
        resizeCanvas(canvas);
        const gpu = await initGPU(canvas, signal);
        try {
            signal?.throwIfAborted();
            return new Engine(canvas, gpu);
        } catch (error) {
            gpu.context.unconfigure();
            gpu.device.destroy();
            throw error;
        }
    }

    start(): void {
        if (this.destroyed) throw new Error("Cannot start a destroyed engine");
        if (this.frameHandle !== undefined) return;
        this.lastTime = undefined;
        this.frameHandle = requestAnimationFrame(this.frame);
    }

    stop(): void {
        if (this.frameHandle !== undefined) cancelAnimationFrame(this.frameHandle);
        this.frameHandle = undefined;
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.stop();
        this.scene.destroy();
        this.renderer.destroy();
        this.input.dispose();
        this.resizeObserver.disconnect();
        this.gpu.context.unconfigure();
        this.gpu.device.destroy();
    }

    private readonly frame = (time: number): void => {
        const dt = this.lastTime === undefined ? 0 : time - this.lastTime;
        this.lastTime = time;

        this.scene.update(dt, this.input);
        this.renderer.render(this.scene);
        this.input.endFrame();

        this.frameHandle = requestAnimationFrame(this.frame);
    };
}
