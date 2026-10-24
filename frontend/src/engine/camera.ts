import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";

export type CameraBounds = {
    /** Lowest allowed camera height (world Y). */
    minHeight: number;
    /** Largest allowed distance from `center`. */
    maxDistance: number;
    center?: Vec3;
};

export type CameraOptions = {
    position?: Vec3;
    target?: Vec3;
    yaw?: number;
    pitch?: number;
    fov?: number;
    near?: number;
    far?: number;
    speed?: number;
    sensitivity?: number;
    bounds?: CameraBounds;
};

/**
 * Orbit camera with view-plane panning and horizontal fly movement.
 * yaw = 0 looks towards -Z; positive yaw turns left, positive pitch looks up.
 */
export class Camera {
    position: Vec3;
    readonly target: Vec3;
    yaw: number;
    pitch: number;
    fov: number;
    near: number;
    far: number;
    aspect = 1;

    speed: number;
    sensitivity: number;
    bounds?: CameraBounds;

    private readonly up = vec3.fromValues(0, 1, 0);
    private readonly view = mat4.identity();
    private readonly projection = mat4.identity();
    private readonly viewProjection = mat4.identity();

    constructor(options: CameraOptions = {}) {
        this.position = options.position ?? vec3.fromValues(3, 4, 3);
        this.target = vec3.clone(options.target ?? options.bounds?.center ?? vec3.fromValues(0, 0, 0));
        const direction = vec3.subtract(this.target, this.position);
        this.yaw = options.yaw ?? Math.atan2(-direction[0], -direction[2]);
        this.pitch = options.pitch ?? Math.atan2(direction[1], Math.hypot(direction[0], direction[2]));
        this.fov = options.fov ?? Math.PI / 3;
        this.near = options.near ?? 0.01;
        this.far = options.far ?? 100;
        this.speed = options.speed ?? 4;
        this.sensitivity = options.sensitivity ?? 0.002;
        this.bounds = options.bounds;
        this.clampPosition();
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

    /** Rotate around the navigation target without moving it. */
    orbit(dx: number, dy: number): void {
        const offset = vec3.subtract(this.position, this.target);
        const distance = vec3.length(offset);
        const limit = Math.PI / 2 - 0.01;
        const yaw = Math.atan2(offset[0], offset[2]) - dx * this.sensitivity;
        let pitch = Math.atan2(-offset[1], Math.hypot(offset[0], offset[2])) - dy * this.sensitivity;
        const maxPitch = this.bounds && distance > 0
            ? Math.asin(Math.max(-1, Math.min(1, (this.target[1] - this.bounds.minHeight) / distance)))
            : limit;
        pitch = Math.max(-limit, Math.min(limit, maxPitch, pitch));
        vec3.set(
            this.target[0] + Math.sin(yaw) * Math.cos(pitch) * distance,
            this.target[1] - Math.sin(pitch) * distance,
            this.target[2] + Math.cos(yaw) * Math.cos(pitch) * distance,
            this.position,
        );
        this.clampPosition();
        this.aimAtTarget();
    }

    private aimAtTarget(): void {
        const direction = vec3.subtract(this.target, this.position);
        this.yaw = Math.atan2(-direction[0], -direction[2]);
        this.pitch = Math.atan2(direction[1], Math.hypot(direction[0], direction[2]));
    }

    /** Pan in the view plane, keeping world units per pixel consistent at the target. */
    pan(dx: number, dy: number, viewportHeight: number): void {
        const scale = 2 * vec3.distance(this.position, this.target) * Math.tan(this.fov / 2) / viewportHeight;
        const right = vec3.fromValues(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const viewUp = vec3.cross(right, this.forward);
        const displacement = vec3.addScaled(vec3.scale(right, -dx * scale), viewUp, dy * scale);
        this.translate(displacement);
    }

    /** Dolly towards or away from the target without crossing it. */
    zoom(delta: number): void {
        const offset = vec3.subtract(this.position, this.target);
        const distance = vec3.length(offset);
        if (distance === 0) return;
        const maxDistance = this.bounds
            ? this.bounds.maxDistance + vec3.distance(this.target, this.bounds.center ?? vec3.fromValues(0, 0, 0))
            : this.far;
        const nextDistance = Math.min(maxDistance, Math.max(Math.max(0.1, this.near * 2), distance * Math.exp(delta * 0.001)));
        vec3.addScaled(this.target, offset, nextDistance / distance, this.position);
        this.clampPosition();
        this.aimAtTarget();
    }

    private translate(displacement: Vec3): void {
        const previous = vec3.clone(this.position);
        vec3.add(this.position, displacement, this.position);
        this.clampPosition();
        vec3.add(this.target, vec3.subtract(this.position, previous), this.target);
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
        this.translate(vec3.scale(dir, this.speed * dt / 1000));
    }

    /** Keeps the position above `bounds.minHeight` and within `bounds.maxDistance` of the center. */
    clampPosition(): void {
        if (!this.bounds) return;
        const { minHeight, maxDistance, center = vec3.fromValues(0, 0, 0) } = this.bounds;
        const offset = vec3.subtract(this.position, center);
        offset[1] = Math.min(Math.max(offset[1], minHeight - center[1]), maxDistance);
        // Shrink horizontally only, so the height limit still holds afterwards.
        const maxHorizontal = Math.sqrt(Math.max(0, maxDistance ** 2 - offset[1] ** 2));
        const horizontal = Math.hypot(offset[0], offset[2]);
        if (horizontal > maxHorizontal) {
            offset[0] *= maxHorizontal / horizontal;
            offset[2] *= maxHorizontal / horizontal;
        }
        vec3.add(center, offset, this.position);
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
