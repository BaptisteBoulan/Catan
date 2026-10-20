import { Camera } from "./camera";
import type { Input } from "./input";
import { SceneObject } from "./scene-object";

export class Scene {
    readonly root = new SceneObject({ name: "root" });
    camera: Camera;

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

    destroy(): void {
        for (const child of [...this.root.children]) child.destroy();
    }
}
