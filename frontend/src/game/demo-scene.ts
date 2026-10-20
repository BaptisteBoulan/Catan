import { vec3, type Vec3 } from "wgpu-matrix";
import { Camera } from "../engine/camera";
import { FlyCameraController } from "../engine/controllers/fly-camera-controller";
import { Scene } from "../engine/scene";
import { HexTile } from "./objects/hex-tile";

const sqrt3 = Math.sqrt(3);

function addHexTile(scene: Scene, i: number, j: number, color: Vec3) {
    const x = i * 1.5;
    const z = (j + i/2) * sqrt3;
    scene.add(new HexTile({ 
        position: vec3.fromValues(x, -1, z),
        radius: 0.99,
        height: 0.15,
        color: color,
    }));
}

export async function createDemoScene(signal?: AbortSignal): Promise<Scene> {
    const response = await fetch('/api/new-board', { method: 'POST', signal });
    if (!response.ok) {
        throw new Error(`Failed to create board: ${response.status} ${response.statusText}`);
    }
    const board: { tiles: { i: number; j: number; landscape: number }[] } = await response.json();
    const scene = new Scene(new Camera({ position: vec3.fromValues(0, 1, 5) }));

    const tileColors: Record<number, Vec3> = {
        1: vec3.fromValues(0.1, 0.5, 0.1),
        2: vec3.fromValues(0.8, 0.4, 0.2),
        3: vec3.fromValues(0.5, 0.8, 0.3),
        4: vec3.fromValues(0.9, 0.8, 0.4),
        5: vec3.fromValues(0.5, 0.5, 0.5),
        6: vec3.fromValues(0.85, 0.8, 0.6),
    };

    scene.add(new FlyCameraController());
    board.tiles.forEach((tile) => {
        const color = tileColors[tile.landscape] ?? vec3.fromValues(0.5, 0.5, 0.5);
        addHexTile(scene, tile.i, tile.j, color);
    });

    return scene;
}
