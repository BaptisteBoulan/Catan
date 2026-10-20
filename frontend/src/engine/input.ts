export class Input {
    private readonly keys = new Set<string>();
    private mouseDx = 0;
    private mouseDy = 0;
    private readonly canvas: HTMLCanvasElement;
    private readonly abort = new AbortController();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const { signal } = this.abort;

        canvas.addEventListener("click", () => {
            canvas.focus();
            canvas.requestPointerLock().catch((error: unknown) => {
                console.error("Failed to lock the canvas pointer", error);
            });
        }, { signal });
        document.addEventListener("mousemove", (event) => {
            if (!this.pointerLocked) return;
            this.mouseDx += event.movementX;
            this.mouseDy += event.movementY;
        }, { signal });
        window.addEventListener("keydown", (event) => {
            if (document.activeElement !== canvas && !this.pointerLocked) return;
            this.keys.add(event.code);
            if (event.code === "Space") event.preventDefault();
        }, { signal });
        window.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal });
        window.addEventListener("blur", () => this.keys.clear(), { signal });
        canvas.addEventListener("blur", () => this.keys.clear(), { signal });
        document.addEventListener("pointerlockchange", () => {
            if (!this.pointerLocked) {
                this.keys.clear();
                this.endFrame();
            }
        }, { signal });
    }

    get pointerLocked(): boolean {
        return document.pointerLockElement === this.canvas;
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
        if (this.pointerLocked) document.exitPointerLock();
    }
}
