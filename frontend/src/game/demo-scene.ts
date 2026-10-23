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
import { loadNumberTokenGeometry } from "./objects/number-token";
import type { BuildKind, GameDto, PlayerColor } from "./api-types";

export type Placement = {
    kind: BuildKind;
    targets: number[];
    playerId: number;
    onPick: (target: number) => void;
};

const PREVIEW_LIGHTEN = 0.45;
const ROAD_PICK_RADIUS = 0.3;
const BUILDING_PICK_RADIUS = 0.2;

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

function addHexTile(parent: SceneObject, i: number, j: number, color: Vec3) {
    const x = i * 1.5;
    const z = (j + i/2) * sqrt3;
    return parent.add(new HexTile({
        position: vec3.fromValues(x, 0, z),
        radius: 0.99,
        height: TILE_HEIGHT,
        color: color,
    }));
}

type SceneEntry = { signature: string; object: SceneObject };
type SceneUpdate = {
    signature: string;
    create: () => SceneObject | Promise<SceneObject>;
    onPick?: () => void;
};

function destroyObject(object: SceneObject): void {
    const geometries = new Set<Mesh["geometry"]>();
    object.traverse((child) => {
        if (child.mesh) geometries.add(child.mesh.geometry);
    });
    object.destroy();
    for (const geometry of geometries) geometry.destroy();
}

export class GameScene extends Scene {
    private readonly entries = new Map<string, SceneEntry>();
    private revision = 0;

    constructor() {
        super(new Camera({}));
        this.add(new FlyCameraController());
    }

    async sync(game: GameDto, signal?: AbortSignal, placement?: Placement): Promise<void> {
        const revision = ++this.revision;
        signal?.throwIfAborted();
        const updates = describeObjects(game, signal, placement);
        const prepared = new Map<string, SceneEntry>();
        try {
            for (const [key, update] of updates) {
                if (this.entries.get(key)?.signature === update.signature) continue;
                prepared.set(key, { signature: update.signature, object: await update.create() });
                signal?.throwIfAborted();
                // A newer sync or destruction must never be overwritten by an older asset load.
                if (revision !== this.revision) return;
            }
            signal?.throwIfAborted();
            if (revision !== this.revision) return;

            for (const [key, entry] of this.entries) {
                if (!updates.has(key) || prepared.has(key)) {
                    destroyObject(entry.object);
                    this.entries.delete(key);
                }
            }
            for (const [key, entry] of prepared) {
                this.add(entry.object);
                this.entries.set(key, entry);
            }
            prepared.clear();
            for (const [key, update] of updates) {
                const entry = this.entries.get(key);
                if (entry) entry.object.onPick = update.onPick;
            }
            this.root.updateWorldMatrix();
        } finally {
            for (const entry of prepared.values()) destroyObject(entry.object);
        }
    }

    override destroy(): void {
        ++this.revision;
        for (const entry of this.entries.values()) destroyObject(entry.object);
        this.entries.clear();
        super.destroy();
    }
}

export function createDemoScene(): GameScene {
    return new GameScene();
}

async function createTerrain({ board }: GameDto, signal?: AbortSignal): Promise<SceneObject> {
    const numberedTiles = board.tiles.filter((tile) => tile.landscape !== 6);
    const diceNumbers = new Set<number>();
    for (const tile of numberedTiles) {
        if (tile.diceNumber == null) {
            throw new Error(`Missing dice number for tile (${tile.i}, ${tile.j})`);
        }
        diceNumbers.add(tile.diceNumber);
    }
    const tokenGeometries = new Map(await Promise.all(
        [...diceNumbers].map(async (diceNumber) =>
            [diceNumber, await loadNumberTokenGeometry(diceNumber, signal)] as const),
    ));
    signal?.throwIfAborted();
    const terrain = new SceneObject({ name: "Terrain" });

    const tileColors: Record<number, Vec3> = {
        1: vec3.fromValues(0.1, 0.5, 0.1),
        2: vec3.fromValues(0.8, 0.4, 0.2),
        3: vec3.fromValues(0.5, 0.8, 0.3),
        4: vec3.fromValues(0.9, 0.8, 0.4),
        5: vec3.fromValues(0.5, 0.5, 0.5),
        6: vec3.fromValues(0.85, 0.8, 0.6),
    };

    const waterRadius = board.nodes.reduce(
        (radius, node) => Math.max(radius, Math.hypot(node.x, node.y) + 0.8), 1,
    );
    terrain.add(new SceneObject({
        name: "Water",
        mesh: new Mesh(createCylinder(waterRadius * 2, 0.02, 128, vec3.fromValues(0.4, 0.75, 0.95))),
        position: vec3.fromValues(0, -TILE_HEIGHT / 2 - 0.02, 0),
    }));
    board.tiles.forEach((tile) => {
        const color = tileColors[tile.landscape] ?? vec3.fromValues(0.5, 0.5, 0.5);
        const hexTile = addHexTile(terrain, tile.i, tile.j, color);
        if (tile.landscape !== 6) {
            const geometry = tile.diceNumber == null ? undefined : tokenGeometries.get(tile.diceNumber);
            if (!geometry) {
                throw new Error(`Missing number token for tile (${tile.i}, ${tile.j})`);
            }
            hexTile.add(new SceneObject({
                name: `Dice token ${tile.diceNumber}`,
                mesh: new Mesh(geometry),
                position: vec3.fromValues(0, TILE_HEIGHT / 2, 0),
            }));
        }
    });

    return terrain;
}

