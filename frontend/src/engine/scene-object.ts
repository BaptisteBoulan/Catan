import { mat4, vec3, type Mat4, type Vec3 } from "wgpu-matrix";
import type { Input } from "./input";
import type { Mesh } from "./mesh/mesh";
import type { Scene } from "./scene";

export type UpdateContext = {
    /** Milliseconds since the previous frame. */
    dt: number;
    /** Milliseconds since the scene started updating. */
    time: number;
    input: Input;
    scene: Scene;
};

export type SceneObjectOptions = {
    name?: string;
    mesh?: Mesh;
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
    color?: Vec3;
};

/**
 * Base class for anything living in a scene. It owns its transform, its optional
 * mesh and its children. Subclass it and override `start` / `update` to give it behavior.
 */
export class SceneObject {
    name: string;
    mesh?: Mesh;
    visible = true;

    /** Radius of the sphere used for ray picking, centered on the object's world position. */
    pickRadius?: number;
    onPick?: () => void;

    position: Vec3;
    rotation: Vec3;
    scale: Vec3;

    readonly children: SceneObject[] = [];
    parent?: SceneObject;
    scene?: Scene;

    /** Local to world transform, refreshed by the scene after each update. */
    readonly worldMatrix = mat4.identity();

    private readonly localMatrix = mat4.identity();
    private started = false;

    constructor(options: SceneObjectOptions = {}) {
        this.name = options.name ?? this.constructor.name;
        this.mesh = options.mesh;
        this.position = options.position ?? vec3.fromValues(0, 0, 0);
        this.rotation = options.rotation ?? vec3.fromValues(0, 0, 0);
        this.scale = options.scale ?? vec3.fromValues(1, 1, 1);
    }

    /** Called once, when the object first joins a scene. */
    start(): void {}

    /** Called every frame, before the object's children. */
    update(_ctx: UpdateContext): void {}

    /** Called by `destroy`, before the mesh is released. */
    onDestroy(): void {}

    add<T extends SceneObject>(child: T): T {
        child.parent?.remove(child);
        this.children.push(child);
        child.parent = this;
        if (this.scene) child.attach(this.scene);
        return child;
    }

    remove(child: SceneObject): void {
        const index = this.children.indexOf(child);
        if (index === -1) return;
        this.children.splice(index, 1);
        child.parent = undefined;
        child.detach();
    }

    /** Removes the object from its parent and releases its GPU resources, children included. */
    destroy(): void {
        this.parent?.remove(this);
        for (const child of [...this.children]) child.destroy();
        this.onDestroy();
        this.mesh?.destroy();
    }

    /** Depth-first walk over this object and all its descendants. */
    traverse(callback: (object: SceneObject) => void): void {
        callback(this);
        for (const child of this.children) child.traverse(callback);
    }

    getLocalMatrix(): Mat4 {
        const m = mat4.translation(this.position, this.localMatrix);
        mat4.rotateY(m, this.rotation[1], m);
        mat4.rotateX(m, this.rotation[0], m);
        mat4.rotateZ(m, this.rotation[2], m);
        return mat4.scale(m, this.scale, m);
    }

    /** @internal Runs `update` on this subtree. */
    updateTree(ctx: UpdateContext): void {
        this.update(ctx);
        // Copy so objects can add/remove children while updating.
        for (const child of [...this.children]) child.updateTree(ctx);
    }

    /** @internal Recomputes `worldMatrix` on this subtree. */
    updateWorldMatrix(parentWorld?: Mat4): void {
        const local = this.getLocalMatrix();
        if (parentWorld) mat4.multiply(parentWorld, local, this.worldMatrix);
        else mat4.copy(local, this.worldMatrix);
        for (const child of this.children) child.updateWorldMatrix(this.worldMatrix);
    }

    private attach(scene: Scene): void {
        this.scene = scene;
        if (!this.started) {
            this.started = true;
            this.start();
        }
        for (const child of this.children) child.attach(scene);
    }

    private detach(): void {
        this.scene = undefined;
        for (const child of this.children) child.detach();
    }
}
