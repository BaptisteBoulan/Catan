import { mat4, vec3 } from "wgpu-matrix";
import { Camera } from "./camera";
import type { Input } from "./input";
import { SceneObject } from "./scene-object";

export class Scene {
    readonly root = new SceneObject({ name: "root" });
    camera: Camera;
    /** Equirectangular Radiance (.hdr) image used as background and ambient light. */
    environmentUrl?: string;

    private time = 0;

    constructor(camera = new Camera()) {
        this.camera = camera;
        this.root.scene = this;
    }

    add<T extends SceneObject>(object: T): T {
        return this.root.add(object);
    }

    remove(object: SceneObject): void {
        object.parent?.remove(object);
    }

    traverse(callback: (object: SceneObject) => void): void {
        this.root.traverse(callback);
    }

    update(dt: number, input: Input): void {
        this.time += dt;
        this.root.updateTree({ dt, time: this.time, input, scene: this });
        this.root.updateWorldMatrix();
    }

    /**
     * Casts a ray from the camera through a point in normalized device coordinates and
     * calls `onPick` on the closest pickable object hit. Returns whether something was hit.
     */
    pick(ndcX: number, ndcY: number): boolean {
        const origin = this.camera.position;
        const inverse = mat4.inverse(this.camera.getViewProjectionMatrix());
        const far = vec3.transformMat4(vec3.fromValues(ndcX, ndcY, 1), inverse);
        const direction = vec3.normalize(vec3.subtract(far, origin));

        let closest: SceneObject | undefined;
        let closestDistance = Infinity;
        this.traverse((object) => {
            if (!object.onPick || !object.pickRadius || !object.visible) return;
            const m = object.worldMatrix;
            const toCenter = vec3.subtract(vec3.fromValues(m[12], m[13], m[14]), origin);
            const distance = vec3.dot(toCenter, direction);
            if (distance < 0 || distance >= closestDistance) return;
            const offset = vec3.lengthSq(toCenter) - distance * distance;
            if (offset > object.pickRadius * object.pickRadius) return;
            closest = object;
            closestDistance = distance;
        });
        closest?.onPick?.();
        return closest !== undefined;
    }

    destroy(): void {
        for (const child of [...this.root.children]) child.destroy();
    }
}
