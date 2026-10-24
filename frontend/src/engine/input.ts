export class Input {
    /** Called on canvas clicks (not drags) with normalized device coordinates. */
    onClick?: (ndcX: number, ndcY: number) => void;

    private readonly keys = new Set<string>();
    private mouseDx = 0;
    private mouseDy = 0;
    private panDx = 0;
    private panDy = 0;
    private wheel = 0;
    private readonly canvas: HTMLCanvasElement;
    private readonly abort = new AbortController();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const { signal } = this.abort;
        let pressed: number | undefined;
        let dragged = false;
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;

        canvas.addEventListener("mousedown", (event) => {
            if (event.button !== 0 && event.button !== 2) return;
            canvas.focus({ preventScroll: true });
            event.preventDefault();
            pressed = event.button;
            dragged = false;
            startX = lastX = event.clientX;
            startY = lastY = event.clientY;
        }, { signal });
        document.addEventListener("mousemove", (event) => {
            if (pressed === undefined) return;
            if (!(event.buttons & (pressed === 0 ? 1 : 2))) {
                pressed = undefined;
                return;
            }
            if (Math.hypot(event.clientX - startX, event.clientY - startY) >= 4) {
                dragged = true;
            }
            if (dragged) {
                if (pressed === 0) {
                    this.mouseDx += event.clientX - lastX;
                    this.mouseDy += event.clientY - lastY;
                } else {
                    this.panDx += event.clientX - lastX;
                    this.panDy += event.clientY - lastY;
                }
            }
            lastX = event.clientX;
            lastY = event.clientY;
        }, { signal });
        document.addEventListener("mouseup", (event) => {
            if (event.button === pressed) pressed = undefined;
        }, { signal });
        canvas.addEventListener("click", (event) => {
            if (event.button !== 0 || dragged) return;
            const rect = canvas.getBoundingClientRect();
            const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
            this.onClick?.(ndcX, ndcY);
        }, { signal });
        canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
        canvas.addEventListener("wheel", (event) => {
            event.preventDefault();
            const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewportHeight : 1;
            this.wheel += event.deltaY * scale;
        }, { signal, passive: false });
        window.addEventListener("keydown", (event) => {
            if (document.activeElement !== canvas) return;
            this.keys.add(event.code);
            if (event.code === "Space") event.preventDefault();
        }, { signal });
        window.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal });
        const reset = () => {
            pressed = undefined;
            dragged = true;
            this.keys.clear();
            this.endFrame();
        };
        window.addEventListener("blur", reset, { signal });
        canvas.addEventListener("blur", reset, { signal });
    }

    /** Mouse movement in pixels since the previous frame. */
    get mouseDelta(): [number, number] {
        return [this.mouseDx, this.mouseDy];
    }

    get panDelta(): [number, number] {
        return [this.panDx, this.panDy];
    }

    /** Wheel movement normalized to pixels; positive zooms out. */
    get wheelDelta(): number {
        return this.wheel;
    }

    get viewportHeight(): number {
        return Math.max(1, this.canvas.getBoundingClientRect().height);
    }

    isDown(code: string): boolean {
        return this.keys.has(code);
    }

    /** 1 if any positive key is held, -1 if any negative one is, 0 for both or neither. */
    axis(positive: string[], negative: string[]): number {
        return (positive.some((k) => this.keys.has(k)) ? 1 : 0) - (negative.some((k) => this.keys.has(k)) ? 1 : 0);
    }

    /** Called by the engine at the end of each frame. */
    endFrame(): void {
        this.mouseDx = 0;
        this.mouseDy = 0;
        this.panDx = 0;
        this.panDy = 0;
        this.wheel = 0;
    }

    dispose(): void {
        this.abort.abort();
        this.keys.clear();
        this.endFrame();
    }
}
