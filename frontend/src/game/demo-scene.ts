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

export function createDemoScene(): Scene {
    const scene = new Scene(new Camera({ position: vec3.fromValues(0, 1, 5) }));

    
    const tileColors = {
        "desert": { count: 1, color: vec3.fromValues(0.85, 0.8, 0.6) },
        "plain": { count: 4, color: vec3.fromValues(0.5, 0.8, 0.3) },
        "forest": { count: 4, color: vec3.fromValues(0.1, 0.5, 0.1) },
        "wheat": { count: 4, color: vec3.fromValues(0.9, 0.8, 0.4) },
        "mountain": { count: 3, color: vec3.fromValues(0.5, 0.5, 0.5) },
        "clay": { count: 3, color: vec3.fromValues(0.8, 0.4, 0.2) },
    }

    // TODO: Use the tileColors object to assign colors to the hex tiles instead of random colors.

    scene.add(new FlyCameraController());
    const boardSize = 3;
    const tiles: { i: number; j: number }[] = [];
    for (let i = -boardSize + 1; i < boardSize; i++) {
        for (let j = Math.max(-boardSize + 1, -boardSize - i + 1); j < Math.min(boardSize, boardSize - i); j++) {
            tiles.push({ i, j });
        }
    }

    const colorPool: Vec3[] = [];
    for (const key in tileColors) {
        const item = tileColors[key as keyof typeof tileColors];
        for (let c = 0; c < item.count; c++) {
            colorPool.push(item.color);
        }
    }

    for (let i = colorPool.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        [colorPool[i], colorPool[randomIndex]] = [colorPool[randomIndex], colorPool[i]];
    }

    tiles.forEach((tile, index) => {
        const color = colorPool[index] || vec3.fromValues(0.5, 0.5, 0.5);
        addHexTile(scene, tile.i, tile.j, color);
        console.log(`Added hex tile at (${tile.i}, ${tile.j})`);
    });

    return scene;
}
