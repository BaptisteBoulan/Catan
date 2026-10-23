export class Input {
    /** Called on canvas clicks (not drags) with normalized device coordinates. */
    onClick?: (ndcX: number, ndcY: number) => void;

    private readonly keys = new Set<string>();
    private mouseDx = 0;
    private mouseDy = 0;
    private readonly abort = new AbortController();

    constructor(canvas: HTMLCanvasElement) {
        const { signal } = this.abort;
        let pressed = false;
        let dragged = false;
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;

        canvas.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return;
            canvas.focus({ preventScroll: true });
            event.preventDefault();
            pressed = true;
            dragged = false;
            startX = lastX = event.clientX;
            startY = lastY = event.clientY;
        }, { signal });
        document.addEventListener("mousemove", (event) => {
            if (!pressed) return;
            if (!(event.buttons & 1)) {
                pressed = false;
                return;
            }
            if (Math.hypot(event.clientX - startX, event.clientY - startY) >= 4) {
                dragged = true;
            }
            if (dragged) {
                this.mouseDx += event.clientX - lastX;
                this.mouseDy += event.clientY - lastY;
            }
            lastX = event.clientX;
            lastY = event.clientY;
        }, { signal });
        document.addEventListener("mouseup", (event) => {
            if (event.button === 0) pressed = false;
        }, { signal });
        canvas.addEventListener("click", (event) => {
            if (dragged) return;
            const rect = canvas.getBoundingClientRect();
            const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
            this.onClick?.(ndcX, ndcY);
        }, { signal });
        window.addEventListener("keydown", (event) => {
            if (document.activeElement !== canvas) return;
            this.keys.add(event.code);
            if (event.code === "Space") event.preventDefault();
        }, { signal });
        window.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal });
        const reset = () => {
            pressed = false;
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
    }

    dispose(): void {
        this.abort.abort();
        this.keys.clear();
        this.endFrame();
    }
}
