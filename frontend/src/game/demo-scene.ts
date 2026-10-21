import { vec3, type Vec3 } from "wgpu-matrix";
import { Camera } from "../engine/camera";
import { FlyCameraController } from "../engine/controllers/fly-camera-controller";
import { Scene } from "../engine/scene";
import { SceneObject } from "../engine/scene-object";
import { Mesh } from "../engine/mesh/mesh";
import { createCylinder } from "../engine/mesh/primitives/cylinder";
import { HexTile } from "./objects/hex-tile";
import { Settlement } from "./objects/settlement";
import { City } from "./objects/city";
import { Road, ROAD_HEIGHT } from "./objects/road";
import type { GameDto, PlayerColor } from "./api-types";

const sqrt3 = Math.sqrt(3);
const TILE_HEIGHT = 0.15;
const SETTLEMENT_HEIGHT = 0.1;
const CITY_HEIGHT = 0.3;

const playerColors: Record<PlayerColor, Vec3> = {
    red: vec3.fromValues(0.9, 0.15, 0.15),
    blue: vec3.fromValues(0.15, 0.3, 0.9),
    green: vec3.fromValues(0.1, 0.7, 0.2),
    yellow: vec3.fromValues(0.95, 0.85, 0.1),
    white: vec3.fromValues(0.95, 0.95, 0.95),
};

function addHexTile(scene: Scene, i: number, j: number, color: Vec3) {
    const x = i * 1.5;
    const z = (j + i/2) * sqrt3;
    scene.add(new HexTile({ 
        position: vec3.fromValues(x, 0, z),
        radius: 0.99,
        height: TILE_HEIGHT,
        color: color,
    }));
}

export async function createDemoScene(signal?: AbortSignal): Promise<Scene> {
    const response = await fetch('/api/board', { signal });
    if (!response.ok) {
        throw new Error(`Failed to load board: ${response.status} ${response.statusText}`);
    }
    const { board, players }: GameDto = await response.json();
    const scene = new Scene(new Camera({}));

    const tileColors: Record<number, Vec3> = {
        1: vec3.fromValues(0.1, 0.5, 0.1),
        2: vec3.fromValues(0.8, 0.4, 0.2),
        3: vec3.fromValues(0.5, 0.8, 0.3),
        4: vec3.fromValues(0.9, 0.8, 0.4),
        5: vec3.fromValues(0.5, 0.5, 0.5),
        6: vec3.fromValues(0.85, 0.8, 0.6),
    };

    scene.add(new FlyCameraController());
    const waterRadius = board.nodes.reduce(
        (radius, node) => Math.max(radius, Math.hypot(node.x, node.y) + 0.8), 1,
    );
    scene.add(new SceneObject({
        name: "Water",
        mesh: new Mesh(createCylinder(waterRadius * 2, 0.02, 128, vec3.fromValues(0.4, 0.75, 0.95))),
        position: vec3.fromValues(0, -TILE_HEIGHT / 2 - 0.02, 0),
    }));
    board.tiles.forEach((tile) => {
        const color = tileColors[tile.landscape] ?? vec3.fromValues(0.5, 0.5, 0.5);
        addHexTile(scene, tile.i, tile.j, color);
    });

    const nodesById = new Map(board.nodes.map((node) => [node.id, node]));
    board.edges.forEach((edge) => {
        if (edge.owner === null) return;
        const start = nodesById.get(edge.node1);
        const end = nodesById.get(edge.node2);
        const player = players[edge.owner];
        if (!start || !end || !player) {
            throw new Error(`Invalid road from node ${edge.node1} to ${edge.node2}`);
        }
        const y = TILE_HEIGHT / 2 + ROAD_HEIGHT / 2;
        scene.add(new Road(
            vec3.fromValues(start.x, y, start.y),
            vec3.fromValues(end.x, y, end.y),
            playerColors[player.color],
        ));
    });

    // Backend node (x, y) maps to the XZ plane; buildings sit on top of the tiles.
    board.nodes.forEach((node) => {
        if (node.building === 'none' || node.owner === null) return;
        const player = players[node.owner];
        const color = player ? playerColors[player.color] : vec3.fromValues(0.5, 0.5, 0.5);
        if (node.building === 'settlement') {
            const y = TILE_HEIGHT / 2 + SETTLEMENT_HEIGHT / 2;
            scene.add(new Settlement({ position: vec3.fromValues(node.x, y, node.y), color }));
        } else {
            const y = TILE_HEIGHT / 2 + CITY_HEIGHT / 2;
            scene.add(new City({ position: vec3.fromValues(node.x, y, node.y), color }));
        }
    });

    return scene;
}
