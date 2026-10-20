import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";

export type CameraOptions = {
    position?: Vec3;
    yaw?: number;
    pitch?: number;
    fov?: number;
    near?: number;
    far?: number;
    speed?: number;
    sensitivity?: number;
};

/**
 * First-person fly camera (Minecraft creative style).
 * yaw = 0 looks towards -Z; positive yaw turns left, positive pitch looks up.
 */
export class Camera {
    position: Vec3;
    yaw: number;
    pitch: number;
    fov: number;
    near: number;
    far: number;
    aspect = 1;

    /** Movement speed in units per second. */
    speed: number;
    /** Radians per pixel of mouse movement. */
    sensitivity: number;

    private readonly up = vec3.fromValues(0, 1, 0);
    private readonly view = mat4.identity();
    private readonly projection = mat4.identity();
    private readonly viewProjection = mat4.identity();

    constructor(options: CameraOptions = {}) {
        this.position = options.position ?? vec3.fromValues(0, 0, 4);
        this.yaw = options.yaw ?? 0;
        this.pitch = options.pitch ?? 0;
        this.fov = options.fov ?? Math.PI / 3;
        this.near = options.near ?? 0.01;
        this.far = options.far ?? 100;
        this.speed = options.speed ?? 4;
        this.sensitivity = options.sensitivity ?? 0.002;
    }

    get forward(): Vec3 {
        const cosPitch = Math.cos(this.pitch);
        return vec3.fromValues(
            -Math.sin(this.yaw) * cosPitch,
            Math.sin(this.pitch),
            -Math.cos(this.yaw) * cosPitch,
        );
    }

    setAspect(width: number, height: number): void {
        if (height > 0) this.aspect = width / height;
    }

    /** Rotate the view from a mouse movement in pixels. */
    look(dx: number, dy: number): void {
        const limit = Math.PI / 2 - 0.01;
        this.yaw -= dx * this.sensitivity;
        this.pitch = Math.min(limit, Math.max(-limit, this.pitch - dy * this.sensitivity));
    }

    /**
     * Move relative to the view direction, ignoring pitch (horizontal plane like Minecraft).
     * Each axis is in [-1, 1]: forward (+ = ahead), right (+ = right), up (+ = world up). dt in ms.
     */
    move(forward: number, right: number, up: number, dt: number): void {
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        const dir = vec3.fromValues(
            -sin * forward + cos * right,
            up,
            -cos * forward - sin * right,
        );
        const horizontalLength = Math.hypot(dir[0], dir[2]);
        if (horizontalLength > 1) {
            dir[0] /= horizontalLength;
            dir[2] /= horizontalLength;
        }
        vec3.addScaled(this.position, dir, this.speed * dt / 1000, this.position);
    }

    getViewMatrix(): Mat4 {
        const target = vec3.add(this.position, this.forward);
        return mat4.lookAt(this.position, target, this.up, this.view);
    }

    getProjectionMatrix(): Mat4 {
        return mat4.perspective(this.fov, this.aspect, this.near, this.far, this.projection);
    }

    getViewProjectionMatrix(): Mat4 {
        return mat4.multiply(this.getProjectionMatrix(), this.getViewMatrix(), this.viewProjection);
    }
}