function describeObjects(
    game: GameDto, signal?: AbortSignal, placement?: Placement,
): Map<string, SceneUpdate> {
    const { board, players } = game;
    const updates = new Map<string, SceneUpdate>();
    updates.set("terrain", {
        signature: JSON.stringify([
            board.tiles.map(({ i, j, landscape, diceNumber }) => [i, j, landscape, diceNumber]),
            board.nodes.map(({ x, y }) => [x, y]),
        ]),
        create: () => createTerrain(game, signal),
    });
    const nodesById = new Map(board.nodes.map((node) => [node.id, node]));
    board.edges.forEach((edge, index) => {
        if (edge.owner === null) return;
        const start = nodesById.get(edge.node1);
        const end = nodesById.get(edge.node2);
        const player = players[edge.owner];
        if (!start || !end || !player) {
            throw new Error(`Invalid road from node ${edge.node1} to ${edge.node2}`);
        }
        const y = TILE_HEIGHT / 2 + ROAD_HEIGHT / 2;
        updates.set(`road:${index}`, {
            signature: JSON.stringify([start.x, start.y, end.x, end.y, player.color]),
            create: () => new Road(
                vec3.fromValues(start.x, y, start.y),
                vec3.fromValues(end.x, y, end.y),
                playerColors[player.color],
            ),
        });
    });

    // Backend node (x, y) maps to the XZ plane; buildings sit on top of the tiles.
    board.nodes.forEach((node) => {
        if (node.building === 'none' || node.owner === null) return;
        const player = players[node.owner];
        const color = player ? playerColors[player.color] : vec3.fromValues(0.5, 0.5, 0.5);
        updates.set(`building:${node.id}`, {
            signature: JSON.stringify([node.x, node.y, node.building, [...color]]),
            create: () => {
                if (node.building === 'settlement') {
                    const y = TILE_HEIGHT / 2 + SETTLEMENT_HEIGHT / 2;
                    return new Settlement({ position: vec3.fromValues(node.x, y, node.y), color });
                }
                const y = TILE_HEIGHT / 2 + CITY_HEIGHT / 2;
                return new City({ position: vec3.fromValues(node.x, y, node.y), color });
            },
        });
    });

    if (!placement) return updates;
    const player = players[placement.playerId];
    if (!player) throw new Error(`Unknown player ${placement.playerId}`);
    const color = vec3.lerp(playerColors[player.color], vec3.fromValues(1, 1, 1), PREVIEW_LIGHTEN);

    for (const target of placement.targets) {
        if (placement.kind === 'road') {
            const edge = board.edges[target];
            const start = edge && nodesById.get(edge.node1);
            const end = edge && nodesById.get(edge.node2);
            if (!start || !end) throw new Error(`Invalid road slot ${target}`);
            const y = TILE_HEIGHT / 2 + ROAD_HEIGHT / 2;
            updates.set(`preview:road:${target}`, {
                signature: JSON.stringify([start.x, start.y, end.x, end.y, [...color]]),
                create: () => {
                    const preview = new Road(
                        vec3.fromValues(start.x, y, start.y), vec3.fromValues(end.x, y, end.y), color,
                    );
                    preview.pickRadius = ROAD_PICK_RADIUS;
                    return preview;
                },
                onPick: () => placement.onPick(target),
            });
        } else {
            const node = nodesById.get(target);
            if (!node) throw new Error(`Invalid building slot ${target}`);
            updates.set(`preview:${placement.kind}:${target}`, {
                signature: JSON.stringify([node.x, node.y, [...color]]),
                create: () => {
                    const isSettlement = placement.kind === 'settlement';
                    const y = TILE_HEIGHT / 2 + (isSettlement ? SETTLEMENT_HEIGHT : CITY_HEIGHT) / 2;
                    const options = { position: vec3.fromValues(node.x, y, node.y), color };
                    const preview = isSettlement ? new Settlement(options) : new City({
                        ...options,
                        // Slightly wider so it doesn't z-fight with the settlement it replaces.
                        scale: vec3.fromValues(1.1, 1, 1.1),
                    });
                    preview.pickRadius = BUILDING_PICK_RADIUS;
                    return preview;
                },
                onPick: () => placement.onPick(target),
            });
        }
    }
    return updates;
}
