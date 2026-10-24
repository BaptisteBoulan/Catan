import { SceneObject, type UpdateContext } from "../scene-object";

export type IdleOrbitOptions = {
    /** Inactivity, in ms, before the camera starts turning; `null` turns regardless of input. */
    idleDelay?: number | null;
    /** Angular speed in radians per second once fully ramped up. */
    speed?: number;
    /** Time, in ms, to ease from standstill to full speed. */
    rampDuration?: number;
};

/** Slowly orbits the camera around its target while the user leaves the page alone. */
export class IdleOrbitController extends SceneObject {
    readonly idleDelay: number | null;
    readonly speed: number;
    readonly rampDuration: number;
    private idleTime = 0;

    constructor({ idleDelay = 2500, speed = 0.06, rampDuration = 2000 }: IdleOrbitOptions = {}) {
        super();
        this.idleDelay = idleDelay;
        this.speed = speed;
        this.rampDuration = rampDuration;
    }

    update({ dt, input, scene }: UpdateContext): void {
        if (this.idleDelay !== null && input.active) {
            this.idleTime = 0;
            return;
        }
        this.idleTime += dt;
        const orbiting = this.idleTime - (this.idleDelay ?? 0);
        if (orbiting <= 0) return;
        const ramp = this.rampDuration > 0 ? Math.min(1, orbiting / this.rampDuration) : 1;
        const eased = ramp * ramp * (3 - 2 * ramp);
        const angle = this.speed * eased * dt / 1000;
        const camera = scene.camera;
        camera.orbit(angle / camera.sensitivity, 0);
    }
}
