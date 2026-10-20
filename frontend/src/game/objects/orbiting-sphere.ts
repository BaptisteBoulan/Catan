import { Mesh } from "../../engine/mesh/mesh";
import { createSphere } from "../../engine/mesh/primitives/sphere";
import { SceneObject, type SceneObjectOptions, type UpdateContext } from "../../engine/scene-object";

/** Circles around its parent's origin on the XZ plane. */
export class OrbitingSphere extends SceneObject {
    orbitRadius: number;
    /** Radians per millisecond. */
    orbitSpeed: number;

    private angle = 0;

    constructor(options: SceneObjectOptions & { size?: number; orbitRadius?: number; orbitSpeed?: number } = {}) {
        super({ mesh: new Mesh(createSphere(options.size)), ...options });
        this.orbitRadius = options.orbitRadius ?? 3;
        this.orbitSpeed = options.orbitSpeed ?? 0.001;
    }

    update({ dt }: UpdateContext): void {
        this.angle += dt * this.orbitSpeed;
        this.position[0] = this.orbitRadius * Math.cos(this.angle);
        this.position[2] = this.orbitRadius * Math.sin(this.angle);
    }
}
